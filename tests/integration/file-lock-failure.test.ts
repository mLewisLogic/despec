import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { FileLock } from "../../src/shared/file-lock.js";

const TEST_DIR = "/tmp/despec-file-lock-failure-tests";

describe("FileLock - Failure Conditions", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Lock Acquisition Timeouts", () => {
    test("times out when lock is held by another process", async () => {
      const lock1 = new FileLock();
      const lock2 = new FileLock();
      const resourcePath = path.join(TEST_DIR, "resource.txt");

      await lock1.acquire(resourcePath);

      const startTime = Date.now();
      let timeoutError: Error | null = null;

      try {
        await lock2.acquire(resourcePath, { timeout: 150, retryInterval: 10 });
      } catch (error) {
        timeoutError = error as Error;
      }

      const elapsed = Date.now() - startTime;

      expect(timeoutError).toBeDefined();
      expect(timeoutError?.message).toContain("Lock acquisition timeout");
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(300);

      await lock1.release(resourcePath);
    });

    test("multiple locks timing out on same resource", async () => {
      const firstLock = new FileLock();
      const competingLocks = Array.from({ length: 3 }, () => new FileLock());
      const resourcePath = path.join(TEST_DIR, "contested.txt");

      await firstLock.acquire(resourcePath);

      const results = await Promise.allSettled(
        competingLocks.map((lock) =>
          lock.acquire(resourcePath, { timeout: 100, retryInterval: 10 }),
        ),
      );

      // All should have failed
      results.forEach((result) => {
        expect(result.status).toBe("rejected");
        if (result.status === "rejected") {
          expect(result.reason.message).toContain("Lock acquisition timeout");
        }
      });

      await firstLock.release(resourcePath);
    });
  });

  describe("Stale Lock Handling", () => {
    test("detects and removes stale lock", async () => {
      const lock = new FileLock();
      const resourcePath = path.join(TEST_DIR, "stale-resource.txt");
      const lockPath = `${resourcePath}.lock`;

      // Create a stale lock file with metadata
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          pid: 99999, // Non-existent PID
          hostname: "stale-host",
          lockId: "stale-lock-id",
          timestamp: Date.now() - 2000, // 2 seconds ago
          processStartTime: Date.now() - 10000, // Required field
        }),
      );

      const oldTime = new Date(Date.now() - 2000);
      await fs.utimes(lockPath, oldTime, oldTime);

      // Should successfully acquire by removing stale lock
      await lock.acquire(resourcePath, { staleTimeout: 500 });

      expect(lock.isHeld(resourcePath)).toBe(true);

      await lock.release(resourcePath);
    });

    test("handles corrupted lock file content", async () => {
      const lock = new FileLock();
      const resourcePath = path.join(TEST_DIR, "corrupted-lock.txt");
      const lockPath = `${resourcePath}.lock`;

      // Create lock file with corrupted metadata
      await fs.writeFile(lockPath, Buffer.from([0x00, 0xff, 0xfe, 0x01]));

      // Make it stale
      const oldTime = new Date(Date.now() - 1000);
      await fs.utimes(lockPath, oldTime, oldTime);

      // Should handle gracefully and acquire lock
      await lock.acquire(resourcePath, { staleTimeout: 500 });

      expect(lock.isHeld(resourcePath)).toBe(true);

      await lock.release(resourcePath);
    });
  });

  describe("Lock Release Failures", () => {
    test("handles release when lock directory already deleted", async () => {
      const lock = new FileLock();
      const resourcePath = path.join(TEST_DIR, "deleted-lock.txt");
      const lockPath = `${resourcePath}.lock`;

      await lock.acquire(resourcePath);

      // Manually delete lock directory
      await fs.rm(lockPath, { recursive: true, force: true });

      // Release should not throw
      await lock.release(resourcePath);

      expect(lock.isHeld(resourcePath)).toBe(false);
    });

    test("handles releaseAll with some failed releases", async () => {
      const lock = new FileLock();
      const resources = [
        path.join(TEST_DIR, "res1.txt"),
        path.join(TEST_DIR, "res2.txt"),
      ];

      // Acquire all locks
      for (const resource of resources) {
        await lock.acquire(resource);
      }

      // Delete one lock directory manually
      await fs.rm(`${resources[1]}.lock`, { recursive: true, force: true });

      // releaseAll should not throw
      await lock.releaseAll();

      // All should be marked as released
      expect(lock.getHeldLocks().length).toBe(0);
    });
  });

  describe("Concurrency Edge Cases", () => {
    test("handles rapid acquire-release cycles", async () => {
      const lock = new FileLock();
      const resourcePath = path.join(TEST_DIR, "rapid-cycle.txt");

      // Perform rapid acquire-release cycles
      for (let i = 0; i < 5; i++) {
        await lock.acquire(resourcePath, { timeout: 500 });
        expect(lock.isHeld(resourcePath)).toBe(true);
        await lock.release(resourcePath);
        expect(lock.isHeld(resourcePath)).toBe(false);
      }

      // Verify no lock files remain
      const lockPath = `${resourcePath}.lock`;
      const exists = await fs
        .access(lockPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
