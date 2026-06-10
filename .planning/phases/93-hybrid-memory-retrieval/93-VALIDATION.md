---
phase: 93
slug: hybrid-memory-retrieval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 93 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/backend-ts/vitest.config.ts |
| **Quick run command** | `cd apps/backend-ts && npx vitest run --reporter=verbose memory/` |
| **Full suite command** | `cd apps/backend-ts && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend-ts && npx vitest run --reporter=verbose memory/`
- **After every plan wave:** Run `cd apps/backend-ts && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 93-01-01 | 01 | 1 | HMEM-02 | unit | `cd apps/backend-ts && npx vitest run memory/store` | ❌ W0 | ⬜ pending |
| 93-01-02 | 01 | 1 | HMEM-01 | unit | `cd apps/backend-ts && npx vitest run memory/hybrid-retriever` | ❌ W0 | ⬜ pending |
| 93-01-03 | 01 | 1 | HMEM-03 | unit | `cd apps/backend-ts && npx vitest run memory/hybrid-retriever` | ❌ W0 | ⬜ pending |
| 93-02-01 | 02 | 2 | HMEM-04 | unit | `cd apps/backend-ts && npx vitest run memory/hybrid-retriever` | ❌ W0 | ⬜ pending |
| 93-02-02 | 02 | 2 | HMEM-06 | unit | `cd apps/backend-ts && npx vitest run memory/manager` | ❌ W0 | ⬜ pending |
| 93-03-01 | 03 | 3 | HMEM-05 | benchmark | `cd apps/backend-ts && npx vitest run memory/ndcg` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/memory/__tests__/hybrid-retriever.test.ts` — stubs for HMEM-01, HMEM-03, HMEM-04
- [ ] `apps/backend-ts/src/memory/__tests__/store.fts5.test.ts` — stubs for HMEM-02
- [ ] `apps/backend-ts/src/memory/__tests__/ndcg-benchmark.test.ts` — stubs for HMEM-05
- [ ] `apps/backend-ts/src/memory/__tests__/manager.hybrid.test.ts` — stubs for HMEM-06
- [ ] `apps/backend-ts/src/memory/__tests__/fixtures/ndcg-queries.json` — 50 queries + ground truth fixture

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Keyword-rich query recalling old memory in real JARVIS session | HMEM-01 | End-to-end chat session required | Start JARVIS, ask about a fact from an old memory, confirm it appears in response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
