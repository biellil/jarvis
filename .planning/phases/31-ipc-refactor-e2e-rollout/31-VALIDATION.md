---
phase: 31
slug: ipc-refactor-e2e-rollout
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/desktop) + jest (apps/backend-ts) |
| **Config file** | apps/desktop/vitest.config.ts |
| **Quick run command** | `cd apps/desktop && pnpm test --run` |
| **Full suite command** | `pnpm --filter desktop test --run && pnpm --filter backend-ts test --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop && pnpm test --run`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | ARCH-06 | unit | `pnpm --filter desktop test chat-send-audio --run` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | ARCH-06 | unit | `pnpm --filter desktop test chat-send-audio --run` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 2 | ARCH-06 | e2e-manual | manual: USE_WHISPER_CPP=true, say Hey JARVIS | N/A | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts` — bifurcation test for USE_WHISPER_CPP=true → voiceHandler.handleAudio path

*Existing test infrastructure covers all other requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E voice pipeline with USE_WHISPER_CPP=true | ARCH-06 | Requires real GPU + mic + live LLM | Start app with USE_WHISPER_CPP=true, say "Hey JARVIS, test", confirm audio response |
| PTT regression check | ARCH-06 | Requires real hardware + mic | Press PTT, speak, confirm response identical to pre-31 behavior |
| Multi-turn voice preserved | ARCH-06 | Requires live TTS + follow-up window | After first response, speak follow-up within 10s, confirm response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
