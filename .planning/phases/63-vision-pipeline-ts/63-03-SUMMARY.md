---
phase: 63-vision-pipeline-ts
plan: "03"
subsystem: desktop-renderer + gateway + backend
tags: [vision, electron, ipc, screenshot, hotkey, paste, drag-drop, gateway, websocket]
dependency_graph:
  requires:
    - 63-01 (CAPTURE_SCREEN IPC handler, vision IPC types, screenshotHotkey store accessors)
    - 63-02 (ChatSession.capabilities/activeProvider, analyze_screen tool)
  provides:
    - screenshot-hotkey.ts with global hotkey (CmdOrCtrl+Shift+S) → VISION_SCREENSHOT_CAPTURED
    - CHAT_SEND_IMAGE IPC handler in main/ipc/chat.ts
    - window.jarvis.vision preload bridge (captureScreen, sendImage, onScreenshotCaptured)
    - ChatInput.tsx paste/drop/hotkey image support with thumbnail preview + X button
    - gateway POST /internal/capture-screen WS back-channel
    - actionsClient.ts capture_screen_request → capture_screen_response handler
    - backend/index.ts passes capabilities + activeProvider to ChatSession.create()
  affects: [63-04, 63-05]
tech-stack:
  added: []
  patterns:
    - "screenshot-hotkey mirrors ptt-hotkey.ts: module-scoped currentHotkey, register/change/unregister exports"
    - "pendingCaptureResolvers Map in ws-server.ts mirrors pendingAckResolvers for async WS response routing"
    - "capture_screen_request/response WS message pair for gateway → Electron back-channel"
    - "readFileAsBase64 helper outside component for paste/drop image conversion"
key-files:
  created:
    - apps/desktop/src/main/screenshot-hotkey.ts
    - apps/gateway/src/lib/capture-screen-dispatcher.ts
    - apps/gateway/src/routes/capture-screen.ts
  modified:
    - apps/desktop/src/main/ipc/chat.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
    - apps/desktop/src/main/index.ts
    - apps/gateway/src/lib/ws-server.ts
    - apps/gateway/src/app.ts
    - apps/desktop/src/main/actions/actionsClient.ts
    - apps/backend-ts/src/index.ts
decisions:
  - "CHAT_SEND_IMAGE forwards to backend POST /api/chat (not /chat) with Authorization Bearer — matches existing BackendConfig.backendUrl pattern"
  - "capture_screen_request/response handles before ActionAckSchema.safeParse to avoid schema rejection"
  - "capabilities declared outside try-catch in backend/index.ts so it remains in scope for ChatSession.create()"
  - "changeScreenshotHotkey stores accelerator via setScreenshotHotkey before calling registerScreenshotHotkey (reads from store)"
metrics:
  duration: "~15 min"
  completed: "2026-05-07"
  tasks_completed: 3
  files_changed: 11
---

# Phase 63 Plan 03: Renderer + Gateway Vision Wiring Summary

**Electron renderer image paste/drop/hotkey wired end-to-end: ChatInput.tsx with pendingImage state and thumbnail preview, CHAT_SEND_IMAGE IPC handler, preload vision bridge, screenshot-hotkey.ts, gateway /internal/capture-screen WS back-channel, actionsClient capture handler, and backend ChatSession.create() receiving capabilities + activeProvider.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-05-07
- **Tasks:** 3
- **Files modified:** 11 (3 new, 8 modified)

## Accomplishments

### Task 1 — screenshot-hotkey.ts + CHAT_SEND_IMAGE + preload vision bridge
- Created `apps/desktop/src/main/screenshot-hotkey.ts` mirroring ptt-hotkey.ts pattern with `registerScreenshotHotkey`, `changeScreenshotHotkey`, `unregisterScreenshotHotkey` exports
- Added `CHAT_SEND_IMAGE` handler to `setupChatHandlers()` in `main/ipc/chat.ts` — forwards to backend POST `/api/chat` with Bearer auth and 30s timeout
- Extended `apps/desktop/src/preload/index.ts` to expose `window.jarvis.vision` namespace with `captureScreen`, `sendImage`, `onScreenshotCaptured`

### Task 2 — ChatInput.tsx + main/index.ts wiring
- Added `pendingImage` state and `readFileAsBase64` helper to ChatInput.tsx
- Added `handlePaste` (clipboard image), `handleDrop` + `handleDragOver` (file drag-and-drop)
- Added `useEffect` listening for `VISION_SCREENSHOT_CAPTURED` → sets `pendingImage` and shows input
- Modified `handleSubmit` to branch on `pendingImage` → calls `window.jarvis.vision.sendImage()`
- Added thumbnail preview JSX with X remove button (max 80px height)
- Registered `registerCaptureHandlers()` and `registerScreenshotHotkey()` in `main/index.ts`
- Added `unregisterScreenshotHotkey()` in `before-quit` handler

### Task 3 — Gateway back-channel + actionsClient + backend
- Added `pendingCaptureResolvers` Map and `CaptureScreenResult` type export to `ws-server.ts`
- Extended WS `message` handler to process `capture_screen_response` before ActionAckSchema parse
- Created `capture-screen-dispatcher.ts` with `dispatchCaptureScreen(clientId)` — 5s timeout, mirrors sendActionRequest pattern
- Created `POST /internal/capture-screen` route in gateway
- Registered `captureScreenRouter` in `app.ts` under `/internal` prefix
- Extended `actionsClient.ts` to handle `capture_screen_request` and send back `capture_screen_response` via WS
- Updated `backend-ts/src/index.ts` to declare `capabilities` outside try-catch and pass `capabilities` + `activeProvider: llmConfig.LLM_PROVIDER` to `ChatSession.create()`

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | screenshot-hotkey + CHAT_SEND_IMAGE + preload | e159bd3 | screenshot-hotkey.ts, ipc/chat.ts, preload/index.ts |
| 2 | ChatInput paste/drop/hotkey + main/index.ts | 13933eb | ChatInput.tsx, main/index.ts |
| 3 | gateway back-channel + actionsClient + backend | c74026e | ws-server.ts, capture-screen-dispatcher.ts, capture-screen.ts, app.ts, actionsClient.ts, backend/index.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all paths are wired end-to-end. The `window.jarvis.vision.sendImage` call in `handleSubmit` goes through a live IPC handler that POSTs to the backend. The `capture_screen_response` flows from actionsClient → gateway WS → dispatchCaptureScreen → backend captureScreenFn.

## Self-Check: PASSED

Files exist:
- `apps/desktop/src/main/screenshot-hotkey.ts` — FOUND
- `apps/gateway/src/lib/capture-screen-dispatcher.ts` — FOUND
- `apps/gateway/src/routes/capture-screen.ts` — FOUND

Commits exist:
- `e159bd3` — FOUND in git log
- `13933eb` — FOUND in git log
- `c74026e` — FOUND in git log

Verification checks:
- `pendingImage|handlePaste|handleDrop|CHAT_SEND_IMAGE` in ChatInput.tsx — all 4 confirmed
- `registerCaptureHandlers|registerScreenshotHotkey` in main/index.ts — both confirmed
- `vision:` in preload/index.ts — confirmed at line 182
- `capture-screen` in gateway/src/ — app.ts + dispatcher + route confirmed
- `capture_screen_request` in actionsClient.ts — confirmed
- `capabilities|activeProvider` passed to ChatSession.create() in backend/index.ts — confirmed
