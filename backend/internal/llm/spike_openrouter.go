package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// SpikeTestOutput is a minimal test struct for spike validation.
type SpikeTestOutput struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

// CallOpenRouterDirect makes a direct HTTP call to OpenRouter API
// This bypasses Genkit to validate the core API integration works.
func CallOpenRouterDirect(apiKey, model, prompt string) (*SpikeTestOutput, error) {
	// Build OpenRouter request
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
	req, err := http.NewRequestWithContext(
		context.Background(),
		"POST",
		"https://openrouter.ai/api/v1/chat/completions",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Execute request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http call: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			// Log error in real usage, but can't import slog without adding dependency
			_ = err
		}
	}()

	// Check status code
	if resp.StatusCode != http.StatusOK {
		// Read error body for debugging
		var errBody bytes.Buffer
		if _, err := errBody.ReadFrom(resp.Body); err != nil {
			return nil, fmt.Errorf("openrouter returned status %d (failed to read error body: %v)", resp.StatusCode, err)
		}
		return nil, fmt.Errorf("openrouter returned status %d: %s", resp.StatusCode, errBody.String())
	}

	// Parse OpenRouter response
	var openrouterResp OpenRouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&openrouterResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(openrouterResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	content := openrouterResp.Choices[0].Message.Content

	// Clean markdown code blocks (some models wrap JSON in ```json...```)
	content = cleanMarkdownCodeBlocks(content)

	// Parse JSON content into struct
	var result SpikeTestOutput
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("unmarshal output (content=%s): %w", content, err)
	}

	return &result, nil
}
