package repository

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"syscall"
	"time"
)

// LockFile represents the metadata stored in .xdd/.lock.
type LockFile struct {
	PID       int       `json:"pid"`
	Hostname  string    `json:"hostname"`
	Interface string    `json:"interface"` // "cli" or "web"
	Timestamp time.Time `json:"timestamp"`
}

// FileLock manages the global file lock at .xdd/.lock.
type FileLock struct {
	path       string
	file       *os.File
	interface_ string
}

// NewFileLock creates a new file lock.
func NewFileLock(path, interfaceType string) *FileLock {
	return &FileLock{
		path:       path,
		interface_: interfaceType,
	}
}

// Acquire attempts to acquire the file lock with stale detection.
func (l *FileLock) Acquire() error {
	// Try to open/create lock file
	file, err := os.OpenFile(l.path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return fmt.Errorf("open lock file: %w", err)
	}

	// Try exclusive lock (non-blocking)
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if closeErr := file.Close(); closeErr != nil {
			log.Printf("warning: failed to close lock file during error handling: %v", closeErr)
		}

		// Lock is held - check if stale
		existing, readErr := l.readLockFile()
		if readErr == nil && l.isStale(existing) {
			// Stale lock - steal it
			return l.stealLock()
		}

		if readErr == nil {
			age := time.Since(existing.Timestamp).Round(time.Second)
			return fmt.Errorf("specification locked by %s (PID %d, %v ago)",
				existing.Interface, existing.PID, age)
		}

		return fmt.Errorf("failed to acquire lock: %w", err)
	}

	l.file = file

	// Write lock metadata
	hostname, _ := os.Hostname()
	lockData := LockFile{
		PID:       os.Getpid(),
		Hostname:  hostname,
		Interface: l.interface_,
		Timestamp: time.Now(),
	}

	data, _ := json.MarshalIndent(lockData, "", "  ")
	if err := file.Truncate(0); err != nil {
		return fmt.Errorf("truncate lock file: %w", err)
	}
	if _, err := file.Seek(0, 0); err != nil {
		return fmt.Errorf("seek lock file: %w", err)
	}
	if _, err := file.Write(data); err != nil {
		return fmt.Errorf("write lock metadata: %w", err)
	}

	return nil
}

// Release releases the file lock.
func (l *FileLock) Release() error {
	if l.file == nil {
		return nil
	}

	// Release flock (best-effort, log errors)
	if err := syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN); err != nil {
		log.Printf("warning: failed to release flock: %v", err)
	}
	if err := l.file.Close(); err != nil {
		log.Printf("warning: failed to close lock file: %v", err)
	}

	// Remove lock file
	return os.Remove(l.path)
}

// readLockFile reads the current lock metadata.
func (l *FileLock) readLockFile() (*LockFile, error) {
	data, err := os.ReadFile(l.path)
	if err != nil {
		return nil, err
	}

	var lock LockFile
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, err
	}

	return &lock, nil
}

// isStale checks if a lock is stale (process dead or >30min old).
func (l *FileLock) isStale(lock *LockFile) bool {
	// Check if process exists
	process, err := os.FindProcess(lock.PID)
	if err != nil {
		return true // Process not found
	}

	// On Unix, FindProcess always succeeds, so we need to signal to check
	err = process.Signal(syscall.Signal(0))
	if err != nil {
		return true // Process dead
	}

	// Check age (30 minute timeout)
	if time.Since(lock.Timestamp) > 30*time.Minute {
		return true
	}

	return false
}

// stealLock forcibly steals a stale lock.
func (l *FileLock) stealLock() error {
	// Remove stale lock file (best-effort, ignore error)
	_ = os.Remove(l.path)

	// Acquire normally
	return l.Acquire()
}
