package core

import (
	"xdd/pkg/schema"
)

// SessionState represents the in-memory session state.
type SessionState struct {
	Messages         []Message
	PendingChangelog []schema.ChangelogEvent
	Committed        bool
	AwaitingFeedback bool
}

// Message represents a conversation message.
type Message struct {
	Role    string // "user", "assistant", "system"
	Content string
}

// NewSessionState creates a new session state.
func NewSessionState() *SessionState {
	return &SessionState{
		Messages:         make([]Message, 0),
		PendingChangelog: make([]schema.ChangelogEvent, 0),
	}
}

// AddMessage adds a message to the conversation history.
func (s *SessionState) AddMessage(role, content string) {
	s.Messages = append(s.Messages, Message{Role: role, Content: content})
}

// Clone creates a deep copy of the session state.
func (s *SessionState) Clone() *SessionState {
	clone := &SessionState{
		Messages:         make([]Message, len(s.Messages)),
		PendingChangelog: make([]schema.ChangelogEvent, len(s.PendingChangelog)),
		Committed:        s.Committed,
		AwaitingFeedback: s.AwaitingFeedback,
	}

	copy(clone.Messages, s.Messages)
	copy(clone.PendingChangelog, s.PendingChangelog)

	return clone
}
