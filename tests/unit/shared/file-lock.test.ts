import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileLock } from "../../../src/shared/file-lock.js";

const TEST_DIR = "/tmp/despec-file-lock-tests";

describe("FileLock", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  test("acquires and releases a lock", async () => {
    const lock = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock.acquire(resourcePath);
    expect(lock.isHeld(resourcePath)).toBe(true);

    await lock.release(resourcePath);
    expect(lock.isHeld(resourcePath)).toBe(false);
  });

  test("prevents concurrent access to same resource", async () => {
    const lock1 = new FileLock();
    const lock2 = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock1.acquire(resourcePath);

    // Attempt to acquire with second lock should timeout
    let timedOut = false;
    try {
      await lock2.acquire(resourcePath, { timeout: 100, retryInterval: 10 });
    } catch (error) {
      timedOut = true;
      expect((error as Error).message).toContain("Lock acquisition timeout");
    }
    expect(timedOut).toBe(true);

    await lock1.release(resourcePath);
  });

  test("allows sequential access after release", async () => {
    const lock1 = new FileLock();
    const lock2 = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock1.acquire(resourcePath);
    await lock1.release(resourcePath);

    // Second lock should succeed after release
    await lock2.acquire(resourcePath);
    expect(lock2.isHeld(resourcePath)).toBe(true);
    await lock2.release(resourcePath);
  });

  test("withLock executes function with lock held", async () => {
    const lock = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");
    let executed = false;

    const result = await lock.withLock(resourcePath, async () => {
      executed = true;
      expect(lock.isHeld(resourcePath)).toBe(true);
      return "success";
    });

    expect(executed).toBe(true);
    expect(result).toBe("success");
    expect(lock.isHeld(resourcePath)).toBe(false);
  });

  test("withLock releases lock on error", async () => {
    const lock = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    try {
      await lock.withLock(resourcePath, async () => {
        throw new Error("Test error");
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toBe("Test error");
      expect(lock.isHeld(resourcePath)).toBe(false);
    }
  });

  test("releaseAll releases all held locks", async () => {
    const lock = new FileLock();
    const resources = [
      path.join(TEST_DIR, "resource1.txt"),
      path.join(TEST_DIR, "resource2.txt"),
      path.join(TEST_DIR, "resource3.txt"),
    ];

    for (const resource of resources) {
      await lock.acquire(resource);
    }

    expect(lock.getHeldLocks().length).toBe(3);

    await lock.releaseAll();

    expect(lock.getHeldLocks().length).toBe(0);
    for (const resource of resources) {
      expect(lock.isHeld(resource)).toBe(false);
    }
  });

  test("detects and cleans stale locks", async () => {
    const lock1 = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    // Create a stale lock directory manually with old timestamp
    const lockPath = `${resourcePath}.lock`;
    await fs.mkdir(lockPath);

    const metadata = {
      pid: 99999, // Non-existent PID
      hostname: "stale-host",
      lockId: "stale-lock-id",
      timestamp: Date.now() - 2000, // 2 seconds ago
    };

    const metadataPath = path.join(lockPath, "metadata.json");
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Should acquire lock by cleaning stale lock
    await lock1.acquire(resourcePath, { staleTimeout: 500 });
    expect(lock1.isHeld(resourcePath)).toBe(true);

    await lock1.release(resourcePath);
  });

  test("respects custom timeout", async () => {
    const lock1 = new FileLock();
    const lock2 = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock1.acquire(resourcePath);

    const startTime = Date.now();
    try {
      await lock2.acquire(resourcePath, { timeout: 200, retryInterval: 20 });
      expect(true).toBe(false); // Should not reach here
    } catch (_error) {
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(150);
      expect(elapsed).toBeLessThan(400);
    }

    await lock1.release(resourcePath);
  });

  test("respects custom retry interval", async () => {
    const lock1 = new FileLock();
    const lock2 = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock1.acquire(resourcePath);

    const startTime = Date.now();
    try {
      await lock2.acquire(resourcePath, { timeout: 200, retryInterval: 20 });
      expect(true).toBe(false); // Should not reach here
    } catch (_error) {
      const elapsed = Date.now() - startTime;
      // Should have made multiple retry attempts
      expect(elapsed).toBeGreaterThanOrEqual(150);
    }

    await lock1.release(resourcePath);
  });

  test("getHeldLocks returns lock information", async () => {
    const lock = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock.acquire(resourcePath);

    const heldLocks = lock.getHeldLocks();
    expect(heldLocks.length).toBe(1);
    expect(heldLocks[0]!.resourcePath).toBe(resourcePath);
    expect(heldLocks[0]!.lockPath).toBe(`${resourcePath}.lock`);
    expect(heldLocks[0]!.lockId).toBeDefined();
    expect(heldLocks[0]!.acquiredAt).toBeGreaterThan(0);

    await lock.release(resourcePath);
  });

  test("release is safe to call multiple times", async () => {
    const lock = new FileLock();
    const resourcePath = path.join(TEST_DIR, "resource.txt");

    await lock.acquire(resourcePath);
    await lock.release(resourcePath);
    await lock.release(resourcePath); // Should not throw

    expect(lock.isHeld(resourcePath)).toBe(false);
  });

  test("handles concurrent lock attempts correctly", async () => {
    const resourcePath = path.join(TEST_DIR, "contested.txt");
    const locks = Array.from({ length: 3 }, () => new FileLock());

    const results = await Promise.allSettled(
      locks.map((lock) => lock.acquire(resourcePath, { timeout: 300, retryInterval: 20 })),
    );

    // Exactly one should succeed
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(2);

    // Release the successful lock
    const successIndex = results.findIndex((r) => r.status === "fulfilled");
    await locks[successIndex]!.release(resourcePath);
  });
});
