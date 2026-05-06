# Phase 55: LLM Actions — Tool Execution — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 55 executa as ações de OS no Electron. Phase 54 já entregou o canal WS, toast de confirmação, ACK, audit log, whitelist e `sendActionRequest`. Esta fase liga tudo: as 4 ações (`openFolder`, `openFile`, `closeFile`, `viewContent`) fazem algo real no sistema operacional, e a LangGraph tool conecta o LLM ao gateway.

</domain>

<decisions>
## Implementation Decisions

### viewContent — Entrega do conteúdo ao LLM

- **D-01:** Electron lê o arquivo e envia o conteúdo no ACK via WS existente. ACK estendido com campo `content` opcional:
  ```json
  { "type": "action_ack", "requestId": "...", "status": "confirmed", "content": "texto..." }
  ```
- **D-02:** `sendActionRequest` no gateway retorna `{ status: 'confirmed' | 'denied' | 'timeout', content?: string }` em vez de só a string de status. Para ações que não são `viewContent`, `content` é `undefined`.
- **D-03:** O conteúdo flui Electron → gateway (WS ACK) → LangGraph tool (backend-ts via `/internal/dispatch-action`). Backend-ts nunca acessa o FS diretamente.
- **D-04:** Limite de 1MB conforme LACT-05. Se o arquivo exceder 1MB, Electron envia ACK `denied` com mensagem de erro descritiva.

### closeFile / closeFolder — Kill por processo

- **D-05:** `closeFile` e `closeFolder` implementados via kill por nome de processo:
  - Windows: `taskkill /IM <process_name> /F`
  - macOS/Linux: `pkill -f <process_name>`
- **D-06:** Limitação documentada: fecha **todas** as janelas do processo, não só a janela específica do path. Aceitável para MVP.
- **D-07:** O LLM recebe o nome do processo a fechar, não o path. Ex: `{action: 'closeFile', path: 'notepad.exe'}` ou o gateway infere o processo a partir do path/extensão.

### LangGraph tool → Gateway bridge

- **D-08:** Gateway expõe `POST /internal/dispatch-action` que chama `sendActionRequest` internamente. Segue o padrão já estabelecido de `/internal/actions-log`.
- **D-09:** Backend-ts faz `fetch('http://localhost:3000/internal/dispatch-action', { body: {action, path, clientId, model} })` com timeout compatível com os 12s do `sendActionRequest`.
- **D-10:** `clientId` precisa ser acessível no contexto da LangGraph tool. O `ChatSession` deve receber o `clientId` como opção de configuração (ou via env var compartilhada).
- **D-11:** A tool `request_file_action` segue o padrão de `recall_memory` (executa diretamente, retorna string) — não é payload-based como as PC tools. Não passa por `wrapPcTool`.

### Execution trigger no Electron

- **D-12:** Ordem: **Execute → ACK**. Renderer envia IPC ao main após o usuário confirmar o toast. Main executa a ação (`shell.openPath`, kill, `fs.readFile`). Só após resultado, o IPC retorna e o renderer envia ACK para o gateway.
- **D-13:** Se a execução falhar (ex: arquivo não encontrado, permissão negada), o ACK vai como `'denied'` com motivo do erro — não como `'confirmed'`. O LLM recebe informação fiel ao que aconteceu no OS.
- **D-14:** O handler no main que recebe o IPC do renderer é responsável por despachar para o executor correto por tipo de ação.

### Claude's Discretion

- Schema Zod exato do `POST /internal/dispatch-action` — planner define os campos.
- Como `clientId` flui para a tool (parâmetro de sessão, env var, ou outro mecanismo).
- Como inferir nome do processo a partir do path/extensão para `closeFile` (mapeamento ou heurística).
- Nomeação do novo IPC channel Electron (main ↔ renderer) para despacho de execução.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase
- `.planning/REQUIREMENTS.md` §LACT-01..05 — os 5 requisitos que esta fase entrega

### Roadmap e success criteria
- `.planning/ROADMAP.md` §Phase 55 — 5 success criteria concretos que definem "done"

### Decisões de Phase 54 (base desta fase)
- `.planning/phases/54-llm-actions-channel-security/54-CONTEXT.md` — schema de mensagens WS, padrão ACK, whitelist, audit log, `sendActionRequest`

### Padrões existentes do codebase
- `apps/gateway/src/lib/action-dispatcher.ts` — `sendActionRequest` a ser chamada pelo novo endpoint `/internal/dispatch-action`
- `apps/gateway/src/lib/path-validator.ts` — schema Zod do ACK (estender com `content?: string`)
- `apps/gateway/src/routes/actions-log.ts` — padrão de endpoint `/internal/` a seguir para `/internal/dispatch-action`
- `apps/desktop/src/main/actions/actionsClient.ts` — recebe `action_request`, repassa ao renderer via IPC
- `apps/desktop/src/renderer/src/hooks/useActionConfirmation.ts` — lida com toast; precisa ser estendido para disparar IPC de execução ao main antes do ACK
- `apps/desktop/src/shared/ipc-types.ts` — onde adicionar novos IPC channels de execução
- `apps/backend-ts/src/session/tools.ts` — padrão `createRecallMemoryTool` para a nova `request_file_action` tool
- `apps/backend-ts/src/session/chat-session.ts` — onde registrar a nova tool no agent

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/desktop/src/main/actions/index.ts` — `ACTION_HANDLERS` existente (v1.0 PC control); os novos handlers `openFolder`, `openFile`, `closeFile`, `viewContent` seguem a mesma interface `ActionHandler`
- `apps/desktop/src/main/actions/types.ts` — `ok()` e `fail()` helpers reutilizáveis
- `apps/desktop/src/main/actions/validators.ts` — `runExecFile` helper para processos externos (reutilizar para kill)
- `apps/desktop/src/renderer/src/hooks/useActionConfirmation.ts` — já tem `sendAck`; precisa de um `executeAndAck` que faz IPC ao main antes
- `apps/backend-ts/src/session/tools.ts` — padrão `tool()` do LangChain com schema Zod + async executor

### Established Patterns
- `/internal/` prefix para rotas gateway não expostas ao exterior (já tem `/internal/actions-log`)
- `shell.openPath()` do Electron — cross-platform para abrir arquivos e pastas no app padrão
- `BrowserWindow.getAllWindows()` para broadcast — padrão de multi-window IPC já estabelecido
- `ok(output)` / `fail(error)` — retorno estruturado dos action handlers

### Integration Points
- **Gateway:** novo `POST /internal/dispatch-action` → chama `sendActionRequest` → aguarda ACK do Electron
- **Electron main:** novo IPC handler que recebe `{action, path}` do renderer e executa a ação no OS
- **Electron renderer:** `useActionConfirmation` estendido: confirm → IPC execute → ACK
- **backend-ts:** nova tool `request_file_action` registrada no `ChatSession` junto com `recall_memory`

</code_context>

<specifics>
## Specific Ideas

- Para `viewContent`, o conteúdo do arquivo aparece como parte da resposta do LLM (LLM recebe via tool result e inclui na mensagem) — não como mensagem separada injetada pelo renderer.
- ACK estendido: campo `content` só presente quando `action === 'viewContent'` e `status === 'confirmed'`.
- `closeFile`/`closeFolder` mapeados para o mesmo handler no Electron (ambos matam processo); a distinção semântica é só para o LLM.

</specifics>

<deferred>
## Deferred Ideas

- **Fechar janela específica** (não todos os processos com aquele nome) — window manager API cross-platform, complexidade alta para MVP
- **Múltiplos Electron clients** — single-client MVP conforme REQUIREMENTS out-of-scope v2.2

</deferred>

---

*Phase: 55-llm-actions-tool-execution*
*Context gathered: 2026-05-06*
