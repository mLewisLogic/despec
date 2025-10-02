package core

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"

	"xdd/internal/llm"
	"xdd/internal/repository"
	"xdd/pkg/schema"
)

// CLISession manages an interactive CLI session.
type CLISession struct {
	State        *SessionState
	Orchestrator *Orchestrator
	Lock         *repository.FileLock
	Repo         *repository.Repository
}

// NewCLISession creates a new CLI session with an LLM client.
func NewCLISession(llmClient *llm.Client, repo *repository.Repository) *CLISession {
	return &CLISession{
		State:        NewSessionState(),
		Orchestrator: NewOrchestratorWithLLMClient(llmClient, repo),
		Lock:         repository.NewFileLock(".xdd/.lock", "cli"),
		Repo:         repo,
	}
}

// NewCLISessionWithExecutor creates a new CLI session with a TaskExecutor (for testing).
func NewCLISessionWithExecutor(executor TaskExecutor, repo *repository.Repository) *CLISession {
	return &CLISession{
		State:        NewSessionState(),
		Orchestrator: NewOrchestrator(executor, repo),
		Lock:         repository.NewFileLock(".xdd/.lock", "cli"),
		Repo:         repo,
	}
}

// Run executes the interactive session loop.
func (s *CLISession) Run(initialPrompt string) error {
	// Acquire lock
	fmt.Println("🔒 Acquiring lock...")
	if err := s.Lock.Acquire(); err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	defer func() {
		if err := s.Lock.Release(); err != nil {
			fmt.Fprintf(os.Stderr, "⚠️  Failed to release lock: %v\n", err)
		}
	}()
	fmt.Println("✅ Lock acquired")

	ctx := context.Background()
	prompt := initialPrompt

	// Interactive loop
	for !s.State.Committed {
		fmt.Println("🤖 Analyzing request...")

		newState, err := s.Orchestrator.ProcessPrompt(ctx, s.State, prompt)
		if err != nil {
			return fmt.Errorf("orchestration failed: %w", err)
		}
		s.State = newState

		// Check if awaiting feedback
		if s.State.AwaitingFeedback {
			lastMsg := s.State.Messages[len(s.State.Messages)-1]
			fmt.Printf("\n📝 %s\n> ", lastMsg.Content)
			reader := bufio.NewReader(os.Stdin)
			feedback, _ := reader.ReadString('\n')
			prompt = strings.TrimSpace(feedback)
			s.State.AwaitingFeedback = false
			continue
		}

		// Show changelog preview
		fmt.Println("\n📊 Proposed Changes:")
		displayChangelog(s.State.PendingChangelog)

		// Confirm
		fmt.Print("\nAre you satisfied? [yes/no/feedback]: ")
		reader := bufio.NewReader(os.Stdin)
		response, _ := reader.ReadString('\n')
		response = strings.TrimSpace(response)

		switch strings.ToLower(response) {
		case "yes", "y":
			// Commit
			if err := s.commit(); err != nil {
				return fmt.Errorf("commit failed: %w", err)
			}
			s.State.Committed = true

		case "no", "n":
			fmt.Println("❌ Changes discarded.")
			return nil

		default:
			// Treat as feedback
			fmt.Println()
			prompt = response
		}
	}

	fmt.Println("\n🔓 Releasing lock")
	fmt.Println("\n✨ Specification complete!")
	return nil
}

// commit writes changes to disk.
func (s *CLISession) commit() error {
	fmt.Println("\n✅ Committing changes...")

	// Load current spec to merge changes
	spec, err := s.Repo.ReadSpecification()
	if err != nil {
		return fmt.Errorf("load spec: %w", err)
	}

	// Apply changes from changelog
	for _, event := range s.State.PendingChangelog {
		switch e := event.(type) {
		case *schema.RequirementAdded:
			spec.Requirements = append(spec.Requirements, e.Requirement)

		case *schema.RequirementDeleted:
			// Remove requirement
			filtered := []schema.Requirement{}
			for _, req := range spec.Requirements {
				if req.ID != e.RequirementID {
					filtered = append(filtered, req)
				}
			}
			spec.Requirements = filtered

		case *schema.ProjectMetadataUpdated:
			spec.Metadata = e.NewMetadata

		case *schema.CategoryAdded:
			spec.Categories = append(spec.Categories, e.Name)

		case *schema.CategoryDeleted:
			// Remove category
			filtered := []string{}
			for _, cat := range spec.Categories {
				if cat != e.Name {
					filtered = append(filtered, cat)
				}
			}
			spec.Categories = filtered
		}
	}

	// Write specification and changelog atomically
	if err := s.Repo.WriteSpecificationAndChangelog(spec, s.State.PendingChangelog); err != nil {
		return fmt.Errorf("write specification and changelog: %w", err)
	}
	fmt.Println("   Writing specification.yaml")
	fmt.Println("   Writing changelog.yaml")

	return nil
}

// displayChangelog formats and prints changelog events.
func displayChangelog(events []schema.ChangelogEvent) {
	for _, event := range events {
		switch e := event.(type) {
		case *schema.RequirementAdded:
			fmt.Printf("  [+] %s: %s\n", e.Requirement.ID, truncate(e.Requirement.Description, 80))
			fmt.Printf("      Category: %s, Priority: %s\n", e.Requirement.Category, e.Requirement.Priority)
			fmt.Printf("      Acceptance Criteria: %d\n", len(e.Requirement.AcceptanceCriteria))

		case *schema.RequirementDeleted:
			fmt.Printf("  [-] %s: %s\n", e.RequirementID, truncate(e.Requirement.Description, 80))

		case *schema.ProjectMetadataUpdated:
			if e.OldMetadata.Name != e.NewMetadata.Name {
				fmt.Printf("  [*] Project Name: %s → %s\n", e.OldMetadata.Name, e.NewMetadata.Name)
			}
			if e.OldMetadata.Description != e.NewMetadata.Description {
				fmt.Printf("  [*] Description updated\n")
			}

		case *schema.VersionBumped:
			fmt.Printf("  [V] Version: %s → %s (%s)\n", e.OldVersion, e.NewVersion, e.BumpType)
			fmt.Printf("      Reason: %s\n", truncate(e.Reasoning, 80))

		case *schema.CategoryAdded:
			fmt.Printf("  [+] Category: %s\n", e.Name)

		case *schema.CategoryDeleted:
			fmt.Printf("  [-] Category: %s\n", e.Name)
		}
	}
}

// truncate truncates a string to max length.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
