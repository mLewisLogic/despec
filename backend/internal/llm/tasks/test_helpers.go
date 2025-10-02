package tasks

import (
	"xdd/internal/llm"
)

// MockLLMClient wraps llm.Client and overrides GenerateStructured for testing.
type MockLLMClient struct {
	Response interface{}
	Error    error
}

// CreateMockClient creates a test client with canned response.
func CreateMockClient(response interface{}) *llm.Client {
	// For now, return nil - we'll use a different testing strategy
	// This will be replaced with fixture-based testing
	return nil
}
