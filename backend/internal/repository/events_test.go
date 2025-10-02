package repository

import (
	"testing"
	"time"

	"xdd/pkg/schema"
)

// Helper to create a base specification for testing.
func createBaseSpec() *schema.Specification {
	return &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "TestProject",
			Description: "A test project for event replay",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}
}

func TestApplyRequirementAdded(t *testing.T) {
	spec := createBaseSpec()

	req := schema.Requirement{
		ID:          "REQ-AUTH-abc123",
		Type:        schema.EARSEvent,
		Category:    "AUTH",
		Description: "When user logs in, system shall validate credentials",
		Rationale:   "Security requirement",
		AcceptanceCriteria: []schema.AcceptanceCriterion{
			&schema.BehavioralCriterion{
				ID:        "AC-xyz789",
				Type:      "behavioral",
				Given:     "User has valid credentials",
				When:      "User submits login form",
				Then:      "System validates and grants access",
				CreatedAt: time.Now(),
			},
		},
		Priority:  schema.PriorityHigh,
		CreatedAt: time.Now(),
	}

	event := &schema.RequirementAdded{
		EventID_:    "EVT-001",
		Requirement: req,
		Timestamp_:  time.Now(),
	}

	err := applyRequirementAdded(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply RequirementAdded: %v", err)
	}

	if len(spec.Requirements) != 1 {
		t.Errorf("Expected 1 requirement, got %d", len(spec.Requirements))
	}

	if spec.Requirements[0].ID != "REQ-AUTH-abc123" {
		t.Errorf("Expected requirement ID REQ-AUTH-abc123, got %s", spec.Requirements[0].ID)
	}

	if len(spec.Categories) != 1 {
		t.Errorf("Expected 1 category, got %d", len(spec.Categories))
	}

	if spec.Categories[0] != "AUTH" {
		t.Errorf("Expected category AUTH, got %s", spec.Categories[0])
	}
}

func TestApplyRequirementDeleted(t *testing.T) {
	spec := createBaseSpec()

	// Add a requirement first
	req := schema.Requirement{
		ID:          "REQ-AUTH-abc123",
		Type:        schema.EARSEvent,
		Category:    "AUTH",
		Description: "Test requirement",
		Rationale:   "Test rationale",
		AcceptanceCriteria: []schema.AcceptanceCriterion{
			&schema.AssertionCriterion{
				ID:        "AC-xyz789",
				Type:      "assertion",
				Statement: "System validates credentials",
				CreatedAt: time.Now(),
			},
		},
		Priority:  schema.PriorityHigh,
		CreatedAt: time.Now(),
	}

	spec.Requirements = append(spec.Requirements, req)
	spec.Categories = append(spec.Categories, "AUTH")

	// Now delete it
	event := &schema.RequirementDeleted{
		EventID_:      "EVT-002",
		RequirementID: "REQ-AUTH-abc123",
		Requirement:   req,
		Timestamp_:    time.Now(),
	}

	err := applyRequirementDeleted(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply RequirementDeleted: %v", err)
	}

	if len(spec.Requirements) != 0 {
		t.Errorf("Expected 0 requirements, got %d", len(spec.Requirements))
	}

	// Category should be removed since no requirements use it
	if len(spec.Categories) != 0 {
		t.Errorf("Expected 0 categories, got %d", len(spec.Categories))
	}
}

func TestApplyCategoryRenamed(t *testing.T) {
	spec := createBaseSpec()

	// Add requirement with category
	req := schema.Requirement{
		ID:          "REQ-AUTH-abc123",
		Type:        schema.EARSEvent,
		Category:    "AUTH",
		Description: "Test requirement",
		Rationale:   "Test rationale",
		AcceptanceCriteria: []schema.AcceptanceCriterion{
			&schema.AssertionCriterion{
				ID:        "AC-xyz789",
				Type:      "assertion",
				Statement: "Test",
				CreatedAt: time.Now(),
			},
		},
		Priority:  schema.PriorityHigh,
		CreatedAt: time.Now(),
	}

	spec.Requirements = append(spec.Requirements, req)
	spec.Categories = append(spec.Categories, "AUTH")

	// Rename category
	event := &schema.CategoryRenamed{
		EventID_:   "EVT-003",
		OldName:    "AUTH",
		NewName:    "SECURITY",
		Timestamp_: time.Now(),
	}

	err := applyCategoryRenamed(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply CategoryRenamed: %v", err)
	}

	if spec.Categories[0] != "SECURITY" {
		t.Errorf("Expected category SECURITY, got %s", spec.Categories[0])
	}

	if spec.Requirements[0].Category != "SECURITY" {
		t.Errorf("Expected requirement category SECURITY, got %s", spec.Requirements[0].Category)
	}
}

func TestApplyProjectMetadataUpdated(t *testing.T) {
	spec := createBaseSpec()

	oldMeta := spec.Metadata
	newMeta := schema.ProjectMetadata{
		Name:        "UpdatedProject",
		Description: "An updated test project",
		Version:     "0.2.0",
		CreatedAt:   oldMeta.CreatedAt,
		UpdatedAt:   time.Now(),
	}

	event := &schema.ProjectMetadataUpdated{
		EventID_:    "EVT-004",
		OldMetadata: oldMeta,
		NewMetadata: newMeta,
		Timestamp_:  time.Now(),
	}

	err := applyProjectMetadataUpdated(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply ProjectMetadataUpdated: %v", err)
	}

	if spec.Metadata.Name != "UpdatedProject" {
		t.Errorf("Expected name UpdatedProject, got %s", spec.Metadata.Name)
	}

	if spec.Metadata.Version != "0.2.0" {
		t.Errorf("Expected version 0.2.0, got %s", spec.Metadata.Version)
	}
}

func TestApplyVersionBumped(t *testing.T) {
	spec := createBaseSpec()

	event := &schema.VersionBumped{
		EventID_:   "EVT-005",
		OldVersion: "0.1.0",
		NewVersion: "0.2.0",
		BumpType:   "minor",
		Reasoning:  "Added new feature",
		Timestamp_: time.Now(),
	}

	err := applyVersionBumped(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply VersionBumped: %v", err)
	}

	if spec.Metadata.Version != "0.2.0" {
		t.Errorf("Expected version 0.2.0, got %s", spec.Metadata.Version)
	}
}

func TestReplayEventsOrdering(t *testing.T) {
	spec := createBaseSpec()

	now := time.Now()

	// Create events out of order - test that they get sorted by timestamp
	events := []schema.ChangelogEvent{
		&schema.VersionBumped{
			EventID_:   "EVT-003",
			OldVersion: "0.1.0",
			NewVersion: "0.2.0",
			BumpType:   "minor",
			Reasoning:  "New feature",
			Timestamp_: now.Add(3 * time.Second),
		},
		&schema.RequirementAdded{
			EventID_: "EVT-001",
			Requirement: schema.Requirement{
				ID:          "REQ-001",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "Test requirement",
				Rationale:   "Test rationale",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-001",
						Type:      "assertion",
						Statement: "Test",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: now,
			},
			Timestamp_: now.Add(1 * time.Second),
		},
		&schema.ProjectMetadataUpdated{
			EventID_: "EVT-002",
			OldMetadata: schema.ProjectMetadata{
				Name:        "TestProject",
				Description: "A test project",
				Version:     "0.1.0",
			},
			NewMetadata: schema.ProjectMetadata{
				Name:        "UpdatedProject",
				Description: "An updated test project",
				Version:     "0.1.0",
			},
			Timestamp_: now.Add(2 * time.Second),
		},
	}

	// Replay should sort by timestamp
	result, err := ReplayEvents(spec, events)
	if err != nil {
		t.Fatalf("Failed to replay events: %v", err)
	}

	// Verify all events were applied
	if len(result.Requirements) != 1 {
		t.Errorf("Expected 1 requirement, got %d", len(result.Requirements))
	}

	if result.Metadata.Version != "0.2.0" {
		t.Errorf("Expected version 0.2.0, got %s", result.Metadata.Version)
	}

	if result.Metadata.Name != "UpdatedProject" {
		t.Errorf("Expected name UpdatedProject, got %s", result.Metadata.Name)
	}
}

func TestReplayEventsMultipleRequirements(t *testing.T) {
	spec := createBaseSpec()

	now := time.Now()

	events := []schema.ChangelogEvent{
		&schema.RequirementAdded{
			EventID_: "EVT-001",
			Requirement: schema.Requirement{
				ID:          "REQ-001",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "Test requirement 1",
				Rationale:   "Test rationale 1",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-001",
						Type:      "assertion",
						Statement: "Test 1",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: now,
			},
			Timestamp_: now,
		},
		&schema.RequirementAdded{
			EventID_: "EVT-002",
			Requirement: schema.Requirement{
				ID:          "REQ-002",
				Type:        schema.EARSState,
				Category:    "TASKS",
				Description: "Test requirement 2",
				Rationale:   "Test rationale 2",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.BehavioralCriterion{
						ID:        "AC-002",
						Type:      "behavioral",
						Given:     "Given test",
						When:      "When test",
						Then:      "Then test",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityMedium,
				CreatedAt: now,
			},
			Timestamp_: now.Add(1 * time.Second),
		},
	}

	result, err := ReplayEvents(spec, events)
	if err != nil {
		t.Fatalf("Failed to replay events: %v", err)
	}

	if len(result.Requirements) != 2 {
		t.Errorf("Expected 2 requirements, got %d", len(result.Requirements))
	}

	if len(result.Categories) != 2 {
		t.Errorf("Expected 2 categories, got %d", len(result.Categories))
	}
}

func TestReplayEventsDeterministic(t *testing.T) {
	now := time.Now()

	events := []schema.ChangelogEvent{
		&schema.RequirementAdded{
			EventID_: "EVT-001",
			Requirement: schema.Requirement{
				ID:          "REQ-001",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "Test requirement",
				Rationale:   "Test rationale",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-001",
						Type:      "assertion",
						Statement: "Test",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: now,
			},
			Timestamp_: now,
		},
		&schema.VersionBumped{
			EventID_:   "EVT-002",
			OldVersion: "0.1.0",
			NewVersion: "0.2.0",
			BumpType:   "minor",
			Reasoning:  "New feature",
			Timestamp_: now.Add(1 * time.Second),
		},
	}

	// Replay twice
	spec1 := createBaseSpec()
	result1, err := ReplayEvents(spec1, events)
	if err != nil {
		t.Fatalf("First replay failed: %v", err)
	}

	spec2 := createBaseSpec()
	result2, err := ReplayEvents(spec2, events)
	if err != nil {
		t.Fatalf("Second replay failed: %v", err)
	}

	// Results should be identical
	if len(result1.Requirements) != len(result2.Requirements) {
		t.Errorf("Determinism failed: different requirement counts")
	}

	if result1.Metadata.Version != result2.Metadata.Version {
		t.Errorf("Determinism failed: different versions")
	}
}

func TestApplyAcceptanceCriterionAdded(t *testing.T) {
	spec := createBaseSpec()

	// Add requirement first
	req := schema.Requirement{
		ID:                 "REQ-001",
		Type:               schema.EARSEvent,
		Category:           "AUTH",
		Description:        "Test requirement",
		Rationale:          "Test rationale",
		AcceptanceCriteria: []schema.AcceptanceCriterion{},
		Priority:           schema.PriorityHigh,
		CreatedAt:          time.Now(),
	}

	spec.Requirements = append(spec.Requirements, req)

	// Add acceptance criterion
	event := &schema.AcceptanceCriterionAdded{
		EventID_:      "EVT-001",
		RequirementID: "REQ-001",
		Criterion: &schema.AssertionCriterion{
			ID:        "AC-001",
			Type:      "assertion",
			Statement: "Test assertion",
			CreatedAt: time.Now(),
		},
		Timestamp_: time.Now(),
	}

	err := applyAcceptanceCriterionAdded(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply AcceptanceCriterionAdded: %v", err)
	}

	if len(spec.Requirements[0].AcceptanceCriteria) != 1 {
		t.Errorf("Expected 1 acceptance criterion, got %d", len(spec.Requirements[0].AcceptanceCriteria))
	}

	if spec.Requirements[0].AcceptanceCriteria[0].GetID() != "AC-001" {
		t.Errorf("Expected AC-001, got %s", spec.Requirements[0].AcceptanceCriteria[0].GetID())
	}
}

func TestApplyAcceptanceCriterionDeleted(t *testing.T) {
	spec := createBaseSpec()

	// Add requirement with criterion
	ac := &schema.AssertionCriterion{
		ID:        "AC-001",
		Type:      "assertion",
		Statement: "Test assertion",
		CreatedAt: time.Now(),
	}

	req := schema.Requirement{
		ID:                 "REQ-001",
		Type:               schema.EARSEvent,
		Category:           "AUTH",
		Description:        "Test requirement",
		Rationale:          "Test rationale",
		AcceptanceCriteria: []schema.AcceptanceCriterion{ac},
		Priority:           schema.PriorityHigh,
		CreatedAt:          time.Now(),
	}

	spec.Requirements = append(spec.Requirements, req)

	// Delete acceptance criterion
	event := &schema.AcceptanceCriterionDeleted{
		EventID_:      "EVT-001",
		RequirementID: "REQ-001",
		CriterionID:   "AC-001",
		Criterion:     ac,
		Timestamp_:    time.Now(),
	}

	err := applyAcceptanceCriterionDeleted(spec, event)
	if err != nil {
		t.Fatalf("Failed to apply AcceptanceCriterionDeleted: %v", err)
	}

	if len(spec.Requirements[0].AcceptanceCriteria) != 0 {
		t.Errorf("Expected 0 acceptance criteria, got %d", len(spec.Requirements[0].AcceptanceCriteria))
	}
}

func TestReplayEventsErrorCases(t *testing.T) {
	tests := []struct {
		name      string
		spec      *schema.Specification
		event     schema.ChangelogEvent
		wantError bool
	}{
		{
			name:      "nil spec",
			spec:      nil,
			event:     &schema.CategoryAdded{EventID_: "EVT-001", Name: "AUTH", Timestamp_: time.Now()},
			wantError: true,
		},
		{
			name: "duplicate requirement ID",
			spec: &schema.Specification{
				Requirements: []schema.Requirement{
					{ID: "REQ-001", Category: "AUTH", AcceptanceCriteria: []schema.AcceptanceCriterion{}},
				},
				Categories: []string{"AUTH"},
			},
			event: &schema.RequirementAdded{
				EventID_: "EVT-001",
				Requirement: schema.Requirement{
					ID:                 "REQ-001",
					Category:           "AUTH",
					AcceptanceCriteria: []schema.AcceptanceCriterion{},
				},
				Timestamp_: time.Now(),
			},
			wantError: true,
		},
		{
			name: "delete non-existent requirement",
			spec: &schema.Specification{
				Requirements: []schema.Requirement{},
				Categories:   []string{},
			},
			event: &schema.RequirementDeleted{
				EventID_:      "EVT-001",
				RequirementID: "REQ-999",
				Requirement:   schema.Requirement{ID: "REQ-999", Category: "AUTH"},
				Timestamp_:    time.Now(),
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var err error
			if tt.spec == nil {
				_, err = ReplayEvents(tt.spec, []schema.ChangelogEvent{tt.event})
			} else {
				err = applyEvent(tt.spec, tt.event)
			}

			if (err != nil) != tt.wantError {
				t.Errorf("Expected error: %v, got error: %v", tt.wantError, err)
			}
		})
	}
}
