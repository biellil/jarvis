# Phase 66: Agentic Tasks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 66-agentic-tasks
**Areas discussed:** Arquitetura do agente, Plano + confirmação (UX), Progresso por etapa, Cancelamento + side-effects

---

## Arquitetura do agente

### Q1: Como o plano é gerado e separado da execução?

| Option | Description | Selected |
|--------|-------------|----------|
| Grafo LangGraph dedicado (planner→interrupt→executor) | StateGraph com 3 nodes: planner (LLM gera plano via withStructuredOutput Zod) → interrupt() para confirmação → executor (createReactAgent atual). Modelo canônico LangGraph 1.x, durable, suporta resume/cancel nativo. | ✓ |
| ReAct atual com prompt plan-first | Mantém createReactAgent, mas system prompt instrui LLM a emitir plano como primeiro AIMessage e parar. Menos código, mas controle de fluxo via prompt é frágil; complica cancel e resume. | |
| Tool propose_plan + executor separado | LLM chama tool dedicada propose_plan(steps[]); executor depois itera com chamadas tool a tool. Padrão tools-as-control-flow. | |

### Q2: Mecanismo de pausa entre planejamento e execução?

| Option | Description | Selected |
|--------|-------------|----------|
| LangGraph interrupt() + Command(resume) | API nativa LangGraph 1.x: planner emite interrupt(plan), graph pausa, frontend decide, frontend chama resume com Command(resume='confirm'\|'cancel'). Durable via checkpointer. | ✓ |
| PendingTask Map no backend + IPC ack | Backend mantém Map<taskId, plan> em memória, frontend recebe via SSE, confirma via POST — mesmo modelo de Phase 54/55. | |
| Promise pendente + resolve via WebSocket ack | Backend cria Promise dentro do executor, manda plano via WS, espera resolve. Não durable. | |

### Q3: Onde vive o estado da task ativa?

| Option | Description | Selected |
|--------|-------------|----------|
| LangGraph state + MemorySaver checkpointer | State channels guardam plan, currentStep, results, status. MemorySaver in-memory MVP com upgrade futuro p/ SqliteSaver. Resume após interrupt; cancel = abort do invocation. Zero estado paralelo. | ✓ |
| TaskExecutor singleton no backend | Classe Singleton (Map<sessionId, ActiveTask>). Mais código de infra, duplica state. | |
| ChatSession instance state | activeTask?: ActiveTask na ChatSession. Mistura responsabilidades. | |

### Q4: Como o executor itera sobre o plano confirmado?

| Option | Description | Selected |
|--------|-------------|----------|
| Executor = createReactAgent recebe plano no prompt | Reusa createReactAgent existente com system message 'execute o plano abaixo' + plan. LLM decide tool calls por step. Mantém inteligência ReAct. | ✓ |
| Executor determinístico passo-a-passo | Cada step tem tool name + args pré-definidos pelo planner; executor itera sem LLM no meio. Determinístico mas perde flexibilidade. | |
| Híbrido: plano como guia, ReAct adapta | Plano é guia textual; executor pode pular/replanejar se contexto mudar. Mais difícil de mostrar progresso 'plan vs actual'. | |

---

## Plano + confirmação (UX)

### Q1: Schema do plano gerado pelo planner?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured Zod: steps[{id, description, expectedOutcome}] | Plano via withStructuredOutput + Zod schema. Sem tool/args pré-definidos — LLM ReAct decide na execução. Renderer recebe array tipado. | ✓ |
| Structured detalhado: steps[{id, description, tool, args}] | Inclui tool name e args pré-decididos pelo planner. Total transparência mas frágil. | |
| Texto livre numerado | Plano é string markdown. Mais simples, sem schema. Pior p/ checklist UI. | |

### Q2: Como o usuário confirma ou cancela o plano?

| Option | Description | Selected |
|--------|-------------|----------|
| Botões inline + texto + voz | Mensagem do plano traz Confirmar/Cancelar/Editar. Aceita texto digitado e voz. Cobre todos os modos. | ✓ |
| Botões inline apenas | Só clique. Quebra fluxo voice-first. | |
| Voz/texto livre apenas (sem botões) | Coerente com paradigma conversacional, mas exige NLU robusto. | |

### Q3: Edição do plano antes de confirmar?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-prompt LLM com feedback do usuário | Editar/texto livre → frontend manda feedback ao planner que regenera plano. Loop até confirmar/cancelar. | ✓ |
| Confirmar ou cancelar apenas (no-edit) | MVP minimalista, mas exige reformular pedido inteiro. | |
| Edit textual livre da estrutura | Plano vira textarea editável. Controle total mas complica validation. | |

### Q4: TTS do plano em modos de voz?

| Option | Description | Selected |
|--------|-------------|----------|
| Sumário curto + lista no chat | TTS fala 'vou fazer N coisas: [3 primeiras]. Confirma?'. Plano completo no chat. Equilíbrio. | ✓ |
| Lê o plano completo em voz | Transparente mas longo. Quebra fluxo. | |
| Pula TTS, só mostra no chat | Rápido mas inválida AGENT-01 'por voz'. | |
| Configurável em Settings | Mais flexível, adiciona surface area. | |

---

## Progresso por etapa

### Q1: Como cada step aparece no chat durante a execução?

| Option | Description | Selected |
|--------|-------------|----------|
| Mensagem-pai única com checklist que atualiza | Uma mensagem mostra plano como checklist; cada step muda ⏳ → ✅/❌. Resultado final substitui por sumário. Limpo. | ✓ |
| Mensagem nova por step | Cada step gera nova bubble. Transparente mas polui scroll. | |
| Mensagem-pai + children expandíveis | Checklist pai + disclosure por step. Detalhe sob demanda. Mais código. | |

### Q2: Streaming protocol entre backend e renderer?

| Option | Description | Selected |
|--------|-------------|----------|
| SSE events tipados sobre /api/chat/stream existente | Estende SSE com task:plan, task:step:start, task:step:end, task:done. Mantém 1 conexão. Discriminated union. | ✓ |
| Endpoint dedicado /api/tasks/stream | Stream separado. Duplica infra. | |
| WebSocket bidirecional dedicado p/ tasks | Reutiliza WS de /api/actions ou cria novo. Mais complexo. | |

### Q3: Granularidade do que aparece per step?

| Option | Description | Selected |
|--------|-------------|----------|
| Status + tool name + resumo de output | Per step: ✅ 'Listei arquivos em ~/Downloads' (ação pt-BR + tool resultado resumido). | ✓ |
| Só status visual (✅/❌) | Limpo mas opaco. | |
| Status + thinking + tool call + output completo | Total transparência (debug mode), verboso. | |

### Q4: Estado visual do orb durante execução?

| Option | Description | Selected |
|--------|-------------|----------|
| Reusa 'responding' + badge 'AGENT' + counter (3/7) | Orb fica em 'responding'. Badge Layer 6 muda p/ 'AGENT 3/7'. Custo baixo, padrão consistente. | ✓ |
| Novo estado 'agent' com cor distinta | Estado dedicado com cor própria. Mais claro mas adiciona case. | |
| Progress ring na borda do orb | Barra circular preenche conforme steps completam. Mais código animado. | |

---

## Cancelamento + side-effects

### Q1: Granularidade do cancelamento?

| Option | Description | Selected |
|--------|-------------|----------|
| Entre steps + abort mid-tool via AbortSignal | Flag de cancel checada antes de cada step + AbortSignal threadado para tools que suportam (HTTP fetch, WS). Cobre AGENT-04 com máxima responsividade. | ✓ |
| Só entre steps (não aborta tool em andamento) | Step atual termina, próximo não roda. Pode demorar quando step é longo. | |
| Hard kill (terminate da Promise/process) | Brutal: pode deixar conexões abertas, file handles vazados. | |

### Q2: Por onde o usuário dispara cancel?

| Option | Description | Selected |
|--------|-------------|----------|
| Botão + texto + voz (todos os modos) | Botão 'Cancelar' inline + texto digitado ('cancela', 'para') + voz STT. Essencial p/ flow voice-first. | ✓ |
| Botão + texto apenas | Ignora voz. Quebra promise do JARVIS conversacional. | |
| Hotkey global + botão | Rápido mas adiciona +1 hotkey. Voz fica de fora. | |

### Q3: O que acontece com tool calls que já executaram quando cancel é disparado?

| Option | Description | Selected |
|--------|-------------|----------|
| Sem rollback — cancel para ali, side-effects executados ficam | 'Sem efeitos colaterais persistidos' interpretado como 'nenhum NOVO efeito após cancel'. Honesto: rollback genérico inviável. | ✓ |
| Best-effort rollback de tools refereáveis | Bonito mas exige metadata por tool, várias não são reversíveis. Inconsistente. | |
| Confirmar antes de tools destrutivas dentro da task | Wraps tools destrutivas com toast per-step. Atropela AGENT-01 'sem interrupção'. | |

### Q4: Tratamento de falha em step durante execução?

| Option | Description | Selected |
|--------|-------------|----------|
| Para, reporta erro, oferece replan/abort | Step falha → executor para, mostra erro no chat com 3 botões: Continuar / Replanejar / Abortar. User-in-control. Reusa interrupt() pattern. | ✓ |
| LLM tenta replan automático (reflection node) | Sem intervenção, mas pode entrar em loop e gastar tokens. | |
| Para e aborta (sem opções) | Falha = task termina. Frustrante quando erro é pequeno. | |

---

## Claude's Discretion

Decisões técnicas delegadas a researcher e planner (ver CONTEXT.md § Implementation Decisions):

- Detecção do modo agentic (sempre planner-first vs heurística vs prefixo)
- Definição de "1 step" vs multi-step (quando pular interrupt())
- Threading do AbortSignal por tool — wrap em DispatchContext ou tool factory
- Geração do "resumo de output" per step (LLM extra, regra heurística, ou structured output do executor)
- Geração do TTS de sumário (LLM extra vs regra fixa)
- thread_id mapping no MemorySaver (per task vs per session)
- Schema interno do checkpointer (MemorySaver direto ou wrapper com TTL)
- STT live durante execução em modo wake-word (relança VoiceInputManager vs mantém VAD)
- Layout exato dos arquivos novos em apps/backend-ts/src/agent/

## Deferred Ideas

Ideias mencionadas durante a discussão e capturadas para futuras phases (ver CONTEXT.md § Deferred):

- AGENT-05/06 (já no roadmap v3.1)
- Reflection node automático
- Allowlist por tool dentro de tasks
- Children expandíveis no checklist
- TTS configurável em Settings
- Hotkey global dedicado para cancel
- Auto-timeout para confirmação do plano
- SqliteSaver checkpointer (cross-restart persistence)
- Heurística pré-LLM para detecção do modo agentic
- Rollback best-effort para tools reversíveis
- Confirmação extra para tools destrutivas dentro de tasks
- Multi-task paralela
- WebSocket bidirecional dedicado para tasks
