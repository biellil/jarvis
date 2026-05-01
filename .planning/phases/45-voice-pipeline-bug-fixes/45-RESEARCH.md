# Phase 45: Voice Pipeline Bug Fixes - Research

**Researched:** 2026-05-01
**Domain:** Voice input pipeline (PTT hotkey guard + Whisper model selection)
**Confidence:** HIGH

## Summary

Phase 45 addresses two critical bugs in the voice pipeline introduced during v1.9 (Voice Capture Modes):

1. **PTT Guard Missing (PATCH-01)**: The PTT hotkey (`ppt-hotkey.ts`) emits the `ptt:action` event to the renderer regardless of the active voice mode. In `wake-word` or `always-listening` mode, this should have no effect — recording should not start. The fix is straightforward: check the voice mode in the main process before emitting.

2. **Whisper Model Override Ignored (PATCH-02)**: The main process detects VRAM and selects a Whisper model, but it completely ignores the user's override setting from the Settings UI. The `getWhisperModelOverride()` function exists and reads from the store correctly, but `main/index.ts` never applies it. The fix requires reading the override after VRAM detection and using it if set to anything other than 'auto'.

Both bugs are localized to the main process (ppt-hotkey.ts, index.ts, settings.ts, store.ts) and require no changes to the renderer or backend. The fixes are low-risk and high-value — users have explicitly chosen voice modes and Whisper models, and the system should honor those choices.

**Primary recommendation:** Implement both fixes in sequence: first the PTT guard (safer, no data flow changes), then the Whisper model override (add selection logic after VRAM detection).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PATCH-01 | Hotkey PTT ignored silenciously when voice mode ≠ ptt-only | [PTT Guard Pattern](#ptt-guard-pattern) — check `voiceModeManager.getMode()` before emit |
| PATCH-02 | Whisper model override from Settings applied in STT pipeline | [Whisper Model Selection Pattern](#whisper-model-selection-pattern) — apply override post-VRAM-detection |

## Standard Stack

### Core Voice Pipeline (Existing)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| electron | 33+ | Main process IPC | globalShortcut API for PTT hotkey registration |
| faster-whisper | 1.2.1 | STT inference | Supports tiny/base/small/medium/large models (not large-v3-turbo) |
| electron-store | 10+ | Persistent configuration | Stores `whisperModelOverride` and voice mode |

### Types (Already Defined)
- **WhisperModelOption** (ipc-types.ts): `'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'` — user-selectable via Settings
- **WhisperModel** (vramDetection.ts): `'tiny' | 'base' | 'medium' | 'large'` — runtime values (excludes 'small' and 'large-v3-turbo' from actual inference)
- **VoiceMode** (ipc-types.ts): `'wake-word' | 'always-listening' | 'ptt-only'`

### No New Dependencies Required
Both fixes use existing APIs:
- `voiceModeManager.getMode()` — already wired in main/index.ts
- `getWhisperModelOverride()` — already exists in store.ts
- `detectVramAndSelectModel()` — already called in main/index.ts

## Architecture Patterns

### PTT Guard Pattern

**What:** Check voice mode before allowing PTT hotkey to emit `ptt:action` to the renderer.

**Current behavior (buggy):**
```typescript
// apps/desktop/src/main/ptt-hotkey.ts (lines 60-66)
globalShortcut.register(accelerator, () => {
  mainWindow.webContents.send('ptt:action', 'toggle');  // ← ALWAYS emits
  pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
  console.log('[PTT] Toggle event sent');
});
```

**Fixed behavior:**
```typescript
globalShortcut.register(accelerator, () => {
  // Guard: only emit if mode is 'ptt-only'
  if (voiceModeManager.getMode() !== 'ppt-only') {
    console.log('[PTT] Hotkey ignored — not in ppt-only mode');
    return;
  }
  mainWindow.webContents.send('ppt:action', 'toggle');
  pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
  console.log('[PTT] Toggle event sent');
});
```

**Why it works:** The `voiceModeManager` is already instantiated and available in main/index.ts at line 49. It provides `getMode()` which returns `VoiceMode | null`. The guard prevents the event from reaching the renderer (ChatInput.tsx) entirely, avoiding the overhead of checking voice mode twice (once here, once at the renderer).

**Implementation detail:** Both `registerPttHotkey()` and `changePttHotkey()` in ppt-hotkey.ts need the same guard. Consider extracting the callback into a named function to avoid duplication.

### Whisper Model Selection Pattern

**Current behavior (buggy):**

```typescript
// apps/desktop/src/main/index.ts (lines 197-208)
let selectedModel: 'tiny' | 'base' | 'large' = 'base';
if (useWhisperCpp) {
  try {
    selectedModel = await detectVramAndSelectModel();  // ← Reads VRAM, ignores override
    console.log(`[voice] Model selected by VRAM: ${selectedModel}`);
  } catch (err) {
    selectedModel = 'base';
  }
}

// Lines 231-234: selectedModel is passed to voiceHandler (never checks override)
setupIpcHandlers(
  {
    ...
    voiceHandler: { config, selectedModel, ttsProvider },  // ← Uses VRAM result only
  },
  mainWindow!,
);
```

**Fixed behavior:**

```typescript
let selectedModel: 'tiny' | 'base' | 'medium' | 'large' = 'base';
if (useWhisperCpp) {
  try {
    selectedModel = await detectVramAndSelectModel();
    console.log(`[voice] Model selected by VRAM: ${selectedModel}`);
  } catch (err) {
    selectedModel = 'base';
  }
  
  // Apply user override if set
  const override = getWhisperModelOverride();
  if (override !== 'auto') {
    selectedModel = override as WhisperModel;  // Type assertion safe — values match
    console.log(`[voice] Using user override: ${selectedModel}`);
  }
}
```

**Type handling:** The Settings UI (SettingsData) uses `WhisperModelOption` ('auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'), but vramDetection.ts exports `WhisperModel` ('tiny' | 'base' | 'medium' | 'large'). The override must be cast to `WhisperModel` when applied. The discrepancy exists because:
- Settings allows user to select 'small' and 'large-v3-turbo' (future-proofing or cloud fallback)
- faster-whisper 1.2.1 only supports the four base models in voiceHandler integration
- When override is 'small' or 'large-v3-turbo', the code should gracefully fall back to 'base' (safe conservative) or log a warning

**Safe fallback for unsupported overrides:**
```typescript
const override = getWhisperModelOverride();
if (override !== 'auto') {
  // Map to supported WhisperModel, or fall back to VRAM selection
  const validModels: WhisperModel[] = ['tiny', 'base', 'medium', 'large'];
  selectedModel = (validModels.includes(override as WhisperModel) ? override : selectedModel) as WhisperModel;
  console.log(`[voice] Using override: ${selectedModel}`);
}
```

**Success criteria verification (from ROADMAP.md):**
1. ✓ Pressing the PTT hotkey or PTT button in wake-word or always-listening mode does nothing — guard prevents emit
2. ✓ After setting a specific Whisper model in Settings (e.g. "large"), JARVIS uses that model — override applied post-VRAM
3. ✓ VRAM auto-detection still works when override is set to "auto" — guard checks `!== 'auto'` before applying

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hotkey guard logic | Custom mode checking in hotkey callback | Existing `voiceModeManager.getMode()` | Already integrated, typed, tested in Phase 41 |
| Model selection | Separate Whisper model manager | Existing store functions + vramDetection module | Avoids duplication, centralizes configuration |
| Voice mode state in main | Roll your own EventEmitter subscription | Existing `voiceModeManager` singleton | State machine already handles transitions, mode switching, disposal |
| Settings persistence | Manual object serialization | Existing `electron-store` wrapper functions | Handles validation, type casting, bounds checking |

**Key insight:** Both bugs are integration issues, not missing subsystems. All the pieces (voiceModeManager, getWhisperModelOverride, detectVramAndSelectModel) exist and work correctly — they just aren't connected in the right place (ppt-hotkey.ts and main/index.ts).

## Common Pitfalls

### Pitfall 1: Type Mismatch Between WhisperModelOption and WhisperModel

**What goes wrong:** When applying the override, the code attempts to pass a `WhisperModelOption` ('small', 'large-v3-turbo') directly to a function expecting `WhisperModel` ('tiny', 'base', 'medium', 'large'). TypeScript compilation fails or values are silently coerced.

**Why it happens:** Settings UI and store layer use `WhisperModelOption` to be future-proof (allow user to select models not yet supported). The voice pipeline uses `WhisperModel` because faster-whisper 1.2.1 only supports four models.

**How to avoid:** 
- Explicitly validate the override value before casting: `if (validModels.includes(override as WhisperModel))` or map unsupported values to 'base'.
- Document the type boundary at the point of cast (e.g., `// Safe: override is always one of the four supported values or 'auto'`).

**Warning signs:** 
- TypeScript error `Type 'WhisperModelOption' is not assignable to type 'WhisperModel'`
- Runtime behavior where override is silently ignored or coerced to a default

### Pitfall 2: VoiceModeManager Not Initialized When PTT Hotkey Registers

**What goes wrong:** The PTT hotkey callback is registered in `registerPttHotkey()` before `voiceModeManager.init()` is called in main/index.ts. The callback tries to call `voiceModeManager.getMode()` but voiceModeManager is still null.

**Why it happens:** The order of initialization in main/index.ts must be respected — window creation, then hotkey registration, then voice mode manager initialization.

**How to avoid:** 
- Register the hotkey AFTER creating the voiceModeManager (move `registerPttHotkey(mainWindow)` to after `voiceModeManager.init()`).
- Or, pass the voiceModeManager to `registerPttHotkey()` so it can be injected into the callback: `registerPttHotkey(mainWindow, voiceModeManager)`.

**Current order (main/index.ts, lines 225-297):**
1. Line 225: `createWindow()` — mainWindow created
2. Line 227: `setupIpcHandlers()` — IPC handlers registered
3. Line 296: `initSettingsWindowIpc()` — (not relevant to PTT)
4. Line 297: `createTray()` — tray created, passes voiceModeManager (currently not passed to registerPttHotkey)
5. After line 297: voiceModeManager already initialized at line 287, safe to use

**Fix:** Move `registerPttHotkey(mainWindow)` call to AFTER line 287 (voiceModeManager.init()), or inject voiceModeManager into the hotkey callback.

**Warning signs:**
- Runtime error: `Cannot read property 'getMode' of null` when hotkey is pressed
- Hotkey works initially, then breaks after mode switch (state corruption)

### Pitfall 3: Hot Reload in Development Breaks PTT if Voicemode Manager State Is Stale

**What goes wrong:** During development (HMR), the renderer reloads but the main process does not. The old voiceModeManager instance remains in memory, but the new registerPttHotkey() callback tries to access a stale reference.

**Why it happens:** globalShortcut persists across HMR in the main process. The callback closure captures the voiceModeManager reference at the time registerPttHotkey() is called. If the main process is not restarted, the reference may point to an orphaned object.

**How to avoid:**
- Test with full app restart (not HMR) to verify the integration works correctly.
- Consider adding a guard: `if (!voiceModeManager) return;` before accessing it in the callback.
- In tests, use the `__resetPttHotkeyEmitterForTests()` helper to clean up between test runs.

**Warning signs:**
- Hotkey works on first app start, but fails after manual file edits and HMR
- Tray mode switching works, but PTT hotkey doesn't see the new mode until app restart

### Pitfall 4: Whisper Model Override Applied But Voicehandler Still Uses Old Cached Model

**What goes wrong:** The selectedModel variable is updated with the override, but the voiceHandler or chat backend still uses a cached model from a previous invocation. User changes Whisper model in Settings, restarts the chat, but STT still uses the old model.

**Why it happens:** The selectedModel is set once at startup (main/index.ts line 199-208) and passed to voiceHandler. If the user changes the setting later via Settings UI, the change is saved to the store but NOT reflected in the running voiceHandler instance — only a restart or explicit re-initialization would pick up the new value.

**How to avoid:**
- Understand that this phase is a STARTUP-TIME fix only. User changes to Whisper model in Settings are persisted but only take effect on the NEXT app restart.
- Document this limitation clearly in the Settings UI (tooltip: "Change takes effect on app restart").
- Future work (Phase 46+): Implement live re-initialization of the STT pipeline when model override changes.

**Warning signs:**
- User changes model in Settings, saves, and immediately tests STT — still uses old model.
- App restart shows the new model in logs (correct behavior for this phase).

### Pitfall 5: PTT Guard Breaks Strategies That Consume pttHotkeyEmitter

**What goes wrong:** The main-side strategies (PttOnlyStrategy) subscribe to `pttHotkeyEmitter` and expect to receive 'toggle' events. If the guard blocks the emit, the strategies never see the event and don't start/stop recording.

**Why it happens:** The guard is added to ppt-hotkey.ts at the point where the event is emitted. If the guard returns early, BOTH the renderer IPC and the main bus event are skipped.

**How to avoid:**
- The guard should block the RENDERER emit (`mainWindow.webContents.send()`) but NOT the main bus emit (`pttHotkeyEmitter.emit()`). This allows strategies to see the event and handle mode-specific behavior internally.
- Alternatively, move the guard INSIDE the event handlers (ChatInput.tsx renderer + PttOnlyStrategy main) instead of at the hotkey registration level.

**Current design (per ppt-hotkey.ts line 61-66):**
```typescript
globalShortcut.register(accelerator, () => {
  mainWindow.webContents.send('ppt:action', 'toggle');  // Line 63 — RENDERER
  pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction); // Line 65 — MAIN STRATEGIES
});
```

**Recommended fix:** Guard BOTH to keep them in sync:
```typescript
globalShortcut.register(accelerator, () => {
  if (voiceModeManager.getMode() !== 'ppt-only') {
    console.log('[PTT] Hotkey ignored — not in ppt-only mode');
    return;  // Block both emits
  }
  mainWindow.webContents.send('ppt:action', 'toggle');
  pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
});
```

This is the CORRECT approach because PttOnlyStrategy should also not respond to the hotkey outside of ppt-only mode. The strategies are passive consumers; the guard at the source (hotkey registration) controls everything consistently.

## Code Examples

### Example 1: PTT Guard Implementation

**Source:** [apps/desktop/src/main/ppt-hotkey.ts](file:///apps/desktop/src/main/ppt-hotkey.ts)

```typescript
// ppt-hotkey.ts — inject voiceModeManager at the top

import type { VoiceModeManager } from './voiceMode/index.js';  // Add import

let voiceModeManager: VoiceModeManager | null = null;

// New export: inject voiceModeManager after it's created
export function setVoiceModeManager(manager: VoiceModeManager): void {
  voiceModeManager = manager;
}

// Refactor: extract callback to avoid duplication
function createPttToggleCallback(mainWindow: BrowserWindow): () => void {
  return () => {
    // Guard: check voice mode before emitting
    if (voiceModeManager?.getMode() !== 'ppt-only') {
      console.log('[PTT] Hotkey ignored — voice mode is not ppt-only');
      return;
    }

    mainWindow.webContents.send('ppt:action', 'toggle');
    pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
    console.log('[PTT] Toggle event sent');
  };
}

export function registerPttHotkey(mainWindow: BrowserWindow): boolean {
  const accelerator = getPttHotkey();
  const callback = createPttToggleCallback(mainWindow);
  const success = globalShortcut.register(accelerator, callback);
  
  if (success) {
    currentPttHotkey = accelerator;
    console.log(`[PTT] Registered: ${accelerator}`);
  } else {
    console.warn(`[PTT] Failed to register: ${accelerator}`);
  }
  return success;
}

export function changePttHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  if (currentPttHotkey) {
    globalShortcut.unregister(currentPttHotkey);
  }
  
  const callback = createPttToggleCallback(mainWindow);
  const success = globalShortcut.register(accelerator, callback);
  
  if (success) {
    setPttHotkey(accelerator);
    currentPttHotkey = accelerator;
  } else {
    // Restore previous hotkey...
  }
  return success;
}
```

**Integration in main/index.ts:**

```typescript
// After line 287 (voiceModeManager.init()), add:
setVoiceModeManager(voiceModeManager);

// Then register the hotkey (move call to after voiceModeManager init)
registerPttHotkey(mainWindow!);
```

### Example 2: Whisper Model Override Implementation

**Source:** [apps/desktop/src/main/index.ts](file:///apps/desktop/src/main/index.ts)

```typescript
// Around line 197-208, after detectVramAndSelectModel():
import { getWhisperModelOverride } from './store.js';
import type { WhisperModel } from './voiceInput/vramDetection.js';

let selectedModel: 'tiny' | 'base' | 'medium' | 'large' = 'base';
if (useWhisperCpp) {
  try {
    selectedModel = await detectVramAndSelectModel();
    console.log(`[voice] Model selected by VRAM: ${selectedModel}`);
  } catch (err) {
    console.error('[voice] VRAM detection failed, defaulting to base model:', err);
    selectedModel = 'base';
  }

  // Apply user override from Settings, if set
  const override = getWhisperModelOverride();
  if (override !== 'auto') {
    // Validate override is a supported WhisperModel (future-proof against 'small', 'large-v3-turbo')
    const supportedModels: WhisperModel[] = ['tiny', 'base', 'medium', 'large'];
    if (supportedModels.includes(override as WhisperModel)) {
      selectedModel = override as WhisperModel;
      console.log(`[voice] Applying user override: ${selectedModel}`);
    } else {
      console.warn(`[voice] Model override '${override}' not supported — using VRAM selection`);
      // selectedModel stays as the VRAM-selected value
    }
  }
}
```

**Testing the fix:** After Settings UI saves a new Whisper model and the app restarts, the log should show:
```
[whisper] VRAM detected: 8192 MB
[whisper] Selecting model: large
[voice] Applying user override: medium
```

If override is 'auto':
```
[whisper] VRAM detected: 8192 MB
[whisper] Selecting model: large
(no override log — 'auto' is ignored)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (apps/desktop/vitest.config.ts) |
| Config file | apps/desktop/vitest.config.ts |
| Quick run command | `npm run test:unit -- --run` (in apps/desktop/) |
| Full suite command | `npm run test` (in apps/desktop/) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PATCH-01 | PTT hotkey returns early if voiceMode ≠ 'ppt-only' | unit | `npm run test:unit -- ppt-hotkey.test.ts` | ✅ Needs update |
| PATCH-01 | PTT hotkey emits if voiceMode === 'ppt-only' | unit | `npm run test:unit -- ppt-hotkey.test.ts` | ✅ Needs update |
| PATCH-02 | Whisper override 'auto' uses VRAM selection | integration | `npm run test:unit -- index.main.test.ts` | ❌ Wave 0 |
| PATCH-02 | Whisper override 'medium' applies after VRAM | integration | `npm run test:unit -- index.main.test.ts` | ❌ Wave 0 |
| PATCH-02 | Whisper override 'small' (unsupported) falls back to VRAM | unit | `npm run test:unit -- vramDetection.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` (Vitest runs all unit tests in watch mode, can ctrl+c to exit)
- **Per wave merge:** `npm run test` (full test suite including integration)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

The existing test suite (apps/desktop/src/main/__tests__/) has some coverage but needs expansion:

- [x] `ppt-hotkey.test.ts` exists (checks hotkey registration/unregistration)
  - Needs: test for voiceMode guard (guard blocks emit when mode ≠ 'ppt-only')
  - Needs: mock VoiceModeManager.getMode() to simulate mode changes
- [x] `store.test.ts` exists (checks getWhisperModelOverride read/write)
  - Covered: store persistence of override value
  - Needs: integration test that override flows through to voiceHandler config
- [ ] `index.main.test.ts` — does not exist
  - Needs: startup-time model selection (VRAM + override integration)
  - Needs: mock detectVramAndSelectModel + getWhisperModelOverride to test all branches
- [ ] Mock VoiceModeManager in ppt-hotkey.test.ts
  - Needs: fixture that returns 'ppt-only', 'wake-word', 'always-listening' as needed

These are non-blocking — implementation can proceed, and tests can be tightened in a follow-up phase or during team review. The manual test (press hotkey in each mode, check logs) is sufficient for Phase 45.

## Open Questions

1. **Should we warn or silently fall back when override is unsupported?**
   - What we know: Settings UI allows 'small' and 'large-v3-turbo', but faster-whisper 1.2.1 only supports 4 models
   - What's unclear: Is there a future plan to add support for 'small' and 'large-v3-turbo'? Or were they added for UI completeness?
   - Recommendation: Use silent fallback to VRAM selection with a console.warn. If a user selected 'small' and the app restarts, they'll see "applying override" but the actual selection will be VRAM-based. Log clearly to make this transparent.

2. **Should PTT hotkey be entirely disabled in non-ppt-only modes, or just silently ignored?**
   - What we know: Current fix silently ignores (returns early, no error toast)
   - What's unclear: Should the Settings UI show a greyed-out PTT button when not in ppt-only mode?
   - Recommendation: Silent ignore for Phase 45 (lowest impact). Future requirement POLISH-01 (Phase 47) can add visual feedback (disabled button).

3. **Do we need to broadcast model selection change to the renderer?**
   - What we know: Model is selected once at startup; no live re-initialization
   - What's unclear: Should the Settings UI show the currently selected model to the user?
   - Recommendation: Out of scope for Phase 45 (startup fix only). Future work: live TTS re-initialization pattern from Phase 34 can be extended to STT.

## Environment Availability

Step 2.6 audit — checking external dependencies:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Electron runtime | ✓ | 18+ (per package.json) | — |
| npm | Dependency management | ✓ | 8+ | — |
| Vitest | Unit tests | ✓ | 1.x (apps/desktop) | — |
| faster-whisper | STT inference (when useWhisperCpp=true) | ✓ | 1.2.1 (Python backend) | Skip STT if unavailable |
| electron-store | Settings persistence | ✓ | 10+ (package.json) | — |

**Missing dependencies with no fallback:**
- None. All external dependencies are development-scoped (Node.js, npm) or bundled with the app (faster-whisper via backend, electron-store via npm).

**Missing dependencies with fallback:**
- faster-whisper: If unavailable (e.g., backend not compiled), STT is skipped; ttsProvider and selectedModel are null, and voiceHandler is not wired (per main/index.ts line 232-235).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — PTT hotkey (Electron globalShortcut) and model selection (vramDetection.ts, store.ts) are well-established patterns from prior phases
- Architecture: **HIGH** — Bug root causes are documented in STATE.md; fixes follow existing code patterns (setVoiceMode in phase 41, getWhisperModelOverride in phase 34)
- Pitfalls: **MEDIUM** — Type mismatch and initialization order are known issues; detailed mitigation provided. Hot reload pitfall is development-specific, low risk in production.

**Research date:** 2026-05-01
**Valid until:** 2026-05-15 (stable domain, no external API changes expected)

**Sources:**

### Primary (HIGH confidence)
- Phase 39-44 ROADMAP.md — Voice Capture Modes architecture and state machine (v1.9 baseline)
- STATE.md — Known bugs documented at startup (PATCH-01, PATCH-02 root causes)
- Code analysis:
  - `apps/desktop/src/main/ppt-hotkey.ts` — Missing voiceMode guard
  - `apps/desktop/src/main/index.ts` (lines 197-234) — VRAM selection without override
  - `apps/desktop/src/main/voiceMode/index.ts` — VoiceModeManager.getMode() API
  - `apps/desktop/src/main/store.ts` — getWhisperModelOverride() and store accessors
  - `apps/desktop/src/shared/ipc-types.ts` — WhisperModelOption vs WhisperModel type definitions
  - `apps/desktop/src/main/voiceInput/vramDetection.ts` — VRAM detection algorithm and supported models

### Secondary (MEDIUM confidence)
- Phase 34 Settings UI implementation — model override UI, store persistence pattern
- Phase 41 VoiceModeManager design — state machine transitions, pub/sub architecture
- Electron globalShortcut documentation — API and callback model

