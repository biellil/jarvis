---
phase: 61
slug: embedding-priority-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/backend-ts/vitest.config.ts` |
| **Quick run command** | `cd apps/backend-ts && npx vitest run --reporter=verbose src/memory/` |
| **Full suite command** | `cd apps/backend-ts && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend-ts && npx vitest run --reporter=verbose src/memory/`
- **After every plan wave:** Run `cd apps/backend-ts && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | LLM-PRIO-01 | unit | `cd apps/backend-ts && npx vitest run src/memory/embedding-queue.test.ts` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | LLM-PRIO-01 | unit | `cd apps/backend-ts && npx vitest run src/memory/embedding-queue.test.ts` | ❌ W0 | ⬜ pending |
| 61-02-01 | 02 | 2 | LLM-PRIO-01 | unit | `cd apps/backend-ts && npx vitest run src/memory/vectors.test.ts` | ✅ | ⬜ pending |
| 61-02-02 | 02 | 2 | LLM-PRIO-02 | unit | `cd apps/backend-ts && npx vitest run src/memory/manager.test.ts` | ✅ | ⬜ pending |
| 61-03-01 | 03 | 3 | LLM-PRIO-01 | integration | `cd apps/backend-ts && npx vitest run src/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/memory/embedding-queue.test.ts` — stubs de testes para EmbeddingQueue singleton (LLM-PRIO-01)

*Existing infrastructure covers all other tests (vectors.test.ts, manager.test.ts existem).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat response ≤100ms overhead when embedding in-flight | LLM-PRIO-01 | Medição de latência requer soak run manual | Iniciar JARVIS, disparar embedding via `/lembrar X`, enviar chat imediatamente, verificar latência no log |
| AbortController leak em 30-min soak | LLM-PRIO-02 | Soak test requer 30min de execução contínua | Seguir protocolo Phase 56 QA-01: heap <100MB, RSS <200MB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
