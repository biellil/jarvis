---
phase: 56-always-listening-soak-test
plan: "01"
subsystem: diagnostics
tags: [soak-test, perf_hooks, electron, gateway, ipc, QA-01]
requires: []
provides:
  - GET /internal/diagnostics (heapUsed, rss, eventLoopP99Ms, audioContextCount, timestamp)
  - apps/desktop/src/main/diagnostics/collector.ts (initEventLoopMonitoring, getEventLoopP99, startDiagnosticsServer, stopDiagnosticsServer)
  - DIAGNOSTICS_GET_AUDIO_CONTEXT_COUNT IPC channel
  - window.__audioContextCount bridge
affects:
  - apps/gateway/src/app.ts
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/src/renderer/src/audio/audioContextSingleton.ts
tech-stack:
  added:
    - perf_hooks.monitorEventLoopDelay (Node.js built-in, event loop p99 histogram)
    - node:http (Node.js built-in, localhost diagnostics HTTP server on :3001)
  patterns:
    - executeJavaScript bridge: main reads renderer-side state via webContents.executeJavaScript
    - Localhost HTTP inter-process: gateway polls Electron via fetch to 127.0.0.1:3001
    - Non-blocking degradation: all fetch/executeJavaScript errors return 0, never crash
key-files:
  created:
    - apps/desktop/src/main/diagnostics/collector.ts
    - apps/gateway/src/routes/diagnostics.ts
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/renderer/src/audio/audioContextSingleton.ts
    - apps/desktop/src/main/index.ts
    - apps/gateway/src/app.ts
decisions:
  - "executeJavaScript bridge instead of ipcMain.handle: avoids renderer IPC handler registration complexity; main reads window.__audioContextCount directly from renderer DOM"
  - "Separate HTTP server on :3001 for Electron metrics: decouples gateway from Electron IPC bus; simple fetch() is more observable and testable than cross-process IPC"
  - "window.__audioContextCount set in getAudioContext() at AudioContext creation time: zero overhead on hot path, no polling needed"
  - "AbortController with 3s timeout on fetchElectronDiagnostics: soak test must not block on Electron unavailability"
metrics:
  duration_seconds: 204
  completed_date: "2026-05-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 4
---

# Phase 56 Plan 01: Diagnostics Instrumentation Layer Summary

**One-liner:** perf_hooks event loop histogram + localhost :3001 HTTP server + gateway `/internal/diagnostics` aggregator route for soak test polling

## What Was Built

The complete diagnostics instrumentation layer that Plan 02 (soak test script) will poll:

1. **`collector.ts`** — Electron main process module with:
   - `initEventLoopMonitoring()`: starts `perf_hooks.monitorEventLoopDelay({ resolution: 10 })` histogram before window creation
   - `getEventLoopP99()`: reads cumulative p99 in nanoseconds, converts to ms (`/ 1_000_000`)
   - `startDiagnosticsServer(getAudioContextCount)`: localhost HTTP server on `127.0.0.1:3001` serving `/diagnostics` JSON
   - `stopDiagnosticsServer()` / `disableEventLoopMonitoring()`: cleanup on `before-quit`

2. **`audioContextSingleton.ts`** — Updated with:
   - `getAudioContextCount()`: returns 1 if AudioContext active, 0 otherwise
   - `window.__audioContextCount = 1` set when AudioContext is created (bridge for `executeJavaScript`)
   - `__resetAudioContextForTest()` clears `window.__audioContextCount = 0`

3. **`ipc-types.ts`** — New channel: `DIAGNOSTICS_GET_AUDIO_CONTEXT_COUNT: 'diagnostics:get-audio-context-count'`

4. **`GET /internal/diagnostics` gateway route** — Calls `process.memoryUsage()` for heap/RSS, fetches Electron :3001 for eventLoopP99Ms + audioContextCount, returns unified JSON:
   ```json
   { "heapUsed": 123456789, "rss": 234567890, "eventLoopP99Ms": 12.4, "audioContextCount": 1, "timestamp": "2026-05-06T..." }
   ```

5. **`main/index.ts`** — Wired:
   - `initEventLoopMonitoring()` first thing in `app.whenReady()`
   - `startDiagnosticsServer()` after `createWindow()` with async `executeJavaScript` lambda
   - `stopDiagnosticsServer()` + `disableEventLoopMonitoring()` in `before-quit`

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: IPC channel + audioContextCount export | `53447b0` | ipc-types.ts, audioContextSingleton.ts |
| Task 2: collector + server + gateway route | `6d43149` | collector.ts (new), diagnostics.ts (new), index.ts, app.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Design] Used executeJavaScript bridge instead of webContents.invoke IPC**

The plan proposed using `webContents.invoke()` (main→renderer) for the audioContextCount bridge. However, `webContents.invoke()` requires a matching `ipcRenderer.on()` handler registered in the renderer. Since the renderer runs in sandbox mode with contextIsolation, registering new IPC listeners would require preload changes.

The plan itself identified this complexity and suggested `executeJavaScript` as the cleanest alternative. We implemented `window.__audioContextCount` set in `getAudioContext()` (audioContextSingleton.ts) and read via `webContents.executeJavaScript()` in the diagnostics server lambda in index.ts. No preload changes needed. This aligns with the plan's Step G/H intent exactly.

**2. [Rule 2 - Missing error handler] Added `diagnosticsServer.on('error')` handler**

The plan omitted an error handler on the HTTP server. Without it, unhandled `EADDRINUSE` or `EACCES` errors would crash the main process. Added `diagnosticsServer.on('error', ...)` that logs but doesn't throw.

None — plan executed as designed (per D-05/D-06 architecture).

## Known Stubs

None — all fields in the diagnostics response are wired to real data sources:
- `heapUsed`/`rss`: `process.memoryUsage()` (live)
- `eventLoopP99Ms`: `histogram.percentile(99)` (live, cumulative)
- `audioContextCount`: `window.__audioContextCount` via `executeJavaScript` (live)
- `timestamp`: `new Date().toISOString()` (live)

## Self-Check: PASSED

- apps/desktop/src/main/diagnostics/collector.ts: FOUND
- apps/gateway/src/routes/diagnostics.ts: FOUND
- .planning/phases/56-always-listening-soak-test/56-01-SUMMARY.md: FOUND
- commit 53447b0: FOUND
- commit 6d43149: FOUND
