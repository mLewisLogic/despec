import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { getIterationCount } from "../utils/test-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join("/tmp", "xdd-concurrent-tests", "atomic-writer");

describe("AtomicWriter - Concurrent Access Tests", () => {
  beforeEach(async () => {
    // Clean up and create test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should handle multiple processes writing to the same file without corruption", async () => {
    const testFile = path.join(TEST_DIR, "concurrent-test.txt");
    // Reduced iterations for faster standard tests, full load for stress tests
    const numWorkers = getIterationCount(5, 20);
    const writesPerWorker = getIterationCount(10, 50);

    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const { AtomicWriter } = require('${path.resolve(__dirname, "../../dist/shared/atomic-writer.cjs")}');

      async function run() {
        const writer = new AtomicWriter();
        const { filePath, workerId, writesCount } = workerData;
        const results = [];

        for (let i = 0; i < writesCount; i++) {
          const content = \`Worker-\${workerId}-Write-\${i}\\n\`;
          const startTime = Date.now();

          try {
            await writer.writeFile(filePath, content);
            results.push({
              success: true,
              duration: Date.now() - startTime,
              attempt: i,
              workerId
            });
          } catch (error) {
            results.push({
              success: false,
              error: error.message,
              attempt: i,
              workerId
            });
          }

          // Small random delay to increase concurrency chances
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
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
    const workerPromises: Promise<any>[] = [];

    console.log(
      `Starting ${numWorkers} workers, each performing ${writesPerWorker} writes...`,
    );
    const startTime = performance.now();

    // Create and start workers
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          filePath: testFile,
          workerId: i,
          writesCount: writesPerWorker,
        },
      });

      workers.push(worker);

      const promise = new Promise((resolve, reject) => {
        worker.on("message", resolve);
        worker.on("error", reject);
      });

      workerPromises.push(promise);
    }

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);
    const totalDuration = performance.now() - startTime;

    // Analyze results
    let totalWrites = 0;
    let successfulWrites = 0;
    let failedWrites = 0;
    const writeDurations: number[] = [];

    for (const workerResult of results) {
      expect(workerResult.success).toBe(true);
      if (workerResult.results) {
        for (const write of workerResult.results) {
          totalWrites++;
          if (write.success) {
            successfulWrites++;
            writeDurations.push(write.duration);
          } else {
            failedWrites++;
          }
        }
      }
    }

    // Verify the file exists and contains valid data
    const finalContent = await fs.readFile(testFile, "utf8");
    expect(finalContent).toBeTruthy();
    expect(finalContent).toMatch(/Worker-\d+-Write-\d+/);

    // Calculate statistics
    const avgWriteDuration =
      writeDurations.reduce((a, b) => a + b, 0) / writeDurations.length;
    const maxWriteDuration = Math.max(...writeDurations);
    const minWriteDuration = Math.min(...writeDurations);

    console.log("\n=== Concurrent AtomicWriter Performance ===");
    console.log(`Total writes attempted: ${totalWrites}`);
    console.log(`Successful writes: ${successfulWrites}`);
    console.log(`Failed writes: ${failedWrites}`);
    console.log(`Total duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average write duration: ${avgWriteDuration.toFixed(2)}ms`);
    console.log(`Min write duration: ${minWriteDuration}ms`);
    console.log(`Max write duration: ${maxWriteDuration}ms`);
    console.log(
      `Throughput: ${(totalWrites / (totalDuration / 1000)).toFixed(2)} writes/second`,
    );

    // All writes should succeed (atomic writer handles conflicts internally)
    expect(successfulWrites).toBe(totalWrites);
    expect(failedWrites).toBe(0);

    // Cleanup workers (don't await - causes hang in Bun test runner)
    for (const worker of workers) {
      worker.terminate(); // Fire and forget - awaiting hangs in Bun tests
    }
  }, 5000); // 5 second timeout

  it("should maintain data integrity with rapid concurrent writes to multiple files", async () => {
    // Reduced for faster standard tests
    const numFiles = getIterationCount(3, 10);
    const numWorkers = getIterationCount(5, 15);
    const writesPerWorker = getIterationCount(5, 20);

    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const { AtomicWriter } = require('${path.resolve(__dirname, "../../dist/shared/atomic-writer.cjs")}');

      async function run() {
        const writer = new AtomicWriter();
        const { testDir, workerId, numFiles, writesCount } = workerData;
        const results = [];

        for (let i = 0; i < writesCount; i++) {
          const fileIndex = Math.floor(Math.random() * numFiles);
          const filePath = \`\${testDir}/file-\${fileIndex}.txt\`;
          const content = \`Worker-\${workerId}-File-\${fileIndex}-Write-\${i}-\${Date.now()}\\n\`;

          try {
            await writer.writeFile(filePath, content);
            results.push({ success: true, fileIndex });
          } catch (error) {
            results.push({ success: false, error: error.message, fileIndex });
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
    const workerPromises: Promise<any>[] = [];

    console.log(
      `\nStarting ${numWorkers} workers writing to ${numFiles} files...`,
    );

    // Create and start workers
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          testDir: TEST_DIR,
          workerId: i,
          numFiles,
          writesCount: writesPerWorker,
        },
      });

      workers.push(worker);

      const promise = new Promise((resolve, reject) => {
        worker.on("message", resolve);
        worker.on("error", reject);
      });

      workerPromises.push(promise);
    }

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);

    // Verify all files were created and contain valid data
    const fileWrites: Map<number, number> = new Map();

    for (const workerResult of results) {
      expect(workerResult.success).toBe(true);
      if (workerResult.results) {
        for (const write of workerResult.results) {
          if (write.success) {
            const count = fileWrites.get(write.fileIndex) || 0;
            fileWrites.set(write.fileIndex, count + 1);
          }
        }
      }
    }

    // Check each file exists and has valid content
    for (let i = 0; i < numFiles; i++) {
      const filePath = path.join(TEST_DIR, `file-${i}.txt`);
      try {
        const content = await fs.readFile(filePath, "utf8");
        expect(content).toMatch(/Worker-\d+-File-\d+-Write-\d+-\d+/);
        console.log(`File ${i}: ${fileWrites.get(i) || 0} writes`);
      } catch (_error) {
        // Some files might not be written to if random didn't select them
        console.log(`File ${i}: not written`);
      }
    }

    // Cleanup workers (don't await - causes hang in Bun test runner)
    for (const worker of workers) {
      worker.terminate(); // Fire and forget - awaiting hangs in Bun tests
    }
  }, 5000); // 5 second timeout

  it("should handle batch writes atomically under concurrent load", async () => {
    // Reduced for faster standard tests
    const numWorkers = getIterationCount(3, 10);
    const batchSize = getIterationCount(3, 5);

    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const { AtomicWriter } = require('${path.resolve(__dirname, "../../dist/shared/atomic-writer.cjs")}');

      async function run() {
        const writer = new AtomicWriter();
        const { testDir, workerId, batchSize } = workerData;

        const files = [];
        for (let i = 0; i < batchSize; i++) {
          files.push({
            path: \`\${testDir}/batch-\${workerId}-file-\${i}.txt\`,
            content: \`Batch write from worker \${workerId}, file \${i}, timestamp: \${Date.now()}\\n\`
          });
        }

        const startTime = Date.now();
        const result = await writer.writeFilesSafe(files);
        const duration = Date.now() - startTime;

        return {
          success: result.success,
          filesWritten: result.filesWritten.length,
          duration,
          error: result.error?.message
        };
      }

      run().then(result => {
        parentPort.postMessage({ success: true, result });
      }).catch(error => {
        parentPort.postMessage({ success: false, error: error.message });
      });
    `;

    const workers: Worker[] = [];
    const workerPromises: Promise<any>[] = [];

    console.log(
      `\nStarting ${numWorkers} workers, each writing ${batchSize} files atomically...`,
    );
    const startTime = performance.now();

    // Create and start workers
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          testDir: TEST_DIR,
          workerId: i,
          batchSize,
        },
      });

      workers.push(worker);

      const promise = new Promise((resolve, reject) => {
        worker.on("message", resolve);
        worker.on("error", reject);
      });

      workerPromises.push(promise);
    }

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);
    const totalDuration = performance.now() - startTime;

    // Analyze results
    let totalFilesWritten = 0;
    const batchDurations: number[] = [];

    for (const workerResult of results) {
      expect(workerResult.success).toBe(true);
      if (workerResult.result) {
        expect(workerResult.result.success).toBe(true);
        expect(workerResult.result.filesWritten).toBe(batchSize);
        totalFilesWritten += workerResult.result.filesWritten;
        batchDurations.push(workerResult.result.duration);
      }
    }

    const avgBatchDuration =
      batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length;

    console.log("\n=== Batch AtomicWriter Performance ===");
    console.log(`Total files written: ${totalFilesWritten}`);
    console.log(`Total duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average batch duration: ${avgBatchDuration.toFixed(2)}ms`);
    console.log(
      `Throughput: ${(totalFilesWritten / (totalDuration / 1000)).toFixed(2)} files/second`,
    );

    expect(totalFilesWritten).toBe(numWorkers * batchSize);

    // Verify all files exist
    const files = await fs.readdir(TEST_DIR);
    expect(files.length).toBe(numWorkers * batchSize);

    // Cleanup workers (don't await - causes hang in Bun test runner)
    for (const worker of workers) {
      worker.terminate(); // Fire and forget - awaiting hangs in Bun tests
    }
  }, 5000); // 5 second timeout
});
