package tasks

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Test validation logic for version bump output.
func TestVersionBumpValidation(t *testing.T) {
	tests := []struct {
		name    string
		output  *VersionBumpOutput
		wantErr bool
	}{
		{
			name: "valid major bump",
			output: &VersionBumpOutput{
				NewVersion: "2.0.0",
				BumpType:   "major",
				Reasoning:  "Breaking changes due to removed requirements",
			},
			wantErr: false,
		},
		{
			name: "valid minor bump",
			output: &VersionBumpOutput{
				NewVersion: "1.5.0",
				BumpType:   "minor",
				Reasoning:  "New features added",
			},
			wantErr: false,
		},
		{
			name: "valid patch bump",
			output: &VersionBumpOutput{
				NewVersion: "1.0.1",
				BumpType:   "patch",
				Reasoning:  "Metadata and clarifications only",
			},
			wantErr: false,
		},
		{
			name: "invalid semver format",
			output: &VersionBumpOutput{
				NewVersion: "v2.0.0",
				BumpType:   "major",
				Reasoning:  "Test",
			},
			wantErr: true,
		},
		{
			name: "invalid bump type",
			output: &VersionBumpOutput{
				NewVersion: "1.0.0",
				BumpType:   "breaking",
				Reasoning:  "Test",
			},
			wantErr: true,
		},
		{
			name: "missing reasoning",
			output: &VersionBumpOutput{
				NewVersion: "1.0.0",
				BumpType:   "patch",
				Reasoning:  "",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use same validation as in ExecuteVersionBumpTask
			err := validateVersionBump(tt.output)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// Helper function extracted for testing.
func validateVersionBump(output *VersionBumpOutput) error {
	if !semverRegex.MatchString(output.NewVersion) {
		return assert.AnError
	}

	validBumpType := map[string]bool{
		"major": true,
		"minor": true,
		"patch": true,
	}
	if !validBumpType[output.BumpType] {
		return assert.AnError
	}

	if output.Reasoning == "" {
		return assert.AnError
	}

	return nil
}

// TODO: Replace with fixture-based tests once recording script is ready
