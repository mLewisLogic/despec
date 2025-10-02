package core

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSessionState_NewSessionState(t *testing.T) {
	state := NewSessionState()

	assert.NotNil(t, state)
	assert.Empty(t, state.Messages)
	assert.Empty(t, state.PendingChangelog)
	assert.False(t, state.Committed)
	assert.False(t, state.AwaitingFeedback)
}

func TestSessionState_AddMessage(t *testing.T) {
	state := NewSessionState()

	state.AddMessage("user", "Hello")
	state.AddMessage("assistant", "Hi there")

	assert.Len(t, state.Messages, 2)
	assert.Equal(t, "user", state.Messages[0].Role)
	assert.Equal(t, "Hello", state.Messages[0].Content)
	assert.Equal(t, "assistant", state.Messages[1].Role)
	assert.Equal(t, "Hi there", state.Messages[1].Content)
}

func TestSessionState_Clone(t *testing.T) {
	state := NewSessionState()
	state.AddMessage("user", "Test")
	state.Committed = true
	state.AwaitingFeedback = true

	clone := state.Clone()

	// Verify clone has same values
	assert.Len(t, clone.Messages, 1)
	assert.True(t, clone.Committed)
	assert.True(t, clone.AwaitingFeedback)

	// Verify it's a deep copy
	state.AddMessage("user", "Another message")
	assert.Len(t, state.Messages, 2)
	assert.Len(t, clone.Messages, 1)
}
