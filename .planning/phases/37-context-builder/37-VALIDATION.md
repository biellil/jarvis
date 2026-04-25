---
phase: 37
slug: context-builder
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | `apps/backend-ts/vitest.config.ts` |
| **Quick run command** | `cd apps/backend-ts && npx vitest run test/memory/manager-context.test.ts` |
| **Full suite command** | `cd apps/backend-ts && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend-ts && npx vitest run test/memory/manager-context.test.ts`
- **After every plan wave:** Run `cd apps/backend-ts && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | MCTX-02 | — | N/A | unit | `cd apps/backend-ts && npx vitest run test/memory/manager-context.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-02 | 01 | 1 | MCTX-03 | — | N/A | unit | `cd apps/backend-ts && npx vitest run test/memory/manager-context.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-03 | 01 | 1 | MCTX-04 | — | N/A | integration | `cd apps/backend-ts && npx vitest run` | ✅ | ⬜ pending |
| 37-01-04 | 01 | 1 | MCTX-01 | — | N/A | unit | `cd apps/backend-ts && npx vitest run test/memory/manager-context.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/test/memory/manager-context.test.ts` — stubs para MCTX-01, MCTX-02, MCTX-03 (latência, parallel, formato)

*Existing infrastructure (vitest, ChromaDB mock pattern) covers remainder.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JARVIS recorda preferência em conversa de voz real | MCTX-01 | Depende de pipeline de voz E2E com ChromaDB populado | Falar com JARVIS sobre preferência, reiniciar, perguntar sobre ela |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
