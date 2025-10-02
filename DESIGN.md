# xdd: Technical Design

**Version**: 1.0.0

---

## Overview

This document defines the concrete technical choices for building xdd V3. It translates the specification into specific libraries, architectures, and implementation patterns.

---

## Technology Stack

### Backend

| Component | Choice | Version |
|-----------|--------|---------|
| Language | Go | 1.21+ |
| HTTP Server | `net/http` stdlib | - |
| WebSocket | `nhooyr.io/websocket` | v1.8.10 |
| YAML | `gopkg.in/yaml.v3` | latest |
| LLM Framework | Firebase Genkit Go | latest |
| ID Generation | `github.com/matoous/go-nanoid` | v2.1.0 |
| File Locking | `golang.org/x/sys/unix` | latest |
| Testing | `testing` stdlib | - |

### Frontend

| Component | Choice | Version |
|-----------|--------|---------|
| Framework | Svelte 5 with SvelteKit | 5.37+ |
| Build Tool | Vite | 5.0+ |
| WebSocket | Native WebSocket API | - |
| Styling | Tailwind CSS | 3.4+ |
| TypeScript | TypeScript | 5.3+ |

### Development Tools

- **Task Runner**: Mise
- **Linting**: golangci-lint (Go), eslint (Svelte), markdownlint
- **Testing**: Go stdlib, Vitest (Svelte)

---

## Project Structure

```
xdd/
├── backend/
│   ├── cmd/
│   │   └── xdd/
│   │       ├── main.go
│   │       ├── specify.go
│   │       └── unlock.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── server.go
│   │   │   ├── websocket.go
│   │   │   └── handlers/
│   │   ├── core/
│   │   │   ├── session.go
│   │   │   ├── session_cli.go
│   │   │   └── session_ws.go
│   │   ├── llm/
│   │   │   ├── genkit.go
│   │   │   ├── provider_openrouter.go
│   │   │   └── tasks/
│   │   │       ├── metadata.go
│   │   │       ├── requirements_delta.go
│   │   │       ├── categorization.go
│   │   │       ├── requirement_gen.go
│   │   │       └── version_bump.go
│   │   └── repository/
│   │       ├── repository.go
│   │       ├── lock.go
│   │       ├── atomic.go
│   │       └── yaml.go
│   ├── pkg/
│   │   └── schema/
│   │       ├── specification.go
│   │       ├── requirement.go
│   │       ├── acceptance.go
│   │       └── changelog.go
│   └── scripts/
│       └── record-fixtures.go
├── frontend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte
│   │   │   └── specify/
│   │   │       └── +page.svelte
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   │   ├── websocket.svelte.ts
│   │   │   │   └── protocol.ts
│   │   │   ├── stores/
│   │   │   │   ├── session.svelte.ts
│   │   │   │   └── specification.svelte.ts
│   │   │   └── components/
│   │   │       ├── ChatInterface.svelte
│   │   │       ├── MessageList.svelte
│   │   │       ├── ChangelogView.svelte
│   │   │       └── LockStatus.svelte
│   │   └── app.css
│   └── package.json
└── docs/
    ├── SPEC.md
    ├── DESIGN.md
    └── TODO.md
```

---

## Backend Architecture

### Package Boundaries

**`pkg/schema`**: Public shared types (Specification, Requirement, ChangelogEvent)

**`internal/repository`**: File operations, YAML persistence, locking, transactions

**`internal/llm`**: Genkit integration, 5 LLM tasks, OpenRouter provider

**`internal/core`**: Session state machines, business logic

**`internal/api`**: HTTP server, WebSocket handlers

**`cmd/xdd`**: CLI commands (specify, unlock, init)

### Data Flow

```
User → CLI/WebSocket
  ↓
Session (in-memory state)
  ↓
LLM Tasks (5 sequential tasks)
  ↓
Repository (YAML + file lock)
  ↓
.xdd/ directory
```

---

## File Locking

### Implementation

```go
package repository

import (
    "encoding/json"
    "fmt"
    "os"
    "time"
    "golang.org/x/sys/unix"
)

type LockFile struct {
    PID       int       `json:"pid"`
    Hostname  string    `json:"hostname"`
    Interface string    `json:"interface"` // "cli" or "web"
    Timestamp time.Time `json:"timestamp"`
}

type FileLock struct {
    path      string
    file      *os.File
    interface string
}

func (l *FileLock) Acquire() error {
    file, err := os.OpenFile(l.path, os.O_CREATE|os.O_RDWR, 0644)
    if err != nil {
        return err
    }

    // Try exclusive lock
    if err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
        file.Close()

        // Check if stale
        existing, _ := l.readLockFile()
        if l.isStale(existing) {
            return l.stealLock(file)
        }

        return fmt.Errorf("locked by %s (PID %d)", existing.Interface, existing.PID)
    }

    l.file = file
    return l.writeLockMetadata()
}

func (l *FileLock) isStale(lock *LockFile) bool {
    // Process dead or lock older than 30 minutes
    if !processExists(lock.PID) {
        return true
    }
    return time.Since(lock.Timestamp) > 30*time.Minute
}

func (l *FileLock) Release() error {
    if l.file == nil {
        return nil
    }
    unix.Flock(int(l.file.Fd()), unix.LOCK_UN)
    l.file.Close()
    return os.Remove(l.path)
}
```

**Key Points**:
- Uses `flock(2)` for advisory locking
- Auto-releases on process death (kernel guarantee)
- Stale detection: dead process or 30min timeout
- Force unlock via `xdd unlock --force`

---

## Copy-on-Write Transactions

### Pattern

```go
type CopyOnWriteTx struct {
    baseDir   string // .xdd/
    tempDir   string // .xdd.tmp.<timestamp>/
}

func (tx *CopyOnWriteTx) Begin() error {
    tx.tempDir = fmt.Sprintf("%s.tmp.%d", tx.baseDir, time.Now().Unix())

    // Copy using hard links (instant, zero disk space)
    return filepath.Walk(tx.baseDir, func(path string, info os.FileInfo, err error) error {
        if info.IsDir() {
            return os.MkdirAll(dstPath, info.Mode())
        }

        // Hard link (same inode, different name)
        if err := os.Link(path, dstPath); err != nil {
            // Fallback to copy if cross-device
            return copyFile(path, dstPath)
        }
        return nil
    })
}

func (tx *CopyOnWriteTx) Commit() error {
    backupDir := fmt.Sprintf("%s.backup.%d", tx.baseDir, time.Now().Unix())

    // Atomic swap
    if err := os.Rename(tx.baseDir, backupDir); err != nil {
        return err
    }

    if err := os.Rename(tx.tempDir, tx.baseDir); err != nil {
        os.Rename(backupDir, tx.baseDir) // Rollback
        return err
    }

    os.RemoveAll(backupDir)
    return nil
}
```

**Key Points**:
- Hard links = instant copy (same inode)
- Must write new files (not edit existing)
- Atomic rename guaranteed by POSIX
- Backup deleted after successful commit

### Design Evolution: True Copying vs Hard Links

**Important**: The actual implementation uses **true file copying** instead of the hard links shown in the code example above.

#### Why Not Hard Links?

Hard links (`os.Link`) create multiple directory entries pointing to the same inode. This means:

- Both paths reference the **same physical data** on disk
- Writing to either path modifies the **same file**
- Transaction modifications would **immediately affect** the original .xdd/ directory
- This **breaks transaction isolation** - the core guarantee of atomic transactions

**Example of the problem**:

```go
// With hard links (BROKEN):
tx.Begin()  // Hard links .xdd/specification.yaml → .xdd.tmp.123/specification.yaml
            // Both paths point to SAME inode

tx.WriteFile("01-specs/specification.yaml", newData)
// ❌ This modifies BOTH .xdd/ and .xdd.tmp/ simultaneously!

tx.Rollback()
// ❌ Too late - original .xdd/ already corrupted
```

#### True Copying Solution

The implementation uses `io.Copy` to create **independent physical copies**:

```go
func copyFile(src, dst string) error {
    srcFile, _ := os.Open(src)
    defer srcFile.Close()

    dstFile, _ := os.Create(dst)
    defer dstFile.Close()

    io.Copy(dstFile, srcFile)  // Physical byte copy
    return nil
}
```

This ensures:

- Transaction modifications stay in temp directory
- Original .xdd/ unchanged until atomic commit
- Rollback is guaranteed safe
- Works across filesystems (hard links require same device)

#### Performance Trade-off

| Approach | Time | Disk Space | Isolation |
|----------|------|------------|-----------|
| Hard links | O(1), ~1ms | Zero | ❌ Broken |
| True copy | O(n), ~5ms for 100 reqs | Temporary copy | ✅ Correct |

**For the target use case** (solo dev, <100 files), the 4ms overhead is negligible compared to:

- LLM API calls: 1-5 seconds
- User thinking time: 10-60 seconds
- Interactive CLI response expectations: <100ms acceptable

**Correctness is non-negotiable**. The 4ms overhead is an acceptable cost for proper transaction guarantees.

#### Future Optimization

If performance becomes a bottleneck (>1000 requirements):

- Track modified files, copy only changed files
- Parallel copying with goroutines
- Filesystem-level snapshots (Btrfs/ZFS on Linux)

But for V1: **correctness first, optimization later**.

**See**: `docs/architecture/ADR-001-atomic-transactions-true-copy.md` for detailed analysis.

---

## LLM Integration

### Custom OpenRouter Provider

OpenRouter implements OpenAI-compatible API. Create custom Genkit provider:

```go
package llm

import (
    "context"
    "github.com/firebase/genkit/go/genkit"
    "github.com/firebase/genkit/go/ai"
)

const apiBaseURL = "https://openrouter.ai/api/v1"

func registerOpenRouterProvider(g *genkit.Genkit, cfg *Config) error {
    models := []string{
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.0-flash-thinking-exp",
    }

    for _, modelName := range models {
        genkit.DefineModel(g, "openrouter", modelName,
            &ai.ModelInfo{
                Label: fmt.Sprintf("OpenRouter: %s", modelName),
                Supports: &ai.ModelSupports{
                    Multiturn:  true,
                    SystemRole: true,
                },
            },
            func(ctx context.Context, mr *ai.ModelRequest, cb ai.ModelStreamCallback) (*ai.ModelResponse, error) {
                return callOpenRouterAPI(ctx, cfg, modelName, mr)
            },
        )
    }

    return nil
}

func callOpenRouterAPI(ctx context.Context, cfg *Config, model string, req *ai.ModelRequest) (*ai.ModelResponse, error) {
    // Convert Genkit request to OpenRouter format
    // Make HTTP POST to apiBaseURL/chat/completions
    // Return Genkit response
}
```

### 5 LLM Tasks

#### Task 1: Metadata Update

**Input**:
```go
type MetadataTaskInput struct {
    Existing      *ProjectMetadata
    UpdateRequest string
    IsNewProject  bool
}
```

**Output**:
```go
type MetadataTaskOutput struct {
    Name        string
    Description string
    Changed     struct {
        Name        bool
        Description bool
    }
    Reasoning string
}
```

**Validation**: Name 1-100 chars, description 10-1000 chars, 3 retries

#### Task 2: Requirements Delta

**Input**:
```go
type RequirementsDeltaInput struct {
    ExistingRequirements []Requirement
    ExistingCategories   []string
    UpdateRequest        string
}
```

**Output**:
```go
type RequirementsDeltaOutput struct {
    ToRemove []struct {
        ID        string
        Reasoning string
    }
    ToAdd []struct {
        Category          string
        BriefDescription  string
        EARSType          string
        EstimatedPriority string
        Reasoning         string
    }
    AmbiguousModifications []struct {
        PossibleTargets []string
        Clarification   string
    }
}
```

**Special Handling**: If ambiguous, pause and ask user for clarification

#### Task 3: Categorization

**Input**:
```go
type CategorizationInput struct {
    ProjectName          string
    ProjectDescription   string
    AllRequirementBriefs []string
}
```

**Output**:
```go
type CategorizationOutput struct {
    Categories []struct {
        Name        string
        Description string
        Count       int
    }
    RequirementMapping map[string]string
    Reasoning          string
}
```

**Model**: Use `google/gemini-2.0-flash-thinking-exp` (thinking model for better reasoning)

#### Task 4: Requirement Generation

**Input** (per requirement):
```go
type RequirementGenInput struct {
    Category          string
    EARSType          string
    BriefDescription  string
    EstimatedPriority string
    Context           RequirementGenContext
}
```

**Output**:
```go
type RequirementGenOutput struct {
    Description        string // EARS-formatted
    Rationale          string
    AcceptanceCriteria []AcceptanceCriterion
    Priority           string
}
```

**Execution**: Parallel with semaphore (max 3 concurrent)

#### Task 5: Version Bump

**Input**:
```go
type VersionBumpInput struct {
    CurrentVersion     string
    Changes            VersionChanges
    ChangeDescriptions []string
}
```

**Output**:
```go
type VersionBumpOutput struct {
    NewVersion string // SemVer
    BumpType   string // "major"|"minor"|"patch"
    Reasoning  string
}
```

### Validation Retry Pattern

```go
func ExecuteWithValidation[T any](
    ctx context.Context,
    client *Client,
    prompt string,
    validate func(*T) error,
) (*T, error) {
    for attempt := 0; attempt < 3; attempt++ {
        result := generateStructuredOutput[T](ctx, client, prompt)

        if err := validate(result); err == nil {
            return result, nil
        }

        // Add validation error to prompt for retry
        prompt = fmt.Sprintf("%s\n\nPREVIOUS ATTEMPT FAILED:\n%s\n\nPlease fix.", prompt, err)
    }

    return nil, fmt.Errorf("validation failed after 3 attempts")
}
```

---

## YAML Persistence

### File Structure

**.xdd/01-specs/specification.yaml**:
```yaml
version: 0.2.1

metadata:
  name: TaskMaster
  description: A collaborative task management application
  version: 0.2.1
  created_at: 2025-10-01T10:30:00Z
  updated_at: 2025-10-01T14:22:15Z

categories:
  - AUTH
  - TASKS

requirements:
  - id: REQ-AUTH-a8b2f91k
    type: event
    category: AUTH
    description: When user initiates OAuth login, the system shall redirect to provider
    rationale: OAuth provides secure authentication
    priority: high
    created_at: 2025-10-01T10:30:15Z
    acceptance_criteria:
      - type: behavioral
        id: AC-x1y2z3a4
        given: User is on login page
        when: User clicks OAuth button
        then: System redirects to provider
        created_at: 2025-10-01T10:30:15Z
```

**.xdd/01-specs/changelog.yaml**:
```yaml
version: 0.2.1
events_since_snapshot: 23
last_snapshot: 2025-10-01T12:00:00Z

events:
  - event_type: RequirementAdded
    event_id: EVT-v5w6x7y8
    timestamp: 2025-10-01T10:30:15Z
    requirement:
      id: REQ-AUTH-a8b2f91k
      # ... (full requirement)
```

### Polymorphic Type Handling

**AcceptanceCriterion** (2 types):
```go
type AcceptanceCriterionYAML struct {
    Type string                 `yaml:"type"` // discriminator
    Data map[string]interface{} `yaml:",inline"`
}

func (ac *AcceptanceCriterionYAML) UnmarshalYAML(node *yaml.Node) error {
    // Extract type field
    var raw struct{ Type string `yaml:"type"` }
    node.Decode(&raw)

    // Unmarshal into concrete type
    switch raw.Type {
    case "behavioral":
        var bc BehavioralCriterion
        node.Decode(&bc)
    case "assertion":
        var as AssertionCriterion
        node.Decode(&as)
    }
    return nil
}
```

**ChangelogEvent** (8 types): Same pattern with `event_type` discriminator

---

## Frontend Architecture

### Svelte 5 Runes State Management

```typescript
// lib/stores/session.svelte.ts
class SessionStore {
  private state = $state({
    messages: [] as Message[],
    isProcessing: false,
    currentPhase: null as string | null,
    previewChangelog: null as ChangelogPreview | null,
  });

  get messages() { return this.state.messages; }
  get isProcessing() { return this.state.isProcessing; }

  addMessage(role: 'user' | 'assistant', content: string) {
    this.state.messages.push({ id: crypto.randomUUID(), role, content });
  }
}

export const sessionStore = new SessionStore();
```

### WebSocket Client

```typescript
// lib/api/websocket.svelte.ts
export class WebSocketService {
  private ws: WebSocket | null = $state(null);
  public connectionState = $state<'disconnected' | 'connected' | 'error'>('disconnected');

  connect(): void {
    this.ws = new WebSocket('ws://localhost:8080/ws/specify');

    this.ws.onopen = () => {
      this.connectionState = 'connected';
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.dispatch(msg);
    };
  }

  send(message: object): void {
    this.ws?.send(JSON.stringify(message));
  }
}
```

### Chat Interface Component

```svelte
<!-- lib/components/ChatInterface.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { sessionStore } from '$lib/stores/session.svelte';

  let ws = $state<WebSocketService | null>(null);

  onMount(() => {
    ws = new WebSocketService('ws://localhost:8080/ws/specify');
    ws.connect();

    ws.on('progress', (msg) => {
      sessionStore.addMessage('system', msg.content);
    });

    ws.on('preview', (msg) => {
      sessionStore.setPreview(msg.changelog);
    });
  });

  function handleSend(content: string) {
    sessionStore.addMessage('user', content);
    ws?.send({ type: 'prompt', content });
  }
</script>

<div class="flex h-screen flex-col">
  <MessageList messages={sessionStore.messages} />
  <MessageInput onSend={handleSend} />

  {#if sessionStore.previewChangelog}
    <ChangelogView changelog={sessionStore.previewChangelog} />
  {/if}
</div>
```

---

## Testing Strategy

### Fixture Recording

**Script**: `backend/scripts/record-fixtures.go`

```go
func main() {
    client := llm.NewGenkitClient(context.Background())

    fixtures := []struct {
        name string
        fn   func() error
    }{
        {"metadata-new-project", recordMetadataNewProject},
        {"requirements-delta-add", recordRequirementsDeltaAdd},
        // ... 9 total fixtures
    }

    for _, f := range fixtures {
        fmt.Printf("Recording %s...\n", f.name)
        f.fn()
    }
}

func recordMetadataNewProject() error {
    input := tasks.MetadataTaskInput{
        UpdateRequest: "Build a task manager",
        IsNewProject:  true,
    }

    output, _ := task.Execute(context.Background(), input)

    fixture := Fixture{
        Name:   "metadata-new-project",
        Input:  input,
        Output: output,
    }

    saveFixture("testdata/fixtures/metadata-new-project.json", fixture)
}
```

### Test Structure

```go
// internal/llm/tasks/metadata_test.go
func TestMetadataTask_NewProject(t *testing.T) {
    mockClient := testutil.NewMockClientWithFixtures(t, "metadata-new-project")
    task := NewMetadataTask(mockClient)

    input := MetadataTaskInput{
        UpdateRequest: "Build a task manager",
        IsNewProject:  true,
    }

    output, err := task.Execute(context.Background(), input)

    require.NoError(t, err)
    assert.Equal(t, "TaskMaster", output.Name)
}
```

### Mock LLM Client

```go
// internal/llm/mock.go
type MockClient struct {
    Fixtures map[string]interface{}
}

func (m *MockClient) ExecuteTask(ctx context.Context, task Task) (TaskResult, error) {
    output := m.Fixtures[task.Name]
    return TaskResult{Output: output}, nil
}
```

### Coverage Target

**Per Package**:
- `internal/llm/tasks`: 90%
- `internal/repository`: 85%
- `internal/core`: 80%
- `internal/api`: 75%

**Run**:
```bash
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out | grep total
```

---

## Environment Setup

### Backend

```bash
cd backend
go mod init xdd
go get github.com/firebase/genkit/go/genkit
go get nhooyr.io/websocket
go get gopkg.in/yaml.v3
go get github.com/matoous/go-nanoid/v2
go get golang.org/x/sys/unix
```

### Frontend

```bash
cd frontend
npm create svelte@latest .
npm install
npm install -D tailwindcss
npx tailwindcss init
```

### Configuration

**.env** (backend):
```bash
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
```

---

## Build Commands

### Development

```bash
# Backend
cd backend
go run cmd/xdd/main.go specify "Build a task manager"

# Frontend
cd frontend
npm run dev

# Tests
cd backend
go test ./...
```

### Production

```bash
# Build CLI
cd backend
go build -o xdd cmd/xdd/main.go

# Build frontend
cd frontend
npm run build

# Single binary distribution
./backend/xdd
```

---

## Summary

This design directly implements SPEC.md with concrete technical choices.

**Key Decisions**:
- Go stdlib-first (minimal dependencies)
- Genkit for LLM integration
- Svelte 5 runes (modern reactive model)
- Fixture-based testing (fast, deterministic)

**Implementation Approach**:
- Start with core infrastructure
- Build incrementally with validation
- Test thoroughly at each layer
