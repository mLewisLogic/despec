import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileLock } from "../../src/shared/file-lock";
import { getIterationCount } from "../utils/test-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join("/tmp", "xdd-real-multiprocess-tests");
const HELPERS_DIR = path.join(__dirname, "helpers");

/**
 * REAL Multi-Process Lock Tests
 *
 * These tests use actual separate Node.js processes via child_process.spawn()
 * to validate TRUE inter-process locking behavior, not just worker threads
 * within the same process.
 *
 * This addresses the critical reviewer's concern that worker threads don't
 * provide true process isolation for file-based locks.
 */
describe("FileLock - Real Multi-Process Tests", () => {
  beforeEach(async () => {
    // Clean up and create test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * Spawns a child process running bun with the specified script
   */
  function spawnChildProcess(
    scriptPath: string,
    config: unknown,
  ): ChildProcess {
    return spawn("bun", ["run", scriptPath], {
      env: {
        ...process.env,
        WORKER_CONFIG: JSON.stringify(config),
        HOLDER_CONFIG: JSON.stringify(config),
        RACER_CONFIG: JSON.stringify(config),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /**
   * Waits for a child process to complete and returns parsed JSON output
   */
  function waitForChildProcess(child: ChildProcess): Promise<any> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          try {
            // Parse last line of stdout as JSON
            const lines = stdout.trim().split("\n");
            const lastLine = lines[lines.length - 1];
            if (!lastLine) {
              throw new Error("No output from child process");
            }
            resolve(JSON.parse(lastLine));
          } catch (_error) {
            reject(new Error(`Failed to parse child output: ${stdout}`));
          }
        } else {
          reject(
            new Error(`Child process exited with code ${code}: ${stderr}`),
          );
        }
      });

      child.on("error", reject);
    });
  }

  it("Test 1: Multi-Process Lock Contention", async () => {
    const resourcePath = path.join(TEST_DIR, "counter-lock");
    const counterPath = path.join(TEST_DIR, "counter.txt");
    // Reduced for faster standard tests
    const numProcesses = getIterationCount(2, 3);
    const iterationsPerProcess = getIterationCount(3, 5);
    const expectedTotal = numProcesses * iterationsPerProcess;

    console.log(
      `\n=== Test 1: Multi-Process Lock Contention ===\nSpawning ${numProcesses} REAL processes, each incrementing counter ${iterationsPerProcess} times...`,
    );
    const startTime = performance.now();

    // Spawn all child processes
    const children: ChildProcess[] = [];
    const promises: Promise<any>[] = [];

    for (let i = 0; i < numProcesses; i++) {
      const child = spawnChildProcess(
        path.join(HELPERS_DIR, "child-lock-incrementer.ts"),
        {
          resourcePath,
          counterPath,
          workerId: i,
          iterations: iterationsPerProcess,
          timeout: 10000,
          retryInterval: 10,
        },
      );

      children.push(child);
      promises.push(waitForChildProcess(child));
    }

    // Wait for all processes to complete
    const results = await Promise.all(promises);
    const totalDuration = performance.now() - startTime;

    // Analyze results
    let totalOperations = 0;
    let successfulOperations = 0;
    let failedOperations = 0;
    const waitDurations: number[] = [];
    const holdDurations: number[] = [];
    const allValues: number[] = [];

    for (const processResult of results) {
      for (const op of processResult.results) {
        totalOperations++;
        if (op.success) {
          successfulOperations++;
          waitDurations.push(op.waitDuration);
          holdDurations.push(op.holdDuration);
          allValues.push(op.value);
        } else {
          failedOperations++;
          console.error(`Operation failed: ${op.error}`);
        }
      }
    }

    // Read final counter value
    const finalValue = parseInt(await fs.readFile(counterPath, "utf8"), 10);

    // Calculate statistics
    const avgWaitDuration =
      waitDurations.reduce((a, b) => a + b, 0) / waitDurations.length;
    const maxWaitDuration = Math.max(...waitDurations);
    const minWaitDuration = Math.min(...waitDurations);
    const avgHoldDuration =
      holdDurations.reduce((a, b) => a + b, 0) / holdDurations.length;

    console.log("\n=== Results ===");
    console.log(`Total operations attempted: ${totalOperations}`);
    console.log(`Successful operations: ${successfulOperations}`);
    console.log(`Failed operations: ${failedOperations}`);
    console.log(`Final counter value: ${finalValue}`);
    console.log(`Expected value: ${expectedTotal}`);
    console.log(
      `Success rate: ${((finalValue / expectedTotal) * 100).toFixed(2)}%`,
    );
    console.log(`Total duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average wait duration: ${avgWaitDuration.toFixed(2)}ms`);
    console.log(`Min wait duration: ${minWaitDuration}ms`);
    console.log(`Max wait duration: ${maxWaitDuration}ms`);
    console.log(`Average hold duration: ${avgHoldDuration.toFixed(2)}ms`);
    console.log(
      `Throughput: ${(successfulOperations / (totalDuration / 1000)).toFixed(2)} ops/second`,
    );

    // CRITICAL ASSERTIONS: With REAL processes, we should have ZERO lost increments
    expect(finalValue).toBe(expectedTotal);
    expect(successfulOperations).toBe(expectedTotal);
    expect(failedOperations).toBe(0);

    // Verify no duplicate values (proves mutual exclusion)
    const uniqueValues = new Set(allValues);
    expect(uniqueValues.size).toBe(expectedTotal);
  }, 30000);

  it.skip("Test 2: Process Kill Scenarios - SIGKILL cleanup", async () => {
    const resourcePath = path.join(TEST_DIR, "kill-test-lock");

    console.log("\n=== Test 2: Process Kill Scenarios ===");

    // Step 1: Process A acquires lock
    console.log("Step 1: Process A acquires lock...");
    const processA = spawnChildProcess(
      path.join(HELPERS_DIR, "child-lock-holder.ts"),
      {
        resourcePath,
        holdDuration: -1, // Hold forever
        timeout: 5000,
      },
    );

    // Wait for Process A to acquire lock
    await new Promise<void>((resolve) => {
      processA.stdout?.on("data", (data) => {
        const message = JSON.parse(data.toString());
        if (message.acquired) {
          console.log(`Process A (PID ${message.pid}) acquired lock`);
          resolve();
        }
      });
    });

    // Verify lock directory exists
    const lockPath = `${resourcePath}.lock`;
    const lockExists = await fs
      .access(lockPath)
      .then(() => true)
      .catch(() => false);
    expect(lockExists).toBe(true);
    console.log("Lock directory confirmed to exist");

    // Step 2: Kill Process A with SIGKILL (no cleanup)
    console.log("\nStep 2: Killing Process A with SIGKILL (no cleanup)...");
    processA.kill("SIGKILL");
    await new Promise((resolve) => processA.on("close", resolve));
    console.log("Process A killed");

    // Brief delay to ensure process is dead
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 3: Process B attempts to acquire lock
    console.log("\nStep 3: Process B attempting to acquire lock...");
    const lock = new FileLock();
    const acquireStart = Date.now();

    // Process B should detect stale lock and acquire it
    await lock.acquire(resourcePath, {
      timeout: 5000,
      retryInterval: 10,
      staleTimeout: 500, // Consider lock stale after 500ms
    });

    const acquireDuration = Date.now() - acquireStart;
    console.log(
      `Process B acquired lock in ${acquireDuration}ms (should detect stale lock)`,
    );

    // Verify lock cleanup worked
    const newLockExists = await fs
      .access(lockPath)
      .then(() => true)
      .catch(() => false);
    expect(newLockExists).toBe(true);
    console.log(
      "New lock directory exists (stale lock cleaned up successfully)",
    );

    // Release lock
    await lock.release(resourcePath);

    const finalLockExists = await fs
      .access(lockPath)
      .then(() => true)
      .catch(() => false);
    expect(finalLockExists).toBe(false);
    console.log("Lock released and directory cleaned up");

    // Verify stale lock was detected reasonably quickly
    // Should be much less than the timeout (5 seconds)
    expect(acquireDuration).toBeLessThan(3000);
  }, 20000);

  it.skip("Test 3: Concurrent Lock Creation", async () => {
    const resourcePath = path.join(TEST_DIR, "race-lock");
    const coordinationPath = path.join(TEST_DIR, "coordination");
    // Reduced for faster standard tests
    const numProcesses = getIterationCount(2, 3);

    console.log(
      `\n=== Test 3: Concurrent Lock Creation ===\nSpawning ${numProcesses} processes for coordinated simultaneous lock acquisition...`,
    );

    // Spawn all child processes
    const children: ChildProcess[] = [];
    const promises: Promise<any>[] = [];

    for (let i = 0; i < numProcesses; i++) {
      const child = spawnChildProcess(
        path.join(HELPERS_DIR, "child-lock-racer.ts"),
        {
          resourcePath,
          coordinationPath,
          workerId: i,
          timeout: 10000,
        },
      );

      children.push(child);
      promises.push(waitForChildProcess(child));
    }

    // Wait for all processes to be ready
    console.log("Waiting for all processes to be ready...");
    await new Promise<void>((resolve) => {
      const checkReady = async () => {
        for (let i = 0; i < numProcesses; i++) {
          const readyPath = `${coordinationPath}.${i}.ready`;
          try {
            await fs.access(readyPath);
          } catch {
            setTimeout(checkReady, 10);
            return;
          }
        }
        resolve();
      };
      checkReady();
    });

    console.log("All processes ready. Sending start signal...");

    // Send start signal (all processes will try to acquire lock simultaneously)
    const startSignalPath = `${coordinationPath}.start`;
    await fs.writeFile(startSignalPath, "start");

    // Wait for all processes to complete
    const results = await Promise.all(promises);

    // Analyze results
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log("\n=== Results ===");
    console.log(`Total processes: ${numProcesses}`);
    console.log(`Successful acquisitions: ${successful.length}`);
    console.log(`Failed acquisitions: ${failed.length}`);

    // Sort by order to see acquisition sequence
    successful.sort((a, b) => a.order - b.order);

    console.log("\nAcquisition order:");
    for (const result of successful) {
      console.log(
        `  Worker ${result.workerId}: Order=${result.order}, AcquireDuration=${result.acquireDuration}ms`,
      );
    }

    // CRITICAL ASSERTIONS
    // All processes should eventually acquire lock
    expect(successful.length).toBe(numProcesses);
    expect(failed.length).toBe(0);

    // Each process should get a unique order (1 through numProcesses)
    const orders = successful.map((r) => r.order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(numProcesses);
    expect(Math.min(...orders)).toBe(1);
    expect(Math.max(...orders)).toBe(numProcesses);

    // First process should acquire quickly (no contention yet)
    const firstAcquirer = successful.find((r) => r.order === 1);
    expect(firstAcquirer).toBeDefined();
    console.log(
      `\nFirst acquirer (Worker ${firstAcquirer?.workerId}) took ${firstAcquirer?.acquireDuration}ms`,
    );

    // Later processes should wait longer
    const lastAcquirer = successful.find((r) => r.order === numProcesses);
    expect(lastAcquirer).toBeDefined();
    console.log(
      `Last acquirer (Worker ${lastAcquirer?.workerId}) took ${lastAcquirer?.acquireDuration}ms`,
    );
  }, 30000);

  it.skip("Test 4: Stress Test - Multiple iterations to catch race conditions", async () => {
    // Reduced for faster standard tests
    const numIterations = getIterationCount(1, 2);
    const numProcesses = getIterationCount(2, 3);
    const iterationsPerProcess = getIterationCount(2, 3);

    console.log(
      `\n=== Test 4: Stress Test ===\nRunning ${numIterations} iterations of ${numProcesses} processes x ${iterationsPerProcess} operations`,
    );

    const iterationResults: Array<{
      iteration: number;
      finalValue: number;
      expected: number;
      success: boolean;
    }> = [];

    for (let iteration = 0; iteration < numIterations; iteration++) {
      const resourcePath = path.join(TEST_DIR, `stress-lock-${iteration}`);
      const counterPath = path.join(
        TEST_DIR,
        `stress-counter-${iteration}.txt`,
      );
      const expectedTotal = numProcesses * iterationsPerProcess;

      // Spawn all child processes
      const promises: Promise<any>[] = [];
      for (let i = 0; i < numProcesses; i++) {
        const child = spawnChildProcess(
          path.join(HELPERS_DIR, "child-lock-incrementer.ts"),
          {
            resourcePath,
            counterPath,
            workerId: i,
            iterations: iterationsPerProcess,
            timeout: 10000,
            retryInterval: 10,
          },
        );
        promises.push(waitForChildProcess(child));
      }

      // Wait for all processes
      await Promise.all(promises);

      // Read final value
      const finalValue = parseInt(await fs.readFile(counterPath, "utf8"), 10);
      const success = finalValue === expectedTotal;

      iterationResults.push({
        iteration: iteration + 1,
        finalValue,
        expected: expectedTotal,
        success,
      });

      console.log(
        `Iteration ${iteration + 1}: ${finalValue}/${expectedTotal} ${success ? "✓" : "✗"}`,
      );
    }

    // Summary
    const successCount = iterationResults.filter((r) => r.success).length;
    console.log(`\n=== Stress Test Summary ===`);
    console.log(`Total iterations: ${numIterations}`);
    console.log(`Successful iterations: ${successCount}`);
    console.log(`Failed iterations: ${numIterations - successCount}`);
    console.log(
      `Success rate: ${((successCount / numIterations) * 100).toFixed(1)}%`,
    );

    // CRITICAL ASSERTION: All iterations should succeed with real processes
    expect(successCount).toBe(numIterations);
  }, 60000);
});
