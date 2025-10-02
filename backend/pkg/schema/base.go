package schema

// EARSType represents the EARS classification type.
type EARSType string

const (
	EARSUbiquitous EARSType = "ubiquitous" // "The system shall always..."
	EARSEvent      EARSType = "event"      // "When X, the system shall..."
	EARSState      EARSType = "state"      // "While X, the system shall..."
	EARSOptional   EARSType = "optional"   // "Where X, the system shall..."
)

// Priority represents the requirement priority level.
type Priority string

const (
	PriorityCritical Priority = "critical" // System cannot function without this
	PriorityHigh     Priority = "high"     // Core feature, needed for MVP
	PriorityMedium   Priority = "medium"   // Important but not blocking
	PriorityLow      Priority = "low"      // Nice to have
)

// ValidationLimits defines the constraints for various fields.
const (
	RequirementDescriptionMin = 10
	RequirementDescriptionMax = 500
	RequirementRationaleMin   = 10
	RequirementRationaleMax   = 500
	MetadataNameMin           = 1
	MetadataNameMax           = 100
	MetadataDescriptionMin    = 10
	MetadataDescriptionMax    = 1000
	CategoryNameMin           = 1
	CategoryNameMax           = 20
	AcceptanceCriterionMin    = 1
	AcceptanceCriterionMax    = 10
	GivenWhenThenMax          = 200
	AssertionStatementMax     = 200
)
