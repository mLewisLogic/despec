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

func TestSnapshotManager_CreateSnapshot(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create specs directory
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Create a specification
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "SnapshotTest",
			Description: "Testing snapshots",
			Version:     "0.5.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-TEST-abc123",
				Type:        schema.EARSUbiquitous,
				Category:    "TEST",
				Description: "The system shall always create snapshots",
				Rationale:   "Performance optimization",
				Priority:    schema.PriorityHigh,
				CreatedAt:   time.Now(),
			},
		},
		Categories: []string{"TEST"},
	}

	// Create snapshot
	err = sm.CreateSnapshot(spec)
	require.NoError(t, err)

	// Verify snapshot file exists
	snapshotPath := filepath.Join(specsDir, snapshotDir)
	entries, err := os.ReadDir(snapshotPath)
	require.NoError(t, err)
	assert.Len(t, entries, 1)

	// Verify snapshot content
	snapshotFile := filepath.Join(snapshotPath, entries[0].Name())
	data, err := os.ReadFile(snapshotFile)
	require.NoError(t, err)

	var loadedSpec schema.Specification
	err = yaml.Unmarshal(data, &loadedSpec)
	require.NoError(t, err)

	assert.Equal(t, "SnapshotTest", loadedSpec.Metadata.Name)
	assert.Len(t, loadedSpec.Requirements, 1)
	assert.Equal(t, "REQ-TEST-abc123", loadedSpec.Requirements[0].ID)
}

func TestSnapshotManager_LoadFromSnapshot_NoSnapshot(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create specs directory but no snapshots
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Should return nil when no snapshots exist
	spec, events, err := sm.LoadFromSnapshot()
	require.NoError(t, err)
	assert.Nil(t, spec)
	assert.Nil(t, events)
}

func TestSnapshotManager_LoadFromSnapshot_WithSnapshot(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create specs directory
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Create a specification
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "LoadTest",
			Description: "Testing snapshot loading",
			Version:     "0.3.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-LOAD-xyz789",
				Type:        schema.EARSEvent,
				Category:    "LOAD",
				Description: "When snapshot loads, the system shall restore state",
				Rationale:   "Event sourcing",
				Priority:    schema.PriorityMedium,
				CreatedAt:   time.Now(),
			},
		},
		Categories: []string{"LOAD"},
	}

	// Create snapshot
	err = sm.CreateSnapshot(spec)
	require.NoError(t, err)

	// Load from snapshot
	loadedSpec, events, err := sm.LoadFromSnapshot()
	require.NoError(t, err)
	require.NotNil(t, loadedSpec)

	assert.Equal(t, "LoadTest", loadedSpec.Metadata.Name)
	assert.Len(t, loadedSpec.Requirements, 1)
	assert.Equal(t, "REQ-LOAD-xyz789", loadedSpec.Requirements[0].ID)
	assert.Nil(t, events) // No changelog yet
}

func TestSnapshotManager_LoadFromSnapshot_WithEventsAfter(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create specs directory
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Create initial specification
	now := time.Now()
	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "EventTest",
			Description: "Testing events after snapshot",
			Version:     "0.2.0",
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-OLD-aaa111",
				Type:        schema.EARSUbiquitous,
				Category:    "OLD",
				Description: "The system shall maintain old state",
				Rationale:   "Pre-snapshot requirement",
				Priority:    schema.PriorityLow,
				CreatedAt:   now,
			},
		},
		Categories: []string{"OLD"},
	}

	// Create snapshot
	err = sm.CreateSnapshot(spec)
	require.NoError(t, err)

	// Wait a moment to ensure timestamp difference
	time.Sleep(10 * time.Millisecond)

	// Create changelog with events after snapshot
	afterSnapshot := time.Now()
	changelog := map[string]interface{}{
		"version":               "0.3.0",
		"last_snapshot":         "",
		"events_since_snapshot": 2,
		"events": []map[string]interface{}{
			{
				"event_type": "RequirementAdded",
				"event_id":   "EVT-test123",
				"timestamp":  afterSnapshot,
				"requirement": map[string]interface{}{
					"id":          "REQ-NEW-bbb222",
					"type":        "event",
					"category":    "NEW",
					"description": "When event occurs, do something",
					"rationale":   "Post-snapshot requirement",
					"priority":    "high",
					"created_at":  afterSnapshot,
				},
			},
			{
				"event_type": "CategoryAdded",
				"event_id":   "EVT-test456",
				"timestamp":  afterSnapshot,
				"name":       "NEW",
			},
		},
	}

	changelogData, err := yaml.Marshal(changelog)
	require.NoError(t, err)

	changelogPath := filepath.Join(specsDir, "changelog.yaml")
	err = os.WriteFile(changelogPath, changelogData, 0644)
	require.NoError(t, err)

	// Load from snapshot
	loadedSpec, events, err := sm.LoadFromSnapshot()
	require.NoError(t, err)
	require.NotNil(t, loadedSpec)

	// Should load spec from snapshot
	assert.Equal(t, "EventTest", loadedSpec.Metadata.Name)
	assert.Len(t, loadedSpec.Requirements, 1)
	assert.Equal(t, "REQ-OLD-aaa111", loadedSpec.Requirements[0].ID)

	// Should return events that occurred after snapshot
	require.NotNil(t, events)
	assert.Len(t, events, 2)
}

func TestSnapshotManager_FindMostRecentSnapshot(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create snapshots directory
	snapshotPath := filepath.Join(tempDir, "01-specs", snapshotDir)
	err = os.MkdirAll(snapshotPath, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Create multiple snapshot files with different timestamps
	snapshots := []string{
		"2025-10-01T10-00-00.yaml",
		"2025-10-01T12-00-00.yaml",
		"2025-10-01T14-00-00.yaml",
	}

	for _, filename := range snapshots {
		path := filepath.Join(snapshotPath, filename)
		err = os.WriteFile(path, []byte("test: data"), 0644)
		require.NoError(t, err)
	}

	// Should find the most recent snapshot
	recentFile, recentTime, err := sm.findMostRecentSnapshot(snapshotPath)
	require.NoError(t, err)

	assert.Contains(t, recentFile, "2025-10-01T14-00-00.yaml")
	expectedTime, _ := time.Parse("2006-01-02T15-04-05", "2025-10-01T14-00-00")
	assert.Equal(t, expectedTime, recentTime)
}

func TestSnapshotManager_UpdateChangelog(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create specs directory
	specsDir := filepath.Join(tempDir, "01-specs")
	err = os.MkdirAll(specsDir, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Create initial changelog
	changelog := map[string]interface{}{
		"version":               "0.4.0",
		"last_snapshot":         "",
		"events_since_snapshot": 150,
		"events":                []map[string]interface{}{},
	}

	changelogData, err := yaml.Marshal(changelog)
	require.NoError(t, err)

	changelogPath := filepath.Join(specsDir, "changelog.yaml")
	err = os.WriteFile(changelogPath, changelogData, 0644)
	require.NoError(t, err)

	// Update changelog with snapshot metadata
	snapshotTime := "2025-10-02T14-30-00"
	err = sm.UpdateChangelog(snapshotTime)
	require.NoError(t, err)

	// Verify update
	updatedData, err := os.ReadFile(changelogPath)
	require.NoError(t, err)

	var updatedChangelog map[string]interface{}
	err = yaml.Unmarshal(updatedData, &updatedChangelog)
	require.NoError(t, err)

	assert.Equal(t, snapshotTime, updatedChangelog["last_snapshot"])
	assert.Equal(t, 0, updatedChangelog["events_since_snapshot"])
}

func TestSnapshotManager_ShouldCreateSnapshot(t *testing.T) {
	sm := NewSnapshotManager("/tmp/test")

	tests := []struct {
		name                string
		eventsSinceSnapshot int
		expected            bool
	}{
		{"No events", 0, false},
		{"Under threshold", 99, false},
		{"At threshold", 100, true},
		{"Over threshold", 150, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sm.ShouldCreateSnapshot(tt.eventsSinceSnapshot)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestSnapshotManager_CorruptedSnapshotFallback(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-snapshot-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create snapshots directory
	snapshotPath := filepath.Join(tempDir, "01-specs", snapshotDir)
	err = os.MkdirAll(snapshotPath, 0755)
	require.NoError(t, err)

	sm := NewSnapshotManager(tempDir)

	// Create corrupted snapshot file
	corruptedFile := filepath.Join(snapshotPath, "2025-10-02T10-00-00.yaml")
	err = os.WriteFile(corruptedFile, []byte("invalid: yaml: content: [[["), 0644)
	require.NoError(t, err)

	// Should return nil to signal full replay
	spec, events, err := sm.LoadFromSnapshot()
	require.NoError(t, err)
	assert.Nil(t, spec)
	assert.Nil(t, events)
}
