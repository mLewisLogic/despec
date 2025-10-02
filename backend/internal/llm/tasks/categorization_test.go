package tasks

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"xdd/pkg/schema"
)

// Test validation logic for categorization output.
func TestCategorizationValidation(t *testing.T) {
	tests := []struct {
		name    string
		input   *CategorizationInput
		output  *CategorizationOutput
		wantErr bool
	}{
		{
			name: "valid output",
			input: &CategorizationInput{
				AllRequirementBriefs: []string{"OAuth login", "User profile"},
			},
			output: &CategorizationOutput{
				Categories: []struct {
					Name        string `json:"name"`
					Description string `json:"description"`
					Count       int    `json:"count"`
				}{
					{
						Name:        "AUTH",
						Description: "Authentication and authorization",
						Count:       2,
					},
				},
				RequirementMapping: map[string]string{
					"OAuth login":  "AUTH",
					"User profile": "AUTH",
				},
				Reasoning: "Single category for all auth-related requirements",
			},
			wantErr: false,
		},
		{
			name: "category name too long",
			input: &CategorizationInput{
				AllRequirementBriefs: []string{"OAuth login"},
			},
			output: &CategorizationOutput{
				Categories: []struct {
					Name        string `json:"name"`
					Description string `json:"description"`
					Count       int    `json:"count"`
				}{
					{
						Name:        "THIS_CATEGORY_NAME_IS_WAY_TOO_LONG",
						Description: "Test",
						Count:       1,
					},
				},
				RequirementMapping: map[string]string{
					"OAuth login": "THIS_CATEGORY_NAME_IS_WAY_TOO_LONG",
				},
				Reasoning: "Test",
			},
			wantErr: true,
		},
		{
			name: "missing requirement mapping",
			input: &CategorizationInput{
				AllRequirementBriefs: []string{"OAuth login", "User profile"},
			},
			output: &CategorizationOutput{
				Categories: []struct {
					Name        string `json:"name"`
					Description string `json:"description"`
					Count       int    `json:"count"`
				}{
					{
						Name:        "AUTH",
						Description: "Authentication",
						Count:       2,
					},
				},
				RequirementMapping: map[string]string{
					"OAuth login": "AUTH",
					// Missing "User profile" mapping
				},
				Reasoning: "Test",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use same validation as in ExecuteCategorizationTask
			err := validateCategorization(tt.input, tt.output)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// Helper function extracted for testing.
func validateCategorization(input *CategorizationInput, output *CategorizationOutput) error {
	if len(output.Categories) == 0 {
		return assert.AnError
	}

	for i, cat := range output.Categories {
		if len(cat.Name) < schema.CategoryNameMin || len(cat.Name) > schema.CategoryNameMax {
			return assert.AnError
		}
		if cat.Description == "" {
			return assert.AnError
		}
		if cat.Count < 0 {
			return assert.AnError
		}
		_ = i
	}

	if len(output.RequirementMapping) != len(input.AllRequirementBriefs) {
		return assert.AnError
	}

	categoryNames := make(map[string]bool)
	for _, cat := range output.Categories {
		categoryNames[cat.Name] = true
	}
	for brief, category := range output.RequirementMapping {
		if !categoryNames[category] {
			return assert.AnError
		}
		_ = brief
	}

	if output.Reasoning == "" {
		return assert.AnError
	}

	return nil
}

// TODO: Replace with fixture-based tests once recording script is ready
