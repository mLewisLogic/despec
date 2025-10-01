#!/usr/bin/env tsx
/**
 * Child process script that attempts to acquire lock with coordinated timing.
 * Used for concurrent lock creation testing.
 */

import fs from "node:fs/promises";
import { FileLock } from "../../../src/shared/file-lock";

interface RacerConfig {
  resourcePath: string;
  coordinationPath: string;
  workerId: number;
  timeout?: number;
}

async function main() {
  const configJson = process.env.RACER_CONFIG;
  if (!configJson) {
    console.error("RACER_CONFIG environment variable not set");
    process.exit(1);
  }

  const config: RacerConfig = JSON.parse(configJson);
  const lock = new FileLock();

  try {
    // Wait for coordination signal (all processes ready)
    const readyPath = `${config.coordinationPath}.${config.workerId}.ready`;
    await fs.writeFile(readyPath, "ready");

    // Poll for start signal
    const startSignalPath = `${config.coordinationPath}.start`;
    while (true) {
      try {
        await fs.access(startSignalPath);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    // All processes start acquiring lock simultaneously
    const acquireStart = Date.now();
    await lock.acquire(config.resourcePath, {
      timeout: config.timeout ?? 30000,
    });
    const acquireDuration = Date.now() - acquireStart;

    // Record acquisition order
    let order = 0;
    try {
      const orderContent = await fs.readFile(
        `${config.coordinationPath}.order`,
        "utf8",
      );
      order = parseInt(orderContent, 10) || 0;
    } catch {
      // File doesn't exist yet
    }
    order += 1;
    await fs.writeFile(`${config.coordinationPath}.order`, order.toString());

    // Hold lock briefly
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Release lock
    await lock.release(config.resourcePath);

    // Report results
    console.log(
      JSON.stringify({
        success: true,
        workerId: config.workerId,
        acquireDuration,
        order,
      }),
    );
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        success: false,
        workerId: config.workerId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
