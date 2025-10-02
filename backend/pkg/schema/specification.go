package schema

// Specification represents the root document containing all requirements.
type Specification struct {
	Metadata     ProjectMetadata `json:"metadata" yaml:"metadata"`
	Requirements []Requirement   `json:"requirements" yaml:"requirements"`
	Categories   []string        `json:"categories" yaml:"categories"`
}
