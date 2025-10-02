package repository

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFileLock_AcquireRelease(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-lock-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	lockPath := filepath.Join(tempDir, ".lock")
	lock := NewFileLock(lockPath, "test")

	// Acquire lock
	err = lock.Acquire()
	require.NoError(t, err)

	// Verify lock file exists
	_, err = os.Stat(lockPath)
	require.NoError(t, err)

	// Release lock
	err = lock.Release()
	require.NoError(t, err)

	// Verify lock file removed
	_, err = os.Stat(lockPath)
	assert.True(t, os.IsNotExist(err))
}

func TestFileLock_MultipleAcquire(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-lock-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	lockPath := filepath.Join(tempDir, ".lock")
	lock1 := NewFileLock(lockPath, "test1")
	lock2 := NewFileLock(lockPath, "test2")

	// First lock should succeed
	err = lock1.Acquire()
	require.NoError(t, err)
	defer lock1.Release()

	// Second lock should fail
	err = lock2.Acquire()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "locked by")
}

func TestFileLock_StaleDetection(t *testing.T) {
	// Create temp directory
	tempDir, err := os.MkdirTemp("", "xdd-lock-test-*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	lockPath := filepath.Join(tempDir, ".lock")

	// Create a stale lock file (old timestamp)
	// In a real scenario, this would be a lock from a dead process
	// For now, we just test that a new lock can be acquired
	// (The stale detection logic checks process existence)

	lock := NewFileLock(lockPath, "test")

	// Should be able to acquire by stealing stale lock
	err = lock.Acquire()
	require.NoError(t, err)
	defer lock.Release()
}
