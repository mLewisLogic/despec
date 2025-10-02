# Genkit Custom Provider Spike Results

**Date**: 2025-10-02
**Agent**: golang-pro
**Duration**: 30 minutes
**Outcome**: PARTIAL SUCCESS with RECOMMENDATION

---

## Executive Summary

✅ **OpenRouter Direct Integration: VALIDATED**
❓ **Genkit Custom Provider: COMPLEX (needs more investigation)**
✅ **Structured Output: WORKING**
✅ **Multi-Model Support: CONFIRMED**

**Recommendation**: Proceed with direct HTTP calls wrapped in a clean abstraction layer. Defer Genkit integration until Phase 6 if needed.

---

## Test Results

### ✅ Direct OpenRouter HTTP Integration

**Test**: `TestOpenRouterSpike`
**Status**: PASS (2.7s)
**Evidence**:

```
=== RUN   TestOpenRouterSpike/Claude
    ✅ Claude SUCCESS: &{Name:Marcus Chen Age:34}
=== RUN   TestOpenRouterSpike/Gemini
    ✅ Gemini SUCCESS: &{Name:Eleanor Vance Age:42}
```

**Key Findings**:
1. OpenRouter API responds correctly to OpenAI-compatible requests
2. Structured JSON output unmarshals successfully into Go structs
3. Claude returns clean JSON without wrapping
4. Gemini wraps JSON in markdown code blocks (```json...```) - requires cleaning
5. Multi-model support confirmed (Claude 3.5 Sonnet, Gemini 2.5 Flash)

**Implementation Details**:
- Direct HTTP POST to `https://openrouter.ai/api/v1/chat/completions`
- OpenAI-compatible request format
- Response parsing with markdown cleanup for Gemini
- Error handling with detailed error messages

### ❓ Genkit Custom Provider

**Test**: `TestGenkitProviderRegistration`
**Status**: BLOCKED (initialization panic)
**Blocker**: `genkit.Init()` requires complex configuration options not documented for basic usage

**Issue**:
```
panic: runtime error: invalid memory address or nil pointer dereference
at genkit.Init({context, nil})
```

**Investigation**:
- Genkit Go SDK v1.0.4 is production-ready
- `DefineModel` API signature is clear
- `Init()` function requires non-nil options (undocumented what's required)
- Plugin authoring docs focus on full providers, not minimal custom models

**Workaround Needed**:
- Deep dive into Genkit source code to understand Init requirements
- OR: Use an existing Genkit plugin as a template
- OR: Contact Genkit team for minimal custom provider example

---

## Available Models (OpenRouter)

**Claude Models** (tested):
- `anthropic/claude-3.5-sonnet` ✅ WORKING

**Gemini Models** (tested):
- `google/gemini-2.5-flash` ✅ WORKING (with markdown cleanup)

**Other Available Models** (untested):
- `anthropic/claude-sonnet-4.5`
- `anthropic/claude-opus-4.1`
- `google/gemini-2.5-pro`

---

## Technical Artifacts

### Spike Implementation Files

Created:
- `/Users/logic/code/mLewisLogic/xdd/backend/internal/llm/spike_openrouter.go`
- `/Users/logic/code/mLewisLogic/xdd/backend/internal/llm/spike_test.go`
- `/Users/logic/code/mLewisLogic/xdd/backend/internal/llm/spike_genkit.go` (incomplete)
- `/Users/logic/code/mLewisLogic/xdd/backend/internal/llm/spike_genkit_test.go` (blocked)

### Key Functions

**`CallOpenRouterDirect(apiKey, model, prompt string) (*TestOutput, error)`**
- Direct HTTP integration
- Handles both Claude and Gemini responses
- Cleans markdown code blocks automatically
- Returns structured Go structs

**`cleanMarkdownCodeBlocks(content string) string`**
- Strips ```json...``` wrappers
- Required for Gemini responses
- No-op for Claude responses

---

## Recommendations

### Option 1: Direct HTTP with Clean Abstraction (RECOMMENDED)

**Approach**:
1. Build a clean LLM client wrapper around direct HTTP calls
2. Implement model registry pattern (similar to Genkit but simpler)
3. Add structured output validation with retry logic
4. Support multiple providers (OpenRouter, direct Claude/Gemini APIs)

**Pros**:
- Zero external dependencies beyond stdlib + yaml
- Full control over request/response handling
- Easier debugging and error handling
- Proven to work (spike validated)

**Cons**:
- Manual implementation of features Genkit provides
- No built-in telemetry/observability
- Need to implement retry logic, rate limiting ourselves

**Implementation Sketch**:
```go
type LLMClient struct {
    apiKey   string
    baseURL  string
    models   map[string]ModelConfig
}

func (c *LLMClient) Generate(ctx context.Context, model string, req Request) (Response, error)
func (c *LLMClient) GenerateStructured[T any](ctx context.Context, model string, req Request) (*T, error)
```

### Option 2: Defer Genkit Integration

**Approach**:
1. Start with direct HTTP (Option 1)
2. Revisit Genkit in Phase 6 (Testing & Polish)
3. Investigate proper initialization patterns
4. Refactor if Genkit provides clear value

**Pros**:
- Unblocks immediate development
- Learn Genkit requirements without time pressure
- Can evaluate if Genkit features are worth complexity

**Cons**:
- Potential refactor needed later
- May duplicate effort

### Option 3: Deep Dive Genkit (NOT RECOMMENDED for MVP)

**Approach**:
1. Spend 4-8 hours studying Genkit source code
2. Find working custom provider examples
3. Implement full Genkit integration

**Pros**:
- Future-proof if Genkit becomes standard
- Built-in observability and tooling

**Cons**:
- Unknown time investment
- May hit more blockers
- Delays Phase 5 start

---

## Decision

**Proceed with Option 1: Direct HTTP with Clean Abstraction**

**Rationale**:
1. Spike proves it works (high confidence: 8/10)
2. Simpler mental model for debugging
3. Faster implementation (2-3 days vs unknown for Genkit)
4. Can add Genkit later if needed (not a one-way door)

**Action Items**:
1. Design clean LLM client interface
2. Implement OpenRouter HTTP client with:
   - Multi-model support
   - Structured output parsing
   - Markdown cleanup
   - Error handling with retries
   - Validation retry loop (up to 3 attempts)
3. Add tests with fixture recording (per SPEC.md)
4. Implement 5 LLM tasks using this client

**Estimated Effort**: 2-3 days (Phase 5 Week 2)

---

## Confidence Levels

| Component | Confidence | Reasoning |
|-----------|------------|-----------|
| Direct HTTP Integration | 8/10 | Actually executed, tested with 2 models, structured output validated |
| Multi-Model Support | 8/10 | Tested Claude + Gemini, both working |
| Structured Output Parsing | 7/10 | Tested with simple struct, need to validate with complex nested types |
| Markdown Cleanup | 7/10 | Works for Gemini, need to test edge cases |
| Genkit Integration | 3/10 | Initialization blocked, API unclear, needs deeper investigation |

---

## Open Questions

1. **Retry Logic**: How should we handle rate limits? (Exponential backoff? Token bucket?)
2. **Streaming**: Do we need streaming for any tasks? (Probably not for structured output)
3. **Cost Tracking**: Should we track token usage per task? (Nice to have, not MVP)
4. **Model Fallback**: If Claude fails, auto-retry with Gemini? (Over-engineering for MVP)

---

## Appendix: Code Samples

### Working Direct HTTP Call

```go
// Spike validated this works
result, err := CallOpenRouterDirect(
    apiKey,
    "anthropic/claude-3.5-sonnet",
    `Generate a person. Return JSON: {"name": "string", "age": number}`,
)
// result: &{Name:Marcus Chen Age:34}
```

### Markdown Cleanup

```go
func cleanMarkdownCodeBlocks(content string) string {
    content = strings.TrimSpace(content)

    if strings.HasPrefix(content, "```json") {
        content = strings.TrimPrefix(content, "```json")
        content = strings.TrimSpace(content)
    } else if strings.HasPrefix(content, "```") {
        content = strings.TrimPrefix(content, "```")
        content = strings.TrimSpace(content)
    }

    if strings.HasSuffix(content, "```") {
        content = strings.TrimSuffix(content, "```")
        content = strings.TrimSpace(content)
    }

    return content
}
```

---

**End of Spike Report**
