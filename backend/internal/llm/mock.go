package llm

import (
	"context"
	"encoding/json"
)

// MockClient is a mock LLM client for testing.
type MockClient struct {
	Response interface{} // The response to return
	Error    error       // Error to return (if any)
}

// GenerateStructured mocks structured output generation.
func (m *MockClient) GenerateStructured(
	ctx context.Context,
	model string,
	prompt string,
	validate func(interface{}) error,
) (interface{}, error) {
	if m.Error != nil {
		return nil, m.Error
	}
	return m.Response, nil
}

// GenerateStructuredT is a generic wrapper for testing
// This allows us to use the mock with GenerateStructured[T] in tests.
func GenerateStructuredMock[T any](
	client *MockClient,
	ctx context.Context,
	model string,
	prompt string,
	validate func(*T) error,
) (*T, error) {
	if client.Error != nil {
		return nil, client.Error
	}

	// Convert interface{} response to *T
	// This assumes the mock response is already of type *T
	if result, ok := client.Response.(*T); ok {
		if validate != nil {
			if err := validate(result); err != nil {
				return nil, err
			}
		}
		return result, nil
	}

	// If not the right type, try JSON round-trip
	data, err := json.Marshal(client.Response)
	if err != nil {
		return nil, err
	}

	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}

	if validate != nil {
		if err := validate(&result); err != nil {
			return nil, err
		}
	}

	return &result, nil
}
