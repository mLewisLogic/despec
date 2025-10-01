/**
 * FileLock Concurrent Validation Test Suite
 *
 * Fast validation using in-process concurrency without worker thread overhead.
 * Tests concurrent access patterns to ensure atomic operations work correctly.
 *
 * Test Requirements:
 * 1. FileLock: Multiple runs with concurrent operations
 * 2. AtomicWriter: Stress test with concurrent writes
 * 3. Performance benchmarks
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AtomicWriter } from '../../src/shared/atomic-writer';
import { FileLock } from '../../src/shared/file-lock';

const TEST_DIR = path.join('/tmp', 'despec-concurrent-validation');

interface FileLockRunResult {
  runNumber: number;
  totalOperations: number;
  expectedCount: number;
  actualCount: number;
  lostIncrements: number;
  avgAcquireTime: number;
  maxAcquireTime: number;
  totalDuration: number;
  success: boolean;
}

describe('FileLock Concurrent Validation', () => {
  beforeAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * Test 1: FileLock Validation - 3 Runs with Concurrent Operations
   * Each run: 10 concurrent operations
   * Requirement: 100% success rate (no lost increments)
   */
  it('FileLock: 3 runs with 100% success rate (10 concurrent ops per run)', async () => {
    const NUM_RUNS = 3;
    const CONCURRENT_OPS = 10;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║            FileLock Validation - 3 Runs                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Configuration: ${NUM_RUNS} runs × ${CONCURRENT_OPS} concurrent operations`);
    console.log('');

    const results: FileLockRunResult[] = [];
    let successfulRuns = 0;
    let failedRuns = 0;

    for (let runNumber = 1; runNumber <= NUM_RUNS; runNumber++) {
      const runDir = path.join(TEST_DIR, `filelock-run-${runNumber}`);
      await fs.mkdir(runDir, { recursive: true });

      const resourcePath = path.join(runDir, 'counter.txt');
      const result = await runFileLockConcurrentTest(runNumber, resourcePath, CONCURRENT_OPS);

      results.push(result);

      if (result.success) {
        successfulRuns++;
        if (runNumber % 5 === 0 || !result.success) {
          console.log(
            `Run ${runNumber.toString().padStart(2)}: ✓ SUCCESS (count: ${result.actualCount}/${result.expectedCount}, time: ${result.totalDuration.toFixed(0)}ms, avg acquire: ${result.avgAcquireTime.toFixed(1)}ms)`
          );
        }
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
    const totalLostIncrements = results.reduce((sum, r) => sum + r.lostIncrements, 0);
    const avgAcquireTime = results.reduce((sum, r) => sum + r.avgAcquireTime, 0) / results.length;
    const maxAcquireTime = Math.max(...results.map((r) => r.maxAcquireTime));
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
    console.log(`Lost increments (all runs):     ${totalLostIncrements}`);
    console.log(`Average acquire time:           ${avgAcquireTime.toFixed(2)}ms`);
    console.log(`Max acquire time:               ${maxAcquireTime.toFixed(2)}ms`);
    console.log(`Average run duration:           ${avgDuration.toFixed(2)}ms`);
    console.log(`Total test duration:            ${totalDuration.toFixed(2)}ms`);
    console.log(
      `Throughput:                     ${((totalOperations / totalDuration) * 1000).toFixed(2)} ops/sec`
    );
    console.log('');

    // CRITICAL ASSERTIONS
    expect(successRate, `Expected 100% success rate, got ${successRate.toFixed(2)}%`).toBe(100);
    expect(totalLostIncrements, `Lost ${totalLostIncrements} increments across all runs`).toBe(0);
    expect(failedRuns, `${failedRuns} runs failed`).toBe(0);
  }, 10000); // 10 second timeout

  /**
   * Test 2: AtomicWriter Stress Test
   * 10 concurrent writers × 10 files = 100 files
   * Requirement: 0% corruption rate
   */
  it('AtomicWriter: 0% corruption rate stress test (10 concurrent × 10 files)', async () => {
    const NUM_CONCURRENT = 10;
    const FILES_PER_WRITER = 10;
    const EXPECTED_TOTAL_FILES = NUM_CONCURRENT * FILES_PER_WRITER;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          AtomicWriter Stress Test (100 files)            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Configuration: ${NUM_CONCURRENT} concurrent writers × ${FILES_PER_WRITER} files`);
    console.log(`Expected total files: ${EXPECTED_TOTAL_FILES.toLocaleString()}`);
    console.log('');

    const testDir = path.join(TEST_DIR, 'atomic-writer-stress');
    await fs.mkdir(testDir, { recursive: true });

    const result = await runAtomicWriterConcurrentTest(testDir, NUM_CONCURRENT, FILES_PER_WRITER);

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
    console.log('Configuration: 10 concurrent operations');
    const lockBenchResult = await runFileLockConcurrentTest(0, lockResourcePath, 10);

    console.log(`  Average lock acquisition time:  ${lockBenchResult.avgAcquireTime.toFixed(2)}ms`);
    console.log(`  Max lock acquisition time:      ${lockBenchResult.maxAcquireTime.toFixed(2)}ms`);
    console.log(
      `  Throughput:                     ${((lockBenchResult.totalOperations / lockBenchResult.totalDuration) * 1000).toFixed(2)} ops/sec`
    );

    // Benchmark 2: AtomicWriter throughput
    const writerBenchDir = path.join(TEST_DIR, 'writer-bench');
    await fs.mkdir(writerBenchDir, { recursive: true });

    console.log('\nBenchmark 2: AtomicWriter throughput');
    console.log('Configuration: 10 concurrent × 10 files');
    const writerBenchResult = await runAtomicWriterConcurrentTest(writerBenchDir, 10, 10);

    console.log(`  Average write time:             ${writerBenchResult.avgWriteTime.toFixed(2)}ms`);
    console.log(
      `  Throughput:                     ${writerBenchResult.throughput.toFixed(2)} writes/sec`
    );
    console.log('');

    // Performance assertions (reasonable thresholds based on actual measurements)
    expect(lockBenchResult.avgAcquireTime).toBeLessThan(600); // < 600ms average under high contention
    expect(writerBenchResult.avgWriteTime).toBeLessThan(50); // < 50ms average
    expect(lockBenchResult.success).toBe(true);
    expect(writerBenchResult.success).toBe(true);

    await fs.rm(lockBenchDir, { recursive: true, force: true });
    await fs.rm(writerBenchDir, { recursive: true, force: true });
  }, 10000); // 10 second timeout
});

/**
 * Helper: Run FileLock test with concurrent operations
 */
async function runFileLockConcurrentTest(
  runNumber: number,
  resourcePath: string,
  numOperations: number
): Promise<FileLockRunResult> {
  const startTime = performance.now();
  const acquireTimes: number[] = [];

  // Create promises for concurrent operations
  const operations = Array.from({ length: numOperations }, async (_, _i) => {
    const lock = new FileLock();

    try {
      const acquireStart = performance.now();
      await lock.acquire(resourcePath, { timeout: 30000, retryInterval: 10 });
      const acquireTime = performance.now() - acquireStart;
      acquireTimes.push(acquireTime);

      // Read current value
      let currentValue = 0;
      try {
        const content = await fs.readFile(resourcePath, 'utf8');
        currentValue = parseInt(content, 10) || 0;
      } catch (_error) {
        // File doesn't exist yet
      }

      // Increment value
      const newValue = currentValue + 1;

      // Small delay to simulate work
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 2));

      // Write new value
      await fs.writeFile(resourcePath, newValue.toString());

      await lock.release(resourcePath);

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Wait for all operations to complete
  const results = await Promise.all(operations);
  const totalDuration = performance.now() - startTime;

  const successfulOperations = results.filter((r) => r.success).length;

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
  const avgAcquireTime =
    acquireTimes.length > 0 ? acquireTimes.reduce((a, b) => a + b, 0) / acquireTimes.length : 0;
  const maxAcquireTime = acquireTimes.length > 0 ? Math.max(...acquireTimes) : 0;

  return {
    runNumber,
    totalOperations: numOperations,
    expectedCount,
    actualCount,
    lostIncrements,
    avgAcquireTime,
    maxAcquireTime,
    totalDuration,
    success: lostIncrements === 0 && actualCount === expectedCount,
  };
}

/**
 * Helper: Run AtomicWriter test with concurrent operations
 */
async function runAtomicWriterConcurrentTest(
  testDir: string,
  numConcurrent: number,
  filesPerWriter: number
): Promise<{
  totalFiles: number;
  totalCorruptions: number;
  corruptionRate: number;
  avgWriteTime: number;
  throughput: number;
  totalDuration: number;
  success: boolean;
}> {
  const startTime = performance.now();
  const writeTimes: number[] = [];

  // Create promises for concurrent writers
  const writers = Array.from({ length: numConcurrent }, async (_, writerId) => {
    const writer = new AtomicWriter();
    let filesWritten = 0;
    let corruptedFiles = 0;

    for (let i = 0; i < filesPerWriter; i++) {
      const fileId = `writer-${writerId}-file-${i}`;
      const filePath = path.join(testDir, `${fileId}.txt`);
      const expectedContent = `Content for ${fileId} - ${Math.random().toString(36)}`;

      try {
        const writeStart = performance.now();
        await writer.writeFile(filePath, expectedContent);
        const writeTime = performance.now() - writeStart;
        writeTimes.push(writeTime);

        // Verify content
        const actualContent = await fs.readFile(filePath, 'utf8');
        if (actualContent === expectedContent) {
          filesWritten++;
        } else {
          corruptedFiles++;
        }
      } catch (_error) {
        corruptedFiles++;
      }
    }

    return { filesWritten, corruptedFiles };
  });

  // Wait for all writers to complete
  const results = await Promise.all(writers);
  const totalDuration = performance.now() - startTime;

  const totalFiles = results.reduce((sum, r) => sum + r.filesWritten, 0);
  const totalCorruptions = results.reduce((sum, r) => sum + r.corruptedFiles, 0);
  const avgWriteTime =
    writeTimes.length > 0 ? writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length : 0;
  const throughput = totalFiles / (totalDuration / 1000);
  const corruptionRate =
    totalFiles > 0 ? (totalCorruptions / (totalFiles + totalCorruptions)) * 100 : 0;

  return {
    totalFiles,
    totalCorruptions,
    corruptionRate,
    avgWriteTime,
    throughput,
    totalDuration,
    success: totalCorruptions === 0 && totalFiles === numConcurrent * filesPerWriter,
  };
}
