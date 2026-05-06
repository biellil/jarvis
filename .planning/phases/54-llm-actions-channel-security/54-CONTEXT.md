# Phase 54: LLM Actions — Channel & Security — Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Canal WebSocket bidirecional entre o gateway (porta 3000) e o Electron está operacional. O LLM pode disparar pedidos de ação via LangGraph tool, o gateway valida a whitelist de paths, o Electron mostra toast de confirmação, o backend-ts registra o audit log. **Sem execução real de ações do OS** — isso é Phase 55.

</domain>

<decisions>
## Implementation Decisions

### WebSocket — Onde fica

- **D-01:** WebSocket server fica no **gateway** (`/api/actions`, porta 3000). O gateway é o único ponto de entrada para o Electron — consistente com a arquitetura atual.
- **D-02:** Gateway mantém `Map<clientId, WebSocket>` em memória para lookup de conexão ativa.
- **D-03:** `clientId` é gerado no Electron via `crypto.randomUUID()`, persistido em electron-store, enviado como query param na conexão WS: `ws://gateway:3000/api/actions?clientId=<uuid>`.

### Audit Log — Persistência

- **D-04:** Gateway **não persiste** o audit log diretamente. Ao processar qualquer ação (aprovada, negada, timeout, whitelist rejected), faz `POST /internal/actions-log` para o backend-ts, que persiste via Drizzle ORM no SQLite existente.
- **D-05:** Rejeições por whitelist **também são auditadas** — o gateway loga antes de rejeitar a requisição ao Electron.

### LLM → Ação

- **D-06:** O LLM dispara ações via **LangGraph tool** chamada `request_file_action`. Quando o LLM decide executar uma ação, chama a tool com `{action, path}`.
- **D-07:** A tool **bloqueia até receber o ACK** do Electron — `await` com timeout de **12s** (10s do toast + 2s de folga de rede). Retorna `'confirmed'`, `'denied'` ou `'timeout'` para o LLM continuar o raciocínio.
- **D-08:** A tool valida a whitelist **antes** de enviar ao Electron. Se inválido, retorna erro imediatamente e loga no audit log.

### Schema de Mensagens

- **D-09:** Mensagem do **gateway → Electron** (request de ação):
  ```json
  {
    "type": "action_request",
    "requestId": "<uuid-gerado-pelo-gateway>",
    "action": "openFolder" | "openFile" | "closeFile" | "viewContent",
    "path": "/absolute/path/to/target",
    "model": "lmstudio/ministral-8b"
  }
  ```
- **D-10:** Mensagem do **Electron → gateway** (ACK):
  ```json
  {
    "type": "action_ack",
    "requestId": "<mesmo-uuid>",
    "status": "confirmed" | "denied" | "timeout"
  }
  ```
- **D-11:** `requestId` é gerado pelo gateway por requisição — garante correlação mesmo se múltiplas ações chegarem em sequência.

### Toast de Confirmação (LACT-06)

- **D-12:** **Electron controla o timer de 10s.** Ao receber `action_request`, renderer mostra toast não-bloqueante e inicia `setTimeout(10_000)`.
- **D-13:** Se o usuário não interagir em 10s, Electron manda ACK `{status: 'timeout'}` ao gateway e fecha o toast silenciosamente.
- **D-14:** O gateway aguarda o ACK sem timer próprio — confia no Electron para garantir a resolução.

### Whitelist de Paths (LACT-07)

- **D-15:** Validação com **Zod no gateway**, antes de enviar ao Electron. Paths fora de `home`, `Downloads`, `Documents`, `Desktop` são rejeitados com erro descritivo.
- **D-16:** Resolução de paths absolutos usa `os.homedir()` no gateway (Node.js nativo) — independente do OS do Electron.

### Reconexão WebSocket

- **D-17:** Electron usa **backoff exponencial**: 1s → 2s → 4s → 8s → máx 30s. Reconecta silenciosamente em background.
- **D-18:** Ações LLM não estão disponíveis enquanto WS desconectado — a tool `request_file_action` retorna erro imediato se não há conexão ativa para o `clientId`.

### Claude's Discretion

- Estrutura interna da tabela `actions_log` no SQLite (schema Drizzle) — planner decide colunas exatas.
- Nome do endpoint interno `POST /internal/actions-log` — planner pode ajustar.
- Detalhes do retry/reconnect no lado gateway (se clientId reconecta com nova WS, como substituir no Map).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase
- `.planning/REQUIREMENTS.md` §LACT-06, LACT-07, LACT-08, LACT-09 — requisitos de confirmação, whitelist, audit log e canal WS

### Roadmap e success criteria
- `.planning/ROADMAP.md` §Phase 54 — 4 success criteria concretos que definem "done"

### Padrões existentes do codebase
- `apps/gateway/src/app.ts` — onde montar o WebSocket server (attach ao http.Server, não ao express app)
- `apps/backend-ts/src/memory/store.ts` — padrão Drizzle ORM para nova tabela `actions_log`
- `apps/backend-ts/src/memory/schema.ts` — onde adicionar o schema da nova tabela
- `apps/backend-ts/src/memory/migrations/` — onde adicionar a migration SQL
- `apps/desktop/src/main/store.ts` — padrão get/set para `clientId` em electron-store
- `apps/desktop/src/shared/ipc-types.ts` — onde adicionar canais IPC para actions (ACTION_REQUEST, ACTION_ACK)
- `apps/desktop/src/main/ipc/index.ts` — onde registrar o novo handler de actions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/desktop/src/main/store.ts` — padrão `get/set` com electron-store já estabelecido; `clientId` segue o mesmo padrão de `getWidgetHotkey`, etc.
- `apps/backend-ts/src/memory/store.ts` — `ToolLogger` como referência para o `ActionLogger` (mesma estrutura: drizzle + insert + catch-log-never-throw)
- `apps/desktop/src/shared/ipc-types.ts` — centraliza todos os IPC channels; ACTION_REQUEST e ACTION_ACK vão aqui

### Established Patterns
- **Gateway como único ponto de entrada** — Electron sempre fala com gateway:3000, nunca com backend-ts:8001 diretamente
- **IPC apply-sem-restart** — configurações e eventos aplicados via IPC sem reiniciar o Electron (padrão Phase 52+)
- **Multi-window broadcast via `BrowserWindow.getAllWindows()`** — qualquer evento que precisa chegar ao renderer usa esse padrão
- **Drizzle ORM + migrations SQL** — todas as novas tabelas seguem esse padrão no backend-ts

### Integration Points
- **Gateway:** `createApp()` em `app.ts` precisa receber o `http.Server` (não só o `express app`) para o WebSocket fazer upgrade do HTTP connection
- **Backend-ts:** Nova rota `POST /internal/actions-log` (ou direto no `ToolLogger`/`ActionLogger`) para persistir o audit log
- **Electron main:** Novo módulo `src/main/actions/actionsClient.ts` que gerencia a conexão WS, reconnect, e mapeia mensagens para IPC ao renderer
- **Electron renderer:** Toast component para mostrar confirmação de ação (reutiliza padrão de toast existente se houver)

</code_context>

<specifics>
## Specific Ideas

- **`requestId` gerado pelo gateway** (não pelo LLM nem pelo Electron) — gateway é o árbitro da correlação
- **12s de timeout na tool LangGraph** = 10s toast + 2s folga de rede — evita que a tool trave se o Electron demorar a fechar o toast
- **Rejeições por whitelist geram audit log** — LACT-08 diz "toda tentativa", inclusive as bloqueadas

</specifics>

<deferred>
## Deferred Ideas

- **Múltiplos Electron clients simultâneos** — single-client MVP (já em REQUIREMENTS out-of-scope v2.2)
- **Execução real de ações no OS** — Phase 55

</deferred>

---

*Phase: 54-llm-actions-channel-security*
*Context gathered: 2026-05-05*
