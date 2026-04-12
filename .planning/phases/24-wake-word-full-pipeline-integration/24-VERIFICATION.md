---
phase: 24-wake-word-full-pipeline-integration
verified: 2026-04-12T14:30:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "E2E happy path com mic real: dizer 'Hey JARVIS, que horas sao?' e ouvir resposta TTS"
    expected: "Orb wake burst -> listening -> processing -> responding com audio TTS -> idle em <5s"
    why_human: "Requer hardware real (microfone fisico), LLM rodando, e Murf API key valida. Unit tests provam contratos mas nao provam integracao com hardware."
  - test: "VAD real termina recording ~1.4s apos usuario parar de falar (nao timeout fixo)"
    expected: "Recording termina por boundary detection do Silero VAD, nao por timer"
    why_human: "Comportamento do VAD com voz humana real nao e testavel via happy-dom mocks"
  - test: "Loop automatico: apos resposta, dizer 'Hey JARVIS' de novo sem tocar em nada"
    expected: "Wake word dispara novamente, ciclo completo repete"
    why_human: "Requer validacao de que wake word listener retoma apos ciclo completo"
  - test: "Error recovery com backend down: matar backend e dizer 'Hey JARVIS, teste'"
    expected: "Toast pt-BR visivel + orb retorna a idle"
    why_human: "Requer ambiente real com backend parado"
---

# Phase 24: Wake Word Full Pipeline Integration Verification Report

**Phase Goal:** Usuario fala "Hey JARVIS, <pergunta>" e recebe resposta falada do LLM, fim. Fecha o loop wake word -> STT -> LLM -> TTS -> idle que ficou desconectado nas Phases 22/23.
**Verified:** 2026-04-12T14:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | E2E loop: wake word -> STT -> LLM -> TTS -> idle fecha corretamente | VERIFIED | `useWakeWord.ts` imports MicVAD, calls `encodeFloat32ToWav` on `onSpeechEnd`, passes wavBytes to `sendAudioAndHandle` which calls `window.jarvis.sendAudio` -> backend -> TTS response. Data flow traced through 4 files. Old `void stopRecording()` removed. |
| 2 | VAD real (Silero) substitui timeout fixo de vadTimeoutMs | VERIFIED | `@ricky0123/vad-web@0.0.30` installed in `apps/desktop/package.json`. `MicVAD.new()` called in `useWakeWord.ts:296`. `vadTimeoutMs` replaced by 6s absolute fallback via `VITE_WAKE_WORD_MAX_RECORDING_MS`. VAD assets (worklet + ONNX model) exist in `public/vad/`. |
| 3 | Handler compartilhado: sendAudioAndHandle consumido por ChatInput (PTT) e useWakeWord (wake word) | VERIFIED | `sendAudioAndHandle.ts` (134 lines) exists with `SendAudioAndHandleDeps` interface. ChatInput.tsx imports and calls it (line 6, 98). useWakeWord.ts imports and calls it (line 50, 331). No `handleAudioResponse` or `window.jarvis.sendAudio` in ChatInput anymore (confirmed via grep: 0 matches). |
| 4 | Error recovery: backend down, LLM timeout, mic muted, silent stream -> orb idle + toast pt-BR + log | VERIFIED | `D08_STRINGS` map in `sendAudioAndHandle.ts` contains all 5 exact pt-BR strings. `finally { deps.setState('idle') }` guarantees idle invariant. 16/16 unit tests pass including D-08 exact string regression tests and idle invariant parameterized test. |
| 5 | E2E humano assinado com mic real | VERIFIED | `24-UAT.md` exists with `status: approved` in frontmatter. `24-05-SUMMARY.md` confirms human sign-off was approved with real mic testing. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/backend-ts/src/voice/tts/murf.ts` | MurfTTSProvider class | VERIFIED | 106 lines, implements TTSProvider, `api.murf.ai` endpoint, `api-key` header, `encodeAsBase64`, default `pt-BR-heitor` |
| `apps/backend-ts/src/voice/tts/murf.test.ts` | Unit tests 16 cases | VERIFIED | 16/16 passing, covers happy path + all error modes + security (T-24-01 key non-leakage) |
| `apps/backend-ts/src/voice/tts/index.ts` | Factory with murf case | VERIFIED | `import { MurfTTSProvider } from "./murf.js"`, `if (provider === "murf")` block, fallback to LocalTTSProvider when key missing |
| `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` | Pure async shared helper | VERIFIED | 134 lines, exports `sendAudioAndHandle` + `SendAudioAndHandleDeps`, `finally` idle invariant, D08_STRINGS map |
| `apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` | Unit tests 16 cases | VERIFIED | 16/16 passing, D-08 exact pt-BR strings, idle invariant across all 3 paths |
| `apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts` | Pure WAV encoder | VERIFIED | 88 lines, 44-byte RIFF header + Int16LE PCM, browser-safe (no Buffer) |
| `apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` | WAV encoder tests | VERIFIED | 15/15 passing |
| `apps/desktop/src/renderer/public/vad/vad.worklet.bundle.min.js` | VAD worklet asset | VERIFIED | File exists |
| `apps/desktop/src/renderer/public/vad/silero_vad_legacy.onnx` | Silero ONNX model | VERIFIED | File exists |
| `apps/desktop/src/renderer/hooks/useWakeWord.ts` | Hook with MicVAD integration | VERIFIED | Imports MicVAD, sendAudioAndHandle, encodeFloat32ToWav. onSpeechEnd encodes and sends audio. |
| `apps/desktop/package.json` | @ricky0123/vad-web dep | VERIFIED | `"@ricky0123/vad-web": "0.0.30"` at line 22 |
| `.env.example` | MURF_API_KEY + MURF_VOICE_ID documented | VERIFIED | Both present with empty values, privacy note, alternatives listed |
| `.planning/REQUIREMENTS.md` | WAKE-10..13 + WAKE-DEF-01 + traceability | VERIFIED | All 4 new reqs defined, WAKE-DEF-01 deferred, traceability table updated to 15/15 P1 mapped |
| `.planning/phases/24-wake-word-full-pipeline-integration/24-UAT.md` | Human UAT checklist | VERIFIED | Exists with status: approved, covers SC-1 through SC-5, A6 check, 10 decisions |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tts/index.ts` | `tts/murf.ts` | `import { MurfTTSProvider } from './murf.js'` | WIRED | Import at line 4, re-export at line 11, factory case at line 45 |
| `murf.ts` | Murf REST API | `fetch('https://api.murf.ai/v1/speech/generate')` | WIRED | Line 47, POST with api-key header |
| `ChatInput.tsx` | `sendAudioAndHandle.ts` | `import { sendAudioAndHandle }` | WIRED | Import line 6, call at line 98 |
| `useWakeWord.ts` | `sendAudioAndHandle.ts` | `import { sendAudioAndHandle }` | WIRED | Import line 50, call at line 331 |
| `useWakeWord.ts` | `@ricky0123/vad-web` | `import { MicVAD }` | WIRED | Import line 44, `MicVAD.new()` at line 296 |
| `useWakeWord.ts` | `encodeFloat32ToWav.ts` | `import { encodeFloat32ToWav }` | WIRED | Import line 51, call at line 326 |
| `sendAudioAndHandle.ts` | `handleAudioResponse.ts` | `import { handleAudioResponse }` | WIRED | Import line 42, called at lines 101 and 117 |
| `sendAudioAndHandle.ts` | `window.jarvis.sendAudio` | IPC call | WIRED | Line 94: `await window.jarvis.sendAudio(audioBuffer)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `useWakeWord.ts` | `audio: Float32Array` | `MicVAD.onSpeechEnd` callback | Yes (real mic audio via Silero VAD) | FLOWING |
| `sendAudioAndHandle.ts` | `result: SendAudioResponse` | `window.jarvis.sendAudio(audioBuffer)` IPC | Yes (backend STT + LLM response) | FLOWING |
| `murf.ts` | `json.encodedAudio` | `fetch(api.murf.ai)` response | Yes (cloud TTS audio base64) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Murf TTS provider tests | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/murf.test.ts` | 16/16 passed | PASS |
| sendAudioAndHandle tests | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` | 16/16 passed | PASS |
| WAV encoder tests | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` | 15/15 passed | PASS |
| Full TTS suite (regression) | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/` | 50/50 passed (6 files) | PASS |
| Security: API key not logged | `grep -nE 'console\.log\([^)]*apiKey' apps/backend-ts/src/voice/tts/murf.ts` | 0 matches | PASS |
| ChatInput: no inline sendAudio | `grep 'window.jarvis.sendAudio' ChatInput.tsx` | 0 matches | PASS |
| ChatInput: no handleAudioResponse | `grep 'handleAudioResponse' ChatInput.tsx` | 0 matches | PASS |
| useWakeWord: no void stopRecording | `grep 'void stopRecording' useWakeWord.ts` | 0 matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WAKE-05 | 24-02, 24-04 | Ciclo completo wake -> response -> TTS -> idle retoma automaticamente | SATISFIED | sendAudioAndHandle wired in useWakeWord; after idle, wake word listener resumes (MicVAD lifecycle in hook) |
| WAKE-06 | 24-04 | VAD real substitui timeout fixo | SATISFIED | MicVAD from @ricky0123/vad-web replaces setTimeout; 6s absolute fallback via VITE_WAKE_WORD_MAX_RECORDING_MS |
| WAKE-10 | 24-02 | TTS failure -> texto visivel + orb idle | SATISFIED | handleAudioResponse calls addAgentMessage BEFORE playTTS (D-06); sendAudioAndHandle finally block ensures idle |
| WAKE-11 | 24-02, 24-04 | Hard errors -> toast pt-BR + orb idle | SATISFIED | D08_STRINGS map with 5 exact pt-BR strings; finally idle invariant; 16 tests pass |
| WAKE-12 | 24-01 | TTS_PROVIDER=murf com fallback | SATISFIED | MurfTTSProvider (106 lines), factory case, fallback to LocalTTSProvider when key missing; 50/50 TTS suite |
| WAKE-13 | 24-02, 24-03, 24-04 | PTT e wake word consomem sendAudioAndHandle | SATISFIED | ChatInput imports sendAudioAndHandle (line 6, call line 98). useWakeWord imports sendAudioAndHandle (line 50, call line 331). No duplication. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `useWakeWord.ts` | 372 | `TODO Phase 23: broadcast para tray indicator` | INFO | Pre-existing from Phase 23, not blocking Phase 24 goal |

### Human Verification Required

These items require real hardware (microphone, running LLM, Murf API) to verify. Unit tests prove contracts but not hardware integration.

### 1. E2E Happy Path with Real Microphone

**Test:** Say "Hey JARVIS, que horas sao?" with orb in idle state
**Expected:** Wake burst -> listening -> VAD detects speech end -> processing -> responding with TTS audio -> idle, all in <5s perceived
**Why human:** Requires physical microphone, running LM Studio, valid Murf API key. Unit tests mock all IPC.

### 2. VAD Real Speech Boundary Detection

**Test:** Say a full sentence after "Hey JARVIS" and observe when recording stops
**Expected:** Recording ends ~1.4s after user stops speaking (Silero VAD boundary), not at a fixed timeout
**Why human:** VAD behavior with real human voice in real acoustic environment cannot be tested via happy-dom mocks

### 3. Automatic Wake Word Loop Resumption

**Test:** After first response plays and orb returns to idle, say "Hey JARVIS" again without touching anything
**Expected:** Second wake word fires, full cycle repeats identically
**Why human:** Wake word engine resumption after full pipeline cycle needs real-world validation

### 4. Error Recovery with Backend Down

**Test:** Kill backend-ts, say "Hey JARVIS, teste"
**Expected:** Toast pt-BR "JARVIS offline. Verifique o backend." appears, orb returns to idle
**Why human:** Requires simulating real network failure, not unit test mock

**NOTE:** The 24-UAT.md has `status: approved` in its frontmatter and the 24-05-SUMMARY.md confirms human sign-off was collected. These human verification items were already tested and approved during the UAT execution. The `human_needed` status reflects the structural requirement that E2E hardware integration tests need human validation, which has been completed.

### Gaps Summary

No gaps found. All 5 observable truths verified. All 14 artifacts exist, are substantive, and are wired. All 8 key links verified as WIRED. All 6 requirement IDs (WAKE-05, WAKE-06, WAKE-10, WAKE-11, WAKE-12, WAKE-13) SATISFIED. All behavioral spot-checks PASS (97 tests across 4 suites). No blocking anti-patterns. Security check (T-24-01 API key non-leakage) passes.

Human UAT was executed and approved (24-UAT.md status: approved). The human verification items listed above document what was tested during UAT, not outstanding work.

---

_Verified: 2026-04-12T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
