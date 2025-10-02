package tasks

import (
	"context"
	"fmt"

	"xdd/internal/llm"
	"xdd/pkg/schema"
)

// ExecuteCategorizationTask determines categories for all requirements.
func ExecuteCategorizationTask(
	client *llm.Client,
	ctx context.Context,
	input *CategorizationInput,
) (*CategorizationOutput, error) {
	// Build prompt
	prompt := llm.BuildCategorizationPrompt(
		input.ProjectName,
		input.ProjectDescription,
		input.AllRequirementBriefs,
	)

	// Validation function
	validate := func(output *CategorizationOutput) error {
		if len(output.Categories) == 0 {
			return fmt.Errorf("at least one category is required")
		}

		// Validate categories
		for i, cat := range output.Categories {
			if len(cat.Name) < schema.CategoryNameMin || len(cat.Name) > schema.CategoryNameMax {
				return fmt.Errorf("categories[%d]: name must be %d-%d chars, got %d",
					i, schema.CategoryNameMin, schema.CategoryNameMax, len(cat.Name))
			}
			if cat.Description == "" {
				return fmt.Errorf("categories[%d]: description is required", i)
			}
			if cat.Count < 0 {
				return fmt.Errorf("categories[%d]: count cannot be negative", i)
			}
		}

		// Validate requirement mapping
		if len(output.RequirementMapping) != len(input.AllRequirementBriefs) {
			return fmt.Errorf("requirement_mapping must map all %d requirements, got %d",
				len(input.AllRequirementBriefs), len(output.RequirementMapping))
		}

		// Validate all mappings point to defined categories
		categoryNames := make(map[string]bool)
		for _, cat := range output.Categories {
			categoryNames[cat.Name] = true
		}
		for brief, category := range output.RequirementMapping {
			if !categoryNames[category] {
				return fmt.Errorf("requirement_mapping[%s]: category '%s' not in defined categories", brief, category)
			}
		}

		if output.Reasoning == "" {
			return fmt.Errorf("reasoning is required")
		}

		return nil
	}

	// Call LLM with thinking model for better reasoning
	result, err := llm.GenerateStructured[CategorizationOutput](
		client,
		ctx,
		"google/gemini-2.0-flash-thinking-exp", // Use thinking model
		prompt,
		validate,
	)

	if err != nil {
		return nil, fmt.Errorf("categorization task failed: %w", err)
	}

	return result, nil
}
