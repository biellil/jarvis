---
phase: 40-always-listening-intent-classifier
reviewed: 2026-04-26T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - apps/desktop/src/main/__tests__/store.test.ts
  - apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/main/voiceInput/whisperResources.ts
  - apps/desktop/src/main/voiceMode/index.ts
  - apps/desktop/src/main/voiceMode/intentExamples.pt-BR.ts
  - apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts
  - apps/desktop/src/preload/settings.ts
  - apps/desktop/src/renderer/src/settings/SettingsForm.tsx
  - apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx
  - apps/desktop/src/renderer/src/styles/globals.css
  - apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts
  - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts
  - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/audioRingBuffer.test.ts
  - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/intentClassifier.test.ts
  - apps/desktop/src/renderer/src/voice/alwaysListening/audioRingBuffer.ts
  - apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-04-26
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 40 implements Always-Listening voice mode (renderer-side AlwaysListeningEngine using @ricky0123/vad-web + AudioRingBuffer pre-roll, with @xenova/transformers IntentClassifier) plus a main-process AlwaysListeningStrategy IPC bridge and a Settings UI slider for the VAD silence threshold.

Overall the implementation is well structured: clear separation of concerns between renderer (audio loop) and main (IPC + persistence), good test coverage at every layer, and explicit threat coverage notes (T-40-VAD, T-40-RING, T-40-MIC, T-40-TIMEOUT, T-40-INTENT, T-40-AUDIT) tied to specific code paths. Defensive clamping is applied at multiple layers (store.setVadSilenceThresholdMs, ipc/settings.ts handler, getVadSilenceThresholdMs read-side guard) — defense-in-depth done right.

No critical security issues. Five warnings worth addressing (a CSS bug, two race/edge cases, two robustness gaps in the classifier), and six info items (documentation, DRY, type drift).

## Warnings

### WR-01: Invalid CSS — `margin: 10` lacks unit, browser drops the declaration

**File:** `apps/desktop/src/renderer/src/styles/globals.css:10`
**Issue:** The universal selector rule sets `margin: 10;` with no unit. Per CSS spec, non-zero length values require a unit (`px`, `em`, `rem`, etc.). Browsers will reject the declaration silently — every element ends up with whatever margin its UA stylesheet sets, not the intended reset. Likely a typo for `margin: 0;` (mirroring `padding: 0` on the next line, which is what a reset normally does). Even if `10` were valid, applying a non-zero margin to every element via `*` would be highly unusual and would conflict with the `body { margin: 0 }` declaration six lines later.
**Fix:**
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

### WR-02: `processUtterance` finally-block can resurrect status from idle to capturing (race with stop)

**File:** `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts:119-149`
**Issue:** `processUtterance` reads `this.status === 'idle'` at entry (line 122) and bails out, then otherwise sets `this.status = 'processing'`. Inside the `try`, `await handleAudio(...)` yields. If `stop()` runs during that await, it sets `this.status = 'idle'` and removes the IPC listener (lines 160-167). When `handleAudio` resolves, the `finally` at line 145 checks `this.status === 'processing'` — which is true because `stop()` set it to 'idle', NOT 'processing'... actually re-reading the code: stop() sets status to 'idle', so the finally `if (this.status === 'processing')` branch is skipped. That part is correct.

However, the OPPOSITE race exists: between line 122 (`if (this.status === 'idle') return`) and line 127 (`this.status = 'processing'`), the IPC handler can be invoked twice in microtask sequence. The first call passes the guard, then yields on `await handleAudio` before line 127 runs. A second utterance arrives — the guard reads `this.status === 'capturing'` (still), passes, both calls execute concurrently, and both write to `this.status = 'processing'` then back to `this.status = 'capturing'`. This means utterances are processed in parallel rather than serialized. Probably benign for correctness but invalidates the implicit "one utterance at a time" assumption that `getStatus()` consumers might rely on. There is no explicit queue.
**Fix:** Either (a) accept parallel processing and document it on `getStatus()`, or (b) serialize utterances with a simple in-flight flag:
```ts
private inFlight = false;
private async processUtterance(payload: AlwaysListeningUtterancePayload): Promise<void> {
  if (this.status === 'idle' || this.inFlight) return;
  this.inFlight = true;
  this.status = 'processing';
  try {
    const buffer = Buffer.from(payload.wavBuffer.buffer, payload.wavBuffer.byteOffset, payload.wavBuffer.byteLength);
    await handleAudio(buffer, this.deps.voiceHandlerDeps);
  } catch (err) {
    console.error('[AlwaysListeningStrategy] handleAudio error:', err instanceof Error ? err.message : err);
  } finally {
    this.inFlight = false;
    if (this.status === 'processing') this.status = 'capturing';
  }
}
```

### WR-03: `cosineSimilarity` reads `b[i]!` without length check — NaN if vectors mismatch

**File:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts:234-247`
**Issue:** The loop iterates `i < a.length` and reads `b[i]!`. The non-null assertion silences the TypeScript checker, but at runtime `b[i]` returns `undefined` when `i >= b.length`. Arithmetic on undefined yields `NaN`, which silently propagates: `dotProduct` becomes `NaN`, the function returns `NaN`, and `maxPositive > threshold` is always `false` (NaN comparisons are always false). The classifier silently degrades to "always classified-no-intent" without any error.

In normal operation `a` and `b` come from the same model (both 384-dim from multilingual-e5-small), so they match. But if a future caller passes a mismatched embedding (different model, truncated buffer, etc.), the failure is silent. Defense-in-depth here is cheap.
**Fix:**
```ts
private cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    console.warn(`[intentClassifier] cosineSimilarity length mismatch: ${a.length} vs ${b.length}`);
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}
```

### WR-04: `INTENT_THRESHOLD` env override is NaN-vulnerable — silent classifier breakage

**File:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts:30-32`
**Issue:**
```ts
export const INTENT_THRESHOLD = process.env['INTENT_THRESHOLD']
  ? parseFloat(process.env['INTENT_THRESHOLD']!)
  : 0.6;
```
If a user sets `INTENT_THRESHOLD=high` (typo, copy-paste of a malformed value, etc.), `parseFloat` returns `NaN`. The check `maxPositive > NaN` is always `false`, so every utterance classifies as no-intent — Always-Listening silently stops working with no log. Same for negative-but-valid floats: `INTENT_THRESHOLD=-1` would bypass the threshold (every utterance has intent).
**Fix:**
```ts
function parseThreshold(): number {
  const raw = process.env['INTENT_THRESHOLD'];
  if (!raw) return 0.6;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    console.warn(`[intentClassifier] Invalid INTENT_THRESHOLD="${raw}", falling back to 0.6`);
    return 0.6;
  }
  return parsed;
}
export const INTENT_THRESHOLD = parseThreshold();
```

### WR-05: `Promise.race` timeout in `classify()` leaks a setTimeout when classification wins

**File:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts:138-144`
**Issue:**
```ts
const result = await Promise.race([
  this.classifyInternal(transcript, t0),
  new Promise<IntentClassificationResult>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), this.opts.timeoutMs),
  ),
]);
```
When `classifyInternal` resolves first, the `setTimeout` keeps the timer registered until it fires. The timeout's rejection becomes an unhandled-rejection inside the discarded Promise leg of the race (Node/V8 won't usually warn here because `Promise.race` itself attaches a reject handler), but the timer still pins the event loop. In a long-running session at e.g. 10 utterances/min × 300ms timeout, it's negligible — but in a stress/test loop with thousands of classifications it can cause delayed app shutdown and inflated test runtimes.
**Fix:**
```ts
const result = await new Promise<IntentClassificationResult>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timeout')), this.opts.timeoutMs);
  this.classifyInternal(transcript, t0)
    .then((r) => { clearTimeout(timer); resolve(r); })
    .catch((err) => { clearTimeout(timer); reject(err); });
});
```

## Info

### IN-01: VAD threshold range constants duplicated across 3 files (DRY drift risk)

**File:** `apps/desktop/src/main/store.ts:42-44`, `apps/desktop/src/main/ipc/settings.ts:114`, `apps/desktop/src/renderer/src/settings/SettingsForm.tsx:17-19`
**Issue:** The literals `300` (min), `800` (max), `500` (default) are repeated in store.ts (`VAD_SILENCE_THRESHOLD_MIN/MAX/DEFAULT`), ipc/settings.ts (inline `Math.max(300, Math.min(800, safeMs))`), and SettingsForm.tsx (`VAD_THRESHOLD_MIN_MS/MAX_MS/DEFAULT_MS`). The ipc/settings.ts comment even explicitly says "Mantemos os literais 300/800 visíveis no point-of-use para facilitar auditoria via grep" — which is a deliberate trade-off, but means a future range expansion (say to [200, 1000]) requires manual sync across three files in two processes. Test coverage at each clamp boundary mitigates regression risk, but a shared `shared/voiceMode/vadThreshold.ts` constants module would prevent drift entirely.
**Fix:** Extract to `apps/desktop/src/shared/vadThresholdConfig.ts`:
```ts
export const VAD_THRESHOLD_MIN_MS = 300;
export const VAD_THRESHOLD_MAX_MS = 800;
export const VAD_THRESHOLD_DEFAULT_MS = 500;
export const VAD_THRESHOLD_STEP_MS = 50;
```
Then import from store.ts, ipc/settings.ts, SettingsForm.tsx. Keep grep auditability via the shared module's name (e.g., `// AUDIT-VAD-CLAMP` marker).

### IN-02: `scheduleModelPreDownload` registers `ipcMain.once` listener that may never fire

**File:** `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts:201-225`
**Issue:** After 5 seconds, the function registers `ipcMain.once(MODEL_DOWNLOAD_FAILED_CHANNEL, ...)`. On successful download, the renderer never sends the failure channel — so the listener stays registered until the app exits (or until a fail event fires, which never happens). For the single-call scenario in main/index.ts this is harmless (single zombie listener). But if the function is ever invoked multiple times (HMR, retry logic added later, programmatic re-trigger), each call leaks one `once` listener. Also: the function returns `void` synchronously without exposing a cancel handle, so the caller cannot abort the scheduled trigger if the window is destroyed in the [0, 5s] gap (the timer fires, checks `isDestroyed()`, returns — fine — but the listener never gets registered, OK).
**Fix:** Add an explicit success channel from the renderer that removes the listener, or expose a cleanup function:
```ts
export function scheduleModelPreDownload(...): () => void {
  const handler = () => onFail({ ... });
  const timer = setTimeout(() => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(PRELOAD_MODEL_CHANNEL);
    ipcMain.once(MODEL_DOWNLOAD_FAILED_CHANNEL, handler);
  }, PRE_DOWNLOAD_DELAY_MS);
  return () => {
    clearTimeout(timer);
    ipcMain.removeListener(MODEL_DOWNLOAD_FAILED_CHANNEL, handler);
  };
}
```

### IN-03: `unload()`-then-`classify()` returns `verdict: 'timeout-send-anyway'` (misleading label)

**File:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts:147-162`
**Issue:** When `extractor` is null (post-unload), `classifyInternal` throws `'Classifier not loaded'`. The catch-all maps every error to `verdict: 'timeout-send-anyway'`, which is misleading for audit log analysis: a timeout and a "classifier was unloaded" failure are distinct conditions, and the audit log won't help diagnose the latter. The existing test at lines 285-298 actually relies on this conflated verdict (`expect(result.hasIntent).toBe(true)` only) — but a post-unload `classify` is a programming bug, not a runtime degradation.
**Fix:** Distinguish the two failure modes:
```ts
} catch (err) {
  const isTimeout = err instanceof Error && err.message === 'Timeout';
  const verdict = isTimeout ? 'timeout-send-anyway' : 'classifier-error-send-anyway';
  // ... add 'classifier-error-send-anyway' to the union type ...
}
```

### IN-04: `SettingsForm` slider `onChange` does not validate `parseInt` output

**File:** `apps/desktop/src/renderer/src/settings/SettingsForm.tsx:160-162`
**Issue:** `parseInt(e.target.value, 10)` returns `NaN` for empty strings or non-numeric values. `<input type="range">` always reports a numeric string in normal operation, but a misbehaving test, a browser bug, or a future refactor that swaps the input type could yield NaN. The handler then calls `setVadThresholdMs(NaN)` and `window.settings.setVadThreshold(NaN)`. The main-side handler does guard against NaN (`safeMs = typeof ms === 'number' && !Number.isNaN(ms) ? ms : 300`), so the persisted value stays sane. But the React state holds NaN and the display label shows `NaN ms` until the next slider move.
**Fix:**
```ts
onChange={(e) => {
  const parsed = parseInt(e.target.value, 10);
  if (Number.isFinite(parsed)) void handleVadThresholdChange(parsed);
}}
```

### IN-05: `intentExamples.pt-BR.ts` lives in `main/` but is consumed only by the renderer classifier

**File:** `apps/desktop/src/main/voiceMode/intentExamples.pt-BR.ts` consumed by `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts:24`
**Issue:** The few-shot examples module sits under `apps/desktop/src/main/voiceMode/`, but the only importer is the renderer-side `intentClassifier.ts`. Crossing the main/renderer boundary in the import graph is unusual in Electron and works only because Vite/electron-vite bundles everything for the renderer, but it muddies the architectural separation (main is supposed to be Node, renderer is supposed to be browser). Also makes future tree-shaking / process-isolation harder. The file is pure data with no Node-specific dependencies — the natural home is `apps/desktop/src/shared/voiceMode/intentExamples.pt-BR.ts`.
**Fix:** Move to `apps/desktop/src/shared/voiceMode/intentExamples.pt-BR.ts` and update both the renderer import path and any reference in `40-CONTEXT.md` D-06.

### IN-06: `voiceMode/index.ts` default factory throws — silently swallowed by `init()` catch

**File:** `apps/desktop/src/main/voiceMode/index.ts:120, 140-148`
**Issue:** The default factory for `'always-listening'` throws with a descriptive message, but `init()` wraps `factory()` and `start()` in a try/catch that just logs `console.warn(...)`. If a future entry-point refactor forgets to register the real factory via `createAlwaysListeningFactory(deps)`, the user gets no UI signal — Always-Listening silently doesn't work. The warning lives in stdout, which a desktop user never sees. This is a deliberate degradation (per D-09 / VoiceModeManager design), but the `console.warn` is too quiet for a feature that the user explicitly selected. Consider escalating to the existing `voiceMode:degraded` IPC broadcast at this point.
**Fix:** Surface the missing-factory case via the same degraded-event channel:
```ts
} catch (err) {
  console.warn(`[VoiceModeManager] init() — Strategy not ready for mode '${this.currentMode}':`, err);
  this.activeStrategy = null;
  this.emit('voiceMode:degraded', {
    attemptedMode: this.currentMode,
    reason: 'classifier-load-fail',
    message: 'Always-Listening initialization failed — please restart the app or report this issue.',
  });
}
```

---

_Reviewed: 2026-04-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
