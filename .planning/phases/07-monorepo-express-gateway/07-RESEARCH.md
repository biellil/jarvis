# Phase 7: Monorepo + Express Gateway - Research

**Researched:** 2026-04-05
**Domain:** pnpm workspaces, Express 5 / TypeScript, Zod v4, SSE proxy passthrough
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Layout `packages/gateway`** — `pnpm-workspace.yaml` e `package.json` (raiz) ficam na raiz do repo convivendo com `pyproject.toml` (Python). O gateway fica em `packages/gateway/`. Python e Node coexistem na mesma raiz sem conflito — cada um tem seu próprio arquivo de manifesto.

  Layout resultante:
  ```
  jarvis/
    pyproject.toml         # Python (inalterado)
    pnpm-workspace.yaml    # novo — declara packages: ['packages/*']
    package.json           # raiz pnpm — engines, scripts de dev
    packages/
      gateway/
        package.json
        tsconfig.json
        src/
    src/                   # Python (inalterado)
    tests/                 # Python (inalterado)
    data/                  # SQLite + ChromaDB (inalterado)
  ```

- **D-02: `.env` compartilhado na raiz** — Um único `.env` na raiz do repositório serve tanto o Python quanto o Node. O gateway lê `../../.env` via `dotenv` (ou via `--env-file` no script npm). Nenhuma duplicação de vars. Vars relevantes:
  - `FASTAPI_URL=http://localhost:8000`
  - `GATEWAY_PORT=3000`

### Claude's Discretion

- Biblioteca de proxy para SSE passthrough (http-proxy-middleware vs undici vs implementação manual)
- Build strategy TypeScript: tsx para dev, tsc + node para prod/Docker
- Estrutura interna de `packages/gateway/src/`
- Scripts npm na raiz (`dev`, `build`, `start`) para orquestrar o gateway via pnpm filter
- Versionamento do Node e pnpm (engines field em package.json)
- Tipagem Zod dos payloads (schema dos requests GW-05)
- Shape exato de erros normalizados GW-04 (`{error: boolean, code: string, message: string}`)

### Deferred Ideas (OUT OF SCOPE)

- MONO-02 — `packages/types` com tipos TypeScript compartilhados
- MONO-03 — Setup script unificado `pnpm install` + `pip install -e ".[dev]"`
- GW-06 — Endpoints de gerenciamento de sessão
- GW-07 — Busca semântica na memória via gateway
- Autenticação / rate limiting
- WebSockets no gateway
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MONO-01 | `pnpm install` na raiz instala deps de todos os packages do workspace | pnpm-workspace.yaml com `packages: ['packages/*']` — padrão documentado em pnpm.io |
| GW-01 | `POST /api/chat` proxia para FastAPI `POST /chat` | Express 5 route + undici fetch + JSON body passthrough |
| GW-02 | `GET /api/chat/stream` SSE passthrough sem buffering para FastAPI | Implementação manual: undici fetch + pipe `response.body` para Express `res.write()` |
| GW-03 | `GET /api/health` retorna saúde agregada gateway + Python | Express route que faz `fetch(FASTAPI_URL/health/ready)` e agrega resultado |
| GW-04 | Erros normalizados `{error, code, message}` de qualquer origem | Express 5 error-handling middleware — função com 4 args `(err, req, res, next)` |
| GW-05 | Payload inválido rejeitado com 400 antes de chegar ao Python | Zod v4 `z.object({ message: z.string().min(1) }).parse(req.body)` no middleware |
</phase_requirements>

---

## Summary

Phase 7 acrescenta uma camada Node.js/TypeScript ao repositório Python existente usando pnpm workspaces. O repositório já tem `pyproject.toml` na raiz; colocar `pnpm-workspace.yaml` e `package.json` na mesma raiz é um padrão comum em monorepos polyglota — os dois ecossistemas usam arquivos de manifesto diferentes e não conflitam.

A parte mais crítica da implementação é o SSE passthrough (GW-02). `http-proxy-middleware` v3 funciona para proxying geral, mas para SSE sem buffering a abordagem mais confiável e simples é uma implementação manual: usar `undici`'s `fetch()` para fazer o request ao FastAPI, e depois `pipe` o `response.body` (um `ReadableStream`) direto para o `res` do Express com os headers SSE corretos. Isso evita a camada de abstrações intermediárias que pode introduzir buffering acidental.

A decisão de STATE.md de usar Zod v4 (nunca misturar com v3) é confirmada — a versão `latest` do npm é 4.3.6. Express 5.2.1 requer Node >= 18; o ambiente tem Node v24.12.0, o que é mais que suficiente. O `tsx` 4.21.0 é a ferramenta padrão de 2025 para executar TypeScript em dev sem compilação prévia.

**Recomendação primária:** Implementar a gateway em dois planos: (1) scaffold do workspace + estrutura base do Express com health e validação, (2) implementação das rotas de proxy incluindo SSE passthrough manual via `undici`.

---

## Project Constraints (from CLAUDE.md)

- **Stack Node**: Express 5.x, TypeScript, Zod v4 (conforme STATE.md já decidido)
- **Multi-LLM**: não se aplica ao gateway — gateway não chama LLM diretamente
- **Multiplataforma**: gateway deve funcionar em Linux/macOS/Windows; evitar dependências de SO específicas
- **Config via env**: nunca hardcode de URL/porta — sempre `process.env.FASTAPI_URL` e `process.env.GATEWAY_PORT`
- **Sem UI obrigatória**: gateway é HTTP puro, sem UI
- **Commit format**: Conventional Commits com emojis (ver CLAUDE.md)
- **GSD workflow**: toda mudança de arquivo deve passar por GSD workflow

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | 5.2.1 | HTTP server framework | v5 em produção desde out/2024, Node >= 18, Promise-based error handling nativo |
| typescript | 6.0.2 | Type-safety, compilação | Versão atual confirmada no npm registry |
| tsx | 4.21.0 | Execução TS em dev sem compilação | Substitui ts-node; baseado em esbuild; zero-config |
| zod | 4.3.6 | Validação de payloads de entrada | STATE.md decidiu: v4, nunca misturar com v3. `latest` no npm é 4.3.6 |
| undici | 8.0.2 | HTTP client para proxy interno | Parte do Node.js core; SSE-capable; streams de verdade sem buffering |
| dotenv | 17.4.1 | Carrega `.env` raiz | Versão atual confirmada no npm registry |

### Tipagem e Config

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/express | 5.0.6 | Tipos TypeScript para Express 5 | Sempre — sem tipos Express = TypeScript sem valor |
| @types/node | 25.5.2 | Tipos Node.js (streams, process.env, etc.) | Sempre |
| @tsconfig/node22 | 22.0.5 | Base tsconfig para Node 22 | Estende para não reescrever configurações conhecidas |

### Alternativas Consideradas

| Em vez de | Poderia usar | Tradeoff |
|------------|--------------|----------|
| `undici` (manual pipe) | `http-proxy-middleware` v3 | http-proxy-middleware abstrai o proxy mas a camada de abstração pode introduzir buffering no SSE; undici com pipe manual é explícito e controlado |
| `undici` (manual pipe) | `node-http-proxy` direto | node-http-proxy é a base do http-proxy-middleware — usa a mesma engine, mas API mais verbosa |
| `tsx` (dev) | `ts-node` | ts-node tem problemas de compatibilidade com ESM no Node 20+; tsx resolve tudo |
| `tsx watch` | `nodemon` + `ts-node` | Mais simples, menos dependências |

**Instalação:**
```bash
# Na raiz do workspace (uma vez, depois do pnpm-workspace.yaml estar criado)
pnpm install

# Equivalente a instalar manualmente no packages/gateway:
cd packages/gateway
pnpm add express zod undici dotenv
pnpm add -D typescript tsx @types/express @types/node @tsconfig/node22
```

**Verificação de versões (confirmadas 2026-04-05):**
- `express`: 5.2.1 (npm view express version)
- `zod`: 4.3.6 (npm view zod version)
- `typescript`: 6.0.2 (npm view typescript version)
- `tsx`: 4.21.0 (npm view tsx version)
- `undici`: 8.0.2 (npm view undici version)
- `dotenv`: 17.4.1 (npm view dotenv version)
- `@types/express`: 5.0.6 (npm view @types/express version)
- `@types/node`: 25.5.2 (npm view @types/node version)
- `@tsconfig/node22`: 22.0.5 (npm view @tsconfig/node22 version)

---

## Architecture Patterns

### Estrutura de Diretórios Recomendada

```
jarvis/                             # raiz do repo (Python existente + Node novo)
  pyproject.toml                    # Python — INALTERADO
  pnpm-workspace.yaml               # NOVO — declara packages: ['packages/*']
  package.json                      # NOVO — raiz pnpm (private: true, engines, scripts)
  .env                              # existente — gateway lê via dotenv path relativo
  packages/
    gateway/
      package.json                  # deps do gateway
      tsconfig.json                 # extends @tsconfig/node22
      src/
        index.ts                    # entry point: cria app, registra rotas, listen
        app.ts                      # factory: createApp() — exportável para testes
        config.ts                   # lê process.env, valida, exporta constantes
        routes/
          chat.ts                   # POST /api/chat, GET /api/chat/stream
          health.ts                 # GET /api/health
        middleware/
          validate.ts               # Zod validation middleware factory
          errorHandler.ts           # Express 4-arg error handler
        lib/
          proxy.ts                  # funções helper para proxy undici
```

### Pattern 1: Workspace raiz com Python coexistindo

**O que é:** `pnpm-workspace.yaml` e `package.json` na raiz do repo convivendo com `pyproject.toml`. pnpm opera apenas nos seus arquivos; `pip` opera apenas nos seus. Nenhum conflito.

**Quando usar:** Sempre que Python e Node coexistem no mesmo repositório.

**Exemplo:**
```yaml
# pnpm-workspace.yaml (na raiz)
packages:
  - 'packages/*'
```

```json
// package.json (raiz)
{
  "name": "jarvis",
  "private": true,
  "engines": {
    "node": ">=22",
    "pnpm": ">=10"
  },
  "scripts": {
    "dev": "pnpm --filter gateway dev",
    "build": "pnpm --filter gateway build",
    "start": "pnpm --filter gateway start"
  }
}
```

### Pattern 2: Express 5 com app factory (testável)

**O que é:** Separar `createApp()` (em `app.ts`) de `listen()` (em `index.ts`). Testes importam `createApp()` sem iniciar o servidor.

**Quando usar:** Sempre — é o padrão para apps Express testáveis.

**Exemplo:**
```typescript
// src/app.ts
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", chatRouter);
  app.use("/api", healthRouter);
  app.use(errorHandler); // deve ser o ÚLTIMO middleware
  return app;
}
```

```typescript
// src/index.ts
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
app.listen(config.gatewayPort, () => {
  console.log(`Gateway on :${config.gatewayPort}`);
});
```

### Pattern 3: Zod v4 validation middleware

**O que é:** Middleware factory que recebe um schema Zod e valida `req.body`. Em caso de erro, passa para o error handler com código `VALIDATION_ERROR`.

**Quando usar:** Antes de qualquer rota que receba body (GW-05).

**Exemplo:**
```typescript
// src/middleware/validate.ts
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = new Error("Validation failed") as any;
      err.code = "VALIDATION_ERROR";
      err.details = result.error.issues;
      err.status = 400;
      return next(err);
    }
    req.body = result.data;
    next();
  };
}

// Schema de uso (GW-05):
export const ChatRequestSchema = z.object({
  message: z.string().min(1, "message is required"),
});
```

### Pattern 4: SSE passthrough manual via undici (GW-02)

**O que é:** Usar `undici`'s `fetch()` para abrir uma conexão SSE ao FastAPI e fazer pipe do `ReadableStream` do response body direto para o `res` do Express. Isso garante zero buffering — cada chunk do FastAPI é imediatamente escrito para o cliente.

**Quando usar:** Sempre que há SSE passthrough — é a abordagem mais confiável para garantir streaming sem buffering.

**Exemplo:**
```typescript
// src/routes/chat.ts — GW-02
import { Router } from "express";
import { fetch } from "undici";
import { config } from "../config.js";

export const chatRouter = Router();

chatRouter.get("/chat/stream", async (req, res, next) => {
  const { message } = req.query as { message: string };
  try {
    const upstream = await fetch(
      `${config.fastapiUrl}/chat/stream?message=${encodeURIComponent(message)}`
    );

    if (!upstream.ok || !upstream.body) {
      throw Object.assign(new Error("Upstream error"), { status: 502 });
    }

    // Definir headers SSE antes de iniciar o pipe
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // desativa buffering no nginx
    res.flushHeaders(); // envia os headers imediatamente

    // Pipe stream sem acumular — cada chunk do FastAPI vai direto para o cliente
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (err) {
    next(err);
  }
});
```

### Pattern 5: Error handler normalizado (GW-04)

**O que é:** Express 5 error handler — função com assinatura `(err, req, res, next)`. Intercepta qualquer `next(err)` e normaliza para `{error: true, code: string, message: string}`.

**Quando usar:** Registrado como ÚLTIMO middleware em `createApp()`.

**Exemplo:**
```typescript
// src/middleware/errorHandler.ts
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  const code = err.code ?? "INTERNAL_ERROR";
  const message = err.message ?? "An unexpected error occurred";

  res.status(status).json({
    error: true,
    code,
    message,
    // nunca incluir err.stack em respostas — sem vazar internals
  });
};
```

### Pattern 6: Config via process.env com validação (D-02)

**O que é:** Ler `.env` via dotenv com path relativo `../../.env` e exportar constantes tipadas.

**Quando usar:** Sempre — nunca hardcode de URL/porta.

**Exemplo:**
```typescript
// src/config.ts
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Lê o .env da raiz do repo (2 níveis acima de packages/gateway)
loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

export const config = {
  fastapiUrl: process.env.FASTAPI_URL ?? "http://localhost:8000",
  gatewayPort: parseInt(process.env.GATEWAY_PORT ?? "3000", 10),
} as const;
```

**Nota:** `import.meta.dirname` requer `"module": "NodeNext"` ou `"module": "ESNext"` no tsconfig com `moduleResolution: "bundler"`. Alternativa compatível: usar `path.dirname(fileURLToPath(import.meta.url))`.

### Anti-Patterns a Evitar

- **Usar `responseInterceptor` no http-proxy-middleware para SSE:** Desabilita streaming — bufferiza a resposta inteira antes de enviar.
- **`res.json()` em SSE route:** Finaliza a resposta imediatamente — use `res.write()` + `res.end()`.
- **Não chamar `res.flushHeaders()` antes do pipe:** Headers ficam em buffer até o primeiro chunk, causando delay aparente.
- **Hardcode de `localhost:8000` ou `localhost:3000`:** Viola CLAUDE.md — sempre ler de process.env.
- **`app.use(express.json())` depois das rotas:** Body não será parseado nas rotas registradas antes.
- **Registrar `errorHandler` antes das rotas:** O error handler nunca será invocado — deve ser o último middleware.
- **Criar `package.json` na raiz sem `"private": true`:** pnpm pode tentar publicar o workspace root.

---

## Don't Hand-Roll

| Problema | Não construir | Usar | Por quê |
|----------|---------------|------|---------|
| Validação de request body | Parser JSON manual + verificações manuais | Zod v4 `safeParse()` | Zod gera mensagens de erro estruturadas, typed inference, e cobre edge cases (coercion, optional fields) |
| Normalização de erros | Try/catch em cada route | Express 4-arg error handler middleware | Express garante que erros de rotas async (Express 5) e `next(err)` chegam ao mesmo lugar |
| Parse de `.env` | `fs.readFileSync` + parsing manual | `dotenv` | Dotenv lida com multiline values, comments, escaping, e não sobrescreve vars já definidas |
| Headers SSE | Strings hardcoded por rota | Constantes ou helper em `lib/proxy.ts` | Centraliza a lista de headers para não esquecer `X-Accel-Buffering: no` em uma rota |

**Insight chave:** O SSE passthrough parece simples mas o buffering pode aparecer de formas não óbvias (HTTP/1.1 chunked transfer encoding, Express compression middleware, nginx em frente). Usar `undici` com pipe explícito + `res.flushHeaders()` + `X-Accel-Buffering: no` cobre todos os vetores de buffering de uma vez.

---

## Common Pitfalls

### Pitfall 1: Buffering acidental no SSE passthrough

**O que dá errado:** `GET /api/chat/stream` retorna a resposta inteira de uma vez ao invés de tokens incrementais.

**Por que acontece:** Qualquer um desses causa buffering: (a) usar `http-proxy-middleware` com `responseInterceptor`, (b) não chamar `res.flushHeaders()` antes do pipe, (c) usar `express-compression` middleware sem excluir SSE, (d) nginx em frente sem `proxy_buffering off`.

**Como evitar:** Implementação manual com `undici fetch` + `ReadableStream.getReader()` + `res.write(chunk)`. Chamar `res.flushHeaders()` imediatamente após setar os headers. Adicionar `X-Accel-Buffering: no` no response header (para nginx futuro).

**Sinais de alerta:** `curl -N` não mostra tokens em tempo real; todo o texto aparece de uma vez quando o LLM termina.

### Pitfall 2: `import.meta.dirname` não disponível

**O que dá errado:** `TypeError: Cannot read properties of undefined (reading 'dirname')` ao ler o `.env` relativo.

**Por que acontece:** `import.meta.dirname` só existe com `"moduleResolution": "Bundler"` ou Node >= 21.2.0 em modo ESM. Com CJS ou tsconfig errado, é undefined.

**Como evitar:** Usar `path.dirname(fileURLToPath(import.meta.url))` como alternativa universal em ESM. Ou simplesmente usar `process.cwd()` + path relativo no script de start.

**Alternativa segura:**
```typescript
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });
```

### Pitfall 3: Error handler não captura erros em rotas async (Express 4 vs 5)

**O que dá errado:** Exceções em rotas `async` não chegam ao error handler — Express trava silenciosamente.

**Por que acontece:** Express 4 não suportava Promise rejeitadas em rotas nativamente — precisava de `express-async-errors` wrapper. **Express 5 resolve isso nativamente.**

**Como evitar:** Usar Express 5.x (confirmado: 5.2.1). Em Express 5, `async (req, res, next) => { throw err }` automaticamente chama `next(err)`. Não precisa de wrapper.

**Verificação:** `npm view express version` deve retornar `5.x.x`.

### Pitfall 4: pnpm install na raiz sem `pnpm-workspace.yaml` não instala packages/gateway

**O que dá errado:** `pnpm install` instala deps do `package.json` raiz mas ignora `packages/gateway/package.json`.

**Por que acontece:** pnpm só trata subdiretórios como workspace packages se `pnpm-workspace.yaml` existir com o glob correto.

**Como evitar:** `pnpm-workspace.yaml` deve existir na raiz com `packages: ['packages/*']` ANTES de qualquer `pnpm install`.

### Pitfall 5: Gateway não consegue resolver `.env` raiz via caminho relativo

**O que dá errado:** `FASTAPI_URL` é undefined em runtime — gateway conecta em `undefined/chat` ao invés de `localhost:8000/chat`.

**Por que acontece:** O path relativo `../../.env` é relativo ao arquivo TypeScript compilado, não à raiz do repo. Se o outDir do tsc for `dist/`, o path vira `../../../../.env`.

**Como evitar:** Usar `process.env.npm_config_workspace_root` + dotenv, ou passar `--env-file ../../.env` no script npm, ou usar dotenv com path absoluto via `__dirname`.

**Padrão recomendado no script:**
```json
// packages/gateway/package.json
{
  "scripts": {
    "dev": "tsx --env-file ../../.env src/index.ts"
  }
}
```

O flag `--env-file` do Node (disponível desde Node 20.6.0) carrega o `.env` antes de executar o arquivo — sem precisar de `dotenv` programático.

### Pitfall 6: Zod v4 — `z.string().email()` vs `z.email()`

**O que dá errado:** Código importado de exemplos v3 usa `z.string().email()` que ainda funciona em v4 para compatibilidade, mas o padrão v4 é `z.email()` diretamente.

**Por que acontece:** Zod v4 moveu string format validators para top-level.

**Como evitar:** Para o gateway, o único schema relevante é `{ message: z.string().min(1) }` — não usa validators de formato, então este pitfall não se aplica. Documentado para awareness.

---

## Code Examples

Verificados com base em npm registry, documentação oficial e implementação do FastAPI existente.

### tsconfig.json para packages/gateway

```json
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### packages/gateway/package.json

```json
{
  "name": "@jarvis/gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx --env-file ../../.env watch src/index.ts",
    "build": "tsc",
    "start": "node --env-file ../../.env dist/index.js"
  },
  "dependencies": {
    "express": "^5.2.1",
    "undici": "^8.0.2",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@tsconfig/node22": "^22.0.5",
    "@types/express": "^5.0.6",
    "@types/node": "^25.5.2",
    "typescript": "^6.0.2",
    "tsx": "^4.21.0"
  }
}
```

**Nota:** O flag `--env-file` do Node (disponível desde Node 20.6.0, presente no Node v24.12.0 do ambiente) carrega o `.env` da raiz sem precisar de `dotenv` como dependência runtime. Isso simplifica o código — sem `import dotenv from "dotenv"` no entry point.

### GET /api/health (GW-03) — health agregado

```typescript
// src/routes/health.ts
import { Router } from "express";
import { fetch } from "undici";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  let pythonStatus: "ok" | "not_ready" | "unreachable" = "unreachable";

  try {
    const upstream = await fetch(`${config.fastapiUrl}/health/ready`, {
      signal: AbortSignal.timeout(3000), // não travar se FastAPI estiver down
    });
    pythonStatus = upstream.ok ? "ok" : "not_ready";
  } catch {
    pythonStatus = "unreachable";
  }

  const httpStatus = pythonStatus === "ok" ? 200 : 503;
  res.status(httpStatus).json({
    gateway: "ok",
    python: pythonStatus,
  });
});
```

### POST /api/chat (GW-01) — proxy síncrono

```typescript
// src/routes/chat.ts (trecho GW-01)
import { Router } from "express";
import { fetch } from "undici";
import { config } from "../config.js";
import { validate, ChatRequestSchema } from "../middleware/validate.js";

export const chatRouter = Router();

chatRouter.post(
  "/chat",
  validate(ChatRequestSchema), // GW-05: rejeita antes de chegar ao Python
  async (req, res, next) => {
    try {
      const upstream = await fetch(`${config.fastapiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });

      if (!upstream.ok) {
        const detail = await upstream.json().catch(() => ({}));
        const err = Object.assign(new Error("Upstream error"), {
          status: upstream.status,
          code: "UPSTREAM_ERROR",
          message: (detail as any)?.detail ?? "FastAPI returned an error",
        });
        return next(err);
      }

      const data = await upstream.json();
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);
```

---

## State of the Art

| Abordagem antiga | Abordagem atual | Quando mudou | Impacto |
|------------------|-----------------|--------------|---------|
| `ts-node` para executar TS | `tsx` (esbuild-based) | 2023+ | tsx é 10-20x mais rápido no startup; sem problemas de ESM |
| Express 4 + `express-async-errors` | Express 5 nativo | out/2024 (Express 5 estável) | Rotas async têm error handling nativo sem wrapper |
| Zod v3 `.string().email()` | Zod v4 `z.email()` | 2025 | Format validators no top-level; STATE.md já decidiu usar v4 |
| `node-http-proxy` para SSE | `undici` + pipe manual | 2023+ (undici no Node core) | undici tem API de streams moderna (Web Streams); menos deps |
| `dotenv` no código | `--env-file` flag do Node | Node 20.6.0 (set/2023) | Menos dependências runtime; .env carregado antes do processo |

**Deprecados/obsoletos relevantes:**
- `ts-node`: Problemas com ESM no Node 20+; substituído por `tsx`
- `http-proxy-middleware` com `responseInterceptor`: Desabilita streaming — não usar para SSE
- Express 4 async error handling sem wrapper: Express 5 resolve nativamente

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|--------------|-----------|--------|----------|
| Node.js | Execução do gateway | ✓ | v24.12.0 | — |
| pnpm | MONO-01 workspace install | ✓ | 10.27.0 | — |
| FastAPI (localhost:8000) | GW-01, GW-02, GW-03 (testes de integração) | Depende (Phase 6 concluída) | 0.135.3 | Testes unitários com mock |
| Python (`python -m uvicorn`) | Testes de integração end-to-end | ✓ | Python 3.10+ via pyproject.toml | Mock em unit tests |

**Dependências ausentes com fallback:**
- FastAPI não precisa estar rodando para os unit tests do gateway — usar `undici.MockAgent` ou mocks de `fetch` nos testes. Apenas testes de integração e verificação manual precisam do FastAPI ativo.

---

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|-------------|-------|
| Framework | vitest 4.1.2 |
| Config file | `packages/gateway/vitest.config.ts` — criado no Wave 0 |
| Quick run command | `pnpm --filter gateway test --run` |
| Full suite command | `pnpm --filter gateway test --run --coverage` |

**Justificativa vitest vs jest:** vitest tem suporte nativo a ESM (o gateway usa `"type": "module"`), integra com `tsx`, e a mesma API do jest — zero curvatura de aprendizado.

### Phase Requirements → Test Map

| Req ID | Comportamento | Tipo | Comando automatizado | Arquivo existe? |
|--------|---------------|------|---------------------|-----------------|
| MONO-01 | `pnpm install` instala todas as deps | smoke | `pnpm install --frozen-lockfile` | ❌ Wave 0 |
| GW-01 | POST /api/chat proxia para FastAPI | unit | `pnpm --filter gateway test --run test/chat.test.ts` | ❌ Wave 0 |
| GW-02 | GET /api/chat/stream SSE passthrough sem buffering | unit | `pnpm --filter gateway test --run test/stream.test.ts` | ❌ Wave 0 |
| GW-03 | GET /api/health retorna saúde agregada | unit | `pnpm --filter gateway test --run test/health.test.ts` | ❌ Wave 0 |
| GW-04 | Erros normalizados {error, code, message} | unit | `pnpm --filter gateway test --run test/error.test.ts` | ❌ Wave 0 |
| GW-05 | Payload inválido rejeitado com 400 | unit | `pnpm --filter gateway test --run test/validate.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Por task commit:** `pnpm --filter gateway test --run`
- **Por wave merge:** `pnpm --filter gateway test --run` + Python suite `python -m pytest tests/ -x -q`
- **Phase gate:** Suite completa verde antes de `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/gateway/vitest.config.ts` — config do vitest com globals e coverage
- [ ] `packages/gateway/test/helpers.ts` — helper `createTestApp()` importando `app.ts` sem listen
- [ ] `packages/gateway/test/chat.test.ts` — cobre GW-01 e GW-05
- [ ] `packages/gateway/test/stream.test.ts` — cobre GW-02 (mock upstream SSE)
- [ ] `packages/gateway/test/health.test.ts` — cobre GW-03
- [ ] `packages/gateway/test/error.test.ts` — cobre GW-04
- [ ] Framework install: `pnpm add -D vitest` em `packages/gateway/`

---

## Open Questions

1. **`--env-file` relativo funciona com tsx watch?**
   - O que sabemos: `tsx --env-file ../../.env watch src/index.ts` — o flag `--env-file` é do Node, não do tsx.
   - O que é incerto: Se `tsx watch` passa flags corretamente para o Node antes do watch loop.
   - Recomendação: Testar no Wave 0. Fallback: usar `dotenv` programático no `config.ts` com `__dirname`.

2. **Como testar SSE passthrough unitariamente sem FastAPI rodando?**
   - O que sabemos: `undici` exporta `MockAgent` para mockar fetch calls internamente.
   - O que é incerto: Se MockAgent suporta simular `ReadableStream` para SSE.
   - Recomendação: Usar `vitest` + mock manual de `fetch` retornando `Response` com `ReadableStream` construído via `new ReadableStream({ start(ctrl) { ctrl.enqueue(...) } })`.

---

## Sources

### Primary (HIGH confidence)

- npm registry `npm view [package] version` — versões verificadas 2026-04-05 para: express, zod, typescript, tsx, undici, dotenv, @types/express, @types/node, @tsconfig/node22, vitest
- `pnpm.io/workspaces` — formato de `pnpm-workspace.yaml` e comportamento do workspace
- Código existente `src/jarvis/api/routes/chat.py` e `health.py` — contratos de API do FastAPI que o gateway proxia
- `src/jarvis/config.py` + `.env` — padrão de configuração via env vars a espelhar no Node
- `.planning/STATE.md` — decisões já tomadas: Express 5.1 (atualizado para 5.2.1), Zod v4, Node 22

### Secondary (MEDIUM confidence)

- Node.js docs `--env-file` flag — disponível desde Node 20.6.0, confirmado com Node v24.12.0 no ambiente
- Express 5 changelog — `async` error handling nativo (sem `express-async-errors`)
- `zod.dev/v4/changelog` — breaking changes v3 → v4, novo import path permanece `import { z } from "zod"`

### Tertiary (LOW confidence)

- WebSearch sobre SSE buffering com proxies — padrão `X-Accel-Buffering: no` + `res.flushHeaders()` aparece em múltiplas fontes, mas não verificado contra documentação oficial do Express 5

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas diretamente no npm registry
- Architecture: HIGH — baseado em código existente (FastAPI routes) e documentação oficial pnpm
- SSE passthrough: MEDIUM — abordagem manual com undici é sólida, mas `--env-file` com tsx watch precisa de verificação no Wave 0
- Pitfalls: HIGH — baseado em análise do código existente e documentação Express 5

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stack estável; verificar undici se versão maior lançada)
