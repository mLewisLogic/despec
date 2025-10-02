package core

import (
	"errors"
	"testing"
)

func TestValidationError(t *testing.T) {
	baseErr := errors.New("base error")

	tests := []struct {
		name     string
		err      *ValidationError
		expected string
	}{
		{
			name: "with field",
			err: &ValidationError{
				Field:   "name",
				Message: "must be 1-100 characters",
				Err:     baseErr,
			},
			expected: "name: must be 1-100 characters",
		},
		{
			name: "without field",
			err: &ValidationError{
				Message: "invalid input",
				Err:     baseErr,
			},
			expected: "invalid input",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.err.Error(); got != tt.expected {
				t.Errorf("ValidationError.Error() = %v, want %v", got, tt.expected)
			}

			// Test Unwrap
			if !errors.Is(tt.err, baseErr) {
				t.Error("ValidationError should wrap base error")
			}
		})
	}
}

func TestLockError(t *testing.T) {
	baseErr := errors.New("base error")

	err := &LockError{
		Operation: "acquire",
		Message:   "file already locked",
		Err:       baseErr,
	}

	expected := "lock acquire: file already locked"
	if got := err.Error(); got != expected {
		t.Errorf("LockError.Error() = %v, want %v", got, expected)
	}

	// Test Unwrap
	if !errors.Is(err, baseErr) {
		t.Error("LockError should wrap base error")
	}
}

func TestLLMError(t *testing.T) {
	baseErr := errors.New("base error")

	err := &LLMError{
		Task:    "metadata",
		Message: "validation failed",
		Err:     baseErr,
	}

	expected := "LLM task metadata: validation failed"
	if got := err.Error(); got != expected {
		t.Errorf("LLMError.Error() = %v, want %v", got, expected)
	}

	// Test Unwrap
	if !errors.Is(err, baseErr) {
		t.Error("LLMError should wrap base error")
	}
}

func TestNetworkError(t *testing.T) {
	baseErr := errors.New("base error")

	tests := []struct {
		name     string
		err      *NetworkError
		expected string
	}{
		{
			name: "with URL",
			err: &NetworkError{
				Operation: "POST",
				URL:       "https://api.example.com",
				Message:   "connection timeout",
				Err:       baseErr,
			},
			expected: "network POST to https://api.example.com: connection timeout",
		},
		{
			name: "without URL",
			err: &NetworkError{
				Operation: "connect",
				Message:   "no route to host",
				Err:       baseErr,
			},
			expected: "network connect: no route to host",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.err.Error(); got != tt.expected {
				t.Errorf("NetworkError.Error() = %v, want %v", got, tt.expected)
			}

			// Test Unwrap
			if !errors.Is(tt.err, baseErr) {
				t.Error("NetworkError should wrap base error")
			}
		})
	}
}
