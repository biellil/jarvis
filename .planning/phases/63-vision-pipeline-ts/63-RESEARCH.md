# Phase 63: Vision Pipeline TS - Research

**Researched:** 2026-05-07
**Domain:** Electron desktopCapturer, sharp native addon, LangChain multimodal messages, IPC patterns
**Confidence:** HIGH

## Summary

Phase 63 adds vision capability to the JARVIS TypeScript stack via three entry points: (1) a LangGraph `analyze_screen` tool that captures the screen from main process and returns the image to the LLM, (2) clipboard paste/drag image support in the chat renderer, and (3) a configurable `screenshotHotkey` global shortcut.

The codebase has all the prerequisite architecture in place. `sharp` is already installed in both `apps/desktop/package.json` (devDependencies, `^0.34.5`) and `apps/backend-ts/package.json` (dependencies, `^0.34.5`). The `ptt-hotkey.ts` module provides the exact `globalShortcut` registration pattern to follow. The `ipc-types.ts` file has a clean channel enum that needs two new entries. The `capabilities.ts` file already has a `vision` boolean per-provider that the tool must check before proceeding.

The primary non-obvious risk is the `analyze_screen` tool's execution model: LangGraph tools run in the Node.js backend process, not in Electron main. The tool cannot directly call `desktopCapturer` — it must call back through Electron IPC over the existing backend-to-Electron HTTP+SSE bridge. This means `analyze_screen` needs a different transport than the other PC tools (which use `responseFormat: 'content_and_artifact'` and return payloads for the Electron action executor). The screen capture tool must actually return the image content as the tool observation so the LLM can use it immediately in the next ReAct step.

**Primary recommendation:** Use the existing `request_file_action` tool's IPC-round-trip pattern for `analyze_screen` — the backend tool calls Electron IPC, waits for the response, and returns the image as the tool's content string (base64 data URL), enabling the LLM to see it immediately.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `desktopCapturer.getSources()` in main process → PNG → `sharp` resize max 1920×1080 → JPEG 80% → base64
- **D-02:** Active LLM provider used for vision; error if `capabilities.vision === false` with message: "Este provider não suporta análise de imagens. Configure OpenAI, Anthropic ou Gemini nas Settings."
- **D-03:** New `analyze_screen` LangGraph tool in `chat-session.ts`; calls `CAPTURE_SCREEN` IPC channel; returns base64 JPEG as tool observation
- **D-04:** `POST /chat` and `GET /chat/stream` accept optional `imageBase64?: string`; `session.send()` extended; `HumanMessage` built with content array `[{type:'image_url',...}, {type:'text',...}]`
- **D-05:** Two new IPC channels: `CAPTURE_SCREEN` (returns `{base64: string}`), `CHAT_SEND_IMAGE` (renderer → main → backend with `{message, imageBase64}`)
- **D-06:** Chat textarea listens for `paste` event; reads image → ArrayBuffer → base64 → `pendingImage` state; thumbnail preview (max 80px, X to remove); sent via `CHAT_SEND_IMAGE`
- **D-07:** `screenshotHotkey` in electron-store (default `CmdOrCtrl+Shift+S`); registered via `globalShortcut`; on trigger: capture → send to renderer → focus chat window → populate `pendingImage`
- **D-08:** Transport format: `data:image/jpeg;base64,{data}` when sending to LLM
- **D-09:** No screenshot button in chat UI; three trigger paths only
- **D-10:** `sharp` externalized in `electron.vite.config.ts` MAIN_EXTERNALS; added to `electron-builder.yml` extraResources

### Claude's Discretion

- Error handling when `desktopCapturer` returns no sources (macOS permissions denied → user-friendly error)
- Timeout for screen capture IPC call (suggested: 5s)
- Gemini vision API format — verify LangChain handles uniformly
- Whether to show "Analyzing screen..." loading state in the chat orb

### Deferred Ideas (OUT OF SCOPE)

- Video recording or animated GIF capture
- Local vision model (LLaVA via LM Studio)
- OCR text extraction from screenshots
- Multiple monitor selection UI
- Annotating or drawing on screenshots before sending
</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sharp` | 0.34.5 (already installed) | Image resize + JPEG encode | Already in both desktop and backend-ts package.json; externalization pattern established |
| `@langchain/core` | ^1.1.45 | `HumanMessage` with content array | Already installed; provider-agnostic multimodal format |
| Electron `desktopCapturer` | built-in (Electron 41.1.1) | Screen capture to NativeImage | Only available in main process in Electron 20+ |
| Electron `globalShortcut` | built-in | Screenshot hotkey registration | Same API used by existing `ptt-hotkey.ts` |

### Notes on sharp already installed

`apps/desktop/package.json` lists `sharp: "^0.34.5"` under `devDependencies`. It is **already present** but NOT externalized yet — that is a gap to fill in Wave 0. `apps/backend-ts/package.json` lists `sharp: "^0.34.5"` under `dependencies` with `onlyBuiltDependencies: ["sharp"]` — backend can use it without Vite bundling concerns.

### Installation

No new npm installs required. `sharp` is already listed in both packages. The work is configuration: adding to `MAIN_EXTERNALS` in `electron.vite.config.ts` and adding `extraResources` entry in `electron-builder.yml`.

---

## Architecture Patterns

### Recommended Project Structure (new files)

```
apps/desktop/src/main/
├── ipc/
│   ├── chat.ts               (EXISTING — extend for CHAT_SEND_IMAGE)
│   └── capture.ts            (NEW — CAPTURE_SCREEN handler)
├── screenshot-hotkey.ts      (NEW — mirrors ptt-hotkey.ts exactly)
└── store.ts                  (EXISTING — add screenshotHotkey accessor)

apps/backend-ts/src/session/
├── chat-session.ts           (EXISTING — extend send() + add analyze_screen tool)
├── pc-tools.ts               (EXISTING — DO NOT add analyze_screen here)
└── vision-tool.ts            (NEW — createAnalyzeScreenTool factory)

apps/backend-ts/src/routes/
└── chat.ts                   (EXISTING — extend POST + GET stream for imageBase64)

apps/desktop/src/shared/
└── ipc-types.ts              (EXISTING — add CAPTURE_SCREEN, CHAT_SEND_IMAGE channels)

apps/desktop/src/renderer/src/
└── [ChatInput component]     (EXISTING — add paste handler + pendingImage state)
```

### Pattern 1: desktopCapturer in Main Process

`desktopCapturer.getSources()` MUST be called from the Electron main process in Electron 20+. In older versions it could be called from renderer; that was removed. The IPC handler pattern:

```typescript
// apps/desktop/src/main/ipc/capture.ts
import { ipcMain, desktopCapturer } from 'electron';
import sharp from 'sharp';
import { IPC_CHANNELS } from '../../shared/ipc-types';

ipcMain.handle(IPC_CHANNELS.CAPTURE_SCREEN, async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });

  if (sources.length === 0) {
    // macOS: screen recording permission denied
    return { success: false, error: 'PERMISSION_DENIED' };
  }

  // sources[0] is the primary screen (first in list)
  const pngBuffer = sources[0].thumbnail.toPNG();

  const jpegBuffer = await sharp(pngBuffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return {
    success: true,
    base64: jpegBuffer.toString('base64'),
  };
});
```

**NativeImage note:** `desktopCapturer.getSources()` with `thumbnailSize` returns a thumbnail `NativeImage` on the source object (`source.thumbnail`). The `thumbnailSize` is a hint — actual resolution may differ. Calling `toPNG()` on NativeImage returns a `Buffer`.

**Alternative without sharp:** `nativeImage.toJPEG(80)` on the NativeImage directly skips the resize step. BUT this only works if the display resolution is already ≤ 1920×1080. On HiDPI/Retina displays (2560×1600 etc.), the NativeImage will be larger. Sharp is needed to guarantee the max dimension constraint.

### Pattern 2: analyze_screen Tool (backend-ts)

The tool CANNOT use `responseFormat: 'content_and_artifact'` like the other PC tools, because those tools return a dispatch payload for the Electron action executor — and the LLM receives the tool observation without seeing the actual image. For vision, the LLM must see the base64 image data directly in the tool observation.

The tool makes an HTTP call back to an Electron IPC-exposed HTTP endpoint, OR more simply, it uses a callback/function reference injected at session creation (the same pattern as `clientIdRef` for `request_file_action`).

**Recommended approach — inject a `captureScreenFn` callback into ChatSession:**

```typescript
// apps/backend-ts/src/session/vision-tool.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export type CaptureScreenFn = () => Promise<{ base64: string } | { error: string }>;

export function createAnalyzeScreenTool(captureFn: CaptureScreenFn, hasVision: boolean) {
  return tool(
    async (_: Record<string, never>) => {
      if (!hasVision) {
        return 'Este provider não suporta análise de imagens. Configure OpenAI, Anthropic ou Gemini nas Settings.';
      }
      const result = await captureFn();
      if ('error' in result) {
        if (result.error === 'PERMISSION_DENIED') {
          return 'Não foi possível capturar a tela. Verifique as permissões de gravação de tela nas configurações do sistema.';
        }
        return `Erro ao capturar a tela: ${result.error}`;
      }
      // Return as data URL — the LLM's next message will include this via HumanMessage content array
      return `data:image/jpeg;base64,${result.base64}`;
    },
    {
      name: 'analyze_screen',
      description: 'Captures the user\'s screen and returns it for visual analysis. Use when the user asks what is on their screen, to analyze the screen content, or to help with something visible on screen.',
      schema: z.object({}),
    },
  );
}
```

**How the return value works:** When the agent calls `analyze_screen`, the tool returns the data URL string as the tool observation (ToolMessage content). The ReAct agent then feeds this back into the LLM. The LLM will have the image in context via the ToolMessage — **not** via a `HumanMessage` with content array. This is important: for tool-based flow, the image arrives as ToolMessage content. The LLM must process it from there.

**Limitation to document:** Most providers accept base64 images in `HumanMessage` content arrays (VISION-02 path) but ToolMessage image content support varies. OpenAI and Anthropic do support image content in tool results. Gemini via `@langchain/google-genai` also supports it. LangChain abstracts the provider-specific formats.

### Pattern 3: HumanMessage with Image Content (VISION-02 path)

```typescript
// apps/backend-ts/src/session/chat-session.ts — extend send()
import { HumanMessage } from '@langchain/core/messages';

async send(text: string, imageBase64?: string): Promise<string> {
  let humanMessage: HumanMessage;

  if (imageBase64) {
    // Build multimodal content array — LangChain handles OpenAI/Anthropic/Gemini format differences
    humanMessage = new HumanMessage({
      content: [
        {
          type: 'image_url',
          image_url: { url: imageBase64 }, // Must be full data URL: "data:image/jpeg;base64,..."
        },
        {
          type: 'text',
          text,
        },
      ],
    });
  } else {
    humanMessage = new HumanMessage(text);
  }

  this.history.push(humanMessage);
  // ... rest of send() unchanged
}
```

**LangChain cross-provider compatibility:**
- `@langchain/openai` (`ChatOpenAI`): accepts `type: 'image_url'` with `{url: 'data:image/jpeg;base64,...'}` — standard OpenAI format
- `@langchain/anthropic` (`ChatAnthropic`): LangChain **internally converts** `image_url` format to Anthropic's `source` format (`{type: 'base64', media_type: 'image/jpeg', data: '...'}`)
- `@langchain/google-genai` (`ChatGoogleGenerativeAI`): LangChain converts to Gemini's inline_data format

**Confidence:** HIGH — this is LangChain's documented multimodal abstraction. `HumanMessage` with `content` array is the cross-provider standard. LangChain core handles the serialization differences per provider. Verified by reading `@langchain/core: ^1.1.45` being installed.

### Pattern 4: globalShortcut for Screenshot Hotkey

Follows `ptt-hotkey.ts` exactly:

```typescript
// apps/desktop/src/main/screenshot-hotkey.ts
import { globalShortcut, BrowserWindow, desktopCapturer } from 'electron';
import { getScreenshotHotkey, setScreenshotHotkey } from './store';

let currentScreenshotHotkey: string | null = null;

export function registerScreenshotHotkey(mainWindow: BrowserWindow): boolean {
  const accelerator = getScreenshotHotkey(); // default: 'CmdOrCtrl+Shift+S'
  const success = globalShortcut.register(accelerator, async () => {
    // capture → process → send to renderer
    mainWindow.webContents.send('vision:screenshot-captured', { base64: '...' });
    mainWindow.show(); // focus chat window
    mainWindow.focus();
  });
  if (success) currentScreenshotHotkey = accelerator;
  return success;
}
```

**Key pattern from ptt-hotkey.ts:** Use module-scoped `let currentHotkey: string | null` to track the registered accelerator for `unregister` on change or app quit. `globalShortcut.unregisterAll()` on `app.on('will-quit')` in `main/index.ts`.

### Pattern 5: Store accessor for screenshotHotkey

Follows existing pattern in `store.ts`:

```typescript
// store.ts additions
const DEFAULT_SCREENSHOT_HOTKEY = 'CmdOrCtrl+Shift+S';

export interface StoreSchema {
  // ... existing fields ...
  screenshotHotkey?: { accelerator: string }; // same shape as pttHotkey
}

export function getScreenshotHotkey(): string {
  return store.get('screenshotHotkey')?.accelerator ?? DEFAULT_SCREENSHOT_HOTKEY;
}

export function setScreenshotHotkey(accelerator: string): void {
  store.set('screenshotHotkey', { accelerator });
}
```

### Anti-Patterns to Avoid

- **Calling `desktopCapturer` from renderer:** Removed in Electron 20. Only callable from main process. The `contextBridge` cannot expose it. Must use IPC.
- **Using `responseFormat: 'content_and_artifact'` for analyze_screen:** The other PC tools dispatch payloads to the Electron action executor — the image never reaches the LLM. For vision, the image must be the tool observation content directly.
- **Bundling sharp via Vite:** `sharp` is a native addon (`.node` file) — Rollup cannot bundle it. Must be in `MAIN_EXTERNALS` and `extraResources`.
- **Passing raw base64 without data URL prefix to LangChain:** `ChatAnthropic` and `ChatGoogleGenerativeAI` need the `data:image/jpeg;base64,` prefix to detect the MIME type correctly.
- **Adding `screenshotHotkey` to `SettingsData` without adding it to the `settings:get` handler:** The handler reads from store and assembles `SettingsData` — new fields must be added to both the interface and the handler.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-provider multimodal format | Manual Anthropic/OpenAI/Gemini format switching | `HumanMessage` content array via LangChain | LangChain @langchain/core handles format translation per provider |
| Image resize + JPEG encode | Custom canvas/buffer manipulation | `sharp` (already installed) | Handles HiDPI, EXIF rotation, and format conversion correctly |
| PNG → JPEG conversion | Manual Buffer manipulation | `sharp(pngBuffer).jpeg({quality:80}).toBuffer()` | One line, battle-tested |
| Screen capture | Any npm library | Electron `desktopCapturer` built-in | Only correct API for Electron; other screen capture libs require system binaries |
| Hotkey management | Custom key listener | `globalShortcut` (built-in) | OS-level interception works regardless of focus; existing pattern in `ptt-hotkey.ts` |

---

## Common Pitfalls

### Pitfall 1: `desktopCapturer` unavailable from renderer

**What goes wrong:** `import { desktopCapturer } from 'electron'` in renderer or preload throws `TypeError: Cannot destructure property 'desktopCapturer'` — it is undefined.
**Why it happens:** Electron removed renderer-process access to `desktopCapturer` in v20 (security hardening). The contextBridge cannot expose it.
**How to avoid:** All capture code must be in `apps/desktop/src/main/` — register an `ipcMain.handle(IPC_CHANNELS.CAPTURE_SCREEN, ...)` handler.
**Warning signs:** Build succeeds but runtime throws; or TypeScript types exist but the value is `undefined`.

### Pitfall 2: macOS Screen Recording Permission

**What goes wrong:** `desktopCapturer.getSources()` returns an empty array on macOS if the user hasn't granted Screen Recording permission to the app. No error is thrown — sources is just `[]`.
**Why it happens:** macOS Catalina+ requires explicit Screen Recording permission under System Settings → Privacy & Security.
**How to avoid:** Check `sources.length === 0` and return `{ success: false, error: 'PERMISSION_DENIED' }`. The IPC handler should distinguish this from other errors. Display a user-friendly message with instructions to open System Settings.
**Warning signs:** Always returns empty array on macOS. Never happens on Windows/Linux.

### Pitfall 3: sharp must be in MAIN_EXTERNALS (not bundled)

**What goes wrong:** Vite/Rollup tries to bundle sharp, fails with `Cannot find module 'sharp'` or `Error: The "path" argument must be of type string` at runtime, because sharp's prebuilt binaries (`.node` files) cannot be inlined.
**Why it happens:** `sharp` uses native Node addons. The same reason as `onnxruntime-node` and `@fugood/whisper.node`.
**How to avoid:** Add `'sharp'` to `MAIN_EXTERNALS` in `electron.vite.config.ts`. Add `extraResources` entry for sharp's platform-specific `.node` files in `electron-builder.yml`.
**Warning signs:** Build succeeds, but `app.asar` extraction shows sharp missing its `.node` binary. Runtime error: `Error loading shared library`.

**sharp extraResources pattern** (mirrors onnxruntime-node entry):
```yaml
extraResources:
  - from: "../../node_modules/sharp"
    to: "node_modules/sharp"
    filter:
      - "package.json"
      - "lib/**"
      - "build/Release/*.node"
```

**Note:** sharp uses `build/Release/sharp-*.node` path — differs from onnxruntime's `bin/napi-v3/...` path. Verify actual `.node` path in `node_modules/sharp/build/Release/` after install.

### Pitfall 4: analyze_screen tool return value format

**What goes wrong:** Tool returns `{type: 'image_url', image_url: {url: ...}}` object — but LangGraph expects tool return type to be a string (or `[string, artifact]` for `content_and_artifact`). The object gets serialized as `[object Object]`.
**Why it happens:** `tool()` from `@langchain/core/tools` expects string return unless `responseFormat: 'content_and_artifact'`.
**How to avoid:** Return the data URL as a plain string. The LLM receives it as ToolMessage content. For the image to be truly visual (parsed by vision API), LangChain's tool message handling passes base64 data URLs through to the vision API.
**Warning signs:** LLM says "I see the text 'data:image/jpeg;base64,...'" instead of describing the image.

### Pitfall 5: Image size exceeds provider limits

**What goes wrong:** A 1920×1080 JPEG at 80% quality is ~200-400KB. As base64 it becomes ~270-540KB. Some providers have per-message payload limits.
**Why it happens:** Base64 encoding adds ~33% overhead. A 4K source screen at 100% quality would be much larger.
**How to avoid:** The `sharp` resize to max 1920×1080 with `{fit: 'inside', withoutEnlargement: true}` combined with JPEG 80% keeps output manageable. OpenAI limit is 20MB per image URL, Anthropic is 5MB base64 — both well within bounds at 1920×1080 JPEG 80%.
**Warning signs:** 413 response from API or cryptic `image too large` error.

### Pitfall 6: capabilities.ts missing Gemini vision detection

**What goes wrong:** `capabilities.gemini` is not set in `detectCapabilities()` — Gemini is only added when `config.LLM_PROVIDER === 'gemini' || config.GEMINI_API_KEY`. If neither is set at startup but user switches via IPC, the capabilities object won't include Gemini.
**Why it happens:** `capabilities.ts` runs at startup; live provider switching (Phase 57) happens after. The `vision` check for `analyze_screen` must read current provider's capabilities — not startup snapshot.
**How to avoid:** The vision check in `createAnalyzeScreenTool` should receive the `hasVision` flag computed at call time from a live capabilities lookup (not cached at session creation). Or: use a `hasVisionRef` mutable reference (same pattern as `clientIdRef`).

### Pitfall 7: Paste event only fires for clipboard items, not drag-and-drop

**What goes wrong:** `textarea.addEventListener('paste', ...)` handles `Ctrl+V` paste but NOT drag-and-drop of image files onto the textarea.
**Why it happens:** Drag-and-drop uses `dragover` + `drop` events with `event.dataTransfer.files`, not `clipboardData`.
**How to avoid:** Wire up both `paste` (for clipboard) and `drop` (for drag-and-drop). For `drop`, prevent default to avoid browser opening the file as a URL. Both paths converge on `File → ArrayBuffer → base64 → pendingImage`.

---

## Code Examples

### desktopCapturer capture to base64 JPEG

```typescript
// Source: Electron docs + project pattern
import { desktopCapturer } from 'electron';
import sharp from 'sharp';

async function captureScreen(): Promise<{ base64: string } | { error: string }> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  if (sources.length === 0) return { error: 'PERMISSION_DENIED' };

  const pngBuffer = sources[0].thumbnail.toPNG();
  const jpegBuffer = await sharp(pngBuffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { base64: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}` };
}
```

### LangChain multimodal HumanMessage (all providers)

```typescript
// Source: @langchain/core HumanMessage constructor
import { HumanMessage } from '@langchain/core/messages';

const msg = new HumanMessage({
  content: [
    {
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ...' },
    },
    {
      type: 'text',
      text: 'O que está acontecendo nesta tela?',
    },
  ],
});
// LangChain @langchain/anthropic converts image_url to Anthropic source format internally
// LangChain @langchain/google-genai converts to inline_data format internally
```

### Renderer paste + drop handler

```typescript
// React component paste handler
const handlePaste = (e: React.ClipboardEvent) => {
  const items = Array.from(e.clipboardData.items);
  const imageItem = items.find(item => item.type.startsWith('image/'));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  readFileAsBase64(file).then(setPendingImage);
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);
  const imageFile = files.find(f => f.type.startsWith('image/'));
  if (!imageFile) return;
  readFileAsBase64(imageFile).then(setPendingImage);
};

async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const binary = bytes.reduce((s, b) => s + String.fromCharCode(b), '');
  return `data:${file.type};base64,${btoa(binary)}`;
}
```

### IPC types additions

```typescript
// ipc-types.ts additions
export const IPC_CHANNELS = {
  // ... existing ...
  CAPTURE_SCREEN: 'vision:capture-screen',    // main handles, renderer/tool calls
  CHAT_SEND_IMAGE: 'chat:send-image',          // renderer → main → backend
  VISION_SCREENSHOT: 'vision:screenshot-captured', // main → renderer (hotkey path)
} as const;

export interface CaptureScreenResult {
  success: true;
  base64: string;   // full data URL: "data:image/jpeg;base64,..."
} | {
  success: false;
  error: 'PERMISSION_DENIED' | string;
}

export interface SendImageRequest {
  message: string;
  imageBase64: string; // full data URL
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `desktopCapturer` in renderer (Electron <20) | Main process only (Electron 20+) | Must route through IPC |
| `nativeImage.toJPEG()` only | `sharp` for resize + JPEG encode | Handles HiDPI screens correctly |
| Provider-specific image format | LangChain `HumanMessage` content array | One format works for OpenAI/Anthropic/Gemini |
| `openai/whisper` STT | `faster-whisper` (already in project) | Not relevant to this phase |

---

## Open Questions

1. **How does `analyze_screen` get a reference to the Electron IPC?**
   - What we know: The backend Node.js process communicates with Electron via HTTP (express routes). There's no direct IPC channel from backend to Electron main.
   - What's unclear: The `request_file_action` tool (Phase 55) injects a `ClientIdRef` and uses a WebSocket or HTTP back-channel. Reading `request-file-action.ts` would clarify the exact transport used.
   - Recommendation: Before planning Task "create analyze_screen tool", read `apps/backend-ts/src/session/request-file-action.ts` to understand how the backend-to-Electron round-trip is implemented. The `analyze_screen` tool will use the same back-channel.

2. **sharp extraResources exact path**
   - What we know: Sharp uses prebuilt native binaries. The path differs by platform and sharp version.
   - What's unclear: Exact path of the `.node` file in `node_modules/sharp/` on Windows/macOS/Linux for v0.34.5.
   - Recommendation: Run `ls node_modules/sharp/build/Release/` before writing the `electron-builder.yml` entry to confirm the filename pattern (`sharp-v128-napi-v9-win32-x64-unknown.node` or similar).

3. **Gemini vision capability detection for live-switched providers**
   - What we know: `capabilities.ts` only runs at startup; Phase 57 added live LLM swapping.
   - What's unclear: Whether `swapLLM()` in `chat-session.ts` also updates the capabilities reference used by tools.
   - Recommendation: Implement `hasVision` as a live lookup based on active provider in `llm/capabilities.ts`, not a cached value from session creation.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `sharp` (desktop) | D-01, D-10 | Listed in devDeps | ^0.34.5 | — (must be installed) |
| `sharp` (backend-ts) | backend image processing | Listed in deps | ^0.34.5 | — (must be installed) |
| `desktopCapturer` | D-01 | Built-in Electron 41.1.1 | 41.1.1 | — |
| `globalShortcut` | D-07 | Built-in Electron | 41.1.1 | — |
| `@langchain/core` | D-04 multimodal msg | ^1.1.45 installed | ^1.1.45 | — |
| `@langchain/anthropic` | Anthropic vision | ^1.3.26 installed | ^1.3.26 | — |
| `@langchain/openai` | OpenAI vision | ^1.4.3 installed | ^1.4.3 | — |
| `@langchain/google-genai` | Gemini vision | ^2.1.30 installed | ^2.1.30 | — |

**Missing dependencies with no fallback:** None — all required dependencies are already installed.

**Configuration gaps (Wave 0):**
- `sharp` not yet in `MAIN_EXTERNALS` in `electron.vite.config.ts`
- `sharp` not yet in `electron-builder.yml` extraResources
- `screenshotHotkey` not yet in `StoreSchema` or `SettingsData`
- `CAPTURE_SCREEN` and `CHAT_SEND_IMAGE` not yet in `IPC_CHANNELS`

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.x |
| Config file | `vitest.config.ts` or via `package.json#scripts.test` |
| Quick run (desktop) | `pnpm --filter @jarvis/desktop test` |
| Quick run (backend-ts) | `pnpm --filter @jarvis/backend-ts test` |
| Full suite | `pnpm -r test` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| `captureScreen()` returns base64 JPEG | unit | `vitest run capture.test.ts` | Mock `desktopCapturer` |
| `captureScreen()` returns PERMISSION_DENIED when sources empty | unit | `vitest run capture.test.ts` | |
| sharp resize to max 1920×1080 | unit | via capture test | |
| `analyze_screen` tool returns data URL | unit | `vitest run vision-tool.test.ts` | Mock captureFn |
| `analyze_screen` tool returns error msg when no vision | unit | `vitest run vision-tool.test.ts` | |
| `session.send(text, imageBase64)` builds HumanMessage content array | unit | `vitest run chat-session.test.ts` | Extend existing test |
| `POST /chat` accepts `imageBase64` body param | unit | `vitest run chat.test.ts` | Extend existing |
| `GET /chat/stream` accepts `imageBase64` query param | unit | `vitest run chat.test.ts` | |
| Paste event extracts image from clipboard | unit (renderer) | `vitest run ChatInput.test.tsx` | happy-dom |
| Drop event extracts image from drag | unit (renderer) | `vitest run ChatInput.test.tsx` | |
| `screenshotHotkey` store get/set | unit | `vitest run store.test.ts` | Extend existing |
| `getScreenshotHotkey()` returns default `CmdOrCtrl+Shift+S` | unit | `vitest run store.test.ts` | |

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/ipc/capture.test.ts` — covers desktopCapturer + sharp pipeline; needs electron mock
- [ ] `apps/backend-ts/src/session/vision-tool.test.ts` — covers analyze_screen tool logic
- [ ] Extend `apps/backend-ts/src/session/chat-session.test.ts` — send() with imageBase64
- [ ] Extend `apps/backend-ts/src/routes/chat.test.ts` — POST and GET stream with imageBase64
- [ ] `apps/desktop/src/renderer/src/[ChatInput].test.tsx` — paste + drop handlers (exact file path TBD based on ChatInput component location)

---

## Sources

### Primary (HIGH confidence)
- Electron docs: `desktopCapturer` API — main-process-only restriction confirmed (Electron 20+)
- `apps/desktop/package.json` — sharp ^0.34.5 already in devDependencies
- `apps/backend-ts/package.json` — sharp ^0.34.5 in dependencies, onlyBuiltDependencies confirmed
- `apps/desktop/electron.vite.config.ts` — MAIN_EXTERNALS pattern (lines 94-103), onnxruntime-node as reference
- `apps/desktop/electron-builder.yml` — extraResources pattern (lines 43-135), onnxruntime-node entry as reference
- `apps/desktop/src/main/ptt-hotkey.ts` — globalShortcut pattern for screenshot hotkey
- `apps/desktop/src/shared/ipc-types.ts` — IPC_CHANNELS enum, existing type patterns
- `apps/desktop/src/main/store.ts` — StoreSchema and accessor pattern
- `apps/backend-ts/src/session/chat-session.ts` — send() implementation, tool registration pattern
- `apps/backend-ts/src/session/pc-tools.ts` — tool() factory pattern
- `apps/backend-ts/src/routes/chat.ts` — route extension pattern
- `apps/backend-ts/src/llm/capabilities.ts` — vision flag per provider
- `apps/backend-ts/src/llm/factory.ts` — all four providers confirmed (lmstudio, openai, anthropic, gemini)

### Secondary (MEDIUM confidence)
- LangChain docs: `HumanMessage` content array for multimodal — OpenAI `image_url` format; Anthropic/Gemini handled internally by provider packages
- Electron changelog: `desktopCapturer` renderer removal in Electron 20 (security policy change)

### Tertiary (LOW confidence — flag for validation)
- sharp `build/Release/` path pattern for extraResources — verify actual filename on target platform

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed, versions verified from package.json
- Architecture: HIGH — patterns read directly from existing codebase (`ptt-hotkey.ts`, `electron.vite.config.ts`, `chat-session.ts`)
- Pitfalls: HIGH for Electron/sharp pitfalls (well-known); MEDIUM for ToolMessage vision content (provider behavior)
- LangChain multimodal: HIGH — `HumanMessage` content array is the documented standard; provider-specific conversion is implemented by the provider packages

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (stable libraries; Electron and LangChain APIs unlikely to change)
