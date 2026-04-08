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

export interface MemoryManagerOptions {
  dbPath?: string;
  /** Documented only — Chroma JS client is server-only; see vectors.ts. */
  chromaPath?: string;
  vectorsOptions?: MemoryVectorsOptions;
  recallTopK?: number;
  recallThreshold?: number;
}

export class MemoryManager {
  private readonly store: MemoryStore;
  private readonly vectors: MemoryVectors;
  private readonly recallTopK: number;
  private readonly recallThreshold: number;

  constructor(opts: MemoryManagerOptions = {}) {
    this.store = new MemoryStore(opts.dbPath);
    this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
    this.recallTopK = opts.recallTopK ?? 5;
    this.recallThreshold = opts.recallThreshold ?? 0.5;
  }

  async startConversation(): Promise<number | null> {
    return this.store.startConversation();
  }

  async endConversation(convId: number): Promise<void> {
    this.store.endConversation(convId);
  }

  /**
   * Persist a conversational turn to SQLite AND index both messages in the vector store.
   * Errors in either layer are already swallowed by the underlying components.
   */
  async saveTurn(convId: number, userText: string, assistantText: string): Promise<void> {
    const nowUser = new Date().toISOString();
    const nowAsst = new Date().toISOString();

    this.store.saveMessages(convId, [
      { role: 'user', content: userText, createdAt: nowUser },
      { role: 'assistant', content: assistantText, createdAt: nowAsst },
    ]);

    await this.vectors.addMemory(`conv-${convId}-user-${nowUser}`, userText, {
      convId,
      role: 'user',
    });
    await this.vectors.addMemory(`conv-${convId}-assistant-${nowAsst}`, assistantText, {
      convId,
      role: 'assistant',
    });
  }

  /**
   * Assemble a system-prompt-ready context block with:
   *   - user profile facts
   *   - semantic recall results above threshold
   *
   * Returns '' if both sections are empty.
   */
  async buildContext(userText: string): Promise<string> {
    const facts = this.store.getProfileFacts();
    const recalls = await this.vectors.queryMemories(
      userText,
      this.recallTopK,
      this.recallThreshold,
    );

    const parts: string[] = [];

    if (facts.length > 0) {
      const lines = ['### User profile'];
      for (const f of facts) {
        lines.push(`- ${f.key}: ${f.value}`);
      }
      parts.push(lines.join('\n'));
    }

    if (recalls.length > 0) {
      const lines = ['### Recall from past conversations'];
      for (const r of recalls) {
        lines.push(`- "${r.document}"`);
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

  close(): void {
    this.store.close();
  }
}
