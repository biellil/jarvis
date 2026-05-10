---
phase: 66-agentic-tasks
plan: "01"
subsystem: agent
tags: [agentic-tasks, types, contracts, wave-0, vitest]
dependency_graph:
  requires: []
  provides:
    - "Plan, TaskState, ResumeCommand, StepResult, TaskSseEvent type contracts"
    - "CONFIRM_KEYWORDS, CANCEL_KEYWORDS, EDIT_PREFIXES, matchTaskKeyword"
    - "ipc-types.ts extended: TaskSseEvent, TaskUiState, StepUiState, ResumeRequestBody"
    - "9 Wave 0 vitest stub files for Plans 02-04"
  affects:
    - apps/backend-ts/src/agent/
    - apps/desktop/src/shared/ipc-types.ts
tech_stack:
  added: []
  patterns:
    - "Zod discriminatedUnion for resumeRequestSchema (max(500) caps T-66-01 prompt-injection)"
    - "as const arrays preserve literal types for keyword lists"
    - "it.todo() pattern for Wave 0 stubs — runner skips without failing"
key_files:
  created:
    - apps/backend-ts/src/agent/types.ts
    - apps/backend-ts/src/agent/keywords.ts
    - apps/backend-ts/src/agent/__tests__/planner.test.ts
    - apps/backend-ts/src/agent/__tests__/executor.test.ts
    - apps/backend-ts/src/agent/__tests__/graph.test.ts
    - apps/backend-ts/src/agent/__tests__/keywords.test.ts
    - apps/backend-ts/src/routes/__tests__/tasks.test.ts
    - apps/desktop/src/renderer/src/chat/__tests__/TaskCheckList.test.tsx
    - apps/desktop/src/renderer/src/voice/__tests__/task-keywords.test.ts
    - apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.task.test.ts
    - apps/desktop/src/renderer/components/Orb/__tests__/Orb.agent.test.tsx
  modified:
    - apps/desktop/src/shared/ipc-types.ts
decisions:
  - "TaskSseEvent as discriminated union by 'kind' — exhaustive narrowing in consumers"
  - "resumeRequestSchema.feedback max(500) — T-66-01 prompt-injection blast radius cap"
  - "Plan type via z.infer<typeof planSchema> — backend + tests share single type, no drift"
  - "Renderer Plan/PlanStep are manual duplicates (not imported from backend) — hermetic tsconfig boundary"
  - "keywords as const arrays — literal types + renderer can import type without new package"
metrics:
  duration: "~15 min"
  completed: "2026-05-09"
  tasks_completed: 3
  files_created: 11
  files_modified: 1
---

# Phase 66 Plan 01: Wave 0 — Type Contracts + Keyword Module + Vitest Stubs

Wave 0 establece todos os contratos de tipo, constantes de keywords pt-BR e stubs de teste vitest para os arquivos novos da Phase 66 — sem código de runtime, apenas tipos, constantes e testes vermelhos que Plans 02-04 irão implementar.

## Summary

Criados contratos de tipo backend (`Plan`, `TaskSseEvent` com 9 event kinds, `ResumeCommand`, `StepResult`, `resumeRequestSchema` Zod), módulo de keywords pt-BR com `matchTaskKeyword` helper, extensão do `ipc-types.ts` renderer-side (hermético, sem cross-package import), e 9 arquivos de stub vitest cobrindo AGENT-01/02/03/04 com 15 testes reais passando e 60+ `it.todo()` prontos para Plans 02-04.

## Files Created

**Count: 11 created + 1 modified**

| File | Purpose |
|------|---------|
| `apps/backend-ts/src/agent/types.ts` | Plan, TaskSseEvent (9 kinds), ResumeCommand, StepResult, planSchema, resumeRequestSchema |
| `apps/backend-ts/src/agent/keywords.ts` | CONFIRM_KEYWORDS (11), CANCEL_KEYWORDS (11), EDIT_PREFIXES (12), matchTaskKeyword |
| `apps/backend-ts/src/agent/__tests__/planner.test.ts` | 3 Zod schema real tests + 3 it.todo |
| `apps/backend-ts/src/agent/__tests__/executor.test.ts` | 9 it.todo for executor behavior |
| `apps/backend-ts/src/agent/__tests__/graph.test.ts` | 12 it.todo for buildTaskGraph (AGENT-01/02/03/04 + MemorySaver) |
| `apps/backend-ts/src/agent/__tests__/keywords.test.ts` | 12 real matchTaskKeyword tests + 1 it.todo |
| `apps/backend-ts/src/routes/__tests__/tasks.test.ts` | 9 it.todo for resume + cancel routes |
| `apps/desktop/src/renderer/src/chat/__tests__/TaskCheckList.test.tsx` | 22 it.todo for 8 visual states |
| `apps/desktop/src/renderer/src/voice/__tests__/task-keywords.test.ts` | 5 it.todo for renderer keyword mirror |
| `apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.task.test.ts` | 5 it.todo for STT short-circuit |
| `apps/desktop/src/renderer/components/Orb/__tests__/Orb.agent.test.tsx` | 5 it.todo for agentBadgeText prop (D-12) |
| `apps/desktop/src/shared/ipc-types.ts` (modified) | +55 lines: Phase 66 type block appended |

## Test Stub Coverage Map

| Requirement | File | Coverage |
|-------------|------|----------|
| AGENT-01 (end-to-end task) | `graph.test.ts` | `it.todo('completes 3-step task end-to-end...')` |
| AGENT-02 (plan confirmation interrupt) | `graph.test.ts`, `planner.test.ts`, `tasks.test.ts` | plan-confirmation interrupt, Zod schema validation, resume endpoint |
| AGENT-03 (SSE events) | `graph.test.ts`, `TaskCheckList.test.tsx` | task:plan/step:start/step:end/done events; all 8 visual states |
| AGENT-04 (cancellation) | `graph.test.ts`, `executor.test.ts`, `tasks.test.ts`, `sendAudioAndHandle.task.test.ts` | cancelRequested gate, AbortSignal, cancel route, STT short-circuit |

## Real Tests Passing (Wave 0)

- `keywords.test.ts`: 12 tests passing — CONFIRM (11 entries), CANCEL (11 entries), EDIT_PREFIXES (12 entries), matchTaskKeyword cases (confirm/cancel/edit/null)
- `planner.test.ts`: 3 tests passing — planSchema valid 1 step, rejects 0 steps, rejects 16 steps

## Deviations from Plan

None — plan executed exactly as written.

One minor addendum: `TaskSseEventKind = TaskSseEvent['kind']` was added to `ipc-types.ts` beyond the 6 listed exports. This is a useful utility type for consumers and has no breaking implications.

## Downstream Plan Compatibility

Plans 02-04 can now import:
- `import { Plan, TaskSseEvent, ResumeCommand, StepResult, planSchema, resumeRequestSchema } from '../agent/types.js'`
- `import { CONFIRM_KEYWORDS, CANCEL_KEYWORDS, EDIT_PREFIXES, matchTaskKeyword } from '../agent/keywords.js'`
- `import type { TaskSseEvent, TaskUiState, ResumeRequestBody } from '@shared/ipc-types'`

All compile without errors. No production code was modified — only new files + ipc-types.ts addendum.

## Self-Check: PASSED

```
apps/backend-ts/src/agent/types.ts       — FOUND
apps/backend-ts/src/agent/keywords.ts    — FOUND
apps/desktop/src/shared/ipc-types.ts     — FOUND (modified, existing exports preserved)
9 Wave 0 stub files                       — ALL FOUND
Commits:
  ac76da2 — FOUND (types + keywords)
  b576dca — FOUND (ipc-types extension)
  be0c205 — FOUND (9 stub files)
Backend vitest: 15 passing, 35 todo, 0 fail
Renderer vitest (new files only): 42 todo, 0 fail
```
