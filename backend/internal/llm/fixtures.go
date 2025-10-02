package llm

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Fixture represents a recorded LLM interaction for testing.
type Fixture struct {
	Name      string          `json:"name"`
	Input     json.RawMessage `json:"input"`
	Output    json.RawMessage `json:"output"`
	Model     string          `json:"model"`
	Timestamp time.Time       `json:"timestamp"`
}

// UnmarshalInput unmarshals the fixture input into the specified type.
func (f *Fixture) UnmarshalInput(v interface{}) error {
	return json.Unmarshal(f.Input, v)
}

// UnmarshalOutput unmarshals the fixture output into the specified type.
func (f *Fixture) UnmarshalOutput(v interface{}) error {
	return json.Unmarshal(f.Output, v)
}

// LoadFixture loads a fixture from the testdata directory.
func LoadFixture(name string) (*Fixture, error) {
	// Construct path to fixture file (must match record-fixtures.go path)
	fixturePath := filepath.Join("internal", "llm", "testdata", "fixtures", name+".json")

	// Read fixture file
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("fixture not found: %s\n\nFixtures not recorded. Run:\n  OPENROUTER_API_KEY=sk-... go run scripts/record-fixtures/main.go", name)
		}
		return nil, fmt.Errorf("read fixture %s: %w", name, err)
	}

	// Parse fixture
	var fixture Fixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		return nil, fmt.Errorf("parse fixture %s (invalid JSON): %w", name, err)
	}

	// Validate fixture has required fields
	if fixture.Name == "" {
		return nil, fmt.Errorf("fixture %s: missing 'name' field", name)
	}
	if fixture.Model == "" {
		return nil, fmt.Errorf("fixture %s: missing 'model' field", name)
	}
	if len(fixture.Input) == 0 {
		return nil, fmt.Errorf("fixture %s: missing 'input' field", name)
	}
	if len(fixture.Output) == 0 {
		return nil, fmt.Errorf("fixture %s: missing 'output' field", name)
	}

	return &fixture, nil
}

// SaveFixture saves a fixture to the testdata directory.
func SaveFixture(name string, fixture *Fixture) error {
	// Validate fixture has required fields before saving
	if fixture.Name == "" {
		return fmt.Errorf("fixture missing 'name' field")
	}
	if fixture.Model == "" {
		return fmt.Errorf("fixture missing 'model' field")
	}
	if len(fixture.Input) == 0 {
		return fmt.Errorf("fixture missing 'input' field")
	}
	if len(fixture.Output) == 0 {
		return fmt.Errorf("fixture missing 'output' field")
	}

	// Ensure testdata/fixtures directory exists (must match record-fixtures.go path)
	fixturesDir := filepath.Join("internal", "llm", "testdata", "fixtures")
	if err := os.MkdirAll(fixturesDir, 0755); err != nil {
		return fmt.Errorf("create fixtures directory: %w", err)
	}

	// Marshal fixture to JSON
	data, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal fixture: %w", err)
	}

	// Write fixture file atomically (write to temp, then rename)
	fixturePath := filepath.Join(fixturesDir, name+".json")
	tempPath := fixturePath + ".tmp"

	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return fmt.Errorf("write temp fixture %s: %w", name, err)
	}

	if err := os.Rename(tempPath, fixturePath); err != nil {
		_ = os.Remove(tempPath) // Best effort cleanup, ignore error
		return fmt.Errorf("rename fixture %s: %w", name, err)
	}

	return nil
}
