---
phase: 36
slug: memory-writer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/backend-ts) |
| **Config file** | apps/backend-ts/vitest.config.ts |
| **Quick run command** | `cd apps/backend-ts && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/backend-ts && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend-ts && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/backend-ts && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | MEMW-01 | unit | `npx vitest run src/memory/MemoryExtractor.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | MTYPE-01,MTYPE-02,MTYPE-03,MTYPE-04 | unit | `npx vitest run src/memory/MemoryExtractor.test.ts` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 2 | MEMW-02 | unit | `npx vitest run src/memory/MemoryVectors.test.ts` | ❌ W0 | ⬜ pending |
| 36-02-02 | 02 | 2 | MTYPE-01,MTYPE-02,MTYPE-03,MTYPE-04 | unit | `npx vitest run src/memory/MemoryVectors.test.ts` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 3 | MEMW-03 | unit | `npx vitest run src/chat/ChatSession.test.ts` | ❌ W0 | ⬜ pending |
| 36-03-02 | 03 | 3 | REL-01 | unit | `npx vitest run src/chat/ChatSession.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/memory/MemoryExtractor.test.ts` — stubs for MEMW-01, MTYPE-01–04
- [ ] `apps/backend-ts/src/memory/MemoryVectors.test.ts` — stubs for MEMW-02, typed collections
- [ ] `apps/backend-ts/src/chat/ChatSession.test.ts` — stubs for MEMW-03, REL-01

*Existing vitest infrastructure covers framework — only test stub files need creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Voice pipeline continues on extraction failure | REL-01 | Requires live LLM + simulated failure | Simulate LLM timeout; verify JARVIS responds normally and error appears in logs |
| Background extraction doesn't block response | REL-01 | Requires timing measurement | Send message; verify TTS begins before extraction completes (check log timestamps) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
