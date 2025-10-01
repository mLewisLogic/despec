import { describe, expect, test } from "bun:test";
import {
  ErrorCategory,
  ErrorHandler,
  ErrorSeverity,
} from "../../../src/shared/error-handler.js";

describe("ErrorHandler", () => {
  const handler = new ErrorHandler();

  describe("withRetry", () => {
    test("succeeds on first attempt", async () => {
      let attempts = 0;
      const result = await handler.withRetry(async () => {
        attempts++;
        return "success";
      });

      expect(result.success).toBe(true);
      expect(result.value).toBe("success");
      expect(result.attempts).toBe(1);
      expect(attempts).toBe(1);
    });

    test("retries on failure and succeeds", async () => {
      let attempts = 0;
      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("Temporary failure");
          }
          return "success";
        },
        { maxRetries: 3, initialDelay: 10 },
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe("success");
      expect(result.attempts).toBe(3);
      expect(attempts).toBe(3);
    });

    test("fails after max retries", async () => {
      let attempts = 0;
      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error("Permanent failure");
        },
        { maxRetries: 2, initialDelay: 10 },
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Permanent failure");
      expect(result.attempts).toBe(3); // initial + 2 retries
      expect(attempts).toBe(3);
    });

    test("respects custom isRetryable function", async () => {
      let attempts = 0;
      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error("Non-retryable");
        },
        {
          maxRetries: 3,
          initialDelay: 10,
          isRetryable: (_error) => false, // Never retry
        },
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // No retries
      expect(attempts).toBe(1);
    });

    test("uses exponential backoff", async () => {
      const startTime = Date.now();
      let attempts = 0;

      await handler.withRetry(
        async () => {
          attempts++;
          if (attempts <= 3) {
            throw new Error("ETIMEDOUT");
          }
          return "success";
        },
        {
          maxRetries: 3,
          initialDelay: 100,
          backoffMultiplier: 2,
        },
      );

      const elapsed = Date.now() - startTime;
      // Should be approximately: 100 + 200 + 400 = 700ms
      expect(elapsed).toBeGreaterThanOrEqual(600);
      expect(elapsed).toBeLessThan(1000);
    });

    test("respects max delay", async () => {
      const startTime = Date.now();
      let attempts = 0;

      await handler.withRetry(
        async () => {
          attempts++;
          if (attempts <= 3) {
            throw new Error("ETIMEDOUT");
          }
          return "success";
        },
        {
          maxRetries: 3,
          initialDelay: 100,
          backoffMultiplier: 10,
          maxDelay: 150,
        },
      );

      const elapsed = Date.now() - startTime;
      // Delays should be capped: 100, 150, 150 = 400ms
      expect(elapsed).toBeGreaterThanOrEqual(350);
      expect(elapsed).toBeLessThan(600);
    });

    test("default isRetryable recognizes common retryable errors", async () => {
      const retryableErrors = [
        "EBUSY",
        "EAGAIN",
        "ETIMEDOUT",
        "ECONNRESET",
        "ECONNREFUSED",
        "Operation timeout",
        "Temporary failure",
        "Unknown error",
      ];

      for (const errorMsg of retryableErrors) {
        let attempts = 0;
        const result = await handler.withRetry(
          async () => {
            attempts++;
            if (attempts < 2) {
              throw new Error(errorMsg);
            }
            return "success";
          },
          { maxRetries: 2, initialDelay: 10 },
        );

        expect(result.success).toBe(true);
        expect(attempts).toBe(2); // Should have retried
      }
    });

    test("default isRetryable does not retry validation errors", async () => {
      let attempts = 0;
      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error("Validation failed");
        },
        { maxRetries: 2, initialDelay: 10 },
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1); // Should not retry validation errors
    });
  });

  describe("createError", () => {
    test("creates error with all fields", () => {
      const cause = new Error("Original error");
      const error = handler.createError({
        message: "Test error",
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.FILE_SYSTEM,
        code: "TEST_001",
        context: { file: "test.txt" },
        cause,
        fix: "Fix it",
        next: "Try again",
      });

      expect(error.message).toBe("Test error");
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(error.code).toBe("TEST_001");
      expect(error.context).toEqual({ file: "test.txt" });
      expect(error.cause).toBe(cause);
      expect(error.fix).toBe("Fix it");
      expect(error.next).toBe("Try again");
      expect(error.timestamp).toBeDefined();
    });

    test("creates error with defaults", () => {
      const error = handler.createError({
        message: "Simple error",
      });

      expect(error.message).toBe("Simple error");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.OPERATIONAL);
    });
  });

  describe("formatError", () => {
    test("formats error with all components", () => {
      const error = handler.createError({
        message: "Test error",
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.FILE_SYSTEM,
        fix: "Check permissions",
        next: "retry command",
      });

      const formatted = handler.formatError(error, "SPECS");

      expect(formatted).toContain("[SPECS]");
      expect(formatted).toContain("[FILE_SYSTEM]");
      expect(formatted).toContain("Error: Test error");
      expect(formatted).toContain("Fix: Check permissions");
      expect(formatted).toContain("Next: retry command");
    });

    test("formats error without optional stage", () => {
      const error = handler.createError({
        message: "Test error",
        category: ErrorCategory.VALIDATION,
      });

      const formatted = handler.formatError(error);

      expect(formatted).toContain("[VALIDATION]");
      expect(formatted).toContain("Error: Test error");
      expect(formatted).not.toContain("[SPECS]");
    });

    test("includes context when available", () => {
      const error = handler.createError({
        message: "Test error",
        category: ErrorCategory.OPERATIONAL,
        context: { file: "test.txt", line: 42 },
      });

      const formatted = handler.formatError(error);

      expect(formatted).toContain("Context:");
      expect(formatted).toContain('"file":"test.txt"');
      expect(formatted).toContain('"line":42');
    });
  });

  describe("wrapError", () => {
    test("wraps Error instance", () => {
      const original = new Error("Original error");
      const wrapped = handler.wrapError(
        original,
        "Operation failed",
        ErrorCategory.FILE_SYSTEM,
        ErrorSeverity.HIGH,
      );

      expect(wrapped.message).toBe("Operation failed: Original error");
      expect(wrapped.severity).toBe(ErrorSeverity.HIGH);
      expect(wrapped.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(wrapped.cause).toBe(original);
    });

    test("wraps non-Error value", () => {
      const wrapped = handler.wrapError(
        "String error",
        "Operation failed",
        ErrorCategory.OPERATIONAL,
      );

      expect(wrapped.message).toBe("Operation failed: String error");
      expect(wrapped.cause).toBeUndefined();
    });

    test("uses default severity and category", () => {
      const wrapped = handler.wrapError(new Error("Test"), "Failed");

      expect(wrapped.severity).toBe(ErrorSeverity.MEDIUM);
      expect(wrapped.category).toBe(ErrorCategory.OPERATIONAL);
    });
  });

  describe("createFileSystemError", () => {
    test("creates file system error with context", () => {
      const error = handler.createFileSystemError("read", "/path/to/file.txt");

      expect(error.message).toContain("Failed to read file");
      expect(error.message).toContain("/path/to/file.txt");
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(error.context).toEqual({
        operation: "read",
        filePath: "/path/to/file.txt",
      });
      expect(error.fix).toBeDefined();
      expect(error.next).toBeDefined();
    });

    test("includes cause when provided", () => {
      const cause = new Error("ENOENT");
      const error = handler.createFileSystemError(
        "write",
        "/path/to/file.txt",
        cause,
      );

      expect(error.cause).toBe(cause);
    });
  });

  describe("createLockError", () => {
    test("creates lock error with context", () => {
      const error = handler.createLockError("/path/to/resource", 5000);

      expect(error.message).toContain("Lock acquisition timeout");
      expect(error.message).toContain("/path/to/resource");
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.CONCURRENCY);
      expect(error.context).toEqual({
        resourcePath: "/path/to/resource",
        timeout: 5000,
      });
      expect(error.fix).toContain("stale locks");
      expect(error.next).toContain("rm .xdd/.locks/*");
    });
  });

  describe("createValidationError", () => {
    test("creates validation error with context", () => {
      const error = handler.createValidationError(
        "username",
        "must be alphanumeric",
      );

      expect(error.message).toContain("Validation failed for username");
      expect(error.message).toContain("must be alphanumeric");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.context).toEqual({
        field: "username",
        reason: "must be alphanumeric",
      });
      expect(error.fix).toBeDefined();
      expect(error.next).toContain("xdd validate");
    });
  });
});
