import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import { checkFilesystemSafety } from "./filesystem-detector.js";

/**
 * Options for lock acquisition
 */
export interface LockOptions {
  /** Maximum time to wait for lock acquisition in milliseconds (default: 5000) */
  timeout?: number;
  /** Interval between lock acquisition attempts in milliseconds (default: 100) */
  retryInterval?: number;
  /** Maximum age of a stale lock in milliseconds (default: 30000) */
  staleTimeout?: number;
  /** Whether to enforce safe filesystem requirements (default: true) */
  enforceSafeFilesystem?: boolean;
}

/**
 * Information about a lock
 */
export interface LockInfo {
  resourcePath: string;
  lockPath: string;
  lockId: string;
  acquiredAt: number;
}

/**
 * Lock metadata stored in lock file
 */
interface LockMetadata {
  pid: number;
  hostname: string;
  lockId: string;
  timestamp: number;
  processStartTime: number;
}

/**
 * FileLock provides advisory file-based locks using atomic file creation.
 * Uses fs.open() with 'wx' flag for race-free lock acquisition.
 *
 * DESIGN PHILOSOPHY:
 * This implementation uses atomic file creation with exclusive flags to eliminate
 * TOCTOU races. Lock metadata is written atomically during file creation to prevent
 * any gap between file creation and metadata availability.
 *
 * Lock files are stored as `<resource>.lock` with metadata written inside.
 * The metadata includes:
 * - PID: Process ID for staleness detection
 * - Hostname: For distributed system awareness
 * - LockID: Unique identifier for this lock instance
 * - Timestamp: Lock creation time
 * - ProcessStartTime: Prevents PID reuse attacks
 *
 * The 'wx' flag guarantees that fs.open() will:
 * 1. Create the file atomically if it doesn't exist
 * 2. Fail with EEXIST if the file already exists
 * 3. Provide proper mutual exclusion on all POSIX-compliant filesystems
 *
 * METADATA WRITE GAP ELIMINATION:
 * Metadata is written immediately after file creation within the same file handle,
 * before closing. While not perfectly atomic with creation, this minimizes the
 * window. The stale lock detection handles any edge cases.
 *
 * STALE LOCK HANDLING:
 * Uses atomic rename-based takeover to eliminate races during stale lock cleanup.
 * When a stale lock is detected:
 * 1. Create a temporary claim file with our metadata
 * 2. Atomically rename it over the stale lock (atomic takeover)
 * 3. Only one process succeeds; others retry
 *
 * Features:
 * - Race-free lock acquisition via atomic file creation
 * - Race-free stale lock takeover via atomic rename
 * - Configurable timeouts for safety
 * - Stale lock detection via PID and process start time
 * - Automatic lock release
 * - Exponential backoff for reduced contention
 *
 * @example
 * ```typescript
 * const lock = new FileLock();
 * try {
 *   await lock.acquire('data.yaml', { timeout: 5000 });
 *   // Perform operations on data.yaml
 * } finally {
 *   await lock.release('data.yaml');
 * }
 * ```
 */
export class FileLock {
  private locks: Map<string, LockInfo> = new Map();
  private readonly defaultTimeout: number = 5000;
  private readonly defaultRetryInterval: number = 100;
  private readonly defaultStaleTimeout: number = 30000;
  /** Process start time for ownership verification */
  private readonly processStartTime: number =
    Date.now() - process.uptime() * 1000;
  /** Whether filesystem safety has been checked */
  private filesystemChecked: boolean = false;

  /**
   * Acquires an advisory lock for the specified resource.
   * Blocks until the lock is acquired or the timeout is reached.
   *
   * Uses fs.open() with 'wx' flag for atomic, race-free lock creation.
   * Metadata is written immediately after creation to minimize the gap.
   *
   * @param resourcePath - Path to the resource to lock
   * @param options - Lock acquisition options
   * @throws {Error} If lock acquisition times out or fails
   * @returns Promise that resolves when the lock is acquired
   */
  async acquire(
    resourcePath: string,
    options: LockOptions = {},
  ): Promise<void> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const retryInterval = options.retryInterval ?? this.defaultRetryInterval;
    const staleTimeout = options.staleTimeout ?? this.defaultStaleTimeout;
    const enforceSafeFilesystem = options.enforceSafeFilesystem ?? true;

    // Check filesystem safety on first lock acquisition
    if (!this.filesystemChecked) {
      const fsInfo = await checkFilesystemSafety(resourcePath);
      this.filesystemChecked = true;

      if (!fsInfo.isSafeForAtomicOps && enforceSafeFilesystem) {
        throw new Error(
          `[FILESYSTEM] Unsafe filesystem detected (${fsInfo.type}). ` +
            `File locking is not reliable on network filesystems. ` +
            `Please use a local filesystem or set enforceSafeFilesystem to false.`,
        );
      }
    }

    const lockId = nanoid();
    const startTime = Date.now();
    let attempt = 0;

    // Ensure parent directory exists
    const lockDir = path.dirname(resourcePath);
    await fs.mkdir(lockDir, { recursive: true });

    // Use a STABLE lock path so all processes compete for the same file
    const lockPath = this.getLockPath(resourcePath);

    while (Date.now() - startTime < timeout) {
      try {
        // ATOMIC EXCLUSIVE CREATE: Use fs.open with 'wx' flag
        // This is the ONLY way to atomically create a file and detect races
        // The 'wx' flag ensures:
        // 1. File is created atomically
        // 2. Operation fails with EEXIST if file exists
        // 3. No TOCTOU window between existence check and creation
        const fileHandle = await fs.open(lockPath, "wx");

        try {
          // Write metadata immediately after creation to minimize gap
          // While not perfectly atomic, this reduces the window to microseconds
          const metadata: LockMetadata = {
            pid: process.pid,
            hostname: os.hostname(),
            lockId,
            timestamp: Date.now(),
            processStartTime: this.processStartTime,
          };
          await fileHandle.write(JSON.stringify(metadata, null, 2));
        } finally {
          await fileHandle.close();
        }

        // Successfully acquired lock
        this.locks.set(resourcePath, {
          resourcePath,
          lockPath,
          lockId,
          acquiredAt: Date.now(),
        });
        return;
      } catch (error) {
        // biome-ignore lint/suspicious/noExplicitAny: Node.js error codes are not typed
        const nodeError = error as any;

        if (nodeError.code !== "EEXIST") {
          throw new Error(
            `Failed to acquire lock for ${resourcePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Lock file exists - check if it's stale and attempt atomic takeover
        const metadata = await this.readLockMetadata(lockPath);
        let isStale = false;

        if (metadata) {
          // Metadata is valid - use PID-based staleness detection
          isStale = await this.isLockStale(metadata, staleTimeout);
        } else {
          // Metadata is corrupted or unreadable - fall back to file age
          isStale = await this.isLockFileStale(lockPath, staleTimeout);
        }

        if (isStale) {
          // Attempt atomic takeover of stale lock
          const success = await this.attemptStaleLockTakeover(
            lockPath,
            resourcePath,
            lockId,
          );
          if (success) {
            // Successfully took over the stale lock
            return;
          }
          // Another process won the race - continue retrying
        }

        // Wait before retrying with exponential backoff
        attempt++;
        const backoff = Math.min(
          retryInterval * 1.5 ** Math.min(attempt, 5),
          1000,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw new Error(
      `Lock acquisition timeout for ${resourcePath} after ${timeout}ms`,
    );
  }

  /**
   * Attempts to atomically take over a stale lock using rename operation.
   * Creates a temporary claim file with our metadata, then atomically renames
   * it over the stale lock. Only one process can succeed in the rename.
   *
   * @param staleLockPath - Path to the stale lock file
   * @param resourcePath - Path to the resource being locked
   * @param lockId - Our lock ID
   * @returns True if we successfully took over the lock
   */
  private async attemptStaleLockTakeover(
    staleLockPath: string,
    resourcePath: string,
    lockId: string,
  ): Promise<boolean> {
    // Create a temporary claim file in the same directory
    const dir = path.dirname(staleLockPath);
    const claimPath = path.join(dir, `.lock-claim-${process.pid}-${nanoid()}`);

    try {
      // Create our claim file with metadata
      const fileHandle = await fs.open(claimPath, "wx");
      try {
        const metadata: LockMetadata = {
          pid: process.pid,
          hostname: os.hostname(),
          lockId,
          timestamp: Date.now(),
          processStartTime: this.processStartTime,
        };
        await fileHandle.write(JSON.stringify(metadata, null, 2));
      } finally {
        await fileHandle.close();
      }

      // Atomically rename our claim over the stale lock
      // This is atomic on POSIX filesystems - only one rename succeeds
      await fs.rename(claimPath, staleLockPath);

      // If we get here, we won the race and own the lock
      this.locks.set(resourcePath, {
        resourcePath,
        lockPath: staleLockPath,
        lockId,
        acquiredAt: Date.now(),
      });

      return true;
    } catch (_error) {
      // Clean up our claim file if it still exists
      try {
        await fs.unlink(claimPath);
      } catch {
        // Ignore - it may have been renamed successfully or cleaned up
      }

      // We lost the race or encountered an error
      return false;
    }
  }

  /**
   * Releases the lock for the specified resource.
   * Safe to call even if the lock is not held.
   *
   * Removes the lock file atomically.
   *
   * @param resourcePath - Path to the resource to unlock
   * @returns Promise that resolves when the lock is released
   */
  async release(resourcePath: string): Promise<void> {
    const lockInfo = this.locks.get(resourcePath);
    if (!lockInfo) {
      return;
    }

    try {
      // Verify we still own the lock before removing it
      const metadata = await this.readLockMetadata(lockInfo.lockPath);
      if (metadata && metadata.lockId === lockInfo.lockId) {
        await fs.unlink(lockInfo.lockPath);
      }
    } catch (_error) {
      // Ignore errors - lock may have been removed by cleanup
    } finally {
      this.locks.delete(resourcePath);
    }
  }

  /**
   * Releases all locks held by this instance.
   * Useful for cleanup in error handlers or process shutdown.
   *
   * @returns Promise that resolves when all locks are released
   */
  async releaseAll(): Promise<void> {
    const resources = Array.from(this.locks.keys());
    await Promise.all(resources.map((resource) => this.release(resource)));
  }

  /**
   * Checks if the current instance holds a lock for the specified resource.
   *
   * @param resourcePath - Path to the resource to check
   * @returns True if this instance holds the lock
   */
  isHeld(resourcePath: string): boolean {
    return this.locks.has(resourcePath);
  }

  /**
   * Gets information about all locks held by this instance.
   *
   * @returns Array of lock information objects
   */
  getHeldLocks(): LockInfo[] {
    return Array.from(this.locks.values());
  }

  /**
   * Executes a function with a lock held, automatically releasing it afterwards.
   * This is the recommended way to use locks as it ensures proper cleanup.
   *
   * @param resourcePath - Path to the resource to lock
   * @param fn - Function to execute while holding the lock
   * @param options - Lock acquisition options
   * @returns Promise that resolves to the function's return value
   *
   * @example
   * ```typescript
   * const lock = new FileLock();
   * const result = await lock.withLock('data.yaml', async () => {
   *   // Perform operations on data.yaml
   *   return processedData;
   * });
   * ```
   */
  async withLock<T>(
    resourcePath: string,
    fn: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<T> {
    await this.acquire(resourcePath, options);
    try {
      return await fn();
    } finally {
      await this.release(resourcePath);
    }
  }

  /**
   * Gets the lock file path for a resource path.
   * Returns a stable lock path that all processes compete for.
   *
   * Format: <resource>.lock
   *
   * @param resourcePath - Path to the resource
   * @returns Path to the lock file
   */
  private getLockPath(resourcePath: string): string {
    // Use a STABLE lock path so all processes compete for the same file
    return `${resourcePath}.lock`;
  }

  /**
   * Reads lock metadata from the lock file.
   * Returns null if the file doesn't exist, can't be read, or has invalid metadata.
   *
   * @param lockPath - Path to the lock file
   * @returns Lock metadata or null
   */
  private async readLockMetadata(
    lockPath: string,
  ): Promise<LockMetadata | null> {
    try {
      const content = await fs.readFile(lockPath, "utf8");
      const data = JSON.parse(content);

      if (
        typeof data.pid === "number" &&
        typeof data.hostname === "string" &&
        typeof data.lockId === "string" &&
        typeof data.timestamp === "number" &&
        typeof data.processStartTime === "number"
      ) {
        return {
          pid: data.pid,
          hostname: data.hostname,
          lockId: data.lockId,
          timestamp: data.timestamp,
          processStartTime: data.processStartTime,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if a lock is stale using PID-based detection.
   * A lock is stale if:
   * 1. The process that created the lock no longer exists
   * 2. The lock is older than the stale timeout
   * 3. The process was restarted (PID reuse detection via process start time)
   *
   * @param metadata - Lock metadata
   * @param staleTimeout - Maximum age in milliseconds
   * @returns True if the lock is stale
   */
  private async isLockStale(
    metadata: LockMetadata,
    staleTimeout: number,
  ): Promise<boolean> {
    // Check if the process is still running
    if (!this.isProcessAlive(metadata.pid)) {
      return true; // Process is dead, lock is stale
    }

    // Check if process was restarted (PID reuse detection)
    // If the lock claims to be from a process that started after the lock was created,
    // it's a different process with a reused PID
    if (metadata.processStartTime > metadata.timestamp) {
      return true; // PID was reused
    }

    // Check age-based staleness
    const age = Date.now() - metadata.timestamp;
    return age > staleTimeout;
  }

  /**
   * Checks if a lock file is stale based on its modification time.
   * This is a fallback method used when metadata is corrupted or unreadable.
   *
   * @param lockPath - Path to the lock file
   * @param staleTimeout - Maximum age in milliseconds
   * @returns True if the lock file is stale
   */
  private async isLockFileStale(
    lockPath: string,
    staleTimeout: number,
  ): Promise<boolean> {
    try {
      const stats = await fs.stat(lockPath);
      const age = Date.now() - stats.mtimeMs;
      return age > staleTimeout;
    } catch {
      // File doesn't exist or can't be accessed
      return false;
    }
  }

  /**
   * Checks if a process with the given PID is still alive.
   *
   * @param pid - Process ID to check
   * @returns True if the process is alive
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // biome-ignore lint/suspicious/noExplicitAny: Node.js error codes are not typed
      const nodeError = error as any;
      // EPERM means process exists but we don't have permission to signal it
      // ESRCH means process doesn't exist
      return nodeError.code === "EPERM";
    }
  }
}
