---
phase: 16-memory-layer
plan: 05
subsystem: memory
tags: [memory, profile, facade, typescript]
requires: [16-02, 16-04]
provides: [MemoryManager, isExplicitProfileCommand, extractProfileFacts]
affects: [phase-17-chat-session]
tech-stack:
  added: []
  patterns: [facade, swallow-and-log, dependency-injection]
key-files:
  created:
    - apps/backend-ts/src/memory/profile.ts
    - apps/backend-ts/src/memory/profile.test.ts
    - apps/backend-ts/src/memory/manager.ts
    - apps/backend-ts/src/memory/manager.test.ts
  modified:
    - apps/backend-ts/src/memory/index.ts
decisions:
  - "chromaPath option kept as documentation-only; vectorsOptions (host/port) is the real runtime knob since chromadb JS client is server-only"
  - "learnFromTurn is unconditional (no skipImplicit optimization) to match Python parity"
metrics:
  duration: ~8min
  completed: 2026-04-08
requirements: [MEM-TS-07]
---

# Phase 16 Plan 05: MemoryManager Summary

Fecha a fase 16 com um facade único (`MemoryManager`) que ChatSession (fase 17) instancia sem conhecer detalhes de SQLite ou Chroma. Porta `profile.py` para TypeScript com paridade comportamental completa (16 triggers pt/en, extração via LLM tolerante a falhas) e combina `MemoryStore` + `MemoryVectors` + perfil em uma única API: `startConversation`, `saveTurn`, `buildContext`, `learnFromTurn`, `getProfileFacts`, `close`.

## Tasks Completed

| Task | Name                          | Commit    |
| ---- | ----------------------------- | --------- |
| 1    | Port profile.py → profile.ts  | e72d62d   |
| 2    | MemoryManager facade + tests  | 83d8bee   |

## Files

- **Created:** `profile.ts`, `profile.test.ts`, `manager.ts`, `manager.test.ts`
- **Modified:** `memory/index.ts` (barrel re-exports MemoryManager, profile helpers)

## Verification

- `pnpm tsc --noEmit` — clean
- `pnpm vitest run` — 9 files, 65 tests passing
- `profile.test.ts` — 14 tests (trigger detection, fence stripping, error paths)
- `manager.test.ts` — 8 tests (ephemeral Chroma server via `chroma run`, tmp SQLite, fake LLM)

## Sample `buildContext()` output

Após inserir perfil `{nome: Alice}` e uma conversa contendo "eu amo pizza margherita":

```
### User profile
- nome: Alice

### Recall from past conversations
- "eu amo pizza margherita"
```

Seções vazias são omitidas; quando nada é conhecido, retorna string vazia.

## Deviations from Plan

### 1. [Rule 3 - Blocking] chromaPath is option-only, not runtime

- **Found during:** Task 2
- **Issue:** Plan `MemoryManagerOptions` specifies `chromaPath?: string` but `MemoryVectors` (fase 16-04) is server-only — it takes `host`/`port`, not a filesystem path.
- **Fix:** Added `vectorsOptions?: MemoryVectorsOptions` for real wiring; `chromaPath` kept in the type as documentation and ignored at runtime. Tests inject the ephemeral server's `port` via `vectorsOptions`.
- **Files:** `manager.ts`
- **Commit:** 83d8bee

None beyond the above.

## Known Stubs

None.

## Threat Flags

None.

## Decisions Made

1. **vectorsOptions over chromaPath** — chromadb JS client forces server-mode; hiding that behind a `chromaPath` string would be a lie. Exposing `MemoryVectorsOptions` keeps the facade honest.
2. **No `skipImplicit` optimization** — plan leaves it optional; skipped to maintain simple Python parity. Phase 17 can add it if LLM cost becomes an issue.

## Self-Check: PASSED

- apps/backend-ts/src/memory/profile.ts — FOUND
- apps/backend-ts/src/memory/profile.test.ts — FOUND
- apps/backend-ts/src/memory/manager.ts — FOUND
- apps/backend-ts/src/memory/manager.test.ts — FOUND
- apps/backend-ts/src/memory/index.ts — FOUND (modified)
- Commit e72d62d — FOUND
- Commit 83d8bee — FOUND
