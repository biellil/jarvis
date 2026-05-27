# Phase 82: LangGraph execução silenciosa sem confirmação obrigatória - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Modificar o nó `planner` em `graph.ts` (backend TypeScript) para que o `interrupt()` seja condicional:
- Pular para tarefas já aprovadas anteriormente (memória persistente em SQLite)
- Sempre interromper para ações críticas (deleção, permissões de sistema)
- Quando a confirmação é necessária, ela acontece via chat (não via prompt bloqueante separado)
- Execução silenciosa: no cliente Python, não exibir eventos de step no terminal — só o resultado final

O foco desta fase é o **cliente Python** (`apps/desktop-py`). O Electron GUI pode herdar as mudanças de backend mas não é o alvo principal.

</domain>

<decisions>
## Implementation Decisions

### D-01: Memória de aprovações — estratégia de armazenamento
- **Persistência de longo prazo**: SQLite com tabela `approved_plans` (chave canônica + TTL)
- **Chave canônica**: hash SHA-256 dos step descriptions do plano, normalizados (lowercase, trim, sort por id)
- **TTL padrão**: 90 dias (configurável)
- **Por que SQLite first**: determinístico, sem custo de ML, integra com o schema Drizzle já existente, fácil de auditar/deletar entradas
- **ChromaDB (defer)**: similaridade semântica para lidar com reformulações do LLM pode vir numa fase futura, quando o corpus de aprovações for grande o suficiente para calibrar threshold com segurança

### D-02: Ações críticas — sempre pedem confirmação (nunca skip)
Independente de histórico de aprovações, os seguintes patterns num step description sempre acionam `interrupt()`:
- Deleção de arquivo/pasta (keywords: deletar, delete, remover, remove, apagar, erase, unlink, rm, trash)
- Alterações de permissões ou configurações do sistema (keywords: permission, chmod, chown, registry, system config, configuração do sistema)
- Critério: detecção por keywords nos `step.description` dos planos antes da verificação de memória

### D-03: Fluxo de decisão no nó planner
```
1. Gera plano via generatePlan()
2. Verifica se algum step é crítico → se sim, vai para interrupt() (comportamento atual)
3. Verifica approved_plans no SQLite com a chave canônica → se match dentro do TTL, executa silenciosamente (sem interrupt)
4. Se não há match → interrupt() com `task:awaiting-confirmation` (fluxo existente via chat)
5. Quando usuário confirma → salva a chave canônica em approved_plans
```

### D-04: Confirmação via chat (quando necessária)
- **Método**: keyword com fallback LLM
  - Keywords exatas (zero latência): `s`, `sim`, `y`, `yes`, `n`, `nao`, `não`, `no`, `cancel`, `cancelar`
  - LLM fallback: quando reply não bate keyword → classificação de intent (confirm/cancel/edit)
- **Detecção de estado pendente**: `ChatSession` guarda flag `awaitingConfirmation: { taskId, threadId }` quando `task:awaiting-confirmation` é emitido. Quando usuário envia mensagem e flag existe, gateway roteia para `POST /tasks/:taskId/resume` em vez de nova completion LLM. Flag é limpo após resolve.
- **Mensagem do JARVIS ao pedir confirmação**: exibida como bubble normal no chat (`[jarvis]`), não como prompt bloqueante

### D-05: Silent mode no cliente Python
- **Nova flag de config**: `agentic_step_progress` (bool, padrão `False`) — análogo ao `agentic_confirm` já existente
- **Quando `False` (padrão)**: eventos `task:step:start` e `task:step:done` são recebidos mas não exibidos no terminal. Só `task:done` (resultado final) aparece no chat.
- **Quando `True`**: exibe progresso por step (comportamento atual)
- **Sempre exibir**: `task:error`, `task:cancelled`, `task:awaiting-failure-decision` — independente da flag

### Claude's Discretion
- Schema exato da tabela `approved_plans` (colunas, índices, nome da migration)
- Função de normalização da chave canônica (algoritmo de hash, tratamento de whitespace)
- Lista completa de keywords de ações críticas (pode expandir o mínimo definido acima)
- Onde no `ChatSession` (TS) o flag `awaitingConfirmation` é gerenciado (objeto state interno)
- Mensagem exata que o JARVIS exibe ao pedir confirmação
- Como expor `agentic_step_progress` no menu de settings do cliente Python (análogo ao item 4 atual)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LangGraph — nó planner e interrupt
- `apps/backend-ts/src/agent/graph.ts` — definição completa do grafo: nó planner (interrupt em L121), nó executor, TaskStateAnnotation, taskCheckpointer (MemorySaver)
- `apps/backend-ts/src/agent/types.ts` — ResumeCommand type (confirm/cancel/edit), Plan e StepResult types

### Rota de resume e estado de tarefas
- `apps/backend-ts/src/routes/tasks.ts` — POST /tasks/:taskId/resume, activeControllers, activeGraphs maps
- `apps/backend-ts/src/routes/chat.ts` — onde tasks são iniciadas e ChatSession é gerenciado

### Schema SQLite existente
- `apps/backend-ts/src/memory/schema.ts` — tabela `actions_log` (approved/denied/timeout para PC Control), `typedMemories`, padrão Drizzle do projeto

### Cliente Python — SSE e config
- `apps/desktop-py/src/jarvis_desktop/chat.py` — handler de eventos SSE (task:plan L13, task:awaiting-confirmation L195, agentic_confirm flag L196, menu de settings L571)
- `apps/desktop-py/src/jarvis_desktop/config.py` — estrutura de config persistente, padrão de flags booleanas

### ChatSession TypeScript
- `apps/backend-ts/src/session/chat-session.ts` — estrutura do ChatSession, onde o novo flag `awaitingConfirmation` deve ser adicionado

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `taskCheckpointer` (MemorySaver em `graph.ts`) — checkpointer existente; a memória de aprovações é separada e persistida em SQLite (não no checkpointer)
- `agentic_confirm` flag em `config.py` e `chat.py` — padrão exato para criar a nova flag `agentic_step_progress`
- Menu de settings em `chat.py:571` — adicionar toggle para `agentic_step_progress` seguindo o padrão do item 4 existente
- `activeControllers` e `activeGraphs` maps em `tasks.ts` — modelo para onde o flag `awaitingConfirmation` pode viver no backend
- `resumeRequestSchema` em `types.ts` — validação existente do body do /resume; compatível com o fluxo de keyword parsing

### Established Patterns
- Drizzle ORM com SQLite para schema — nova tabela `approved_plans` segue o padrão de `actionsLog` em `schema.ts`
- SSE event protocol: `event: task:*\ndata: {...}\n\n` — cliente Python já parseia todos os kinds; `task:step:start/done` são filtrados pela nova flag sem mudar o protocolo
- `writer?.({ kind: 'task:...' })` pattern no nó planner — usar para emitir novo evento `task:auto-approved` quando skip for ativado (feedback ao cliente)

### Integration Points
- Nó `planner` em `graph.ts` — ponto central de mudança: adicionar lógica de critical-check e approved_plans lookup ANTES do `interrupt()`
- `ChatSession` em `chat-session.ts` — adicionar campo `awaitingConfirmation` para roteamento de replies
- `_handle_agentic_event` em `chat.py` — adicionar handler para `task:auto-approved` e modificar supressão de step events
- Rota `POST /chat/stream` — detectar `awaitingConfirmation` ativo antes de iniciar nova LLM completion

</code_context>

<specifics>
## Specific Ideas

- O usuário quer que o JARVIS "aprenda com seus gostos e necessidades" ao longo do tempo — a tabela `approved_plans` é a primeira camada. O roadmap futuro pode incluir ChromaDB semântico quando houver corpus suficiente.
- O foco imediato é o **cliente Python terminal** — o Electron GUI herda as mudanças de backend mas não precisa de mudanças de UI nesta fase.
- A confirmação via chat deve se sentir natural no terminal: JARVIS pergunta numa bubble normal, usuário responde na mesma linha de chat, sem prompt bloqueante que interrompa o fluxo.

</specifics>

<deferred>
## Deferred Ideas

- **ChromaDB para similaridade semântica de aprovações** — útil quando o corpus for grande e o LLM variar muito as descrições dos steps. Threshold calibration requer dados reais de aprovação que ainda não existem.
- **Botões inline de confirmação no Electron** — zero digitação, zero ambiguidade, mas cria two code paths (terminal não suporta). Defer para fase de UI maturity.
- **Progressive disclosure de steps no chat** (colapso/expansão por clique) — escala melhor para planos complexos. Defer para fase de UI.
- **TTL diferenciado por categoria de ação** — tarefas de leitura aprovadas para sempre, tarefas de escrita com TTL menor. Pode ser refinado depois que o `approved_plans` estiver em produção.

</deferred>

---

*Phase: 82-langgraph-execucao-silenciosa-sem-confirmacao*
*Context gathered: 2026-05-27*
