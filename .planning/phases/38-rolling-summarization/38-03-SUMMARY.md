---
phase: 38-rolling-summarization
plan: "03"
subsystem: session
tags: [rolling-summarization, chat-session, fire-and-forget, memory, tdd]
dependency_graph:
  requires:
    - 38-02  # MemoryManager.runRollingSummarization implementado
  provides:
    - ChatSession.send() dispara runRollingSummarization fire-and-forget
    - ChatSession.sendStream() dispara runRollingSummarization fire-and-forget
  affects:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts
tech_stack:
  added: []
  patterns:
    - void call fire-and-forget (mesmo padrão de _extractAndWriteMemories da Phase 36)
key_files:
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts
decisions:
  - "Void call sem await — sumarização não bloqueia pipeline de voz (MSUM-02, D-01)"
  - "Posição após _extractAndWriteMemories — mantém ordem consistente com Phase 36"
  - "convId passado diretamente de this._convId — não exposto ao input do usuário (T-38-09)"
metrics:
  duration_seconds: 262
  completed_date: "2026-04-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 38 Plan 03: ChatSession Wiring — void runRollingSummarization Summary

**One-liner:** Void calls fire-and-forget de `runRollingSummarization` adicionadas em `send()` e `sendStream()` com 4 testes verificando o comportamento assíncrono não-bloqueante.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ChatSession — void calls em send() e sendStream() | ba68e8e | apps/backend-ts/src/session/chat-session.ts |
| 2 | chat-session.test.ts — 4 testes fire-and-forget + suite completa | dd1a255 | apps/backend-ts/src/session/chat-session.test.ts |

## What Was Built

### Task 1: Wiring em chat-session.ts

Duas void calls adicionadas exatamente como especificado:

**Em `send()`** — após `void this._extractAndWriteMemories(text, finalText)`:
```typescript
// Phase 38 (MSUM-01, MSUM-02): fire-and-forget rolling summarization
// CRITICAL: void context — nunca aguardar — sumarização não bloqueia pipeline de voz
void this.memory.runRollingSummarization(this._convId);
```

**Em `sendStream()`** — após `void this._extractAndWriteMemories(text, assembled)`:
```typescript
// Phase 38 (MSUM-01, MSUM-02): fire-and-forget rolling summarization (after stream drains)
// CRITICAL: void context — nunca aguardar — sumarização não bloqueia pipeline de voz
void this.memory.runRollingSummarization(this._convId);
```

### Task 2: Testes em chat-session.test.ts

Mock `makeMemory()` estendido com `runRollingSummarization: vi.fn().mockResolvedValue(undefined)`.

4 testes novos adicionados:
1. `send() chama memory.runRollingSummarization com o convId da sessão` — verifica convId=42
2. `send() retorna sem aguardar runRollingSummarization — fire-and-forget` — mock que nunca resolve, send() completa normalmente
3. `sendStream() chama memory.runRollingSummarization após drain do stream` — verifica call após drain
4. `send() chama runRollingSummarization com null quando convId é null` — edge case

## Verification Results

```
✓ chat-session.ts contém `void this.memory.runRollingSummarization(this._convId)` — 2 ocorrências
✓ Sem `await this.memory.runRollingSummarization` — fire-and-forget puro
✓ Tests 16/16 verdes (12 originais + 4 novos)
✓ Memory suite 55/55 verdes
✓ runRollingSummarization em manager.ts: 2 matches (declaração + uso)
✓ _latestSummary em manager.ts: 3 matches (declaração, atualização, uso)
✓ effectiveSummary em manager.ts: 1 match
✓ Store helpers: 4 métodos (countMessages, getOldestMessages, deleteMessages, getLatestSummary)
```

## Deviations from Plan

None - plan executed exactly as written.

**Nota operacional:** A verificação foi executada no worktree com `node_modules` symlinkado do repositório principal (a `@tsconfig/node22` ausente no worktree). O symlink é apenas para execução local dos testes — não afeta o código-fonte nem os commits.

## Known Stubs

None.

## Threat Flags

None — as void calls usam `this._convId` gerado internamente por `startConversation()`, sem exposição a input do usuário. Threat register T-38-08 e T-38-09 cobertos com disposição `accept` conforme planejado.

## Self-Check: PASSED

- `apps/backend-ts/src/session/chat-session.ts` — modificado com 2 void calls: FOUND
- `apps/backend-ts/src/session/chat-session.test.ts` — 4 novos testes: FOUND
- Commit `ba68e8e` (feat task 1): FOUND
- Commit `dd1a255` (test task 2): FOUND
- 16/16 testes verdes: VERIFIED
