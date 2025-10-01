# Edge Cases Discovered in xdd Phase 0 Testing

## Critical Edge Cases (Bugs Found)

### 1. Partial Batch Write Cleanup Failure

**Component**: AtomicWriter
**Severity**: HIGH
**Status**: 🔴 UNRESOLVED

**Scenario:**
When writing multiple files atomically and one write fails after some temp files have been created, not all temporary files are cleaned up.

**How to Reproduce:**
```typescript
const writer = new AtomicWriter();
const files = [
  { path: 'file1.txt', content: 'Content 1' },
  { path: 'file2.txt', content: 'Content 2' },
  { path: 'file3.txt', content: 'Content 3' },
];

// Mock fs.writeFile to fail on 2nd write
let writeCount = 0;
fs.writeFile = async (path, data, options) => {
  writeCount++;
  if (writeCount === 2 && path.includes('.tmp.')) {
    throw new Error('ENOSPC: no space left on device');
  }
  return originalWriteFile(path, data, options);
};

await writer.writeFiles(files); // Throws error

// BUG: Some temp files remain on disk
```

**Expected Behavior:**
All temporary files should be removed after any failure.

**Actual Behavior:**
1-2 temporary files remain on disk.

**Impact:**
- Disk space waste
- Security risk (sensitive data in temp files)
- Confusion during debugging
- May interfere with subsequent operations

**Suggested Fix:**
```typescript
async writeFiles(files: FileWrite[]): Promise<void> {
  const tempFiles = files.map((f) => ({
    original: f.path,
    temp: `${f.path}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 11)}`,
    content: f.content,
  }));

  // Track all temp files that were created
  const createdTempFiles: string[] = [];

  try {
    await Promise.all(
      tempFiles.map((f) =>
        fs.mkdir(path.dirname(f.original), { recursive: true }),
      ),
    );

    // Write temp files one by one and track creation
    for (const f of tempFiles) {
      await fs.writeFile(f.temp, f.content, 'utf8');
      createdTempFiles.push(f.temp); // Track immediately after creation
    }

    await Promise.all(
      tempFiles.map((f) => fs.rename(f.temp, f.original)),
    );
  } catch (error) {
    // Clean up only the temp files we actually created
    await Promise.allSettled(
      createdTempFiles.map((tempPath) =>
        fs.unlink(tempPath).catch(() => {})
      ),
    );
    throw new Error(`Atomic write failed: ${error.message}`);
  }
}
```

---

### 2. Race Condition in Stale Lock Cleanup

**Component**: FileLock
**Severity**: CRITICAL
**Status**: 🔴 UNRESOLVED

**Scenario:**
When multiple processes simultaneously detect a stale lock and attempt to clean it up, multiple processes can successfully acquire the lock, violating mutual exclusion.

**How to Reproduce:**
```typescript
// Process creates stale lock
const lockPath = `${resourcePath}.lock`;
await fs.writeFile(lockPath, 'stale-lock-id');
const oldTime = new Date(Date.now() - 60000); // 60 seconds old
await fs.utimes(lockPath, oldTime, oldTime);

// 5 processes try to acquire simultaneously
const locks = Array.from({ length: 5 }, () => new FileLock());
const results = await Promise.allSettled(
  locks.map(lock => lock.acquire(resourcePath, { staleTimeout: 1000 }))
);

// BUG: 2-3 processes successfully acquire the lock
```

**Expected Behavior:**
Exactly one process should successfully acquire the lock.

**Actual Behavior:**
2-3 processes successfully acquire the lock due to TOCTOU race condition.

**Attack Sequence:**
```
Time  Process A              Process B              Process C
----  -------------------    -------------------    -------------------
T0    Check lock is stale    -                      -
T1    -                      Check lock is stale    -
T2    -                      -                      Check lock is stale
T3    Delete stale lock      -                      -
T4    Create new lock        -                      -
T5    ACQUIRED ✓             Delete A's lock!       -
T6    -                      Create new lock        -
T7    -                      ACQUIRED ✓             Delete B's lock!
T8    -                      -                      Create new lock
T9    -                      -                      ACQUIRED ✓
```

**Impact:**
- **DATA CORRUPTION RISK**: Multiple processes can modify the same resource
- Violates fundamental mutual exclusion guarantee
- May cause inconsistent YAML file state
- Silent failure - no error thrown

**Suggested Fix Option 1 - Verify After Acquire:**
```typescript
async acquire(resourcePath: string, options: LockOptions = {}): Promise<void> {
  const lockId = nanoid();

  // ... existing acquisition logic ...

  // After supposedly acquiring lock, verify we actually own it
  await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
  const currentLockId = await fs.readFile(lockPath, 'utf8').catch(() => null);

  if (currentLockId !== lockId) {
    // Someone else took over - we don't actually have the lock
    this.locks.delete(resourcePath);
    throw new Error('Lock acquisition failed: race condition detected');
  }
}
```

**Suggested Fix Option 2 - Use System Locks:**
```typescript
import { open } from 'node:fs/promises';

async acquire(resourcePath: string, options: LockOptions = {}): Promise<void> {
  const lockPath = this.getLockPath(resourcePath);

  // Use exclusive file open - atomically fails if file exists
  const fileHandle = await open(lockPath, 'wx');
  await fileHandle.writeFile(lockId);
  await fileHandle.close();

  // Now use flock for advisory locking
  const fd = await open(lockPath, 'r+');
  // flock(fd, LOCK_EX | LOCK_NB) - requires native binding
}
```

**Suggested Fix Option 3 - Two-Phase Locking:**
```typescript
// Phase 1: Acquire intent lock
// Phase 2: Verify no one else has intent
// Phase 3: Promote to exclusive lock
// This requires additional lock file or lock directory structure
```

---

## Interesting Edge Cases (Not Bugs, But Worth Noting)

### 3. Concurrent Lock Acquisition Can Succeed Under Race

**Component**: FileLock
**Severity**: LOW (Expected behavior but worth documenting)

**Scenario:**
When multiple processes try to acquire a lock simultaneously, the one that "wins" the race is somewhat random and depends on OS scheduling.

**Observation:**
In tests with 5 processes competing for a lock:
- Sometimes process #1 wins
- Sometimes process #3 wins
- No predictable fairness

**Impact:**
- Lock starvation possible under high contention
- No fairness guarantees
- May affect performance under load

**Recommendation:**
Document this as expected behavior. If fairness is required, implement a lock queue system.

---

### 4. Temp File Name Collisions Prevented by Random Component

**Component**: AtomicWriter
**Severity**: LOW (Working as designed)

**Scenario:**
Temp files use format: `${path}.tmp.${timestamp}.${random}`

**Testing:**
Created 5 concurrent writers for the same file. All generated unique temp file names.

**Observation:**
The combination of timestamp + random component successfully prevents collisions even under high concurrency.

**Collision Probability:**
- Random component: 36^9 = 1.01e14 possibilities
- Even at 1000 writes/sec, collision risk is negligible

**Recommendation:**
Current implementation is sufficient. No changes needed.

---

### 5. Lock File Verification Timing Window

**Component**: FileLock
**Severity**: MEDIUM

**Scenario:**
After acquiring a lock, there's a brief window where the lock file could be deleted before the process uses it.

**Example:**
```typescript
await lock.acquire(resourcePath);
// <- Another process could delete lock file here
// <- System could crash here
const data = await fs.readFile(resourcePath);
```

**Impact:**
- If lock file is deleted externally, process thinks it has exclusive access but doesn't
- Rare but possible under system instability

**Recommendation:**
Add lock verification before critical operations:
```typescript
async withLockVerified<T>(
  resourcePath: string,
  fn: () => Promise<T>
): Promise<T> {
  await this.acquire(resourcePath);
  try {
    // Verify we still hold lock before each operation
    this.verifyLockOwnership(resourcePath);
    return await fn();
  } finally {
    await this.release(resourcePath);
  }
}
```

---

### 6. Very Long File Paths Near System Limits

**Component**: AtomicWriter
**Severity**: LOW

**Scenario:**
Tested with paths containing 200+ characters (two 100-char directory names).

**Result:**
- ✅ Worked on macOS (APFS)
- ⚠️ May fail on other filesystems with different limits

**Filesystem Limits:**
- ext4: 255 bytes per component, 4096 total path
- APFS: 1024 bytes per component
- NTFS: 260 character total path (Windows)

**Recommendation:**
Add path length validation if cross-platform support needed:
```typescript
const MAX_PATH_LENGTH = 260; // Windows limit
if (filePath.length > MAX_PATH_LENGTH) {
  throw new Error(`Path too long: ${filePath.length} > ${MAX_PATH_LENGTH}`);
}
```

---

### 7. Empty Lock Files Are Valid

**Component**: FileLock
**Severity**: LOW

**Scenario:**
If a lock file exists but is empty (0 bytes), it's still considered a valid lock.

**Testing:**
```typescript
await fs.writeFile(lockPath, ''); // Empty file
// Lock is respected, causes timeout
```

**Impact:**
- Empty lock files block access until they become stale
- Could be used maliciously to DoS the system

**Recommendation:**
Add validation that lock files must contain a valid lock ID:
```typescript
const lockId = await fs.readFile(lockPath, 'utf8');
if (!lockId || lockId.trim().length === 0) {
  // Treat as invalid lock, remove it
  await fs.unlink(lockPath).catch(() => {});
  continue; // Retry acquisition
}
```

---

### 8. Lock Release When Lock Already Taken Over

**Component**: FileLock
**Severity**: LOW (Working as designed)

**Scenario:**
Process A holds a lock. Process B somehow replaces the lock file content. Process A tries to release.

**Current Behavior:**
Process A reads the lock file, sees it's not their ID, and does NOT delete the file. This is correct behavior.

**Testing:**
```typescript
await lock1.acquire(resourcePath);
await fs.writeFile(lockPath, 'different-id'); // Simulate takeover
await lock1.release(resourcePath);
// Lock file remains (correct!)
```

**Recommendation:**
No changes needed. Current behavior is correct and defensive.

---

### 9. Exponential Backoff Can Cause Long Waits

**Component**: ErrorHandler
**Severity**: LOW

**Scenario:**
With aggressive backoff settings, retry delays can grow very large:

**Example:**
```typescript
await handler.withRetry(
  asyncOperation,
  {
    maxRetries: 10,
    initialDelay: 1000,
    backoffMultiplier: 3,
    maxDelay: 60000
  }
);
```

**Delay Progression:**
- Attempt 1: 0ms
- Attempt 2: 1000ms (1s)
- Attempt 3: 3000ms (3s)
- Attempt 4: 9000ms (9s)
- Attempt 5: 27000ms (27s)
- Attempt 6+: 60000ms (60s) [capped]

**Total wait time**: ~5 minutes for 10 retries!

**Impact:**
- User experience degradation
- May look like system hang
- Timeout errors in other parts of system

**Recommendation:**
Document recommended settings and add warnings:
```typescript
if (maxRetries > 5 && backoffMultiplier > 2) {
  console.warn(
    'High retry count with aggressive backoff may cause long delays'
  );
}
```

---

### 10. Non-Error Thrown Values

**Component**: ErrorHandler
**Severity**: LOW

**Scenario:**
JavaScript allows throwing non-Error values:
```typescript
throw "string error";
throw 42;
throw { custom: "object" };
```

**Current Behavior:**
ErrorHandler converts these to Error objects:
```typescript
lastError = error instanceof Error ? error : new Error(String(error));
```

**Testing:**
All non-Error throws are handled correctly.

**Recommendation:**
No changes needed. Current implementation is robust.

---

## Summary Statistics

**Total Edge Cases Identified**: 10
- 🔴 Critical Bugs: 2
- 🟡 Interesting Behaviors: 8

**Categories:**
- Concurrency Issues: 3
- Cleanup/Resource Management: 2
- Path/Filesystem Limits: 2
- Timing/Race Conditions: 2
- Error Handling: 1

**Status:**
- ✅ Resolved: 0
- 🔴 Unresolved (Critical): 2
- 🟡 Documented (Non-Critical): 8

**Recommendation Priority:**
1. **IMMEDIATE**: Fix race condition in stale lock cleanup (data corruption risk)
2. **HIGH**: Fix temp file cleanup on batch write failures
3. **MEDIUM**: Add lock verification before critical operations
4. **LOW**: Add path length validation, empty lock file handling
5. **DOCUMENTATION**: Document remaining edge cases in system docs
