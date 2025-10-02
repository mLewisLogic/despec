package schema

import "time"

// ChangelogEvent is the interface for all changelog event types.
type ChangelogEvent interface {
	EventType() string
	EventID() string
	Timestamp() time.Time
}

// RequirementAdded represents a requirement addition event.
type RequirementAdded struct {
	EventID_    string      `json:"event_id" yaml:"event_id"`
	Requirement Requirement `json:"requirement" yaml:"requirement"`
	Timestamp_  time.Time   `json:"timestamp" yaml:"timestamp"`
}

func (e *RequirementAdded) EventType() string    { return "RequirementAdded" }
func (e *RequirementAdded) EventID() string      { return e.EventID_ }
func (e *RequirementAdded) Timestamp() time.Time { return e.Timestamp_ }

// RequirementDeleted represents a requirement deletion event.
type RequirementDeleted struct {
	EventID_      string      `json:"event_id" yaml:"event_id"`
	RequirementID string      `json:"requirement_id" yaml:"requirement_id"`
	Requirement   Requirement `json:"requirement" yaml:"requirement"` // Snapshot
	Timestamp_    time.Time   `json:"timestamp" yaml:"timestamp"`
}

func (e *RequirementDeleted) EventType() string    { return "RequirementDeleted" }
func (e *RequirementDeleted) EventID() string      { return e.EventID_ }
func (e *RequirementDeleted) Timestamp() time.Time { return e.Timestamp_ }

// AcceptanceCriterionAdded represents an acceptance criterion addition event.
type AcceptanceCriterionAdded struct {
	EventID_      string              `json:"event_id" yaml:"event_id"`
	RequirementID string              `json:"requirement_id" yaml:"requirement_id"`
	Criterion     AcceptanceCriterion `json:"criterion" yaml:"criterion"`
	Timestamp_    time.Time           `json:"timestamp" yaml:"timestamp"`
}

func (e *AcceptanceCriterionAdded) EventType() string    { return "AcceptanceCriterionAdded" }
func (e *AcceptanceCriterionAdded) EventID() string      { return e.EventID_ }
func (e *AcceptanceCriterionAdded) Timestamp() time.Time { return e.Timestamp_ }

// AcceptanceCriterionDeleted represents an acceptance criterion deletion event.
type AcceptanceCriterionDeleted struct {
	EventID_      string              `json:"event_id" yaml:"event_id"`
	RequirementID string              `json:"requirement_id" yaml:"requirement_id"`
	CriterionID   string              `json:"criterion_id" yaml:"criterion_id"`
	Criterion     AcceptanceCriterion `json:"criterion" yaml:"criterion"` // Snapshot
	Timestamp_    time.Time           `json:"timestamp" yaml:"timestamp"`
}

func (e *AcceptanceCriterionDeleted) EventType() string    { return "AcceptanceCriterionDeleted" }
func (e *AcceptanceCriterionDeleted) EventID() string      { return e.EventID_ }
func (e *AcceptanceCriterionDeleted) Timestamp() time.Time { return e.Timestamp_ }

// CategoryAdded represents a category addition event.
type CategoryAdded struct {
	EventID_   string    `json:"event_id" yaml:"event_id"`
	Name       string    `json:"name" yaml:"name"`
	Timestamp_ time.Time `json:"timestamp" yaml:"timestamp"`
}

func (e *CategoryAdded) EventType() string    { return "CategoryAdded" }
func (e *CategoryAdded) EventID() string      { return e.EventID_ }
func (e *CategoryAdded) Timestamp() time.Time { return e.Timestamp_ }

// CategoryDeleted represents a category deletion event.
type CategoryDeleted struct {
	EventID_   string    `json:"event_id" yaml:"event_id"`
	Name       string    `json:"name" yaml:"name"`
	Timestamp_ time.Time `json:"timestamp" yaml:"timestamp"`
}

func (e *CategoryDeleted) EventType() string    { return "CategoryDeleted" }
func (e *CategoryDeleted) EventID() string      { return e.EventID_ }
func (e *CategoryDeleted) Timestamp() time.Time { return e.Timestamp_ }

// CategoryRenamed represents a category rename event.
type CategoryRenamed struct {
	EventID_   string    `json:"event_id" yaml:"event_id"`
	OldName    string    `json:"old_name" yaml:"old_name"`
	NewName    string    `json:"new_name" yaml:"new_name"`
	Timestamp_ time.Time `json:"timestamp" yaml:"timestamp"`
}

func (e *CategoryRenamed) EventType() string    { return "CategoryRenamed" }
func (e *CategoryRenamed) EventID() string      { return e.EventID_ }
func (e *CategoryRenamed) Timestamp() time.Time { return e.Timestamp_ }

// ProjectMetadataUpdated represents a metadata update event.
type ProjectMetadataUpdated struct {
	EventID_    string          `json:"event_id" yaml:"event_id"`
	OldMetadata ProjectMetadata `json:"old_metadata" yaml:"old_metadata"`
	NewMetadata ProjectMetadata `json:"new_metadata" yaml:"new_metadata"`
	Timestamp_  time.Time       `json:"timestamp" yaml:"timestamp"`
}

func (e *ProjectMetadataUpdated) EventType() string    { return "ProjectMetadataUpdated" }
func (e *ProjectMetadataUpdated) EventID() string      { return e.EventID_ }
func (e *ProjectMetadataUpdated) Timestamp() time.Time { return e.Timestamp_ }

// VersionBumped represents a version bump event.
type VersionBumped struct {
	EventID_   string    `json:"event_id" yaml:"event_id"`
	OldVersion string    `json:"old_version" yaml:"old_version"`
	NewVersion string    `json:"new_version" yaml:"new_version"`
	BumpType   string    `json:"bump_type" yaml:"bump_type"` // "major"|"minor"|"patch"
	Reasoning  string    `json:"reasoning" yaml:"reasoning"`
	Timestamp_ time.Time `json:"timestamp" yaml:"timestamp"`
}

func (e *VersionBumped) EventType() string    { return "VersionBumped" }
func (e *VersionBumped) EventID() string      { return e.EventID_ }
func (e *VersionBumped) Timestamp() time.Time { return e.Timestamp_ }

// Changelog represents the event log document.
type Changelog struct {
	Version             string           `json:"version" yaml:"version"`
	Events              []ChangelogEvent `json:"events" yaml:"events"`
	LastSnapshot        string           `json:"last_snapshot" yaml:"last_snapshot"`
	EventsSinceSnapshot int              `json:"events_since_snapshot" yaml:"events_since_snapshot"`
}
