package core

import (
	"log/slog"
	"os"
)

// Logger provides a structured logging interface for the application.
type Logger interface {
	Info(msg string, fields ...any)
	Warn(msg string, fields ...any)
	Error(msg string, fields ...any)
	Debug(msg string, fields ...any)
}

// slogLogger wraps the standard library slog.Logger.
type slogLogger struct {
	logger *slog.Logger
}

// NewLogger creates a new logger with the specified log level.
func NewLogger(level string) Logger {
	var slogLevel slog.Level
	switch level {
	case "debug":
		slogLevel = slog.LevelDebug
	case "info":
		slogLevel = slog.LevelInfo
	case "warn":
		slogLevel = slog.LevelWarn
	case "error":
		slogLevel = slog.LevelError
	default:
		slogLevel = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: slogLevel,
	})
	return &slogLogger{logger: slog.New(handler)}
}

func (l *slogLogger) Info(msg string, fields ...any) {
	l.logger.Info(msg, fields...)
}

func (l *slogLogger) Warn(msg string, fields ...any) {
	l.logger.Warn(msg, fields...)
}

func (l *slogLogger) Error(msg string, fields ...any) {
	l.logger.Error(msg, fields...)
}

func (l *slogLogger) Debug(msg string, fields ...any) {
	l.logger.Debug(msg, fields...)
}
