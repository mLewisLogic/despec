package tasks

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Test validation logic for requirements delta output.
func TestRequirementsDeltaValidation(t *testing.T) {
	tests := []struct {
		name    string
		output  *RequirementsDeltaOutput
		wantErr bool
	}{
		{
			name: "valid output with additions",
			output: &RequirementsDeltaOutput{
				ToRemove: []struct {
					ID        string `json:"id"`
					Reasoning string `json:"reasoning"`
				}{},
				ToAdd: []struct {
					Category          string `json:"category"`
					BriefDescription  string `json:"brief_description"`
					EARSType          string `json:"ears_type"`
					EstimatedPriority string `json:"estimated_priority"`
					Reasoning         string `json:"reasoning"`
				}{
					{
						Category:          "AUTH",
						BriefDescription:  "OAuth login integration",
						EARSType:          "event",
						EstimatedPriority: "high",
						Reasoning:         "Need secure authentication",
					},
				},
				AmbiguousModifications: []struct {
					PossibleTargets []string `json:"possible_targets"`
					Clarification   string   `json:"clarification"`
				}{},
			},
			wantErr: false,
		},
		{
			name: "invalid EARS type",
			output: &RequirementsDeltaOutput{
				ToAdd: []struct {
					Category          string `json:"category"`
					BriefDescription  string `json:"brief_description"`
					EARSType          string `json:"ears_type"`
					EstimatedPriority string `json:"estimated_priority"`
					Reasoning         string `json:"reasoning"`
				}{
					{
						Category:          "AUTH",
						BriefDescription:  "OAuth login",
						EARSType:          "invalid",
						EstimatedPriority: "high",
						Reasoning:         "Test",
					},
				},
			},
			wantErr: true,
		},
		{
			name: "invalid priority",
			output: &RequirementsDeltaOutput{
				ToAdd: []struct {
					Category          string `json:"category"`
					BriefDescription  string `json:"brief_description"`
					EARSType          string `json:"ears_type"`
					EstimatedPriority string `json:"estimated_priority"`
					Reasoning         string `json:"reasoning"`
				}{
					{
						Category:          "AUTH",
						BriefDescription:  "OAuth login",
						EARSType:          "event",
						EstimatedPriority: "super-critical",
						Reasoning:         "Test",
					},
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use same validation as in ExecuteRequirementsDeltaTask
			err := validateRequirementsDelta(tt.output)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// Helper function extracted from ExecuteRequirementsDeltaTask for testing.
func validateRequirementsDelta(output *RequirementsDeltaOutput) error {
	for i, remove := range output.ToRemove {
		if remove.ID == "" {
			return assert.AnError
		}
		if remove.Reasoning == "" {
			return assert.AnError
		}
		_ = i
	}

	for i, add := range output.ToAdd {
		if add.Category == "" {
			return assert.AnError
		}
		if add.BriefDescription == "" {
			return assert.AnError
		}
		if add.EARSType == "" {
			return assert.AnError
		}
		validEARS := map[string]bool{
			"ubiquitous": true,
			"event":      true,
			"state":      true,
			"optional":   true,
		}
		if !validEARS[add.EARSType] {
			return assert.AnError
		}
		validPriority := map[string]bool{
			"critical": true,
			"high":     true,
			"medium":   true,
			"low":      true,
		}
		if !validPriority[add.EstimatedPriority] {
			return assert.AnError
		}
		_ = i
	}

	return nil
}

// TODO: Replace with fixture-based tests once recording script is ready
