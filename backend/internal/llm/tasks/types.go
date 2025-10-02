package tasks

import (
	"xdd/pkg/schema"
)

// Metadata Task Types

// MetadataInput is the input for metadata generation/update task.
type MetadataInput struct {
	Existing      *schema.ProjectMetadata `json:"existing,omitempty"`
	UpdateRequest string                  `json:"update_request"`
	IsNewProject  bool                    `json:"is_new_project"`
}

// MetadataOutput is the output from metadata task.
type MetadataOutput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Changed     struct {
		Name        bool `json:"name"`
		Description bool `json:"description"`
	} `json:"changed"`
	Reasoning string `json:"reasoning"`
}

// Requirements Delta Task Types

// RequirementsDeltaInput is the input for requirements delta analysis.
type RequirementsDeltaInput struct {
	ExistingRequirements []schema.Requirement `json:"existing_requirements"`
	ExistingCategories   []string             `json:"existing_categories"`
	UpdateRequest        string               `json:"update_request"`
}

// RequirementsDeltaOutput is the output from requirements delta task.
type RequirementsDeltaOutput struct {
	ToRemove []struct {
		ID        string `json:"id"`
		Reasoning string `json:"reasoning"`
	} `json:"to_remove"`

	ToAdd []struct {
		Category          string `json:"category"`
		BriefDescription  string `json:"brief_description"`
		EARSType          string `json:"ears_type"`
		EstimatedPriority string `json:"estimated_priority"`
		Reasoning         string `json:"reasoning"`
	} `json:"to_add"`

	AmbiguousModifications []struct {
		PossibleTargets []string `json:"possible_targets"`
		Clarification   string   `json:"clarification"`
	} `json:"ambiguous_modifications,omitempty"`
}

// Categorization Task Types

// CategorizationInput is the input for categorization task.
type CategorizationInput struct {
	ProjectName          string   `json:"project_name"`
	ProjectDescription   string   `json:"project_description"`
	AllRequirementBriefs []string `json:"all_requirement_briefs"`
}

// CategorizationOutput is the output from categorization task.
type CategorizationOutput struct {
	Categories []struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Count       int    `json:"count"`
	} `json:"categories"`
	RequirementMapping map[string]string `json:"requirement_mapping"`
	Reasoning          string            `json:"reasoning"`
}

// Requirement Generation Task Types

// RequirementGenInput is the input for requirement generation task.
type RequirementGenInput struct {
	Category          string                `json:"category"`
	EARSType          string                `json:"ears_type"`
	BriefDescription  string                `json:"brief_description"`
	EstimatedPriority string                `json:"estimated_priority"`
	Context           RequirementGenContext `json:"context"`
}

// RequirementGenContext provides context for requirement generation.
type RequirementGenContext struct {
	ProjectName          string               `json:"project_name"`
	ProjectDescription   string               `json:"project_description"`
	ExistingRequirements []schema.Requirement `json:"existing_requirements"`
	UpdateRequest        string               `json:"update_request"`
}

// RequirementGenOutput is the output from requirement generation task.
type RequirementGenOutput struct {
	Description        string                    `json:"description"`
	Rationale          string                    `json:"rationale"`
	AcceptanceCriteria []AcceptanceCriterionJSON `json:"acceptance_criteria"`
	Priority           string                    `json:"priority"`
}

// AcceptanceCriterionJSON represents an acceptance criterion in JSON format
// This intermediate type handles polymorphic deserialization from LLM.
type AcceptanceCriterionJSON struct {
	Type      string `json:"type"` // "behavioral" or "assertion"
	Given     string `json:"given,omitempty"`
	When      string `json:"when,omitempty"`
	Then      string `json:"then,omitempty"`
	Statement string `json:"statement,omitempty"`
}

// Version Bump Task Types

// VersionBumpInput is the input for version bump decision task.
type VersionBumpInput struct {
	CurrentVersion     string         `json:"current_version"`
	Changes            VersionChanges `json:"changes"`
	ChangeDescriptions []string       `json:"change_descriptions"`
}

// VersionChanges describes what changed in the specification.
type VersionChanges struct {
	RequirementsAdded   int  `json:"requirements_added"`
	RequirementsRemoved int  `json:"requirements_removed"`
	MetadataChanged     bool `json:"metadata_changed"`
}

// VersionBumpOutput is the output from version bump task.
type VersionBumpOutput struct {
	NewVersion string `json:"new_version"`
	BumpType   string `json:"bump_type"` // "major"|"minor"|"patch"
	Reasoning  string `json:"reasoning"`
}
