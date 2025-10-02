# LLM Tasks Implementation

Phase 6 implementation status for xdd V3 LLM task execution.

## Implementation Status

### ✅ Completed (TASK-601 through TASK-616)

**Core Task Implementation:**

- `types.go` - All I/O type definitions for 5 LLM tasks
- `metadata.go` - Metadata generation/update task with validation
- `requirements_delta.go` - Requirements delta analysis with ambiguity handling
- `categorization.go` - Categorization task using thinking model
- `requirement_gen.go` - Requirement generation with EARS format
- `version_bump.go` - Semantic version bump decision task

**Testing Infrastructure:**

- `metadata_test.go` - Metadata validation tests
- `requirements_delta_test.go` - Delta validation tests
- `categorization_test.go` - Categorization validation tests
- `requirement_gen_test.go` - Requirement generation validation tests
- `version_bump_test.go` - Version bump validation tests
- `integration_test.go` - Full task chain test (skeleton)

**Fixture System:**

- `../fixtures.go` - Enhanced with UnmarshalInput/UnmarshalOutput methods
- `../scripts/record-fixtures.go` - Recording script for all 15 fixtures

### 🚧 Pending (TASK-617 through TASK-625)

**Next Steps:**

1. **Record Fixtures (TASK-618-622)** - Requires API key
   ```bash
   OPENROUTER_API_KEY=sk-... go run scripts/record-fixtures/main.go
   ```

2. **Refactor Tests (TASK-623)** - Once fixtures are recorded:
   - Update all `*_test.go` files to use fixtures
   - Remove placeholder validation-only tests
   - Test actual task execution with canned responses

3. **Integration Test (TASK-624)** - Complete full task chain test:
   - Load all fixtures
   - Execute tasks in sequence
   - Assert final specification state

4. **Validation Checkpoint (TASK-625)** - Verify:
   - All 5 tasks working with fixtures
   - Integration test passing
   - >80% coverage for tasks package
   - Can call real LLM with API key

## Task Execution Flow

All tasks follow this pattern:

```go
func ExecuteTask(client *llm.Client, ctx context.Context, input *Input) (*Output, error) {
    // 1. Build prompt using llm.BuildXXXPrompt()
    prompt := llm.BuildPrompt(input)

    // 2. Define validation function
    validate := func(output *Output) error {
        // Validate against schema constraints
        return nil
    }

    // 3. Call LLM with retry
    result, err := llm.GenerateStructured[Output](
        client,
        ctx,
        model, // "" = default, or specific model
        prompt,
        validate,
    )

    return result, err
}
```

## Special Cases

### Categorization Task

Uses thinking model for better reasoning:

```go
llm.GenerateStructured[CategorizationOutput](
    client,
    ctx,
    "google/gemini-2.0-flash-thinking-exp", // Override default
    prompt,
    validate,
)
```

### Requirements Delta Task

Returns special error for ambiguous modifications:

```go
if len(result.AmbiguousModifications) > 0 {
    return nil, &AmbiguousModificationError{
        Clarifications: result.AmbiguousModifications,
    }
}
```

## Validation Limits

All validation enforces limits from `pkg/schema/base.go`:

- **Metadata:**
  - Name: 1-100 chars
  - Description: 10-1000 chars

- **Requirements:**
  - Description: 10-500 chars
  - Rationale: 10-500 chars
  - Acceptance Criteria: 1-10 items

- **Categories:**
  - Name: 1-20 chars
  - Must be UPPERCASE

- **Acceptance Criteria:**
  - Given/When/Then: max 200 chars each
  - Assertion statement: max 200 chars

## Current Test Coverage

**Coverage: 0%** (validation tests don't execute actual tasks)

After fixture implementation, target coverage: **>80%**

## Files Created

```
backend/internal/llm/tasks/
├── types.go                          # All I/O types
├── metadata.go                       # Task 1
├── requirements_delta.go             # Task 2
├── categorization.go                 # Task 3
├── requirement_gen.go                # Task 4
├── version_bump.go                   # Task 5
├── metadata_test.go                  # Validation tests
├── requirements_delta_test.go
├── categorization_test.go
├── requirement_gen_test.go
├── version_bump_test.go
├── integration_test.go               # Full chain test
└── test_helpers.go                   # Test utilities

backend/scripts/
└── record-fixtures.go                # Fixture recording

backend/internal/llm/
└── fixtures.go                       # Enhanced with unmarshal helpers
```

## How to Record Fixtures

```bash
cd backend

# Set API key
export OPENROUTER_API_KEY=sk-or-v1-...

# Run recording script (costs ~$0.50)
go run scripts/record-fixtures/main.go

# Output:
# 🎬 Recording fixtures...
# 📡 Calling real LLM APIs (this will cost ~$0.50)
#
# 📝 metadata-new-project... ✓ (2.3s) - $0.02
# 📝 metadata-update-name... ✓ (2.1s) - $0.02
# ...
#
# ✨ Total estimated cost: $0.47
# 💾 Fixtures saved to internal/llm/testdata/fixtures/
```

## Fixtures to Record

1. `metadata-new-project.json`
2. `metadata-update-name.json`
3. `metadata-update-description.json`
4. `delta-add-requirements.json`
5. `delta-remove-requirements.json`
6. `delta-ambiguous.json`
7. `categorization-small.json`
8. `categorization-large.json`
9. `requirement-gen-ubiquitous.json`
10. `requirement-gen-event.json`
11. `requirement-gen-state.json`
12. `requirement-gen-optional.json`
13. `version-bump-major.json`
14. `version-bump-minor.json`
15. `version-bump-patch.json`

## Next Phase

After TASK-625 checkpoint passes:

- **Phase 7:** Session management (CLI and WebSocket)
- **Phase 8:** CLI implementation (`xdd specify` command)
- **Phase 9:** Copy-on-write transactions and file locking
- **Phase 10:** Full end-to-end integration

## Notes

- All task functions return errors wrapped with context
- Validation happens in LLM loop with 3 retry attempts
- Prompts are built in `internal/llm/prompts.go`
- EARS decision tree is embedded in prompts for consistency
