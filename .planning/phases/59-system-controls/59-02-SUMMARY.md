---
phase: 59-system-controls
plan: "02"
subsystem: backend-ts/session
tags: [pc-tools, system-controls, llm-tools, langchain, sysctrl]
dependency_graph:
  requires: [59-01]
  provides: [SYSCTRL-01, SYSCTRL-02]
  affects: [apps/backend-ts/src/session/pc-tools.ts, apps/backend-ts/src/session/system-prompt.ts]
tech_stack:
  added: []
  patterns: [tool-factory-pattern, content_and_artifact-responseFormat, zod-enum-schema]
key_files:
  modified:
    - apps/backend-ts/src/session/pc-tools.ts
    - apps/backend-ts/src/session/system-prompt.ts
decisions:
  - createMediaControlTool uses z.enum for command field — type-safe, LLM constrained to valid values
  - createToggleMuteTool uses z.object({}) with Record<string,never> arg pattern — mirrors createListProcessesTool
  - createAdjustVolumeTool uses .min(-100).max(100) Zod constraints for delta range
  - All three tools use responseFormat: 'content_and_artifact' — consistent with existing tool pattern
metrics:
  duration: "~5 minutes"
  completed: "2026-05-07T01:21:55Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 59 Plan 02: Backend LLM Tool Factories for System Controls Summary

Three new LangGraph tool factories (adjust_volume, toggle_mute, media_control) added to pc-tools.ts with system-prompt routing hints so the LLM dispatches voice-triggered volume and media commands to the Electron handlers from Plan 01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add createAdjustVolumeTool and createToggleMuteTool | 957585c | pc-tools.ts |
| 2 | Add createMediaControlTool, update createAllPcTools(), update system-prompt.ts | 7401759 | pc-tools.ts, system-prompt.ts |

## What Was Built

### New Tool Factories

**createAdjustVolumeTool** (`adjust_volume`):
- Schema: `delta: z.number().int().min(-100).max(100)`
- Emits: `{ action: 'adjust_volume', args: { delta } }`
- Description guides LLM to choose appropriate delta magnitude (+5 for "um pouco", +20 for "bastante")

**createToggleMuteTool** (`toggle_mute`):
- Schema: `z.object({})` — no arguments
- Emits: `{ action: 'toggle_mute', args: {} }`
- Pattern mirrors existing `createListProcessesTool`

**createMediaControlTool** (`media_control`):
- Schema: `command: z.enum(['play_pause', 'next_track', 'prev_track'])`
- Emits: `{ action: 'media_control', args: { command } }`
- Enum constraint ensures LLM only sends valid command values

### createAllPcTools() Update

Array expanded from 9 tools to 12. Three new tools appended with comment `// Phase 59 — system controls (SYSCTRL-01, SYSCTRL-02)`.

### system-prompt.ts Update

Three routing hint lines inserted between `list_processes` and the closing `Nunca descreva...` line:
- `adjust_volume` with usage examples
- `toggle_mute` with usage examples
- `media_control` with usage examples

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all tool factories emit complete action payloads that match ACTION_HANDLERS keys in Plan 01's index.ts.

## Self-Check: PASSED

- `apps/backend-ts/src/session/pc-tools.ts` — exists and contains 3 new factories + updated createAllPcTools with 12 tools
- `apps/backend-ts/src/session/system-prompt.ts` — exists and contains 3 routing hints
- Commit 957585c — confirmed in git log
- Commit 7401759 — confirmed in git log
- TypeScript: `npx tsc --noEmit` — zero errors
