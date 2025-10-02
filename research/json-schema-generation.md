# JSON Schema Generation Research

**Decision**: ✅ Use `invopop/jsonschema` + let Genkit auto-generate
**Date**: 2025-10-01

---

## What We Need

For xdd, JSON schemas serve two purposes:
1. **LLM structured output** (Genkit handles automatically)
2. **OpenAPI spec** (for frontend API contract)

---

## Solution: invopop/jsonschema

**Why**: Most maintained, Genkit uses it internally, clean API.

```bash
go get github.com/invopop/jsonschema
```

---

## For LLM Output (Genkit Handles)

Genkit auto-generates schemas from Go structs:

```go
type MetadataTaskOutput struct {
    Name        string `json:"name"`
    Description string `json:"description"`
}

// Genkit internally:
// 1. schema := jsonschema.Reflect(&MetadataTaskOutput{})
// 2. Send schema to LLM
// 3. Validate response against schema

result, _, err := genkit.GenerateData[MetadataTaskOutput](ctx, g, ...)
// No manual schema needed!
```

**So we don't need to generate schemas for LLM calls.**

---

## For OpenAPI Spec (Manual)

Generate frontend API schemas:

```go
// backend/internal/api/schema.go
import "github.com/invopop/jsonschema"

func GenerateAPISchema[T any]() (map[string]interface{}, error) {
    var zero T
    schema := jsonschema.Reflect(&zero)

    data, _ := json.Marshal(schema)
    var result map[string]interface{}
    json.Unmarshal(data, &result)
    return result, nil
}

// Use in OpenAPI spec generation
func GenerateOpenAPISpec() *OpenAPISpec {
    return &OpenAPISpec{
        Components: Components{
            Schemas: map[string]interface{}{
                "Specification":  GenerateAPISchema[Specification](),
                "Requirement":    GenerateAPISchema[Requirement](),
                "ChangelogEvent": GenerateAPISchema[ChangelogEvent](),
            },
        },
    }
}
```

---

## Struct Tags for Validation

```go
type RequirementGenOutput struct {
    Description string `json:"description" jsonschema:"minLength=10,maxLength=500"`
    Priority    string `json:"priority" jsonschema:"enum=critical|enum=high|enum=medium|enum=low"`
}
```

Generates:

```json
{
  "type": "object",
  "properties": {
    "description": {"type": "string", "minLength": 10, "maxLength": 500},
    "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"]}
  }
}
```

**Note**: LLMs may ignore constraints. We validate separately.

---

## Caching

Schema generation uses reflection (slow). Cache at startup:

```go
var schemaCache sync.Map

func GetSchemaCached[T any](key string) (map[string]interface{}, error) {
    if cached, ok := schemaCache.Load(key); ok {
        return cached.(map[string]interface{}), nil
    }

    schema, err := GenerateAPISchema[T]()
    if err != nil {
        return nil, err
    }

    schemaCache.Store(key, schema)
    return schema, nil
}

// Init at startup
func init() {
    GetSchemaCached[Specification]("Specification")
    GetSchemaCached[Requirement]("Requirement")
    // ... etc
}
```

---

## Testing

```go
func TestGenerateAPISchema_Specification(t *testing.T) {
    schema, err := GenerateAPISchema[Specification]()

    require.NoError(t, err)
    assert.Equal(t, "object", schema["type"])

    props := schema["properties"].(map[string]interface{})
    assert.Contains(t, props, "metadata")
    assert.Contains(t, props, "requirements")
}
```

---

## When to Use

| Use Case | Approach |
|----------|----------|
| LLM structured output | Let Genkit handle (auto) |
| OpenAPI spec | Manual generation from structs |
| Debugging LLM issues | Generate schema, inspect JSON sent to LLM |
| Documentation | Auto-gen from structs |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Schema doesn't match struct | Unit tests verify correctness |
| Performance (reflection) | Cache at startup |

---

## References

- invopop/jsonschema: [https://github.com/invopop/jsonschema](https://github.com/invopop/jsonschema)
- JSON Schema spec: [https://json-schema.org/draft/2020-12/schema](https://json-schema.org/draft/2020-12/schema)
