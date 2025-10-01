/**
 * Shared utilities for the despec system.
 * Provides core functionality for atomic file operations, concurrency control,
 * input validation, and error handling.
 */

export { AtomicWriter, type FileWrite, type WriteResult } from './atomic-writer.js';
export {
  ErrorCategory,
  ErrorHandler,
  type ErrorInfo,
  ErrorSeverity,
  type RetryOptions,
  type RetryResult,
} from './error-handler.js';
export {
  FileLock,
  type LockInfo,
  type LockOptions,
} from './file-lock.js';
export {
  InputValidator,
  type ValidationOptions,
  type ValidationResult,
} from './input-validator.js';
