#!/usr/bin/env tsx
/**
 * Child process script that acquires lock, increments counter, and reports results.
 * Used for multi-process lock contention testing.
 */

import fs from 'node:fs/promises';
import { FileLock } from '../../../src/shared/file-lock';

interface WorkerConfig {
  resourcePath: string;
  counterPath: string;
  workerId: number;
  iterations: number;
  timeout?: number;
  retryInterval?: number;
}

interface OperationResult {
  success: boolean;
  operation: number;
  waitDuration?: number;
  holdDuration?: number;
  totalDuration?: number;
  value?: number;
  error?: string;
}

async function main() {
  const configJson = process.env.WORKER_CONFIG;
  if (!configJson) {
    console.error('WORKER_CONFIG environment variable not set');
    process.exit(1);
  }

  const config: WorkerConfig = JSON.parse(configJson);
  const lock = new FileLock();
  const results: OperationResult[] = [];

  for (let i = 0; i < config.iterations; i++) {
    const startTime = Date.now();
    let acquired = false;
    let holdDuration = 0;
    let waitDuration = 0;

    try {
      // Try to acquire lock
      const acquireStart = Date.now();
      await lock.acquire(config.resourcePath, {
        timeout: config.timeout ?? 10000,
        retryInterval: config.retryInterval ?? 100,
      });
      waitDuration = Date.now() - acquireStart;
      acquired = true;

      // Critical section - read, modify, write
      const holdStart = Date.now();

      // Read current value
      let currentValue = 0;
      try {
        const content = await fs.readFile(config.counterPath, 'utf8');
        currentValue = parseInt(content, 10) || 0;
      } catch (_error) {
        // File doesn't exist yet
      }

      // Increment value
      const newValue = currentValue + 1;

      // Simulate some work (random delay to increase contention)
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

      // Write new value
      await fs.writeFile(config.counterPath, newValue.toString());

      holdDuration = Date.now() - holdStart;

      // Release lock
      await lock.release(config.resourcePath);

      results.push({
        success: true,
        operation: i,
        waitDuration,
        holdDuration,
        totalDuration: Date.now() - startTime,
        value: newValue,
      });
    } catch (error) {
      results.push({
        success: false,
        operation: i,
        error: error instanceof Error ? error.message : String(error),
        waitDuration,
      });

      if (acquired) {
        await lock.release(config.resourcePath).catch(() => {});
      }
    }
  }

  // Output results as JSON to stdout
  console.log(JSON.stringify({ workerId: config.workerId, results }));
  process.exit(0);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
