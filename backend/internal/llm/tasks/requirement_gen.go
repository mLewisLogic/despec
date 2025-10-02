package tasks

import (
	"context"
	"fmt"

	"xdd/internal/llm"
	"xdd/pkg/schema"
)

// ExecuteRequirementGenTask generates a complete requirement specification.
func ExecuteRequirementGenTask(
	client *llm.Client,
	ctx context.Context,
	input *RequirementGenInput,
) (*RequirementGenOutput, error) {
	// Build prompt
	prompt := llm.BuildRequirementGenerationPrompt(
		input.Category,
		input.EARSType,
		input.BriefDescription,
		input.EstimatedPriority,
		input.Context.ProjectName,
		input.Context.ProjectDescription,
		input.Context.ExistingRequirements,
		input.Context.UpdateRequest,
	)

	// Validation function
	validate := func(output *RequirementGenOutput) error {
		// Validate description
		if len(output.Description) < schema.RequirementDescriptionMin ||
			len(output.Description) > schema.RequirementDescriptionMax {
			return fmt.Errorf("description must be %d-%d chars, got %d",
				schema.RequirementDescriptionMin, schema.RequirementDescriptionMax, len(output.Description))
		}

		// Validate rationale
		if len(output.Rationale) < schema.RequirementRationaleMin ||
			len(output.Rationale) > schema.RequirementRationaleMax {
			return fmt.Errorf("rationale must be %d-%d chars, got %d",
				schema.RequirementRationaleMin, schema.RequirementRationaleMax, len(output.Rationale))
		}

		// Validate acceptance criteria
		if len(output.AcceptanceCriteria) < schema.AcceptanceCriterionMin ||
			len(output.AcceptanceCriteria) > schema.AcceptanceCriterionMax {
			return fmt.Errorf("acceptance_criteria must have %d-%d items, got %d",
				schema.AcceptanceCriterionMin, schema.AcceptanceCriterionMax, len(output.AcceptanceCriteria))
		}

		// Validate each acceptance criterion
		for i, ac := range output.AcceptanceCriteria {
			if ac.Type != "behavioral" && ac.Type != "assertion" {
				return fmt.Errorf("acceptance_criteria[%d]: type must be 'behavioral' or 'assertion', got '%s'", i, ac.Type)
			}

			if ac.Type == "behavioral" {
				if ac.Given == "" || ac.When == "" || ac.Then == "" {
					return fmt.Errorf("acceptance_criteria[%d]: behavioral type requires given, when, and then", i)
				}
				if len(ac.Given) > schema.GivenWhenThenMax {
					return fmt.Errorf("acceptance_criteria[%d]: given exceeds %d chars", i, schema.GivenWhenThenMax)
				}
				if len(ac.When) > schema.GivenWhenThenMax {
					return fmt.Errorf("acceptance_criteria[%d]: when exceeds %d chars", i, schema.GivenWhenThenMax)
				}
				if len(ac.Then) > schema.GivenWhenThenMax {
					return fmt.Errorf("acceptance_criteria[%d]: then exceeds %d chars", i, schema.GivenWhenThenMax)
				}
			}

			if ac.Type == "assertion" {
				if ac.Statement == "" {
					return fmt.Errorf("acceptance_criteria[%d]: assertion type requires statement", i)
				}
				if len(ac.Statement) > schema.AssertionStatementMax {
					return fmt.Errorf("acceptance_criteria[%d]: statement exceeds %d chars", i, schema.AssertionStatementMax)
				}
			}
		}

		// Validate priority
		validPriority := map[string]bool{
			"critical": true,
			"high":     true,
			"medium":   true,
			"low":      true,
		}
		if !validPriority[output.Priority] {
			return fmt.Errorf("invalid priority '%s', must be critical|high|medium|low", output.Priority)
		}

		return nil
	}

	// Call LLM with retry
	result, err := llm.GenerateStructured[RequirementGenOutput](
		client,
		ctx,
		"", // Use default model
		prompt,
		validate,
	)

	if err != nil {
		return nil, fmt.Errorf("requirement generation task failed: %w", err)
	}

	return result, nil
}
