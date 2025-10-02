# LLM Fixtures Quick Reference

## Record Fixtures (One-Time Setup)

```bash
# Set API key
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# Record all fixtures (~$0.50, ~30s)
go run scripts/record-fixtures/main.go

# Verify
go run scripts/verify-fixtures/main.go
```

## Run Tests

```bash
# Tests automatically use fixtures (no API key needed)
go test ./internal/llm/tasks/...

# Specific task
go test ./internal/llm/tasks/ -run TestMetadata
```

## Verify Fixtures

```bash
# Check all fixtures are valid
go run scripts/verify-fixtures/main.go
```

## Fixture Locations

- **Fixtures**: `internal/llm/testdata/fixtures/*.json`
- **Recording script**: `scripts/record-fixtures.go`
- **Verification script**: `scripts/verify-fixtures.go`

## Required Fixtures (15 total)

### Metadata (3)
- metadata-new-project
- metadata-update-name
- metadata-update-description

### Requirements Delta (3)
- delta-add-requirements
- delta-remove-requirements
- delta-ambiguous

### Categorization (2)
- categorization-small
- categorization-large

### Requirement Generation (4)
- requirement-gen-ubiquitous
- requirement-gen-event
- requirement-gen-state
- requirement-gen-optional

### Version Bump (3)
- version-bump-major
- version-bump-minor
- version-bump-patch

## Troubleshooting

### Fixtures Not Found
```bash
# Error in tests:
# "fixture not found: metadata-new-project"

# Solution: Record fixtures
OPENROUTER_API_KEY=sk-... go run scripts/record-fixtures/main.go
```

### Recording Failed
```bash
# Check API key
echo $OPENROUTER_API_KEY

# Check OpenRouter credits at https://openrouter.ai

# Re-run recording
go run scripts/record-fixtures/main.go
```

### Invalid Fixture
```bash
# Delete and re-record
rm internal/llm/testdata/fixtures/metadata-new-project.json
go run scripts/record-fixtures/main.go
```

## When to Re-Record

Re-record fixtures when:
- ✅ Task input/output schemas change
- ✅ EARS format updates
- ✅ Model upgraded (e.g., Claude 3.5 → 4.0)

Do NOT re-record for:
- ❌ Minor prompt tweaks
- ❌ Cosmetic changes
- ❌ Non-LLM code changes

## Documentation

See [docs/how-to-record-fixtures.md](../docs/how-to-record-fixtures.md) for detailed instructions.
