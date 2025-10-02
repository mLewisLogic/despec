package repository

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"xdd/pkg/schema"
)

// TestSnapshotAndReplayIntegration tests the full snapshot + event replay flow.
func TestSnapshotAndReplayIntegration(t *testing.T) {
	// Create temp directory
	tempDir := t.TempDir()
	xddDir := filepath.Join(tempDir, ".xdd")
	if err := os.MkdirAll(filepath.Join(xddDir, "01-specs"), 0755); err != nil {
		t.Fatalf("Failed to create .xdd directory: %v", err)
	}

	repo := NewRepository(xddDir)
	now := time.Now()

	// Create initial specification
	initialSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "IntegrationTest",
			Description: "Testing snapshot and replay",
			Version:     "0.1.0",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-001",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "Initial requirement",
				Rationale:   "Test rationale",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-001",
						Type:      "assertion",
						Statement: "Test assertion",
						CreatedAt: now,
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: now,
			},
		},
		Categories: []string{"AUTH"},
	}

	// Write initial spec and create snapshot
	events := []schema.ChangelogEvent{
		&schema.RequirementAdded{
			EventID_:    "EVT-001",
			Requirement: initialSpec.Requirements[0],
			Timestamp_:  now,
		},
	}

	if err := repo.WriteSpecificationAndChangelog(initialSpec, events); err != nil {
		t.Fatalf("Failed to write initial spec: %v", err)
	}

	// Add more events (these should be replayed after loading snapshot)
	newEvents := []schema.ChangelogEvent{
		&schema.RequirementAdded{
			EventID_: "EVT-002",
			Requirement: schema.Requirement{
				ID:          "REQ-002",
				Type:        schema.EARSState,
				Category:    "TASKS",
				Description: "Second requirement",
				Rationale:   "Test rationale 2",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.BehavioralCriterion{
						ID:        "AC-002",
						Type:      "behavioral",
						Given:     "Given test",
						When:      "When test",
						Then:      "Then test",
						CreatedAt: now.Add(1 * time.Second),
					},
				},
				Priority:  schema.PriorityMedium,
				CreatedAt: now.Add(1 * time.Second),
			},
			Timestamp_: now.Add(1 * time.Second),
		},
		&schema.VersionBumped{
			EventID_:   "EVT-003",
			OldVersion: "0.1.0",
			NewVersion: "0.2.0",
			BumpType:   "minor",
			Reasoning:  "Added new requirement",
			Timestamp_: now.Add(2 * time.Second),
		},
	}

	if err := repo.AppendChangelog(newEvents); err != nil {
		t.Fatalf("Failed to append new events: %v", err)
	}

	// Read specification - should load from spec file and replay events
	loadedSpec, err := repo.ReadSpecification()
	if err != nil {
		t.Fatalf("Failed to read specification: %v", err)
	}

	// Verify the replayed state is correct
	if len(loadedSpec.Requirements) != 2 {
		t.Errorf("Expected 2 requirements after replay, got %d", len(loadedSpec.Requirements))
	}

	if loadedSpec.Metadata.Version != "0.2.0" {
		t.Errorf("Expected version 0.2.0 after replay, got %s", loadedSpec.Metadata.Version)
	}

	if len(loadedSpec.Categories) != 2 {
		t.Errorf("Expected 2 categories after replay, got %d", len(loadedSpec.Categories))
	}

	// Verify specific requirements
	foundReq1 := false
	foundReq2 := false
	for _, req := range loadedSpec.Requirements {
		if req.ID == "REQ-001" {
			foundReq1 = true
		}
		if req.ID == "REQ-002" {
			foundReq2 = true
		}
	}

	if !foundReq1 {
		t.Error("REQ-001 not found after replay")
	}
	if !foundReq2 {
		t.Error("REQ-002 not found after replay")
	}
}

// TestSnapshotCreationAndReplay tests snapshot creation after 100 events.
func TestSnapshotCreationAndReplay(t *testing.T) {
	// This test would create 100+ events and verify snapshot is created
	// and that replay works correctly from snapshot
	tempDir := t.TempDir()
	xddDir := filepath.Join(tempDir, ".xdd")
	if err := os.MkdirAll(filepath.Join(xddDir, "01-specs"), 0755); err != nil {
		t.Fatalf("Failed to create .xdd directory: %v", err)
	}

	repo := NewRepository(xddDir)
	now := time.Now()

	// Create initial specification
	initialSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "SnapshotTest",
			Description: "Testing snapshot creation",
			Version:     "0.1.0",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	// Create 50 requirements to trigger snapshot
	events := []schema.ChangelogEvent{}
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
					CreatedAt: now.Add(time.Duration(i) * time.Second),
				},
			},
			Priority:  schema.PriorityMedium,
			CreatedAt: now.Add(time.Duration(i) * time.Second),
		}

		initialSpec.Requirements = append(initialSpec.Requirements, req)
		events = append(events, &schema.RequirementAdded{
			EventID_:    generateTestID("EVT", i),
			Requirement: req,
			Timestamp_:  now.Add(time.Duration(i) * time.Second),
		})
	}

	if !containsString(initialSpec.Categories, "TEST") {
		initialSpec.Categories = append(initialSpec.Categories, "TEST")
	}

	// Write spec with 50 events
	if err := repo.WriteSpecificationAndChangelog(initialSpec, events); err != nil {
		t.Fatalf("Failed to write spec with 50 events: %v", err)
	}

	// Add 60 more events to trigger snapshot (total 110)
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
					CreatedAt: now.Add(time.Duration(i) * time.Second),
				},
			},
			Priority:  schema.PriorityMedium,
			CreatedAt: now.Add(time.Duration(i) * time.Second),
		}

		initialSpec.Requirements = append(initialSpec.Requirements, req)
		moreEvents = append(moreEvents, &schema.RequirementAdded{
			EventID_:    generateTestID("EVT", i),
			Requirement: req,
			Timestamp_:  now.Add(time.Duration(i) * time.Second),
		})
	}

	initialSpec.Metadata.UpdatedAt = now.Add(110 * time.Second)

	// This should trigger snapshot creation (110 total events > 100 threshold)
	if err := repo.WriteSpecificationAndChangelog(initialSpec, moreEvents); err != nil {
		t.Fatalf("Failed to write spec with 110 events: %v", err)
	}

	// Verify snapshot was created
	snapshotDir := filepath.Join(xddDir, "01-specs", "snapshots")
	entries, err := os.ReadDir(snapshotDir)
	if err != nil {
		t.Fatalf("Failed to read snapshots directory: %v", err)
	}

	if len(entries) == 0 {
		t.Error("Expected snapshot to be created after 110 events, but none found")
	}

	// Read spec - should load from snapshot
	loadedSpec, err := repo.ReadSpecification()
	if err != nil {
		t.Fatalf("Failed to read spec from snapshot: %v", err)
	}

	if len(loadedSpec.Requirements) != 110 {
		t.Errorf("Expected 110 requirements from snapshot, got %d", len(loadedSpec.Requirements))
	}
}

// TestReplayPerformance tests that replaying events is fast.
func TestReplayPerformance(t *testing.T) {
	spec := createBaseSpec()
	now := time.Now()

	// Create 100 events
	events := []schema.ChangelogEvent{}
	for i := 0; i < 100; i++ {
		req := schema.Requirement{
			ID:          generateTestID("REQ", i),
			Type:        schema.EARSEvent,
			Category:    "PERF",
			Description: generateTestDescription(i),
			Rationale:   "Performance test",
			AcceptanceCriteria: []schema.AcceptanceCriterion{
				&schema.AssertionCriterion{
					ID:        generateTestID("AC", i),
					Type:      "assertion",
					Statement: "Perf assertion",
					CreatedAt: now,
				},
			},
			Priority:  schema.PriorityMedium,
			CreatedAt: now,
		}

		events = append(events, &schema.RequirementAdded{
			EventID_:    generateTestID("EVT", i),
			Requirement: req,
			Timestamp_:  now.Add(time.Duration(i) * time.Millisecond),
		})
	}

	// Measure replay time
	start := time.Now()
	result, err := ReplayEvents(spec, events)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Replay failed: %v", err)
	}

	if len(result.Requirements) != 100 {
		t.Errorf("Expected 100 requirements, got %d", len(result.Requirements))
	}

	// Should replay 100 events in under 50ms
	if elapsed > 50*time.Millisecond {
		t.Errorf("Replay took too long: %v (expected < 50ms)", elapsed)
	}

	t.Logf("Replayed 100 events in %v", elapsed)
}

// Helper functions.
func generateTestID(prefix string, i int) string {
	return prefix + "-" + string(rune('A'+i%26)) + string(rune('A'+(i/26)%26)) + string(rune('0'+i%10))
}

func generateTestDescription(i int) string {
	return "Test requirement number " + string(rune('0'+i%10))
}
