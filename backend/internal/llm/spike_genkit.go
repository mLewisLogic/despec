package llm

import (
	"context"

	"github.com/firebase/genkit/go/ai"
	"github.com/firebase/genkit/go/genkit"
)

// RegisterOpenRouterProvider registers OpenRouter as a Genkit model provider.
func RegisterOpenRouterProvider(ctx context.Context, apiKey string) (*genkit.Genkit, error) {
	g := genkit.Init(ctx, nil)

	// Register Claude model
	genkit.DefineModel(
		g,
		"openrouter/claude",
		&ai.ModelOptions{
			Label: "Claude 3.5 Sonnet (via OpenRouter)",
			Supports: &ai.ModelSupports{
				Multiturn:  true,
				SystemRole: true,
			},
		},
		func(ctx context.Context, req *ai.ModelRequest, cb ai.ModelStreamCallback) (*ai.ModelResponse, error) {
			// For spike: return mock response to validate structure
			return &ai.ModelResponse{
				Request: req,
				Message: &ai.Message{
					Content: []*ai.Part{
						ai.NewTextPart("Claude model registered successfully"),
					},
				},
			}, nil
		},
	)

	// Register Gemini model
	genkit.DefineModel(
		g,
		"openrouter/gemini",
		&ai.ModelOptions{
			Label: "Gemini 2.5 Flash (via OpenRouter)",
			Supports: &ai.ModelSupports{
				Multiturn:  true,
				SystemRole: true,
			},
		},
		func(ctx context.Context, req *ai.ModelRequest, cb ai.ModelStreamCallback) (*ai.ModelResponse, error) {
			// For spike: return mock response to validate structure
			return &ai.ModelResponse{
				Request: req,
				Message: &ai.Message{
					Content: []*ai.Part{
						ai.NewTextPart("Gemini model registered successfully"),
					},
				},
			}, nil
		},
	)

	return g, nil
}
