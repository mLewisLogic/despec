package schema

import (
	"fmt"
	"strings"

	gonanoid "github.com/matoous/go-nanoid/v2"
)

// NewRequirementID generates a new requirement ID in format REQ-{CATEGORY}-{nanoid(10)}.
func NewRequirementID(category string) (string, error) {
	id, err := gonanoid.New(10)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("REQ-%s-%s", strings.ToUpper(category), id), nil
}

// NewAcceptanceCriterionID generates a new acceptance criterion ID in format AC-{nanoid(10)}.
func NewAcceptanceCriterionID() (string, error) {
	id, err := gonanoid.New(10)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("AC-%s", id), nil
}

// NewEventID generates a new event ID in format EVT-{nanoid(10)}.
func NewEventID() (string, error) {
	id, err := gonanoid.New(10)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("EVT-%s", id), nil
}
