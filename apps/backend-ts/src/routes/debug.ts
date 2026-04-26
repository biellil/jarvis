/**
 * Debug routes — Quick task 260426-m22.
 *
 * GET /debug/db-stats — retorna contagens das 4 tabelas principais (conversations,
 * messages, typed_memories, tool_calls) e a última mensagem persistida (com preview
 * de até 200 chars). Permite auditar persistência sem montar o arquivo SQLite ou
 * rodar SELECTs manuais.
 *
 * NOTA: Sem autenticação — uso local apenas. Não expor em produção sem proteção.
 */
import { Router } from "express";
import { sql, desc } from "drizzle-orm";

import { db } from "../memory/db.js";
import {
  conversations,
  messages,
  typedMemories,
  toolCalls,
} from "../memory/schema.js";

export const debugRouter = Router();

debugRouter.get("/debug/db-stats", (_req, res) => {
  try {
    const convCount = db
      .select({ c: sql<number>`cast(count(*) as integer)` })
      .from(conversations)
      .get();
    const msgCount = db
      .select({ c: sql<number>`cast(count(*) as integer)` })
      .from(messages)
      .get();
    const memCount = db
      .select({ c: sql<number>`cast(count(*) as integer)` })
      .from(typedMemories)
      .get();
    const toolCount = db
      .select({ c: sql<number>`cast(count(*) as integer)` })
      .from(toolCalls)
      .get();

    const last = db
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(1)
      .get();

    res.status(200).json({
      counts: {
        conversations: convCount?.c ?? 0,
        messages: msgCount?.c ?? 0,
        typed_memories: memCount?.c ?? 0,
        tool_calls: toolCount?.c ?? 0,
      },
      last_message: last
        ? {
            id: last.id,
            conversation_id: last.conversationId,
            role: last.role,
            content_preview: last.content.slice(0, 200),
            created_at: last.createdAt,
          }
        : null,
      database_path: process.env.DATABASE_PATH ?? "(default)",
      timestamp: new Date().toISOString(),
    });
  } catch (exc) {
    res.status(500).json({
      error: "db-stats failed",
      message: (exc as Error).message,
    });
  }
});
