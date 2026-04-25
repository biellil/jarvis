---
phase: 37-context-builder
plan: 01
subsystem: memory
tags: [tdd, refactor, buildContext, tiered-memory, parallel, pt-BR]
dependency_graph:
  requires:
    - 36-memory-writer (MemoryVectors.queryMemoriesByType — Phase 36-P02)
    - 35-schema-type-foundation (typed_memories schema, 3 typed ChromaDB collections)
  provides:
    - buildContext(userText, rollingSum?) — context tiered com headers pt-BR
    - Promise.all parallel retrieval (semantic + episodic + procedural)
  affects:
    - apps/backend-ts/src/session/chat-session.ts (consome buildContext — sem mudança de assinatura)
    - apps/backend-ts/src/index.ts (startup — sem mudança de assinatura)
tech_stack:
  added: []
  patterns:
    - Promise.all para queries ChromaDB em paralelo (substitui queryMemories sequencial)
    - formatMemoriesSection() helper privado para formatação tipada
key_files:
  created:
    - apps/backend-ts/test/memory/manager-context.test.ts
  modified:
    - apps/backend-ts/src/memory/manager.ts
decisions:
  - "recallThreshold removido do constructor — campo mantido em MemoryManagerOptions como @deprecated para não quebrar call sites existentes"
  - "formatMemoriesSection() extraído como helper privado — evita duplicação de 3 seções idênticas"
  - "rollingSum: campo aceito como string opaca — Phase 38 passará o resumo, Phase 37 apenas posiciona"
  - "import('./vectors.js').QueryResult como tipo inline no helper — evita import duplicado no topo do arquivo"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
  tests_added: 8
  tests_passed: 14
---

# Phase 37 Plan 01: Context Builder TDD RED→GREEN Summary

**One-liner:** buildContext() refatorado com Promise.all para 3 queries tipadas em paralelo, headers pt-BR e rollingSum opcional — substituindo queryMemories sequencial com threshold 0.7.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED — Criar manager-context.test.ts | `708d016` | `test/memory/manager-context.test.ts` (criado) |
| 2 | GREEN — Refatorar buildContext() | `369f930` | `src/memory/manager.ts` (modificado) |

## Test Results

- **manager-context.test.ts:** 8 testes, 8 passando (GREEN)
- **manager-typed.test.ts:** 6 testes, 6 passando (regressão zero)
- **Total:** 14 testes passando, 0 falhas

## Requirements Status

| Requisito | Descrição | Status |
|-----------|-----------|--------|
| MCTX-01 | Ordem tiered: Perfil → rollingSum → Semântica → Episódica → Procedural com headers pt-BR | ✓ Implementado |
| MCTX-02 | queryMemoriesByType 3x sem threshold — top-5 por tipo | ✓ Implementado |
| MCTX-03 | Promise.all — 3 queries em paralelo, latência < 200ms com 80ms/query | ✓ Implementado |
| MCTX-04 | buildContext(userText) backward compatible + rollingSum opcional | ✓ Implementado |

## Implementation Decisions

**1. recallThreshold como @deprecated (não removido da interface)**
- Manter o campo `recallThreshold?` em `MemoryManagerOptions` evita quebrar call sites existentes que passam o campo
- O campo privado `this.recallThreshold` foi removido do constructor — o valor é simplesmente ignorado
- Documentado com JSDoc `@deprecated`

**2. formatMemoriesSection() como helper privado**
- As 3 seções de memórias tipadas têm formatação idêntica (header + bullet list)
- Helper elimina duplicação e centraliza formatação
- Tipo `import('./vectors.js').QueryResult[]` usado inline para evitar importação extra

**3. rollingSum como string opaca**
- Phase 37 apenas posiciona o rolling summary entre Perfil e memórias tipadas
- Phase 38 (Rolling Summarization) gerará o conteúdo real
- Interface preparada: `buildContext(userText, rollingSum?)` aceita qualquer string

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueio] Dependência @tsconfig/node22 ausente no worktree**
- **Found during:** Task 1 (RED — primeira execução dos testes)
- **Issue:** O worktree não tinha node_modules instalados. `TSConfckParseError: failed to resolve "extends":"@tsconfig/node22/tsconfig.json"` impediu todos os testes de executar
- **Fix:** `npm install --save-dev @tsconfig/node22` no diretório `apps/backend-ts` do worktree
- **Files modified:** `apps/backend-ts/node_modules/@tsconfig/node22` (instalado), `apps/backend-ts/package-lock.json` (atualizado)
- **Commit:** incluído no commit `708d016` (staged junto com o arquivo de teste)

## Threat Surface Scan

Nenhuma nova superfície de segurança introduzida:
- `buildContext()` não expõe novos endpoints ou caminhos de auth
- `userText` continua sendo tratado como string opaca pelo embedding layer (T-37-01 — mitigado conforme threat model)
- Output permanece dados para LLM, não system directives (T-37-02 — aceito)
- `Promise.all` com tratamento de erro por coleção — uma falha não bloqueia as demais (T-37-03 — mitigado)

## Known Stubs

Nenhum stub introduzido. `rollingSum` é parâmetro opcional documentado — Phase 38 fornecerá a implementação que gera o resumo. O parâmetro está funcional: quando passado, é inserido na posição correta no contexto.

## Self-Check: PASSED

- `apps/backend-ts/test/memory/manager-context.test.ts` — FOUND
- `apps/backend-ts/src/memory/manager.ts` — FOUND (modificado)
- Commit `708d016` — FOUND (`git log`)
- Commit `369f930` — FOUND (`git log`)
- 8 testes no manager-context.test.ts — CONFIRMED
- 14 testes totais passando — CONFIRMED
