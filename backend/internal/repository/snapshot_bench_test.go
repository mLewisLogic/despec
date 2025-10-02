package repository

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"xdd/pkg/schema"
)

func BenchmarkSnapshotCreation(b *testing.B) {
	tempDir := b.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	sm := NewSnapshotManager(baseDir)

	// Create specification with 100 requirements
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "BenchTest",
			Description: "Performance benchmark",
			Version:     "1.0.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: make([]schema.Requirement, 100),
		Categories:   []string{"TEST"},
	}

	for i := 0; i < 100; i++ {
		reqID, _ := schema.NewRequirementID("TEST")
		spec.Requirements[i] = schema.Requirement{
			ID:          reqID,
			Type:        schema.EARSUbiquitous,
			Category:    "TEST",
			Description: "The system shall maintain performance",
			Rationale:   "Performance is critical",
			Priority:    schema.PriorityHigh,
			CreatedAt:   time.Now(),
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		err := sm.CreateSnapshot(spec)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSnapshotLoad(b *testing.B) {
	tempDir := b.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	sm := NewSnapshotManager(baseDir)

	// Create specification
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "LoadBench",
			Description: "Load performance",
			Version:     "1.0.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: make([]schema.Requirement, 100),
		Categories:   []string{"TEST"},
	}

	for i := 0; i < 100; i++ {
		reqID, _ := schema.NewRequirementID("TEST")
		spec.Requirements[i] = schema.Requirement{
			ID:          reqID,
			Type:        schema.EARSEvent,
			Category:    "TEST",
			Description: "When event occurs, system responds",
			Rationale:   "Event handling",
			Priority:    schema.PriorityMedium,
			CreatedAt:   time.Now(),
		}
	}

	// Create snapshot once
	err := sm.CreateSnapshot(spec)
	if err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, err := sm.LoadFromSnapshot()
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkRepositoryWriteWithSnapshot(b *testing.B) {
	tempDir := b.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "WriteBench",
			Description: "Write with snapshot benchmark",
			Version:     "1.0.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	// Create 101 events to trigger snapshot
	events := make([]schema.ChangelogEvent, 101)
	for i := 0; i < 101; i++ {
		evtID, _ := schema.NewEventID()
		events[i] = &schema.CategoryAdded{
			EventID_:   evtID,
			Name:       "CAT",
			Timestamp_: time.Now(),
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Clean up between runs
		os.RemoveAll(baseDir)

		spec.Metadata.UpdatedAt = time.Now()
		err := repo.WriteSpecificationAndChangelog(spec, events)
		if err != nil {
			b.Fatal(err)
		}
	}
}
