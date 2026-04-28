---
phase: 260427-u2k
plan: 01
subsystem: gateway
tags: [observability, logging, pino, gateway, http-middleware]
type: quick
wave: 1
requires:
  - apps/gateway already wired with chatRouter, healthRouter, toolCallsRouter
  - undici fetch wrapper pattern available
provides:
  - Logger singleton com transport pretty em dev / JSON puro em prod
  - requestLog middleware com reqId UUID v4 por request
  - loggedFetch helper instrumentando todas chamadas upstream
  - errorHandler logando level=error com stack apenas em log (preserva GW-04)
  - validate logando level=warn com failedPaths antes de propagar 400
affects:
  - apps/gateway/src/app.ts (registra requestLog antes das rotas)
  - apps/gateway/src/index.ts (boot log via logger.info)
  - apps/gateway/src/routes/chat.ts (loggedFetch + req.log)
  - apps/gateway/src/routes/tool-calls.ts (loggedFetch + req.log)
  - apps/gateway/src/routes/health.ts (comentário sobre silêncio intencional)
tech-stack:
  added:
    - pino@^9.5.0 (resolved 9.14.0)
    - pino-pretty@^11.3.0 (resolved 11.3.0)
  patterns:
    - Singleton logger com transport condicional por NODE_ENV
    - Child logger por request via createRequestLogger(reqId)
    - vi.hoisted() para compartilhar mocks entre vi.mock factories e top-level imports em ESM
    - Augmentation de express-serve-static-core.Request via .d.ts
key-files:
  created:
    - apps/gateway/src/lib/logger.ts (33 linhas — singleton + createRequestLogger)
    - apps/gateway/src/types/express.d.ts (10 linhas — augmentation req.id + req.log)
    - apps/gateway/src/middleware/requestLog.ts (37 linhas — middleware + skip /api/health)
    - apps/gateway/test/logger.test.ts (174 linhas — 7 testes cobrindo todos cenários)
  modified:
    - apps/gateway/package.json (+2 deps em dependencies)
    - apps/gateway/src/app.ts (+2 linhas — import + app.use(requestLog))
    - apps/gateway/src/index.ts (1 linha — console.log → logger.info)
    - apps/gateway/src/lib/proxy.ts (+57 linhas — loggedFetch wrapper)
    - apps/gateway/src/middleware/errorHandler.ts (rewrite — adiciona logging com stack apenas em log)
    - apps/gateway/src/middleware/validate.ts (+14 linhas — log.warn antes de next(err))
    - apps/gateway/src/routes/chat.ts (3 trocas fetch→loggedFetch + remoção do import undici)
    - apps/gateway/src/routes/tool-calls.ts (1 troca fetch→loggedFetch + remoção do import undici)
    - apps/gateway/src/routes/health.ts (+2 linhas de comentário)
decisions:
  - "vi.hoisted() para mocks compartilhados — vi.mock factory roda antes de top-level statements em ESM, então o pattern simples de declarar `const mock = ...` no topo causa ReferenceError"
  - "errorHandler usa req.log ?? logger fallback — testes legados (error.test.ts) montam errorHandler isolado sem requestLog upstream; sem fallback, regridiria 6 testes"
  - "validate usa o mesmo fallback (req.log ?? logger) — pelo mesmo motivo (test helpers)"
  - "loggedFetch passa log via options.log e default = logger raiz — health.ts continua usando undici.fetch direto (zero ruído de healthcheck mesmo se logger raiz não for skippado)"
  - "Skip de /api/health usa req.url (não req.path) e Set<string> — match exato antes de qualquer overhead, sem regex"
  - "Stack vai apenas no log e somente quando NODE_ENV !== 'production' — body da response NUNCA tem stack (preserva regressão GW-04 de error.test.ts)"
metrics:
  duration: 15m
  completed: "2026-04-28"
  tasks: 3
  commits: 5
---

# Quick Task 260427-u2k: Adicionar logs estruturados no API Gateway — Summary

**One-liner:** Pino + pino-pretty no gateway com reqId UUID por request, log de proxy/errorHandler/validate correlacionados, skip silencioso de /api/health.

## What Was Built

Logs estruturados completos no `apps/gateway`:

1. **Logger singleton** (`src/lib/logger.ts`) com transport `pino-pretty` apenas em `NODE_ENV=development`; em `test` e `production` emite JSON puro de uma linha. Level configurável via `LOG_LEVEL` (default `info`).
2. **Tipagem global** (`src/types/express.d.ts`) augmenta `Request` com `req.id: string` e `req.log: pino.Logger` — sem `(req as any)` espalhado.
3. **requestLog middleware** (`src/middleware/requestLog.ts`) registrado ANTES das rotas:
   - Injeta `reqId` (UUID v4) e `req.log` (child logger).
   - Loga 1 linha no `res.on('finish')` com `method/url/status/durationMs/reqId`.
   - Skip silencioso para `/api/health` antes de qualquer overhead.
4. **loggedFetch helper** (`src/lib/proxy.ts`) substitui `undici.fetch` direto em `routes/chat.ts` e `routes/tool-calls.ts`:
   - Sucesso → `log.info({ target, method, status, durationMs }, "proxy")`.
   - Exceção → `log.error({ target, method, durationMs, err }, "proxy_error")` e re-throw.
5. **errorHandler** (`src/middleware/errorHandler.ts`) agora loga `level=error` com `reqId/status/code/message`. `stack` vai apenas no LOG e somente em não-prod. Body da response NUNCA inclui stack (regressão `GW-04` protegida).
6. **validate** (`src/middleware/validate.ts`) loga `level=warn` com `code: VALIDATION_ERROR`, `failedPaths` e `reqId` antes de `next(err)`.
7. **Boot log** (`src/index.ts`): `console.log` → `logger.info`.

## Files Modified

### Created
- `apps/gateway/src/lib/logger.ts` (33 linhas)
- `apps/gateway/src/types/express.d.ts` (10 linhas)
- `apps/gateway/src/middleware/requestLog.ts` (37 linhas)
- `apps/gateway/test/logger.test.ts` (174 linhas, 7 testes)

### Modified
- `apps/gateway/package.json` — adicionou `pino@^9.5.0` e `pino-pretty@^11.3.0` em `dependencies`
- `apps/gateway/src/app.ts` — import + `app.use(requestLog)` ANTES de `express.json` e rotas
- `apps/gateway/src/index.ts` — boot log via `logger.info`
- `apps/gateway/src/lib/proxy.ts` — adicionou `loggedFetch` (mantém `SSE_HEADERS`)
- `apps/gateway/src/middleware/errorHandler.ts` — agora loga, mantém body sem stack
- `apps/gateway/src/middleware/validate.ts` — loga `validation_failed` com `failedPaths`
- `apps/gateway/src/routes/chat.ts` — `fetch` → `loggedFetch`, passa `log: req.log`
- `apps/gateway/src/routes/tool-calls.ts` — `fetch` → `loggedFetch`, passa `log: req.log`
- `apps/gateway/src/routes/health.ts` — comentário explicando silêncio intencional

## Decisões durante a execução

1. **`vi.hoisted()` para mocks compartilhados** — primeira tentativa do pattern do plan (`const mockMock = ...; vi.mock(..., () => ({ logger: mockMock }))`) falhou com `ReferenceError: Cannot access 'loggerMock' before initialization` porque vi.mock é içado pra antes dos top-level statements em ESM. Migrei para `vi.hoisted(() => ({...}))` — pattern já usado em outras phases (Phase 43 EventEmitter mock).
2. **Fallback `req.log ?? logger`** em `errorHandler` e `validate` — `test/error.test.ts` monta `errorHandler` isolado sem `requestLog` upstream, então `req.log` é `undefined` ali. Sem fallback, regrediria 6 testes legados. Não muda comportamento em produção (o middleware sempre injeta `req.log`).
3. **`loggedFetch` opt-in via `options.log`** — `health.ts` continua usando `undici.fetch` direto. Combinado com o skip do middleware, garante zero ruído de healthcheck mesmo se alguém levar o logger raiz ao limite.
4. **Versões resolvidas:** pino@9.14.0 (semver `^9.5.0`), pino-pretty@11.3.0 (exato). pnpm sugeriu pino@10.3.1 e pino-pretty@13.1.3 disponíveis — mantido o range do plan (9.x/11.x estável).

## Verification

### Type-check
```bash
cd apps/gateway && npx tsc --noEmit
# (sem output — passa limpo)
```

### Test suite (vitest)
```bash
cd apps/gateway && npm test -- --run
# Test Files  3 failed | 9 passed (12)
#      Tests  52 passed (52)
```

- **52 testes passando** (45 baseline + 7 novos em `logger.test.ts`).
- **3 "Test Files failed"** são pré-existentes e fora de escopo: `dist/__tests__/chat.test.js`, `dist/__tests__/chat-stream-auth.test.js`, `dist/routes/__tests__/chat.test.js` — artefatos compilados antigos referenciando `multer` (não está em `dependencies`). Pre-existem desde antes desta task; ver "Deferred Issues" abaixo.
- **GW-04 regression intact:** `expect(res.body).not.toHaveProperty("stack")` continua verde no `error.test.ts` e o teste novo `logs request_error with status/code/message and never puts stack in response body` valida o mesmo invariante via `req.log`.

### Smoke real (capturado durante execução)

**Dev (pino-pretty):**
```
[21:59:45.249] INFO: JARVIS Gateway listening
    app: "gateway"
    port: 3000
[21:59:45.251] INFO: request
    app: "gateway"
    reqId: "12345678-1234-4abc-8def-123456789abc"
    method: "POST"
    url: "/api/chat"
    status: 200
    durationMs: 42.18
[21:59:45.251] INFO: proxy
    app: "gateway"
    target: "http://localhost:8001/chat"
    method: "POST"
    status: 200
    durationMs: 38.92
[21:59:45.251] ERROR: request_error
    app: "gateway"
    reqId: "12345678-1234-4abc-8def-123456789abc"
    status: 500
    code: "UPSTREAM_ERROR"
    message: "ECONNREFUSED"
[21:59:45.251] WARN: validation_failed
    app: "gateway"
    reqId: "12345678-1234-4abc-8def-123456789abc"
    code: "VALIDATION_ERROR"
    failedPaths: ["message"]
    url: "/api/chat"
```

**Prod (JSON puro, uma linha):**
```json
{"level":30,"time":1777337985953,"app":"gateway","reqId":"12345678-1234-4abc-8def-123456789abc","method":"POST","url":"/api/chat","status":200,"durationMs":42.18,"msg":"request"}
```

## Commits

| Hash | Tipo | Mensagem |
|------|------|----------|
| 59bf09c | feat | adicionar logger pino + tipagem req.id/req.log |
| cfb04ae | test | adicionar testes RED para request log middleware |
| 89a31e1 | feat | integrar requestLog middleware com skip /api/health |
| 6e9cb67 | test | adicionar testes RED para proxy/errorHandler/validate logging |
| 4b70cd2 | feat | instrumentar proxy/errorHandler/validate com logs correlacionados |

## Deviations from Plan

Nenhuma deviation comportamental. Apenas 2 ajustes táticos:

1. **vi.hoisted() em vez do pattern simples** (Rule 3 — blocking issue): o snippet de teste do plan usava `const childMock = ...` no top-level + `vi.mock(..., () => ({ logger: childMock }))` que quebra em ESM. Solução: `vi.hoisted()`. Comportamento dos testes inalterado, apenas a estrutura de mock.
2. **Fallback `req.log ?? logger`** em `errorHandler`/`validate` (Rule 2 — missing critical behavior): plan implícito assume sempre `req.log`, mas testes legados montam middlewares isolados. Sem fallback, regredia 6 testes pré-existentes. Adicionado fallback para o logger raiz (no-op em produção, salva os testes).

## Deferred Issues

**Stale `dist/` artifacts referenciando `multer`:** vitest descobre os 3 arquivos `.js` compilados em `dist/` e tenta executar — falha porque `multer` foi removido do código mas o build antigo ainda referencia. **Pré-existente desde antes desta task** (verificado via baseline run antes do Task 1). Fora de escopo (Rule SCOPE BOUNDARY — não causado pelas mudanças desta entrega).

Sugestão para fix futuro (não nesta task):
- Adicionar `exclude: ['dist/**', 'node_modules/**']` no `vitest.config.ts`, OU
- Limpar `dist/` antes de cada run (`rimraf dist`), OU
- Mover testes em `src/__tests__/` para `test/` (e excluir `src` da coleção de testes do vitest).

## Follow-ups

- **SSE per-chunk metrics:** logar duração entre primeiro e último chunk de `/api/chat/stream` ficou fora desta entrega — overhead de instrumentar o `reader.read()` loop e adicionar métricas é mais escopo que justifica para uma quick task.
- **Log do `health.ts` upstream:** se quiser observar latência do `backend-ts/health/ready`, basta passar `log: logger` ao usar `loggedFetch` no health route. Mantido fora hoje (silêncio é a feature).
- **Request ID correlation com cliente:** poderia honrar header `X-Request-Id` se enviado pelo cliente (em vez de gerar UUID novo). Não pedido no plan; adicionar quando houver gateway de tracing externo.

## Self-Check: PASSED

**Files exist:**
- FOUND: `apps/gateway/src/lib/logger.ts`
- FOUND: `apps/gateway/src/types/express.d.ts`
- FOUND: `apps/gateway/src/middleware/requestLog.ts`
- FOUND: `apps/gateway/test/logger.test.ts`
- FOUND (modified): `apps/gateway/package.json`, `apps/gateway/src/app.ts`, `apps/gateway/src/index.ts`, `apps/gateway/src/lib/proxy.ts`, `apps/gateway/src/middleware/errorHandler.ts`, `apps/gateway/src/middleware/validate.ts`, `apps/gateway/src/routes/chat.ts`, `apps/gateway/src/routes/tool-calls.ts`, `apps/gateway/src/routes/health.ts`

**Commits exist:**
- FOUND: 59bf09c
- FOUND: cfb04ae
- FOUND: 89a31e1
- FOUND: 6e9cb67
- FOUND: 4b70cd2
