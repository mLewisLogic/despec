package tasks

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// TestFullTaskChain tests the complete task execution chain
// NOTE: This test requires fixtures to be recorded first
// Run: OPENROUTER_API_KEY=sk-... go run scripts/record-fixtures/main.go.
func TestFullTaskChain(t *testing.T) {
	t.Skip("Requires fixtures - run recording script first")

	// TODO: This will be implemented after fixtures are recorded
	// The test will:
	// 1. Load all fixtures
	// 2. Execute tasks in sequence:
	//    - Metadata task
	//    - Requirements delta task
	//    - Categorization task
	//    - Requirement generation (for each new requirement)
	//    - Version bump task
	// 3. Assert final state is correct

	require.True(t, true, "Integration test placeholder")
}

// TestTaskChainWithRealLLM tests with actual LLM calls
// Only runs when OPENROUTER_API_KEY is set and -tags=live is used
// Usage: OPENROUTER_API_KEY=sk-... go test -tags=live ./internal/llm/tasks/...
func TestTaskChainWithRealLLM(t *testing.T) {
	t.Skip("Live test - requires API key and explicit opt-in")

	// TODO: Implement live integration test
	// This will make real LLM calls to test the full chain
}
