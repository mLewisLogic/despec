package llm

import (
	"context"
	"os"
	"testing"

	"github.com/firebase/genkit/go/ai"
	"github.com/firebase/genkit/go/genkit"
)

func TestGenkitProviderRegistration(t *testing.T) {
	t.Skip("Genkit provider approach abandoned - using direct HTTP instead")

	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		t.Skip("OPENROUTER_API_KEY not set - skipping Genkit test")
	}

	ctx := context.Background()

	// Register custom OpenRouter provider
	g, err := RegisterOpenRouterProvider(ctx, apiKey)
	if err != nil {
		t.Fatalf("Failed to register provider: %v", err)
	}

	// Validate that models are registered
	claudeModel := genkit.LookupModel(g, "openrouter/claude")
	if claudeModel == nil {
		t.Fatal("Claude model not registered")
	}

	geminiModel := genkit.LookupModel(g, "openrouter/gemini")
	if geminiModel == nil {
		t.Fatal("Gemini model not registered")
	}

	// Test model invocation (structural only - actual HTTP call skipped in spike)
	resp, err := claudeModel.Generate(ctx, &ai.ModelRequest{
		Messages: []*ai.Message{
			{
				Content: []*ai.Part{
					ai.NewTextPart("Test prompt"),
				},
			},
		},
	}, nil)

	if err != nil {
		t.Fatalf("Model generation failed: %v", err)
	}

	if resp == nil {
		t.Fatal("Expected response, got nil")
	}

	// Validate response content
	if len(resp.Message.Content) == 0 {
		t.Fatal("Expected response content, got empty")
	}

	t.Logf("✅ Genkit integration validated")
	t.Logf("   Claude model: %s", claudeModel.Name())
	t.Logf("   Gemini model: %s", geminiModel.Name())
	t.Logf("   Generate API: functional")
	t.Logf("   Response parts: %d", len(resp.Message.Content))
}
