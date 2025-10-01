import fs from "node:fs/promises";
import path from "node:path";
import { hrtime } from "node:process";
import { nanoid } from "nanoid";

/**
 * Interface for file write operations
 */
export interface FileWrite {
  path: string;
  content: string;
}

/**
 * Result of an atomic write operation
 */
export interface WriteResult {
  success: boolean;
  filesWritten: string[];
  error?: Error;
}

/**
 * AtomicWriter implements the write-rename pattern to ensure file operations
 * are atomic and safe from corruption. All writes are performed to temporary
 * files first, then atomically renamed to their final destination.
 *
 * This prevents partial writes and ensures data integrity even if the process
 * crashes mid-write.
 *
 * DURABILITY GUARANTEE:
 * After rename, parent directories are fsynced to ensure the rename operation
 * is durable on disk. Without this, on ext3/ext4/btrfs filesystems, a power
 * loss after rename but before directory metadata is flushed may result in
 * neither the old nor new file existing.
 *
 * @example
 * ```typescript
 * const writer = new AtomicWriter();
 * await writer.writeFiles([
 *   { path: 'specification.yaml', content: specYaml },
 *   { path: 'changelog.yaml', content: changelogYaml }
 * ]);
 * ```
 */
export class AtomicWriter {
  /**
   * Syncs parent directories to ensure durability of metadata changes.
   * This is critical after rename operations to guarantee atomicity survives power loss.
   *
   * On ext3/ext4/btrfs: Directory entries are cached and must be flushed
   * On APFS/HFS+: Has different semantics but fsync doesn't hurt
   * On NTFS: FlushFileBuffers achieves similar guarantee
   *
   * @param filePaths - Array of file paths whose parent directories should be synced
   * @throws {Error} If directory sync fails (non-fatal, logs warning)
   */
  private async syncParentDirectories(filePaths: string[]): Promise<void> {
    // Get unique parent directories
    const parentDirs = new Set(filePaths.map((p) => path.dirname(p)));

    // Sync each parent directory
    await Promise.allSettled(
      Array.from(parentDirs).map(async (dirPath) => {
        try {
          // Open directory for reading (required to fsync it)
          const dirHandle = await fs.open(dirPath, "r");
          try {
            // Sync directory metadata to disk
            await dirHandle.sync();
          } finally {
            // Always close the handle
            await dirHandle.close();
          }
        } catch (error) {
          // Directory fsync may fail on some filesystems or due to permissions
          // This is not fatal but reduces durability guarantee
          // Log warning but don't throw - the write itself succeeded
          console.warn(
            `Warning: Failed to sync directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }
  /**
   * Writes multiple files atomically using the write-rename pattern.
   * All files are written to temporary files first, then renamed to their
   * final destinations. If any operation fails, all temporary files are
   * cleaned up.
   *
   * @param files - Array of file paths and their content to write
   * @throws {Error} If any write or rename operation fails
   * @returns Promise that resolves when all files are written successfully
   */
  async writeFiles(files: FileWrite[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    // Generate collision-resistant temp file names using PID + hrtime + nanoid
    const pid = process.pid;
    const tempFiles = files.map((f) => {
      const hrt = hrtime.bigint();
      const uniqueId = `${pid}.${hrt}.${nanoid(8)}`;
      return {
        original: f.path,
        temp: `${f.path}.tmp.${uniqueId}`,
        content: f.content,
      };
    });

    try {
      // Ensure all parent directories exist
      await Promise.all(
        tempFiles.map((f) =>
          fs.mkdir(path.dirname(f.original), { recursive: true }),
        ),
      );

      // Write all content to temporary files with secure permissions
      await Promise.all(
        tempFiles.map(async (f) => {
          await fs.writeFile(f.temp, f.content, {
            encoding: "utf8",
            mode: 0o600,
          });
        }),
      );

      // Fsync all temp files to ensure durability before rename
      await Promise.all(
        tempFiles.map(async (f) => {
          const handle = await fs.open(f.temp, "r+");
          try {
            await handle.sync();
          } finally {
            await handle.close();
          }
        }),
      );

      // Atomically rename all temporary files to their final destinations
      await Promise.all(tempFiles.map((f) => fs.rename(f.temp, f.original)));

      // Fsync parent directories to ensure rename is durable on disk
      // Without this, on power loss the rename may not be persisted (ext3/ext4/btrfs)
      await this.syncParentDirectories(tempFiles.map((f) => f.original));
    } catch (error) {
      // Cleanup: remove all temporary files on failure
      await Promise.allSettled(
        tempFiles.map(async (f) => {
          try {
            await fs.unlink(f.temp);
          } catch {
            // Ignore cleanup errors - file may not exist
          }
        }),
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Atomic write failed: ${errorMessage}`);
    }
  }

  /**
   * Writes a single file atomically using the write-rename pattern.
   * This is a convenience method for writing a single file.
   *
   * @param filePath - Path to the file to write
   * @param content - Content to write to the file
   * @throws {Error} If the write or rename operation fails
   * @returns Promise that resolves when the file is written successfully
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await this.writeFiles([{ path: filePath, content }]);
  }

  /**
   * Writes multiple files atomically and returns a detailed result.
   * Unlike writeFiles, this method does not throw on failure but instead
   * returns a result object with success status and error details.
   *
   * @param files - Array of file paths and their content to write
   * @returns Promise that resolves to a WriteResult with operation details
   */
  async writeFilesSafe(files: FileWrite[]): Promise<WriteResult> {
    try {
      await this.writeFiles(files);
      return {
        success: true,
        filesWritten: files.map((f) => f.path),
      };
    } catch (error) {
      return {
        success: false,
        filesWritten: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
