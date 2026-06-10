/**
 * summary-generator.ts — Phase 67, Plan 06 (PROACT-06)
 *
 * buildSummaryContext(): coleta últimas 24h de mensagens, ações e próximos lembretes.
 * buildDailySummaryPrompt(): monta o prompt D-16 em pt-BR.
 * generateDailySummary(): chama o LLM com o prompt e retorna string; graceful fallback em erro.
 *
 * Threat T-67-05: mensagens truncadas em 100 chars; máx 20 msgs.
 *                 Paths de ações → apenas basename() para não vazar dirs completos no prompt.
 */

import { basename } from 'path';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { messages, actionsLog, reminders } from '../memory/schema.js';
import { and, eq, gt, lt, sql } from 'drizzle-orm';

// ============================================================
// Types
// ============================================================

export interface SummaryContext {
  messagesSummary: string;
  actionsSummary: string;
  upcomingReminders: string;
}

// ============================================================
// buildSummaryContext
// ============================================================

/**
 * Coleta contexto das últimas 24h para o resumo diário.
 * Sincronismo garantido pelo better-sqlite3 (sem Promises).
 *
 * @param db   - instância Drizzle do better-sqlite3
 * @param now  - momento de referência (Date.now() em produção; injetável para testes)
 */
export function buildSummaryContext(
  db: BetterSQLite3Database<Record<string, unknown>>,
  now: Date,
): SummaryContext {
  const nowMs = now.getTime();
  const windowStart = nowMs - 24 * 60 * 60 * 1000; // now - 24h
  const windowEnd = nowMs + 24 * 60 * 60 * 1000;   // now + 24h (lookahead para lembretes)

  // -----------------------------------------------------------
  // 1. Messages: role='user', últimas 24h, máx 20, truncar 100 chars
  // -----------------------------------------------------------
  const msgRows = db
    .select({ content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.role, 'user'),
        gt(messages.createdAt, new Date(windowStart).toISOString()),
      ),
    )
    .limit(20)
    .all() as Array<{ content: string }>;

  const messagesSummary =
    msgRows.length === 0
      ? 'Nenhuma conversa nas últimas 24h.'
      : msgRows
          .map((r, i) => {
            const truncated =
              r.content.length > 100 ? r.content.slice(0, 100) + '…' : r.content;
            return `${i + 1}. ${truncated}`;
          })
          .join('\n');

  // -----------------------------------------------------------
  // 2. Actions: últimas 24h, máx 10, apenas basename do path (T-67-05)
  // -----------------------------------------------------------
  const actionRows = db
    .select({ action: actionsLog.action, path: actionsLog.path })
    .from(actionsLog)
    .where(gt(actionsLog.timestamp, new Date(windowStart).toISOString()))
    .limit(10)
    .all() as Array<{ action: string; path: string }>;

  const actionsSummary =
    actionRows.length === 0
      ? 'Nenhuma ação executada.'
      : actionRows
          .map((r) => `${r.action} ${basename(r.path)}`)
          .join('\n');

  // -----------------------------------------------------------
  // 3. Reminders: status='pending', next 24h, ordered by due_at
  // -----------------------------------------------------------
  const reminderRows = db
    .select({ message: reminders.message, due_at: reminders.due_at })
    .from(reminders)
    .where(
      and(
        eq(reminders.status, 'pending'),
        gt(reminders.due_at, nowMs),
        lt(reminders.due_at, windowEnd),
      ),
    )
    .orderBy(reminders.due_at)
    .all() as Array<{ message: string; due_at: number }>;

  const upcomingReminders =
    reminderRows.length === 0
      ? 'Nenhum lembrete.'
      : reminderRows
          .map((r) => {
            const d = new Date(r.due_at);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${r.message} às ${hh}:${mm}`;
          })
          .join('\n');

  return { messagesSummary, actionsSummary, upcomingReminders };
}

// ============================================================
// buildDailySummaryPrompt — pure function, testável isoladamente
// ============================================================

/**
 * Monta o prompt D-16 com o contexto coletado.
 * Exportado como função pura para testes unitários sem LLM.
 */
export function buildDailySummaryPrompt(ctx: SummaryContext): string {
  return `Você é o JARVIS, assistente pessoal inteligente. Faça um resumo curto e natural do dia anterior em pt-BR (3-5 frases).
Inclua: o que conversamos, ações que executei, e lembretes nas próximas 24h.
Tom: parceiro próximo, não formal. Não use bullets nem listas.

Conversas de hoje: ${ctx.messagesSummary}
Ações executadas hoje: ${ctx.actionsSummary}
Próximos lembretes (24h): ${ctx.upcomingReminders}`;
}

// ============================================================
// generateDailySummary
// ============================================================

/** Fallback string retornada em qualquer falha do LLM. */
const FALLBACK_TEXT = 'Não consegui gerar o resumo diário neste horário.';

/**
 * Chama o LLM com o prompt D-16 e retorna o texto gerado.
 * Nunca lança exceção — em qualquer erro retorna FALLBACK_TEXT (pt-BR).
 *
 * @param llm     - qualquer BaseChatModel (OpenAI, Anthropic, LM Studio)
 * @param context - contexto coletado por buildSummaryContext()
 */
export async function generateDailySummary(
  llm: BaseChatModel,
  context: SummaryContext,
): Promise<string> {
  try {
    const prompt = buildDailySummaryPrompt(context);
    const response = await llm.invoke([new HumanMessage(prompt)]);

    // BaseChatModel.invoke() retorna BaseMessageChunk com content string ou array
    if (typeof response.content === 'string') {
      return response.content;
    }
    // content pode ser array de { type: 'text', text: string } (Anthropic, vision models)
    const parts = response.content as Array<{ text?: string }>;
    return parts[0]?.text ?? FALLBACK_TEXT;
  } catch {
    return FALLBACK_TEXT;
  }
}
