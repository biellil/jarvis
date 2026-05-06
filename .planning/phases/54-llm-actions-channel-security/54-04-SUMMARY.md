---
phase: 54-llm-actions-channel-security
plan: "04"
subsystem: desktop-renderer-ipc
tags: [electron, ipc, react, confirmation-toast, lact-06]
dependency_graph:
  requires:
    - 54-03  # IPC_CHANNELS.ACTION_REQUEST + ACTION_ACK + ActionRequestPayload/ActionAckPayload types
  provides:
    - useActionConfirmation hook (renderer)
    - ActionConfirmationToast component (renderer)
    - setupActionsIpcHandlers (main)
    - window.jarvis.actions.onRequest + sendAck (preload)
  affects:
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/shared/ipc-types.ts
tech_stack:
  added: []
  patterns:
    - useEffect onRequest subscription with unsub cleanup
    - useState for pendingAction with null = toast hidden
    - useCallback for sendAck (stable reference)
    - ActionConfirmationToast exported named for renderer tests
    - ipcMain.handle for ACTION_ACK invoke
    - ipcRenderer.on for ACTION_REQUEST subscription + removeListener cleanup
key_files:
  created:
    - apps/desktop/src/renderer/src/hooks/useActionConfirmation.ts
    - apps/desktop/src/renderer/src/__tests__/confirmation-toast.test.tsx
    - apps/desktop/src/main/ipc/actions.ts
  modified:
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/shared/ipc-types.ts
decisions:
  - ActionConfirmationToast exported as named export from App.tsx to enable direct renderer testing without full App tree
  - JarvisAPI.actions? is optional to maintain backward compatibility (existing code not yet exposing actions in preload)
  - ActionAckPayload imported in preload for type-safe invoke call
  - Pre-existing test failures (security.test.ts, voiceHandler.test.ts, etc.) not caused by this plan — confirmed by git stash verification
metrics:
  duration: "583s (~10min)"
  completed: "2026-05-06"
  tasks_completed: 2
  files_modified: 7
---

# Phase 54 Plan 04: Confirmation Toast — Renderer IPC Wiring Summary

Wired Electron renderer confirmation toast for LLM file action requests. When the gateway sends an `action_request` via WebSocket, the Electron main process broadcasts it to the renderer via IPC. The renderer shows a non-blocking blue toast with "Permitir"/"Negar" buttons and a 10-second auto-dismiss that sends a `timeout` ACK. User interaction or timeout forwards the ACK back via IPC to main, which calls `sendActionAck` to respond to the gateway.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useActionConfirmation hook + ActionConfirmationToast + App.tsx wiring | 45b483b | useActionConfirmation.ts, App.tsx, confirmation-toast.test.tsx, ipc-types.ts |
| 2 | IPC handler in main + preload exposure | 184ff15 | ipc/actions.ts, ipc/index.ts, preload/index.ts |

## What Was Built

**useActionConfirmation hook** (`src/renderer/src/hooks/useActionConfirmation.ts`):
- Subscribes to `window.jarvis.actions.onRequest` on mount, unsubscribes on unmount
- Sets `pendingAction` state when `ACTION_REQUEST` arrives
- Replaces any existing pending action (only one toast at a time, per D-12)
- `sendAck(requestId, status)` calls `window.jarvis.actions.sendAck` then clears state

**ActionConfirmationToast component** (exported from `App.tsx`):
- Shows "JARVIS quer {action}: {path}" with Permitir (green) and Negar (red) buttons
- 10-second `setTimeout` triggers `onTimeout` prop if no user interaction
- `WebkitAppRegion: 'no-drag'` ensures buttons are clickable in frameless window
- Exported as named export for direct renderer testing

**App.tsx wiring**:
- `useActionConfirmation()` mounted in `AppContent` alongside existing hooks
- `{pendingAction && <ActionConfirmationToast ... />}` rendered after existing Toast

**setupActionsIpcHandlers** (`src/main/ipc/actions.ts`):
- `ipcMain.handle(IPC_CHANNELS.ACTION_ACK, ...)` receives user response from renderer
- Calls `sendActionAck(payload.requestId, payload.status)` to forward ACK to gateway
- Returns `{ success: true/false }` with error if sendActionAck throws

**Preload exposure** (`src/preload/index.ts`):
- `window.jarvis.actions.onRequest(cb)`: subscribes to `ACTION_REQUEST` channel
- `window.jarvis.actions.sendAck(requestId, status)`: invokes `ACTION_ACK` handler
- Both methods use proper listener add/remove patterns

**JarvisAPI type** (`src/shared/ipc-types.ts`):
- Added `actions?` field with `onRequest` and `sendAck` signatures

## Test Results

- 12/12 confirmation-toast renderer tests passing
- Full desktop TypeScript build: 0 errors

## Deviations from Plan

**1. [Rule 2 - Missing] ActionConfirmationToast exported as named export**
- The plan said "create inline in App.tsx or as separate component"
- Exported as named export from App.tsx to enable direct renderer testing
- No separate file created — stays in App.tsx but is testable without full App tree

**2. [Rule 1 - Bug] Tests use vi.mock for App.tsx heavy dependencies**
- Initial test used `require('../App')` inside test body (CJS in ESM context)
- Fixed by hoisting `vi.mock` calls for `useWakeWord`, `ChatContext`, `Orb`, etc.
- Enabled top-level `import { ActionConfirmationToast } from '../App'`

## Pre-existing Test Failures (Out of Scope)

The following test failures existed before this plan and are NOT caused by changes here (verified via `git stash`):
- `security.test.ts` — line-number ordering assertion in `whenReady` block
- `ipc-chat.test.ts`, `chat-send-audio.test.ts` — mock setup issues
- `tts-providers.test.ts`, `voiceHandler.test.ts` — pre-existing mock failures
- `integration-chat.test.ts`, `vramDetection.test.ts` — pre-existing failures

## Self-Check: PASSED

Files created/verified:
- `apps/desktop/src/renderer/src/hooks/useActionConfirmation.ts` — FOUND
- `apps/desktop/src/renderer/src/__tests__/confirmation-toast.test.tsx` — FOUND
- `apps/desktop/src/main/ipc/actions.ts` — FOUND
- `apps/desktop/src/main/ipc/index.ts` (modified) — FOUND

Commits:
- 45b483b — FOUND
- 184ff15 — FOUND
