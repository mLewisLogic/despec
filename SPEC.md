# xdd: Specification-Driven Development System (V2)

**Version**: 2.0.0
**Status**: Design Phase
**Last Updated**: 2025-01-30

---

## Executive Summary

xdd is a TypeScript-based specification-driven development system that transforms natural language requirements into structured, validated artifacts through three stages: **Specs**, **Design**, and **Tasks**. This is a complete V2 redesign with no backwards compatibility to the previous agent-sdd system.

**Core Innovation**: TypeScript SDK with Zod schemas enforces correctness at write-time, not validation-time. LLM agents use the SDK as a tool, eliminating ambiguity and enabling reliable automation.

**Target Users**: Solo developers and small teams (2-3 people) building internal tools or small-scale applications.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Three-Stage Pipeline](#three-stage-pipeline)
3. [Artifact Directory Structure](#artifact-directory-structure)
4. [Development Phases](#development-phases)
5. [Specification Stage Details](#specification-stage-details)
6. [Design Stage (Future)](#design-stage-future)
7. [Tasks Stage (Future)](#tasks-stage-future)
8. [Critical Implementation Patterns](#critical-implementation-patterns)
9. [Developer Experience](#developer-experience)
10. [Validation Strategy](#validation-strategy)
11. [Tooling & Dependencies](#tooling--dependencies)
12. [Performance & Limits](#performance--limits)

---

## System Architecture

### Core Principles

1. **Validation at Write-Time**: TypeScript + Zod schemas enforce correctness before YAML touches disk
2. **Event Sourcing**: All changes tracked as immutable append-only events with periodic snapshots
3. **Single Command UX**: Natural language interface powered by Anthropic SDK
4. **Computed Traceability**: No forward links; compute relationships from backlinks on demand
5. **Minimal Schema**: Avoid redundant metadata; derive information when possible
6. **YAML as Database**: Text-based artifacts are the source of truth
7. **Best-Effort Atomicity**: Write-rename pattern preferred for consistency (not ACID-guaranteed)
8. **Single-Agent Optimization**: Advisory locks for safety, optimized for single-agent use

### Technology Stack

- **Language**: TypeScript (via Bun runtime)
- **Validation**: Zod 3.x (with JSON Schema generation)
- **LLM Integration**: Anthropic SDK (@anthropic-ai/sdk)
- **ID Generation**: nanoid (collision-resistant)
- **CLI**: commander
- **Package Manager**: Bun
- **Task Runner**: Mise
- **Linting**: Biome (TS/JSON), Taplo (TOML), markdownlint-cli2 (Markdown)

### Data Flow

```
User Natural Language
        ↓
Anthropic Claude (semantic layer)
        ↓
TypeScript Tools (Zod validation)
        ↓
Atomic Write Operations
        ↓
YAML Artifacts (.xdd/)
        ↓
Downstream Stages (Design, Tasks)
```

---

## Three-Stage Pipeline

### Stage 1: Specs (WHAT the system does)

**Input**: Natural language requirements
**Processing**: Parse into EARS-formatted, structured specifications
**Output**: `specification.yaml` + `changelog.yaml`
**Commands**: `xdd specify "requirements"`

### Stage 2: Design (HOW to build it)

**Input**: Specifications from Stage 1
**Processing**: Component discovery, technology research, architectural decisions
**Output**: Component designs, API specs, technology decisions
**Commands**: `xdd design-research`, `xdd design-decide`, `xdd design-document`

### Stage 3: Tasks (BUILD the system)

**Input**: Design specifications from Stage 2
**Processing**: Task generation with TDD enforcement
**Output**: Prioritized backlog with test-first workflow
**Commands**: `xdd tasks-generate`, `xdd tasks-next`, `xdd tasks-validate`

---

## Artifact Directory Structure

```
.xdd/                              # Project artifact directory
├── 01-specs/
│   ├── specification.yaml            # Current requirements
│   ├── changelog.yaml                # Event log
│   ├── snapshots/                    # Periodic state snapshots
│   └── .locks/                       # Concurrency control locks
├── 02-design/
│   ├── design.yaml                   # System architecture
│   ├── components/                   # Component specs
│   │   └── [component-name]/
│   │       ├── design.yaml
│   │       └── api.yaml / schema.sql
│   ├── decisions.yaml                # Technology decisions
│   └── changelog.yaml                # Design change log
└── 03-tasks/
    ├── backlog.yaml                  # Prioritized tasks
    ├── 01-active/                    # Current work (max 1)
    │   └── T####/
    └── 02-done/                      # Completed tasks
```

**Note**: `.xdd` is created in user projects. The xdd repository itself can contain `.xdd` for dogfooding.

---

## Development Phases

### Phase 0: Foundation (2 days) 🔴 REQUIRED FIRST

Build critical infrastructure before any feature development:

#### Day 1: Core Utilities
- [ ] Implement `AtomicWriter` class for safe file operations
- [ ] Implement `FileLock` class for concurrency control
- [ ] Implement `InputValidator` for sanitization
- [ ] Implement `ErrorHandler` with retry logic

#### Day 2: Testing Infrastructure
- [ ] Create test fixtures for all data types
- [ ] Set up unit test framework
- [ ] Test atomic writes under failure conditions
- [ ] Test concurrent access scenarios

**Deliverables**:
```typescript
src/shared/
├── atomic-writer.ts     # Write-rename pattern
├── file-lock.ts        # Advisory locks
├── input-validator.ts  # Input sanitization
└── error-handler.ts    # Error recovery
```

### Phase 1: Specs Stage Core (3-4 days)

Build the specification stage with validated foundations:

#### Days 3-4: Schemas & ID Generation
- [ ] Define Zod schemas for all entities
- [ ] Implement nanoid-based ID generation (nanoid(16))
- [ ] Generate JSON schemas from Zod
- [ ] Test for ID collisions (1M generations)

#### Days 5-6: Changelog & State Management
- [ ] Implement event sourcing with 8 event types
- [ ] Add snapshot mechanism (every 100 events)
- [ ] Build YAML serialization with validation
- [ ] Create changelog index management

**Key Implementation**:
```typescript
// ID Generation (collision-resistant)
import { nanoid } from 'nanoid';

export function generateRequirementId(category: string): string {
  return `REQ-${category.toUpperCase()}-${nanoid(16)}`;
}

// Atomic Writes
const writer = new AtomicWriter();
await writer.writeFiles([
  { path: 'specification.yaml', content: specYaml },
  { path: 'changelog.yaml', content: changelogYaml }
]);
```

### Phase 2: Claude Integration (3-4 days)

Integrate real Anthropic SDK for natural language processing:

#### Days 7-8: Claude Wrapper
- [ ] Build `ClaudeWrapper` with actual SDK
- [ ] Implement tool calling pattern
- [ ] Create context injection system
- [ ] Add response validation

#### Days 9-10: Testing & Mocking
- [ ] Create Claude response mocks
- [ ] Build integration test suite
- [ ] Test error scenarios
- [ ] Validate token usage

**Implementation**:
```typescript
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeWrapper {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async runWithTools(
    message: string,
    tools: Tool[],
    context: Context
  ): Promise<ToolResult> {
    const response = await this.client.messages.create({
      model: 'claude-3-opus-20240229',
      messages: [{ role: 'user', content: message }],
      tools: this.formatTools(tools),
      system: this.buildSystemPrompt(context),
    });
    return this.processToolCalls(response);
  }
}
```

### Phase 3: CLI & Integration (2 days)

Build the command-line interface:

#### Days 11-12: CLI Development
- [ ] Create CLI entry point with command parser
- [ ] Add pretty output formatting
- [ ] Implement error reporting
- [ ] End-to-end testing

**Commands**:
```bash
xdd specify "Build web app with OAuth"  # Creates requirements
xdd validate                            # Validates specification
xdd query "list AUTH requirements"      # Queries data
```

### Phase 4: Design Stage (5 days) - FUTURE

Component discovery and technical design:
- Component boundary analysis
- Technology research framework
- Decision recording system
- Design documentation generation

### Phase 5: Tasks Stage (5 days) - FUTURE

Task generation with TDD enforcement:
- Task generation from design
- Priority assignment algorithm
- TDD checklist enforcement
- Validation framework

---

## Specification Stage Details

### Data Models

#### Project Metadata

```typescript
const ProjectMetadataSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
```

#### Requirement Schema

```typescript
const RequirementSchema = z.object({
  // Identity (collision-resistant nanoid)
  id: z.string().regex(/^REQ-[A-Z0-9]+-[a-zA-Z0-9_-]{10}$/),

  // Classification
  type: z.enum(['ubiquitous', 'event', 'state', 'optional']),
  category: z.string().min(1).max(20),  // User-defined

  // Core content
  description: z.string().min(10).max(500),
  rationale: z.string().min(10).max(500),

  // Acceptance criteria
  acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1).max(10),

  // Metadata
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  created_at: z.string().datetime(),
});
```

#### Acceptance Criteria Schema

```typescript
type AcceptanceCriterion =
  | BehavioralCriterion
  | AssertionCriterion;

interface BehavioralCriterion {
  id: string;  // AC-[nanoid(16)]
  type: 'behavioral';
  given: string;  // Precondition
  when: string;   // Trigger event
  then: string;   // Expected outcome
  created_at: string;
}

interface AssertionCriterion {
  id: string;  // AC-[nanoid(16)]
  type: 'assertion';
  statement: string;  // Single assertion
  created_at: string;
}
```

### Changelog (Event Sourcing)

#### Event Types (8 Total)

```typescript
type ChangelogEvent =
  // Requirement lifecycle
  | RequirementCreated
  | RequirementDeleted

  // Content changes (field-level)
  | RequirementModified

  // Category changes (identity change)
  | RequirementRecategorized

  // Acceptance criteria
  | AcceptanceCriterionAdded
  | AcceptanceCriterionModified
  | AcceptanceCriterionDeleted

  // Project metadata
  | ProjectMetadataUpdated;
```

#### Changelog Structure with Snapshots

```typescript
interface Changelog {
  version: string;  // SemVer
  events: ChangelogEvent[];  // Append-only
  last_snapshot: string;     // Timestamp of last snapshot

  // Fast-lookup indexes
  indexes: {
    by_requirement: Record<string, number[]>;  // req_id → event indices
    by_type: Record<string, number[]>;         // event_type → indices
    by_category: Record<string, number[]>;     // category → indices
  };

  metadata: {
    total_events: number;
    events_since_snapshot: number;
    events_by_type: Record<string, number>;
  };
}
```

### EARS Format System

**Decision Tree**:
```
Does requirement describe continuous behavior?
├─ YES → UBIQUITOUS ("always", "continuously", "maintain")
└─ NO → Is it triggered by events?
    ├─ YES → EVENT-DRIVEN ("when", "after", "upon")
    └─ NO → Is it active during states?
        ├─ YES → STATE-DRIVEN ("while", "during", "in state")
        └─ NO → OPTIONAL ("where available", "if supported")
```

---

## Design Stage (Future)

The design stage bridges WHAT (specs) with HOW (implementation):
- Component discovery through boundary analysis
- Technology research and evaluation
- Decision recording with rationale
- Technical documentation generation

---

## Tasks Stage (Future)

The tasks stage transforms design into implementation:
- Task generation from component specifications
- 4-tier priority system (Critical, Core, Enhancements, Future)
- Mandatory TDD workflow with 6-point checklist
- Independent validation requirement

---

## Critical Implementation Patterns

### ID Generation (Collision-Resistant)

```typescript
import { nanoid } from 'nanoid';

export class IdGenerator {
  private static readonly ID_LENGTH = 10; // ~35 years to 1% collision @ 1000/hour

  static generateRequirementId(category: string): string {
    return `REQ-${category.toUpperCase()}-${nanoid(this.ID_LENGTH)}`;
  }

  static generateAcceptanceCriterionId(): string {
    return `AC-${nanoid(this.ID_LENGTH)}`;
  }

  static generateEventId(): string {
    return `EVT-${nanoid(this.ID_LENGTH)}`;
  }
}
```

### Best-Effort Atomic Write Operations

```typescript
export class AtomicWriter {
  // Note: Provides best-effort atomicity via write-rename pattern
  // Suitable for single-agent use, not ACID-guaranteed
  async writeFiles(files: Array<{path: string, content: string}>) {
    const tempFiles = files.map(f => ({
      original: f.path,
      temp: `${f.path}.tmp.${Date.now()}`,
      content: f.content
    }));

    try {
      // Write all temp files
      await Promise.all(tempFiles.map(f =>
        fs.writeFile(f.temp, f.content, 'utf8')
      ));

      // Best-effort atomic rename
      await Promise.all(tempFiles.map(f =>
        fs.rename(f.temp, f.original)
      ));
    } catch (error) {
      // Cleanup on failure
      await Promise.all(tempFiles.map(f =>
        fs.unlink(f.temp).catch(() => {})
      ));
      throw new Error(`Write failed: ${error.message}`);
    }
  }
}
```

### Advisory Concurrency Control

```typescript
export class FileLock {
  // Advisory locks optimized for single-agent use
  // Provides safety against accidental concurrent operations
  private locks: Map<string, string> = new Map();

  async acquire(resourcePath: string, timeout = 5000): Promise<void> {
    const lockPath = `${resourcePath}.lock`;
    const lockId = nanoid();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Best-effort exclusive create
        await fs.writeFile(lockPath, lockId, { flag: 'wx' });
        this.locks.set(resourcePath, lockPath);
        return;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await new Promise(r => setTimeout(r, 100));
      }
    }
    throw new Error(`Lock acquisition timeout: ${resourcePath}`);
  }

  async release(resourcePath: string): Promise<void> {
    const lockPath = this.locks.get(resourcePath);
    if (lockPath) {
      await fs.unlink(lockPath).catch(() => {});
      this.locks.delete(resourcePath);
    }
  }
}
```

### Input Validation

```typescript
export class InputValidator {
  private static readonly MAX_LENGTH = 10000;
  private static readonly FORBIDDEN_PATTERNS = [
    /\$\{.*\}/,      // Template injection
    /<script/i,      // Script injection
    /\.\.\/\.\.\//,  // Path traversal
  ];

  validateUserInput(input: string): ValidationResult {
    // Length check
    if (input.length > this.MAX_LENGTH) {
      return { valid: false, error: 'Input too long' };
    }

    // Forbidden patterns
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(input)) {
        return { valid: false, error: 'Invalid characters detected' };
      }
    }

    // Sanitize for YAML
    const sanitized = input
      .replace(/[^\x20-\x7E\n\r\t]/g, '') // ASCII only
      .replace(/^[-!&*\[\]{}|>@`"']/gm, ''); // YAML special chars

    return { valid: true, sanitized };
  }
}
```

### Event Sourcing with Snapshots

```typescript
export class ChangelogManager {
  private static readonly SNAPSHOT_INTERVAL = 100;

  async appendEvent(event: ChangelogEvent): Promise<void> {
    const lock = new FileLock();
    await lock.acquire('.xdd/01-specs/changelog.yaml');

    try {
      const changelog = await this.load();
      changelog.events.push(event);
      changelog.events_since_snapshot++;

      // Create snapshot if needed
      if (changelog.events_since_snapshot >= this.SNAPSHOT_INTERVAL) {
        await this.createSnapshot(changelog);
        changelog.last_snapshot = new Date().toISOString();
        changelog.events_since_snapshot = 0;
      }

      // Atomic write
      const writer = new AtomicWriter();
      await writer.writeFiles([
        { path: '.xdd/01-specs/changelog.yaml', content: yaml.stringify(changelog) }
      ]);
    } finally {
      await lock.release('.xdd/01-specs/changelog.yaml');
    }
  }

  private async createSnapshot(changelog: Changelog): Promise<void> {
    const snapshot = {
      version: changelog.version,
      timestamp: new Date().toISOString(),
      eventCount: changelog.events.length,
      state: await this.computeCurrentState(changelog),
    };

    const snapshotPath = `.xdd/01-specs/snapshots/${snapshot.timestamp}.yaml`;
    await fs.writeFile(snapshotPath, yaml.stringify(snapshot));
  }
}
```

---

## Developer Experience

### Single Command Interface

```bash
# Initialize new project
$ xdd specify "Build a web app with OAuth authentication"
# → Creates .xdd/ directory
# → Generates specification.yaml
# → Creates changelog.yaml

# Add feature
$ xdd specify "Add real-time WebSocket notifications"
# → Reads current spec
# → Adds new requirement
# → Updates YAML atomically

# Validate
$ xdd validate
# → Checks schema compliance
# → Verifies EARS format
# → Reports issues

# Query
$ xdd query "list AUTH requirements"
# → Searches specifications
# → Returns formatted results
```

### Error Messages

All errors follow consistent format:
```
[STAGE] Error: <what> | Fix: <how> | Next: <command>
```

Examples:
```
[SPECS] Error: Lock acquisition timeout | Fix: Check for stale locks | Next: rm .xdd/.locks/*
[SPECS] Error: Invalid YAML characters | Fix: Remove special characters | Next: xdd validate
```

---

## Validation Strategy

### Automated Testing

```toml
# mise.toml tasks
[tasks.test]
run = "bun test"
description = "Run all unit tests"

[tasks.test-coverage]
run = "bun test --coverage"
description = "Generate coverage report"

[tasks.test-concurrent]
run = "bun test tests/concurrent/**"
description = "Test concurrent access scenarios"
```

### Quality Gates

**Pre-commit**:
- TypeScript compilation succeeds
- Unit tests pass (80% coverage)
- No linting errors

**Pre-push**:
- Integration tests pass
- Concurrent access tests pass
- Performance benchmarks met

---

## Tooling & Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "nanoid": "^5.0.0",
    "yaml": "^2.5.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  }
}
```

### Development Tools

- **Bun**: Runtime and package manager
- **Biome**: TypeScript/JSON linting
- **Taplo**: TOML formatting
- **markdownlint-cli2**: Markdown linting
- **Mise**: Task runner

---

## Performance & Limits

### System Limits

```yaml
limits:
  requirements:
    max_count: 1000
    max_description_length: 500
    max_rationale_length: 500
  acceptance_criteria:
    max_per_requirement: 10
    max_length: 200
  changelog:
    max_events: 10000
    snapshot_interval: 100
  categories:
    max_count: 50
    max_name_length: 20
```

### Performance Targets

| Operation | Target | Max |
|-----------|--------|-----|
| Create requirement | < 500ms | 1s |
| Validate specification | < 100ms | 500ms |
| Load 1000 requirements | < 1s | 2s |
| Process 10000 events | < 2s | 5s |
| Concurrent operations | 10/sec | 50/sec |

### Scaling Considerations

- **ID Collisions**: nanoid(16) safe for millions of IDs
- **Changelog Growth**: Snapshots every 100 events
- **Concurrent Access**: File locks with 5s timeout
- **Memory Usage**: Stream large files, don't load entirely

---

## Risk Mitigations

### High-Risk Items

1. **Claude API Changes**: Pin SDK version, abstract interface
2. **File System Race Conditions**: Use advisory locks consistently
3. **YAML Corruption**: Validate before writing, keep backups
4. **ID Collisions**: Monitor and alert on duplicates
5. **Performance Degradation**: Implement caching layer if needed

### Contingency Plans

- **If Anthropic SDK breaks**: Fallback to HTTP API directly
- **If file locking fails**: Use lock directories instead
- **If YAML becomes bottleneck**: Migrate to SQLite
- **If snapshots grow large**: Implement incremental snapshots

---

## Key Decisions Summary

### Accepted

1. ✅ Use real `@anthropic-ai/sdk` (not fictional agent SDK)
2. ✅ nanoid(16) for collision-resistant IDs
3. ✅ Atomic writes with write-rename pattern
4. ✅ File-based advisory locks for concurrency
5. ✅ Event sourcing with periodic snapshots
6. ✅ Two acceptance criteria types (Behavioral + Assertion)
7. ✅ User-defined categories (not enum)
8. ✅ No forward links (compute from backlinks)
9. ✅ Input validation and sanitization
10. ✅ Phase 0 foundation before features

### Rejected

1. ❌ Hash-based IDs from SHA256 (collision risk)
2. ❌ Direct YAML writes (corruption risk)
3. ❌ No concurrency control (data loss)
4. ❌ Unbounded event logs (performance)
5. ❌ Self-referential dogfooding (bootstrap paradox)

---

## Bootstrap Strategy

**Do NOT attempt self-referential development**. Instead:

1. **Phase 0**: Build foundation utilities manually
2. **Phase 1**: Implement basic YAML operations
3. **Phase 2**: Add LLM integration
4. **Phase 3**: Build CLI
5. **Then**: Use xdd for future xdd features

---

## Changelog

### 2025-01-30 - V2.0.0

- Complete system redesign from agent-sdd
- Fixed fictional dependencies (now using real Anthropic SDK)
- Implemented collision-resistant ID generation with nanoid
- Added atomic write operations
- Added concurrency control with file locks
- Introduced event sourcing with snapshots
- Created Phase 0 foundation requirements

---

**End of Specification**
