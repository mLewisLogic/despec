# Despec

**Specification-Driven Development System V2**

Transform natural language requirements into structured, validated specifications through TypeScript SDK with LLM integration.

## Quick Start

```bash
# Install dependencies
bun install

# Set up git hooks for automated testing
bun x lefthook install

# Run development mode
mise run dev

# Initialize project with specifications (coming in Phase 1)
despec specify "Build a web application with OAuth authentication and PostgreSQL storage"

# Add features (coming in Phase 1)
despec specify "Add real-time WebSocket notifications"

# Validate (coming in Phase 1)
despec validate
```

## What is Despec?

Despec is a three-stage pipeline for transforming ideas into implementation:

1. **Specs Stage**: Natural language → Structured requirements (EARS format)
2. **Design Stage**: Requirements → Component architecture and technical decisions
3. **Tasks Stage**: Design → Prioritized implementation with TDD enforcement

**Key Innovation**: TypeScript SDK with Zod schemas enforces correctness at write-time. LLM agents use the SDK as a tool, eliminating ambiguity.

## Features

### Phase 0 (Complete) ✅
- ✅ **Foundation Utilities**: Atomic writes, file locking, input validation
- ✅ **Test Infrastructure**: Comprehensive unit and integration tests
- ✅ **CI/CD Pipeline**: GitHub Actions + git hooks
- ✅ **Single-Agent Optimized**: Best-effort atomicity for practical use

### Phase 1 (In Progress) 🚧
- 🚧 **Natural Language Interface**: Describe requirements in plain English
- 🚧 **Type-Safe**: Zod schemas validate at write-time
- 🚧 **Event Sourcing**: Complete audit trail of all changes
- 🚧 **LLM-Powered**: Claude integration for semantic understanding
- 🚧 **Single Command**: `despec specify "..."` does it all
- 🚧 **Deterministic IDs**: nanoid-based requirement IDs

## Installation

```bash
# Using Bun (recommended)
bun install -g despec

# Using npm
npm install -g despec
```

## Documentation

- **[SPEC.md](./SPEC.md)** - Complete system specification
- **Examples** - Coming soon
- **API Reference** - Coming soon

## Development

### Testing

```bash
# Quick tests (unit only, ~4s)
mise run test

# Watch mode for development
mise run test-watch

# Full test suite with coverage
mise run test-coverage

# Integration tests
mise run test-integration
```

### Code Quality

```bash
# Fix all linting issues
mise run lint-all

# Check only (no fixes)
mise run lint-all-check

# Pre-commit checks (fast)
mise run pre-commit

# Pre-push checks (comprehensive)
mise run pre-push

# Full quality check
mise run quality-check
```

### Build & Clean

```bash
# Build for distribution
mise run build

# Clean artifacts
mise run clean

# Update dependencies
mise run deps-update
```

### lefthook

```bash
lefthook run pre-commit --all-files
```

## Project Structure

```
.despec/                    # Generated artifacts
├── 01-specs/
│   ├── specification.yaml
│   └── changelog.yaml
├── 02-design/
└── 03-tasks/

src/                       # SDK implementation
├── 01-specs/             # Specs stage
├── 02-design/            # Design stage (TODO)
├── 03-tasks/             # Tasks stage (TODO)
└── cli.ts                # CLI entry
```

## Current Status

**Version**: 2.0.0-alpha
**Phase 0**: ✅ Complete (Foundation)
**Phase 1**: 🚧 In Progress (Specs Stage)
**Confidence**: 6/10 (Production-ready for single-agent use on local filesystems)

### What's Working Now
- Foundation utilities (AtomicWriter, FileLock, InputValidator, ErrorHandler)
- Comprehensive test suite (138 tests, 99.3% pass rate)
- CI/CD pipeline with GitHub Actions
- Git hooks for automated validation
- Best-effort atomicity for single-agent use

### Documentation
- [SPEC.md](./SPEC.md) - Complete system specification
- [docs/system/](./docs/system/) - Current implementation details
- [TODO.md](./TODO.md) - Future work and known issues

## License

MIT
