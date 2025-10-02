package llm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Test output struct.
type TestOutput struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func TestNewClient(t *testing.T) {
	t.Run("valid config", func(t *testing.T) {
		config := &Config{
			APIKey:       "test-key",
			BaseURL:      "https://api.test.com",
			DefaultModel: "test-model",
		}

		client, err := NewClient(config)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if client == nil {
			t.Fatal("expected client, got nil")
		}

		if client.config.Timeout != 30*time.Second {
			t.Errorf("expected default timeout 30s, got %v", client.config.Timeout)
		}

		if client.config.MaxRetries != 3 {
			t.Errorf("expected default max retries 3, got %d", client.config.MaxRetries)
		}
	})

	t.Run("invalid config - missing API key", func(t *testing.T) {
		config := &Config{
			BaseURL:      "https://api.test.com",
			DefaultModel: "test-model",
		}

		_, err := NewClient(config)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("invalid config - missing base URL", func(t *testing.T) {
		config := &Config{
			APIKey:       "test-key",
			DefaultModel: "test-model",
		}

		_, err := NewClient(config)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestCleanMarkdownCodeBlocks(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "plain JSON",
			input:    `{"name": "John", "age": 30}`,
			expected: `{"name": "John", "age": 30}`,
		},
		{
			name:     "JSON with ```json wrapper",
			input:    "```json\n{\"name\": \"John\", \"age\": 30}\n```",
			expected: `{"name": "John", "age": 30}`,
		},
		{
			name:     "JSON with ``` wrapper",
			input:    "```\n{\"name\": \"John\", \"age\": 30}\n```",
			expected: `{"name": "John", "age": 30}`,
		},
		{
			name:     "JSON with leading/trailing whitespace",
			input:    "  \n  {\"name\": \"John\", \"age\": 30}  \n  ",
			expected: `{"name": "John", "age": 30}`,
		},
		{
			name:     "JSON with ```json and whitespace",
			input:    "  ```json  \n  {\"name\": \"John\", \"age\": 30}  \n  ```  ",
			expected: `{"name": "John", "age": 30}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cleanMarkdownCodeBlocks(tt.input)
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestClient_GenerateStructured(t *testing.T) {
	t.Run("successful generation with validation", func(t *testing.T) {
		// Create mock server
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			response := OpenRouterResponse{
				Choices: []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				}{
					{
						Message: struct {
							Content string `json:"content"`
						}{
							Content: `{"name": "Alice", "age": 25}`,
						},
					},
				},
			}

			json.NewEncoder(w).Encode(response)
		}))
		defer server.Close()

		config := &Config{
			APIKey:       "test-key",
			BaseURL:      server.URL,
			DefaultModel: "test-model",
			Timeout:      5 * time.Second,
			MaxRetries:   3,
		}

		client, _ := NewClient(config)

		result, err := GenerateStructured[TestOutput](
			client,
			context.Background(),
			"test-model",
			"Generate a person",
			func(t *TestOutput) error {
				if t.Name == "" {
					return errors.New("name required")
				}
				if t.Age <= 0 {
					return errors.New("age must be positive")
				}
				return nil
			},
		)

		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if result.Name != "Alice" {
			t.Errorf("expected name Alice, got %s", result.Name)
		}

		if result.Age != 25 {
			t.Errorf("expected age 25, got %d", result.Age)
		}
	})

	t.Run("retry on validation failure", func(t *testing.T) {
		attempts := 0

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attempts++

			var content string
			if attempts == 1 {
				// First attempt - invalid age
				content = `{"name": "Bob", "age": -5}`
			} else {
				// Second attempt - valid
				content = `{"name": "Bob", "age": 30}`
			}

			response := OpenRouterResponse{
				Choices: []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				}{
					{
						Message: struct {
							Content string `json:"content"`
						}{
							Content: content,
						},
					},
				},
			}

			json.NewEncoder(w).Encode(response)
		}))
		defer server.Close()

		config := &Config{
			APIKey:       "test-key",
			BaseURL:      server.URL,
			DefaultModel: "test-model",
			Timeout:      5 * time.Second,
			MaxRetries:   3,
		}

		client, _ := NewClient(config)

		result, err := GenerateStructured[TestOutput](
			client,
			context.Background(),
			"test-model",
			"Generate a person",
			func(t *TestOutput) error {
				if t.Age <= 0 {
					return errors.New("age must be positive")
				}
				return nil
			},
		)

		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if attempts != 2 {
			t.Errorf("expected 2 attempts, got %d", attempts)
		}

		if result.Age != 30 {
			t.Errorf("expected age 30, got %d", result.Age)
		}
	})

	t.Run("failure after max retries", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Always return invalid age
			response := OpenRouterResponse{
				Choices: []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				}{
					{
						Message: struct {
							Content string `json:"content"`
						}{
							Content: `{"name": "Charlie", "age": -10}`,
						},
					},
				},
			}

			json.NewEncoder(w).Encode(response)
		}))
		defer server.Close()

		config := &Config{
			APIKey:       "test-key",
			BaseURL:      server.URL,
			DefaultModel: "test-model",
			Timeout:      5 * time.Second,
			MaxRetries:   3,
		}

		client, _ := NewClient(config)

		_, err := GenerateStructured[TestOutput](
			client,
			context.Background(),
			"test-model",
			"Generate a person",
			func(t *TestOutput) error {
				if t.Age <= 0 {
					return errors.New("age must be positive")
				}
				return nil
			},
		)

		if err == nil {
			t.Fatal("expected error, got nil")
		}

		if !errors.Is(err, errors.New("validation failed after 3 attempts")) {
			// Check error message contains expected text
			errMsg := err.Error()
			if errMsg != "validation failed after 3 attempts: LLM validation error: Validation failed: age must be positive" {
				t.Errorf("unexpected error: %v", err)
			}
		}
	})

	t.Run("handles markdown wrapped JSON", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			response := OpenRouterResponse{
				Choices: []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				}{
					{
						Message: struct {
							Content string `json:"content"`
						}{
							Content: "```json\n{\"name\": \"Dave\", \"age\": 35}\n```",
						},
					},
				},
			}

			json.NewEncoder(w).Encode(response)
		}))
		defer server.Close()

		config := &Config{
			APIKey:       "test-key",
			BaseURL:      server.URL,
			DefaultModel: "test-model",
		}

		client, _ := NewClient(config)

		result, err := GenerateStructured[TestOutput](
			client,
			context.Background(),
			"test-model",
			"Generate a person",
			nil,
		)

		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if result.Name != "Dave" {
			t.Errorf("expected name Dave, got %s", result.Name)
		}
	})

	t.Run("API error response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte("Invalid API key"))
		}))
		defer server.Close()

		config := &Config{
			APIKey:       "invalid-key",
			BaseURL:      server.URL,
			DefaultModel: "test-model",
		}

		client, _ := NewClient(config)

		_, err := GenerateStructured[TestOutput](
			client,
			context.Background(),
			"test-model",
			"Generate a person",
			nil,
		)

		if err == nil {
			t.Fatal("expected error, got nil")
		}

		llmErr, ok := err.(*LLMError)
		if !ok {
			t.Fatalf("expected LLMError, got %T", err)
		}

		if llmErr.Type != ErrorTypeAPI {
			t.Errorf("expected API error, got %s", llmErr.Type)
		}

		if llmErr.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", llmErr.Code)
		}
	})
}
