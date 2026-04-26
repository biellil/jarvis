# Architecture: v1.9 Voice Capture Modes Integration

**Project:** JARVIS v1.9 — Três modos de captura de voz (Wake Word, Always-Listening, PTT-only)  
**Researched:** 2026-04-25  
**Overall Confidence:** HIGH

## Executive Summary

A integração dos 3 modos de captura requer um novo **módulo de state machine (`voiceMode.ts`)** no main process que gerencia o modo ativo (persistido via electron-store), comunica mudanças ao renderer via IPC, e coordena o dispatcher de eventos do voiceHandler. O pipeline STT→LLM→TTS existente em `voiceHandler.ts` permanece intacto — modifica-se apenas **quem ativa a captura de áudio** (wake word vs always-listening vs hotkey PTT). A captura always-listening reusa o ring buffer do wake word + Silero VAD existente, mas adiciona um **intent classifier LLM** (chamado no main via LM Studio local) antes de transcrever — reduzindo falsos positivos sem intervalo fixo de gravação.

Mudanças principais:
1. **Novo módulo `voiceMode.ts`** — state machine + EventEmitter pub/sub + persistência electron-store
2. **Modificação no `voiceHandler.ts`** — substituir lógica "sempre ativo" por padrão Strategy (3 modos = 3 estratégias de captura)
3. **Novo intent classifier no main process** — chamada HTTP local ao LM Studio via backend gateway já existente ou direto ao endpoint /v1/chat/completions
4. **IPC bidireccional para mode change** — main ↔ renderer (tray → mode change → state broadcast → orb visual update)
5. **Orb visual per-mode** — cores/animações distintas (idle/listening/processing/responding/awaiting-followup) + badge de mode ativo

## Recommended Architecture

### Process Structure: Main + Renderer + Backend

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process (Node.js)                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ VoiceMode State Machine (NEW)                   │
│ │  • ModuleScope: enum { WAKE_WORD, ALWAYS_LISTEN, PTT_ONLY }
│ │  • EventEmitter: voiceModeEmitter.on('change', ...) 
│ │  • electron-store: 'voiceMode' key persisted     │
│ │  • API: setMode(mode), getMode() → string        │
│ │                                                  │
│ ├─ Tray Menu (MODIFIED)                            │
│ │  • "Voice Mode" submenu (radio buttons)           │
│ │  • click handler: voiceMode.setMode(mode)        │
│ │  • broadcasts IPC to renderer on change          │
│ │                                                  │
│ ├─ IPC Handlers (EXTENDED)                         │
│ │  • 'voice:set-mode' (tray → main, or renderer)   │
│ │  • 'voice:get-mode' query (renderer startup)     │
│ │  • 'voice:mode-changed' broadcast (main → ren)   │
│ │                                                  │
│ ├─ VoiceInputManager (EXISTING, REUSED)            │
│ │  • Hotkey global Ctrl+Shift+J (wake word)        │
│ │  • PTT hotkey Space/Ctrl+Space (PTT-only)        │
│ │  • Silero VAD + ring buffer (existing)           │
│ │                                                  │
│ ├─ Always-Listening Loop (NEW)                     │
│ │  • Condition: voiceMode === ALWAYS_LISTEN         │
│ │  • Input: ring buffer (reuse VAD stream)         │
│ │  • Process: audio chunk → intent classifier LLM  │
│ │  • Output: if intent detected → transcribe       │
│ │  • Runs in: background task (RequestIdleCallback  │
│ │    or setInterval with backoff)                  │
│ │                                                  │
│ ├─ Intent Classifier (NEW)                         │
│ │  • Input: 1-2s audio from VAD speech end         │
│ │  • Process: transcribe locally (whisper.cpp)     │
│ │  • LLM call: "Is this a command for JARVIS?"     │
│ │    (via local LM Studio when available)          │
│ │  • Output: { isIntent: boolean, confidence }     │
│ │  • Fallback: if no LLM, use simple heuristics    │
│ │    (wake word mention, question mark, caps)      │
│ │                                                  │
│ ├─ VoiceHandler.ts (MODIFIED)                      │
│ │  • existing STT → LLM → TTS pipeline              │
│ │  • NEW: voiceMode parameter in deps              │
│ │  • Strategy pattern: dispatch based on mode      │
│ │    - WAKE_WORD: await hotkey → listen → handle   │
│ │    - ALWAYS_LISTEN: await intent classifier      │
│ │    - PTT_ONLY: await hotkey (different hotkey)   │
│ │                                                  │
│ └─ voiceInputManager.ts (REUSED)                   │
│    • Audio capture (mic stream, ring buffer)       │
│    • VAD (Silero) — shared across all modes        │
│    • Hotkey registration per mode                  │
│                                                  │
└─────────────────────────────────────────────────────┘
         ↓ IPC bidirectional                ↑
┌─────────────────────────────────────────────────────┐
│ Electron Renderer (React)                          │
├─────────────────────────────────────────────────────┤
│ OrbContext (EXTENDED)                              │
│  • voiceMode: 'wake-word' | 'always-listening' |    │
│    'ptt-only'                                      │
│  • useEffect: listen to 'voice:mode-changed'       │
│  • Orb visual per-mode (new CSS classes)           │
│                                                     │
│ Orb.tsx (VISUAL CHANGES)                           │
│  • Idle + wake-word: blue breathing                │
│  • Idle + always-listening: green breathing        │
│  • Idle + ptt-only: orange breathing               │
│  • Listening state: amber pulse (all modes)        │
│  • Badge overlay: small icon/text indicating mode  │
│                                                     │
└─────────────────────────────────────────────────────┘
         ↓ HTTP REST API                   ↑
┌─────────────────────────────────────────────────────┐
│ Backend-TS (Express + LangChain)                    │
├─────────────────────────────────────────────────────┤
│ POST /api/chat (existing)                          │
│  • Input: { message: string }                      │
│  • Output: { message: string }                     │
│  • Used by: voiceHandler.ts (STT result)           │
│                                                     │
│ NEW (Intent Classifier):                           │
│ POST /api/voice/classify-intent (NEW)              │
│  • Input: { text: string, confidence?: number }    │
│  • Output: { isIntent: boolean, reason: string }   │
│  • Alternative: call LM Studio directly from main  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | New? |
|-----------|---|---|---|
| `voiceMode.ts` | State machine, persistence, pub/sub | tray, ipc/settings, voiceInputManager | ✓ |
| `voiceInputManager.ts` | Audio capture, VAD, ring buffer, hotkey mgmt | voiceHandler, voiceMode | Modified |
| `voiceHandler.ts` | STT→LLM→TTS pipeline orchestration | backend gateway, TTS provider | Modified |
| `intentClassifier.ts` | Audio→text→LLM intent classification | voiceInputManager, backend or LM Studio | ✓ |
| `ipc/chat.ts` | sendAudioAndHandle caller | main→renderer state updates | Modified |
| `ipc/index.ts` | IPC handler registry | all handlers | Modified |
| `tray.ts` | Tray UI + mode submenu | voiceMode, ipc broadcast | Modified |
| `Orb.tsx` / `OrbContext.tsx` | Visual state machine + mode badge | IPC listener | Modified |
| Backend `/api/voice/classify-intent` | LLM intent check (if remote) | LLM factory, LangChain | ✓ Option |

## Data Flow Diagrams

### Mode Change Flow (Tray → Main → Renderer)

```
Tray Menu Click
  ↓
tray.ts: Menu.buildFromTemplate()
  click: voiceMode.setMode('always-listening')
  ↓
voiceMode.ts: setMode(mode)
  • update _currentMode
  • electron-store.set('voiceMode', mode)
  • emit 'change' event
  ↓
ipc/settings.ts: broadcastModeChange(mode)
  ipcMain.emit('voice:mode-changed', mode)  → Renderer
  ↓
App.tsx: useEffect listener
  window.jarvis.on('voice:mode-changed', setVoiceMode)
  ↓
OrbContext: setOrbMode(mode)
  Orb.tsx re-renders with new CSS classes
```

### Always-Listening Capture Flow

```
Audio stream (continuous)
  ↓
voiceInputManager: ring buffer (existing VAD)
  ↓
Silero VAD detects voice
  ↓
intentClassifier.ts: classifyIntent(audioChunk)
  1. transcribe via whisper.cpp (local)
  2. call LLM: "Is this a command?"
     - Option A: HTTP POST /api/voice/classify-intent
     - Option B: Direct LM Studio /v1/chat/completions
  3. return { isIntent: boolean, confidence }
  ↓
  if isIntent:
    voiceHandler.handleAudio(...)  → STT→LLM→TTS
  else:
    discard audio, continue listening
  ↓
  (timeout 6s fallback if VAD never closes)
```

### PTT-Only Flow

```
User holds Space (configured hotkey)
  ↓
ptt-hotkey.ts: onPressed()
  mediaRecorder.start()
  ↓
User releases Space
  ↓
ptt-hotkey.ts: onReleased()
  mediaRecorder.stop() → WebM buffer
  ↓
ipc/chat.ts: handleSendAudio(buffer)
  ↓
voiceHandler.handleAudio(buffer)
  → STT→LLM→TTS (same as existing PTT)
```

## Patterns to Follow

### Pattern 1: Strategy Pattern for Voice Capture Modes

**What:** Encapsulate 3 capture strategies behind a common interface.

**When:** Each mode (wake-word, always-listening, PTT-only) has distinct behavior but shares the same downstream (voiceHandler).

**Implementation:**

```typescript
// voiceMode.ts
export type VoiceMode = 'wake-word' | 'always-listening' | 'ptt-only';

interface VoiceCaptureStrategy {
  name: string;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  canCoexistWith(other: VoiceMode): boolean;
}

class WakeWordStrategy implements VoiceCaptureStrategy {
  name = 'wake-word';
  async activate() { /* register hotkey, init engine */ }
  async deactivate() { /* unregister hotkey */ }
  canCoexistWith(other) { return false; }
}

class AlwaysListeningStrategy implements VoiceCaptureStrategy {
  name = 'always-listening';
  async activate() { /* start intent classifier loop */ }
  async deactivate() { /* stop loop */ }
  canCoexistWith(other) { return false; }
}

class PttOnlyStrategy implements VoiceCaptureStrategy {
  name = 'ptt-only';
  async activate() { /* register PTT hotkey */ }
  async deactivate() { /* unregister PTT hotkey */ }
  canCoexistWith(other) { return false; }
}

// VoiceMode manager dispatches to active strategy
class VoiceModeManager {
  private activeStrategy: VoiceCaptureStrategy | null = null;
  
  async setMode(mode: VoiceMode) {
    if (this.activeStrategy) {
      await this.activeStrategy.deactivate();
    }
    this.activeStrategy = this.strategies[mode];
    await this.activeStrategy.activate();
    electron.store.set('voiceMode', mode);
    this.emitter.emit('change', mode);
  }
}
```

**Benefit:** Each mode is testable in isolation; adding a 4th mode (e.g., "voice-button") requires only a new Strategy class.

### Pattern 2: EventEmitter Pub/Sub for IPC Coordination

**What:** Use Node.js EventEmitter to decouple tray, voiceMode, and IPC handlers.

**When:** Multiple parts of the app need to react to mode changes without tight coupling.

**Implementation:**

```typescript
// voiceMode.ts
import { EventEmitter } from 'node:events';

export const voiceModeEmitter = new EventEmitter();

export class VoiceMode {
  async setMode(mode: VoiceMode) {
    // ... strategy logic ...
    voiceModeEmitter.emit('mode-changed', mode);
  }
}

// ipc/settings.ts
import { voiceModeEmitter } from '../voiceMode';

voiceModeEmitter.on('mode-changed', (mode) => {
  // Broadcast to renderer
  mainWindow!.webContents.send('voice:mode-changed', mode);
});

// tray.ts
import { voiceMode } from './voiceMode';

tray.setContextMenu(
  Menu.buildFromTemplate([
    {
      label: 'Voice Mode',
      submenu: [
        {
          label: 'Wake Word',
          type: 'radio',
          checked: voiceMode.getMode() === 'wake-word',
          click: () => voiceMode.setMode('wake-word'),
        },
        // ... other modes ...
      ],
    },
  ])
);
```

**Benefit:** Tray doesn't know about IPC; voiceMode doesn't know about tray — they communicate via events.

### Pattern 3: Persistent State via electron-store

**What:** Store voice mode selection in electron-store, restore on app startup.

**When:** Users should see the same mode after restart.

**Implementation:**

```typescript
// voiceMode.ts
import Store from 'electron-store';

const store = new Store({
  defaults: { voiceMode: 'wake-word' },
});

class VoiceMode {
  private _mode: VoiceMode;

  constructor() {
    this._mode = store.get('voiceMode') as VoiceMode;
  }

  setMode(mode: VoiceMode) {
    this._mode = mode;
    store.set('voiceMode', mode);
    voiceModeEmitter.emit('mode-changed', mode);
  }

  getMode(): VoiceMode {
    return this._mode;
  }
}
```

**Benefit:** Mode persists across session restarts without custom SQLite logic.

### Pattern 4: Intent Classifier as Standalone Async Task

**What:** Classification happens in background without blocking the voice capture loop.

**When:** Avoiding false positives in always-listening without user perceiving latency.

**Implementation:**

```typescript
// voiceInputManager.ts
import { intentClassifier } from './intentClassifier';

async function onVadSpeechEnd(audioChunk: Float32Array) {
  if (voiceMode.getMode() === 'always-listening') {
    // Non-blocking: fire-and-forget classification
    void intentClassifier.classifyAndHandle(audioChunk)
      .then((shouldProcess) => {
        if (shouldProcess) {
          // transcribe + LLM + TTS
          return voiceHandler.handleAudio(audioChunk);
        }
      })
      .catch((err) => {
        console.error('[intent-classifier] Error:', err);
        // Graceful degrade: if classifier fails, transcribe anyway
        return voiceHandler.handleAudio(audioChunk);
      });
  } else if (voiceMode.getMode() === 'wake-word') {
    // existing logic: hotkey → transcribe
  } else if (voiceMode.getMode() === 'ptt-only') {
    // PTT manages its own audio capture
  }
}
```

**Benefit:** Intent classification failure doesn't block the pipeline; graceful degrade still processes audio.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mode State Scattered Across Modules

**What:** Storing voiceMode in multiple places (tray, voiceHandler, ipc, renderer) without single source of truth.

**Why bad:** Sync issues; mode changes in tray don't propagate to voiceHandler; renderer shows stale mode.

**Instead:** Keep mode in `voiceMode.ts` module scope; all modules query/subscribe via pub/sub.

### Anti-Pattern 2: Blocking Intent Classification in VAD Loop

**What:** Waiting for LLM response synchronously inside the VAD speech-end callback.

**Why bad:** VAD latency increases; user perceives stuttering while waiting for LLM response.

**Instead:** Queue classification as background task (fire-and-forget); if it fails, graceful degrade to transcribe anyway.

### Anti-Pattern 3: Three Separate Audio Capture Loops

**What:** Implementing separate ring buffers/stream managers for wake-word, always-listening, and PTT.

**Why bad:** Code duplication; memory overhead; hard to switch modes without restarting capture.

**Instead:** Reuse single ring buffer + VAD from voiceInputManager; modes differ only in what triggers transcription.

### Anti-Pattern 4: Hardcoding Intent Classifier Logic

**What:** Embedding intent classification prompt/logic directly in voiceHandler or intentClassifier.

**Why bad:** Hard to tune; privacy assumption changes require code edits; no A/B testing.

**Instead:** Load classification prompt from config (env var or electron-store); parameterize confidence threshold.

### Anti-Pattern 5: Intent Classifier as Blocking HTTP Call from Renderer

**What:** Renderer sends audio to backend for classification, waits for response before transcribing.

**Why bad:** Extra round-trip latency; violates privacy-first default if using cloud LLM; main process idle.

**Instead:** Main process calls local LM Studio directly (IPC cost << HTTP cost); renderer never sees classification logic.

## Scalability Considerations

| Concern | At 1 Command/Min (Idle) | At 10 Commands/Min (Active User) | At 100 Commands/Min (Extreme) |
|---------|---|---|---|
| Intent Classifier LLM Call Latency | ~500ms acceptable | 500ms × 10 = 5s overhead/min — tolerable | 500ms × 100 = 50s/min = would delay responses |
| Ring Buffer Memory | 8kHz × 6s VAD window = ~48KB | Same, reused | Same |
| Whisper STT Latency | 10s audio → 2s transcribe = <200ms overhead | 10s × 10 = 100s/min wall clock (parallel) | Need GPU or lower latency via async |
| Intent Classifier Failure Rate | If <1%, graceful degrade (transcribe anyway) | If <1%, acceptable | If >5%, impacts UX noticeably |
| Mode Switch Latency | <100ms (unregister old hotkey, register new) | <100ms | <100ms |

**Recommendation:** Start with serial (one classification at a time) via request queue; if user runs multiple concurrent commands, queue them. Add CPU pool later if needed.

## Confidence Level by Domain

| Domain | Confidence | Rationale |
|--------|---|---|
| **State Machine Design** | HIGH | Existing voiceInputManager + hotkey management patterns well-understood; strategy pattern is industry-standard |
| **IPC Bidirectional Communication** | HIGH | Electron IPC for tray-renderer already working (phase 34); extending with mode channel is straightforward |
| **Always-Listening Audio Loop** | HIGH | Silero VAD + ring buffer fully implemented in v1.4+; reuse is low-risk |
| **Intent Classifier Integration** | MEDIUM-HIGH | LM Studio integration exists in main process (voiceHandler calls gateway); direct call to LM Studio /v1/chat/completions is low-risk; LLM response handling adds one new failure mode (timeouts, refusals) |
| **Orb Visual Per-Mode** | HIGH | Existing OrbContext state machine; adding `voiceMode` field and CSS classes is straightforward |
| **Electron-Store Persistence** | HIGH | Already used for hotkey, TTS provider, Whisper model; mode key follows same pattern |
| **PTT Hotkey Coexistence** | MEDIUM | Phase 34 PTT already registered separately; mode switching must carefully unregister old hotkey before registering new; risk: hotkey leak if unregister fails |

## Phase-Specific Architectural Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| **Intent Classifier Prompt** | LLM refuses to classify ("I'm not a classifier") or classifies too conservatively ("everything is intent = true") | Test with multiple LLM backends (LM Studio local, Claude, GPT) before shipping; measure false-positive/negative rates on real user audio |
| **Always-Listening Audio Persistence** | Ring buffer grows indefinitely; old frames not discarded | Enforce explicit window size (e.g., 6s sliding window); add assertions in VAD callback |
| **Mode Switch During Active Recording** | User changes mode while PTT hotkey is held down → audio lost | Serialize mode changes: reject if voiceInputManager.isRecording(); queue change until recording stops |
| **Hotkey Registration Race** | Two hotkeys registered for same key (old mode's hotkey still active) | Ensure voiceMode.setMode() calls voiceInputManager.unregisterAll() before registering new strategy |
| **Intent Classifier Timeout** | LM Studio hangs or responds very slowly (>5s) → user perceives frozen app | Wrap LM Studio call in timeout (2s max); if timeout, graceful degrade (transcribe anyway) |
| **Orb Mode Badge Render Loop** | Badge updates too frequently (every classification) → flickering | Update badge only on mode change (voiceModeEmitter), not on every classification result |
| **Privacy Assumption Drift** | Always-Listening mode assumes local LLM available, but user doesn't have LM Studio running → intent classifier fails → falls back to cloud LLM | Check LM Studio availability at startup; fallback to no-classification (always transcribe) or show warning to user |
| **Multi-Hotkey Conflict** | User configures Wake Word hotkey = Space, PTT hotkey = Space → both register, both fire → double-trigger | Add validation: warn user if hotkeys conflict; prevent register if already taken |

## Integration Points: New vs Modified Components

### New Files to Create

1. **`apps/desktop/src/main/voiceMode.ts`**
   - VoiceMode class with state machine + persistence
   - EventEmitter pub/sub
   - Strategy interface + 3 implementations
   - Public API: setMode(mode), getMode(), voiceModeEmitter

2. **`apps/desktop/src/main/intentClassifier.ts`**
   - Input: Float32Array (VAD audio)
   - Process: transcribe (whisper.cpp) + classify (LLM)
   - Output: { isIntent: boolean, confidence: number, reason: string }
   - Failure handling: timeout + graceful degrade

3. **`apps/desktop/src/shared/voiceMode.ts`** (types)
   - VoiceMode enum/type
   - IPC message types (voice:set-mode, voice:mode-changed)

### Modified Files

1. **`voiceHandler.ts`**
   - Add voiceMode param to VoiceHandlerDeps
   - No branching logic — strategy handles mode dispatch
   - Reuse existing handleAudio() signature

2. **`voiceInputManager.ts`**
   - Replace hotkey-only startup with strategy.activate()
   - Subscribe to voiceModeEmitter.on('change', ...)
   - On mode change: call old strategy.deactivate(), new strategy.activate()

3. **`tray.ts`**
   - Add "Voice Mode" submenu with 3 radio options
   - click handler: voiceMode.setMode(mode)
   - Rebuild menu on voiceModeEmitter.on('change', ...) to keep radio state in sync

4. **`ipc/index.ts`**
   - Add voice:set-mode handler
   - Add voice:get-mode handler
   - Update setupIpcHandlers signature if needed

5. **`ipc/settings.ts`**
   - Add broadcastModeChange(mode) function
   - Subscribe to voiceModeEmitter.on('change', ...) and broadcast to renderer

6. **`OrbContext.tsx`**
   - Add voiceMode state field
   - useEffect: listen to 'voice:mode-changed' IPC event

7. **`Orb.tsx`**
   - Add CSS classes per mode: `orb--mode-wake-word`, `orb--mode-always-listening`, `orb--mode-ptt-only`
   - Breathing color logic: blue (wake), green (always), orange (PTT)
   - Small mode badge: icon + label overlay

### Backend Changes (Optional)

If moving intent classification to backend:

1. **`apps/backend-ts/src/routes`**
   - Add POST /api/voice/classify-intent
   - Input: { text: string, confidence?: number }
   - Output: { isIntent: boolean, reason: string }
   - Logic: one-shot LLM prompt via existing ChatSession

## Build Order (Recommended Phase Sequence)

### Phase 1: Foundation — Mode State Machine
**Dependencies:** None  
**Deliverable:** voiceMode.ts module with:
  - Strategy interface
  - 3 empty strategy implementations (no-op activate/deactivate)
  - VoiceMode state machine
  - electron-store persistence
  - voiceModeEmitter pub/sub
**Testing:** Unit test VoiceMode.setMode() persistence

**Estimated effort:** 1 plan (3–4 days)

---

### Phase 2: Always-Listening Core
**Dependencies:** Phase 1 (voiceMode state machine ready)  
**Deliverable:**
  - AlwaysListeningStrategy.activate() wires intent classifier loop
  - intentClassifier.ts (transcribe + LLM classify)
  - Fire-and-forget invocation in VAD callback
**Testing:** Manual test: say something → check intent classification logs

**Estimated effort:** 2–3 plans (5–7 days)

---

### Phase 3: Tray Menu + IPC Mode Switching
**Dependencies:** Phase 1 (voiceMode state machine ready)  
**Deliverable:**
  - tray.ts: "Voice Mode" submenu with radio options
  - ipc/settings.ts: broadcastModeChange()
  - 'voice:set-mode' handler
  - Mode changes persist + broadcast to renderer
**Testing:** Tray click → mode changes → renderer IPC received

**Estimated effort:** 1 plan (3–4 days)

---

### Phase 4: Orb Visual Per-Mode
**Dependencies:** Phase 3 (IPC mode broadcast working)  
**Deliverable:**
  - OrbContext.tsx: voiceMode field + IPC listener
  - Orb.tsx: CSS per mode + mode badge overlay
  - Distinct colors: blue/green/orange breathing
**Testing:** Tray radio click → orb color changes; restart app → color persisted

**Estimated effort:** 1 plan (3–4 days)

---

### Phase 5: Integration + PTT Hotkey Handling
**Dependencies:** Phase 2 (always-listening working) + Phase 3 (mode switching works)  
**Deliverable:**
  - voiceInputManager integration: switch strategies on mode change
  - PTT hotkey handling in PttOnlyStrategy
  - Safe unregister-then-register flow
  - Error recovery: if unregister fails, retry or warn
**Testing:** E2E: tray mode change → hotkey disabled → new hotkey active

**Estimated effort:** 2 plans (5–7 days)

---

### Phase 6: Visual Polish + Fail-Safe
**Dependencies:** All prior phases  
**Deliverable:**
  - Timeout handling for intent classifier (2s max)
  - Graceful degrade if LLM unavailable
  - Toast notifications on mode switch
  - User warning if LM Studio offline but always-listening selected
**Testing:** Unplug network → intentClassifier timeout → graceful degrade

**Estimated effort:** 1 plan (3–4 days)

---

**Total estimated effort:** ~7–9 plans over ~30–35 days  
**Rationale:** Phase 1 (foundation) enables parallelization; Phase 2 & 3 can run in parallel after Phase 1; Phase 5 integrates both; Phase 6 hardens.

## Diagram: Component Dependency Graph

```
voiceMode.ts (Phase 1)
  ├── voiceInputManager.ts (Phase 5)
  │   ├── intentClassifier.ts (Phase 2)
  │   │   └── voiceHandler.ts (existing)
  │   └── tray.ts (Phase 3)
  │
  ├── ipc/settings.ts (Phase 3)
  │   └── Renderer: OrbContext.tsx (Phase 4)
  │
  └── App: Orb visual (Phase 4)
```

## Key Decisions to Lock In

| Decision | Rationale | Risk |
|----------|-----------|------|
| **Modos mutuamente exclusivos** | Simplifica logic; user expectation (one mode at a time) | User may want wake-word + PTT simultaneously (deferred to v1.10+) |
| **Intent classifier no main process** | Latency-sensitive (avoids network round-trip); privacy-first | If LM Studio unavailable, graceful degrade required |
| **Ring buffer reuse (não criar novo)** | Zero new memory allocation; leverages existing VAD | May limit always-listening window size (6s max) |
| **electron-store persistence** | No custom SQLite; already used for hotkey/TTS | If user deletes app data, mode resets (acceptable) |
| **Tray radio menu (não Settings UI)** | Quick access; matches existing tray metaphor | Settings UI (Phase 34 style) could be added later for advanced options |
| **Strategy pattern** | Testable, extensible for future modes | Adds ~100 LOC boilerplate (acceptable complexity trade-off) |

## Gaps Requiring Phase-Specific Research Later

1. **Intent Classifier Prompt Optimization** — Which LLM prompt minimizes false positives while catching real commands? (Phase 2 research task)

2. **Hotkey Conflict Detection** — How to warn user if two modes have overlapping hotkeys? (Phase 5 research task)

3. **Always-Listening Privacy Disclaimer** — Should app show warning when user enables always-listening? When/where? (Phase 4 UX research)

4. **Graceful Degrade Thresholds** — If intent classifier fails >5% of the time, what user-facing feedback? (Phase 6 research task)

5. **Multi-Mode Coexistence (Future)** — Can we support wake-word + always-listening simultaneously? (v1.10+ research)

## Sources

- Existing codebase: voiceHandler.ts (Phase 30), voiceInputManager.ts (Phase 22), tray.ts (Phase 33-34)
- IPC patterns: apps/desktop/src/main/ipc/chat.ts, ipc/settings.ts (working implementations)
- Electron patterns: electron-store (v10.x), electron's BrowserWindow.webContents.send()
- LangChain/LLM: backend-ts ChatSession.send() (existing integration)
- Strategy pattern: Gang of Four, widely used in Node.js agent frameworks
