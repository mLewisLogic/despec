package schema

import (
	"time"

	"gopkg.in/yaml.v3"
)

// Requirement represents a single requirement in the specification.
type Requirement struct {
	ID                 string                `json:"id" yaml:"id"`
	Type               EARSType              `json:"type" yaml:"type" jsonschema:"enum=ubiquitous,enum=event,enum=state,enum=optional"`
	Category           string                `json:"category" yaml:"category" jsonschema:"minLength=1,maxLength=20"`
	Description        string                `json:"description" yaml:"description" jsonschema:"minLength=10,maxLength=500"`
	Rationale          string                `json:"rationale" yaml:"rationale" jsonschema:"minLength=10,maxLength=500"`
	AcceptanceCriteria []AcceptanceCriterion `json:"acceptance_criteria" yaml:"acceptance_criteria" jsonschema:"minItems=1,maxItems=10"`
	Priority           Priority              `json:"priority" yaml:"priority" jsonschema:"enum=critical,enum=high,enum=medium,enum=low"`
	CreatedAt          time.Time             `json:"created_at" yaml:"created_at"`
}

// UnmarshalYAML implements custom YAML unmarshaling for Requirement.
func (r *Requirement) UnmarshalYAML(node *yaml.Node) error {
	// Create a temporary struct with the same fields but AcceptanceCriteria as yaml.Node
	type requirementAlias struct {
		ID                 string      `yaml:"id"`
		Type               EARSType    `yaml:"type"`
		Category           string      `yaml:"category"`
		Description        string      `yaml:"description"`
		Rationale          string      `yaml:"rationale"`
		AcceptanceCriteria []yaml.Node `yaml:"acceptance_criteria"`
		Priority           Priority    `yaml:"priority"`
		CreatedAt          time.Time   `yaml:"created_at"`
	}

	var temp requirementAlias
	if err := node.Decode(&temp); err != nil {
		return err
	}

	// Copy simple fields
	r.ID = temp.ID
	r.Type = temp.Type
	r.Category = temp.Category
	r.Description = temp.Description
	r.Rationale = temp.Rationale
	r.Priority = temp.Priority
	r.CreatedAt = temp.CreatedAt

	// Convert acceptance criteria nodes to typed objects
	r.AcceptanceCriteria = make([]AcceptanceCriterion, 0, len(temp.AcceptanceCriteria))
	for _, acNode := range temp.AcceptanceCriteria {
		// First get the type to determine which struct to unmarshal into
		var typeOnly struct {
			Type string `yaml:"type"`
		}
		if err := acNode.Decode(&typeOnly); err != nil {
			continue
		}

		switch typeOnly.Type {
		case "behavioral":
			var bc BehavioralCriterion
			if err := acNode.Decode(&bc); err == nil {
				r.AcceptanceCriteria = append(r.AcceptanceCriteria, &bc)
			}

		case "assertion":
			var ac AssertionCriterion
			if err := acNode.Decode(&ac); err == nil {
				r.AcceptanceCriteria = append(r.AcceptanceCriteria, &ac)
			}
		}
	}

	return nil
}
