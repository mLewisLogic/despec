package repository

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyOnWriteTx_NewProject(t *testing.T) {
	// Create temp directory for test
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Transaction on non-existent directory
	tx := NewCopyOnWriteTx(baseDir)

	// Begin should create temp directory structure
	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Verify temp directory was created
	if _, err := os.Stat(tx.TempDir()); err != nil {
		t.Errorf("temp directory not created: %v", err)
	}

	// Write a file
	content := []byte("test content")
	if err := tx.WriteFile("01-specs/specification.yaml", content); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// Commit
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Verify base directory now exists with correct content
	data, err := os.ReadFile(filepath.Join(baseDir, "01-specs/specification.yaml"))
	if err != nil {
		t.Fatalf("failed to read committed file: %v", err)
	}

	if string(data) != string(content) {
		t.Errorf("committed content = %q, want %q", data, content)
	}

	// Verify temp directory was cleaned up
	if _, err := os.Stat(tx.TempDir()); !os.IsNotExist(err) {
		t.Errorf("temp directory not cleaned up")
	}
}

func TestCopyOnWriteTx_ExistingProject(t *testing.T) {
	// Create temp directory with existing .xdd/
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Create existing structure
	if err := os.MkdirAll(filepath.Join(baseDir, "01-specs"), 0755); err != nil {
		t.Fatalf("failed to create base directory: %v", err)
	}

	originalContent := []byte("original content")
	if err := os.WriteFile(filepath.Join(baseDir, "01-specs/specification.yaml"), originalContent, 0644); err != nil {
		t.Fatalf("failed to write original file: %v", err)
	}

	// Start transaction
	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Verify original content was copied
	data, err := tx.ReadFile("01-specs/specification.yaml")
	if err != nil {
		t.Fatalf("ReadFile() failed: %v", err)
	}

	if string(data) != string(originalContent) {
		t.Errorf("copied content = %q, want %q", data, originalContent)
	}

	// Modify file in transaction
	newContent := []byte("updated content")
	if err := tx.WriteFile("01-specs/specification.yaml", newContent); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// Verify base directory still has original content
	data, err = os.ReadFile(filepath.Join(baseDir, "01-specs/specification.yaml"))
	if err != nil {
		t.Fatalf("failed to read base file: %v", err)
	}

	if string(data) != string(originalContent) {
		t.Errorf("base content modified during transaction = %q, want %q", data, originalContent)
	}

	// Commit
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Verify base directory now has new content
	data, err = os.ReadFile(filepath.Join(baseDir, "01-specs/specification.yaml"))
	if err != nil {
		t.Fatalf("failed to read committed file: %v", err)
	}

	if string(data) != string(newContent) {
		t.Errorf("committed content = %q, want %q", data, newContent)
	}
}

func TestCopyOnWriteTx_Rollback(t *testing.T) {
	// Create temp directory with existing .xdd/
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Create existing structure
	if err := os.MkdirAll(filepath.Join(baseDir, "01-specs"), 0755); err != nil {
		t.Fatalf("failed to create base directory: %v", err)
	}

	originalContent := []byte("original content")
	if err := os.WriteFile(filepath.Join(baseDir, "01-specs/specification.yaml"), originalContent, 0644); err != nil {
		t.Fatalf("failed to write original file: %v", err)
	}

	// Start transaction
	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Modify file in transaction
	newContent := []byte("updated content")
	if err := tx.WriteFile("01-specs/specification.yaml", newContent); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// Rollback
	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback() failed: %v", err)
	}

	// Verify base directory still has original content
	data, err := os.ReadFile(filepath.Join(baseDir, "01-specs/specification.yaml"))
	if err != nil {
		t.Fatalf("failed to read base file: %v", err)
	}

	if string(data) != string(originalContent) {
		t.Errorf("base content = %q, want %q (rollback failed)", data, originalContent)
	}

	// Verify temp directory was cleaned up
	if _, err := os.Stat(tx.TempDir()); !os.IsNotExist(err) {
		t.Errorf("temp directory not cleaned up after rollback")
	}
}

func TestCopyOnWriteTx_MultipleFiles(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Write multiple files
	files := map[string]string{
		"01-specs/specification.yaml": "spec content",
		"01-specs/changelog.yaml":     "changelog content",
		"config.yaml":                 "config content",
	}

	for path, content := range files {
		if err := tx.WriteFile(path, []byte(content)); err != nil {
			t.Fatalf("WriteFile(%q) failed: %v", path, err)
		}
	}

	// Commit
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Verify all files were written
	for path, expectedContent := range files {
		data, err := os.ReadFile(filepath.Join(baseDir, path))
		if err != nil {
			t.Errorf("failed to read %q: %v", path, err)
			continue
		}

		if string(data) != expectedContent {
			t.Errorf("content of %q = %q, want %q", path, data, expectedContent)
		}
	}
}

func TestCopyOnWriteTx_DoubleCommit(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	if err := tx.WriteFile("test.txt", []byte("content")); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// First commit should succeed
	if err := tx.Commit(); err != nil {
		t.Fatalf("first Commit() failed: %v", err)
	}

	// Second commit should fail
	if err := tx.Commit(); err == nil {
		t.Error("second Commit() should fail, but succeeded")
	}
}

func TestCopyOnWriteTx_RollbackAfterCommit(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	if err := tx.WriteFile("test.txt", []byte("content")); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Rollback after commit should fail
	if err := tx.Rollback(); err == nil {
		t.Error("Rollback() after Commit() should fail, but succeeded")
	}
}

func TestCopyOnWriteTx_IsolationGuarantee(t *testing.T) {
	// Test that modifications in temp directory don't affect base directory
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Create existing file
	if err := os.MkdirAll(filepath.Join(baseDir, "01-specs"), 0755); err != nil {
		t.Fatalf("failed to create base directory: %v", err)
	}

	originalContent := []byte("original")
	if err := os.WriteFile(filepath.Join(baseDir, "01-specs/file.yaml"), originalContent, 0644); err != nil {
		t.Fatalf("failed to write original file: %v", err)
	}

	// Start transaction
	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Modify file in transaction
	if err := tx.WriteFile("01-specs/file.yaml", []byte("modified")); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// Read directly from base directory - should still have original content
	data, err := os.ReadFile(filepath.Join(baseDir, "01-specs/file.yaml"))
	if err != nil {
		t.Fatalf("failed to read base file: %v", err)
	}

	if string(data) != string(originalContent) {
		t.Errorf("base directory was modified during transaction: got %q, want %q", data, originalContent)
	}

	// Rollback to verify isolation
	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback() failed: %v", err)
	}

	// Base directory should still be unchanged
	data, err = os.ReadFile(filepath.Join(baseDir, "01-specs/file.yaml"))
	if err != nil {
		t.Fatalf("failed to read base file after rollback: %v", err)
	}

	if string(data) != string(originalContent) {
		t.Errorf("base directory modified after rollback: got %q, want %q", data, originalContent)
	}
}

func TestCopyOnWriteTx_NestedDirectories(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Create existing nested structure
	nestedPath := filepath.Join(baseDir, "01-specs/snapshots/2025-10-01")
	if err := os.MkdirAll(nestedPath, 0755); err != nil {
		t.Fatalf("failed to create nested directory: %v", err)
	}

	if err := os.WriteFile(filepath.Join(nestedPath, "snapshot.yaml"), []byte("snapshot"), 0644); err != nil {
		t.Fatalf("failed to write nested file: %v", err)
	}

	// Start transaction
	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Verify nested file was copied
	data, err := tx.ReadFile("01-specs/snapshots/2025-10-01/snapshot.yaml")
	if err != nil {
		t.Fatalf("ReadFile() failed for nested file: %v", err)
	}

	if string(data) != "snapshot" {
		t.Errorf("nested file content = %q, want %q", data, "snapshot")
	}

	// Modify nested file
	if err := tx.WriteFile("01-specs/snapshots/2025-10-01/snapshot.yaml", []byte("updated snapshot")); err != nil {
		t.Fatalf("WriteFile() failed for nested file: %v", err)
	}

	// Commit
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Verify nested file was updated
	data, err = os.ReadFile(filepath.Join(baseDir, "01-specs/snapshots/2025-10-01/snapshot.yaml"))
	if err != nil {
		t.Fatalf("failed to read committed nested file: %v", err)
	}

	if string(data) != "updated snapshot" {
		t.Errorf("committed nested file = %q, want %q", data, "updated snapshot")
	}
}

func TestCopyOnWriteTx_WriteAfterCommit(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// WriteFile after commit should fail
	if err := tx.WriteFile("test.txt", []byte("content")); err == nil {
		t.Error("WriteFile() after Commit() should fail, but succeeded")
	}
}

func TestCopyOnWriteTx_ReadNonExistentFile(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Try to read non-existent file
	_, err := tx.ReadFile("nonexistent.txt")
	if err == nil {
		t.Error("ReadFile() for non-existent file should fail, but succeeded")
	}

	tx.Rollback()
}

func TestCopyOnWriteTx_EmptyDirectory(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Create empty base directory
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		t.Fatalf("failed to create base directory: %v", err)
	}

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Write a file
	if err := tx.WriteFile("test.txt", []byte("content")); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// Commit
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Verify file exists in base directory
	data, err := os.ReadFile(filepath.Join(baseDir, "test.txt"))
	if err != nil {
		t.Fatalf("failed to read committed file: %v", err)
	}

	if string(data) != "content" {
		t.Errorf("committed content = %q, want %q", data, "content")
	}
}

func TestCopyOnWriteTx_PreserveFilePermissions(t *testing.T) {
	tempDir := t.TempDir()
	baseDir := filepath.Join(tempDir, ".xdd")

	// Create base directory with a file with specific permissions
	if err := os.MkdirAll(filepath.Join(baseDir, "subdir"), 0755); err != nil {
		t.Fatalf("failed to create base directory: %v", err)
	}

	originalPath := filepath.Join(baseDir, "subdir/file.txt")
	if err := os.WriteFile(originalPath, []byte("original"), 0600); err != nil {
		t.Fatalf("failed to write original file: %v", err)
	}

	tx := NewCopyOnWriteTx(baseDir)

	if err := tx.Begin(); err != nil {
		t.Fatalf("Begin() failed: %v", err)
	}

	// Modify different file
	if err := tx.WriteFile("other.txt", []byte("other")); err != nil {
		t.Fatalf("WriteFile() failed: %v", err)
	}

	// Commit
	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit() failed: %v", err)
	}

	// Verify original file permissions are preserved
	info, err := os.Stat(filepath.Join(baseDir, "subdir/file.txt"))
	if err != nil {
		t.Fatalf("failed to stat file: %v", err)
	}

	if info.Mode().Perm() != 0600 {
		t.Errorf("file permissions = %o, want %o", info.Mode().Perm(), 0600)
	}
}
