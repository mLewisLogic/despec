# xdd TODO

**Current Phase**: Phase 0 Has Critical Issues → Phase 1 Partially Complete
**Last Updated**: 2025-10-01
**Validation Status**: Comprehensive validation performed with skeptical sub-agents

## 🚨 CRITICAL ISSUES - MUST FIX BEFORE PROCEEDING

### Validation Results (2025-10-01)
After thorough validation with skeptical sub-agents:

**Phase 0 Core Utilities - CRITICAL FAILURES:**
1. **FileLock Race Conditions** - Mutual exclusion FAILS under concurrent load
   - Evidence: Integration tests show lost increments (49 instead of 50)
   - Root Cause: TOCTOU race between mkdir() and metadata write
   - Fix: Replace with proper OS-level file locking (flock/fcntl)

2. **AtomicWriter Not Atomic** - 124 corrupted writes detected
   - Evidence: Integration tests show data corruption
   - Root Cause: Missing parent directory fsync after rename
   - Fix: Add parent dir fsync for true durability

3. **Integration Tests Failing** - Tests timeout/hang after 2 minutes
   - Evidence: `bun test tests/integration/` hangs
   - Root Cause: Deadlocks or infinite loops in lock acquisition
   - Fix: Debug and resolve race conditions

**Phase 1 Schemas - MINOR ISSUES:**
1. ✅ **Documentation Mismatch FIXED** - Updated all references from nanoid(10) to nanoid(16)
   - Fixed files: id-generator.ts, acceptance-criteria.ts, requirement.ts, changelog-events.ts, SPEC.md
   - Completed: 2025-10-01

### Production Readiness: 4/10
**NOT READY FOR PRODUCTION USE** - Critical race conditions and durability issues

---

## Phase 1: Specs Stage Implementation

### Week 1: Foundation & Schemas (Days 1-5)

**Days 1-2: Core Utilities** (CRITICAL ISSUES ⚠️)
- [x] AtomicWriter implementation (has race conditions, missing parent dir fsync)
- [x] FileLock implementation (race conditions, fails under concurrent load)
- [x] InputValidator implementation
- [x] ErrorHandler implementation
- [x] Unit test coverage (171 tests pass, but integration tests fail)
- [ ] **FIX CRITICAL**: FileLock race conditions causing lost operations
- [ ] **FIX CRITICAL**: AtomicWriter missing parent directory fsync
- [ ] **FIX CRITICAL**: Integration tests hanging/failing

**Days 3-4: Schemas & ID Generation** (COMPLETE ✅)
- [x] Define Zod schemas for all entities
  - [x] ProjectMetadataSchema
  - [x] RequirementSchema
  - [x] AcceptanceCriterionSchema (Behavioral + Assertion)
  - [x] ChangelogEventSchema (8 event types)
- [x] Generate JSON schemas from Zod
- [x] Implement ID generator with nanoid(16)
- [x] Test for ID collisions (100K generations tested, 0 collisions)
- [x] Add ID format validation
- [x] **FIX MINOR**: Update documentation from nanoid(10) to nanoid(16) ✅

**Days 5-6: Changelog & State Management** (NOT STARTED)
- [ ] Implement event sourcing with 8 event types
  - [ ] RequirementCreated
  - [ ] RequirementDeleted
  - [ ] RequirementModified
  - [ ] RequirementRecategorized
  - [ ] AcceptanceCriterionAdded
  - [ ] AcceptanceCriterionModified
  - [ ] AcceptanceCriterionDeleted
  - [ ] ProjectMetadataUpdated
- [ ] Add snapshot mechanism (every 100 events)
- [ ] Build YAML serialization with validation
- [ ] Create changelog index management
- [ ] Implement state computation from events

### Week 2: Claude Integration & CLI (Days 6-10)

**Days 7-8: Claude Wrapper** (NOT STARTED)
- [ ] Build ClaudeWrapper with real Anthropic SDK
- [ ] Implement tool calling pattern
- [ ] Create context injection system
- [ ] Add response validation
- [ ] Implement EARS format system prompt
- [ ] Add category classification logic

**Days 9-10: CLI & Testing** (NOT STARTED)
- [ ] Create CLI entry point
- [ ] Command parser (specify, validate, query)
- [ ] Pretty output formatting
- [ ] Error reporting
- [ ] Mock Claude for testing
- [ ] End-to-end integration tests
- [ ] Performance validation

## Before Starting Phase 1

### Critical (MUST DO)

**Status: 3/4 Complete**

1. ✅ Update code comments - Remove false "all filesystems" claims
2. ✅ Add filesystem warnings - Detect and warn about network filesystems
3. ✅ Document limitations - README section on supported filesystems
4. ⏱️ **Linux testing** - Validate on ext4/btrfs (2-3 hours estimated)

### Important (SHOULD DO)

1. [ ] Windows testing - Validate cross-platform (4-6 hours)
2. [ ] Longer stress test - 1-hour continuous operation
3. [ ] Add telemetry hooks - Prepare for production monitoring
4. [ ] Document recovery procedures - What to do if locks get stuck

### Optional (NICE TO HAVE)

1. [ ] Filesystem type detection
2. [ ] Automatic cleanup on startup
3. [ ] Lock health monitoring
4. [ ] Performance profiling under various loads

## Known Issues & Limitations

### Phase 0 Issues

**Status: No Blockers**

1. ⚠️ **Flaky test** (LOW priority)
   - Test: `atomic-writer-failure.test.ts`
   - Issue: Temp file cleanup timing (0.7% failure rate)
   - Impact: Minor, doesn't affect functionality
   - Fix: Add retry logic or timing adjustment

### Platform Limitations (DOCUMENTED)

1. **Network Filesystems** (HIGH priority for docs)
   - Issue: `mkdir()` not atomic on NFS/SMB/CIFS
   - Impact: Lock mechanism will fail silently
   - Status: DOCUMENTED, acceptable for target use case
   - Action: Add detection and warnings

2. **Platform Support** (MEDIUM priority)
   - macOS: ✅ Validated
   - Linux: ⏱️ Testing needed (2-3 hours)
   - Windows: ⏱️ Testing needed (4-6 hours)

3. **PID Reuse** (LOW priority)
   - Issue: Lock ownership based on PID only
   - Impact: Theoretical lock hijacking (very low probability)
   - Status: ACCEPTABLE RISK

4. **Metadata Race Window** (LOW priority)
   - Issue: Small window between mkdir and metadata write
   - Impact: Mitigated by 1-second grace period
   - Status: ACCEPTABLE RISK

## Future Improvements (Post-Phase 1)

### Phase 2: Design Stage (5 days)

- [ ] Component discovery through boundary analysis
- [ ] Technology research framework
- [ ] Decision recording system
- [ ] Design documentation generation
- [ ] API specification support
- [ ] Database schema design

### Phase 3: Tasks Stage (5 days)

- [ ] Task generation from design
- [ ] 4-tier priority system (Critical, Core, Enhancements, Future)
- [ ] Mandatory TDD workflow
- [ ] 6-point checklist enforcement
- [ ] Independent validation requirement
- [ ] Task state management

### Infrastructure Enhancements

**AtomicWriter Improvements**:
- [ ] Add "dry-run" mode to validate before writing
- [ ] Implement write verification (read-back check)
- [ ] Add configurable temp file retention for debugging
- [ ] Optimize batch operations

**FileLock Enhancements**:
- [ ] Add lock acquisition queuing with fairness
- [ ] Implement lock priority levels
- [ ] Add deadlock detection
- [ ] Consider distributed locking for multi-node scenarios
- [ ] Lock health monitoring

**ErrorHandler Additions**:
- [ ] Add circuit breaker pattern for repeated failures
- [ ] Implement jitter in backoff (already has basic jitter)
- [ ] Add retry budget (max total time, not just attempts)
- [ ] Provide retry analytics/metrics

**Testing Enhancements**:
- [ ] Chaos testing (random failure injection)
- [ ] Kill-9 process simulation during critical sections
- [ ] Disk space exhaustion scenarios
- [ ] Property-based testing with fast-check
- [ ] Performance regression testing
- [ ] Benchmark tracking over time

### NFS/Distributed Filesystem Support

**If Network Filesystem Support Needed**:
- [ ] Research distributed locking mechanisms (etcd, Redis, ZooKeeper)
- [ ] Implement filesystem detection
- [ ] Add fallback to network-safe locking
- [ ] Test on NFS, SMB, CIFS
- [ ] Document trade-offs and performance impact

### Performance Optimization

**Current Performance** (acceptable for Phase 1):
- FileLock: 87.55 ops/sec under contention
- AtomicWriter: 2,526 writes/sec
- Lock acquisition: ~287ms average

**Future Optimizations**:
- [ ] Implement caching layer for repeated reads
- [ ] Optimize lock retry intervals
- [ ] Batch YAML operations
- [ ] Stream large files instead of loading entirely
- [ ] Add performance profiling hooks

### Developer Experience

**CLI Improvements**:
- [ ] Interactive mode for complex operations
- [ ] Shell completion (bash, zsh, fish)
- [ ] Colored output with themes
- [ ] Progress bars for long operations
- [ ] Verbose/debug logging modes

**Documentation**:
- [ ] API documentation (TypeDoc)
- [ ] Tutorial videos
- [ ] Example projects
- [ ] Migration guides
- [ ] Troubleshooting guide

## Dependencies to Install

### Phase 1 Required

```bash
bun add @anthropic-ai/sdk  # Already in package.json
bun add nanoid             # Already in package.json
bun add yaml               # Already in package.json
bun add zod                # Already in package.json
bun add zod-to-json-schema # Already in package.json
```

### Development Tools (Already Configured)

- [x] Bun runtime
- [x] Biome (linting)
- [x] Vitest (testing)
- [x] Lefthook (git hooks)
- [x] Mise (task runner)

## Success Metrics

### Phase 1 Acceptance Criteria

**Functionality**:
- [ ] Can create requirement from natural language
- [ ] Can modify existing requirements
- [ ] Changelog correctly tracks all changes
- [ ] IDs are unique and deterministic
- [ ] Concurrent modifications handled safely
- [ ] All YAML files valid after operations
- [ ] Error messages are actionable

**Performance Targets**:
- [ ] Create requirement: < 500ms
- [ ] Validate specification: < 100ms
- [ ] Load 1000 requirements: < 1 second
- [ ] Changelog with 10000 events: < 2 seconds

**Quality Targets**:
- [ ] Zero data loss under any failure condition
- [ ] No ID collisions in 1 million generations
- [ ] 100% backward compatible YAML format
- [ ] Clean error messages for all failure modes
- [ ] 80%+ test coverage

## Risk Mitigation

### High-Risk Items

1. **Claude SDK Changes** (HIGH)
   - Risk: Breaking changes in Anthropic SDK
   - Mitigation: Pin version, abstract interface
   - Action: Monitor changelogs, prepare for migration

2. **File System Operations** (MEDIUM)
   - Risk: Cross-platform compatibility issues
   - Mitigation: Test on Mac, Linux, Windows
   - Action: Linux testing (2-3 hours) required

3. **Concurrent Access** (LOW)
   - Risk: Edge cases in lock mechanism
   - Mitigation: Comprehensive multi-process tests
   - Status: ✅ 100% success in testing

4. **YAML Corruption** (LOW)
   - Risk: Invalid YAML written
   - Mitigation: Validate before writing
   - Status: ✅ Zod schemas + atomic writes

5. **Memory Usage** (LOW)
   - Risk: Large specifications cause OOM
   - Mitigation: Streaming for large files
   - Action: Test with 1000+ requirements

### Contingency Plans

- **If Claude SDK breaks**: Fallback to HTTP API directly
- **If file locking fails**: Use lock directories (already implemented)
- **If YAML becomes bottleneck**: Migrate to SQLite
- **If performance degrades**: Implement caching layer
- **If snapshots grow large**: Implement incremental snapshots

## Notes

### What Changed in V2

Phase 0 is complete, but Phase 1+ needs to be built:

**Removed from V1 (agent-sdd)**:
- Self-referential dogfooding approach
- Fictional `@agent-sdk` dependency
- Hash-based IDs (collision risk)
- Direct YAML writes (corruption risk)

**Added in V2 (xdd)**:
- Real Anthropic SDK integration
- nanoid for collision-resistant IDs
- Atomic write operations
- File-based locks
- Event sourcing with snapshots
- Phase 0 foundation (COMPLETE)

### Bootstrap Strategy

**Do NOT attempt self-referential development**.

The correct approach:
1. ✅ Phase 0: Build foundation utilities (COMPLETE)
2. ⏱️ Phase 1: Implement basic YAML operations (NEXT)
3. ⏱️ Phase 2: Add LLM integration
4. ⏱️ Phase 3: Build CLI
5. ⏱️ Then: Use xdd for future xdd features

### Confidence Levels (After Validation)

- **Phase 0**: 3/10 (Red) - CRITICAL ISSUES - Race conditions and atomicity failures ❌
- **Phase 1 Schemas**: 7/10 (Green) - Functionally complete, minor doc issues ✅
- **Phase 1 Changelog**: 0/10 - Not started
- **Phase 2**: 0/10 - Not started
- **Phase 3**: 0/10 - Not started

**Current Status**: BLOCKED - Must fix Phase 0 critical issues before proceeding. Phase 1 schemas are complete but Phase 0 foundation is broken.
