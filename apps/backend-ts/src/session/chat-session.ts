/**
 * ChatSession — skeleton (Plan 17-01).
 *
 * Port mínimo do `ChatSession` de `src/jarvis/core/session.py`:
 *  - mantém `history: BaseMessage[]` em memória, iniciando com SystemMessage(SYSTEM_PROMPT)
 *  - chama `llm.invoke(history)` direto (sem agent, sem streaming, sem tools)
 *  - persiste o turn via `MemoryManager.saveTurn()` após receber a resposta
 *
 * Async constructor é evitado via factory estático `ChatSession.create()`, que resolve
 * `memory.startConversation()` antes de construir a instância. O constructor é privado.
 *
 * Agent runtime, streaming SSE e a tool `recall_memory` chegam nos Planos 17-02/03/04.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';

import type { MemoryManager } from '../memory/index.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

export interface ChatSessionOptions {
  llm: BaseChatModel;
  memory: MemoryManager;
}

export class ChatSession {
  public readonly history: BaseMessage[];
  private readonly llm: BaseChatModel;
  private readonly memory: MemoryManager;
  private readonly _convId: number | null;

  private constructor(llm: BaseChatModel, memory: MemoryManager, convId: number | null) {
    this.llm = llm;
    this.memory = memory;
    this._convId = convId;
    this.history = [new SystemMessage(SYSTEM_PROMPT)];
  }

  /**
   * Factory assíncrono — resolve `memory.startConversation()` antes de construir.
   * Use SEMPRE este método ao invés de `new ChatSession(...)` (constructor é privado).
   */
  static async create(opts: ChatSessionOptions): Promise<ChatSession> {
    const convId = await opts.memory.startConversation();
    return new ChatSession(opts.llm, opts.memory, convId);
  }

  /**
   * Envia uma mensagem do usuário para o LLM e retorna a resposta como string.
   *
   * Fluxo:
   *   1. Append HumanMessage em `history`.
   *   2. Chama `llm.invoke(history)`.
   *   3. Append AIMessage em `history`.
   *   4. Persiste o turn via `memory.saveTurn()` se houver `_convId`.
   *   5. Retorna o conteúdo da AIMessage como string.
   *
   * Falhas em `saveTurn()` são logadas mas não propagadas — paridade com o Python,
   * que também degrada graciosamente quando a camada de memória falha.
   */
  async send(text: string): Promise<string> {
    this.history.push(new HumanMessage(text));

    const aiMessage = await this.llm.invoke(this.history);
    this.history.push(aiMessage);

    const assistantText = String(aiMessage.content ?? '');

    if (this._convId !== null) {
      try {
        await this.memory.saveTurn(this._convId, text, assistantText);
      } catch (exc) {
        console.warn(`ChatSession.send: saveTurn falhou: ${(exc as Error).message}`);
      }
    }

    return assistantText;
  }
}
