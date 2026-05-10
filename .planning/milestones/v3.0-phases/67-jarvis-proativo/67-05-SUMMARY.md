---
phase: 67-jarvis-proativo
plan: 05
subsystem: proactive-folder-watcher
tags: [chokidar, folder-watcher, debounce, quiet-hours, tdd, wave-1]
dependency_graph:
  requires:
    - 67-01 (stub test + tipos proativos)
    - 67-02 (quiet-hours.ts: isInQuietHours + nextQuietEnd)
  provides:
    - FolderWatcher class em apps/backend-ts/src/proactive/folder-watcher.ts
    - startWatching/stopWatching API com debounce 2s
    - Integração quiet hours (D-12): buffer in-memory + defer timer
    - QuietHoursConfig interface exportada
  affects:
    - apps/backend-ts/src/proactive/ (novo módulo folder-watcher.ts)
tech_stack:
  added: []
  patterns:
    - TDD red-green com vi.hoisted() para mock factory com estado compartilhado
    - vi.useFakeTimers() para controle determinístico de debounce e quietDeferTimer
    - Debounce pattern: clearTimeout + setTimeout reset em cada evento
    - Quiet buffer pattern: quietBuffer in-memory + quietDeferTimer único por janela
    - T-67-08 mitigação: cap 1000 entradas no quietBuffer
key_files:
  created:
    - apps/backend-ts/src/proactive/folder-watcher.ts
  modified:
    - apps/backend-ts/src/proactive/__tests__/folder-watcher.test.ts
decisions:
  - vi.hoisted() usado para criar mock state compartilhado entre vi.mock factory e helpers de teste — evita problema de import-before-initialization
  - Mock watcher criado fresh por chamada watch() via createFakeWatcher() — garante isolamento entre testes
  - quietBuffer limitado a 1000 entradas (T-67-08): slice no append, não no push
  - FolderWatcherFile interface exportada junto com QuietHoursConfig para reuso downstream
metrics:
  duration_seconds: 480
  completed_date: "2026-05-09"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 67 Plan 05: FolderWatcher com chokidar + debounce 2s + quiet hours buffer

**One-liner:** FolderWatcher com chokidar 5.0.0 (depth:0, ignoreInitial:true), debounce 2s para batching, e quiet hours buffer que agrega eventos e emite batch único ao fim do quiet window.

## Summary

Implementação TDD completa do `FolderWatcher` — componente responsável por monitorar uma pasta configurada e notificar quando novos arquivos chegam (PROACT-05). Toda a lógica de debounce, integração com quiet hours (D-12) e mitigação de DoS in-memory (T-67-08) foi coberta por 9 testes automatizados.

**O que foi feito:**

1. **Testes RED** — 8 casos de teste reais escritos no arquivo stub existente (convertido de `it.todo()`). Cobertura completa dos comportamentos especificados no plano: debounce 2s, reset de timer, stopWatching antes do debounce, troca de path, quiet hours defer, aggregation de dois batches em quiet, e stop durante deferral.

2. **Implementação GREEN** — `folder-watcher.ts` criado com:
   - `chokidarWatch(path, { ignoreInitial: true, persistent: true, depth: 0 })`
   - Buffer de debounce de 2s com reset em cada evento `add`
   - Decisão no callback do debounce: normal hours → `onFolderEvent()` imediato; quiet hours → append a `quietBuffer` + agendar `quietDeferTimer` (apenas se null)
   - `stopWatching()` limpa debounceTimer, quietDeferTimer, buffers e fecha o watcher
   - `startWatching()` fecha o watcher anterior antes de abrir novo
   - T-67-08: cap de 1000 entradas no `quietBuffer`

3. **Suite completa** — 57 suítes, 411 testes passando, nenhuma regressão.

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| RED  | `6de1473` | ✅ test(67-05): 8 testes falhando para FolderWatcher |
| GREEN | `7f755bd` | ✨ feat(67-05): FolderWatcher com chokidar + debounce + quiet hours buffer |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock chokidar com estado singleton causava testes com `onFolderEvent` nunca chamado**

- **Found during:** Fase GREEN — 4 dos 9 testes falhando com "expected vi.fn() to be called 1 times, but got 0 times"
- **Issue:** O mock original usava `(chokidarWatch as Mock).mockClear()` no `beforeEach`, mas `mockClear()` limpa o histórico de calls sem resetar o `mockReturnValue`. O objeto `mockWatcher` criado na factory com `on: vi.fn()` era singleton — após `mockClear` em `chokidarWatch`, o mock retornava `undefined` em vez do watcher. Resultado: o handler `on('add', ...)` nunca era registrado, então `triggerAdd()` não encontrava o handler e `onFolderEvent` nunca era chamado.
- **Fix:** Refatorado para usar `vi.hoisted()` com `createFakeWatcher()` que cria um novo objeto `{ on: vi.fn(), close: vi.fn() }` em cada chamada a `chokidar.watch`. O estado atual é acessado via `getCurrentWatcher()`. Isso garante isolamento completo entre testes.
- **Files modified:** `apps/backend-ts/src/proactive/__tests__/folder-watcher.test.ts`
- **Commit:** incluído no commit `7f755bd`

## Test Results

```
Test Files  57 passed | 3 skipped (60)
     Tests  411 passed | 1 skipped | 21 todo (433)
```

Folder-watcher específico: **9 passed (9)**

## Known Stubs

Nenhum. Todos os testes são implementados e passando. Os 21 `todo` restantes são de outros planos (Wave 0 stubs de plans 67-06 a 67-10 ainda não implementados).

## Threat Surface Scan

Nenhum novo endpoint de rede criado. O `FolderWatcher` é um módulo interno de backend-ts sem superfície HTTP exposta.

A mitigação T-67-08 (quietBuffer cap 1000) está implementada na linha de append do quietBuffer.
A mitigação T-67-03 (path validation) é responsabilidade do chamador (IPC handler no Plan 67-08) conforme especificado no threat model.

## Self-Check: PASSED

- FOUND: `apps/backend-ts/src/proactive/folder-watcher.ts`
- FOUND: `class FolderWatcher` em folder-watcher.ts
- FOUND: `ignoreInitial: true` em folder-watcher.ts
- FOUND: `depth: 0` em folder-watcher.ts
- FOUND: `isInQuietHours` importado e usado em folder-watcher.ts
- FOUND: `quietBuffer` e `quietDeferTimer` em folder-watcher.ts
- FOUND: commit `6de1473` (RED) no histórico git
- FOUND: commit `7f755bd` (GREEN) no histórico git
- VERIFIED: 9/9 testes passando com `npx vitest run src/proactive/__tests__/folder-watcher.test.ts`
- VERIFIED: 411/411 testes passando na suíte completa (sem regressões)
