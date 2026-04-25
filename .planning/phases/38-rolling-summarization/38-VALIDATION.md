---
phase: 38
slug: rolling-summarization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x + @vitest/ui |
| **Config file** | `apps/backend-ts/vitest.config.ts` |
| **Quick run command** | `npm test -- src/memory/manager.test.ts -t "rolling"` |
| **Full suite command** | `npm test -- src/memory/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/memory/manager.test.ts -t "rolling"`
- **After every plan wave:** Run `npm test -- src/memory/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | MSUM-01 | — | Parameterized queries only (no string concat) | unit | `npm test -- src/memory/manager.test.ts -t "deletes oldest 10"` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | MSUM-02 | — | Fire-and-forget; send() returns without waiting | unit | `npm test -- src/memory/manager.test.ts -t "fire-and-forget"` | ❌ W0 | ⬜ pending |
| 38-01-03 | 01 | 1 | MSUM-02 | — | Threshold check before LLM call | unit | `npm test -- src/memory/manager.test.ts -t "threshold check"` | ❌ W0 | ⬜ pending |
| 38-01-04 | 01 | 1 | MSUM-02 | — | Errors logged silently, never re-thrown | unit | `npm test -- src/memory/manager.test.ts -t "silent failure"` | ❌ W0 | ⬜ pending |
| 38-01-05 | 01 | 1 | MSUM-03 | — | Summary injected between profile and typed memories | integration | `npm test -- src/memory/manager.test.ts -t "summary injection"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/memory/manager.test.ts` — tests covering MSUM-01, MSUM-02, MSUM-03
  - Mock MemoryStore.countMessages(), getOldestMessages(), deleteMessages(), saveSummary()
  - Mock LLM invocation
  - Verify threshold check prevents LLM call when count < 20
  - Verify 10 oldest messages are deleted after summary saved
  - Verify `_latestSummary` is updated after summarization
  - Verify buildContext() includes summary in correct position
- [ ] `apps/backend-ts/src/session/chat-session.test.ts` — fire-and-forget invocation
  - Verify `runRollingSummarization()` is called via void in send() and sendStream()
  - Verify send() returns without awaiting summarization
- [ ] MemoryStore helper methods (countMessages, getOldestMessages, deleteMessages, getLatestSummary) covered in store.test.ts

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
