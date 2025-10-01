# Despec Test Infrastructure

Comprehensive test suite for the despec project with multiple test tiers optimized for different scenarios.

## Test Organization

Tests are organized into tiers based on speed and scope:

### Unit Tests (`src/**/*.test.ts`)

- Fast, isolated tests for individual modules
- No external dependencies or I/O
- **Target**: <5 seconds total
- **Location**: Colocated with source files

### Integration Tests (`tests/integration/`)

Tests that validate component interactions and real-world scenarios.

#### Fast Integration Tests

- Quick validation tests
- Minimal I/O and process spawning
- **Target**: <15 seconds total
- **Files**:
  - `phase0-*.test.ts` - Validation pipeline tests
  - `*-failure.test.ts` - Error handling tests
  - `error-recovery.test.ts` - Recovery mechanism tests

#### Slow Integration Tests

- Multi-process synchronization tests
- High iteration counts
- **Target**: <45 seconds total
- **Files**:
  - `concurrent-*.test.ts` - Worker thread concurrency tests
  - `real-multiprocess-locks.test.ts` - True process isolation tests
  - `verify-race-condition.test.ts` - Race condition detection

## Test Commands

### Quick Iteration (Pre-commit)

```bash
bun run test:quick
```

- Runs unit tests only
- **Performance**: <5 seconds
- **Use case**: Rapid development feedback, pre-commit hook

### Standard Testing (Pre-push)

```bash
bun run test:standard
```

- Runs unit tests + fast integration tests
- **Performance**: <30 seconds
- **Use case**: Pre-push verification, local development

### Full Test Suite (CI)

```bash
bun run test:full
```

- Runs all tests including slow multi-process tests
- **Performance**: <60 seconds
- **Use case**: CI/CD pipeline, comprehensive validation

### Stress Testing (Manual)

```bash
bun run test:stress
```

- Runs tests with high iteration counts
- **Performance**: <2 minutes
- **Use case**: Performance validation, pre-release testing
- **Note**: Sets `STRESS_TEST=true` environment variable

### Coverage Analysis

```bash
bun run test:coverage
```

- Generates coverage reports in multiple formats
- **Thresholds**:
  - Lines: 80%
  - Functions: 80%
  - Branches: 75%
  - Statements: 80%

### Watch Mode

```bash
bun run test:watch
```

- Watches unit tests for changes
- Automatically reruns affected tests
- **Use case**: Active development

### CI Mode

```bash
bun run test:ci
```

- Verbose output for CI/CD systems
- JSON reporter for artifacts
- **Use case**: GitHub Actions, CI pipelines

## Performance Targets

| Test Tier       | Target Time | Actual Time | Status |
| --------------- | ----------- | ----------- | ------ |
| Unit Tests      | <5s         | ~5s         | ✓      |
| Fast Integration| <15s        | ~15s        | ✓      |
| Full Suite      | <60s        | ~50s        | ✓      |
| Stress Tests    | <120s       | ~90s        | ✓      |

## Running Tests Locally

### Prerequisites

```bash
# Install dependencies
bun install

# Build project (required for some integration tests)
bun run build
```

### Development Workflow

1. **During active development**:

   ```bash
   bun run test:watch
   ```

2. **Before committing**:

   ```bash
   bun run check  # Runs typecheck + lint + test:standard
   ```

3. **Before pushing**:
   ```bash
   bun run test:full
   ```

## Git Hooks

Automated quality gates using [Lefthook](https://github.com/evilmartians/lefthook).

### Installation

```bash
# Via npm
npm install -g @evilmartians/lefthook
lefthook install

# Or via homebrew (macOS)
brew install lefthook
lefthook install
```

### Pre-commit Hook

Runs automatically before each commit:

- Linting (`bun run lint`)
- Type checking (`bun run typecheck`)
- Quick tests (`bun run test:quick`)
- **Performance**: <10 seconds

### Pre-push Hook

Runs automatically before each push:

- Standard tests (`bun run test:standard`)
- **Performance**: <30 seconds

### Commit Message Hook

Enforces [Conventional Commits](https://www.conventionalcommits.org/) format:

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

GitHub Actions workflow runs on push and pull requests.

### Jobs

1. **Lint & Type Check**

   - Runs on Ubuntu
   - Fast feedback on code quality

2. **Test Matrix**

   - **Runtimes**: Bun (latest), Node.js (20, 22)
   - **OS**: Ubuntu, macOS
   - **Tests**: Full suite
   - **Coverage**: Generated on Ubuntu + Bun

3. **Stress Testing**

   - Runs on main branch only
   - Extended test durations
   - Performance validation

4. **Security Audit**
   - Dependency vulnerability scanning

### Workflow Triggers

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch (for stress tests)

## Test Utilities

Common utilities available in `tests/utils/test-helpers.ts`:

### Temporary Directories

```typescript
import { TempDirectory } from '../utils/test-helpers';

const tmpDir = new TempDirectory('my-test');
await tmpDir.setup();

const filePath = await tmpDir.createFile('content', 'subdir', 'file.txt');
// Use tmpDir.getPath(...) for paths

await tmpDir.cleanup();
```

### Stress Testing

```typescript
import { STRESS_TEST, getIterationCount } from '../utils/test-helpers';

// Adjusts iteration count based on test mode
const iterations = getIterationCount(10, 100); // 10 standard, 100 stress
```

### Timeouts

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

For tests that spawn processes or run many iterations:

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

### Flaky Test Handling

```typescript
import { eventuallyResolves } from '../utils/test-helpers';

it('should eventually succeed', async () => {
  // Retry until success or timeout
  const result = await eventuallyResolves(
    async () => {
      const value = await checkCondition();
      if (!value) throw new Error('Not ready');
      return value;
    },
    { timeout: 5000, interval: 100 }
  );

  expect(result).toBe(expected);
});
```

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

## Best Practices

1. **Keep unit tests fast**: No I/O, no network, no spawning processes
2. **Use test utilities**: Leverage shared helpers for consistency
3. **Clean up resources**: Always use beforeEach/afterEach for setup/teardown
4. **Descriptive test names**: Test name should describe the expected behavior
5. **Isolate tests**: Each test should be independent and not rely on execution order
6. **Test edge cases**: Include error cases, boundary conditions, and race conditions
7. **Document slow tests**: Add comments explaining why a test needs to be slow

## Maintenance

### Adding New Tests

1. Choose appropriate location:
   - Unit tests → `src/**/*.test.ts`
   - Fast integration → `tests/integration/`
2. Use test utilities for common patterns
3. Ensure test completes within tier performance target
4. Update this README if adding new test categories

### Updating Test Infrastructure

1. Update `vitest.config.ts` for configuration changes
2. Update `package.json` scripts for new test commands
3. Update `.github/workflows/ci.yml` for CI changes
4. Update this documentation

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Bun Testing Guide](https://bun.sh/docs/cli/test)
- [Lefthook Documentation](https://github.com/evilmartians/lefthook)
- [Conventional Commits](https://www.conventionalcommits.org/)
