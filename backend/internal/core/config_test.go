package core

import (
	"os"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	// Save original env vars
	origLogLevel := os.Getenv("LOG_LEVEL")
	origDebug := os.Getenv("DEBUG")
	origAPIKey := os.Getenv("OPENROUTER_API_KEY")
	origModel := os.Getenv("DEFAULT_MODEL")

	// Restore after test
	defer func() {
		os.Setenv("LOG_LEVEL", origLogLevel)
		os.Setenv("DEBUG", origDebug)
		os.Setenv("OPENROUTER_API_KEY", origAPIKey)
		os.Setenv("DEFAULT_MODEL", origModel)
	}()

	tests := []struct {
		name           string
		envVars        map[string]string
		expectedLevel  string
		expectedModel  string
		expectedAPIKey string
		expectError    bool
	}{
		{
			name:          "default values",
			envVars:       map[string]string{},
			expectedLevel: "info",
			expectedModel: "openrouter/anthropic/claude-3.5-sonnet",
		},
		{
			name: "custom log level",
			envVars: map[string]string{
				"LOG_LEVEL": "warn",
			},
			expectedLevel: "warn",
			expectedModel: "openrouter/anthropic/claude-3.5-sonnet",
		},
		{
			name: "debug flag overrides log level",
			envVars: map[string]string{
				"LOG_LEVEL": "warn",
				"DEBUG":     "1",
			},
			expectedLevel: "debug",
			expectedModel: "openrouter/anthropic/claude-3.5-sonnet",
		},
		{
			name: "custom model",
			envVars: map[string]string{
				"DEFAULT_MODEL": "custom/model",
			},
			expectedLevel: "info",
			expectedModel: "custom/model",
		},
		{
			name: "with API key",
			envVars: map[string]string{
				"OPENROUTER_API_KEY": "test-key",
			},
			expectedLevel:  "info",
			expectedModel:  "openrouter/anthropic/claude-3.5-sonnet",
			expectedAPIKey: "test-key",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clear env vars
			os.Unsetenv("LOG_LEVEL")
			os.Unsetenv("DEBUG")
			os.Unsetenv("OPENROUTER_API_KEY")
			os.Unsetenv("DEFAULT_MODEL")

			// Set test env vars
			for k, v := range tt.envVars {
				os.Setenv(k, v)
			}

			cfg, err := LoadConfig()

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if cfg.LogLevel != tt.expectedLevel {
				t.Errorf("LogLevel = %v, want %v", cfg.LogLevel, tt.expectedLevel)
			}

			if cfg.DefaultModel != tt.expectedModel {
				t.Errorf("DefaultModel = %v, want %v", cfg.DefaultModel, tt.expectedModel)
			}

			if cfg.OpenRouterAPIKey != tt.expectedAPIKey {
				t.Errorf("OpenRouterAPIKey = %v, want %v", cfg.OpenRouterAPIKey, tt.expectedAPIKey)
			}
		})
	}
}

func TestGetEnvOrDefault(t *testing.T) {
	// Save original env var
	origValue := os.Getenv("TEST_VAR")
	defer os.Setenv("TEST_VAR", origValue)

	tests := []struct {
		name         string
		key          string
		defaultValue string
		envValue     string
		expected     string
	}{
		{
			name:         "env var set",
			key:          "TEST_VAR",
			defaultValue: "default",
			envValue:     "custom",
			expected:     "custom",
		},
		{
			name:         "env var not set",
			key:          "TEST_VAR_MISSING",
			defaultValue: "default",
			envValue:     "",
			expected:     "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue != "" {
				os.Setenv(tt.key, tt.envValue)
			} else {
				os.Unsetenv(tt.key)
			}

			result := getEnvOrDefault(tt.key, tt.defaultValue)
			if result != tt.expected {
				t.Errorf("getEnvOrDefault() = %v, want %v", result, tt.expected)
			}
		})
	}
}
