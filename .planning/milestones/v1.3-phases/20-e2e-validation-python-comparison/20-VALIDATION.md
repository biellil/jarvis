---
phase: 20
slug: e2e-validation-python-comparison
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 (gateway unit tests) + tsx script (E2E) |
| **Config file** | `apps/gateway/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @jarvis/gateway test --run` |
| **Full suite command** | `pnpm e2e` (requer ambos backends rodando) |
| **Estimated runtime** | ~15s (unit) + ~120s (E2E com 20 inputs) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @jarvis/gateway test --run`
- **After every plan wave:** Run `pnpm e2e` (se backends disponíveis)
- **Before `/gsd-verify-work`:** `pnpm e2e` com exit code 0 (≥90% pass rate)
- **Max feedback latency:** 15s (unit), 120s (E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Automated Command | File Exists | Status |
|---------|------|------|-------------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | VAL-07 | `pnpm --filter @jarvis/gateway test --run` | ❌ Wave 0 | ⬜ pending |
| 20-01-02 | 01 | 1 | VAL-07 | `pnpm --filter @jarvis/gateway test --run` | ❌ Wave 0 | ⬜ pending |
| 20-02-01 | 02 | 1 | VAL-01,02,03,04,05,06 | `pnpm e2e` | ❌ Wave 0 | ⬜ pending |
| 20-02-02 | 02 | 1 | VAL-01 | `which tsx && node --version` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/gateway/src/middleware/backendRouter.ts` — implementação VAL-07
- [ ] `apps/gateway/src/middleware/backendRouter.test.ts` — unit tests (mock req.headers)
- [ ] `scripts/e2e-compare.ts` (root-level) ou `apps/backend-ts/scripts/e2e-compare.ts` — cobre VAL-01 a VAL-06

*Todos os arquivos são novos — nenhum existe atualmente.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TS latency ≤110% Python globalmente | VAL-06 | Depende de ambiente/hardware | `pnpm e2e` mostra ratio médio no relatório |
| Semântica de respostas LLM | VAL-02 | LLM não-determinístico | Embedding cosine >0.85 serve como proxy automatizado |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
