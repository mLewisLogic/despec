# xdd Development Tasks

Quick reference for all available development tasks. Tasks are defined in `.mise.toml` and run with `mise run <task>`.

## Quick Reference

```bash
# Most common tasks
mise run test:unit           # Fast unit tests (~4s)
mise run lint:all:fix        # Fix all linting issues
mise run quality-check       # Full quality check before commit
```

## Testing

### Unit Tests

```bash
mise run test:unit           # Run unit tests only (fast, ~4s)
mise run test:integration    # Run integration tests (slow)
mise run test:full           # Run all tests
mise run test:coverage       # Generate coverage report
mise run test:ci             # CI mode with verbose output
```

**Aliases:**

- `test` → `test:unit` (default)

## Code Quality

### TypeScript/JSON Linting

```bash
mise run typescript:typecheck  # Type checking only
mise run biome:lint:nofix      # Lint TS/JSON (check only)
mise run biome:lint:fix        # Lint and fix TS/JSON
```

### Markdown Linting

```bash
mise run markdown:lint:nofix  # Check markdown files
mise run markdown:lint:fix    # Fix markdown files
```

### TOML Linting

```bash
mise run toml:lint:nofix  # Check TOML formatting
mise run toml:lint:fix    # Format TOML files
```

### Comprehensive Linting

```bash
mise run lint:all:nofix  # Run all linters (check only)
mise run lint:all:fix    # Run all linters with fixes
```

## Schema Management

```bash
mise run generate-schemas    # Generate JSON schemas from Zod
mise run validate-schemas    # Validate schemas against examples
```

## Quality Gates

### Pre-Commit Checks

```bash
mise run pre-commit          # Fast checks (lint + unit tests)
```

**Runs:**

- All linters (TypeScript, JSON, Markdown, TOML)
- Unit tests

### Pre-Push Checks

```bash
mise run pre-push            # Comprehensive checks before push
```

**Runs:**

- All quality checks
- Test coverage report

### Full Quality Check

```bash
mise run quality-check       # Complete quality validation
```

**Runs:**

- All linters
- All tests
- Schema generation
- Schema validation

## Utilities

```bash
mise run clean               # Remove build artifacts, node_modules
mise run doctoc              # Generate markdown table of contents
```

## Git Hooks

Git hooks are managed by lefthook:

```bash
# Install hooks
bun x lefthook install

# Run pre-commit hook manually
lefthook run pre-commit --all-files
```

## Common Workflows

### Before Committing

```bash
mise run pre-commit
```

### Before Pushing

```bash
mise run pre-push
```

### After Schema Changes

```bash
mise run generate-schemas
mise run validate-schemas
```

### Clean Rebuild

```bash
mise run clean
bun install
mise run quality-check
```

## Task Dependencies

Some tasks depend on others and run them automatically:

- `quality-check` → `lint:all:nofix`, `test:full`, `generate-schemas`, `validate-schemas`
- `pre-commit` → `lint:all:nofix`, `test:unit`
- `pre-push` → `quality-check`, `test:coverage`
- `lint:all:nofix` → `typescript:typecheck`, `biome:lint:nofix`, `markdown:lint:nofix`, `toml:lint:nofix`
- `lint:all:fix` → `typescript:typecheck`, `biome:lint:fix`, `markdown:lint:fix`, `toml:lint:fix`

## Performance Notes

- **Unit tests**: ~4 seconds
- **Full test suite**: ~10 seconds
- **Quality check**: ~15 seconds
- **Coverage report**: ~12 seconds

## Troubleshooting

### Tests failing

```bash
mise run test:unit           # Check which tests fail
mise run lint:all:nofix      # Check for linting issues
```

### Linting errors

```bash
mise run lint:all:fix        # Auto-fix most issues
```

### Schema issues

```bash
mise run generate-schemas    # Regenerate schemas
mise run validate-schemas    # Check validation
```

### Clean state needed

```bash
mise run clean               # Remove all artifacts
bun install                  # Reinstall dependencies
mise run quality-check       # Verify everything works
```
