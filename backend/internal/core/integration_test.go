package core

import (
	"context"
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

// TestIntegration_EndToEnd_NewProject tests the full flow of creating a new project
// This satisfies TASK-624: Integration test covering initialization through commit.
func TestIntegration_EndToEnd_NewProject(t *testing.T) {
	// Setup temporary .xdd/ directory
	tempDir, err := os.MkdirTemp("", "xdd-integration-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Initialize .xdd/ structure
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	// Create repository
	repo := repository.NewRepository(tempDir)

	// Write initial empty specification
	initialSpec := &schema.Specification{
		Metadata:     schema.ProjectMetadata{},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}
	err = repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	// Create mock executor
	mockExecutor := NewMockTaskExecutor()
	orch := NewOrchestrator(mockExecutor, repo)

	// Initial state
	state := NewSessionState()

	// Process initial prompt
	ctx := context.Background()
	newState, err := orch.ProcessPrompt(ctx, state, "Build a task management application with user authentication")
	require.NoError(t, err, "ProcessPrompt should succeed with mock executor")

	// Verify state has pending changelog
	require.NotNil(t, newState)
	assert.NotEmpty(t, newState.PendingChangelog, "Should have pending changelog events")
	assert.False(t, newState.AwaitingFeedback, "Should not be awaiting feedback for simple request")

	// Apply changes to specification
	spec, err := repo.ReadSpecification()
	require.NoError(t, err)

	for _, event := range newState.PendingChangelog {
		switch e := event.(type) {
		case *schema.RequirementAdded:
			spec.Requirements = append(spec.Requirements, e.Requirement)
		case *schema.ProjectMetadataUpdated:
			spec.Metadata = e.NewMetadata
		case *schema.CategoryAdded:
			spec.Categories = append(spec.Categories, e.Name)
		}
	}

	// Write specification and changelog
	err = repo.WriteSpecification(spec)
	require.NoError(t, err)

	err = repo.AppendChangelog(newState.PendingChangelog)
	require.NoError(t, err)

	// Verify specification.yaml created
	specPath := filepath.Join(tempDir, "01-specs", "specification.yaml")
	assert.FileExists(t, specPath, "specification.yaml should exist")

	// Verify changelog.yaml created
	changelogPath := filepath.Join(tempDir, "01-specs", "changelog.yaml")
	assert.FileExists(t, changelogPath, "changelog.yaml should exist")

	// Read back and verify specification
	finalSpec, err := repo.ReadSpecification()
	require.NoError(t, err)

	assert.NotEmpty(t, finalSpec.Metadata.Name, "Project should have name")
	assert.NotEmpty(t, finalSpec.Metadata.Description, "Project should have description")
	assert.NotEmpty(t, finalSpec.Metadata.Version, "Project should have version")
	assert.NotEmpty(t, finalSpec.Requirements, "Should have at least one requirement")
	assert.NotEmpty(t, finalSpec.Categories, "Should have at least one category")

	// Verify all event types are present in changelog
	eventTypes := make(map[string]bool)
	for _, event := range newState.PendingChangelog {
		eventTypes[event.EventType()] = true
	}

	expectedEventTypes := []string{
		"ProjectMetadataUpdated",
		"CategoryAdded",
		"RequirementAdded",
		"VersionBumped",
	}

	for _, eventType := range expectedEventTypes {
		assert.True(t, eventTypes[eventType], "Changelog should contain %s event", eventType)
	}

	// Verify version bumping logic
	assert.NotEqual(t, "", finalSpec.Metadata.Version, "Version should be set")
	assert.Regexp(t, `^\d+\.\d+\.\d+$`, finalSpec.Metadata.Version, "Version should follow semver")
}

// TestIntegration_EndToEnd_ExistingProject tests adding requirements to an existing project.
func TestIntegration_EndToEnd_ExistingProject(t *testing.T) {

	// Setup
	tempDir, err := os.MkdirTemp("", "xdd-integration-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	repo := repository.NewRepository(tempDir)

	// Write initial specification
	reqID, _ := schema.NewRequirementID("AUTH")
	acID, _ := schema.NewAcceptanceCriterionID()
	initialSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "TaskMaster",
			Description: "A task management app",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{
			{
				ID:          reqID,
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "When user logs in, system shall validate credentials",
				Rationale:   "Security requirement",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.BehavioralCriterion{
						ID:        acID,
						Type:      "behavioral",
						Given:     "User has account",
						When:      "User submits credentials",
						Then:      "System validates",
						CreatedAt: time.Now(),
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: time.Now(),
			},
		},
		Categories: []string{"AUTH"},
	}

	err = repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	// Create mock executor that adds a new category/requirement
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
		}{
			{
				Category:          "FILES",
				BriefDescription:  "File attachment requirement",
				EARSType:          "event",
				EstimatedPriority: "medium",
				Reasoning:         "New feature",
			},
		},
		AmbiguousModifications: []struct {
			PossibleTargets []string `json:"possible_targets"`
			Clarification   string   `json:"clarification"`
		}{},
	}

	// Override categorization to include both existing and new categories
	mockExecutor.CategorizationOutput = &tasks.CategorizationOutput{
		Categories: []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Count       int    `json:"count"`
		}{
			{Name: "AUTH", Description: "Authentication", Count: 1},
			{Name: "FILES", Description: "File management", Count: 1},
		},
		RequirementMapping: map[string]string{
			"File attachment requirement": "FILES",
		},
		Reasoning: "Categorized by functional domain",
	}

	orch := NewOrchestrator(mockExecutor, repo)

	// Process prompt to add new feature
	state := NewSessionState()
	ctx := context.Background()

	newState, err := orch.ProcessPrompt(ctx, state, "Add file attachment capability")
	require.NoError(t, err)

	// Apply changes
	spec, err := repo.ReadSpecification()
	require.NoError(t, err)

	for _, event := range newState.PendingChangelog {
		switch e := event.(type) {
		case *schema.RequirementAdded:
			spec.Requirements = append(spec.Requirements, e.Requirement)
		case *schema.CategoryAdded:
			spec.Categories = append(spec.Categories, e.Name)
		}
	}

	// Verify existing requirement is still there and new one added
	assert.Len(t, spec.Requirements, 2, "Should have original + new requirement")
	assert.Contains(t, spec.Categories, "AUTH", "Should still have AUTH category")
	assert.Contains(t, spec.Categories, "FILES", "Should have new FILES category")
}

// TestIntegration_AmbiguousModification tests the feedback loop.
func TestIntegration_AmbiguousModification(t *testing.T) {
	t.Skip("Requires full task mocking - documents expected behavior")

	// Expected flow:
	// 1. User: "Update the login requirement"
	// 2. System: Multiple login requirements exist, which one?
	// 3. User provides clarification
	// 4. System proceeds with specific requirement
}

// TestIntegration_LockContention tests lock behavior with multiple sessions.
func TestIntegration_LockContention(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "xdd-integration-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create lock directory
	lockDir := filepath.Join(tempDir, ".xdd")
	err = os.MkdirAll(lockDir, 0755)
	require.NoError(t, err)

	lockPath := filepath.Join(lockDir, ".lock")

	// First session acquires lock
	lock1 := repository.NewFileLock(lockPath, "cli")
	err = lock1.Acquire()
	require.NoError(t, err)

	// Second session tries to acquire - should fail
	lock2 := repository.NewFileLock(lockPath, "web")
	err = lock2.Acquire()
	assert.Error(t, err, "Second lock acquisition should fail")
	assert.Contains(t, err.Error(), "locked by")

	// Release first lock
	err = lock1.Release()
	require.NoError(t, err)

	// Second session should now succeed
	err = lock2.Acquire()
	assert.NoError(t, err, "Lock acquisition should succeed after release")

	// Cleanup
	lock2.Release()
}

// TestIntegration_AtomicCommit tests that commits are atomic.
func TestIntegration_AtomicCommit(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "xdd-integration-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	repo := repository.NewRepository(tempDir)

	// Write initial specification with changelog events atomically
	// This is the correct way to write spec + events together
	metadata := schema.ProjectMetadata{
		Name:        "TestProject",
		Description: "Test description",
		Version:     "0.1.0",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Create initial spec with metadata event
	evtID1, _ := schema.NewEventID()
	evtID2, _ := schema.NewEventID()
	initialEvents := []schema.ChangelogEvent{
		&schema.ProjectMetadataUpdated{
			EventID_:    evtID1,
			OldMetadata: schema.ProjectMetadata{},
			NewMetadata: metadata,
			Timestamp_:  time.Now(),
		},
		&schema.CategoryAdded{
			EventID_:   evtID2,
			Name:       "TEST",
			Timestamp_: time.Now(),
		},
	}

	spec := &schema.Specification{
		Metadata:     metadata,
		Requirements: []schema.Requirement{},
		Categories:   []string{"TEST"},
	}

	// Write both atomically
	err = repo.WriteSpecificationAndChangelog(spec, initialEvents)
	require.NoError(t, err)

	// Verify specification persisted correctly
	readSpec, err := repo.ReadSpecification()
	require.NoError(t, err)
	assert.Equal(t, "TestProject", readSpec.Metadata.Name)
	assert.Contains(t, readSpec.Categories, "TEST")

	// Verify changelog exists
	changelogPath := filepath.Join(tempDir, "01-specs", "changelog.yaml")
	assert.FileExists(t, changelogPath)
}

// TestIntegration_VersionBumping tests semantic versioning logic.
func TestIntegration_VersionBumping(t *testing.T) {
	testCases := []struct {
		name                string
		currentVersion      string
		requirementsAdded   int
		requirementsRemoved int
		metadataChanged     bool
		expectedBumpType    string
	}{
		{
			name:              "Minor bump for new requirements",
			currentVersion:    "0.1.0",
			requirementsAdded: 1,
			expectedBumpType:  "minor",
		},
		{
			name:                "Major bump for removed requirements",
			currentVersion:      "0.1.0",
			requirementsRemoved: 1,
			expectedBumpType:    "major",
		},
		{
			name:             "Patch bump for metadata only",
			currentVersion:   "0.1.0",
			metadataChanged:  true,
			expectedBumpType: "patch",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// This test documents expected behavior
			// Actual version bumping is done by LLM task
			t.Skip("Version bumping is LLM-driven, see tasks.ExecuteVersionBumpTask")
		})
	}
}

// Helper function removed - createMockClientWithFixtures is no longer needed
// as tests now use real llm.Client instances

// TestIntegration_FullWorkflow tests complete user workflow from init to commit.
func TestIntegration_FullWorkflow(t *testing.T) {
	t.Skip("Full workflow test requires stdin/stdout mocking and complete task chain")

	// Expected workflow:
	// 1. xdd init (creates .xdd/ structure)
	// 2. xdd specify "Build a task manager"
	// 3. LLM generates metadata, requirements, categories
	// 4. User reviews changelog
	// 5. User confirms "yes"
	// 6. Changes committed atomically
	// 7. specification.yaml and changelog.yaml exist
	// 8. All event types present
	// 9. Version follows semver
}

// TestIntegration_ErrorRecovery tests that errors don't corrupt state.
func TestIntegration_ErrorRecovery(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "xdd-integration-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	repo := repository.NewRepository(tempDir)

	// Write initial valid spec
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "TestProject",
			Description: "Initial state",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}
	err = repo.WriteSpecification(spec)
	require.NoError(t, err)

	// Simulate failed commit (make directory read-only)
	err = os.Chmod(specsDir, 0444)
	require.NoError(t, err)

	// Try to write - should fail
	spec.Metadata.Name = "UpdatedName"
	err = repo.WriteSpecification(spec)
	assert.Error(t, err)

	// Restore permissions
	err = os.Chmod(specsDir, 0755)
	require.NoError(t, err)

	// Verify original state preserved
	readSpec, err := repo.ReadSpecification()
	require.NoError(t, err)
	assert.Equal(t, "TestProject", readSpec.Metadata.Name, "Original state should be preserved")
}

// Benchmark integration operations.
func BenchmarkIntegration_ReadSpecification(b *testing.B) {
	tempDir, _ := os.MkdirTemp("", "xdd-bench-*")
	defer os.RemoveAll(tempDir)

	specsDir := filepath.Join(tempDir, "01-specs")
	os.MkdirAll(specsDir, 0755)

	repo := repository.NewRepository(tempDir)

	// Create sample spec with 100 requirements
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "BenchProject",
			Description: "Benchmark test",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: make([]schema.Requirement, 100),
		Categories:   []string{"CAT1", "CAT2", "CAT3"},
	}

	// Populate requirements
	for i := 0; i < 100; i++ {
		reqID, _ := schema.NewRequirementID("TEST")
		spec.Requirements[i] = schema.Requirement{
			ID:          reqID,
			Type:        schema.EARSEvent,
			Category:    "TEST",
			Description: "Test requirement for benchmarking",
			Priority:    schema.PriorityMedium,
			CreatedAt:   time.Now(),
		}
	}

	repo.WriteSpecification(spec)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		repo.ReadSpecification()
	}
}

func BenchmarkIntegration_WriteSpecification(b *testing.B) {
	tempDir, _ := os.MkdirTemp("", "xdd-bench-*")
	defer os.RemoveAll(tempDir)

	specsDir := filepath.Join(tempDir, "01-specs")
	os.MkdirAll(specsDir, 0755)

	repo := repository.NewRepository(tempDir)

	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "BenchProject",
			Description: "Benchmark test",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: make([]schema.Requirement, 10),
		Categories:   []string{"TEST"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		repo.WriteSpecification(spec)
	}
}
