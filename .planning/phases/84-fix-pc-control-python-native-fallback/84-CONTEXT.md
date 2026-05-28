# Phase 84: Fix PC Control Tools - Python-Native Fallback - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar suporte ao cliente Python (`apps/desktop-py`) para ações de PC control que atualmente só funcionam via Electron: `openFolder`, `openFile`, `closeFile`.

**Root cause:** A tool `request_file_action` (usada pelo LLM via system prompt) requer `clientId` do Electron. O cliente Python nunca envia `x-jarvis-client-id` → erro "Electron não conectado".

**O cliente Python já tem tudo implementado localmente** (`open_folder`, `launch_app`, `close_app` em `pc_control.py`). O problema é de roteamento — a ação não chega ao Python client.

**Escopo desta fase:**
- Registro do Python client no gateway (SSE persistente)
- Adição de dispatch path Python no gateway (paralelo ao WS do Electron)
- Python client envia header `x-jarvis-client-id` com UUID gerado no boot
- Novo endpoint `/api/actions/ack` para Python reportar resultado
- Ações cobertas: `openFolder`, `openFile`, `closeFile` (close_app via psutil já existe)
- **Fora do escopo:** Electron não muda. System prompt não muda. pc-tools.ts SSE pattern (task:pc_action) não muda.

</domain>

<decisions>
## Implementation Decisions

### D-01: Mecanismo de registro — SSE persistente dedicada
- Python abre conexão SSE de longa duração para `/api/actions/events?clientId={uuid}` ao iniciar
- Gateway armazena o SSE writer em um novo Map (análogo a `clientConnections` para WS)
- Quando `dispatch-action` é chamado para um Python clientId (sem WS ativa), gateway emite `task:pc_action` nessa SSE persistente
- **Diferença do Electron:** Electron usa WS bidirecional. Python usa SSE (server→client) + POST (client→server)

### D-02: Python client — geração e envio do clientId
- Python gera UUID fixo no boot (persistente em `~/.jarvis/client_id` ou gerado once per process)
- Envia `x-jarvis-client-id: {uuid}` em TODOS os requests ao gateway (chat, tasks, etc.)
- Abre SSE persistente para `/api/actions/events?clientId={uuid}` no boot, mantém viva com reconexão automática

### D-03: Dispatch path no gateway — fallback Python SSE
- `action-dispatcher.ts`: quando `clientConnections.get(clientId)` retorna null/closed, verificar novo Map `pythonSseClients`
- Se Python SSE encontrado: emitir `{ type: "task:pc_action", requestId, action, args }` na SSE
- Aguardar ACK via `pendingAckResolvers` (mesmo mecanismo já existente para WS)
- Timeout: 30s (Python pode ser mais lento que Electron por precisar de confirmação no terminal)

### D-04: Endpoint de ACK — POST /api/actions/ack
- Novo endpoint no gateway
- Payload: `{ requestId: string, status: "confirmed" | "denied" | "timeout", content?: string }`
- Gateway resolve `pendingAckResolvers.get(requestId)` com o ACK
- Erro se `requestId` não encontrado: 404

### D-05: Confirmação no terminal Python — pedir antes de executar
- Para `openFolder` e `openFile`: exibir `"Confirmar: abrir [path]? [s/n] (5s): "` antes de executar
- Para `closeFile`: exibir `"Confirmar: fechar processo [name]? [s/n] (5s): "`
- Timeout de 5s → auto-cancel se sem input
- Aceitar: "s", "sim", "y", "yes" (case-insensitive)
- Recusar: qualquer outra coisa ou timeout → status "denied"
- Manter `confirm_destructive()` existente para ações destrutivas (delete, etc.) com timeout de 10s

### D-06: Ações Python cobertas nesta fase
| Action | Implementação Python | Status |
|--------|---------------------|--------|
| `openFolder` | `open_folder()` em pc_control.py | Já implementado |
| `openFile` | `open_file()` em pc_control.py | Já implementado |
| `closeFile` | `close_app()` em pc_control.py via psutil | Já implementado |
| `viewContent` | `read_file()` em pc_control.py | Já implementado (adicionar ao Python dispatch) |

### Claude's Discretion
- Nome exato do Map para SSE clients no gateway (`pythonSseClients`, `sseConnections`, etc.)
- Formato exato do evento SSE emitido (usar padrão `data: {json}\n\n`)
- UUID gerado no boot: in-memory (por processo) ou persistente em `~/.jarvis/client_id`
- Reconexão automática da SSE persistente: backoff linear ou exponencial (simples é ok)
- Detecção de clientType: por prefix ("python-" no clientId) ou por registro separado

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gateway — dispatch e WS (padrão a espelhar para Python)
- `apps/gateway/src/lib/action-dispatcher.ts` — `sendActionRequest()` — lógica de dispatch atual via WS; a path Python SSE é adicionada aqui
- `apps/gateway/src/lib/ws-server.ts` — `clientConnections`, `pendingAckResolvers` — Maps e padrão de ACK a replicar para SSE
- `apps/gateway/src/routes/dispatch-action.ts` — endpoint chamado pelo backend-ts

### Backend TS — tool que falha sem clientId
- `apps/backend-ts/src/session/request-file-action.ts` — a tool `request_file_action`; linhas 66-70 onde clientId vazio causa erro
- `apps/backend-ts/src/routes/chat.ts` — L47-53 onde `x-jarvis-client-id` é lido do header e passa para `setClientId()`

### Python client — código a modificar
- `apps/desktop-py/src/jarvis_desktop/chat.py` — L252-267 (`task:pc_action` handler já existente); adicionar handler da nova SSE persistente
- `apps/desktop-py/src/jarvis_desktop/pc_control.py` — implementações locais de `open_folder`, `open_file`, `close_app`, `read_file` (já existem)
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — L71-72 onde `init_pc_control` é chamado; boot point para SSE persistente

### System prompt (referência — NÃO modificar)
- `apps/backend-ts/src/session/system-prompt.ts` — L21: "Abrir pasta → request_file_action" — confirma que o LLM usa essa tool; não muda nesta fase

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pendingAckResolvers` Map em `ws-server.ts` — mesmo mecanismo resolve ACKs do Python; só adicionar novo `pendingAckResolvers` entry quando Python emitir SSE
- `open_folder()`, `open_file()`, `close_app()`, `read_file()` em `pc_control.py` — implementações completas prontas para uso
- `confirm_destructive()` em `pc_control.py` — reutilizar (com timeout menor de 5s) para confirmação de open/close
- `_post_task_resume()` em `chat.py` — padrão de POST de resultado de volta ao backend; pode servir de referência para o novo POST /api/actions/ack

### Established Patterns
- WS ACK pattern: `pendingAckResolvers.set(requestId, resolver)` + timer + `ws.send()` + `resolver()` no message handler
- Python SSE pattern: `data: {json}\n\n` (padrão EventSource)
- clientId via header: `req.headers['x-jarvis-client-id']` em `chat.ts` L47

### Integration Points
- `action-dispatcher.ts`: adicionar branch `pythonSseClients.get(clientId)` após a verificação WS atual
- `ws-server.ts` ou novo arquivo: novo Map `pythonSseClients` + endpoint `/api/actions/events` SSE
- `__main__.py`: iniciar SSE persistente após `init_pc_control(config)`
- `chat.py`: enviar `x-jarvis-client-id` header em todos os requests ao gateway

</code_context>

<specifics>
## Specific Ideas

- O padrão é simétrico: Electron WS ↔ Python SSE+POST. O gateway adiciona uma segunda "perna" que usa SSE em vez de WS, mas o mesmo `pendingAckResolvers` e `sendActionRequest` logic.
- Python SSE client fica em background thread/asyncio task separada do loop de chat.
- Usar `uuid.uuid4()` gerado no boot do processo (não precisar persistir em disco — simplifica).

</specifics>

<deferred>
## Deferred Ideas

- **viewContent via Python** — `read_file()` já existe; pode ser adicionado ao dispatch Python nesta fase ou como extensão imediata (dependência de arquitetura é a mesma)
- **Confirmação via voz** — `confirm_destructive()` já suporta voice queue; mas nesta fase o foco é terminal input simples
- **Python como cliente WS** — Python poderia usar WS em vez de SSE+POST para simetria total; mas SSE é mais simples dado que Python já é SSE consumer

None — discussion stayed within phase scope

</deferred>

---

*Phase: 84-fix-pc-control-python-native-fallback*
*Context gathered: 2026-05-28*
