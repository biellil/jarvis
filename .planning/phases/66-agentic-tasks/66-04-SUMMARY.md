---
phase: 66
plan: "04"
subsystem: renderer
tags: [agentic-tasks, ipc-bridge, chat-context, sse, task-keywords, task-checklist, orb-badge, voice-routing]
dependency_graph:
  requires: ["66-03"]
  provides: ["renderer-ipc-bridge", "task-sse-hook", "task-checklist-component", "orb-agent-badge", "voice-task-routing"]
  affects: ["ChatContext", "Orb", "sendAudioAndHandle"]
tech_stack:
  added: []
  patterns:
    - "Electron contextBridge IPC proxy (renderer → preload → main → HTTP backend)"
    - "fetch+ReadableStream SSE (Bearer auth — NOT EventSource)"
    - "Pure reducer pattern for task state (reduceTaskEvent)"
    - "Derived editMode from props — no local useState (D-09)"
    - "agentBadgeText overrides voice-mode label while preserving CSS colors (D-12)"
    - "sendAudioAndHandle keyword short-circuit before /api/chat routing"
key_files:
  created:
    - apps/desktop/src/main/ipc/tasks.ts
    - apps/desktop/src/renderer/src/chat/useTaskSse.ts
    - apps/desktop/src/renderer/src/voice/task-keywords.ts
    - apps/desktop/src/renderer/src/chat/TaskCheckList.tsx
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/renderer/src/chat/ChatContext.tsx
    - apps/desktop/src/renderer/components/Orb/Orb.tsx
    - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts
    - apps/desktop/src/renderer/src/voice/__tests__/task-keywords.test.ts
    - apps/desktop/src/renderer/src/chat/__tests__/TaskCheckList.test.tsx
    - apps/desktop/src/renderer/components/Orb/__tests__/Orb.agent.test.tsx
    - apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.task.test.ts
decisions:
  - "fetch+ReadableStream for SSE (not EventSource) — EventSource has no custom-header API, cannot send Bearer token"
  - "editMode derived from props not local useState — ChatContext reducer is single source of truth (D-09 compliance)"
  - "agentBadgeText overrides badge text only, CSS colors stay at voice-mode values (D-12 contract)"
  - "TTS sumário uses deterministic template string (no extra LLM call) per UI-SPEC copywriting contract"
  - "task-keywords.ts is a byte-equivalent mirror of backend keywords.ts, parity enforced by snapshot test"
metrics:
  duration: "~45min (continuation session)"
  completed_date: "2026-05-09"
  tasks: 2
  files: 10
---

# Phase 66 Plan 04: Wave 3 Renderer Layer Summary

Renderer IPC bridge + ChatContext task state machine + TaskCheckList component (8 UI-SPEC states) + Orb agentBadgeText badge prop + sendAudioAndHandle voice keyword routing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | IPC bridge + ChatContext + useTaskSse + task-keywords | a984b1e | ipc-types.ts, tasks.ts (main), ipc/index.ts, preload/index.ts, task-keywords.ts, useTaskSse.ts, ChatContext.tsx, task-keywords.test.ts |
| 2 | TaskCheckList + Orb badge + sendAudioAndHandle short-circuit | 0e6e7d3 | TaskCheckList.tsx, TaskCheckList.test.tsx, Orb.tsx, Orb.agent.test.tsx, sendAudioAndHandle.ts, sendAudioAndHandle.task.test.ts, task-keywords.test.ts |

## What Was Built

### Task 1 — IPC Bridge + Context Layer

**IPC channels** (`ipc-types.ts`): Added `TASK_RESUME`, `TASK_CANCEL`, `TASK_GET_BACKEND_URL` to `IPC_CHANNELS`. Added `TaskApi` interface and `tasks?: TaskApi` to `JarvisAPI`.

**Main process handler** (`tasks.ts`): `registerTaskHandlers()` registers 3 `ipcMain.handle` calls proxying HTTP requests to the backend — `POST /api/tasks/:id/resume`, `POST /api/tasks/:id/cancel`, `GET` backend URL+bearer.

**Preload bridge** (`preload/index.ts`): Exposes `window.jarvis.tasks.{resumeTask, cancelTask, getBackendUrl}` via contextBridge.

**Renderer keyword mirror** (`task-keywords.ts`): Exact byte-equivalent of `backend-ts/src/agent/keywords.ts` — `CONFIRM_KEYWORDS` (11), `CANCEL_KEYWORDS` (11), `EDIT_PREFIXES` (12), `matchTaskKeyword(utterance, taskState)`. Parity enforced by snapshot test reading backend file at test time (T-66-04-04).

**SSE hook** (`useTaskSse.ts`): `useTaskSse(opts | null)` opens SSE via `fetch+ReadableStream` with Bearer auth. Parses `event: {kind}\ndata: {json}\n\n` wire format. Dispatches `TaskSseEvent` to `handleTaskEvent`; passes legacy tokens to `onTextToken`. Re-renders only on URL/bearer change.

**ChatContext extension** (`ChatContext.tsx`):
- `tasks: ReadonlyMap<string, TaskUiState>` — live task state map
- `reduceTaskEvent(prev, evt)` — pure reducer for all 9 event kinds
- `buildPlanTtsSummary(plan)` — deterministic pt-BR template (1 step: "Vou fazer 1 coisa: …"; 2: "…e …"; 3: "…, e …"; N>3: "…e mais N-2 coisas")
- TTS side effects: speaks sumário on `task:plan`, "Pronto. {sumário}" on `task:done`, "Cancelado." on `task:cancelled`
- `setTaskEditMode(taskId, on)` — flips `editMode` on `awaiting-confirmation` without SSE

### Task 2 — UI Components + Voice Routing

**TaskCheckList** (`TaskCheckList.tsx`): Single component implementing all 8 UI-SPEC visual states:
1. `awaiting-confirmation` (editMode:false) — plan display + Confirmar/Cancelar/Modificar buttons
2. `awaiting-confirmation` (editMode:true) — inline textarea for feedback + Enviar/Cancelar edição
3. `edit-loop` — "Replanejando…" spinner state
4. `executing` — step list with progress + Cancelar
5. `awaiting-failure-decision` — alertdialog + Tentar de novo/Replanear/Abortar
6. `done` — check icon + "Tarefa concluída" + steps summary
7. `cancelled` — X icon + "Tarefa cancelada"
8. `error` — error icon + message

ARIA: `role="region"`, `role="alertdialog"`, `aria-busy`, `aria-current="step"`, `aria-live="polite"`, sr-only heading for failure state. Esc closes in awaiting-confirmation and executing states. `editMode` derived from `state.editMode` prop — NO local `useState`.

**Orb badge** (`Orb.tsx`): `agentBadgeText?: string` prop. When set, replaces voice-mode label text (WW/AL) with the agent text (e.g. "AGENT 3/7"). CSS border/text color stays at voice-mode values — NOT overridden (D-12 contract). `aria-label` becomes "Agente executando — passo N de M" when set.

**sendAudioAndHandle** (`sendAudioAndHandle.ts`): After STT succeeds, if `activeTask` is in `awaiting-confirmation` or `executing` state:
- Runs `matchTaskKeyword(transcription, taskKind)`
- `cancel` match → `cancelTask(taskId)`
- `confirm` match → `resumeTask(taskId, { kind: 'confirm' })`
- `edit` match with feedback → `resumeTask(taskId, { kind: 'edit', feedback })`
- `edit` match bare → `onTaskEditMode?.(taskId)` (enter edit mode in UI)
- Keyword match → return early (SHORT-CIRCUIT, no /api/chat)
- Non-keyword → fall through to normal /api/chat path

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| task-keywords.test.ts | 6 | PASS |
| TaskCheckList.test.tsx | 44 | PASS |
| Orb.agent.test.tsx | 7 | PASS |
| sendAudioAndHandle.task.test.ts | 6 | PASS |
| sendAudioAndHandle.test.ts (regression) | 16 | PASS |
| **Total** | **79** | **PASS** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] task-keywords.test.ts parity test path**
- **Found during:** Task 2 (test run in worktree)
- **Issue:** Path `../../apps/backend-ts/src/agent/keywords.ts` resolved correctly in main repo CWD (`/root/jarvis/apps/desktop` → `/root/jarvis/apps/backend-ts`) but failed in worktree CWD (`/root/jarvis/.claude/worktrees/.../apps/desktop` → invalid `/root/jarvis/.claude/apps/backend-ts`)
- **Fix:** Changed to `../backend-ts/src/agent/keywords.ts` (sibling directory, correct for both CWD contexts)
- **Files modified:** `apps/desktop/src/renderer/src/voice/__tests__/task-keywords.test.ts`
- **Commit:** 0e6e7d3

### Worktree Context

This plan was executed in a git worktree (`worktree-agent-a5527c2915c299ed1`). Task 1 had been committed in the main repo (`c687dd2`) but not the worktree branch. Task 1 was cherry-picked into the worktree before Task 2 work was copied and committed. Both tasks now exist as clean per-task commits on the worktree branch.

## Known Stubs

None — all data flows are wired. `TaskCheckList` receives live `TaskUiState` from `ChatContext.tasks` map. SSE events update the map via `reduceTaskEvent`. The IPC bridge connects to real backend endpoints.

## Threat Flags

None — no new network endpoints in renderer. The IPC bridge proxies to existing backend endpoints already covered by backend auth (Plan 66-03).

## Self-Check: PASSED

- [x] `apps/desktop/src/renderer/src/chat/TaskCheckList.tsx` — FOUND
- [x] `apps/desktop/src/renderer/src/chat/useTaskSse.ts` — FOUND
- [x] `apps/desktop/src/renderer/src/voice/task-keywords.ts` — FOUND
- [x] `apps/desktop/src/main/ipc/tasks.ts` — FOUND
- [x] Commit `a984b1e` (Task 1) — FOUND
- [x] Commit `0e6e7d3` (Task 2) — FOUND
- [x] 79 tests passing (63 new + 16 regression)
