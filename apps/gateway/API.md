# JARVIS Gateway API

Gateway Express rodando na porta `3000` (padrão). Todas as rotas ficam sob o prefixo `/api`.

## Base URL

```
http://localhost:3000/api
```

---

## Endpoints

### `GET /api/health`

Verifica se o gateway e o backend estão no ar.

**Resposta 200 — tudo ok:**
```json
{
  "gateway": "ok",
  "backend": "ok"
}
```

**Resposta 503 — backend fora:**
```json
{
  "gateway": "ok",
  "backend": "unreachable"
}
```

**Curl:**
```bash
curl http://localhost:3000/api/health
```

---

### `POST /api/chat`

Envia uma mensagem para o JARVIS e recebe a resposta completa.

**Body:**
```json
{
  "message": "Olá JARVIS, tudo bem?"
}
```

**Resposta 200:**
```json
{
  "response": "Olá! Tudo bem sim, obrigado por perguntar..."
}
```

**Erros:**

| Status | Código | Motivo |
|--------|--------|--------|
| 400 | `VALIDATION_ERROR` | `message` ausente ou vazio |
| 502 | `UPSTREAM_ERROR` | Backend retornou erro |

**Curl:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Olá JARVIS, tudo bem?"}'
```

---

### `GET /api/chat/stream`

Envia uma mensagem e recebe a resposta em streaming via SSE (Server-Sent Events).

**Query param:**

| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `message` | string | sim | Mensagem para o JARVIS |

**Headers da resposta:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Curl (streaming em tempo real):**
```bash
curl -N "http://localhost:3000/api/chat/stream?message=Ol%C3%A1%20JARVIS"
```

Com URL encoding automático:
```bash
MSG="Me conta uma piada"
curl -N "http://localhost:3000/api/chat/stream?message=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$MSG")"
```

**Erros:**

| Status | Código | Motivo |
|--------|--------|--------|
| 400 | `VALIDATION_ERROR` | `message` ausente ou vazio |
| 502 | `UPSTREAM_ERROR` | Backend retornou erro |

---

### `POST /api/tool-calls/:id/result`

Retorna o resultado de uma tool call para o backend (usado internamente pelo agente).

**Params:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `id` | número inteiro positivo | ID da tool call |

**Body:** Qualquer JSON com o resultado da tool.

```json
{
  "result": "arquivo criado com sucesso"
}
```

**Respostas:**

| Status | Descrição |
|--------|-----------|
| 204 | Resultado registrado com sucesso |
| 400 | ID inválido ou body malformado |
| 404 | Tool call não encontrada |
| 502 | Erro no backend |

**Curl:**
```bash
curl -X POST http://localhost:3000/api/tool-calls/42/result \
  -H "Content-Type: application/json" \
  -d '{"result": "arquivo criado com sucesso"}'
```

---

## Erros

Todos os erros seguem o formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [...]
  }
}
```

| Código | Status HTTP | Descrição |
|--------|-------------|-----------|
| `VALIDATION_ERROR` | 400 | Body ou query param inválido |
| `UPSTREAM_ERROR` | 502 | Backend retornou erro ou está inacessível |

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `GATEWAY_PORT` | `3000` | Porta do gateway |
| `BACKEND_TS_URL` | — | URL do backend TypeScript |
| `API_KEY` | — | Chave de API (injetada no header `Authorization` se o cliente não enviar) |

---

## Rodar localmente

```bash
# Da raiz do monorepo
pnpm dev

# Ou só o gateway
cd apps/gateway && pnpm dev
```
