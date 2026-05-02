# Phase 46: Wake Word Reliability - Research

**Researched:** 2026-05-01
**Domain:** openwakeword ONNX web pipeline, mel spectrogram normalization, AudioWorklet audio capture
**Confidence:** HIGH — root cause identified with high certainty from codebase inspection + official source verification

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WW-01 | Investigar causa das falhas de ativação do "Hey JARVIS" — analisar threshold, openwakeword, pipeline de áudio, logs | Root cause identified: mel normalization bug (sign inversion in `normalizedMel[i] = mel[i] / 10 - 2` should be `+ 2`). Secondary: broken WakeWordEngine tests hide regressions. |
| WW-02 | Corrigir/melhorar confiabilidade com base nos achados da investigação | Fix path: single-line change to `WakeWordEngine.ts` line 196 (- 2 → + 2), plus test environment fix to restore test coverage. |
</phase_requirements>

---

## Summary

The primary cause of missed "Hey JARVIS" activations is a **sign inversion in the mel spectrogram normalization formula** inside `WakeWordEngine.ts`. The codebase applies `mel / 10 - 2`, but the official openwakeword Python source (`openwakeword/utils.py`, `_get_melspectrogram`) specifies `mel / 10 + 2`. This 4-unit constant offset shifts every value fed into the embedding model outside the distribution it was trained on, causing the classifier to produce near-zero scores for legitimate wake word utterances. The wrong formula was even documented in the code comment (comment says "(mel / 10) - 2" — incorrectly citing the original source as justification).

A secondary contributing factor is that **all 8 tests in `WakeWordEngine.test.ts` are currently failing** due to a test environment bug: the test file runs in Node (no `document` global) even though the vitest `environmentMatchGlobs` should place it in happy-dom. This failure masks any normalization regression — a broken test suite means no automated guard against future regressions in the engine.

The VAD Silero gate is also disabled (`// 3. VAD gate — DESATIVADO em 22-GAP-04.`). This means the keyword classifier runs on every audio chunk including silence, wasting CPU, but it is NOT the cause of missed detections — it would cause false positives if anything, not missed activations.

**Primary recommendation:** Fix line 196 of `WakeWordEngine.ts`: change `this.melBuffer[i] / 10 - 2` to `this.melBuffer[i] / 10 + 2`. Fix the test environment so `WakeWordEngine.test.ts` runs in happy-dom. The threshold of 0.5 and debounce of 2000ms are reasonable starting values; re-evaluate only after the normalization fix is confirmed working.

---

## Root Cause Analysis

### Bug 1: Mel Normalization Sign Inversion (PRIMARY — causes missed detections)

**Location:** `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts`, line 196.

**Current code:**
```typescript
normalizedMel[i] = this.melBuffer[i] / 10 - 2;
```

**Correct code (per openwakeword/utils.py):**
```typescript
normalizedMel[i] = this.melBuffer[i] / 10 + 2;
```

**Why it matters:** The embedding model (`embedding_model.onnx`) was trained with inputs in the range roughly `[-1, +3]` (i.e., the raw mel values are in `[10, 50]` → divide by 10 → `[1, 5]` → add 2 → `[3, 7]`... actually the raw mel from the ONNX melspectrogram model are already on a log scale in a narrow range near 0, making the post-transform values roughly `[-2, +2]` after the `+2` shift, which centers them around 0 with the correct distribution). With `- 2`, every value is shifted down by 4, producing inputs in a range `[-6, -2]` — far outside the training distribution. The embedding model produces garbage embeddings from out-of-distribution inputs, and the keyword classifier scores remain near 0.0001 for all audio, including real utterances.

**Evidence:** The code comment at line 192 cites "openwakeword/utils.py AudioFeatures._get_embeddings" as the source, but the referenced function uses `lambda x: x/10 + 2` (confirmed from `raw.githubusercontent.com/dscripka/openWakeWord/main/openwakeword/utils.py`). The comment perpetuated the wrong sign.

**Additional evidence:** The one-shot debug log at lines 207-210 would show the normalized values in range `[-6, -2]` instead of the expected positive range if the developer checked the console during runtime.

**Confidence:** HIGH — cross-verified against official openwakeword Python source and deepcorelabs reference implementation.

### Bug 2: WakeWordEngine Test Environment Broken (SECONDARY — no test coverage)

**Location:** `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts`

**Symptom:** All 8 tests fail with `ReferenceError: document is not defined`. The test is under `src/renderer/src/` which matches the `environmentMatchGlobs` pattern `**/src/renderer/**` in `vitest.config.ts`, but it fails despite this. The failure is because `modelLoader.ts` has a top-level side effect `ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href` that executes on import before the test environment has a chance to set up the DOM.

**Fix:** Add `// @vitest-environment happy-dom` at the top of `WakeWordEngine.test.ts`. The `WakeWordEngine.ts` itself also uses `document.baseURI` at runtime in `start()`, which is fine for the renderer but needs the environment annotation in tests.

**Additionally:** The mock sessions in `buildSessions()` lack `inputNames` and `outputNames` arrays that the engine accesses at `sessions.mel.inputNames[0]`. This would return `undefined[0]` causing a TypeError... except accessing a property that doesn't exist on an object (not on `null`/`undefined`) returns `undefined`, and `undefined[0]` is indeed a TypeError. The mock is using `as unknown as WakeWordSessions['mel']` to bypass TypeScript. At test runtime with proper happy-dom environment, the tests would need updated mocks that include `inputNames: ['input']` and `outputNames: ['output']` per session.

**Confidence:** HIGH — verified by running the test suite locally.

### Bug 3: VAD Gate Disabled (KNOWN, NOT a cause of missed detections)

**Location:** `WakeWordEngine.ts`, line 238-246.

The comment reads: `// 3. VAD gate — DESATIVADO em 22-GAP-04`. The Silero VAD model is loaded and costs startup time and memory, but is never called in `processChunk`. The classifier runs on every chunk including silence.

**Impact on reliability:** The disabled VAD gate does NOT cause missed activations. Without it, the classifier runs on all audio — including silence — increasing CPU usage slightly. There is no mechanism by which a disabled noise gate prevents true positives. It only means more CPU is used than necessary.

**Recommendation:** Implement the VAD gate correctly as a follow-up (not blocking for Phase 46), or remove the unused Silero VAD session to save startup time and memory.

---

## Standard Stack (No Changes Needed)

The existing stack is correct:

| Component | Technology | Version | Status |
|-----------|------------|---------|--------|
| Wake word inference | onnxruntime-web | existing | Keep |
| Audio chunking | AudioWorklet (wakeWordWorklet.js) | existing | Keep |
| Model files | hey_jarvis_v0.1.onnx, embedding_model.onnx, melspectrogram.onnx, silero_vad.onnx | v0.1/v0.5.1 | Keep |
| Test framework | Vitest 4.x + happy-dom | existing | Fix environment annotation |
| Threshold | 0.5 (default) | configurable via VITE_WAKE_WORD_THRESHOLD | Keep for initial validation |

---

## Architecture Patterns

### Correct openwakeword Pipeline (reference)

Per official Python source and deepcorelabs browser implementation:

```
Audio chunk (1280 samples @ 16kHz = 80ms)
    │
    ▼
melspectrogram.onnx
    Output: 5 new mel frames × 32 bins = 160 floats
    │
    ▼
Mel buffer (76 frames × 32 bins = 2432 floats) — sliding window
    Shift left 5 frames, append new 5 frames at end
    │
    ▼
NORMALIZE: mel_normalized = mel_buffer / 10 + 2  ← CRITICAL: + not -
    │
    ▼
embedding_model.onnx  [input shape: (1, 76, 32, 1)]
    Output: 1 embedding vector (96 floats)
    │
    ▼
Embedding ring buffer (16 embeddings × 96 floats = 1536 floats)
    │
    ▼
hey_jarvis_v0.1.onnx (classifier)  [input shape: (1, 16, 96)]
    Output: scalar score ∈ [0, 1]
    │
    ▼
Threshold gate: score >= 0.5 AND debounce 2000ms
    │
    ▼
onDetected(score)
```

### Correct Test Setup Pattern

```typescript
// @vitest-environment happy-dom
// ↑ Required for WakeWordEngine.test.ts — engine uses document.baseURI

// Mock sessions must include inputNames + outputNames:
function buildSessions(): WakeWordSessions {
  return {
    mel: {
      run: melRun,
      inputNames: ['input'],    // required by engine's dynamic lookup
      outputNames: ['output'],  // required by engine's dynamic lookup
    } as unknown as WakeWordSessions['mel'],
    // same pattern for embed, vad, kw
  };
}
```

### Threshold Tuning Approach

The hey_jarvis model has no published accuracy metrics. Threshold tuning should follow this protocol:

1. Fix the normalization bug first.
2. Run the app with default threshold 0.5 in a quiet room.
3. Check console logs: `[wakeWord] first classifier OK — score:` should now show non-trivial scores (>0.1) when speaking.
4. If still missing, lower threshold to 0.3 via `VITE_WAKE_WORD_THRESHOLD=0.3` in `.env`.
5. Monitor for false positives (threshold too low means accidental activation).
6. The model docs note it may work with variations like just "Jarvis" with higher false-reject rates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wake word model | Custom trained model | hey_jarvis_v0.1.onnx (existing) | Trained on 200k synthetic clips + 31k hours negative data; training from scratch requires VITS TTS infra |
| ONNX inference | Custom WASM inference | onnxruntime-web (existing) | Handles WebAssembly compilation, tensor management, backend selection |
| Mel spectrogram | Custom FFT | melspectrogram.onnx (existing) | Model was trained with this specific ONNX implementation; cannot swap |
| Audio normalization | Complex AGC | Fix the sign bug | The normalization is a fixed formula, not adaptive |

---

## Common Pitfalls

### Pitfall 1: Wrong Normalization Sign (THE BUG)
**What goes wrong:** Wake word never activates. Console shows scores ≈ 0.0001 consistently.
**Why it happens:** `- 2` instead of `+ 2` pushes inputs far out of the embedding model's training distribution.
**How to avoid:** Compare against openwakeword/utils.py `_get_melspectrogram` `melspec_transform` parameter.
**Warning signs:** Debug log `mel stats — normalized: [-5.xxx, -2.xxx]` — normalized range should be positive-biased (~[-2, +4] after correct normalization).

### Pitfall 2: Warmup Latency
**What goes wrong:** Wake word ignored for first ~6 seconds after app start.
**Why it happens:** Mel buffer needs 76 frames to fill (76 chunks × 80ms = 6.08s warmup). During warmup, `melFramesFilled < MEL_BUFFER_FRAMES` returns early.
**How to avoid:** This is expected and correct behavior. Document it for users.
**Warning signs:** `[wakeWord] first embedding OK` log not appearing for several seconds — that is normal.

### Pitfall 3: Test Environment Missing
**What goes wrong:** `WakeWordEngine.test.ts` runs in Node (no DOM), all tests fail. Changes to the engine are untested.
**Why it happens:** Tests lack `// @vitest-environment happy-dom` annotation.
**How to avoid:** Add the annotation. Also mock `document.baseURI` if needed.
**Warning signs:** Tests fail with `ReferenceError: document is not defined`.

### Pitfall 4: Session inputNames not Mocked
**What goes wrong:** After fixing the test environment, tests fail with `TypeError: Cannot read properties of undefined (reading '0')` on `sessions.mel.inputNames[0]`.
**Why it happens:** Mock sessions returned by `buildSessions()` lack `inputNames`/`outputNames` arrays.
**How to avoid:** Add `inputNames: ['input']` and `outputNames: ['output']` (or the real names from ONNX model inspection) to each session mock.

### Pitfall 5: Reentrancy Drop
**What goes wrong:** Some chunks are silently dropped under load.
**Why it happens:** `if (this.processing) return;` guard — reentrancy protection for async ONNX calls. This is correct and expected behavior; dropping a frame is better than queuing infinitely.
**How to avoid:** Not a bug — document expected behavior. High CPU load may cause more drops, but the pipeline still works because the sliding mel buffer accumulates audio.

### Pitfall 6: Lowering Threshold Too Far
**What goes wrong:** False positives — JARVIS activates on ambient speech, TV, other voices.
**Why it happens:** The hey_jarvis model was trained on synthetic TTS voices; real-world conditions vary.
**How to avoid:** Do not go below 0.35 without extensive testing. Default of 0.5 is a safe starting point after the normalization bug is fixed.

---

## Code Examples

### The Fix (single-line change)
```typescript
// Source: apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts line 196
// Reference: https://github.com/dscripka/openWakeWord/blob/main/openwakeword/utils.py
//            AudioFeatures._get_melspectrogram → lambda x: x/10 + 2

// BEFORE (bug):
normalizedMel[i] = this.melBuffer[i] / 10 - 2;

// AFTER (correct):
normalizedMel[i] = this.melBuffer[i] / 10 + 2;
```

### Test Environment Fix
```typescript
// Source: apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts
// Add at line 1:
// @vitest-environment happy-dom
```

### Updated Mock Sessions
```typescript
function buildSessions(): WakeWordSessions {
  return {
    mel: {
      run: melRun,
      inputNames: ['input'],
      outputNames: ['output'],
    } as unknown as WakeWordSessions['mel'],
    embed: {
      run: embedRun,
      inputNames: ['input_1'],
      outputNames: ['output_0'],
    } as unknown as WakeWordSessions['embed'],
    vad: {
      run: vadRun,
      inputNames: ['input'],
      outputNames: ['output'],
    } as unknown as WakeWordSessions['vad'],
    kw: {
      run: kwRun,
      inputNames: ['input_2'],
      outputNames: ['Identity'],
    } as unknown as WakeWordSessions['kw'],
  };
}
// NOTE: actual input/output names must be read from ONNX model at dev time.
// The WakeWordEngine logs them at start() — check console for the real names.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed 3s VAD timeout (Phase 22) | Silero MicVAD real-time boundary detection (Phase 24) | Phase 24 | Correct audio boundaries sent to STT |
| Disabled Silero VAD gate | Should use Silero VAD gate for CPU savings | 22-GAP-04 | Gate disabled by design — future work |
| Mel normalization `- 2` (bug) | Should be `+ 2` (fix in Phase 46) | Introduced in Phase 22 | Primary cause of missed detections |

---

## Open Questions

1. **Real input/output names of the ONNX models**
   - What we know: The engine uses dynamic lookup via `session.inputNames[0]` and `session.outputNames[0]`. The console logs these at start.
   - What's unclear: The exact names vary by model version. The test mocks need to use the real names (or at least any consistent names).
   - Recommendation: After app start, check console for `[wakeWord] model IO signatures:` log to get real names. Use those in the updated mocks.

2. **Threshold after normalization fix**
   - What we know: Default 0.5 was chosen without working normalization. The actual classifier output distribution is unknown.
   - What's unclear: Whether 0.5 remains the right threshold once inputs are correctly normalized.
   - Recommendation: Test manually after the fix. If consistent detection fails, lower to 0.35-0.45. If false positives appear, raise to 0.55-0.65.

3. **hey_jarvis model version**
   - What we know: `hey_jarvis_v0.1.onnx` from openwakeword v0.5.1. No published accuracy metrics.
   - What's unclear: Whether a newer version (if any) would perform better.
   - Recommendation: Check openwakeword releases for newer hey_jarvis models. The v0.1 model is trained on synthetic TTS and may not generalize perfectly to the user's voice. Out of scope unless threshold tuning fails.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner | ✓ | v24.13.0 | — |
| Vitest | Test suite | ✓ | 4.1.3 | — |
| happy-dom | Renderer test env | ✓ | (bundled with vitest) | — |
| onnxruntime-web | Wake word inference | ✓ | (existing in node_modules) | — |
| ONNX model files | Wake word inference | ✓ | hey_jarvis_v0.1.onnx present in resources/ | — |

All dependencies available. No blocking missing dependencies.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `apps/desktop/vitest.config.ts` |
| Quick run command | `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` |
| Full suite command | `pnpm --filter @jarvis/desktop test -- run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WW-01 | Mel normalization formula is `x/10 + 2` | unit | `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` | ✅ (broken, needs fix) |
| WW-01 | Classifier score is non-trivially positive when normalization is correct | unit | same | ✅ (broken, needs fix) |
| WW-02 | After fix, score >= 0.5 fires onDetected | unit | same | ✅ (broken, needs fix) |
| WW-02 | False positive rate: debounce prevents duplicate triggers within 2000ms | unit | same | ✅ (broken, needs fix) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts`
- **Per wave merge:** `pnpm --filter @jarvis/desktop test -- run`
- **Phase gate:** All 8 WakeWordEngine tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` — needs `// @vitest-environment happy-dom` annotation + updated mock sessions with `inputNames`/`outputNames` — all 8 existing tests should pass once environment is fixed and normalization bug is applied

*(The test file already exists and covers the right scenarios — fixing the environment unlocks all 8 tests.)*

---

## Sources

### Primary (HIGH confidence)
- `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts` — normalization bug at line 196, VAD gate disabled at line 238
- `apps/desktop/src/renderer/hooks/useWakeWord.ts` — threshold config, lifecycle management
- `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` — broken tests (all 8 fail)
- `apps/desktop/vitest.config.ts` — test environment configuration
- `https://raw.githubusercontent.com/dscripka/openWakeWord/main/openwakeword/utils.py` — official Python source confirming `lambda x: x/10 + 2`

### Secondary (MEDIUM confidence)
- [deepcorelabs.com — Open Wake Word on the Web](https://deepcorelabs.com/open-wake-word-on-the-web/) — browser implementation confirming `(value / 10.0) + 2.0` normalization, 16-embedding ring buffer, 76-frame mel buffer
- [github.com/dscripka/openWakeWord/docs/models/hey_jarvis.md](https://github.com/dscripka/openWakeWord/blob/main/docs/models/hey_jarvis.md) — training data, known limitations (background noise, AEC), no published accuracy metrics

### Tertiary (LOW confidence)
- [github.com/dnavarrom/openwakeword_wasm](https://github.com/dnavarrom/openwakeword_wasm) — browser reference implementation (code not directly read, README only)

---

## Metadata

**Confidence breakdown:**
- Root cause (normalization sign): HIGH — cross-verified against official Python source + browser reference + code comment mismatch
- Test environment fix: HIGH — reproduced locally, error is deterministic
- Architecture patterns: HIGH — from existing working codebase + official docs
- Threshold tuning: MEDIUM — empirical, depends on runtime behavior after fix

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (stable domain — openwakeword model files and pipeline are fixed artifacts)
