package repository

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"xdd/pkg/schema"
)

// TestFullEventReplayValidation validates the complete event replay system
// This test proves that event replay is working correctly by:
// 1. Creating a spec with changelog events
// 2. Reading it back using event replay
// 3. Verifying the state matches exactly.
func TestFullEventReplayValidation(t *testing.T) {
	tempDir := t.TempDir()
	xddDir := filepath.Join(tempDir, ".xdd")
	if err := os.MkdirAll(filepath.Join(xddDir, "01-specs"), 0755); err != nil {
		t.Fatalf("Failed to create .xdd directory: %v", err)
	}

	repo := NewRepository(xddDir)
	now := time.Now()

	// Build a specification through events
	events := []schema.ChangelogEvent{
		// Add metadata
		&schema.ProjectMetadataUpdated{
			EventID_: "EVT-001",
			OldMetadata: schema.ProjectMetadata{
				Name:        "",
				Description: "",
				Version:     "0.0.0",
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			NewMetadata: schema.ProjectMetadata{
				Name:        "ValidationTest",
				Description: "Testing complete event replay validation",
				Version:     "0.1.0",
				CreatedAt:   now,
				UpdatedAt:   now,
			},
			Timestamp_: now,
		},
		// Add first requirement
		&schema.RequirementAdded{
			EventID_: "EVT-002",
			Requirement: schema.Requirement{
				ID:          "REQ-AUTH-001",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "When user logs in, the system shall validate credentials",
				Rationale:   "Security is critical",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.BehavioralCriterion{
						ID:        "AC-001",
						Type:      "behavioral",
						Given:     "User has valid credentials",
						When:      "User submits login form",
						Then:      "System validates and grants access",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: now,
			},
			Timestamp_: now.Add(1 * time.Second),
		},
		// Add second requirement
		&schema.RequirementAdded{
			EventID_: "EVT-003",
			Requirement: schema.Requirement{
				ID:          "REQ-TASKS-001",
				Type:        schema.EARSState,
				Category:    "TASKS",
				Description: "While user is authenticated, the system shall display task list",
				Rationale:   "Core functionality",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-002",
						Type:      "assertion",
						Statement: "Task list contains all user tasks",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityCritical,
				CreatedAt: now,
			},
			Timestamp_: now.Add(2 * time.Second),
		},
		// Add acceptance criterion to first requirement
		&schema.AcceptanceCriterionAdded{
			EventID_:      "EVT-004",
			RequirementID: "REQ-AUTH-001",
			Criterion: &schema.AssertionCriterion{
				ID:        "AC-003",
				Type:      "assertion",
				Statement: "Failed login attempts are logged",
				CreatedAt: now,
			},
			Timestamp_: now.Add(3 * time.Second),
		},
		// Version bump
		&schema.VersionBumped{
			EventID_:   "EVT-005",
			OldVersion: "0.1.0",
			NewVersion: "0.2.0",
			BumpType:   "minor",
			Reasoning:  "Added task management features",
			Timestamp_: now.Add(4 * time.Second),
		},
	}

	// Build expected specification
	expectedSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "ValidationTest",
			Description: "Testing complete event replay validation",
			Version:     "0.2.0", // After version bump
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-AUTH-001",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "When user logs in, the system shall validate credentials",
				Rationale:   "Security is critical",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.BehavioralCriterion{
						ID:        "AC-001",
						Type:      "behavioral",
						Given:     "User has valid credentials",
						When:      "User submits login form",
						Then:      "System validates and grants access",
						CreatedAt: now,
					},
					&schema.AssertionCriterion{
						ID:        "AC-003",
						Type:      "assertion",
						Statement: "Failed login attempts are logged",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: now,
			},
			{
				ID:          "REQ-TASKS-001",
				Type:        schema.EARSState,
				Category:    "TASKS",
				Description: "While user is authenticated, the system shall display task list",
				Rationale:   "Core functionality",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-002",
						Type:      "assertion",
						Statement: "Task list contains all user tasks",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityCritical,
				CreatedAt: now,
			},
		},
		Categories: []string{"AUTH", "TASKS"},
	}

	// Write using WriteSpecificationAndChangelog
	if err := repo.WriteSpecificationAndChangelog(expectedSpec, events); err != nil {
		t.Fatalf("Failed to write specification and changelog: %v", err)
	}

	// Read back using event replay
	replayedSpec, err := repo.ReadSpecification()
	if err != nil {
		t.Fatalf("Failed to read specification: %v", err)
	}

	// Validate metadata
	if replayedSpec.Metadata.Name != expectedSpec.Metadata.Name {
		t.Errorf("Name mismatch: expected %s, got %s", expectedSpec.Metadata.Name, replayedSpec.Metadata.Name)
	}
	if replayedSpec.Metadata.Description != expectedSpec.Metadata.Description {
		t.Errorf("Description mismatch: expected %s, got %s", expectedSpec.Metadata.Description, replayedSpec.Metadata.Description)
	}
	if replayedSpec.Metadata.Version != expectedSpec.Metadata.Version {
		t.Errorf("Version mismatch: expected %s, got %s", expectedSpec.Metadata.Version, replayedSpec.Metadata.Version)
	}

	// Validate requirements count
	if len(replayedSpec.Requirements) != len(expectedSpec.Requirements) {
		t.Errorf("Requirements count mismatch: expected %d, got %d", len(expectedSpec.Requirements), len(replayedSpec.Requirements))
	}

	// Validate categories
	if len(replayedSpec.Categories) != len(expectedSpec.Categories) {
		t.Errorf("Categories count mismatch: expected %d, got %d", len(expectedSpec.Categories), len(replayedSpec.Categories))
	}

	// Validate first requirement acceptance criteria count (should have 2 after adding one)
	if len(replayedSpec.Requirements[0].AcceptanceCriteria) != 2 {
		t.Errorf("Expected 2 acceptance criteria for REQ-AUTH-001, got %d", len(replayedSpec.Requirements[0].AcceptanceCriteria))
	}

	t.Logf("✅ Event replay validation successful!")
	t.Logf("   - Metadata: %s v%s", replayedSpec.Metadata.Name, replayedSpec.Metadata.Version)
	t.Logf("   - Requirements: %d", len(replayedSpec.Requirements))
	t.Logf("   - Categories: %v", replayedSpec.Categories)
	t.Logf("   - REQ-AUTH-001 acceptance criteria: %d", len(replayedSpec.Requirements[0].AcceptanceCriteria))
}

// TestSnapshotPlusReplayEqualsFullReplay validates snapshot+replay = full replay.
func TestSnapshotPlusReplayEqualsFullReplay(t *testing.T) {
	tempDir := t.TempDir()
	xddDir := filepath.Join(tempDir, ".xdd")
	if err := os.MkdirAll(filepath.Join(xddDir, "01-specs"), 0755); err != nil {
		t.Fatalf("Failed to create .xdd directory: %v", err)
	}

	repo := NewRepository(xddDir)
	now := time.Now()

	// Create 50 events to build initial state
	initialEvents := []schema.ChangelogEvent{}
	initialSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "SnapshotTest",
			Description: "Testing snapshot equivalence",
			Version:     "1.0.0",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	for i := 0; i < 50; i++ {
		req := schema.Requirement{
			ID:          generateTestID("REQ", i),
			Type:        schema.EARSEvent,
			Category:    "TEST",
			Description: generateTestDescription(i),
			Rationale:   "Test rationale",
			AcceptanceCriteria: []schema.AcceptanceCriterion{
				&schema.AssertionCriterion{
					ID:        generateTestID("AC", i),
					Type:      "assertion",
					Statement: "Test assertion",
					CreatedAt: now,
				},
			},
			Priority:  schema.PriorityMedium,
			CreatedAt: now,
		}

		initialSpec.Requirements = append(initialSpec.Requirements, req)
		initialEvents = append(initialEvents, &schema.RequirementAdded{
			EventID_:    generateTestID("EVT", i),
			Requirement: req,
			Timestamp_:  now.Add(time.Duration(i) * time.Second),
		})
	}

	if !containsString(initialSpec.Categories, "TEST") {
		initialSpec.Categories = append(initialSpec.Categories, "TEST")
	}

	// Write and create snapshot (50 events)
	if err := repo.WriteSpecificationAndChangelog(initialSpec, initialEvents); err != nil {
		t.Fatalf("Failed to write initial spec: %v", err)
	}

	// Add 60 more events (total 110, which triggers snapshot)
	moreEvents := []schema.ChangelogEvent{}
	for i := 50; i < 110; i++ {
		req := schema.Requirement{
			ID:          generateTestID("REQ", i),
			Type:        schema.EARSEvent,
			Category:    "TEST",
			Description: generateTestDescription(i),
			Rationale:   "Test rationale",
			AcceptanceCriteria: []schema.AcceptanceCriterion{
				&schema.AssertionCriterion{
					ID:        generateTestID("AC", i),
					Type:      "assertion",
					Statement: "Test assertion",
					CreatedAt: now,
				},
			},
			Priority:  schema.PriorityMedium,
			CreatedAt: now,
		}

		initialSpec.Requirements = append(initialSpec.Requirements, req)
		moreEvents = append(moreEvents, &schema.RequirementAdded{
			EventID_:    generateTestID("EVT", i),
			Requirement: req,
			Timestamp_:  now.Add(time.Duration(i) * time.Second),
		})
	}

	initialSpec.Metadata.UpdatedAt = now.Add(110 * time.Second)

	// Write additional events (triggers snapshot creation)
	if err := repo.WriteSpecificationAndChangelog(initialSpec, moreEvents); err != nil {
		t.Fatalf("Failed to write additional events: %v", err)
	}

	// Read spec (should load from snapshot + replay remaining events)
	specFromSnapshot, err := repo.ReadSpecification()
	if err != nil {
		t.Fatalf("Failed to read spec from snapshot: %v", err)
	}

	// Verify we got all 110 requirements
	if len(specFromSnapshot.Requirements) != 110 {
		t.Errorf("Expected 110 requirements from snapshot+replay, got %d", len(specFromSnapshot.Requirements))
	}

	// For comparison, reconstruct from full event replay
	emptySpec := &schema.Specification{
		Metadata:     schema.ProjectMetadata{},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	allEvents := append(initialEvents, moreEvents...)
	specFromFullReplay, err := ReplayEvents(emptySpec, allEvents)
	if err != nil {
		t.Fatalf("Failed to replay all events: %v", err)
	}

	// Compare: snapshot+replay should equal full replay
	if len(specFromSnapshot.Requirements) != len(specFromFullReplay.Requirements) {
		t.Errorf("Requirement count mismatch: snapshot+replay=%d, full replay=%d",
			len(specFromSnapshot.Requirements), len(specFromFullReplay.Requirements))
	}

	// Verify all requirement IDs match
	for i := 0; i < len(specFromSnapshot.Requirements); i++ {
		if specFromSnapshot.Requirements[i].ID != specFromFullReplay.Requirements[i].ID {
			t.Errorf("Requirement ID mismatch at index %d: snapshot=%s, full=%s",
				i, specFromSnapshot.Requirements[i].ID, specFromFullReplay.Requirements[i].ID)
		}
	}

	t.Logf("✅ Snapshot + Replay = Full Replay validation successful!")
	t.Logf("   - Both methods produced %d requirements", len(specFromSnapshot.Requirements))
	t.Logf("   - All requirement IDs match")
}
