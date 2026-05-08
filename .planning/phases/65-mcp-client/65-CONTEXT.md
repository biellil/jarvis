# Phase 65: MCP Client - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS conecta a UM servidor MCP externo (ex: n8n) via HTTP transport, configurado por `.env`, descobre suas tools no connect e as expõe ao agente LangGraph como parte das `allTools` em `ChatSession.create()`. Conexão acontece quando `MCP_SERVER_URL` está setado; degradação limpa quando server cai. Hot-reload sem restart via file watcher do `.env` + botão manual em Settings.

**Fora de escopo (deferred):**
- Múltiplos servidores MCP simultâneos (MCP-CLI-04 — v3.1, já no backlog)
- Settings UI para adicionar/remover servidores sem `.env` (MCP-CLI-05 — v3.1, já no backlog)
- HTTP Streamable transport para o servidor MCP do JARVIS (MCP-SRV-04 — v3.1)
- Allowlist de auto-approval per-tool, polling periódico de tools, reconnect com backoff

</domain>

<decisions>
## Implementation Decisions

### Configuração & Auth (.env)

- **D-01:** `.env` carrega 3 variáveis para o cliente MCP: `MCP_SERVER_URL` (HTTP/HTTPS endpoint), `MCP_SERVER_BEARER` (token enviado em `Authorization: Bearer <token>`), `MCP_SERVER_NAME` (identifier curto definido pelo usuário, usado em prefixos de tools, logs e mensagens de erro). Cobre 90% dos casos reais (n8n, Pipedream, Zapier MCP) sem complicar.

- **D-02:** Boot é **silencioso e opt-in**: se `MCP_SERVER_URL` está vazio/não setado, MCP client não instancia, nenhuma tool externa registrada, log info único na inicialização (`[mcp-client] disabled: MCP_SERVER_URL not configured`). Não trava boot, não aviso ao usuário.

- **D-03:** Validação de formato apenas: se `MCP_SERVER_URL` existe mas é URL malformada (esquema/host inválido), log error mas backend continua subindo (cliente fica desligado nessa execução).

- **D-04:** Padrão dotenv existente do JARVIS: `.env` (commitado, com placeholders/comments para o usuário descobrir as variáveis) + `.env.local` (gitignored, valores reais). Phase 65 documenta as 3 variáveis em `.env.example` e qualquer arquivo do tipo "primeira execução". Settings UI fica para v3.1.

### Namespace, Discovery & Tool Exposure

- **D-05:** Tools externas são **prefixadas** com `MCP_SERVER_NAME` ao registrar no agente. Ex: `MCP_SERVER_NAME=n8n` + tool remota `send_email` → JARVIS expõe `n8n.send_email` ao LLM. Elimina colisão com tools nativas (`recall_memory`, `list_files`, `openFile`, etc.) e deixa óbvio em logs/system prompt qual tool é externa.

- **D-06:** Em colisão pós-prefixo (caso patológico: usuário escolhe `MCP_SERVER_NAME=memory` e servidor expõe tool `recall` → vira `memory.recall` que conflita com nativa `recall_memory`? — não conflita literal, mas se servidor expuser exatamente `memory.recall` como nome ou se `MCP_SERVER_NAME` for vazio): **tool nativa sempre vence**. Tool externa é descartada com warning log único: `[mcp-client] tool {prefixed_name} conflicts with native tool — skipped`. Garantia: JARVIS nunca perde capacidades base por tool externa.

- **D-07:** `description` repassada ao LLM é **anotada com origem**: `[via {MCP_SERVER_NAME}] {description original do servidor}`. `inputSchema` permanece idêntico ao do servidor (Zod-compatible, vai para o agente sem alteração). Anotação ajuda o LLM a explicar ao usuário ("Vou usar a tool send_email do n8n...") e implica latência/falha externa.

- **D-08:** **Sem allowlist, sem filtro**: Phase 65 registra TODAS as tools retornadas por `listTools()` no agent. Se o servidor expor 30+ tools, o LLM lida — modelos modernos toleram bem. Otimização (allowlist via env, ranking, filtro semântico) só se virar dor real e vai como follow-up phase.

### Reload, Re-discovery & Lifecycle

- **D-09:** **File watcher (chokidar)** observa `.env` e `.env.local`. Quando arquivo muda: re-parse das variáveis MCP_SERVER_*; se houve mudança em qualquer uma das 3 → trigger de reload. chokidar v5 já está na stack v3.0 (Phase 67 Proativo), reusado aqui.

- **D-10:** **Settings UI mínima** (`McpSection` da Phase 64) ganha sub-bloco "MCP Client": label de status (`Conectado a {SERVER_NAME}: {N} tools` ou `Não conectado`) + botão "Reconectar". Clique no botão dispara IPC `mcp-client:reload` no backend, que executa o mesmo fluxo do file watcher. Modelo idêntico ao IPC `RELOAD_LLM` da Phase 57.

- **D-11:** **Reload não interrompe conversa ativa.** Se um turno está em andamento, `ChatSession` mantém suas tools (snapshot do agent ReAct construído no `create()`). Tools novas/atualizadas entram apenas quando próxima `ChatSession.create()` rodar (nova sessão, ou rehydration). Toast/log único: `Tools MCP recarregadas — ativas na próxima conversa`. Evita rebuild do agent ReAct mid-stream e race conditions com tool-loop ativo.

- **D-12:** **Re-discovery (`listTools()`) só ao reconectar.** Sem polling periódico, sem subscribe a `notifications/tools/list_changed`. Se usuário adiciona tool nova no n8n: editar `.env` (qualquer mudança trivial dispara watcher) ou clicar botão Reconectar. Phase 65 é single-server estático — escopo do MVP.

- **D-13:** **Boot com servidor fora do ar:** connect timeout curto (5s). Falha → log error claro, nenhuma tool externa registrada nessa boot. URL/configuração permanece em memória — próxima trigger (file watcher ou botão) tenta de novo. **Sem auto-retry com backoff** no MVP (deferred).

### Aprovação, Audit & Error Handling

- **D-14:** **Trust mode — sem toast de confirmação** para tools MCP externas. Decisão deliberada e divergente do padrão de Phase 54/55: usuário controla `.env` (configurou o servidor explicitamente), portanto confia no conjunto. Toast de aprovação pode voltar como follow-up se a UX revelar tool calls indesejados pelo LLM. **NOTA**: isso significa que tools com side effect real (envio de email, criação de fatura) executam diretamente — usuário aceita esse risco em troca de fluxo de conversa por voz sem fricção.

- **D-15:** **Audit trail via ToolLogger existente** (`apps/backend-ts/src/session/tool-dispatch.ts`). Cada chamada de tool MCP externa gera entrada no logger com campos extras: `source: 'mcp-external'` + `serverName: MCP_SERVER_NAME`. Sem novo arquivo, sem novo schema — reusa estrutura já provada em Phases 54/55. Permite reconstruir histórico se algo der errado.

- **D-16:** **Erro estruturado retorna ao LLM** quando tool externa falha (server down mid-call, timeout, erro do servidor). Formato espelha Phase 64 D-07: `{ content: [{ type: 'text', text: 'MCP server {NAME} indisponível — tool {nome} não pode executar agora', isError: true }] }`. O agente LangGraph processa o erro como qualquer outra resposta de tool, e o LLM responde naturalmente em pt-BR (ex: "Não consegui acessar o n8n agora, vou tentar outra abordagem"). Atende SC#3 (degradação limpa).

- **D-17:** **Tool timeout default: 30s.** Hardcoded, sem env var override no MVP. Alinhado com convenção de timeouts do Phase 64. Suficiente para workflows reais do n8n; se virar dor, vira `MCP_TOOL_TIMEOUT_MS` em follow-up.

### Claude's Discretion

Decisões técnicas delegadas a researcher e planner:

- **HTTP transport variant** — `StreamableHTTPClientTransport` (MCP spec 2025-06-18) vs `SSEClientTransport` (legacy). Researcher decide com base em qual transport o n8n e maioria dos provedores MCP suportam hoje, e na estabilidade da implementação no `@modelcontextprotocol/sdk@1.29.0`.
- **Estrutura interna do `McpClientManager`** — singleton no backend `index.ts` vs lazy/per-ChatSession, cache de tools, lifecycle de transport.
- **API exata para passar tools externas a `chat-session.ts:create()`** — getter no manager, callback, ou injection direta.
- **Detecção precisa de mudança no .env** — comparar valores de `MCP_SERVER_*` entre antes/depois (evita reload em mudanças de outras envs); reusa `dotenv.parse()` ou diff manual.
- **Wrapping de tools MCP em formato `tool()` do LangChain** — converter inputSchema MCP (JSON Schema) → Zod schema, ou aceitar JSON Schema diretamente.
- **Path/integração do file watcher** — backend startup, watch absolute path do `.env` no project root, debounce de eventos rápidos.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before acting.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § Phase 65: MCP Client — goal, depends on Phase 64, success criteria (3 itens)
- `.planning/REQUIREMENTS.md` § MCP Client (JARVIS conecta a servidores externos) — MCP-CLI-01/02/03 (active), MCP-CLI-04/05 (deferred v3.1)

### Phase 64 (servidor MCP — espelho do cliente)
- `.planning/phases/64-mcp-server/64-CONTEXT.md` — padrão delegate (D-03), error handling estruturado (D-07), Zod schema → JSON Schema, ToolLogger pattern, McpSection UI base
- `apps/backend-ts/src/mcp/server.ts` — registration de tools, padrão SDK
- `apps/backend-ts/src/mcp/tools/` — exemplos de tool wrapping para protocol MCP (espelho para o cliente)
- `apps/backend-ts/src/mcp/client-sessions.ts` — pattern de Map<sessionId, metadata>; espelhar para tracking de connection no cliente

### Tool composition / agente ReAct
- `apps/backend-ts/src/session/chat-session.ts` linhas 130-200 (`ChatSession.create()`) e 240-265 (`recreateAgent()`) — onde `allTools` é montado; **integration point principal** para D-11
- `apps/backend-ts/src/session/tools.ts` — `createRecallMemoryTool` como referência de tool wrapping
- `apps/backend-ts/src/session/tool-dispatch.ts` — `ToolLogger`, `DispatchContext`, `wrapAllPcTools` (referência para tags `source` em D-15)
- `apps/backend-ts/src/session/system-prompt.ts` — system prompt atual; verificar se precisa nota sobre tools externas anotadas com `[via {NAME}]`

### IPC reload precedente
- `.planning/phases/57-google-gemini-provider/` — `RELOAD_LLM` IPC handler como template para `mcp-client:reload`
- `apps/desktop/src/main/ipc/llm.ts` — código real do RELOAD_LLM, multi-window broadcast pattern

### Settings UI base
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — Phase 64 UI; estender com sub-bloco MCP Client
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — composição existente

### Audit log precedente
- `.planning/phases/54-llm-actions-channel-security/` — ActionLogger / Drizzle pattern (referência caso queira persistir audit em DB; D-15 mantém em memória via ToolLogger por simplicidade)

### MCP SDK & Specs
- [@modelcontextprotocol/sdk@1.29.0 — Client](https://github.com/modelcontextprotocol/typescript-sdk) — `Client`, `StreamableHTTPClientTransport`, `SSEClientTransport`, `client.listTools()`, `client.callTool()`
- [MCP Spec 2025-06-18 — Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — HTTP variants, JSON-RPC framing, security
- [MCP Spec — Tools](https://modelcontextprotocol.io/docs/concepts/tools) — discovery, calling, error format

### File watcher
- `chokidar@5.0.x` — já planejado na stack v3.0 (Phase 67); usar `watch(['.env', '.env.local'], { ignoreInitial: true })` com debounce

### Outros precedentes
- `.planning/phases/60-lm-studio-streaming-events/60-CONTEXT.md` — feature flag opcional, fallback silencioso (padrão para `MCP_SERVER_URL` ausente)
- `.planning/phases/63-vision-pipeline-ts/` — tool externa que pode falhar (vision LLM ausente) e retornar erro estruturado em pt-BR ao LLM; pattern para D-16

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`ChatSession.create()` allTools array** (`apps/backend-ts/src/session/chat-session.ts:195`): linha onde tools nativas são compostas (`[recallMemoryTool, ...pcToolsWrapped, requestFileAction]`). Phase 65 estende com `...mcpExternalTools` — extension point claro.
- **`ToolLogger.log()`** (`tool-dispatch.ts`): aceita campos arbitrários; D-15 só passa `source: 'mcp-external'` + `serverName`.
- **`@modelcontextprotocol/sdk@1.29.0`**: já instalado para Phase 64 server. Cliente vem do mesmo pacote (`Client`, `StreamableHTTPClientTransport`).
- **`chokidar@5.0.x`**: já na stack v3.0 (planejado para Phase 67). Phase 65 é o primeiro consumidor.
- **`RELOAD_LLM` IPC pattern** (Phase 57): blueprint direto para `mcp-client:reload` — `ipcMain.handle` + multi-window broadcast `BrowserWindow.getAllWindows()`.
- **`McpSection.tsx`** (Phase 64): seção em Settings já existe com toggle on/off do servidor MCP; D-10 adiciona sub-bloco "Cliente" sem reescrever a seção.
- **`tool()` from `@langchain/core/tools` + Zod**: padrão consistente em todo `pc-tools.ts`, `tools.ts`, `vision-tool.ts`. Tools MCP externas viram esse formato após wrap.
- **Error format de Phase 64 D-07**: `{ content: [{ type: 'text', text: '...', isError: true }] }` — D-16 usa exatamente o mesmo shape, fica simétrico entre server e client.

### Established Patterns

- **Tool delegation**: tools nativas delegam para `MemoryManager`, `pc-tools`, etc. Tools MCP externas delegam para `client.callTool()` — mesma idéia.
- **Boot silencioso para features opcionais**: Phase 60 (LM Studio Streaming) usa pattern de feature flag + fallback silencioso. D-02 segue.
- **Error como string amigável em pt-BR**: convenção desde Phase 17/18; LLM consome erro como tool result e narra em conversação.
- **electron-store para persistência de UI** vs **`.env` para connection strings/secrets**: Phase 64 D-11 (`mcpServerEnabled` em store) — Phase 65 não persiste nada extra em store; tudo vive em `.env` + status efêmero do backend.
- **Multi-window IPC broadcast**: convenção desde Phase 52 (`SaveSettingsRequest`) — qualquer mudança que afete UI roda em todas BrowserWindows abertas.

### Integration Points

- `apps/backend-ts/src/index.ts` — instanciar `McpClientManager` no boot (após `MemoryManager`, antes de servir requests).
- `apps/backend-ts/src/mcp/client/` — novo módulo (paralelo ao `mcp/server.ts` da Phase 64).
- `apps/backend-ts/src/session/chat-session.ts:195` — adicionar `...mcpExternalTools` ao `allTools` (idem em `recreateAgent` na linha 244).
- `apps/desktop/src/main/ipc/mcp-settings.ts` — estender com handlers `mcp-client:reload`, `mcp-client:get-status`.
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — sub-bloco "MCP Client" com status + botão Reconectar.
- File watcher attach point: `apps/backend-ts/src/index.ts` ou novo `apps/backend-ts/src/config/env-watcher.ts` — chokidar instance única, debounced, dispatch para `McpClientManager.reload()`.

</code_context>

<specifics>
## Specific Ideas

- **Caso de uso primário** mencionado pelo usuário e pelo ROADMAP: **n8n** como servidor MCP externo. Decisões de auth (Bearer header) e timeout (30s para workflows pesados) refletem esse caso. Outros servidores (Pipedream, Zapier MCP, servidor MCP custom do usuário) cabem no mesmo formato de `.env`.
- **Single-server estrito**: nada no código deve assumir multi-server (`McpClientManager` por enquanto gerencia 1 conexão). Estrutura interna pode ser preparada para futura expansão (Map<id, client>) **sem expor isso via IPC ou `.env`**, mas não é requisito.
- **Trust mode (D-14)** é uma escolha consciente do usuário: ele aceita executar `n8n.send_email` direto. Documentar essa decisão claramente em README/`.env.example` para que não vire surpresa quando outras pessoas usarem JARVIS.
- **Hot reload "mágico" via chokidar (D-09)** foi a escolha sobre opção mais conservadora (botão only). User valoriza fluxo: editar `.env` e ter as tools aparecerem sem mais nada.

</specifics>

<deferred>
## Deferred Ideas

Ideias que apareceram (ou são óbvias do roadmap) mas estão fora da Phase 65:

### Já no roadmap formal (v3.1)
- **MCP-CLI-04**: Múltiplos servidores MCP simultâneos (Map<name, manager>, namespace por nome obrigatório).
- **MCP-CLI-05**: Settings UI dedicada para adicionar/remover servidores sem editar `.env` (form com lista, botão add/remove, edit inline, persistência em electron-store).
- **MCP-SRV-04**: HTTP Streamable transport para o servidor MCP do JARVIS (necessário se outros consumidores remotos forem chamar).

### Capturados durante a discussão
- **Toast de aprovação per-tool externa**: Phase 65 trust direto (D-14), mas se UX revelar tool calls indesejados pelo LLM, voltar com pendingActionFlow (Phase 54/55) wrapping todas tools com prefixo `mcp.*`.
- **Allowlist de auto-approve em `.env`**: `MCP_AUTO_APPROVE=n8n.recall,n8n.search` — meio-termo entre trust total e toast em tudo.
- **Polling periódico de tools** (`listTools()` a cada N min): zero ROI no MVP single-server estático; revisitar quando a maioria dos servidores MCP populares começar a publicar tools dinâmicas.
- **Reagir a `notifications/tools/list_changed`**: quando servidores começarem a emitir, vira win imediato sem polling.
- **Reconnect automático com exponential backoff**: D-13 escolheu fail-fast. Se "servidor cai e volta sozinho" virar caso real recorrente, virar follow-up.
- **Rebuild imediato do agent ReAct na sessão ativa**: D-11 escolheu não interromper. Reabrir se UX falhar (usuário esperar tool nova e ela não aparecer no turno).
- **Override de timeout per-tool (`MCP_TOOL_TIMEOUT_MS`)**: D-17 hardcoded em 30s. Vira env var só se servidores reais ficarem fora do range.
- **Audit trail persistido em DB** (Drizzle, à la Phase 54 ActionLogger): D-15 mantém em ToolLogger em memória; persistir só se virar requisito de compliance.

</deferred>

---

*Phase: 65-mcp-client*
*Context gathered: 2026-05-08*
