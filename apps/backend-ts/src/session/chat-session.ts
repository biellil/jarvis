/**
 * ChatSession — Plan 17-02.
 *
 * Refactor: `send()` agora passa pelo agent ReAct (`createReactAgent` de
 * `@langchain/langgraph/prebuilt`) ao invés de chamar `llm.invoke()` direto. O agente
 * fica armado com uma tool real — `recall_memory` — e decide sozinho quando puxar
 * contexto do `MemoryManager`. Isso exercita o loop Reason→Act→Observe ponta-a-ponta,
 * e a partir da Fase 18 basta empurrar mais tools no array para habilitar PC actions.
 *
 * Divergência consciente vs Python (D-Q4=4b ↔ D-Q5=5a): o backend Python injeta memória
 * determinístico no system prompt; aqui delegamos ao agente via tool calling. Documentado
 * no 17-CONTEXT. Request/response externos continuam idênticos.
 *
 * Histórico: `this.history` passa a refletir `result.messages` devolvido pelo agent —
 * inclui SystemMessage, HumanMessage, AIMessage com tool_calls, ToolMessage de observação
 * e AIMessage final. Dessa forma a próxima chamada a `send()` já tem o ciclo anterior
 * inteiro como contexto, e o agent não "esquece" que uma tool foi chamada.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { MemoryManager } from '../memory/index.js';
import { ToolLogger } from '../memory/store.js';
import { createAllPcTools } from './pc-tools.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import {
  wrapAllPcTools,
  type DispatchContext,
  type OnToolDispatched,
} from './tool-dispatch.js';
import { createRecallMemoryTool } from './tools.js';

export interface ChatSessionOptions {
  llm: BaseChatModel;
  memory: MemoryManager;
  /** Opcional — se omitido, uma `ToolLogger` default é instanciada. */
  toolLogger?: ToolLogger;
}

/** Box mutável para listener injetável por-request. */
interface ListenerBox {
  current: OnToolDispatched | null;
}

/** Contrato mínimo do agent retornado por `createReactAgent` que realmente usamos. */
interface ReactAgentLike {
  invoke(input: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }>;
  stream(
    input: { messages: BaseMessage[] },
    config: { streamMode: 'messages' },
  ): AsyncIterable<[unknown, Record<string, unknown>]>;
}

export class ChatSession {
  public history: BaseMessage[];
  private readonly llm: BaseChatModel;
  private readonly memory: MemoryManager;
  private readonly _convId: number | null;
  private readonly _agent: ReactAgentLike;
  private readonly _toolLogger: ToolLogger;
  private readonly _listenerBox: ListenerBox;

  private constructor(
    llm: BaseChatModel,
    memory: MemoryManager,
    convId: number | null,
    agent: ReactAgentLike,
    toolLogger: ToolLogger,
    listenerBox: ListenerBox,
  ) {
    this.llm = llm;
    this.memory = memory;
    this._convId = convId;
    this._agent = agent;
    this._toolLogger = toolLogger;
    this._listenerBox = listenerBox;
    this.history = [new SystemMessage(SYSTEM_PROMPT)];
  }

  /** Audit logger usado para dispatches e reconciliação (plano 18-05). */
  get toolLogger(): ToolLogger {
    return this._toolLogger;
  }

  /**
   * Factory assíncrono — resolve `memory.startConversation()` e constrói o agent ReAct
   * uma única vez, antes de devolver a instância.
   */
  static async create(opts: ChatSessionOptions): Promise<ChatSession> {
    const convId = await opts.memory.startConversation();
    const toolLogger = opts.toolLogger ?? new ToolLogger();
    const recallMemoryTool = createRecallMemoryTool(opts.memory);

    // Listener box compartilhado entre a instância e o wrapper — permite ao router
    // SSE do plano 18-04 injetar o listener por-request sem recriar a ChatSession.
    const listenerBox: ListenerBox = { current: null };
    const ctx: DispatchContext = {
      logger: toolLogger,
      getListener: () => listenerBox.current,
    };
    const pcToolsWrapped = wrapAllPcTools(
      createAllPcTools() as unknown as Parameters<typeof wrapAllPcTools>[0],
      ctx,
    );

    const agent = createReactAgent({
      llm: opts.llm,
      tools: [recallMemoryTool, ...pcToolsWrapped],
      prompt: SYSTEM_PROMPT,
    }) as unknown as ReactAgentLike;
    return new ChatSession(opts.llm, opts.memory, convId, agent, toolLogger, listenerBox);
  }

  /**
   * Registra um callback que é invocado toda vez que uma das 9 PC tools é
   * dispatchada pelo agent. Usado pelo router SSE para emitir `event: action`
   * por-request. Apenas um listener ativo por vez — chamar novamente substitui.
   */
  setDispatchListener(fn: OnToolDispatched): void {
    this._listenerBox.current = fn;
  }

  /** Remove o listener ativo. Normalmente chamado no `finally` do request. */
  clearDispatchListener(): void {
    this._listenerBox.current = null;
  }

  /**
   * Envia uma mensagem do usuário através do agent ReAct e retorna a resposta final.
   *
   * Fluxo:
   *   1. Append HumanMessage em `history`.
   *   2. `await this._agent.invoke({ messages: this.history })`.
   *   3. `this.history = result.messages` — inclui toda a cadeia ReAct (tool_calls + ToolMessage).
   *   4. Extrai a última AIMessage como texto final.
   *   5. Persiste o turn via `memory.saveTurn()` (try/catch, warn-only).
   *   6. Retorna o texto final.
   */
  async send(text: string): Promise<string> {
    this.history.push(new HumanMessage(text));

    const result = await this._agent.invoke({ messages: this.history });
    this.history = result.messages;

    // Debug: log agent response structure
    const lastMsgs = result.messages.slice(-3);
    for (const m of lastMsgs) {
      const tc = (m as AIMessage).tool_calls;
      console.log(`[agent-debug] ${m.constructor.name}: content=${JSON.stringify(String(m.content).slice(0, 200))} tool_calls=${tc ? JSON.stringify(tc.map((t: { name: string }) => t.name)) : 'none'}`);
    }

    const finalText = extractFinalAiText(result.messages);

    if (this._convId !== null) {
      try {
        await this.memory.saveTurn(this._convId, text, finalText);
      } catch (exc) {
        console.warn(`ChatSession.send: saveTurn falhou: ${(exc as Error).message}`);
      }
    }

    return finalText;
  }

  /**
   * Stream tokens um a um via `llm.stream()` (paridade com Python `send_stream`,
   * `src/jarvis/core/session.py:347-437`). Divergência consciente: NÃO passa pelo agent
   * ReAct — sem tool calling no modo streaming. Per D-02: não imprime em stdout.
   *
   * Fluxo:
   *   1. Append HumanMessage em `history` ANTES do stream (messages passadas ao llm incluem ela).
   *   2. for await sobre `this.llm.stream(this.history)` — acumula chunks não-vazios.
   *   3. Após drain bem-sucedido: append AIMessage(assembled) + `memory.saveTurn()`.
   *   4. Se o stream falhar: erro propaga naturalmente, history fica com HumanMessage mas sem
   *      AIMessage final, e saveTurn NÃO é chamado (resposta incompleta).
   */
  async *sendStream(text: string): AsyncGenerator<string, void, unknown> {
    this.history.push(new HumanMessage(text));

    let assembled = '';
    // Plan 18-04: passa pelo agent ReAct em vez de llm.stream() direto.
    // streamMode 'messages' emite tuplas [message, metadata] onde message pode ser
    // AIMessageChunk (token incremental), ToolMessage (observação), etc. Filtramos
    // apenas AIMessageChunk não-vazio para yield tokens. Tool calls disparam o
    // listener de dispatch automaticamente via wrapAllPcTools (plano 18-03).
    const agentStream = this._agent.stream(
      { messages: this.history },
      { streamMode: 'messages' },
    );

    for await (const [msg] of agentStream) {
      if (!msg || typeof msg !== 'object') continue;
      const ctorName = (msg as { constructor?: { name?: string } }).constructor?.name;
      if (ctorName !== 'AIMessageChunk') continue;
      const content = (msg as { content?: unknown }).content;
      const token = typeof content === 'string' ? content : '';
      if (token) {
        assembled += token;
        yield token;
      }
    }

    // Trade-off documentado (18-04): o history pós-stream só guarda a AIMessage final
    // montada dos chunks — não preserva ToolMessages internos nem tool_calls. O audit
    // log SQLite (tool_calls table) é a fonte da verdade para invocações durante stream.
    this.history.push(new AIMessage(assembled));

    if (this._convId !== null) {
      try {
        await this.memory.saveTurn(this._convId, text, assembled);
      } catch (exc) {
        console.warn(`ChatSession.sendStream: saveTurn falhou: ${(exc as Error).message}`);
      }
    }
  }
}

/**
 * Percorre `messages` de trás pra frente procurando a última `AIMessage` sem `tool_calls`
 * pendentes — ou seja, a resposta final do agente ao usuário.
 */
function extractFinalAiText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m instanceof AIMessage) {
      const toolCalls = (m as AIMessage).tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return String(m.content ?? '');
      }
    }
  }
  return '';
}
