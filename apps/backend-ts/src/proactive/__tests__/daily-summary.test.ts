import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessageChunk } from '@langchain/core/messages';

// Factory helpers — cria um mock mínimo de BetterSQLite3Database
function makeDb(rows: {
  messages?: Array<{ content: string }>;
  actionsLog?: Array<{ action: string; path: string }>;
  reminders?: Array<{ message: string; due_at: number }>;
}): BetterSQLite3Database {
  // all() retorna os rows mockados; get() retorna undefined (não usado em buildSummaryContext)
  const makeSelect = (returnRows: unknown[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnValue(returnRows),
  });

  return {
    select: vi
      .fn()
      // Chamada 1 → messages; 2 → actionsLog; 3 → reminders
      .mockReturnValueOnce(makeSelect(rows.messages ?? []))
      .mockReturnValueOnce(makeSelect(rows.actionsLog ?? []))
      .mockReturnValueOnce(makeSelect(rows.reminders ?? [])),
  } as unknown as BetterSQLite3Database;
}

// Cria mock mínimo de BaseChatModel
function makeLlm(response: string | Error): BaseChatModel {
  return {
    invoke: response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue({
          content: response,
        } as unknown as BaseMessageChunk),
  } as unknown as BaseChatModel;
}

describe('DailySummaryGenerator', () => {
  let buildSummaryContext: typeof import('../summary-generator.js').buildSummaryContext;
  let buildDailySummaryPrompt: typeof import('../summary-generator.js').buildDailySummaryPrompt;
  let generateDailySummary: typeof import('../summary-generator.js').generateDailySummary;

  beforeEach(async () => {
    const mod = await import('../summary-generator.js');
    buildSummaryContext = mod.buildSummaryContext;
    buildDailySummaryPrompt = mod.buildDailySummaryPrompt;
    generateDailySummary = mod.generateDailySummary;
  });

  // ----------------------------------------------------------------
  // buildSummaryContext
  // ----------------------------------------------------------------

  it('buildSummaryContext: collects last 24h messages from SQLite', () => {
    const db = makeDb({
      messages: [
        { content: 'me lembra de revisar o PR em 30 minutos' },
        { content: 'qual é o clima hoje?' },
      ],
    });
    const now = new Date('2026-05-09T12:00:00Z');
    const ctx = buildSummaryContext(db, now);

    expect(ctx.messagesSummary).toContain('me lembra de revisar o PR');
    expect(ctx.messagesSummary).toContain('qual é o clima hoje?');
    // deve ser numerada
    expect(ctx.messagesSummary).toMatch(/^1\./m);
  });

  it('buildSummaryContext: returns pt-BR fallback when no messages', () => {
    const db = makeDb({ messages: [] });
    const now = new Date('2026-05-09T12:00:00Z');
    const ctx = buildSummaryContext(db, now);

    expect(ctx.messagesSummary).toBe('Nenhuma conversa nas últimas 24h.');
  });

  it('buildSummaryContext: collects last 24h actions from actions_log', () => {
    const db = makeDb({
      actionsLog: [
        { action: 'openFile', path: '/home/user/Downloads/invoice.pdf' },
      ],
    });
    const now = new Date('2026-05-09T12:00:00Z');
    const ctx = buildSummaryContext(db, now);

    // deve incluir ação + basename do path (não path completo — T-67-05 threat)
    expect(ctx.actionsSummary).toContain('openFile');
    expect(ctx.actionsSummary).toContain('invoice.pdf');
    // não deve expor o path completo
    expect(ctx.actionsSummary).not.toContain('/home/user/Downloads');
  });

  it('buildSummaryContext: returns pt-BR fallback when no actions', () => {
    const db = makeDb({ actionsLog: [] });
    const now = new Date('2026-05-09T12:00:00Z');
    const ctx = buildSummaryContext(db, now);

    expect(ctx.actionsSummary).toBe('Nenhuma ação executada.');
  });

  it('buildSummaryContext: collects upcoming reminders (24h lookahead)', () => {
    const now = new Date('2026-05-09T12:00:00Z');
    const due = new Date('2026-05-09T14:00:00Z');

    const db = makeDb({
      reminders: [{ message: 'Reunião importante', due_at: due.getTime() }],
    });
    const ctx = buildSummaryContext(db, now);

    // Formata o horário esperado no timezone local do processo (igual à implementação)
    const hh = String(due.getHours()).padStart(2, '0');
    const mm = String(due.getMinutes()).padStart(2, '0');
    const expectedTime = `${hh}:${mm}`;

    expect(ctx.upcomingReminders).toContain('Reunião importante');
    // deve incluir horário formatado no timezone local
    expect(ctx.upcomingReminders).toContain(expectedTime);
  });

  it('buildSummaryContext: returns pt-BR fallback when no reminders', () => {
    const db = makeDb({ reminders: [] });
    const now = new Date('2026-05-09T12:00:00Z');
    const ctx = buildSummaryContext(db, now);

    expect(ctx.upcomingReminders).toBe('Nenhum lembrete.');
  });

  // ----------------------------------------------------------------
  // buildDailySummaryPrompt
  // ----------------------------------------------------------------

  it('buildDailySummaryPrompt: contains D-16 pt-BR system instructions', () => {
    const ctx = {
      messagesSummary: 'msgs aqui',
      actionsSummary: 'ações aqui',
      upcomingReminders: 'lembretes aqui',
    };
    const prompt = buildDailySummaryPrompt(ctx);

    expect(prompt).toContain('Você é o JARVIS');
    expect(prompt).toContain('pt-BR');
    expect(prompt).toContain('3-5 frases');
    expect(prompt).toContain('msgs aqui');
    expect(prompt).toContain('ações aqui');
    expect(prompt).toContain('lembretes aqui');
  });

  // ----------------------------------------------------------------
  // generateDailySummary
  // ----------------------------------------------------------------

  it('generate: returns pt-BR summary string from LLM', async () => {
    const llm = makeLlm('Hoje foi um dia produtivo! Conversamos sobre o PR e o clima.');
    const ctx = {
      messagesSummary: '1. Revisão do PR',
      actionsSummary: 'Nenhuma ação executada.',
      upcomingReminders: 'Nenhum lembrete.',
    };
    const result = await generateDailySummary(llm, ctx);

    expect(result).toBe('Hoje foi um dia produtivo! Conversamos sobre o PR e o clima.');
  });

  it('generate: returns fallback string when LLM throws', async () => {
    const llm = makeLlm(new Error('LLM timeout'));
    const ctx = {
      messagesSummary: '1. Revisão do PR',
      actionsSummary: 'Nenhuma ação executada.',
      upcomingReminders: 'Nenhum lembrete.',
    };
    const result = await generateDailySummary(llm, ctx);

    expect(result).toBe('Não consegui gerar o resumo diário neste horário.');
  });
});
