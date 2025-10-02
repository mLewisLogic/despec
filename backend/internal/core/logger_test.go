package core

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestNewLogger(t *testing.T) {
	tests := []struct {
		name     string
		level    string
		expected string
	}{
		{"debug level", "debug", "DEBUG"},
		{"info level", "info", "INFO"},
		{"warn level", "warn", "WARN"},
		{"error level", "error", "ERROR"},
		{"default level", "", "INFO"},
		{"unknown level", "invalid", "INFO"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Capture stderr
			old := os.Stderr
			r, w, _ := os.Pipe()
			os.Stderr = w

			logger := NewLogger(tt.level)

			// Log at INFO level (should appear for all except ERROR)
			logger.Info("test message", "key", "value")

			// Restore stderr and read output
			w.Close()
			os.Stderr = old

			var buf bytes.Buffer
			buf.ReadFrom(r)
			output := buf.String()

			// Parse JSON output if present
			if output != "" {
				var logEntry map[string]interface{}
				if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &logEntry); err == nil {
					// Check that we got a log entry
					if logEntry["msg"] != "test message" {
						t.Errorf("Expected message 'test message', got %v", logEntry["msg"])
					}
				}
			}
		})
	}
}

func TestLoggerMethods(t *testing.T) {
	// Capture stderr
	old := os.Stderr
	r, w, _ := os.Pipe()
	os.Stderr = w

	logger := NewLogger("debug")

	logger.Debug("debug message", "key", "debug")
	logger.Info("info message", "key", "info")
	logger.Warn("warn message", "key", "warn")
	logger.Error("error message", "key", "error")

	// Restore stderr and read output
	w.Close()
	os.Stderr = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	output := buf.String()

	// Check that all messages were logged
	expectedMessages := []string{"debug message", "info message", "warn message", "error message"}
	for _, msg := range expectedMessages {
		if !strings.Contains(output, msg) {
			t.Errorf("Expected to find message '%s' in output", msg)
		}
	}
}
