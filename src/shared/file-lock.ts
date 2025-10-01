import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";

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
 * Lock metadata stored in lock directory
 */
interface LockMetadata {
  pid: number;
  hostname: string;
  lockId: string;
  timestamp: number;
}

/**
 * FileLock provides advisory file-based locks optimized for single-agent use.
 * Uses lock directories with mkdir() operations to provide best-effort mutual exclusion.
 *
 * DESIGN PHILOSOPHY:
 * This implementation is optimized for the common despec use case: a single agent
 * (human or AI) operating on specifications at a time. Lock directories provide
 * good mutual exclusion on local filesystems through mkdir()'s exclusive create
 * semantics. While not ACID-guaranteed, this is sufficient for preventing accidental
 * concurrent modifications during normal single-agent operation.
 *
 * Lock directories are stored as `<resource>.lock/` alongside the resource being
 * locked. The directory contains a metadata.json file with PID, hostname, lockId,
 * and timestamp for ownership verification and stale lock detection.
 *
 * Features:
 * - Configurable timeouts for safety
 * - Stale lock detection and cleanup
 * - Automatic lock release
 * - Best-effort mutual exclusion via directory creation
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

  /**
   * Acquires an advisory lock for the specified resource.
   * Blocks until the lock is acquired or the timeout is reached.
   *
   * Uses mkdir() to create lock directories for best-effort mutual exclusion.
   * Optimized for single-agent use cases where one operator (human or AI)
   * is working with specifications at a time.
   *
   * @param resourcePath - Path to the resource to lock
   * @param options - Lock acquisition options
   * @throws {Error} If lock acquisition times out or fails
   * @returns Promise that resolves when the lock is acquired
   */
  async acquire(resourcePath: string, options: LockOptions = {}): Promise<void> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const retryInterval = options.retryInterval ?? this.defaultRetryInterval;
    const staleTimeout = options.staleTimeout ?? this.defaultStaleTimeout;

    const lockPath = this.getLockPath(resourcePath);
    const lockId = nanoid();
    const startTime = Date.now();

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(lockPath), { recursive: true });

    while (Date.now() - startTime < timeout) {
      try {
        // Prepare lock metadata
        const metadata: LockMetadata = {
          pid: process.pid,
          hostname: os.hostname(),
          lockId,
          timestamp: Date.now(),
        };

        // BEST-EFFORT EXCLUSIVE: Create lock directory
        // fs.mkdir() with recursive:false provides exclusive create semantics
        // on local filesystems. Good enough for single-agent use cases.
        await fs.mkdir(lockPath, { recursive: false });

        try {
          // Write metadata file inside our lock directory
          const metadataPath = path.join(lockPath, "metadata.json");
          await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), {
            encoding: "utf8",
            mode: 0o600,
          });

          // Verify we still own the lock directory
          const verified = await this.verifyLockOwnership(lockPath, lockId);
          if (!verified) {
            // Another process may have cleaned up our directory - cleanup and retry
            await this.cleanupLockDirectory(lockPath).catch(() => {});
            continue;
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
          const writeError = error as any;

          // If we failed to write metadata because the directory was cleaned up
          // by another process (ENOENT, EINVAL), just retry - this is normal
          // concurrent behavior when multiple processes are trying to acquire
          if (writeError.code === "ENOENT" || writeError.code === "EINVAL") {
            await this.cleanupLockDirectory(lockPath).catch(() => {});
            continue;
          }

          // For other errors, cleanup and propagate
          await this.cleanupLockDirectory(lockPath).catch(() => {});
          throw error;
        }
      } catch (error) {
        // biome-ignore lint/suspicious/noExplicitAny: Node.js error codes are not typed
        const nodeError = error as any;

        if (nodeError.code !== "EEXIST") {
          throw new Error(
            `Failed to acquire lock for ${resourcePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Lock directory exists - check if it's stale
        const isStale = await this.isLockStale(lockPath, staleTimeout);
        if (isStale) {
          // Attempt stale lock cleanup
          // Try to remove the stale lock directory
          await this.cleanupLockDirectory(lockPath).catch(() => {
            // Another process may have already removed it - that's fine
          });
          // Immediately retry mkdir
          // If another process already created the directory, we'll get EEXIST
          // and retry normally on the next iteration
          continue;
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }

    throw new Error(`Lock acquisition timeout for ${resourcePath} after ${timeout}ms`);
  }

  /**
   * Releases the lock for the specified resource.
   * Safe to call even if the lock is not held.
   *
   * Removes the lock directory.
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
      const verified = await this.verifyLockOwnership(lockInfo.lockPath, lockInfo.lockId);
      if (verified) {
        await this.cleanupLockDirectory(lockInfo.lockPath);
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
   * Gets the lock directory path for a resource path.
   *
   * @param resourcePath - Path to the resource
   * @returns Path to the lock directory
   */
  private getLockPath(resourcePath: string): string {
    return `${resourcePath}.lock`;
  }

  /**
   * Checks if a lock is stale using PID-based detection.
   * A lock is stale if:
   * 1. The process that created the lock no longer exists
   * 2. The lock is older than the stale timeout
   *
   * IMPORTANT: A lock directory without metadata is NOT immediately stale.
   * We give the creating process a brief grace period (100ms) to write metadata.
   * This prevents race conditions where one process cleans up a lock directory
   * that another process just created but hasn't finished initializing.
   *
   * @param lockPath - Path to the lock directory
   * @param staleTimeout - Maximum age in milliseconds
   * @returns True if the lock is stale
   */
  private async isLockStale(lockPath: string, staleTimeout: number): Promise<boolean> {
    try {
      // Try to read lock metadata from directory
      const metadataPath = path.join(lockPath, "metadata.json");
      const metadataContent = await fs.readFile(metadataPath, "utf8");
      const metadata: LockMetadata = JSON.parse(metadataContent);

      // Check if the process is still running
      if (!this.isProcessAlive(metadata.pid)) {
        return true; // Process is dead, lock is stale
      }

      // Check age-based staleness
      const age = Date.now() - metadata.timestamp;
      return age > staleTimeout;
    } catch {
      // Lock directory exists but metadata is missing or unreadable
      // Check the directory's mtime to see if it's old enough to be truly stale
      try {
        const stats = await fs.stat(lockPath);
        const age = Date.now() - stats.mtimeMs;
        // Only consider it stale if the directory is old (> 1 second)
        // This gives the creating process time to write metadata
        return age > 1000;
      } catch {
        // Directory doesn't exist - it's stale (or was just cleaned up)
        return true;
      }
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

  /**
   * Verifies that we own the lock by checking the lock ID.
   *
   * @param lockPath - Path to the lock directory
   * @param expectedLockId - Expected lock ID
   * @returns True if we own the lock
   */
  private async verifyLockOwnership(lockPath: string, expectedLockId: string): Promise<boolean> {
    try {
      const metadataPath = path.join(lockPath, "metadata.json");
      const metadataContent = await fs.readFile(metadataPath, "utf8");
      const metadata: LockMetadata = JSON.parse(metadataContent);
      return metadata.lockId === expectedLockId && metadata.pid === process.pid;
    } catch {
      return false;
    }
  }

  /**
   * Removes a lock directory and all its contents.
   * This is used both for normal lock release and stale lock cleanup.
   *
   * @param lockPath - Path to the lock directory to remove
   * @returns Promise that resolves when the directory is removed
   */
  private async cleanupLockDirectory(lockPath: string): Promise<void> {
    // Remove the entire lock directory recursively
    // Use force:true to ignore ENOENT errors if already removed
    await fs.rm(lockPath, { recursive: true, force: true });
  }
}
