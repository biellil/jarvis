# Phase 18: PC Control Tools — Backend (Payloads + Audit + SSE) — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 18 (interativo)

<domain>
## Phase Boundary

Esta fase entrega o **lado backend** das 9 ferramentas de controle de PC. O escopo é deliberadamente metade do trabalho — a outra metade vive na **Fase 18.5 — Electron Executor**.

**Dentro de escopo (Fase 18):**
- 9 funções LangChain `tool()` em TS que retornam payloads `{action, args}` (zero side effects).
- Registro das 9 tools no `createReactAgent` da `ChatSession` (Fase 17).
- Audit log de **dispatch** via `ToolLogger` existente — toda vez que o agent invoca uma tool, grava-se em `tool_calls` com `outcome='dispatched'`.
- Estender o protocolo SSE de `/chat/stream` com novo event type `event: action\ndata: {payload}\n\n` quando o agent invoca uma tool.
- Endpoint `POST /tool-calls/:id/result` que aceita `{success, output, error}` do cliente Electron e atualiza a linha do `tool_calls` com o outcome real.
- Snapshot tests: cada tool comparada com o payload do equivalente Python.

**Fora de escopo (Fase 18.5):**
- Qualquer execução real de subprocess (subprocess `pactl`, `xdg-open`, `brightnessctl`, fs ops).
- Confirmação destrutiva — vai rodar via `dialog.showMessageBox()` no Electron.
- Lado Electron consumindo o SSE.
- Fallback server-side caso a 18.5 trave (sub-fase 18.5.x).

**Fora de escopo (geral):**
- `analyze_screen` (vision) — fica pra Fase 19 ou separado.
- macOS, Windows — Linux only nesta fase E na 18.5.

</domain>

<decisions>
## Implementation Decisions

### Q1 — Lista das 9 tools
**Confirmadas:**
1. `open_app(app_name: string)` → `{action: "open_app", args: {app: app_name}}`
2. `close_app(app_name: string)` → `{action: "close_app", args: {app: app_name}}`
3. `list_files(directory: string)` → `{action: "list_files", args: {directory}}`
4. `search_files(pattern: string, directory?: string = ".")` → `{action: "search_files", args: {pattern, directory}}`
5. `move_file(source: string, destination: string)` → `{action: "move_file", args: {source, destination}, requires_confirmation: false}`
6. `delete_file(file_path: string)` → `{action: "delete_file", args: {file_path}, requires_confirmation: true}`
7. `set_volume(level: number)` → `{action: "set_volume", args: {level}}`
8. `set_brightness(level: number)` → `{action: "set_brightness", args: {level}}`
9. `list_processes()` → `{action: "list_processes", args: {}}`

`analyze_screen` (vision) está **excluída**.

### Q2 — Plataforma
**Linux only.** Igual Python `src/jarvis/executor/linux.py`.

### Q3 — Confirmação destrutiva
**Não passa pelo backend.** O backend marca `requires_confirmation: true` no payload (apenas `delete_file` por ora). O Electron (Fase 18.5) faz o `dialog.showMessageBox()` nativo. Se o usuário recusar, o Electron faz `POST /tool-calls/:id/result` com `success: false, error: "user_denied"`.

### Q4 — Sem `ActionExecutor` no backend
**Decisão arquitetural — divergência consciente vs Python:**
- O Python tem `ActionExecutor` server-side ([src/jarvis/executor/base.py](src/jarvis/executor/base.py)) que roda subprocess no mesmo processo do FastAPI.
- O TS divide responsabilidades: backend só **gera payloads**, cliente Electron **executa**.
- Tools TS são puro stubs — não chamam subprocess, não importam handlers.
- Razão: arquitetura mais limpa, separa "cérebro" (backend) de "mãos" (cliente). Permite no futuro rodar o backend remoto.
- Trade-off: quebra paridade arquitetural com Python. Validação E2E na Fase 20 testa por **comportamento** ("usuário pediu X → ação X aconteceu") e não por **onde** roda.

### Q5 — Audit log via ToolLogger
**No backend, no momento do dispatch.** Toda vez que o agent invoca uma tool:
1. Backend grava em `tool_calls` com `outcome='dispatched'`, salva o `id` retornado.
2. Backend emite o evento SSE `action` com `{tool_call_id, action, args}`.
3. Quando o Electron reportar via `POST /tool-calls/:id/result`, backend atualiza a linha com `outcome='success'|'error'|'cancelled'` e `output`/`error`.

`ToolLogger` da Fase 16 ([store.ts](apps/backend-ts/src/memory/store.ts)) já tem `log()` — pode precisar adicionar `updateOutcome(id, outcome, output, error)` ou similar. Verificar API atual.

### Q6 — Validação de paridade — snapshot tests
**Snapshot test contra fixtures Python.** Pra cada tool:
1. Gera fixture Python rodando `python -c "from jarvis.tools.apps import open_app; print(open_app.invoke({'app_name':'firefox'}))"` (uma vez, salvo em `apps/backend-ts/test/fixtures/tools/`).
2. Vitest TS roda a tool TS com mesmo input e compara JSON contra o snapshot.
3. Como o payload é estável (o Python já só retorna stub), a divergência arquitetural não afeta — esta camada é idêntica.

### Protocolo SSE estendido
Hoje o SSE de `/chat/stream` emite `data: <token>\n\n` raw. Vai virar:

```
data: token1

data: token2

event: action
data: {"tool_call_id": 42, "action": "open_app", "args": {"app": "firefox"}, "requires_confirmation": false}

data: token3

```

- Eventos de token continuam **sem** linha `event:` (paridade Python).
- Eventos de action **têm** `event: action` e `data:` JSON.
- O `EventSource` nativo do navegador suporta isso direto via `addEventListener('action', ...)`.

### Endpoint `POST /tool-calls/:id/result`
**Request:**
```json
{
  "success": true,
  "output": "<string descrevendo o que rolou>",
  "error": null
}
```
ou
```json
{
  "success": false,
  "output": null,
  "error": "Permission denied: /etc/passwd"
}
```

**Response:** `204 No Content` em caso de sucesso, `404` se o `id` não existe, `400` se body inválido.

**Sem auth** — uso pessoal, single user, mesma máquina. (Documentado como limitação.)

### Wiring no `ChatSession`
A `ChatSession` da Fase 17 já tem `tools: [recallMemoryTool]` no `createReactAgent`. Esta fase adiciona as 9 PC tools ao mesmo array:
```typescript
tools: [recallMemoryTool, openApp, closeApp, listFiles, searchFiles, moveFile, deleteFile, setVolume, setBrightness, listProcesses]
```

Como as PC tools são puras (retornam payload, sem side effects), o agente pode chamar livremente — o efeito real só aparece quando o Electron processar o SSE.

### Como o agent "sabe" que a tool foi executada?
O agente vai receber o resultado da tool **imediatamente** como `ToolMessage` (o payload retornado). Ele assume "feito" e segue. Mas o usuário pode recusar no Electron. Como reconciliar?

**Decisão:** Por ora, **agente assume sucesso ao retornar o payload**. Se o usuário recusar no Electron, o backend grava `outcome='cancelled'` no audit log, mas a conversa atual não é "rebobinada". O agente pode acabar dizendo "abri o calculator!" mesmo que o usuário tenha recusado.

**Trade-off:** UX imperfeito, mas o caminho correto exigiria interrupt/resume no LangGraph (fora de escopo aqui). Documentado como **follow-up** pra v1.4 ou Fase 18.5.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Python — referência de paridade dos payloads
- `src/jarvis/tools/apps.py` — open_app, close_app
- `src/jarvis/tools/files.py` — list_files, search_files, move_file, delete_file
- `src/jarvis/tools/system.py` — set_volume, set_brightness, list_processes
- `src/jarvis/executor/base.py` — `ActionExecutor`, ToolLogger usage, confirm_callback (referência arquitetural — **NÃO** portar literal)
- `src/jarvis/executor/linux.py` — handlers reais (referência da Fase 18.5, **NÃO** desta)

### TypeScript existente
- `apps/backend-ts/src/session/tools.ts` — onde adicionar as 9 tools (já tem `recall_memory`)
- `apps/backend-ts/src/session/chat-session.ts` — onde plugar no `createReactAgent` (linha que monta o array `tools`)
- `apps/backend-ts/src/memory/store.ts` — `ToolLogger` (verificar API: `log()`, possível `updateOutcome()`)
- `apps/backend-ts/src/memory/schema.ts` — tabela `tool_calls`
- `apps/backend-ts/src/routes/chat.ts` — onde estender o SSE com event `action`
- `apps/backend-ts/src/app.ts` — onde adicionar o novo router de tool-call results

### Decisões de milestone
- LangChain.js 1.x + @langchain/langgraph 1.x (Phase 15/17)
- Backend TS porta 8001 (Phase 14)
- Express 5 (v1.1)
- pt-BR nas descriptions de tool (LM Studio local pode ser sensível)

</canonical_refs>

<specifics>
## Specific Ideas

- Cada tool deve ter description em **pt-BR** (igual `recall_memory`), porque o LLM local (LM Studio) responde melhor em pt quando o user fala em pt.
- O `tool_call_id` exposto no SSE precisa ser o **mesmo** que o backend grava no `tool_calls.id` do SQLite — pra o Electron poder fazer `POST /tool-calls/:id/result` consistente.
- O LangGraph 1.x permite **interceptar** chamadas de tool via `tools_condition` ou middleware — usar isso pra capturar o payload e dispatchar pro SSE/audit antes de devolver pro agente.
- SSE: lembrar do `\n\n` ao final de cada evento. Pro evento nomeado, formato é literalmente:
  ```
  event: action\n
  data: {...}\n
  \n
  ```
- O `ToolLogger.log()` provavelmente devolve o `id` da linha inserida — verificar e usar como `tool_call_id` no SSE.
- Snapshot tests: salvar fixtures em `apps/backend-ts/test/fixtures/tools/<tool_name>.json` — script `pnpm fixtures:tools` que roda Python (`uv run python ...`) e gera todas as 9 fixtures.

</specifics>

<deferred>
## Deferred Ideas

- **Interrupt/resume no LangGraph** — pra agent esperar a confirmação do usuário antes de "achar que executou". Fica pra v1.4.
- **macOS, Windows handlers** — Fases futuras.
- **`analyze_screen` (vision)** — Fase 19 ou separado.
- **Auth no `POST /tool-calls/:id/result`** — single-user, sem necessidade na v1.3.
- **Fallback server-side** — sub-fase 18.5.x se a integração Electron travar (já documentado no roadmap da 18.5).
- **Tools de OS-level destrutivas** (shutdown, kill_process) — não entra nas 9, fica pra v1.4.

</deferred>

---

*Phase: 18-pc-tools-backend*
*Context gathered: 2026-04-08 via /gsd-discuss-phase*
