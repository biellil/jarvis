# Phase 66: Agentic Tasks — Research

**Researched:** 2026-05-09
**Domain:** LangGraph 1.x stateful agentic graphs (planner→interrupt→executor), structured plan generation with Zod, AbortSignal threading, SSE event extension, MemorySaver lifecycle, voice-cancel mid-execution
**Confidence:** HIGH para LangGraph/StructuredOutput/AbortSignal (verificado em `node_modules/.d.ts` instalados + docs oficiais 1.x); MEDIUM para padrão exato de `streamMode` durante interrupt (verificado em GitHub issue + doc 1.x); HIGH para todos os call-sites do codebase (lidos diretamente em `chat-session.ts`, `routes/chat.ts`, `tool-dispatch.ts`, `voiceHandler.ts`, `sendAudioAndHandle.ts`).

## Summary

Phase 66 constrói um grafo LangGraph dedicado (`StateGraph` com 3 nós: `plannerNode` → `interrupt()` → `executorNode`) que reusa o `createReactAgent` atual de `chat-session.ts:206` como *executor*. As peças críticas — `interrupt()`, `Command(resume)`, `MemorySaver`, `withStructuredOutput`, `RunnableConfig.signal` threading — **estão todas no `@langchain/langgraph@1.2.8` e `@langchain/core@1.1.45` já instalados** (versões mais novas que CONTEXT.md mencionou — STATE.md está stale: cita 1.1.4, instalado 1.2.8). Não precisa novas dependências core; só novos arquivos em `apps/backend-ts/src/agent/`.

A maior surpresa do research é técnica e tem que ser flagged ao planner: **`createReactAgent` está formalmente `@deprecated` na 1.2.8** com uma mensagem JSDoc dizendo "moved to `langchain` package, use `createAgent`". Não há plano nesta phase de migrar — a deprecação é silenciosa (compila, roda, idêntica funcionalidade), e tocar nisso ampliaria escopo demais. Mas o planner deve documentar a decisão de **manter `createReactAgent` por ora** e abrir uma issue de tech-debt para milestone futuro (v3.1 ou v3.2). Investigação adicional revelou: o pacote `langchain` 1.4.0 existe mas **não está instalado** no backend; importar `createAgent` exigiria nova dependency + refactor de Phase 17/18/63/65. Fora de escopo.

A segunda decisão técnica importante: **`interrupt()` surfa diferente em `invoke()` vs `stream()`**. Em `invoke()`, o resultado final tem campo `__interrupt__` (array). Em `stream({streamMode: 'updates'})`, o último update é `{ __interrupt__: [...] }`. O frontend detecta interrupt via stream consumindo SSE e quebrando quando vê esse marker. Patterns confirmados em [GitHub langgraphjs/issues/1422](https://github.com/langchain-ai/langgraphjs/issues/1422) e na doc 1.x de Interrupts.

A terceira: **AbortSignal já fluí end-to-end pela stack atual** se passarmos `{ signal }` em `agent.stream(input, { signal })`. `RunnableConfig.signal: AbortSignal` é parte do contrato `@langchain/core`. Tools recebem `(input, config)` no factory `tool()` e podem ler `config.signal` — só precisam **opt-in** propagando para `fetch`/etc. **Isso significa que o `request_file_action` (já passa `AbortSignal.timeout(13_000)`) precisa virar `AbortSignal.any([config.signal, AbortSignal.timeout(13_000)])` para suportar cancel de task. Mesma coisa para o tool-adapter MCP (Phase 65 — passa nada hoje, só `Promise.race` com setTimeout).** Pitfall: tools síncronas (PC tools nativas) não suportam abort — cancel landa entre steps, não no meio do step.

**Primary recommendation:** Construir 4 arquivos novos em `apps/backend-ts/src/agent/`: `types.ts` (Plan + TaskState + TaskSseEvent), `planner.ts` (plannerNode + Zod schema + withStructuredOutput), `executor.ts` (executorNode wrapping `createReactAgent`), `graph.ts` (StateGraph wiring + MemorySaver singleton + thread_id factory). `ChatSession` adiciona um decision point em `send`/`sendStream`: se a heurística disser "task multi-step", routa pelo grafo; senão, fast-path para o `_agent.invoke/stream` atual (zero regressão). Stream protocol estende `/api/chat/stream` com novos `event: task:plan|step:start|step:end|done|cancelled|error` (não muda a semantic existente — adiciona). Endpoints novos: `POST /api/tasks/:taskId/resume` e `POST /api/tasks/:taskId/cancel`. Cancelamento ponta-a-ponta: `state.cancelRequested` checado no início de cada iteração + `AbortController` por task threaded via `agent.stream(_, { signal })`. Voice cancel keyword é detectado em `sendAudioAndHandle.ts` (renderer) consultando o ChatContext de tasks ativas — short-circuit POST `/api/tasks/:id/cancel` em vez de POST `/api/chat`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Arquitetura do agente (LangGraph)**

- **D-01:** Grafo LangGraph dedicado com 3 nós: `plannerNode` → `interrupt()` confirmação → `executorNode`. `plannerNode` é novo (LLM com `withStructuredOutput` + Zod schema). `executorNode` reusa o `createReactAgent` atual de `chat-session.ts:206` — recebe o plano confirmado como system message e itera com toda a stack atual de tools (`recallMemoryTool`, `pcTools`, `requestFileAction`, `analyze_screen`, MCP externas).
- **D-02:** Pausa via `interrupt()` + `Command(resume=...)`. Após `plannerNode` emitir o plano, o grafo chama `interrupt({ kind: 'plan-confirmation', plan })`. Frontend recebe via SSE, usuário decide, frontend dispara endpoint que faz `graph.invoke(Command({ resume: 'confirm' | 'cancel' | { edit: '<feedback>' } }), { configurable: { thread_id } })`.
- **D-03:** Estado da task ativa = LangGraph state channels + `MemorySaver` checkpointer (in-memory para o MVP). State channels guardam `userInput`, `plan`, `currentStep`, `stepResults[]`, `cancelRequested`, `lastError?`. Zero estado paralelo entre `ChatSession`, `TaskExecutor` ou store. `thread_id` é gerado por task (não por session).
- **D-04:** Executor = `createReactAgent` existente, sem modificação estrutural. Após confirm, o `executorNode` instancia (ou reusa) o agent atual e injeta system message com plano numerado pt-BR.

**Plano: schema + confirmação (UX)**

- **D-05:** Schema Zod do plano: `z.object({ steps: z.array(z.object({ id: z.number().int().positive(), description: z.string(), expectedOutcome: z.string() })).min(1).max(15) })`. Hard cap 15. Tudo pt-BR.
- **D-06:** Confirmação multi-modal — botões inline + texto + voz. Keywords definidas em UI-SPEC §Cancel/Confirm/Edit keyword contract.
- **D-07:** Edição via re-prompt do planner com feedback estruturado. Loop até confirm/cancel.
- **D-08:** TTS do plano = sumário curto + lista completa no chat. Se N ≤ 3, lê todos.

**Progresso por etapa**

- **D-09:** Display = mensagem-pai única que atualiza (não mensagem nova por step).
- **D-10:** Streaming protocol = SSE events tipados sobre `/api/chat/stream` existente. Eventos novos: `task:plan`, `task:awaiting-confirmation`, `task:edit-loop`, `task:step:start`, `task:step:end`, `task:done`, `task:cancelled`, `task:error`. Confirm/edit/cancel via POST `/api/tasks/:taskId/resume` (não SSE/WS).
- **D-11:** Granularidade per step = status + ação em pt-BR + resumo de output (1 linha, ≤80 chars).
- **D-12:** Orb durante execução = estado `responding` existente + badge Layer 6 = `AGENT 3/7`.

**Cancelamento + falha**

- **D-13:** Granularidade do cancel = entre steps (gate principal) + AbortSignal mid-tool (best-effort).
- **D-14:** Triggers de cancel = botão inline + texto digitado + voz live.
- **D-15:** Sem rollback. SC#4 ("sem efeitos colaterais persistidos") interpretado como "nenhum NOVO efeito após cancel".
- **D-16:** Falha de step = para, reporta erro no chat, oferece 3 ações via novo `interrupt()`: Continuar / Replanejar / Abortar.
- **D-17:** Audit trail via `ToolLogger` existente com campos extras: `taskId`, `stepId`, `source: 'agentic-task'`.

### Claude's Discretion (resolved or to be resolved by planner)

- **Detecção do modo agentic** — researcher recomenda **"sempre rota planner-first com fast-path para 1 step"**. Justificativa: heurísticas regex são frágeis; intent classifier adiciona latência local; prefixo explícito quebra UX voice-first. O fast-path resolve a preocupação de overhead em chat normal — ver §Architecture Patterns § Fast-path detection.
- **Definição de "1 step" vs multi-step** — pular `interrupt()` quando `plan.steps.length === 1` E `plan.steps[0].expectedOutcome` é trivial. Resolvido em §Architecture Patterns.
- **Threading do `AbortSignal`** — researcher recomenda **expor `signal` via `DispatchContext`** (campo novo `signal: AbortSignal | null`) e cada tool wrapped lê `ctx.signal` e passa adiante. Para PC tools síncronas (não fazem fetch), no-op. Para `request_file_action`, MCP externas e analyze_screen, propaga via `AbortSignal.any([ctx.signal, AbortSignal.timeout(...)])`.
- **Geração do "resumo de output" per step (D-11)** — researcher recomenda **structured output do executor instruindo "ao terminar tool, emit AIMessage de 1 linha pt-BR no formato '{verbo passado} {objeto}'"** via system prompt — sem 2ª chamada LLM extra. O ReAct já emite AIMessage final por step quando o LLM decide "done with this step"; a system instruction só formata. Trade-off: depende do LLM seguir; fallback heurístico em §Architecture Patterns.
- **Geração do TTS de sumário (D-08)** — researcher recomenda **regra fixa determinística** (template: "Vou fazer N coisas: ... Confirma?") para latência mínima e zero token-extra. UI-SPEC já especifica os 2 templates exatos.
- **`thread_id` mapping** — `thread_id = ${chatSessionId}-task-${ulid}`. Permite log correlation com session + uniqueness por task. ULID > UUID porque é sortable por timestamp (debugging).
- **Schema interno do checkpointer** — `MemorySaver` direto + cleanup explícito após `task:done|cancelled|error` via `checkpointer.deleteThread(thread_id)`. TTL não suportado nativamente.
- **STT live durante execução em modo wake-word** — researcher recomenda **manter VAD ativo durante `task:step:*`** (não relançar VoiceInputManager). Detalhes em §Architecture Patterns.
- **Layout de novos arquivos** — `apps/backend-ts/src/agent/{graph,planner,executor,types}.ts`. Ver §Integration Points.
- **Como o frontend mostra os 3 botões em `step-failure`** — UI-SPEC já locked em State 5 (`awaiting-failure-decision`). Reusa o pattern de mensagem-pai com botões.

### Deferred Ideas (OUT OF SCOPE)

- AGENT-05 (relatório de execução pós-task) e AGENT-06 (re-execução) → v3.1+
- Multi-agent orchestration → out of scope global (PROJECT.md)
- Rollback automático de tools destrutivas → descartado (D-15)
- Reflection node automático (replan sem perguntar) → mantém human-in-the-loop (D-16)
- Allowlist por tool de auto-aprovação dentro de tasks → trust no plano só (D-14 herdado)
- SqliteSaver checkpointer → MemorySaver suficiente; persist cross-restart fica para AGENT-05/06
- Hotkey global dedicado para cancel → cobre via voz/texto/botão (D-14)
- Settings de modo TTS do plano → hardcode em sumário curto (D-08)
- Multi-task paralela → JARVIS é single-user single-task no MVP

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | Multi-step task executed end-to-end without intervention (text + voice) | §Architecture Patterns § Fast-path detection + § StateGraph wiring + § Voice live during execution. Validation Architecture maps to integration test `agent-graph.e2e.test.ts`. |
| AGENT-02 | Show numbered plan and wait explicit user confirmation before executing | §Standard Stack § `interrupt()` API + §Architecture Patterns § Plan generation with `withStructuredOutput`. UI-SPEC State 1. Validation in `planner.test.ts` + manual UAT. |
| AGENT-03 | Real-time progress in chat AND orb during execution | §Architecture Patterns § SSE event extension on `/api/chat/stream` + §Code Examples § StateGraph custom stream events. UI-SPEC State 4 (executing) + Orb badge mod. |
| AGENT-04 | Cancel mid-execution stops immediately without persisted side-effects | §Architecture Patterns § AbortSignal threading + § Cancel gate at step boundary + § Voice cancel keyword detection. Validation in `cancel-flow.test.ts` (no further task:step:end after cancel). |

## Project Constraints (from CLAUDE.md)

- **All commits in pt-BR**, Conventional Commits with emoji prefix (`✨ feat: ...`, `♻️ refactor(scope): ...`).
- **Never include `🤖 Generated with [Claude Code]` or `Co-Authored-By:` lines.**
- **All assistant responses to user in pt-BR.**
- **All user-facing strings pt-BR** — system prompt, plan steps, error messages, TTS templates, button labels.
- **Use GSD workflow entry points** — never edit files outside a GSD command.
- **Stack lockdown:** Python NOT allowed in this phase (backend é TS). Backend = Node 22 + TS 5.6+ + LangGraph 1.x. No new packages required for Phase 66 — all stack already installed.
- **Multi-LLM abstraction:** any LLM call (planner included) MUST use `BaseChatModel` from existing `ChatSession.llm` — never hardcode provider. `withStructuredOutput` works on `BaseChatModel`.
- **Privacidade:** memorySaver in-memory é OK; nada cross-cloud. Audit log já fica no SQLite local via `ToolLogger`.

## Standard Stack

### Core (all already installed — no new deps required)

| Library | Installed Version | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `@langchain/langgraph` | 1.2.8 | StateGraph, Annotation, interrupt, Command, MemorySaver, createReactAgent (deprecated but working) | [VERIFIED: pnpm-lock.yaml + node_modules/@langchain/langgraph/package.json]. 1.2.8 is CURRENT (npm view returns 1.3.0 today; 1.2.8 was published ~2 weeks ago). All LangGraph 1.x APIs we need are stable. |
| `@langchain/core` | 1.1.45 | BaseChatModel.withStructuredOutput, RunnableConfig.signal, tool() factory, BaseMessage | [VERIFIED: node_modules/@langchain/core/package.json]. `RunnableConfig.signal: AbortSignal` confirmed in `runnables/types.d.ts`. |
| `zod` | 4.3.6 | Plan schema enforcement | [VERIFIED: package.json]. `withStructuredOutput` accepts Zod v3 AND v4 (overloaded signatures in `language_models/base.d.ts`). |
| `express` | 5.2.1 | SSE handler in `routes/chat.ts` | [VERIFIED: package.json]. `/api/chat/stream` SSE pattern proven Phase 53/60. |
| `@langchain/openai` `@langchain/anthropic` `@langchain/google-genai` | 1.4.3 / 1.3.26 / 2.1.30 | Provider implementations behind BaseChatModel | All 3 implement `withStructuredOutput`. LM Studio works through `@langchain/openai` with `base_url` override. |
| `ulid` (or `crypto.randomUUID`) | — | Task ID generation | **NOT installed.** Recommendation: use `crypto.randomUUID()` from `node:crypto` (already used Phase 53 streamingTurn). Avoids new dependency. ULID would be sortable but adds minor value vs new dep. |

### Supporting (already in stack — context only)

| Library | Installed Version | Purpose | Note |
|---------|-------------------|---------|------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP client for external tools | `client.callTool()` accepts `signal: AbortSignal` per `RequestOptions` (verified in `shared/protocol.d.ts`). Phase 65 adapter does NOT pass it today — Phase 66 must update. |
| `better-sqlite3` | 12.8.0 | Audit log persistence (ToolLogger) | Used by `ToolLogger.logDispatch` — Phase 66 just adds new log fields. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `createReactAgent` from `@langchain/langgraph/prebuilt` | `createAgent` from `langchain@1.4.0` | Requires new `langchain` package install + migration of all 4 existing call sites (chat-session, mcp client, vision tool, request-file-action signatures). Out of scope. Researcher recommends keeping `createReactAgent` and filing tech-debt for v3.x. |
| `MemorySaver` (in-memory) | `SqliteSaver` from `@langchain/langgraph-checkpoint-sqlite` | Adds new dependency + cross-restart persistence. CONTEXT.md explicitly defers (D-03 says MemorySaver MVP). Plan retains MemorySaver. |
| Zod schema for plan | JSON Schema literal | Zod gives compile-time TS types via `z.infer<typeof planSchema>` — drives strong typing for `state.plan: Plan`. JSON Schema would force runtime-only contract. Phase 36 precedent (extractor.ts) uses Zod for the same reason. |
| Custom event protocol over WS | SSE on `/api/chat/stream` (D-10 locked) | WS adds bidirectional but D-10 picks SSE+POST. Researcher confirms SSE is sufficient (Phase 53/60 pattern proven, no new conn handshake per turn). |
| `BroadcastChannel` for cross-window task events | Existing IPC pattern (Phase 52 multi-window broadcast) | Phase 52 pattern is established and tested. Researcher: stick with it. |

**Installation:** No `pnpm install` needed for Phase 66. Only new files.

**Version verification (executed 2026-05-09):**

```bash
$ npm view @langchain/langgraph version
1.3.0   # newer than installed 1.2.8; planner can decide to bump or not (low risk)

$ npm view @langchain/core version
1.1.45  # exact match to installed

$ npm view langchain version
1.4.0   # the package createReactAgent was "moved to" — NOT installed today

$ npm view zod version
4.4.3   # newer than installed 4.3.6 (patch bump only)
```

Recommendation to planner: **do not bump versions** in Phase 66 (separate hygiene task). Lockfile is consistent and all needed APIs exist on current versions.

## Architecture Patterns

### Recommended Project Structure

```
apps/backend-ts/src/
├── agent/                            # NEW module — paralelo a mcp/, memory/, session/
│   ├── types.ts                      # Plan, TaskState, TaskSseEvent, ResumeCommand discriminated union
│   ├── planner.ts                    # plannerNode (withStructuredOutput + Zod schema + pt-BR prompt)
│   ├── executor.ts                   # executorNode (wraps existing createReactAgent + cancel gate + AbortSignal threading)
│   ├── graph.ts                      # StateGraph wiring (Annotation channels) + MemorySaver singleton + thread_id factory
│   ├── keywords.ts                   # confirm/cancel/edit pt-BR keyword constants (mirrored on renderer per UI-SPEC)
│   └── __tests__/
│       ├── planner.test.ts           # plan generation, schema validation
│       ├── executor.test.ts          # cancel-gate ordering, AbortSignal propagation
│       ├── graph.test.ts             # interrupt → resume → step:start/end flow
│       └── keywords.test.ts          # keyword matching edge cases
├── session/
│   ├── chat-session.ts               # MODIFIED: send/sendStream decide fast-path vs graph route
│   └── tool-dispatch.ts              # MODIFIED: DispatchContext + signal: AbortSignal | null; wrapPcTool reads ctx.signal (no-op for sync tools)
├── routes/
│   ├── chat.ts                       # MODIFIED: emit task:* SSE events when graph route active
│   └── tasks.ts                      # NEW: POST /api/tasks/:taskId/resume + POST /api/tasks/:taskId/cancel + listactive
├── mcp/client/
│   └── tool-adapter.ts               # MODIFIED: pass config.signal to client.callTool({...}, schema, { signal })
└── shared (or apps/desktop/src/shared/ipc-types.ts):
    └── ipc-types.ts                  # MODIFIED: add TaskSseEvent discriminated union, ResumeRequest types
```

**Note on package layout:** CONTEXT.md mentions `packages/ipc-types/` — that directory does NOT exist today. Types live in `apps/desktop/src/shared/ipc-types.ts` (single file shared between Electron processes via direct relative import). Backend has separate types embedded in route handlers. Researcher recommends planner **add a small `apps/backend-ts/src/agent/types.ts` for backend-side TaskState** AND **mirror only the SSE event union into `apps/desktop/src/shared/ipc-types.ts`** so the renderer can type-check incoming events. No new package — keep monolith pattern.

### Pattern 1: Plan Generation with `withStructuredOutput` + Zod

**What:** Use `BaseChatModel.withStructuredOutput(planSchema)` to force the LLM to return a typed `Plan` object. Schema enforced at runtime; LangChain handles all parser orchestration.

**When to use:** `plannerNode` execution.

**Example:**

```typescript
// apps/backend-ts/src/agent/planner.ts
// Source: apps/backend-ts/src/memory/extractor.ts (Phase 36 pattern, proven)
// Source: @langchain/core 1.1.45 base.d.ts withStructuredOutput overload for Zod v4
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export const planSchema = z.object({
  steps: z.array(
    z.object({
      id: z.number().int().positive(),
      description: z.string().min(3).max(200),
      expectedOutcome: z.string().min(3).max(200),
    })
  ).min(1).max(15),
});

export type Plan = z.infer<typeof planSchema>;

const PLANNER_SYSTEM_PROMPT = `Você é o planejador do JARVIS. Dado o pedido do usuário, gere um plano numerado de 1 a 15 passos em português brasileiro.

Regras:
- Cada passo deve ser uma frase imperativa curta ("Listar arquivos", "Filtrar por tipo", "Mover para pasta").
- expectedOutcome é uma frase curta descrevendo o critério de sucesso ("14 arquivos listados", "5 PDFs filtrados").
- Se a tarefa for trivial (1 passo), gere apenas 1 passo.
- Se a tarefa for ambígua, gere o plano mais provável — não peça esclarecimento aqui.
- NÃO inclua nomes de tools, NÃO inclua argumentos. O executor decide isso.

Pedido do usuário: {userInput}
{editFeedback}`;

export async function generatePlan(
  llm: BaseChatModel,
  userInput: string,
  editFeedback?: string,
): Promise<Plan> {
  const structured = llm.withStructuredOutput(planSchema);
  const editSection = editFeedback
    ? `\nFeedback do usuário sobre o plano anterior: ${editFeedback}\nGere um plano novo levando esse feedback em conta.`
    : '';
  const prompt = PLANNER_SYSTEM_PROMPT
    .replace('{userInput}', userInput)
    .replace('{editFeedback}', editSection);
  const result = await structured.invoke([new HumanMessage(prompt)]);
  return result as Plan;
}
```

**Critical caveats verified in `@langchain/core@1.1.45`:**
- Returns `Runnable<BaseLanguageModelInput, RunOutput>` — call `.invoke([HumanMessage])` or `.invoke('string')`.
- All 3 LLM providers (OpenAI/LM Studio, Anthropic, Gemini) implement it. LM Studio uses functionCalling under the hood — verify with provider in dev.
- Error mode: if LLM returns invalid JSON or schema violation, throws `OutputParserException`. Wrap in try/catch and return a synthetic 1-step plan as fallback ("Não consegui planejar essa tarefa.") matching UI-SPEC empty-plan copy.
- `discriminatedUnion` works (Phase 36 extractor uses it). Plain `z.object({steps: z.array(...)})` is simpler and sufficient.

[ASSUMED — needs verification with LM Studio specifically:] LM Studio's tool calling reliability for `withStructuredOutput` depends on the loaded model. Tests must run against a known-good model (e.g., Qwen2.5-7B-Instruct or Llama-3.1-8B-Instruct). If a small/quantized model fails the schema repeatedly, document as a model-quality issue not a code bug.

### Pattern 2: StateGraph with Interrupt + MemorySaver

**What:** Build a `StateGraph` with annotated channels for the task state. Add 3 nodes: `planner`, `executor`, plus interrupts inside nodes (NOT as a separate node). Compile with `MemorySaver` checkpointer. Resume via `Command({ resume })` and same `thread_id`.

**When to use:** Every multi-step task. The graph itself is reused across tasks; only `thread_id` differs.

**Example:**

```typescript
// apps/backend-ts/src/agent/graph.ts
// Source: docs.langchain.com/oss/javascript/langgraph/interrupts (canonical pattern)
// Source: node_modules/@langchain/langgraph/dist/graph/state.d.ts (StateGraph type definitions)
import { StateGraph, Annotation, MemorySaver, interrupt, END, START, Command, isGraphInterrupt } from '@langchain/langgraph';
import type { Plan } from './planner.js';
import { generatePlan } from './planner.js';
import { runExecutorNode, type StepResult } from './executor.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Annotation channels — type-safe state shape
const TaskStateAnnotation = Annotation.Root({
  userInput: Annotation<string>(),
  plan: Annotation<Plan | null>({ default: () => null, reducer: (_, x) => x }),
  editFeedback: Annotation<string | null>({ default: () => null, reducer: (_, x) => x }),
  currentStepId: Annotation<number>({ default: () => 0, reducer: (_, x) => x }),
  stepResults: Annotation<StepResult[]>({ default: () => [], reducer: (a, b) => [...a, ...b] }),
  cancelRequested: Annotation<boolean>({ default: () => false, reducer: (_, x) => x }),
  lastError: Annotation<{ stepId: number; message: string } | null>({ default: () => null, reducer: (_, x) => x }),
});

export type TaskState = typeof TaskStateAnnotation.State;

export type ResumeCommand =
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'edit'; feedback: string }
  | { kind: 'continue' }   // step-failure resume: skip failed step
  | { kind: 'replan' }     // step-failure resume: back to planner
  | { kind: 'abort' };     // step-failure resume: terminate

// Singleton checkpointer — shared across all task threads
export const taskCheckpointer = new MemorySaver();

interface BuildGraphArgs {
  llm: BaseChatModel;
  // executorAgent reused per task; rebuilt only on swapLLM (Phase 57 pattern)
  executorAgent: ReactAgentLike;
  // signal for AbortController; created per task and stored in a Map<taskId, controller>
  // Read inside executor node via runtimeConfig.signal
}

export function buildTaskGraph(args: BuildGraphArgs) {
  const graph = new StateGraph(TaskStateAnnotation)
    .addNode('planner', async (state) => {
      const plan = await generatePlan(args.llm, state.userInput, state.editFeedback ?? undefined);

      // Interrupt for plan-confirmation. Resume value is ResumeCommand.
      const decision = interrupt<{ kind: 'plan-confirmation'; plan: Plan }, ResumeCommand>({
        kind: 'plan-confirmation',
        plan,
      });

      if (decision.kind === 'cancel') {
        return new Command({ goto: END, update: { plan, cancelRequested: true } });
      }
      if (decision.kind === 'edit') {
        // Loop back to planner with feedback
        return new Command({ goto: 'planner', update: { plan, editFeedback: decision.feedback } });
      }
      // confirm → forward to executor with plan
      return { plan, editFeedback: null };
    }, { ends: ['planner', 'executor', END] })
    .addNode('executor', async (state, config) => {
      // executor reads config.signal for AbortController integration
      // executor calls interrupt({kind:'step-failure',...}) on tool error
      // executor emits custom stream events via config.writer for SSE
      return await runExecutorNode(args.executorAgent, state, config);
    })
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END)
    .compile({ checkpointer: taskCheckpointer });

  return graph;
}

export function newTaskThreadId(chatSessionId: string): string {
  // Avoid new ULID dependency; randomUUID is sufficient and already used Phase 53
  const taskUuid = crypto.randomUUID();
  return `chat-${chatSessionId}-task-${taskUuid}`;
}
```

**Critical caveats:**
- `interrupt()` MUST be called inside a node body. **Avoid `try/catch` around it** — it throws `GraphInterrupt` to bubble up. If you must catch (e.g., for logging), re-throw `GraphInterrupt` errors using `isGraphInterrupt()` check. [VERIFIED: node_modules/@langchain/langgraph/dist/interrupt.d.ts JSDoc].
- Multiple interrupts in same node ARE supported — return values are matched by call order. Phase 66 uses 1 interrupt in `planner` (plan-confirmation) and 1 in `executor` (step-failure on D-16) — sequential, separate node executions.
- `MemorySaver.deleteThread(threadId)` exists [VERIFIED: dist/memory.d.ts]. **Call it explicitly after `task:done`, `task:cancelled`, `task:error`** to free state. NO automatic GC, NO LRU. Without explicit cleanup, MemorySaver grows unbounded.
- `Command({ goto: 'nodeName', update: {...} })` and `Command({ goto: END })` for routing decisions. Returning a plain object updates state and follows the static edge.
- `Annotation.Root({...})` is the 1.x API. Each channel needs `default` and `reducer` for non-trivial types. For singletons (`plan`, `cancelRequested`), reducer is `(_, x) => x` (overwrite). For arrays (`stepResults`), reducer is `(a, b) => [...a, ...b]` (concat).

### Pattern 3: Executor Node — Wrapping `createReactAgent` + Cancel Gate

**What:** The `executor` node iterates through `state.plan.steps`. For each step, it (1) checks `state.cancelRequested`, (2) calls the existing `createReactAgent` with a system message containing the current step, (3) emits SSE events via custom stream writer, (4) handles errors via `interrupt({kind:'step-failure'})`.

**When to use:** Always after `planner` confirms.

**Example:**

```typescript
// apps/backend-ts/src/agent/executor.ts
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { TaskState } from './graph.js';
import type { Plan } from './planner.js';

export interface StepResult {
  stepId: number;
  status: 'success' | 'error' | 'skipped';
  outputSummary: string;
  toolName?: string;
}

export async function runExecutorNode(
  reactAgent: ReactAgentLike, // type from chat-session.ts
  state: TaskState,
  config: LangGraphRunnableConfig,
): Promise<Partial<TaskState>> {
  const { plan, stepResults: existingResults } = state;
  if (!plan) throw new Error('executor: plan missing');

  const newResults: StepResult[] = [];
  // Each step is its own ReAct invocation. Cancel-gate runs BEFORE each.
  for (const step of plan.steps) {
    // ── Cancel gate (D-13 primary lever) ────────────────────────────
    if (state.cancelRequested || config.signal?.aborted) {
      // Emit task:cancelled SSE via custom stream writer
      config.writer?.({ kind: 'task:cancelled', atStep: step.id });
      return { stepResults: newResults };
    }

    // ── Skip steps already completed (resume-after-replan path) ────
    if (existingResults.some(r => r.stepId === step.id)) continue;

    // Emit task:step:start
    config.writer?.({ kind: 'task:step:start', stepId: step.id, description: step.description });

    // Build per-step messages: system frames the step + user instructs
    const stepMessages = [
      new SystemMessage(`Você está executando o passo ${step.id} de ${plan.steps.length} de uma tarefa.\n\nPasso ${step.id}: ${step.description}\nResultado esperado: ${step.expectedOutcome}\n\nExecute APENAS este passo. Quando terminar, escreva uma frase pt-BR em até 80 caracteres no formato '{verbo no passado} {objeto curto}' como 'Listei 14 arquivos' ou 'Movi 3 PDFs'. Não faça mais que o passo atual.`),
      new HumanMessage(`Execute o passo ${step.id}.`),
    ];

    try {
      // Pass signal through agent.invoke for AbortSignal threading
      // CRITICAL: tools must be wrapped to read config.signal (see DispatchContext below)
      const result = await reactAgent.invoke(
        { messages: stepMessages },
        { signal: config.signal, configurable: { taskId: config.configurable?.thread_id, stepId: step.id } },
      );

      const outputSummary = extractFinalAiText(result.messages).slice(0, 80);
      const stepResult: StepResult = { stepId: step.id, status: 'success', outputSummary };
      newResults.push(stepResult);
      config.writer?.({ kind: 'task:step:end', stepId: step.id, status: 'success', summary: outputSummary });
    } catch (err) {
      const errMessage = (err as Error).message;
      // Step failure → interrupt for human decision (D-16)
      const decision = interrupt<{ kind: 'step-failure'; stepId: number; error: string }, ResumeCommand>({
        kind: 'step-failure',
        stepId: step.id,
        error: errMessage,
      });

      if (decision.kind === 'continue') {
        const skipResult: StepResult = { stepId: step.id, status: 'skipped', outputSummary: 'Pulado pelo usuário' };
        newResults.push(skipResult);
        config.writer?.({ kind: 'task:step:end', stepId: step.id, status: 'error', summary: errMessage });
        continue;
      }
      if (decision.kind === 'replan') {
        // Loop back to planner with error context as edit feedback
        return new Command({
          goto: 'planner',
          update: {
            stepResults: newResults,
            editFeedback: `O passo ${step.id} (${step.description}) falhou com: "${errMessage}". Replanejar evitando essa abordagem.`,
            lastError: { stepId: step.id, message: errMessage },
          },
        }) as unknown as Partial<TaskState>;
      }
      // abort
      config.writer?.({ kind: 'task:error', atStep: step.id, message: errMessage });
      return { stepResults: newResults, lastError: { stepId: step.id, message: errMessage } };
    }
  }

  // All steps done — generate final summary (1 LLM call) for task:done
  const summary = await generateFinalSummary(reactAgent, plan, newResults);
  config.writer?.({ kind: 'task:done', summary });
  return { stepResults: newResults };
}
```

**Critical caveats:**
- `config.writer` is the custom stream writer mechanism in LangGraph 1.x. Calls to `config.writer(payload)` emit a `{ mode: 'custom', data: payload }` chunk on `graph.stream({...}, { streamMode: 'custom' })`. The HTTP route reads these and re-emits as SSE `event: task:*`.
- `config.signal` is the AbortSignal passed by the caller (`graph.stream(input, { signal })`). When the signal fires, `reactAgent.invoke` throws `AbortError` if any tool propagates it. Cancel still works WITHOUT signal threading because the cancel-gate runs BEFORE each step (D-13 primary lever). Signal threading is the secondary "best-effort" lever for mid-tool cancellation.
- `extractFinalAiText` already exists in `chat-session.ts:486` — Phase 66 imports it (or the planner adds an export).
- `generateFinalSummary` is a separate small LLM call; it's the SAME pattern as the planner — `withStructuredOutput` not strictly needed (1-3 sentences, plain text). Cost: 1 extra LLM hop per task. Trade-off explicit: better UX (D-08/D-11) for the cost.

### Pattern 4: AbortSignal Threading via Updated DispatchContext

**What:** Today, `tool-dispatch.ts` defines `DispatchContext = { logger, getListener }`. Phase 66 adds `signal: AbortSignal | null`. Tools that fetch propagate `AbortSignal.any([config.signal, AbortSignal.timeout(N)])` to `fetch(url, { signal })`.

**When to use:** Every tool that does I/O (network, MCP, IPC). PC tools that do `pyautogui` etc. via the Electron WebSocket already block on the gateway's 12s timer (Phase 54) — adding `signal` to the inner `fetch` makes cancel responsive.

**Example:**

```typescript
// apps/backend-ts/src/session/tool-dispatch.ts (MODIFIED)
export interface DispatchContext {
  logger: ToolLogger;
  getListener: () => OnToolDispatched | null;
  // NEW Phase 66:
  getSignal: () => AbortSignal | null;
  // NEW Phase 66 D-17 audit:
  getTaskMeta: () => { taskId: string; stepId: number } | null;
}

// apps/backend-ts/src/session/request-file-action.ts (MODIFIED line 65)
const inner = AbortSignal.timeout(13_000);
const outer = ctx.getSignal();
const signal = outer ? AbortSignal.any([inner, outer]) : inner;
const response = await fetch(`${gatewayUrl}/internal/dispatch-action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientId, action, path, model: 'unknown' }),
  signal,
});

// apps/backend-ts/src/mcp/client/tool-adapter.ts (MODIFIED line 62-72 — replace Promise.race timeout)
async (input: Record<string, unknown>, runConfig: ToolRunnableConfig) => {
  const outer = runConfig?.signal ?? null;
  const inner = AbortSignal.timeout(TOOL_TIMEOUT_MS);
  const signal = outer ? AbortSignal.any([inner, outer]) : inner;
  try {
    const result = await client.callTool(
      { name: def.name, arguments: input },
      undefined, // result schema
      { signal, timeout: TOOL_TIMEOUT_MS },
    );
    // ... existing audit + return ...
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // Cancellation is not an error to the LLM — return a clean message
      return `Tool ${def.name} cancelado pelo usuário.`;
    }
    // ... existing error path ...
  }
}
```

**Critical caveats:**
- `AbortSignal.any([...])` is **Node 22 stable** (was experimental in 18, stable in 20+). [VERIFIED: Node docs]. Backend already requires Node 22 per stack lockdown.
- The `tool()` factory's func receives `(input, runConfig)` — read from runConfig directly OR use the DispatchContext closure pattern (existing). Phase 65 tool-adapter today does NOT receive runConfig (the `async (input)` signature) — Phase 66 fixes this signature first.
- PC tools via `wrapAllPcTools` in `tool-dispatch.ts:wrapPcTool` — the wrapper receives input, awaits `original.invoke(input)`, but doesn't currently expose runConfig. **Planner must update `wrapPcTool` to forward `runConfig` to `original.invoke(input, runConfig)`** so signal flows through. This is a 2-line change.

### Pattern 5: Fast-Path Detection (Claude's Discretion)

**What:** Researcher recommends running the planner on EVERY turn but with a fast-path for trivial 1-step plans. The planner LLM can be instructed: "if the task is simple, return 1 step". The chat-session checks `plan.steps.length === 1 && trivialOutcome(plan.steps[0])` — if true, skip `interrupt()` and execute via the existing direct-`agent.invoke()` path.

**When to use:** Every turn from `ChatSession.send/sendStream`.

**Example:**

```typescript
// apps/backend-ts/src/session/chat-session.ts (MODIFIED send)
async send(text: string, imageBase64?: string): Promise<string> {
  // ... auto-capture logic ...
  // ... build humanMessage ...
  this.history.push(humanMessage);
  embeddingQueue.pause();
  try {
    // Phase 66: planner-first routing
    if (this._agenticEnabled && !imageBase64) {
      const plan = await generatePlan(this.llm, text);
      if (plan.steps.length > 1 || !isTrivialPlan(plan)) {
        // Multi-step → enter graph
        return await this._runMultiStepTask(text, plan);
      }
      // 1-step trivial → fall through to direct agent (no interrupt overhead)
    }
    // Existing direct-agent path
    const result = await this._agent.invoke({ messages: this.history });
    // ... rest unchanged ...
  } finally {
    embeddingQueue.start();
  }
}

function isTrivialPlan(plan: Plan): boolean {
  return plan.steps.length === 1 && plan.steps[0].description.length < 80;
}
```

**Trade-off:** Every turn now does 1 extra planner LLM call (~300-800 tokens, 1-3s). If user reports overhead in chat normal, fall back to keyword-trigger heuristic (regex for "faça X e depois Y", "organize", "para cada", etc.) before the planner. Researcher prefers latency-cost over UX-friction since voice-first interactions are forgiving of 1s delay; chat is more sensitive — flag for verify-work UAT.

[ASSUMED — needs runtime measurement:] LM Studio with a 7B Q4 model takes ~1-2s for the plan. Claude Haiku takes ~0.5s. GPT-4o takes ~1s. If user reports unacceptable lag, planner adds env flag `AGENTIC_PLANNER_HEURISTIC=true` to gate the planner behind regex pre-classification.

### Pattern 6: SSE Event Extension on `/api/chat/stream`

**What:** Existing `/api/chat/stream` SSE handler (`apps/backend-ts/src/routes/chat.ts:50`) emits `event: action` and bare `data:` token chunks. Phase 66 adds new `event: task:*` types when the agentic graph route is active. Reuses the same connection — no new HTTP endpoint for streaming.

**When to use:** Whenever `chat-session.send/sendStream` routes through the graph.

**Example:**

```typescript
// apps/backend-ts/src/routes/chat.ts (MODIFIED stream handler)
router.get('/chat/stream', async (req, res) => {
  // ... existing setup ...
  res.setHeader('Content-Type', 'text/event-stream');
  res.flushHeaders();

  // Use streamMode: ['messages', 'custom'] when graph route active.
  // 'messages' yields AIMessageChunk tokens like before; 'custom' yields task:* events.
  // For backward compat with non-graph turns, default to 'messages' only.

  if (isAgenticTurn(message)) {
    const taskId = newTaskThreadId(sessionId);
    const controller = new AbortController();
    activeControllers.set(taskId, controller);

    // Emit initial task:awaiting-confirmation if graph hits interrupt
    const stream = await taskGraph.stream(
      { userInput: message },
      {
        configurable: { thread_id: taskId },
        streamMode: ['messages', 'custom'],
        signal: controller.signal,
      },
    );

    for await (const [mode, chunk] of stream) {
      if (mode === 'custom') {
        // chunk is the task:* event payload
        res.write(`event: ${chunk.kind}\ndata: ${JSON.stringify({ taskId, ...chunk })}\n\n`);
        // Flush manually if backpressure — Express 5 res.write is non-blocking
      } else if (mode === 'messages') {
        const [msgChunk] = chunk;
        if (msgChunk?.constructor?.name === 'AIMessageChunk' && msgChunk.content) {
          res.write(`data: ${msgChunk.content}\n\n`);
        }
      }
    }

    // Detect interrupt — graph paused, frontend will POST /resume
    const finalState = await taskGraph.getState({ configurable: { thread_id: taskId } });
    if (finalState.tasks?.length && finalState.tasks[0].interrupts?.length) {
      const interruptValue = finalState.tasks[0].interrupts[0].value;
      res.write(`event: task:awaiting-confirmation\ndata: ${JSON.stringify({ taskId, ...interruptValue })}\n\n`);
    }

    // Don't end the stream until user resumes via POST /resume — keep connection open.
    // Alternative: end stream here and frontend opens new SSE on resume. Researcher
    // recommends the second pattern (cleaner connection lifecycle).
    res.end();
  } else {
    // Existing fast-path
    for await (const token of session.sendStream(message, imageBase64)) {
      res.write(`data: ${token}\n\n`);
    }
    res.end();
  }
});

// NEW: apps/backend-ts/src/routes/tasks.ts
router.post('/api/tasks/:taskId/resume', async (req, res) => {
  const { taskId } = req.params;
  const { kind, feedback } = req.body;
  const resumeCommand = buildResumeCommand(kind, feedback);
  // Re-stream the graph with Command({ resume }). Frontend opens NEW SSE on this endpoint.
  res.setHeader('Content-Type', 'text/event-stream');
  res.flushHeaders();
  const stream = await taskGraph.stream(
    new Command({ resume: resumeCommand }),
    { configurable: { thread_id: taskId }, streamMode: ['messages', 'custom'], signal: getControllerFor(taskId).signal },
  );
  for await (const [mode, chunk] of stream) { /* same as above */ }
  // After stream drains, cleanup
  taskCheckpointer.deleteThread(taskId);
  res.end();
});

router.post('/api/tasks/:taskId/cancel', (req, res) => {
  const { taskId } = req.params;
  const controller = activeControllers.get(taskId);
  if (controller) controller.abort();
  // Also flip cancelRequested in state so cancel-gate triggers on next iteration
  taskGraph.updateState(
    { configurable: { thread_id: taskId } },
    { cancelRequested: true },
  );
  // Cleanup happens in the streaming handler after task:cancelled event
  res.json({ status: 'cancelling' });
});
```

**Critical caveats:**
- `streamMode: ['messages', 'custom']` returns tuples `[mode, chunk]` — TypeScript types this correctly when arrays are passed [VERIFIED: pregel/types.d.ts `StreamOutputMap`].
- Express 5 `res.write()` returns `false` if backpressure is hit. For a single client SSE channel with text events at human-perceptible speed (≤10/sec), backpressure is **not a real concern**. If it ever becomes one, wrap in `await new Promise(r => res.once('drain', r))`. Researcher recommends NOT premature-optimizing.
- `graph.getState({configurable:{thread_id}})` returns a `StateSnapshot` with a `.tasks` array; each task has `.interrupts` array if interrupted. [VERIFIED: pregel/index.d.ts `getState`]. This is the post-stream way to detect interrupt occurred.
- **Connection lifecycle:** the simple model is "end the SSE on interrupt; frontend POSTs /resume which opens a new SSE for execution events". The complex model is "keep one SSE open across the whole task and pipe events". Researcher recommends the simple model — cleaner connection management, easier debugging, and matches existing pattern (Phase 53/60 turn = single SSE).

### Pattern 7: MemorySaver Lifecycle

**What:** `MemorySaver` is `Record<threadId, Record<...>>` — pure in-memory. Grows linearly with task count. No TTL, no LRU. Each call to `graph.invoke/stream` adds checkpoints under `thread_id`.

**When to clean up:** After `task:done`, `task:cancelled`, `task:error` SSE events fire — backend calls `taskCheckpointer.deleteThread(thread_id)`.

```typescript
// In the route handler after graph stream drains AND state is terminal:
const finalState = await taskGraph.getState({ configurable: { thread_id: taskId } });
const isTerminal = !finalState.next || finalState.next.length === 0;
if (isTerminal) {
  await taskCheckpointer.deleteThread(taskId);
  activeControllers.delete(taskId);
}
```

**Pitfall: tasks abandoned mid-confirmation.** If user closes the widget after seeing `task:awaiting-confirmation` but never POSTs /resume, the thread sits in MemorySaver forever. Mitigations:
1. Add a 1-hour TTL sweep on a `setInterval` that calls `deleteThread` for any thread older than 1h with no recent activity. Tracker via in-memory `Map<taskId, lastActivityTs>`.
2. Or document as known limitation for MVP — single-user backend means worst-case ~10MB if user abandons many tasks. Acceptable for MVP.

Researcher recommends **option 2 (document) for the MVP**, file follow-up for option 1 if heap soak-test (Phase 56-style) shows growth.

### Pattern 8: Voice Cancel Detection During Execution

**What:** During `task:executing` state, the frontend keeps STT live so user can say "cancela" and trigger `POST /api/tasks/:id/cancel`. The detection happens in the renderer (`apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts`) BEFORE the audio gets sent to the backend `/api/chat`.

**When to use:** Whenever `ChatContext.tasks` has any task in `awaiting-confirmation` or `executing` state.

**Per-mode behavior (Claude's Discretion resolved):**

| Voice mode | Behavior during `task:executing` |
|------------|----------------------------------|
| **Wake-word (default)** | Re-arm wake-word listening as soon as `task:awaiting-confirmation` or `task:step:start` arrives. Keyword "JARVIS" still required to activate STT. Researcher rationale: keeping VAD always-on in wake-word mode would change the mode contract (Phase 22+) — safer to require wake-word. Trade-off: user must say "JARVIS, cancela". UI-SPEC keyword list accepts this. |
| **Always-listening** | Already continuous. STT will trigger on any utterance; `sendAudioAndHandle` checks ChatContext first and short-circuits if utterance matches cancel keywords. |
| **PTT-only** | User presses hotkey + speaks. Same flow as text — `sendAudioAndHandle` short-circuits to /cancel if utterance matches. |

**Example:**

```typescript
// apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts (MODIFIED — Phase 66 keyword short-circuit)
const CANCEL_KEYWORDS = ['não','nao','cancela','cancelar','para','parar','aborta','abortar','stop'];
const CONFIRM_KEYWORDS = ['vai','sim','confirma','confirmar','ok','okay','prossegue','prossiga','pode','manda','bora'];
const EDIT_PREFIXES = ['edita','editar','muda','mudar','troca','trocar','ajusta','ajustar','altera','alterar','corrige','corrigir'];

function matchTaskKeyword(utterance: string, taskState: TaskUiState['kind']):
  | { kind: 'cancel' }
  | { kind: 'confirm' }
  | { kind: 'edit'; feedback: string }
  | null {
  const lower = utterance.trim().toLowerCase().replace(/[.!?,]+$/, '');
  if (taskState === 'executing' || taskState === 'awaiting-confirmation') {
    if (CANCEL_KEYWORDS.includes(lower)) return { kind: 'cancel' };
  }
  if (taskState === 'awaiting-confirmation') {
    if (CONFIRM_KEYWORDS.includes(lower)) return { kind: 'confirm' };
    for (const prefix of EDIT_PREFIXES) {
      if (lower.startsWith(prefix + ' ')) {
        return { kind: 'edit', feedback: utterance.slice(prefix.length + 1).trim() };
      }
      if (lower === prefix) return { kind: 'edit', feedback: '' };
    }
  }
  return null;
}

export async function sendAudioAndHandle(audioBuffer, deps) {
  const result = await window.jarvis.sendAudio(audioBuffer);
  if (result.success && deps.activeTask) {
    const transcribedUtterance = result.data.transcription;
    const match = matchTaskKeyword(transcribedUtterance, deps.activeTask.state.kind);
    if (match) {
      // Short-circuit: don't send to /api/chat
      if (match.kind === 'cancel') {
        await window.jarvis.cancelTask(deps.activeTask.taskId);
      } else {
        await window.jarvis.resumeTask(deps.activeTask.taskId, match);
      }
      return;
    }
  }
  // ... existing flow (send to /api/chat) ...
}
```

**Critical caveats:**
- ChatContext exposes the active task as a Map; consumers (sendAudioAndHandle, ChatInput text handler) read it before dispatching. UI-SPEC `Cancel/Confirm/Edit keyword contract` defines the exact list — researcher mirrors that here for keyword precedent only.
- Whisper STT may transcribe "cancela" as "cancela.", "cancela!", "cancela?" — strip trailing punctuation before keyword match. Done above.
- Voice utterances "cancela essa tarefa", "para tudo", "cancela isso" — only exact-match the listed keywords for v1; if user reports needing more flexibility, escalate as follow-up.

### Anti-Patterns to Avoid

- **DON'T `try { interrupt(...) } catch (e) { ... }`** without re-throwing `GraphInterrupt`. Will swallow the interrupt and break the pause mechanism. [VERIFIED: interrupt.d.ts JSDoc].
- **DON'T forget `MemorySaver.deleteThread(threadId)`** on terminal events. Memory grows unbounded (no GC, no LRU).
- **DON'T pass plan.steps[].toolName or args from planner.** D-05 explicitly says planner only describes; executor (ReAct) decides tools. Trying to force tool selection in the schema makes the planner brittle and rolls back to deterministic execution (which D-04 rejects).
- **DON'T rebuild executor agent inside `executor` node.** Reuse the existing `chat-session._agent`. Rebuilding is the Phase 57 swapLLM path only.
- **DON'T mix `streamMode: 'messages'` and `streamMode: 'updates'` in same call** if you want both — pass an array. With array, output is `[mode, chunk]` tuples. With single mode (current chat code), output is just chunks.
- **DON'T put PC-tool toast confirmation inside a task** — Phase 66 trust-mode says confirmation happens at the plan level only. Otherwise SC AGENT-01 ("sem interrupção") is violated.
- **DON'T persist state.cancelRequested via checkpointer hoping for cross-restart cancel** — MemorySaver is in-memory; restarts lose all task state. Cancel works only within a running backend process.
- **DON'T tap into LangChain `BaseMessage.id` for step correlation.** It's not stable across providers. Use the custom `stepId` from `Plan.steps`.
- **DON'T use `task:*` event names with colons in `event:` field of SSE** — actually CAN use colons; per [HTML SSE spec](https://html.spec.whatwg.org/multipage/server-sent-events.html), colons are valid in event names (only `data:` field is special). Existing Phase 53/60 already uses `event: action` — extending with `event: task:plan` is fine. Cross-checked with EventSource spec.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pause graph + resume with user input | Custom `pendingTask` map + Promise resolvers | LangGraph `interrupt()` + `Command(resume)` + `MemorySaver` | LangGraph handles serialization, multiple sequential interrupts, resume-from-anywhere, and cross-restart upgrade path (SqliteSaver later). Custom would re-implement all this. |
| Plan structured generation | JSON.parse(LLM raw text) + ad-hoc validation | `llm.withStructuredOutput(zodSchema)` | LangChain handles the multiple parsing strategies (function calling vs JSON mode), retry on parse failures, and provider abstraction. Phase 36 already proves this pattern. |
| Step cancellation gating | New cancellation event bus | LangGraph state channels (cancelRequested) + AbortSignal threading via `RunnableConfig.signal` | Already plumbed end-to-end in `@langchain/core` + `@langchain/langgraph`. Just opt tools in. |
| Plan ID generation | Counter or timestamp string | `crypto.randomUUID()` | No new dep. Already used Phase 53 streamingTurn. |
| Task-level audit trail | New SQLite table | Existing `ToolLogger.logDispatch(name, args, extra?)` with new fields `taskId, stepId, source: 'agentic-task'` | D-17. Phase 65 D-15 proved the pattern (`source: 'mcp-external', serverName`). Same shape. |
| Custom event protocol for task progress | New WebSocket endpoint | Extend `/api/chat/stream` SSE with `event: task:*` and `streamMode: 'custom'` from LangGraph | D-10 explicit. Phase 53/60 SSE infra is proven. |
| Voice keyword matching | NLP intent classifier | Hardcoded pt-BR keyword list in `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` (mirrored in `apps/backend-ts/src/agent/keywords.ts`) | UI-SPEC locks the list. Lightweight. Easier to test and update than a classifier. |
| Per-step timeout | New AbortController per step manually | `AbortSignal.timeout(N)` + `AbortSignal.any([outer, inner])` for cancel + timeout composition | Node 22 native. Already used Phase 50/53/63/65. |

**Key insight:** The agentic stack is essentially **fully built into LangGraph 1.x**. Phase 66 is an integration phase, not a build-from-scratch phase. The risk is over-engineering parallel state stores, custom event buses, or rebuilt cancellation primitives when the framework supplies them all.

## Common Pitfalls

### Pitfall 1: `createReactAgent` deprecation noise
**What goes wrong:** TypeScript emits `@deprecated` warnings on every `createReactAgent` import. Devs may panic and try to migrate to `langchain.createAgent` mid-phase.
**Why it happens:** LangChain split the prebuilt agent into the new `langchain` package as part of the 1.x convergence.
**How to avoid:** Document the decision **in code** (`// PHASE 66: keeping deprecated createReactAgent — see RESEARCH.md § Standard Stack`). File tech-debt issue. Don't migrate in this phase.
**Warning signs:** PR review asking "should we migrate?". Answer: no, scope.

### Pitfall 2: Interrupt detection in stream output
**What goes wrong:** Devs assume `graph.invoke(input, config)` returns `result.__interrupt__` always. It does — but only on the FIRST stream that hit the interrupt; subsequent `getState()` calls show interrupts under `state.tasks[].interrupts`.
**Why it happens:** Two different APIs serve interrupt info — `__interrupt__` in invoke output, `state.tasks[].interrupts` in `getState()`.
**How to avoid:** For Phase 66, prefer `await graph.getState({ configurable: { thread_id } })` after streaming drains. It's the canonical "what's the graph paused on?" query.
**Warning signs:** Code that fishes for `__interrupt__` field across multiple invocations.

### Pitfall 3: Forgetting to thread `signal` through `agent.invoke`
**What goes wrong:** `executor` node calls `reactAgent.invoke({messages})` without `{signal: config.signal}`. Result: AbortController on a task does NOTHING during step execution — only the cancel-gate between steps catches it.
**Why it happens:** The existing `chat-session.ts:328` calls `this._agent.invoke({messages})` with no second arg — devs copy that pattern.
**How to avoid:** Plan executor.ts to always pass `{signal: config.signal, configurable: {...}}` as 2nd arg.
**Warning signs:** Cancel works "between steps" only; users report "I clicked cancel and it kept running for 30 seconds during the long step". Means signal isn't threading.

### Pitfall 4: ReAct loop expansion inside a single step
**What goes wrong:** ReAct may decide a single "step" needs 5 tool calls. Phase 66 treats one ReAct invocation as one step. If the LLM gets confused and tries to do steps 2 and 3 inside step 1's invocation, the per-step events get out of sync.
**Why it happens:** The system message says "Execute APENAS este passo. Não faça mais que o passo atual." — but LLMs sometimes over-eager.
**How to avoid:** (1) Strong system message guard; (2) Optional max_tool_calls per ReAct invocation (cap = 5); (3) If LLM emits a final AI message that mentions a future step number, treat as completion and let the next iteration of the for-loop run that step.
**Warning signs:** `task:step:end` events for steps 1, 2, 3 fire all together within seconds; step 4 timeout because the agent is "still on step 1".

### Pitfall 5: System prompt collision with executor agent
**What goes wrong:** `createReactAgent({prompt: SYSTEM_PROMPT})` injects the JARVIS pt-BR prompt at the start. The executor's per-step `SystemMessage` adds another. The LLM sees TWO system messages. OpenAI/LM Studio handle this OK; Anthropic Claude has stricter system message handling and may concatenate or warn.
**Why it happens:** Mixing graph-level prompts with node-level prompts.
**How to avoid:** Inject the per-step instruction as **HumanMessage** instead of SystemMessage. Or use `createReactAgent`'s `prompt` parameter as a function that takes state and returns BaseMessage[] (verified via `Prompt = ((state, config) => BaseMessageLike[])` in react_agent_executor.d.ts).
**Warning signs:** Anthropic provider returning errors about "multiple system messages". LM Studio/OpenAI silently concatenating.

### Pitfall 6: MemorySaver thread leak from abandoned plans
**What goes wrong:** User opens widget, asks for a multi-step task, sees the plan, walks away. Backend keeps thread state forever. Slowly grows MemorySaver heap.
**Why it happens:** No automatic GC; `deleteThread` only called on terminal events.
**How to avoid:** Document as MVP limitation (single-user, low-traffic, ~MB-scale leak even after weeks of use). File follow-up for TTL sweeper if soak-test reveals.
**Warning signs:** `taskCheckpointer.storage` size grows monotonically. Run `Object.keys(checkpointer.storage).length` in a debug endpoint.

### Pitfall 7: SSE event names with `data:` instead of `event:`
**What goes wrong:** SSE sends `data: { kind: 'task:plan', ... }` and frontend expects `event: task:plan` + `data: {...}`. Browser EventSource won't fire the `task:plan` event listener.
**Why it happens:** Confusion between sending JSON-with-kind on the default `data` channel vs. using SSE event names.
**How to avoid:** Use proper SSE format: `event: task:plan\ndata: {payload}\n\n`. Frontend uses `eventSource.addEventListener('task:plan', cb)`. Phase 53/60 already established this — researcher cross-verified at routes/chat.ts:84.
**Warning signs:** Event listeners never fire on the renderer; only the bare `data` handler does. Devtools Network tab shows the events but no callback runs.

### Pitfall 8: `editFeedback` loop with Annotation reducer
**What goes wrong:** When user edits the plan, the planner runs again. `editFeedback` channel gets set, planner generates new plan, interrupt fires again. If the reducer for `editFeedback` is `(left, right) => left ?? right`, the second edit gets ignored.
**Why it happens:** Default reducers vary; without explicit overwrite, latest value may not win.
**How to avoid:** All single-value channels use `reducer: (_, x) => x` (overwrite). Verified in Pattern 2 example.
**Warning signs:** "Edit" button works once, second edit reuses the first feedback.

## Code Examples

### Example: Detect Interrupt After Stream Drains

```typescript
// Source: docs.langchain.com/oss/javascript/langgraph/interrupts (canonical pattern)
const taskId = `chat-${sessionId}-task-${crypto.randomUUID()}`;
const config = { configurable: { thread_id: taskId } };

// Initial run — graph hits interrupt and pauses
for await (const [mode, chunk] of await graph.stream(
  { userInput: 'organize my Downloads folder' },
  { ...config, streamMode: ['messages', 'custom'] },
)) {
  if (mode === 'custom') console.log('event:', chunk);
}

// Inspect what graph is paused on
const snapshot = await graph.getState(config);
const interrupts = snapshot.tasks?.[0]?.interrupts ?? [];
if (interrupts.length > 0) {
  console.log('Paused on:', interrupts[0].value);
  // → { kind: 'plan-confirmation', plan: {...} }
}

// Resume with user decision
for await (const [mode, chunk] of await graph.stream(
  new Command({ resume: { kind: 'confirm' } }),
  { ...config, streamMode: ['messages', 'custom'] },
)) {
  if (mode === 'custom') console.log('event:', chunk);
}
```

### Example: Cancel Mid-Execution

```typescript
// Source: node_modules/@langchain/core/dist/runnables/types.d.ts (RunnableConfig.signal)
// + node_modules/@langchain/langgraph/dist/pregel/types.d.ts (PregelOptions.signal)

const taskId = newTaskThreadId(sessionId);
const controller = new AbortController();
activeControllers.set(taskId, controller);

// User clicks Cancel during execution
controller.abort();
// AND flip cancelRequested in graph state for cancel-gate
await graph.updateState(
  { configurable: { thread_id: taskId } },
  { cancelRequested: true },
);
// stream loop in route handler will receive AbortError + cancel-gate fires on next step
```

### Example: Custom Stream Writer for SSE Events

```typescript
// Source: docs.langchain.com/oss/javascript/langgraph/streaming
// Inside an executor node:
async function executorNode(state, config) {
  // config.writer is a function that emits to streamMode: 'custom' consumers
  config.writer({ kind: 'task:step:start', stepId: 1, description: 'Listing files' });
  const result = await reactAgent.invoke({...}, { signal: config.signal });
  config.writer({ kind: 'task:step:end', stepId: 1, status: 'success', summary: 'Listei 14 arquivos' });
  return { stepResults: [...] };
}

// Caller-side: streamMode array enables both messages + custom
for await (const [mode, chunk] of await graph.stream(input, {
  streamMode: ['messages', 'custom'],
  configurable: { thread_id },
})) {
  if (mode === 'custom') {
    res.write(`event: ${chunk.kind}\ndata: ${JSON.stringify(chunk)}\n\n`);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createReactAgent` from `@langchain/langgraph/prebuilt` | `createAgent` from `langchain@1.x` | LangChain 1.4.0 (~early 2026) | Phase 66 retains old import; migration is tech-debt for v3.x. Both work today. [CITED: react_agent_executor.d.ts JSDoc `@deprecated`] |
| `interrupt()` based on raising `NodeInterrupt` exception manually | `interrupt(value)` function from `@langchain/langgraph` | 0.2.x → 1.x stabilized | The new function-style is canonical. `NodeInterrupt` class still exists for niche use [VERIFIED: errors.d.ts]. Phase 66 uses the function. |
| `AgentState` interface from `@langchain/langgraph/prebuilt` | `AgentState` from `langchain` | 1.4.0 (deprecation alongside createReactAgent) | Phase 66 doesn't import AgentState directly; uses `MessagesAnnotation`-shaped state from `createReactAgent`'s return type. |
| Old `messageModifier` / `stateModifier` parameters on `createReactAgent` | `prompt` parameter (string \| SystemMessage \| (state) => Messages) | 0.2.46 | All 4 call sites in `chat-session.ts` already use `prompt: SYSTEM_PROMPT`. No migration needed. |
| `Promise.race` for tool timeout | `client.callTool({...}, schema, { signal: AbortSignal.timeout(N) })` | MCP SDK 1.x | Phase 65 uses old style; Phase 66 should switch to native option support. Already verified in shared/protocol.d.ts. |

**Deprecated/outdated:**
- `MultipleSubgraphsError` (no longer thrown in 1.x) [CITED: errors.d.ts]
- `messageModifier`/`stateModifier` on createReactAgent (use `prompt`)
- `agent_executor`, `chat_agent_executor` legacy modules (still in dist for back-compat)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime, AbortSignal.any | ✓ | ≥22 (per stack lockdown) | — |
| `@langchain/langgraph` | Graph + interrupt + MemorySaver | ✓ | 1.2.8 installed | — |
| `@langchain/core` | BaseChatModel.withStructuredOutput, RunnableConfig.signal | ✓ | 1.1.45 installed | — |
| `zod` | Plan schema | ✓ | 4.3.6 installed | — |
| `@modelcontextprotocol/sdk` | MCP tool calls (signal threading) | ✓ | 1.29.0 installed | — |
| Express | SSE handler | ✓ | 5.2.1 installed | — |
| LM Studio (running, model loaded) | Default backend LLM for planner + executor | (runtime) | ≥0.2.x with /v1 endpoint | If LM Studio is offline, agentic graph errors at planner step. UI shows "Não consegui planejar essa tarefa." (matches UI-SPEC empty-plan copy). |
| Anthropic Claude / Google Gemini | Alternative providers configured by user | (runtime) | API keys in .env | Same fallback as above — provider failures are LLM-call errors, not framework errors. |

**Missing dependencies with no fallback:** None. All needed packages already installed.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 8.x with `@vitest/coverage-v8` |
| Backend config file | `apps/backend-ts/vitest.config.ts` |
| Renderer config file | `apps/desktop/vitest.config.ts` |
| Quick run command (backend) | `pnpm --filter @jarvis/backend-ts test --run agent` |
| Quick run command (renderer) | `pnpm --filter @jarvis/desktop test --run TaskCheckList sendAudioAndHandle` |
| Full backend suite | `pnpm --filter @jarvis/backend-ts test --run` |
| Full renderer suite | `pnpm --filter @jarvis/desktop test --run` |
| Phase gate | Both suites green before `/gsd-verify-work`; manual UAT for AGENT-01..04 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | Multi-step task executes end-to-end without intervention (text path) | integration | `pnpm --filter @jarvis/backend-ts test --run agent/__tests__/graph.e2e.test.ts -t "completes 3-step task end-to-end"` | ❌ Wave 0 |
| AGENT-01 | Multi-step task executes end-to-end without intervention (voice path) | integration | `pnpm --filter @jarvis/desktop test --run voice/__tests__/sendAudioAndHandle.task.test.ts -t "voice command triggers multi-step task"` | ❌ Wave 0 |
| AGENT-02 | Show numbered plan & wait for confirmation | unit | `pnpm --filter @jarvis/backend-ts test --run agent/__tests__/planner.test.ts -t "generates valid Plan from prompt"` | ❌ Wave 0 |
| AGENT-02 | Show numbered plan & wait for confirmation (interrupt) | integration | `pnpm --filter @jarvis/backend-ts test --run agent/__tests__/graph.test.ts -t "interrupts after planner with plan-confirmation"` | ❌ Wave 0 |
| AGENT-02 | Plan rendered as TaskCheckList with 3 buttons | unit (renderer) | `pnpm --filter @jarvis/desktop test --run chat/__tests__/TaskCheckList.test.ts -t "renders State 1 with Confirmar/Editar/Cancelar"` | ❌ Wave 0 |
| AGENT-03 | Real-time progress in chat (per step events) | integration | `pnpm --filter @jarvis/backend-ts test --run agent/__tests__/graph.test.ts -t "emits task:step:start and task:step:end in order"` | ❌ Wave 0 |
| AGENT-03 | Orb badge updates per step | unit (renderer) | `pnpm --filter @jarvis/desktop test --run components/Orb/__tests__/Orb.agent.test.ts -t "shows AGENT 3/7 badge during executing"` | ❌ Wave 0 |
| AGENT-04 | Cancel gate stops between steps | integration | `pnpm --filter @jarvis/backend-ts test --run agent/__tests__/graph.test.ts -t "cancelRequested halts execution at next step boundary"` | ❌ Wave 0 |
| AGENT-04 | AbortSignal threads through MCP tool | unit | `pnpm --filter @jarvis/backend-ts test --run mcp/client/__tests__/tool-adapter.signal.test.ts -t "callTool receives signal from runConfig"` | ❌ Wave 0 |
| AGENT-04 | AbortSignal threads through request_file_action | unit | `pnpm --filter @jarvis/backend-ts test --run session/__tests__/request-file-action.signal.test.ts -t "fetch receives composed signal"` | ❌ Wave 0 |
| AGENT-04 | Voice "cancela" short-circuits during executing | unit (renderer) | `pnpm --filter @jarvis/desktop test --run voice/__tests__/sendAudioAndHandle.task.test.ts -t "cancela keyword triggers cancelTask"` | ❌ Wave 0 |
| AGENT-04 | No new task:step:end emitted after cancel | integration | `pnpm --filter @jarvis/backend-ts test --run agent/__tests__/graph.test.ts -t "no further events after cancel except task:cancelled"` | ❌ Wave 0 |
| AGENT-04 (manual) | Real LM Studio + real PC tools cancel mid-execution | manual UAT | `/gsd-human-verify-phase` checklist | UAT only |
| AGENT-02 (manual) | TTS sumário pt-BR é compreensível | manual UAT | `/gsd-human-verify-phase` checklist | UAT only |

### Sampling Rate

- **Per task commit:** quick run command (`agent` filter for backend, `TaskCheckList sendAudioAndHandle Orb.agent` for renderer)
- **Per wave merge:** full backend suite + full renderer suite
- **Phase gate:** Full suites green + manual UAT for AGENT-01 (multi-step), AGENT-02 (TTS sumário), AGENT-04 (real cancel mid-execution)

### Wave 0 Gaps

All test files are NEW — Phase 66 introduces a brand new module (`apps/backend-ts/src/agent/`) and modifies frontend components, so existing test suites cover none of the new behavior. Wave 0 deliverables:

- [ ] `apps/backend-ts/src/agent/__tests__/planner.test.ts` — schema validation, withStructuredOutput integration, edit-feedback prompt building
- [ ] `apps/backend-ts/src/agent/__tests__/executor.test.ts` — cancel-gate ordering, AbortSignal propagation, step-failure interrupt path
- [ ] `apps/backend-ts/src/agent/__tests__/graph.test.ts` — full graph: plan → interrupt → resume → executor → done. Includes cancel-gate test, edit-loop test, step-failure-replan test
- [ ] `apps/backend-ts/src/agent/__tests__/graph.e2e.test.ts` — end-to-end with real (mocked) LLM and 2-step task
- [ ] `apps/backend-ts/src/agent/__tests__/keywords.test.ts` — Portuguese keyword matching edge cases
- [ ] `apps/backend-ts/src/mcp/client/__tests__/tool-adapter.signal.test.ts` — verify Phase 65 adapter passes signal correctly
- [ ] `apps/backend-ts/src/session/__tests__/request-file-action.signal.test.ts` — verify composed signal hits fetch
- [ ] `apps/backend-ts/src/routes/__tests__/tasks.test.ts` — POST /resume/cancel endpoints
- [ ] `apps/desktop/src/renderer/src/chat/__tests__/TaskCheckList.test.ts` — all 8 visual states, button wiring, ARIA roles
- [ ] `apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.task.test.ts` — keyword short-circuit during active task
- [ ] `apps/desktop/src/renderer/components/Orb/__tests__/Orb.agent.test.ts` — agentBadgeText prop renders + reverts on undefined
- [ ] Mock fixture: `apps/backend-ts/src/agent/__tests__/fixtures/mockChatModel.ts` — implements BaseChatModel with deterministic withStructuredOutput response (mirror of existing mockChatModel pattern in Phase 36 extractor.test.ts)

**No new test framework install needed.** Vitest infrastructure already in place; just new files under existing config.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local backend; existing Bearer auth in `/api/chat` already applies to new endpoints |
| V3 Session Management | yes | New POST /api/tasks/:id/resume + /cancel — must validate `taskId` is owned by current chatSession (prevent cross-task tampering). Single-user, but defense in depth: regex-validate UUID format, reject if controller for that taskId is not in `activeControllers` Map. |
| V4 Access Control | yes | `taskId` is a UUID — externally unguessable. Combined with single-user backend, sufficient. |
| V5 Input Validation | yes | All POST bodies validated via Zod (`ResumeRequest` discriminated union). Plan content from LLM also Zod-validated. UI-SPEC `feedback` field max length enforce (currently UI-SPEC has no max — researcher recommends `z.string().max(500)`). |
| V6 Cryptography | no | No crypto operations introduced. AbortSignal/UUID are not cryptographic primitives. |

### Known Threat Patterns for Node.js + Express + LangGraph stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection in plan edit feedback ("ignore previous instructions, do X") | Tampering | Edit feedback is appended to the planner system prompt — already passes through the LLM's natural prompt-injection resistance. NOT executed as code. Researcher rates LOW risk for single-user local. Document in CONTEXT for awareness; no code change beyond max length cap. |
| Path traversal via tool args inside a task | Tampering | Existing `isPathValid` in Phase 54 still applies — tools wrap their own args validation. Phase 66 doesn't change tool surface. |
| MemorySaver leak from abandoned threads | DoS (local) | MVP: documented limitation. v3.1+: TTL sweeper. |
| AbortController leak (Map<taskId, controller> grows) | DoS (local) | Cleanup in route handler `finally` blocks: `activeControllers.delete(taskId)` after stream drains or cancel completes. |
| Tool runtime errors revealing internal paths in `task:error.message` | Info Disclosure | Existing `request_file_action` already returns pt-BR error strings without raw stack traces. MCP adapter error path also pt-BR. Researcher: keep current error redaction. |
| SSE connection used by malicious local process | Spoofing | Bearer token auth on existing `/api/chat/stream` extends to new endpoints. No new attack surface. |

## Sources

### Primary (HIGH confidence — all verified locally or in installed `.d.ts`)
- `apps/backend-ts/node_modules/@langchain/langgraph/dist/index.d.ts` — exports of StateGraph, Annotation, MemorySaver, interrupt, Command, isGraphInterrupt, MessagesAnnotation
- `apps/backend-ts/node_modules/@langchain/langgraph/dist/interrupt.d.ts` — interrupt() signature + JSDoc warning about try/catch
- `apps/backend-ts/node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.d.ts` — createReactAgent signature, `@deprecated` JSDoc note pointing to `langchain` package
- `apps/backend-ts/node_modules/@langchain/langgraph/dist/graph/state.d.ts` — StateGraph + Annotation usage example in JSDoc
- `apps/backend-ts/node_modules/@langchain/langgraph/dist/pregel/types.d.ts` — StreamMode, PregelOptions.signal, StreamOutputMap
- `node_modules/.pnpm/@langchain+langgraph-checkpoint@1.0.1/.../memory.d.ts` — MemorySaver class, `deleteThread(threadId)` method
- `apps/backend-ts/node_modules/@langchain/core/dist/runnables/types.d.ts` — `RunnableConfig.signal: AbortSignal`
- `apps/backend-ts/node_modules/@langchain/core/dist/tools/types.d.ts` — `ToolRunnableConfig` (signal flows through)
- `apps/backend-ts/node_modules/@langchain/core/dist/language_models/base.d.ts` — `withStructuredOutput` overloads for Zod v3, v4, JSON Schema
- `node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0/.../shared/protocol.d.ts` — `RequestOptions.signal: AbortSignal`
- `apps/backend-ts/src/session/chat-session.ts` (lines 195-220, 240-280) — `allTools` composition, `createReactAgent` instantiation, `swapLLM` rebuild path
- `apps/backend-ts/src/session/system-prompt.ts` — pt-BR system prompt (planner inherits)
- `apps/backend-ts/src/session/tool-dispatch.ts` — DispatchContext shape (Phase 66 extends with signal)
- `apps/backend-ts/src/routes/chat.ts` (lines 50-100) — current `/api/chat/stream` SSE handler (Phase 66 extends)
- `apps/backend-ts/src/memory/extractor.ts` (lines 80-114) — proven pattern for `withStructuredOutput` + Zod
- `apps/backend-ts/src/memory/embedding-queue.ts` — proven pattern for AbortController per-task Map
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` (lines 39-63) — `abortActiveStreamingTurn` Phase 53 cancellation pattern
- `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` — pre-LLM short-circuit hook target
- `apps/desktop/src/main/voiceMode/index.ts` — VoiceModeManager state machine

### Secondary (MEDIUM confidence — verified in official 1.x docs accessed during research)
- [LangGraph Interrupts (LangChain 1.x JS docs)](https://docs.langchain.com/oss/javascript/langgraph/interrupts) — canonical `interrupt()` + `Command(resume)` + `thread_id` pattern with full TypeScript example
- [LangGraph Streaming (1.x JS docs)](https://docs.langchain.com/oss/javascript/langgraph/streaming) — `streamMode: ['messages', 'custom']` array tuple pattern
- [LangGraph Persistence (1.x JS docs)](https://docs.langchain.com/oss/javascript/langgraph/persistence) — MemorySaver suitable for development; production use Postgres/Mongo/Redis (we stay MemorySaver per D-03)
- [GitHub langchain-ai/langgraphjs/issues/1422](https://github.com/langchain-ai/langgraphjs/issues/1422) — confirms `__interrupt__` surfaces in `stream()` output, less so in `invoke()`. Use `getState()` after stream as canonical detection.
- [LangChain JS v1 overview (post-1.0 redirect)](https://docs.langchain.com/oss/javascript/langchain/overview) — `withStructuredOutput` documentation (page redirects from `js.langchain.com/docs/how_to/structured_output`)
- [npm view @langchain/langgraph](https://www.npmjs.com/package/@langchain/langgraph) — current 1.3.0; we have 1.2.8 (very recent)

### Tertiary (LOW confidence — flagged for verify-work)
- LM Studio + small/quantized model handling of `withStructuredOutput` reliability — [ASSUMED based on training] needs runtime verification with the user's actual model
- LangGraph 1.2.8 API stability through Phase 67 — package is on 1.x stable line; minor bumps unlikely to break, but no guarantee. Pin to 1.2.8 in package.json for Phase 66's life.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | LM Studio with mid-size models (7B Q4) reliably returns valid JSON for `planSchema.withStructuredOutput` calls | Patterns § Pattern 1 | If unreliable, planner fails frequently; UI shows "Não consegui planejar essa tarefa." — fallback works but UX degraded. Mitigation: log raw LLM output for debugging in dev mode + manual UAT with user's actual model. |
| A2 | Planner-first routing on every turn adds <2s latency for trivial requests on default user setup | Patterns § Pattern 5 | If too slow, chat becomes laggy. Mitigation: regex pre-classifier as env-flag escape hatch documented in Pattern 5. |
| A3 | LangGraph 1.2.8 doesn't ship a regression in `interrupt()` between minor versions | Standard Stack | Lock package.json to `1.2.8` for the phase. If 1.2.8 breaks during phase, fall back to last known-good. Verified by reading actual `.d.ts` shipped with installed version. |
| A4 | Voice keyword list pt-BR (UI-SPEC §Cancel/Confirm/Edit) covers ≥80% of natural utterances | Patterns § Pattern 8 | If <80%, users feel "stuck" trying to cancel by voice. Mitigation: log all attempted utterances during executing/awaiting-confirmation state in dev mode; iterate keyword list post-MVP. |
| A5 | Single-system-message pattern (Phase 66 prepends per-step SystemMessage to existing JARVIS SYSTEM_PROMPT) works on Anthropic + Gemini without warnings/errors | Pitfall 5 | If Anthropic rejects, must use createReactAgent's `prompt: (state) => Messages` callback for per-step injection. ~30 min refactor. |
| A6 | `@xenova/transformers` v2.17.2 (used in embeddings only) is irrelevant to Phase 66 — does NOT block agentic graph since plan/executor LLM calls go through `BaseChatModel` (LM Studio/Anthropic/Gemini), not Transformers.js | Standard Stack | Confirmed by reading chat-session.ts — only `embed_text` uses Transformers.js. No risk. |
| A7 | Single-user single-task scope means no concurrency issues with shared MemorySaver | Pitfall 6 | If a future change makes concurrent tasks possible, MemorySaver shared instance would need locking or per-session instances. Document in code; assert in tests via single-task-at-a-time guard. |

**If this table looks long:** A1, A2, A4 are the highest-risk assumptions and should be addressed in `/gsd-discuss-phase` validation or specifically tested during manual UAT in `/gsd-human-verify-phase`.

## Open Questions (RESOLVED)

1. **Should the planner-first overhead apply to streaming sends only, or both `send()` and `sendStream()`?**
   - What we know: chat.ts has both `/chat` (non-streaming, returns full text) and `/chat/stream` (token streaming, voice path). Voice goes through `/chat` today (`voiceHandler.ts:199`).
   - What's unclear: planner pre-call stalls voice perceptibly. For voice, faster TTFT may matter more than for chat-text.
   - Recommendation: enable planner-first on BOTH. If voice latency is felt during UAT, regex pre-classifier on voice path before sending to backend.

2. **Where in `chat-session.ts` does the `_agenticEnabled` flag come from?**
   - What we know: D-02 says "boot silencioso" pattern from Phase 60/65 — env flag `AGENTIC_DISABLED=true` for debug.
   - What's unclear: who reads it — module-level constant, store value, or option to `ChatSession.create`?
   - Recommendation: env-only constant `AGENTIC_DISABLED` (default unset = enabled). No store, no per-session toggle. Matches Phase 60 pattern.

3. **Should `executor` node use the full `chat-session._agent` (which has SYSTEM_PROMPT) or a reduced agent without recall_memory?**
   - What we know: D-04 says "executor reuses createReactAgent atual de chat-session.ts:206 — sem modificação estrutural".
   - What's unclear: recall_memory inside a task is potentially redundant (the planner already saw user history); could waste a tool call.
   - Recommendation: reuse the full agent. recall_memory is rarely chosen by the LLM mid-task; cost is minimal. Don't optimize prematurely.

4. **What if planner returns 16+ steps despite the `max(15)` constraint?**
   - What we know: Zod `.max(15)` rejects, throws OutputParserException.
   - What's unclear: should we retry the planner with a stricter prompt, or just fall back to the synthetic empty-plan?
   - Recommendation: 1 retry with a stricter prompt ("Reduza para no máximo 15 passos. O plano anterior tinha N passos."), then synthetic empty-plan on second failure.

5. **Should the `task:awaiting-confirmation` SSE keep the connection open or close it?**
   - What we know: Pattern 6 recommends close + new SSE on resume.
   - What's unclear: keeping it open is simpler in some ways (single connection per task lifetime).
   - Recommendation: CLOSE the SSE after each interrupt — simpler connection management, easier to reason about. Frontend opens new SSE on POST /resume response stream.

## Metadata

**Confidence breakdown:**
- Standard stack & versions: HIGH — all read directly from installed `node_modules/.../*.d.ts` and `package.json`; npm view confirmed currency
- LangGraph patterns (StateGraph, Annotation, interrupt, Command, MemorySaver): HIGH — verified in installed `.d.ts` + cross-checked with official 1.x docs
- `withStructuredOutput` + Zod: HIGH — proven by Phase 36 extractor.ts in production; type signature verified in `@langchain/core@1.1.45`
- AbortSignal threading through createReactAgent and tools: HIGH — type signatures verified; opt-in pattern is industry standard for Node fetch
- SSE event extension protocol: HIGH — Phase 53/60 already proved the pattern; just adding new event names
- MemorySaver lifecycle (deleteThread): HIGH — verified in `dist/memory.d.ts`
- Voice cancel keyword detection: HIGH — UI-SPEC locks the keyword list; pattern is straightforward
- Streaming + interrupt interaction details: MEDIUM — `__interrupt__` surfacing in `invoke()` vs `stream()` was clarified via [GitHub issue #1422](https://github.com/langchain-ai/langgraphjs/issues/1422); recommend canonical `getState()` post-stream
- LM Studio reliability with `withStructuredOutput` for plan generation: LOW — flagged in Assumptions A1; needs UAT with user's specific model
- Planner-first latency impact on voice UX: LOW — flagged in A2; verify in UAT

**Research date:** 2026-05-09
**Valid until:** ~2026-06-09 (30 days). LangGraph 1.x is stable; minor version bumps within 1.x line are unlikely to invalidate this research. If LangGraph 2.0 ships before Phase 66 ships, re-validate `interrupt`/`Command` API.
