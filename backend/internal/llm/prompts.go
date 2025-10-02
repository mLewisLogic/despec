package llm

import (
	"fmt"
	"strings"

	"xdd/pkg/schema"
)

// EARS (Easy Approach to Requirements Syntax) decision tree
// Used in prompts to guide LLM in proper requirement classification.
const EARSDecisionTree = `
EARS Classification Decision Tree:

Does the requirement describe continuous behavior?
├─ YES → UBIQUITOUS
│         Pattern: "The system shall always/continuously [behavior]"
│         Example: "The system shall always encrypt data at rest"
│
└─ NO → Is it triggered by specific events?
    ├─ YES → EVENT-DRIVEN
    │         Pattern: "When [trigger], the system shall [action]"
    │         Example: "When user submits login, the system shall validate credentials"
    │
    └─ NO → Is it active during specific states?
        ├─ YES → STATE-DRIVEN
        │         Pattern: "While [condition], the system shall [behavior]"
        │         Example: "While user is authenticated, the system shall display profile menu"
        │
        └─ NO → OPTIONAL
                  Pattern: "Where [condition], the system shall [behavior]"
                  Example: "Where OAuth is unavailable, the system shall offer email login"
`

// BuildMetadataPrompt creates a prompt for metadata generation/update.
func BuildMetadataPrompt(existing *schema.ProjectMetadata, updateRequest string) string {
	if existing == nil {
		return fmt.Sprintf(`Generate project metadata for this request: "%s"

REQUIREMENTS:
- Name: 2-3 words in PascalCase (e.g., "TaskMaster", "UserAuth")
- Description: 1-2 sentences describing the project clearly

Return ONLY valid JSON with this exact structure:
{
  "name": "string",
  "description": "string",
  "changed": {
    "name": true,
    "description": true
  },
  "reasoning": "brief explanation of naming choice"
}`, updateRequest)
	}

	return fmt.Sprintf(`Current project metadata:
- Name: %s
- Description: %s

User update request: "%s"

Decide what needs to change and generate updated metadata.

Return ONLY valid JSON with this exact structure:
{
  "name": "string",
  "description": "string",
  "changed": {
    "name": boolean,
    "description": boolean
  },
  "reasoning": "brief explanation of what changed and why"
}`, existing.Name, existing.Description, updateRequest)
}

// BuildRequirementsDeltaPrompt creates a prompt for requirements delta analysis.
func BuildRequirementsDeltaPrompt(
	existingRequirements []schema.Requirement,
	existingCategories []string,
	updateRequest string,
) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf(`Analyze what requirements need to be added or removed based on this request: "%s"

`, updateRequest))

	if len(existingRequirements) > 0 {
		sb.WriteString("EXISTING REQUIREMENTS:\n")
		for _, req := range existingRequirements {
			sb.WriteString(fmt.Sprintf("- [%s] %s: %s\n", req.ID, req.Category, req.Description))
		}
		sb.WriteString("\n")
	}

	if len(existingCategories) > 0 {
		sb.WriteString(fmt.Sprintf("EXISTING CATEGORIES: %s\n\n", strings.Join(existingCategories, ", ")))
	}

	sb.WriteString(`IMPORTANT RULES:
1. Requirements are IMMUTABLE - they can only be added or deleted, never modified
2. To "modify" a requirement, you must DELETE the old one and ADD a new one
3. If the user's request is ambiguous about which requirement to modify, include it in ambiguous_modifications

Return ONLY valid JSON with this exact structure:
{
  "to_remove": [
    {
      "id": "requirement ID to delete",
      "reasoning": "why this requirement should be removed"
    }
  ],
  "to_add": [
    {
      "category": "existing or new category name (UPPERCASE)",
      "brief_description": "one sentence summary",
      "ears_type": "ubiquitous|event|state|optional",
      "estimated_priority": "critical|high|medium|low",
      "reasoning": "why this requirement is needed"
    }
  ],
  "ambiguous_modifications": [
    {
      "possible_targets": ["REQ-ID-1", "REQ-ID-2"],
      "clarification": "question to ask user for clarification"
    }
  ]
}`)

	return sb.String()
}

// BuildCategorizationPrompt creates a prompt for categorizing requirements.
func BuildCategorizationPrompt(
	projectName string,
	projectDescription string,
	allRequirementBriefs []string,
) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf(`PROJECT: %s
DESCRIPTION: %s

REQUIREMENTS TO CATEGORIZE:
`, projectName, projectDescription))

	for i, brief := range allRequirementBriefs {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, brief))
	}

	sb.WriteString(`
TASK: Create a clean category structure for these requirements.

RULES:
- Category names: 1-20 chars, UPPERCASE, descriptive
- Aim for 3-8 categories (not too granular)
- Categories should be mutually exclusive
- Group related requirements together

Return ONLY valid JSON with this exact structure:
{
  "categories": [
    {
      "name": "CATEGORY_NAME",
      "description": "what this category covers",
      "count": expected_number_of_requirements
    }
  ],
  "requirement_mapping": {
    "requirement brief": "CATEGORY_NAME"
  },
  "reasoning": "explanation of category structure"
}`)

	return sb.String()
}

// BuildRequirementGenerationPrompt creates a prompt for generating a full requirement.
func BuildRequirementGenerationPrompt(
	category string,
	earsType string,
	briefDescription string,
	estimatedPriority string,
	projectName string,
	projectDescription string,
	existingRequirements []schema.Requirement,
	updateRequest string,
) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf(`Generate a complete requirement specification.

PROJECT CONTEXT:
- Name: %s
- Description: %s
- User Request: "%s"

REQUIREMENT TO GENERATE:
- Category: %s
- EARS Type: %s
- Brief: %s
- Estimated Priority: %s

`, projectName, projectDescription, updateRequest, category, earsType, briefDescription, estimatedPriority))

	if len(existingRequirements) > 0 {
		sb.WriteString("EXISTING REQUIREMENTS (for context):\n")
		for _, req := range existingRequirements {
			sb.WriteString(fmt.Sprintf("- %s\n", req.Description))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(EARSDecisionTree)
	sb.WriteString(`

ACCEPTANCE CRITERIA RULES:
- Provide 3-7 acceptance criteria
- Use "behavioral" type for Given/When/Then scenarios
- Use "assertion" type for single testable statements
- Each criterion must be independently verifiable

Return ONLY valid JSON with this exact structure:
{
  "description": "EARS-formatted requirement description",
  "rationale": "why this requirement is needed",
  "acceptance_criteria": [
    {
      "type": "behavioral",
      "given": "precondition",
      "when": "trigger event",
      "then": "expected outcome"
    },
    {
      "type": "assertion",
      "statement": "single testable assertion"
    }
  ],
  "priority": "critical|high|medium|low"
}`)

	return sb.String()
}

// BuildVersionBumpPrompt creates a prompt for determining version bump.
func BuildVersionBumpPrompt(
	currentVersion string,
	requirementsAdded int,
	requirementsRemoved int,
	metadataChanged bool,
	changeDescriptions []string,
) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf(`Determine the appropriate semantic version bump.

CURRENT VERSION: %s

CHANGES:
- Requirements Added: %d
- Requirements Removed: %d
- Metadata Changed: %t

CHANGE DETAILS:
`, currentVersion, requirementsAdded, requirementsRemoved, metadataChanged))

	for i, desc := range changeDescriptions {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, desc))
	}

	sb.WriteString(`
SEMANTIC VERSIONING RULES:
- MAJOR (X.0.0): Breaking changes, requirements removed, fundamental scope shift
- MINOR (0.X.0): New features added, requirements added
- PATCH (0.0.X): Clarifications, refinements, metadata-only changes

Return ONLY valid JSON with this exact structure:
{
  "new_version": "X.Y.Z",
  "bump_type": "major|minor|patch",
  "reasoning": "explanation of why this bump type was chosen"
}`)

	return sb.String()
}
