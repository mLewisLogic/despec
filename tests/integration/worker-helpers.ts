import { Worker } from "node:worker_threads";

/**
 * Helper to create a worker that runs TypeScript code
 */
export function createWorker(code: string, workerData: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(code, {
      eval: true,
      workerData,
    });

    worker.on("message", (message) => {
      worker.terminate();
      resolve(message);
    });

    worker.on("error", (error) => {
      worker.terminate();
      reject(error);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Performance metrics collector
 */
export class PerformanceMetrics {
  private metrics: Map<string, number[]> = new Map();

  record(name: string, value: number): void {
    const values = this.metrics.get(name) || [];
    values.push(value);
    this.metrics.set(name, values);
  }

  getStats(name: string): {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
    stddev: number;
  } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    // biome-ignore lint/style/noNonNullAssertion: Array is guaranteed non-empty by function precondition
    const min = sorted[0]!;
    // biome-ignore lint/style/noNonNullAssertion: Array is guaranteed non-empty by function precondition
    const max = sorted[count - 1]!;
    const mean = sorted.reduce((a, b) => a + b, 0) / count;

    const median =
      count % 2 === 0
        ? // biome-ignore lint/style/noNonNullAssertion: Array access is guaranteed by count calculations
          (sorted[count / 2 - 1]! + sorted[count / 2]!) / 2
        : // biome-ignore lint/style/noNonNullAssertion: Array access is guaranteed by count calculations
          sorted[Math.floor(count / 2)]!;

    // biome-ignore lint/style/noNonNullAssertion: Percentile calculations are guaranteed within array bounds
    const p95 = sorted[Math.floor(count * 0.95)]!;
    // biome-ignore lint/style/noNonNullAssertion: Percentile calculations are guaranteed within array bounds
    const p99 = sorted[Math.floor(count * 0.99)]!;

    const variance =
      sorted.reduce((sum, val) => {
        const diff = val - mean;
        return sum + diff * diff;
      }, 0) / count;
    const stddev = Math.sqrt(variance);

    return { count, min, max, mean, median, p95, p99, stddev };
  }

  printSummary(name: string): void {
    const stats = this.getStats(name);
    if (!stats) {
      console.log(`No metrics recorded for: ${name}`);
      return;
    }

    console.log(`\n=== ${name} Performance Metrics ===`);
    console.log(`Count:   ${stats.count}`);
    console.log(`Min:     ${stats.min.toFixed(2)}ms`);
    console.log(`Max:     ${stats.max.toFixed(2)}ms`);
    console.log(`Mean:    ${stats.mean.toFixed(2)}ms`);
    console.log(`Median:  ${stats.median.toFixed(2)}ms`);
    console.log(`P95:     ${stats.p95.toFixed(2)}ms`);
    console.log(`P99:     ${stats.p99.toFixed(2)}ms`);
    console.log(`Std Dev: ${stats.stddev.toFixed(2)}ms`);
  }

  getAllMetrics(): Map<string, any> {
    const result = new Map();
    for (const [name, _] of this.metrics) {
      result.set(name, this.getStats(name));
    }
    return result;
  }
}

/**
 * Stress test configuration
 */
export interface StressTestConfig {
  numWorkers: number;
  operationsPerWorker: number;
  concurrencyLevel: "low" | "medium" | "high";
  resourcePath: string;
}

/**
 * Generate stress test scenarios
 */
export function generateStressScenarios(
  baseConfig: Partial<StressTestConfig>,
): StressTestConfig[] {
  const scenarios: StressTestConfig[] = [];
  const workerCounts = [1, 5, 10, 20, 50];
  const operationCounts = [10, 50, 100];

  for (const workers of workerCounts) {
    for (const operations of operationCounts) {
      scenarios.push({
        numWorkers: workers,
        operationsPerWorker: operations,
        concurrencyLevel:
          workers <= 5 ? "low" : workers <= 20 ? "medium" : "high",
        resourcePath: baseConfig.resourcePath || "/tmp/stress-test",
        ...baseConfig,
      });
    }
  }

  return scenarios;
}
