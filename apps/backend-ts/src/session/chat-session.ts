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
import { SYSTEM_PROMPT } from './system-prompt.js';
import { createRecallMemoryTool } from './tools.js';

export interface ChatSessionOptions {
  llm: BaseChatModel;
  memory: MemoryManager;
}

/** Contrato mínimo do agent retornado por `createReactAgent` que realmente usamos. */
interface ReactAgentLike {
  invoke(input: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }>;
}

export class ChatSession {
  public history: BaseMessage[];
  private readonly llm: BaseChatModel;
  private readonly memory: MemoryManager;
  private readonly _convId: number | null;
  private readonly _agent: ReactAgentLike;

  private constructor(
    llm: BaseChatModel,
    memory: MemoryManager,
    convId: number | null,
    agent: ReactAgentLike,
  ) {
    this.llm = llm;
    this.memory = memory;
    this._convId = convId;
    this._agent = agent;
    this.history = [new SystemMessage(SYSTEM_PROMPT)];
  }

  /**
   * Factory assíncrono — resolve `memory.startConversation()` e constrói o agent ReAct
   * uma única vez, antes de devolver a instância.
   */
  static async create(opts: ChatSessionOptions): Promise<ChatSession> {
    const convId = await opts.memory.startConversation();
    const recallMemoryTool = createRecallMemoryTool(opts.memory);
    const agent = createReactAgent({
      llm: opts.llm,
      tools: [recallMemoryTool],
      prompt: SYSTEM_PROMPT,
    }) as unknown as ReactAgentLike;
    return new ChatSession(opts.llm, opts.memory, convId, agent);
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
