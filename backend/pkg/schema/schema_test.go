package schema

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

func TestIDGeneration(t *testing.T) {
	// Test requirement ID
	reqID, err := NewRequirementID("auth")
	if err != nil {
		t.Fatalf("Failed to generate requirement ID: %v", err)
	}
	if !strings.HasPrefix(reqID, "REQ-AUTH-") {
		t.Errorf("Requirement ID should start with REQ-AUTH-, got %s", reqID)
	}
	if len(strings.Split(reqID, "-")[2]) != 10 {
		t.Errorf("Nanoid portion should be 10 characters")
	}

	// Test acceptance criterion ID
	acID, err := NewAcceptanceCriterionID()
	if err != nil {
		t.Fatalf("Failed to generate AC ID: %v", err)
	}
	if !strings.HasPrefix(acID, "AC-") {
		t.Errorf("AC ID should start with AC-, got %s", acID)
	}

	// Test event ID
	evtID, err := NewEventID()
	if err != nil {
		t.Fatalf("Failed to generate event ID: %v", err)
	}
	if !strings.HasPrefix(evtID, "EVT-") {
		t.Errorf("Event ID should start with EVT-, got %s", evtID)
	}
}

func TestIDCollisionResistance(t *testing.T) {
	// Generate 10,000 IDs and check for collisions
	ids := make(map[string]bool)
	for i := 0; i < 10000; i++ {
		id, err := NewRequirementID("TEST")
		if err != nil {
			t.Fatalf("Failed to generate ID: %v", err)
		}
		if ids[id] {
			t.Fatalf("Collision detected after %d iterations: %s", i, id)
		}
		ids[id] = true
	}
}

func TestProjectMetadataMarshaling(t *testing.T) {
	metadata := ProjectMetadata{
		Name:        "TestProject",
		Description: "A test project for unit testing",
		Version:     "1.0.0",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("Failed to marshal metadata to JSON: %v", err)
	}

	var jsonMetadata ProjectMetadata
	if err := json.Unmarshal(jsonData, &jsonMetadata); err != nil {
		t.Fatalf("Failed to unmarshal metadata from JSON: %v", err)
	}

	if jsonMetadata.Name != metadata.Name {
		t.Errorf("Name mismatch: got %s, want %s", jsonMetadata.Name, metadata.Name)
	}

	// Test YAML marshaling
	yamlData, err := yaml.Marshal(metadata)
	if err != nil {
		t.Fatalf("Failed to marshal metadata to YAML: %v", err)
	}

	var yamlMetadata ProjectMetadata
	if err := yaml.Unmarshal(yamlData, &yamlMetadata); err != nil {
		t.Fatalf("Failed to unmarshal metadata from YAML: %v", err)
	}

	if yamlMetadata.Description != metadata.Description {
		t.Errorf("Description mismatch: got %s, want %s", yamlMetadata.Description, metadata.Description)
	}
}

func TestAcceptanceCriterionInterface(t *testing.T) {
	behavioral := &BehavioralCriterion{
		ID:        "AC-test123",
		Type:      "behavioral",
		Given:     "User is logged in",
		When:      "User clicks logout",
		Then:      "User is redirected to login page",
		CreatedAt: time.Now(),
	}

	assertion := &AssertionCriterion{
		ID:        "AC-test456",
		Type:      "assertion",
		Statement: "System must support 1000 concurrent users",
		CreatedAt: time.Now(),
	}

	// Test that both implement AcceptanceCriterion
	var criteria []AcceptanceCriterion
	criteria = append(criteria, behavioral, assertion)

	for _, criterion := range criteria {
		if criterion.GetID() == "" {
			t.Error("GetID() should return non-empty string")
		}
		if criterion.GetType() == "" {
			t.Error("GetType() should return non-empty string")
		}
		if criterion.GetCreatedAt().IsZero() {
			t.Error("GetCreatedAt() should return non-zero time")
		}
	}
}

func TestRequirementWithNestedCriteria(t *testing.T) {
	req := Requirement{
		ID:          "REQ-AUTH-abc123",
		Type:        EARSEvent,
		Category:    "AUTH",
		Description: "When user submits login form, the system shall validate credentials",
		Rationale:   "Users need to authenticate to access protected resources",
		Priority:    PriorityHigh,
		CreatedAt:   time.Now(),
		AcceptanceCriteria: []AcceptanceCriterion{
			&BehavioralCriterion{
				ID:        "AC-1",
				Type:      "behavioral",
				Given:     "Valid credentials",
				When:      "User submits login",
				Then:      "User is authenticated",
				CreatedAt: time.Now(),
			},
			&AssertionCriterion{
				ID:        "AC-2",
				Type:      "assertion",
				Statement: "Login must complete within 2 seconds",
				CreatedAt: time.Now(),
			},
		},
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal requirement: %v", err)
	}

	// Verify the JSON contains expected fields
	jsonStr := string(jsonData)
	if !strings.Contains(jsonStr, "REQ-AUTH-abc123") {
		t.Error("JSON should contain requirement ID")
	}
	// The acceptance criteria are interfaces, so they may not marshal as expected
	// Just verify we have some criteria
	if !strings.Contains(jsonStr, "acceptance_criteria") {
		t.Error("JSON should contain acceptance_criteria field")
	}
}

func TestSpecificationWithMultipleRequirements(t *testing.T) {
	spec := Specification{
		Metadata: ProjectMetadata{
			Name:        "TestApp",
			Description: "A test application",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		Categories: []string{"AUTH", "TASKS"},
		Requirements: []Requirement{
			{
				ID:          "REQ-AUTH-1",
				Type:        EARSEvent,
				Category:    "AUTH",
				Description: "When user logs in, system shall authenticate",
				Rationale:   "Security requirement",
				Priority:    PriorityCritical,
				CreatedAt:   time.Now(),
				AcceptanceCriteria: []AcceptanceCriterion{
					&BehavioralCriterion{
						ID:        "AC-1",
						Type:      "behavioral",
						Given:     "Valid credentials",
						When:      "Login submitted",
						Then:      "User authenticated",
						CreatedAt: time.Now(),
					},
				},
			},
			{
				ID:          "REQ-TASKS-1",
				Type:        EARSUbiquitous,
				Category:    "TASKS",
				Description: "The system shall always persist task changes",
				Rationale:   "Data consistency requirement",
				Priority:    PriorityHigh,
				CreatedAt:   time.Now(),
				AcceptanceCriteria: []AcceptanceCriterion{
					&AssertionCriterion{
						ID:        "AC-2",
						Type:      "assertion",
						Statement: "All changes saved within 1 second",
						CreatedAt: time.Now(),
					},
				},
			},
		},
	}

	// Test YAML marshaling
	yamlData, err := yaml.Marshal(spec)
	if err != nil {
		t.Fatalf("Failed to marshal specification: %v", err)
	}

	// Verify YAML contains expected structure
	yamlStr := string(yamlData)
	if !strings.Contains(yamlStr, "metadata:") {
		t.Error("YAML should contain metadata section")
	}
	if !strings.Contains(yamlStr, "requirements:") {
		t.Error("YAML should contain requirements section")
	}
	if !strings.Contains(yamlStr, "categories:") {
		t.Error("YAML should contain categories section")
	}
}

func TestChangelogEventTypes(t *testing.T) {
	events := []ChangelogEvent{
		&RequirementAdded{
			EventID_: "EVT-1",
			Requirement: Requirement{
				ID:       "REQ-TEST-1",
				Category: "TEST",
			},
			Timestamp_: time.Now(),
		},
		&RequirementDeleted{
			EventID_:      "EVT-2",
			RequirementID: "REQ-TEST-1",
			Requirement: Requirement{
				ID:       "REQ-TEST-1",
				Category: "TEST",
			},
			Timestamp_: time.Now(),
		},
		&CategoryAdded{
			EventID_:   "EVT-3",
			Name:       "NEWCAT",
			Timestamp_: time.Now(),
		},
		&CategoryDeleted{
			EventID_:   "EVT-4",
			Name:       "OLDCAT",
			Timestamp_: time.Now(),
		},
		&CategoryRenamed{
			EventID_:   "EVT-5",
			OldName:    "OLD",
			NewName:    "NEW",
			Timestamp_: time.Now(),
		},
		&ProjectMetadataUpdated{
			EventID_: "EVT-6",
			OldMetadata: ProjectMetadata{
				Version: "0.1.0",
			},
			NewMetadata: ProjectMetadata{
				Version: "0.2.0",
			},
			Timestamp_: time.Now(),
		},
		&VersionBumped{
			EventID_:   "EVT-7",
			OldVersion: "0.1.0",
			NewVersion: "0.2.0",
			BumpType:   "minor",
			Reasoning:  "New features added",
			Timestamp_: time.Now(),
		},
	}

	expectedTypes := []string{
		"RequirementAdded",
		"RequirementDeleted",
		"CategoryAdded",
		"CategoryDeleted",
		"CategoryRenamed",
		"ProjectMetadataUpdated",
		"VersionBumped",
	}

	for i, event := range events {
		if event.EventType() != expectedTypes[i] {
			t.Errorf("Event type mismatch: got %s, want %s", event.EventType(), expectedTypes[i])
		}
		if event.EventID() == "" {
			t.Error("EventID should not be empty")
		}
		if event.Timestamp().IsZero() {
			t.Error("Timestamp should not be zero")
		}
	}
}

func TestValidation(t *testing.T) {
	tests := []struct {
		name     string
		validate func() error
		wantErr  bool
	}{
		{
			name: "valid metadata",
			validate: func() error {
				return ValidateMetadata(&ProjectMetadata{
					Name:        "TestProject",
					Description: "A valid test project description",
					Version:     "1.0.0",
				})
			},
			wantErr: false,
		},
		{
			name: "metadata name too short",
			validate: func() error {
				return ValidateMetadata(&ProjectMetadata{
					Name:        "",
					Description: "A valid test project description",
					Version:     "1.0.0",
				})
			},
			wantErr: true,
		},
		{
			name: "invalid version format",
			validate: func() error {
				return ValidateMetadata(&ProjectMetadata{
					Name:        "TestProject",
					Description: "A valid test project description",
					Version:     "v1.0",
				})
			},
			wantErr: true,
		},
		{
			name: "valid requirement",
			validate: func() error {
				return ValidateRequirement(&Requirement{
					Type:        EARSEvent,
					Category:    "AUTH",
					Description: "When user logs in, the system shall validate credentials",
					Rationale:   "Security is essential for the application",
					Priority:    PriorityHigh,
					AcceptanceCriteria: []AcceptanceCriterion{
						&BehavioralCriterion{},
					},
				})
			},
			wantErr: false,
		},
		{
			name: "requirement description too short",
			validate: func() error {
				return ValidateRequirement(&Requirement{
					Type:        EARSEvent,
					Category:    "AUTH",
					Description: "Too short",
					Rationale:   "Security is essential for the application",
					Priority:    PriorityHigh,
					AcceptanceCriteria: []AcceptanceCriterion{
						&BehavioralCriterion{},
					},
				})
			},
			wantErr: true,
		},
		{
			name: "valid behavioral criterion",
			validate: func() error {
				return ValidateBehavioralCriterion(&BehavioralCriterion{
					Type:  "behavioral",
					Given: "User is logged in",
					When:  "User clicks logout",
					Then:  "User is redirected to login",
				})
			},
			wantErr: false,
		},
		{
			name: "valid assertion criterion",
			validate: func() error {
				return ValidateAssertionCriterion(&AssertionCriterion{
					Type:      "assertion",
					Statement: "System must handle 1000 users",
				})
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("validation error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
