package repository

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"xdd/pkg/schema"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

func TestSnapshotIntegration_AutomaticSnapshotCreation(t *testing.T) {
	// Create temp directory
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	// Create initial specification
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "SnapshotIntegration",
			Description: "Testing automatic snapshot creation",
			Version:     "1.0.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	// Create 101 events to trigger snapshot (threshold is 100)
	events := make([]schema.ChangelogEvent, 101)
	for i := 0; i < 101; i++ {
		reqID, _ := schema.NewRequirementID("TEST")
		evtID, _ := schema.NewEventID()

		req := schema.Requirement{
			ID:          reqID,
			Type:        schema.EARSUbiquitous,
			Category:    "TEST",
			Description: "Test requirement",
			Rationale:   "For testing",
			Priority:    schema.PriorityLow,
			CreatedAt:   time.Now(),
		}

		spec.Requirements = append(spec.Requirements, req)

		events[i] = &schema.RequirementAdded{
			EventID_:    evtID,
			Requirement: req,
			Timestamp_:  time.Now(),
		}
	}

	// Write spec and changelog (should create snapshot)
	err := repo.WriteSpecificationAndChangelog(spec, events)
	require.NoError(t, err)

	// Verify snapshot was created
	snapshotPath := filepath.Join(baseDir, "01-specs", "snapshots")
	entries, err := os.ReadDir(snapshotPath)
	require.NoError(t, err)
	assert.Len(t, entries, 1, "exactly one snapshot should be created")

	// Verify changelog was updated with snapshot metadata
	changelogPath := filepath.Join(baseDir, "01-specs", "changelog.yaml")
	data, err := os.ReadFile(changelogPath)
	require.NoError(t, err)

	var changelog map[string]interface{}
	err = yaml.Unmarshal(data, &changelog)
	require.NoError(t, err)

	assert.NotEmpty(t, changelog["last_snapshot"], "last_snapshot should be set")
	assert.Equal(t, 0, changelog["events_since_snapshot"], "events_since_snapshot should be reset to 0")
}

func TestSnapshotIntegration_LoadPerformance(t *testing.T) {
	// Create temp directory
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	// Create specification with many requirements
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "PerformanceTest",
			Description: "Testing snapshot load performance",
			Version:     "1.0.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{"TEST"},
	}

	// Add 50 requirements
	for i := 0; i < 50; i++ {
		reqID, _ := schema.NewRequirementID("TEST")
		spec.Requirements = append(spec.Requirements, schema.Requirement{
			ID:          reqID,
			Type:        schema.EARSUbiquitous,
			Category:    "TEST",
			Description: "Test requirement",
			Rationale:   "For performance testing",
			Priority:    schema.PriorityLow,
			CreatedAt:   time.Now(),
		})
	}

	// Create snapshot manually
	sm := NewSnapshotManager(baseDir)
	err := sm.CreateSnapshot(spec)
	require.NoError(t, err)

	// Also write specification normally
	err = repo.WriteSpecification(spec)
	require.NoError(t, err)

	// Measure load time with snapshot
	start := time.Now()
	loadedSpec, err := repo.ReadSpecification()
	duration := time.Since(start)

	require.NoError(t, err)
	assert.Equal(t, spec.Metadata.Name, loadedSpec.Metadata.Name)
	assert.Len(t, loadedSpec.Requirements, 50)

	// Should load quickly (< 200ms even with 50 requirements)
	assert.Less(t, duration.Milliseconds(), int64(200),
		"Loading from snapshot should be fast")
}

func TestSnapshotIntegration_SnapshotEvery100Events(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "BatchTest",
			Description: "Testing snapshot creation at 100 event intervals",
			Version:     "1.0.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	// Write 99 events (should not create snapshot)
	events1 := make([]schema.ChangelogEvent, 99)
	for i := 0; i < 99; i++ {
		evtID, _ := schema.NewEventID()
		events1[i] = &schema.CategoryAdded{
			EventID_:   evtID,
			Name:       "CAT" + string(rune(i)),
			Timestamp_: time.Now(),
		}
	}

	err := repo.WriteSpecificationAndChangelog(spec, events1)
	require.NoError(t, err)

	// Verify no snapshot created yet
	snapshotPath := filepath.Join(baseDir, "01-specs", "snapshots")
	_, err = os.Stat(snapshotPath)
	assert.True(t, os.IsNotExist(err), "snapshots directory should not exist yet")

	// Write 1 more event (should create snapshot at 100)
	events2 := []schema.ChangelogEvent{
		&schema.CategoryAdded{
			EventID_:   "EVT-final",
			Name:       "FINAL",
			Timestamp_: time.Now(),
		},
	}

	spec.Metadata.UpdatedAt = time.Now()
	err = repo.WriteSpecificationAndChangelog(spec, events2)
	require.NoError(t, err)

	// Verify snapshot was created
	entries, err := os.ReadDir(snapshotPath)
	require.NoError(t, err)
	assert.Len(t, entries, 1, "snapshot should be created at 100 events")
}
