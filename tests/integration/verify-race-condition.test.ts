import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getIterationCount } from "../utils/test-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join("/tmp", "despec-race-test");

interface WorkerResult {
  success: boolean;
  result?: {
    workerId: number;
    successCount: number;
    values: number[];
  };
  error?: string;
}

describe("Race Condition Verification", () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should verify if FileLock has race conditions", async () => {
    const resourcePath = path.join(TEST_DIR, "counter.txt");
    // Reduced for faster standard tests
    const numWorkers = getIterationCount(5, 10);
    const incrementsPerWorker = getIterationCount(10, 20);

    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const { FileLock } = require('${path.resolve(__dirname, "../../dist/shared/file-lock.cjs")}');
      const fs = require('fs/promises');

      async function run() {
        const lock = new FileLock();
        const { resourcePath, workerId, increments } = workerData;
        let successCount = 0;
        const values = [];

        for (let i = 0; i < increments; i++) {
          try {
            await lock.acquire(resourcePath, { timeout: 10000, retryInterval: 5 });

            // Read
            let currentValue = 0;
            try {
              const content = await fs.readFile(resourcePath, 'utf8');
              currentValue = parseInt(content, 10) || 0;
            } catch (error) {
              // File doesn't exist yet
            }

            // Add delay to increase chance of race conditions
            await new Promise(resolve => setTimeout(resolve, 1));

            // Increment
            const newValue = currentValue + 1;

            // Write
            await fs.writeFile(resourcePath, newValue.toString());
            values.push(newValue);

            await lock.release(resourcePath);
            successCount++;
          } catch (error) {
            console.error(\`Worker \${workerId} operation \${i} failed: \${error.message}\`);
          }
        }

        return { workerId, successCount, values };
      }

      run().then(result => {
        parentPort.postMessage({ success: true, result });
      }).catch(error => {
        parentPort.postMessage({ success: false, error: error.message });
      });
    `;

    const workers = [];
    const workerPromises = [];

    console.log(`Testing with ${numWorkers} workers, ${incrementsPerWorker} increments each...`);
    console.log(`Expected final value: ${numWorkers * incrementsPerWorker}`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          resourcePath,
          workerId: i,
          increments: incrementsPerWorker,
        },
      });

      workers.push(worker);
      workerPromises.push(
        new Promise((resolve, reject) => {
          worker.on("message", resolve);
          worker.on("error", reject);
        }),
      );
    }

    const results = (await Promise.all(workerPromises)) as WorkerResult[];

    // Check final value
    const finalValue = parseInt(await fs.readFile(resourcePath, "utf8"), 10);

    // Analyze results
    let totalSuccess = 0;
    const allValues: number[] = [];

    for (const r of results) {
      if (r.success && r.result) {
        totalSuccess += r.result.successCount;
        allValues.push(...r.result.values);
      }
    }

    // Check for duplicate values (indicates race conditions)
    const uniqueValues = new Set(allValues);
    const duplicates = allValues.length - uniqueValues.size;

    console.log(`\nResults:`);
    console.log(`Final counter value: ${finalValue}`);
    console.log(`Total successful increments: ${totalSuccess}`);
    console.log(`Total values recorded: ${allValues.length}`);
    console.log(`Unique values: ${uniqueValues.size}`);
    console.log(`Duplicate values: ${duplicates}`);

    // Find missing values
    const missing = [];
    for (let i = 1; i <= numWorkers * incrementsPerWorker; i++) {
      if (!uniqueValues.has(i)) {
        missing.push(i);
      }
    }
    if (missing.length > 0) {
      console.log(`Missing values: ${missing.join(", ")}`);
    }

    // The final value should match the expected count
    expect(finalValue).toBe(numWorkers * incrementsPerWorker);
    expect(duplicates).toBe(0);

    // Cleanup
    for (const worker of workers) {
      await worker.terminate();
    }
  }, 30000);

  it("should test AtomicWriter for data corruption", async () => {
    const testFile = path.join(TEST_DIR, "atomic-test.txt");
    const numWorkers = 10;
    const writesPerWorker = 20;

    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const { AtomicWriter } = require('${path.resolve(__dirname, "../../dist/shared/atomic-writer.cjs")}');
      const fs = require('fs/promises');

      async function run() {
        const writer = new AtomicWriter();
        const { filePath, workerId, writes } = workerData;
        const writtenValues = [];

        for (let i = 0; i < writes; i++) {
          const content = \`Worker-\${workerId}-Write-\${i}-\${Date.now()}\`;
          try {
            await writer.writeFile(filePath, content);

            // Read back immediately to verify
            const readBack = await fs.readFile(filePath, 'utf8');
            writtenValues.push({
              written: content,
              readBack: readBack,
              match: content === readBack
            });

            // Small delay
            await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
          } catch (error) {
            writtenValues.push({
              written: content,
              error: error.message
            });
          }
        }

        return { workerId, writtenValues };
      }

      run().then(result => {
        parentPort.postMessage({ success: true, result });
      }).catch(error => {
        parentPort.postMessage({ success: false, error: error.message });
      });
    `;

    const workers = [];
    const workerPromises = [];

    console.log(
      `\nTesting AtomicWriter with ${numWorkers} workers, ${writesPerWorker} writes each...`,
    );

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          filePath: testFile,
          workerId: i,
          writes: writesPerWorker,
        },
      });

      workers.push(worker);
      workerPromises.push(
        new Promise((resolve, reject) => {
          worker.on("message", resolve);
          worker.on("error", reject);
        }),
      );
    }

    const results = (await Promise.all(workerPromises)) as WorkerResult[];

    // Check final file content
    const finalContent = await fs.readFile(testFile, "utf8");

    // Analyze results
    let totalWrites = 0;
    let successfulWrites = 0;
    let corruptedWrites = 0;

    for (const r of results) {
      if (r.success && r.result) {
        for (const write of (r.result as any).writtenValues) {
          totalWrites++;
          if (!write.error) {
            if (write.match) {
              successfulWrites++;
            } else {
              corruptedWrites++;
              console.log(`Corruption detected: Worker ${r.result.workerId}`);
              console.log(`  Written: ${write.written}`);
              console.log(`  Read back: ${write.readBack}`);
            }
          }
        }
      }
    }

    console.log(`\nAtomicWriter Results:`);
    console.log(`Total writes attempted: ${totalWrites}`);
    console.log(`Successful writes (verified): ${successfulWrites}`);
    console.log(`Corrupted writes: ${corruptedWrites}`);
    console.log(
      `Final file content matches pattern: ${/Worker-\d+-Write-\d+-\d+/.test(finalContent)}`,
    );

    expect(corruptedWrites).toBe(0);
    expect(finalContent).toMatch(/Worker-\d+-Write-\d+-\d+/);

    // Cleanup
    for (const worker of workers) {
      await worker.terminate();
    }
  }, 30000);
});
