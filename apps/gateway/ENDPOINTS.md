# Gateway Endpoints

## Rotas Públicas (`/api`)

---

### `POST /api/chat`

**O que é:** Entrada principal de mensagens do chat.

**Para que faz:** Recebe a mensagem do cliente, injeta o `clientId` do cliente WebSocket conectado no header `X-Jarvis-Client-Id`, e faz proxy para o `backend-ts POST /chat`. Retorna a resposta do LLM como JSON.

---

### `GET /api/chat/stream`

**O que é:** Stream de resposta do chat via SSE (Server-Sent Events).

**Para que faz:** Recebe `?message=...` como query param e abre um stream SSE passthrough do `backend-ts GET /chat/stream`. Os tokens do LLM chegam em tempo real no cliente enquanto são gerados.

---

### `GET /api/health`

**O que é:** Health check agregado do sistema.

**Para que faz:** Verifica se o gateway está de pé e se o `backend-ts` está respondendo (`/health/ready` com timeout de 3s). Retorna `{ gateway: "ok", backend: "ok" | "not_ready" | "unreachable" }` com status HTTP 200 ou 503.

---

### `POST /api/tool-calls/:id/result`

**O que é:** Devolução de resultado de uma tool call pendente.

**Para que faz:** Recebe o resultado de uma ferramenta executada pelo cliente (identificada pelo `:id`) e faz proxy para o `backend-ts POST /tool-calls/:id/result`, desbloqueando o LangGraph que estava aguardando o resultado.

---

## Rotas Internas (`/internal`)

> Usadas apenas por serviços internos (backend-ts → gateway). Não expostas externamente.

---

### `POST /internal/dispatch-action`

**O que é:** Dispatcher de ações de sistema de arquivos via Electron.

**Para que faz:** Recebe uma ação (`openFolder`, `openFile`, `closeFile`, `viewContent`) com o `clientId` e o `path` alvo, envia a requisição via WebSocket para o cliente Electron, aguarda o ACK (timeout de 12s) e retorna o resultado. Toda ação passa por validação de path e é registrada no audit log.

---

### `GET /internal/diagnostics`

**O que é:** Métricas de saúde do processo em tempo real.

**Para que faz:** Retorna métricas do processo Node.js (`heapUsed`, `rss`) combinadas com métricas do processo Electron (`eventLoopP99Ms`, `audioContextCount`) coletadas via HTTP interno na porta 3001. Usado pelo script de soak test a cada 30 minutos.

---

### `POST /internal/capture-screen`

**O que é:** Captura de tela via Electron.

**Para que faz:** Lê o `clientId` do header `X-Jarvis-Client-Id`, despacha uma requisição de captura de tela via WebSocket para o Electron correspondente, e retorna a imagem capturada como `CaptureScreenResult` JSON. Usado pelo `ChatSession` do backend quando o LLM precisa analisar a tela.
