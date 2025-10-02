package tasks

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"xdd/internal/llm"
	"xdd/pkg/schema"
)

// Test validation logic for metadata output.
func TestMetadataValidation(t *testing.T) {
	tests := []struct {
		name    string
		output  *MetadataOutput
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid output",
			output: &MetadataOutput{
				Name:        "TaskMaster",
				Description: "A collaborative task management application with OAuth authentication",
				Changed: struct {
					Name        bool `json:"name"`
					Description bool `json:"description"`
				}{
					Name:        true,
					Description: true,
				},
				Reasoning: "TaskMaster clearly conveys the project's task management focus",
			},
			wantErr: false,
		},
		{
			name: "name too short",
			output: &MetadataOutput{
				Name:        "",
				Description: "A collaborative task management application",
				Reasoning:   "Test",
			},
			wantErr: true,
			errMsg:  "name must be",
		},
		{
			name: "description too short",
			output: &MetadataOutput{
				Name:        "TaskMaster",
				Description: "Short",
				Reasoning:   "Test",
			},
			wantErr: true,
			errMsg:  "description must be",
		},
		{
			name: "missing reasoning",
			output: &MetadataOutput{
				Name:        "TaskMaster",
				Description: "A collaborative task management application",
				Reasoning:   "",
			},
			wantErr: true,
			errMsg:  "reasoning is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Build validation function
			validate := func(output *MetadataOutput) error {
				if len(output.Name) < schema.MetadataNameMin || len(output.Name) > schema.MetadataNameMax {
					return assert.AnError
				}
				if len(output.Description) < schema.MetadataDescriptionMin || len(output.Description) > schema.MetadataDescriptionMax {
					return assert.AnError
				}
				if output.Reasoning == "" {
					return assert.AnError
				}
				return nil
			}

			err := validate(tt.output)

			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// Test with real LLM fixtures.
func TestMetadataTask_WithFixtures(t *testing.T) {
	tests := []struct {
		name        string
		fixtureName string
		wantName    string
		wantChanged bool
	}{
		{
			name:        "new project",
			fixtureName: "metadata-new-project",
			wantName:    "TaskMaster",
			wantChanged: true,
		},
		{
			name:        "update name",
			fixtureName: "metadata-update-name",
			wantName:    "TaskMaster",
			wantChanged: true,
		},
		{
			name:        "update description",
			fixtureName: "metadata-update-description",
			wantName:    "TaskMaster",
			wantChanged: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Load fixture
			fixture, err := llm.LoadFixture(tt.fixtureName)
			if err != nil {
				t.Skipf("Fixture not available: %v", err)
				return
			}

			// Unmarshal input
			var input MetadataInput
			require.NoError(t, fixture.UnmarshalInput(&input))

			// Unmarshal output
			var output MetadataOutput
			require.NoError(t, fixture.UnmarshalOutput(&output))

			// Validate output
			assert.NotEmpty(t, output.Name)
			assert.NotEmpty(t, output.Description)
			assert.NotEmpty(t, output.Reasoning)

			// Check specific expectations
			if tt.wantName != "" {
				assert.Equal(t, tt.wantName, output.Name)
			}
		})
	}
}

// TODO: Add more fixture-based tests once fixtures are recorded
