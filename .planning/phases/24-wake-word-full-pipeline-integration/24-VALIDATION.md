---
phase: 24
slug: wake-word-full-pipeline-integration
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-11
updated: 2026-04-11
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (renderer + backend-ts) |
| **Config file** | apps/desktop/vitest.config.ts, apps/backend-ts/vitest.config.ts |
| **Quick run command** | `pnpm --filter @jarvis/desktop test --run` |
| **Full suite command** | `pnpm -r test --run` |
| **Estimated runtime** | ~30-45 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (scoped to touched package)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green + human UAT sign-off completed
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-T1 | 01 | 1 | WAKE-12 | T-24-01, T-24-03 | MurfTTSProvider never logs API key; defensive JSON parse | unit (TDD) | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/murf.test.ts` | ❌ Wave 0 | ⬜ pending |
| 24-01-T2 | 01 | 1 | WAKE-12 | T-24-02 | `.env.example` has empty MURF_API_KEY + documents privacy trade-off | unit (TDD) | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/index.test.ts` | ✅ add cases | ⬜ pending |
| 24-02-T1 | 02 | 1 | WAKE-05, WAKE-10, WAKE-11, WAKE-13 | T-24-10, T-24-13 | Invariant setState('idle') in all 3 paths; pt-BR toasts | unit (TDD) | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` | ❌ Wave 0 | ⬜ pending |
| 24-03-T1 | 03 | 2 | WAKE-13 | T-24-20, T-24-21 | Type check + no handleAudioResponse duplication; PTT regression guard | refactor | `pnpm --filter @jarvis/desktop exec tsc --noEmit && pnpm --filter @jarvis/desktop test --run` | ✅ grep-based | ⬜ pending |
| 24-04-T1 | 04 | 2 | WAKE-06 | T-24-30, T-24-31 | WAV encoder pure function + clipping + RIFF header bytes | unit (TDD) | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` | ❌ Wave 0 | ⬜ pending |
| 24-04-T2 | 04 | 2 | WAKE-05, WAKE-06, WAKE-10, WAKE-11 | T-24-32, T-24-33, T-24-35 | VAD lifecycle cleanup; 6s max fallback; no audio leak | unit (TDD) | `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts` | ✅ add Phase 24 describe block | ⬜ pending |
| 24-05-T1 | 05 | 3 | WAKE-10..WAKE-13 | T-24-42 | REQUIREMENTS.md traceability accurate and honest | docs | `grep -c 'WAKE-1[0-3]' .planning/REQUIREMENTS.md` (expect ≥ 4) | ✅ grep-based | ⬜ pending |
| 24-05-T2 | 05 | 3 | all | T-24-40 | UAT checklist covers all 5 SCs + 3 manual-only + A6 | docs | `grep -c 'SC-[1-5]' .planning/phases/24-wake-word-full-pipeline-integration/24-UAT.md` (expect ≥ 5) | ❌ Wave 0 | ⬜ pending |
| 24-05-T3 | 05 | 3 | WAKE-05, WAKE-06, WAKE-10, WAKE-11, WAKE-12, WAKE-13 | T-24-40 | Human UAT sign-off (blocking checkpoint) | manual | **Human checkpoint** | n/a | ⬜ pending |

---

## Wave 0 Requirements

Before Wave 1 tasks run, Wave 0 creates these NEW test files + installs new deps:

- [ ] `apps/backend-ts/src/voice/tts/murf.test.ts` — NEW test file (WAKE-12 happy path + 6 error modes + security grep)
- [ ] `apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` — NEW test file (WAKE-05, WAKE-10, WAKE-11, WAKE-13 — 10 test cases)
- [ ] `apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` — NEW test file (13 test cases for RIFF header, PCM bytes, clipping)
- [ ] `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — EXISTS but add new `describe('Phase 24 — VAD integration')` block with 10 new cases
- [ ] `apps/backend-ts/src/voice/tts/index.test.ts` — EXISTS but add 2 new `TTS_PROVIDER=murf` cases
- [ ] **Install:** `pnpm --filter @jarvis/desktop add @ricky0123/vad-web@0.0.30` — single new dep in Phase 24
- [ ] **Assets copy:** `apps/desktop/src/renderer/public/vad/vad.worklet.bundle.min.js` + `silero_vad_legacy.onnx` copied from node_modules

**Framework install:** None — vitest already present in both apps.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E com mic real em pt-BR: "Hey JARVIS, que horas são?" → ouve resposta do LLM | SC-1 / WAKE-05 | Exige hardware de microfone + alto-falante real, voz humana pt-BR, avaliação subjetiva de qualidade TTS Heitor | See 24-UAT.md §SC-1 |
| Ciclo automático retoma (segunda invocação sem ação) | SC-2 / WAKE-05 | Verificação temporal entre duas invocações consecutivas | See 24-UAT.md §SC-2 |
| VAD real substitui timeout fixo | SC-3 / WAKE-06 | Precisa ouvir silêncio real e ver se o 6s fallback OU o VAD detecta fim | See 24-UAT.md §SC-3 |
| Degradação gracioso TTS → texto visível (D-06) | SC-4B / WAKE-10 | Exige forçar chave inválida no runtime e confirmar que texto ainda aparece | See 24-UAT.md §SC-4 Cenário B |
| Error recovery com backend down | SC-4A / WAKE-11 | Requer derrubar processo real do backend | See 24-UAT.md §SC-4 Cenário A |
| PTT parity after refactor | SC-5 / WAKE-13 | Regression check do Plan 03 | See 24-UAT.md §SC-5 |
| A6 — mic permission prompt count = 1 | A6 research | Verificar que MicVAD.new({getStream}) não re-prompta mic | See 24-UAT.md §A6 |

All 7 manual checks are consolidated in `.planning/phases/24-wake-word-full-pipeline-integration/24-UAT.md`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify OR are documented as `manual: true` (only 24-05-T3 is manual, explicitly a blocking checkpoint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual only at Plan 05 Task 3 end of phase)
- [x] Wave 0 covers all MISSING references (4 new test files + 1 new dep + asset copy)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (scoped test per task commit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-11 by gsd-planner during `/gsd-plan-phase 24`
