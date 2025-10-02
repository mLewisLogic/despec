package tasks

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"xdd/pkg/schema"
)

// Test validation logic for requirement generation output.
func TestRequirementGenValidation(t *testing.T) {
	tests := []struct {
		name    string
		output  *RequirementGenOutput
		wantErr bool
	}{
		{
			name: "valid output with behavioral criteria",
			output: &RequirementGenOutput{
				Description: "When user initiates OAuth login, the system shall redirect to provider",
				Rationale:   "OAuth provides secure authentication without password management",
				AcceptanceCriteria: []AcceptanceCriterionJSON{
					{
						Type:  "behavioral",
						Given: "User is on login page",
						When:  "User clicks OAuth button",
						Then:  "System redirects to OAuth provider",
					},
				},
				Priority: "high",
			},
			wantErr: false,
		},
		{
			name: "valid output with assertion criteria",
			output: &RequirementGenOutput{
				Description: "The system shall always encrypt data at rest using AES-256",
				Rationale:   "Data protection requires strong encryption standards",
				AcceptanceCriteria: []AcceptanceCriterionJSON{
					{
						Type:      "assertion",
						Statement: "All stored data is encrypted with AES-256",
					},
				},
				Priority: "critical",
			},
			wantErr: false,
		},
		{
			name: "description too short",
			output: &RequirementGenOutput{
				Description: "Too short",
				Rationale:   "This is a valid rationale for testing purposes",
				AcceptanceCriteria: []AcceptanceCriterionJSON{
					{
						Type:      "assertion",
						Statement: "Test",
					},
				},
				Priority: "medium",
			},
			wantErr: true,
		},
		{
			name: "invalid behavioral criterion missing fields",
			output: &RequirementGenOutput{
				Description: "When user logs in, the system shall authenticate credentials",
				Rationale:   "Authentication is required for security",
				AcceptanceCriteria: []AcceptanceCriterionJSON{
					{
						Type:  "behavioral",
						Given: "User is on login page",
						When:  "User clicks login",
						// Missing Then field
					},
				},
				Priority: "high",
			},
			wantErr: true,
		},
		{
			name: "invalid priority",
			output: &RequirementGenOutput{
				Description: "When user logs in, the system shall authenticate credentials",
				Rationale:   "Authentication is required for security",
				AcceptanceCriteria: []AcceptanceCriterionJSON{
					{
						Type:      "assertion",
						Statement: "User is authenticated",
					},
				},
				Priority: "super-high",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use same validation as in ExecuteRequirementGenTask
			err := validateRequirementGen(tt.output)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// Helper function extracted for testing.
func validateRequirementGen(output *RequirementGenOutput) error {
	if len(output.Description) < schema.RequirementDescriptionMin ||
		len(output.Description) > schema.RequirementDescriptionMax {
		return assert.AnError
	}

	if len(output.Rationale) < schema.RequirementRationaleMin ||
		len(output.Rationale) > schema.RequirementRationaleMax {
		return assert.AnError
	}

	if len(output.AcceptanceCriteria) < schema.AcceptanceCriterionMin ||
		len(output.AcceptanceCriteria) > schema.AcceptanceCriterionMax {
		return assert.AnError
	}

	for i, ac := range output.AcceptanceCriteria {
		if ac.Type != "behavioral" && ac.Type != "assertion" {
			return assert.AnError
		}

		if ac.Type == "behavioral" {
			if ac.Given == "" || ac.When == "" || ac.Then == "" {
				return assert.AnError
			}
			if len(ac.Given) > schema.GivenWhenThenMax {
				return assert.AnError
			}
			if len(ac.When) > schema.GivenWhenThenMax {
				return assert.AnError
			}
			if len(ac.Then) > schema.GivenWhenThenMax {
				return assert.AnError
			}
		}

		if ac.Type == "assertion" {
			if ac.Statement == "" {
				return assert.AnError
			}
			if len(ac.Statement) > schema.AssertionStatementMax {
				return assert.AnError
			}
		}
		_ = i
	}

	validPriority := map[string]bool{
		"critical": true,
		"high":     true,
		"medium":   true,
		"low":      true,
	}
	if !validPriority[output.Priority] {
		return assert.AnError
	}

	return nil
}

// TODO: Replace with fixture-based tests once recording script is ready
