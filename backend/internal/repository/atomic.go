package repository

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// CopyOnWriteTx implements atomic file operations using copy-on-write pattern.
// All modifications happen in a temporary directory, then atomically swapped on commit.
type CopyOnWriteTx struct {
	baseDir   string // Original .xdd/ directory
	tempDir   string // Temporary .xdd.tmp.<timestamp>/ directory
	backupDir string // Backup .xdd.backup.<timestamp>/ directory
	committed bool   // Track if transaction was committed
}

// NewCopyOnWriteTx creates a new copy-on-write transaction.
func NewCopyOnWriteTx(baseDir string) *CopyOnWriteTx {
	timestamp := time.Now().Unix()
	return &CopyOnWriteTx{
		baseDir:   baseDir,
		tempDir:   fmt.Sprintf("%s.tmp.%d", baseDir, timestamp),
		backupDir: fmt.Sprintf("%s.backup.%d", baseDir, timestamp),
		committed: false,
	}
}

// Begin starts the transaction by copying the entire base directory to temp directory.
// Uses true file copying (not hard links) to ensure isolation.
func (tx *CopyOnWriteTx) Begin() error {
	// Check if base directory exists
	if _, err := os.Stat(tx.baseDir); err != nil {
		if os.IsNotExist(err) {
			// Base directory doesn't exist, create temp directory structure
			if err := os.MkdirAll(filepath.Join(tx.tempDir, "01-specs"), 0755); err != nil {
				return fmt.Errorf("create temp directory structure: %w", err)
			}
			return nil
		}
		return fmt.Errorf("stat base directory: %w", err)
	}

	// Copy entire directory tree using true file copying
	if err := copyDirRecursive(tx.baseDir, tx.tempDir); err != nil {
		// Clean up temp directory on failure (best effort, ignore error)
		_ = os.RemoveAll(tx.tempDir)
		return fmt.Errorf("copy directory tree: %w", err)
	}

	return nil
}

// WriteFile writes content to a file within the transaction's temp directory.
func (tx *CopyOnWriteTx) WriteFile(relativePath string, content []byte) error {
	if tx.committed {
		return fmt.Errorf("transaction already committed")
	}

	fullPath := filepath.Join(tx.tempDir, relativePath)

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("create parent directory: %w", err)
	}

	if err := os.WriteFile(fullPath, content, 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

// ReadFile reads a file from the transaction's temp directory.
func (tx *CopyOnWriteTx) ReadFile(relativePath string) ([]byte, error) {
	fullPath := filepath.Join(tx.tempDir, relativePath)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	return data, nil
}

// Commit atomically swaps the temp directory with the base directory.
func (tx *CopyOnWriteTx) Commit() error {
	if tx.committed {
		return fmt.Errorf("transaction already committed")
	}

	// Check if base directory exists
	baseExists := true
	if _, err := os.Stat(tx.baseDir); err != nil {
		if os.IsNotExist(err) {
			baseExists = false
		} else {
			return fmt.Errorf("stat base directory: %w", err)
		}
	}

	// Perform atomic swap
	if baseExists {
		// Step 1: Rename .xdd/ → .xdd.backup.<timestamp>/
		if err := os.Rename(tx.baseDir, tx.backupDir); err != nil {
			return fmt.Errorf("backup base directory: %w", err)
		}

		// Step 2: Rename .xdd.tmp.<timestamp>/ → .xdd/
		if err := os.Rename(tx.tempDir, tx.baseDir); err != nil {
			// Critical failure - attempt rollback
			if rollbackErr := os.Rename(tx.backupDir, tx.baseDir); rollbackErr != nil {
				// Double failure - system in inconsistent state
				return fmt.Errorf("commit failed and rollback failed: commit error: %w, rollback error: %v", err, rollbackErr)
			}
			return fmt.Errorf("commit base directory (rolled back): %w", err)
		}

		// Step 3: Delete backup on success
		if err := os.RemoveAll(tx.backupDir); err != nil {
			// Non-critical - backup left behind but transaction succeeded
			// Just log this in a real system
			_ = err
		}
	} else {
		// Base directory doesn't exist, just rename temp to base
		if err := os.Rename(tx.tempDir, tx.baseDir); err != nil {
			return fmt.Errorf("commit base directory (new): %w", err)
		}
	}

	tx.committed = true
	return nil
}

// Rollback removes the temp directory, discarding all changes.
func (tx *CopyOnWriteTx) Rollback() error {
	if tx.committed {
		return fmt.Errorf("cannot rollback committed transaction")
	}

	if err := os.RemoveAll(tx.tempDir); err != nil {
		return fmt.Errorf("rollback: %w", err)
	}

	return nil
}

// TempDir returns the path to the temporary directory.
func (tx *CopyOnWriteTx) TempDir() string {
	return tx.tempDir
}

// copyDirRecursive copies a directory tree using true file copying.
//
// Why not hard links? Hard links (os.Link) share the same inode, meaning both
// the original and "copy" paths point to the same physical data on disk.
// Writing to either path would modify both, breaking transaction isolation:
//
//	tx.Begin()              // Hard link .xdd/ → .xdd.tmp/
//	tx.WriteFile(...)       // Modifies BOTH .xdd/ and .xdd.tmp/
//	tx.Rollback()           // Too late - original already corrupted
//
// True file copying (io.Copy) creates independent physical copies, ensuring:
// - Transaction modifications stay isolated in temp directory
// - Original .xdd/ unchanged until atomic commit
// - Rollback is guaranteed safe
// - Works across filesystems (hard links require same device)
//
// Performance: ~5ms for 100 requirements vs ~1ms for hard links.
// Trade-off: Proper isolation is worth the 4ms overhead for our use case.
//
// See: docs/architecture/ADR-001-atomic-transactions-true-copy.md.
func copyDirRecursive(src, dst string) error {
	// Get source directory info
	srcInfo, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("stat source: %w", err)
	}

	// Create destination directory with same permissions
	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return fmt.Errorf("create destination: %w", err)
	}

	// Read source directory entries
	entries, err := os.ReadDir(src)
	if err != nil {
		return fmt.Errorf("read directory: %w", err)
	}

	// Copy each entry
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			// Recursively copy subdirectory
			if err := copyDirRecursive(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			// Copy file with true file copying
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

// copyFile copies a single file using io.Copy.
func copyFile(src, dst string) error {
	// Open source file
	srcFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer func() {
		if closeErr := srcFile.Close(); closeErr != nil {
			// Log error in production; ignored here as copy may have already failed
			_ = closeErr
		}
	}()

	// Get source file info for permissions
	srcInfo, err := srcFile.Stat()
	if err != nil {
		return fmt.Errorf("stat source: %w", err)
	}

	// Create destination file
	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return fmt.Errorf("create destination: %w", err)
	}
	defer func() {
		if closeErr := dstFile.Close(); closeErr != nil {
			// Log error in production; ignored here as copy may have already failed
			_ = closeErr
		}
	}()

	// Copy contents
	if _, err := io.Copy(dstFile, srcFile); err != nil {
		return fmt.Errorf("copy contents: %w", err)
	}

	return nil
}
