---
phase: 24-wake-word-full-pipeline-integration
plan: 04
subsystem: voice / renderer / wake-word-pipeline
one_liner: "Fecha o byte-discard existencial do useWakeWord substituindo MediaRecorder+setTimeout(3s) fixo por MicVAD real com 6s fallback e wire end-to-end via sendAudioAndHandle"
tags:
  - wake-word
  - vad
  - vad-web
  - silero
  - renderer
  - D-01
  - D-02
  - D-03
  - D-07
  - WAKE-05
  - WAKE-06
  - WAKE-10
  - WAKE-11
  - WAKE-13
requirements:
  - WAKE-05
  - WAKE-06
  - WAKE-10
  - WAKE-11
dependency_graph:
  requires:
    - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts (Plan 24-02 output — consumed from useWakeWord.ts)
    - apps/desktop/src/renderer/src/voice/handleAudioResponse.ts (transitively via sendAudioAndHandle)
    - apps/desktop/src/renderer/src/voice/voiceInputManager.ts (acquire/release gate)
    - apps/desktop/src/renderer/components/Orb/OrbContext.tsx (setState, triggerWakeBurst, wakeWordPaused)
    - apps/desktop/src/renderer/src/chat/ChatContext.tsx (useChat — addHumanMessage, addAgentMessage, setToast)
    - apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts (Phase 22 engine, still boots the hey-jarvis ONNX classifier)
    - "@ricky0123/vad-web@0.0.30 (new dep)"
  provides:
    - apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts (pure WAV encoder)
    - apps/desktop/src/renderer/hooks/useWakeWord.ts (wake word hook with MicVAD integration — THE GAP CLOSER)
    - apps/desktop/src/renderer/public/vad/vad.worklet.bundle.min.js (shipped asset)
    - apps/desktop/src/renderer/public/vad/silero_vad_legacy.onnx (shipped asset)
  affects:
    - (Plan 24-05) UAT: wake word → "Hey JARVIS, que horas são?" → TTS response
tech_stack:
  added:
    - "@ricky0123/vad-web@0.0.30"
  patterns:
    - MicVAD reusando MediaStream existente via `getStream: async () => stream` (A6)
    - `pauseStream` override no-op pra não matar o stream compartilhado com WakeWordEngine
    - Refs espelhados (addHumanMessageRef, addAgentMessageRef, setToastRef, setStateRef) pro closure do onSpeechEnd ler valores live do ChatContext
    - Float32Array → Int16 LE WAV via DataView (browser-safe — zero Buffer)
    - Fallback absoluto de 6s armado junto com vad.start(), limpo no onSpeechEnd real
key_files:
  created:
    - apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts (88 lines)
    - apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts (122 lines, 15 tests)
    - apps/desktop/src/renderer/public/vad/vad.worklet.bundle.min.js (2.4KB — copied from vad-web dist)
    - apps/desktop/src/renderer/public/vad/silero_vad_legacy.onnx (1.8MB — copied from vad-web dist)
    - .planning/phases/24-wake-word-full-pipeline-integration/24-04-SUMMARY.md
  modified:
    - apps/desktop/package.json (adds @ricky0123/vad-web 0.0.30)
    - pnpm-lock.yaml (vad-web + transitive deps)
    - apps/desktop/.env.example (adds VITE_WAKE_WORD_MAX_RECORDING_MS=6000, marks VITE_WAKE_WORD_VAD_TIMEOUT_MS as DEPRECATED)
    - apps/desktop/src/renderer/hooks/useWakeWord.ts (rewrite do boot + proceed/fallback, remove useAudioRecorder wiring)
    - apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts (rewrite test 2 + 5, add Phase 24 — VAD integration describe block com 10 casos)
decisions:
  - D-01 (VAD library): @ricky0123/vad-web@0.0.30 instalado. Reusa onnxruntime-web já na tree desde Phase 22 — zero runtime novo.
  - D-02 + A1 (VAD tuning): usa defaults REAIS da lib (positiveSpeechThreshold 0.3, negativeSpeechThreshold 0.25, redemptionMs 1400, preSpeechPadMs 800, minSpeechMs 400). O CONTEXT.md listava números stale — o plano resolveu o mismatch em favor dos defaults atuais da lib.
  - D-03 (max recording fallback): 6000ms absolute timer armado no proceed(), limpo no onSpeechEnd. Toast emitido é a string EXATA D-08 "Não ouvi nada. Diga Hey JARVIS de novo." (regression guard no test 24-08).
  - D-07 (shared pipeline consumption): useWakeWord agora chama sendAudioAndHandle exatamente como ChatInput vai chamar em Plan 24-03. Zero duplicação de código de IPC/error handling/state gating — ambos passam pelo mesmo helper.
  - A4 resolution (audio format): Float32 → WAV 16kHz mono encoding no renderer. Backend já aceita WAV via nodejs-whisper+ffmpeg. Overhead ~192KB/6s vs Opus ~60KB, aceitável.
  - A6 resolution (stream reuse): `getStream: async () => stream` passa o stream existente do WakeWordEngine. Runtime validation durante Plan 24-05 UAT (não é unit-testable — depende de browser real).
  - Rule 2 — pauseStream no-op override: o default da lib chama `track.stop()` em TODAS as tracks do stream. Se não sobrescrevêssemos, pausar o VAD mataria o stream compartilhado e o wake word engine perderia a captura. Fix aplicado via `pauseStream: async () => {}` + `resumeStream: async () => stream`. Documentado no código com comentário CRÍTICO.
  - Rule 2 — refs espelhados para closures: `onSpeechEnd` é um closure criado no boot do hook. Se passasse os handlers do useChat() diretamente, eles ficariam congelados no valor do mount — um re-render do ChatProvider não propagaria. Fix: refs `addHumanMessageRef`, `addAgentMessageRef`, `setToastRef`, `setStateRef` atualizados em cada render e consumidos via `.current` dentro do closure.
metrics:
  duration_minutes: 10
  files_created: 5
  files_modified: 5
  commits: 4
  tests_added: 10
  tests_passing: 43
  completed_date: "2026-04-12"
---

# Phase 24 Plan 04: MicVAD Integration — Closing the Byte-Discard Gap Summary

## Objective Recap

This plan closes THE existential gap of Phase 24: the `void audioRecorder.stopRecording()` fire-and-forget at `useWakeWord.ts:176` that captured user audio via MediaRecorder but then discarded the `Uint8Array` on a fixed 3-second timeout. After Phase 22, the wake word engine detected "Hey JARVIS" correctly, but the audio never reached the backend — a closed loop.

After this plan, dizer "Hey JARVIS, que horas são?" captura áudio via Silero VAD (@ricky0123/vad-web), termina quando o usuário para de falar (real boundary detection), encoda Float32 → WAV 16kHz mono no renderer, e passa os bytes através de `sendAudioAndHandle` (o mesmo helper compartilhado que PTT usa via ChatInput em Plan 24-03) — fechando o pipeline wake word → STT → LLM → TTS → idle.

## What Was Built

### Task 1 — @ricky0123/vad-web install + VAD assets + encodeFloat32ToWav encoder

**Install + assets (commit `5f48827`):**
- `@ricky0123/vad-web@0.0.30` added to `apps/desktop/package.json` dependencies
- `pnpm-lock.yaml` locked to 0.0.30
- `vad.worklet.bundle.min.js` (2.4KB) copied to `apps/desktop/src/renderer/public/vad/`
- `silero_vad_legacy.onnx` (1.8MB) copied to `apps/desktop/src/renderer/public/vad/`

The assets live in the existing renderer `public/` dir (same location as `wakeWordWorklet.js` from Phase 22). electron-vite copies `public/*` to `dist/renderer/` at build automatically — no vite-plugin-static-copy dev-dep added. Manual `cp` from `node_modules/.pnpm/@ricky0123+vad-web@0.0.30/.../dist/` to `public/vad/`.

**encodeFloat32ToWav RED test (commit `5ccedea`):**
- 15 failing tests in `apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` covering:
  - Output is `Uint8Array` instance
  - RIFF/WAVE/fmt /data ASCII headers at correct offsets
  - sampleRate u32 LE at offset 24 (tested 16000 + 48000)
  - numChannels=1 (mono), bitsPerSample=16 fields
  - dataSize = samples.length × 2 at offset 40
  - Total buffer = 44 + samples.length × 2
  - `[0, 1, -1, 0.5]` → Int16 `[0, 32767, -32768, 16384]`
  - Clipping: `2.5` → `32767`, `-2.5` → `-32768`
  - Empty `Float32Array(0)` → 44-byte header-only buffer with dataSize=0

**encodeFloat32ToWav GREEN impl (commit `d3eda64`):**
- 88-line pure function in `apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts`
- Browser-safe port of `apps/backend-ts/src/voice/tts/wav-encoder.ts`
- Uses `ArrayBuffer` + `DataView` instead of `Buffer.alloc` + `buffer.writeXxxLE` — ZERO Node.js Buffer dependency (grep-guarded in test)
- Private `writeAscii(view, offset, str)` helper replaces backend's `buffer.write(ascii)`
- All 15 tests pass on first impl — zero bugs, clean port

### Task 2 — MicVAD wired into useWakeWord.ts + Phase 24 VAD integration tests

**Commit `dd62a50` (single atomic feat commit):**

Surgical rewrite of `useWakeWord.ts` preserving ALL Phase 22 + Phase 23 gates and policies. Changes:

1. **Imports added:**
   - `import { MicVAD } from '@ricky0123/vad-web'`
   - `import { sendAudioAndHandle } from '../src/voice/sendAudioAndHandle'`
   - `import { encodeFloat32ToWav } from '../src/voice/encodeFloat32ToWav'`
   - `import { useChat } from '../src/chat/ChatContext'`

2. **Imports removed:**
   - `import { useAudioRecorder } from './useAudioRecorder'` — VAD replaces MediaRecorder entirely for the wake word path. PTT still uses `useAudioRecorder` via `ChatInput` in plan 24-03.

3. **New refs:**
   - `vadRef: MicVAD | null` — the MicVAD instance
   - `vadMaxTimeoutRef: ReturnType<typeof setTimeout> | null` — D-03 absolute 6s fallback (renamed from the old Phase 22 `vadTimeoutRef`)
   - `addHumanMessageRef` + `addAgentMessageRef` + `setToastRef` + `setStateRef` — refs espelhados para closures do VAD lerem valores LIVE do ChatContext/OrbContext (não o snapshot congelado do boot)

4. **MicVAD boot (inside boot useEffect, after engine.start):**
   ```typescript
   const vad = await MicVAD.new({
     baseAssetPath: '/vad/',
     onnxWASMBasePath: '/ort/',  // reusa Phase 22 ortWasmPlugin — sem duplicar wasm
     model: 'legacy',
     getStream: async () => stream,  // A6: reuse the existing MediaStream
     pauseStream: async () => {},    // CRITICAL override — no-op (stream é compartilhado)
     resumeStream: async () => stream,
     onSpeechStart: () => { console.log('[wakeWord] VAD speech start'); },
     onSpeechEnd: async (audio: Float32Array) => {
       // 1. Clear D-03 fallback (real boundary fired)
       // 2. vad.pause() ANTES do await (libera CPU)
       // 3. encodeFloat32ToWav(audio, 16000)
       // 4. await sendAudioAndHandle(wavBytes, deps)
       // 5. voiceInputManager.release('wakeword')
     },
     onVADMisfire: () => { console.log('[wakeWord] VAD misfire'); },
   });
   void vad.pause();  // start in standby — only runs after wake word
   vadRef.current = vad;
   ```
   D-02 + A1 resolution: trust library defaults (`positiveSpeechThreshold: 0.3`, `negativeSpeechThreshold: 0.25`, `redemptionMs: 1400`, `preSpeechPadMs: 800`, `minSpeechMs: 400`). CONTEXT.md listava números stale (0.5/0.35/9/8) — o planner resolveu A1 em favor dos defaults reais.

5. **Rewrote `proceed()` closure inside onDetected:**
   - Calls `void vad.start()` instead of `audioRecorder.startRecording()`
   - Arms the 6s absolute fallback timer (`vadMaxTimeoutRef`) with the D-03 toast "Não ouvi nada. Diga Hey JARVIS de novo."
   - Preserves ALL Phase 22/23 policy: `wakeTriggeredListeningRef.current = true`, `setState('listening')`, PTT preemption safety check, state cleanup on idle return

6. **Cleanup in useEffect return:**
   - Clears `vadMaxTimeoutRef` (was `vadTimeoutRef`)
   - Calls `void vadRef.current?.pause()` — belt-and-braces
   - Nulls `vadRef.current`
   - Still calls `engine.stop()` as before

7. **Orb state gate useEffect:** replaced `vadTimeoutRef` references with `vadMaxTimeoutRef` — same semantics (clear on non-wake-triggered state transitions).

**CRITICAL FIX (Rule 2 — missing critical functionality):** The default `pauseStream` from `@ricky0123/vad-web@0.0.30` calls `track.stop()` on every track of the stream. Since we share the MediaStream with `WakeWordEngine`, calling `vad.pause()` would KILL the stream and break the engine. Override `pauseStream: async () => {}` + `resumeStream: async () => stream` ensures the stream lifecycle stays owned by the hook's boot logic, not by MicVAD's internal pause/resume cycle. This is documented inline with a CRÍTICO comment.

**`apps/desktop/.env.example`:**
- Added `VITE_WAKE_WORD_MAX_RECORDING_MS=6000` (D-03 absolute fallback)
- Marked `VITE_WAKE_WORD_VAD_TIMEOUT_MS=3000` as DEPRECATED with migration note (still read for backward compat but semantics mudaram de "hard timeout" pra "fallback absoluto" — remover em v1.5)

**`useWakeWord.test.ts` — 10 new tests added in `describe('Phase 24 — VAD integration')`:**

| # | Test | Covers |
| - | ---- | ------ |
| 24-01 | boot: instantiates MicVAD with baseAssetPath `/vad/`, onnxWASMBasePath `/ort/`, model legacy, getStream returns the wake word stream | A6 + asset config |
| 24-02 | boot: calls vad.pause() after construction (starts in standby) | Lifecycle |
| 24-03 | boot: overrides pauseStream to no-op — track.stop() NOT called on the shared stream | Critical override guard |
| 24-04 | onDetected (state=idle): calls vad.start() after 350ms burst delay (NOT audioRecorder.startRecording) | D-02 burst + VAD start |
| 24-05 | vad.onSpeechEnd: encodes Float32 → WAV → calls sendAudioAndHandle with the Uint8Array + ChatContext deps | Full happy path |
| 24-06 | vad.onSpeechEnd: calls vad.pause() BEFORE awaiting sendAudioAndHandle (release CPU asap) | Order invariant |
| 24-07 | vad.onSpeechEnd: releases voiceInputManager AFTER sendAudioAndHandle completes | Cleanup order |
| 24-08 | 6s max fallback: cleared when onSpeechEnd fires first (no false toast) | D-03 cleanup correctness |
| 24-09 | unmount: limpa vadMaxTimeoutRef + vad.pause() belt-and-braces | T-24-32 mitigation |
| 24-10 | useWakeWord.toString() regression guard: no `audioRecorder.*` pattern, no `useAudioRecorder` reference | Byte-discard gap grep guard |

Plus the existing Phase 22 test #5 ("VAD timeout 3000ms") was rewritten as "6s absolute fallback (Phase 24 D-03): no speech → toast + release + setState(idle)" — same role, new semantics. Test #2 was updated to assert `vad.start()` instead of `startRecordingMock`. Test #9 was extended to also assert `vad.pause()` on unmount.

**Final test count in useWakeWord.test.ts:** 28 total (18 Phase 22/23 + 10 Phase 24 VAD). All 28 pass.

## Requirements Coverage

| Requirement | How covered |
| ----------- | ----------- |
| **WAKE-05** (full cycle wake → STT → LLM → TTS → idle) | With Plan 24-04, the byte-discard is closed. `onSpeechEnd` pipes WAV bytes through `sendAudioAndHandle` which calls `window.jarvis.sendAudio`, delegates to `handleAudioResponse` (which runs `addHumanMessage` → `addAgentMessage` → `playTTSResponse`), and always returns to `idle` via finally block. The loop is complete end-to-end. |
| **WAKE-06** (VAD real substituindo timeout fixo) | Silero VAD via `@ricky0123/vad-web@0.0.30` (D-01) replaces the Phase 22 fixed `setTimeout(vadTimeoutMs=3000)`. Real boundary detection via `onSpeechEnd`. The 6s timer is FALLBACK only (D-03), not the primary boundary mechanism — tested via fake timers in tests 5 + 24-08. |
| **WAKE-10** (backend error recovery) | Delegated to `sendAudioAndHandle`'s D-08 interceptor (Plan 24-02): if the backend returns `BACKEND_DOWN`, `LLM_TIMEOUT`, `MIC_MUTED`, `SILENT_STREAM`, or `VAD_ERROR`, the helper emits the exact pt-BR toast. `useWakeWord.ts` passes `setToast` through the deps bag. |
| **WAKE-11** (orb state consistency) | Delegated to `sendAudioAndHandle`'s `finally { setState('idle') }` invariant (Plan 24-02). `useWakeWord.ts` also has its own idle fallback in the 6s D-03 timer and in the "VAD not initialized" guard in `proceed()`. |
| **WAKE-13** (shared pipeline — no dup) | `useWakeWord.ts` now imports and calls `sendAudioAndHandle` exactly as `ChatInput.tsx` will in Plan 24-03. The deps bag (`setState`, `setToast`, `addHumanMessage`, `addAgentMessage`) is identical. Zero duplication of the audio → IPC → error handling → state cleanup pipeline. |

## Interface for Plan 24-05 (UAT)

After this plan, the flow is:

1. User says "Hey JARVIS" → `WakeWordEngine.onDetected` fires
2. Gates pass (state=idle, not paused, voiceInputManager grants)
3. `triggerWakeBurst()` + 350ms delay + `setState('listening')`
4. `vad.start()` — Silero VAD now listening on the shared MediaStream
5. 6s absolute fallback timer armed (D-03)
6. User speaks a question → Silero detects speech → after user stops, `redemptionMs` passes → `onSpeechEnd(Float32Array)`
7. Fallback timer cleared, `vad.pause()`, `encodeFloat32ToWav(audio, 16000)`
8. `await sendAudioAndHandle(wavBytes, deps)` → backend STT → LLM → TTS → `playTTSResponse`
9. `voiceInputManager.release('wakeword')`, state returns to idle
10. Ready for next "Hey JARVIS"

Plan 24-05 executes steps 1-10 manually (real browser, real Silero ONNX, real mic) and signs off.

## Deviations from Plan

### Rule 2 — Missing critical functionality (auto-fixed, no user permission needed)

**1. [Rule 2] pauseStream override to no-op — stream lifecycle protection**
- **Found during:** Task 2 implementation, reading `real-time-vad.js` from the installed vad-web package
- **Issue:** The library default `pauseStream` stops all tracks on the stream: `_stream.getTracks().forEach((track) => track.stop())`. Since the hook shares the MediaStream with `WakeWordEngine.start(sessions, stream)`, every call to `vad.pause()` (during unmount cleanup, during the 6s fallback, during onSpeechEnd) would kill the engine's audio input. The wake word detection would stop working after a single interaction.
- **Fix:** Pass `pauseStream: async () => {}` + `resumeStream: async () => stream` overrides to `MicVAD.new({...})`. The engine owns the stream lifecycle, MicVAD just observes it.
- **Validation:** Test 24-03 asserts `mediaTracks[0].stop` is NOT called after invoking `opts.pauseStream(mockStream)`.
- **Commit:** `dd62a50`

**2. [Rule 2] Refs espelhados para o closure do onSpeechEnd**
- **Found during:** Task 2 implementation, reviewing the VAD boot callback closure
- **Issue:** `MicVAD.new({...onSpeechEnd...})` is called once during the boot useEffect. The `onSpeechEnd` arrow function captures `setState`, `setToast`, `addHumanMessage`, `addAgentMessage` from the hook's first render. If the `ChatProvider` or `OrbProvider` re-renders with new handler instances (which React.useState guarantees for setToast if the provider ever swaps state shape), the closure would be calling stale handlers. This is a silent bug that wouldn't show up in unit tests with static mocks but would break in production under any ChatProvider re-architecture.
- **Fix:** Added `addHumanMessageRef`, `addAgentMessageRef`, `setToastRef`, `setStateRef` refs updated on every render. The onSpeechEnd reads `.current` at call time — always live values.
- **Validation:** Implicit — the happy-path test 24-05 passes handlers from the hook's ChatContext mock and asserts sendAudioAndHandle receives the correct deps shape.
- **Commit:** `dd62a50`

**3. [Rule 3 — Blocking issue] Fixed pre-existing tsc error that my rewrite inherited**
- **Found during:** Task 2 verification, `pnpm exec tsc --noEmit`
- **Issue:** `useWakeWord.test.ts` had a pre-existing tsc error at line 213 (documented in `deferred-items.md`): `getCurrentSourceMock.mockReturnValue('wakeword')` rejected because `vi.fn(() => null)` inferred the return type as strictly `null`. Since I rewrote the test file, the error moved to line 293 — same bug. Leaving it would count as a REGRESSION introduced by my rewrite (even though the bug originated elsewhere), breaking the acceptance criterion "zero new tsc errors".
- **Fix:** Added explicit type annotation: `type WakeSource = 'wakeword' | 'ptt' | null;` + `vi.fn<() => WakeSource>(() => null)`. Cleanly resolves the inference problem.
- **Commit:** `dd62a50`

### No Rule 4 checkpoints — nothing architectural came up.

### Auth gates encountered — none.

## A6 Runtime Validation (deferred to Plan 24-05)

**A6 assumption:** `MicVAD.new({ getStream: async () => stream })` reuses the existing MediaStream without prompting `getUserMedia` a second time.

**Unit-test validation (this plan):** Test `24-01` asserts `typeof opts.getStream === 'function'` and that calling it returns the same `mockStream` reference. This verifies the wiring is correct at the contract level.

**Runtime validation (Plan 24-05 UAT):** Not automatable in happy-dom. During manual smoke test, observe:
- First launch of the dev app: browser prompts for mic permission ONCE
- Subsequent wake word detections: ZERO additional prompts
- If A6 fails in runtime, the fallback is to obtain a dedicated stream: `getStream: async () => navigator.mediaDevices.getUserMedia({ audio: {...} })` — adds one extra `getUserMedia` call but doesn't require re-architecting.

## VAD Defaults Used (D-02 + A1 Resolution)

The plan's A1 resolution said to trust library actual defaults. Verified by reading `real-time-vad.js` source in the installed package and confirming against `frame-processor.js defaultFrameProcessorOptions`:

| Parameter | Lib 0.0.30 Default | Note |
| --------- | ------------------ | ---- |
| `positiveSpeechThreshold` | 0.3 | Not overridden — trust default |
| `negativeSpeechThreshold` | 0.25 | Not overridden — trust default |
| `redemptionMs` | 1400 | The "speech ended" debounce — not overridden |
| `preSpeechPadMs` | 800 | Audio tail prepended to onSpeechEnd buffer |
| `minSpeechMs` | 400 | Below this → onVADMisfire instead of onSpeechEnd |
| `model` | 'legacy' | Explicit — Silero legacy over v5 |

CONTEXT.md D-02 listed stale numbers (0.5 / 0.35 / 9 frames / 8 frames). A1 resolved the mismatch in favor of lib defaults. If UAT shows these feel off (e.g., redemptionMs=1400 feels slow), the fix is an env var knob in a gap plan — not part of 24-04 scope.

## Before / After: The Byte-Discard Gap

**Before (Phase 22, `useWakeWord.ts:176`):**
```typescript
vadTimeoutRef.current = setTimeout(() => {
  if (voiceInputManager.getCurrentSource() !== 'wakeword') { /* PTT preempted */ return; }
  console.log('[wakeWord] VAD timeout — returning to idle');
  void audioRecorder.stopRecording();   // ← BYTES DISCARDED HERE
  voiceInputManager.release('wakeword');
  wakeTriggeredListeningRef.current = false;
  setState('idle');
  vadTimeoutRef.current = null;
}, vadTimeoutMs);  // ← vadTimeoutMs=3000 fixo
```

**After (Phase 24 Plan 04, wire through sendAudioAndHandle):**
```typescript
// In proceed() — arms VAD + 6s fallback
void vad.start();
vadMaxTimeoutRef.current = setTimeout(() => {
  /* D-03 silent fallback → toast + idle */
}, maxRecordingMs);

// In MicVAD onSpeechEnd callback — REAL speech boundary
onSpeechEnd: async (audio: Float32Array) => {
  if (vadMaxTimeoutRef.current) { clearTimeout(vadMaxTimeoutRef.current); /* ... */ }
  void vadRef.current?.pause();
  const wavBytes = encodeFloat32ToWav(audio, 16000);
  await sendAudioAndHandle(wavBytes, {
    setState: setStateRef.current,
    setToast: setToastRef.current,
    addHumanMessage: addHumanMessageRef.current,
    addAgentMessage: addAgentMessageRef.current,
  });
  voiceInputManager.release('wakeword');
  wakeTriggeredListeningRef.current = false;
}
```

**Gap verification (grep):**
- `grep -nE 'audioRecorder\.(stopRecording|startRecording)' apps/desktop/src/renderer/hooks/useWakeWord.ts` → **zero matches** (gap closed)
- `grep -n 'useAudioRecorder' apps/desktop/src/renderer/hooks/useWakeWord.ts` → **zero matches** (import removed)
- `grep -q 'sendAudioAndHandle(wavBytes' apps/desktop/src/renderer/hooks/useWakeWord.ts` → **matches** (WAKE-13 shared pipeline)
- Regression guard test 24-10 asserts these properties via `useWakeWord.toString()` inspection

## Threat Model Verification

| Threat ID | Disposition | How 24-04 mitigates |
| --------- | ----------- | ------------------- |
| T-24-30 (Silero ONNX tamper) | mitigate | Model shipped via npm with pnpm-lock.yaml integrity hash. File at `public/vad/silero_vad_legacy.onnx` copied from node_modules during task 1 — no runtime download. |
| T-24-31 (VAD buffer leaked to wrong sink) | mitigate | `onSpeechEnd` only calls `sendAudioAndHandle` which goes through the vetted IPC channel. `console.log` only logs `audio.length` (integer), never the Float32Array contents or WAV bytes. |
| T-24-32 (leaked VAD session after unmount) | mitigate | Cleanup useEffect return clears `vadMaxTimeoutRef`, calls `void vadRef.current?.pause()`, and nulls the ref. Test 24-09 asserts pause is called on unmount. |
| T-24-33 (6s fallback never fires, orb stuck) | mitigate | `setTimeout(maxRecordingMs=6000)` in `proceed()` + explicit fake-timer test #5 advancing 6000ms and asserting `setState('idle')` + toast emission. |
| T-24-34 (VAD AudioWorklet CSP bypass) | accept | Phase 22 gap-02 CSP already allows `wasm-unsafe-eval` + `worker-src blob:`. AudioWorklet uses same-origin module loading. No new CSP changes needed. |
| T-24-35 (oversized WAV payload) | mitigate | 6000ms × 16kHz × 2 bytes = 192000 bytes max payload. Backend 60s timeout bounds indirectly. |
| T-24-36 (leaked ownership if sendAudioAndHandle throws) | accept | Plan 24-02 explicitly swallows exceptions via `try { ... } finally { setState('idle'); }`. The `voiceInputManager.release('wakeword')` call after the await executes normally because the helper returns `void` (not `throw`). Defensive try/finally not added — Plan 24-02 contract is strong enough. |

**No new threat surface introduced.** The plan does NOT open new IPC channels, new file-system access, new network endpoints, or new schema. It's a thin orchestrator over pre-existing primitives (`window.jarvis.sendAudio` from Phase 19.5 + Silero VAD as an in-process library).

## Threat Flags

No new security-relevant surface introduced beyond what the threat model already captures.

## Deferred Issues

Pre-existing problems discovered during execution but OUT of scope (already logged in `deferred-items.md` from plan 24-02, still unresolved):

1. `src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` — 8 tests fail with `document.baseURI` / audioWorklet missing in happy-dom (Phase 22 gap).
2. `src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts` — 1 test file fails (same environment issue).
3. `src/main/__tests__/integration-chat.test.ts` — 5 tests fail (missing express types).
4. Multiple `tsc --noEmit` pre-existing errors in `main/index.ts` (audioCapture enum drift), `main/ipc/__tests__/settings.test.ts` (mock type inference), `renderer/components/ChatInput/ChatInput.tsx` (`WebkitAppRegion`), `src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts` (mock type).

Fixed during this plan (was deferred from plan 24-02 but I rewrote the file):
- `useWakeWord.test.ts:213` — now fixed via explicit `WakeSource` type annotation on `getCurrentSourceMock`.

## Commits

| Commit | Type | Description |
| ------ | ---- | ----------- |
| `5f48827` | 🏗️ build | instala @ricky0123/vad-web@0.0.30 + copia assets VAD worklet/silero legacy |
| `5ccedea` | ✅ test | adiciona testes RED para encodeFloat32ToWav (15 casos) |
| `d3eda64` | ✨ feat | cria encodeFloat32ToWav encoder puro com RIFF header + clipping |
| `dd62a50` | ✨ feat | integra MicVAD no useWakeWord + fecha gap do byte-discard (WAKE-05/06) |

## Verification Results

- **Encoder tests:** `pnpm test --run src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` → **15 passed**
- **useWakeWord tests:** `pnpm test --run src/renderer/hooks/__tests__/useWakeWord.test.ts` → **28 passed** (18 Phase 22/23 + 10 new Phase 24 VAD)
- **Voice suite:** `pnpm test --run src/renderer/src/voice/__tests__/` → **46 passed** across 4 files (handleAudioResponse 5 + sendAudioAndHandle 16 + voiceInputManager 10 + encodeFloat32ToWav 15)
- **Full desktop suite:** `pnpm test --run` → **341 passed / 13 pre-existing failures** (all in files I did not touch — WakeWordEngine, modelLoader, integration-chat — matches deferred-items.md exactly)
- **tsc:** `pnpm exec tsc --noEmit` → 11 pre-existing errors in untouched files. ZERO new errors introduced by this plan.
- **Grep guards (all PASS):**
  - `grep -q '@ricky0123/vad-web' apps/desktop/package.json` ✓
  - `test -f apps/desktop/src/renderer/public/vad/vad.worklet.bundle.min.js` ✓
  - `test -f apps/desktop/src/renderer/public/vad/silero_vad_legacy.onnx` ✓ (1.8MB, non-empty)
  - `test -f apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts` ✓
  - `test -f apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` ✓
  - `grep -q 'export function encodeFloat32ToWav' ...encoder.ts` ✓
  - `grep -q 'new Uint8Array' ...encoder.ts` ✓ (returns Uint8Array)
  - `grep -qE "'RIFF'" ...encoder.ts` ✓
  - `! grep -n 'Buffer\.alloc\|Buffer\.from' ...encoder.ts` ✓ (browser-safe)
  - `grep -q "from '@ricky0123/vad-web'" useWakeWord.ts` ✓
  - `grep -q 'import { sendAudioAndHandle }' useWakeWord.ts` ✓
  - `grep -q 'import { encodeFloat32ToWav }' useWakeWord.ts` ✓
  - `grep -q 'import { useChat }' useWakeWord.ts` ✓
  - `! grep -n 'useAudioRecorder' useWakeWord.ts` ✓ (removed)
  - `! grep -nE 'audioRecorder\.(stopRecording|startRecording)' useWakeWord.ts` ✓ (byte-discard gap closed)
  - `grep -q 'MicVAD.new' useWakeWord.ts` ✓
  - `grep -q "baseAssetPath: '/vad/'" useWakeWord.ts` ✓
  - `grep -q "onnxWASMBasePath: '/ort/'" useWakeWord.ts` ✓
  - `grep -q "model: 'legacy'" useWakeWord.ts` ✓
  - `grep -q 'encodeFloat32ToWav(audio, 16000)' useWakeWord.ts` ✓
  - `grep -q 'sendAudioAndHandle(wavBytes' useWakeWord.ts` ✓
  - `grep -q "Não ouvi nada. Diga Hey JARVIS de novo" useWakeWord.ts` ✓
  - `grep -q 'VITE_WAKE_WORD_MAX_RECORDING_MS' useWakeWord.ts` ✓
  - `grep -q 'VITE_WAKE_WORD_MAX_RECORDING_MS=6000' apps/desktop/.env.example` ✓
  - `grep -q 'Phase 24 — VAD integration' useWakeWord.test.ts` ✓
  - `grep -q 'Não ouvi nada. Diga Hey JARVIS de novo.' useWakeWord.test.ts` ✓

## Self-Check

Files claimed in this summary:

- `apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts` — FOUND
- `apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts` — FOUND
- `apps/desktop/src/renderer/public/vad/vad.worklet.bundle.min.js` — FOUND
- `apps/desktop/src/renderer/public/vad/silero_vad_legacy.onnx` — FOUND
- `apps/desktop/src/renderer/hooks/useWakeWord.ts` — FOUND (modified)
- `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — FOUND (modified)
- `apps/desktop/package.json` — FOUND (modified, contains `@ricky0123/vad-web`)
- `apps/desktop/.env.example` — FOUND (modified, contains `VITE_WAKE_WORD_MAX_RECORDING_MS=6000`)

Commits claimed:

- `5f48827` — FOUND in `git log`
- `5ccedea` — FOUND in `git log`
- `d3eda64` — FOUND in `git log`
- `dd62a50` — FOUND in `git log`

## Self-Check: PASSED
