package schema

import (
	"fmt"
	"regexp"
)

var semverPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

// ValidateMetadata validates project metadata.
func ValidateMetadata(m *ProjectMetadata) error {
	if len(m.Name) < MetadataNameMin || len(m.Name) > MetadataNameMax {
		return fmt.Errorf("name must be %d-%d characters", MetadataNameMin, MetadataNameMax)
	}
	if len(m.Description) < MetadataDescriptionMin || len(m.Description) > MetadataDescriptionMax {
		return fmt.Errorf("description must be %d-%d characters", MetadataDescriptionMin, MetadataDescriptionMax)
	}
	if !semverPattern.MatchString(m.Version) {
		return fmt.Errorf("version must follow semantic versioning (e.g., 1.0.0)")
	}
	return nil
}

// ValidateRequirement validates a requirement.
func ValidateRequirement(r *Requirement) error {
	// Validate EARS type
	switch r.Type {
	case EARSUbiquitous, EARSEvent, EARSState, EARSOptional:
		// Valid
	default:
		return fmt.Errorf("invalid EARS type: %s", r.Type)
	}

	// Validate priority
	switch r.Priority {
	case PriorityCritical, PriorityHigh, PriorityMedium, PriorityLow:
		// Valid
	default:
		return fmt.Errorf("invalid priority: %s", r.Priority)
	}

	// Validate category
	if len(r.Category) < CategoryNameMin || len(r.Category) > CategoryNameMax {
		return fmt.Errorf("category must be %d-%d characters", CategoryNameMin, CategoryNameMax)
	}

	// Validate description
	if len(r.Description) < RequirementDescriptionMin || len(r.Description) > RequirementDescriptionMax {
		return fmt.Errorf("description must be %d-%d characters", RequirementDescriptionMin, RequirementDescriptionMax)
	}

	// Validate rationale
	if len(r.Rationale) < RequirementRationaleMin || len(r.Rationale) > RequirementRationaleMax {
		return fmt.Errorf("rationale must be %d-%d characters", RequirementRationaleMin, RequirementRationaleMax)
	}

	// Validate acceptance criteria count
	if len(r.AcceptanceCriteria) < AcceptanceCriterionMin || len(r.AcceptanceCriteria) > AcceptanceCriterionMax {
		return fmt.Errorf("must have %d-%d acceptance criteria", AcceptanceCriterionMin, AcceptanceCriterionMax)
	}

	return nil
}

// ValidateBehavioralCriterion validates a behavioral acceptance criterion.
func ValidateBehavioralCriterion(b *BehavioralCriterion) error {
	if b.Type != "behavioral" {
		return fmt.Errorf("type must be 'behavioral'")
	}
	if len(b.Given) > GivenWhenThenMax {
		return fmt.Errorf("given must be at most %d characters", GivenWhenThenMax)
	}
	if len(b.When) > GivenWhenThenMax {
		return fmt.Errorf("when must be at most %d characters", GivenWhenThenMax)
	}
	if len(b.Then) > GivenWhenThenMax {
		return fmt.Errorf("then must be at most %d characters", GivenWhenThenMax)
	}
	return nil
}

// ValidateAssertionCriterion validates an assertion acceptance criterion.
func ValidateAssertionCriterion(a *AssertionCriterion) error {
	if a.Type != "assertion" {
		return fmt.Errorf("type must be 'assertion'")
	}
	if len(a.Statement) > AssertionStatementMax {
		return fmt.Errorf("statement must be at most %d characters", AssertionStatementMax)
	}
	return nil
}
