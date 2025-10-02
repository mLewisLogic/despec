# How to Record LLM Fixtures

This guide explains how to record real LLM responses as fixtures for deterministic testing.

## Prerequisites

- OpenRouter API key with credits
- Go 1.21+ installed
- Backend project dependencies installed

## Why Record Fixtures?

Fixtures allow us to test LLM integration logic without:

- Making expensive API calls on every test run
- Dealing with non-deterministic LLM outputs
- Requiring API keys in CI/CD pipelines

We record real LLM responses once, then replay them in tests.

## Cost Estimate

Recording all 15 fixtures costs approximately **$0.50**:

| Task Category | Fixtures | Est. Cost |
|---------------|----------|-----------|
| Metadata | 3 | $0.06 |
| Requirements Delta | 3 | $0.13 |
| Categorization | 2 | $0.10 |
| Requirement Generation | 4 | $0.12 |
| Version Bump | 3 | $0.03 |
| **Total** | **15** | **~$0.50** |

Time required: ~30 seconds

## Required Fixtures

### Metadata Task (3 fixtures)

1. **metadata-new-project** - Create metadata for new project
2. **metadata-update-name** - Update project name
3. **metadata-update-description** - Update project description

### Requirements Delta Task (3 fixtures)

1. **delta-add-requirements** - Add new requirements to empty spec
2. **delta-remove-requirements** - Remove existing requirements
3. **delta-ambiguous** - Ambiguous modification requiring clarification
   - Note: Ambiguity is represented in the output's `AmbiguousModifications` field, not as an error
   - The LLM should return valid output with the ambiguous scenarios listed

### Categorization Task (2 fixtures)

1. **categorization-small** - Categorize 3 requirements
2. **categorization-large** - Categorize 8 requirements

### Requirement Generation Task (4 fixtures)

1. **requirement-gen-ubiquitous** - Generate ubiquitous requirement (EARS)
2. **requirement-gen-event** - Generate event-driven requirement (EARS)
3. **requirement-gen-state** - Generate state-driven requirement (EARS)
4. **requirement-gen-optional** - Generate optional requirement (EARS)

### Version Bump Task (3 fixtures)

1. **version-bump-major** - Major version bump (breaking changes)
2. **version-bump-minor** - Minor version bump (new features)
3. **version-bump-patch** - Patch version bump (refinements)

## Step-by-Step Instructions

### 1. Get OpenRouter API Key

1. Sign up at [https://openrouter.ai](https://openrouter.ai)
2. Add credits to your account (minimum $1)
3. Generate an API key from dashboard
4. Copy the key (starts with `sk-or-v1-...`)

### 2. Set Environment Variable

```bash
# Export API key
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```

### 3. Run Recording Script

```bash
# Navigate to backend directory
cd backend

# Run recording script
go run scripts/record-fixtures.go
```

You will see a confirmation prompt:

```text
🎬 LLM Fixture Recording

This will record 15 fixtures:
  - 3 metadata fixtures
  - 3 requirements delta fixtures
  - 2 categorization fixtures
  - 4 requirement generation fixtures
  - 3 version bump fixtures

Estimated cost: ~$0.50
Estimated time: ~30 seconds

Continue? [y/N]:
```

Type `y` and press Enter.

### 4. Monitor Progress

The script will display real-time progress:

```text
📡 Calling real LLM APIs...

📝 metadata-new-project... ✓ (2.3s) - $0.02
📝 metadata-update-name... ✓ (1.8s) - $0.02
📝 metadata-update-description... ✓ (2.1s) - $0.02
📝 delta-add-requirements... ✓ (3.2s) - $0.05
📝 delta-remove-requirements... ✓ (2.7s) - $0.04
...
```

### 5. Verify Success

After completion, you'll see a summary:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 15 fixtures
✅ Succeeded: 15
❌ Failed: 0
💰 Total cost: $0.48
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ All fixtures recorded successfully!
💾 Saved to: internal/llm/testdata/fixtures/

Next steps:
  1. Verify: go run scripts/verify-fixtures.go
  2. Run tests: go test ./internal/llm/tasks/...
```

### 6. Verify Fixtures

Run the verification script to ensure all fixtures are valid:

```bash
go run scripts/verify-fixtures.go
```

Expected output:

```text
🔍 Verifying LLM fixtures...

✅ metadata-new-project (anthropic/claude-3.5-sonnet, 2m old)
✅ metadata-update-name (anthropic/claude-3.5-sonnet, 2m old)
✅ metadata-update-description (anthropic/claude-3.5-sonnet, 2m old)
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 15 fixtures
✅ Valid: 15
❌ Missing: 0
❌ Invalid: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ All fixtures verified successfully!
```

### 7. Run Tests with Fixtures

Now you can run tests using the recorded fixtures:

```bash
# Run all LLM task tests
go test ./internal/llm/tasks/...

# Run with verbose output
go test -v ./internal/llm/tasks/...
```

Tests will load fixtures instead of making real API calls.

## Troubleshooting

### API Key Not Set

**Error**:

```text
❌ OPENROUTER_API_KEY environment variable required
```

**Solution**: Export the environment variable:

```bash
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```

### Recording Failed

**Error**:

```text
❌ metadata-new-project... FAILED: connection timeout
```

**Causes**:

- Network connectivity issues
- OpenRouter API down
- Rate limiting
- Insufficient credits

**Solution**:

1. Check network connection
2. Verify API key is valid
3. Check OpenRouter status: [https://status.openrouter.ai](https://status.openrouter.ai)
4. Add more credits if needed
5. Wait a few minutes if rate-limited

### Fixture Validation Failed

**Error**:

```text
❌ metadata-new-project - INVALID JSON: unexpected end of JSON input
```

**Causes**:

- Partial write during recording
- Disk space issues
- File corruption

**Solution**:

1. Delete invalid fixture: `rm internal/llm/testdata/fixtures/metadata-new-project.json`
2. Re-run recording script: `go run scripts/record-fixtures.go`

### Fixtures Missing After Recording

**Error**:

```text
❌ metadata-new-project - MISSING
```

**Causes**:

- Directory permissions
- Disk space
- Recording script exited early

**Solution**:

1. Check directory exists: `ls -la internal/llm/testdata/fixtures/`
2. Check permissions: `ls -ld internal/llm/testdata/`
3. Re-run recording script

## Directory Structure

Fixtures are stored in:

```text
backend/internal/llm/testdata/fixtures/
├── .gitkeep
├── metadata-new-project.json
├── metadata-update-name.json
└── ... (15 fixtures total)
```

**Important Notes**:

- The fixtures directory is **auto-created** by both recording and testing scripts
- Path is consistent: `internal/llm/testdata/fixtures/`
- `.gitkeep` ensures the directory is tracked by Git even when empty
- All scripts (recording, verification, tests) use the same path

## Fixture File Structure

Each fixture is a JSON file with this structure:

```json
{
  "name": "metadata-new-project",
  "input": {
    "update_request": "Build a collaborative task manager...",
    "is_new_project": true
  },
  "output": {
    "name": "TaskMaster",
    "description": "A collaborative task management application...",
    "changed": {
      "name": true,
      "description": true
    },
    "reasoning": "TaskMaster clearly conveys..."
  },
  "model": "anthropic/claude-3.5-sonnet",
  "timestamp": "2025-10-02T14:30:00Z"
}
```

Fields:

- **name**: Fixture identifier (matches filename without .json)
- **input**: Task input (varies by task type)
- **output**: LLM response (structured, validated)
- **model**: Model used for generation
- **timestamp**: When fixture was recorded

## When to Re-Record Fixtures

Re-record fixtures when:

1. **Task input/output schemas change** - Breaking changes require new fixtures
2. **EARS format updates** - Requirement generation relies on specific format
3. **Prompts significantly modified** - Major prompt changes may alter output structure
4. **Model upgraded** - Switching models (e.g., Claude 3.5 → 4.0) may change responses

Do NOT re-record for:

- Minor prompt tweaks (test with existing fixtures first)
- Cosmetic changes (formatting, whitespace)
- Non-LLM code changes

## Manual Fixture Creation (Advanced)

For testing edge cases, you can manually create fixtures:

1. Copy an existing fixture as template
2. Modify `input` to match your test case
3. Manually craft expected `output` based on validation rules
4. Update `name` and `timestamp`
5. Place in `internal/llm/testdata/fixtures/`

Example for testing validation failure:

```json
{
  "name": "metadata-invalid-name-too-short",
  "input": {
    "update_request": "Rename to X",
    "is_new_project": false
  },
  "output": {
    "name": "X",
    "description": "Valid description here",
    "changed": {"name": true, "description": false},
    "reasoning": "Short name for brevity"
  },
  "model": "anthropic/claude-3.5-sonnet",
  "timestamp": "2025-10-02T14:30:00Z"
}
```

This fixture will fail validation (name too short) - useful for testing retry logic.

## CI/CD Integration

Fixtures enable testing in CI/CD without API keys:

```yaml
# .github/workflows/test.yml
- name: Run LLM task tests
  run: |
    cd backend
    go test ./internal/llm/tasks/...
  # No OPENROUTER_API_KEY needed - uses fixtures
```

If fixtures are missing in CI, tests will fail with clear error:

```text
❌ Failed to load fixture metadata-new-project: file not exist

Fixtures not recorded. Run locally:
  OPENROUTER_API_KEY=sk-... go run scripts/record-fixtures.go
```

## Next Steps

After recording fixtures:

1. **Run tests**: `go test ./internal/llm/tasks/...`
2. **Check coverage**: `go test -cover ./internal/llm/tasks/...`
3. **Update tests**: Add fixture-based tests for each task
4. **Document**: Note fixture recording date in commit message
