---
phase: 65-mcp-client
plan: 02
subsystem: mcp-client-core
tags: [mcp, langchain, tool-adapter, audit, security]
requires:
  - "@modelcontextprotocol/sdk@1.29.0 (Phase 64)"
  - "@n8n/json-schema-to-zod@1.9.0 (Plan 01)"
  - "dotenv@^17.4.2 (Plan 01)"
  - "Plan 01 IPC contracts (McpClientStatus type)"
provides:
  - "McpClientManager singleton (mcpManager) com connect-with-fallback (StreamableHTTP→SSE)"
  - "buildLangChainTool — converter MCP tool def em LangChain StructuredToolInterface com Zod runtime"
  - "snapshotMcpVars/diffMcpVars — pure helpers para watcher do Plan 03"
  - "ToolLogger.logDispatch estendido com metadata opcional (D-15)"
  - "ChatSession allTools spread com mcpManager.getTools() (create + swapLLM)"
  - "Bootstrap MCP client em index.ts antes de ChatSession.create()"
affects:
  - "apps/backend-ts/src/memory/store.ts (logDispatch +metadata arg, additivo)"
  - "apps/backend-ts/src/session/chat-session.ts (allTools spread × 2)"
  - "apps/backend-ts/src/session/chat-session.test.ts (legacy 11→14 tools + 2 novos tests Phase 65)"
  - "apps/backend-ts/src/index.ts (mcpManager.reload() boot wire-in)"
  - "apps/backend-ts/vitest.config.ts (workaround ESM dist do @n8n/json-schema-to-zod)"
tech-stack:
  added: []
  patterns:
    - "Class-based mocks em vi.hoisted() para 'new Client()' (vi.fn como factory falha como constructor no Vitest 4)"
    - "Metadata audit via _meta key dentro de paramsJson (evita colisão com tool args legítimos)"
    - "Connect-with-fallback timeout via Promise.race (5s/attempt) sem auto-retry"
    - "Snapshot estável: getTools() sempre retorna mesma referência entre calls"
    - "vitest server.deps.inline para resolver imports ESM sem extensão (.js) em deps de terceiros"
key-files:
  created:
    - "apps/backend-ts/src/mcp/client/manager.ts"
    - "apps/backend-ts/src/mcp/client/tool-adapter.ts"
    - "apps/backend-ts/src/mcp/client/env-diff.ts"
    - "apps/backend-ts/src/mcp/client/__tests__/manager.test.ts"
    - "apps/backend-ts/src/mcp/client/__tests__/tool-adapter.test.ts"
    - "apps/backend-ts/src/mcp/client/__tests__/env-diff.test.ts"
    - "apps/backend-ts/src/mcp/client/__tests__/e2e-mock-server.test.ts"
    - "apps/backend-ts/src/mcp/client/__tests__/fixtures/mock-server.ts"
  modified:
    - "apps/backend-ts/src/memory/store.ts"
    - "apps/backend-ts/src/session/chat-session.ts"
    - "apps/backend-ts/src/session/chat-session.test.ts"
    - "apps/backend-ts/src/index.ts"
    - "apps/backend-ts/vitest.config.ts"
decisions:
  - "Bootstrap mcpManager.reload() ANTES de ChatSession.create() — garante que tools externas apareçam no snapshot inicial; se viesse depois, primeiro turno não teria as tools"
  - "Compartilhar a mesma ToolLogger instance entre mcpManager e ChatSession — single source of truth para audit log"
  - "Atualizar teste legacy `toHaveLength(11)` para 14 tools — Phase 59 tinha quebrado o teste mas isso só apareceu rodando os tests do Phase 65 (Rule 1 fix)"
  - "vitest.config.ts server.deps.inline para @n8n/json-schema-to-zod — ESM dist tem imports relativos sem .js (bug upstream); workaround sem precisar fork/patch"
  - "Class-based ctor mocks em vi.hoisted() — vi.fn(factory) não funciona como constructor no Vitest 4 (verificado em isolated test)"
metrics:
  duration_minutes: 25
  tasks_completed: 6
  tasks_total: 6
  completed_date: "2026-05-09"
  commits: 6
  tests_added: 37
  files_created: 8
  files_modified: 5
---

# Phase 65 Plan 02: MCP Client Core Summary

McpClientManager singleton conecta-se a 1 servidor MCP via HTTP (Streamable + fallback SSE), descobre tools via listTools() e expõe ao agente LangGraph como parte do allTools — implementando MCP-CLI-01/02/03 e SC3 com timeout 30s, erro pt-BR estruturado e audit via ToolLogger marcado com source=mcp-external.

## What Shipped

**Task 1 — ToolLogger.logDispatch estendido (commit `e24c030`)**
- 3º arg `metadata?: Record<string, unknown>` opcional, mesclado em paramsJson sob `_meta` key (D-15)
- Aditivo: callers existentes (Phases 17/18/54/55) inalterados
- 19 store tests verdes; 12 callers tests verdes

**Task 2 — env-diff pure helpers (commit `b412e41`)**
- `snapshotMcpVars(envText, localText?)` extrai 3 vars MCP_SERVER_* via dotenv.parse()
- `diffMcpVars(prev, next)` compara snapshots — true sse alguma das 3 vars mudou
- `WATCHED_KEYS` readonly tuple — defensivo contra keys fora do escopo
- `.env.local` overrides `.env` (semântica Node --env-file)
- 10 unit tests verdes

**Task 3 — tool-adapter.ts (commit `eb657d6`)**
- `buildLangChainTool(def, serverName, client, nativeNames, logger)` → `StructuredToolInterface | null`
- D-05: prefixo `${serverName}.${name}`
- D-06: collision check (prefixed e raw — defensivo) → null + warn
- D-07: description anotada `[via NAME] original`
- D-15: ToolLogger.logDispatch com metadata `{source:'mcp-external', serverName}` em sucesso E erro
- D-16: erro pt-BR estruturado `MCP server NAME indisponível — tool X não pôde executar agora (cause)`
- D-17: timeout 30s via Promise.race; mensagem inclui `30000ms`
- @n8n/json-schema-to-zod converte JSON Schema → Zod schema runtime preservando required fields
- 11 unit tests verdes
- vitest.config.ts: `server.deps.inline = ['@n8n/json-schema-to-zod']` workaround para ESM dist com imports sem extensão `.js`

**Task 4 — McpClientManager singleton (commit `671f0ff`)**
- `configFromEnv()` lê 3 vars; null quando MCP_SERVER_URL ausente
- D-02: boot silencioso — log info `[mcp-client] disabled: MCP_SERVER_URL not configured` quando URL ausente
- D-03: invalid URL → status=error, lastError set, backend continua
- `_connectWithFallback`: StreamableHTTP primeiro; se falhar, tenta SSE (Pitfall 4)
- D-13: 5s timeout por attempt via Promise.race
- D-08: registra TODAS tools de listTools() (sem allowlist no MVP)
- D-06 collision check integrado: tools em colisão pulladas (warn)
- `getTools()` síncrono — sempre devolve a mesma referência entre calls (D-11 ready)
- `getStatus()` shape compatível com `McpClientStatus` IPC type (Plan 01)
- `_safeClose()` best-effort para idempotência
- Pitfall 7: bearer NUNCA em console (apenas url+name+count)
- Singleton `mcpManager` exportado para wire-in
- 13 unit tests verdes

**Task 5 — Wire ChatSession + index.ts (commit `27ed2d9`)**
- `chat-session.ts:195` (create) e `:247` (swapLLM) — spread `...mcpManager.getTools()` em allTools
- D-11: snapshot estável — agent ReAct reusa snapshot, reload mid-turn não rebuilda
- `index.ts`: bootstrap `mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger)` ANTES de ChatSession.create() para snapshot inicial conter tools externas
- ToolLogger compartilhado entre manager e session via `opts.toolLogger`
- NATIVE_TOOL_NAMES Set hardcoded com 14 nomes (recall_memory + 12 PC tools + analyze_screen)
- Catch defensivo (manager.reload nunca throws por design)
- 2 novos chat-session tests Phase 65 (MCP-CLI-02 spread + D-11 snapshot stability)
- 21 chat-session tests verdes (incl. legacy assertion atualizada de 11 → 14 tools)

**Task 6 — Mock server fixture + e2e tests (commit `19ec0b9`)**
- `fixtures/mock-server.ts`: `createMockMcpServer()` com `setTools` + `setCallToolHandler`
- `e2e-mock-server.test.ts`: 3 testes integrados manager + tool-adapter + Zod runtime real
- SC2 verification: agent invoke chama `client.callTool` com original (unprefixed) name e propaga text content
- D-06 integrado: native names Set descarta tool em colisão após listTools
- Real Zod schema rejeita missing required ANTES de invocar callTool

## Verification Results

| Check | Result |
| --- | --- |
| `pnpm test src/mcp/client/__tests__ -- --run` | 4 files / 37 tests passed |
| `pnpm test src/session/chat-session.test.ts -- --run` | 1 file / 21 tests passed |
| `pnpm test src/memory/store.test.ts -- --run` | 1 file / 19 tests passed |
| `pnpm test src/session/tools.test.ts src/session/request-file-action.test.ts -- --run` | 2 files / 12 tests passed |
| `npx tsc --noEmit` em Phase 65 files | sem novos erros |
| `grep -c "mcpManager.getTools()" chat-session.ts` | 3 (1 comment + 2 usages) |
| `grep "mcpManager.reload" index.ts` | matches |
| Token leak grep (`console.*cfg.bearer\|requestInit`) | empty (T-65-01 mitigado) |

Pre-existing TS errors in `src/mcp/tools/file-actions.ts` and `src/mcp/tools/memory.ts` from Phase 64 — confirmed pre-existing via `git stash` baseline; out of scope per scope boundary rules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest server.deps.inline para @n8n/json-schema-to-zod**
- **Found during:** Task 3 (primeiro run dos tests)
- **Issue:** Vitest 4 / Node ESM strict rejeita o ESM dist do `@n8n/json-schema-to-zod@1.9.0` porque `dist/esm/index.js` tem `export { ... } from './json-schema-to-zod'` (sem extensão `.js`). Bug upstream — `tsx/esm` resolve em runtime, mas vitest puro não.
- **Fix:** `vitest.config.ts` recebeu `test.server.deps.inline: ['@n8n/json-schema-to-zod']` para forçar resolução pelo Vite (que aceita extensão implícita). Em runtime/produção o `tsx/esm` (dev) e o build TS (prod via `node`) usam outras estratégias — investigar antes de Plan 03/04 se aparecer regressão em build/prod (não é o caso agora pois o backend roda via `--import tsx/esm`).
- **Files modified:** `apps/backend-ts/vitest.config.ts` (+5 lines)
- **Commit:** `eb657d6` (combinado com Task 3)

**2. [Rule 1 - Bug] Atualizado assertion legacy `toHaveLength(11)` → `toHaveLength(14)` em chat-session.test.ts**
- **Found during:** Task 5 (rodando chat-session.test.ts)
- **Issue:** Teste pré-existente esperava 11 tools nativas (estado v1.3); Phase 59 adicionou `adjust_volume`, `toggle_mute`, `media_control` mas o teste não foi atualizado. Verificado via `git stash` que o teste já falhava antes do Phase 65. Era precondição para validar os novos tests Phase 65.
- **Fix:** Atualizado para 14 tools nativas e expandido o array de toolNames sorted com `'adjust_volume', 'media_control', 'toggle_mute'`.
- **Files modified:** `apps/backend-ts/src/session/chat-session.test.ts` (+5 lines, -2 lines)
- **Commit:** `27ed2d9` (combinado com Task 5)

**3. [Rule 3 - Blocking] vi.hoisted() com classes em vez de vi.fn(factory) para constructors**
- **Found during:** Task 4 (manager.test.ts primeiro run)
- **Issue:** `vi.fn(() => ({...}))` no Vitest 4 não funciona como constructor — `new Ctor()` lança "is not a constructor". Verificado via teste isolado.
- **Fix:** Inline classes `ClientCtorMock`, `StreamableTransportCtor`, `SSETransportCtor` dentro do `vi.hoisted()` factory, com `vi.fn()` spies separados (`*CtorSpy`) para inspeção via `toHaveBeenCalledOnce()`. Mesmo pattern aplicado no e2e test (Task 6).
- **Files modified:** `apps/backend-ts/src/mcp/client/__tests__/manager.test.ts`, `apps/backend-ts/src/mcp/client/__tests__/e2e-mock-server.test.ts`
- **Commits:** `671f0ff`, `19ec0b9`

### Out-of-scope Discovery (NOT fixed, deferred)

**Pre-existing TS errors em apps/backend-ts/src/mcp/tools/{file-actions,memory}.ts** (Phase 64) — `error TS2769: No overload matches this call`. Confirmado pre-existing via `git stash` baseline. Logado aqui para awareness; não é Phase 65 blocker.

## Threat Model Updates

**T-65-01** (Bearer token leak via console.log) — **mitigado**. Verificado por grep: nenhum `console.*` em `manager.ts` referencia `cfg.bearer` ou `requestInit`. Fallback log (StreamableHTTP→SSE) usa apenas `(httpErr as Error).message`.

**T-65-04** (malicious tool def shadowing native) — **mitigado**. Verificação via tests: tool-adapter Test 4/5 e manager Test "collision skip" garantem que prefixed e raw name matches são caught.

**T-65-05** (DoS via hung server) — **mitigado**. tool-adapter timeout 30s (D-17) com `vi.useFakeTimers` em Test 11; manager connect timeout 5s (D-13) com `vi.advanceTimersByTimeAsync` em Test 12.

**T-65-06** (LLM hallucinated tool name) — **accept** per plan; LangGraph filtra no runtime.

**T-65-07** (PII em audit log) — **accept** per plan; mesma situação para tools nativas desde Phase 18.

## Known Stubs

Nenhum. Todos os artefatos são funcionais — Plan 03 (env watcher + IPC + UI) consome `mcpManager.reload()` e `getStatus()` através do que ficou pronto aqui.

## Threat Flags

Nenhum. Todas as superfícies novas (apenas backend, sem IPC novo neste plan) já estão cobertas pelo `<threat_model>` do plano.

## Self-Check: PASSED

- ✓ `apps/backend-ts/src/mcp/client/manager.ts` existe — 169 linhas, exporta `McpClientManager`, `mcpManager`, `CONNECT_TIMEOUT_MS`
- ✓ `apps/backend-ts/src/mcp/client/tool-adapter.ts` existe — 108 linhas, exporta `buildLangChainTool`, `TOOL_TIMEOUT_MS`, `McpToolDef`
- ✓ `apps/backend-ts/src/mcp/client/env-diff.ts` existe — 46 linhas, exporta `snapshotMcpVars`, `diffMcpVars`, `WATCHED_KEYS`
- ✓ Todos os 4 test files + fixture existem
- ✓ Commits `e24c030`, `b412e41`, `eb657d6`, `671f0ff`, `27ed2d9`, `19ec0b9` em `git log`
- ✓ Todos os 37 tests do Phase 65 client passam
- ✓ chat-session.test.ts (21 tests) verde — incl 2 novos Phase 65
- ✓ memory/store.test.ts (19 tests) verde — additive change não quebrou callers
- ✓ Sem novos erros TS em arquivos do Phase 65 (pre-existing TS errors em mcp/tools/* logados como out-of-scope)
- ✓ Token leak grep empty (T-65-01 mitigado)
