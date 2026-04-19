---
phase: 35
slug: schema-type-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | packages/backend-ts/vitest.config.ts |
| **Quick run command** | `pnpm --filter backend-ts test -- test/memory/typed-memories.test.ts` |
| **Full suite command** | `pnpm --filter backend-ts test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter backend-ts test -- test/memory/`
- **After every plan wave:** Run `pnpm --filter backend-ts test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 0 | MTYPE-05 | unit | `pnpm --filter backend-ts test -- test/memory/schema-typed-memories.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 0 | MTYPE-05 | unit | `pnpm --filter backend-ts test -- test/memory/migration-fresh.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-03 | 01 | 0 | MTYPE-05 | integration | `pnpm --filter backend-ts test -- test/memory/migration-upgrade.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-04 | 01 | 0 | REL-02 | unit | `pnpm --filter backend-ts test -- test/memory/store-typed.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-05 | 01 | 0 | REL-02 | integration | `pnpm --filter backend-ts test -- test/memory/consistency-check.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend-ts/test/memory/schema-typed-memories.test.ts` — validates typed_memories table structure, columns, enum constraint
- [ ] `packages/backend-ts/test/memory/migration-fresh.test.ts` — migration 0003 on fresh :memory: database
- [ ] `packages/backend-ts/test/memory/migration-upgrade.test.ts` — migration 0003 on v1.7 database without data loss
- [ ] `packages/backend-ts/test/memory/store-typed.test.ts` — saveTypedMemory(), getTypedMemories(), getAllTypedMemories() unit tests
- [ ] `packages/backend-ts/test/memory/consistency-check.test.ts` — async consistency validation with mock SQLite + ChromaDB mismatch

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ChromaDB collections initialized on startup | MTYPE-05 | Requires running ChromaDB process | Start backend-ts, check logs for "collections initialized: semantic, episodic, procedural" |
| Consistency check logs mismatch on startup | REL-02 | Requires seeded DB state | Manually insert typed_memory with source_id not in ChromaDB, restart backend-ts, verify log output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
