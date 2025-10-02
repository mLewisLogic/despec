package core

import (
	"context"

	"xdd/internal/llm/tasks"
)

// TaskExecutor interface abstracts LLM task execution for testability.
type TaskExecutor interface {
	ExecuteMetadata(ctx context.Context, input *tasks.MetadataInput) (*tasks.MetadataOutput, error)
	ExecuteRequirementsDelta(ctx context.Context, input *tasks.RequirementsDeltaInput) (*tasks.RequirementsDeltaOutput, error)
	ExecuteCategorization(ctx context.Context, input *tasks.CategorizationInput) (*tasks.CategorizationOutput, error)
	ExecuteRequirementGen(ctx context.Context, input *tasks.RequirementGenInput) (*tasks.RequirementGenOutput, error)
	ExecuteVersionBump(ctx context.Context, input *tasks.VersionBumpInput) (*tasks.VersionBumpOutput, error)
}

// RealTaskExecutor implements TaskExecutor using real LLM calls.
type RealTaskExecutor struct {
	client interface{} // Will be *llm.Client once we import it
}

// NewRealTaskExecutor creates a TaskExecutor that calls real LLM APIs.
func NewRealTaskExecutor(client interface{}) TaskExecutor {
	return &RealTaskExecutor{client: client}
}

// Execute methods delegate to actual LLM task functions.
func (e *RealTaskExecutor) ExecuteMetadata(ctx context.Context, input *tasks.MetadataInput) (*tasks.MetadataOutput, error) {
	// For now, return mock data - will be replaced with real LLM call
	return &tasks.MetadataOutput{
		Name:        "MockProject",
		Description: "Mock description",
		Changed: struct {
			Name        bool `json:"name"`
			Description bool `json:"description"`
		}{Name: true, Description: true},
		Reasoning: "Mock reasoning",
	}, nil
}

func (e *RealTaskExecutor) ExecuteRequirementsDelta(ctx context.Context, input *tasks.RequirementsDeltaInput) (*tasks.RequirementsDeltaOutput, error) {
	return &tasks.RequirementsDeltaOutput{
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
		}{},
		AmbiguousModifications: []struct {
			PossibleTargets []string `json:"possible_targets"`
			Clarification   string   `json:"clarification"`
		}{},
	}, nil
}

func (e *RealTaskExecutor) ExecuteCategorization(ctx context.Context, input *tasks.CategorizationInput) (*tasks.CategorizationOutput, error) {
	return &tasks.CategorizationOutput{
		Categories: []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Count       int    `json:"count"`
		}{
			{Name: "MOCK", Description: "Mock category", Count: 1},
		},
		RequirementMapping: map[string]string{},
		Reasoning:          "Mock reasoning",
	}, nil
}

func (e *RealTaskExecutor) ExecuteRequirementGen(ctx context.Context, input *tasks.RequirementGenInput) (*tasks.RequirementGenOutput, error) {
	return &tasks.RequirementGenOutput{
		Description: "Mock requirement description",
		Rationale:   "Mock rationale",
		AcceptanceCriteria: []tasks.AcceptanceCriterionJSON{
			{
				Type:      "behavioral",
				Given:     "Mock precondition",
				When:      "Mock trigger",
				Then:      "Mock outcome",
				Statement: "",
			},
		},
		Priority: "medium",
	}, nil
}

func (e *RealTaskExecutor) ExecuteVersionBump(ctx context.Context, input *tasks.VersionBumpInput) (*tasks.VersionBumpOutput, error) {
	return &tasks.VersionBumpOutput{
		NewVersion: "0.1.0",
		BumpType:   "minor",
		Reasoning:  "Mock version bump",
	}, nil
}

// MockTaskExecutor implements TaskExecutor for testing with canned responses.
type MockTaskExecutor struct {
	MetadataOutput          *tasks.MetadataOutput
	RequirementsDeltaOutput *tasks.RequirementsDeltaOutput
	CategorizationOutput    *tasks.CategorizationOutput
	RequirementGenOutput    *tasks.RequirementGenOutput
	VersionBumpOutput       *tasks.VersionBumpOutput

	MetadataError          error
	RequirementsDeltaError error
	CategorizationError    error
	RequirementGenError    error
	VersionBumpError       error

	MetadataCalls          int
	RequirementsDeltaCalls int
	CategorizationCalls    int
	RequirementGenCalls    int
	VersionBumpCalls       int
}

// NewMockTaskExecutor creates a mock executor with default successful responses.
func NewMockTaskExecutor() *MockTaskExecutor {
	return &MockTaskExecutor{
		MetadataOutput: &tasks.MetadataOutput{
			Name:        "TestProject",
			Description: "A test project for integration testing",
			Changed: struct {
				Name        bool `json:"name"`
				Description bool `json:"description"`
			}{Name: true, Description: true},
			Reasoning: "New project initialization",
		},
		RequirementsDeltaOutput: &tasks.RequirementsDeltaOutput{
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
					BriefDescription:  "User authentication requirement",
					EARSType:          "event",
					EstimatedPriority: "high",
					Reasoning:         "Core security feature",
				},
				{
					Category:          "TASKS",
					BriefDescription:  "Task management requirement",
					EARSType:          "event",
					EstimatedPriority: "high",
					Reasoning:         "Primary application feature",
				},
			},
			AmbiguousModifications: []struct {
				PossibleTargets []string `json:"possible_targets"`
				Clarification   string   `json:"clarification"`
			}{},
		},
		CategorizationOutput: &tasks.CategorizationOutput{
			Categories: []struct {
				Name        string `json:"name"`
				Description string `json:"description"`
				Count       int    `json:"count"`
			}{
				{Name: "AUTH", Description: "Authentication and authorization", Count: 1},
				{Name: "TASKS", Description: "Task management features", Count: 1},
			},
			RequirementMapping: map[string]string{
				"User authentication requirement": "AUTH",
				"Task management requirement":     "TASKS",
			},
			Reasoning: "Categorized by functional domain",
		},
		RequirementGenOutput: &tasks.RequirementGenOutput{
			Description: "When user initiates login, the system shall authenticate credentials",
			Rationale:   "Users need secure access to the application",
			AcceptanceCriteria: []tasks.AcceptanceCriterionJSON{
				{
					Type:  "behavioral",
					Given: "User is on login page",
					When:  "User submits valid credentials",
					Then:  "System authenticates and redirects to dashboard",
				},
				{
					Type:      "assertion",
					Statement: "Authentication must complete within 2 seconds",
				},
			},
			Priority: "high",
		},
		VersionBumpOutput: &tasks.VersionBumpOutput{
			NewVersion: "0.1.0",
			BumpType:   "minor",
			Reasoning:  "Initial version with core features",
		},
	}
}

func (m *MockTaskExecutor) ExecuteMetadata(ctx context.Context, input *tasks.MetadataInput) (*tasks.MetadataOutput, error) {
	m.MetadataCalls++
	if m.MetadataError != nil {
		return nil, m.MetadataError
	}
	return m.MetadataOutput, nil
}

func (m *MockTaskExecutor) ExecuteRequirementsDelta(ctx context.Context, input *tasks.RequirementsDeltaInput) (*tasks.RequirementsDeltaOutput, error) {
	m.RequirementsDeltaCalls++
	if m.RequirementsDeltaError != nil {
		return nil, m.RequirementsDeltaError
	}
	return m.RequirementsDeltaOutput, nil
}

func (m *MockTaskExecutor) ExecuteCategorization(ctx context.Context, input *tasks.CategorizationInput) (*tasks.CategorizationOutput, error) {
	m.CategorizationCalls++
	if m.CategorizationError != nil {
		return nil, m.CategorizationError
	}
	return m.CategorizationOutput, nil
}

func (m *MockTaskExecutor) ExecuteRequirementGen(ctx context.Context, input *tasks.RequirementGenInput) (*tasks.RequirementGenOutput, error) {
	m.RequirementGenCalls++
	if m.RequirementGenError != nil {
		return nil, m.RequirementGenError
	}
	return m.RequirementGenOutput, nil
}

func (m *MockTaskExecutor) ExecuteVersionBump(ctx context.Context, input *tasks.VersionBumpInput) (*tasks.VersionBumpOutput, error) {
	m.VersionBumpCalls++
	if m.VersionBumpError != nil {
		return nil, m.VersionBumpError
	}
	return m.VersionBumpOutput, nil
}
