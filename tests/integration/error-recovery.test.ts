import { beforeEach, describe, expect, test } from 'vitest';
import { ErrorHandler } from '../../src/shared/error-handler.js';

describe('ErrorHandler - Retry Logic & Recovery', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('Retry Logic with Various Failure Patterns', () => {
    test('intermittent failures - succeeds on random retry', async () => {
      let attempts = 0;
      const failPattern = [true, true, false, true, false]; // Fails 1st, 2nd, 4th attempts

      const result = await handler.withRetry(
        async () => {
          const shouldFail = failPattern[attempts];
          attempts++;
          if (shouldFail) {
            throw new Error('Intermittent failure');
          }
          return 'success';
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
      expect(attempts).toBe(3); // Failed twice, succeeded on 3rd
    });

    test('gradual recovery - increases success probability', async () => {
      let attempts = 0;
      const successProbability = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

      const result = await handler.withRetry(
        async () => {
          const threshold = successProbability[attempts] ?? 1.0;
          attempts++;
          // Always succeed when we reach high enough probability
          if (Math.random() < threshold || threshold >= 0.8) {
            return 'success';
          }
          throw new Error('Not ready yet');
        },
        { maxRetries: 10, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
      expect(attempts).toBeGreaterThan(0);
      expect(attempts).toBeLessThanOrEqual(11);
    });

    test('alternating error types', async () => {
      let attempts = 0;
      const errors = ['ETIMEDOUT', 'ECONNRESET', 'EAGAIN', 'EBUSY'];

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts <= errors.length) {
            throw new Error(errors[attempts - 1]);
          }
          return 'recovered';
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('recovered');
      expect(attempts).toBe(errors.length + 1);
    });

    test('fails fast on non-retryable error', async () => {
      let attempts = 0;
      const errors = [
        'ETIMEDOUT', // Retryable
        'Validation failed', // Non-retryable
        'ECONNRESET', // Would be retryable but shouldn't reach
      ];

      const result = await handler.withRetry(
        async () => {
          const error = errors[attempts];
          attempts++;
          throw new Error(error);
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(2); // Stopped after non-retryable error
      expect(result.error?.message).toContain('Validation failed');
    });

    test('complex retry condition - custom isRetryable', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts % 2 === 0) {
            throw new Error('EVEN_ERROR');
          }
          if (attempts < 5) {
            throw new Error('ODD_ERROR');
          }
          return 'success';
        },
        {
          maxRetries: 10,
          initialDelay: 10,
          isRetryable: (error) => error.message === 'ODD_ERROR',
        }
      );

      expect(result.success).toBe(false); // Should fail on first EVEN_ERROR
      expect(attempts).toBe(2);
    });
  });

  describe('Exponential Backoff Behavior', () => {
    test('verifies increasing delays', async () => {
      let attempts = 0;
      const attemptTimes: number[] = [];

      await handler.withRetry(
        async () => {
          attemptTimes.push(Date.now());
          attempts++;
          if (attempts < 4) {
            throw new Error('Retry me');
          }
          return 'done';
        },
        {
          maxRetries: 4,
          initialDelay: 100,
          backoffMultiplier: 2,
        }
      );

      // Calculate delays between attempts
      const delays: number[] = [];
      for (let i = 1; i < attemptTimes.length; i++) {
        delays.push(attemptTimes[i]! - attemptTimes[i - 1]!);
      }

      // Verify exponential growth: ~100ms, ~200ms, ~400ms
      expect(delays.length).toBe(3);
      expect(delays[0]).toBeGreaterThanOrEqual(90);
      expect(delays[0]).toBeLessThan(150);

      expect(delays[1]).toBeGreaterThanOrEqual(180);
      expect(delays[1]).toBeLessThan(250);

      expect(delays[2]).toBeGreaterThanOrEqual(370);
      expect(delays[2]).toBeLessThan(500);
    });

    test('verifies max delay cap is enforced', async () => {
      let attempts = 0;
      const attemptTimes: number[] = [];

      await handler.withRetry(
        async () => {
          attemptTimes.push(Date.now());
          attempts++;
          if (attempts < 5) {
            throw new Error('Retry me');
          }
          return 'done';
        },
        {
          maxRetries: 5,
          initialDelay: 100,
          backoffMultiplier: 3,
          maxDelay: 200,
        }
      );

      const delays: number[] = [];
      for (let i = 1; i < attemptTimes.length; i++) {
        delays.push(attemptTimes[i]! - attemptTimes[i - 1]!);
      }

      // All delays should be capped at ~200ms
      // First: 100ms, Second: 200ms (would be 300), Third: 200ms (would be 900), etc.
      expect(delays[0]).toBeGreaterThanOrEqual(90);
      expect(delays[0]).toBeLessThan(150);

      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThanOrEqual(180);
        expect(delays[i]).toBeLessThanOrEqual(250);
      }
    });

    test('verifies backoff with multiplier 1 (constant delay)', async () => {
      let attempts = 0;
      const attemptTimes: number[] = [];

      await handler.withRetry(
        async () => {
          attemptTimes.push(Date.now());
          attempts++;
          if (attempts < 4) {
            throw new Error('Retry me');
          }
          return 'done';
        },
        {
          maxRetries: 4,
          initialDelay: 100,
          backoffMultiplier: 1, // No exponential growth
        }
      );

      const delays: number[] = [];
      for (let i = 1; i < attemptTimes.length; i++) {
        delays.push(attemptTimes[i]! - attemptTimes[i - 1]!);
      }

      // All delays should be ~100ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(90);
        expect(delay).toBeLessThan(150);
      }
    });

    test('handles very aggressive backoff', async () => {
      let attempts = 0;
      const attemptTimes: number[] = [];

      await handler.withRetry(
        async () => {
          attemptTimes.push(Date.now());
          attempts++;
          if (attempts < 4) {
            throw new Error('Retry me');
          }
          return 'done';
        },
        {
          maxRetries: 4,
          initialDelay: 10,
          backoffMultiplier: 10,
          maxDelay: 500,
        }
      );

      const delays: number[] = [];
      for (let i = 1; i < attemptTimes.length; i++) {
        delays.push(attemptTimes[i]! - attemptTimes[i - 1]!);
      }

      // First: 10ms, Second: 100ms, Third: 500ms (capped from 1000ms)
      expect(delays[0]).toBeGreaterThanOrEqual(5);
      expect(delays[0]).toBeLessThan(30);

      expect(delays[1]).toBeGreaterThanOrEqual(90);
      expect(delays[1]).toBeLessThan(150);

      expect(delays[2]).toBeGreaterThanOrEqual(450);
      expect(delays[2]).toBeLessThan(600);
    });
  });

  describe('Max Retry Limits', () => {
    test('respects maxRetries of 0 (single attempt only)', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error('Always fails');
        },
        { maxRetries: 0 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
    });

    test('respects maxRetries of 1', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error('Always fails');
        },
        { maxRetries: 1, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(2); // Initial + 1 retry
    });

    test('respects very high maxRetries', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 50) {
            throw new Error('Keep trying');
          }
          return 'finally!';
        },
        { maxRetries: 100, initialDelay: 1, maxDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('finally!');
      expect(attempts).toBe(50);
    });

    test('exhausts all retries on persistent failure', async () => {
      let attempts = 0;
      const maxRetries = 5;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error('Persistent failure');
        },
        { maxRetries, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(maxRetries + 1);
      expect(result.attempts).toBe(maxRetries + 1);
    });

    test('succeeds on exact last retry', async () => {
      let attempts = 0;
      const maxRetries = 3;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts <= maxRetries) {
            throw new Error('Not yet');
          }
          return 'success on last attempt';
        },
        { maxRetries, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('success on last attempt');
      expect(attempts).toBe(maxRetries + 1);
    });
  });

  describe('Error Recovery Patterns', () => {
    test('recovers from transient network errors', async () => {
      let attempts = 0;
      const networkErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'];

      const result = await handler.withRetry(
        async () => {
          if (attempts < networkErrors.length) {
            const error: any = new Error(networkErrors[attempts]);
            error.code = networkErrors[attempts];
            attempts++;
            throw error;
          }
          attempts++;
          return 'network recovered';
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('network recovered');
    });

    test('recovers from temporary resource unavailability', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            const error: any = new Error('EBUSY: resource busy or locked');
            error.code = 'EBUSY';
            throw error;
          }
          return 'resource now available';
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('resource now available');
    });

    test('does not recover from validation errors', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error('Invalid input: field required');
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1); // No retries on validation errors
    });

    test('does not recover from not found errors', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          const error: any = new Error('ENOENT: File not found');
          error.code = 'ENOENT';
          throw error;
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
    });

    test('does not recover from authentication errors', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          throw new Error('Unauthorized: Invalid credentials');
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
    });
  });

  describe('Retry Result Metadata', () => {
    test('returns correct attempt count on success', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Try again');
          }
          return 'success';
        },
        { maxRetries: 5, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.value).toBe('success');
      expect(result.error).toBeUndefined();
    });

    test('returns correct attempt count on failure', async () => {
      let _attempts = 0;

      const result = await handler.withRetry(
        async () => {
          _attempts++;
          throw new Error('Always fails');
        },
        { maxRetries: 3, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4); // Initial + 3 retries
      expect(result.value).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    test('preserves last error on failure', async () => {
      let attempts = 0;
      const errors = ['Error 1', 'Error 2', 'Error 3', 'Final Error'];

      const result = await handler.withRetry(
        async () => {
          const error = errors[attempts];
          attempts++;
          throw new Error(error);
        },
        { maxRetries: 3, initialDelay: 10 }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Final Error');
    });
  });

  describe('Edge Cases', () => {
    test('handles function returning undefined', async () => {
      const result = await handler.withRetry(
        async () => {
          return undefined;
        },
        { maxRetries: 2 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBeUndefined();
      expect(result.attempts).toBe(1);
    });

    test('handles function returning null', async () => {
      const result = await handler.withRetry(
        async () => {
          return null;
        },
        { maxRetries: 2 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBeNull();
      expect(result.attempts).toBe(1);
    });

    test('handles function returning complex object', async () => {
      const complexResult = {
        data: [1, 2, 3],
        nested: { key: 'value' },
        timestamp: new Date(),
      };

      const result = await handler.withRetry(async () => complexResult, { maxRetries: 2 });

      expect(result.success).toBe(true);
      expect(result.value).toEqual(complexResult);
    });

    test('handles non-Error thrown values', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw 'string error'; // Non-Error throw
          }
          return 'recovered';
        },
        { maxRetries: 3, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('recovered');
    });

    test('handles async errors thrown by Promise.reject', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            return Promise.reject(new Error('Rejected promise'));
          }
          return 'recovered';
        },
        { maxRetries: 3, initialDelay: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe('recovered');
    });

    test('handles zero initial delay', async () => {
      let attempts = 0;
      const startTime = Date.now();

      await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Retry');
          }
          return 'done';
        },
        { maxRetries: 3, initialDelay: 0 }
      );

      const elapsed = Date.now() - startTime;
      // Should complete very quickly with no delays
      expect(elapsed).toBeLessThan(100);
      expect(attempts).toBe(3);
    });

    test('handles very small initial delay', async () => {
      let attempts = 0;

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 5) {
            throw new Error('Retry');
          }
          return 'done';
        },
        { maxRetries: 5, initialDelay: 1 }
      );

      expect(result.success).toBe(true);
      expect(attempts).toBe(5);
    });
  });

  describe('Stress Testing', () => {
    test('handles high retry counts efficiently', async () => {
      let attempts = 0;
      const startTime = Date.now();

      const result = await handler.withRetry(
        async () => {
          attempts++;
          if (attempts < 100) {
            throw new Error('Keep going');
          }
          return 'done';
        },
        { maxRetries: 150, initialDelay: 1, maxDelay: 5 }
      );

      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(attempts).toBe(100);
      // Should complete in reasonable time even with many retries
      expect(elapsed).toBeLessThan(2000);
    });

    test('handles rapid failures with minimal delay', async () => {
      let attempts = 0;
      const startTime = Date.now();

      await handler.withRetry(
        async () => {
          attempts++;
          throw new Error('Fast failure');
        },
        { maxRetries: 50, initialDelay: 0 }
      );

      const elapsed = Date.now() - startTime;

      expect(attempts).toBe(51);
      expect(elapsed).toBeLessThan(500); // Should be very fast
    });
  });
});
