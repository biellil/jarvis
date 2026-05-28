---
type: quick
plan: 260524-gqn
subsystem: backend-ts/pc-tools
tags: [bug-fix, pc-tools, key-mismatch, open-folder]
key-files:
  modified:
    - apps/backend-ts/src/session/pc-tools.ts
    - apps/backend-ts/test/fixtures/tools/open_app.json
    - apps/backend-ts/test/fixtures/tools/close_app.json
  created:
    - apps/backend-ts/test/fixtures/tools/open_folder.json
decisions:
  - open_folder tool usa mesma estrutura {action, args} das demais tools, espelhando o handler Python
metrics:
  duration: ~5min
  completed: 2026-05-24
  tasks_completed: 2
  files_modified: 4
---

# Quick Fix 260524-gqn: Fix App Not Found Vazio ao Abrir Pasta — Summary

**One-liner:** Corrigido key mismatch `args.app` → `args.app_name` em open_app/close_app e adicionada tool `open_folder` com payload `{action, args: {path}}`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix key mismatch + add open_folder tool | 0ecee74 | apps/backend-ts/src/session/pc-tools.ts |
| 2 | Update fixtures open_app/close_app, criar open_folder | 33a7717 | 3 fixture files |

## What Was Done

### Bug 1 — Key mismatch em open_app e close_app

`createOpenAppTool` e `createCloseAppTool` enviavam `args: { app: app_name }`, mas o Python lê `params.get("app_name", "")`. O valor retornado era sempre string vazia, causando "App not found: ''".

**Fix:** `args: { app: app_name }` → `args: { app_name: app_name }` em ambas as funções.

### Bug 2 — Tool open_folder inexistente

Sem `createOpenFolderTool()`, o LLM recorria a `open_app` com parâmetros errados ao receber pedidos de "abrir pasta". 

**Fix:** Adicionada `createOpenFolderTool()` na seção `// ---------- files ----------`, retornando `{action: 'open_folder', args: {path}}`. Incluída em `createAllPcTools()` após `createCloseAppTool()`.

### Fixtures

- `open_app.json`: `"app": "firefox"` → `"app_name": "firefox"`
- `close_app.json`: `"app": "vlc"` → `"app_name": "vlc"`
- `open_folder.json`: criado com `{"action": "open_folder", "args": {"path": "~/Downloads"}}`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/backend-ts/src/session/pc-tools.ts` — modificado (0ecee74)
- `apps/backend-ts/test/fixtures/tools/open_app.json` — modificado (33a7717)
- `apps/backend-ts/test/fixtures/tools/close_app.json` — modificado (33a7717)
- `apps/backend-ts/test/fixtures/tools/open_folder.json` — criado (33a7717)
- TypeScript: nenhum erro em pc-tools.ts (`npx tsc --noEmit` confirmado)
- Fixtures verificados via `node -e` com assertions
