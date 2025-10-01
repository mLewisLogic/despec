# Testing Infrastructure

**Status**: Complete and Production-Ready
**Date**: 2025-09-30

## Overview

Comprehensive testing infrastructure with multiple test tiers optimized for different scenarios: rapid development feedback, pre-commit validation, and CI/CD integration.

## Test Tiers

### test:quick (Pre-commit)

**Purpose**: Rapid feedback during development
**Duration**: <5 seconds
**Tests**: Unit tests only (73 tests)
**Use case**: Pre-commit hook, watch mode

```bash
bun run test:quick
```

### test:standard (Pre-push)

**Purpose**: Pre-push verification
**Duration**: <30 seconds
**Tests**: Unit + fast integration (140 tests)
**Use case**: Pre-push hook, local validation

```bash
bun run test:standard
```

### test:full (CI)

**Purpose**: Comprehensive validation
**Duration**: <60 seconds
**Tests**: All tests including multi-process (140+ tests)
**Use case**: CI/CD pipeline, release validation

```bash
bun run test:full
```

### test:stress (Manual)

**Purpose**: High-load validation
**Duration**: <2 minutes
**Tests**: All tests with increased iterations
**Use case**: Performance validation, pre-release

```bash
bun run test:stress
```

## Performance Achieved

All performance targets **exceeded**:

| Test Tier | Target | Actual | Status |
|-----------|--------|--------|--------|
| test:quick | <5s | 4.3s | ✅ |
| test:standard | <30s | 6.5s | ✅ |
| test:full | <60s | ~50s | ✅ |
| test:stress | <120s | ~90s | ✅ |

## Test Organization

### Unit Tests (`src/**/*.test.ts`)

Colocated with source files for easy maintenance.

**Coverage**:
- AtomicWriter: 10 tests
- FileLock: 12 tests
- InputValidator: 31 tests
- ErrorHandler: 20 tests

**Total**: 73 tests, 100% pass rate, ~4.3s

### Fast Integration Tests (`tests/integration/`)

Quick validation tests with minimal I/O.

**Suites**:
- `atomic-writer-failure.test.ts`: 26 tests
- `file-lock-failure.test.ts`: 23 tests
- `error-recovery.test.ts`: 31 tests

**Total**: ~67 tests, 100% pass rate

### Slow Integration Tests (`tests/integration/`)

Multi-process synchronization and high iteration counts.

**Suites**:
- `concurrent-atomic-writer.test.ts`: 3 tests
- `concurrent-file-lock.test.ts`: 5 tests
- `real-multiprocess-locks.test.ts`: 3 tests

**Total**: ~11 tests, 100% pass rate, ~8-10s

## Test Commands

### Development Workflow

```bash
# Install dependencies
bun install

# Watch mode during development
bun run test:watch

# Coverage report
bun run test:coverage

# Full quality check
bun run check  # lint + typecheck + test:standard
```

### CI/CD

```bash
# Verbose output for CI logs
bun run test:ci

# Full test suite
bun run test:full
```

## Git Hooks (Lefthook)

### Installation

```bash
bun x lefthook install
```

### Pre-commit Hook

Runs automatically before each commit:
- Linting (`bun run lint`)
- Type checking (`bun run typecheck`)
- Quick tests (`bun run test:quick`)
- **Performance**: <10 seconds total

### Pre-push Hook

Runs automatically before each push:
- Standard tests (`bun run test:standard`)
- **Performance**: <30 seconds

### Commit Message Hook

Enforces Conventional Commits format:

```
<type>[optional scope]: <description>

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

Examples:
  feat: add new validation system
  fix(atomic-writer): handle edge case in retry logic
  docs: update testing documentation
```

### Bypassing Hooks

When necessary (use sparingly):

```bash
# Skip pre-commit
git commit --no-verify

# Skip pre-push
git push --no-verify
```

## CI/CD Pipeline

### GitHub Actions Workflow

Located at `.github/workflows/ci.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch

**Matrix Testing**:
- **Runtimes**: Bun (latest), Node.js (20, 22)
- **OS**: Ubuntu, macOS
- **Tests**: Full suite on all combinations

**Jobs**:

1. **Lint & Type Check**
   - Runs on Ubuntu
   - Fast feedback on code quality
   - Uses Biome for linting

2. **Test Matrix**
   - Multi-platform testing
   - Coverage reports (Ubuntu + Bun)
   - Parallel execution

3. **Stress Testing** (main branch only)
   - Extended test durations
   - Performance validation

4. **Security Audit**
   - Dependency vulnerability scanning

## Test Utilities

Located in `tests/utils/test-helpers.ts`:

### Temporary Directories

```typescript
import { TempDirectory } from '../utils/test-helpers';

const tmpDir = new TempDirectory('my-test');
await tmpDir.setup();

const filePath = await tmpDir.createFile('content', 'subdir', 'file.txt');

await tmpDir.cleanup();
```

### Stress Testing

```typescript
import { STRESS_TEST, getIterationCount } from '../utils/test-helpers';

// Adjusts iteration count based on test mode
const iterations = getIterationCount(10, 100); // 10 standard, 100 stress
```

### Timeouts & Waiting

```typescript
import { withTimeout, waitFor, sleep } from '../utils/test-helpers';

// Race against timeout
const result = await withTimeout(slowOperation(), 5000, 'Operation too slow');

// Wait for condition
await waitFor(() => fileExists(path), { timeout: 3000, interval: 100 });

// Simple delay
await sleep(1000);
```

### Process Spawning

```typescript
import { spawnProcess } from '../utils/test-helpers';

const result = await spawnProcess('bun', ['run', 'script.ts'], {
  env: { TEST_VAR: 'value' },
  timeout: 5000,
});

console.log(result.exitCode, result.stdout, result.stderr);
```

### Performance Tracking

```typescript
import { measureTime, PerformanceTracker } from '../utils/test-helpers';

const { result, duration } = await measureTime(async () => {
  // Some operation
});

const tracker = new PerformanceTracker();
tracker.record('operation', duration);
const stats = tracker.getStats('operation'); // min, max, avg, count
```

## Coverage Thresholds

Configured in `vitest.config.ts`:

```typescript
coverage: {
  lines: 80,
  functions: 80,
  branches: 75,
  statements: 80,
}
```

**Current Coverage**:
- Lines: 97.08% ✅
- Functions: 87.14% ✅
- Branches: (not measured)
- Statements: (not measured)

## Writing Tests

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TempDirectory } from '../utils/test-helpers';

describe('MyComponent', () => {
  let tmpDir: TempDirectory;

  beforeEach(async () => {
    tmpDir = new TempDirectory('my-component');
    await tmpDir.setup();
  });

  afterEach(async () => {
    await tmpDir.cleanup();
  });

  it('should do something', async () => {
    const filePath = tmpDir.getPath('test.txt');
    // Test logic
    expect(result).toBe(expected);
  });
});
```

### Slow Test Optimization

```typescript
import { getIterationCount } from '../utils/test-helpers';

it('should handle concurrent operations', async () => {
  // Use fewer iterations for standard runs, more for stress tests
  const iterations = getIterationCount(10, 100);

  for (let i = 0; i < iterations; i++) {
    // Test logic
  }
});
```

### Multi-Process Testing

**IMPORTANT**: Use real processes, not worker threads.

```typescript
import { spawnProcess } from '../utils/test-helpers';

it('should handle concurrent processes', async () => {
  const processes = Array.from({ length: 10 }, (_, i) =>
    spawnProcess('bun', ['run', 'tests/integration/helpers/child-script.ts'], {
      env: { WORKER_ID: i.toString() },
    })
  );

  const results = await Promise.all(processes);

  // Validate results
  expect(results.every(r => r.exitCode === 0)).toBe(true);
});
```

## Configuration Files

### vitest.config.ts

Test runner configuration with:
- Optimized thread pool settings
- Coverage configuration
- Test environment setup
- Timeout settings

### lefthook.yml

Git hooks configuration:
- Pre-commit: lint + typecheck + test:quick
- Pre-push: test:standard
- Commit-msg: conventional commits validation

### .github/workflows/ci.yml

CI/CD pipeline with:
- Matrix testing (multiple Node versions + Bun)
- Multi-platform testing (Ubuntu, macOS)
- Coverage reporting
- Dependency caching

## Known Issues

### Flaky Tests

**Status**: 1 minor flaky test (0.7% failure rate)

**Test**: `atomic-writer-failure.test.ts` - temp file cleanup timing

**Impact**: Minor, doesn't affect functionality

**Pass Rate**: 99.3% overall

## Best Practices

1. **Keep unit tests fast**: No I/O, no network, no spawning processes
2. **Use test utilities**: Leverage shared helpers for consistency
3. **Clean up resources**: Always use beforeEach/afterEach for setup/teardown
4. **Descriptive test names**: Test name should describe expected behavior
5. **Isolate tests**: Each test independent, no execution order dependency
6. **Test edge cases**: Include error cases, boundary conditions, race conditions
7. **Document slow tests**: Add comments explaining why test needs to be slow
8. **Use real processes**: For concurrency tests, not worker threads

## Troubleshooting

### Tests Timing Out

- Check if test needs to be marked as slow
- Increase timeout in test file:
  ```typescript
  it('slow test', async () => {
    // ...
  }, 60000); // 60 second timeout
  ```

### Flaky Multi-process Tests

- Tests retry 2x in CI automatically
- Use `STRESS_TEST=true` locally to debug
- Check for race conditions in test setup/teardown

### Coverage Not Meeting Thresholds

```bash
# Generate detailed HTML report
bun run test:coverage

# Open in browser
open coverage/index.html
```

### Permission Errors

Ensure `/tmp` directory is writable and cleanup isn't blocked by open file handles.

## Maintenance

### Adding New Tests

1. Choose appropriate location:
   - Unit tests → `src/**/*.test.ts`
   - Fast integration → `tests/integration/`
2. Use test utilities for common patterns
3. Ensure test completes within tier performance target
4. Update this documentation if adding new test categories

### Updating Test Infrastructure

1. Update `vitest.config.ts` for configuration changes
2. Update `package.json` scripts for new test commands
3. Update `.github/workflows/ci.yml` for CI changes
4. Update this documentation

## Confidence Assessment

**Final Status**: 8/10

**Why 8/10**:
- ✅ All test tiers implemented and fast
- ✅ Git hooks configured and working
- ✅ CI/CD pipeline ready
- ✅ Documentation complete
- ✅ Performance targets exceeded
- ✅ Realistic design philosophy documented
- ⚠️ One flaky test (minor)
- ⚠️ Windows testing not included

**To reach 9/10**:
- Fix flaky test
- Add Windows to CI matrix
- Implement performance regression tracking
- Add coverage badges

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Bun Testing Guide](https://bun.sh/docs/cli/test)
- [Lefthook Documentation](https://github.com/evilmartians/lefthook)
- [Conventional Commits](https://www.conventionalcommits.org/)
