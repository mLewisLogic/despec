package llm

import (
	"context"
	"errors"
	"os"
	"testing"
)

// TestE2E_OpenRouter performs an end-to-end test with real OpenRouter API
// This test is skipped by default - run with: go test -tags=live.
func TestE2E_OpenRouter(t *testing.T) {
	// Skip unless explicitly requested
	if os.Getenv("RUN_E2E_TESTS") != "true" {
		t.Skip("E2E test skipped - set RUN_E2E_TESTS=true to run")
	}

	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		t.Fatal("OPENROUTER_API_KEY not set")
	}

	// Create client
	config := &Config{
		APIKey:       apiKey,
		BaseURL:      "https://openrouter.ai/api/v1",
		DefaultModel: "anthropic/claude-3.5-sonnet",
	}

	client, err := NewClient(config)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	t.Run("Generate structured output with validation and retry", func(t *testing.T) {
		type Person struct {
			Name string `json:"name"`
			Age  int    `json:"age"`
		}

		prompt := `Generate a random person. You MUST return ONLY valid JSON with this exact structure: {"name": "string", "age": number}. The age must be between 1 and 100.`

		result, err := GenerateStructured[Person](
			client,
			context.Background(),
			"anthropic/claude-3.5-sonnet",
			prompt,
			func(p *Person) error {
				if p.Name == "" {
					return errors.New("name cannot be empty")
				}
				if p.Age < 1 || p.Age > 100 {
					return errors.New("age must be between 1 and 100")
				}
				return nil
			},
		)

		if err != nil {
			t.Fatalf("Generation failed: %v", err)
		}

		t.Logf("✅ Successfully generated: %+v", result)
		t.Logf("   Name: %s", result.Name)
		t.Logf("   Age: %d", result.Age)

		// Validate result
		if result.Name == "" {
			t.Error("Expected non-empty name")
		}

		if result.Age < 1 || result.Age > 100 {
			t.Errorf("Expected age between 1-100, got %d", result.Age)
		}
	})

	t.Run("Test with Gemini model", func(t *testing.T) {
		type Color struct {
			Name string `json:"name"`
			Hex  string `json:"hex"`
		}

		prompt := `Generate a random color. Return ONLY valid JSON: {"name": "string", "hex": "string (6-char hex code)"}. Example: {"name": "blue", "hex": "0000FF"}`

		result, err := GenerateStructured[Color](
			client,
			context.Background(),
			"google/gemini-2.5-flash",
			prompt,
			func(c *Color) error {
				if c.Name == "" {
					return errors.New("name required")
				}
				if len(c.Hex) != 6 {
					return errors.New("hex must be 6 characters")
				}
				return nil
			},
		)

		if err != nil {
			t.Fatalf("Generation failed: %v", err)
		}

		t.Logf("✅ Gemini generated: %+v", result)
		t.Logf("   Color: %s", result.Name)
		t.Logf("   Hex: #%s", result.Hex)
	})

	t.Run("Validation retry scenario", func(t *testing.T) {
		type Number struct {
			Value int `json:"value"`
		}

		// This prompt might generate invalid values initially
		prompt := `Generate a random number between 50 and 60. Return JSON: {"value": number}`

		attempts := 0
		result, err := GenerateStructured[Number](
			client,
			context.Background(),
			"anthropic/claude-3.5-sonnet",
			prompt,
			func(n *Number) error {
				attempts++
				t.Logf("Validation attempt %d: value=%d", attempts, n.Value)

				// Strict validation
				if n.Value < 55 || n.Value > 58 {
					return errors.New("value must be between 55 and 58")
				}
				return nil
			},
		)

		if err != nil {
			t.Fatalf("Generation failed after retries: %v", err)
		}

		t.Logf("✅ Succeeded after %d attempts: %+v", attempts, result)

		if result.Value < 55 || result.Value > 58 {
			t.Errorf("Expected value 55-58, got %d", result.Value)
		}
	})
}

// TestE2E_PromptBuilders validates that prompt builders work with real LLM.
func TestE2E_PromptBuilders(t *testing.T) {
	if os.Getenv("RUN_E2E_TESTS") != "true" {
		t.Skip("E2E test skipped - set RUN_E2E_TESTS=true to run")
	}

	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		t.Fatal("OPENROUTER_API_KEY not set")
	}

	config := &Config{
		APIKey:       apiKey,
		BaseURL:      "https://openrouter.ai/api/v1",
		DefaultModel: "anthropic/claude-3.5-sonnet",
	}

	client, err := NewClient(config)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	t.Run("Metadata prompt", func(t *testing.T) {
		type MetadataOutput struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Changed     struct {
				Name        bool `json:"name"`
				Description bool `json:"description"`
			} `json:"changed"`
			Reasoning string `json:"reasoning"`
		}

		prompt := BuildMetadataPrompt(nil, "Build a task manager with OAuth")

		result, err := GenerateStructured[MetadataOutput](
			client,
			context.Background(),
			"",
			prompt,
			func(m *MetadataOutput) error {
				if m.Name == "" || len(m.Name) > 100 {
					return errors.New("name must be 1-100 chars")
				}
				if len(m.Description) < 10 || len(m.Description) > 1000 {
					return errors.New("description must be 10-1000 chars")
				}
				return nil
			},
		)

		if err != nil {
			t.Fatalf("Metadata generation failed: %v", err)
		}

		t.Logf("✅ Generated metadata:")
		t.Logf("   Name: %s", result.Name)
		t.Logf("   Description: %s", result.Description)
		t.Logf("   Reasoning: %s", result.Reasoning)
	})
}
