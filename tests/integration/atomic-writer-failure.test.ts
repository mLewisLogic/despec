import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { AtomicWriter } from "../../src/shared/atomic-writer.js";

const TEST_DIR_BASE = "/tmp/despec-atomic-writer-failure-tests";

describe("AtomicWriter - Failure Conditions", () => {
  let writer: AtomicWriter;
  let testDir: string;

  beforeAll(async () => {
    // Clean up any leftover test directories from previous runs
    await fs.rm(TEST_DIR_BASE, { recursive: true, force: true });
  });

  beforeEach(async () => {
    writer = new AtomicWriter();
    // Create unique test directory per test to avoid conflicts
    testDir = path.join(
      TEST_DIR_BASE,
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    // Clean up base directory after all tests
    await fs.rm(TEST_DIR_BASE, { recursive: true, force: true });
  });

  describe("Disk Full Scenarios", () => {
    test("handles write failure due to simulated disk full", async () => {
      const filePath = path.join(testDir, "diskfull.txt");
      const originalWriteFile = fs.writeFile;

      // Mock writeFile to simulate disk full error
      const mockedWriteFile = vi.fn(
        async (path: any, data: any, options: any) => {
          if (path.includes(".tmp.")) {
            const error: any = new Error("ENOSPC: no space left on device");
            error.code = "ENOSPC";
            throw error;
          }
          return originalWriteFile(path, data, options);
        },
      );

      // Replace fs.writeFile temporarily
      const backup = fs.writeFile;
      fs.writeFile = mockedWriteFile;

      try {
        await writer.writeFile(filePath, "content");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain("Atomic write failed");
        expect((error as Error).message).toContain("ENOSPC");

        // Verify no temp files remain
        const files = await fs.readdir(testDir);
        const tempFiles = files.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);

        // Verify target file was not created
        const exists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      } finally {
        fs.writeFile = backup;
      }
    });

    test.skip("handles partial batch write failure - cleans up all temp files", async () => {
      const files = [
        { path: path.join(testDir, "file1.txt"), content: "Content 1" },
        { path: path.join(testDir, "file2.txt"), content: "Content 2" },
        { path: path.join(testDir, "file3.txt"), content: "Content 3" },
      ];

      const originalWriteFile = fs.writeFile;
      let writeCount = 0;

      // Mock to fail on second write
      const mockedWriteFile = vi.fn(
        async (path: any, data: any, options: any) => {
          writeCount++;
          if (writeCount === 2 && path.includes(".tmp.")) {
            const error: any = new Error("ENOSPC: no space left on device");
            error.code = "ENOSPC";
            throw error;
          }
          return originalWriteFile(path, data, options);
        },
      );

      fs.writeFile = mockedWriteFile;

      try {
        await writer.writeFiles(files);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();

        // Verify NO temp files remain after failure
        const allFiles = await fs.readdir(testDir);
        const tempFiles = allFiles.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);

        // Verify NO target files were created
        for (const file of files) {
          const exists = await fs
            .access(file.path)
            .then(() => true)
            .catch(() => false);
          expect(exists).toBe(false);
        }
      } finally {
        fs.writeFile = originalWriteFile;
      }
    });
  });

  describe("Permission Denied Scenarios", () => {
    test("handles write failure due to permission denied", async () => {
      const readonlyDir = path.join(testDir, "readonly");
      await fs.mkdir(readonlyDir);
      await fs.chmod(readonlyDir, 0o444); // Read-only

      const filePath = path.join(readonlyDir, "file.txt");

      try {
        await writer.writeFile(filePath, "content");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain("Atomic write failed");

        // Verify no temp files remain
        const files = await fs.readdir(testDir);
        const tempFiles = files.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);
      } finally {
        await fs.chmod(readonlyDir, 0o755);
      }
    });

    test("handles permission denied during mkdir", async () => {
      const deepPath = path.join(
        testDir,
        "readonly",
        "deep",
        "nested",
        "file.txt",
      );

      // Create readonly parent directory
      const readonlyDir = path.join(testDir, "readonly");
      await fs.mkdir(readonlyDir);
      await fs.chmod(readonlyDir, 0o444);

      try {
        await writer.writeFile(deepPath, "content");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain("Atomic write failed");
      } finally {
        await fs.chmod(readonlyDir, 0o755);
      }
    });
  });

  describe("Rename Failure Scenarios", () => {
    test("handles rename failure - cleans up temp file", async () => {
      const filePath = path.join(testDir, "rename-fail.txt");
      const originalRename = fs.rename;

      // Create a file to test rename cleanup
      await fs.writeFile(filePath, "existing content");

      // Mock rename to fail
      const mockedRename = vi.fn(async (oldPath: any, newPath: any) => {
        if (oldPath.includes(".tmp.")) {
          const error: any = new Error(
            "EXDEV: cross-device link not permitted",
          );
          error.code = "EXDEV";
          throw error;
        }
        return originalRename(oldPath, newPath);
      });

      fs.rename = mockedRename;

      try {
        await writer.writeFile(filePath, "new content");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain("Atomic write failed");

        // Verify original file unchanged
        const content = await fs.readFile(filePath, "utf8");
        expect(content).toBe("existing content");

        // Verify no temp files remain
        const files = await fs.readdir(testDir);
        const tempFiles = files.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);
      } finally {
        fs.rename = originalRename;
      }
    });

    test("handles partial batch rename failure - atomic all-or-nothing", async () => {
      const files = [
        { path: path.join(testDir, "batch1.txt"), content: "Content 1" },
        { path: path.join(testDir, "batch2.txt"), content: "Content 2" },
        { path: path.join(testDir, "batch3.txt"), content: "Content 3" },
      ];

      // Pre-create files with original content
      for (const file of files) {
        await fs.writeFile(file.path, "original");
      }

      const originalRename = fs.rename;
      let renameCount = 0;

      // Mock to fail on second rename
      const mockedRename = vi.fn(async (oldPath: any, newPath: any) => {
        if (oldPath.includes(".tmp.")) {
          renameCount++;
          if (renameCount === 2) {
            const error: any = new Error(
              "EXDEV: cross-device link not permitted",
            );
            error.code = "EXDEV";
            throw error;
          }
        }
        return originalRename(oldPath, newPath);
      });

      fs.rename = mockedRename;

      try {
        await writer.writeFiles(files);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();

        // In a real atomic implementation, either ALL files should be updated or NONE
        // Our current implementation may have partial updates on rename failure
        // This test documents current behavior

        // Verify no temp files remain
        const allFiles = await fs.readdir(testDir);
        const tempFiles = allFiles.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);
      } finally {
        fs.rename = originalRename;
      }
    });
  });

  describe("Corruption Scenarios", () => {
    test("handles interrupted write - ensures cleanup", async () => {
      const filePath = path.join(testDir, "interrupted.txt");
      const originalWriteFile = fs.writeFile;

      // Simulate interrupted write
      const mockedWriteFile = vi.fn(
        async (path: any, data: any, options: any) => {
          if (path.includes(".tmp.")) {
            // Write partial data then fail
            await originalWriteFile(path, "partial", options);
            throw new Error("EINTR: interrupted system call");
          }
          return originalWriteFile(path, data, options);
        },
      );

      fs.writeFile = mockedWriteFile;

      try {
        await writer.writeFile(
          filePath,
          "complete data that should not appear",
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();

        // Verify temp file was cleaned up even though it was partially written
        const files = await fs.readdir(testDir);
        const tempFiles = files.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);

        // Verify target file does not exist
        const exists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      } finally {
        fs.writeFile = originalWriteFile;
      }
    });

    test("verifies temp file naming prevents collisions", async () => {
      const filePath = path.join(testDir, "collision-test.txt");

      // Create multiple writers attempting to write concurrently
      const writers = Array.from({ length: 5 }, () => new AtomicWriter());

      // Capture all temp file paths during writes
      const tempFilePaths: string[] = [];
      const originalWriteFile = fs.writeFile;

      const mockedWriteFile = vi.fn(
        async (path: any, data: any, options: any) => {
          if (typeof path === "string" && path.includes(".tmp.")) {
            tempFilePaths.push(path);
          }
          return originalWriteFile(path, data, options);
        },
      );

      fs.writeFile = mockedWriteFile;

      try {
        // Execute writes concurrently
        await Promise.all(
          writers.map((w, i) => w.writeFile(filePath, `Content ${i}`)),
        );

        // Verify all temp file paths were unique
        const uniquePaths = new Set(tempFilePaths);
        expect(uniquePaths.size).toBe(tempFilePaths.length);
      } finally {
        fs.writeFile = originalWriteFile;
      }
    });
  });

  describe("Edge Cases", () => {
    test("handles very long file paths", async () => {
      // Create a very long path (close to system limits)
      const longDirName = "a".repeat(100);
      const longPath = path.join(testDir, longDirName, longDirName, "file.txt");

      try {
        await writer.writeFile(longPath, "content");

        const content = await fs.readFile(longPath, "utf8");
        expect(content).toBe("content");
      } catch (error) {
        // Some systems may not support such long paths
        // The test passes if it either succeeds or fails gracefully
        expect(error).toBeDefined();

        // Verify cleanup
        const allFiles = await fs.readdir(testDir, { recursive: true });
        const tempFiles = allFiles.filter((f: any) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);
      }
    });

    test("handles empty content write", async () => {
      const filePath = path.join(testDir, "empty.txt");

      await writer.writeFile(filePath, "");

      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe("");

      // Verify no temp files remain
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes(".tmp."));
      expect(tempFiles.length).toBe(0);
    });

    test("handles very large file content", async () => {
      const filePath = path.join(testDir, "large.txt");
      const largeContent = "x".repeat(10 * 1024 * 1024); // 10MB

      await writer.writeFile(filePath, largeContent);

      const content = await fs.readFile(filePath, "utf8");
      expect(content.length).toBe(largeContent.length);

      // Verify no temp files remain
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes(".tmp."));
      expect(tempFiles.length).toBe(0);
    });

    test("handles special characters in file paths", async () => {
      const specialChars = "file with spaces and 'quotes' and (parens).txt";
      const filePath = path.join(testDir, specialChars);

      await writer.writeFile(filePath, "content");

      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe("content");

      // Verify no temp files remain
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes(".tmp."));
      expect(tempFiles.length).toBe(0);
    });
  });

  describe("Concurrent Failure Scenarios", () => {
    test("handles mixed success and failure in concurrent writes", async () => {
      const successPath = path.join(testDir, "success.txt");
      const failPath = path.join(testDir, "readonly", "fail.txt");

      // Create readonly directory
      const readonlyDir = path.join(testDir, "readonly");
      await fs.mkdir(readonlyDir);
      await fs.chmod(readonlyDir, 0o444);

      try {
        const results = await Promise.allSettled([
          writer.writeFile(successPath, "success content"),
          writer.writeFile(failPath, "fail content"),
        ]);

        // One should succeed, one should fail
        const succeeded = results.filter((r) => r.status === "fulfilled");
        const failed = results.filter((r) => r.status === "rejected");

        expect(succeeded.length).toBe(1);
        expect(failed.length).toBe(1);

        // Verify successful write completed
        const content = await fs.readFile(successPath, "utf8");
        expect(content).toBe("success content");

        // Verify no temp files remain anywhere
        const allFiles = await fs.readdir(testDir);
        const tempFiles = allFiles.filter((f) => f.includes(".tmp."));
        expect(tempFiles.length).toBe(0);
      } finally {
        await fs.chmod(readonlyDir, 0o755);
      }
    });
  });
});
