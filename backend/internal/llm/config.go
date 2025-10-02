package llm

import (
	"fmt"
	"time"
)

// Config contains configuration for the LLM client.
type Config struct {
	// APIKey is the OpenRouter API key
	APIKey string

	// BaseURL is the OpenRouter API base URL
	// Default: https://openrouter.ai/api/v1
	BaseURL string

	// DefaultModel is the model to use when not specified
	// Example: anthropic/claude-3.5-sonnet
	DefaultModel string

	// Timeout is the HTTP request timeout
	// Default: 30 seconds
	Timeout time.Duration

	// MaxRetries is the maximum number of validation retries
	// Default: 3
	MaxRetries int
}

// Validate checks that required config fields are set.
func (c *Config) Validate() error {
	if c.APIKey == "" {
		return fmt.Errorf("APIKey is required")
	}

	if c.BaseURL == "" {
		return fmt.Errorf("BaseURL is required")
	}

	if c.DefaultModel == "" {
		return fmt.Errorf("DefaultModel is required")
	}

	return nil
}

// SetDefaults fills in default values for optional fields.
func (c *Config) SetDefaults() {
	if c.Timeout == 0 {
		c.Timeout = 30 * time.Second
	}

	if c.MaxRetries == 0 {
		c.MaxRetries = 3
	}
}

// ModelConfig contains configuration for a specific model.
type ModelConfig struct {
	// Name is the OpenRouter model identifier
	Name string

	// SupportsTools indicates if the model supports tool/function calling
	SupportsTools bool

	// ContextWindow is the maximum context size in tokens
	ContextWindow int

	// Description is a human-readable description
	Description string
}

// DefaultModels returns the default model configurations.
func DefaultModels() map[string]ModelConfig {
	return map[string]ModelConfig{
		"anthropic/claude-3.5-sonnet": {
			Name:          "anthropic/claude-3.5-sonnet",
			SupportsTools: true,
			ContextWindow: 200000,
			Description:   "Claude 3.5 Sonnet - balanced performance",
		},
		"google/gemini-2.5-flash": {
			Name:          "google/gemini-2.5-flash",
			SupportsTools: false,
			ContextWindow: 1000000,
			Description:   "Gemini 2.5 Flash - fast responses",
		},
		"google/gemini-2.0-flash-thinking-exp": {
			Name:          "google/gemini-2.0-flash-thinking-exp",
			SupportsTools: false,
			ContextWindow: 1000000,
			Description:   "Gemini 2.0 Flash Thinking - advanced reasoning",
		},
	}
}
