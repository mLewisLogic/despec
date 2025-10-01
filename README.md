# xdd

**Specification-Driven Development**

Transform natural language requirements into structured, validated specifications.

## What is xdd?

xdd helps you capture and manage software requirements using a three-stage pipeline:

1. **Specs Stage** (Current): Natural language → Structured requirements in EARS format
2. **Design Stage** (Future): Requirements → Component architecture and technical decisions
3. **Tasks Stage** (Future): Design → Prioritized implementation backlog

**Current Focus**: Stage 1 - Specifications. Transform your ideas into validated, traceable requirements.

## Quick Start

### Installation

```bash
# Clone and install
git clone https://github.com/yourusername/xdd.git
cd xdd
bun install

# Set up git hooks
bun x lefthook install
```

### Usage (Stage 1 - Specs)

```bash
# Create requirements from natural language (coming soon)
xdd specify "Build a web application with OAuth authentication and PostgreSQL storage"

# Add more requirements
xdd specify "Add real-time WebSocket notifications"

# Validate your specifications
xdd validate

# Query existing requirements
xdd query "list AUTH requirements"
```

### For Developers

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

## How It Works

### Stage 1: Specifications

xdd transforms your natural language requirements into structured YAML files that follow the EARS (Easy Approach to Requirements Syntax) format.

**Input**: "Users should be able to log in with OAuth"

**Output**: Structured requirement with:

- Unique ID (collision-resistant)
- EARS-formatted description
- Acceptance criteria (behavioral or assertion)
- Category and priority
- Complete audit trail

### File Structure

All specifications are stored in `.xdd/01-specs/`:

```text
.xdd/01-specs/
├── specification.yaml    # Current requirements
├── changelog.yaml        # Event log (audit trail)
├── snapshots/           # Periodic state snapshots
└── .locks/              # Concurrency control
```

### EARS Format

Requirements follow EARS patterns:

- **Ubiquitous**: "The system shall always maintain session state"
- **Event-Driven**: "When user clicks login, the system shall redirect to OAuth provider"
- **State-Driven**: "While user is authenticated, the system shall display profile menu"
- **Optional**: "Where OAuth is unavailable, the system shall offer email login"

### Key Features

**Stage 1 (Current)**:

- ✅ **Type-Safe**: Zod schemas enforce correctness at write-time
- ✅ **Event Sourcing**: Complete audit trail of all changes
- ✅ **Deterministic IDs**: Collision-resistant nanoid-based IDs
- ✅ **Safe Writes**: Atomic write operations with file locking
- 🚧 **Natural Language**: Claude integration for semantic parsing (in progress)

**Future Stages**:

- 📅 Stage 2: Component design and architecture decisions
- 📅 Stage 3: Task generation with TDD enforcement

## Current Status

**Version**: 2.0.0-alpha
**Stage**: 1 - Specifications (In Progress)
**Stability**: Development (not production-ready)

### What's Working

- Foundation utilities (AtomicWriter, FileLock, InputValidator, ErrorHandler)
- Zod schemas for all specification entities
- ID generation with collision resistance
- Comprehensive test suite (171 passing tests)
- CI/CD pipeline with GitHub Actions

### What's Next

See **[TODO.md](./TODO.md)** for:

- Current phase progress
- Known issues
- Upcoming features
- Risk mitigations

## Documentation

- **[SPEC.md](./SPEC.md)** - Complete technical specification
- **[TODO.md](./TODO.md)** - Development roadmap and known issues
- **[TASKS.md](./TASKS.md)** - Available development tasks
- **[docs/system/](./docs/system/)** - Implementation details

## Target Users

xdd is designed for:

- Solo developers and small teams (2-3 people)
- Internal tools and small-scale applications
- Single-agent AI workflows
- Local filesystem operations

**Not suited for**:

- Large teams requiring multi-user collaboration
- Distributed systems across network filesystems
- Enterprise-scale requirement management

## Philosophy

**Write-Time Validation**: TypeScript + Zod enforce correctness before data touches disk.

**Event Sourcing**: Every change is tracked. Requirements are append-only with periodic snapshots.

**Single Command UX**: Natural language in, structured YAML out.

**Computed Traceability**: No forward links. Relationships computed from backlinks on demand.

**YAML as Database**: Text-based artifacts are the source of truth.

## Contributing

See **[SPEC.md](./SPEC.md)** for:

- Architecture principles
- Data models
- Critical implementation patterns
- Development phases

## License

MIT
