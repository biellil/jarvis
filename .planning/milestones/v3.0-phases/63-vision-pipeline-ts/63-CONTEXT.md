# Phase 63: Vision Pipeline TS — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers vision capability to JARVIS: LLM can see the screen, and users can paste/drag images into the chat. Three entry points:

1. **Tool-based screen capture** (VISION-01): User asks "o que está na minha tela?" → LangGraph agent calls `analyze_screen` tool → tool calls Electron IPC → `desktopCapturer` captures screen → base64 JPEG → returned as tool observation → LLM analyzes with vision API
2. **Image paste in chat** (VISION-02): User pastes or drags image into chat textarea → image attaches to next message → backend receives `{message, imageBase64}` → LLM processes as multimodal message
3. **Hotkey screen capture** (VISION-03): Configurable global hotkey (default: CmdOrCtrl+Shift+S) → captures screen → attaches image to chat input → chat window gains focus for user to type their question

**Out of scope:**
- No screenshot button in the chat UI (purely tool-based + paste + hotkey)
- No video capture, only still screenshots
- No local vision model — always uses the configured cloud LLM provider

</domain>

<decisions>
## Implementation Decisions

### D-01: Screen capture stack
- Electron `desktopCapturer.getSources()` in the main process → captures primary screen as PNG
- `sharp` processes the PNG → resize to max 1920×1080 if needed → convert to JPEG at 80% quality
- Output: base64-encoded JPEG string

### D-02: Vision provider strategy
- Use the **currently active LLM provider** for vision analysis
- If the active provider does NOT support vision (e.g., LM Studio), return a user-friendly error message: "Este provider não suporta análise de imagens. Configure OpenAI, Anthropic ou Gemini nas Settings."
- Backend detects capability via existing `capabilities.ts` (vision flag already exists)

### D-03: LangGraph `analyze_screen` tool (VISION-01)
- New LangGraph tool registered in `chat-session.ts` alongside existing PC tools
- Tool name: `analyze_screen`, description: "Captures the user's screen and analyzes its content"
- Tool implementation: calls Electron IPC `CAPTURE_SCREEN` channel → receives base64 JPEG → returns it as the tool observation
- LLM then processes the image in the next turn using vision API

### D-04: Backend chat endpoint extended for images (VISION-02)
- `POST /chat` and `GET /chat/stream` both accept optional `imageBase64?: string` query/body param
- When present, `session.send(message, imageBase64?)` builds a `HumanMessage` with content array: `[{type: 'image_url', image_url: {url: 'data:image/jpeg;base64,...'}}, {type: 'text', text: message}]`
- LangChain `HumanMessage` with content array is the standard multimodal format for all providers

### D-05: IPC channels added
- `CAPTURE_SCREEN`: main handles `desktopCapturer.getSources()` → returns `{base64: string}` (renderer or tool can call this)
- `CHAT_SEND_IMAGE`: renderer → main → backend, sends `{message: string, imageBase64: string}`

### D-06: Image paste/drag in renderer (VISION-02)
- Chat textarea listens for `paste` event with `clipboardData.files` or `clipboardData.items` containing image
- On paste: read file as ArrayBuffer → base64 → store in local state `pendingImage`
- Chat input shows thumbnail preview (small image preview above textarea, max 80px height, with X button to remove)
- On send: message + `pendingImage` sent together via `CHAT_SEND_IMAGE` IPC channel

### D-07: Hotkey implementation (VISION-03)
- New hotkey stored in electron-store: `screenshotHotkey` (default: `CmdOrCtrl+Shift+S`)
- Registered via `globalShortcut` in main process
- On trigger: call `desktopCapturer`, process with sharp → send image to renderer → focus chat window → populate `pendingImage` state
- Configurable in Settings (new field in the existing hotkey section)

### D-08: Image format for LLM transport
- Capture: PNG from desktopCapturer → process with sharp
- Transport: base64-encoded JPEG (80% quality, max 1920×1080)
- Format prefix: `data:image/jpeg;base64,{data}` when sending to LLM

### D-09: No UI button in chat
- User confirmed: no camera/screenshot button in the chat input bar
- Screen capture is triggered only via: (1) LangGraph tool call (VISION-01), (2) image paste (VISION-02), (3) hotkey (VISION-03)

### D-10: `sharp` installation
- `sharp` is the standard Node.js image processing library — use it for resize + JPEG encode
- Add to `apps/desktop/package.json` dependencies
- Externalize in `electron.vite.config.ts` (native addon like onnxruntime-node)
- Add to `electron-builder.yml` extraResources

### Claude's Discretion
- Error handling when desktopCapturer returns no sources (permissions denied on macOS → show user-friendly error)
- Timeout for screen capture IPC call (suggest 5s)
- Gemini vision API may use different content format — verify LangChain handles it uniformly
- Whether to show a "Analyzing screen..." loading state in the chat orb

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing architecture
- `apps/desktop/src/main/ipc/chat.ts` — current chat IPC handler pattern
- `apps/desktop/src/shared/ipc-types.ts` — IPC channel enum and shared types
- `apps/desktop/src/main/store.ts` — electron-store accessors pattern (add screenshotHotkey)
- `apps/desktop/src/main/ptt-hotkey.ts` — pattern for globalShortcut registration

### Backend
- `apps/backend-ts/src/session/chat-session.ts` — where to extend `send()` and add new tool
- `apps/backend-ts/src/routes/chat.ts` — extend POST/GET to accept imageBase64
- `apps/backend-ts/src/llm/capabilities.ts` — vision capability detection (already has `vision` flag)
- `apps/backend-ts/src/session/pc-tools.ts` — pattern for adding new LangGraph tools

### Settings UI
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — add screenshotHotkey field
- `apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx` — example section pattern

### Build config
- `apps/desktop/electron.vite.config.ts` — MAIN_EXTERNALS pattern (add sharp)
- `apps/desktop/electron-builder.yml` — extraResources pattern (add sharp)

</canonical_refs>

<specifics>
## Specific Ideas

- `desktopCapturer.getSources({types: ['screen'], thumbnailSize: {width: 1920, height: 1080}})` returns a thumbnail NativeImage directly — no need for a separate capture step
- `nativeImage.toJPEG(80)` can encode directly without sharp for the capture path; sharp is more flexible for resize
- LangChain `HumanMessage` with content array: `new HumanMessage({content: [{type: 'image_url', image_url: {url: dataUrl}}, {type: 'text', text: message}]})`
- On macOS, `desktopCapturer` requires screen recording permission in System Preferences

</specifics>

<deferred>
## Deferred Ideas

- Video recording or animated GIF capture
- Local vision model (e.g., LLaVA via LM Studio)
- OCR text extraction from screenshots
- Multiple monitor selection UI
- Annotating or drawing on screenshots before sending

</deferred>

---

*Phase: 63-vision-pipeline-ts*
*Context gathered: 2026-05-07*
