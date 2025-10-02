# Genkit Research

**Decision**: ✅ Use Genkit for xdd LLM integration
**Date**: 2025-10-01

---

## What We Need

xdd requires:
1. **Structured LLM output** matching Go structs (MetadataTaskOutput, RequirementGenOutput, etc.)
2. **Validation & retry** when LLM produces invalid output
3. **Multi-model support** (Anthropic, Google via OpenRouter)
4. **Type safety** (compile-time + runtime)

---

## Why Genkit

**Genkit provides exactly this**:

```go
type MetadataTaskOutput struct {
    Name        string `json:"name"`
    Description string `json:"description"`
    Reasoning   string `json:"reasoning"`
}

// Type-safe structured output with auto-validation
result, _, err := genkit.GenerateData[MetadataTaskOutput](ctx, g,
    ai.WithPrompt("Generate project metadata for: %s", input),
    ai.WithModelName("openrouter/anthropic/claude-3.5-sonnet"),
)
// result is *MetadataTaskOutput, fully unmarshaled and validated
```

**Key benefits**:
- **Auto JSON schema** from struct (no manual schema writing)
- **Compile-time type safety** via generics
- **Runtime validation** (unmarshal fails if LLM output doesn't match)
- **Model abstraction** (swap models by changing string)

---

## Custom OpenRouter Provider

OpenRouter is OpenAI-API compatible. Implement custom provider:

```go
// backend/internal/llm/provider_openrouter.go
func RegisterOpenRouterProvider(g *genkit.Genkit, apiKey string) error {
    models := []string{
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.0-flash-thinking-exp",
    }

    for _, modelName := range models {
        genkit.DefineModel(g, "openrouter", modelName,
            &ai.ModelInfo{
                Label: fmt.Sprintf("OpenRouter: %s", modelName),
                Supports: &ai.ModelSupports{Multiturn: true, SystemRole: true},
            },
            func(ctx context.Context, req *ai.ModelRequest, cb ai.ModelStreamCallback) (*ai.ModelResponse, error) {
                return callOpenRouterAPI(ctx, apiKey, modelName, req)
            },
        )
    }
    return nil
}

func callOpenRouterAPI(ctx context.Context, apiKey, model string, req *ai.ModelRequest) (*ai.ModelResponse, error) {
    // POST to https://openrouter.ai/api/v1/chat/completions
    // Convert ai.ModelRequest → OpenRouter JSON (matches OpenAI format)
    // Parse response → ai.ModelResponse
    // See: https://openrouter.ai/docs/api-reference/overview
}
```

**Implementation notes**:
- OpenRouter request/response matches OpenAI Chat API
- Use standard HTTP client
- Handle rate limits (429) with exponential backoff
- Map errors to Go errors

---

## Validation & Retry Pattern

Genkit validates JSON structure, but **not field constraints** (e.g., string length). We handle that:

```go
// backend/internal/llm/tasks/metadata.go
func (t *MetadataTask) Execute(ctx context.Context, input MetadataTaskInput) (*MetadataTaskOutput, error) {
    prompt := buildPrompt(input)

    for attempt := 0; attempt < 3; attempt++ {
        result, _, err := genkit.GenerateData[MetadataTaskOutput](ctx, t.genkit,
            ai.WithPrompt(prompt),
            ai.WithModelName("openrouter/anthropic/claude-3.5-sonnet"),
        )

        if err != nil {
            return nil, fmt.Errorf("LLM error: %w", err) // Network/API error
        }

        // Custom validation
        if err := validateMetadata(result); err == nil {
            return result, nil // Success
        }

        // Retry with error in prompt
        prompt = fmt.Sprintf("%s\n\nPREVIOUS INVALID: %s\nFix and retry.", prompt, err)
    }

    return nil, fmt.Errorf("validation failed after 3 attempts")
}

func validateMetadata(m *MetadataTaskOutput) error {
    if len(m.Name) < 1 || len(m.Name) > 100 {
        return fmt.Errorf("name must be 1-100 chars")
    }
    if len(m.Description) < 10 || len(m.Description) > 1000 {
        return fmt.Errorf("description must be 10-1000 chars")
    }
    return nil
}
```

**Pattern for all 5 tasks**:
1. Build prompt
2. Call `genkit.GenerateData[T]()`
3. If LLM/network error → return error
4. If unmarshal succeeds → validate fields
5. If validation fails → retry with error in prompt
6. Max 3 attempts

---

## Fixture Testing

Record real LLM responses once, replay in tests:

```bash
# backend/scripts/record-fixtures.go
$ go run scripts/record-fixtures.go

🎬 Recording metadata-new-project...
💸 Cost: $0.02
💾 Saved to testdata/fixtures/metadata-new-project.json
```

**Fixture format**:
```json
{
  "name": "metadata-new-project",
  "input": {"update_request": "Build a task manager", "is_new_project": true},
  "output": {"name": "TaskMaster", "description": "...", "reasoning": "..."},
  "model": "anthropic/claude-3.5-sonnet",
  "timestamp": "2025-10-01T12:00:00Z"
}
```

**Test with fixture**:
```go
func TestMetadataTask_NewProject(t *testing.T) {
    fixture := loadFixture("metadata-new-project.json")
    mockGenkit := &MockGenkit{Response: fixture.Output}

    task := &MetadataTask{genkit: mockGenkit}
    result, err := task.Execute(context.Background(), fixture.Input)

    require.NoError(t, err)
    assert.Equal(t, "TaskMaster", result.Name)
}
```

**Why fixtures**:
- Fast (no API calls)
- Deterministic (same output every time)
- Cheap (record once, replay 1000s of times)
- Offline (tests work without internet)

---

## Configuration

```go
// backend/internal/llm/genkit.go
type Config struct {
    APIKey       string // OpenRouter API key
    DefaultModel string // "openrouter/anthropic/claude-3.5-sonnet"
}

func NewGenkitClient(ctx context.Context, cfg Config) (*genkit.Genkit, error) {
    g := genkit.Init(ctx,
        genkit.WithDefaultModel(cfg.DefaultModel),
    )

    if err := RegisterOpenRouterProvider(g, cfg.APIKey); err != nil {
        return nil, err
    }

    return g, nil
}

// Usage in CLI
func main() {
    ctx := context.Background()
    g, err := llm.NewGenkitClient(ctx, llm.Config{
        APIKey:       os.Getenv("OPENROUTER_API_KEY"),
        DefaultModel: "openrouter/anthropic/claude-3.5-sonnet",
    })
    // ...
}
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| OpenRouter integration breaks | Start with Google Gemini (built-in), add OpenRouter later |
| Validation failures | 3-attempt retry with error feedback to LLM |
| Genkit abandoned by Google | Isolated to internal/llm, can swap if needed |

---

## Implementation Order

1. Install Genkit, test with Google Gemini (built-in provider)
2. Implement OpenRouter custom provider
3. Build metadata task with validation retry
4. Create fixture recording script
5. Record fixtures for all 5 tasks
6. Write tests using fixtures

---

## References

- Docs: [https://genkit.dev/go/docs/get-started-go/](https://genkit.dev/go/docs/get-started-go/)
- Structured output: [https://mastering-genkit.github.io/mastering-genkit-go/chapters/05-structured-output.html](https://mastering-genkit.github.io/mastering-genkit-go/chapters/05-structured-output.html)
- GitHub: [https://github.com/firebase/genkit](https://github.com/firebase/genkit)
- OpenRouter API: [https://openrouter.ai/docs/api-reference/overview](https://openrouter.ai/docs/api-reference/overview)
