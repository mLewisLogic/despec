package schema

import "time"

// AcceptanceCriterion is the interface for all acceptance criteria types.
type AcceptanceCriterion interface {
	GetID() string
	GetType() string
	GetCreatedAt() time.Time
}

// BehavioralCriterion represents a Given/When/Then acceptance criterion.
type BehavioralCriterion struct {
	ID        string    `json:"id" yaml:"id"`
	Type      string    `json:"type" yaml:"type"` // "behavioral"
	Given     string    `json:"given" yaml:"given" jsonschema:"maxLength=200"`
	When      string    `json:"when" yaml:"when" jsonschema:"maxLength=200"`
	Then      string    `json:"then" yaml:"then" jsonschema:"maxLength=200"`
	CreatedAt time.Time `json:"created_at" yaml:"created_at"`
}

// Implement AcceptanceCriterion interface.
func (b *BehavioralCriterion) GetID() string           { return b.ID }
func (b *BehavioralCriterion) GetType() string         { return b.Type }
func (b *BehavioralCriterion) GetCreatedAt() time.Time { return b.CreatedAt }

// AssertionCriterion represents a single testable assertion.
type AssertionCriterion struct {
	ID        string    `json:"id" yaml:"id"`
	Type      string    `json:"type" yaml:"type"` // "assertion"
	Statement string    `json:"statement" yaml:"statement" jsonschema:"maxLength=200"`
	CreatedAt time.Time `json:"created_at" yaml:"created_at"`
}

// Implement AcceptanceCriterion interface.
func (a *AssertionCriterion) GetID() string           { return a.ID }
func (a *AssertionCriterion) GetType() string         { return a.Type }
func (a *AssertionCriterion) GetCreatedAt() time.Time { return a.CreatedAt }
