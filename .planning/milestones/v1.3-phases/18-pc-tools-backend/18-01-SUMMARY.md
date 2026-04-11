---
phase: 18-pc-tools-backend
plan: 01
subsystem: session/tools
tags: [langchain, tools, pc-control, parity]
requires: []
provides:
  - createAllPcTools()
  - 9 PC tool factories (open_app, close_app, list_files, search_files, move_file, delete_file, set_volume, set_brightness, list_processes)
  - snapshot fixtures Python→TS
affects:
  - apps/backend-ts/src/session/ (nova superfície pc-tools.ts)
tech-stack:
  added: []
  patterns:
    - responseFormat 'content_and_artifact' para expor payload estruturado
    - snapshot tests contra fixtures JSON geradas do Python
key-files:
  created:
    - apps/backend-ts/src/session/pc-tools.ts
    - apps/backend-ts/test/session/pc-tools.test.ts
    - apps/backend-ts/scripts/gen-tool-fixtures.sh
    - apps/backend-ts/test/fixtures/tools/{open_app,close_app,list_files,search_files,move_file,delete_file,set_volume,set_brightness,list_processes}.json
  modified:
    - apps/backend-ts/package.json
decisions:
  - Tools puras (zero side effects); execução real fica na Fase 18.5 (Electron)
  - responseFormat content_and_artifact dá ao middleware acesso ao payload estruturado sem re-parse
  - delete_file mapeia input file_path → args.path para paridade byte-a-byte com Python
  - Fixture generator faz fallback de `uv run python` para `PYTHONPATH=src python3` quando uv ausente
metrics:
  duration: ~15min
  completed: 2026-04-08
  tasks: 2
  tests_added: 12
  files_created: 13
  files_modified: 1
---

# Phase 18 Plan 01: PC Control Tools — Backend (9 factories + snapshot parity)

Implementa as 9 ferramentas LangChain.js de controle de PC como factories puras retornando `{action, args}` idênticas aos payloads Python, validadas via snapshot tests contra fixtures geradas do próprio Python.

## What Shipped

- **`apps/backend-ts/src/session/pc-tools.ts`** — 9 factory functions (`createOpenAppTool`, `createCloseAppTool`, `createListFilesTool`, `createSearchFilesTool`, `createMoveFileTool`, `createDeleteFileTool`, `createSetVolumeTool`, `createSetBrightnessTool`, `createListProcessesTool`) + `createAllPcTools()` export ordenado. Descriptions em pt-BR, schemas zod com `.describe()`, `responseFormat: 'content_and_artifact'` retornando `[JSON.stringify(payload), payload]`.
- **`apps/backend-ts/scripts/gen-tool-fixtures.sh`** — gerador reproducible que invoca as tools Python e serializa via `json.dumps` para `test/fixtures/tools/<name>.json`. Tenta `uv run python` e cai para `PYTHONPATH=src python3` se `uv` não existir.
- **`apps/backend-ts/test/fixtures/tools/*.json`** — 9 fixtures canônicas geradas uma vez rodando o script.
- **`apps/backend-ts/test/session/pc-tools.test.ts`** — 12 testes (9 de paridade + `search_files` default + ordem `createAllPcTools` + pt-BR check). Todos verdes.
- **`apps/backend-ts/package.json`** — novo npm script `fixtures:tools`.

## Parity Contract

| Tool | Input | Payload (TS === Python) |
|---|---|---|
| open_app | `{app_name: "firefox"}` | `{action:"open_app", args:{app:"firefox"}}` |
| close_app | `{app_name: "vlc"}` | `{action:"close_app", args:{app:"vlc"}}` |
| list_files | `{directory:"/tmp"}` | `{action:"list_files", args:{directory:"/tmp"}}` |
| search_files | `{pattern:"*.py", directory:"."}` | `{action:"search_files", args:{pattern:"*.py", directory:"."}}` |
| move_file | `{source:"a.txt", destination:"b.txt"}` | `{action:"move_file", args:{source:"a.txt", destination:"b.txt"}}` |
| delete_file | `{file_path:"/tmp/x"}` | `{action:"delete_file", args:{path:"/tmp/x"}, requires_confirmation:true}` |
| set_volume | `{level:50}` | `{action:"set_volume", args:{level:50}}` |
| set_brightness | `{level:70}` | `{action:"set_brightness", args:{level:70}}` |
| list_processes | `{}` | `{action:"list_processes", args:{}}` |

Nuances capturadas:
- `delete_file` mapeia input `file_path` → output `args.path` (paridade exata com Python).
- `list_processes.args` é `{}` (presente), não ausente.
- `search_files.directory` tem default `"."` via `z.string().default('.')`.
- `delete_file` é a única com `requires_confirmation: true`; demais não incluem a chave.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixture generator sem `uv` disponível**
- **Found during:** Task 1, primeiro run do script
- **Issue:** `uv: command not found` no ambiente atual; plano assumia `uv run python`.
- **Fix:** Script detecta `uv` via `command -v` e cai para `PYTHONPATH=src python3` quando ausente. Reproducibility mantida — ambos caminhos geram bytes idênticos pois as tools Python são deterministas.
- **Files modified:** `apps/backend-ts/scripts/gen-tool-fixtures.sh`
- **Commit:** `ba3bdb9`

## Verification

- `npx tsc --noEmit` em `apps/backend-ts` — clean (sem output).
- `npx vitest run pc-tools` — 12/12 passed.
- `npx vitest run` (suite completa) — 207/207 passed (nenhuma regressão em recall_memory nem memory/).
- `ls apps/backend-ts/test/fixtures/tools/*.json | wc -l` = 9.
- `grep requires_confirmation delete_file.json` → presente e `true`.
- `grep -r "child_process\|subprocess" apps/backend-ts/src/session/pc-tools.ts` → vazio (tools puras confirmadas).

## Commits

- `ba3bdb9` ✅ test(18-01): gera fixtures JSON das 9 PC tools via Python
- `22aec4f` ✨ feat(18-01): adiciona 9 PC tools com payloads idênticos ao Python

## Next

Plano 18-03 vai plugar `createAllPcTools()` no `createReactAgent` do `ChatSession` e adicionar middleware que intercepta o `artifact` estruturado para gravar `tool_calls` e emitir SSE `action`. Plano 18-02 (paralelo) estende schema/store para suportar `updateOutcome()`.

## Self-Check: PASSED

- apps/backend-ts/src/session/pc-tools.ts: FOUND
- apps/backend-ts/test/session/pc-tools.test.ts: FOUND
- apps/backend-ts/scripts/gen-tool-fixtures.sh: FOUND
- 9 fixtures em test/fixtures/tools/: FOUND
- Commit ba3bdb9: FOUND
- Commit 22aec4f: FOUND
