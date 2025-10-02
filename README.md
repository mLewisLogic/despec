# xdd

**Specification-Driven Development**

Foundation layer complete. CLI in development.

## What is xdd?

xdd helps you capture and manage software requirements using a three-stage pipeline:

1. **Specs Stage** (In Development): Natural language → Structured requirements in EARS format
2. **Design Stage** (Planned): Requirements → Component architecture and technical decisions
3. **Tasks Stage** (Planned): Design → Prioritized implementation backlog

**Current Goal**: Build a working Stage 1 proof of concept. See **[TODO.md](./TODO.md)** for the roadmap.

## Current Status

**What's Built:**
- ✅ Foundation utilities (AtomicWriter, FileLock, InputValidator, ErrorHandler)
- ✅ Zod schemas for all specification entities
- ✅ ID generation with collision resistance
- ✅ Test infrastructure (171 passing unit tests)

**Known Issues:**
- ⚠️ Foundation utilities have critical race conditions (see TODO.md)
- ⚠️ Integration tests need fixes

**What's Not Built Yet:**
- ❌ CLI tool (`xdd` command doesn't exist)
- ❌ YAML read/write operations
- ❌ Changelog & event sourcing
- ❌ Claude integration

## For Developers

### Installation

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/xdd.git
cd xdd
bun install

# Install development tools
mise install

# Set up git hooks
bun x lefthook install
```

### Development Workflow

```bash
# Run tests
mise run test:unit           # Quick unit tests (~4s)
mise run test:full           # All tests

# Check code quality
mise run lint:all:fix        # Fix linting issues
mise run quality-check       # Full quality validation

# See all available tasks
mise tasks
```

See **[TASKS.md](./TASKS.md)** for complete task reference.

### Secrets Management

xdd uses [SOPS](https://github.com/mozilla/sops) with [Age](https://github.com/FiloSottile/age) encryption for secure secrets management.

**First-time setup**:

```bash
# Initialize secrets (generates key and encrypted file)
mise run setup
```

**Managing secrets**:

```bash
# Set a secret interactively
mise run secrets:set OPENROUTER_API_KEY

# Edit secrets file directly
mise run secrets:edit

# Get a specific secret
mise run secrets:get OPENROUTER_API_KEY

# List all secret keys (not values)
mise run secrets:list
```

**Environment switching**:

- `dev`: Uses `~/.keys/xdd/dev.age.key` and `secrets/dev.enc.yaml`
- `ci`: Uses plain text test values from `.mise.ci.toml`

Age keys are stored locally in `~/.keys/xdd/` and are **never** committed to git.
Encrypted secrets files (`*.enc.yaml`) **are** committed - they're safe when encrypted.

### Recording LLM Fixtures

For testing LLM integration, we use recorded fixtures to avoid API costs and ensure deterministic tests.

**Record fixtures (one-time setup)**:

```bash
cd backend

# Set your OpenRouter API key
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# Record all fixtures (~$0.50, ~30 seconds)
go run scripts/record-fixtures.go

# Verify fixtures
go run scripts/verify-fixtures.go
```

**Run tests with fixtures**:

```bash
# Tests automatically use fixtures (no API key needed)
go test ./internal/llm/tasks/...
```

See **[docs/how-to-record-fixtures.md](./docs/how-to-record-fixtures.md)** for detailed instructions.

## Planned Functionality

### Stage 1: Specifications (Design Specification)

Once complete, xdd will transform natural language requirements into structured YAML files following the EARS format.

**Planned CLI Commands:**

```bash
# Initialize a new project
xdd init

# Create requirements from natural language
xdd specify "Users should be able to log in with OAuth"

# Validate specifications
xdd validate

# Query requirements
xdd query "list AUTH requirements"
```

### Planned Data Model

**Input**: "Users should be able to log in with OAuth"

**Output**: Structured requirement with:
- Unique ID (collision-resistant nanoid)
- EARS-formatted description
- Acceptance criteria (behavioral or assertion)
- Category and priority
- Complete audit trail

### Planned File Structure

```text
.xdd/01-specs/
├── specification.yaml    # Current requirements
├── changelog.yaml        # Event log (audit trail)
├── snapshots/           # Periodic state snapshots
└── .locks/              # Concurrency control
```

### EARS Format

Requirements will follow EARS patterns:
- **Ubiquitous**: "The system shall always maintain session state"
- **Event-Driven**: "When user clicks login, the system shall redirect to OAuth provider"
- **State-Driven**: "While user is authenticated, the system shall display profile menu"
- **Optional**: "Where OAuth is unavailable, the system shall offer email login"

## Documentation

- **[TODO.md](./TODO.md)** - Development roadmap and current priorities
- **[SPEC.md](./SPEC.md)** - Complete technical specification
- **[TASKS.md](./TASKS.md)** - Available development tasks

## Architecture Principles

**Write-Time Validation**: TypeScript + Zod enforce correctness before data touches disk.

**Event Sourcing**: Every change tracked as immutable events with periodic snapshots.

**Atomic Transactions**: Copy-on-write with true file copying (not hard links) ensures complete transaction isolation. All modifications stay in temp directory until atomic commit. Rollback is guaranteed safe. See [ADR-001](docs/architecture/ADR-001-atomic-transactions-true-copy.md) for design rationale.

**Single Command UX**: Natural language in, structured YAML out (when complete).

**YAML as Database**: Text-based artifacts are the source of truth.

**Target**: Solo developers and small teams on local filesystems.

## Contributing

Start with **[TODO.md](./TODO.md)** to see current priorities. See **[SPEC.md](./SPEC.md)** for architecture details.

## License

MIT
