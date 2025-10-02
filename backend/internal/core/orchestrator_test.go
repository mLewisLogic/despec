package core

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"xdd/internal/llm/tasks"
	"xdd/internal/repository"
	"xdd/pkg/schema"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// createTestRepository creates a temporary repository with initial data.
func createTestRepository(t *testing.T) (*repository.Repository, string) {
	tempDir, err := os.MkdirTemp("", "xdd-test-*")
	require.NoError(t, err)

	// Create .xdd/01-specs directory
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	t.Cleanup(func() {
		os.RemoveAll(tempDir)
	})

	return repository.NewRepository(tempDir), tempDir
}

func TestOrchestrator_NewOrchestrator(t *testing.T) {
	repo, _ := createTestRepository(t)
	mockExecutor := NewMockTaskExecutor()

	orch := NewOrchestrator(mockExecutor, repo)

	assert.NotNil(t, orch)
	assert.NotNil(t, orch.executor)
	assert.NotNil(t, orch.repo)
}

func TestOrchestrator_ProcessPrompt_NewProject(t *testing.T) {
	repo, _ := createTestRepository(t)

	// Write initial empty specification
	initialSpec := &schema.Specification{
		Metadata:     schema.ProjectMetadata{},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}
	err := repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	mockExecutor := NewMockTaskExecutor()
	orch := NewOrchestrator(mockExecutor, repo)

	state := NewSessionState()
	ctx := context.Background()

	newState, err := orch.ProcessPrompt(ctx, state, "Build a task management application")

	require.NoError(t, err)
	assert.NotNil(t, newState)
	assert.False(t, newState.AwaitingFeedback, "Should not await feedback for simple request")
	assert.NotEmpty(t, newState.PendingChangelog, "Should have pending changelog events")

	// Verify all tasks were called
	assert.Equal(t, 1, mockExecutor.MetadataCalls, "Metadata task should be called once")
	assert.Equal(t, 1, mockExecutor.RequirementsDeltaCalls, "Requirements delta should be called once")
	assert.Equal(t, 1, mockExecutor.CategorizationCalls, "Categorization should be called once")
	assert.Equal(t, 2, mockExecutor.RequirementGenCalls, "Requirement gen should be called for each requirement")
	assert.Equal(t, 1, mockExecutor.VersionBumpCalls, "Version bump should be called once")

	// Verify changelog contains expected event types
	hasRequirementAdded := false
	hasMetadataUpdate := false
	hasVersionBump := false
	hasCategoryAdded := false

	for _, event := range newState.PendingChangelog {
		switch event.(type) {
		case *schema.RequirementAdded:
			hasRequirementAdded = true
		case *schema.ProjectMetadataUpdated:
			hasMetadataUpdate = true
		case *schema.VersionBumped:
			hasVersionBump = true
		case *schema.CategoryAdded:
			hasCategoryAdded = true
		}
	}

	assert.True(t, hasRequirementAdded, "Changelog should contain RequirementAdded")
	assert.True(t, hasMetadataUpdate, "Changelog should contain ProjectMetadataUpdated")
	assert.True(t, hasVersionBump, "Changelog should contain VersionBumped")
	assert.True(t, hasCategoryAdded, "Changelog should contain CategoryAdded")
}

func TestOrchestrator_ProcessPrompt_AmbiguousModification(t *testing.T) {
	repo, _ := createTestRepository(t)

	// Create initial specification
	initialSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "ExistingProject",
			Description: "An existing project",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-AUTH-abc123",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "When user logs in, system shall validate",
				Priority:    schema.PriorityHigh,
				CreatedAt:   time.Now(),
			},
		},
		Categories: []string{"AUTH"},
	}

	err := repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	// Mock executor with ambiguous modification
	mockExecutor := NewMockTaskExecutor()
	mockExecutor.RequirementsDeltaOutput = &tasks.RequirementsDeltaOutput{
		ToRemove: []struct {
			ID        string `json:"id"`
			Reasoning string `json:"reasoning"`
		}{},
		ToAdd: []struct {
			Category          string `json:"category"`
			BriefDescription  string `json:"brief_description"`
			EARSType          string `json:"ears_type"`
			EstimatedPriority string `json:"estimated_priority"`
			Reasoning         string `json:"reasoning"`
		}{},
		AmbiguousModifications: []struct {
			PossibleTargets []string `json:"possible_targets"`
			Clarification   string   `json:"clarification"`
		}{
			{
				PossibleTargets: []string{"REQ-AUTH-abc123", "REQ-AUTH-def456"},
				Clarification:   "Which login requirement do you want to modify?",
			},
		},
	}

	orch := NewOrchestrator(mockExecutor, repo)
	state := NewSessionState()
	ctx := context.Background()

	newState, err := orch.ProcessPrompt(ctx, state, "Update the login requirement")

	require.NoError(t, err)
	assert.NotNil(t, newState)
	assert.True(t, newState.AwaitingFeedback, "Should await feedback for ambiguous request")
	assert.NotEmpty(t, newState.Messages, "Should have clarification message")

	// Verify clarification message exists
	lastMsg := newState.Messages[len(newState.Messages)-1]
	assert.Equal(t, "assistant", lastMsg.Role)
	assert.Contains(t, lastMsg.Content, "Which login requirement")
}

func TestOrchestrator_buildChangeDescriptions(t *testing.T) {
	metadata := &tasks.MetadataOutput{
		Name:        "NewName",
		Description: "New description",
		Changed: struct {
			Name        bool `json:"name"`
			Description bool `json:"description"`
		}{
			Name:        true,
			Description: true,
		},
	}

	delta := &tasks.RequirementsDeltaOutput{
		ToRemove: []struct {
			ID        string `json:"id"`
			Reasoning string `json:"reasoning"`
		}{
			{ID: "REQ-OLD-123", Reasoning: "No longer needed"},
		},
	}

	requirements := []schema.Requirement{
		{
			ID:          "REQ-NEW-456",
			Description: "When user clicks button, system shall respond",
		},
	}

	descriptions := buildChangeDescriptions(metadata, delta, requirements)

	assert.Contains(t, descriptions, "Project name: NewName")
	assert.Contains(t, descriptions, "Project description updated")
	assert.Contains(t, descriptions, "Added: When user clicks button, system shall respond")
	assert.Contains(t, descriptions, "Removed: REQ-OLD-123")
}

func TestOrchestrator_buildChangelog(t *testing.T) {
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "OldName",
			Description: "Old description",
			Version:     "0.1.0",
			CreatedAt:   time.Now().Add(-24 * time.Hour),
			UpdatedAt:   time.Now().Add(-24 * time.Hour),
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-OLD-123",
				Description: "Old requirement",
			},
		},
		Categories: []string{"OLD"},
	}

	metadata := &tasks.MetadataOutput{
		Name:        "NewName",
		Description: "New description",
		Changed: struct {
			Name        bool `json:"name"`
			Description bool `json:"description"`
		}{
			Name:        true,
			Description: true,
		},
	}

	delta := &tasks.RequirementsDeltaOutput{
		ToRemove: []struct {
			ID        string `json:"id"`
			Reasoning string `json:"reasoning"`
		}{
			{ID: "REQ-OLD-123", Reasoning: "Obsolete"},
		},
	}

	categorization := &tasks.CategorizationOutput{
		Categories: []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Count       int    `json:"count"`
		}{
			{Name: "NEW", Description: "New category", Count: 1},
		},
	}

	reqID, _ := schema.NewRequirementID("NEW")
	acID, _ := schema.NewAcceptanceCriterionID()
	newRequirements := []schema.Requirement{
		{
			ID:          reqID,
			Type:        schema.EARSEvent,
			Category:    "NEW",
			Description: "New requirement",
			Rationale:   "Needed for feature",
			AcceptanceCriteria: []schema.AcceptanceCriterion{
				&schema.BehavioralCriterion{
					ID:        acID,
					Type:      "behavioral",
					Given:     "Precondition",
					When:      "Action",
					Then:      "Result",
					CreatedAt: time.Now(),
				},
			},
			Priority:  schema.PriorityHigh,
			CreatedAt: time.Now(),
		},
	}

	version := &tasks.VersionBumpOutput{
		NewVersion: "0.2.0",
		BumpType:   "minor",
		Reasoning:  "New features added",
	}

	events := buildChangelog(spec, metadata, delta, categorization, newRequirements, version)

	// Verify event types
	var hasMetadataUpdate, hasCategoryAdd, hasReqDelete, hasReqAdd, hasVersionBump bool
	for _, event := range events {
		switch event.(type) {
		case *schema.ProjectMetadataUpdated:
			hasMetadataUpdate = true
		case *schema.CategoryAdded:
			hasCategoryAdd = true
		case *schema.RequirementDeleted:
			hasReqDelete = true
		case *schema.RequirementAdded:
			hasReqAdd = true
		case *schema.VersionBumped:
			hasVersionBump = true
		}
	}

	assert.True(t, hasMetadataUpdate, "Should have metadata update event")
	assert.True(t, hasCategoryAdd, "Should have category added event")
	assert.True(t, hasReqDelete, "Should have requirement deleted event")
	assert.True(t, hasReqAdd, "Should have requirement added event")
	assert.True(t, hasVersionBump, "Should have version bump event")
}

func TestOrchestrator_buildChangelog_NoChanges(t *testing.T) {
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "ProjectName",
			Description: "Description",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{"EXISTING"},
	}

	metadata := &tasks.MetadataOutput{
		Name:        "ProjectName",
		Description: "Description",
		Changed: struct {
			Name        bool `json:"name"`
			Description bool `json:"description"`
		}{
			Name:        false,
			Description: false,
		},
	}

	delta := &tasks.RequirementsDeltaOutput{
		ToRemove: []struct {
			ID        string `json:"id"`
			Reasoning string `json:"reasoning"`
		}{},
	}

	categorization := &tasks.CategorizationOutput{
		Categories: []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Count       int    `json:"count"`
		}{
			{Name: "EXISTING", Description: "Existing category", Count: 0},
		},
	}

	newRequirements := []schema.Requirement{}

	version := &tasks.VersionBumpOutput{
		NewVersion: "0.1.1",
		BumpType:   "patch",
		Reasoning:  "Clarifications only",
	}

	events := buildChangelog(spec, metadata, delta, categorization, newRequirements, version)

	// Should only have version bump
	assert.Len(t, events, 1)
	_, ok := events[0].(*schema.VersionBumped)
	assert.True(t, ok, "Only event should be version bump")
}

func TestOrchestrator_ProcessPrompt_RepositoryError(t *testing.T) {
	repo, tempDir := createTestRepository(t)

	// Write initial spec first
	initialSpec := &schema.Specification{
		Metadata:     schema.ProjectMetadata{},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}
	err := repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	// Now remove ALL permissions to cause read errors
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.Chmod(specsDir, 0000)
	require.NoError(t, err)
	defer os.Chmod(specsDir, 0755) // Restore for cleanup

	mockExecutor := NewMockTaskExecutor()
	orch := NewOrchestrator(mockExecutor, repo)

	state := NewSessionState()
	ctx := context.Background()

	// This should FAIL because reading the spec fails
	newState, err := orch.ProcessPrompt(ctx, state, "test prompt")

	// Should fail - can't read specification
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "permission denied")
	assert.Nil(t, newState)
}

func TestOrchestrator_ProcessPrompt_TaskError(t *testing.T) {
	repo, _ := createTestRepository(t)

	// Write initial specification
	initialSpec := &schema.Specification{
		Metadata:     schema.ProjectMetadata{},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}
	err := repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	// Create mock executor that returns errors
	mockExecutor := NewMockTaskExecutor()
	mockExecutor.MetadataError = fmt.Errorf("metadata task failed")

	orch := NewOrchestrator(mockExecutor, repo)
	state := NewSessionState()
	ctx := context.Background()

	newState, err := orch.ProcessPrompt(ctx, state, "test prompt")

	// Should error from metadata task
	assert.Error(t, err)
	assert.Nil(t, newState)
	assert.Contains(t, err.Error(), "metadata task")
}
