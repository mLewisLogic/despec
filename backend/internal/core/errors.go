package core

import "fmt"

// ValidationError represents a validation failure.
type ValidationError struct {
	Field   string
	Message string
	Err     error
}

func (e *ValidationError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s", e.Field, e.Message)
	}
	return e.Message
}

func (e *ValidationError) Unwrap() error {
	return e.Err
}

// LockError represents a file locking error.
type LockError struct {
	Operation string
	Message   string
	Err       error
}

func (e *LockError) Error() string {
	return fmt.Sprintf("lock %s: %s", e.Operation, e.Message)
}

func (e *LockError) Unwrap() error {
	return e.Err
}

// LLMError represents an LLM operation error.
type LLMError struct {
	Task    string
	Message string
	Err     error
}

func (e *LLMError) Error() string {
	return fmt.Sprintf("LLM task %s: %s", e.Task, e.Message)
}

func (e *LLMError) Unwrap() error {
	return e.Err
}

// NetworkError represents a network communication error.
type NetworkError struct {
	Operation string
	URL       string
	Message   string
	Err       error
}

func (e *NetworkError) Error() string {
	if e.URL != "" {
		return fmt.Sprintf("network %s to %s: %s", e.Operation, e.URL, e.Message)
	}
	return fmt.Sprintf("network %s: %s", e.Operation, e.Message)
}

func (e *NetworkError) Unwrap() error {
	return e.Err
}
