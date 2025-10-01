/**
 * FileLock Worker Thread Validation Test Suite
 *
 * Validates FileLock and AtomicWriter implementations using worker threads
 * to ensure thread safety and atomic operations work correctly.
 *
 * Test Requirements:
 * 1. FileLock: Multiple runs with 100% success rate using worker threads
 * 2. AtomicWriter: 0% corruption rate under concurrent worker thread access
 * 3. Performance benchmarks for lock acquisition and write throughput
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join("/tmp", "despec-worker-validation");

interface WorkerResult {
  success: boolean;
  results?: any[];
  error?: string;
}

interface FileLockTestResult {
  runNumber: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  expectedCount: number;
  actualCount: number;
  lostIncrements: number;
  avgWaitTime: number;
  maxWaitTime: number;
  totalDuration: number;
  success: boolean;
}

interface AtomicWriterTestResult {
  workerResults: Array<{
    workerId: number;
    filesWritten: number;
    filesFailed: number;
    filesVerified: number;
    corruptedFiles: number;
    avgWriteTime: number;
  }>;
  totalFiles: number;
  totalCorruptions: number;
  corruptionRate: number;
  avgWriteTime: number;
  throughput: number;
  totalDuration: number;
  success: boolean;
}

describe("FileLock Worker Thread Validation", () => {
  beforeAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * Test 1: FileLock Validation - 5 Runs
   * Requirement: 100% success rate across all runs
   * NOTE: Using 5 workers × 20 operations for fast testing while maintaining coverage
   */
  it("FileLock: 5 runs with 100% success rate (5 workers × 20 operations)", async () => {
    const NUM_RUNS = 5;
    const NUM_WORKERS = 5;
    const OPERATIONS_PER_WORKER = 20;
    const EXPECTED_FINAL_COUNT = NUM_WORKERS * OPERATIONS_PER_WORKER;

    console.log("\n=== FileLock Validation: 5 Runs ===");
    console.log(
      `Configuration: ${NUM_RUNS} runs × ${NUM_WORKERS} workers × ${OPERATIONS_PER_WORKER} operations`,
    );
    console.log(`Expected final count per run: ${EXPECTED_FINAL_COUNT}\n`);

    const results: FileLockTestResult[] = [];
    let successfulRuns = 0;
    let failedRuns = 0;

    for (let runNumber = 1; runNumber <= NUM_RUNS; runNumber++) {
      const runDir = path.join(TEST_DIR, `filelock-run-${runNumber}`);
      await fs.mkdir(runDir, { recursive: true });

      const resourcePath = path.join(runDir, "counter.txt");
      const result = await runFileLockTest(
        runNumber,
        resourcePath,
        NUM_WORKERS,
        OPERATIONS_PER_WORKER,
      );

      results.push(result);

      if (result.success) {
        successfulRuns++;
        if (runNumber % 10 === 0) {
          console.log(
            `Run ${runNumber}: ✓ SUCCESS (count: ${result.actualCount}/${result.expectedCount}, time: ${result.totalDuration.toFixed(0)}ms)`,
          );
        }
      } else {
        failedRuns++;
        console.log(
          `Run ${runNumber}: ✗ FAILURE (count: ${result.actualCount}/${result.expectedCount}, lost: ${result.lostIncrements})`,
        );
      }

      // Cleanup run directory
      await fs.rm(runDir, { recursive: true, force: true });
    }

    // Calculate aggregate statistics
    const successRate = (successfulRuns / NUM_RUNS) * 100;
    const totalLostIncrements = results.reduce(
      (sum, r) => sum + r.lostIncrements,
      0,
    );
    const avgWaitTime =
      results.reduce((sum, r) => sum + r.avgWaitTime, 0) / results.length;
    const maxWaitTime = Math.max(...results.map((r) => r.maxWaitTime));
    const avgDuration =
      results.reduce((sum, r) => sum + r.totalDuration, 0) / results.length;

    console.log("\n=== FileLock Validation Results ===");
    console.log(`Total runs: ${NUM_RUNS}`);
    console.log(`Successful runs: ${successfulRuns}`);
    console.log(`Failed runs: ${failedRuns}`);
    console.log(`Success rate: ${successRate.toFixed(2)}%`);
    console.log(
      `Total lost increments across all runs: ${totalLostIncrements}`,
    );
    console.log(`Average wait time: ${avgWaitTime.toFixed(2)}ms`);
    console.log(`Max wait time: ${maxWaitTime.toFixed(2)}ms`);
    console.log(`Average run duration: ${avgDuration.toFixed(2)}ms`);

    // CRITICAL ASSERTION: 100% success rate required
    expect(successRate).toBe(100);
    expect(totalLostIncrements).toBe(0);
    expect(failedRuns).toBe(0);
  }, 30000); // 30 second timeout

  /**
   * Test 2: AtomicWriter Stress Test
   * Requirement: 0% corruption rate
   * NOTE: Using 5 workers × 50 files for fast testing while maintaining coverage
   */
  it("AtomicWriter: 0% corruption rate (5 workers × 50 files)", async () => {
    const NUM_WORKERS = 5;
    const FILES_PER_WORKER = 50;
    const EXPECTED_TOTAL_FILES = NUM_WORKERS * FILES_PER_WORKER;

    console.log("\n=== AtomicWriter Stress Test ===");
    console.log(
      `Configuration: ${NUM_WORKERS} workers × ${FILES_PER_WORKER} files`,
    );
    console.log(`Expected total files: ${EXPECTED_TOTAL_FILES}\n`);

    const testDir = path.join(TEST_DIR, "atomic-writer-stress");
    await fs.mkdir(testDir, { recursive: true });

    const result = await runAtomicWriterTest(
      testDir,
      NUM_WORKERS,
      FILES_PER_WORKER,
    );

    console.log("\n=== AtomicWriter Stress Test Results ===");
    console.log(`Total files written: ${result.totalFiles}`);
    console.log(`Expected files: ${EXPECTED_TOTAL_FILES}`);
    console.log(`Total corruptions: ${result.totalCorruptions}`);
    console.log(`Corruption rate: ${result.corruptionRate.toFixed(4)}%`);
    console.log(`Average write time: ${result.avgWriteTime.toFixed(2)}ms`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} writes/second`);
    console.log(`Total duration: ${result.totalDuration.toFixed(2)}ms`);

    console.log("\nPer-worker statistics:");
    for (const wr of result.workerResults) {
      console.log(
        `  Worker ${wr.workerId}: Written=${wr.filesWritten}, Failed=${wr.filesFailed}, Corrupted=${wr.corruptedFiles}, AvgTime=${wr.avgWriteTime.toFixed(2)}ms`,
      );
    }

    // CRITICAL ASSERTIONS: 0% corruption rate and all files written
    expect(result.corruptionRate).toBe(0);
    expect(result.totalCorruptions).toBe(0);
    expect(result.totalFiles).toBe(EXPECTED_TOTAL_FILES);
    expect(result.success).toBe(true);

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  }, 30000); // 30 second timeout

  /**
   * Test 3: Performance Benchmarks
   */
  it("Performance Benchmarks: Lock acquisition and write throughput", async () => {
    console.log("\n=== Performance Benchmarks ===");

    // FileLock: Average acquisition time under contention
    const lockBenchDir = path.join(TEST_DIR, "lock-bench");
    await fs.mkdir(lockBenchDir, { recursive: true });

    const lockResourcePath = path.join(lockBenchDir, "bench-resource.txt");

    console.log(
      "\nBenchmark 1: FileLock acquisition under contention (5 workers × 20 operations)",
    );
    const lockBenchResult = await runFileLockTest(0, lockResourcePath, 5, 20);
    console.log(
      `  Average lock acquisition time: ${lockBenchResult.avgWaitTime.toFixed(2)}ms`,
    );
    console.log(
      `  Max lock acquisition time: ${lockBenchResult.maxWaitTime.toFixed(2)}ms`,
    );
    console.log(
      `  Throughput: ${((lockBenchResult.totalOperations / lockBenchResult.totalDuration) * 1000).toFixed(2)} ops/second`,
    );

    // AtomicWriter: Throughput (writes/second)
    const writerBenchDir = path.join(TEST_DIR, "writer-bench");
    await fs.mkdir(writerBenchDir, { recursive: true });

    console.log(
      "\nBenchmark 2: AtomicWriter throughput (3 workers × 50 files)",
    );
    const writerBenchResult = await runAtomicWriterTest(writerBenchDir, 3, 50);
    console.log(
      `  Average write time: ${writerBenchResult.avgWriteTime.toFixed(2)}ms`,
    );
    console.log(
      `  Throughput: ${writerBenchResult.throughput.toFixed(2)} writes/second`,
    );

    // Performance assertions (reasonable thresholds)
    expect(lockBenchResult.avgWaitTime).toBeLessThan(500); // < 500ms average wait
    expect(writerBenchResult.avgWriteTime).toBeLessThan(50); // < 50ms average write

    // Cleanup
    await fs.rm(lockBenchDir, { recursive: true, force: true });
    await fs.rm(writerBenchDir, { recursive: true, force: true });
  }, 30000); // 30 second timeout
});

/**
 * Helper: Run a single FileLock test with concurrent workers
 */
async function runFileLockTest(
  runNumber: number,
  resourcePath: string,
  numWorkers: number,
  operationsPerWorker: number,
): Promise<FileLockTestResult> {
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { FileLock } = require('${path.resolve(__dirname, "../../dist/shared/file-lock.js")}');
    const fs = require('fs/promises');

    async function run() {
      const lock = new FileLock();
      const { resourcePath, workerId, operations } = workerData;
      const results = [];

      for (let i = 0; i < operations; i++) {
        const startTime = Date.now();
        let acquired = false;

        try {
          await lock.acquire(resourcePath, { timeout: 30000 });
          const waitTime = Date.now() - startTime;
          acquired = true;

          // Read current value
          let currentValue = 0;
          try {
            const content = await fs.readFile(resourcePath, 'utf8');
            currentValue = parseInt(content, 10) || 0;
          } catch (error) {
            // File doesn't exist yet
          }

          // Increment value
          const newValue = currentValue + 1;

          // Small delay to increase chance of race conditions
          await new Promise(resolve => setTimeout(resolve, Math.random() * 2));

          // Write new value
          await fs.writeFile(resourcePath, newValue.toString());

          await lock.release(resourcePath);

          results.push({
            success: true,
            waitTime,
            value: newValue
          });
        } catch (error) {
          results.push({
            success: false,
            error: error.message
          });

          if (acquired) {
            await lock.release(resourcePath);
          }
        }
      }

      return results;
    }

    run().then(results => {
      parentPort.postMessage({ success: true, results });
    }).catch(error => {
      parentPort.postMessage({ success: false, error: error.message });
    });
  `;

  const workers: Worker[] = [];
  const workerPromises: Promise<WorkerResult>[] = [];

  const startTime = performance.now();

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        resourcePath,
        workerId: i,
        operations: operationsPerWorker,
      },
    });

    workers.push(worker);

    const promise = new Promise<WorkerResult>((resolve, reject) => {
      worker.on("message", resolve);
      worker.on("error", reject);
    });

    workerPromises.push(promise);
  }

  const results = await Promise.all(workerPromises);
  const totalDuration = performance.now() - startTime;

  let totalOperations = 0;
  let successfulOperations = 0;
  let failedOperations = 0;
  const waitTimes: number[] = [];

  for (const workerResult of results) {
    if (workerResult.results) {
      for (const op of workerResult.results) {
        totalOperations++;
        if (op.success) {
          successfulOperations++;
          waitTimes.push(op.waitTime);
        } else {
          failedOperations++;
        }
      }
    }
  }

  // Read final count
  let actualCount = 0;
  try {
    const content = await fs.readFile(resourcePath, "utf8");
    actualCount = parseInt(content, 10) || 0;
  } catch (_error) {
    // File doesn't exist
  }

  const expectedCount = successfulOperations;
  const lostIncrements = expectedCount - actualCount;
  const avgWaitTime =
    waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;
  const maxWaitTime = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;

  // Cleanup workers (don't await - causes hang in Bun test runner)
  for (const worker of workers) {
    worker.terminate(); // Fire and forget - awaiting hangs in Bun tests
  }

  return {
    runNumber,
    totalOperations,
    successfulOperations,
    failedOperations,
    expectedCount,
    actualCount,
    lostIncrements,
    avgWaitTime,
    maxWaitTime,
    totalDuration,
    success: lostIncrements === 0 && actualCount === expectedCount,
  };
}

/**
 * Helper: Run AtomicWriter stress test with concurrent workers
 */
async function runAtomicWriterTest(
  testDir: string,
  numWorkers: number,
  filesPerWorker: number,
): Promise<AtomicWriterTestResult> {
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { AtomicWriter } = require('${path.resolve(__dirname, "../../dist/shared/atomic-writer.js")}');
    const fs = require('fs/promises');
    const path = require('path');

    async function run() {
      const writer = new AtomicWriter();
      const { testDir, workerId, numFiles } = workerData;
      const results = [];

      for (let i = 0; i < numFiles; i++) {
        const fileId = \`worker-\${workerId}-file-\${i}\`;
        const filePath = path.join(testDir, \`\${fileId}.txt\`);
        const expectedContent = \`Content for \${fileId} - ${Math.random().toString(36)}\`;

        const startTime = Date.now();
        let written = false;
        let verified = false;
        let corrupted = false;

        try {
          // Write file
          await writer.writeFile(filePath, expectedContent);
          written = true;
          const writeTime = Date.now() - startTime;

          // Verify content
          const actualContent = await fs.readFile(filePath, 'utf8');
          verified = actualContent === expectedContent;
          corrupted = !verified;

          results.push({
            success: written && verified,
            writeTime,
            corrupted
          });
        } catch (error) {
          results.push({
            success: false,
            error: error.message,
            corrupted: true
          });
        }
      }

      return results;
    }

    run().then(results => {
      parentPort.postMessage({ success: true, results });
    }).catch(error => {
      parentPort.postMessage({ success: false, error: error.message });
    });
  `;

  const workers: Worker[] = [];
  const workerPromises: Promise<WorkerResult>[] = [];

  const startTime = performance.now();

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        testDir,
        workerId: i,
        numFiles: filesPerWorker,
      },
    });

    workers.push(worker);

    const promise = new Promise<WorkerResult>((resolve, reject) => {
      worker.on("message", resolve);
      worker.on("error", reject);
    });

    workerPromises.push(promise);
  }

  const results = await Promise.all(workerPromises);
  const totalDuration = performance.now() - startTime;

  const workerResults: AtomicWriterTestResult["workerResults"] = [];
  let totalFiles = 0;
  let totalCorruptions = 0;
  const allWriteTimes: number[] = [];

  for (let i = 0; i < results.length; i++) {
    const workerResult = results[i];
    if (!workerResult) continue;

    let filesWritten = 0;
    let filesFailed = 0;
    let filesVerified = 0;
    let corruptedFiles = 0;
    const writeTimes: number[] = [];

    if (workerResult.results) {
      for (const op of workerResult.results) {
        if (op.success) {
          filesWritten++;
          filesVerified++;
          totalFiles++;
          if (op.writeTime) {
            writeTimes.push(op.writeTime);
            allWriteTimes.push(op.writeTime);
          }
        } else {
          filesFailed++;
        }

        if (op.corrupted) {
          corruptedFiles++;
          totalCorruptions++;
        }
      }
    }

    const avgWriteTime =
      writeTimes.length > 0
        ? writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length
        : 0;

    workerResults.push({
      workerId: i,
      filesWritten,
      filesFailed,
      filesVerified,
      corruptedFiles,
      avgWriteTime,
    });
  }

  const avgWriteTime =
    allWriteTimes.length > 0
      ? allWriteTimes.reduce((a, b) => a + b, 0) / allWriteTimes.length
      : 0;
  const throughput = totalFiles / (totalDuration / 1000);
  const corruptionRate = (totalCorruptions / totalFiles) * 100;

  // Cleanup workers (don't await - causes hang in Bun test runner)
  for (const worker of workers) {
    worker.terminate(); // Fire and forget - awaiting hangs in Bun tests
  }

  return {
    workerResults,
    totalFiles,
    totalCorruptions,
    corruptionRate,
    avgWriteTime,
    throughput,
    totalDuration,
    success:
      totalCorruptions === 0 && totalFiles === numWorkers * filesPerWorker,
  };
}
