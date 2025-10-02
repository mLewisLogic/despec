package schema

import "time"

// ProjectMetadata represents the project-level metadata.
type ProjectMetadata struct {
	Name        string    `json:"name" yaml:"name" jsonschema:"minLength=1,maxLength=100"`
	Description string    `json:"description" yaml:"description" jsonschema:"minLength=10,maxLength=1000"`
	Version     string    `json:"version" yaml:"version" jsonschema:"pattern=^[0-9]+\\.[0-9]+\\.[0-9]+$"`
	CreatedAt   time.Time `json:"created_at" yaml:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" yaml:"updated_at"`
}
