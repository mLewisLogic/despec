#!/usr/bin/env tsx
/**
 * Child process script that acquires and holds a lock.
 * Used for process kill testing.
 */

import { FileLock } from "../../../src/shared/file-lock";

interface HolderConfig {
  resourcePath: string;
  holdDuration: number;
  timeout?: number;
}

async function main() {
  const configJson = process.env.HOLDER_CONFIG;
  if (!configJson) {
    console.error("HOLDER_CONFIG environment variable not set");
    process.exit(1);
  }

  const config: HolderConfig = JSON.parse(configJson);
  const lock = new FileLock();

  try {
    // Acquire lock
    await lock.acquire(config.resourcePath, {
      timeout: config.timeout ?? 5000,
    });

    // Report that we've acquired the lock
    console.log(JSON.stringify({ acquired: true, pid: process.pid }));

    // Hold the lock for specified duration (or forever if negative)
    if (config.holdDuration > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.holdDuration));
      await lock.release(config.resourcePath);
      console.log(JSON.stringify({ released: true }));
    } else {
      // Hold forever (until killed)
      await new Promise(() => {}); // Never resolves
    }
  } catch (error) {
    console.error(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
