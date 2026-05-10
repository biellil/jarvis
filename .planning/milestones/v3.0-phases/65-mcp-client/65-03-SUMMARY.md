---
phase: 65-mcp-client
plan: 03
subsystem: mcp-client-hot-reload
tags: [mcp, env-watcher, chokidar, ipc, settings-ui]
requires:
  - "Plan 01 IPC contracts (McpClientStatus, MCP_CLIENT_* channels)"
  - "Plan 02 mcpManager singleton + env-diff helpers + ToolLogger"
  - "chokidar@5.0.0 (já instalado no Plan 01)"
provides:
  - "startEnvWatcher() — chokidar watcher de .env/.env.local com debounce 250ms + diff MCP_SERVER_*"
  - "POST /internal/mcp-client/reload — re-roda mcpManager.reload(), retorna McpClientStatus"
  - "GET /internal/mcp-client/status — leitura passiva de mcpManager.getStatus()"
  - "NATIVE_TOOL_NAMES exportado de session/native-tool-names.ts (single source of truth)"
  - "IPC handlers MCP_CLIENT_RELOAD/GET_STATUS com broadcast McpClientStatus a todas BrowserWindows"
  - "window.mcp.onClientStatusChanged (push subscription) no preload bridge"
  - "McpSection sub-bloco 'Cliente MCP' (status pt-BR + botão Reconectar + IPC subscription)"
affects:
  - "apps/backend-ts/src/index.ts (boot wire-in: import + startEnvWatcher após reload inicial)"
  - "apps/backend-ts/src/app.ts (mount /internal/mcp-client)"
  - "apps/desktop/src/main/ipc/mcp-settings.ts (Phase 64 handlers preservados, +2 novos)"
  - "apps/desktop/src/preload/settings.ts (extends window.mcp com onClientStatusChanged)"
tech-stack:
  added: []
  patterns:
    - "chokidar awaitWriteFinish 200ms + debounce 250ms para absorver atomic-save (unlink+add)"
    - "Refresh process.env in-place dentro do watcher antes de onChange (Pitfall 2)"
    - "Backend route /internal/* não proxied pelo gateway (mesmo padrão Phase 57 reload-llm)"
    - "AbortSignal.timeout(8s) em reload + 2s em getStatus (T-65-09 mitigation)"
    - "BrowserWindow.getAllWindows() + isDestroyed() guard para multi-window broadcast"
    - "window.mcp self-contained subscription em McpSection (não toca SettingsLayout contract)"
key-files:
  created:
    - "apps/backend-ts/src/config/env-watcher.ts"
    - "apps/backend-ts/src/config/__tests__/env-watcher.test.ts"
    - "apps/backend-ts/src/routes/mcp-client.ts"
    - "apps/backend-ts/src/session/native-tool-names.ts"
  modified:
    - "apps/backend-ts/src/app.ts"
    - "apps/backend-ts/src/index.ts"
    - "apps/desktop/src/main/ipc/mcp-settings.ts"
    - "apps/desktop/src/preload/settings.ts"
    - "apps/desktop/src/renderer/src/settings/sections/McpSection.tsx"
decisions:
  - "Extrair NATIVE_TOOL_NAMES para session/native-tool-names.ts: single source compartilhado entre boot e /internal/mcp-client/reload — evita duplicação e drift"
  - "Watcher vive pelo lifetime do processo (sem capturar stop fn): graceful shutdown deferred"
  - "onClientStatusChanged adicionado direto ao window.mcp (não no SettingsApi.mcp type): McpRendererApi extends NonNullable<SettingsApi['mcp']> mantém TS strict sem alterar contrato Plan 01"
  - "(window as unknown as { mcp?: McpWindowApi }) cast leaf-component em McpSection: evita Window declare global em renderer types — preload bridge já é o source of truth"
  - "Mensagens de status pt-BR conforme D-10: 'Conectado a {NAME}: {N} tools' / 'Conectando…' / 'Erro: ...' / 'Não conectado'"
metrics:
  duration_minutes: 8
  tasks_completed: 6
  tasks_total: 6
  completed_date: "2026-05-09"
  commits: 6
  tests_added: 3
  files_created: 4
  files_modified: 5
---

# Phase 65 Plan 03: MCP Client Hot-Reload + Settings UI Summary

Skin de hot-reload completa do MCP client: chokidar watcher .env (D-09) → backend /internal/mcp-client/{reload,status} → Electron IPC com broadcast → preload bridge com push subscription → sub-bloco "Cliente MCP" em McpSection (D-10) com status label pt-BR + botão Reconectar — entregando MCP-CLI-01 e MCP-CLI-02 com 3 testes integração cobrindo SC1.

## What Shipped

**Task 1 — env-watcher chokidar (commit `9fa1d3a`)**
- `apps/backend-ts/src/config/env-watcher.ts` (93 linhas): `startEnvWatcher(onChange, opts)` retorna stop function
- chokidar.watch(['.env', '.env.local']) com `cwd: projectRoot`, `ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }`
- Debounce 250ms (`ENV_WATCHER_DEBOUNCE_MS`) absorve atomic-save (unlink+add) num único reload (Pitfall 3)
- Diff via `snapshotMcpVars/diffMcpVars` (Plan 02): só dispara onChange se MCP_SERVER_* mudou
- Pitfall 2: muta `process.env` para as 3 keys antes de onChange (mcpManager.configFromEnv lê de process.env)
- T-65-01: log apenas o `path` relativo, nunca conteúdo/valores
- 3 integração tests com tmpdir + chokidar real:
  - "MCP_SERVER_URL change triggers reload (SC1)" → onChange chamado 1×
  - "non-MCP change ignored" → onChange NÃO chamado em mudança de LLM_PROVIDER
  - "atomic save (unlink+add <100ms) debounced to single reload" → onChange ≤ 1×

**Task 2 — Rota /internal/mcp-client + extrair NATIVE_TOOL_NAMES (commit `9821b28`)**
- `apps/backend-ts/src/session/native-tool-names.ts`: single source com 14 tool names nativos
- `apps/backend-ts/src/index.ts`: substitui declaração inline por `import { NATIVE_TOOL_NAMES } from './session/native-tool-names.js'`
- `apps/backend-ts/src/routes/mcp-client.ts` (36 linhas): `createMcpClientRouter(toolLogger)` exporta 2 endpoints
  - `POST /mcp-client/reload`: `mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger)` → retorna `getStatus()`
  - `GET /mcp-client/status`: retorna `mcpManager.getStatus()` (leitura passiva)
- `apps/backend-ts/src/app.ts`: monta `app.use("/internal", createMcpClientRouter(opts.toolLogger))` quando toolLogger presente
- Plan 02 tests permanecem 100% green (77 tests) após refactor

**Task 3 — Wire env-watcher no boot (commit `eacdf35`)**
- `index.ts` import `startEnvWatcher` de `./config/env-watcher.js`
- Chamada wired AFTER `await mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger)` inicial (linha 73)
- Chamada wired BEFORE `app.listen(...)` (linha 99)
- Callback re-invoca `mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger)` ao detectar MCP_SERVER_* change
- Watcher vive pelo lifetime do processo (graceful shutdown deferred — não em escopo de Phase 65)
- D-11: novos tools ficam ativos no PRÓXIMO ChatSession (snapshot estável mid-turn)

**Task 4 — IPC handlers MCP_CLIENT_RELOAD/GET_STATUS (commit `f9ce06a`)**
- `apps/desktop/src/main/ipc/mcp-settings.ts`: Phase 64 handlers preservados; +2 novos
- `MCP_CLIENT_RELOAD`: `fetch POST http://localhost:8001/internal/mcp-client/reload` + `AbortSignal.timeout(8_000)` (T-65-09)
- `MCP_CLIENT_GET_STATUS`: `fetch GET /status` + `AbortSignal.timeout(2_000)`
- `broadcastClientStatus()`: `BrowserWindow.getAllWindows().forEach(win => !win.isDestroyed() && win.webContents.send(STATUS_CHANGED, status))`
- Em erro de fetch ou backend !ok: retorna `McpClientStatus` com `status='error'` tipado e propaga via broadcast
- T-65-10 accept: error message de backend (ECONNREFUSED, "Invalid URL", etc.) sai para renderer — bearer não atravessa por design (manager.ts nunca inclui em error.message)

**Task 5 — Preload bridge onClientStatusChanged (commit `fffa90d`)**
- `apps/desktop/src/preload/settings.ts`: adiciona `MCP_CLIENT_STATUS_CHANGED_CHANNEL` constant
- `McpRendererApi extends NonNullable<SettingsApi['mcp']>` adiciona `onClientStatusChanged: (cb) => () => void`
- `ipcRenderer.on(STATUS_CHANGED, handler)` + retorna unsubscribe que remove o listener (mesmo padrão de `onStreamingTtsChanged` Phase 53)
- `contextBridge.exposeInMainWorld('mcp', mcpWithSubscription)` — única chamada (sem duplicata)
- Plan 01 já tinha registrado `reloadClient`/`getClientStatus` no preload — esta task só adicionou push subscription

**Task 6 — Sub-bloco "Cliente MCP" em McpSection (commit `fd960d4`)**
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx`: prop signature INALTERADA (4 fields)
- Sub-bloco "Servidor MCP" (Phase 64) preservado intacto
- Novo sub-bloco "Cliente MCP":
  - Status carregado on-mount via `window.mcp.getClientStatus()`
  - `useEffect` subscribe em `window.mcp.onClientStatusChanged()` com cleanup correto via unsubscribe
  - Botão "Reconectar" → `window.mcp.reloadClient()` com loading state ("Reconectando…")
  - `formatClientStatusLabel()`: "Conectado a {NAME}: {N} tools" | "Conectando…" | "Erro: ..." | "Não conectado" (D-10 pt-BR)
  - `data-testid="mcp-client-status"` para futuros e2e tests
  - Helper text explicando configuração via `.env`
- Acesso via `(window as unknown as { mcp?: McpWindowApi }).mcp` — leaf-component cast, sem Window declare global

## Verification Results

| Check | Result |
| --- | --- |
| `pnpm test src/config/__tests__/env-watcher.test.ts -- --run` | 1 file / 3 tests passed |
| `pnpm test src/mcp/client/__tests__ src/session/chat-session.test.ts src/memory/store.test.ts -- --run` | 7 files / 80 tests passed (Plan 02 todos green após refactor) |
| `npx tsc --noEmit` em backend-ts | 0 novos erros (apenas pré-existentes em `mcp/tools/{file-actions,memory}.ts` Phase 64) |
| `npx tsc --noEmit` em desktop | 0 novos erros nos arquivos Phase 65 (`mcp-settings.ts`, `preload/settings.ts`) |
| `grep "ENV_WATCHER_DEBOUNCE_MS = 250" env-watcher.ts` | matches |
| `grep -E "watcher.on\('change'\|watcher.on\('add'\|watcher.on\('unlink'" env-watcher.ts` | 3 matches (todos eventos cobertos) |
| `grep "import { NATIVE_TOOL_NAMES }" index.ts` | matches (refatorado de inline) |
| `grep "const NATIVE_TOOL_NAMES" index.ts` | empty (declaração inline removida) |
| `grep "router.post.*'/mcp-client/reload'" routes/mcp-client.ts` | matches |
| `grep "router.get.*'/mcp-client/status'" routes/mcp-client.ts` | matches |
| `awk` ordering check | reload@73 < watcher@82 < listen@99 in index.ts ✓ |
| `grep "BrowserWindow.getAllWindows()" mcp-settings.ts` | matches |
| `grep "isDestroyed()" mcp-settings.ts` | matches (defensive guard Phase 52+) |
| `grep -c "internal/mcp-client" mcp-settings.ts` | 2 (reload + status fetch URLs) |
| `grep "MCP_CLIENT_STATUS_CHANGED_CHANNEL = 'mcp-client:status-changed'" preload/settings.ts` | matches |
| `grep -c "exposeInMainWorld('mcp'" preload/settings.ts` | 1 (sem duplicata) |
| `grep "Cliente MCP\|Reconectar\|Reconectando\|Conectado a\|Não conectado\|onClientStatusChanged\|reloadClient\|getClientStatus" McpSection.tsx` | todas matches |
| `grep "Servidor MCP" McpSection.tsx` | matches (Phase 64 preservado) |

## Deviations from Plan

### Auto-fixed Issues

**Nenhum auto-fix novo nos arquivos Plan 03.**

Os fixes que tentei aplicar em McpSection.tsx (variant `as const`, void-wrapped onClick) eram tentativas de mitigar 2 erros TS — mas após inspeção via `git stash` confirmei que esses erros **eram pré-existentes** (mesma assinatura aparece em KokoroSection.tsx Phase 62, AlwaysListeningSection.tsx) por configuração TS strict do projeto que rejeita `variant: string` quando o ternário não é literal. Out-of-scope per scope boundary rules — revertido para o style consistente com Sections vizinhos (já documentadas no Phase 64 SUMMARY como pré-existing).

### Out-of-scope Discovery (NÃO corrigido, deferido)

**1. Pre-existing TS errors em McpSection.tsx (linhas 105 e 130) — `error TS2322` em `<Button variant={...}>` quando o variant é resultado de ternário.** Mesmo padrão aparece em KokoroSection.tsx (commit cb2bbb9 / Phase 62) e AlwaysListeningSection.tsx — projeto-wide. Logado para awareness.

**2. Pre-existing TS errors em `apps/backend-ts/src/mcp/tools/{file-actions,memory}.ts` (Phase 64)** — `error TS2769`. Já documentado no Plan 02 SUMMARY. Out-of-scope confirmado.

**3. Pre-existing build error: `Rollup failed to resolve import "open" from main/actions/file-actions.ts`** — Phase 58 dependency missing no electron-vite build config. Out-of-scope; afeta apenas `electron-vite build`, não dev mode (`tsx/esm` resolve em runtime).

## Threat Model Updates

**T-65-01** (Information disclosure via env-watcher logs) — **mitigado**. `env-watcher.ts` loga apenas o `path` relativo (`.env` ou `.env.local`), nunca `next` snapshot ou conteúdo. Verificado por inspeção.

**T-65-03** (DoS via thrashing reloads) — **mitigado**. Debounce 250ms + `diffMcpVars` filtram. Tests "non-MCP change ignored" + "atomic save debounce" confirmam o comportamento end-to-end com chokidar real.

**T-65-08** (Localhost client could call /internal/mcp-client/reload) — **accept** per plan. `/internal/*` não é proxied pelo gateway; mesmo modelo de risco de Phase 57 reload-llm. JARVIS é app local single-user.

**T-65-09** (Renderer holds reloadClient forever on hung backend) — **mitigado**. `AbortSignal.timeout(8_000)` em reload + 2_000 em getStatus. Em timeout, retorna McpClientStatus com `status='error'` + `error: 'The operation was aborted due to timeout'` e broadcasta para todas as windows.

**T-65-10** (McpClientStatus could leak backend error details) — **accept**. `error` field expõe strings tipo "ECONNREFUSED", "Invalid URL", "fetch failed" — não são secrets. Bearer token não atravessa: `manager.ts` (Plan 02) nunca inclui em `error.message`. Verificado por code review do tool-adapter e manager.

## Known Stubs

Nenhum. Todos os artefatos são funcionais end-to-end:
- env-watcher dispara em mudanças reais de .env
- Rota /internal/mcp-client/{reload,status} retorna JSON válido tipado
- IPC handlers fazem fetch real e broadcast real
- McpSection chama window.mcp APIs reais

Verification manual completa em Plan 04 (human-verify checkpoint).

## Threat Flags

Nenhum. Todas as superfícies novas (chokidar fs.read, /internal/mcp-client routes, IPC fetch) já estão cobertas pelo `<threat_model>` do plano.

## Self-Check: PASSED

- ✓ `apps/backend-ts/src/config/env-watcher.ts` existe — 93 linhas, exporta `startEnvWatcher`, `ENV_WATCHER_DEBOUNCE_MS`
- ✓ `apps/backend-ts/src/config/__tests__/env-watcher.test.ts` existe — 3 tests integração
- ✓ `apps/backend-ts/src/routes/mcp-client.ts` existe — 36 linhas, exporta `createMcpClientRouter`
- ✓ `apps/backend-ts/src/session/native-tool-names.ts` existe — exporta `NATIVE_TOOL_NAMES` ReadonlySet com 14 nomes
- ✓ `apps/backend-ts/src/index.ts` modificado — import + startEnvWatcher() chamado
- ✓ `apps/backend-ts/src/app.ts` modificado — mount do mcp-client router
- ✓ `apps/desktop/src/main/ipc/mcp-settings.ts` modificado — 2 novos handlers + broadcast
- ✓ `apps/desktop/src/preload/settings.ts` modificado — onClientStatusChanged exposta
- ✓ `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` modificado — sub-bloco "Cliente MCP"
- ✓ Commits no `git log`: `9fa1d3a`, `9821b28`, `eacdf35`, `f9ce06a`, `fffa90d`, `fd960d4` (6 commits)
- ✓ Todos os 80 tests verdes (3 novos env-watcher + 77 herdados Plan 02 ainda green)
- ✓ Sem novos erros TS em arquivos Phase 65 Plan 03 (pre-existing errors logados como out-of-scope)
- ✓ Acceptance criteria de cada Task verificados via grep direto nos arquivos finais
