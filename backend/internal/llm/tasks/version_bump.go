package tasks

import (
	"context"
	"fmt"
	"regexp"

	"xdd/internal/llm"
)

var semverRegex = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

// ExecuteVersionBumpTask determines appropriate semantic version bump.
func ExecuteVersionBumpTask(
	client *llm.Client,
	ctx context.Context,
	input *VersionBumpInput,
) (*VersionBumpOutput, error) {
	// Build prompt
	prompt := llm.BuildVersionBumpPrompt(
		input.CurrentVersion,
		input.Changes.RequirementsAdded,
		input.Changes.RequirementsRemoved,
		input.Changes.MetadataChanged,
		input.ChangeDescriptions,
	)

	// Validation function
	validate := func(output *VersionBumpOutput) error {
		// Validate new version format
		if !semverRegex.MatchString(output.NewVersion) {
			return fmt.Errorf("new_version must be valid semver (X.Y.Z), got '%s'", output.NewVersion)
		}

		// Validate bump type
		validBumpType := map[string]bool{
			"major": true,
			"minor": true,
			"patch": true,
		}
		if !validBumpType[output.BumpType] {
			return fmt.Errorf("bump_type must be 'major', 'minor', or 'patch', got '%s'", output.BumpType)
		}

		// Validate reasoning
		if output.Reasoning == "" {
			return fmt.Errorf("reasoning is required")
		}

		return nil
	}

	// Call LLM with retry
	result, err := llm.GenerateStructured[VersionBumpOutput](
		client,
		ctx,
		"", // Use default model
		prompt,
		validate,
	)

	if err != nil {
		return nil, fmt.Errorf("version bump task failed: %w", err)
	}

	return result, nil
}
