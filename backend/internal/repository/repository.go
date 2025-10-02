package repository

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"xdd/pkg/schema"

	"gopkg.in/yaml.v3"
)

// Repository handles file I/O for .xdd/ directory.
type Repository struct {
	baseDir         string
	snapshotManager *SnapshotManager
}

// NewRepository creates a new repository.
func NewRepository(baseDir string) *Repository {
	return &Repository{
		baseDir:         baseDir,
		snapshotManager: NewSnapshotManager(baseDir),
	}
}

// ReadSpecification reads the current specification from YAML
// Uses snapshots for performance - loads most recent snapshot and replays events since.
func (r *Repository) ReadSpecification() (*schema.Specification, error) {
	// Try loading from snapshot first
	spec, eventsAfterSnapshot, err := r.snapshotManager.LoadFromSnapshot()
	if err != nil {
		return nil, fmt.Errorf("load from snapshot: %w", err)
	}

	// If we have a snapshot, replay events that occurred after it
	if spec != nil {
		if len(eventsAfterSnapshot) > 0 {
			replayedSpec, err := ReplayEventsFromMaps(spec, eventsAfterSnapshot)
			if err != nil {
				return nil, fmt.Errorf("replay events after snapshot: %w", err)
			}
			return replayedSpec, nil
		}
		return spec, nil
	}

	// No snapshot - check if changelog exists for event replay
	changelogPath := filepath.Join(r.baseDir, "01-specs", "changelog.yaml")
	changelogData, err := os.ReadFile(changelogPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No changelog - try to read specification.yaml directly (migration case)
			specPath := filepath.Join(r.baseDir, "01-specs", "specification.yaml")
			specData, specErr := os.ReadFile(specPath)
			if specErr != nil {
				if os.IsNotExist(specErr) {
					// Neither changelog nor spec exists - return empty spec
					return &schema.Specification{
						Metadata:     schema.ProjectMetadata{},
						Requirements: []schema.Requirement{},
						Categories:   []string{},
					}, nil
				}
				return nil, fmt.Errorf("read specification: %w", specErr)
			}

			// Parse specification directly
			var specFromFile schema.Specification
			if err := yaml.Unmarshal(specData, &specFromFile); err != nil {
				return nil, fmt.Errorf("parse specification: %w", err)
			}

			return &specFromFile, nil
		}
		return nil, fmt.Errorf("read changelog: %w", err)
	}

	var changelog struct {
		Events []map[string]interface{} `yaml:"events"`
	}

	if err := yaml.Unmarshal(changelogData, &changelog); err != nil {
		return nil, fmt.Errorf("parse changelog: %w", err)
	}

	// Start with empty spec and replay all events
	emptySpec := &schema.Specification{
		Metadata:     schema.ProjectMetadata{},
		Requirements: []schema.Requirement{},
		Categories:   []string{},
	}

	// Replay all events from the beginning
	replayedSpec, err := ReplayEventsFromMaps(emptySpec, changelog.Events)
	if err != nil {
		return nil, fmt.Errorf("replay all events: %w", err)
	}

	return replayedSpec, nil
}

// WriteSpecification writes the specification to YAML using atomic transaction.
func (r *Repository) WriteSpecification(spec *schema.Specification) error {
	data, err := yaml.Marshal(spec)
	if err != nil {
		return fmt.Errorf("marshal specification: %w", err)
	}

	// Use atomic transaction
	tx := NewCopyOnWriteTx(r.baseDir)
	if err := tx.Begin(); err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	if err := tx.WriteFile("01-specs/specification.yaml", data); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("write specification: %w", err)
	}

	if err := tx.Commit(); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

// AppendChangelog appends events to the changelog using atomic transaction.
func (r *Repository) AppendChangelog(events []schema.ChangelogEvent) error {
	// Start transaction
	tx := NewCopyOnWriteTx(r.baseDir)
	if err := tx.Begin(); err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	// Read existing changelog from transaction
	var changelog struct {
		Version             string                   `yaml:"version"`
		Events              []map[string]interface{} `yaml:"events"`
		LastSnapshot        string                   `yaml:"last_snapshot"`
		EventsSinceSnapshot int                      `yaml:"events_since_snapshot"`
	}

	data, err := tx.ReadFile("01-specs/changelog.yaml")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("read changelog: %w", err)
	}

	if len(data) > 0 {
		if err := yaml.Unmarshal(data, &changelog); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("parse changelog: %w", err)
		}
	}

	// Convert events to maps for YAML serialization
	for _, event := range events {
		eventMap := make(map[string]interface{})
		eventMap["event_type"] = event.EventType()
		eventMap["event_id"] = event.EventID()
		eventMap["timestamp"] = event.Timestamp()

		// Add type-specific fields
		switch e := event.(type) {
		case *schema.RequirementAdded:
			eventMap["requirement"] = e.Requirement
		case *schema.RequirementDeleted:
			eventMap["requirement_id"] = e.RequirementID
			eventMap["requirement"] = e.Requirement
		case *schema.AcceptanceCriterionAdded:
			eventMap["requirement_id"] = e.RequirementID
			eventMap["criterion"] = e.Criterion
		case *schema.AcceptanceCriterionDeleted:
			eventMap["requirement_id"] = e.RequirementID
			eventMap["criterion_id"] = e.CriterionID
			eventMap["criterion"] = e.Criterion
		case *schema.ProjectMetadataUpdated:
			eventMap["old_metadata"] = e.OldMetadata
			eventMap["new_metadata"] = e.NewMetadata
		case *schema.VersionBumped:
			eventMap["old_version"] = e.OldVersion
			eventMap["new_version"] = e.NewVersion
			eventMap["bump_type"] = e.BumpType
			eventMap["reasoning"] = e.Reasoning
		case *schema.CategoryAdded:
			eventMap["name"] = e.Name
		case *schema.CategoryDeleted:
			eventMap["name"] = e.Name
		case *schema.CategoryRenamed:
			eventMap["old_name"] = e.OldName
			eventMap["new_name"] = e.NewName
		}

		changelog.Events = append(changelog.Events, eventMap)
		changelog.EventsSinceSnapshot++
	}

	// Write changelog
	data, err = yaml.Marshal(changelog)
	if err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("marshal changelog: %w", err)
	}

	if err := tx.WriteFile("01-specs/changelog.yaml", data); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("write changelog: %w", err)
	}

	if err := tx.Commit(); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

// WriteSpecificationAndChangelog writes both specification and changelog atomically.
func (r *Repository) WriteSpecificationAndChangelog(spec *schema.Specification, events []schema.ChangelogEvent) error {
	// Start transaction
	tx := NewCopyOnWriteTx(r.baseDir)
	if err := tx.Begin(); err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	// Marshal specification
	specData, err := yaml.Marshal(spec)
	if err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("marshal specification: %w", err)
	}

	// Write specification
	if err := tx.WriteFile("01-specs/specification.yaml", specData); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("write specification: %w", err)
	}

	// Read existing changelog
	var changelog struct {
		Version             string                   `yaml:"version"`
		Events              []map[string]interface{} `yaml:"events"`
		LastSnapshot        string                   `yaml:"last_snapshot"`
		EventsSinceSnapshot int                      `yaml:"events_since_snapshot"`
	}

	changelogData, err := tx.ReadFile("01-specs/changelog.yaml")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("read changelog: %w", err)
	}

	if len(changelogData) > 0 {
		if err := yaml.Unmarshal(changelogData, &changelog); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("parse changelog: %w", err)
		}
	}

	// Append events
	for _, event := range events {
		eventMap := make(map[string]interface{})
		eventMap["event_type"] = event.EventType()
		eventMap["event_id"] = event.EventID()
		eventMap["timestamp"] = event.Timestamp()

		// Add type-specific fields
		switch e := event.(type) {
		case *schema.RequirementAdded:
			eventMap["requirement"] = e.Requirement
		case *schema.RequirementDeleted:
			eventMap["requirement_id"] = e.RequirementID
			eventMap["requirement"] = e.Requirement
		case *schema.AcceptanceCriterionAdded:
			eventMap["requirement_id"] = e.RequirementID
			eventMap["criterion"] = e.Criterion
		case *schema.AcceptanceCriterionDeleted:
			eventMap["requirement_id"] = e.RequirementID
			eventMap["criterion_id"] = e.CriterionID
			eventMap["criterion"] = e.Criterion
		case *schema.ProjectMetadataUpdated:
			eventMap["old_metadata"] = e.OldMetadata
			eventMap["new_metadata"] = e.NewMetadata
		case *schema.VersionBumped:
			eventMap["old_version"] = e.OldVersion
			eventMap["new_version"] = e.NewVersion
			eventMap["bump_type"] = e.BumpType
			eventMap["reasoning"] = e.Reasoning
		case *schema.CategoryAdded:
			eventMap["name"] = e.Name
		case *schema.CategoryDeleted:
			eventMap["name"] = e.Name
		case *schema.CategoryRenamed:
			eventMap["old_name"] = e.OldName
			eventMap["new_name"] = e.NewName
		}

		changelog.Events = append(changelog.Events, eventMap)
		changelog.EventsSinceSnapshot++
	}

	// Update version in changelog
	changelog.Version = spec.Metadata.Version

	// Write changelog
	changelogData, err = yaml.Marshal(changelog)
	if err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("marshal changelog: %w", err)
	}

	if err := tx.WriteFile("01-specs/changelog.yaml", changelogData); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("write changelog: %w", err)
	}

	// Check if we should create a snapshot
	if r.snapshotManager.ShouldCreateSnapshot(changelog.EventsSinceSnapshot) {
		// Create snapshot in temp directory before commit
		snapshotPath := filepath.Join(tx.TempDir(), "01-specs", "snapshots")
		if err := os.MkdirAll(snapshotPath, 0755); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("create snapshots directory: %w", err)
		}

		// Generate snapshot timestamp
		timestamp := spec.Metadata.UpdatedAt.UTC().Format("2006-01-02T15-04-05")
		snapshotFile := filepath.Join("01-specs", "snapshots", fmt.Sprintf("%s.yaml", timestamp))

		// Marshal spec for snapshot
		snapshotData, err := yaml.Marshal(spec)
		if err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("marshal snapshot: %w", err)
		}

		// Write snapshot to transaction
		if err := tx.WriteFile(snapshotFile, snapshotData); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("write snapshot: %w", err)
		}

		// Update changelog metadata for snapshot
		changelog.LastSnapshot = timestamp
		changelog.EventsSinceSnapshot = 0

		// Re-marshal changelog with updated snapshot info
		changelogData, err = yaml.Marshal(changelog)
		if err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("marshal changelog with snapshot: %w", err)
		}

		if err := tx.WriteFile("01-specs/changelog.yaml", changelogData); err != nil {
			if rbErr := tx.Rollback(); rbErr != nil {
				log.Printf("rollback failed: %v", rbErr)
			}
			return fmt.Errorf("write changelog with snapshot: %w", err)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}
