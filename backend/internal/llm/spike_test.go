package llm

import (
	"os"
	"testing"
)

func TestOpenRouterSpike(t *testing.T) {
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		t.Skip("OPENROUTER_API_KEY not set - skipping spike test")
	}

	// Prompt requesting structured JSON output
	prompt := `Generate a random person. You MUST return ONLY valid JSON with this exact structure: {"name": "string", "age": number}. Do not include any other text or explanation.`

	// Test with Claude
	t.Run("Claude", func(t *testing.T) {
		result, err := CallOpenRouterDirect(
			apiKey,
			"anthropic/claude-3.5-sonnet",
			prompt,
		)

		if err != nil {
			t.Fatalf("Claude call failed: %v", err)
		}

		validateResult(t, result)
		t.Logf("✅ Claude SUCCESS: %+v", result)
	})

	// Test with Gemini
	t.Run("Gemini", func(t *testing.T) {
		result, err := CallOpenRouterDirect(
			apiKey,
			"google/gemini-2.5-flash",
			prompt,
		)

		if err != nil {
			t.Fatalf("Gemini call failed: %v", err)
		}

		validateResult(t, result)
		t.Logf("✅ Gemini SUCCESS: %+v", result)
	})
}

func validateResult(t *testing.T, result *SpikeTestOutput) {
	if result.Name == "" {
		t.Errorf("Expected non-empty name, got empty string")
	}

	if result.Age <= 0 || result.Age > 120 {
		t.Errorf("Expected realistic age (1-120), got %d", result.Age)
	}
}
