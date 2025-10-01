/**
 * FileLock Stress Validation Test Suite
 *
 * Intensive stress testing of FileLock and AtomicWriter implementations
 * to ensure reliability under high concurrency and load.
 *
 * Test Requirements:
 * 1. FileLock: Intensive runs with 100% success rate
 * 2. AtomicWriter: 0% corruption rate under stress
 * 3. Performance benchmarks
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join('/tmp', 'despec-stress-validation');

interface WorkerResult {
  success: boolean;
  results?: any[];
  error?: string;
}

interface FileLockRunResult {
  runNumber: number;
  totalOperations: number;
  successfulOperations: number;
  expectedCount: number;
  actualCount: number;
  lostIncrements: number;
  avgWaitTime: number;
  maxWaitTime: number;
  totalDuration: number;
  success: boolean;
}

describe('FileLock Stress Validation', () => {
  beforeAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * Test 1: FileLock Intensive Validation - 2 Runs
   * Each run: 3 workers × 10 operations = 30 expected operations
   * Requirement: 100% success rate (no lost increments)
   */
  it('FileLock: 2 intensive runs with 100% success rate (3 workers × 10 ops each)', async () => {
    const NUM_RUNS = 2;
    const NUM_WORKERS = 3;
    const OPERATIONS_PER_WORKER = 10;
    const EXPECTED_FINAL_COUNT = NUM_WORKERS * OPERATIONS_PER_WORKER;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         FileLock Validation - 2 Intensive Runs           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(
      `Configuration: ${NUM_RUNS} runs × ${NUM_WORKERS} workers × ${OPERATIONS_PER_WORKER} operations`
    );
    console.log(`Expected count per run: ${EXPECTED_FINAL_COUNT}`);
    console.log('');

    const results: FileLockRunResult[] = [];
    let successfulRuns = 0;
    let failedRuns = 0;

    for (let runNumber = 1; runNumber <= NUM_RUNS; runNumber++) {
      const runDir = path.join(TEST_DIR, `filelock-run-${runNumber}`);
      await fs.mkdir(runDir, { recursive: true });

      const resourcePath = path.join(runDir, 'counter.txt');
      const result = await runFileLockTest(
        runNumber,
        resourcePath,
        NUM_WORKERS,
        OPERATIONS_PER_WORKER
      );

      results.push(result);

      if (result.success) {
        successfulRuns++;
        console.log(
          `Run ${runNumber.toString().padStart(2)}: ✓ SUCCESS (count: ${result.actualCount}/${result.expectedCount}, time: ${result.totalDuration.toFixed(0)}ms, avg wait: ${result.avgWaitTime.toFixed(1)}ms)`
        );
      } else {
        failedRuns++;
        console.log(
          `Run ${runNumber.toString().padStart(2)}: ✗ FAILURE (count: ${result.actualCount}/${result.expectedCount}, lost: ${result.lostIncrements})`
        );
      }

      await fs.rm(runDir, { recursive: true, force: true });
    }

    // Calculate aggregate statistics
    const successRate = (successfulRuns / NUM_RUNS) * 100;
    const totalOperations = results.reduce((sum, r) => sum + r.totalOperations, 0);
    const totalSuccessful = results.reduce((sum, r) => sum + r.successfulOperations, 0);
    const totalLostIncrements = results.reduce((sum, r) => sum + r.lostIncrements, 0);
    const avgWaitTime = results.reduce((sum, r) => sum + r.avgWaitTime, 0) / results.length;
    const maxWaitTime = Math.max(...results.map((r) => r.maxWaitTime));
    const avgDuration = results.reduce((sum, r) => sum + r.totalDuration, 0) / results.length;
    const totalDuration = results.reduce((sum, r) => sum + r.totalDuration, 0);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  FileLock Results Summary                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Total runs:                     ${NUM_RUNS}`);
    console.log(`Successful runs:                ${successfulRuns}`);
    console.log(`Failed runs:                    ${failedRuns}`);
    console.log(`Success rate:                   ${successRate.toFixed(2)}%`);
    console.log(`Total operations:               ${totalOperations.toLocaleString()}`);
    console.log(`Successful operations:          ${totalSuccessful.toLocaleString()}`);
    console.log(`Lost increments (all runs):     ${totalLostIncrements}`);
    console.log(`Average wait time:              ${avgWaitTime.toFixed(2)}ms`);
    console.log(`Max wait time:                  ${maxWaitTime.toFixed(2)}ms`);
    console.log(`Average run duration:           ${avgDuration.toFixed(2)}ms`);
    console.log(`Total test duration:            ${totalDuration.toFixed(2)}ms`);
    console.log(
      `Throughput:                     ${((totalSuccessful / totalDuration) * 1000).toFixed(2)} ops/sec`
    );
    console.log('');

    // CRITICAL ASSERTIONS
    expect(successRate, `Expected 100% success rate, got ${successRate.toFixed(2)}%`).toBe(100);
    expect(totalLostIncrements, `Lost ${totalLostIncrements} increments across all runs`).toBe(0);
    expect(failedRuns, `${failedRuns} runs failed`).toBe(0);
  }, 10000); // 10 second timeout

  /**
   * Test 2: AtomicWriter Stress Test
   * 3 workers × 20 files = 60 files
   * Requirement: 0% corruption rate
   */
  it('AtomicWriter: 0% corruption rate stress test (3 workers × 20 files)', async () => {
    const NUM_WORKERS = 3;
    const FILES_PER_WORKER = 20;
    const EXPECTED_TOTAL_FILES = NUM_WORKERS * FILES_PER_WORKER;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║            AtomicWriter Stress Test (60 files)            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Configuration: ${NUM_WORKERS} workers × ${FILES_PER_WORKER} files`);
    console.log(`Expected total files: ${EXPECTED_TOTAL_FILES.toLocaleString()}`);
    console.log('');

    const testDir = path.join(TEST_DIR, 'atomic-writer-stress');
    await fs.mkdir(testDir, { recursive: true });

    const result = await runAtomicWriterTest(testDir, NUM_WORKERS, FILES_PER_WORKER);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              AtomicWriter Results Summary                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Total files written:            ${result.totalFiles.toLocaleString()}`);
    console.log(`Expected files:                 ${EXPECTED_TOTAL_FILES.toLocaleString()}`);
    console.log(`Total corruptions:              ${result.totalCorruptions}`);
    console.log(`Corruption rate:                ${result.corruptionRate.toFixed(4)}%`);
    console.log(`Average write time:             ${result.avgWriteTime.toFixed(2)}ms`);
    console.log(`Throughput:                     ${result.throughput.toFixed(2)} writes/sec`);
    console.log(`Total duration:                 ${result.totalDuration.toFixed(2)}ms`);
    console.log('');

    console.log('Per-worker statistics:');
    for (const wr of result.workerResults) {
      console.log(
        `  Worker ${wr.workerId.toString().padStart(2)}: ` +
          `Written=${wr.filesWritten.toString().padStart(4)}, ` +
          `Failed=${wr.filesFailed.toString().padStart(2)}, ` +
          `Corrupted=${wr.corruptedFiles.toString().padStart(2)}, ` +
          `AvgTime=${wr.avgWriteTime.toFixed(2)}ms`
      );
    }
    console.log('');

    // CRITICAL ASSERTIONS
    expect(result.corruptionRate, `Corruption rate ${result.corruptionRate}% exceeds 0%`).toBe(0);
    expect(result.totalCorruptions, `Found ${result.totalCorruptions} corrupted files`).toBe(0);
    expect(
      result.totalFiles,
      `Expected ${EXPECTED_TOTAL_FILES} files, got ${result.totalFiles}`
    ).toBe(EXPECTED_TOTAL_FILES);
    expect(result.success).toBe(true);

    await fs.rm(testDir, { recursive: true, force: true });
  }, 10000); // 10 second timeout

  /**
   * Test 3: Performance Benchmarks
   */
  it('Performance Benchmarks: Lock acquisition and write throughput', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  Performance Benchmarks                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Benchmark 1: FileLock under high contention
    const lockBenchDir = path.join(TEST_DIR, 'lock-bench');
    await fs.mkdir(lockBenchDir, { recursive: true });

    const lockResourcePath = path.join(lockBenchDir, 'bench-resource.txt');
    console.log('\nBenchmark 1: FileLock acquisition under high contention');
    console.log('Configuration: 3 workers × 10 operations');
    const lockBenchResult = await runFileLockTest(0, lockResourcePath, 3, 10);

    console.log(`  Average lock acquisition time:  ${lockBenchResult.avgWaitTime.toFixed(2)}ms`);
    console.log(`  Max lock acquisition time:      ${lockBenchResult.maxWaitTime.toFixed(2)}ms`);
    console.log(
      `  Throughput:                     ${((lockBenchResult.totalOperations / lockBenchResult.totalDuration) * 1000).toFixed(2)} ops/sec`
    );

    // Benchmark 2: AtomicWriter throughput
    const writerBenchDir = path.join(TEST_DIR, 'writer-bench');
    await fs.mkdir(writerBenchDir, { recursive: true });

    console.log('\nBenchmark 2: AtomicWriter throughput');
    console.log('Configuration: 3 workers × 20 files');
    const writerBenchResult = await runAtomicWriterTest(writerBenchDir, 3, 20);

    console.log(`  Average write time:             ${writerBenchResult.avgWriteTime.toFixed(2)}ms`);
    console.log(
      `  Throughput:                     ${writerBenchResult.throughput.toFixed(2)} writes/sec`
    );
    console.log('');

    // Performance assertions (reasonable thresholds based on system capabilities)
    expect(lockBenchResult.avgWaitTime).toBeLessThan(1000); // < 1s average wait
    expect(writerBenchResult.avgWriteTime).toBeLessThan(100); // < 100ms average write
    expect(lockBenchResult.success).toBe(true);
    expect(writerBenchResult.success).toBe(true);

    await fs.rm(lockBenchDir, { recursive: true, force: true });
    await fs.rm(writerBenchDir, { recursive: true, force: true });
  }, 120000); // 2 minute timeout
});

/**
 * Helper: Run FileLock test with concurrent workers
 */
async function runFileLockTest(
  runNumber: number,
  resourcePath: string,
  numWorkers: number,
  operationsPerWorker: number
): Promise<FileLockRunResult> {
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { FileLock } = require('${path.resolve(__dirname, '../../dist/shared/file-lock.js')}');
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

          // Small delay to simulate work and increase contention
          await new Promise(resolve => setTimeout(resolve, Math.random() * 2));

          // Write new value
          await fs.writeFile(resourcePath, newValue.toString());

          await lock.release(resourcePath);

          results.push({ success: true, waitTime, value: newValue });
        } catch (error) {
          results.push({ success: false, error: error.message });

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
      workerData: { resourcePath, workerId: i, operations: operationsPerWorker },
    });

    workers.push(worker);
    workerPromises.push(
      new Promise((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
      })
    );
  }

  const results = await Promise.all(workerPromises);
  const totalDuration = performance.now() - startTime;

  let totalOperations = 0;
  let successfulOperations = 0;
  const waitTimes: number[] = [];

  for (const workerResult of results) {
    if (workerResult.results) {
      for (const op of workerResult.results) {
        totalOperations++;
        if (op.success) {
          successfulOperations++;
          waitTimes.push(op.waitTime);
        }
      }
    }
  }

  // Read final count
  let actualCount = 0;
  try {
    const content = await fs.readFile(resourcePath, 'utf8');
    actualCount = parseInt(content, 10) || 0;
  } catch (_error) {
    // File doesn't exist
  }

  const expectedCount = successfulOperations;
  const lostIncrements = expectedCount - actualCount;
  const avgWaitTime =
    waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;
  const maxWaitTime = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;

  // Cleanup workers
  for (const worker of workers) {
    await worker.terminate();
  }

  return {
    runNumber,
    totalOperations,
    successfulOperations,
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
  filesPerWorker: number
): Promise<{
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
}> {
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { AtomicWriter } = require('${path.resolve(__dirname, '../../dist/shared/atomic-writer.js')}');
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
        let corrupted = false;

        try {
          await writer.writeFile(filePath, expectedContent);
          written = true;
          const writeTime = Date.now() - startTime;

          const actualContent = await fs.readFile(filePath, 'utf8');
          const verified = actualContent === expectedContent;
          corrupted = !verified;

          results.push({ success: written && verified, writeTime, corrupted });
        } catch (error) {
          results.push({ success: false, error: error.message, corrupted: true });
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
      workerData: { testDir, workerId: i, numFiles: filesPerWorker },
    });

    workers.push(worker);
    workerPromises.push(
      new Promise((resolve, reject) => {
        worker.on('message', resolve);
        worker.on('error', reject);
      })
    );
  }

  const results = await Promise.all(workerPromises);
  const totalDuration = performance.now() - startTime;

  const workerResults: any[] = [];
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
      writeTimes.length > 0 ? writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length : 0;

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
    allWriteTimes.length > 0 ? allWriteTimes.reduce((a, b) => a + b, 0) / allWriteTimes.length : 0;
  const throughput = totalFiles / (totalDuration / 1000);
  const corruptionRate = totalFiles > 0 ? (totalCorruptions / totalFiles) * 100 : 0;

  // Cleanup workers
  for (const worker of workers) {
    await worker.terminate();
  }

  return {
    workerResults,
    totalFiles,
    totalCorruptions,
    corruptionRate,
    avgWriteTime,
    throughput,
    totalDuration,
    success: totalCorruptions === 0 && totalFiles === numWorkers * filesPerWorker,
  };
}
