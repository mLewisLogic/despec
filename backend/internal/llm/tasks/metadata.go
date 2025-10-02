package tasks

import (
	"context"
	"fmt"

	"xdd/internal/llm"
	"xdd/pkg/schema"
)

// ExecuteMetadataTask generates or updates project metadata.
func ExecuteMetadataTask(
	client *llm.Client,
	ctx context.Context,
	input *MetadataInput,
) (*MetadataOutput, error) {
	// Build prompt
	prompt := llm.BuildMetadataPrompt(input.Existing, input.UpdateRequest)

	// Validation function
	validate := func(output *MetadataOutput) error {
		if len(output.Name) < schema.MetadataNameMin || len(output.Name) > schema.MetadataNameMax {
			return fmt.Errorf("name must be %d-%d chars, got %d",
				schema.MetadataNameMin, schema.MetadataNameMax, len(output.Name))
		}
		if len(output.Description) < schema.MetadataDescriptionMin || len(output.Description) > schema.MetadataDescriptionMax {
			return fmt.Errorf("description must be %d-%d chars, got %d",
				schema.MetadataDescriptionMin, schema.MetadataDescriptionMax, len(output.Description))
		}
		if output.Reasoning == "" {
			return fmt.Errorf("reasoning is required")
		}
		return nil
	}

	// Call LLM with retry
	result, err := llm.GenerateStructured[MetadataOutput](
		client,
		ctx,
		"", // Use default model from config
		prompt,
		validate,
	)

	if err != nil {
		return nil, fmt.Errorf("metadata task failed: %w", err)
	}

	return result, nil
}
