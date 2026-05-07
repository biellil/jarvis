---
phase: 63-vision-pipeline-ts
plan: 02
subsystem: api
tags: [langchain, langgraph, vision, capabilities, chat-session, express]

# Dependency graph
requires:
  - phase: 63-01
    provides: IPC types for vision pipeline channels (CaptureScreenResult, CAPTURE_SCREEN IPC)

provides:
  - Gemini vision detection in capabilities.ts (vision: true for all Gemini models)
  - providerHasVision() helper for live capability checks
  - vision-tool.ts with createAnalyzeScreenTool factory (injection pattern)
  - ChatSession extended with captureScreenFn inline creation + analyze_screen tool registration
  - ChatSession.send() and sendStream() accept optional imageBase64 for multimodal messages
  - POST /chat and GET /chat/stream accept and forward imageBase64 parameter

affects: [63-03, 63-04, 63-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "captureFn injected inline in ChatSession.create() using existing clientIdRef — no external injection needed"
    - "providerHasVision() live check via lambda closure — avoids startup-snapshot problem"
    - "analyze_screen tool registered only when opts.capabilities provided — graceful degradation"
    - "multimodal HumanMessage with image_url content array when imageBase64 provided"

key-files:
  created:
    - apps/backend-ts/src/session/vision-tool.ts
  modified:
    - apps/backend-ts/src/llm/capabilities.ts
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/routes/chat.ts

key-decisions:
  - "captureScreenFn built inline in ChatSession.create() using clientIdRef — no external injection, gateway URL normalized from ws:// to http://"
  - "analyze_screen returns base64 string (not object) — LangGraph tool() expects string without responseFormat override"
  - "hasVisionFn is a lambda that reads _activeProvider at call time — avoids stale capability cache from session creation"
  - "opts.capabilities presence gates analyze_screen registration — undefined means degrade gracefully"

patterns-established:
  - "Phase 63 vision tool pattern: captureFn injectable callback + hasVisionFn live check lambda"
  - "setActiveProvider() method for RELOAD_LLM handler to update vision capability check"

requirements-completed:
  - VISION-01
  - VISION-02

# Metrics
duration: 8min
completed: 2026-05-07
---

# Phase 63 Plan 02: Vision Backend — Capabilities + Tool + Session Summary

**Gemini vision detection added, analyze_screen LangGraph tool created, ChatSession extended with multimodal HumanMessage support and imageBase64 passthrough in /chat routes**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-07T23:48:22Z
- **Completed:** 2026-05-07T23:56:10Z
- **Tasks:** 2
- **Files modified:** 4 (2 modified, 1 new, 1 modified route)

## Accomplishments

- Fixed capabilities.ts: Gemini block added with `vision: true` for all Gemini models; `providerHasVision()` helper exported for live per-provider checks
- Created `vision-tool.ts` with `createAnalyzeScreenTool` factory — injected `captureFn` + `hasVisionFn` lambda, Portuguese error message when vision unsupported
- Extended `ChatSession`: `captureScreenFn` built inline using `clientIdRef`, `analyze_screen` registered when `opts.capabilities` provided, `setActiveProvider()` added for RELOAD_LLM, `swapLLM()` rebuilds analyze_screen if captureFn present
- Extended `send()` and `sendStream()` with optional `imageBase64` building multimodal HumanMessage content array
- Extended POST /chat and GET /chat/stream to extract and forward `imageBase64`

## Task Commits

1. **Task 1: Fix Gemini vision detection + create vision-tool.ts** - `4c9f8fa` (feat)
2. **Task 2: Extend ChatSession.send()/sendStream() and /chat routes for imageBase64** - `cbe3f75` (feat)

## Files Created/Modified

- `apps/backend-ts/src/session/vision-tool.ts` — New: `createAnalyzeScreenTool` factory with `CaptureScreenFn` type
- `apps/backend-ts/src/llm/capabilities.ts` — Gemini block + `providerHasVision()` helper
- `apps/backend-ts/src/session/chat-session.ts` — `capabilities?/activeProvider?` options, inline `captureScreenFn`, `setActiveProvider()`, multimodal `send()`/`sendStream()`
- `apps/backend-ts/src/routes/chat.ts` — `imageBase64` extraction from body (POST) and query (GET)

## Decisions Made

- `captureScreenFn` built inline in `create()` using the already-available `clientIdRef` — same mutable ref used by `request_file_action`. Keeps gateway URL logic encapsulated, avoids requiring external injection.
- `analyze_screen` returns base64 string (not object) — LangGraph `tool()` without `responseFormat: 'content_and_artifact'` expects string; returning object serializes as "[object Object]".
- `hasVisionFn` is a lambda closure reading `_activeProvider` at call time — avoids stale capability cache problem (Pitfall 6 from PLAN.md).
- `opts.capabilities` presence (not undefined) gates `analyze_screen` registration — graceful degradation when capabilities not passed.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `vision-tool.ts` is ready for Plan 63-03 (gateway capture-screen endpoint)
- `ChatSession.send(imageBase64?)` is ready for Plan 63-04 (Electron desktopCapturer → backend flow)
- `setActiveProvider()` is ready for wiring in RELOAD_LLM handler (Plan 63-05 or inline with existing handler)

---
*Phase: 63-vision-pipeline-ts*
*Completed: 2026-05-07*
