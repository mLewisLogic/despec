# xdd V3 Implementation Tasks

**Version**: 3.0.2
**Last Updated**: 2025-10-01
**Total Tasks**: ~163 (refined post-CEO review)
**Execution**: Top-to-bottom, sequential

---

## Overview

This document breaks down xdd V3 implementation into ultra-granular tasks. Each task is:
- **Small**: 30-90 minutes to complete
- **Testable**: Clear success/failure criteria
- **Self-contained**: Can be completed without architectural decisions
- **Sequential**: Execute top-to-bottom with minimal reordering

**Guiding Principles**:
1. Foundation first (logging, errors, debug) before business logic
2. Research before implementation
3. Validation checkpoints after logical groupings
4. Error recovery tasks AFTER base implementation
5. Each task builds on working foundation

**Task Format**:
```
### TASK-XXX: Brief Description

**Goal**: What this accomplishes
**Files**: What gets created/modified
**Success**: How to verify completion
**Dependencies**: Previous tasks required
**Notes**: Additional context
```

---

## Phase 0: Research & Planning (4 tasks)

### TASK-001: Research GenKit Integration

**Goal**: Understand GenKit capabilities, structured output, custom providers
**Files**: `research/genkit.md`
**Success**: Document contains OpenRouter integration pattern, validation retry logic, fixture testing approach
**Dependencies**: None
**Notes**: See completed research document. Confirms GenKit is suitable for xdd.

**Status**: ✅ Complete

---

### TASK-002: Research Copy-on-Write Atomicity

**Goal**: Verify atomic file operations work on macOS + Linux
**Files**: `research/copy-on-write-atomicity.md`
**Success**: Document contains write-to-temp + atomic rename pattern with hard link optimization
**Dependencies**: None
**Notes**: See completed research document. Confirms POSIX rename() is sufficient.

**Status**: ✅ Complete

---

### TASK-003: Research OpenAPI Schema Generation

**Goal**: Understand Go struct → JSON schema for OpenAPI documentation
**Files**: `research/json-schema-generation.md`
**Success**: Document contains invopop/jsonschema usage for OpenAPI, confirms Genkit auto-generates LLM schemas
**Dependencies**: None
**Notes**: See completed research document. This is for OpenAPI documentation only; Genkit handles LLM schemas automatically.

**Status**: ✅ Complete

---

### TASK-004: Update CLAUDE.md to Reference Research

**Goal**: Ensure future agents know research documents exist
**Files**: `CLAUDE.md`
**Success**: CLAUDE.md includes `@research/` in read list
**Dependencies**: TASK-001, TASK-002, TASK-003
**Notes**: Helps agents discover technical decisions.

**Status**: ✅ Complete

---

## Phase 1: Foundation Infrastructure (10 tasks)

**Purpose**: Establish logging, error handling, config utilities within existing packages per DESIGN.md.

### TASK-101: Create Backend Directory Structure

**Goal**: Set up Go project layout per DESIGN.md
**Files**: Create directories:
- `backend/cmd/xdd/`
- `backend/internal/api/`
- `backend/internal/core/`
- `backend/internal/llm/`
- `backend/internal/repository/`
- `backend/pkg/schema/`
- `backend/scripts/`

**Success**: All directories exist, match DESIGN.md structure exactly
**Dependencies**: Phase 0 complete
**Notes**: Create empty directories only. No files yet. No `internal/foundation/` package.

---

### TASK-102: Initialize Go Module

**Goal**: Create Go module with appropriate name
**Files**: `backend/go.mod`
**Success**: `go mod init xdd` runs successfully, go.mod created
**Dependencies**: TASK-101
**Notes**: Use module path `xdd` (simple, local project).

---

### TASK-103: Create Structured Logging Utility

**Goal**: Define standard logging interface for all backend code
**Files**: `backend/internal/core/logger.go`
**Success**: Logger supports Info, Warn, Error, Debug with structured fields
**Dependencies**: TASK-102
**Notes**: Use stdlib `log/slog`. Place in `internal/core/` as it's used across all packages. Example:
```go
package core

type Logger interface {
    Info(msg string, fields ...any)
    Warn(msg string, fields ...any)
    Error(msg string, fields ...any)
    Debug(msg string, fields ...any)
}

func NewLogger(level string) Logger {
    var slogLevel slog.Level
    switch level {
    case "debug": slogLevel = slog.LevelDebug
    case "info": slogLevel = slog.LevelInfo
    // ...
    }
    handler := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slogLevel})
    return &slogLogger{logger: slog.New(handler)}
}
```

---

### TASK-104: Create Error Types

**Goal**: Define standard error types for xdd
**Files**: `backend/internal/core/errors.go`
**Success**: Error types for common failures (Validation, Lock, LLM, Network)
**Dependencies**: TASK-102
**Notes**: Use error wrapping with context. Place in `internal/core/` as errors are used across packages:
```go
package core

type ValidationError struct {
    Field   string
    Message string
    Err     error
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

func (e *ValidationError) Unwrap() error { return e.Err }

// Similar for LockError, LLMError, NetworkError
```

---

### TASK-105: Create Environment Configuration Utility

**Goal**: Centralized env var loading with validation
**Files**: `backend/internal/core/config.go`
**Success**: Config struct loads from env vars, validates required fields, supports DEBUG flag
**Dependencies**: TASK-102
**Notes**: Place in `internal/core/` as config is used to initialize all packages:
```go
package core

type Config struct {
    LogLevel         string // DEBUG, INFO, WARN, ERROR
    OpenRouterAPIKey string // Required
    DefaultModel     string // Default: anthropic/claude-3.5-sonnet
}

func LoadConfig() (*Config, error) {
    logLevel := getEnvOrDefault("LOG_LEVEL", "info")

    // DEBUG flag overrides log level
    if os.Getenv("DEBUG") == "1" {
        logLevel = "debug"
    }

    cfg := &Config{
        LogLevel:         logLevel,
        OpenRouterAPIKey: os.Getenv("OPENROUTER_API_KEY"),
        DefaultModel:     getEnvOrDefault("DEFAULT_MODEL", "openrouter/anthropic/claude-3.5-sonnet"),
    }

    if cfg.OpenRouterAPIKey == "" {
        return nil, fmt.Errorf("OPENROUTER_API_KEY required")
    }

    return cfg, nil
}
```

---

### TASK-106: Write Unit Tests for Core Utilities

**Goal**: Verify logger, errors, and config work correctly
**Files**:
- `backend/internal/core/logger_test.go`
- `backend/internal/core/errors_test.go`
- `backend/internal/core/config_test.go`

**Success**: All tests pass
**Dependencies**: TASK-103, TASK-104, TASK-105
**Notes**:
- Logger test: Capture stderr, parse JSON, verify fields
- Errors test: Verify `errors.Is()` and `errors.As()` work with custom types
- Config test: Use `t.Setenv()` to set env vars, test DEBUG flag

---

### TASK-107: Add Error Message Style Guide

**Goal**: Document consistent error message format
**Files**: `docs/ERROR_MESSAGES.md`
**Success**: Guide specifies format: `<context>: <problem> [<suggestion>]`
**Dependencies**: TASK-104
**Notes**: Place in `docs/` directory. Examples:
- Good: `lock acquisition failed: process 1234 holds lock (try 'xdd unlock --force')`
- Bad: `Error: could not acquire lock`

---

### TASK-108: Create Core Package Test Task

**Goal**: Run all core utility tests together
**Files**: Add `.mise.toml` task
**Success**: `mise run go:test:core` runs all core/* tests
**Dependencies**: TASK-106
**Notes**: Add to .mise.toml:
```toml
[tasks."go:test:core"]
run = "cd backend && go test ./internal/core/..."
description = "Run core utility tests"
```

---

### TASK-109: VALIDATION - Foundation Layer Complete

**Goal**: Verify all foundation utilities work together
**Files**: None (validation only)
**Success**:
- All core package tests pass
- Logger writes JSON to stderr at correct levels
- Config loads from env with DEBUG flag support
- Errors wrap correctly
- Debug mode works

**Dependencies**: TASK-111
**Notes**: This is a checkpoint. Do not proceed until all tests pass.

---

## Phase 2: Project Setup (15 tasks)

**Purpose**: Go tooling, linting, CI integration.

### TASK-200: Use gorilla/websocket Library

**Goal**: Use gorilla/websocket for WebSocket implementation
**Files**: None (decision documented here)
**Success**: Team understands we're using gorilla/websocket
**Dependencies**: TASK-102
**Notes**: Using `github.com/gorilla/websocket` per user decision. While the library is archived, it is:
- Stable and battle-tested
- Widely used in production
- Well-documented
- Has no known critical issues

Alternative nhooyr.io/websocket is more modern but gorilla is the chosen implementation.

---

### TASK-201: Add Go Dependencies to go.mod

**Goal**: Install core Go dependencies
**Files**: `backend/go.mod`, `backend/go.sum`
**Success**: Dependencies installed, go.sum generated
**Dependencies**: TASK-200
**Notes**:
```bash
cd backend
go get github.com/firebase/genkit/go@latest
go get github.com/gorilla/websocket@latest
go get gopkg.in/yaml.v3@latest
go get github.com/matoous/go-nanoid/v2@latest
go get golang.org/x/sys/unix@latest
go get github.com/invopop/jsonschema@latest
```

---

### TASK-202: Configure golangci-lint

**Goal**: Set up strict Go linting
**Files**: `backend/.golangci.yml`
**Success**: golangci-lint runs with strict rules
**Dependencies**: TASK-102
**Notes**: Enable linters: govet, errcheck, staticcheck, unused, gosimple, ineffassign, typecheck, gofmt, goimports

---

### TASK-203: Add Go Linting Tasks to .mise.toml

**Goal**: Wire Go linting into mise
**Files**: `.mise.toml`
**Success**: `mise run go:lint` runs golangci-lint
**Dependencies**: TASK-202
**Notes**:
```toml
[tasks."go:fmt"]
run = "cd backend && gofmt -w ."
description = "Format Go code"

[tasks."go:lint"]
run = "cd backend && golangci-lint run ./..."
description = "Lint Go code"

[tasks."go:vet"]
run = "cd backend && go vet ./..."
description = "Run go vet"
```

---

### TASK-204: Add Go Test Tasks to .mise.toml

**Goal**: Wire Go testing into mise
**Files**: `.mise.toml`
**Success**: `mise run go:test` runs all tests
**Dependencies**: TASK-102
**Notes**:
```toml
[tasks."go:test"]
run = "cd backend && go test ./..."
description = "Run all Go tests"

[tasks."go:test:unit"]
run = "cd backend && go test ./internal/... ./pkg/..."
description = "Run unit tests only"

[tasks."go:test:coverage"]
run = "cd backend && go test -coverprofile=coverage.out ./..."
description = "Run tests with coverage"
```

---

### TASK-205: Update lefthook.yml for Go

**Goal**: Run Go linting on pre-commit
**Files**: `lefthook.yml`
**Success**: Pre-commit hook runs Go linting
**Dependencies**: TASK-203
**Notes**: Add to lefthook.yml:
```yaml
pre-commit:
  parallel: true
  commands:
    go-fmt:
      glob: "backend/**/*.go"
      run: cd backend && gofmt -w {staged_files}
    go-lint:
      glob: "backend/**/*.go"
      run: mise run go:lint
```

---

### TASK-206: Update GitHub Actions for Go

**Goal**: CI runs Go linting and tests
**Files**: `.github/workflows/ci.yml`
**Success**: CI passes with Go checks
**Dependencies**: TASK-203, TASK-204
**Notes**: Add Go job:
```yaml
  go-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.21'
      - name: Install dependencies
        run: cd backend && go mod download
      - name: Run tests
        run: cd backend && go test ./...
      - name: Run linters
        run: cd backend && golangci-lint run ./...
```

---

### TASK-207: Create Hello World CLI

**Goal**: Basic Go CLI that compiles and runs
**Files**: `backend/cmd/xdd/main.go`
**Success**: `go run backend/cmd/xdd/main.go` prints "xdd v3.0.0"
**Dependencies**: TASK-102, TASK-105 (uses core config)
**Notes**:
```go
package main

import (
    "fmt"
    "os"
    "xdd/internal/core"
)

func main() {
    cfg, err := core.LoadConfig()
    if err != nil {
        fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
        os.Exit(1)
    }

    logger := core.NewLogger(cfg.LogLevel)
    logger.Info("xdd starting", "version", "3.0.0")

    fmt.Println("xdd v3.0.0")
}
```

---

### TASK-208: Add CLI Build Task to .mise.toml

**Goal**: Build CLI binary
**Files**: `.mise.toml`
**Success**: `mise run go:build` creates `backend/xdd` binary
**Dependencies**: TASK-207
**Notes**:
```toml
[tasks."go:build"]
run = "cd backend && go build -o xdd cmd/xdd/main.go"
description = "Build CLI binary"
```

---

### TASK-209: Add CLI Run Task to .mise.toml

**Goal**: Quick way to run CLI during development
**Files**: `.mise.toml`
**Success**: `mise run go:run` runs CLI
**Dependencies**: TASK-207
**Notes**:
```toml
[tasks."go:run"]
run = "cd backend && go run cmd/xdd/main.go"
description = "Run CLI"
```

---

### TASK-210: Create .env.example

**Goal**: Document required environment variables
**Files**: `backend/.env.example`
**Success**: File lists all env vars with examples
**Dependencies**: TASK-105
**Notes**:
```bash
# xdd Backend Configuration

# Logging
LOG_LEVEL=info           # debug, info, warn, error
DEBUG=0                  # Set to 1 for verbose logging

# LLM Provider
OPENROUTER_API_KEY=sk-or-v1-... # Required
DEFAULT_MODEL=openrouter/anthropic/claude-3.5-sonnet
```

---

### TASK-211: Add .gitignore for Backend

**Goal**: Ignore Go build artifacts
**Files**: `backend/.gitignore`
**Success**: Git ignores binaries, coverage files
**Dependencies**: TASK-207
**Notes**:
```
xdd
*.exe
coverage.out
*.test
.env
```

---

### TASK-212: Run Full Linting Suite

**Goal**: Verify all linters pass
**Files**: None (validation)
**Success**: `mise run lint:all:fix` passes for TypeScript + Go + Markdown
**Dependencies**: TASK-203, TASK-204, TASK-205
**Notes**: Fix any linting errors before proceeding.

---

### TASK-213: Test CLI Build and Run

**Goal**: Verify CLI compiles and executes
**Files**: None (validation)
**Success**:
- `mise run go:build` creates binary
- `./backend/xdd` runs and prints version
- No errors in logs

**Dependencies**: TASK-208, TASK-209
**Notes**: Checkpoint before schema work.

---

### TASK-214: Push to CI and Verify

**Goal**: GitHub Actions passes
**Files**: None (validation)
**Success**: GitHub Actions CI passes with Go tests + linting
**Dependencies**: TASK-206, TASK-212
**Notes**: Fix any CI failures before proceeding.

---

### TASK-215: VALIDATION - Project Setup Complete

**Goal**: All tooling and CI working
**Files**: None (validation)
**Success**:
- Go linting passes
- Go tests pass
- GitHub Actions passes
- CLI builds and runs
- Pre-commit hooks work

**Dependencies**: All Phase 2 tasks
**Notes**: This is a major checkpoint. Foundation + tooling must be solid.

---

## Phase 3: Core Schema Layer (18 tasks)

**Purpose**: Define Go structs with JSON schema support.

### TASK-301: Create Base Schema Types

**Goal**: Define enums and basic types
**Files**: `backend/pkg/schema/base.go`
**Success**: EARSType, Priority, ValidationLimits defined
**Dependencies**: TASK-215
**Notes**: Port from TypeScript schemas in `src/schemas/base.ts`:
```go
package schema

type EARSType string

const (
    EARSUbiquitous EARSType = "ubiquitous"
    EARSEvent      EARSType = "event"
    EARSState      EARSType = "state"
    EARSOptional   EARSType = "optional"
)

type Priority string

const (
    PriorityCritical Priority = "critical"
    PriorityHigh     Priority = "high"
    PriorityMedium   Priority = "medium"
    PriorityLow      Priority = "low"
)

const (
    RequirementDescriptionMin = 10
    RequirementDescriptionMax = 500
    // ... etc
)
```

---

### TASK-302: Create ID Generation Package

**Goal**: Generate collision-resistant nanoid IDs
**Files**: `backend/pkg/schema/id.go`
**Success**: Functions generate IDs in format REQ-{CATEGORY}-{nanoid(10)}, AC-{nanoid(10)}, EVT-{nanoid(10)}
**Dependencies**: TASK-201 (go-nanoid dependency), TASK-301
**Notes**:
```go
import gonanoid "github.com/matoous/go-nanoid/v2"

func NewRequirementID(category string) (string, error) {
    id, err := gonanoid.New(10)
    if err != nil {
        return "", err
    }
    return fmt.Sprintf("REQ-%s-%s", strings.ToUpper(category), id), nil
}

// Similar for NewAcceptanceCriterionID(), NewEventID()
```

---

### TASK-303: Create ProjectMetadata Schema

**Goal**: Define project metadata struct
**Files**: `backend/pkg/schema/metadata.go`
**Success**: ProjectMetadata struct with JSON/YAML tags
**Dependencies**: TASK-301
**Notes**:
```go
type ProjectMetadata struct {
    Name        string    `json:"name" yaml:"name"`
    Description string    `json:"description" yaml:"description"`
    Version     string    `json:"version" yaml:"version"`
    CreatedAt   time.Time `json:"created_at" yaml:"created_at"`
    UpdatedAt   time.Time `json:"updated_at" yaml:"updated_at"`
}
```

---

### TASK-304: Create AcceptanceCriterion Schema

**Goal**: Define acceptance criteria with interface for polymorphism
**Files**: `backend/pkg/schema/acceptance.go`
**Success**: AcceptanceCriterion interface, BehavioralCriterion, AssertionCriterion structs
**Dependencies**: TASK-301, TASK-302
**Notes**:
```go
type AcceptanceCriterion interface {
    GetID() string
    GetType() string
    GetCreatedAt() time.Time
}

type BehavioralCriterion struct {
    ID        string    `json:"id" yaml:"id"`
    Type      string    `json:"type" yaml:"type"` // "behavioral"
    Given     string    `json:"given" yaml:"given"`
    When      string    `json:"when" yaml:"when"`
    Then      string    `json:"then" yaml:"then"`
    CreatedAt time.Time `json:"created_at" yaml:"created_at"`
}

// Implement interface
func (b *BehavioralCriterion) GetID() string { return b.ID }
func (b *BehavioralCriterion) GetType() string { return b.Type }
func (b *BehavioralCriterion) GetCreatedAt() time.Time { return b.CreatedAt }

// Similar for AssertionCriterion
```

---

### TASK-305: Create Requirement Schema

**Goal**: Define requirement struct
**Files**: `backend/pkg/schema/requirement.go`
**Success**: Requirement struct with all fields and tags
**Dependencies**: TASK-301, TASK-302, TASK-304
**Notes**: Port from `src/schemas/requirement.ts`

---

### TASK-306: Create Specification Schema

**Goal**: Define root specification document
**Files**: `backend/pkg/schema/specification.go`
**Success**: Specification struct with metadata, requirements, categories
**Dependencies**: TASK-303, TASK-305
**Notes**:
```go
type Specification struct {
    Metadata     ProjectMetadata `json:"metadata" yaml:"metadata"`
    Requirements []Requirement   `json:"requirements" yaml:"requirements"`
    Categories   []string        `json:"categories" yaml:"categories"`
}
```

---

### TASK-307: Create ChangelogEvent Schemas

**Goal**: Define all 8 changelog event types
**Files**: `backend/pkg/schema/changelog.go`
**Success**: ChangelogEvent interface, RequirementAdded, RequirementDeleted, etc.
**Dependencies**: TASK-303, TASK-305
**Notes**: Port from `src/schemas/changelog-events.ts`. Use interface for polymorphism.

---

### TASK-308: Create Changelog Schema

**Goal**: Define changelog document
**Files**: `backend/pkg/schema/changelog.go` (append)
**Success**: Changelog struct with events array
**Dependencies**: TASK-307
**Notes**:
```go
type Changelog struct {
    Version             string           `json:"version" yaml:"version"`
    Events              []ChangelogEvent `json:"events" yaml:"events"`
    LastSnapshot        string           `json:"last_snapshot" yaml:"last_snapshot"`
    EventsSinceSnapshot int              `json:"events_since_snapshot" yaml:"events_since_snapshot"`
}
```

---

### TASK-309: Add JSON Schema Tags to Structs

**Goal**: Add jsonschema tags for validation constraints
**Files**: All schema files
**Success**: All fields have jsonschema tags (minLength, maxLength, enum, etc.)
**Dependencies**: TASK-301 through TASK-308
**Notes**: Example:
```go
type Requirement struct {
    Description string `json:"description" jsonschema:"minLength=10,maxLength=500"`
    Priority    Priority `json:"priority" jsonschema:"enum=critical|enum=high|enum=medium|enum=low"`
}
```

---

### TASK-310: Write Unit Tests for All Schema Types

**Goal**: Comprehensive test suite for schema package
**Files**: `backend/pkg/schema/*_test.go`
**Success**: Tests cover:
- ID generation (format validation, 10k collision test)
- ProjectMetadata JSON/YAML marshaling
- AcceptanceCriterion polymorphic interface
- Requirement with nested acceptance criteria
- Specification with multiple requirements
- All 8 ChangelogEvent types with discriminators
- Validation functions for all types
**Dependencies**: TASK-301 through TASK-309
**Notes**: Aim for 90%+ coverage of schema package. Use table-driven tests where appropriate.

---

### TASK-311: Create Schema Validation Functions

**Goal**: Validate schema fields beyond JSON schema
**Files**: `backend/pkg/schema/validation.go`
**Success**: Validation functions for Metadata, Requirement, etc.
**Dependencies**: TASK-301 through TASK-308
**Notes**:
```go
func ValidateMetadata(m *ProjectMetadata) error {
    if len(m.Name) < 1 || len(m.Name) > 100 {
        return fmt.Errorf("name must be 1-100 chars")
    }
    // ... etc
}
```

---

### TASK-312: VALIDATION - Schema Layer Complete

**Goal**: All schema tests pass, marshaling works
**Files**: None (validation)
**Success**:
- All schema tests pass (90%+ coverage)
- Can create Specification, marshal to JSON/YAML, unmarshal back
- Validation functions work
- ID generation produces unique IDs
- Polymorphic types (AcceptanceCriterion, ChangelogEvent) work correctly

**Dependencies**: TASK-301 through TASK-311
**Notes**: Major checkpoint. Schemas are foundation for everything else.

---

## Phase 4: Repository Layer (22 tasks)

**Purpose**: File I/O, locking, atomic transactions.

### TASK-401: Create FileLock Implementation

**Goal**: Implement file locking with stale detection
**Files**: `backend/internal/repository/lock.go`
**Success**: FileLock supports Acquire(), Release(), IsStale()
**Dependencies**: TASK-312, TASK-104 (core errors)
**Notes**: Use research/copy-on-write-atomicity.md as reference. Use golang.org/x/sys/unix for flock.

---

### TASK-402: Create LockFile Metadata Struct

**Goal**: Define lock file contents
**Files**: `backend/internal/repository/lock.go` (append)
**Success**: LockFile struct with PID, Hostname, Interface, Timestamp
**Dependencies**: TASK-401
**Notes**: Serialized as JSON in `.xdd/.lock`

---

### TASK-403: Implement Lock Acquisition

**Goal**: Acquire lock with stale detection
**Files**: `backend/internal/repository/lock.go` (append)
**Success**: Acquire() creates lock, detects stale locks (dead PID or >30min old)
**Dependencies**: TASK-402
**Notes**: See research doc for implementation.

---

### TASK-404: Implement Lock Release

**Goal**: Release lock cleanly
**Files**: `backend/internal/repository/lock.go` (append)
**Success**: Release() removes lock file
**Dependencies**: TASK-403
**Notes**: Use defer to ensure release on panic.

---

### TASK-405: Write Unit Tests for Lock

**Goal**: Verify lock acquire/release works
**Files**: `backend/internal/repository/lock_test.go`
**Success**: Tests pass for successful acquire, double acquire fails, release works
**Dependencies**: TASK-404
**Notes**: Use temp directory for lock file.

---

### TASK-406: Write Integration Test for Stale Lock

**Goal**: Verify stale lock detection
**Files**: `backend/internal/repository/lock_test.go` (append)
**Success**: Test creates stale lock (fake old timestamp), new process steals it
**Dependencies**: TASK-405
**Notes**: Mock timestamp to simulate 31min old lock.

---

### TASK-407: Create CopyOnWriteTx Struct

**Goal**: Define transaction struct
**Files**: `backend/internal/repository/atomic.go`
**Success**: CopyOnWriteTx with baseDir, tempDir, backupDir fields
**Dependencies**: TASK-318
**Notes**: See research doc for structure.

---

### TASK-408: Implement Transaction Begin

**Goal**: Copy directory using hard links
**Files**: `backend/internal/repository/atomic.go` (append)
**Success**: Begin() creates temp dir, hard links files
**Dependencies**: TASK-407
**Notes**: filepath.Walk + os.Link, fallback to io.Copy for cross-device.

---

### TASK-409: Implement Transaction WriteFile

**Goal**: Write file in temp directory
**Files**: `backend/internal/repository/atomic.go` (append)
**Success**: WriteFile() removes hard link, writes new file
**Dependencies**: TASK-408
**Notes**: os.Remove() before os.WriteFile() to break hard link.

---

### TASK-410: Implement Transaction Commit

**Goal**: Atomic rename to final location
**Files**: `backend/internal/repository/atomic.go` (append)
**Success**: Commit() does atomic swap, deletes backup
**Dependencies**: TASK-409
**Notes**: Rename base→backup, rename temp→base, delete backup. Rollback on failure.

---

### TASK-411: Implement Transaction Rollback

**Goal**: Clean up temp directory
**Files**: `backend/internal/repository/atomic.go` (append)
**Success**: Rollback() removes temp dir
**Dependencies**: TASK-410
**Notes**: os.RemoveAll(tempDir)

---

### TASK-412: Write Unit Tests for Transaction

**Goal**: Verify transaction Begin/Commit/Rollback
**Files**: `backend/internal/repository/atomic_test.go`
**Success**: Tests pass for successful commit, rollback on error
**Dependencies**: TASK-411
**Notes**: Use os.MkdirTemp() for isolated tests.

---

### TASK-413: Create Cleanup Function for Stale Temps

**Goal**: Remove old temp directories on startup
**Files**: `backend/internal/repository/cleanup.go`
**Success**: CleanupStaleTempDirs() removes dirs >1hr old
**Dependencies**: TASK-411
**Notes**: See research doc for implementation.

---

### TASK-414: Write Unit Tests for Cleanup

**Goal**: Verify cleanup removes only stale dirs
**Files**: `backend/internal/repository/cleanup_test.go`
**Success**: Tests pass for stale vs fresh dirs
**Dependencies**: TASK-413
**Notes**: Mock timestamps to simulate old dirs.

---

### TASK-415: Create YAML Writer

**Goal**: Serialize structs to YAML
**Files**: `backend/internal/repository/yaml.go`
**Success**: WriteYAML() marshals struct to file
**Dependencies**: TASK-318, TASK-201 (yaml.v3)
**Notes**:
```go
func WriteYAML(path string, v interface{}) error {
    data, err := yaml.Marshal(v)
    if err != nil {
        return err
    }
    return os.WriteFile(path, data, 0644)
}
```

---

### TASK-416: Create YAML Reader

**Goal**: Deserialize YAML to structs
**Files**: `backend/internal/repository/yaml.go` (append)
**Success**: ReadYAML() unmarshals file to struct
**Dependencies**: TASK-415
**Notes**:
```go
func ReadYAML(path string, v interface{}) error {
    data, err := os.ReadFile(path)
    if err != nil {
        return err
    }
    return yaml.Unmarshal(data, v)
}
```

---

### TASK-417: Handle Polymorphic YAML Unmarshaling

**Goal**: Unmarshal AcceptanceCriterion and ChangelogEvent with discriminators
**Files**: `backend/internal/repository/yaml.go` (append), `backend/pkg/schema/acceptance.go`, `backend/pkg/schema/changelog.go`
**Success**: Custom UnmarshalYAML() for polymorphic types
**Dependencies**: TASK-416
**Notes**: Implement UnmarshalYAML() interface method to check `type` field, then unmarshal into correct struct.

---

### TASK-418: Write Unit Tests for YAML

**Goal**: Verify YAML read/write works
**Files**: `backend/internal/repository/yaml_test.go`
**Success**: Tests pass for Specification, Changelog with polymorphic types
**Dependencies**: TASK-417
**Notes**: Marshal, write, read, unmarshal, verify equality.

---

### TASK-419: Create Repository Interface

**Goal**: High-level API for specification operations
**Files**: `backend/internal/repository/repository.go`
**Success**: Repository interface with ReadSpec(), WriteSpec(), ReadChangelog(), AppendChangelogEvents()
**Dependencies**: TASK-416, TASK-404
**Notes**:
```go
type Repository interface {
    ReadSpecification() (*schema.Specification, error)
    WriteSpecification(*schema.Specification) error
    ReadChangelog() (*schema.Changelog, error)
    AppendChangelogEvents(events []schema.ChangelogEvent) error
    AcquireLock(interfaceType string) error
    ReleaseLock() error
}
```

---

### TASK-420: Implement Repository Methods

**Goal**: Wire together lock, transaction, YAML
**Files**: `backend/internal/repository/repository.go` (append)
**Success**: All Repository methods implemented
**Dependencies**: TASK-419
**Notes**: Use CopyOnWriteTx for writes, direct read for reads.

---

### TASK-421: Write Integration Tests for Repository

**Goal**: Test full repository operations
**Files**: `backend/internal/repository/repository_test.go`
**Success**: Tests pass for create spec, update spec, append changelog
**Dependencies**: TASK-420
**Notes**: Use temp dir, create full workflow: init → write → read → verify.

---

### TASK-422: Implement Snapshot Creation

**Goal**: Create state snapshots every 100 events
**Files**: `backend/internal/repository/snapshot.go`
**Success**: CreateSnapshot() writes full state to snapshots/ directory
**Dependencies**: TASK-421
**Notes**: Per SPEC.md: Every 100 events, save complete specification state for fast reconstruction.

---

### TASK-423: Implement Snapshot Loading

**Goal**: Load state from snapshot + recent events
**Files**: `backend/internal/repository/snapshot.go` (append)
**Success**: LoadFromSnapshot() reconstructs state from latest snapshot plus events
**Dependencies**: TASK-422
**Notes**: Find latest snapshot, apply events since snapshot to rebuild current state.

---

### TASK-424: VALIDATION - Repository Layer Complete

**Goal**: All repository tests pass, operations work
**Files**: None (validation)
**Success**:
- Lock acquire/release works
- Stale lock detection works
- Copy-on-write transaction atomic
- YAML marshal/unmarshal works
- Polymorphic types handled
- Repository interface functional
- Snapshot creation/loading works

**Dependencies**: All Phase 4 tasks
**Notes**: Major checkpoint. Persistence layer ready.

---

## Phase 5: LLM Infrastructure (16 tasks)

**Purpose**: Genkit + OpenRouter integration.

### TASK-501: Create LLM Config Struct

**Goal**: Define LLM configuration
**Files**: `backend/internal/llm/config.go`
**Success**: Config struct with APIKey, DefaultModel fields
**Dependencies**: TASK-318
**Notes**:
```go
type Config struct {
    APIKey       string
    DefaultModel string
}
```

---

### TASK-502: Initialize Genkit Client

**Goal**: Create Genkit instance
**Files**: `backend/internal/llm/genkit.go`
**Success**: NewGenkitClient() returns initialized *genkit.Genkit
**Dependencies**: TASK-501, TASK-201 (Genkit dependency)
**Notes**: See research/genkit.md for pattern.

---

### TASK-503: Implement OpenRouter HTTP Client

**Goal**: HTTP client for OpenRouter API
**Files**: `backend/internal/llm/openrouter_client.go`
**Success**: Client can POST to OpenRouter /chat/completions
**Dependencies**: TASK-501
**Notes**: Use standard http.Client, set headers (Authorization, Content-Type).

---

### TASK-504: Convert Genkit Request to OpenRouter Format

**Goal**: Transform ai.ModelRequest → OpenRouter JSON
**Files**: `backend/internal/llm/openrouter_client.go` (append)
**Success**: Function converts Genkit request to OpenAI-compatible format
**Dependencies**: TASK-503
**Notes**: OpenRouter uses OpenAI Chat format. Map messages, config, model name.

---

### TASK-505: Convert OpenRouter Response to Genkit Format

**Goal**: Transform OpenRouter JSON → ai.ModelResponse
**Files**: `backend/internal/llm/openrouter_client.go` (append)
**Success**: Function parses OpenRouter response into Genkit format
**Dependencies**: TASK-504
**Notes**: Extract choices[0].message.content, usage stats, etc.

---

### TASK-506: Handle OpenRouter Error Responses

**Goal**: Parse and return meaningful errors
**Files**: `backend/internal/llm/openrouter_client.go` (append)
**Success**: Function maps HTTP errors (429, 500, etc.) to Go errors
**Dependencies**: TASK-505
**Notes**: Use core/errors. Wrap with context.

---

### TASK-507: Implement OpenRouter Provider Registration

**Goal**: Register OpenRouter as Genkit provider
**Files**: `backend/internal/llm/provider_openrouter.go`
**Success**: RegisterOpenRouterProvider() defines models via genkit.DefineModel()
**Dependencies**: TASK-502, TASK-506
**Notes**: See research/genkit.md for pattern. Register "anthropic/claude-3.5-sonnet" and "google/gemini-2.0-flash-thinking-exp".

---

### TASK-508: Test OpenRouter Provider with Gemini First

**Goal**: Verify Genkit works with built-in provider
**Files**: `backend/internal/llm/genkit_test.go`
**Success**: Can call Genkit with Google Gemini (built-in), get response
**Dependencies**: TASK-502
**Notes**: Use Google AI plugin (built-in to Genkit) for initial test. Requires GOOGLE_API_KEY env var. This verifies Genkit setup before tackling OpenRouter.

---

### TASK-509: Write Unit Tests for OpenRouter Client

**Goal**: Test HTTP request/response handling
**Files**: `backend/internal/llm/openrouter_client_test.go`
**Success**: Tests pass for request conversion, response parsing, error handling
**Dependencies**: TASK-506
**Notes**: Mock HTTP responses with httptest.

---

### TASK-510: Create Validation Retry Helper

**Goal**: Generic retry logic for LLM validation
**Files**: `backend/internal/llm/retry.go`
**Success**: ExecuteWithValidation() retries up to 3 times, feeds errors back to prompt
**Dependencies**: TASK-502
**Notes**: See research/genkit.md for pattern.

---

### TASK-511: Write Unit Tests for Retry Helper

**Goal**: Verify retry logic works
**Files**: `backend/internal/llm/retry_test.go`
**Success**: Tests pass for success on attempt 1, 2, 3, failure after 3
**Dependencies**: TASK-510
**Notes**: Mock LLM client, inject failures.

---

### TASK-512: Create Prompt Builder Helpers

**Goal**: Functions to build prompts for each task
**Files**: `backend/internal/llm/prompts.go`
**Success**: BuildMetadataPrompt(), BuildRequirementsDeltaPrompt(), etc.
**Dependencies**: TASK-318
**Notes**: String templates with placeholders for input.

---

### TASK-513: Add EARS Decision Tree to Prompts

**Goal**: Include EARS classification logic in prompts
**Files**: `backend/internal/llm/prompts.go` (append)
**Success**: Prompts include EARS decision tree from SPEC.md
**Dependencies**: TASK-512
**Notes**: Copy decision tree from SPEC.md into prompt constant.

---

### TASK-514: Write Unit Tests for Prompt Builders

**Goal**: Verify prompts include all input data
**Files**: `backend/internal/llm/prompts_test.go`
**Success**: Tests pass for all prompt types
**Dependencies**: TASK-513
**Notes**: Call builders with test inputs, verify output contains expected strings.

---

### TASK-515: Test OpenRouter Integration End-to-End

**Goal**: Verify OpenRouter provider works with real API
**Files**: None (manual test)
**Success**: Can call OpenRouter via Genkit, get structured output
**Dependencies**: TASK-507, TASK-510
**Notes**: Requires OPENROUTER_API_KEY. Tag test with `//go:build integration` to skip in unit tests.

---

### TASK-516: VALIDATION - LLM Infrastructure Complete

**Goal**: Genkit + OpenRouter working
**Files**: None (validation)
**Success**:
- Genkit initializes
- OpenRouter provider registered
- Can call OpenRouter models
- Structured output works
- Validation retry works
- Prompts build correctly
- EARS decision tree included in prompts

**Dependencies**: All Phase 5 tasks
**Notes**: Major checkpoint. LLM foundation ready for tasks.

---

## Phase 6: LLM Task Implementation (25 tasks)

**Purpose**: Implement 5 LLM tasks + fixtures.

### TASK-601: Create Task Input/Output Structs

**Goal**: Define I/O types for all 5 tasks
**Files**: `backend/internal/llm/tasks/types.go`
**Success**: Input/Output structs for Metadata, RequirementsDelta, Categorization, RequirementGen, VersionBump
**Dependencies**: TASK-318
**Notes**: Match structures from SPEC.md. Include JSON tags for GenKit.

---

### TASK-602: Create Metadata Task Implementation

**Goal**: Implement metadata task with validation
**Files**: `backend/internal/llm/tasks/metadata.go`
**Success**: MetadataTask.Execute() returns validated metadata
**Dependencies**: TASK-601, TASK-510 (retry helper)
**Notes**: See research/genkit.md for pattern. Use ExecuteWithValidation().

---

### TASK-603: Write Metadata Task Validation

**Goal**: Validate metadata output
**Files**: `backend/internal/llm/tasks/metadata.go` (append)
**Success**: validateMetadata() checks name/description length
**Dependencies**: TASK-602
**Notes**: Name 1-100 chars, description 10-1000 chars.

---

### TASK-604: Write Unit Tests for Metadata Task

**Goal**: Test metadata task with mock LLM
**Files**: `backend/internal/llm/tasks/metadata_test.go`
**Success**: Tests pass for new project, update name, update description
**Dependencies**: TASK-603
**Notes**: Mock Genkit client, return fixed output.

---

### TASK-605: Create Requirements Delta Task

**Goal**: Implement requirements delta analysis
**Files**: `backend/internal/llm/tasks/requirements_delta.go`
**Success**: RequirementsDeltaTask.Execute() returns add/remove lists
**Dependencies**: TASK-601, TASK-510
**Notes**: Handle ambiguous modifications (pause and ask user).

---

### TASK-606: Write Requirements Delta Validation

**Goal**: Validate delta output
**Files**: `backend/internal/llm/tasks/requirements_delta.go` (append)
**Success**: validateRequirementsDelta() checks IDs exist, categories valid
**Dependencies**: TASK-605
**Notes**: Verify removed IDs exist in existing requirements.

---

### TASK-607: Write Unit Tests for Requirements Delta

**Goal**: Test delta task
**Files**: `backend/internal/llm/tasks/requirements_delta_test.go`
**Success**: Tests pass for add, remove, ambiguous scenarios
**Dependencies**: TASK-606
**Notes**: Mock LLM, test all paths.

---

### TASK-608: Create Categorization Task

**Goal**: Implement categorization
**Files**: `backend/internal/llm/tasks/categorization.go`
**Success**: CategorizationTask.Execute() returns categories + mapping
**Dependencies**: TASK-601, TASK-510
**Notes**: Use thinking model (gemini-2.0-flash-thinking-exp) per SPEC.md.

---

### TASK-609: Write Categorization Validation

**Goal**: Validate categorization output
**Files**: `backend/internal/llm/tasks/categorization.go` (append)
**Success**: validateCategorization() checks category names valid (1-20 chars, uppercase)
**Dependencies**: TASK-608
**Notes**: Verify all requirements mapped to categories.

---

### TASK-610: Write Unit Tests for Categorization

**Goal**: Test categorization task
**Files**: `backend/internal/llm/tasks/categorization_test.go`
**Success**: Tests pass for various project sizes
**Dependencies**: TASK-609
**Notes**: Test 1 category, 5 categories, etc.

---

### TASK-611: Create Requirement Generation Task

**Goal**: Implement requirement generation
**Files**: `backend/internal/llm/tasks/requirement_gen.go`
**Success**: RequirementGenTask.Execute() returns full requirement
**Dependencies**: TASK-601, TASK-510
**Notes**: Generates description, rationale, acceptance criteria per EARS format.

---

### TASK-612: Write Requirement Generation Validation

**Goal**: Validate requirement output
**Files**: `backend/internal/llm/tasks/requirement_gen.go` (append)
**Success**: validateRequirementGen() checks description length, criteria count (3-7), priority valid
**Dependencies**: TASK-611
**Notes**: Verify EARS format (description starts with "When/While/Where/The system shall").

---

### TASK-613: Write Unit Tests for Requirement Generation

**Goal**: Test requirement generation
**Files**: `backend/internal/llm/tasks/requirement_gen_test.go`
**Success**: Tests pass for all EARS types
**Dependencies**: TASK-612
**Notes**: One test per EARS type.

---

### TASK-614: Create Version Bump Task

**Goal**: Implement version bumping
**Files**: `backend/internal/llm/tasks/version_bump.go`
**Success**: VersionBumpTask.Execute() returns new version + reasoning
**Dependencies**: TASK-601, TASK-510
**Notes**: LLM decides major/minor/patch based on changes.

---

### TASK-615: Write Version Bump Validation

**Goal**: Validate version output
**Files**: `backend/internal/llm/tasks/version_bump.go` (append)
**Success**: validateVersionBump() checks valid semver, bump type
**Dependencies**: TASK-614
**Notes**: Use semver library or regex to validate.

---

### TASK-616: Write Unit Tests for Version Bump

**Goal**: Test version bump task
**Files**: `backend/internal/llm/tasks/version_bump_test.go`
**Success**: Tests pass for major, minor, patch scenarios
**Dependencies**: TASK-615
**Notes**: Mock different change types.

---

### TASK-617: Create Fixture Recording Script

**Goal**: Script to record real LLM responses
**Files**: `backend/scripts/record-fixtures.go`
**Success**: Script calls real LLM, saves responses to testdata/
**Dependencies**: TASK-602 through TASK-614 (all tasks implemented)
**Notes**: See research/genkit.md for pattern. Costs ~$0.50 to run.

---

### TASK-618: Record Metadata Fixtures

**Goal**: Record 3 metadata scenarios
**Files**: `backend/internal/llm/testdata/fixtures/metadata-*.json`
**Success**: Fixtures saved for new-project, update-name, update-description
**Dependencies**: TASK-617
**Notes**: Run script with OPENROUTER_API_KEY set.

---

### TASK-619: Record Requirements Delta Fixtures

**Goal**: Record 3 delta scenarios
**Files**: `backend/internal/llm/testdata/fixtures/requirements-delta-*.json`
**Success**: Fixtures for add-requirement, remove-requirement, ambiguous
**Dependencies**: TASK-617
**Notes**: Create varied input scenarios.

---

### TASK-620: Record Categorization Fixtures

**Goal**: Record 2 categorization scenarios
**Files**: `backend/internal/llm/testdata/fixtures/categorization-*.json`
**Success**: Fixtures for small-project (2 categories), large-project (5 categories)
**Dependencies**: TASK-617
**Notes**: Vary project complexity.

---

### TASK-621: Record Requirement Generation Fixtures

**Goal**: Record 4 requirement scenarios (one per EARS type)
**Files**: `backend/internal/llm/testdata/fixtures/requirement-gen-*.json`
**Success**: Fixtures for ubiquitous, event, state, optional
**Dependencies**: TASK-617
**Notes**: One fixture per EARS type.

---

### TASK-622: Record Version Bump Fixtures

**Goal**: Record 3 version scenarios
**Files**: `backend/internal/llm/testdata/fixtures/version-bump-*.json`
**Success**: Fixtures for major, minor, patch
**Dependencies**: TASK-617
**Notes**: Create different change scenarios.

---

### TASK-623: Update Tests to Use Fixtures

**Goal**: Replace mock LLM with fixture-based mocks
**Files**: All task test files
**Success**: Tests load fixtures instead of hard-coded mocks
**Dependencies**: TASK-618 through TASK-622
**Notes**: Create fixture loader helper.

---

### TASK-624: Add Integration Test for Full Task Chain

**Goal**: Test all 5 tasks in sequence
**Files**: `backend/internal/llm/tasks/integration_test.go`
**Success**: Test runs metadata → delta → categorization → requirement gen → version bump
**Dependencies**: TASK-623
**Notes**: Use fixtures for predictable output. Tag with `//go:build integration`.

---

### TASK-625: VALIDATION - LLM Tasks Complete

**Goal**: All 5 tasks working with fixtures
**Files**: None (validation)
**Success**:
- All 5 tasks implemented
- Validation works for each
- Fixtures recorded
- Unit tests pass with fixtures
- Integration test passes
- Can call real LLM if needed

**Dependencies**: All Phase 6 tasks
**Notes**: Major checkpoint. LLM capabilities ready for CLI.

---

## Phase 7: CLI Foundation (14 tasks)

**Purpose**: Build CLI structure, init command.

### TASK-701: Add CLI Framework Dependency

**Goal**: Add CLI library (cobra or stdlib flag)
**Files**: `backend/go.mod`
**Success**: CLI framework installed
**Dependencies**: TASK-215
**Notes**: Recommend stdlib flag for simplicity. Or cobra if want subcommands.

---

### TASK-702: Refactor main.go for CLI Framework

**Goal**: Structure main.go for commands
**Files**: `backend/cmd/xdd/main.go`
**Success**: main.go sets up command router
**Dependencies**: TASK-701
**Notes**: If using flag: switch on os.Args[1] for command name.

---

### TASK-703: Create Init Command

**Goal**: `xdd init` creates `.xdd/` structure
**Files**: `backend/cmd/xdd/init.go`
**Success**: Init command creates .xdd/, config.yml, 01-specs/ directories
**Dependencies**: TASK-702
**Notes**: Idempotent (running twice is safe).

---

### TASK-704: Implement Init Directory Creation

**Goal**: Create directory structure
**Files**: `backend/cmd/xdd/init.go` (append)
**Success**: Creates .xdd/, .xdd/01-specs/, .xdd/01-specs/snapshots/
**Dependencies**: TASK-703
**Notes**: Use os.MkdirAll(), mode 0755.

---

### TASK-705: Create Default config.yml

**Goal**: Write default config on init
**Files**: `backend/cmd/xdd/init.go` (append)
**Success**: Writes .xdd/config.yml with defaults
**Dependencies**: TASK-704
**Notes**:
```yaml
# xdd configuration
version: 3.0.0
created_at: 2025-10-01T12:00:00Z
```

---

### TASK-706: Write Unit Tests for Init

**Goal**: Test init command
**Files**: `backend/cmd/xdd/init_test.go`
**Success**: Tests pass for new init, idempotent init
**Dependencies**: TASK-705
**Notes**: Use temp dir, verify directories created.

---

### TASK-707: Create Unlock Command Stub

**Goal**: `xdd unlock --force` placeholder
**Files**: `backend/cmd/xdd/unlock.go`
**Success**: Command exists, prints "not implemented"
**Dependencies**: TASK-702
**Notes**: Will implement after lock is used.

---

### TASK-708: Create Specify Command Stub

**Goal**: `xdd specify` placeholder
**Files**: `backend/cmd/xdd/specify.go`
**Success**: Command exists, prints "not implemented"
**Dependencies**: TASK-702
**Notes**: Will implement in Phase 8.

---

### TASK-709: Add Version Flag

**Goal**: `xdd --version` prints version
**Files**: `backend/cmd/xdd/main.go` (append)
**Success**: --version flag prints "xdd v3.0.0"
**Dependencies**: TASK-702
**Notes**: Read from const or build flag.

---

### TASK-710: Add Help Text

**Goal**: `xdd --help` shows usage
**Files**: `backend/cmd/xdd/main.go` (append)
**Success**: Help text shows available commands
**Dependencies**: TASK-702
**Notes**: List init, specify, unlock commands.

---

### TASK-711: Test CLI Build

**Goal**: Verify CLI compiles
**Files**: None (validation)
**Success**: `mise run go:build` succeeds, binary runs
**Dependencies**: TASK-710
**Notes**: Run `./backend/xdd --help`, verify output.

---

### TASK-712: Test Init Command

**Goal**: Manually test init
**Files**: None (manual test)
**Success**: `./backend/xdd init` creates .xdd/ structure
**Dependencies**: TASK-711
**Notes**: Run in temp dir, inspect created files.

---

### TASK-713: Implement Unlock Command

**Goal**: Force unlock stale lock
**Files**: `backend/cmd/xdd/unlock.go` (implement)
**Success**: `xdd unlock --force` removes .xdd/.lock
**Dependencies**: TASK-422 (FileLock), TASK-707
**Notes**: Read lock file, show info, prompt for confirmation (unless --force), remove lock.

---

### TASK-714: VALIDATION - CLI Foundation Complete

**Goal**: CLI structure ready, init works
**Files**: None (validation)
**Success**:
- CLI builds and runs
- --version works
- --help works
- init command works
- unlock command works
- All commands have help text

**Dependencies**: All Phase 7 tasks
**Notes**: Checkpoint. CLI framework ready for specify command.

---

## Phase 8: CLI Specify Flow (20 tasks)

**Purpose**: End-to-end specification session via CLI.

### TASK-801: Create Session State Struct

**Goal**: Define in-memory session state
**Files**: `backend/internal/core/session.go`
**Success**: SessionState struct with messages, changelog, committed flag
**Dependencies**: TASK-318
**Notes**:
```go
type SessionState struct {
    Messages   []Message
    Changelog  []ChangelogEvent
    Committed  bool
}

type Message struct {
    Role    string // "user", "assistant", "system"
    Content string
}
```

---

### TASK-802: Create CLI Session Struct

**Goal**: CLI-specific session implementation
**Files**: `backend/internal/core/session_cli.go`
**Success**: CLISession struct with Run() method
**Dependencies**: TASK-801
**Notes**: Holds SessionState + lock + repository.

---

### TASK-803: Implement Session Initialization

**Goal**: Create session, acquire lock
**Files**: `backend/internal/core/session_cli.go` (append)
**Success**: NewCLISession() acquires lock, loads current spec
**Dependencies**: TASK-802, TASK-422 (Repository)
**Notes**: Lock acquisition with error handling.

---

### TASK-804: Create Orchestrator for Task Execution

**Goal**: Sequential execution of 5 LLM tasks
**Files**: `backend/internal/core/orchestrator.go`
**Success**: Orchestrator.ProcessPrompt() runs all tasks, returns changelog
**Dependencies**: TASK-625 (all LLM tasks)
**Notes**: Execute: metadata → delta → categorization → requirement gen → version bump.

---

### TASK-805: Implement Task 1: Metadata

**Goal**: Wire metadata task into orchestrator
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: Orchestrator calls MetadataTask, handles output
**Dependencies**: TASK-804
**Notes**: Check if metadata changed, create ProjectMetadataUpdated event if so.

---

### TASK-806: Implement Task 2: Requirements Delta

**Goal**: Wire delta task into orchestrator
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: Orchestrator calls RequirementsDeltaTask, handles output
**Dependencies**: TASK-805
**Notes**: Check for ambiguous modifications, pause if needed.

---

### TASK-807: Handle Ambiguous Modifications

**Goal**: Ask user for clarification
**Files**: `backend/internal/core/orchestrator.go` (append), `backend/internal/core/session_cli.go`
**Success**: If ambiguous, prompt user, re-run delta with clarification
**Dependencies**: TASK-806
**Notes**: Print possible targets, ask "Which requirement?" or "Describe change".

---

### TASK-808: Implement Task 3: Categorization

**Goal**: Wire categorization task into orchestrator
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: Orchestrator calls CategorizationTask, updates categories
**Dependencies**: TASK-807
**Notes**: Compare old vs new categories, create CategoryAdded/CategoryDeleted events.

---

### TASK-809: Implement Task 4: Requirement Generation

**Goal**: Wire requirement gen task into orchestrator
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: Orchestrator calls RequirementGenTask for each new requirement
**Dependencies**: TASK-808
**Notes**: Execute in parallel (max 3 concurrent) with semaphore.

---

### TASK-810: Create RequirementAdded Events

**Goal**: Build changelog events for new requirements
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: For each new requirement, create RequirementAdded event
**Dependencies**: TASK-809
**Notes**: Include full requirement in event.

---

### TASK-811: Create RequirementDeleted Events

**Goal**: Build changelog events for removed requirements
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: For each removed requirement, create RequirementDeleted event
**Dependencies**: TASK-810
**Notes**: Include snapshot of requirement in event.

---

### TASK-812: Implement Task 5: Version Bump

**Goal**: Wire version bump task into orchestrator
**Files**: `backend/internal/core/orchestrator.go` (append)
**Success**: Orchestrator calls VersionBumpTask, creates VersionBumped event
**Dependencies**: TASK-811
**Notes**: Pass all changes to task for context.

---

### TASK-813: Build Changelog Preview

**Goal**: Format changelog for user review
**Files**: `backend/internal/core/display.go`
**Success**: FormatChangelog() returns human-readable string
**Dependencies**: TASK-812
**Notes**: Show added/removed requirements, version bump, category changes.

---

### TASK-814: Implement User Confirmation

**Goal**: Ask "Are you satisfied?" loop
**Files**: `backend/internal/core/session_cli.go` (append)
**Success**: Prompt user, handle yes/no/feedback
**Dependencies**: TASK-813
**Notes**: If feedback, append to prompt and re-run orchestrator.

---

### TASK-815: Implement Commit Logic

**Goal**: Write spec + changelog to disk
**Files**: `backend/internal/core/session_cli.go` (append)
**Success**: Commit() writes specification.yaml, appends to changelog.yaml
**Dependencies**: TASK-814, TASK-422 (Repository)
**Notes**: Use CopyOnWriteTx for atomic write.

---

### TASK-816: Implement Lock Release

**Goal**: Release lock on session end
**Files**: `backend/internal/core/session_cli.go` (append)
**Success**: Lock released on commit or cancel
**Dependencies**: TASK-815
**Notes**: Use defer to ensure release even on panic.

---

### TASK-817: Wire Specify Command to Session

**Goal**: `xdd specify "prompt"` runs session
**Files**: `backend/cmd/xdd/specify.go` (implement)
**Success**: Specify command creates CLISession, runs it
**Dependencies**: TASK-816
**Notes**: Read prompt from args or stdin.

---

### TASK-818: Add Progress Indicators to CLI

**Goal**: Show "Analyzing...", "Generating requirements..."
**Files**: `backend/internal/core/display.go` (append)
**Success**: Progress messages during task execution
**Dependencies**: TASK-817
**Notes**: Use logger.Info() or fmt.Println().

---

### TASK-819: Test Specify Command with Fixtures

**Goal**: E2E test of specify flow
**Files**: `backend/cmd/xdd/specify_test.go`
**Success**: Test creates spec from prompt using fixtures
**Dependencies**: TASK-818, TASK-623 (fixtures)
**Notes**: Mock LLM with fixtures, verify spec created.

---

### TASK-820: VALIDATION - CLI Specify Complete

**Goal**: Specify command works end-to-end
**Files**: None (validation)
**Success**:
- `xdd specify "prompt"` runs
- Acquires lock
- Runs all 5 LLM tasks
- Shows changelog preview
- Prompts for confirmation
- Writes spec + changelog on yes
- Releases lock
- Handles feedback loop

**Dependencies**: All Phase 8 tasks
**Notes**: Major checkpoint. Core CLI functionality complete.

---

## Phase 9: API & WebSocket (18 tasks)

**Purpose**: HTTP server, WebSocket sessions for frontend.

### TASK-901: Create OpenAPI Specification

**Goal**: Define REST API contract
**Files**: `openapi.yaml`
**Success**: OpenAPI 3.0 spec with all endpoints
**Dependencies**: TASK-318 (schemas)
**Notes**: Endpoints: GET /health, GET /spec, WebSocket /ws/specify. Include request/response examples.

---

### TASK-902: Generate JSON Schemas for OpenAPI

**Goal**: Auto-generate schemas from Go structs
**Files**: `backend/internal/api/schema.go`
**Success**: GenerateAPISchema() uses invopop/jsonschema to generate schemas
**Dependencies**: TASK-901, TASK-201 (jsonschema dependency)
**Notes**: See research/json-schema-generation.md for pattern.

---

### TASK-903: Validate OpenAPI Schemas Match Structs

**Goal**: Test that OpenAPI examples match Go structs
**Files**: `backend/internal/api/schema_test.go`
**Success**: Tests marshal OpenAPI examples, unmarshal into structs, verify equality
**Dependencies**: TASK-902
**Notes**: Load examples from openapi.yaml, test each one.

---

### TASK-904: Create HTTP Server

**Goal**: Basic HTTP server with ServeMux
**Files**: `backend/internal/api/server.go`
**Success**: Server listens on :8080, responds to /health
**Dependencies**: TASK-215
**Notes**:
```go
mux := http.NewServeMux()
mux.HandleFunc("/health", healthHandler)
http.ListenAndServe(":8080", mux)
```

---

### TASK-905: Implement Health Check Endpoint

**Goal**: GET /health returns 200 OK
**Files**: `backend/internal/api/handlers/health.go`
**Success**: Health endpoint returns {"status": "ok"}
**Dependencies**: TASK-904
**Notes**: Simple JSON response.

---

### TASK-906: Implement Get Specification Endpoint

**Goal**: GET /spec returns current specification
**Files**: `backend/internal/api/handlers/spec.go`
**Success**: Endpoint reads spec from repository, returns JSON
**Dependencies**: TASK-905, TASK-422 (Repository)
**Notes**: Handle not found (return 404 if .xdd/ doesn't exist).

---

### TASK-907: Create WebSocket Message Protocol

**Goal**: Define client/server message types
**Files**: `backend/internal/api/protocol/messages.go`
**Success**: ClientMessage, ServerMessage types defined
**Dependencies**: TASK-318
**Notes**:
```go
type ClientMessage struct {
    Type    string `json:"type"` // "prompt", "feedback", "confirm"
    Content string `json:"content"`
}

type ServerMessage struct {
    Type      string      `json:"type"` // "progress", "preview", "request_feedback", "committed", "error"
    Content   string      `json:"content,omitempty"`
    Changelog interface{} `json:"changelog,omitempty"`
}
```

---

### TASK-908: Create WebSocket Upgrade Handler

**Goal**: Upgrade HTTP to WebSocket
**Files**: `backend/internal/api/websocket.go`
**Success**: Handler upgrades connection, manages WebSocket
**Dependencies**: TASK-201 (websocket dependency), TASK-904
**Notes**: Use nhooyr.io/websocket.Accept().

---

### TASK-909: Create WebSocket Session Struct

**Goal**: Define WebSocket session state
**Files**: `backend/internal/core/session_ws.go`
**Success**: WebSocketSession struct with conn, state
**Dependencies**: TASK-801 (SessionState)
**Notes**: Similar to CLISession but sends messages via WebSocket.

---

### TASK-910: Implement WebSocket Message Loop

**Goal**: Read/process/write messages
**Files**: `backend/internal/core/session_ws.go` (append)
**Success**: Session reads ClientMessage, processes, sends ServerMessage
**Dependencies**: TASK-909, TASK-907
**Notes**: Use goroutine for read loop.

---

### TASK-911: Acquire Lock on WebSocket Connect

**Goal**: Lock acquired when session starts
**Files**: `backend/internal/core/session_ws.go` (append)
**Success**: Lock acquired on connect, released on disconnect
**Dependencies**: TASK-910, TASK-422 (FileLock)
**Notes**: Send error message if lock acquisition fails.

---

### TASK-912: Wire Orchestrator to WebSocket

**Goal**: Run LLM tasks from WebSocket messages
**Files**: `backend/internal/core/session_ws.go` (append)
**Success**: When "prompt" message received, run orchestrator, send progress
**Dependencies**: TASK-911, TASK-804 (Orchestrator)
**Notes**: Send "progress" messages during task execution.

---

### TASK-913: Send Changelog Preview via WebSocket

**Goal**: Send "preview" message with changelog
**Files**: `backend/internal/core/session_ws.go` (append)
**Success**: After orchestrator completes, send preview to client
**Dependencies**: TASK-912, TASK-813 (changelog formatting)
**Notes**: Message type: "preview", include full changelog in JSON.

---

### TASK-914: Handle User Confirmation via WebSocket

**Goal**: Wait for "confirm" or "feedback" message
**Files**: `backend/internal/core/session_ws.go` (append)
**Success**: If "confirm", commit and send "committed". If "feedback", re-run
**Dependencies**: TASK-913
**Notes**: Send "request_feedback" message, wait for response.

---

### TASK-915: Implement Commit via WebSocket

**Goal**: Write spec + changelog on confirm
**Files**: `backend/internal/core/session_ws.go` (append)
**Success**: Commit writes files, sends "committed" message, closes connection
**Dependencies**: TASK-914, TASK-422 (Repository)
**Notes**: Same commit logic as CLI.

---

### TASK-916: Add Serve Command to CLI

**Goal**: `xdd serve` starts HTTP server
**Files**: `backend/cmd/xdd/serve.go`
**Success**: Serve command starts server on :8080
**Dependencies**: TASK-904
**Notes**: Print "Listening on :8080".

---

### TASK-917: Test WebSocket Integration

**Goal**: E2E test for WebSocket session
**Files**: `backend/internal/api/websocket_test.go`
**Success**: Test connects via WebSocket, sends prompt, receives changelog, confirms
**Dependencies**: TASK-915
**Notes**: Use gorilla/websocket test helpers or nhooyr.io client.

---

### TASK-918: VALIDATION - API & WebSocket Complete

**Goal**: HTTP server + WebSocket working
**Files**: None (validation)
**Success**:
- `xdd serve` starts server
- GET /health returns OK
- GET /spec returns specification
- WebSocket /ws/specify connects
- Can send prompt, receive progress, preview, commit
- Lock prevents concurrent connections

**Dependencies**: All Phase 9 tasks
**Notes**: Major checkpoint. Backend API complete.

---

## Phase 10: Frontend Setup (16 tasks)

**Purpose**: Svelte project, linting, API contract.

### TASK-1001: Create Frontend Directory

**Goal**: Initialize SvelteKit project
**Files**: `frontend/` directory
**Success**: SvelteKit project created
**Dependencies**: TASK-918
**Notes**: Run `npm create svelte@latest frontend` (choose skeleton + TypeScript).

---

### TASK-1002: Install Frontend Dependencies

**Goal**: Install core dependencies
**Files**: `frontend/package.json`, `frontend/package-lock.json`
**Success**: Dependencies installed
**Dependencies**: TASK-1001
**Notes**:
```bash
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npm install -D @biomejs/biome prettier prettier-plugin-svelte
```

---

### TASK-1003: Configure Tailwind CSS

**Goal**: Set up Tailwind
**Files**: `frontend/tailwind.config.js`, `frontend/src/app.css`
**Success**: Tailwind configured, app.css imports Tailwind
**Dependencies**: TASK-1002
**Notes**: Run `npx tailwindcss init`, add to svelte.config.js.

---

### TASK-1004: Configure Biome for TypeScript

**Goal**: Set up Biome linting
**Files**: `frontend/biome.json`
**Success**: Biome lints TypeScript, skips .svelte files
**Dependencies**: TASK-1002
**Notes**: Enable TypeScript linting, disable for .svelte files.

---

### TASK-1005: Configure Prettier for Svelte

**Goal**: Format .svelte files with Prettier
**Files**: `frontend/.prettierrc`
**Success**: Prettier configured with svelte plugin
**Dependencies**: TASK-1002
**Notes**: Use prettier-plugin-svelte.

---

### TASK-1006: Add Frontend Linting Tasks to .mise.toml

**Goal**: Wire frontend linting into mise
**Files**: `.mise.toml`
**Success**: `mise run frontend:lint` runs Biome + Prettier
**Dependencies**: TASK-1004, TASK-1005
**Notes**:
```toml
[tasks."frontend:lint"]
run = "cd frontend && biome check src/ && prettier --check 'src/**/*.svelte'"
description = "Lint frontend code"

[tasks."frontend:fmt"]
run = "cd frontend && biome format --write src/ && prettier --write 'src/**/*.svelte'"
description = "Format frontend code"
```

---

### TASK-1007: Update lefthook.yml for Frontend

**Goal**: Pre-commit hooks for frontend
**Files**: `lefthook.yml`
**Success**: Pre-commit runs frontend linting
**Dependencies**: TASK-1006
**Notes**: Add frontend-lint command to lefthook.

---

### TASK-1008: Update GitHub Actions for Frontend

**Goal**: CI runs frontend linting and build
**Files**: `.github/workflows/ci.yml`
**Success**: CI passes with frontend checks
**Dependencies**: TASK-1006
**Notes**: Add frontend job (npm install, lint, build).

---

### TASK-1009: Create Basic Route Structure

**Goal**: Create / and /specify routes
**Files**: `frontend/src/routes/+page.svelte`, `frontend/src/routes/specify/+page.svelte`
**Success**: Routes exist, render placeholder content
**Dependencies**: TASK-1001
**Notes**: / shows dashboard, /specify shows "Specify (coming soon)".

---

### TASK-1010: Create Layout with Tab Navigation

**Goal**: Tab bar to switch between routes
**Files**: `frontend/src/routes/+layout.svelte`
**Success**: Layout shows tabs for Specs, Design, Tasks (Design/Tasks disabled)
**Dependencies**: TASK-1009
**Notes**: Use Tailwind for styling.

---

### TASK-1011: Create WebSocket Protocol Types

**Goal**: TypeScript types matching backend protocol
**Files**: `frontend/src/lib/api/protocol.ts`
**Success**: ClientMessage, ServerMessage types defined
**Dependencies**: TASK-907 (backend protocol)
**Notes**: Mirror backend types in TypeScript.

---

### TASK-1012: Create REST API Client

**Goal**: Fetch specification from backend
**Files**: `frontend/src/lib/api/client.ts`
**Success**: getSpecification() fetches from GET /spec
**Dependencies**: TASK-1011
**Notes**: Use fetch(), handle errors.

---

### TASK-1013: Add Frontend Dev Server Task to .mise.toml

**Goal**: Quick way to run frontend dev server
**Files**: `.mise.toml`
**Success**: `mise run frontend:dev` starts Vite
**Dependencies**: TASK-1001
**Notes**:
```toml
[tasks."frontend:dev"]
run = "cd frontend && npm run dev"
description = "Run frontend dev server"

[tasks."frontend:build"]
run = "cd frontend && npm run build"
description = "Build frontend for production"
```

---

### TASK-1014: Test Frontend Linting

**Goal**: Verify linting passes
**Files**: None (validation)
**Success**: `mise run frontend:lint` passes
**Dependencies**: TASK-1006
**Notes**: Fix any linting errors.

---

### TASK-1015: Test Frontend Build

**Goal**: Verify frontend builds
**Files**: None (validation)
**Success**: `mise run frontend:build` succeeds
**Dependencies**: TASK-1013
**Notes**: Check build/ directory created.

---

### TASK-1016: VALIDATION - Frontend Setup Complete

**Goal**: Frontend project working
**Files**: None (validation)
**Success**:
- Frontend linting passes
- Frontend builds
- Dev server runs
- Routes render
- Tab navigation works
- CI passes for frontend

**Dependencies**: All Phase 10 tasks
**Notes**: Checkpoint. Frontend foundation ready.

---

## Phase 11: Frontend Implementation (22 tasks)

**Purpose**: Build WebSocket client + UI components.

### TASK-1101: Create WebSocket Service (Svelte 5 Runes)

**Goal**: WebSocket client with reactive state
**Files**: `frontend/src/lib/api/websocket.svelte.ts`
**Success**: WebSocketService class with $state runes
**Dependencies**: TASK-1011
**Notes**: See DESIGN.md for Svelte 5 pattern.

---

### TASK-1102: Implement WebSocket Connection

**Goal**: Connect to backend WebSocket
**Files**: `frontend/src/lib/api/websocket.svelte.ts` (append)
**Success**: Service connects to ws://localhost:8080/ws/specify
**Dependencies**: TASK-1101
**Notes**: Handle open, close, error events.

---

### TASK-1103: Implement Message Sending

**Goal**: Send ClientMessage to backend
**Files**: `frontend/src/lib/api/websocket.svelte.ts` (append)
**Success**: send() method sends typed messages
**Dependencies**: TASK-1102
**Notes**: JSON.stringify() before sending.

---

### TASK-1104: Implement Message Dispatching

**Goal**: Route incoming ServerMessage to handlers
**Files**: `frontend/src/lib/api/websocket.svelte.ts` (append)
**Success**: onmessage dispatches based on message type
**Dependencies**: TASK-1103
**Notes**: Switch on message.type, call appropriate handler.

---

### TASK-1105: Implement Auto-Reconnect

**Goal**: Reconnect on disconnect
**Files**: `frontend/src/lib/api/websocket.svelte.ts` (append)
**Success**: Service reconnects with exponential backoff
**Dependencies**: TASK-1104
**Notes**: Max 3 retries, then give up.

---

### TASK-1106: Create Session Store

**Goal**: Reactive session state
**Files**: `frontend/src/lib/stores/session.svelte.ts`
**Success**: SessionStore class with messages, isProcessing, previewChangelog
**Dependencies**: TASK-1101
**Notes**: Use Svelte 5 $state runes.

---

### TASK-1107: Create Specification Store

**Goal**: Reactive spec state
**Files**: `frontend/src/lib/stores/specification.svelte.ts`
**Success**: SpecificationStore with current spec, diff calculation
**Dependencies**: TASK-1106
**Notes**: Store current + preview spec, calculate diff.

---

### TASK-1108: Create LockStatus Component

**Goal**: Show lock state indicator
**Files**: `frontend/src/lib/components/LockStatus.svelte`
**Success**: Component shows "Available", "Locked by you", "Locked by CLI"
**Dependencies**: TASK-1106
**Notes**: Use Tailwind for styling (green/yellow/red).

---

### TASK-1109: Create MessageList Component

**Goal**: Display chat messages
**Files**: `frontend/src/lib/components/MessageList.svelte`
**Success**: Component renders messages with role-based styling
**Dependencies**: TASK-1106
**Notes**: Auto-scroll to bottom on new message.

---

### TASK-1110: Create MessageInput Component

**Goal**: Text input for user prompts
**Files**: `frontend/src/lib/components/MessageInput.svelte`
**Success**: Component with textarea + send button
**Dependencies**: TASK-1109
**Notes**: Enter to send, Shift+Enter for newline. Disable when processing.

---

### TASK-1111: Create ChatInterface Component

**Goal**: Compose MessageList + MessageInput
**Files**: `frontend/src/lib/components/ChatInterface.svelte`
**Success**: Component wires up message sending
**Dependencies**: TASK-1110
**Notes**: Connect to WebSocketService.

---

### TASK-1112: Create ChangelogView Component

**Goal**: Display changelog preview
**Files**: `frontend/src/lib/components/ChangelogView.svelte`
**Success**: Component renders changelog events
**Dependencies**: TASK-1106
**Notes**: Collapsible sections for each event type.

---

### TASK-1113: Create SpecDiff Component

**Goal**: Side-by-side diff viewer
**Files**: `frontend/src/lib/components/SpecDiff.svelte`
**Success**: Component shows old vs new spec with highlighting
**Dependencies**: TASK-1107
**Notes**: Use green for additions, red for deletions.

---

### TASK-1114: Create ConfirmationDialog Component

**Goal**: Yes/No/Feedback buttons
**Files**: `frontend/src/lib/components/ConfirmationDialog.svelte`
**Success**: Component with 3 buttons + feedback textarea
**Dependencies**: TASK-1112
**Notes**: Show/hide feedback input based on button click.

---

### TASK-1115: Wire Components into Specify Page

**Goal**: Compose all components
**Files**: `frontend/src/routes/specify/+page.svelte`
**Success**: Page shows chat, changelog, diff, confirmation
**Dependencies**: TASK-1114
**Notes**: Use Tailwind grid for layout.

---

### TASK-1116: Implement WebSocket Connection on Mount

**Goal**: Connect to backend when page loads
**Files**: `frontend/src/routes/specify/+page.svelte` (append)
**Success**: WebSocket connects in onMount()
**Dependencies**: TASK-1115, TASK-1105
**Notes**: Use onMount() lifecycle hook.

---

### TASK-1117: Wire Send Button to WebSocket

**Goal**: Send prompt to backend
**Files**: `frontend/src/routes/specify/+page.svelte` (append)
**Success**: Clicking send calls WebSocketService.send()
**Dependencies**: TASK-1116
**Notes**: Send ClientMessage with type "prompt".

---

### TASK-1118: Handle Progress Messages

**Goal**: Update UI during LLM processing
**Files**: `frontend/src/routes/specify/+page.svelte` (append)
**Success**: Progress messages appear in chat
**Dependencies**: TASK-1117
**Notes**: Add to messages array in session store.

---

### TASK-1119: Handle Preview Message

**Goal**: Show changelog + diff when ready
**Files**: `frontend/src/routes/specify/+page.svelte` (append)
**Success**: Preview message displays changelog and diff
**Dependencies**: TASK-1118
**Notes**: Set previewChangelog in session store.

---

### TASK-1120: Handle Confirmation

**Goal**: Send confirm or feedback to backend
**Files**: `frontend/src/routes/specify/+page.svelte` (append)
**Success**: Clicking "Yes" sends confirm, "Feedback" sends feedback
**Dependencies**: TASK-1119
**Notes**: Send ClientMessage with appropriate type.

---

### TASK-1121: Handle Committed Message

**Goal**: Show success, reset state
**Files**: `frontend/src/routes/specify/+page.svelte` (append)
**Success**: On committed, show success message, clear form
**Dependencies**: TASK-1120
**Notes**: Display "Specification saved!" message.

---

### TASK-1122: VALIDATION - Frontend Implementation Complete

**Goal**: Full frontend working
**Files**: None (validation)
**Success**:
- Can navigate to /specify
- WebSocket connects
- Can send prompt
- Progress messages appear
- Changelog preview displays
- Diff view shows changes
- Can confirm or provide feedback
- Success message on commit
- All components styled with Tailwind
- Responsive design works

**Dependencies**: All Phase 11 tasks
**Notes**: Major checkpoint. Frontend complete.

---

## Phase 12: Integration & Polish (18 tasks)

**Purpose**: E2E tests, documentation, final validation.

### TASK-1201: Write E2E Test: CLI Creates Spec

**Goal**: Test CLI from prompt to spec file
**Files**: `backend/tests/e2e/cli_test.go`
**Success**: Test runs `xdd specify`, verifies spec created
**Dependencies**: TASK-820
**Notes**: Use temp dir, fixtures for LLM. Tag with `//go:build e2e`.

---

### TASK-1202: Write E2E Test: Frontend Session

**Goal**: Test WebSocket session from frontend
**Files**: `frontend/tests/e2e/specify.test.ts`
**Success**: Test connects via WebSocket, sends prompt, confirms
**Dependencies**: TASK-1122
**Notes**: Use Playwright or similar. Mock backend if needed.

---

### TASK-1203: Write E2E Test: Lock Prevents Concurrent Access

**Goal**: Verify lock blocks second connection
**Files**: `backend/tests/e2e/lock_test.go`
**Success**: Test starts CLI, tries WebSocket, gets lock error
**Dependencies**: TASK-1201, TASK-918
**Notes**: Run CLI in background, attempt WebSocket connect.

---

### TASK-1204: Write E2E Test: Stale Lock Recovery

**Goal**: Test automatic stale lock cleanup
**Files**: `backend/tests/e2e/lock_test.go` (append)
**Success**: Test creates stale lock, verifies next session steals it
**Dependencies**: TASK-1203
**Notes**: Mock old timestamp.

---

### TASK-1205: Write E2E Test: LLM Validation Retry

**Goal**: Test retry on invalid LLM output
**Files**: `backend/tests/e2e/llm_retry_test.go`
**Success**: Test injects invalid output, verifies retry
**Dependencies**: TASK-625
**Notes**: Mock LLM to return invalid data on attempt 1, valid on attempt 2.

---

### TASK-1206: Write E2E Test: WebSocket Disconnect During Session

**Goal**: Test graceful handling of disconnect
**Files**: `backend/tests/e2e/websocket_disconnect_test.go`
**Success**: Test disconnects mid-session, verifies lock released
**Dependencies**: TASK-918
**Notes**: Close WebSocket during processing, verify cleanup.

---

### TASK-1207: Implement Structured Logging Throughout

**Goal**: Add logging to all major operations
**Files**: All backend files
**Success**: Every function logs entry/exit/errors
**Dependencies**: TASK-103 (Logger)
**Notes**: Use logger.Info() for operations, logger.Error() for errors.

---

### TASK-1208: Add Request Correlation IDs

**Goal**: Trace requests across components
**Files**: `backend/internal/core/logger.go`, `backend/internal/api/server.go`
**Success**: All logs include correlation ID
**Dependencies**: TASK-1207
**Notes**: Generate UUID on request, pass through context.

---

### TASK-1209: Create User Guide

**Goal**: Documentation for end users
**Files**: `docs/USER_GUIDE.md`
**Success**: Guide covers installation, init, specify workflows
**Dependencies**: TASK-820, TASK-1122
**Notes**: Include screenshots, examples.

---

### TASK-1210: Create API Documentation

**Goal**: Reference docs for API
**Files**: `docs/API.md`
**Success**: Document references openapi.yaml, explains WebSocket protocol
**Dependencies**: TASK-901
**Notes**: Link to OpenAPI spec, describe message flow.

---

### TASK-1211: Update README.md

**Goal**: Reflect V3 status
**Files**: `README.md`
**Success**: README shows V3 complete, links to guides
**Dependencies**: TASK-1209, TASK-1210
**Notes**: Update "Current Status" section.

---

### TASK-1212: Create Demo GIF

**Goal**: Visual demo of specify flow
**Files**: `docs/demo.gif`
**Success**: GIF shows CLI specify session
**Dependencies**: TASK-820
**Notes**: Use asciinema or similar.

---

### TASK-1213: Run Full Test Suite

**Goal**: All tests pass
**Files**: None (validation)
**Success**: `mise run test:full` passes for backend + frontend
**Dependencies**: All test tasks
**Notes**: Fix any failing tests.

---

### TASK-1214: Run Full Linting Suite

**Goal**: All linters pass
**Files**: None (validation)
**Success**: `mise run lint:all:fix` passes
**Dependencies**: All linting tasks
**Notes**: Fix any linting errors.

---

### TASK-1215: Verify CI Passes

**Goal**: GitHub Actions green
**Files**: None (validation)
**Success**: All CI jobs pass
**Dependencies**: TASK-1213, TASK-1214
**Notes**: Push to GitHub, verify CI.

---

### TASK-1216: Load Test: 100 Requirements

**Goal**: Verify system handles large specs
**Files**: None (manual test)
**Success**: Can create spec with 100 requirements without errors
**Dependencies**: TASK-820
**Notes**: Run specify with prompt for 100 requirements, verify spec created.

---

### TASK-1217: Manual Test: Full Workflow

**Goal**: Walk through complete user journey
**Files**: None (manual test)
**Success**:
- Fresh install
- `xdd init`
- `xdd specify` creates spec
- `xdd serve` starts server
- Frontend connects, creates spec via WebSocket
- Lock prevents concurrent access
- Unlock works

**Dependencies**: All phases
**Notes**: Final smoke test before release.

---

### TASK-1218: VALIDATION - Project Complete

**Goal**: xdd V3 ready for use
**Files**: None (validation)
**Success**:
- All tests pass (>180 tests)
- All linters pass
- CI passes
- Documentation complete
- Demo created
- Load testing passed
- Manual workflow successful
- No known bugs

**Dependencies**: All tasks
**Notes**: ✨ Ship it!

---

## Summary

**Total Tasks**: ~163 (refined from original 180)
**Estimated Time**: 6 weeks (full-time)

---

## Changelog

### Version 3.0.2 - 2025-10-01 (Current)

**Changes**:
- Removed `internal/foundation/` package (not in DESIGN.md)
- Moved logging, errors, config to `internal/core/` per DESIGN.md package boundaries
- Selected `github.com/gorilla/websocket` as WebSocket library (TASK-200)
- Consolidated Phase 1 foundation tasks: 12 → 10 tasks
- All tasks now perfectly aligned with DESIGN.md structure

**Rationale**:
- Foundation package was not specified in DESIGN.md
- Core utilities belong in `internal/core/` per package boundaries
- gorilla/websocket is stable and battle-tested (user decision)
- Test consolidation improves DX without sacrificing coverage

**Task Count**: ~163 tasks (-17 from original)

### Version 3.0.1 - 2025-10-01

**CEO Review**:
- Added TASK-200 for WebSocket library choice
- Added snapshot tasks (TASK-422/423)
- Consolidated schema testing (6 → 1 task)
- Clarified TASK-003 as OpenAPI schema generation

**Task Count**: ~165 tasks

### Version 3.0.0 - 2025-10-01 (Initial)

**Initial Breakdown**:
- 180 tasks across 12 phases
- Research phase (GenKit, atomicity, JSON schema)
- Foundation-first approach with validation checkpoints

**Task Count**: ~180 tasks
**Approach**: Top-to-bottom, sequential execution

**Key Milestones**:
- Phase 0-2: Foundation (1 week)
- Phase 3-4: Core + Persistence (1.5 weeks)
- Phase 5-6: LLM Integration (1.5 weeks)
- Phase 7-8: CLI (1 week)
- Phase 9-11: API + Frontend (1.5 weeks)
- Phase 12: Polish (0.5 weeks)

**Success Criteria**:
- Every task has clear pass/fail
- Each phase ends with validation checkpoint
- Nothing proceeds until tests pass
- Git history is clean (commit after each task)

**Execution Model**:
- Agentic LLM burns down tasks top-to-bottom
- Each task is 30-90 minutes
- No architectural decisions needed (all pre-made)
- Clear success criteria for automation

---

**End of TASKS.md**
