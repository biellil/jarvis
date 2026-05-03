---
phase: 50
slug: whisper-pre-download-ux
status: draft
shadcn_initialized: false
preset: manual (reuses Phase 48 @theme tokens)
design_system_reuse: true
phase_48_tokens: true
phase_49_layout: true
created: 2026-05-03
---

# Phase 50 — UI Design Contract

> Visual and interaction contract for Whisper model pre-download UX: immediate download on model select, progress feedback, cache-hit detection, error handling. Reuses all tokens, primitives, and layout from Phases 48–49. All decisions traced to `50-CONTEXT.md` (D-01..D-16) unless marked otherwise.

---

## Design System Reuse

**This phase DOES NOT declare new tokens or primitives.** All color, typography, spacing, and component visuals are inherited from Phases 48–49.

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui (Phase 48) | Phase 48 UI-SPEC |
| Preset | manual — Tailwind v4 @theme in globals.css | Phase 48 UI-SPEC |
| Component library | Radix UI (Phase 48) | Phase 48 UI-SPEC |
| Icon library | lucide-react | Phase 48 UI-SPEC |
| Font | Inter | Phase 48 UI-SPEC |
| Tokens | All from Phase 48 (@theme block) | Phase 48 UI-SPEC Spacing/Color/Typography sections |
| Layout | Sidebar + content panel from Phase 49 | Phase 49 UI-SPEC |
| Primitives reused | Button, Select, Field, Progress, Label | Phase 48 Component Inventory |

**Do not redeclare spacing scale, color tokens, typography, or layout rules.** Reference Phase 48 and Phase 49 UI-SPECs.

---

## Modified Component: WhisperSection

WhisperSection in `apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx` is extended with download progress flow, error handling, and ready state indicator.

### Container Layout

```
┌──────────────────────────────────────────┐
│ Speech-to-Text Model                     │
│ Choose the speech-to-text model.         │
│                                          │
│ [Field.Label: "Model"]                   │
│ [Select dropdown — disabled during dl]   │
│                                          │
│ [Progress bar — appears during download] │
│ [Helper text or Error text]              │
│ [Try again button — on error only]       │
└──────────────────────────────────────────┘
```

**Spacing (Phase 48 tokens):**
- Space between Field.Label and Select: `xs` (4px) — inherited from Field wrapper
- Space between Select and Progress bar: `md` (12px) — `mt-md` on Progress container
- Space between Progress and helper/error text: `xs` (4px) — inherited from Field layout
- Space between error text and Try again button: `sm` (8px) — horizontal `gap-sm` in button row

### Progress Bar Display

**Trigger:** Appears immediately when download starts (`status: 'downloading'`). Hidden when idle.

**Variants & States:**

| State | Visual | Duration | Trigger |
|-------|--------|----------|---------|
| **Downloading** | `Progress variant="linear"` (Phase 48), determinate, filled track: `accent` (`cyan-500`), background track: `surface`, height: 4px (`sm` size, Phase 48), radius: `--radius-full` | Continuous (% updates as bytes arrive) | Model selection → download initiated |
| **Success** | Indicator color `accent` → transitions to `success` (`emerald-500`) over 400ms; check icon appears right of bar (lucide-react `Check`, 16px, `success` color) | Holds green for 1.5s, then fades out over 200ms | Download completes (100%) |
| **Error** | Indicator color `destructive` (`rose-500`); status text below in `destructive` color | Persists on-screen until retry or model change | Download fails (network/disk error) |

**Determinate Progress Calculation:**

Formula: `percent = Math.round((downloadedBytes / totalBytes) * 100)`

**Progress Text Below Progress Bar:**

Font: `text-xs` (Phase 48), color: `fg-subtle` (Phase 48 `rgba(255,255,255,0.50)`)

Format when downloading:
```
Downloading {modelLabel}… {N}% ({downloaded} / {total} MB)
```

Examples:
- `Downloading Base… 42% (60 / 142 MB)`
- `Downloading Large v3 Turbo… 89% (424 / 476 MB)`

**Sizes (fallback when content-length not available yet):**
- `Tiny`: ~75 MB
- `Base`: ~142 MB
- `Small`: ~142 MB (mapped to Base)
- `Medium`: ~1500 MB
- `Large v3 Turbo`: ~476 MB

### Select Control State Contract

| State | Visual | Behavior | Phase 48 Ref |
|-------|--------|----------|-------------|
| **Idle (no download)** | enabled, normal appearance | clickable, `onChange` triggers download IPC | Select default state |
| **Downloading** | disabled (opacity inherited from Phase 48 disabled state) | not clickable, `cursor: not-allowed`, visual feedback matches Phase 48 Input disabled state | Phase 48 Input disabled state pattern |
| **Error persists** | enabled | clickable again; selecting same or different model re-triggers download IPC (abandons previous attempt) | Select default state |
| **Success resolves** | enabled | clickable again (user can select another model for subsequent download) | Select default state |

**Interaction:** On Select `onChange`, immediately:
1. Dispatch IPC: `window.whisper.downloadModel(modelOption)`
2. Set local state: `{ status: 'downloading', percent: 0, ... }`
3. Disable Select
4. Show Progress bar

**Selection during download:** Selecting a different model while download is in-flight:
- Cancels the previous request (main process drops the in-flight promise)
- Frees temporary file (via `req.destroy()` on HTTP, main-side)
- Immediately starts new download for selected model

### Field.Helper & Field.Error Precedence

From Phase 48: **Error takes precedence over Helper.** When error is present, Helper is hidden.

**Helper text (idle or success state):**

Content:
- If `auto` mode: `"Auto: model selected based on available VRAM"`
- If manual mode: `"Manual: {modelName}"` (e.g., `"Manual: Base"`)
- During success (1.5s indicator green): Helper updates to `"Model: {modelName} (ready)"`

Font: `text-xs` (Phase 48), color: `fg-subtle` (Phase 48)

**Error text (on download failure — D-13):**

Displayed in `Field.Error` slot (renders as `text-xs destructive` with error icon, Phase 48).

Content: Short, user-actionable message:
```
Couldn't download. Check your connection and try again.
```

This message is intentionally generic — technical details are moved to Toast (see Toast contract below).

### Try Again Button

**Trigger:** Appears only when `status: 'error'`.

**Visual (Phase 48 Button secondary variant — D-14):**
```tsx
<Button variant="ghost" size="sm">Try again</Button>
```

Properties (Phase 48 Ghost variant):
- Background: transparent (default) → `white/5` (hover)
- Text: `fg-muted` (default) → `fg` (hover)
- Font: `text-sm font-medium` (Phase 48)
- Padding: `px-md py-sm` (Phase 48 sm size)
- Border: none (ghost variant)
- Height: 28px (sm size, Phase 48)
- Focus-visible: `accent-ring` 2px offset 2px (Phase 48)

**Placement:** Right-aligned relative to error text, with `gap-sm` (8px) space.

Layout (flexbox row):
```
[Field.Error text] _____ [Try again button]
```

**On click:** Re-dispatches IPC for same model: `window.whisper.downloadModel(currentModel)`.

---

## Download State Machine (Visual Flow)

```
┌─────────┐
│  IDLE   │  Initial state
└────┬────┘
     │ Model selected
     ▼
┌──────────────────────────────────┐
│ CHECK CACHE                      │  Backend checks isWhisperModelCached()
└──────┬──────────────┬────────────┘
       │              │
       │ cached=YES   │ cached=NO
       ▼              ▼
    APPLY        DOWNLOADING
    (instant)    [Progress 0%→100%]
       │              │
       │              │ Success
       │              ▼
       │         ┌─────────────┐
       │         │ SHOW GREEN  │  Success indicator (1.5s)
       │         │ MODEL READY │
       │         └─────────────┘
       │              │
       │              ▼
       └─────► READY (helper shows "ready")
              [Select enabled, can change]

       ┌─────────────┐
       │ DOWNLOADING │
       │   [0%...]   │
       └─────┬───────┘
             │ Network/disk error
             ▼
          ERROR
     [Field.Error + Toast]
          [Try again]
             │
             └──► DOWNLOADING (retry)
```

---

## Visual Feedback: Downloading Progress

**Progress bar (linear, Phase 48 variant):**

| Element | Spec | Phase 48 Ref |
|---------|------|-------------|
| Container | padding: `py-sm px-md` (12px v, 16px h), gap-xs (4px) between bar and text | Phase 48 Field spacing |
| Track | height 4px, bg `surface`, radius `--radius-full` | Phase 48 Progress sm size |
| Indicator (fill) | bg `accent` (`cyan-500`), radius `--radius-full`, width `{percent}%`, transition `width var(--duration-base) var(--ease-standard)` | Phase 48 Progress animation |
| Percentage text | `text-xs fg-subtle` (right-aligned or right of bar) | Phase 48 body/helper |

Example CSS:
```css
.progress-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-md);
}

.progress-bar {
  height: 4px;
  background: var(--color-surface);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-accent);
  width: var(--percent);
  transition: width var(--duration-base) var(--ease-standard);
}

.progress-text {
  font-size: var(--text-xs);
  color: var(--color-fg-subtle);
}
```

---

## Visual Feedback: Success State (1.5s Indicator)

**Trigger:** Download completes (100%, `status: 'success'`).

**Visual sequence:**

1. **At completion (t=0):** Progress bar fill color transitions `accent` → `success` over 400ms (cubic-bezier from Phase 48)
2. **Green check icon (t=0..1500ms):** Lucide `Check` icon (16px) appears right of progress bar
   - Color: `success` (`emerald-500`)
   - Fade-in: 200ms (inherit Phase 48 duration-fast)
3. **Helper text update:** "Model: {name} (ready)" replaces previous helper
   - Font: `text-xs fg-subtle` (same as normal helper, but content changes)
4. **Fade out (t=1500ms):** Progress bar and check icon fade out over 200ms
5. **Final state (t=1700ms):** Progress bar/icon removed from DOM

**No explicit success toast** — visual indicator + helper text provides sufficient feedback. (Cache-hit events show a separate Toast — see Toast contract below.)

---

## Toast Notifications

Two separate Toast scenarios (using existing Toast.tsx component in `apps/desktop/src/renderer/src/components/`):

### 1. Cache Hit Toast (on cache detection)

**Trigger:** `window.whisper.downloadModel(model)` executed → main detects `isWhisperModelCached(model) === true` → backend emits `whisper:download-progress` with `status: 'success'` immediately.

**Toast appearance:**
```
✓ Model already cached
  (Auto-dismiss: 2000ms)
```

**Properties (inherit from existing Toast.tsx styling):**
- Severity: `success` (green background)
- Icon: lucide-react `Check` (16px)
- Duration: 2000ms auto-close
- Position: top-right or bottom-right (match current Toast positioning)

**Voice:** Informational, not critical.

### 2. Error Toast (detailed error message)

**Trigger:** Download fails → main emits `whisper:download-progress` with `status: 'error'` + `errorMessage`.

**Toast appearance:**
```
⚠ Download failed: HTTP 503

(or)

⚠ Download failed: ENOSPC: not enough disk space
```

**Properties:**
- Severity: `error` (red background)
- Icon: lucide-react `AlertCircle` (16px)
- Duration: 4000ms auto-close (longer than success, giving time to read)
- Action: none (Try again button is in Field, not Toast)
- Content: Technical detail from backend error message

**Voice rules (inherited from Phase 48):**
- Never apologize
- State the problem + hint at solution
- Numbers as digits
- No ALL CAPS or exclamation marks

Example messages:
```
Download failed: Network timeout. Check your connection and retry.
Download failed: ENOSPC: not enough disk space for base model (142 MB needed).
Download failed: HTTP 503: Model server temporarily unavailable.
```

---

## Copywriting Contract

### Download Progress Text

**Format:** `Downloading {modelLabel}… {N}% ({downloadedBytes} / {totalBytes} MB)`

**Model labels** (match WHISPER_OPTIONS in WhisperSection.tsx):
- `auto` → `Auto`
- `tiny` → `Tiny`
- `base` → `Base`
- `small` → `Small`
- `medium` → `Medium`
- `large-v3-turbo` → `Large v3 Turbo`

**Examples:**
- `Downloading Tiny… 15% (11 / 75 MB)`
- `Downloading Base… 100% (142 / 142 MB)` (right before green success state)
- `Downloading Large v3 Turbo… 67% (319 / 476 MB)`

### Success State Copy

**Helper text update:**
```
Model: {name} (ready)
```

Examples:
- `Model: Base (ready)`
- `Model: Large v3 Turbo (ready)`

**Cache-hit Toast:**
```
Model already cached
```

(Short, past-tense acknowledging the model was previously downloaded.)

### Error State Copy

**Field.Error text (short, user-actionable):**
```
Couldn't download. Check your connection and try again.
```

(Generic — applies to network timeout, 5xx errors, disk space, etc.)

**Toast text (detailed, technical):**

Pattern: `Download failed: {specific error}. {hint or unit.}`

Examples (D-13, from backend error analysis):

| Error Type | Toast Copy |
|------------|-----------|
| Network timeout | `Download failed: Network timeout. Check your connection and retry.` |
| DNS failure | `Download failed: Cannot reach model server. Check your internet connection.` |
| HTTP 5xx | `Download failed: Server error (HTTP 503). Try again in a few moments.` |
| ENOSPC (disk full) | `Download failed: Not enough disk space. Free 142 MB and retry.` |
| EACCES (permission) | `Download failed: Permission denied. Check write access to model directory.` |
| Connection reset | `Download failed: Connection lost. Verify your network and retry.` |

**Voice rules (Phase 48 inherited):**
- Sentence case (not Title Case for error messages)
- Active voice, verb-first where possible
- Problem statement, no apologies
- Numbers as digits (e.g., `142 MB`, not `one hundred forty-two megabytes`)
- No ALL CAPS except for error codes (HTTP 503)
- No exclamation marks

### Interaction Copy

| Element | Copy | Context |
|---------|------|---------|
| Try again button | `Try again` | Ghost button in error state row |
| Helper: auto mode | `Auto: model selected based on available VRAM` | Inherited from Phase 49 |
| Helper: manual mode | `Manual: {modelName}` | Inherited from Phase 49 |
| Helper: success state | `Model: {name} (ready)` | Shows after 1.5s green indicator |

---

## IPC Contract (Renderer ↔ Main Process)

**D-09, D-10 reference:** Frontend-to-backend communication.

### Outbound: Renderer → Main

**Channel:** `window.whisper.downloadModel(option: WhisperModelOption)`

**Type signature:**
```typescript
window.whisper.downloadModel(option: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'): Promise<void>
```

**Behavior:**
- Renderer calls immediately on Select `onChange`
- Main process initiates download via `ensureWhisperModel(resolvedModel, onProgress?)`
- No return value used by renderer (fire-and-forget)

### Inbound: Main → Renderer

**Channel:** `whisper:download-progress`

**Payload structure:**
```typescript
{
  model: string;                    // e.g. "base", "medium", "large"
  status: 'downloading' | 'success' | 'error';
  percent: number;                  // 0–100
  downloadedBytes: number;          // bytes received so far
  totalBytes: number;               // total model size in bytes
  errorMessage?: string;            // present only if status === 'error'
}
```

**Example payloads:**

```json
// Downloading in progress
{
  "model": "base",
  "status": "downloading",
  "percent": 42,
  "downloadedBytes": 59604992,
  "totalBytes": 141817344
}

// Download complete (cache-hit)
{
  "model": "tiny",
  "status": "success",
  "percent": 100,
  "downloadedBytes": 78643200,
  "totalBytes": 78643200
}

// Download error
{
  "model": "medium",
  "status": "error",
  "percent": 0,
  "downloadedBytes": 0,
  "totalBytes": 1572864000,
  "errorMessage": "ENOSPC: not enough space on device"
}
```

**Listening (React side):**

```typescript
useEffect(() => {
  const unsubscribe = window.ipcRenderer.on('whisper:download-progress', (payload) => {
    setDownloadState(payload);
    // Update progress bar, show/hide errors, etc.
  });
  return () => unsubscribe();
}, []);
```

---

## Selection Interaction Flow

### User selects new model (D-01)

1. **Renderer:** User clicks Select, chooses option (e.g., "Base")
2. **Renderer:** Select `onChange` fires → `onWhisperModelChange('base')`
3. **Renderer:** Immediately call `window.whisper.downloadModel('base')`
4. **Renderer:** Set local state: `downloadState = { status: 'downloading', percent: 0, ... }`
5. **Main:** Receive IPC, resolve `'base'` (no mapping needed for manual selection)
6. **Main:** Check `isWhisperModelCached('base')`:
   - **If YES:** Immediately emit `whisper:download-progress { status: 'success' }`
   - **If NO:** Start HTTP download, emit progress events

### User selects "Auto" (D-03, D-12)

1. **Renderer:** User selects "Auto (by VRAM)"
2. **Renderer:** Call `window.whisper.downloadModel('auto')`
3. **Main:** Receive IPC, detect VRAM, resolve to concrete model (e.g., "base")
4. **Main:** Check `isWhisperModelCached('base')`:
   - **If YES:** Emit `success` immediately
   - **If NO:** Download "base"

**Helper text during auto resolution:** Remains `"Auto: model selected based on available VRAM"` during and after download (does not change to "Manual: base" — VRAM choice is transparent to user).

### User changes model during download (D-04)

1. **Renderer:** Download of "Base" in progress (progress bar at 45%)
2. **Renderer:** User selects "Medium"
3. **Renderer:** Call `window.whisper.downloadModel('medium')`
4. **Main:** Drop previous Base download promise (HTTP `req.destroy()`), clean tmp file
5. **Main:** Start Medium download immediately
6. **Renderer:** Progress bar resets, follows Medium download to completion

---

## Disabled Select During Download

**Visual contract (Phase 48 Input disabled reference):**

| Property | Value |
|----------|-------|
| Opacity | `disabled opacity inherited from Phase 48` (typically 0.5 or via color desaturation) |
| Cursor | `not-allowed` |
| Pointer events | `none` (not clickable) |
| Border | `white/5` (desaturated, Phase 48 disabled state) |
| Text | `fg-disabled` (Phase 48) |
| Background | `surface/50` (Phase 48 disabled opacity) |

The Select becomes visually inert during download, preventing concurrent requests.

---

## Component API: WhisperSection props (D-12 reference)

**Current props (Phase 49):**
```typescript
type Props = Pick<SettingsSectionProps, 'whisperModel' | 'onWhisperModelChange'>;
```

**Extended for Phase 50:**

```typescript
interface WhisperDownloadState {
  status: 'downloading' | 'success' | 'error';
  percent: number;           // 0–100
  downloadedBytes: number;
  totalBytes: number;
  errorMessage?: string;     // present only if status === 'error'
}

type Props = Pick<SettingsSectionProps, 'whisperModel' | 'onWhisperModelChange'> & {
  downloadState?: WhisperDownloadState | null;  // null = no download in progress
  onTryAgain?: () => void;                        // callback when user clicks Try again
};
```

**SettingsLayout responsibility (integration point D-12):**

SettingsLayout:
1. Maintains `downloadState` React state (listen to IPC `whisper:download-progress`)
2. Passes `downloadState` and `onTryAgain` to WhisperSection
3. `onTryAgain` re-dispatches IPC for current `whisperModel`

---

## Out of Scope for Phase 50

| Feature | Reason |
|---------|--------|
| Explicit Cancel button | Download is fire-and-forget; selecting another model implicitly cancels (D-04, D-21). Deferred ideas. |
| Download in background | Model used on next transcription; no background pre-download before settings open. |
| Disk space check before download | Deferred. Backend could add `ensureCapacity()` check, but not exposed to UI. |
| Download resume / checkpoint | Always restart from zero on retry. Deferred. |
| Model cleanup / delete UI | Out of scope. Deferred. |
| Speed (MB/s) and ETA display | Would clutter UI. Deferred. |
| Checksum / integrity verification | Silent validation only. Deferred. |
| Multiple concurrent downloads | Not supported. Fire-and-forget per model. |

---

## File Structure Reference (Phase 50 executor)

**Modified file:**
```
apps/desktop/src/renderer/src/settings/sections/
└── WhisperSection.tsx         (extended with download UX)
```

**Updated file (integration):**
```
apps/desktop/src/renderer/src/settings/
└── SettingsLayout.tsx         (add downloadState, IPC listener, onTryAgain handler)
```

**Backend changes (reference, not owned by executor):**
```
apps/desktop/src/main/
├── voiceInput/whisperResources.ts    (modify ensureWhisperModel signature + add onProgress callback)
├── voiceInput/voiceHandler.ts        (add setActiveWhisperModel function)
└── ipc/settings.ts                   (add handler for whisper:download-model)

apps/desktop/src/shared/
└── ipc-types.ts                      (add IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL, WHISPER_DOWNLOAD_PROGRESS)
```

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
