package repository

import (
	"fmt"
	"sort"
	"time"

	"xdd/pkg/schema"
)

// ReplayEvents applies changelog events to a specification in chronological order
// Returns error if event application fails or encounters unknown event type.
func ReplayEvents(spec *schema.Specification, events []schema.ChangelogEvent) (*schema.Specification, error) {
	if spec == nil {
		return nil, fmt.Errorf("spec cannot be nil")
	}

	// Sort events by timestamp to ensure deterministic replay
	sortedEvents := make([]schema.ChangelogEvent, len(events))
	copy(sortedEvents, events)
	sort.Slice(sortedEvents, func(i, j int) bool {
		return sortedEvents[i].Timestamp().Before(sortedEvents[j].Timestamp())
	})

	// Apply each event in order
	for _, event := range sortedEvents {
		if err := applyEvent(spec, event); err != nil {
			return nil, fmt.Errorf("apply event %s: %w", event.EventID(), err)
		}
	}

	return spec, nil
}

// applyEvent applies a single event to the specification.
func applyEvent(spec *schema.Specification, event schema.ChangelogEvent) error {
	switch e := event.(type) {
	case *schema.RequirementAdded:
		return applyRequirementAdded(spec, e)
	case *schema.RequirementDeleted:
		return applyRequirementDeleted(spec, e)
	case *schema.AcceptanceCriterionAdded:
		return applyAcceptanceCriterionAdded(spec, e)
	case *schema.AcceptanceCriterionDeleted:
		return applyAcceptanceCriterionDeleted(spec, e)
	case *schema.CategoryAdded:
		return applyCategoryAdded(spec, e)
	case *schema.CategoryDeleted:
		return applyCategoryDeleted(spec, e)
	case *schema.CategoryRenamed:
		return applyCategoryRenamed(spec, e)
	case *schema.ProjectMetadataUpdated:
		return applyProjectMetadataUpdated(spec, e)
	case *schema.VersionBumped:
		return applyVersionBumped(spec, e)
	default:
		return fmt.Errorf("unknown event type: %T", event)
	}
}

func applyRequirementAdded(spec *schema.Specification, event *schema.RequirementAdded) error {
	// Check for duplicate ID
	for _, req := range spec.Requirements {
		if req.ID == event.Requirement.ID {
			return fmt.Errorf("requirement %s already exists", event.Requirement.ID)
		}
	}

	spec.Requirements = append(spec.Requirements, event.Requirement)

	// Add category if not exists
	if !containsString(spec.Categories, event.Requirement.Category) {
		spec.Categories = append(spec.Categories, event.Requirement.Category)
	}

	return nil
}

func applyRequirementDeleted(spec *schema.Specification, event *schema.RequirementDeleted) error {
	found := false
	newReqs := make([]schema.Requirement, 0, len(spec.Requirements))

	for _, req := range spec.Requirements {
		if req.ID == event.RequirementID {
			found = true
			continue
		}
		newReqs = append(newReqs, req)
	}

	if !found {
		return fmt.Errorf("requirement %s not found", event.RequirementID)
	}

	spec.Requirements = newReqs

	// Remove category if no more requirements use it
	if !categoryInUse(spec.Requirements, event.Requirement.Category) {
		spec.Categories = removeString(spec.Categories, event.Requirement.Category)
	}

	return nil
}

func applyAcceptanceCriterionAdded(spec *schema.Specification, event *schema.AcceptanceCriterionAdded) error {
	// Find the requirement
	for i := range spec.Requirements {
		if spec.Requirements[i].ID == event.RequirementID {
			// Check for duplicate criterion ID
			for _, ac := range spec.Requirements[i].AcceptanceCriteria {
				if ac.GetID() == event.Criterion.GetID() {
					return fmt.Errorf("acceptance criterion %s already exists", event.Criterion.GetID())
				}
			}

			spec.Requirements[i].AcceptanceCriteria = append(
				spec.Requirements[i].AcceptanceCriteria,
				event.Criterion,
			)
			return nil
		}
	}

	return fmt.Errorf("requirement %s not found", event.RequirementID)
}

func applyAcceptanceCriterionDeleted(spec *schema.Specification, event *schema.AcceptanceCriterionDeleted) error {
	// Find the requirement
	for i := range spec.Requirements {
		if spec.Requirements[i].ID == event.RequirementID {
			found := false
			newCriteria := make([]schema.AcceptanceCriterion, 0, len(spec.Requirements[i].AcceptanceCriteria))

			for _, ac := range spec.Requirements[i].AcceptanceCriteria {
				if ac.GetID() == event.CriterionID {
					found = true
					continue
				}
				newCriteria = append(newCriteria, ac)
			}

			if !found {
				return fmt.Errorf("acceptance criterion %s not found", event.CriterionID)
			}

			spec.Requirements[i].AcceptanceCriteria = newCriteria
			return nil
		}
	}

	return fmt.Errorf("requirement %s not found", event.RequirementID)
}

func applyCategoryAdded(spec *schema.Specification, event *schema.CategoryAdded) error {
	if containsString(spec.Categories, event.Name) {
		return fmt.Errorf("category %s already exists", event.Name)
	}

	spec.Categories = append(spec.Categories, event.Name)
	return nil
}

func applyCategoryDeleted(spec *schema.Specification, event *schema.CategoryDeleted) error {
	if !containsString(spec.Categories, event.Name) {
		return fmt.Errorf("category %s not found", event.Name)
	}

	spec.Categories = removeString(spec.Categories, event.Name)
	return nil
}

func applyCategoryRenamed(spec *schema.Specification, event *schema.CategoryRenamed) error {
	found := false
	for i, cat := range spec.Categories {
		if cat == event.OldName {
			spec.Categories[i] = event.NewName
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("category %s not found", event.OldName)
	}

	// Update all requirements using this category
	for i := range spec.Requirements {
		if spec.Requirements[i].Category == event.OldName {
			spec.Requirements[i].Category = event.NewName
		}
	}

	return nil
}

func applyProjectMetadataUpdated(spec *schema.Specification, event *schema.ProjectMetadataUpdated) error {
	spec.Metadata = event.NewMetadata
	return nil
}

func applyVersionBumped(spec *schema.Specification, event *schema.VersionBumped) error {
	spec.Metadata.Version = event.NewVersion
	return nil
}

// Helper functions

func containsString(slice []string, str string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}

func removeString(slice []string, str string) []string {
	result := make([]string, 0, len(slice))
	for _, s := range slice {
		if s != str {
			result = append(result, s)
		}
	}
	return result
}

func categoryInUse(requirements []schema.Requirement, category string) bool {
	for _, req := range requirements {
		if req.Category == category {
			return true
		}
	}
	return false
}

// ReplayEventsFromMaps converts raw map events (from YAML) to typed events and replays them.
func ReplayEventsFromMaps(spec *schema.Specification, eventMaps []map[string]interface{}) (*schema.Specification, error) {
	events := make([]schema.ChangelogEvent, 0, len(eventMaps))

	for _, eventMap := range eventMaps {
		event, err := mapToEvent(eventMap)
		if err != nil {
			return nil, fmt.Errorf("convert event map: %w", err)
		}
		events = append(events, event)
	}

	return ReplayEvents(spec, events)
}

// mapToEvent converts a map[string]interface{} to a typed ChangelogEvent.
func mapToEvent(eventMap map[string]interface{}) (schema.ChangelogEvent, error) {
	eventType, ok := eventMap["event_type"].(string)
	if !ok {
		return nil, fmt.Errorf("missing or invalid event_type")
	}

	eventID, _ := eventMap["event_id"].(string)
	timestamp, _ := eventMap["timestamp"].(time.Time)

	switch eventType {
	case "RequirementAdded":
		req, err := mapToRequirement(eventMap["requirement"])
		if err != nil {
			return nil, fmt.Errorf("parse requirement: %w", err)
		}
		return &schema.RequirementAdded{
			EventID_:    eventID,
			Requirement: req,
			Timestamp_:  timestamp,
		}, nil

	case "RequirementDeleted":
		reqID, _ := eventMap["requirement_id"].(string)
		req, err := mapToRequirement(eventMap["requirement"])
		if err != nil {
			return nil, fmt.Errorf("parse requirement snapshot: %w", err)
		}
		return &schema.RequirementDeleted{
			EventID_:      eventID,
			RequirementID: reqID,
			Requirement:   req,
			Timestamp_:    timestamp,
		}, nil

	case "AcceptanceCriterionAdded":
		reqID, _ := eventMap["requirement_id"].(string)
		criterion, err := mapToAcceptanceCriterion(eventMap["criterion"])
		if err != nil {
			return nil, fmt.Errorf("parse acceptance criterion: %w", err)
		}
		return &schema.AcceptanceCriterionAdded{
			EventID_:      eventID,
			RequirementID: reqID,
			Criterion:     criterion,
			Timestamp_:    timestamp,
		}, nil

	case "AcceptanceCriterionDeleted":
		reqID, _ := eventMap["requirement_id"].(string)
		criterionID, _ := eventMap["criterion_id"].(string)
		criterion, err := mapToAcceptanceCriterion(eventMap["criterion"])
		if err != nil {
			return nil, fmt.Errorf("parse acceptance criterion snapshot: %w", err)
		}
		return &schema.AcceptanceCriterionDeleted{
			EventID_:      eventID,
			RequirementID: reqID,
			CriterionID:   criterionID,
			Criterion:     criterion,
			Timestamp_:    timestamp,
		}, nil

	case "CategoryAdded":
		name, _ := eventMap["name"].(string)
		return &schema.CategoryAdded{
			EventID_:   eventID,
			Name:       name,
			Timestamp_: timestamp,
		}, nil

	case "CategoryDeleted":
		name, _ := eventMap["name"].(string)
		return &schema.CategoryDeleted{
			EventID_:   eventID,
			Name:       name,
			Timestamp_: timestamp,
		}, nil

	case "CategoryRenamed":
		oldName, _ := eventMap["old_name"].(string)
		newName, _ := eventMap["new_name"].(string)
		return &schema.CategoryRenamed{
			EventID_:   eventID,
			OldName:    oldName,
			NewName:    newName,
			Timestamp_: timestamp,
		}, nil

	case "ProjectMetadataUpdated":
		oldMeta, err := mapToMetadata(eventMap["old_metadata"])
		if err != nil {
			return nil, fmt.Errorf("parse old_metadata: %w", err)
		}
		newMeta, err := mapToMetadata(eventMap["new_metadata"])
		if err != nil {
			return nil, fmt.Errorf("parse new_metadata: %w", err)
		}
		return &schema.ProjectMetadataUpdated{
			EventID_:    eventID,
			OldMetadata: oldMeta,
			NewMetadata: newMeta,
			Timestamp_:  timestamp,
		}, nil

	case "VersionBumped":
		oldVer, _ := eventMap["old_version"].(string)
		newVer, _ := eventMap["new_version"].(string)
		bumpType, _ := eventMap["bump_type"].(string)
		reasoning, _ := eventMap["reasoning"].(string)
		return &schema.VersionBumped{
			EventID_:   eventID,
			OldVersion: oldVer,
			NewVersion: newVer,
			BumpType:   bumpType,
			Reasoning:  reasoning,
			Timestamp_: timestamp,
		}, nil

	default:
		return nil, fmt.Errorf("unknown event type: %s", eventType)
	}
}

func mapToRequirement(data interface{}) (schema.Requirement, error) {
	// Type assertion to map
	reqMap, ok := data.(map[string]interface{})
	if !ok {
		return schema.Requirement{}, fmt.Errorf("requirement is not a map")
	}

	// Extract fields
	id, _ := reqMap["id"].(string)
	reqType, _ := reqMap["type"].(string)
	category, _ := reqMap["category"].(string)
	description, _ := reqMap["description"].(string)
	rationale, _ := reqMap["rationale"].(string)
	priority, _ := reqMap["priority"].(string)
	createdAt, _ := reqMap["created_at"].(time.Time)

	// Parse acceptance criteria
	criteria := []schema.AcceptanceCriterion{}
	if acList, ok := reqMap["acceptance_criteria"].([]interface{}); ok {
		for _, acData := range acList {
			ac, err := mapToAcceptanceCriterion(acData)
			if err != nil {
				return schema.Requirement{}, fmt.Errorf("parse acceptance criterion: %w", err)
			}
			criteria = append(criteria, ac)
		}
	}

	return schema.Requirement{
		ID:                 id,
		Type:               schema.EARSType(reqType),
		Category:           category,
		Description:        description,
		Rationale:          rationale,
		AcceptanceCriteria: criteria,
		Priority:           schema.Priority(priority),
		CreatedAt:          createdAt,
	}, nil
}

func mapToAcceptanceCriterion(data interface{}) (schema.AcceptanceCriterion, error) {
	acMap, ok := data.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("acceptance criterion is not a map")
	}

	acType, _ := acMap["type"].(string)
	id, _ := acMap["id"].(string)
	createdAt, _ := acMap["created_at"].(time.Time)

	switch acType {
	case "behavioral":
		given, _ := acMap["given"].(string)
		when, _ := acMap["when"].(string)
		then, _ := acMap["then"].(string)
		return &schema.BehavioralCriterion{
			ID:        id,
			Type:      acType,
			Given:     given,
			When:      when,
			Then:      then,
			CreatedAt: createdAt,
		}, nil

	case "assertion":
		statement, _ := acMap["statement"].(string)
		return &schema.AssertionCriterion{
			ID:        id,
			Type:      acType,
			Statement: statement,
			CreatedAt: createdAt,
		}, nil

	default:
		return nil, fmt.Errorf("unknown acceptance criterion type: %s", acType)
	}
}

func mapToMetadata(data interface{}) (schema.ProjectMetadata, error) {
	metaMap, ok := data.(map[string]interface{})
	if !ok {
		return schema.ProjectMetadata{}, fmt.Errorf("metadata is not a map")
	}

	name, _ := metaMap["name"].(string)
	description, _ := metaMap["description"].(string)
	version, _ := metaMap["version"].(string)
	createdAt, _ := metaMap["created_at"].(time.Time)
	updatedAt, _ := metaMap["updated_at"].(time.Time)

	return schema.ProjectMetadata{
		Name:        name,
		Description: description,
		Version:     version,
		CreatedAt:   createdAt,
		UpdatedAt:   updatedAt,
	}, nil
}
