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
import { MemoryExtractor } from '../memory/extractor.js';
import type { Extraction } from '../memory/extractor.js';
import { createAllPcTools } from './pc-tools.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import {
  wrapAllPcTools,
  type DispatchContext,
  type OnToolDispatched,
} from './tool-dispatch.js';
import { createRecallMemoryTool } from './tools.js';
import { createRequestFileActionTool, type ClientIdRef } from './request-file-action.js';
import { embeddingQueue } from '../memory/embedding-queue.js';
import { createAnalyzeScreenTool, type CaptureScreenFn } from './vision-tool.js';
import type { CapabilityMatrix } from '../llm/capabilities.js';
import { providerHasVision } from '../llm/capabilities.js';
import { mcpManager } from '../mcp/client/manager.js';

export interface ChatSessionOptions {
  llm: BaseChatModel;
  memory: MemoryManager;
  /** Opcional — se omitido, uma `ToolLogger` default é instanciada. */
  toolLogger?: ToolLogger;
  /** Phase 55 (D-10): clientId do Electron para a LangGraph tool request_file_action.
   *  Se omitido, a tool não é registrada (graceful degradation). */
  clientId?: string;
  /** Phase 63 (D-02): capability matrix for live vision check. Required to enable analyze_screen tool. */
  capabilities?: CapabilityMatrix;
  /** Phase 63 (D-02): active LLM provider name for vision check. Default: 'lmstudio'. */
  activeProvider?: string;
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
  private llm: BaseChatModel;
  private readonly memory: MemoryManager;
  private readonly _convId: number | null;
  private _agent: ReactAgentLike;
  private readonly _toolLogger: ToolLogger;
  private readonly _listenerBox: ListenerBox;
  private readonly _clientIdRef: ClientIdRef;
  private readonly _captureScreenFn: CaptureScreenFn | null;
  private readonly _capabilities: CapabilityMatrix;
  private _activeProvider: string;

  private constructor(
    llm: BaseChatModel,
    memory: MemoryManager,
    convId: number | null,
    agent: ReactAgentLike,
    toolLogger: ToolLogger,
    listenerBox: ListenerBox,
    clientIdRef: ClientIdRef,
    captureScreenFn: CaptureScreenFn | null,
    capabilities: CapabilityMatrix,
    activeProvider: string,
    rehydratedHistory: BaseMessage[] = [],
  ) {
    this.llm = llm;
    this.memory = memory;
    this._convId = convId;
    this._agent = agent;
    this._toolLogger = toolLogger;
    this._listenerBox = listenerBox;
    this._clientIdRef = clientIdRef;
    this._captureScreenFn = captureScreenFn;
    this._capabilities = capabilities;
    this._activeProvider = activeProvider;
    this.history = [new SystemMessage(SYSTEM_PROMPT), ...rehydratedHistory];
  }

  /** Audit logger usado para dispatches e reconciliação (plano 18-05). */
  get toolLogger(): ToolLogger {
    return this._toolLogger;
  }

  /**
   * Factory assíncrono — resolve a conversa persistente (reuso entre restarts via
   * `memory.getOrCreateConversation()`), reidrata `this.history` com as últimas N mensagens
   * persistidas, e constrói o agent ReAct uma única vez antes de devolver a instância.
   *
   * Rehydration: as últimas REHYDRATION_LIMIT (50) mensagens com role IN ('user','assistant')
   * são convertidas em HumanMessage/AIMessage e prefixadas após o SystemMessage. SystemMessage
   * do prompt nunca é reidratado do banco — o filtro está em `MemoryStore.getRecentMessages()`.
   *
   * Se a tabela `messages` estiver vazia (fresh start ou primeira execução), `rehydrated` é
   * `[]` e nenhum log de rehydration é emitido — comportamento original preservado.
   */
  static async create(opts: ChatSessionOptions): Promise<ChatSession> {
    const convId = await opts.memory.getOrCreateConversation();
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

    // Rehydration do history a partir do SQLite. Hardcoded por enquanto — vira env var
    // opcional se virar dor (ver SUMMARY.md > Próximos passos).
    const REHYDRATION_LIMIT = 50;
    const rehydrated: BaseMessage[] = [];
    if (convId !== null) {
      const rows = opts.memory.getRecentMessages(convId, REHYDRATION_LIMIT);
      for (const row of rows) {
        if (row.role === 'user') {
          rehydrated.push(new HumanMessage(row.content));
        } else if (row.role === 'assistant') {
          rehydrated.push(new AIMessage(row.content));
        }
        // role === 'system' nunca chega aqui — getRecentMessages já filtra. Defensivo: ignora.
      }
      if (rehydrated.length > 0) {
        console.log(
          `[ChatSession] ♻️  rehydrated ${rehydrated.length} messages from convId=${convId}`,
        );
      }
    }

    // Phase 55 (LACT-01..05): request_file_action tool — always registered.
    // clientId is injected dynamically via setClientId() before each request (D-10).
    // Per D-11: direct execution tool, NOT wrapped via wrapAllPcTools.
    const clientIdRef: ClientIdRef = { value: opts.clientId ?? '' };

    const capabilities = opts.capabilities ?? {};
    const activeProvider = opts.activeProvider ?? 'lmstudio';

    // Phase 63: captureScreenFn created inline — uses same clientIdRef as request_file_action
    const captureScreenFn: CaptureScreenFn = async () => {
      const clientId = clientIdRef.value;
      if (!clientId) return { success: false, error: 'CLIENT_ID_NOT_SET' };
      try {
        const raw = process.env['GATEWAY_URL'] ?? 'http://localhost:3000';
        const gatewayUrl = raw.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
        const resp = await fetch(`${gatewayUrl}/internal/capture-screen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-jarvis-client-id': clientId },
          signal: AbortSignal.timeout(5_000),
        });
        if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
        return (await resp.json()) as { success: true; base64: string } | { success: false; error: string };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    };

    // Phase 65 (MCP-CLI-02 D-11): spread external MCP tools as a snapshot.
    // mcpManager.getTools() is synchronous and returns [] when manager is disconnected.
    // The active ReAct agent keeps this snapshot — reload mid-turn does NOT rebuild (D-11).
    const allTools = [
      recallMemoryTool,
      ...pcToolsWrapped,
      createRequestFileActionTool(clientIdRef),
      ...mcpManager.getTools(),
    ];

    const agent = createReactAgent({
      llm: opts.llm,
      tools: allTools,
      prompt: SYSTEM_PROMPT,
    }) as unknown as ReactAgentLike;
    return new ChatSession(
      opts.llm,
      opts.memory,
      convId,
      agent,
      toolLogger,
      listenerBox,
      clientIdRef,
      opts.capabilities ? captureScreenFn : null,
      capabilities,
      activeProvider,
      rehydrated,
    );
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
   * Swap the active LLM while preserving conversation history.
   * Must be called under SessionLock to prevent race with in-flight send().
   *
   * Per D-02 (Phase 57): history and memory are preserved. Only llm and _agent
   * are replaced. The next send() call will use newLlm with the existing history.
   */
  public swapLLM(newLlm: BaseChatModel): void {
    console.log('[ChatSession] Swapping LLM');
    this.llm = newLlm;

    const recallMemoryTool = createRecallMemoryTool(this.memory);
    const pcToolsWrapped = wrapAllPcTools(
      createAllPcTools() as unknown as Parameters<typeof wrapAllPcTools>[0],
      { logger: this._toolLogger, getListener: () => this._listenerBox.current },
    );
    const allTools = [
      recallMemoryTool,
      ...pcToolsWrapped,
      createRequestFileActionTool(this._clientIdRef),
      ...mcpManager.getTools(),  // Phase 65 D-11 — snapshot at swap time
    ];

    if (this._captureScreenFn) {
      allTools.push(
        createAnalyzeScreenTool(
          this._captureScreenFn,
          () => providerHasVision(this._capabilities, this._activeProvider),
        ),
      );
    }

    this._agent = createReactAgent({
      llm: newLlm,
      tools: allTools,
      prompt: SYSTEM_PROMPT,
    }) as unknown as ReactAgentLike;

    console.log('[ChatSession] LLM swapped successfully');
  }

  /** Phase 63: update active provider for live vision capability check. Called by RELOAD_LLM handler. */
  setActiveProvider(provider: string): void {
    this._activeProvider = provider;
  }

  /** Phase 55 (D-10): atualiza o clientId usado pela request_file_action tool por-request. */
  setClientId(id: string): void {
    this._clientIdRef.value = id;
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
  async send(text: string, imageBase64?: string): Promise<string> {
    // Auto-capture screen if user asks about it and no image provided yet
    if (!imageBase64) imageBase64 = await this._tryAutoCapture(text);

    // Build HumanMessage — multimodal if imageBase64 provided
    let humanMessage: HumanMessage;
    if (imageBase64) {
      humanMessage = new HumanMessage({
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          { type: 'text', text },
        ],
      });
    } else {
      humanMessage = new HumanMessage(text);
    }
    this.history.push(humanMessage);

    // D-04: Pause embedding queue before LLM invocation — new embedding tasks will queue
    // but not execute until the LLM response is received. In-flight tasks complete normally
    // (@xenova/transformers v2.17.2 does not support AbortSignal — LLM-PRIO-02).
    embeddingQueue.pause();

    let finalText: string;
    try {
      console.log(`[LLM] ▶ Invoking ReAct agent (convId=${this._convId}, history=${this.history.length} msgs)`);
      const result = await this._agent.invoke({ messages: this.history });
      this.history = result.messages;

      finalText = extractFinalAiText(result.messages);
      console.log(`[LLM] ◀ Response received (convId=${this._convId}, chars=${finalText.length})`);
    } finally {
      // D-04: Resume unconditionally — even if agent.invoke() throws, queue must be resumed
      embeddingQueue.start();
    }

    // D-03: saveTurn is now fire-and-forget — SQLite writes sync inside saveTurn,
    // Chroma embedding is queued (non-blocking to chat response)
    if (this._convId !== null) {
      void this.memory.saveTurn(this._convId, text, finalText);
    }

    // Phase 36 (MEMW-01, REL-01): fire-and-forget memory extraction
    // CRITICAL: void context — never await — extraction must not block message handler
    void this._extractAndWriteMemories(text, finalText);

    // Phase 38 (MSUM-01, MSUM-02): fire-and-forget rolling summarization
    // CRITICAL: void context — nunca aguardar — sumarização não bloqueia pipeline de voz
    void this.memory.runRollingSummarization(this._convId);

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
  async *sendStream(text: string, imageBase64?: string): AsyncGenerator<string, void, unknown> {
    // Auto-capture screen if user asks about it and no image provided yet
    if (!imageBase64) imageBase64 = await this._tryAutoCapture(text);

    // Build HumanMessage — multimodal if imageBase64 provided
    let humanMessage: HumanMessage;
    if (imageBase64) {
      humanMessage = new HumanMessage({
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          { type: 'text', text },
        ],
      });
    } else {
      humanMessage = new HumanMessage(text);
    }
    this.history.push(humanMessage);

    let assembled = '';

    // D-04: Pause embedding queue for duration of streaming LLM response
    embeddingQueue.pause();

    try {
      // Plan 18-04: passa pelo agent ReAct em vez de llm.stream() direto.
      // streamMode 'messages' emite tuplas [message, metadata] onde message pode ser
      // AIMessageChunk (token incremental), ToolMessage (observação), etc. Filtramos
      // apenas AIMessageChunk não-vazio para yield tokens. Tool calls disparam o
      // listener de dispatch automaticamente via wrapAllPcTools (plano 18-03).
      console.log(`[LLM] ▶ Streaming ReAct agent (convId=${this._convId}, history=${this.history.length} msgs)`);
      const agentStream = await this._agent.stream(
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

      console.log(`[LLM] ◀ Stream complete (convId=${this._convId}, chars=${assembled.length})`);
    } finally {
      // D-04: Resume unconditionally after stream drains or if stream errors
      embeddingQueue.start();
    }

    // Trade-off documentado (18-04): o history pós-stream só guarda a AIMessage final
    // montada dos chunks — não preserva ToolMessages internos nem tool_calls. O audit
    // log SQLite (tool_calls table) é a fonte da verdade para invocações durante stream.
    this.history.push(new AIMessage(assembled));

    // D-03: saveTurn fire-and-forget — SQLite sync, Chroma queued
    if (this._convId !== null) {
      void this.memory.saveTurn(this._convId, text, assembled);
    }

    // Phase 36 (MEMW-01, REL-01): fire-and-forget memory extraction (after stream drains)
    void this._extractAndWriteMemories(text, assembled);

    // Phase 38 (MSUM-01, MSUM-02): fire-and-forget rolling summarization (after stream drains)
    // CRITICAL: void context — nunca aguardar — sumarização não bloqueia pipeline de voz
    void this.memory.runRollingSummarization(this._convId);
  }

  /**
   * Auto-capture screen if the user message asks about the screen and no image was provided.
   * Injects the screenshot directly into the HumanMessage so the LLM receives it as image_url
   * (not as a ToolMessage — OpenAI only allows image_url in user messages).
   */
  private async _tryAutoCapture(text: string): Promise<string | undefined> {
    if (!this._captureScreenFn) return undefined;
    if (!providerHasVision(this._capabilities, this._activeProvider)) return undefined;
    const lower = text.toLowerCase();
    const SCREEN_TERMS = ['tela', 'screen', 'monitor', 'o que está', 'o que tem', 'analisa', 'vê o que', 'me mostra', 'o que você vê', 'que tem aberto'];
    if (!SCREEN_TERMS.some(t => lower.includes(t))) return undefined;
    try {
      const result = await this._captureScreenFn();
      if (result.success) {
        console.log('[ChatSession] Auto-captured screen for vision request');
        return result.base64;
      }
    } catch { /* silent */ }
    return undefined;
  }

  /**
   * Background memory extraction — Phase 36 (MEMW-01, MEMW-03, REL-01).
   *
   * This method is ALWAYS called via `void` — never awaited at call site.
   * Errors are caught and logged only; never re-thrown; voice pipeline is unaffected.
   */
  private async _extractAndWriteMemories(
    userText: string,
    assistantText: string,
  ): Promise<void> {
    try {
      const extractor = new MemoryExtractor(this.llm);
      const extractions = await extractor.extractMemories(userText, assistantText);
      for (const extraction of extractions) {
        await this.memory.saveTypedMemory(this._convId, extraction);
      }
    } catch (err) {
      // MEMW-03: Silent failure — log only, never re-throw, never block caller
      console.warn(`[memory extraction] ${(err as Error).message}`);
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
    // Check both AIMessage and AIMessageChunk — agent.invoke() returns
    // AIMessageChunk which does NOT extend AIMessage in LangChain core.
    if (m._getType() === 'ai') {
      const toolCalls = (m as AIMessage).tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return String(m.content ?? '');
      }
    }
  }
  return '';
}
