---
phase: 7
slug: monorepo-express-gateway
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | `packages/gateway/vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `pnpm --filter gateway test --run` |
| **Full suite command** | `pnpm --filter gateway test --run --coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter gateway test --run`
- **After every plan wave:** Run `pnpm --filter gateway test --run` + `python -m pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | MONO-01 | smoke | `pnpm install --frozen-lockfile` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | GW-01 | unit | `pnpm --filter gateway test --run test/chat.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | GW-02 | unit | `pnpm --filter gateway test --run test/stream.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 2 | GW-03 | unit | `pnpm --filter gateway test --run test/health.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 2 | GW-04 | unit | `pnpm --filter gateway test --run test/error.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-06 | 01 | 2 | GW-05 | unit | `pnpm --filter gateway test --run test/validate.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/gateway/vitest.config.ts` — vitest config com globals e coverage
- [ ] `packages/gateway/test/helpers.ts` — helper `createTestApp()` importando `app.ts` sem listen
- [ ] `packages/gateway/test/chat.test.ts` — cobre GW-01 e GW-05
- [ ] `packages/gateway/test/stream.test.ts` — cobre GW-02 (mock upstream SSE via undici MockAgent)
- [ ] `packages/gateway/test/health.test.ts` — cobre GW-03
- [ ] `packages/gateway/test/error.test.ts` — cobre GW-04
- [ ] `pnpm add -D vitest` em `packages/gateway/`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE tokens chegam incrementalmente sem delay | GW-02 | Latência real requer FastAPI rodando | `curl -N "http://localhost:3000/api/chat/stream?message=oi"` e observar tokens chegando token-a-token |
| `pnpm install` na raiz instala workspace | MONO-01 | Requer filesystem real com pnpm | `pnpm install` na raiz, verificar `packages/gateway/node_modules/` criado |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
