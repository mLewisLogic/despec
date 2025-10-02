package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"xdd/internal/llm"
)

func main() {
	// Check API key
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		fmt.Println("❌ OPENROUTER_API_KEY not set")
		fmt.Println("   Set it with: export OPENROUTER_API_KEY=sk-or-v1-...")
		os.Exit(1)
	}

	// Create client
	config := &llm.Config{
		APIKey:       apiKey,
		BaseURL:      "https://openrouter.ai/api/v1",
		DefaultModel: "anthropic/claude-3.5-sonnet",
	}

	client, err := llm.NewClient(config)
	if err != nil {
		fmt.Printf("❌ Failed to create client: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("🤖 xdd LLM Infrastructure Demo")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	// Demo 1: Simple structured output
	demo1(client)
	fmt.Println()

	// Demo 2: Validation and retry
	demo2(client)
	fmt.Println()

	// Demo 3: Prompt builder
	demo3(client)
	fmt.Println()

	fmt.Println("✨ All demos completed successfully!")
}

func demo1(client *llm.Client) {
	fmt.Println("📊 Demo 1: Simple Structured Output")
	fmt.Println("   Generating a random person with Claude...")

	type Person struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	prompt := `Generate a random person. You MUST return ONLY valid JSON with this exact structure: {"name": "string", "age": number}. The age must be between 20 and 40.`

	result, err := llm.GenerateStructured[Person](
		client,
		context.Background(),
		"",
		prompt,
		nil,
	)

	if err != nil {
		fmt.Printf("   ❌ Failed: %v\n", err)
		return
	}

	fmt.Printf("   ✅ Generated: %s (age %d)\n", result.Name, result.Age)
}

func demo2(client *llm.Client) {
	fmt.Println("🔄 Demo 2: Validation with Retry")
	fmt.Println("   Requesting a number between 55-58 (strict validation)...")

	type Number struct {
		Value int `json:"value"`
	}

	prompt := `Generate a random number between 50 and 60. Return ONLY JSON: {"value": number}`

	attempts := 0
	result, err := llm.GenerateStructured[Number](
		client,
		context.Background(),
		"",
		prompt,
		func(n *Number) error {
			attempts++
			fmt.Printf("   → Attempt %d: value=%d", attempts, n.Value)

			if n.Value < 55 || n.Value > 58 {
				fmt.Printf(" ❌ (out of range 55-58)\n")
				return errors.New("value must be between 55 and 58")
			}

			fmt.Printf(" ✅\n")
			return nil
		},
	)

	if err != nil {
		fmt.Printf("   ❌ Failed after %d attempts: %v\n", attempts, err)
		return
	}

	fmt.Printf("   ✅ Succeeded: value=%d (after %d attempts)\n", result.Value, attempts)
}

func demo3(client *llm.Client) {
	fmt.Println("📝 Demo 3: Prompt Builder Integration")
	fmt.Println("   Using BuildMetadataPrompt for project metadata...")

	type MetadataOutput struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Changed     struct {
			Name        bool `json:"name"`
			Description bool `json:"description"`
		} `json:"changed"`
		Reasoning string `json:"reasoning"`
	}

	prompt := llm.BuildMetadataPrompt(nil, "Build a real-time chat application with WebSocket support")

	result, err := llm.GenerateStructured[MetadataOutput](
		client,
		context.Background(),
		"",
		prompt,
		func(m *MetadataOutput) error {
			if m.Name == "" || len(m.Name) > 100 {
				return errors.New("name must be 1-100 chars")
			}
			if len(m.Description) < 10 || len(m.Description) > 1000 {
				return errors.New("description must be 10-1000 chars")
			}
			return nil
		},
	)

	if err != nil {
		fmt.Printf("   ❌ Failed: %v\n", err)
		return
	}

	fmt.Printf("   ✅ Project Name: %s\n", result.Name)
	fmt.Printf("   ✅ Description: %s\n", result.Description)
	fmt.Printf("   ℹ️  Reasoning: %s\n", result.Reasoning)
}
