package repository

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"xdd/pkg/schema"

	"gopkg.in/yaml.v3"
)

const (
	snapshotInterval = 100 // Create snapshot every 100 events
	snapshotDir      = "snapshots"
)

// SnapshotManager handles snapshot creation and loading.
type SnapshotManager struct {
	baseDir string
}

// NewSnapshotManager creates a new snapshot manager.
func NewSnapshotManager(baseDir string) *SnapshotManager {
	return &SnapshotManager{baseDir: baseDir}
}

// CreateSnapshot creates a snapshot of the current specification state.
func (sm *SnapshotManager) CreateSnapshot(spec *schema.Specification) error {
	// Ensure snapshots directory exists
	snapshotPath := filepath.Join(sm.baseDir, "01-specs", snapshotDir)
	if err := os.MkdirAll(snapshotPath, 0755); err != nil {
		return fmt.Errorf("create snapshots directory: %w", err)
	}

	// Generate timestamp-based filename
	timestamp := time.Now().UTC().Format("2006-01-02T15-04-05")
	filename := filepath.Join(snapshotPath, fmt.Sprintf("%s.yaml", timestamp))

	// Marshal specification to YAML
	data, err := yaml.Marshal(spec)
	if err != nil {
		return fmt.Errorf("marshal snapshot: %w", err)
	}

	// Write snapshot file
	if err := os.WriteFile(filename, data, 0644); err != nil {
		return fmt.Errorf("write snapshot: %w", err)
	}

	return nil
}

// LoadFromSnapshot loads the most recent snapshot and returns the spec + events since snapshot.
func (sm *SnapshotManager) LoadFromSnapshot() (*schema.Specification, []map[string]interface{}, error) {
	snapshotPath := filepath.Join(sm.baseDir, "01-specs", snapshotDir)

	// Find most recent snapshot
	snapshotFile, snapshotTime, err := sm.findMostRecentSnapshot(snapshotPath)
	if err != nil {
		// No snapshots found - return nil to signal full event replay
		if os.IsNotExist(err) {
			return nil, nil, nil
		}
		return nil, nil, fmt.Errorf("find snapshot: %w", err)
	}

	// Load snapshot
	data, err := os.ReadFile(snapshotFile)
	if err != nil {
		return nil, nil, fmt.Errorf("read snapshot: %w", err)
	}

	var spec schema.Specification
	if err := yaml.Unmarshal(data, &spec); err != nil {
		// Corrupted snapshot - fall back to full replay
		return nil, nil, nil
	}

	// Load changelog events that occurred after snapshot
	changelogPath := filepath.Join(sm.baseDir, "01-specs", "changelog.yaml")
	changelogData, err := os.ReadFile(changelogPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No changelog yet
			return &spec, nil, nil
		}
		return nil, nil, fmt.Errorf("read changelog: %w", err)
	}

	var changelog struct {
		Events []map[string]interface{} `yaml:"events"`
	}

	if err := yaml.Unmarshal(changelogData, &changelog); err != nil {
		return nil, nil, fmt.Errorf("parse changelog: %w", err)
	}

	// Filter events that occurred after snapshot
	eventsAfterSnapshot := []map[string]interface{}{}
	for _, event := range changelog.Events {
		if eventTime, ok := event["timestamp"].(time.Time); ok {
			if eventTime.After(snapshotTime) {
				eventsAfterSnapshot = append(eventsAfterSnapshot, event)
			}
		}
	}

	return &spec, eventsAfterSnapshot, nil
}

// findMostRecentSnapshot finds the most recent snapshot file.
func (sm *SnapshotManager) findMostRecentSnapshot(snapshotPath string) (string, time.Time, error) {
	entries, err := os.ReadDir(snapshotPath)
	if err != nil {
		return "", time.Time{}, err
	}

	if len(entries) == 0 {
		return "", time.Time{}, os.ErrNotExist
	}

	// Sort by filename (timestamp) descending
	var snapshotFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".yaml") {
			snapshotFiles = append(snapshotFiles, entry.Name())
		}
	}

	if len(snapshotFiles) == 0 {
		return "", time.Time{}, os.ErrNotExist
	}

	sort.Slice(snapshotFiles, func(i, j int) bool {
		return snapshotFiles[i] > snapshotFiles[j]
	})

	mostRecent := snapshotFiles[0]
	fullPath := filepath.Join(snapshotPath, mostRecent)

	// Parse timestamp from filename
	timestampStr := strings.TrimSuffix(mostRecent, ".yaml")
	snapshotTime, err := time.Parse("2006-01-02T15-04-05", timestampStr)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("parse snapshot timestamp: %w", err)
	}

	return fullPath, snapshotTime, nil
}

// UpdateChangelog updates the changelog metadata for snapshot tracking.
func (sm *SnapshotManager) UpdateChangelog(snapshotTimestamp string) error {
	changelogPath := filepath.Join(sm.baseDir, "01-specs", "changelog.yaml")

	// Read existing changelog
	data, err := os.ReadFile(changelogPath)
	if err != nil {
		return fmt.Errorf("read changelog: %w", err)
	}

	var changelog map[string]interface{}
	if err := yaml.Unmarshal(data, &changelog); err != nil {
		return fmt.Errorf("parse changelog: %w", err)
	}

	// Update snapshot metadata
	changelog["last_snapshot"] = snapshotTimestamp
	changelog["events_since_snapshot"] = 0

	// Write back
	updatedData, err := yaml.Marshal(changelog)
	if err != nil {
		return fmt.Errorf("marshal changelog: %w", err)
	}

	if err := os.WriteFile(changelogPath, updatedData, 0644); err != nil {
		return fmt.Errorf("write changelog: %w", err)
	}

	return nil
}

// ShouldCreateSnapshot determines if a snapshot should be created based on event count.
func (sm *SnapshotManager) ShouldCreateSnapshot(eventsSinceSnapshot int) bool {
	return eventsSinceSnapshot >= snapshotInterval
}
