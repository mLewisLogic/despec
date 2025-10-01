import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Enable parallel execution for better performance
    pool: "threads",
    poolOptions: {
      threads: {},
    },

    // Test file patterns
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "coverage"],

    // Timeout configuration
    testTimeout: 30000, // 30 seconds for normal tests
    hookTimeout: 10000, // 10 seconds for hooks

    // Coverage configuration
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/types/**", "dist/**", "coverage/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Environment
    environment: "node",

    // Reporters
    reporters: process.env.CI ? ["verbose", "json"] : ["default"],

    // Globals
    globals: false,

    // Retry configuration for flaky multi-process tests
    retry: process.env.CI ? 2 : 0,

    // Separate slow tests using test name patterns
    slowTestThreshold: 5000, // 5 seconds
  },
});
