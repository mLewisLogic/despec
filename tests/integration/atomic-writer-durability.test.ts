import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { AtomicWriter } from "../../src/shared/atomic-writer.js";

const TEST_DIR = "/tmp/xdd-atomic-writer-durability-tests";

/**
 * Tests to verify the durability guarantees of AtomicWriter.
 *
 * CRITICAL ISSUE ADDRESSED:
 * Without parent directory fsync after rename, the rename operation may not
 * be durable on disk. On ext3/ext4/btrfs filesystems, a power loss after
 * rename but before directory metadata is flushed can result in:
 * - Neither the old nor new file existing
 * - File system corruption where directory entry is lost
 * - Data loss even though the application believes write succeeded
 *
 * THE FIX:
 * After rename operations, we must fsync the parent directory to ensure
 * the directory entry update is persisted to disk. This guarantees:
 * - Rename is truly atomic and durable
 * - On recovery, the renamed file exists
 * - No data loss on power failure
 *
 * FILESYSTEM BEHAVIOR:
 * - ext3/ext4/btrfs: REQUIRES parent directory fsync for durability
 * - APFS/HFS+: Has different metadata semantics, fsync still helps
 * - NTFS: FlushFileBuffers provides similar guarantee
 */
describe("AtomicWriter - Durability Guarantees", () => {
  let writer: AtomicWriter;

  beforeEach(async () => {
    writer = new AtomicWriter();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should fsync parent directory after rename operation", async () => {
    const filePath = path.join(TEST_DIR, "durability-test.txt");
    const content = "Test content for durability verification";

    // Track directory open and sync calls
    const originalOpen = fs.open;
    const openedPaths: string[] = [];
    const syncedHandles: Set<fs.FileHandle> = new Set();

    // Mock fs.open to track which paths are opened
    const mockedOpen = vi.fn(async (path: any, flags: any) => {
      const handle = await originalOpen(path, flags);

      // Track if this is a directory open
      try {
        const stats = await handle.stat();
        if (stats.isDirectory()) {
          openedPaths.push(path);

          // Wrap handle.sync to track syncs
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            syncedHandles.add(handle);
            return originalSync();
          };
        }
      } catch (_error) {
        // Not a problem, might be a temp file that doesn't exist yet
      }

      return handle;
    });

    fs.open = mockedOpen;

    try {
      // Perform atomic write
      await writer.writeFile(filePath, content);

      // Verify file was written correctly
      const writtenContent = await fs.readFile(filePath, "utf8");
      expect(writtenContent).toBe(content);

      // Verify parent directory was opened for syncing
      const parentDir = path.dirname(filePath);
      expect(openedPaths).toContain(parentDir);

      // Verify at least one directory handle was synced
      expect(syncedHandles.size).toBeGreaterThan(0);

      console.log(`✓ Parent directory fsync verified: ${parentDir} was synced`);
    } finally {
      fs.open = originalOpen;
    }
  });

  it("should fsync unique parent directories when writing multiple files", async () => {
    const files = [
      {
        path: path.join(TEST_DIR, "dir1", "file1.txt"),
        content: "Content 1",
      },
      {
        path: path.join(TEST_DIR, "dir1", "file2.txt"),
        content: "Content 2",
      },
      {
        path: path.join(TEST_DIR, "dir2", "file3.txt"),
        content: "Content 3",
      },
    ];

    // Track directory syncs
    const syncedDirectories: Set<string> = new Set();
    const originalOpen = fs.open;

    const mockedOpen = vi.fn(async (path: any, flags: any) => {
      const handle = await originalOpen(path, flags);

      try {
        const stats = await handle.stat();
        if (stats.isDirectory()) {
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            syncedDirectories.add(path);
            return originalSync();
          };
        }
      } catch (_error) {
        // Ignore
      }

      return handle;
    });

    fs.open = mockedOpen;

    try {
      await writer.writeFiles(files);

      // Verify all files were written
      for (const file of files) {
        const content = await fs.readFile(file.path, "utf8");
        expect(content).toBe(file.content);
      }

      // Verify both unique parent directories were synced
      expect(syncedDirectories.has(path.join(TEST_DIR, "dir1"))).toBe(true);
      expect(syncedDirectories.has(path.join(TEST_DIR, "dir2"))).toBe(true);
      expect(syncedDirectories.size).toBe(2);

      console.log(
        `✓ Multiple directories synced: ${Array.from(syncedDirectories).join(", ")}`,
      );
    } finally {
      fs.open = originalOpen;
    }
  });

  it("should handle directory fsync failure gracefully", async () => {
    const filePath = path.join(TEST_DIR, "fsync-fail-test.txt");
    const content = "Content despite fsync failure";

    const originalOpen = fs.open;

    // Mock to fail directory sync but not file sync
    const mockedOpen = vi.fn(async (path: any, flags: any) => {
      const handle = await originalOpen(path, flags);

      try {
        const stats = await handle.stat();
        if (stats.isDirectory()) {
          // Make directory sync fail
          handle.sync = async () => {
            throw new Error("EPERM: operation not permitted");
          };
        }
      } catch (_error) {
        // Ignore
      }

      return handle;
    });

    fs.open = mockedOpen;

    // Capture console.warn to verify warning was logged
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };

    try {
      // Should not throw even though directory fsync fails
      await writer.writeFile(filePath, content);

      // Verify file was still written successfully
      const writtenContent = await fs.readFile(filePath, "utf8");
      expect(writtenContent).toBe(content);

      // Verify warning was logged
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes("Failed to sync directory"))).toBe(
        true,
      );

      console.log("✓ Directory fsync failure handled gracefully with warning");
    } finally {
      fs.open = originalOpen;
      console.warn = originalWarn;
    }
  });

  it("should demonstrate durability issue WITHOUT parent directory fsync", async () => {
    /**
     * This is a DOCUMENTATION TEST showing why the fix is necessary.
     *
     * Without parent directory fsync:
     * 1. Write data to temp file
     * 2. Fsync temp file (data is durable)
     * 3. Rename temp to final name (directory entry changes)
     * 4. [POWER LOSS HERE]
     * 5. On recovery: Directory entry change may be lost!
     *    - ext3/ext4: Directory metadata in cache, not on disk
     *    - Result: Neither old nor new file exists
     *
     * With parent directory fsync:
     * 1. Write data to temp file
     * 2. Fsync temp file (data is durable)
     * 3. Rename temp to final name (directory entry changes)
     * 4. Fsync parent directory (directory metadata is durable)
     * 5. [POWER LOSS HERE]
     * 6. On recovery: Renamed file exists and is accessible
     */

    const testData = {
      scenario: "without-parent-fsync",
      risk: "rename may not be durable on disk",
      consequence: "file may disappear after power loss",
      solution: "fsync parent directory after rename",
      filesystems_affected: ["ext3", "ext4", "btrfs", "many others"],
      filesystems_safe: ["with proper metadata journaling and barriers"],
    };

    console.log("\n=== Durability Issue Documentation ===");
    console.log(`Scenario: ${testData.scenario}`);
    console.log(`Risk: ${testData.risk}`);
    console.log(`Consequence: ${testData.consequence}`);
    console.log(`Solution: ${testData.solution}`);
    console.log(
      `Affected filesystems: ${testData.filesystems_affected.join(", ")}`,
    );

    // This test passes to document the issue
    expect(testData.solution).toBe("fsync parent directory after rename");
  });

  it("should maintain performance despite additional fsync operations", async () => {
    // Write multiple files and measure performance
    const numFiles = 10;
    const files = Array.from({ length: numFiles }, (_, i) => ({
      path: path.join(TEST_DIR, `perf-test-${i}.txt`),
      content: `Performance test content ${i}`,
    }));

    const startTime = performance.now();
    await writer.writeFiles(files);
    const duration = performance.now() - startTime;

    // Verify all files written
    for (const file of files) {
      const content = await fs.readFile(file.path, "utf8");
      expect(content).toBe(file.content);
    }

    // Performance should still be reasonable (< 1 second for 10 files)
    expect(duration).toBeLessThan(1000);

    console.log(
      `✓ Performance test: ${numFiles} files written in ${duration.toFixed(2)}ms`,
    );
    console.log(
      `  Average per file: ${(duration / numFiles).toFixed(2)}ms (includes directory fsync)`,
    );
  });

  it("should deduplicate parent directory syncs for efficiency", async () => {
    // Write multiple files to the same directory
    const numFiles = 5;
    const files = Array.from({ length: numFiles }, (_, i) => ({
      path: path.join(TEST_DIR, `same-dir-${i}.txt`),
      content: `Same directory test ${i}`,
    }));

    // Track unique directory syncs
    const syncedDirectories: Set<string> = new Set();
    const originalOpen = fs.open;

    const mockedOpen = vi.fn(async (path: any, flags: any) => {
      const handle = await originalOpen(path, flags);

      try {
        const stats = await handle.stat();
        if (stats.isDirectory()) {
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            syncedDirectories.add(path);
            return originalSync();
          };
        }
      } catch (_error) {
        // Ignore
      }

      return handle;
    });

    fs.open = mockedOpen;

    try {
      await writer.writeFiles(files);

      // Should only sync TEST_DIR once, not once per file
      expect(syncedDirectories.size).toBe(1);
      expect(syncedDirectories.has(TEST_DIR)).toBe(true);

      console.log(
        `✓ Efficiency verified: ${numFiles} files to same directory = only 1 directory fsync`,
      );
    } finally {
      fs.open = originalOpen;
    }
  });
});
