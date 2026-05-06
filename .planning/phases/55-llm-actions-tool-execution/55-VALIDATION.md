---
phase: 55
slug: llm-actions-tool-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (backend-ts, gateway) + happy-dom (Electron renderer) |
| **Config file** | `vitest.config.ts` (backend-ts), `apps/gateway/vitest.config.ts`, `apps/desktop/vitest.config.ts` |
| **Quick run command** | `npm run test -- --workspace=backend-ts` |
| **Full suite command** | `npm run test -- --workspace=backend-ts --workspace=gateway --workspace=desktop` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --workspace=backend-ts`
- **After every plan wave:** Run full suite (all 3 workspaces)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 0 | LACT-01..05 | unit stub | `vitest run apps/backend-ts/src/session/__tests__/request-file-action.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 0 | LACT-01..05 | unit stub | `vitest run apps/gateway/src/__tests__/dispatch-action.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-03 | 01 | 0 | LACT-01..05 | unit stub | `vitest run apps/desktop/src/main/__tests__/actions.test.ts` | ❌ W0 | ⬜ pending |
| 55-02-01 | 02 | 1 | LACT-01, LACT-03 | unit | `vitest run apps/desktop/src/main/__tests__/actions.test.ts -t "openFolder\|openFile"` | ❌ W0 | ⬜ pending |
| 55-02-02 | 02 | 1 | LACT-02, LACT-04 | unit | `vitest run apps/desktop/src/main/__tests__/actions.test.ts -t "closeFile"` | ❌ W0 | ⬜ pending |
| 55-02-03 | 02 | 1 | LACT-05 | unit | `vitest run apps/desktop/src/main/__tests__/actions.test.ts -t "viewContent"` | ❌ W0 | ⬜ pending |
| 55-03-01 | 03 | 1 | LACT-01..05 | integration | `vitest run apps/gateway/src/__tests__/dispatch-action.test.ts` | ❌ W0 | ⬜ pending |
| 55-04-01 | 04 | 2 | LACT-01..05 | integration | `vitest run apps/backend-ts/src/session/__tests__/request-file-action.test.ts` | ❌ W0 | ⬜ pending |
| 55-05-01 | 05 | 2 | LACT-06 | unit | `vitest run apps/desktop/src/renderer/__tests__/useActionConfirmation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/session/__tests__/request-file-action.test.ts` — stubs para LACT-01..05 (mocks fetch ao /internal/dispatch-action)
- [ ] `apps/gateway/src/__tests__/dispatch-action.test.ts` — stubs para novo endpoint (mocks sendActionRequest)
- [ ] `apps/desktop/src/main/__tests__/actions.test.ts` — stubs para 4 handlers (mocks shell/fs/child_process)
- [ ] `apps/desktop/src/renderer/__tests__/useActionConfirmation.test.ts` — estende Phase 54 hook tests para IPC execute flow
- [ ] `test/fixtures/actions/viewContent-1mb-boundary.txt` — fixture para teste de boundary 1MB

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Explorador de arquivos abre na pasta correta | LACT-01 | Requer OS window visible | Pedir ao JARVIS "abre pasta Downloads", confirmar toast, verificar explorador |
| App padrão abre o arquivo | LACT-03 | Requer app externo | Pedir "abre notas.txt", confirmar toast, verificar app associado |
| Processo é encerrado | LACT-02, LACT-04 | Requer processo rodando | Abrir app, pedir ao JARVIS para fechar, verificar no Task Manager |
| Conteúdo aparece inline no chat | LACT-05 | Requer UI visible | Pedir "mostra conteúdo de notas.txt", verificar texto no chat widget |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
