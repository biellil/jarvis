---
phase: 92
slug: openrouter-provider
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-10
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x / vitest |
| **Config file** | `apps/backend-ts/jest.config.ts` or `vitest.config.ts` |
| **Quick run command** | `pnpm --filter backend-ts test -- --testPathPattern=openrouter` |
| **Full suite command** | `pnpm --filter backend-ts test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter backend-ts test -- --testPathPattern=openrouter`
- **After every plan wave:** Run `pnpm --filter backend-ts test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 92-01-T1 | 01 | 1 | OPENR-02 | unit | `cd apps/backend-ts && npm run test -- src/llm/types.test.ts src/llm/config.test.ts 2>&1 \| tail -20` | ⬜ pending |
| 92-01-T2 | 01 | 1 | OPENR-02, OPENR-03, OPENR-04 | unit | `cd apps/backend-ts && npm run test -- src/llm/factory.test.ts 2>&1 \| tail -20` | ⬜ pending |
| 92-02-T1 | 02 | 2 | OPENR-02, OPENR-03, OPENR-04 | unit | `cd apps/backend-ts && npm run test -- src/llm/factory.test.ts 2>&1 \| tail -30` | ⬜ pending |
| 92-02-T2 | 02 | 2 | OPENR-02, OPENR-03, OPENR-04 | unit | `cd apps/backend-ts && npm run test -- src/llm/config.test.ts src/llm/types.test.ts 2>&1 \| tail -30` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

*jest/vitest is already configured in `apps/backend-ts`. Test files (`factory.test.ts`, `config.test.ts`, `types.test.ts`) already exist. No new framework installation or stub scaffolding needed before Wave 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Free-tier model chat works with no API key | OPENR-02 | Requires live OpenRouter endpoint | Set `LLM_PROVIDER=openrouter`, `LLM_MODEL=meta-llama/llama-3.1-8b-instruct:free`, no `OPENROUTER_API_KEY`. Run JARVIS and send a chat message. Confirm response arrives. |
| 429 retry user notification | OPENR-03 | Requires hitting actual rate limit | Set rate limit threshold, send rapid messages, confirm user-facing retry message appears in terminal |
| Paid model with API key | OPENR-04 | Requires valid API key | Set `OPENROUTER_API_KEY` + paid model, confirm chat works |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not needed — existing test infrastructure covers all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
