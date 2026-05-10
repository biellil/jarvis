---
phase: 67-jarvis-proativo
plan: "07"
subsystem: proactive-route-bootstrap
tags: [sse, express, router, bootstrap, node-cron, folder-watcher, quiet-hours, tdd, wave-2]
dependency_graph:
  requires:
    - 67-03 (proactiveEmitter + ProactiveScheduler com bootstrap/setLlm/updateQuietHours)
    - 67-05 (FolderWatcher com startWatching/stopWatching)
    - 67-06 (ProactiveScheduler.setLlm + generateAndEmitDailySummary implementado)
  provides:
    - createProactiveRouter: SSE /stream + POST /:id/ack + POST /quiet-hours + POST /folder-watch
    - Bootstrap wiring completo em index.ts (bootstrap + setLlm + registerDailySummaryJob)
    - Montagem em app.ts em /api/proactive e /api/settings
  affects:
    - 67-08 (IPC bridge Electron que consome /api/proactive/stream via EventSource)
tech_stack:
  added: []
  patterns:
    - SSE com flushHeaders + proactiveEmitter.on/off + heartbeat 30s + cleanup req.on('close')
    - Dependency injection de IFolderWatcher em createProactiveRouter(watcher) para testabilidade
    - http nativo para teste SSE de emissão de evento (evita supertest double callback bug)
    - isBlockedSystemPath com lista de prefixos de sistema (T-67-03)
    - parseInt + isNaN guard para validação de ID numérico (T-67-04)
key_files:
  created:
    - apps/backend-ts/src/routes/proactive.ts
  modified:
    - apps/backend-ts/src/routes/__tests__/proactive.route.test.ts
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/index.ts
decisions:
  - DI pattern em createProactiveRouter(watcher) evita mock de construtor FolderWatcher nos testes
  - folderWatcher singleton exportado de proactive.ts — app.ts usa sem argumento (padrão de produção)
  - http nativo em vez de supertest para teste SSE — supertest .parse() causa double callback bug
  - isBlockedSystemPath lista explícita de prefixos Unix+Windows — simples, sem regex, auditável
  - ProactiveScheduler.registerDailySummaryJob('09:00') default em index.ts — Electron sobrescreve via POST /api/settings ao conectar (Plan 67-08)
  - app.use('/api/settings', createProactiveRouter()) cria segunda instância do router — os endpoints /quiet-hours e /folder-watch ficam acessíveis em /api/settings/* conforme spec
metrics:
  duration_seconds: 420
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_created: 1
  files_modified: 3
requirements:
  - PROACT-01
  - PROACT-02
  - PROACT-03
  - PROACT-05
  - PROACT-06
---

# Phase 67 Plan 07: SSE Route + Bootstrap Wiring

**One-liner:** createProactiveRouter com SSE /stream + ack + quiet-hours + folder-watch endpoints; bootstrap wiring em index.ts com ProactiveScheduler.bootstrap/setLlm/registerDailySummaryJob; montagem em app.ts.

## Summary

Wave 2 do JARVIS Proativo: conecta todos os módulos do backend (ProactiveScheduler, FolderWatcher, DailySummaryGenerator) à camada HTTP via SSE e settings endpoints, e inicializa o scheduler no boot do processo.

**O que foi feito:**

1. **routes/proactive.ts** — `createProactiveRouter(watcher?)` com 4 endpoints:
   - `GET /stream`: SSE com `Content-Type: text/event-stream`, heartbeat 30s, `proactiveEmitter.on('event', handler)`, cleanup `req.on('close')`. Formato: `event: proactive:fire\ndata: {json}\n\n`
   - `POST /:id/ack`: `parseInt` + `isNaN` guard (T-67-04), Drizzle `update(reminders).set({status:'fired'})` idempotente
   - `POST /quiet-hours`: `ProactiveScheduler.updateQuietHours(enabled, start, end)` delegado
   - `POST /folder-watch`: `fs.existsSync` + `isBlockedSystemPath` (T-67-03), `watcher.startWatching/stopWatching`

2. **Proactive route tests** — 11 testes cobrindo todos os endpoints:
   - SSE: Content-Type, emissão de evento, cleanup de listener
   - Ack: 200 para id válido, 400 para id não-numérico
   - Quiet-hours: 200 com updateQuietHours chamado, enabled:false
   - Folder-watch: 200 + startWatching, 400 path inexistente, 200 + stopWatching, 400 system path

3. **app.ts** — Monta `createProactiveRouter()` em `/api/proactive` e `/api/settings`

4. **index.ts** — Bootstrap completo após migrações e ChatSession:
   - `ProactiveScheduler.bootstrap()` após `runMigrations()`
   - `ProactiveScheduler.setLlm(session.llm)` após `ChatSession.create()`
   - `ProactiveScheduler.registerDailySummaryJob('09:00')` com horário padrão

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| Task 1 (RED) | `87a31a3` | 11 testes RED→GREEN para proactive route |
| Task 1 (GREEN) | `8281ce5` | createProactiveRouter implementado |
| Task 2 | `cf9f82c` | bootstrap wiring app.ts + index.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] DI pattern para FolderWatcher em vez de mock de construtor**

- **Found during:** Task 1 RED — `vi.fn().mockImplementation(() => ({...}))` usa arrow function que não é construtora; `new FolderWatcher()` lançava `TypeError: () => ({...}) is not a constructor`
- **Issue:** O plano especificava mock do módulo `folder-watcher.js` para substituir o construtor, mas Vitest 4.x requer `function` keyword (não arrow) em `mockImplementation` para uso com `new`. Arrow functions não são construtoras por especificação ES6.
- **Fix:** `createProactiveRouter` aceita um parâmetro opcional `watcher: IFolderWatcher` (DI). Testes passam um objeto mock diretamente sem precisar mockar o construtor. Produção usa o singleton `folderWatcher` exportado do módulo (default parameter).
- **Files modified:** `routes/proactive.ts`, `routes/__tests__/proactive.route.test.ts`
- **Commit:** `8281ce5`

**2. [Rule 1 - Bug] supertest double callback bug em teste SSE**

- **Found during:** Task 1 GREEN — teste "emits event: proactive:fire" falhou com `superagent: double callback bug` e corpo vazio
- **Issue:** O `supertest .parse()` com `_res.destroy()` chamava o callback interno duas vezes (uma ao destruir, outra no evento `end`), causando body vazio e warning de double callback
- **Fix:** Substituído por servidor HTTP real (`http.createServer(app).listen(0)`) + `http.get` com coleta de dados em buffer. Pattern `done()` com flag `resolved` evita chamada dupla de resolve.
- **Files modified:** `routes/__tests__/proactive.route.test.ts`
- **Commit:** `87a31a3`

## Test Results

```
Test Files  79 passed (79)
     Tests  590 passed | 1 skipped | 1 todo (592)
  Duration  25.98s
```

11 novos testes do proactive.route passam todos. Nenhuma regressão na suite completa.

## Known Stubs

Nenhum. Todos os endpoints estão implementados e testados.

## Threat Surface Scan

Novos endpoints introduzidos:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-sse-endpoint | routes/proactive.ts | GET /api/proactive/stream — conexão de longa duração; Bearer auth existente gera /api/*; binding 127.0.0.1 (sem acesso externo) |
| threat_flag: new-settings-endpoints | routes/proactive.ts | POST /api/settings/quiet-hours e /folder-watch — mitigações T-67-03/T-67-04 aplicadas conforme threat model do plano |

Mitigações T-67-02, T-67-03, T-67-04 aplicadas conforme o threat model do plano.

## Self-Check: PASSED

- FOUND: `apps/backend-ts/src/routes/proactive.ts`
- FOUND: `export function createProactiveRouter` em proactive.ts
- FOUND: `ProactiveScheduler.bootstrap()` em index.ts (linha 52)
- FOUND: `ProactiveScheduler.setLlm(session.llm)` em index.ts (linha 105)
- FOUND: `createProactiveRouter` em app.ts (linhas 10, 52, 53)
- FOUND: commit `87a31a3` (testes)
- FOUND: commit `8281ce5` (implementação)
- FOUND: commit `cf9f82c` (bootstrap)
- VERIFIED: 590/590 testes passando, 0 falhas
