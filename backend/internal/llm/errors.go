package llm

import "fmt"

// LLMError represents an error from the LLM client.
type LLMError struct {
	// Type categorizes the error
	Type string

	// Message is a human-readable error message
	Message string

	// Code is the HTTP status code (if applicable)
	Code int

	// Err is the underlying error
	Err error
}

// Error types.
const (
	ErrorTypeNetwork    = "network"
	ErrorTypeAPI        = "api"
	ErrorTypeValidation = "validation"
	ErrorTypeTimeout    = "timeout"
	ErrorTypeParse      = "parse"
)

// Error implements the error interface.
func (e *LLMError) Error() string {
	if e.Code > 0 {
		return fmt.Sprintf("LLM %s error (code %d): %s", e.Type, e.Code, e.Message)
	}
	return fmt.Sprintf("LLM %s error: %s", e.Type, e.Message)
}

// Unwrap returns the underlying error.
func (e *LLMError) Unwrap() error {
	return e.Err
}

// NewNetworkError creates a network error.
func NewNetworkError(err error) *LLMError {
	return &LLMError{
		Type:    ErrorTypeNetwork,
		Message: "Failed to connect to OpenRouter API. Check your network connection.",
		Err:     err,
	}
}

// NewAPIError creates an API error with status code.
func NewAPIError(code int, message string) *LLMError {
	return &LLMError{
		Type:    ErrorTypeAPI,
		Code:    code,
		Message: fmt.Sprintf("OpenRouter API error: %s", message),
	}
}

// NewValidationError creates a validation error.
func NewValidationError(message string, err error) *LLMError {
	return &LLMError{
		Type:    ErrorTypeValidation,
		Message: fmt.Sprintf("Validation failed: %s", message),
		Err:     err,
	}
}

// NewTimeoutError creates a timeout error.
func NewTimeoutError() *LLMError {
	return &LLMError{
		Type:    ErrorTypeTimeout,
		Message: "Request timed out. The model may be under heavy load.",
	}
}

// NewParseError creates a parse error.
func NewParseError(content string, err error) *LLMError {
	return &LLMError{
		Type:    ErrorTypeParse,
		Message: fmt.Sprintf("Failed to parse LLM output: %s", content),
		Err:     err,
	}
}
