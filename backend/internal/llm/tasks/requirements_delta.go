package tasks

import (
	"context"
	"fmt"

	"xdd/internal/llm"
)

// AmbiguousModificationError is returned when user input is ambiguous.
type AmbiguousModificationError struct {
	Clarifications []struct {
		PossibleTargets []string `json:"possible_targets"`
		Clarification   string   `json:"clarification"`
	}
}

func (e *AmbiguousModificationError) Error() string {
	return fmt.Sprintf("ambiguous modification: %d clarifications needed", len(e.Clarifications))
}

// ExecuteRequirementsDeltaTask analyzes what requirements to add/remove.
func ExecuteRequirementsDeltaTask(
	client *llm.Client,
	ctx context.Context,
	input *RequirementsDeltaInput,
) (*RequirementsDeltaOutput, error) {
	// Build prompt
	prompt := llm.BuildRequirementsDeltaPrompt(
		input.ExistingRequirements,
		input.ExistingCategories,
		input.UpdateRequest,
	)

	// Validation function
	validate := func(output *RequirementsDeltaOutput) error {
		// Validate removal reasoning
		for i, remove := range output.ToRemove {
			if remove.ID == "" {
				return fmt.Errorf("to_remove[%d]: id is required", i)
			}
			if remove.Reasoning == "" {
				return fmt.Errorf("to_remove[%d]: reasoning is required", i)
			}
		}

		// Validate additions
		for i, add := range output.ToAdd {
			if add.Category == "" {
				return fmt.Errorf("to_add[%d]: category is required", i)
			}
			if add.BriefDescription == "" {
				return fmt.Errorf("to_add[%d]: brief_description is required", i)
			}
			if add.EARSType == "" {
				return fmt.Errorf("to_add[%d]: ears_type is required", i)
			}
			// Validate EARS type
			validEARS := map[string]bool{
				"ubiquitous": true,
				"event":      true,
				"state":      true,
				"optional":   true,
			}
			if !validEARS[add.EARSType] {
				return fmt.Errorf("to_add[%d]: invalid ears_type '%s', must be ubiquitous|event|state|optional", i, add.EARSType)
			}
			// Validate priority
			validPriority := map[string]bool{
				"critical": true,
				"high":     true,
				"medium":   true,
				"low":      true,
			}
			if !validPriority[add.EstimatedPriority] {
				return fmt.Errorf("to_add[%d]: invalid priority '%s', must be critical|high|medium|low", i, add.EstimatedPriority)
			}
		}

		// Validate ambiguous modifications
		for i, amb := range output.AmbiguousModifications {
			if len(amb.PossibleTargets) == 0 {
				return fmt.Errorf("ambiguous_modifications[%d]: possible_targets cannot be empty", i)
			}
			if amb.Clarification == "" {
				return fmt.Errorf("ambiguous_modifications[%d]: clarification is required", i)
			}
		}

		return nil
	}

	// Call LLM with retry
	result, err := llm.GenerateStructured[RequirementsDeltaOutput](
		client,
		ctx,
		"", // Use default model
		prompt,
		validate,
	)

	if err != nil {
		return nil, fmt.Errorf("requirements delta task failed: %w", err)
	}

	// Check for ambiguities
	if len(result.AmbiguousModifications) > 0 {
		return nil, &AmbiguousModificationError{
			Clarifications: result.AmbiguousModifications,
		}
	}

	return result, nil
}
