/**
 * MemoryManager — single facade over MemoryStore (SQLite) and MemoryVectors (Chroma),
 * plus user profile extraction. Consumed by ChatSession (phase 17).
 *
 * Closes MEM-TS-07: user profile is injected automatically into each conversation
 * via `buildContext()`.
 *
 * NOTE on options: the Python plan calls for a `chromaPath` option, but the chromadb
 * JS client is server-only (see vectors.ts note). We therefore accept `vectorsOptions`
 * (host/port/ssl) and keep `chromaPath` as an alias that is ignored at runtime — the
 * caller is expected to have a running `chroma run --path <chromaPath>` elsewhere.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { MemoryStore, type ProfileFact, type MessageWithId } from './store.js';
import { MemoryVectors, type MemoryVectorsOptions } from './vectors.js';
import { isExplicitProfileCommand, extractProfileFacts } from './profile.js';
import type { Extraction } from './extractor.js';
import { HybridRetriever } from './hybrid-retriever.js';
import { sqlite as globalSqlite } from './db.js';

export interface MemoryManagerOptions {
  dbPath?: string;
  /** Documented only — Chroma JS client is server-only; see vectors.ts. */
  chromaPath?: string;
  vectorsOptions?: MemoryVectorsOptions;
  recallTopK?: number;
  /** @deprecated — threshold removed in Phase 37 (MCTX-02). Field accepted but ignored. */
  recallThreshold?: number;
  llm?: BaseChatModel;
}

export class MemoryManager {
  readonly store: MemoryStore;
  readonly vectors: MemoryVectors;
  readonly llm: BaseChatModel | undefined;
  private readonly recallTopK: number;
  private readonly retriever: HybridRetriever;
  private _latestSummary: string | null = null;

  constructor(opts: MemoryManagerOptions = {}) {
    this.store = new MemoryStore(opts.dbPath);
    this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
    this.llm = opts.llm;
    this.recallTopK = opts.recallTopK ?? 5;
    this.retriever = new HybridRetriever(globalSqlite, this.vectors);
    // Phase 94 D-09: non-blocking ChromaDB backfill — marks pre-existing docs as speaker_id='unknown'
    void this.vectors.backfillSpeakerIds().catch(err =>
      console.warn('[memory] ChromaDB speaker backfill failed:', err)
    );
  }

  async startConversation(): Promise<number | null> {
    return this.store.startConversation();
  }

  /**
   * Reusa a conversa mais antiga (oldest by id ASC) ou cria uma nova se a tabela
   * estiver vazia. Facade fina sobre `MemoryStore.getOrCreateConversation()` —
   * usado pelo bootstrap do `ChatSession` para garantir continuidade entre restarts.
   */
  async getOrCreateConversation(): Promise<number | null> {
    return this.store.getOrCreateConversation();
  }

  async endConversation(convId: number): Promise<void> {
    await this.store.endConversation(convId);
  }

  /**
   * Persist a conversational turn to SQLite AND index both messages in the vector store.
   * SQLite persistence is synchronous (durability guaranteed before returning).
   * Chroma indexing is fire-and-forget via the embedding queue (D-03).
   */
  async saveTurn(convId: number, userText: string, assistantText: string, speakerId?: string): Promise<void> {
    console.log(`[DB] 💾 saveTurn start (convId=${convId}, user=${userText.length}c, assistant=${assistantText.length}c)`);
    const now = Date.now();
    const nowUser = new Date(now).toISOString();
    const nowAsst = new Date(now + 1).toISOString(); // +1 ms guarantees unique IDs

    // SYNCHRONOUS: SQLite persistence happens immediately — durability guaranteed before returning
    this.store.saveMessages(convId, [
      { role: 'user', content: userText, createdAt: nowUser, speakerId },
      { role: 'assistant', content: assistantText, createdAt: nowAsst, speakerId },
    ]);

    // ASYNCHRONOUS: Chroma embedding queued (fire-and-forget via embedding queue)
    // D-03: SQLite stays sync; embedding is background task
    void this._queueVectorIndexing(convId, userText, assistantText, now, speakerId);
  }

  private async _queueVectorIndexing(
    convId: number,
    userText: string,
    assistantText: string,
    now: number,
    speakerId?: string,
  ): Promise<void> {
    try {
      const okUser = await this.vectors.addMemory(`conv-${convId}-user-${now}`, userText, {
        convId,
        role: 'user',
        ...(speakerId ? { speaker_id: speakerId } : {}),
      });
      const okAsst = await this.vectors.addMemory(`conv-${convId}-assistant-${now + 1}`, assistantText, {
        convId,
        role: 'assistant',
        ...(speakerId ? { speaker_id: speakerId } : {}),
      });
      if (okUser && okAsst) {
        console.log(`[Chroma] 🧠 indexed memory (convId=${convId})`);
      } else {
        console.warn(`[Chroma] ⚠️ failed to index memory (convId=${convId}, user=${okUser}, assistant=${okAsst})`);
      }
    } catch (err) {
      console.warn(`[memory] _queueVectorIndexing failed (convId=${convId}): ${(err as Error).message}`);
    }
  }

  /**
   * Assemble a context block with hybrid memory retrieval (Phase 93 — HMEM-04, HMEM-06).
   *
   * Uses HybridRetriever (semantic + keyword FTS5 + recency RRF) to produce a single
   * ### Memórias section. Recency weight 0.15 acts as tiebreaker only (HMEM-04).
   *
   * Order: Perfil do usuário → rolling summary (optional) → Memórias
   * Sections with no results are omitted from output.
   *
   * @param userText - Query text used for hybrid retrieval
   * @param rollingSum - Optional rolling summary string (Phase 38).
   *                     Appears between Perfil and Memórias when provided.
   * @returns Context string ready for system prompt, or '' if everything is empty.
   */
  async buildContext(userText: string, rollingSum?: string, speakerId?: string): Promise<string> {
    const facts = this.store.getProfileFacts();

    const parts: string[] = [];

    // Section 1: Perfil do usuário
    if (facts.length > 0) {
      const lines = ['### Perfil do usuário'];
      for (const f of facts) {
        lines.push(`- ${f.key}: ${f.value}`);
      }
      parts.push(lines.join('\n'));
    }

    // Section 2: Rolling summary (Phase 38 — MSUM-03)
    // Usa rollingSum explícito se fornecido; caso contrário usa cache _latestSummary
    const effectiveSummary = rollingSum ?? this._latestSummary ?? undefined;
    if (effectiveSummary) {
      parts.push(effectiveSummary);
    }

    // Section 3: Memórias — single unified section via HybridRetriever (HMEM-06)
    const memories = await this.retriever.retrieve(userText, { speakerId });
    if (memories.length > 0) {
      const lines = ['### Memórias'];
      for (const m of memories) {
        lines.push(`- "${m.document}"`);
      }
      parts.push(lines.join('\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * Learn from a single user turn. If the text starts with an explicit trigger,
   * facts are saved with source='explicit'; otherwise source='implicit'.
   * Never throws.
   */
  async learnFromTurn(llm: BaseChatModel, userText: string): Promise<void> {
    try {
      const source = isExplicitProfileCommand(userText) ? 'explicit' : 'implicit';
      const facts = await extractProfileFacts(llm, userText);
      for (const [k, v] of Object.entries(facts)) {
        this.store.upsertProfile(k, v, source);
      }
    } catch (exc) {
      console.warn(`MemoryManager.learnFromTurn failed: ${(exc as Error).message}`);
    }
  }

  getProfileFacts(): ProfileFact[] {
    return this.store.getProfileFacts();
  }

  /**
   * Retorna as últimas `limit` mensagens da conversa em ordem cronológica crescente
   * (mais antiga primeiro), já filtrando role IN ('user','assistant'). Síncrono — espelha
   * o store. Usado pelo `ChatSession.create()` para reidratar `this.history`.
   */
  getRecentMessages(convId: number, limit: number): MessageWithId[] {
    return this.store.getRecentMessages(convId, limit);
  }

  /**
   * Persist extracted memory to both SQLite (store.saveTypedMemory) and
   * ChromaDB (vectors.addTypedMemory). Called from background extraction (Phase 36-P03).
   * Errors are caught and logged — never throws (MEMW-03 parity).
   */
  async saveTypedMemory(convId: number | null, extraction: Extraction, speakerId?: string): Promise<void> {
    if (convId === null) return;

    try {
      const memId = `conv-${convId}-${extraction.type}-${Date.now()}`;
      const now = new Date().toISOString();

      this.store.saveTypedMemory({
        id: memId,
        conversationId: convId,
        type: extraction.type,
        content: extraction.content,
        confidence: extraction.confidence,
        extractedAt: now,
        sourceId: undefined,   // Phase 36: source_id left null per STATE.md decision
        createdAt: now,
        speakerId,
      });

      const ok = await this.vectors.addTypedMemory(memId, extraction.content, extraction.type, {
        convId: String(convId),
        type: extraction.type,
        confidence: String(extraction.confidence),
        ...(speakerId ? { speaker_id: speakerId } : {}),
      });
      if (!ok) {
        console.warn(`[Chroma] ⚠️ failed to index typed memory (convId=${convId}, type=${extraction.type}, id=${memId})`);
      }
    } catch (err) {
      console.warn(`MemoryManager.saveTypedMemory failed: ${(err as Error).message}`);
    }
  }

  close(): void {
    this.store.close();
  }

  /**
   * Trigger público de sumarização — chamar via void (fire-and-forget).
   * Verifica se a conversa atingiu 20 mensagens; se sim, sumariza as 10 mais antigas.
   * Implementa MSUM-01, MSUM-02 (D-01, D-01b, D-02, D-03, D-05, D-06).
   * Erros capturados internamente — nunca propagados (MEM-05 parity).
   */
  async runRollingSummarization(convId: number | null): Promise<void> {
    if (convId === null) return;

    try {
      // D-01b: verificar threshold ANTES de qualquer operação cara
      const count = this.store.countMessages(convId);
      if (count < 20) return; // early exit — zero custo

      // D-06: buscar as 10 mensagens mais antigas
      const oldest = this.store.getOldestMessages(convId, 10);
      if (oldest.length === 0) return;

      // D-03: gerar sumário via LLM
      const summary = await this._generateRollingSummary(oldest);
      // Pitfall 3 protection: só deletar SE sumário foi gerado com sucesso
      if (!summary) return;

      // D-02: deletar as mensagens antigas e persistir o sumário
      const ids = oldest.map((m) => m.id);
      this.store.deleteMessages(ids);
      this.store.saveSummary(convId, summary);

      // D-04: atualizar cache para buildContext() usar sem query adicional
      this._latestSummary = summary;
    } catch (err) {
      // MEM-05: falha silenciosa — log only, never re-throw
      console.warn(
        `MemoryManager.runRollingSummarization failed (convId=${convId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Gera um resumo textual das mensagens mais antigas usando o LLM.
   * Retorna '' se LLM indisponível ou em caso de erro.
   */
  private async _generateRollingSummary(msgs: MessageWithId[]): Promise<string> {
    if (!this.llm) {
      console.warn('[summarization] Nenhum LLM disponível; pulando geração de sumário');
      return '';
    }

    try {
      const conversation = msgs
        .map((m) => `${m.role === 'user' ? 'User' : 'JARVIS'}: ${m.content}`)
        .join('\n\n');

      const SUMMARIZATION_PROMPT = `Você é o JARVIS, assistente inteligente. Resuma a conversa abaixo em 2-3 bullets concisos. Capture fatos importantes, decisões e contexto relevante para interações futuras.

=== Conversa ===
${conversation}

=== Resumo ===`;

      const result = await this.llm.invoke(SUMMARIZATION_PROMPT);
      const text = typeof result.content === 'string' ? result.content.trim() : '';
      return text ? `### Resumo da Conversa Anterior\n${text}` : '';
    } catch (err) {
      console.warn(`[summarization] LLM invocation failed: ${(err as Error).message}`);
      return '';
    }
  }
}
