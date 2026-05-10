# Phase 66: Agentic Tasks - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS executa tarefas multi-step solicitadas por texto ou voz: gera plano explícito, pede confirmação do usuário (botões + texto + voz), executa cada etapa com progresso em tempo real visível no chat e no orb, e aceita cancelamento a qualquer momento sem efeitos colaterais futuros (efeitos já executados não são revertidos). Constrói um grafo dedicado LangGraph 1.x (planner → interrupt → executor) reusando o `createReactAgent` atual como nó executor.

**Fora de escopo (deferred — v3.1+):**
- AGENT-05: Relatório de execução com log estruturado pós-task
- AGENT-06: Re-execução de tarefa anterior com mesmos parâmetros
- Multi-agent orchestration (PROJECT.md "Out of Scope")
- Rollback automático de tools destrutivas
- Reflection node automático (replan via LLM sem perguntar ao usuário)
- Allowlist por tool de auto-aprovação dentro de tasks
- SqliteSaver checkpointer para persistência cross-restart de tasks ativas
- Hotkey global dedicado para cancel
- Configuração em Settings de modo TTS do plano (sumário/completo/visual)

</domain>

<decisions>
## Implementation Decisions

### Arquitetura do agente (LangGraph)

- **D-01:** **Grafo LangGraph dedicado** com 3 nós: `plannerNode` → `interrupt()` confirmação → `executorNode`. O `plannerNode` é novo (LLM com `withStructuredOutput` + Zod schema). O `executorNode` reusa o `createReactAgent` atual de `chat-session.ts:206` — recebe o plano confirmado como system message e itera com toda a stack atual de tools (`recallMemoryTool`, `pcTools`, `requestFileAction`, `analyze_screen`, MCP externas). Modelo canônico LangGraph 1.x; permite resume/cancel nativos.

- **D-02:** **Pausa via `interrupt()` + `Command(resume=...)`.** Após `plannerNode` emitir o plano, o grafo chama `interrupt({ kind: 'plan-confirmation', plan })`. Frontend recebe via SSE, usuário decide, frontend dispara endpoint que faz `graph.invoke(Command({ resume: 'confirm' | 'cancel' | { edit: '<feedback>' } }), { configurable: { thread_id } })`. API nativa LangGraph; sem `pendingTask` paralelo no backend.

- **D-03:** **Estado da task ativa = LangGraph state channels + `MemorySaver` checkpointer** (in-memory para o MVP; upgrade futuro para `SqliteSaver` em phase posterior). State channels guardam `userInput`, `plan`, `currentStep`, `stepResults[]`, `cancelRequested`, `lastError?`. Zero estado paralelo entre `ChatSession`, `TaskExecutor` ou store; tudo flui pelo grafo. `thread_id` é gerado por task (não por session) para permitir múltiplas tasks históricas no mesmo session.

- **D-04:** **Executor = `createReactAgent` existente, sem modificação estrutural.** Após confirm, o `executorNode` instancia (ou reusa) o agent atual e injeta system message: `Você confirmou o seguinte plano. Execute passo a passo, na ordem. Reporte cada step ao terminar.\n\nPlano:\n1. <descrição step 1>\n...`. LLM ReAct decide tool calls reais por step (mantém inteligência adaptativa). **Não** cria executor determinístico passo-a-passo — perderia flexibilidade quando step N depende de output do step N-1.

### Plano: schema + confirmação (UX)

- **D-05:** **Schema Zod do plano** (passado a `withStructuredOutput` do planner LLM):
  ```ts
  z.object({
    steps: z.array(z.object({
      id: z.number().int().positive(),       // 1-indexado
      description: z.string(),                // pt-BR, imperativo curto
      expectedOutcome: z.string()             // pt-BR, frase curta com critério de sucesso
    })).min(1).max(15)                        // hard cap defensivo
  })
  ```
  `description` e `expectedOutcome` são pt-BR (sistema sempre fala pt-BR — ver SYSTEM_PROMPT). Renderer recebe array tipado e renderiza checklist (sem parsing de markdown). Tool/args **não** são pré-decididos pelo planner — o executor (ReAct) decide na hora.

- **D-06:** **Confirmação multi-modal — botões inline + texto + voz simultaneamente.**
  - Mensagem-pai do plano renderiza 3 botões: **Confirmar**, **Editar**, **Cancelar**.
  - Texto digitado no chat input (qualquer dos 3 modos de voz, mesmo wake-word/PTT) com palavras-chave: `vai|sim|confirma|confirmar|ok|prossegue|prossiga` → confirm; `não|nao|cancela|cancelar|para|parar` → cancel; texto começando com `edita|editar|muda|trocar|ajusta` (ou outras formas claras) → edit (resto do texto vira feedback).
  - Voz live (STT durante o estado `awaiting-confirmation`): mesmas palavras-chave após STT transcrever.
  - Janela de aceitação fica aberta enquanto o `interrupt()` não foi resolvido; **sem auto-timeout no MVP** (decidido omitir — usuário pode demorar para ler plano).

- **D-07:** **Edição via re-prompt do planner com feedback estruturado.** Quando usuário escolhe Editar (ou texto começa com `edita...`), frontend dispara `Command({ resume: { edit: '<feedback string>' } })`. Grafo volta ao `plannerNode`, que recebe contexto extra: pedido original + plano anterior + feedback. Planner gera novo plano via mesmo schema; novo `interrupt()`. Loop até confirm/cancel. Sem edição de schema bruto — usuário não edita textarea do plano (complica validation e perde a intenção do LLM).

- **D-08:** **TTS do plano em modos de voz = sumário curto + lista completa no chat.** TTS fala: `Vou fazer {N} coisas: {step 1.description}, {step 2.description}, e {N-2} mais. Confirma?`. Plano completo aparece no chat ao mesmo tempo. Se N ≤ 3, lê todos. Trade-off explícito: ler 7+ steps em voz seria 30-60s — quebra fluxo voice-first.

### Progresso por etapa

- **D-09:** **Display = mensagem-pai única que atualiza** (não mensagem nova por step). A mesma bubble que mostrou o plano (após confirm) muda para checklist em execução: cada step transita ⏳ → ✅ / ❌ ao terminar. Quando task completa, checklist é substituído por sumário curto do JARVIS (1-3 frases pt-BR). Zero poluição de scroll. **Não** usa children expandíveis no MVP (decidido omitir para reduzir surface — pode voltar como follow-up).

- **D-10:** **Streaming protocol = SSE events tipados sobre `/api/chat/stream` existente.** Eventos novos (discriminated union em `packages/ipc-types/`):
  - `{ kind: 'task:plan', taskId, plan }` — emitido após plannerNode
  - `{ kind: 'task:awaiting-confirmation', taskId }`
  - `{ kind: 'task:edit-loop', taskId }` — quando user pediu Editar e planner roda de novo
  - `{ kind: 'task:step:start', taskId, stepId, description }`
  - `{ kind: 'task:step:end', taskId, stepId, status: 'success'|'error', summary, toolName? }`
  - `{ kind: 'task:done', taskId, summary }`
  - `{ kind: 'task:cancelled', taskId, atStep }`
  - `{ kind: 'task:error', taskId, atStep, message }`
  
  Reusa infra SSE de Phase 53/60. Sem WebSocket dedicado, sem endpoint paralelo. Confirm/edit/cancel do usuário viajam por POST `/api/tasks/:taskId/resume` (não por WS).

- **D-11:** **Granularidade per step = status + ação em pt-BR + resumo de output (1 linha).** Ex: `✅ Listei 14 arquivos em ~/Downloads`. O "resumo de output" é gerado pelo executor (ReAct emite ao terminar uma sub-tarefa, ou é extraído do tool result). Sem mostrar tool name cru, sem mostrar AIMessage thinking. Total transparência (debug mode) fica para follow-up se houver demanda.

- **D-12:** **Orb durante execução = estado `responding` existente + badge Layer 6 = `AGENT 3/7`.** Sem criar estado novo no `OrbState` enum. Badge muda dinamicamente conforme `task:step:end` chega no renderer. Quando task termina, badge volta ao default do voice mode (`WW`/`AL`/`PTT`). Custo de UI baixo, padrão consistente com Phases 41/42.

### Cancelamento + falha

- **D-13:** **Granularidade do cancel = entre steps (gate principal) + AbortSignal mid-tool (best-effort).** `state.cancelRequested` é checado no início de cada iteração do executor — se true, grafo termina e emite `task:cancelled`. Adicionalmente: `AbortController` é threaded nas tools que aceitam (HTTP `fetch`, `sendActionRequest` da Phase 54, `client.callTool` MCP da Phase 65). Tools que não suportam abort (ex: SQLite local sync) terminam o step atual e cancel acontece logo depois. Cobre AGENT-04 com responsividade real.

- **D-14:** **Triggers de cancel = botão inline + texto digitado + voz live.**
  - Botão **Cancelar** sempre visível na mensagem-pai do checklist durante execução.
  - Texto digitado: palavras-chave `cancela|cancelar|para|parar|aborta|stop` durante `task:step:*` → POST `/api/tasks/:id/cancel`.
  - Voz: STT continua ativo durante execução (modo wake-word: re-arma listening pós-confirmação; AL: já é contínuo; PTT: usuário aperta hotkey + fala). Mesmas palavras-chave acionam cancel.
  - **Sem hotkey global dedicado** no MVP (decidido omitir — Ctrl+Shift+J abre o widget e botão fica visível).

- **D-15:** **Sem rollback. SC#4 ("sem efeitos colaterais persistidos") interpretado como "nenhum NOVO efeito após cancel".** Tools já executadas ficam (arquivo criado fica, email enviado fica, MCP n8n fica). Logger/chat marcam claramente quais steps rodaram via `task:cancelled { atStep: N }` — usuário sabe exatamente até onde JARVIS chegou. Rollback genérico é inviável: várias tools são irreversíveis (POST externo, send_email, etc) e seria inconsistente. **Documentar essa decisão no chat ao confirmar plano** (ex: nota visual "Tarefas multi-step não revertem ações já executadas — cancele o quanto antes se mudar de ideia").

- **D-16:** **Falha de step = para, reporta erro no chat, oferece 3 ações ao usuário via novo `interrupt()`.** Quando step N retorna erro (tool throw, timeout 30s, ou MCP server down): executor pausa via `interrupt({ kind: 'step-failure', stepId, error })`. Frontend renderiza erro + 3 botões: **Continuar (pular step)** / **Replanejar (volta ao planner com contexto do erro)** / **Abortar**. Reusa exatamente o mesmo padrão de `interrupt()` da confirmação inicial. Sem reflection node automático (decidido omitir — pode entrar em loop e gastar tokens).

- **D-17:** **Audit trail via `ToolLogger` existente** (`apps/backend-ts/src/session/tool-dispatch.ts`). Cada tool call dentro de uma task gera entrada no logger com campos extras: `taskId`, `stepId`, `source: 'agentic-task'`. Reusa estrutura provada em Phases 54/55/65. Permite reconstruir histórico se algo der errado, e satisfaz audit lightweight sem novo schema/tabela.

### Claude's Discretion

Decisões técnicas delegadas a researcher e planner:

- **Detecção do modo agentic** — sempre rota planner-first (todo turno passa pelo planner, mas plano de 1 step pula `interrupt()` e executa direto), heurística pré-LLM (regex/intent classifier para "complex requests"), ou prefixo explícito do usuário. Researcher avalia overhead extra de planner em conversa normal.
- **Definição de "1 step" vs multi-step** — quando pular `interrupt()` e ir direto ao ReAct atual sem mudar nada (preserva latência de chat normal).
- **Threading do `AbortSignal` por tool** — wrap no `tool-dispatch` (DispatchContext expõe signal) ou injeta no `tool()` factory; quais tools nativas/MCP conseguem propagar signal de fato.
- **Geração do "resumo de output" per step (D-11)** — 2ª chamada LLM curta, regra heurística (primeiros 80 chars do tool result), ou structured output do executor instruindo "ao terminar tool, emit AIMessage de 1 linha pt-BR".
- **Geração do TTS de sumário (D-08)** — chamada extra ao LLM ("resuma este plano em 1 frase de até 15 palavras") vs regra fixa ("vou fazer N coisas: a, b, e mais N-2") com fallback determinístico.
- **`thread_id` mapping** — gerado por task (`thread_id = ${chatSessionId}-task-${ulid}`) ou herda do chat session. Pesar contra MemorySaver lifecycle.
- **Schema interno do checkpointer** — `MemorySaver` direto, ou wrapper com TTL/limit para garbage-collect tasks antigas.
- **STT live durante execução em modo wake-word** — relança VoiceInputManager pós-confirm ou mantém VAD ativo durante `task:step:*`. Coordenação com sendAudioAndHandle existente.
- **Layout exato dos novos arquivos** — `apps/backend-ts/src/agent/{graph,planner,executor,types}.ts` ou variação; integração com `ChatSession`.
- **Como o frontend mostra os 3 botões em `step-failure`** — reusa pattern dos botões da confirmação (mesma mensagem-pai com checklist) ou nova mensagem.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before acting.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § Phase 66: Agentic Tasks — goal, depends on Phase 65, 4 success criteria
- `.planning/REQUIREMENTS.md` § Agentic Tasks — AGENT-01/02/03/04 (active), AGENT-05/06 (deferred v3.1)
- `.planning/PROJECT.md` § Out of Scope — multi-agent orchestration explicitamente fora

### Stack & arquitetura atual (integration points)
- `apps/backend-ts/src/session/chat-session.ts` linhas 195-220 (`ChatSession.create()` — `allTools` array) e 240-280 (`recreateAgent`) — **integration point principal**: executor LangGraph reusa este `createReactAgent`
- `apps/backend-ts/src/session/system-prompt.ts` — SYSTEM_PROMPT pt-BR; planner herda, executor injeta plan como system message extra
- `apps/backend-ts/src/session/tool-dispatch.ts` — `ToolLogger`, `DispatchContext`, `wrapAllPcTools` (D-17 estende com `taskId`/`stepId`/`source: 'agentic-task'`)
- `apps/backend-ts/src/session/tools.ts`, `pc-tools.ts`, `request-file-action.ts`, `vision-tool.ts` — todas as tools nativas reusadas no executor sem mudança
- `apps/backend-ts/src/mcp/client/manager.ts`, `tool-adapter.ts` — tools MCP externas (Phase 65) entram normalmente no `allTools`

### LangGraph 1.x APIs (researcher precisa validar)
- [LangGraph JS docs — `interrupt()` e `Command(resume)`](https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/) — padrão human-in-the-loop usado em D-02 e D-16
- [LangGraph JS docs — `MemorySaver` / `checkpointer`](https://langchain-ai.github.io/langgraphjs/concepts/persistence/) — D-03
- [LangGraph JS — `createReactAgent` integrado em StateGraph](https://langchain-ai.github.io/langgraphjs/reference/) — composição usada em D-01/D-04
- [LangChain JS — `withStructuredOutput` + Zod](https://js.langchain.com/docs/how_to/structured_output/) — D-05 schema do plano

### Streaming SSE (Phase 53/60 patterns)
- `apps/backend-ts/src/routes/chat.ts` — `/api/chat/stream` SSE handler atual; D-10 estende com novos `kind` events
- `apps/backend-ts/src/llm/streaming-events.ts` — ChatOpenAIStreamingEvents (Phase 60); padrão de tipagem de eventos
- `packages/ipc-types/src/` — discriminated union types para eventos SSE; D-10 adiciona `task:*` events

### Cancelamento (precedentes)
- `apps/desktop/src/main/voiceInput/voiceHandler.ts:42-90` — `abortActiveStreamingTurn` (Phase 53 D-12 barge-in); pattern de AbortController module-scope para cancelamento de turno em andamento
- `apps/backend-ts/src/memory/embedding-queue.ts:32` — AbortController gerencia activeTasks Map (Phase 61); pattern de signal lifecycle
- `apps/desktop/src/main/voiceInput/whisperResources.ts:166` — AbortController para download cancel (Phase 50)
- `apps/desktop/src/main/ipc/kokoro.ts:17,59` — AbortController in-flight cancel (Phase 62)

### Confirmação UX (precedentes)
- `apps/desktop/src/renderer/src/App.tsx` — `ActionConfirmationToast` (Phase 54/55 pendingAction). **Não usar toast** para Phase 66 — D-06 é inline na mensagem-pai do chat. Mas é a referência de "esperar resposta humana antes de prosseguir".
- `apps/desktop/src/main/ipc/llm.ts` (Phase 57 RELOAD_LLM) — multi-window broadcast pattern; relevante para POST `/api/tasks/:id/resume` propagar status para todas as windows

### Voice mode + orb (Phases 39-44)
- `apps/desktop/src/renderer/src/voice/VoiceModeManager.ts` — state machine; coordenar STT live durante execução (D-14)
- `apps/desktop/src/renderer/src/components/Orb.tsx` + Layer 6 badge — D-12 estende badge para `AGENT 3/7` durante execução; reverte ao default no `task:done`/`task:cancelled`
- `apps/desktop/src/renderer/src/voice/voiceInput/sendAudioAndHandle.ts` — entry point unificado para STT result (Phase 53 D-12); D-14 usa para detectar palavras-chave de cancel durante task

### Padrões herdados (consultar antes de criar novo)
- `.planning/phases/65-mcp-client/65-CONTEXT.md` § D-16 — formato de erro estruturado retornado ao LLM em pt-BR; D-16 desta phase usa o mesmo shape para `step-failure`
- `.planning/phases/64-mcp-server/64-CONTEXT.md` § D-07 — `{ content: [{ type: 'text', text, isError: true }] }` shape canônico
- `.planning/phases/53-streaming-tts/` — sentence chunking + AudioContext singleton (mandato de soak test); TTS de sumário (D-08) deve respeitar
- `.planning/phases/52-settings-extras/` — multi-window broadcast via `BrowserWindow.getAllWindows()`

### Voice keywords pt-BR (D-06, D-14)
- Sem fonte externa — lista compilada na discussão. Validar com user durante UAT/verify-work.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`createReactAgent` em `chat-session.ts:206`** — instanciação atual do agent ReAct. D-04 reusa este exato pattern dentro do `executorNode` do StateGraph. Sem refactor; apenas wrapping.
- **`allTools` array em `chat-session.ts:195`** — composição de tools nativas + MCP externas + vision tool. Executor recebe a mesma referência (Map<name, tool>) — todas as capacidades atuais ficam disponíveis dentro de tasks automaticamente.
- **`ToolLogger.log()` (`tool-dispatch.ts`)** — aceita campos arbitrários (Phase 65 D-15 já adicionou `source: 'mcp-external'`). D-17 segue o mesmo modelo com `taskId`, `stepId`, `source: 'agentic-task'`.
- **`@langchain/langgraph@1.1.4`** — já instalado e em uso (`createReactAgent` é re-export). `StateGraph`, `MemorySaver`, `interrupt`, `Command` vêm do mesmo pacote.
- **`AbortController` patterns maduros** — Phases 50, 53, 54, 61, 62 estabeleceram convenção. D-13 segue: AbortController criado por task, signal injetado em `DispatchContext`, tools que suportam fetch propagam.
- **SSE infra (`/api/chat/stream`)** — Phase 53/60 deixaram event protocol bem tipado. D-10 adiciona novos `kind` events na mesma stream — 1 conexão única por turno.
- **`OrbState` + Layer 6 badge** — Phase 41/42 mostraram que badge é flex e suporta texto dinâmico. D-12 escreve `AGENT N/M` sem mudar machine state.
- **`SYSTEM_PROMPT` pt-BR** (`system-prompt.ts`) — herdado pelo planner; planner adiciona instrução adicional de "gerar plano numerado em pt-BR usando schema Zod abaixo".

### Established Patterns

- **Tool delegation via wrapping** — todas as tools (nativas, MCP, vision) já são `tool(...)` factory do `@langchain/core/tools`. Executor não precisa saber a origem da tool; já é uniforme.
- **Boot silencioso para features opcionais** — Phase 60/65 mostraram pattern de feature flag. Phase 66 não precisa flag (é core agentic, sempre ligado quando há plano), mas pode adicionar `AGENTIC_DISABLED=true` em `.env` para debug.
- **Erros como string pt-BR consumidos pelo LLM** — convenção desde Phase 17/18; D-16 retorna erro como `task:error` SSE event + frontend mostra inline; o LLM só vê o erro se user escolher "Replanejar" (vai como contexto extra ao planner).
- **Multi-window IPC broadcast** — Phase 52 padrão. POST `/api/tasks/:id/resume` deve propagar `task:*` events para todas BrowserWindows abertas (Settings + main widget).
- **Schema-first com Zod + `withStructuredOutput`** — Phase 36 (MemoryExtractor), Phase 65 — pattern direto para D-05 plano schema.
- **Discriminated union em `packages/ipc-types`** — convenção desde primeiras phases; D-10 events seguem o padrão de `kind: 'task:plan' | ...`.

### Integration Points

- `apps/backend-ts/src/agent/` — **novo módulo** (paralelo a `mcp/`, `memory/`, `session/`). Arquivos sugeridos: `graph.ts` (StateGraph + nodes wiring), `planner.ts` (plannerNode com withStructuredOutput), `executor.ts` (executorNode reusando createReactAgent), `types.ts` (Plan, TaskState, events).
- `apps/backend-ts/src/session/chat-session.ts` — `send()`/`sendStream()` decidem se rota vai pelo agentic graph ou direto ao agent atual (depende de Claude's Discretion sobre detecção). Se via graph, `ChatSession` cria `thread_id` único e dispara `graph.invoke()` em vez do `agent.invoke()` atual.
- `apps/backend-ts/src/routes/chat.ts` — `/api/chat/stream` SSE handler aceita novos `task:*` events; novo endpoint `POST /api/tasks/:taskId/resume` (body: `{ kind: 'confirm' | 'cancel' | 'edit', feedback? }`) e `POST /api/tasks/:taskId/cancel`.
- `apps/desktop/src/renderer/src/chat/ChatContext.tsx` — recebe `task:*` events via SSE, mantém `Map<taskId, TaskUiState>`, renderer renderiza checklist na mensagem-pai.
- `apps/desktop/src/renderer/src/chat/` — **novo componente** `TaskCheckList.tsx` (mensagem-pai com plano + estado por step + botões Confirmar/Cancelar/Editar/Cancel-em-execução). Substitui texto cru de assistente quando turno é uma task.
- `apps/desktop/src/renderer/src/voice/voiceInput/sendAudioAndHandle.ts` — após STT, antes de enviar ao backend, checa se há `awaiting-confirmation` ou `executing` ativo: se sim, e palavra-chave bater (D-06/D-14), short-circuit para POST `/api/tasks/:id/resume|cancel` em vez de POST `/api/chat`.
- `apps/desktop/src/renderer/src/components/Orb.tsx` — subscribe a task events; quando `task:step:*` chega, badge layer 6 atualiza; quando `task:done|cancelled|error` chega, badge volta ao default do voice mode.
- `packages/ipc-types/src/sse.ts` (ou equivalente) — adiciona `TaskSseEvent` discriminated union; exporta para backend e renderer.

</code_context>

<specifics>
## Specific Ideas

- **Caso de uso primário** mencionado no ROADMAP: "execução multi-step sem supervisão (loop de planejamento + execução + feedback)". Exemplos prováveis: organizar pasta Downloads (lista → filtra → move por tipo); pesquisar contato no n8n via MCP + redigir email + confirmar antes de enviar; capturar screenshot + analisar + abrir app baseado no que viu.
- **Trust mode revisitado** — Phase 65 D-14 estabeleceu trust direto para tools MCP externas configuradas pelo user. Phase 66 mantém: confirmação acontece no nível do **plano** (uma vez), não no nível de cada tool dentro da execução. Tools destrutivas dentro de uma task confirmada **não disparam toast adicional** (caso contrário, AGENT-01 "sem interrupção" é violado).
- **Voz first** — todas as decisões priorizam fluxo voice-first sobre UI clicada: TTS lê sumário (D-08), confirm aceita voz (D-06), cancel aceita voz (D-14), badge no orb dá awareness em modo voz (D-12). UI inline está lá, mas não é o caminho ouro.
- **Sem rollback é decisão consciente do usuário** — D-15. Documentar visivelmente no chat (ex: nota cinza abaixo do plano: "JARVIS não desfaz ações já executadas — cancele o quanto antes se mudar de ideia"). Evita surpresa.
- **Hard cap de 15 steps** (D-05) — guardrail anti-loop e anti-token-explosion. Plano com >15 steps é provavelmente mal-formulado; planner é instruído a quebrar em sub-tasks ou pedir esclarecimento.
- **Edição via re-prompt** (D-07) é poderosa porque o user pode dizer "tira o passo 3 e adiciona um para mandar email no final" — texto livre, planner reorganiza. Importante: feedback é apenas hint; planner pode re-arranjar o plano inteiro (não é diff).

</specifics>

<deferred>
## Deferred Ideas

Capturados durante a discussão mas fora da Phase 66:

### Já no roadmap formal (v3.1 — REQUIREMENTS.md)
- **AGENT-05**: Relatório de execução com log estruturado pós-task (markdown + audit DB) — útil para review e re-execução
- **AGENT-06**: Re-executar tarefa anterior com mesmos parâmetros — exige persistência de plano + parâmetros (pede SqliteSaver)

### Capturados durante a discussão
- **Reflection node automático**: replanejar sem perguntar ao usuário em caso de falha. Decidido manter human-in-the-loop em D-16. Pode voltar se UX revelar fricção excessiva (user clica "Replanejar" toda vez).
- **Allowlist por tool dentro de tasks**: usuário marca em Settings "tools que executam direto sem confirmação no plano" vs "tools que sempre exigem confirmação no nível do plano". MVP é trust-no-plan-only.
- **Children expandíveis no checklist**: ver tool call + raw output por step com disclosure (▶). Decidido mensagem-pai limpa em D-09; revisitar se debug ficar penoso.
- **TTS configurável em Settings (sumário | completo | só visual)**: D-08 hardcode em sumário curto. Vira toggle em Settings se user reportar fricção.
- **Hotkey global dedicado para cancel** (Ctrl+Shift+C ou similar): D-14 cobre via voz/texto/botão. Adicionar hotkey dedicado se UX revelar dor.
- **Auto-timeout para confirmação do plano**: D-06 sem timeout. Adicionar (60s? 120s?) se observarmos planos abandonados sem decisão.
- **Persistência cross-restart de tasks ativas (SqliteSaver)**: D-03 in-memory MVP. Upgrade quando AGENT-05/06 entrarem.
- **Detecção do modo agentic via heurística pré-LLM (intent classifier)**: deferred a Claude's Discretion pelo researcher. Se overhead do planner em chat normal for sentido, voltamos.
- **Rollback best-effort para tools reversíveis**: descartado em D-15. Considerar como Phase futura específica se houver requisito de "desfazer".
- **Confirmação extra para tools destrutivas dentro de tasks**: D-15/Specifics — descartado. Volta se UX mostrar tasks com side-effects indesejados que escapam.
- **Reagir a `notifications/tools/list_changed` MCP**: já no backlog de Phase 65.
- **Multi-task paralela** (várias tasks em background ao mesmo tempo): explicitamente fora — JARVIS é single-user single-task no MVP. Cabe debate em milestone futuro.
- **WebSocket bidirecional dedicado para tasks**: D-10 escolheu SSE+POST. WS volta se latência de resume/cancel via POST virar dor.

</deferred>

---

*Phase: 66-agentic-tasks*
*Context gathered: 2026-05-09*
