package core

import (
	"context"
	"fmt"
	"time"

	"xdd/internal/llm"
	"xdd/internal/llm/tasks"
	"xdd/internal/repository"
	"xdd/pkg/schema"
)

// Orchestrator executes the 5-task LLM pipeline.
type Orchestrator struct {
	executor TaskExecutor
	repo     *repository.Repository
}

// NewOrchestrator creates a new orchestrator with a TaskExecutor.
func NewOrchestrator(executor TaskExecutor, repo *repository.Repository) *Orchestrator {
	return &Orchestrator{
		executor: executor,
		repo:     repo,
	}
}

// NewOrchestratorWithLLMClient creates an orchestrator with a real LLM client (legacy constructor).
func NewOrchestratorWithLLMClient(llmClient *llm.Client, repo *repository.Repository) *Orchestrator {
	return &Orchestrator{
		executor: NewRealTaskExecutor(llmClient),
		repo:     repo,
	}
}

// ProcessPrompt executes the full LLM pipeline for a user prompt.
func (o *Orchestrator) ProcessPrompt(
	ctx context.Context,
	state *SessionState,
	prompt string,
) (*SessionState, error) {
	newState := state.Clone()

	// Load current specification
	spec, err := o.repo.ReadSpecification()
	if err != nil {
		return nil, fmt.Errorf("load specification: %w", err)
	}

	// 1. Metadata Task
	metadataInput := &tasks.MetadataInput{
		Existing:      &spec.Metadata,
		UpdateRequest: prompt,
		IsNewProject:  spec.Metadata.Name == "",
	}

	metadataOutput, err := o.executor.ExecuteMetadata(ctx, metadataInput)
	if err != nil {
		return nil, fmt.Errorf("metadata task: %w", err)
	}

	// 2. Requirements Delta Task
	deltaInput := &tasks.RequirementsDeltaInput{
		ExistingRequirements: spec.Requirements,
		ExistingCategories:   spec.Categories,
		UpdateRequest:        prompt,
	}

	deltaOutput, err := o.executor.ExecuteRequirementsDelta(ctx, deltaInput)
	if err != nil {
		return nil, fmt.Errorf("requirements delta task: %w", err)
	}

	// Check for ambiguous modifications
	if len(deltaOutput.AmbiguousModifications) > 0 {
		newState.AwaitingFeedback = true
		newState.AddMessage("assistant", deltaOutput.AmbiguousModifications[0].Clarification)
		return newState, nil
	}

	// 3. Categorization Task
	allBriefs := []string{}
	for _, req := range spec.Requirements {
		allBriefs = append(allBriefs, req.Description)
	}
	for _, add := range deltaOutput.ToAdd {
		allBriefs = append(allBriefs, add.BriefDescription)
	}

	catInput := &tasks.CategorizationInput{
		ProjectName:          metadataOutput.Name,
		ProjectDescription:   metadataOutput.Description,
		AllRequirementBriefs: allBriefs,
	}

	catOutput, err := o.executor.ExecuteCategorization(ctx, catInput)
	if err != nil {
		return nil, fmt.Errorf("categorization task: %w", err)
	}

	// 4. Requirement Generation (sequential for simplicity)
	newRequirements := []schema.Requirement{}
	for _, add := range deltaOutput.ToAdd {
		reqInput := &tasks.RequirementGenInput{
			Category:          add.Category,
			EARSType:          add.EARSType,
			BriefDescription:  add.BriefDescription,
			EstimatedPriority: add.EstimatedPriority,
			Context: tasks.RequirementGenContext{
				ProjectName:          metadataOutput.Name,
				ProjectDescription:   metadataOutput.Description,
				ExistingRequirements: spec.Requirements,
				UpdateRequest:        prompt,
			},
		}

		reqOutput, err := o.executor.ExecuteRequirementGen(ctx, reqInput)
		if err != nil {
			return nil, fmt.Errorf("requirement generation: %w", err)
		}

		// Convert AcceptanceCriterionJSON to AcceptanceCriterion
		criteria := make([]schema.AcceptanceCriterion, 0, len(reqOutput.AcceptanceCriteria))
		for _, acJSON := range reqOutput.AcceptanceCriteria {
			switch acJSON.Type {
			case "behavioral":
				acID, _ := schema.NewAcceptanceCriterionID()
				criteria = append(criteria, &schema.BehavioralCriterion{
					ID:        acID,
					Type:      "behavioral",
					Given:     acJSON.Given,
					When:      acJSON.When,
					Then:      acJSON.Then,
					CreatedAt: time.Now(),
				})
			case "assertion":
				acID, _ := schema.NewAcceptanceCriterionID()
				criteria = append(criteria, &schema.AssertionCriterion{
					ID:        acID,
					Type:      "assertion",
					Statement: acJSON.Statement,
					CreatedAt: time.Now(),
				})
			}
		}

		reqID, _ := schema.NewRequirementID(add.Category)
		req := schema.Requirement{
			ID:                 reqID,
			Type:               schema.EARSType(add.EARSType),
			Category:           add.Category,
			Description:        reqOutput.Description,
			Rationale:          reqOutput.Rationale,
			AcceptanceCriteria: criteria,
			Priority:           schema.Priority(reqOutput.Priority),
			CreatedAt:          time.Now(),
		}

		newRequirements = append(newRequirements, req)
	}

	// 5. Version Bump Task
	versionInput := &tasks.VersionBumpInput{
		CurrentVersion: spec.Metadata.Version,
		Changes: tasks.VersionChanges{
			RequirementsAdded:   len(deltaOutput.ToAdd),
			RequirementsRemoved: len(deltaOutput.ToRemove),
			MetadataChanged:     metadataOutput.Changed.Name || metadataOutput.Changed.Description,
		},
		ChangeDescriptions: buildChangeDescriptions(metadataOutput, deltaOutput, newRequirements),
	}

	versionOutput, err := o.executor.ExecuteVersionBump(ctx, versionInput)
	if err != nil {
		return nil, fmt.Errorf("version bump task: %w", err)
	}

	// Build changelog events
	newState.PendingChangelog = buildChangelog(
		spec,
		metadataOutput,
		deltaOutput,
		catOutput,
		newRequirements,
		versionOutput,
	)

	newState.AwaitingFeedback = false
	return newState, nil
}

// buildChangeDescriptions creates human-readable change summaries.
func buildChangeDescriptions(
	metadata *tasks.MetadataOutput,
	delta *tasks.RequirementsDeltaOutput,
	requirements []schema.Requirement,
) []string {
	descriptions := []string{}

	if metadata.Changed.Name {
		descriptions = append(descriptions, fmt.Sprintf("Project name: %s", metadata.Name))
	}
	if metadata.Changed.Description {
		descriptions = append(descriptions, "Project description updated")
	}

	for _, req := range requirements {
		descriptions = append(descriptions, fmt.Sprintf("Added: %s", req.Description))
	}

	for _, rem := range delta.ToRemove {
		descriptions = append(descriptions, fmt.Sprintf("Removed: %s", rem.ID))
	}

	return descriptions
}

// buildChangelog constructs changelog events from task outputs.
func buildChangelog(
	spec *schema.Specification,
	metadata *tasks.MetadataOutput,
	delta *tasks.RequirementsDeltaOutput,
	categorization *tasks.CategorizationOutput,
	newRequirements []schema.Requirement,
	version *tasks.VersionBumpOutput,
) []schema.ChangelogEvent {
	events := []schema.ChangelogEvent{}

	// Metadata update
	if metadata.Changed.Name || metadata.Changed.Description {
		evtID, _ := schema.NewEventID()
		events = append(events, &schema.ProjectMetadataUpdated{
			EventID_:    evtID,
			OldMetadata: spec.Metadata,
			NewMetadata: schema.ProjectMetadata{
				Name:        metadata.Name,
				Description: metadata.Description,
				Version:     version.NewVersion,
				CreatedAt:   spec.Metadata.CreatedAt,
				UpdatedAt:   time.Now(),
			},
			Timestamp_: time.Now(),
		})
	}

	// Category changes (simplified - just add new categories)
	existingCats := make(map[string]bool)
	for _, cat := range spec.Categories {
		existingCats[cat] = true
	}

	for _, cat := range categorization.Categories {
		if !existingCats[cat.Name] {
			evtID, _ := schema.NewEventID()
			events = append(events, &schema.CategoryAdded{
				EventID_:   evtID,
				Name:       cat.Name,
				Timestamp_: time.Now(),
			})
		}
	}

	// Requirement deletions
	for _, rem := range delta.ToRemove {
		// Find requirement to snapshot
		var req schema.Requirement
		for _, r := range spec.Requirements {
			if r.ID == rem.ID {
				req = r
				break
			}
		}

		evtID, _ := schema.NewEventID()
		events = append(events, &schema.RequirementDeleted{
			EventID_:      evtID,
			RequirementID: rem.ID,
			Requirement:   req,
			Timestamp_:    time.Now(),
		})
	}

	// Requirement additions
	for _, req := range newRequirements {
		evtID, _ := schema.NewEventID()
		events = append(events, &schema.RequirementAdded{
			EventID_:    evtID,
			Requirement: req,
			Timestamp_:  time.Now(),
		})
	}

	// Version bump
	evtID, _ := schema.NewEventID()
	events = append(events, &schema.VersionBumped{
		EventID_:   evtID,
		OldVersion: spec.Metadata.Version,
		NewVersion: version.NewVersion,
		BumpType:   version.BumpType,
		Reasoning:  version.Reasoning,
		Timestamp_: time.Now(),
	})

	return events
}
