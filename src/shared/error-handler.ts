/**
 * Error severity levels
 */
export enum ErrorSeverity {
  /** Critical error that prevents system operation */
  CRITICAL = "critical",
  /** High severity error that affects major functionality */
  HIGH = "high",
  /** Medium severity error that affects some functionality */
  MEDIUM = "medium",
  /** Low severity error or warning */
  LOW = "low",
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  /** File system related errors */
  FILE_SYSTEM = "file_system",
  /** Validation errors */
  VALIDATION = "validation",
  /** Lock acquisition/concurrency errors */
  CONCURRENCY = "concurrency",
  /** Network/API errors */
  NETWORK = "network",
  /** Data parsing errors */
  PARSING = "parsing",
  /** General operational errors */
  OPERATIONAL = "operational",
}

/**
 * Standard error codes for programmatic retry decisions
 */
export enum ErrorCode {
  // Retryable errors
  TIMEOUT = "ERR_TIMEOUT",
  BUSY = "ERR_BUSY",
  UNAVAILABLE = "ERR_UNAVAILABLE",
  NETWORK = "ERR_NETWORK",

  // Non-retryable errors
  INVALID_INPUT = "ERR_INVALID_INPUT",
  NOT_FOUND = "ERR_NOT_FOUND",
  FORBIDDEN = "ERR_FORBIDDEN",
  UNAUTHORIZED = "ERR_UNAUTHORIZED",
  CONFLICT = "ERR_CONFLICT",
}

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  /** Error message */
  message: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Error category */
  category: ErrorCategory;
  /** Error code for programmatic handling */
  code?: string;
  /** Context information */
  context?: Record<string, unknown>;
  /** Original error if this is a wrapped error */
  cause?: Error;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Suggested fix or remediation */
  fix?: string;
  /** Suggested next command or action */
  next?: string;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result value if successful */
  value?: T;
  /** Error if operation failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
}

/**
 * ErrorHandler provides structured error handling with retry logic,
 * error classification, and recovery strategies.
 *
 * Features:
 * - Exponential backoff retry logic
 * - Error classification and severity
 * - Structured error formatting
 * - Context preservation
 * - Remediation suggestions
 *
 * @example
 * ```typescript
 * const handler = new ErrorHandler();
 *
 * // With automatic retry
 * const result = await handler.withRetry(
 *   async () => await riskyOperation(),
 *   { maxRetries: 3 }
 * );
 *
 * // Manual error handling
 * try {
 *   await operation();
 * } catch (error) {
 *   const errorInfo = handler.createError({
 *     message: 'Operation failed',
 *     severity: ErrorSeverity.HIGH,
 *     category: ErrorCategory.OPERATIONAL,
 *     cause: error instanceof Error ? error : undefined
 *   });
 *   handler.logError(errorInfo);
 * }
 * ```
 */
export class ErrorHandler {
  private readonly defaultMaxRetries: number = 3;
  private readonly defaultInitialDelay: number = 1000;
  private readonly defaultMaxDelay: number = 10000;
  private readonly defaultBackoffMultiplier: number = 2;

  /**
   * Executes a function with automatic retry logic using exponential backoff.
   *
   * @param fn - The async function to execute
   * @param options - Retry configuration options
   * @returns Promise that resolves to a RetryResult
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<RetryResult<T>> {
    const maxRetries = options.maxRetries ?? this.defaultMaxRetries;
    const initialDelay = options.initialDelay ?? this.defaultInitialDelay;
    const maxDelay = options.maxDelay ?? this.defaultMaxDelay;
    const backoffMultiplier =
      options.backoffMultiplier ?? this.defaultBackoffMultiplier;
    const isRetryable =
      options.isRetryable ?? this.defaultIsRetryable.bind(this);

    let lastError: Error | undefined;
    let attempts = 0;

    while (attempts <= maxRetries) {
      attempts++;

      try {
        const value = await fn();
        return {
          success: true,
          value,
          attempts,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this is the last attempt or error is not retryable, don't retry
        if (attempts > maxRetries || !isRetryable(lastError)) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const exponentialDelay =
          initialDelay * backoffMultiplier ** (attempts - 1);
        const cappedDelay = Math.min(exponentialDelay, maxDelay);
        // Add jitter: random value between 0 and 25% of the delay
        const jitter = Math.random() * 0.25 * cappedDelay;
        const delay = cappedDelay + jitter;

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      ...(lastError && { error: lastError }),
      attempts,
    };
  }

  /**
   * Creates a structured error information object.
   *
   * @param error - Error details
   * @returns Structured error information
   */
  createError(error: Partial<ErrorInfo> & { message: string }): ErrorInfo {
    return {
      message: error.message,
      severity: error.severity ?? ErrorSeverity.MEDIUM,
      category: error.category ?? ErrorCategory.OPERATIONAL,
      timestamp: new Date().toISOString(),
      ...(error.code && { code: error.code }),
      ...(error.context && { context: error.context }),
      ...(error.cause && { cause: error.cause }),
      ...(error.fix && { fix: error.fix }),
      ...(error.next && { next: error.next }),
    };
  }

  /**
   * Formats an error for display or logging.
   * Uses the format: [STAGE] Error: <what> | Fix: <how> | Next: <command>
   *
   * @param error - Error information to format
   * @param stage - Optional stage/component name
   * @returns Formatted error string
   */
  formatError(error: ErrorInfo, stage?: string): string {
    const parts: string[] = [];

    // Stage prefix
    if (stage) {
      parts.push(`[${stage.toUpperCase()}]`);
    }

    // Category prefix
    parts.push(`[${error.category.toUpperCase()}]`);

    // Main error message
    parts.push(`Error: ${error.message}`);

    // Add fix suggestion if available
    if (error.fix) {
      parts.push(`Fix: ${error.fix}`);
    }

    // Add next action if available
    if (error.next) {
      parts.push(`Next: ${error.next}`);
    }

    // Add context if in development mode
    if (error.context && Object.keys(error.context).length > 0) {
      parts.push(`Context: ${JSON.stringify(error.context)}`);
    }

    return parts.join(" | ");
  }

  /**
   * Logs an error to the console with appropriate formatting.
   *
   * @param error - Error information to log
   * @param stage - Optional stage/component name
   */
  logError(error: ErrorInfo, stage?: string): void {
    const formatted = this.formatError(error, stage);

    // Log based on severity
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(formatted);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(formatted);
        break;
      case ErrorSeverity.LOW:
        console.log(formatted);
        break;
    }

    // Log stack trace for critical errors
    if (error.severity === ErrorSeverity.CRITICAL && error.cause) {
      console.error("Stack trace:", error.cause.stack);
    }
  }

  /**
   * Wraps an error with additional context and information.
   *
   * @param error - The original error
   * @param message - Additional context message
   * @param category - Error category
   * @param severity - Error severity
   * @returns Structured error information
   */
  wrapError(
    error: unknown,
    message: string,
    category: ErrorCategory = ErrorCategory.OPERATIONAL,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  ): ErrorInfo {
    const cause = error instanceof Error ? error : undefined;
    const errorMessage = cause ? cause.message : String(error);

    return this.createError({
      message: `${message}: ${errorMessage}`,
      severity,
      category,
      ...(cause && { cause }),
    });
  }

  /**
   * Determines if an error is retryable based on error codes or patterns.
   * Prefers error codes over message pattern matching for more reliable decisions.
   * By default, all errors are retryable unless they match non-retryable codes/patterns.
   *
   * @param error - The error to check
   * @returns True if the error is retryable
   */
  private defaultIsRetryable(error: Error): boolean {
    // Check if error has a code property (structured errors)
    // biome-ignore lint/suspicious/noExplicitAny: Node.js errors may have code property
    const errorCode = (error as any).code as string | undefined;

    if (errorCode) {
      // Use error codes for reliable retry decisions
      const nonRetryableCodes = [
        ErrorCode.INVALID_INPUT,
        ErrorCode.NOT_FOUND,
        ErrorCode.FORBIDDEN,
        ErrorCode.UNAUTHORIZED,
        ErrorCode.CONFLICT,
      ];

      const retryableCodes = [
        ErrorCode.TIMEOUT,
        ErrorCode.BUSY,
        ErrorCode.UNAVAILABLE,
        ErrorCode.NETWORK,
      ];

      if (nonRetryableCodes.includes(errorCode as ErrorCode)) {
        return false;
      }

      if (retryableCodes.includes(errorCode as ErrorCode)) {
        return true;
      }
    }

    // Fall back to message pattern matching (less reliable)
    const nonRetryablePatterns = [
      /validation/i,
      /invalid/i,
      /not found/i,
      /forbidden/i,
      /unauthorized/i,
      /bad request/i,
    ];

    const errorString = error.message.toLowerCase();
    const isNonRetryable = nonRetryablePatterns.some((pattern) =>
      pattern.test(errorString),
    );

    return !isNonRetryable;
  }

  /**
   * Creates a common error for file system operations.
   *
   * @param operation - The operation that failed (e.g., 'read', 'write')
   * @param filePath - The file path involved
   * @param cause - The original error
   * @returns Structured error information
   */
  createFileSystemError(
    operation: string,
    filePath: string,
    cause?: Error,
  ): ErrorInfo {
    return this.createError({
      message: `Failed to ${operation} file: ${filePath}`,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.FILE_SYSTEM,
      ...(cause && { cause }),
      context: { operation, filePath },
      fix: "Check file permissions and path",
      next: "Verify the file exists and is accessible",
    });
  }

  /**
   * Creates a common error for lock acquisition failures.
   *
   * @param resourcePath - The resource that couldn't be locked
   * @param timeout - The timeout that was used
   * @param cause - The original error
   * @returns Structured error information
   */
  createLockError(
    resourcePath: string,
    timeout: number,
    cause?: Error,
  ): ErrorInfo {
    return this.createError({
      message: `Lock acquisition timeout for ${resourcePath}`,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.CONCURRENCY,
      ...(cause && { cause }),
      context: { resourcePath, timeout },
      fix: "Check for stale locks",
      next: "rm .xdd/.locks/*",
    });
  }

  /**
   * Creates a common error for validation failures.
   *
   * @param field - The field that failed validation
   * @param reason - The reason for the failure
   * @returns Structured error information
   */
  createValidationError(field: string, reason: string): ErrorInfo {
    return this.createError({
      message: `Validation failed for ${field}: ${reason}`,
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.VALIDATION,
      context: { field, reason },
      fix: "Correct the input and try again",
      next: "xdd validate",
    });
  }
}
