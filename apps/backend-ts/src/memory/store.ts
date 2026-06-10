/**
 * SQLite persistence layer for conversations, messages, summaries,
 * user profile, and tool audit log.
 *
 * TypeScript port of `src/jarvis/memory/store.py`, preserving MEM-05:
 * write errors are caught and logged, never thrown.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, eq, desc, asc, inArray, sql } from 'drizzle-orm';
import path from 'node:path';

import * as schema from './schema.js';
import { conversations, messages, summaries, userProfile, toolCalls, voiceCalls, typedMemories, actionsLog } from './schema.js';
import { db as defaultDb, sqlite as globalSqlite } from './db.js';

type Drizzle = BetterSQLite3Database<typeof schema>;

function nowIso(): string {
  return new Date().toISOString();
}

function migrationsFolder(): string {
  return path.join(process.cwd(), 'src/memory/migrations');
}

/**
 * Open a fresh SQLite file, run migrations, and return the drizzle + raw handles.
 * Used by tests and by `MemoryStore`/`ToolLogger` when constructed with an explicit dbPath.
 */
export function createStoreForTests(dbPath: string): {
  db: Drizzle;
  sqlite: Database.Database;
} {
  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return { db, sqlite };
}

export interface MessageInput {
  role: (typeof schema.messageRoleEnum)[number];
  content: string;
  createdAt: string;
  speakerId?: string;
}

export interface MessageWithId extends MessageInput {
  id: number;
}

export interface ProfileFact {
  key: string;
  value: string;
  source: string;
  createdAt: string;
}

export interface TypedMemoryEntry {
  id: string;
  conversationId: number;
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  confidence?: number;
  extractedAt: string;
  sourceId?: number;
  source?: string;
  createdAt: string;
  speakerId?: string;
}

export class MemoryStore {
  private db: Drizzle;
  private sqlite: Database.Database | null;
  private ownsConnection: boolean;

  constructor(dbPath?: string) {
    if (dbPath) {
      const { db, sqlite } = createStoreForTests(dbPath);
      this.db = db;
      this.sqlite = sqlite;
      this.ownsConnection = true;
      this.setupFts5(this.sqlite!);
    } else {
      this.db = defaultDb as unknown as Drizzle;
      this.sqlite = null;
      this.ownsConnection = false;
      this.setupFts5(globalSqlite);
    }
  }

  private setupFts5(s: Database.Database): void {
    try {
      s.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS typed_memories_fts USING fts5(content, id UNINDEXED);

        INSERT INTO typed_memories_fts(content, id)
          SELECT tm.content, tm.id FROM typed_memories tm
          WHERE tm.id NOT IN (SELECT id FROM typed_memories_fts);

        CREATE TRIGGER IF NOT EXISTS typed_memories_fts_ai
          AFTER INSERT ON typed_memories BEGIN
            INSERT INTO typed_memories_fts(content, id) VALUES (new.content, new.id);
          END;

        CREATE TRIGGER IF NOT EXISTS typed_memories_fts_au
          AFTER UPDATE ON typed_memories BEGIN
            DELETE FROM typed_memories_fts WHERE id = old.id;
            INSERT INTO typed_memories_fts(content, id) VALUES (new.content, new.id);
          END;

        CREATE TRIGGER IF NOT EXISTS typed_memories_fts_ad
          AFTER DELETE ON typed_memories BEGIN
            DELETE FROM typed_memories_fts WHERE id = old.id;
          END;
      `);
    } catch (exc) {
      console.warn(`MemoryStore.setupFts5 failed: ${(exc as Error).message}`);
    }
  }

  startConversation(): number | null {
    try {
      const result = this.db
        .insert(conversations)
        .values({ startedAt: nowIso() })
        .returning({ id: conversations.id })
        .all();
      const id = result[0]?.id ?? null;
      if (id !== null) {
        console.log(`[SQLite] 🆕 conversation started (id=${id})`);
      }
      return id;
    } catch (exc) {
      console.warn(`MemoryStore.startConversation failed: ${(exc as Error).message}`);
      return null;
    }
  }

  /**
   * Retorna o id da conversa mais antiga (oldest by id ASC) — a "single conversation"
   * que persiste entre restarts. Se a tabela `conversations` estiver vazia, cria uma
   * nova via `startConversation()` e retorna o id resultante.
   *
   * Logs:
   *   - `[SQLite] ▶ resumed conversation (id=N)` quando reusa uma row existente.
   *   - `[SQLite] 🆕 conversation started (id=N)` (emitido por startConversation()) na criação.
   *
   * Returns null on SELECT error (MEM-05 — never throws). Errors no fallback de
   * `startConversation()` também resultam em null (já tratado lá dentro).
   */
  getOrCreateConversation(): number | null {
    try {
      const rows = this.db
        .select({ id: conversations.id })
        .from(conversations)
        .orderBy(asc(conversations.id))
        .limit(1)
        .all();
      const existingId = rows[0]?.id ?? null;
      if (existingId !== null) {
        console.log(`[SQLite] ▶ resumed conversation (id=${existingId})`);
        return existingId;
      }
      // Tabela vazia: cria a primeira conversa (log próprio do startConversation).
      return this.startConversation();
    } catch (exc) {
      console.warn(
        `MemoryStore.getOrCreateConversation failed: ${(exc as Error).message}`,
      );
      return null;
    }
  }

  endConversation(convId: number): void {
    try {
      this.db
        .update(conversations)
        .set({ endedAt: nowIso() })
        .where(eq(conversations.id, convId))
        .run();
    } catch (exc) {
      console.warn(
        `MemoryStore.endConversation failed (convId=${convId}): ${(exc as Error).message}`,
      );
    }
  }

  saveMessages(convId: number, msgs: MessageInput[]): void {
    if (msgs.length === 0) return;
    try {
      this.db
        .insert(messages)
        .values(
          msgs.map((m) => ({
            conversationId: convId,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            speakerId: m.speakerId,
          })),
        )
        .run();
      console.log(`[SQLite] ✅ inserted ${msgs.length} messages (convId=${convId})`);
    } catch (exc) {
      console.warn(
        `MemoryStore.saveMessages failed (convId=${convId}): ${(exc as Error).message}`,
      );
    }
  }

  saveSummary(convId: number, content: string): void {
    try {
      this.db
        .insert(summaries)
        .values({ conversationId: convId, content, createdAt: nowIso() })
        .run();
    } catch (exc) {
      console.warn(
        `MemoryStore.saveSummary failed (convId=${convId}): ${(exc as Error).message}`,
      );
    }
  }

  /**
   * Conta mensagens ativas (roles user/assistant) de uma conversa.
   * Returns 0 on error (MEM-05).
   */
  countMessages(convId: number): number {
    try {
      const result = this.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, convId),
            inArray(messages.role, ['user', 'assistant']),
          ),
        )
        .get();
      return result?.count ?? 0;
    } catch (exc) {
      console.warn(
        `MemoryStore.countMessages failed (convId=${convId}): ${(exc as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Retorna as N mensagens mais antigas de uma conversa (ORDER BY id ASC).
   * Returns [] on error (MEM-05).
   */
  getOldestMessages(convId: number, limit: number): MessageWithId[] {
    try {
      const rows = this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.id))
        .limit(limit)
        .all();
      return rows as unknown as MessageWithId[];
    } catch (exc) {
      console.warn(
        `MemoryStore.getOldestMessages failed (convId=${convId}): ${(exc as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Retorna as últimas `limit` mensagens de uma conversa em ordem CRONOLÓGICA crescente
   * (mais antiga primeiro), pronto para alimentar `ChatSession.history` durante rehydration.
   *
   * Truque: query ORDER BY id DESC LIMIT N pega as N mais recentes; depois `.reverse()`
   * em JS devolve em ordem natural para o LLM consumir como histórico.
   *
   * Filtro CRÍTICO: somente role IN ('user','assistant'). `system` messages nunca são
   * reidratadas — o SystemMessage do prompt vem do código, não do banco.
   *
   * Returns [] on error (MEM-05 — never throws).
   */
  getRecentMessages(convId: number, limit: number): MessageWithId[] {
    try {
      const rows = this.db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, convId),
            inArray(messages.role, ['user', 'assistant']),
          ),
        )
        .orderBy(desc(messages.id))
        .limit(limit)
        .all();
      const ordered = (rows as unknown as MessageWithId[]).reverse();
      return ordered;
    } catch (exc) {
      console.warn(
        `MemoryStore.getRecentMessages failed (convId=${convId}): ${(exc as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Deleta mensagens pelos IDs fornecidos. Sem-op se array vazio.
   * Errors logged, never throws (MEM-05).
   */
  deleteMessages(ids: number[]): void {
    if (ids.length === 0) return;
    try {
      this.db
        .delete(messages)
        .where(inArray(messages.id, ids))
        .run();
    } catch (exc) {
      console.warn(
        `MemoryStore.deleteMessages failed (${ids.length} ids): ${(exc as Error).message}`,
      );
    }
  }

  /**
   * Retorna o content do summary mais recente de uma conversa.
   * Returns null se não há summaries ou em caso de erro (MEM-05).
   */
  getLatestSummary(convId: number): string | null {
    try {
      const rows = this.db
        .select({ content: summaries.content })
        .from(summaries)
        .where(eq(summaries.conversationId, convId))
        .orderBy(desc(summaries.createdAt))
        .limit(1)
        .all();
      return rows[0]?.content ?? null;
    } catch (exc) {
      console.warn(
        `MemoryStore.getLatestSummary failed (convId=${convId}): ${(exc as Error).message}`,
      );
      return null;
    }
  }

  upsertProfile(
    key: string,
    value: string,
    source: (typeof schema.userProfileSourceEnum)[number],
  ): void {
    try {
      this.db
        .insert(userProfile)
        .values({ key, value, source, createdAt: nowIso() })
        .onConflictDoUpdate({
          target: userProfile.key,
          set: { value, source, createdAt: nowIso() },
        })
        .run();
    } catch (exc) {
      console.warn(
        `MemoryStore.upsertProfile failed (key=${key}): ${(exc as Error).message}`,
      );
    }
  }

  getProfileFacts(): ProfileFact[] {
    try {
      const rows = this.db
        .select({
          key: userProfile.key,
          value: userProfile.value,
          source: userProfile.source,
          createdAt: userProfile.createdAt,
        })
        .from(userProfile)
        .orderBy(userProfile.id)
        .all();
      return rows;
    } catch (exc) {
      console.warn(`MemoryStore.getProfileFacts failed: ${(exc as Error).message}`);
      return [];
    }
  }

  logVoiceCall(row: {
    conversationId: number | null;
    audioBytes: number;
    transcription: string | null;
    sttProvider: string;
    sttLatencyMs: number | null;
    success: boolean;
    error?: string | null;
  }): number | null {
    try {
      const result = this.db
        .insert(voiceCalls)
        .values({
          conversationId: row.conversationId,
          timestamp: nowIso(),
          audioBytes: row.audioBytes,
          transcription: row.transcription,
          sttProvider: row.sttProvider,
          sttLatencyMs: row.sttLatencyMs,
          success: row.success ? 1 : 0,
          error: row.error ?? null,
        })
        .returning({ id: voiceCalls.id })
        .all();
      return result[0]?.id ?? null;
    } catch (exc) {
      console.warn(`MemoryStore.logVoiceCall failed: ${(exc as Error).message}`);
      return null;
    }
  }

  updateVoiceCall(
    id: number,
    patch: {
      transcription?: string | null;
      ttsProvider?: string | null;
      ttsLatencyMs?: number | null;
      ttsBytes?: number | null;
      success?: boolean;
      error?: string | null;
    },
  ): void {
    try {
      const set: Record<string, unknown> = {};
      if (patch.transcription !== undefined) set.transcription = patch.transcription;
      if (patch.ttsProvider !== undefined) set.ttsProvider = patch.ttsProvider;
      if (patch.ttsLatencyMs !== undefined) set.ttsLatencyMs = patch.ttsLatencyMs;
      if (patch.ttsBytes !== undefined) set.ttsBytes = patch.ttsBytes;
      if (patch.success !== undefined) set.success = patch.success ? 1 : 0;
      if (patch.error !== undefined) set.error = patch.error;
      if (Object.keys(set).length === 0) return;
      this.db.update(voiceCalls).set(set).where(eq(voiceCalls.id, id)).run();
    } catch (exc) {
      console.warn(
        `MemoryStore.updateVoiceCall failed (id=${id}): ${(exc as Error).message}`,
      );
    }
  }

  getVoiceCall(id: number): {
    id: number;
    conversationId: number | null;
    timestamp: string;
    audioBytes: number;
    transcription: string | null;
    sttProvider: string;
    sttLatencyMs: number | null;
    ttsProvider: string | null;
    ttsLatencyMs: number | null;
    ttsBytes: number | null;
    success: number;
    error: string | null;
  } | null {
    try {
      const rows = this.db
        .select()
        .from(voiceCalls)
        .where(eq(voiceCalls.id, id))
        .all();
      return (rows[0] as any) ?? null;
    } catch (exc) {
      console.warn(`MemoryStore.getVoiceCall failed (id=${id}): ${(exc as Error).message}`);
      return null;
    }
  }

  /**
   * Persist a typed memory row to SQLite.
   * Errors are caught and logged (MEM-05) — never throws.
   */
  saveTypedMemory(memory: TypedMemoryEntry): void {
    try {
      this.db
        .insert(typedMemories)
        .values({
          id: memory.id,
          conversationId: memory.conversationId,
          type: memory.type,
          content: memory.content,
          confidence: memory.confidence ?? null,
          extractedAt: memory.extractedAt,
          sourceId: memory.sourceId ?? null,
          source: memory.source ?? null,
          createdAt: memory.createdAt,
          speakerId: memory.speakerId,
        })
        .run();
    } catch (exc) {
      console.warn(`MemoryStore.saveTypedMemory failed (id=${memory.id}): ${(exc as Error).message}`);
    }
  }

  /**
   * Phase 94: Backfill speaker_id = 'unknown' on all rows that have speaker_id IS NULL.
   * Idempotent — second run updates 0 rows.
   */
  backfillSpeakerIds(): void {
    const s = this.sqlite ?? globalSqlite;
    try {
      s.exec(
        `UPDATE messages SET speaker_id = 'unknown' WHERE speaker_id IS NULL`
      );
      s.exec(
        `UPDATE typed_memories SET speaker_id = 'unknown' WHERE speaker_id IS NULL`
      );
      console.log('[SQLite] ✅ backfilled speaker_id on messages + typed_memories');
    } catch (exc) {
      console.warn(`MemoryStore.backfillSpeakerIds failed: ${(exc as Error).message}`);
    }
  }

  /**
   * Retrieve typed memories for a conversation filtered by type.
   * Returns newest-first, up to `limit` rows (default 10).
   * Returns [] on error (MEM-05).
   */
  getTypedMemories(convId: number, type: string, limit = 10): TypedMemoryEntry[] {
    try {
      const rows = this.db
        .select()
        .from(typedMemories)
        .where(
          and(
            eq(typedMemories.conversationId, convId),
            eq(typedMemories.type, type as TypedMemoryEntry['type']),
          ),
        )
        .orderBy(desc(typedMemories.createdAt))
        .limit(limit)
        .all();
      return rows as TypedMemoryEntry[];
    } catch (exc) {
      console.warn(`MemoryStore.getTypedMemories failed (convId=${convId}, type=${type}): ${(exc as Error).message}`);
      return [];
    }
  }

  /**
   * Retrieve all typed memory rows across all conversations.
   * Used by validateMemoryConsistency() to cross-check against ChromaDB.
   * Returns [] on error (MEM-05).
   */
  getAllTypedMemories(): TypedMemoryEntry[] {
    try {
      const rows = this.db.select().from(typedMemories).all();
      return rows as TypedMemoryEntry[];
    } catch (exc) {
      console.warn(`MemoryStore.getAllTypedMemories failed: ${(exc as Error).message}`);
      return [];
    }
  }

  close(): void {
    if (!this.ownsConnection || !this.sqlite) return;
    try {
      this.sqlite.close();
      this.sqlite = null;
    } catch (exc) {
      console.warn(`MemoryStore.close failed: ${(exc as Error).message}`);
    }
  }
}

export class ToolLogger {
  private db: Drizzle;
  private sqlite: Database.Database | null;
  private ownsConnection: boolean;

  constructor(dbPath?: string) {
    if (dbPath) {
      const { db, sqlite } = createStoreForTests(dbPath);
      this.db = db;
      this.sqlite = sqlite;
      this.ownsConnection = true;
    } else {
      this.db = defaultDb as unknown as Drizzle;
      this.sqlite = null;
      this.ownsConnection = false;
    }
  }

  log(
    toolName: string,
    params: Record<string, unknown>,
    outcome: (typeof schema.toolCallOutcomeEnum)[number],
    error?: string,
  ): void {
    try {
      this.db
        .insert(toolCalls)
        .values({
          timestamp: nowIso(),
          toolName,
          paramsJson: params,
          outcome,
          error: error ?? null,
        })
        .run();
    } catch (exc) {
      console.warn(`ToolLogger.log failed (${toolName}): ${(exc as Error).message}`);
    }
  }

  /**
   * Insere uma linha em `tool_calls` com `outcome='dispatched'` e retorna
   * o id gerado. Usado pelo middleware do agent no momento do dispatch
   * da tool pro cliente Electron. Retorna `null` em caso de falha.
   *
   * Phase 65 (MCP-CLI D-15): aceita `metadata` opcional para identificar origem
   * de tools MCP externas (ex: { source: 'mcp-external', serverName: 'n8n' }).
   * Quando presente, o objeto é mesclado em `paramsJson` sob a chave `_meta`
   * para evitar conflito com nomes de campos legítimos da tool.
   */
  logDispatch(
    toolName: string,
    params: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): number | null {
    try {
      const paramsJson = metadata
        ? { ...params, _meta: metadata }
        : params;
      const result = this.db
        .insert(toolCalls)
        .values({
          timestamp: nowIso(),
          toolName,
          paramsJson,
          outcome: 'dispatched',
          output: null,
          error: null,
        })
        .returning({ id: toolCalls.id })
        .all();
      return result[0]?.id ?? null;
    } catch (exc) {
      console.warn(
        `ToolLogger.logDispatch failed (${toolName}): ${(exc as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Atualiza uma linha existente de `tool_calls` com o outcome reportado
   * pelo cliente Electron via POST /tool-calls/:id/result.
   * Retorna `true` se a linha existia e foi atualizada, `false` caso
   * contrário. Nunca throw.
   */
  updateOutcome(
    id: number,
    outcome: 'success' | 'error' | 'cancelled',
    output: string | null,
    error: string | null,
  ): boolean {
    try {
      const res = this.db
        .update(toolCalls)
        .set({ outcome, output, error })
        .where(eq(toolCalls.id, id))
        .run();
      return (res.changes ?? 0) > 0;
    } catch (exc) {
      console.warn(
        `ToolLogger.updateOutcome failed (id=${id}): ${(exc as Error).message}`,
      );
      return false;
    }
  }

  close(): void {
    if (!this.ownsConnection || !this.sqlite) return;
    try {
      this.sqlite.close();
      this.sqlite = null;
    } catch (exc) {
      console.warn(`ToolLogger.close failed: ${(exc as Error).message}`);
    }
  }
}

// ============================================================
// Phase 54 — ActionLogger (mirrors ToolLogger, LACT-08)
// ============================================================

export class ActionLogger {
  private db: Drizzle;

  constructor(db: Drizzle = defaultDb as unknown as Drizzle) {
    this.db = db;
  }

  log(
    result: (typeof schema.actionsLogResultEnum)[number],
    path: string,
    action: string,
    model?: string,
    clientId?: string,
    requestId?: string,
  ): void {
    try {
      this.db
        .insert(actionsLog)
        .values({
          timestamp: nowIso(),
          path,
          action,
          result,
          model: model ?? null,
          clientId: clientId ?? null,
          requestId: requestId ?? null,
        })
        .run();
    } catch (exc) {
      console.warn(`ActionLogger.log failed: ${(exc as Error).message}`);
    }
  }
}
