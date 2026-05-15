# Phase 69: MCP Server Removal - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS deixa de ser um MCP Server. Phase 69 remove:
- stdio transport + as 5 tools MCP expostas (recall_memory + 4 file actions) do backend-ts
- IPC handlers server-side (`mcp:toggle`, `mcp:get-connected-clients`) do Electron
- Os métodos `toggle`/`getConnectedClients` do bridge `window.mcp` (preload)
- O sub-block "Servidor MCP" do `McpSection.tsx` da Settings UI
- A chave `mcpServerEnabled` do schema do electron-store + accessors

JARVIS continua sendo MCP Client — `mcp/client/*`, `routes/mcp-client.ts`, IPCs `mcp-client:*`, e os métodos client de `window.mcp` (`reloadClient`, `getClientStatus`, `onClientStatusChanged`) permanecem intactos. Tools de servers externos configurados via `.env` seguem aparecendo no chat.

**Fora de escopo desta phase:** remoção da seção MCP inteira da Settings UI (P70 — vai junto da migração LLM); remoção da dependência `@modelcontextprotocol/sdk` (client ainda usa); migração de configs LLM para `.env` (P70); distribuição multi-plataforma (P71).

</domain>

<scout_finding>
## Scout finding — MCP Server é dead code

`createMcpServer()` em `apps/backend-ts/src/mcp/server.ts` está implementado e exportado, mas **nunca é chamado em produção**:
- `apps/backend-ts/src/index.ts` e `apps/backend-ts/src/app.ts` não importam `createMcpServer` nem `server.ts`
- Os únicos call sites de `createMcpServer` estão em `apps/backend-ts/src/mcp/__tests__/server.test.ts`
- O toggle UI (`mcp:toggle`) **não inicia/para o servidor** — só persiste o booleano em `mcpServerEnabled` no electron-store. O retorno `status: 'started'/'stopped'` é cosmético

Significa que Phase 64 entregou a feature como código + UI + testes, mas o stdio transport nunca foi conectado ao runtime. Phase 69 portanto é deletion pura, sem precisar desligar nenhum processo vivo nem migrar usuários ativos.

</scout_finding>

<decisions>
## Implementation Decisions

### Bridge window.mcp — manter enxuto
- **D-01:** Manter o objeto `window.mcp` no preload, removendo apenas os métodos server-side (`toggle`, `getConnectedClients`). Os métodos client-side (`reloadClient`, `getClientStatus`, `onClientStatusChanged`) permanecem no mesmo bridge `window.mcp`. Razão: mínimo churn, McpSection.tsx mantém suas referências atuais (`window.mcp.reloadClient(...)`, `window.mcp.onClientStatusChanged(...)`). Mesma filosofia cirúrgica do Phase 68.
- **D-02:** No preload (`apps/desktop/src/preload/settings.ts`), remover `MCP_TOGGLE_CHANNEL`, `MCP_GET_CONNECTED_CLIENTS_CHANNEL`, e as propriedades `toggle`/`getConnectedClients` do objeto `mcp`. O `contextBridge.exposeInMainWorld('mcp', mcpWithSubscription)` continua, agora com 3 métodos só.
- **D-03:** Em `apps/desktop/src/shared/ipc-types.ts`, remover do `IPC_CHANNELS`: `MCP_TOGGLE`, `MCP_GET_CONNECTED_CLIENTS`. Remover do type `SettingsApi['mcp']` as propriedades `toggle`/`getConnectedClients`. Remover o type `McpClientInfo` (só era usado pelo retorno de `getConnectedClients`). O type `McpClientStatus` permanece (usado pelo MCP Client).

### Backend MCP Server — deletion total
- **D-04:** Apagar os arquivos:
  - `apps/backend-ts/src/mcp/server.ts`
  - `apps/backend-ts/src/mcp/client-sessions.ts`
  - `apps/backend-ts/src/mcp/tools/memory.ts`
  - `apps/backend-ts/src/mcp/tools/file-actions.ts`
  - `apps/backend-ts/src/mcp/tools/` (a pasta fica vazia — remover também)
  - `apps/backend-ts/src/mcp/__tests__/server.test.ts`
  - `apps/backend-ts/src/mcp/__tests__/tools/memory.test.ts`
  - `apps/backend-ts/src/mcp/__tests__/tools/file-actions.test.ts`
  - `apps/backend-ts/src/mcp/__tests__/tools/` (fica vazia — remover)
- **D-05:** `apps/backend-ts/src/mcp/` mantém apenas a subpasta `client/`. Não subir conteúdo para `mcp/` raiz — a estrutura atual já é semanticamente coerente.
- **D-06:** Dependência `@modelcontextprotocol/sdk` em `apps/backend-ts/package.json` **permanece** — o MCP Client (`mcp/client/manager.ts`, `tool-adapter.ts`) usa `Client`, `StreamableHTTPClientTransport`, `SSEClientTransport`. Não remover.

### Electron IPC handlers server-side — deletion total
- **D-07:** Em `apps/desktop/src/main/ipc/mcp-settings.ts`, remover os 2 `ipcMain.handle()` server-side: `IPC_CHANNELS.MCP_TOGGLE` e `IPC_CHANNELS.MCP_GET_CONNECTED_CLIENTS`. Manter os handlers client-side: `MCP_CLIENT_RELOAD`, `MCP_CLIENT_GET_STATUS`, e o broadcast `MCP_CLIENT_STATUS_CHANGED`. Renomear o arquivo? Não — `mcp-settings.ts` continua semanticamente correto (handlers MCP no Settings).
- **D-08:** Em `apps/desktop/src/main/ipc/settings.ts`, remover o import `getMcpServerEnabled` e a propriedade `mcpServerEnabled` do payload de `settings:get` (linha 101). Verificar que `settings.test.ts` reflete a mudança (linha 87 do test mock retorna `false`).

### electron-store — apagar schema agora
- **D-09:** Em `apps/desktop/src/main/store.ts`, remover:
  - Linhas 73-74 (declaração `mcpServerEnabled?: boolean`)
  - Linhas 454-459 (`getMcpServerEnabled` e `setMcpServerEnabled`)
- **D-10:** Sem migração ativa. Usuários que tinham `mcpServerEnabled: true/false` no settings.json mantêm a chave órfã — electron-store ignora chaves desconhecidas no schema, não causa crash. Razão: 1) MCP Server nunca rodou em produção (D-04 scout), então o valor é inócuo independente de qual estado tinha; 2) zero risco de regressão; 3) Phase 68 estabeleceu padrão de read-time normalization sem migração explícita (D-07 do Phase 68).

### Settings UI — strip apenas o sub-block server
- **D-11:** Em `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx`, remover o `<Field>` "Servidor MCP" e suas dependências (`enabled`, `connectedClients`, `onToggle`, `isToggling` na prop interface — todas vão embora). O componente passa a receber zero props (ou só os que o "Cliente MCP" sub-block precisar, mas ele é self-contained — provavelmente zero). Renomear arquivo? Não — `McpSection.tsx` continua válido enquanto a section ainda existe.
- **D-12:** Em `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx`, remover:
  - `mcpEnabled`/`setMcpEnabled` (linha 126), `mcpClients`/`setMcpClients` (linha 127), `mcpToggling`/`setMcpToggling` (linha 128)
  - `setMcpEnabled(data.mcpServerEnabled ?? false)` (linha 175)
  - Função `handleMcpToggle` (linhas 460-481)
  - Props passadas para `<McpSection>` (linhas 587-590) — agora monta sem props server
- **D-13:** A section key `'mcp-server'` no `SectionKey` union (linha 21) **permanece** — a section ainda existe (com o sub-block Cliente MCP). Phase 70 vai remover a section inteira; renomear o key para `'mcp-client'` agora seria churn desnecessário (P70 vai deletar de qualquer jeito).
- **D-14:** A label "Servidor MCP" no nav (linha 31) **permanece intacta também** — sair de "Servidor MCP" para "MCP" ou "Cliente MCP" pode ser feito, mas trava decisão de UX que P70 já vai resolver removendo. **Manter "Servidor MCP" como label** mesmo que o conteúdo seja só client — Phase 70 deleta tudo.

### Testes
- **D-15:** Apagar `mcp/__tests__/server.test.ts` (não testa nada que existe mais) e os 2 tests de tools (`memory.test.ts`, `file-actions.test.ts`) per D-04. Não preservar como skipped/attic — código removido, teste removido.
- **D-16:** Smoke test E2E do critério 3 — confiar no `apps/backend-ts/src/mcp/client/__tests__/e2e-mock-server.test.ts` existente. Esse teste mocka o SDK do MCP e testa o `McpClientManager` end-to-end (connect → listTools → callTool). Como `mcp/client/*` não é tocado em P69, o teste deve passar inalterado. Verificar isso no execute-phase como gate de regressão.
- **D-17:** Atualizar `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — remover `getMcpServerEnabled: () => false` do mock (linha 87) e qualquer fixture/expectation que mencione `mcpServerEnabled` no payload de `settings:get`.

### Claude's Discretion
- Ordem dos commits/plans dentro da phase — provavelmente split natural: (a) backend deletion, (b) Electron IPC + preload + store cleanup, (c) Renderer SettingsLayout/McpSection strip + tests. Planner decide.
- Se a label do nav vira "Cliente MCP" ou fica "Servidor MCP" até P70 — D-14 sugere manter, mas planner pode preferir trocar para "MCP" se for trivial.
- Comentários históricos `// Phase 64 (MCP-SRV-03)` em arquivos remanescentes (McpSection.tsx, mcp-settings.ts, etc.) — limpar para `// Phase 65 (MCP-CLI-01)` ou deixar dual. Planner decide.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend — MCP Server (TO DELETE)
- `apps/backend-ts/src/mcp/server.ts` — `createMcpServer` factory; apagar (D-04)
- `apps/backend-ts/src/mcp/client-sessions.ts` — stdio client tracker; apagar (D-04)
- `apps/backend-ts/src/mcp/tools/memory.ts` — `registerMemoryTools` (recall_memory tool); apagar (D-04)
- `apps/backend-ts/src/mcp/tools/file-actions.ts` — `registerFileActionTools` (list_files, openFile, openFolder, viewContent); apagar (D-04)
- `apps/backend-ts/src/mcp/__tests__/server.test.ts` — apagar (D-15)
- `apps/backend-ts/src/mcp/__tests__/tools/memory.test.ts` — apagar (D-15)
- `apps/backend-ts/src/mcp/__tests__/tools/file-actions.test.ts` — apagar (D-15)

### Backend — MCP Client (KEEP INTACT)
- `apps/backend-ts/src/mcp/client/manager.ts` — `McpClientManager`; não tocar
- `apps/backend-ts/src/mcp/client/env-diff.ts` — `.env` watcher para MCP_SERVER_*; não tocar
- `apps/backend-ts/src/mcp/client/tool-adapter.ts` — adapter MCP tools → LangChain; não tocar
- `apps/backend-ts/src/mcp/client/__tests__/*` — não tocar; usado como gate (D-16)
- `apps/backend-ts/src/routes/mcp-client.ts` — `/internal/mcp-client/{reload,status}`; não tocar
- `apps/backend-ts/src/index.ts` §71-90 — boot do `mcpManager.reload()`; não tocar

### Electron — IPC + preload + store
- `apps/desktop/src/main/ipc/mcp-settings.ts` — strip server handlers (D-07); manter client handlers
- `apps/desktop/src/main/ipc/settings.ts` §43, §101 — remover getMcpServerEnabled import e mcpServerEnabled do payload (D-08)
- `apps/desktop/src/main/ipc/__tests__/settings.test.ts` §87 — remover mock getMcpServerEnabled (D-17)
- `apps/desktop/src/main/store.ts` §73-74, §454-459 — apagar schema + accessors (D-09)
- `apps/desktop/src/preload/settings.ts` §112-148 — strip server methods do bridge (D-02)
- `apps/desktop/src/shared/ipc-types.ts` §322, §323, §466 (McpClientInfo), §560 (toggle/getConnectedClients) — remover (D-03); manter §325-327 (MCP_CLIENT_*) e §476-499 (McpClientStatus)

### Renderer — Settings UI
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` §97-129 (Servidor MCP Field) — apagar; manter §131-148 (Cliente MCP Field); ajustar props interface (D-11)
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` §21, §126-128, §175, §460-481, §585-590 — strip mcp server state/handlers (D-12, D-13)

### Project-level docs
- `.planning/PROJECT.md` — Phase 69 em "Current Milestone v3.1"; também atualizar o status de MCP-SRV-01/02/03 (atualmente "✓ Phase 64") para refletir que feature foi removida em v3.1 (Claude's discretion — pode ficar pra complete-milestone audit)
- `.planning/REQUIREMENTS.md` — MCP-RM-01, MCP-RM-02 são os requirements desta phase
- `.planning/ROADMAP.md` §Phase 69 — Goal e success criteria

### Historical context (predecessor phases)
- Phase 64 — entregou MCP Server (stdio + 5 tools + IPC + Settings UI Server sub-block + electron-store key). Phase 69 desfaz inteiramente.
- Phase 65 — entregou MCP Client (manager + routes + IPC client + Settings UI Client sub-block + .env hot-reload). Phase 69 preserva 100%.
- Phase 68 D-07 — estabeleceu padrão de read-time normalization para store key obsoleta sem migração ativa. Aplicar mesmo padrão para `mcpServerEnabled` (D-10).

</canonical_refs>

<code_context>
## Existing Code Insights

### Dead code descobierto
- `createMcpServer`, `client-sessions`, `registerMemoryTools`, `registerFileActionTools` nunca executam em produção — só nos próprios tests. Phase 69 remove código que nunca rodou.

### Estrutura modular limpa
- `mcp/server.ts` e `mcp/tools/*` são totalmente isolados de `mcp/client/*`. Zero imports cruzados — deletion não cascateia para o client.
- `client-sessions.ts` é usado **apenas** por `server.ts` (`clientSessions.connect/disconnect` no transport). Apagar junto.

### Bridge dual no preload
- O preload chama `contextBridge.exposeInMainWorld('mcp', mcpWithSubscription)` — um único bridge `window.mcp` com 5 métodos misturados. McpSection.tsx (Cliente sub-block) usa `window.mcp.reloadClient`, `getClientStatus`, `onClientStatusChanged`. Manter o bridge enxuto (D-01) mantém essas refs funcionando sem refactor.

### IPC handlers compartilham módulo
- `setupMcpSettingsHandlers()` registra os 5 handlers (2 server + 3 client) no mesmo arquivo. Strip surgical dos 2 server (D-07) mantém o setup function viva.

### Settings UI sub-block split limpo
- McpSection.tsx tem 2 `<Field>` claramente separados por comentários "Phase 64 — Servidor MCP" e "Phase 65 — Cliente MCP (D-10)". O delete do primeiro `<Field>` é cirúrgico — não toca o segundo.

### electron-store schema central
- store.ts já tem padrão: schema typed (linhas ~50-90) + accessors no fim (linhas 400+). Remover `mcpServerEnabled` é deleter 2 linhas de schema + 6 linhas de accessors.

</code_context>

<specifics>
## Specific Ideas

- Usuário pediu "remoção atômica" no ROADMAP (Depends on: Nothing) — Phase 69 é independente de SIMP, P70, P71. Deve ficar self-contained, mergeable isoladamente.
- Filosofia consistente com Phase 68: cirúrgico > refactor. Minimizar diff, máximo isolamento de risco. Daí D-01 (manter `window.mcp` enxuto), D-10 (sem migração ativa), D-13 (não renomear section key).
- MCP Server era feature "vapor" — Phase 64 entregou código + UI mas nunca foi wireado. Como nunca rodou, não há regressão possível em usuários atuais (toggle UI era no-op cosmético). Reforça a baixa criticidade do delete.
- MCP Client é o que importa preservar — config via `.env` para n8n e outros servers externos. O smoke test E2E do `e2e-mock-server.test.ts` é o gate.

</specifics>

<deferred>
## Deferred Ideas

- **Remoção da section MCP inteira do Settings UI** — McpSection.tsx, McpSection key, label "Servidor MCP" no nav. Phase 70 vai remover junto com a seção LLM e a migração para `.env`. Phase 69 deixa o sub-block "Cliente MCP" visível porque a section ainda existe.
- **Renomear `mcp-settings.ts` para `mcp-client-settings.ts`** — após D-07, o arquivo só tem handlers client. Renomear é cosmético; pode ficar para limpeza pós-P70.
- **Limpar comentários históricos "Phase 64"** em arquivos remanescentes (McpSection.tsx Cliente sub-block, mcp-settings.ts) — Claude's discretion no planner.
- **Atualizar MCP-SRV-01/02/03 no PROJECT.md** para refletir que feature foi removida em v3.1 — pode entrar no complete-milestone audit no fim de v3.1, não bloqueia P69.
- **Remover dep `@modelcontextprotocol/sdk` do backend-ts** — Não. Client ainda usa (D-06). Mantém.
- **Active migration deletando `mcpServerEnabled` no boot** — Considerado e rejeitado (D-10). Pode ser reavaliado se electron-store crescer muito com chaves órfãs, mas nesta phase é desnecessário.

</deferred>

---

*Phase: 69-mcp-server-removal*
*Context gathered: 2026-05-10*
