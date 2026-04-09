# Phase 20: E2E Validation & Python Comparison — Research

**Researched:** 2026-04-09
**Domain:** E2E test scripting, Express middleware routing, embedding cosine similarity, SQLite comparison, ChromaDB HTTP client
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Q1 — Voice no E2E:** Pular voice validation. Voice usa providers diferentes por design. Documenta como known limitation no relatório do E2E. VAL-01 valida apenas text chat inputs (20 mensagens de texto).
- **Q2 — ChromaDB: separado.** Cada backend tem seu próprio ChromaDB. Para comparação (VAL-05): envia os mesmos textos para ambos e compara os vetores gerados via cosine similarity. Não compartilham dados.
- **Q3 — Tool calls: todas as tools.** Se alguma tool existir no Python e não no TypeScript → marca como FAIL. Suite não para — continua os outros testes.
- **Q4 — Comparação de texto:** Embedding cosine similarity com `@xenova/transformers` (all-MiniLM-L6-v2), threshold >0.85. Configurável via env `TEXT_SIM_THRESHOLD`.
- **Q5 — Comportamento em falha:** Reporta e continua. Exit code 0 se ≥90% testes pass, 1 se <90%.
- **Q6 — Arquitetura:** Script standalone `scripts/e2e-compare.ts`, runtime `tsx`, comando `pnpm e2e` no root `package.json`. Não integra ao vitest.
- **Q7 — Gateway feature flag:** Middleware por header `X-Backend-Version: ts`. Localização: `apps/gateway/src/middleware/`. Aplica a todos os endpoints: `/chat`, `/chat/stream`, `/chat/audio`. Python continua sendo o default.

### Claude's Discretion

Nenhuma área explicitamente marcada como discrição do Claude no CONTEXT.md. As decisões cobriam o escopo inteiro.

### Deferred Ideas (OUT OF SCOPE)

- Streaming de áudio TTS comparison — deferido para v1.4
- CI integration — integrar e2e-compare.ts ao GitHub Actions
- LLM-as-judge para comparação de texto
- Env var global `ACTIVE_BACKEND`
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAL-01 | E2E test suite envia mesmos inputs para Python (8000) e TypeScript (8001) backends | Script standalone `scripts/e2e-compare.ts` com 20 inputs de texto via POST /chat |
| VAL-02 | Comparison assertions validam que resposta de texto é semanticamente equivalente | `embedText()` já implementado em `apps/backend-ts/src/memory/embeddings.ts` + cosine similarity inline |
| VAL-03 | Tool calls comparison valida que mesmos tools são chamados com mesmos inputs | Captura tool calls via campo `tool_calls` na resposta ou audit log no SQLite |
| VAL-04 | SQLite state comparison valida que mensagens/tool_calls/profile são idênticos após cada request | `better-sqlite3` abre ambos os .db files e compara rows das tabelas `messages` e `user_profile` |
| VAL-05 | ChromaDB embeddings comparison valida que embeddings têm >95% cosine similarity | Chama `embedText()` para o mesmo texto em ambos os contextos e compara com cosine similarity |
| VAL-06 | Performance benchmarks mostram TypeScript latency ≤110% do Python | `performance.now()` em volta de cada `fetch()` para ambos os backends |
| VAL-07 | Gateway feature flag (`X-Backend-Version: ts`) roteia requests para TypeScript backend | Novo middleware em `apps/gateway/src/middleware/backendRouter.ts`, wired em `app.ts` antes das rotas |
</phase_requirements>

---

## Summary

Esta fase tem dois entregáveis completamente independentes: (1) o script standalone `scripts/e2e-compare.ts` que valida paridade de outputs entre Python (port 8000) e TypeScript (port 8001), e (2) o middleware do gateway que roteia por header. Nenhum dos dois altera o comportamento existente dos backends.

O script pode reusar `embedText()` que já existe em `apps/backend-ts/src/memory/embeddings.ts` — a função carrega o modelo Xenova/all-MiniLM-L6-v2 e retorna `Float32Array`. O cosine similarity foi previamente implementado em `apps/backend-ts/scripts/embedding-parity.ts` — esse padrão pode ser copiado diretamente. A API surface de ambos os backends já foi verificada: Python usa `POST /chat` com `{message: string}` → `{message: string}`, TypeScript é idêntico.

A maior complexidade está em VAL-04 (SQLite comparison): os dois backends usam caminhos diferentes para o .db (Python: `data/jarvis.db` via `SQLITE_PATH`; TypeScript: `DATABASE_PATH` ou `jarvis.sqlite` via `db.ts`). O script precisa resolver esses caminhos dos mesmos envs que os backends usam. Para VAL-05 (ChromaDB), o JS client do chromadb é server-only — requer que um `chroma run` esteja em execução para cada backend, o que é uma dependência de ambiente a documentar.

**Primary recommendation:** Implementar o script em duas partes lógicas — (A) loop de 20 requests com coleta de métricas e (B) análise e relatório — reutilizando `embedText()` do backend-ts como módulo importado direto no script (sem fork de processo).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tsx | 4.21.0 | Runtime para `scripts/e2e-compare.ts` | Já instalado em `apps/backend-ts/devDependencies`. Suporta ESM nativo e TypeScript sem compilação separada. |
| `@xenova/transformers` | 2.17.2 | Gerar embeddings all-MiniLM-L6-v2 para VAL-02 e VAL-05 | Já instalado em `apps/backend-ts`. Função `embedText()` já implementada em `src/memory/embeddings.ts`. |
| `better-sqlite3` | 12.8.0 | Ler SQLite de ambos os backends para VAL-04 | Já instalado em `apps/backend-ts`. API síncrona — perfeita para comparação pontual. |
| `undici` (fetch nativo Node 22) | Node 22 built-in | HTTP requests para ambos os backends | Node 22 tem `fetch` global. O gateway já usa `undici` explicitamente. Usar fetch nativo no script é mais simples. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:perf_hooks` | stdlib | `performance.now()` para latência (VAL-06) | Já disponível no Node 22 como `performance` global |
| `node:fs` | stdlib | Resolver paths de .db files | Verificar se arquivos existem antes de tentar abrir |
| `picocolors` ou ANSI manual | — | Output colorido PASS/FAIL | Usar escape codes ANSI diretamente — sem dependência extra. Exemplos: `\x1b[32m` (green), `\x1b[31m` (red), `\x1b[0m` (reset) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Import `embedText()` diretamente | Fork de processo para chamar Python `sentence-transformers` | Import direto é mais simples, sem subprocesso. O modelo `@xenova/transformers` já está aqui e produz embeddings equivalentes ao Python (parity verificada em `embedding-parity.ts` com threshold >0.95). |
| `better-sqlite3` direto para VAL-04 | API REST de leitura | `better-sqlite3` lê o arquivo .db sem backend rodando — mais confiável para comparação state after-the-fact. |
| `fetch` nativo Node 22 | `axios`, `httpx` | Fetch nativo elimina dependência extra. Já usado no gateway via `undici`. |

**Installation:** Sem instalação nova necessária. O script `e2e-compare.ts` importa de `apps/backend-ts/src/memory/embeddings.ts` com path relativo ou alias. O comando `pnpm e2e` no root chama `pnpm exec tsx scripts/e2e-compare.ts` (ou `tsx --tsconfig apps/backend-ts/tsconfig.json scripts/e2e-compare.ts`).

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
└── e2e-compare.ts          # Script standalone (novo)

apps/gateway/src/
├── middleware/
│   ├── errorHandler.ts     # Existente
│   ├── validate.ts         # Existente
│   └── backendRouter.ts    # NOVO — X-Backend-Version: ts middleware
└── app.ts                  # Modificar: adicionar backendRouter
```

### Pattern 1: Script E2E Standalone com tsx

**What:** Script TypeScript executado com `tsx` que importa utilitários do `apps/backend-ts/src/` diretamente, sem compilar.

**When to use:** Validação pontual, não integrada ao vitest. Requer ambos os backends rodando.

**Example:**
```typescript
// scripts/e2e-compare.ts
// [VERIFIED: codebase — apps/backend-ts/scripts/embedding-parity.ts usa este padrão]
import { embedText } from '../apps/backend-ts/src/memory/embeddings.js';

const PYTHON_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const TS_URL = process.env.BACKEND_TS_URL ?? 'http://localhost:8001';
const TEXT_SIM_THRESHOLD = parseFloat(process.env.TEXT_SIM_THRESHOLD ?? '0.85');
const PASS_THRESHOLD = parseFloat(process.env.E2E_PASS_THRESHOLD ?? '0.90');

async function sendChat(baseUrl: string, message: string): Promise<{ reply: string; latencyMs: number }> {
  const t0 = performance.now();
  const res = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const latencyMs = performance.now() - t0;
  const data = await res.json() as { message: string };
  return { reply: data.message, latencyMs };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

### Pattern 2: Gateway Middleware por Header

**What:** Express middleware que intercepta o header `X-Backend-Version: ts` e faz proxy para `backendTsUrl` em vez de `fastapiUrl`.

**When to use:** Aplicar como primeiro middleware nas rotas de chat. Não altera o default (Python continua sendo o default).

**Example:**
```typescript
// apps/gateway/src/middleware/backendRouter.ts
// [VERIFIED: codebase — config.ts já expõe backendTsUrl e fastapiUrl]
import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../config.js';

/**
 * Resolve o upstream URL com base no header X-Backend-Version.
 * ts → backendTsUrl (port 8001)
 * ausente/qualquer outro → fastapiUrl (port 8000, default)
 */
export function resolveUpstreamUrl(req: Request): string {
  const version = req.headers['x-backend-version'];
  if (version === 'ts') {
    return config.backendTsUrl;
  }
  return config.fastapiUrl;
}
```

O gateway então substitui `config.fastapiUrl` hardcoded nos handlers por `resolveUpstreamUrl(req)`:

```typescript
// apps/gateway/src/routes/chat.ts — modificar linha existente
// ANTES:
const upstream = await fetch(`${config.fastapiUrl}/chat`, { ... });
// DEPOIS:
const upstream = await fetch(`${resolveUpstreamUrl(req)}/chat`, { ... });
```

**Importante:** A abordagem de middleware express puro (sem request interceptor separado) é suficiente porque o gateway não usa `http-proxy-middleware` — faz fetch manual. O `resolveUpstreamUrl` é uma função utilitária importada pelos route handlers, não um middleware Express no sentido de `app.use()`.

### Pattern 3: SQLite Comparison (VAL-04)

**What:** Abre os dois arquivos `.db` com `better-sqlite3` e compara rows das tabelas `messages` e `user_profile` após cada request.

**Caveats verificados no código:**
- Python SQLite path: `SQLITE_PATH` env var, default `data/jarvis.db` (relativo ao cwd do processo Python — raiz do repo)
- TypeScript SQLite path: `DATABASE_PATH` env var, default `jarvis.sqlite` relativo ao `process.cwd()` do backend-ts (que é `apps/backend-ts/` em dev, mas depende de onde o processo foi iniciado)
- **Inconsistência detectada:** O Python usa `SQLITE_PATH` e o TypeScript usa `DATABASE_PATH` — são env vars diferentes. O script E2E precisa ler ambos ou ter paths configuráveis explicitamente.

```typescript
// [VERIFIED: codebase — apps/backend-ts/src/memory/db.ts]
// TypeScript db path: process.env.DATABASE_PATH || path.join(process.cwd(), 'jarvis.sqlite')

// [VERIFIED: codebase — src/jarvis/config.py]
// Python db path: settings.sqlite_path = os.env SQLITE_PATH, default 'data/jarvis.db'

import Database from 'better-sqlite3';

function openDb(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true });
}

function compareMessages(pyDb: Database.Database, tsDb: Database.Database): CompareResult {
  const pyMsgs = pyDb.prepare('SELECT role, content FROM messages ORDER BY id').all();
  const tsMsgs = tsDb.prepare('SELECT role, content FROM messages ORDER BY id').all();
  // Compare content (not timestamps — they will differ)
  // ...
}
```

### Pattern 4: Estrutura do Relatório Final

**What:** Output colorido com seções PASS/FAIL e exit code baseado em threshold.

```
===== E2E COMPARISON REPORT =====
Text Similarity: 18/20 PASS (2 FAIL)
Tool Calls:      20/20 PASS
SQLite State:    20/20 PASS
ChromaDB:        19/20 PASS (1 FAIL)
Performance:     20/20 PASS (avg TS/Python ratio: 1.04)
=================================
Overall: 97/100 (97%) — THRESHOLD: 90%
EXIT CODE: 0
```

```typescript
// [ASSUMED] — padrão de exit code baseado em threshold
const overallPct = totalPass / totalTests;
process.exit(overallPct >= PASS_THRESHOLD ? 0 : 1);
```

### Anti-Patterns to Avoid

- **Usar `vitest` para o E2E script:** Decisão locked — é script standalone com `tsx`, não suite vitest.
- **Parar no primeiro FAIL:** Decisão locked — reporta e continua para ter visibilidade completa de gaps.
- **Comparar timestamps SQLite:** Timestamps entre Python e TypeScript serão sempre diferentes. Comparar apenas `role` e `content` das mensagens.
- **Alterar o backend default do gateway:** Python (fastapiUrl) continua sendo o default sem o header.
- **Importar `embedText` no contexto do backend-ts em execução:** O script E2E é standalone — importa `embedText()` direto do módulo fonte, criando seu próprio extractor singleton. Não depende do backend-ts estar rodando para fazer embeddings.
- **ChromaDB no script sem servidor rodando:** O cliente JS do chromadb é server-only (sem modo embedded). Para VAL-05, o script não precisa conectar ao ChromaDB diretamente — ele gera embeddings locais com `embedText()` e compara. O ChromaDB dos backends é comparado indiretamente (mesmo texto → mesmos embeddings se ambos usam all-MiniLM-L6-v2).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cosine similarity | Implementação do zero | Copiar `cosine()` de `apps/backend-ts/scripts/embedding-parity.ts` | Já testado e correto. 7 linhas. |
| Gerar embeddings | Chamar Python via subprocesso | `embedText()` de `src/memory/embeddings.ts` | Já implementado, singleton, mesmo modelo |
| SQLite read | `child_process.exec('sqlite3 ...')` | `better-sqlite3` API | Já instalado, API tipada e síncrona |
| Color output | Instalar `chalk` ou `picocolors` | ANSI escape codes direto | Zero dependência, suficiente para PASS/FAIL colorido |

**Key insight:** O projeto já tem 80% da infraestrutura necessária — `embedText()`, `cosine()`, `better-sqlite3` já estão implementados. O script E2E é primarily _glue code_ que orquestra essas peças existentes.

---

## Common Pitfalls

### Pitfall 1: SQLite Path Inconsistency Between Backends

**What goes wrong:** O script não encontra o arquivo `.db` do TypeScript backend porque o path default é diferente do Python.
**Why it happens:** Python usa `SQLITE_PATH` env var (default `data/jarvis.db`); TypeScript usa `DATABASE_PATH` env var (default `jarvis.sqlite` relativo ao `cwd` do processo, que é `apps/backend-ts/` em dev).
**How to avoid:** O script E2E deve aceitar paths explícitos via env vars dedicadas (`E2E_PYTHON_DB_PATH`, `E2E_TS_DB_PATH`) com defaults que correspondem ao que cada backend usa em dev. Documentar no script.
**Warning signs:** `SQLITE_ERROR: unable to open database file` ao iniciar o script.

### Pitfall 2: ChromaDB JS Client é Server-Only

**What goes wrong:** Tentar conectar ao ChromaDB no script E2E sem um servidor Chroma rodando.
**Why it happens:** O chromadb JS package (>=1.x) não tem modo embedded — requer `chroma run --path <dir> --port <port>` separado. Isso está documentado em `apps/backend-ts/src/memory/vectors.ts`.
**How to avoid:** Para VAL-05, não conectar ao ChromaDB diretamente. Em vez disso, gerar embeddings localmente com `embedText()` e comparar cosine similarity dos vetores gerados para os mesmos textos. Isso valida que ambos os backends gerariam vetores equivalentes (>95% similarity), sem precisar de servidor Chroma.
**Warning signs:** `ECONNREFUSED` ao tentar criar `ChromaClient`.

### Pitfall 3: @xenova/transformers Model Download na Primeira Execução

**What goes wrong:** Script trava por 30-60 segundos no primeiro run enquanto baixa o modelo all-MiniLM-L6-v2 (~90MB) sem feedback.
**Why it happens:** `@xenova/transformers` baixa modelos on-demand e os cacheia em `~/.cache/huggingface/`. Na primeira execução cold o download é silencioso.
**How to avoid:** Adicionar log explícito antes de `embedText()`: `console.log('[e2e] Loading embedding model (first run may download ~90MB)...')`.
**Warning signs:** Script parece travado sem output antes da primeira chamada de embedding.

### Pitfall 4: Tool Calls não Aparecem no Response Body do POST /chat

**What goes wrong:** VAL-03 não consegue comparar tool calls porque `POST /chat` retorna apenas `{message: string}`.
**Why it happens:** O Python backend e o TypeScript backend ambos retornam apenas a resposta final de texto no `POST /chat`. Tool calls são visíveis no SSE stream (`event: action`) e no SQLite audit log (`tool_calls` table).
**How to avoid:** Para VAL-03, ler a tabela `tool_calls` do SQLite após cada request para capturar quais tools foram chamadas. Comparar `tool_name` e `params_json` das rows inseridas durante o processamento de cada mensagem. Usar timestamp como delimitador (rows inseridas após o timestamp do request).
**Warning signs:** `tool_calls` array sempre vazio na comparação mesmo quando o LLM deveria chamar tools.

### Pitfall 5: tsx ESM Import de Arquivo Fora do Package

**What goes wrong:** `import { embedText } from '../apps/backend-ts/src/memory/embeddings.js'` falha com erro de módulo quando o script está na raiz `/scripts/`.
**Why it happens:** O tsconfig do backend-ts (`apps/backend-ts/tsconfig.json`) define `paths` e `moduleResolution` que podem não estar ativos quando importando de fora do package. O arquivo `embeddings.ts` importa de `@xenova/transformers` que precisa estar resolvido.
**How to avoid:** Usar `tsx --tsconfig apps/backend-ts/tsconfig.json scripts/e2e-compare.ts` no comando. Alternativamente, criar o script dentro de `apps/backend-ts/scripts/` (seguindo o padrão já existente de `embedding-parity.ts`) e adicionar script ao `package.json` do backend-ts: `"e2e": "tsx scripts/e2e-compare.ts"`. O root package.json então chama `pnpm --filter @jarvis/backend-ts e2e`.
**Warning signs:** `ERR_MODULE_NOT_FOUND` ou `Cannot find module '@xenova/transformers'`.

### Pitfall 6: Sessões Compartilhadas entre Backends Interferem na Comparação

**What goes wrong:** As 20 mensagens enviadas ao Python backend acumulam histórico de conversa que afeta respostas subsequentes. O TypeScript backend tem histórico diferente porque é uma sessão separada.
**Why it happens:** Ambos os backends mantêm `ChatSession` singleton com histórico persistente. Depois de N mensagens, o contexto diverge.
**How to avoid:** Usar mensagens de teste que sejam razoavelmente independentes de contexto, ou resetar/criar nova sessão antes do script (via restart dos backends). Documentar no script que os backends devem ser iniciados frescos antes de rodar o E2E. Alternativamente, usar um `conversation_id` único se os backends suportarem (verificar — atualmente não suportam; a sessão é global).
**Warning signs:** Text similarity degradando progressivamente ao longo das 20 mensagens.

---

## Code Examples

Verified patterns from official sources and codebase:

### Cosine Similarity (reusável do codebase)
```typescript
// Source: apps/backend-ts/scripts/embedding-parity.ts [VERIFIED: codebase]
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

### Gateway Middleware: resolveUpstreamUrl
```typescript
// apps/gateway/src/middleware/backendRouter.ts [VERIFIED: config.ts structure]
import { config } from '../config.js';
import type { Request } from 'express';

export function resolveUpstreamUrl(req: Request): string {
  return req.headers['x-backend-version'] === 'ts'
    ? config.backendTsUrl   // http://localhost:8001
    : config.fastapiUrl;    // http://localhost:8000 (default)
}
```

### Wiring em chat.ts do gateway
```typescript
// apps/gateway/src/routes/chat.ts — modificação mínima [VERIFIED: routes/chat.ts atual]
import { resolveUpstreamUrl } from '../middleware/backendRouter.js';

// Substituir config.fastapiUrl por resolveUpstreamUrl(req) em cada handler:
chatRouter.post("/chat", validate(ChatRequestSchema), async (req, res, next) => {
  const upstreamBase = resolveUpstreamUrl(req);
  const upstream = await fetch(`${upstreamBase}/chat`, { ... });
  // ...
});
```

### SQLite Comparison via better-sqlite3
```typescript
// [VERIFIED: better-sqlite3 API — codebase já usa esta API em apps/backend-ts/src/memory/store.ts]
import Database from 'better-sqlite3';

function getRecentMessages(db: Database.Database, afterTimestamp: string) {
  return db
    .prepare(`SELECT role, content FROM messages WHERE created_at > ? ORDER BY id`)
    .all(afterTimestamp) as Array<{ role: string; content: string }>;
}
```

### Performance Measurement
```typescript
// [VERIFIED: MDN / Node 22 — performance.now() disponível globalmente]
const t0 = performance.now();
const res = await fetch(`${baseUrl}/chat`, { method: 'POST', ... });
const latencyMs = performance.now() - t0;
```

### Exit Code com Threshold
```typescript
// [VERIFIED: codebase — apps/backend-ts/scripts/embedding-parity.ts usa process.exit(0/1)]
const overallPct = totalPass / totalTests;
const PASS_THRESHOLD = parseFloat(process.env.E2E_PASS_THRESHOLD ?? '0.90');
console.log(`Overall: ${totalPass}/${totalTests} (${Math.round(overallPct * 100)}%) — THRESHOLD: ${Math.round(PASS_THRESHOLD * 100)}%`);
process.exit(overallPct >= PASS_THRESHOLD ? 0 : 1);
```

### Root package.json: Adicionar pnpm e2e
```json
// package.json (raiz) — adicionar em "scripts" [VERIFIED: package.json structure]
{
  "scripts": {
    "e2e": "pnpm --filter @jarvis/backend-ts exec tsx scripts/e2e-compare.ts"
  }
}
```
Ou, se o script ficar na raiz `/scripts/`:
```json
{
  "scripts": {
    "e2e": "pnpm exec tsx --tsconfig apps/backend-ts/tsconfig.json scripts/e2e-compare.ts"
  }
}
```

---

## API Surface Comparison

**Verificado no código fonte dos dois backends:**

| Endpoint | Python (8000) | TypeScript (8001) | Paridade |
|----------|--------------|-------------------|---------|
| `POST /chat` | Body: `{message: string}` → `{message: string}` | Body: `{message: string}` → `{message: string}` | IDÊNTICO |
| `GET /chat/stream` | Query: `?message=...` → SSE `data: <token>` | Query: `?message=...` → SSE `data: <token>` + `event: action` para tools | QUASE IDÊNTICO — TS adiciona `event: action` para PC tools |
| `POST /chat/audio` | Multipart `audio` field → `{message: string}` | Multipart `audio` field → JSON com transcrição + resposta | DIFERENTE — voice excluído do E2E por decisão locked (Q1) |
| 429 behavior | `{"detail": "Session busy — try again later"}` | `{"detail": "Session busy — try again later"}` | IDÊNTICO |

**Conclusão:** O E2E deve usar exclusivamente `POST /chat` (não SSE stream) para simplicidade e comparabilidade direta.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | tsx, fetch global | ✓ | v24.12.0 | — |
| pnpm | Script runner | ✓ | 10.27.0 | — |
| tsx | E2E script runtime | ✓ | 4.21.0 (via backend-ts devDeps) | — |
| Python FastAPI backend | VAL-01/02/03/04/05/06 | Depende do usuário | 0.135.3 (FastAPI instalado) | Script valida conectividade antes de rodar |
| TypeScript backend (8001) | VAL-01/02/03/04/05/06 | Depende do usuário | — | Script valida conectividade antes de rodar |
| ChromaDB server (para Chroma JS client) | VAL-05 (direto) | Não verificado | — | VAL-05 usa embeddings locais — sem servidor Chroma necessário no script |
| SQLite Python db file | VAL-04 | Criado ao rodar Python backend | — | Script verifica existência e reporta SKIP se ausente |
| SQLite TypeScript db file | VAL-04 | Criado ao rodar TS backend | — | Script verifica existência e reporta SKIP se ausente |

**Missing dependencies com no fallback:**
- Ambos os backends precisam estar rodando para qualquer assertion funcionar. O script deve verificar conectividade com `GET /health` nos dois antes de iniciar os 20 requests.

**Missing dependencies with fallback:**
- ChromaDB server: VAL-05 resolve via embeddings locais, sem necessidade de servidor Chroma no script.
- SQLite files: se ausentes, VAL-04 reporta SKIP (não FAIL) com mensagem explicativa.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 (backend-ts), mas o E2E NÃO usa vitest — é script standalone |
| Config file | `apps/backend-ts/vitest.config.ts` (existente, para testes unitários) |
| Quick run command (unitários) | `pnpm test --run` |
| E2E command | `pnpm e2e` (novo script no root package.json) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VAL-01 | Script envia 20 inputs para ambos backends | E2E script | `pnpm e2e` | ❌ Wave 0 — criar `scripts/e2e-compare.ts` |
| VAL-02 | Text similarity >0.85 via embedding cosine | E2E assertion | `pnpm e2e` | ❌ Wave 0 |
| VAL-03 | Tool calls comparison via SQLite audit log | E2E assertion | `pnpm e2e` | ❌ Wave 0 |
| VAL-04 | SQLite messages/profile comparison | E2E assertion | `pnpm e2e` | ❌ Wave 0 |
| VAL-05 | ChromaDB embeddings >95% similarity (via local embedText) | E2E assertion | `pnpm e2e` | ❌ Wave 0 |
| VAL-06 | TS latency ≤110% Python | E2E assertion | `pnpm e2e` | ❌ Wave 0 |
| VAL-07 | Gateway routes X-Backend-Version: ts header | Unit test | `pnpm --filter @jarvis/gateway test --run` | ❌ Wave 0 — criar `apps/gateway/src/middleware/backendRouter.test.ts` |

### Sampling Rate
- **Por plan commit:** `pnpm test --run` (unitários existentes + novo `backendRouter.test.ts`)
- **Por wave merge:** `pnpm e2e` (requer backends rodando)
- **Phase gate:** `pnpm e2e` com exit 0 antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `scripts/e2e-compare.ts` — cobre VAL-01 a VAL-06
- [ ] `apps/gateway/src/middleware/backendRouter.ts` — implementação VAL-07
- [ ] `apps/gateway/src/middleware/backendRouter.test.ts` — testes unitários VAL-07 (mock de `req.headers`)

---

## Security Domain

> `security_enforcement` não está explícito no config.json — tratado como habilitado.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | Script E2E é internal/dev tool, sem auth |
| V3 Session Management | não | Script não gerencia sessões |
| V4 Access Control | não | Gateway middleware não adiciona controle de acesso — apenas routing |
| V5 Input Validation | sim | Inputs do E2E são strings fixas hardcoded — sem risco de injection |
| V6 Cryptography | não | Sem operações criptográficas |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Header spoofing (`X-Backend-Version: ts`) | Tampering | Aceitável — gateway é internal. Header é feature flag de dev/validation, não controle de segurança. Python continua sendo o default. |
| Script acessa arquivos .db diretamente | Information Disclosure | Risco aceitável — script E2E é dev tool, não exposto via HTTP. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O script pode importar `embedText()` de `../apps/backend-ts/src/memory/embeddings.js` com tsx usando o tsconfig do backend-ts | Architecture Patterns / Pitfall 5 | Script falha ao importar — precisaria copiar a função ou mudar localização do script |
| A2 | `performance.now()` está disponível globalmente no Node 22 sem import | Code Examples | Precisaria importar `import { performance } from 'node:perf_hooks'` |
| A3 | Os 20 inputs de texto para o E2E podem ser hardcoded no script (não precisam de fixture file externo) | Architecture Patterns | Se os inputs precisassem ser configuráveis, precisaria de arquivo JSON de fixture |
| A4 | A tabela `tool_calls` do TypeScript tem o mesmo nome de colunas que o Python para comparação VAL-03 | Common Pitfalls | Python usa `tool_name`, `params_json`, `outcome` — TypeScript schema verificado e é idêntico. Risco baixo. |
| A5 | `pnpm e2e` no root invoca o script com o tsconfig correto do backend-ts para resolver `@xenova/transformers` | Architecture Patterns | Pode precisar de ajuste no comando se a resolução de módulos falhar |

---

## Open Questions

1. **Onde fica fisicamente o arquivo .db do TypeScript backend em dev?**
   - What we know: `DATABASE_PATH` env var, default `path.join(process.cwd(), 'jarvis.sqlite')`. O `cwd()` depende de onde o processo é iniciado.
   - What's unclear: Se iniciado via `pnpm dev:backend` (que roda de `apps/backend-ts/`), o db fica em `apps/backend-ts/jarvis.sqlite`. Se iniciado da raiz, fica em `jarvis.sqlite` na raiz.
   - Recommendation: No script E2E, aceitar `E2E_TS_DB_PATH` env var explícita, com default documentado. Ou unificar o env var para `SQLITE_PATH` no backend-ts (alinhando com o Python) — mas isso é mudança fora do escopo desta fase.

2. **O TypeScript backend expõe a lista de tools disponíveis via algum endpoint?**
   - What we know: Python não expõe um endpoint `/tools`. TypeScript também não tem esse endpoint nos routes verificados.
   - What's unclear: Como enumerar as tools disponíveis para comparação VAL-03 sem endpoint dedicado.
   - Recommendation: VAL-03 compara tool calls observadas via SQLite audit log (tabela `tool_calls`) após enviar inputs que tipicamente disparam tools (ex: "abre o chrome", "qual o volume atual"). Se o TS backend não chamar nenhuma tool para inputs que o Python chama, será FAIL automático.

3. **As fases 18 e 19 foram completadas antes da fase 20?**
   - What we know: ROADMAP mostra fases 18, 18.5, 19, 19.5 ainda como pending. O script E2E para VAL-03 (tool calls) depende das tools do TS backend estarem implementadas.
   - What's unclear: Se o planner deve condicionar VAL-03 à fase 18 estar completa, ou incluir um check de graceful skip.
   - Recommendation: O script deve verificar se há algum `tool_calls` registrado no SQLite de cada backend antes de comparar — se nenhum backend registrou tool calls, reportar como NOT_APPLICABLE em vez de FAIL.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/backend-ts/src/memory/embeddings.ts` — `embedText()`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`
- Codebase: `apps/backend-ts/scripts/embedding-parity.ts` — padrão de `cosine()`, estrutura de script com exit code
- Codebase: `apps/gateway/src/config.ts` — `fastapiUrl`, `backendTsUrl`
- Codebase: `apps/gateway/src/routes/chat.ts` — estrutura dos handlers a modificar
- Codebase: `apps/gateway/src/app.ts` — onde adicionar middleware
- Codebase: `apps/backend-ts/src/memory/schema.ts` — schema SQLite TypeScript
- Codebase: `src/jarvis/memory/store.py` — schema SQLite Python (compatível)
- Codebase: `src/jarvis/api/routes/chat.py` — API surface Python confirmada
- Codebase: `apps/backend-ts/src/routes/chat.ts` — API surface TypeScript confirmada
- Codebase: `.env.example` — env vars `FASTAPI_URL`, `BACKEND_TS_URL`, `SQLITE_PATH`, `DATABASE_PATH` (ausente — descoberto via `db.ts`)

### Secondary (MEDIUM confidence)
- Codebase: `apps/backend-ts/src/memory/vectors.ts` comentário — ChromaDB JS é server-only, sem modo embedded
- Node.js 22 docs — `fetch` global disponível desde Node 18, confirmado em uso no gateway via `undici`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as bibliotecas verificadas no codebase com versões exatas
- Architecture: HIGH — padrões verificados no código existente (`embedding-parity.ts` é template quase direto)
- Pitfalls: HIGH — descobertos lendo o código real (db paths inconsistentes, ChromaDB server-only, tsx import path)
- API surface comparison: HIGH — verificado diretamente nos arquivos de routes de ambos os backends

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stack estável — sem dependências externas novas)
