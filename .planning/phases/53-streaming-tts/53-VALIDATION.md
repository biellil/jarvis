---
phase: 53
slug: streaming-tts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `53-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 (already installed) |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `npm --workspace @jarvis/desktop run test -- <pattern>` |
| **Full suite command** | `npm --workspace @jarvis/desktop run test` |
| **Estimated runtime** | ~30 seconds (incremental); ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm --workspace @jarvis/desktop run test -- <changed-file-pattern>` (vitest auto-filter)
- **After every plan wave:** Run `npm --workspace @jarvis/desktop run test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke for success criteria #1 (latency) and #2 (zero gap)
- **Max feedback latency:** 30 seconds (quick), 90 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | STTS-01 | unit | `npm --workspace @jarvis/desktop run test -- chunker.test.ts` | ❌ W0 | ⬜ pending |
| 53-01-02 | 01 | 1 | STTS-01 | integration | `npm --workspace @jarvis/desktop run test -- streamingTurn.test.ts` | ❌ W0 | ⬜ pending |
| 53-01-03 | 01 | 1 | STTS-01 | integration | `npm --workspace @jarvis/desktop run test -- streamingTurn.latency.test.ts` | ❌ W0 | ⬜ pending |
| 53-02-01 | 02 | 1 | STTS-01 | unit (happy-dom) | `npm --workspace @jarvis/desktop run test -- streamingTtsPlayer.test.ts` | ❌ W0 | ⬜ pending |
| 53-03-01 | 03 | 2 | STTS-02 | unit | `npm --workspace @jarvis/desktop run test -- store.test.ts` | ✅ extend | ⬜ pending |
| 53-03-02 | 03 | 2 | STTS-02 | unit | `npm --workspace @jarvis/desktop run test -- ipc-settings.test.ts` | ✅ extend | ⬜ pending |
| 53-03-03 | 03 | 2 | STTS-02 | RTL | `npm --workspace @jarvis/desktop run test -- TtsSection.test.tsx` | ✅ extend | ⬜ pending |
| 53-04-01 | 04 | 3 | STTS-01, STTS-02 | integration | `npm --workspace @jarvis/desktop run test -- voiceHandler.streaming.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Final task IDs/wave assignment to be confirmed by planner.*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/voiceInput/__tests__/chunker.test.ts` — STTS-01 chunker behavior (split tokens, multi-sentence, flush)
- [ ] `apps/desktop/src/main/voiceInput/__tests__/streamingTurn.test.ts` — STTS-01 SSE→synth→IPC orchestration with mocks
- [ ] `apps/desktop/src/main/voiceInput/__tests__/streamingTurn.latency.test.ts` — first-token-to-first-chunk timing
- [ ] `apps/desktop/src/renderer/src/audio/__tests__/streamingTtsPlayer.test.ts` — gapless scheduling, out-of-order drain, stopTurn cleanup (AudioContext mock in happy-dom)
- [ ] `apps/desktop/src/main/__tests__/voiceHandler.streaming.test.ts` — STTS-02 flag bifurcation + no-regression Murf path
- [ ] Extend `apps/desktop/src/main/__tests__/store.test.ts` — `getStreamingTtsEnabled` / `setStreamingTtsEnabled`
- [ ] Extend `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — `streamingTts:set` IPC handler
- [ ] Extend `apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx` — Switch toggle (use `fireEvent.click`, per Phase 48 note)

**Mock strategy for AudioContext in happy-dom:** define minimal `class FakeAudioContext { currentTime; state; createBufferSource(); decodeAudioData(); resume(); }` in a test setup file, assign to `globalThis.AudioContext` before imports (precedent: Phase 22 wake word tests mocking onnxruntime-web).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-sentence latency <1s after first sentence completes | Success Criteria #1 | Real TTS provider + audio device required | Smoke: enable `STREAMING_TTS=true` na Settings, dizer ao JARVIS "me conte uma história em 3 frases", cronometrar primeiro áudio (instrumentar `console.time` em dev build) |
| Zero perceptível silêncio entre sentenças | Success Criteria #2 | Human ears | Mesmo smoke acima — ouvir com atenção a transições |
| Toggle live sem restart afeta próximo turno | Success Criteria #4 | UI multi-step interaction | Falar com flag=false → turn full-response. Abrir Settings, ligar toggle. Falar de novo → turn streaming. Sem restart entre os dois. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (full), < 30s (quick)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
