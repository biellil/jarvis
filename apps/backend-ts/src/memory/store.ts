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
import { eq } from 'drizzle-orm';
import path from 'node:path';

import * as schema from './schema.js';
import { conversations, messages, summaries, userProfile, toolCalls } from './schema.js';
import { db as defaultDb } from './db.js';

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
}

export interface ProfileFact {
  key: string;
  value: string;
  source: string;
  createdAt: string;
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
    } else {
      this.db = defaultDb as unknown as Drizzle;
      this.sqlite = null;
      this.ownsConnection = false;
    }
  }

  startConversation(): number | null {
    try {
      const result = this.db
        .insert(conversations)
        .values({ startedAt: nowIso() })
        .returning({ id: conversations.id })
        .all();
      return result[0]?.id ?? null;
    } catch (exc) {
      console.warn(`MemoryStore.startConversation failed: ${(exc as Error).message}`);
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
          })),
        )
        .run();
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
   */
  logDispatch(toolName: string, params: Record<string, unknown>): number | null {
    try {
      const result = this.db
        .insert(toolCalls)
        .values({
          timestamp: nowIso(),
          toolName,
          paramsJson: params,
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
