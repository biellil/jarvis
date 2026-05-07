---
phase: 60
slug: lm-studio-streaming-events
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.3 |
| **Config file** | `apps/backend-ts/vitest.config.ts` |
| **Quick run command** | `npm test -- src/llm/streaming-events.test.ts` (from `apps/backend-ts/`) |
| **Full suite command** | `npm test` (from `apps/backend-ts/`) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/llm/streaming-events.test.ts`
- **After every plan wave:** Run `npm test` from `apps/backend-ts/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| streaming-events subclass | TBD | 1 | LLM-PROV-02 | unit | `npm test -- src/llm/streaming-events.test.ts` | ❌ W0 | ⬜ pending |
| factory flag integration | TBD | 1 | LLM-PROV-02 | unit | `npm test -- src/llm/factory.test.ts` | ✅ (extend) | ⬜ pending |
| SSE fallback on error | TBD | 1 | LLM-PROV-02 | unit | `npm test -- src/llm/streaming-events.test.ts -t "fallback"` | ❌ W0 | ⬜ pending |
| electron store flag | TBD | 2 | LLM-PROV-02 | unit | `npm test -- src/main/ipc/settings.test.ts` | ✅ (extend) | ⬜ pending |
| LlmSection toggle UI | TBD | 2 | LLM-PROV-02 | unit | `npm test -- LlmSection.test.tsx` (from `apps/desktop/`) | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/llm/streaming-events.ts` — ChatOpenAIStreamingEvents subclass (new file)
- [ ] `apps/backend-ts/src/llm/streaming-events.test.ts` — unit tests: native event parsing, fallback on 404/timeout, AIMessageChunk yielding, buffer management

*Existing infrastructure covers remaining tasks (factory.test.ts, settings.test.ts, LlmSection.test.tsx already exist).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-token latency measurably lower with native events | LLM-PROV-02 SC#1 | Requires running LM Studio with real model loaded | Enable flag in Settings, time 5 turns with stopwatch, compare avg vs standard SSE |
| Fallback transparent when model unsupported | LLM-PROV-02 SC#2 | Requires LM Studio with a model that doesn't support native events, or stop `/api/v1` manually | Set flag, use unsupported model, verify responses still arrive without hang or error toast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
