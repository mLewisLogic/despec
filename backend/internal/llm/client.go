package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Client is the LLM client for interacting with OpenRouter.
type Client struct {
	config *Config
	http   *http.Client
	models map[string]ModelConfig
}

// NewClient creates a new LLM client.
func NewClient(config *Config) (*Client, error) {
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	config.SetDefaults()

	return &Client{
		config: config,
		http: &http.Client{
			Timeout: config.Timeout,
		},
		models: DefaultModels(),
	}, nil
}

// OpenRouterRequest represents a request to OpenRouter (OpenAI-compatible).
type OpenRouterRequest struct {
	Model    string          `json:"model"`
	Messages []OpenRouterMsg `json:"messages"`
}

// OpenRouterMsg represents a message in the conversation.
type OpenRouterMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OpenRouterResponse represents a response from OpenRouter.
type OpenRouterResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

// GenerateStructured generates a structured output from the LLM with validation and retry
// T is the type of the structured output
// validate is an optional validation function that returns an error if the output is invalid.
func GenerateStructured[T any](
	client *Client,
	ctx context.Context,
	model string,
	prompt string,
	validate func(*T) error,
) (*T, error) {
	if model == "" {
		model = client.config.DefaultModel
	}

	originalPrompt := prompt
	var lastErr error

	for attempt := 1; attempt <= client.config.MaxRetries; attempt++ {
		slog.Info("LLM generation attempt",
			"attempt", attempt,
			"model", model,
			"prompt_length", len(prompt),
		)

		result, err := callOpenRouter[T](client, ctx, model, prompt)
		if err != nil {
			lastErr = err
			// Network/API errors are not retryable with modified prompt
			if _, ok := err.(*LLMError); ok {
				llmErr := err.(*LLMError)
				if llmErr.Type == ErrorTypeNetwork || llmErr.Type == ErrorTypeAPI {
					return nil, err
				}
			}
			// Parse errors - retry with feedback
			prompt = fmt.Sprintf("%s\n\nPREVIOUS ATTEMPT FAILED:\nError: %v\n\nPlease return valid JSON matching the exact structure requested.", originalPrompt, err)
			continue
		}

		// Validate if validation function provided
		if validate != nil {
			if err := validate(result); err != nil {
				lastErr = NewValidationError(err.Error(), err)
				slog.Warn("LLM output validation failed",
					"attempt", attempt,
					"error", err.Error(),
				)
				// Feed validation error back to LLM
				prompt = fmt.Sprintf("%s\n\nPREVIOUS VALIDATION ERROR:\n%v\n\nPlease fix the output to pass validation.", originalPrompt, err)
				continue
			}
		}

		slog.Info("LLM generation succeeded",
			"attempt", attempt,
			"model", model,
		)
		return result, nil
	}

	return nil, fmt.Errorf("validation failed after %d attempts: %w", client.config.MaxRetries, lastErr)
}

// callOpenRouter makes a single HTTP call to OpenRouter API.
func callOpenRouter[T any](client *Client, ctx context.Context, model, prompt string) (*T, error) {
	// Build request
	reqBody := OpenRouterRequest{
		Model: model,
		Messages: []OpenRouterMsg{
			{Role: "user", Content: prompt},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Create HTTP request
	url := client.config.BaseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+client.config.APIKey)
	req.Header.Set("Content-Type", "application/json")

	// Execute request
	start := time.Now()
	resp, err := client.http.Do(req)
	duration := time.Since(start)

	if err != nil {
		slog.Error("OpenRouter HTTP request failed",
			"error", err.Error(),
			"duration", duration,
		)
		return nil, NewNetworkError(err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			slog.Warn("Failed to close response body", "error", err)
		}
	}()

	slog.Info("OpenRouter HTTP request completed",
		"status_code", resp.StatusCode,
		"duration", duration,
	)

	// Handle non-200 status codes
	if resp.StatusCode != http.StatusOK {
		var errBody bytes.Buffer
		if _, err := errBody.ReadFrom(resp.Body); err != nil {
			slog.Warn("Failed to read error response body", "error", err)
			return nil, NewAPIError(resp.StatusCode, fmt.Sprintf("status %d (failed to read error body)", resp.StatusCode))
		}
		return nil, NewAPIError(resp.StatusCode, errBody.String())
	}

	// Parse response
	var openrouterResp OpenRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&openrouterResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	// Check for API error in response
	if openrouterResp.Error != nil {
		return nil, NewAPIError(0, openrouterResp.Error.Message)
	}

	if len(openrouterResp.Choices) == 0 {
		return nil, NewAPIError(0, "no choices in response")
	}

	content := openrouterResp.Choices[0].Message.Content

	// Clean markdown code blocks (some models wrap JSON in ```json...```)
	content = cleanMarkdownCodeBlocks(content)

	// Parse JSON content into struct
	var result T
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, NewParseError(content, err)
	}

	return &result, nil
}

// cleanMarkdownCodeBlocks removes markdown code block wrappers from JSON
// Some models (especially Gemini) wrap JSON in ```json...```.
func cleanMarkdownCodeBlocks(content string) string {
	content = strings.TrimSpace(content)

	// Remove ```json prefix
	if strings.HasPrefix(content, "```json") {
		content = strings.TrimPrefix(content, "```json")
		content = strings.TrimSpace(content)
	} else if strings.HasPrefix(content, "```") {
		content = strings.TrimPrefix(content, "```")
		content = strings.TrimSpace(content)
	}

	// Remove ``` suffix
	if strings.HasSuffix(content, "```") {
		content = strings.TrimSuffix(content, "```")
		content = strings.TrimSpace(content)
	}

	return content
}
