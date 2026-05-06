---
phase: 57
slug: google-gemini-provider
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `apps/backend-ts/vitest.config.ts` / `apps/desktop/vitest.config.ts` |
| **Quick run command** | `cd apps/backend-ts && npx vitest run src/llm/` |
| **Full suite command** | `cd apps/backend-ts && npx vitest run && cd ../desktop && npx vitest run` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend-ts && npx vitest run src/llm/`
- **After every plan wave:** Run full suite (backend-ts + desktop)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | LLM-PROV-01 | unit | `npx vitest run src/llm/config.test.ts` | ✅ | ⬜ pending |
| 57-01-02 | 01 | 1 | LLM-PROV-01 | unit | `npx vitest run src/llm/factory.test.ts` | ✅ | ⬜ pending |
| 57-01-03 | 01 | 1 | LLM-PROV-01 | unit | `npx vitest run src/llm/types.test.ts` | ❌ W0 | ⬜ pending |
| 57-02-01 | 02 | 1 | LLM-PROV-01 | unit | `npx vitest run src/session/` | ❌ W0 | ⬜ pending |
| 57-02-02 | 02 | 2 | LLM-PROV-01 | integration | `npx vitest run src/` | ❌ W0 | ⬜ pending |
| 57-03-01 | 03 | 2 | LLM-PROV-01 | unit | `cd apps/desktop && npx vitest run src/main/store.test.ts` | ✅ | ⬜ pending |
| 57-03-02 | 03 | 2 | LLM-PROV-01 | unit | `cd apps/desktop && npx vitest run src/main/ipc/` | ✅ | ⬜ pending |
| 57-04-01 | 04 | 3 | LLM-PROV-01 | unit | `cd apps/desktop && npx vitest run src/renderer/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/llm/types.test.ts` — type validation stubs for LLM-PROV-01 (gemini in union)
- [ ] `apps/backend-ts/src/session/reload.test.ts` — stubs for swapLLM() and /internal/reload-llm
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx` — update for conditional API key inputs and gemini provider

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gemini responds to chat (SC-2) | LLM-PROV-01 | Requires live GEMINI_API_KEY and network | Set Gemini in Settings, send test message, verify non-LMStudio response |
| LM Studio degradation toast (SC-3) | LLM-PROV-01 | Requires UI + toast observation | Set invalid GEMINI_API_KEY, send message, verify toast appears |
| Safety filter null toast (SC-4) | LLM-PROV-01 | Requires Gemini safety trigger | Send adversarial prompt that triggers safety filter, verify "JARVIS não pôde responder" toast |
| No restart required (SC-1) | LLM-PROV-01 | Requires full app + settings interaction | Change provider to Gemini in Settings, verify no restart needed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
