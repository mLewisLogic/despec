package core

import (
	"os"
)

// Config holds the application configuration.
type Config struct {
	LogLevel         string // DEBUG, INFO, WARN, ERROR
	OpenRouterAPIKey string // Required for LLM operations
	DefaultModel     string // Default LLM model to use
}

// LoadConfig loads configuration from environment variables.
func LoadConfig() (*Config, error) {
	logLevel := getEnvOrDefault("LOG_LEVEL", "info")

	// DEBUG flag overrides log level
	if os.Getenv("DEBUG") == "1" {
		logLevel = "debug"
	}

	cfg := &Config{
		LogLevel:         logLevel,
		OpenRouterAPIKey: os.Getenv("OPENROUTER_API_KEY"),
		DefaultModel:     getEnvOrDefault("DEFAULT_MODEL", "openrouter/anthropic/claude-3.5-sonnet"),
	}

	// Don't require API key for basic operations
	// This will be validated when LLM operations are attempted
	// if cfg.OpenRouterAPIKey == "" {
	// 	return nil, fmt.Errorf("OPENROUTER_API_KEY required")
	// }

	return cfg, nil
}

// getEnvOrDefault returns the value of an environment variable or a default value.
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
