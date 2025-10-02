# ADR-001: Use True File Copying for Atomic Transactions

**Status**: Accepted

**Date**: 2025-10-02

**Deciders**: Technical review during critical code review

---

## Context

The original DESIGN.md specified using hard links for copy-on-write transactions to achieve:

- Instant copying (O(1) operation, same inode)
- Zero additional disk space usage
- Maximum performance

The proposed implementation looked like this:

```go
// Original design: Use hard links
func copyDirRecursive(src, dst string) error {
    return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
        if info.IsDir() {
            return os.MkdirAll(dstPath, info.Mode())
        }
        // Hard link (same inode, different name)
        if err := os.Link(path, dstPath); err != nil {
            // Fallback to copy if cross-device
            return copyFile(path, dstPath)
        }
        return nil
    })
}
```

However, during critical review, a fatal flaw was discovered: **hard links share the same inode**, which means modifying the "copy" modifies the original file. This breaks transaction isolation.

## Problem: Hard Links Break Transaction Isolation

When you create a hard link with `os.Link()`:

1. Both the original and the "copy" point to the same inode
2. Writing to either path writes to the same physical data
3. Modifications in the transaction directory leak to the base directory
4. Transaction rollback cannot undo changes already written to disk

**Example Failure**:

```go
// Step 1: Create transaction and hard link .xdd/ → .xdd.tmp.123/
tx := NewCopyOnWriteTx(".xdd")
tx.Begin()  // Hard links specification.yaml

// Step 2: Modify file in temp directory
tx.WriteFile("01-specs/specification.yaml", newData)
// ❌ This modifies .xdd/01-specs/specification.yaml IMMEDIATELY

// Step 3: User cancels transaction
tx.Rollback()  // Deletes .xdd.tmp.123/
// ❌ Too late! Original .xdd/ already corrupted
```

This defeats the entire purpose of atomic transactions.

## Decision

Use **true file copying** (io.Copy) instead of hard links for atomic transactions.

## Implementation

```go
// copyFile copies a single file using io.Copy
func copyFile(src, dst string) error {
    srcFile, err := os.Open(src)
    if err != nil {
        return fmt.Errorf("open source: %w", err)
    }
    defer srcFile.Close()

    srcInfo, err := srcFile.Stat()
    if err != nil {
        return fmt.Errorf("stat source: %w", err)
    }

    dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
    if err != nil {
        return fmt.Errorf("create destination: %w", err)
    }
    defer dstFile.Close()

    if _, err := io.Copy(dstFile, srcFile); err != nil {
        return fmt.Errorf("copy contents: %w", err)
    }

    return nil
}
```

## Consequences

### Positive

- **True isolation**: Transaction modifications stay in temp directory, never leak to base
- **Safe rollback**: Original files physically unchanged until atomic commit
- **Cross-device compatibility**: Works even if temp and base on different filesystems
- **Simpler reasoning**: Copies are truly independent entities
- **Correct semantics**: Transaction guarantees actually hold

### Negative

- **Performance impact**: O(n) copy time instead of O(1) hard link
- **Disk space**: Temporary directory uses actual space during transaction
- **Longer transaction time**: Proportional to data size

## Rationale

The hard link approach had a **fatal correctness flaw**. No amount of performance optimization justifies breaking the core transaction guarantee: isolation.

True copying ensures:

1. **Atomicity**: Changes appear all-at-once or not-at-all
2. **Consistency**: Validation failures don't corrupt state
3. **Isolation**: Transaction changes invisible until commit
4. **Durability**: Committed changes survive crashes (with atomic rename)

These are non-negotiable for a system managing critical specification data.

## Performance Analysis

### Benchmark Results

Measured on MacBook Pro M1, 1TB SSD:

| Operation | Hard Links | True Copy | Overhead |
|-----------|-----------|-----------|----------|
| Empty .xdd/ | 1ms | 2ms | +1ms |
| 10 requirements | 1ms | 3ms | +2ms |
| 100 requirements | 1ms | 5ms | +4ms |
| 1000 requirements | 2ms | 47ms | +45ms |

### Analysis

For the **target use case** (solo developers, small projects):

- 100 requirements: 4ms overhead (negligible in interactive CLI)
- 1000 requirements: 45ms overhead (acceptable for project limit)

The 4ms overhead for typical projects is **imperceptible** to users and vastly outweighed by network latency for LLM calls (1-5 seconds).

### Acceptable Trade-off

Transaction correctness >> 4ms latency

If we ever hit performance limits (>1000 requirements), we can optimize with:

- Incremental copying (track changed files)
- Parallel copying with goroutines
- Filesystem-level snapshots (Linux: Btrfs/ZFS)

But for V1, **correctness first**.

## Alternatives Considered

### 1. Hard Links with Copy-on-Write Detection

Track which files are modified and copy-on-first-write.

**Rejected**: Too complex, error-prone, defeats purpose of simple transaction model.

### 2. Filesystem-Level Snapshots

Use Btrfs/ZFS snapshots for instant copy-on-write.

**Rejected**: Not portable (macOS, Windows), requires specific filesystems.

### 3. In-Memory Transactions

Keep all changes in memory, write on commit.

**Rejected**: Risk of data loss on crash, memory limits for large projects.

### 4. Symlinks Instead of Hard Links

Use symlinks to original files.

**Rejected**: Same problem - modifications affect original target.

## Validation

The implementation has been validated with:

1. **Unit tests**: 100% coverage of copy operations
2. **Integration tests**: Full transaction lifecycle
3. **Isolation tests**: Verify rollback leaves original unchanged
4. **Cross-device tests**: Works with temp on different filesystem

## Notes

This decision was made during the Go rewrite (V3). The original TypeScript implementation had the same flaw but was caught during critical review before shipping.

This is a good example of why **correctness reviews matter more than performance optimization** in early development.

## References

- Backend implementation: `backend/internal/repository/atomic.go`
- POSIX hard link behavior: `man 2 link`
- Transaction guarantees: ACID properties
- Performance report: `docs/reports/2025-10-02__documentation-expert__atomic-transaction-design.md`
