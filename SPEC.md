# xdd: Specification-Driven Development System (V3)

**Version**: 3.0.0

---

## Executive Summary

xdd is a specification-driven development system that transforms natural language requirements into structured, validated artifacts through three stages: **Specs**, **Design**, and **Tasks**. This is V3 - a complete architectural redesign with Go backend, Svelte frontend, and LLM-powered interactive refinement.

**Core Innovation**: Chat-based iterative specification building with LLM agents that understand and refine requirements through conversation, enforced by structured output validation and immutable event sourcing.

**Target Users**: Solo developers and small teams (2-3 people) building internal tools or small-scale applications.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Three-Stage Pipeline](#three-stage-pipeline)
3. [Artifact Directory Structure](#artifact-directory-structure)
4. [Specification Stage Details](#specification-stage-details)
5. [Chat-Based Workflow](#chat-based-workflow)
6. [Session Management](#session-management)
7. [File Locking & Atomicity](#file-locking--atomicity)
8. [LLM Task Specifications](#llm-task-specifications)
9. [Event Sourcing Model](#event-sourcing-model)
10. [Developer Experience](#developer-experience)
11. [Testing Strategy](#testing-strategy)
12. [Performance & Limits](#performance--limits)

---

## System Architecture

### Core Principles

1. **Chat-Based Refinement**: Interactive conversation with LLM for iterative specification building
2. **Immutable Entities**: Requirements and Acceptance Criteria can only be Added or Deleted, never Modified
3. **Event Sourcing**: All changes tracked as immutable append-only events
4. **User Confirmation**: Changes previewed and approved before commit
5. **Global Lock**: Single writer at a time (CLI or Frontend)
6. **Copy-on-Write**: Atomic file updates with full rollback on failure
7. **YAML as Database**: Text-based artifacts are the source of truth
8. **Git for History**: No built-in undo - use Git for version control

### Technology Stack

**Backend**:
- **Language**: Go 1.21+
- **HTTP Server**: `http.ServeMux` (stdlib)
- **WebSocket**: `gorilla/websocket` or `nhooyr.io/websocket`
- **LLM Framework**: [Genkit](https://firebase.google.com/docs/genkit) (Google)
- **LLM Provider**: OpenRouter (multi-model access)
- **Validation**: Go structs with JSON tags
- **YAML**: `gopkg.in/yaml.v3`
- **ID Generation**: `github.com/matoous/go-nanoid`

**Frontend**:
- **Framework**: Svelte 5 with SvelteKit
- **Build Tool**: Vite
- **WebSocket Client**: Native WebSocket API
- **Type Safety**: TypeScript

**Development**:
- **Task Runner**: Mise
- **Linting**: Go (golangci-lint), Svelte (eslint), Markdown (markdownlint)
- **Testing**: Go stdlib testing, Svelte testing library

### Mono-Repo Structure

```
xdd/
├── backend/
│   ├── cmd/
│   │   └── xdd/              # CLI entry point
│   ├── internal/
│   │   ├── api/              # HTTP/WebSocket handlers
│   │   ├── core/             # Business logic
│   │   ├── llm/              # Genkit integration & tasks
│   │   └── repository/       # YAML persistence
│   ├── pkg/
│   │   └── schema/           # Shared types
│   └── scripts/
│       └── record-fixtures.go
├── frontend/
│   ├── src/
│   │   ├── routes/
│   │   ├── lib/
│   │   └── components/
│   └── package.json
├── docs/
│   ├── SPEC.md
│   ├── TODO.md
│   └── ARCHITECTURE.md
└── .mise.toml
```

### Data Flow

```
User Input (CLI or Web)
    ↓
Create In-Memory Session
    ↓
Acquire Global File Lock (.xdd/.lock)
    ↓
Begin Copy-on-Write Transaction
    ↓
┌─────────────────────────────────────┐
│ Iterative LLM Conversation Loop    │
│                                     │
│  User Prompt                        │
│     ↓                               │
│  Execute LLM Tasks:                 │
│    1. Metadata Update               │
│    2. Requirements Delta            │
│    3. Categorization                │
│    4. Requirement Generation        │
│    5. Version Bump                  │
│     ↓                               │
│  Validate Structured Output (Retry) │
│     ↓                               │
│  Build Changelog Preview            │
│     ↓                               │
│  Show User → Satisfied?             │
│     ↓                               │
│  NO → User provides feedback ──┐    │
│            ↑                   │    │
│            └───────────────────┘    │
│     ↓                               │
│  YES → Proceed to Commit            │
└─────────────────────────────────────┘
    ↓
Commit Transaction (Atomic Rename)
    ↓
Release Global Lock
    ↓
Display Final Changelog
```

---

## Three-Stage Pipeline

### Stage 1: Specs (WHAT the system does)

**Input**: Natural language requirements (via chat)
**Processing**: Interactive refinement into EARS-formatted specifications
**Output**: `specification.yaml` + `changelog.yaml`
**Interface**: `xdd specify` (CLI) or WebSocket chat (Frontend)

### Stage 2: Design (HOW to build it)

**Input**: Specifications from Stage 1
**Processing**: Component discovery, technology research, architectural decisions
**Output**: Component designs, API specs, technology decisions

### Stage 3: Tasks (BUILD the system)

**Input**: Design specifications from Stage 2
**Processing**: Task generation with TDD enforcement
**Output**: Prioritized backlog with test-first workflow

---

## Artifact Directory Structure

```
.xdd/
├── .lock                       # Global lock file (PID + metadata)
├── config.yml                  # Project configuration
├── 01-specs/
│   ├── specification.yaml      # Current requirements state
│   ├── changelog.yaml          # Event log
│   └── snapshots/              # Periodic state snapshots
│       └── 2025-10-01T12-00-00.yaml
├── 02-design/                  # Design artifacts
│   └── ...
└── 03-tasks/                   # Task backlog
    └── ...
```

**Notes**:
- `.lock` is a single file at `.xdd/.lock` (not a directory)
- Auto-created on first `xdd specify` if not present
- YAML files are human-readable and Git-friendly

---

## Specification Stage Details

### Entity Schemas

#### Project Metadata

```go
type ProjectMetadata struct {
    Name        string    `yaml:"name" json:"name"`                 // 1-100 chars
    Description string    `yaml:"description" json:"description"`   // 10-1000 chars
    Version     string    `yaml:"version" json:"version"`           // SemVer
    CreatedAt   time.Time `yaml:"created_at" json:"created_at"`
    UpdatedAt   time.Time `yaml:"updated_at" json:"updated_at"`
}
```

#### Requirement

```go
type Requirement struct {
    ID                 string               `yaml:"id" json:"id"`                   // REQ-{CATEGORY}-{nanoid(10)}
    Type               EARSType             `yaml:"type" json:"type"`               // ubiquitous|event|state|optional
    Category           string               `yaml:"category" json:"category"`       // User-defined, 1-20 chars
    Description        string               `yaml:"description" json:"description"` // 10-500 chars, EARS-formatted
    Rationale          string               `yaml:"rationale" json:"rationale"`     // 10-500 chars
    AcceptanceCriteria []AcceptanceCriterion `yaml:"acceptance_criteria" json:"acceptance_criteria"` // 1-10 items
    Priority           Priority             `yaml:"priority" json:"priority"`       // critical|high|medium|low
    CreatedAt          time.Time            `yaml:"created_at" json:"created_at"`
}

type EARSType string

const (
    EARSUbiquitous EARSType = "ubiquitous" // "The system shall always..."
    EARSEvent      EARSType = "event"      // "When X, the system shall..."
    EARSState      EARSType = "state"      // "While X, the system shall..."
    EARSOptional   EARSType = "optional"   // "Where X, the system shall..."
)

type Priority string

const (
    PriorityCritical Priority = "critical" // System cannot function without this
    PriorityHigh     Priority = "high"     // Core feature, needed for MVP
    PriorityMedium   Priority = "medium"   // Important but not blocking
    PriorityLow      Priority = "low"      // Nice to have
)
```

#### Acceptance Criteria

```go
type AcceptanceCriterion interface {
    GetID() string
    GetType() string
    GetCreatedAt() time.Time
}

// Behavioral: Given/When/Then format
type BehavioralCriterion struct {
    ID        string    `yaml:"id" json:"id"`             // AC-{nanoid(10)}
    Type      string    `yaml:"type" json:"type"`         // "behavioral"
    Given     string    `yaml:"given" json:"given"`       // Precondition
    When      string    `yaml:"when" json:"when"`         // Trigger event
    Then      string    `yaml:"then" json:"then"`         // Expected outcome
    CreatedAt time.Time `yaml:"created_at" json:"created_at"`
}

// Assertion: Single testable statement
type AssertionCriterion struct {
    ID        string    `yaml:"id" json:"id"`             // AC-{nanoid(10)}
    Type      string    `yaml:"type" json:"type"`         // "assertion"
    Statement string    `yaml:"statement" json:"statement"` // Single assertion
    CreatedAt time.Time `yaml:"created_at" json:"created_at"`
}
```

#### Specification (Root Document)

```go
type Specification struct {
    Metadata     ProjectMetadata `yaml:"metadata" json:"metadata"`
    Requirements []Requirement   `yaml:"requirements" json:"requirements"`
    Categories   []string        `yaml:"categories" json:"categories"` // Derived from requirements
}
```

### EARS Format System

The EARS (Easy Approach to Requirements Syntax) classification system guides requirement writing:

**Decision Tree**:
```
Does the requirement describe continuous behavior?
├─ YES → UBIQUITOUS
│         Pattern: "The system shall always/continuously [behavior]"
│         Example: "The system shall always encrypt data at rest"
│
└─ NO → Is it triggered by specific events?
    ├─ YES → EVENT-DRIVEN
    │         Pattern: "When [trigger], the system shall [action]"
    │         Example: "When user submits login, the system shall validate credentials"
    │
    └─ NO → Is it active during specific states?
        ├─ YES → STATE-DRIVEN
        │         Pattern: "While [condition], the system shall [behavior]"
        │         Example: "While user is authenticated, the system shall display profile menu"
        │
        └─ NO → OPTIONAL
                  Pattern: "Where [condition], the system shall [behavior]"
                  Example: "Where OAuth is unavailable, the system shall offer email login"
```

**LLM Prompt Integration**: This decision tree is included in the categorization prompt to ensure consistent classification.

---

## Chat-Based Workflow

### CLI Session Flow

```bash
$ xdd specify "Build a collaborative task manager with OAuth and file attachments"

🔒 Acquiring specification lock...
✅ Lock acquired

🤖 Analyzing your request...

📋 I'll create specifications for your collaborative task manager.
   Generating metadata and requirements...

[... LLM processing ...]

📊 Proposed Changes (Session Start):

PROJECT:
  Name: TaskMaster
  Description: A collaborative task management application with OAuth authentication
               and file attachment capabilities
  Version: 0.1.0

CATEGORIES (4):
  - AUTH: User authentication and authorization
  - TASKS: Task creation, assignment, and management
  - FILES: File attachment and storage
  - COLLAB: Collaboration features

REQUIREMENTS (8):
  [+] REQ-AUTH-a8b2f91k: OAuth provider integration
      Type: event-driven
      Priority: high
      When user initiates OAuth login, the system shall redirect to provider
      Acceptance Criteria: 3 behavioral, 1 assertion

  [+] REQ-TASKS-c3d4e5f6: Task creation
      Type: event-driven
      Priority: critical
      ...

  [+] REQ-FILES-g7h8i9j0: File attachment to tasks
      ...

  (6 more requirements...)

VERSION: 0.1.0

Are you satisfied with these specifications? [yes/no/feedback]:
> feedback

📝 What would you like to change?
> Add real-time WebSocket notifications when tasks are assigned

🤖 Understanding your feedback...
   Updating specifications...

📊 Updated Changes:

REQUIREMENTS:
  [+] REQ-NOTIFY-k1l2m3n4: Real-time task assignment notifications
      Type: event-driven
      Priority: high
      When task is assigned to user, the system shall send WebSocket notification
      Acceptance Criteria: 2 behavioral, 1 assertion

CATEGORIES:
  [+] NOTIFY: Notification system

VERSION: 0.1.0 → 0.1.1 (minor - new feature)

Are you satisfied with these specifications? [yes/no/feedback]:
> yes

✅ Committing changes...
   Writing specification.yaml
   Writing changelog.yaml
   Updating version to 0.1.1

🔓 Releasing lock

📁 Changes saved to .xdd/01-specs/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGELOG (9 events):

  [RequirementAdded] REQ-AUTH-a8b2f91k
    OAuth provider integration

  [RequirementAdded] REQ-TASKS-c3d4e5f6
    Task creation

  ... (7 more events)

  [VersionBumped] 0.1.0 → 0.1.1
    Reason: New notification feature added
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Specification complete!
   Next: xdd design (coming soon)
```

### Frontend WebSocket Session

```typescript
// Frontend establishes WebSocket connection
const ws = new WebSocket('ws://localhost:8080/ws/specify');

// Send initial prompt
ws.send(JSON.stringify({
  type: 'prompt',
  content: 'Build a collaborative task manager...'
}));

// Receive progress updates
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'progress':
      // "Analyzing request..."
      // "Generating requirements..."
      showProgress(msg.content);
      break;

    case 'preview':
      // Show changelog preview, await user confirmation
      showChangelog(msg.changelog);
      break;

    case 'request_feedback':
      // Ask if user is satisfied
      promptUser(msg.question);
      break;

    case 'committed':
      // Changes saved
      showSuccess(msg.changelog);
      ws.close();
      break;
  }
};
```

---

## Session Management

### CLI Sessions

**Characteristics**:
- Entirely in-memory (no persistence)
- Bound to process lifecycle
- Ctrl+C = session lost (by design)
- Holds global file lock for duration

**Implementation**:
```go
type CLISession struct {
    State      SessionState
    Messages   []Message
    Changelog  []ChangelogEvent
    Lock       *FileLock
}

func (s *CLISession) Run(initialPrompt string) error {
    // Acquire global lock
    if err := s.Lock.Acquire(); err != nil {
        return fmt.Errorf("failed to acquire lock: %w", err)
    }
    defer s.Lock.Release()

    // Interactive loop
    for !s.State.Committed {
        response := s.ProcessPrompt(initialPrompt)

        if response.NeedsFeedback {
            initialPrompt = promptUser(response.Question)
            continue
        }

        if userConfirms(response.Changelog) {
            s.Commit()
            break
        }

        initialPrompt = promptUser("What changes would you like?")
    }

    return nil
}
```

### WebSocket Sessions

**Characteristics**:
- In-memory per connection
- Connection drop = session lost
- Acquires global lock on session start
- Releases lock on disconnect

**Implementation**:
```go
type WebSocketSession struct {
    ID         string
    Conn       *websocket.Conn
    State      SessionState
    Messages   []Message
    Changelog  []ChangelogEvent
    Lock       *FileLock
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, _ := upgrader.Upgrade(w, r, nil)
    defer conn.Close()

    session := NewWebSocketSession(conn)

    // Acquire lock
    if err := session.Lock.Acquire(); err != nil {
        session.SendError("Specification locked by another process")
        return
    }
    defer session.Lock.Release()

    // Message loop
    for {
        var msg Message
        if err := conn.ReadJSON(&msg); err != nil {
            break // Connection closed
        }

        response := session.ProcessMessage(msg)
        conn.WriteJSON(response)

        if response.Type == "committed" {
            break
        }
    }
}
```

---

## File Locking & Atomicity

### Global File Lock

**Lock File**: `.xdd/.lock`

**Lock Structure**:
```go
type LockFile struct {
    PID       int       `json:"pid"`
    Hostname  string    `json:"hostname"`
    Interface string    `json:"interface"` // "cli" or "web"
    Timestamp time.Time `json:"timestamp"`
}
```

**Lock Acquisition with Stale Detection**:
```go
func (l *FileLock) Acquire() error {
    lockPath := ".xdd/.lock"

    // Try exclusive create
    lockData := LockFile{
        PID:       os.Getpid(),
        Hostname:  getHostname(),
        Interface: l.interfaceType,
        Timestamp: time.Now(),
    }

    data, _ := json.Marshal(lockData)
    err := os.WriteFile(lockPath, data, 0644)
    if err == nil {
        return nil // Lock acquired
    }

    // Lock exists - check if stale
    existing, _ := readLockFile(lockPath)

    // Process dead?
    if !processExists(existing.PID) {
        log.Warn("Stale lock detected (PID %d dead), stealing", existing.PID)
        return l.Steal(lockPath, lockData)
    }

    // Lock too old? (30min timeout)
    if time.Since(existing.Timestamp) > 30*time.Minute {
        log.Warn("Ancient lock detected (%s old), stealing", time.Since(existing.Timestamp))
        return l.Steal(lockPath, lockData)
    }

    // Lock is active
    return fmt.Errorf("specification locked by %s (PID %d, %s ago)",
        existing.Interface, existing.PID, time.Since(existing.Timestamp))
}

func (l *FileLock) Steal(lockPath string, newLockData LockFile) error {
    data, _ := json.Marshal(newLockData)
    return os.WriteFile(lockPath, data, 0644)
}

func (l *FileLock) Release() error {
    return os.Remove(".xdd/.lock")
}
```

**Force Unlock CLI**:
```bash
$ xdd unlock --force

⚠️  Current lock:
    Interface: cli
    PID: 12345 (not running)
    Age: 15m ago

Force unlock? [y/N]: y
✅ Lock released
```

### Copy-on-Write Atomic Updates

**Transaction Pattern**:
```go
type CopyOnWriteTx struct {
    baseDir   string // .xdd/
    tempDir   string // .xdd.tmp.<timestamp>/
    backupDir string // .xdd.backup.<timestamp>/
}

func (tx *CopyOnWriteTx) Begin() error {
    tx.tempDir = fmt.Sprintf("%s.tmp.%d", tx.baseDir, time.Now().Unix())

    // Copy entire .xdd/ → .xdd.tmp.<ts>/
    return copyDir(tx.baseDir, tx.tempDir)
}

func (tx *CopyOnWriteTx) WriteFile(path string, content []byte) error {
    fullPath := filepath.Join(tx.tempDir, path)
    return os.WriteFile(fullPath, content, 0644)
}

func (tx *CopyOnWriteTx) Commit() error {
    tx.backupDir = fmt.Sprintf("%s.backup.%d", tx.baseDir, time.Now().Unix())

    // Atomic swap:
    // 1. .xdd/ → .xdd.backup.<ts>/
    if err := os.Rename(tx.baseDir, tx.backupDir); err != nil {
        return err
    }

    // 2. .xdd.tmp.<ts>/ → .xdd/
    if err := os.Rename(tx.tempDir, tx.baseDir); err != nil {
        // Rollback
        os.Rename(tx.backupDir, tx.baseDir)
        return err
    }

    // 3. Delete backup
    return os.RemoveAll(tx.backupDir)
}

func (tx *CopyOnWriteTx) Rollback() error {
    return os.RemoveAll(tx.tempDir)
}
```

**Usage**:
```go
tx := NewCopyOnWriteTx(".xdd")
if err := tx.Begin(); err != nil {
    return err
}

// Modify files in temp directory
tx.WriteFile("01-specs/specification.yaml", specYAML)
tx.WriteFile("01-specs/changelog.yaml", changelogYAML)

// Validate
if err := validateAll(tx.tempDir); err != nil {
    tx.Rollback()
    return err
}

// Commit atomically
return tx.Commit()
```

---

## LLM Task Specifications

All LLM tasks use Genkit with structured output validation. Tasks are executed sequentially, with retry logic for validation failures.

### Task 1: Metadata Update

**Purpose**: Generate or update project name and description

**Input**:
```go
type MetadataTaskInput struct {
    Existing      *ProjectMetadata `json:"existing"`       // null for new projects
    UpdateRequest string           `json:"update_request"` // User's natural language
    IsNewProject  bool             `json:"is_new_project"`
}
```

**Output**:
```go
type MetadataTaskOutput struct {
    Name        string `json:"name"`        // 2-3 words, PascalCase
    Description string `json:"description"` // 1-2 sentences
    Changed     struct {
        Name        bool `json:"name"`
        Description bool `json:"description"`
    } `json:"changed"`
    Reasoning string `json:"reasoning"`
}
```

**Validation**:
- Name: 1-100 chars, no special chars
- Description: 10-1000 chars
- Retry up to 3 times if invalid

### Task 2: Requirements Delta Analysis

**Purpose**: Identify what requirements to add/remove based on user input

**Input**:
```go
type RequirementsDeltaInput struct {
    ExistingRequirements []Requirement `json:"existing_requirements"`
    ExistingCategories   []string      `json:"existing_categories"`
    UpdateRequest        string        `json:"update_request"`
}
```

**Output**:
```go
type RequirementsDeltaOutput struct {
    ToRemove []struct {
        ID        string `json:"id"`
        Reasoning string `json:"reasoning"`
    } `json:"to_remove"`

    ToAdd []struct {
        Category          string   `json:"category"`    // Existing or new
        BriefDescription  string   `json:"brief_description"`
        EARSType          string   `json:"ears_type"`
        EstimatedPriority string   `json:"estimated_priority"`
        Reasoning         string   `json:"reasoning"`
    } `json:"to_add"`

    AmbiguousModifications []struct {
        PossibleTargets []string `json:"possible_targets"` // Requirement IDs
        Clarification   string   `json:"clarification"`    // Question for user
    } `json:"ambiguous_modifications,omitempty"`
}
```

**Ambiguity Handling**:
- If `AmbiguousModifications` is non-empty, pause and ask user for clarification
- User response fed back into delta task with additional context

### Task 3: Categorization

**Purpose**: Determine final categories based on all requirements (new + existing)

**Input**:
```go
type CategorizationInput struct {
    ProjectName          string   `json:"project_name"`
    ProjectDescription   string   `json:"project_description"`
    AllRequirementBriefs []string `json:"all_requirement_briefs"` // High-level descriptions
}
```

**Output**:
```go
type CategorizationOutput struct {
    Categories []struct {
        Name        string `json:"name"`        // 1-20 chars, uppercase
        Description string `json:"description"` // What this category covers
        Count       int    `json:"count"`       // Expected requirement count
    } `json:"categories"`

    RequirementMapping map[string]string `json:"requirement_mapping"` // brief → category
    Reasoning          string            `json:"reasoning"`
}
```

**Note**: This task uses a thinking model (e.g., `gemini-2.0-flash-thinking`) to handle the dual concern of categorizing requirements and potentially suggesting category changes.

### Task 4: Requirement Generation

**Purpose**: Generate full requirement details for each new requirement

**Input** (per requirement):
```go
type RequirementGenInput struct {
    Category          string   `json:"category"`
    EARSType          string   `json:"ears_type"`
    BriefDescription  string   `json:"brief_description"`
    EstimatedPriority string   `json:"estimated_priority"`
    Context           struct {
        ProjectName        string        `json:"project_name"`
        ProjectDescription string        `json:"project_description"`
        ExistingRequirements []Requirement `json:"existing_requirements"`
        UpdateRequest      string        `json:"update_request"`
    } `json:"context"`
}
```

**Output**:
```go
type RequirementGenOutput struct {
    Description        string               `json:"description"` // EARS-formatted
    Rationale          string               `json:"rationale"`
    AcceptanceCriteria []AcceptanceCriterion `json:"acceptance_criteria"` // 3-7 items
    Priority           string               `json:"priority"`
}
```

**EARS Format Enforcement**: Prompt includes decision tree and examples for each type

**Parallel Execution**: Multiple requirements can be generated in parallel (subject to rate limits)

### Task 5: Version Bump Decision

**Purpose**: Determine appropriate semantic version bump

**Input**:
```go
type VersionBumpInput struct {
    CurrentVersion string `json:"current_version"`
    Changes        struct {
        RequirementsAdded    int  `json:"requirements_added"`
        RequirementsRemoved  int  `json:"requirements_removed"`
        MetadataChanged      bool `json:"metadata_changed"`
    } `json:"changes"`
    ChangeDescriptions []string `json:"change_descriptions"` // Human-readable summaries
    FullChangelog      []ChangelogEvent `json:"full_changelog"`
}
```

**Output**:
```go
type VersionBumpOutput struct {
    NewVersion string `json:"new_version"` // SemVer
    BumpType   string `json:"bump_type"`   // "major", "minor", "patch"
    Reasoning  string `json:"reasoning"`
}
```

**Guidelines for LLM**:
- **Major**: Breaking changes (requirements removed, fundamental scope shift)
- **Minor**: New features (requirements added)
- **Patch**: Clarifications, refinements, metadata updates only

---

## Event Sourcing Model

### Immutable Entity Philosophy

**Core Principle**: Requirements and Acceptance Criteria are **immutable**. To "modify" an entity:
1. Delete the old entity (creates `*Deleted` event with snapshot)
2. Add the new entity (creates `*Added` event)

This creates a perfect audit trail and simplifies conflict resolution.

### Event Types

```go
type ChangelogEvent interface {
    EventType() string
    EventID() string
    Timestamp() time.Time
}

// Requirements (immutable)
type RequirementAdded struct {
    EventID     string      `yaml:"event_id" json:"event_id"`
    Requirement Requirement `yaml:"requirement" json:"requirement"` // Full object
    Timestamp   time.Time   `yaml:"timestamp" json:"timestamp"`
}

type RequirementDeleted struct {
    EventID     string      `yaml:"event_id" json:"event_id"`
    RequirementID string    `yaml:"requirement_id" json:"requirement_id"`
    Requirement Requirement `yaml:"requirement" json:"requirement"` // Snapshot
    Timestamp   time.Time   `yaml:"timestamp" json:"timestamp"`
}

// Acceptance Criteria (immutable)
type AcceptanceCriterionAdded struct {
    EventID       string              `yaml:"event_id" json:"event_id"`
    RequirementID string              `yaml:"requirement_id" json:"requirement_id"`
    Criterion     AcceptanceCriterion `yaml:"criterion" json:"criterion"`
    Timestamp     time.Time           `yaml:"timestamp" json:"timestamp"`
}

type AcceptanceCriterionDeleted struct {
    EventID       string              `yaml:"event_id" json:"event_id"`
    RequirementID string              `yaml:"requirement_id" json:"requirement_id"`
    CriterionID   string              `yaml:"criterion_id" json:"criterion_id"`
    Criterion     AcceptanceCriterion `yaml:"criterion" json:"criterion"` // Snapshot
    Timestamp     time.Time           `yaml:"timestamp" json:"timestamp"`
}

// Categories (can be renamed)
type CategoryAdded struct {
    EventID   string    `yaml:"event_id" json:"event_id"`
    Name      string    `yaml:"name" json:"name"`
    Timestamp time.Time `yaml:"timestamp" json:"timestamp"`
}

type CategoryDeleted struct {
    EventID   string    `yaml:"event_id" json:"event_id"`
    Name      string    `yaml:"name" json:"name"`
    Timestamp time.Time `yaml:"timestamp" json:"timestamp"`
}

type CategoryRenamed struct {
    EventID   string    `yaml:"event_id" json:"event_id"`
    OldName   string    `yaml:"old_name" json:"old_name"`
    NewName   string    `yaml:"new_name" json:"new_name"`
    Timestamp time.Time `yaml:"timestamp" json:"timestamp"`
}

// Metadata (can be updated)
type ProjectMetadataUpdated struct {
    EventID     string          `yaml:"event_id" json:"event_id"`
    OldMetadata ProjectMetadata `yaml:"old_metadata" json:"old_metadata"`
    NewMetadata ProjectMetadata `yaml:"new_metadata" json:"new_metadata"`
    Timestamp   time.Time       `yaml:"timestamp" json:"timestamp"`
}

// Version
type VersionBumped struct {
    EventID    string    `yaml:"event_id" json:"event_id"`
    OldVersion string    `yaml:"old_version" json:"old_version"`
    NewVersion string    `yaml:"new_version" json:"new_version"`
    BumpType   string    `yaml:"bump_type" json:"bump_type"` // "major"|"minor"|"patch"
    Reasoning  string    `yaml:"reasoning" json:"reasoning"`
    Timestamp  time.Time `yaml:"timestamp" json:"timestamp"`
}
```

### Changelog Structure

```go
type Changelog struct {
    Version       string           `yaml:"version" json:"version"`
    Events        []ChangelogEvent `yaml:"events" json:"events"`
    LastSnapshot  string           `yaml:"last_snapshot" json:"last_snapshot"` // ISO timestamp
    EventsSinceSnapshot int        `yaml:"events_since_snapshot" json:"events_since_snapshot"`
}
```

**Snapshots**: Every 100 events, create a snapshot in `.xdd/01-specs/snapshots/` to speed up state reconstruction.

---

## Developer Experience

### CLI Commands

```bash
# Initialize project (optional - auto-runs on first specify)
$ xdd init

# Interactive specification session
$ xdd specify "Build a web app with OAuth authentication"

# Force unlock stale lock
$ xdd unlock --force

# Additional commands
$ xdd validate
$ xdd query "list AUTH requirements"
$ xdd design
$ xdd tasks
```

### Error Handling

**Validation Retry Loop**:
```
LLM generates structured output
    ↓
Validate against Go struct
    ↓
Valid? → Proceed
    ↓
Invalid? → Retry (up to 3 attempts)
    ↓
Feed validation errors back to LLM
    ↓
Still invalid after 3 retries? → Abort session, release lock, show error
```

**Lock Errors**:
```bash
$ xdd specify "..."

❌ Error: Specification locked

Lock held by: web (PID 12345)
Age: 2m ago

Options:
  1. Wait for other process to finish
  2. Run 'xdd unlock --force' if process is stuck
```

**LLM Errors** (network, rate limit, etc.):
- Exponential backoff for retries
- Up to 3 retries per task
- After 3 failures: abort, release lock, show error

### User Confirmation Flow

**Terminal**:
```
Are you satisfied with these specifications? [yes/no/feedback]:
> feedback

📝 What would you like to change?
> Add support for multiple file formats

[... LLM processing ...]

Are you satisfied with these specifications? [yes/no/feedback]:
> yes

✅ Committing changes...
```

**Web UI**:
```svelte
<button on:click={sendFeedback}>Provide Feedback</button>
<button on:click={commit}>Commit Changes</button>
<button on:click={cancel}>Cancel</button>

{#if showFeedbackInput}
  <textarea bind:value={userFeedback} placeholder="What would you like to change?" />
  <button on:click={submitFeedback}>Submit</button>
{/if}
```

---

## Testing Strategy

### Fixture-Based Testing

**Approach**: Record real LLM responses once, replay for fast deterministic tests

**Recording**:
```bash
$ cd backend
$ go run scripts/record-fixtures.go

🎬 Recording fixtures...
📡 Calling real LLM APIs (this will cost ~$0.50)

✓ metadata-new-project (2.3s) - $0.02
✓ requirements-delta-add-feature (3.1s) - $0.05
✓ requirement-gen-oauth (1.8s) - $0.03
✓ categorization (2.0s) - $0.04
✓ version-bump-minor (0.5s) - $0.01

💾 Saved 5 fixtures to internal/llm/testdata/

Total cost: $0.15
```

**Fixture Structure**:
```go
type Fixture struct {
    Name      string      `json:"name"`
    Input     interface{} `json:"input"`
    Output    interface{} `json:"output"`
    Model     string      `json:"model"`
    Timestamp time.Time   `json:"timestamp"`
}
```

**Replay in Tests**:
```go
func TestMetadataTask_NewProject(t *testing.T) {
    // Load fixture
    fixture := loadFixture("metadata-new-project.json")

    // Create mock LLM
    mockLLM := &MockLLM{Response: fixture.Output}

    // Run task
    task := NewMetadataTask(mockLLM)
    result := task.Execute(fixture.Input)

    // Assert
    assert.Equal(t, "TaskMaster", result.Name)
    assert.NotEmpty(t, result.Description)
}
```

**Live E2E Tests** (opt-in):
```bash
# Run with fixtures (default, fast)
$ go test ./...
ok    xdd/internal/llm/tasks  0.234s

# Run with real LLM calls (slow, requires API key)
$ go test -tags=live ./internal/llm/tasks
ok    xdd/internal/llm/tasks  18.456s
```

### Test Isolation

**File System**:
- Use `os.MkdirTemp()` for each test
- Automatically cleaned up by OS
- No mocks - real file operations

**Example**:
```go
func TestSpecificationWriter(t *testing.T) {
    tempDir, _ := os.MkdirTemp("", "xdd-test-*")
    defer os.RemoveAll(tempDir)

    writer := NewSpecificationWriter(tempDir)
    err := writer.Write(spec)

    // Assert files exist
    assert.FileExists(t, filepath.Join(tempDir, ".xdd/01-specs/specification.yaml"))
}
```

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
    max_given_when_then_length: 200
    max_assertion_length: 200
  changelog:
    max_events: 10000
    snapshot_interval: 100
  categories:
    max_count: 50
    max_name_length: 20
  metadata:
    max_name_length: 100
    max_description_length: 1000
  sessions:
    max_message_history: 100
    lock_timeout: 30m
```

### Performance Targets

| Operation | Target | Max |
|-----------|--------|-----|
| Lock acquisition | < 10ms | 100ms |
| Copy-on-write (100 reqs) | < 500ms | 2s |
| LLM task (single) | < 3s | 10s |
| Full session (new project) | < 60s | 120s |
| Changelog snapshot | < 100ms | 500ms |

### Scaling Considerations

- **ID Collisions**: nanoid(10) safe for millions of IDs (~35 years at 1000/hour to 1% collision)
- **Changelog Growth**: Snapshots every 100 events keep reconstruction fast
- **Lock Contention**: Single-writer design - not intended for high concurrency
- **Memory Usage**: Sessions are ephemeral, no long-term memory accumulation
- **File Size**: YAML stays small (<1MB for 1000 requirements)

---

## Key Decisions Summary

### Accepted ✅

1. Go backend + Svelte frontend (clear separation, type-safe)
2. Genkit + OpenRouter (multi-model flexibility)
3. WebSocket sessions (natural for chat, ephemeral by design)
4. Global file lock (prevents corruption, simple model)
5. Copy-on-write atomicity (simple, reliable)
6. Immutable entities (perfect audit trail, simplifies logic)
7. Chat-based workflow (forgiving, iterative)
8. User confirmation (transparency, control)
9. Categories from requirements (philosophical correctness)
10. Fixture-based testing (fast, deterministic)
11. Git for version control (don't reinvent the wheel)
12. Mono-repo structure (easier development)
13. EARS format system (proven requirements methodology)
14. LLM for version bumping (nuanced decision-making)

### Rejected ❌

1. Persistent sessions (complexity, not needed for use case)
2. Multi-writer support (not target use case)
3. Built-in undo/rollback (Git handles this)
4. Deterministic version bumping (LLM can be smarter)
5. Separate category management (derived from requirements)
6. Complex lock queuing (fail-fast is simpler)
7. Filesystem mocking in tests (use real temp dirs)
8. Requirement modification events (immutable is cleaner)

---

## Future Enhancements

**Stage 2: Design**:
- Component discovery from requirements
- Technology research (may integrate Claude Code/Gemini)
- Architecture decision records
- API specification generation

**Stage 3: Tasks**:
- TDD-enforced task generation
- Priority-based backlog
- Test checklist validation

**Other**:
- Query/search commands
- Requirement diffing
- Export to other formats (Markdown, JSON)
- Requirement tagging
- Cross-requirement relationships

---

**End of Specification**
