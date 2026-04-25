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

import { MemoryStore, type ProfileFact } from './store.js';
import { MemoryVectors, type MemoryVectorsOptions } from './vectors.js';
import { isExplicitProfileCommand, extractProfileFacts } from './profile.js';
import type { Extraction } from './extractor.js';

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

  constructor(opts: MemoryManagerOptions = {}) {
    this.store = new MemoryStore(opts.dbPath);
    this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
    this.llm = opts.llm;
    this.recallTopK = opts.recallTopK ?? 5;
  }

  async startConversation(): Promise<number | null> {
    return this.store.startConversation();
  }

  async endConversation(convId: number): Promise<void> {
    await this.store.endConversation(convId);
  }

  /**
   * Persist a conversational turn to SQLite AND index both messages in the vector store.
   * Errors in either layer are already swallowed by the underlying components.
   */
  async saveTurn(convId: number, userText: string, assistantText: string): Promise<void> {
    const now = Date.now();
    const nowUser = new Date(now).toISOString();
    const nowAsst = new Date(now + 1).toISOString(); // +1 ms guarantees unique IDs

    this.store.saveMessages(convId, [
      { role: 'user', content: userText, createdAt: nowUser },
      { role: 'assistant', content: assistantText, createdAt: nowAsst },
    ]);

    await this.vectors.addMemory(`conv-${convId}-user-${now}`, userText, {
      convId,
      role: 'user',
    });
    await this.vectors.addMemory(`conv-${convId}-assistant-${now + 1}`, assistantText, {
      convId,
      role: 'assistant',
    });
  }

  /**
   * Assemble a context block with tiered memory retrieval (Phase 37 — MCTX-01 to MCTX-04).
   *
   * Order: Perfil do usuário → rolling summary (optional) → Memórias semânticas →
   *        Memórias episódicas → Memórias procedurais
   *
   * Queries 3 typed ChromaDB collections in parallel (Promise.all).
   * No similarity threshold — always returns top-5 per type (D-06).
   * Sections with no results are omitted from output (D-01).
   *
   * @param userText - Query text used for semantic retrieval
   * @param rollingSum - Optional rolling summary string (Phase 38 will provide this).
   *                     Appears between Perfil and typed memories when provided.
   * @returns Context string ready for system prompt, or '' if everything is empty.
   */
  async buildContext(userText: string, rollingSum?: string): Promise<string> {
    const facts = this.store.getProfileFacts();

    // Parallel queries for all 3 typed collections (MCTX-03 — D-07)
    const [semantic, episodic, procedural] = await Promise.all([
      this.vectors.queryMemoriesByType(userText, 'semantic', 5),
      this.vectors.queryMemoriesByType(userText, 'episodic', 5),
      this.vectors.queryMemoriesByType(userText, 'procedural', 5),
    ]);

    const parts: string[] = [];

    // Section 1: Perfil do usuário (D-03, D-04)
    if (facts.length > 0) {
      const lines = ['### Perfil do usuário'];
      for (const f of facts) {
        lines.push(`- ${f.key}: ${f.value}`);
      }
      parts.push(lines.join('\n'));
    }

    // Section 2: Rolling summary (Phase 38 interface — D-05)
    if (rollingSum) {
      parts.push(rollingSum);
    }

    // Section 3: Memórias semânticas (D-02, D-01)
    if (semantic.length > 0) {
      parts.push(this.formatMemoriesSection('### Memórias semânticas', semantic));
    }

    // Section 4: Memórias episódicas (D-02, D-01)
    if (episodic.length > 0) {
      parts.push(this.formatMemoriesSection('### Memórias episódicas', episodic));
    }

    // Section 5: Memórias procedurais (D-02, D-01)
    if (procedural.length > 0) {
      parts.push(this.formatMemoriesSection('### Memórias procedurais', procedural));
    }

    return parts.join('\n\n');
  }

  /** Format a typed memory section with header and bullet list. */
  private formatMemoriesSection(
    header: string,
    memories: import('./vectors.js').QueryResult[],
  ): string {
    const lines = [header];
    for (const m of memories) {
      lines.push(`- "${m.document}"`);
    }
    return lines.join('\n');
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
   * Persist extracted memory to both SQLite (store.saveTypedMemory) and
   * ChromaDB (vectors.addTypedMemory). Called from background extraction (Phase 36-P03).
   * Errors are caught and logged — never throws (MEMW-03 parity).
   */
  async saveTypedMemory(convId: number | null, extraction: Extraction): Promise<void> {
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
      });

      await this.vectors.addTypedMemory(memId, extraction.content, extraction.type, {
        convId: String(convId),
        type: extraction.type,
        confidence: String(extraction.confidence),
      });
    } catch (err) {
      console.warn(`MemoryManager.saveTypedMemory failed: ${(err as Error).message}`);
    }
  }

  close(): void {
    this.store.close();
  }
}
