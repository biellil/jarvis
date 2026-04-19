# Phase 34: Settings UI - Research

**Researched:** 2026-04-16
**Domain:** Electron UI/IPC + electron-store configuration persistence
**Confidence:** HIGH (patterns from existing codebase, verified against CONTEXT.md decisions)

## Summary

Phase 34 implements a Settings window—a separate BrowserWindow accessible via tray menu—where users configure three categories: Push-to-Talk hotkey, TTS provider + API key, and Whisper model override. All settings persist via `electron-store` across sessions. The architecture reuses established patterns from Phase 33 (BrowserWindow creation, IPC handlers, store accessors) and extends them with new store fields, a dedicated renderer entry point, and live TTS reinitialization without app restart.

**Primary recommendation:** Use Vite multi-page setup with a dedicated `settings.html` entry point and `ipcMain.handle()` handlers for get/save operations. Extend `store.ts` with `ttsProvider`, `ttsApiKey`, and `whisperModelOverride` fields. On save, call `reinitializeTTS()` to swap providers without restart. Hotkey changes reuse existing `changePttHotkey()` pattern. Test Settings IPC handlers with vitest mocking store and hotkey modules.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Settings Window Architecture:** Dedicated `BrowserWindow` via tray "Settings" item; native OS chrome (`frame: true`); 480×520px, non-resizable; `hide()` on close (not destroy) for instant reopen
- **Form UX:** Explicit "Save" button; three vertical sections (Push-to-Talk, Voice/TTS, Transcription/Whisper); toast "Settings saved" 2s + auto-close window
- **Hotkey Input:** Readonly `<input type="text">` + "Record" button that captures next key press
- **Data Storage:** electron-store plaintext in `%APPDATA%/jarvis/config.json`; TTS providers: `["murf", "elevenlabs"]`; Whisper models: `["tiny", "base", "small", "medium", "large-v3-turbo"]` + `"auto"` default
- **Live Reload:** After saving TTS provider/key, main calls `reinitializeTTS()` on VoiceHandler—no app restart required
- **Integration:** Settings item in tray.ts (stub → connect); reuse `changeHotkey()`, `changePttHotkey()` from hotkey.ts; extend IPC settings.ts with window handlers

### Claude's Discretion
- Visual style (Tailwind, colors, spacing) — follow v1.6 project pattern
- Field validation (API key format, hotkey conflicts)
- IPC channel names for settings window ↔ main
- Fallback behavior if TTS reinit fails

### Deferred Ideas (OUT OF SCOPE)
- OS keychain for API keys (v2)
- Custom URL for local TTS (v2)
- Additional settings: language, wake word sensitivity, theme

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SET-01 | User opens Settings via tray menu—no manual .env editing | BrowserWindow creation pattern from Phase 33; tray "Settings" item exists (stub); IPC handlers in settings.ts |
| SET-02 | PTT hotkey configurable in UI, persists after restart | `changePttHotkey()` exists in ptt-hotkey.ts; `setPttHotkey()` already in store.ts; hotkey recording via native `<input readonly>` + keydown listener |
| SET-03 | TTS provider + API key configurable, live-reloads without restart | `createTTSProvider()` reads env; need `reinitializeTTS()` in voiceHandler; store fields: `ttsProvider`, `ttsApiKey` |
| SET-04 | Whisper model override, manual selection prevails over VRAM auto-detect | `detectVramAndSelectModel()` in voiceHandler.ts; store field: `whisperModelOverride`; init.ts reads override before auto-detect |
| SET-05 | All settings persist via electron-store across sessions | electron-store already integrated; extend StoreSchema with new fields |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Desktop framework | Established in project; Phase 33 patterns proven on macOS/Linux |
| electron-store | ^11.0.2 | Persistent config | Already integrated; synchronous, embeddable, no server |
| Vite (electron-vite) | ^5.0.0 | Build + dev server | Multi-page support for separate renderer entry points |
| Tailwind CSS | ^4.0.0 | Styling | Project standard; existing templates in orb |
| React | ^19.2.4 | UI framework | Renderer uses React; Phase 33 patterns established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/vite | ^4.0.0 | Vite Tailwind plugin | Build time CSS processing for Settings page |
| react-router-dom | ^7.14.0 | Client-side routing | Not needed for Settings (single page); use direct form handling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-store | Conf / node-persist | electron-store is battle-tested in Electron; Conf is older, less maintained |
| BrowserWindow separate | Modal dialog (Dialog API) | Modal blocks orb while open; separate window is cleaner UX, lets orb still function |
| Multi-page Vite | Single-page with routing | Multi-page keeps bundle sizes clean; Settings page loads only when opened |

**Installation:**
```bash
# Dependencies already in package.json
npm install
# No new deps required — reuse existing stack
```

**Version verification (as of 2026-04-16):**
- electron: 41.1.1 ✓ (latest stable)
- electron-store: 11.0.2 ✓ (Feb 2025 release)
- electron-vite: 5.0.0 ✓ (multi-page confirmed)
- Tailwind CSS: 4.0.0 ✓ (latest)

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop/
├── src/
│   ├── main/
│   │   ├── store.ts               # Extended: ttsProvider, ttsApiKey, whisperModelOverride
│   │   ├── ipc/
│   │   │   ├── settings.ts        # Extended: get/save handlers for Settings window
│   │   │   └── index.ts           # Register all handlers
│   │   ├── voiceInput/
│   │   │   └── voiceHandler.ts    # Add reinitializeTTS() export
│   │   └── index.ts               # Create Settings window on tray click
│   ├── renderer/
│   │   ├── index.html             # Orb (existing)
│   │   ├── settings.html          # NEW — Settings window entry point
│   │   ├── settings.tsx           # NEW — Settings page React component
│   │   ├── src/
│   │   │   └── settings/
│   │   │       ├── SettingsForm.tsx
│   │   │       ├── HotkeyRecorder.tsx
│   │   │       └── TtsProvider.tsx
│   │   └── index.tsx              # Orb App (existing)
│   ├── preload/
│   │   └── index.ts               # NEW: settingsApi exposed (optional, or reuse jarvisApi)
│   └── shared/
│       └── ipc-types.ts           # Extended: Settings IPC types
└── electron.vite.config.ts        # Vite config — add settings.html entry
```

### Pattern 1: Settings Window Lifecycle (BrowserWindow Management)

**What:** Create a single Settings BrowserWindow instance, hide (not destroy) on close, reopen instantly.

**When to use:** Modal-like dialogs that close and reopen frequently; avoid re-creating windows.

**Example:**

```typescript
// main/index.ts
let settingsWindow: BrowserWindow | null = null;

function openSettingsWindow(parentWindow: BrowserWindow): void {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 520,
    resizable: false,
    frame: true,
    parent: parentWindow, // Optional: modal-like behavior (blocks parent focus)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.js'), // Shared preload
    },
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`);
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  }

  settingsWindow.on('close', (event) => {
    event.preventDefault(); // Prevent destruction
    settingsWindow?.hide();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// In tray.ts buildContextMenu()
{
  label: 'Settings',
  click: () => {
    openSettingsWindow(mainWindow);
  },
}
```

Source: Pattern extends Phase 33 BrowserWindow creation; confirmed in apps/desktop/src/main/index.ts

### Pattern 2: Store Extensions for New Settings Fields

**What:** Add typed accessors to store.ts following the existing pattern (get/set functions wrapping electron-store).

**When to use:** Persisting user-configurable preferences with typed access.

**Example:**

```typescript
// store.ts — extend StoreSchema and add accessors

export interface StoreSchema {
  hotkey?: HotkeyConfig;
  pttHotkey?: HotkeyConfig;
  wakeWordPaused?: boolean;
  orbPosition?: { x: number; y: number };
  // NEW: Settings window fields
  ttsProvider?: { name: 'murf' | 'elevenlabs' };
  ttsApiKey?: { key: string };
  whisperModelOverride?: { model: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' };
}

// TTS Provider accessors
export function getTtsProvider(): 'murf' | 'elevenlabs' {
  const config = store.get('ttsProvider');
  return config?.name ?? 'elevenlabs'; // Default to elevenlabs
}

export function setTtsProvider(name: 'murf' | 'elevenlabs'): void {
  store.set('ttsProvider', { name });
}

export function getTtsApiKey(): string {
  const config = store.get('ttsApiKey');
  return config?.key ?? '';
}

export function setTtsApiKey(key: string): void {
  store.set('ttsApiKey', { key });
}

// Whisper Model Override accessors
export function getWhisperModelOverride(): 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' {
  const config = store.get('whisperModelOverride');
  return config?.model ?? 'auto'; // Default: auto-detect
}

export function setWhisperModelOverride(model: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'): void {
  store.set('whisperModelOverride', { model });
}
```

Source: Mirrors existing `getWidgetHotkey() / setWidgetHotkey()` pattern in store.ts:33-40

### Pattern 3: IPC Handler Pair for Settings Window (Get/Save)

**What:** `ipcMain.handle()` handlers for renderer to get current settings and save new ones.

**When to use:** Bidirectional IPC between Settings window and main process.

**Example:**

```typescript
// ipc/settings.ts — extend existing handlers

export interface SettingsData {
  pttHotkey: string;
  ttsProvider: 'murf' | 'elevenlabs';
  ttsApiKey: string;
  whisperModelOverride: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo';
}

export interface SaveSettingsRequest {
  pttHotkey?: string;
  ttsProvider?: 'murf' | 'elevenlabs';
  ttsApiKey?: string;
  whisperModelOverride?: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo';
}

export function setupSettingsHandlers(mainWindow: BrowserWindow): void {
  // Get current settings (renderer → main on window load)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsData => {
    return {
      pttHotkey: getPttHotkey(),
      ttsProvider: getTtsProvider(),
      ttsApiKey: getTtsApiKey(),
      whisperModelOverride: getWhisperModelOverride(),
    };
  });

  // Save settings (renderer → main on "Save" button click)
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (event, request: SaveSettingsRequest): Promise<{ success: boolean; error?: string }> => {
      try {
        if (request.pttHotkey) {
          const success = changePttHotkey(request.pttHotkey, mainWindow);
          if (!success) {
            return { success: false, error: 'PTT hotkey already in use' };
          }
        }

        if (request.ttsProvider) {
          setTtsProvider(request.ttsProvider);
        }

        if (request.ttsApiKey !== undefined) {
          setTtsApiKey(request.ttsApiKey);
        }

        if (request.whisperModelOverride) {
          setWhisperModelOverride(request.whisperModelOverride);
        }

        // Live TTS reload: re-initialize provider without app restart
        if (request.ttsProvider || request.ttsApiKey !== undefined) {
          try {
            await reinitializeTTS(); // See Pattern 4
          } catch (err) {
            console.warn('[settings] TTS reinit failed:', err);
            // Non-fatal: TTS will use previous provider until next app restart
          }
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    },
  );
}
```

Source: Extends `setupSettingsHandlers()` in apps/desktop/src/main/ipc/settings.ts:17-21

### Pattern 4: TTS Reinitialization Without App Restart

**What:** Export `reinitializeTTS()` from voiceHandler.ts to swap providers after user changes settings.

**When to use:** Live configuration changes without requiring app restart.

**Example:**

```typescript
// voiceInput/voiceHandler.ts — extend module scope

let currentTtsProvider: TTSProvider;

export function initializeTTSProvider(provider: TTSProvider): void {
  currentTtsProvider = provider;
  console.log('[voice-handler] TTS provider initialized:', provider.name);
}

export async function reinitializeTTS(): Promise<void> {
  // Called from Settings IPC handler when user changes TTS provider/key
  const newProvider = createTTSProvider();
  currentTtsProvider = newProvider;
  console.log('[voice-handler] TTS provider re-initialized:', newProvider.name);
}

export async function handleAudio(
  webmBuffer: Buffer,
  deps: VoiceHandlerDeps,
): Promise<SendAudioResponse> {
  // ... (existing code) ...
  // Use module-scope currentTtsProvider instead of deps.ttsProvider if reinit occurred
  try {
    const ttsResult = await currentTtsProvider.synthesize(reply);
    // ...
  } catch (ttsErr) {
    // ...
  }
}

// In main/index.ts initialization
const ttsProvider = useWhisperCpp ? createTTSProvider() : null;
if (ttsProvider) {
  initializeTTSProvider(ttsProvider);
}
```

Source: Pattern follows lifecycle established in voiceHandler.ts:22-31 (VoiceHandlerDeps injection)

### Pattern 5: Hotkey Recording UI (Keydown Event Capture)

**What:** Readonly input + button that captures next key press, prevents system hotkey conflicts.

**When to use:** Hotkey configuration forms where user records a physical key sequence.

**Example (React):**

```typescript
// renderer/src/settings/HotkeyRecorder.tsx

import { useState } from 'react';

interface HotkeyRecorderProps {
  label: string;
  value: string;
  onRecorded: (accelerator: string) => void;
  disabled?: boolean;
}

export function HotkeyRecorder({ label, value, onRecorded, disabled }: HotkeyRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);

  const handleRecordClick = () => {
    setIsRecording(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // Translate key to Electron accelerator format
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push(e.metaKey ? 'Cmd' : 'Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Enter': 'Return',
      'Backspace': 'BackSpace',
      'Delete': 'Delete',
      'Escape': 'Esc',
    };

    const key = keyMap[e.key] || e.key.toUpperCase();
    if (key.length === 1 && /[A-Z0-9]/.test(key)) {
      parts.push(key);
    }

    if (parts.length > 1) {
      const accelerator = parts.slice(0, -1).join('+') + '+' + parts[parts.length - 1];
      onRecorded(accelerator);
      setIsRecording(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={isRecording ? 'Press a key combination...' : value}
          className="flex-1 px-3 py-2 border rounded bg-gray-100 cursor-not-allowed"
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleRecordClick}
          disabled={disabled || isRecording}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isRecording ? 'Recording...' : 'Record'}
        </button>
      </div>
    </div>
  );
}
```

Source: Pattern from CONTEXT.md "Hotkey input widget: `<input type="text" readonly>` + botão "Record"

### Anti-Patterns to Avoid
- **Creating Settings window in setupIpcHandlers():** Main process window creation must be in app.whenReady() context; IPC handlers register callbacks, not create windows.
- **Storing API keys in plaintext without warning:** CONTEXT.md defers keychain to v2; document that plaintext storage is current limitation.
- **Not calling reinitializeTTS() after TTS settings change:** TTS provider swap requires explicit reinit; silent failure leads to stale provider.
- **Mixing electron-store with environment variables for settings:** Choose one source of truth; CONTEXT.md says plaintext in store (not .env for user-changeable settings).
- **Blocking renderer on TTS reinit failure:** Make reinit async and non-blocking; if it fails, log warning but don't block Settings save.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window persistence (hide/reshow) | Custom window lifecycle tracking | BrowserWindow native lifecycle (close event) + null tracking | Electron handles window state; tracking adds complexity. |
| Persistent config across app restarts | JSON file read/write | electron-store | Handles file I/O, race conditions, validation. Already integrated. |
| Hotkey registration/change | Custom globalShortcut wrapper | Existing `changeHotkey()` / `changePttHotkey()` + globalShortcut | Already battle-tested in Phase 13+. |
| TTS provider abstraction | Inline if/else for murf vs elevenlabs | `createTTSProvider()` factory + TTSProvider interface | Extensible, testable, follows inversion of control. |
| IPC request/response | Custom event emitter | ipcMain.handle() / ipcRenderer.invoke() | Electron's native pattern; promise-based, typed. |
| Multi-page build system | Custom Vite plugin | electron-vite with multiple rollupOptions.input entries | Vite handles module resolution, splitting, HMR. |

**Key insight:** Settings window is a thin UI layer around existing persistence/hotkey/TTS patterns. Don't duplicate logic; extend store.ts, IPC handlers, and voiceHandler lifecycle.

## Common Pitfalls

### Pitfall 1: Settings Window Blocks Orb If Modal
**What goes wrong:** If Settings is modal (`parent: mainWindow`), user cannot interact with orb while settings open — jarring UX.
**Why it happens:** Modal BrowserWindow focuses parent and disables interaction until child closes.
**How to avoid:** Test on all platforms; consider non-modal (independent window) if UX feedback suggests blocking is annoying.
**Warning signs:** User complaints about "can't use JARVIS while settings open"; test with independent window if seen.

### Pitfall 2: Hotkey Recording Captures Browser Shortcuts
**What goes wrong:** User presses Cmd+W to record, browser interprets it as close-tab instead of capturing the key.
**Why it happens:** Electron renderer still respects browser default shortcuts; need `e.preventDefault()` at document level.
**How to avoid:** Ensure `onKeyDown` handler has `stopPropagation()` + `preventDefault()`; test with Cmd+Q, Ctrl+W, Alt+F4 to verify they don't trigger browser behavior.
**Warning signs:** Settings window closes when user tries to record certain keys.

### Pitfall 3: TTS Provider Swap Fails Silently
**What goes wrong:** User saves new TTS provider, but old provider is still used because reinitializeTTS() throws and error is swallowed.
**Why it happens:** Async error handling in IPC handler might not propagate correctly; TTS module-scope state not updated.
**How to avoid:** Log all errors from `reinitializeTTS()`, return success/failure to renderer, display error toast. Test with invalid API key to verify fallback.
**Warning signs:** User changes TTS provider, but voice still sounds the same; check logs for silent errors.

### Pitfall 4: electron-store Serialization Failure
**What goes wrong:** API key contains Unicode/special chars, store.set() fails silently, previous value persists.
**Why it happens:** electron-store uses JSON serialization; some strings may fail to serialize.
**How to avoid:** Validate API key format before storing; trim whitespace; test with keys containing Unicode (non-ASCII).
**Warning signs:** User pastes API key, clicks Save, but key doesn't change; check store.json file directly to debug.

### Pitfall 5: Whisper Model Override Not Respected on App Restart
**What goes wrong:** User selects `large` model override, closes Settings, restarts app, but app uses `base` (auto-detected).
**Why it happens:** init.ts reads model from auto-detect before checking store override; wrong order of operations.
**How to avoid:** In index.ts, after `detectVramAndSelectModel()`, check `getWhisperModelOverride()` and override if not `'auto'`.
**Warning signs:** Override setting doesn't persist across restart; test with SET-04 requirement.

## Code Examples

Verified patterns from existing codebase:

### Settings IPC Channel Definition
```typescript
// shared/ipc-types.ts

export const IPC_CHANNELS = {
  // ... existing channels ...
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  // For hotkey recording (one-off key capture)
  HOTKEY_RECORD_START: 'hotkey:record-start',
  HOTKEY_RECORD_END: 'hotkey:record-end',
} as const;

export interface SettingsApi {
  get: () => Promise<SettingsData>;
  save: (data: SaveSettingsRequest) => Promise<{ success: boolean; error?: string }>;
}

export interface JarvisAPI {
  // ... existing API ...
  settings?: SettingsApi; // Optional: only exposed to Settings window
}
```

Source: Pattern from apps/desktop/src/shared/ipc-types.ts:103-117

### Vite Multi-Page Configuration
```typescript
// electron.vite.config.ts — renderer section modification

renderer: {
  root: 'src/renderer',
  envDir: path.resolve(__dirname),
  plugins: [
    react(),
    tailwindcss(),
    ortWasmPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/renderer/index.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html'),  // NEW
      },
    },
  },
}
```

Source: Extends apps/desktop/electron.vite.config.ts:139-145

### Settings Window HTML Entry
```html
<!-- src/renderer/settings.html -->
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JARVIS Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/settings.tsx"></script>
  </body>
</html>
```

Source: Pattern mirrors apps/desktop/src/renderer/index.html

### Settings React Entry Point
```typescript
// src/renderer/src/settings.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import SettingsForm from './settings/SettingsForm';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsForm />
  </React.StrictMode>,
);
```

### Store Extension for Settings
```typescript
// main/store.ts — complete updated version

export interface StoreSchema {
  hotkey?: HotkeyConfig;
  pttHotkey?: HotkeyConfig;
  wakeWordPaused?: boolean;
  orbPosition?: { x: number; y: number };
  ttsProvider?: { name: 'murf' | 'elevenlabs' };
  ttsApiKey?: { key: string };
  whisperModelOverride?: { model: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' };
}

const store = new Store<StoreSchema>();

// ... existing accessors ...

// NEW: TTS settings
export function getTtsProvider(): 'murf' | 'elevenlabs' {
  return store.get('ttsProvider')?.name ?? 'elevenlabs';
}

export function setTtsProvider(name: 'murf' | 'elevenlabs'): void {
  store.set('ttsProvider', { name });
}

export function getTtsApiKey(): string {
  return store.get('ttsApiKey')?.key ?? '';
}

export function setTtsApiKey(key: string): void {
  store.set('ttsApiKey', { key });
}

export function getWhisperModelOverride(): 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' {
  return store.get('whisperModelOverride')?.model ?? 'auto';
}

export function setWhisperModelOverride(model: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'): void {
  store.set('whisperModelOverride', { model });
}

export default store;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hotkey config only in tray radio menu | Tray + Settings window dedicated UI | Phase 34 | Users can configure without opening tray repeatedly |
| .env file manual edit for TTS provider | Settings window UI + electron-store | Phase 34 | Non-technical users can change provider without restart |
| VRAM auto-detect always | VRAM auto-detect + user override option | Phase 34 | Users with slow/fast hardware can optimize model selection |
| TTS provider change requires app restart | Live TTS reinitialization without restart | Phase 34 | Settings changes apply immediately |

**Deprecated/outdated:**
- Manual .env editing for hotkeys (Phase 34): Settings window replaces tray radio menu for PTT hotkey
- LM Studio URL in .env (deferred to SET-06 v2): Currently not user-configurable

## Open Questions

1. **Settings Window Parent/Modal Behavior**
   - What we know: CONTEXT.md doesn't specify modal vs. independent; Phase 33 patterns suggest independent windows work well
   - What's unclear: Should Settings block orb interaction (modal behavior)?
   - Recommendation: Implement as independent window; test UX on all platforms; switch to modal if users report confusion

2. **Hotkey Recording Interaction Model**
   - What we know: CONTEXT.md says readonly input + Record button
   - What's unclear: Should recording timeout if user takes >5s? What happens if they cancel mid-record?
   - Recommendation: No timeout; ESC to cancel; show "Recording... (ESC to cancel)" feedback

3. **TTS Provider Fallback After Reinit Failure**
   - What we know: reinitializeTTS() is non-blocking; failure logs warning
   - What's unclear: If reinit fails, should we fall back to previous provider or user-requested one?
   - Recommendation: Fall back to previous (stable) provider; log error; show error toast; retry on next setting change

4. **Whisper Model Selection UI Complexity**
   - What we know: User selects one of 5 models + "auto"; auto prevails on next restart if override not explicitly set
   - What's unclear: Should UI explain which model is currently active (auto-detected vs. override)? Show memory estimates?
   - Recommendation: Show current auto-detected model when override is "auto"; show memory estimate (e.g., "base: 140MB") for each option

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | ✓ | 22 LTS | — |
| npm/pnpm | Dependency management | ✓ | — | — |
| Electron | Desktop framework | ✓ (bundled) | 41.1.1 | — |
| electron-store | Config persistence | ✓ (dependency) | 11.0.2 | — |
| React | Renderer | ✓ (dependency) | 19.2.4 | — |
| Tailwind CSS | Styling | ✓ (dependency) | 4.0.0 | — |

**Missing dependencies with no fallback:** None — full stack already installed.

**Missing dependencies with fallback:** None — full stack covers Settings window requirements.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 |
| Config file | apps/desktop/vitest.config.ts |
| Quick run command | `npm test -- src/main/ipc/__tests__/settings.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SET-01 | Settings window opens via tray menu item | integration | `npm test -- src/main/__tests__/tray.test.ts` | ❌ Wave 0 (tray.test.ts needs Settings handler test) |
| SET-02 | PTT hotkey form saves, persists after restart | unit + integration | `npm test -- src/main/ipc/__tests__/settings.test.ts::test-save-ptt-hotkey` | ❌ Wave 0 (new file: settings IPC tests) |
| SET-03 | TTS provider + API key form saves, reinitializes immediately | unit + integration | `npm test -- src/main/ipc/__tests__/settings.test.ts::test-save-tts-settings` | ❌ Wave 0 |
| SET-04 | Whisper model override persists, checked on app start | unit | `npm test -- src/main/__tests__/store.test.ts::test-whisper-model-override` | ❌ Wave 0 (store.test.ts needs override tests) |
| SET-05 | All settings persist via electron-store across sessions | unit | `npm test -- src/main/ipc/__tests__/settings.test.ts::test-settings-round-trip` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- src/main/ipc/__tests__/settings.test.ts` (Settings IPC handlers)
- **Per wave merge:** `npm test` (full test suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/main/ipc/__tests__/settings.test.ts` — covers SET-01 (tray integration), SET-02 (PTT hotkey), SET-03 (TTS), SET-05 (persistence)
- [ ] `src/main/__tests__/store.test.ts` — covers new store fields (TTS provider, API key, Whisper override); extends existing store tests
- [ ] `src/main/__tests__/tray.test.ts` extension — verify "Settings" menu item opens window (SET-01)
- [ ] `src/renderer/src/settings/__tests__/HotkeyRecorder.test.tsx` — keyDown event capture + accelerator format
- [ ] `src/renderer/src/settings/__tests__/SettingsForm.test.tsx` — form rendering, field population from IPC.get(), Save button handler
- [ ] No additional framework installation needed — vitest already configured

## Sources

### Primary (HIGH confidence)
- **electron-store documentation** — persistence patterns, schema validation (PyPI/npm verified 11.0.2)
- **Electron API docs** — BrowserWindow lifecycle, ipcMain.handle/invoke, globalShortcut (official reference)
- **Project codebase Phase 33:** apps/desktop/src/main/index.ts (BrowserWindow creation pattern verified in production)
- **Project codebase Phase 13+:** apps/desktop/src/main/hotkey.ts, ptt-hotkey.ts (globalShortcut integration verified)
- **Project codebase Phase 30:** apps/desktop/src/main/voiceInput/voiceHandler.ts (TTS provider pattern verified)
- **CONTEXT.md decisions:** Settings window architecture, form UX, data model (user-locked choices)

### Secondary (MEDIUM confidence)
- **electron-vite docs:** Multi-page configuration (verified against apps/desktop/electron.vite.config.ts structure)
- **Electron security patterns:** contextIsolation + preload (Phase 13 DESK-01 established; Phase 33 verified cross-platform)

### Tertiary (LOW confidence, not used)
- None; all research grounded in project code or official Electron/npm docs.

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All dependencies already installed; versions current as of 2026-04-16
- **Architecture:** HIGH — Patterns directly from Phase 33 (BrowserWindow) and Phase 13+ (IPC, hotkey, store)
- **Pitfalls:** MEDIUM-HIGH — Pitfalls identified from similar phases (window lifecycle, IPC error handling); Pitfall 2 (hotkey recording) and 3 (TTS reinit) are hypothesis-based (not yet encountered in project)
- **Environment:** HIGH — All tools present; no system dependencies required for Settings UI

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days; electron-store + Vite stable, but framework updates could affect multi-page setup)
