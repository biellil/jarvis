---
phase: 40-always-listening-intent-classifier
verified: 2026-04-26T13:05:45Z
status: passed
score: 4/4
overrides_applied: 0
requirements_verified:
  VLISTEN-01: pass
  VLISTEN-02: pass
  VLISTEN-03: pass
  VLISTEN-04: pass
---

# Phase 40: Always-Listening Intent Classifier — Verification Report

**Phase Goal:** Implement Always-Listening voice mode: background VAD detection that captures audio when speech is detected (no manual push-to-talk), runs intent classification to decide whether to process the utterance, and applies a configurable VAD silence threshold via the Settings UI — all without breaking existing modes.

**Verified:** 2026-04-26T13:05:45Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Always-Listening mode starts/stops without manual trigger — IPC start/stop handlers and VAD-driven engine exist | VERIFIED | `AlwaysListeningStrategy.start()` registers `ALWAYS_LISTENING_UTTERANCE` listener and sends `ALWAYS_LISTENING_START` IPC with VAD frames; `stop()` removes handler and sends `ALWAYS_LISTENING_STOP`. Engine uses `MicVAD` from `@ricky0123/vad-web` with `redemptionMs` logic derived from `vadNegativeFramesToClose`. |
| 2 | Intent classification filters utterances using multilingual-e5-small with cosine similarity and pt-BR few-shot examples, with STT confidence pre-filter | VERIFIED | `IntentClassifier.classify()` pre-filters on `sttConfidence < 0.5` (D-08), races against 300ms timeout (D-10), computes cosine similarity against 25 pre-computed few-shot embeddings (15 positive + 10 negative pt-BR), applies threshold 0.6 with `maxPositive > maxNegative` guard. |
| 3 | 500ms audio pre-roll preserved around utterance boundary via circular Float32Array ring buffer | VERIFIED | `AudioRingBuffer(16000)` (capacity = PRE_ROLL_SAMPLES * 2 = 8000 * 2 @ 16kHz = 1000ms headroom, 500ms effective pre-roll). `onFrameProcessed` feeds frames to ring buffer only when `!inSpeech`; `handleSpeechEnd` concatenates `ringBuffer.toArray()` + utterance audio before WAV encode. |
| 4 | Configurable VAD silence threshold 300–800ms applies at runtime without restart via Settings UI slider and IPC chain | VERIFIED | Slider in `SettingsForm.tsx` (range 300–800ms, step 50ms) calls `window.settings.setVadThreshold(ms)` on change. Preload bridges to `ipcMain.handle('always-listening:vad-threshold')` in `ipc/settings.ts` which clamps, persists via `setVadSilenceThresholdMs()`, then broadcasts `vad:threshold-changed` to renderer. Engine listener (registered in `start()`) calls `reconfigureVadThreshold()` which invokes `vadSession.setOptions({ redemptionMs })`. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts` | Engine compositor with MicVAD, ring buffer, classifier lazy-load | VERIFIED | 366 lines. Full implementation: MicVAD session, AudioRingBuffer, IntentClassifier, VAD threshold reconfiguration, dispose/stop lifecycle. No stubs. |
| `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts` | Classifier using @xenova/transformers + cosine similarity | VERIFIED | 283 lines. `pipeline('feature-extraction', 'Xenova/multilingual-e5-small')`, pre-computed Map of few-shot embeddings, cosine similarity with 1e-8 guard, STT pre-filter, timeout race, audit log. |
| `apps/desktop/src/renderer/src/voice/alwaysListening/audioRingBuffer.ts` | Circular Float32Array buffer with 500ms pre-roll capacity | VERIFIED | 70 lines. Fixed-size Float32Array with writeHead/readHead/count pointers. write(), toArray() (with implicit clear), clear(), getSize(). Capacity 16000 samples = 1000ms @ 16kHz gives 500ms+ pre-roll. |
| `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts` | Main-process IPC bridge — start/stop handlers, utterance dispatch | VERIFIED | 241 lines. `AlwaysListeningStrategy` class implements `VoiceCaptureStrategy`. `start()` sends `ALWAYS_LISTENING_START` with `negativeFramesToClose` from stored VAD threshold, registers utterance listener, dispatches to `handleAudio`. `stop()` removes listener, sends `ALWAYS_LISTENING_STOP`. |
| `apps/desktop/src/main/ipc/settings.ts` | VAD threshold IPC handler — clamp, persist, broadcast | VERIFIED | `ipcMain.handle(ALWAYS_LISTENING_VAD_THRESHOLD)` clamps input to [300, 800], calls `setVadSilenceThresholdMs(clamped)`, sends `vad:threshold-changed` broadcast to renderer. Registered via `setupSettingsHandlers` called by `setupIpcHandlers` at app boot. |
| `apps/desktop/src/renderer/src/settings/SettingsForm.tsx` | Settings UI slider for VAD threshold | VERIFIED | Slider `<input type="range" min=300 max=800 step=50>` rendered in Always-Listening section. `handleVadThresholdChange()` calls `window.settings.setVadThreshold(ms)` on onChange. State initialized from `settings.get()` response including `vadSilenceThresholdMs`. |
| `apps/desktop/src/main/voiceMode/intentExamples.pt-BR.ts` | Few-shot pt-BR intent examples | VERIFIED | 15 positive commands (abre o terminal, abre o navegador, etc.) + 10 negative filler words (uh, hmm, deixa aí, etc.). Imported by IntentClassifier. |
| `apps/desktop/src/preload/settings.ts` | Preload bridge for setVadThreshold | VERIFIED | `setVadThreshold: (ms) => ipcRenderer.invoke('always-listening:vad-threshold', ms)` exposed via `contextBridge.exposeInMainWorld('settings', ...)`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `SettingsForm.tsx` | `ipc/settings.ts` | `window.settings.setVadThreshold(ms)` → preload → `ipcRenderer.invoke('always-listening:vad-threshold')` | WIRED | Slider onChange calls `handleVadThresholdChange` which calls `window.settings.setVadThreshold`. Preload bridges to ipcMain.handle. |
| `ipc/settings.ts` | `store.ts` | `setVadSilenceThresholdMs(clamped)` | WIRED | Handler persists clamped value; `getVadSilenceThresholdMs()` used by `AlwaysListeningStrategy.start()` to initialize engine. |
| `ipc/settings.ts` | `AlwaysListeningEngine.ts` | `mainWindow.webContents.send('vad:threshold-changed', clamped)` → `window.jarvis.ipcRenderer.on` listener | WIRED | Broadcast sent by settings handler; engine registers listener on `VAD_THRESHOLD_CHANGED_CHANNEL` after `vadSession.start()` in `start()`. Calls `reconfigureVadThreshold()` → `vadSession.setOptions({ redemptionMs })`. |
| `AlwaysListeningStrategy.ts` (main) | `AlwaysListeningEngine.ts` (renderer) | `mainWindow.webContents.send(ALWAYS_LISTENING_START, { negativeFramesToClose, vadThresholdMs })` | WIRED | Strategy sends IPC start signal with computed frames from stored threshold. Engine (renderer) receives and mounts MicVAD session. |
| `AlwaysListeningEngine.ts` | `AlwaysListeningStrategy.ts` | `window.jarvis.ipcRenderer → ipcMain.on(ALWAYS_LISTENING_UTTERANCE)` | WIRED | Engine calls `opts.onUtteranceReady(wavBuffer)` in `handleSpeechEnd`; strategy registers utterance listener in `start()` that dispatches to `handleAudio`. |
| `IntentClassifier` | `intentExamples.pt-BR.ts` | `INTENT_EXAMPLES_PT_BR` import + `precomputeExamples()` in `load()` | WIRED | Classifier imports and iterates both `positive` and `negative` arrays during load to pre-compute embeddings into `fewShotEmbeddings` Map. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `AlwaysListeningEngine.ts` | `utteranceAudio` (Float32Array from MicVAD) | `@ricky0123/vad-web` `onSpeechEnd` callback with live mic stream | Yes — live microphone audio via MediaStream | FLOWING |
| `AudioRingBuffer` | `ringSnapshot` | `ringBuffer.toArray()` from `onFrameProcessed` accumulation | Yes — real pre-speech frames from MicVAD | FLOWING |
| `IntentClassifier` | `fewShotEmbeddings` | `precomputeExamples()` calls `pipeline('feature-extraction')` on all 25 pt-BR examples | Yes — real ONNX model embeddings via Transformers.js | FLOWING |
| `SettingsForm.tsx` | `vadThresholdMs` | `window.settings.get()` → `getVadSilenceThresholdMs()` from store | Yes — persisted value with 500ms default fallback | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: Tests were run directly via vitest as the most reliable behavioral check. 91/91 tests passed covering:
- `intentClassifier.test.ts` — 13 tests: load, classify, pt-BR fixtures, STT pre-filter, timeout, audit log, unload
- `AlwaysListeningEngine.test.ts` — 14 tests: start/stop/dispose lifecycle, VAD session, ring buffer pre-roll, WAD threshold reconfiguration
- `audioRingBuffer.test.ts` — 9 tests: write, toArray, clear, circular overflow
- `alwaysListening.test.ts` — 18 tests: IPC start/stop/utterance dispatch, VAD threshold handler location, degraded-mode, pre-download
- `settings.test.ts` — 37 tests: includes full VAD threshold IPC handler suite (clamp, persist, broadcast)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 91 Phase 40 tests | `npx vitest run` on 5 test files | 5 files, 91 tests, 0 failures | PASS |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| VLISTEN-01 | AlwaysListeningStrategy IPC start/stop + AlwaysListeningEngine with MicVAD + redemptionMs | SATISFIED | `AlwaysListeningStrategy.start()` sends `ALWAYS_LISTENING_START`, `stop()` sends `ALWAYS_LISTENING_STOP`. Engine uses `MicVAD.new({ redemptionMs: framesToRedemptionMs(negativeFramesToClose) })`. |
| VLISTEN-02 | IntentClassifier with multilingual-e5-small, cosine similarity, pt-BR few-shot, STT confidence filter | SATISFIED | `pipeline('feature-extraction', 'Xenova/multilingual-e5-small')`, 25 pt-BR examples (15+10), cosine similarity with threshold 0.6, `sttConfidence < 0.5` pre-filter, 300ms timeout send-anyway. |
| VLISTEN-03 | AudioRingBuffer circular Float32Array with 500ms+ pre-roll capacity | SATISFIED | Capacity 16000 samples @ 16kHz = 1000ms, effective pre-roll = 500ms (PRE_ROLL_SAMPLES = 8000). Ring buffer fed pre-speech frames in `onFrameProcessed`, concatenated in `handleSpeechEnd`. |
| VLISTEN-04 | Slider 300-800ms in Settings UI, IPC chain renderer→main→store→engine, `reconfigureVadThreshold` called | SATISFIED | Slider in SettingsForm (min=300 max=800 step=50). IPC: `window.settings.setVadThreshold` → preload invoke → `ipc/settings.ts` handler clamp+persist+broadcast → engine `reconfigureVadThreshold` → `vadSession.setOptions({ redemptionMs })`. |

---

### Anti-Patterns Found

No anti-patterns detected across all six key files. No TODO/FIXME/PLACEHOLDER comments, no stub return values, no empty handlers, no hardcoded empty arrays flowing to user-visible output.

---

### Human Verification Required

None. All requirements are verifiable programmatically via code inspection and test suite execution.

---

### Gaps Summary

No gaps identified. All four requirements (VLISTEN-01 through VLISTEN-04) are fully implemented, substantively coded (no stubs), wired end-to-end, and covered by a passing 91-test suite. The implementation is complete and coherent.

---

_Verified: 2026-04-26T13:05:45Z_
_Verifier: Claude (gsd-verifier)_
