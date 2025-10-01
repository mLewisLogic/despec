import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

/**
 * Test helper utilities for xdd test suite
 */

/**
 * Environment variable for stress testing
 * When STRESS_TEST=true, tests run with higher iteration counts
 */
export const STRESS_TEST = process.env.STRESS_TEST === "true";

/**
 * Get appropriate iteration count based on test mode
 */
export function getIterationCount(standard: number, stress: number): number {
  return STRESS_TEST ? stress : standard;
}

/**
 * Temporary directory manager for tests
 * Ensures isolated test environments and proper cleanup
 */
export class TempDirectory {
  private baseDir: string;
  private created: Set<string> = new Set();

  constructor(baseName: string) {
    this.baseDir = path.join("/tmp", `xdd-test-${baseName}-${nanoid(8)}`);
  }

  /**
   * Creates the temporary directory structure
   */
  async setup(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    this.created.add(this.baseDir);
  }

  /**
   * Gets the base directory path
   */
  getPath(...segments: string[]): string {
    return path.join(this.baseDir, ...segments);
  }

  /**
   * Creates a subdirectory within the temp directory
   */
  async createDir(...segments: string[]): Promise<string> {
    const dirPath = this.getPath(...segments);
    await fs.mkdir(dirPath, { recursive: true });
    this.created.add(dirPath);
    return dirPath;
  }

  /**
   * Creates a file with content in the temp directory
   */
  async createFile(content: string, ...segments: string[]): Promise<string> {
    const filePath = this.getPath(...segments);
    const dir = path.dirname(filePath);

    if (!this.created.has(dir)) {
      await fs.mkdir(dir, { recursive: true });
      this.created.add(dir);
    }

    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  }

  /**
   * Cleans up all created temporary directories
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.baseDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
      console.warn(`Failed to cleanup temp directory ${this.baseDir}:`, error);
    }
    this.created.clear();
  }
}

/**
 * Mock filesystem helpers
 */
export class MockFilesystem {
  private mocks: Map<string, string> = new Map();

  /**
   * Mock a file read operation
   */
  mockReadFile(filePath: string, content: string): void {
    this.mocks.set(filePath, content);
  }

  /**
   * Clear all mocks and restore original fs
   */
  restore(): void {
    this.mocks.clear();
  }
}

/**
 * Test timeout utilities
 */

/**
 * Creates a promise that rejects after the specified timeout
 */
export function timeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Timeout after ${ms}ms`));
    }, ms);
  });
}

/**
 * Races a promise against a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  return Promise.race([promise, timeout(ms, message)]);
}

/**
 * Waits for a condition to become true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {},
): Promise<void> {
  const {
    timeout: timeoutMs = 5000,
    interval = 100,
    message = "Condition not met",
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`${message} (timeout: ${timeoutMs}ms)`);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process spawning helpers
 */

/**
 * Result from a spawned process
 */
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Spawns a child process and waits for completion
 */
export async function spawnProcess(
  command: string,
  args: string[],
  options: {
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
  } = {},
): Promise<ProcessResult> {
  const { spawn } = await import("node:child_process");
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeoutHandle = options.timeout
      ? setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`Process timeout after ${options.timeout}ms`));
        }, options.timeout)
      : null;

    child.on("error", (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        exitCode: exitCode ?? -1,
        stdout,
        stderr,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Performance measurement utilities
 */

/**
 * Measures execution time of a function
 */
export async function measureTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();
  const result = await fn();
  const duration = Date.now() - startTime;
  return { result, duration };
}

/**
 * Creates a simple performance tracker
 */
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();

  record(name: string, duration: number): void {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)?.push(duration);
  }

  getStats(
    name: string,
  ): { min: number; max: number; avg: number; count: number } | null {
    const values = this.measurements.get(name);
    if (!values || values.length === 0) return null;

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    };
  }

  clear(): void {
    this.measurements.clear();
  }
}

/**
 * Assertion helpers
 */

/**
 * Asserts that a promise eventually resolves
 */
export async function eventuallyResolves<T>(
  fn: () => Promise<T>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {},
): Promise<T> {
  const {
    timeout: timeoutMs = 5000,
    interval = 100,
    message = "Promise did not resolve",
  } = options;

  const startTime = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      await sleep(interval);
    }
  }

  throw new Error(`${message}: ${lastError?.message || "Unknown error"}`);
}
