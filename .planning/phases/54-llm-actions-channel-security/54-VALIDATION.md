---
phase: 54
slug: llm-actions-channel-security
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (desktop) + jest/vitest (backend-ts) + jest (gateway) |
| **Config file** | `apps/desktop/vitest.config.ts` / `apps/backend-ts/jest.config.js` / `apps/gateway/jest.config.js` |
| **Quick run command** | `pnpm --filter desktop test --run` |
| **Full suite command** | `pnpm -r test --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter desktop test --run`
- **After every plan wave:** Run `pnpm -r test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | LACT-09 | unit | `pnpm --filter desktop test --run store` | ❌ W0 | ⬜ pending |
| 54-01-02 | 01 | 1 | LACT-09 | unit | `pnpm --filter desktop test --run actionsClient` | ❌ W0 | ⬜ pending |
| 54-02-01 | 02 | 1 | LACT-07 | unit | `pnpm --filter gateway test --run actions-ws` | ❌ W0 | ⬜ pending |
| 54-02-02 | 02 | 1 | LACT-07, LACT-08 | unit | `pnpm --filter gateway test --run path-validation` | ❌ W0 | ⬜ pending |
| 54-03-01 | 03 | 2 | LACT-08 | unit | `pnpm --filter backend-ts test --run action-logger` | ❌ W0 | ⬜ pending |
| 54-04-01 | 04 | 2 | LACT-06 | unit | `pnpm --filter desktop test --run confirmation-toast` | ❌ W0 | ⬜ pending |
| 54-04-02 | 04 | 2 | LACT-06 | unit | `pnpm --filter desktop test --run actions-ipc` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/actions/__tests__/actionsClient.test.ts` — stubs para LACT-09 (clientId, reconexão)
- [ ] `apps/desktop/src/main/__tests__/store-clientId.test.ts` — stubs para getClientId/setClientId
- [ ] `apps/gateway/src/__tests__/actions-ws.test.ts` — stubs para WS server + Map<clientId>
- [ ] `apps/gateway/src/__tests__/path-validation.test.ts` — stubs para Zod whitelist LACT-07
- [ ] `apps/backend-ts/src/memory/__tests__/action-logger.test.ts` — stubs para ActionLogger LACT-08
- [ ] `apps/desktop/src/renderer/src/__tests__/confirmation-toast.test.ts` — stubs para toast LACT-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reconexão WebSocket após docker restart | LACT-09 | Requer container lifecycle real | `docker compose restart gateway` enquanto app aberto; verificar reconexão nos logs |
| Toast aparece e desaparece após 10s | LACT-06 | Timing real não reproduzível em unit tests com mocks | Rodar app, disparar ação via DevTools console, não clicar, verificar auto-dismiss |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
