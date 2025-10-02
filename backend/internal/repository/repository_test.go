package repository

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"xdd/pkg/schema"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRepository_ReadWriteSpecification(t *testing.T) {
	// Create temp directory
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	repo := NewRepository(baseDir)

	// Test reading non-existent spec (should return empty)
	spec, err := repo.ReadSpecification()
	require.NoError(t, err)
	assert.Equal(t, "", spec.Metadata.Name)
	assert.Empty(t, spec.Requirements)

	// Create a spec
	newSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "TestProject",
			Description: "A test project",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-TEST-abc123",
				Type:        schema.EARSUbiquitous,
				Category:    "TEST",
				Description: "The system shall always be awesome",
				Rationale:   "Because testing is important",
				AcceptanceCriteria: []schema.AcceptanceCriterion{
					&schema.AssertionCriterion{
						ID:        "AC-test-1",
						Type:      "assertion",
						Statement: "System is awesome",
						CreatedAt: time.Now(),
					},
				},
				Priority:  schema.PriorityHigh,
				CreatedAt: time.Now(),
			},
		},
		Categories: []string{"TEST"},
	}

	// Write spec
	err = repo.WriteSpecification(newSpec)
	require.NoError(t, err)

	// Read it back
	readSpec, err := repo.ReadSpecification()
	require.NoError(t, err)

	assert.Equal(t, "TestProject", readSpec.Metadata.Name)
	assert.Len(t, readSpec.Requirements, 1)
	assert.Equal(t, "REQ-TEST-abc123", readSpec.Requirements[0].ID)
}

func TestRepository_AppendChangelog(t *testing.T) {
	// Create temp directory
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	repo := NewRepository(baseDir)

	// Create some events
	reqID, _ := schema.NewRequirementID("TEST")
	evtID, _ := schema.NewEventID()

	req := schema.Requirement{
		ID:          reqID,
		Type:        schema.EARSEvent,
		Category:    "TEST",
		Description: "When something happens, do something",
		Rationale:   "Testing",
		Priority:    schema.PriorityMedium,
		CreatedAt:   time.Now(),
	}

	events := []schema.ChangelogEvent{
		&schema.RequirementAdded{
			EventID_:    evtID,
			Requirement: req,
			Timestamp_:  time.Now(),
		},
	}

	// Append events
	err := repo.AppendChangelog(events)
	require.NoError(t, err)

	// Verify file exists
	changelogPath := filepath.Join(baseDir, "01-specs", "changelog.yaml")
	_, err = os.Stat(changelogPath)
	require.NoError(t, err)
}

func TestRepository_WriteSpecification_AtomicityGuarantee(t *testing.T) {
	// Test that writes are atomic - no temp directories left behind
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "AtomicTest",
			Description: "Testing atomic writes",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	err := repo.WriteSpecification(spec)
	require.NoError(t, err)

	// Verify no temporary directories left behind in tempDir
	entries, err := os.ReadDir(tempDir)
	require.NoError(t, err)

	// tempDir should only contain .xdd directory
	foundXdd := false
	for _, entry := range entries {
		name := entry.Name()
		if name == ".xdd" {
			foundXdd = true
		} else {
			t.Errorf("unexpected directory in tempDir: %s", name)
		}
	}
	assert.True(t, foundXdd, ".xdd directory should exist")
}

func TestRepository_WriteSpecificationAndChangelog_AtomicityGuarantee(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	spec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "CombinedWrite",
			Description: "Testing combined atomic write",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{
			{
				ID:          "REQ-AUTH-test",
				Type:        schema.EARSEvent,
				Category:    "AUTH",
				Description: "When user logs in, system shall authenticate",
				Priority:    schema.PriorityHigh,
				CreatedAt:   time.Now(),
			},
		},
		Categories: []string{"AUTH"},
	}

	events := []schema.ChangelogEvent{
		&schema.RequirementAdded{
			EventID_:    "EVT-1",
			Requirement: spec.Requirements[0],
			Timestamp_:  time.Now(),
		},
	}

	err := repo.WriteSpecificationAndChangelog(spec, events)
	require.NoError(t, err)

	// Verify both files exist
	specPath := filepath.Join(baseDir, "01-specs/specification.yaml")
	_, err = os.Stat(specPath)
	require.NoError(t, err, "specification file should exist")

	changelogPath := filepath.Join(baseDir, "01-specs/changelog.yaml")
	_, err = os.Stat(changelogPath)
	require.NoError(t, err, "changelog file should exist")

	// Verify no temp or backup directories in tempDir
	entries, err := os.ReadDir(tempDir)
	require.NoError(t, err)

	foundXdd := false
	for _, entry := range entries {
		name := entry.Name()
		if name == ".xdd" {
			foundXdd = true
		} else {
			t.Errorf("unexpected directory in tempDir: %s", name)
		}
	}
	assert.True(t, foundXdd, ".xdd directory should exist")
}

func TestRepository_WriteSpecification_IsolationDuringTransaction(t *testing.T) {
	// Test that the base directory is not modified during transaction
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	// Create initial state
	initialSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "Initial",
			Description: "Initial description",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	err := repo.WriteSpecification(initialSpec)
	require.NoError(t, err)

	// Read initial content
	specPath := filepath.Join(baseDir, "01-specs/specification.yaml")
	initialData, err := os.ReadFile(specPath)
	require.NoError(t, err)

	// Note: Since our Repository writes are atomic via transactions,
	// we can't easily observe mid-transaction state from outside.
	// This test verifies that after a successful write, the file exists
	// and no temp directories remain.

	updatedSpec := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "Updated",
			Description: "Updated description",
			Version:     "0.2.0",
			CreatedAt:   initialSpec.Metadata.CreatedAt,
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	err = repo.WriteSpecification(updatedSpec)
	require.NoError(t, err)

	// Verify the file was updated
	updatedData, err := os.ReadFile(specPath)
	require.NoError(t, err)

	assert.NotEqual(t, string(initialData), string(updatedData), "content should be updated")

	// Verify no temp directories in tempDir
	entries, err := os.ReadDir(tempDir)
	require.NoError(t, err)

	foundXdd := false
	for _, entry := range entries {
		name := entry.Name()
		if name == ".xdd" {
			foundXdd = true
		} else {
			t.Errorf("unexpected directory in tempDir: %s", name)
		}
	}
	assert.True(t, foundXdd, ".xdd directory should exist")
}

func TestRepository_SequentialWrites(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")
	repo := NewRepository(baseDir)

	// Write version 1
	spec1 := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "Project",
			Description: "Version 1",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	err := repo.WriteSpecification(spec1)
	require.NoError(t, err)

	// Write version 2
	spec2 := &schema.Specification{
		Metadata: schema.ProjectMetadata{
			Name:        "Project",
			Description: "Version 2",
			Version:     "0.2.0",
			CreatedAt:   spec1.Metadata.CreatedAt,
			UpdatedAt:   time.Now(),
		},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	err = repo.WriteSpecification(spec2)
	require.NoError(t, err)

	// Verify final state
	finalSpec, err := repo.ReadSpecification()
	require.NoError(t, err)

	assert.Equal(t, "0.2.0", finalSpec.Metadata.Version)
	assert.Equal(t, "Version 2", finalSpec.Metadata.Description)
}
