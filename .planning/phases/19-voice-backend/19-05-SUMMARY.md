---
phase: 19-voice-backend
plan: 05
subsystem: memory
tags: [drizzle, sqlite, voice, memory]
requires: [conversations table]
provides: [voiceCalls table, MemoryStore.logVoiceCall, MemoryStore.updateVoiceCall, MemoryStore.getVoiceCall]
tech_stack:
  patterns: [MEM-05 graceful write]
key_files:
  created:
    - apps/backend-ts/src/memory/migrations/0002_voice_calls.sql
    - apps/backend-ts/src/memory/voice-log.test.ts
  modified:
    - apps/backend-ts/src/memory/schema.ts
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/migrations/meta/_journal.json
decisions:
  - Migration SQL escrita à mão (drizzle-kit generate falha com erro de config no 0.31 vs drizzle-orm 0.45)
metrics:
  tasks: 2
  commits: 1
  tests_added: 5
  tests_total_memory: 47
---

# Phase 19 Plan 05: voice_calls table + MemoryStore Summary

Adiciona tabela `voice_calls` ao schema Drizzle com migration SQLite e métodos `logVoiceCall`/`updateVoiceCall`/`getVoiceCall` no MemoryStore seguindo padrão MEM-05 (nunca throw).

## What Was Built

- **schema.ts:** `voiceCalls` sqliteTable com FK opcional para `conversations.id`, todos os campos de telemetria STT+TTS do CONTEXT.md.
- **Migration 0002_voice_calls.sql:** CREATE TABLE manual (drizzle-kit generate 0.31 quebrou com drizzle-orm 0.45). Entry adicionado ao `_journal.json`.
- **store.ts:** `logVoiceCall(row) → id|null`, `updateVoiceCall(id, patch)` com merge parcial (ignora undefined, converte success bool→int), `getVoiceCall(id)` helper para testes/inspeção.
- **voice-log.test.ts:** 5 testes cobrindo insert feliz, conversationId null, update parcial preservando campos, bool→int, graceful null após close.

## Verification

- `pnpm vitest run src/memory/voice-log.test.ts`: 5/5 passed
- `pnpm vitest run src/memory` (suite completa): 47/47 passed
- `pnpm exec tsc --noEmit`: clean

## Deviations from Plan

**1. [Rule 3 - Tooling] Migration SQL manual em vez de drizzle-kit generate**
- **Found during:** Task 1
- **Issue:** `pnpm exec drizzle-kit generate` retornou `Cannot read properties of undefined (reading 'value')` — incompatibilidade entre drizzle-kit 0.31 e drizzle-orm 0.45.
- **Fix:** Escrevi `0002_voice_calls.sql` à mão seguindo o formato de `0000_0000_init.sql` + adicionei entry em `_journal.json`.
- **Commit:** 048b3e5

## Key Links

- `MemoryStore.logVoiceCall` → sqlite `voice_calls` via `drizzle.insert(voiceCalls).returning({id})`
- `MemoryStore.updateVoiceCall` → UPDATE por id, merge patch parcial
- 19-01 (STT) e 19-02 (TTS) consumirão esses métodos na Wave 2

## Self-Check: PASSED

- apps/backend-ts/src/memory/schema.ts: FOUND (voiceCalls export)
- apps/backend-ts/src/memory/store.ts: FOUND (logVoiceCall/updateVoiceCall/getVoiceCall)
- apps/backend-ts/src/memory/migrations/0002_voice_calls.sql: FOUND
- apps/backend-ts/src/memory/voice-log.test.ts: FOUND
- commit 048b3e5: FOUND
