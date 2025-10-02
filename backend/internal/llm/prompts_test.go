package llm

import (
	"strings"
	"testing"
	"time"

	"xdd/pkg/schema"
)

func TestBuildMetadataPrompt(t *testing.T) {
	t.Run("new project", func(t *testing.T) {
		prompt := BuildMetadataPrompt(nil, "Build a task manager")

		if !strings.Contains(prompt, "Build a task manager") {
			t.Error("prompt should contain user request")
		}

		if !strings.Contains(prompt, "PascalCase") {
			t.Error("prompt should mention PascalCase naming")
		}

		if !strings.Contains(prompt, "JSON") {
			t.Error("prompt should request JSON output")
		}

		if !strings.Contains(prompt, "name") {
			t.Error("prompt should include 'name' field")
		}

		if !strings.Contains(prompt, "description") {
			t.Error("prompt should include 'description' field")
		}
	})

	t.Run("existing project", func(t *testing.T) {
		existing := &schema.ProjectMetadata{
			Name:        "TaskMaster",
			Description: "A task management system",
			Version:     "0.1.0",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		prompt := BuildMetadataPrompt(existing, "Add user authentication")

		if !strings.Contains(prompt, "TaskMaster") {
			t.Error("prompt should contain existing name")
		}

		if !strings.Contains(prompt, "A task management system") {
			t.Error("prompt should contain existing description")
		}

		if !strings.Contains(prompt, "Add user authentication") {
			t.Error("prompt should contain update request")
		}

		if !strings.Contains(prompt, "changed") {
			t.Error("prompt should track what changed")
		}
	})
}

func TestBuildRequirementsDeltaPrompt(t *testing.T) {
	t.Run("with existing requirements", func(t *testing.T) {
		existingReqs := []schema.Requirement{
			{
				ID:          "REQ-AUTH-abc123",
				Category:    "AUTH",
				Description: "When user logs in, system shall validate credentials",
			},
			{
				ID:          "REQ-TASKS-def456",
				Category:    "TASKS",
				Description: "The system shall allow users to create tasks",
			},
		}

		existingCategories := []string{"AUTH", "TASKS"}

		prompt := BuildRequirementsDeltaPrompt(
			existingReqs,
			existingCategories,
			"Add OAuth support",
		)

		if !strings.Contains(prompt, "REQ-AUTH-abc123") {
			t.Error("prompt should contain existing requirement IDs")
		}

		if !strings.Contains(prompt, "AUTH, TASKS") {
			t.Error("prompt should list existing categories")
		}

		if !strings.Contains(prompt, "Add OAuth support") {
			t.Error("prompt should contain update request")
		}

		if !strings.Contains(prompt, "IMMUTABLE") {
			t.Error("prompt should explain immutability rule")
		}

		if !strings.Contains(prompt, "to_remove") {
			t.Error("prompt should include to_remove field")
		}

		if !strings.Contains(prompt, "to_add") {
			t.Error("prompt should include to_add field")
		}

		if !strings.Contains(prompt, "ambiguous_modifications") {
			t.Error("prompt should include ambiguous_modifications field")
		}
	})

	t.Run("empty existing requirements", func(t *testing.T) {
		prompt := BuildRequirementsDeltaPrompt(
			[]schema.Requirement{},
			[]string{},
			"Build a user authentication system",
		)

		if strings.Contains(prompt, "EXISTING REQUIREMENTS:") {
			t.Error("prompt should not show existing requirements section when empty")
		}

		if strings.Contains(prompt, "EXISTING CATEGORIES:") {
			t.Error("prompt should not show existing categories when empty")
		}
	})
}

func TestBuildCategorizationPrompt(t *testing.T) {
	briefs := []string{
		"User login with OAuth",
		"User registration",
		"Create tasks",
		"Assign tasks to users",
	}

	prompt := BuildCategorizationPrompt(
		"TaskMaster",
		"A collaborative task manager",
		briefs,
	)

	if !strings.Contains(prompt, "TaskMaster") {
		t.Error("prompt should contain project name")
	}

	if !strings.Contains(prompt, "A collaborative task manager") {
		t.Error("prompt should contain project description")
	}

	for _, brief := range briefs {
		if !strings.Contains(prompt, brief) {
			t.Errorf("prompt should contain requirement brief: %s", brief)
		}
	}

	if !strings.Contains(prompt, "UPPERCASE") {
		t.Error("prompt should specify UPPERCASE category names")
	}

	if !strings.Contains(prompt, "3-8 categories") {
		t.Error("prompt should suggest category count range")
	}

	if !strings.Contains(prompt, "requirement_mapping") {
		t.Error("prompt should include requirement_mapping field")
	}
}

func TestBuildRequirementGenerationPrompt(t *testing.T) {
	existingReqs := []schema.Requirement{
		{
			ID:          "REQ-AUTH-abc123",
			Description: "When user logs in, system shall validate credentials",
		},
	}

	prompt := BuildRequirementGenerationPrompt(
		"AUTH",
		"event",
		"OAuth integration",
		"high",
		"TaskMaster",
		"A collaborative task manager",
		existingReqs,
		"Add OAuth support",
	)

	if !strings.Contains(prompt, "AUTH") {
		t.Error("prompt should contain category")
	}

	if !strings.Contains(prompt, "event") {
		t.Error("prompt should contain EARS type")
	}

	if !strings.Contains(prompt, "OAuth integration") {
		t.Error("prompt should contain brief description")
	}

	if !strings.Contains(prompt, "TaskMaster") {
		t.Error("prompt should contain project name")
	}

	if !strings.Contains(prompt, EARSDecisionTree) {
		t.Error("prompt should include EARS decision tree")
	}

	if !strings.Contains(prompt, "acceptance_criteria") {
		t.Error("prompt should include acceptance_criteria field")
	}

	if !strings.Contains(prompt, "behavioral") {
		t.Error("prompt should mention behavioral criteria type")
	}

	if !strings.Contains(prompt, "assertion") {
		t.Error("prompt should mention assertion criteria type")
	}

	if !strings.Contains(prompt, "3-7 acceptance criteria") {
		t.Error("prompt should specify acceptance criteria count")
	}
}

func TestBuildVersionBumpPrompt(t *testing.T) {
	changeDescriptions := []string{
		"Added OAuth authentication requirement",
		"Added user registration requirement",
	}

	prompt := BuildVersionBumpPrompt(
		"0.1.0",
		2,
		0,
		false,
		changeDescriptions,
	)

	if !strings.Contains(prompt, "0.1.0") {
		t.Error("prompt should contain current version")
	}

	if !strings.Contains(prompt, "Requirements Added: 2") {
		t.Error("prompt should show requirements added count")
	}

	if !strings.Contains(prompt, "Requirements Removed: 0") {
		t.Error("prompt should show requirements removed count")
	}

	if !strings.Contains(prompt, "Metadata Changed: false") {
		t.Error("prompt should show metadata changed flag")
	}

	for _, desc := range changeDescriptions {
		if !strings.Contains(prompt, desc) {
			t.Errorf("prompt should contain change description: %s", desc)
		}
	}

	if !strings.Contains(prompt, "MAJOR") {
		t.Error("prompt should explain MAJOR bump")
	}

	if !strings.Contains(prompt, "MINOR") {
		t.Error("prompt should explain MINOR bump")
	}

	if !strings.Contains(prompt, "PATCH") {
		t.Error("prompt should explain PATCH bump")
	}

	if !strings.Contains(prompt, "new_version") {
		t.Error("prompt should include new_version field")
	}

	if !strings.Contains(prompt, "bump_type") {
		t.Error("prompt should include bump_type field")
	}
}

func TestEARSDecisionTree(t *testing.T) {
	if !strings.Contains(EARSDecisionTree, "UBIQUITOUS") {
		t.Error("decision tree should contain UBIQUITOUS type")
	}

	if !strings.Contains(EARSDecisionTree, "EVENT-DRIVEN") {
		t.Error("decision tree should contain EVENT-DRIVEN type")
	}

	if !strings.Contains(EARSDecisionTree, "STATE-DRIVEN") {
		t.Error("decision tree should contain STATE-DRIVEN type")
	}

	if !strings.Contains(EARSDecisionTree, "OPTIONAL") {
		t.Error("decision tree should contain OPTIONAL type")
	}

	if !strings.Contains(EARSDecisionTree, "continuous behavior") {
		t.Error("decision tree should guide classification logic")
	}

	if !strings.Contains(EARSDecisionTree, "When [trigger]") {
		t.Error("decision tree should show pattern examples")
	}
}
