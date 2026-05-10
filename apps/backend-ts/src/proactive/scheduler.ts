/**
 * ProactiveScheduler — Phase 67 (D-02, D-03)
 *
 * Gerencia todo o timing proativo: cron jobs por lembrete + job diário recorrente.
 * Roda no backend-ts (serviço sempre-vivo).
 *
 * IMPORTANTE: jobs Map deve ser gerenciado explicitamente.
 * Em eventos terminais (fired/cancelled), chame destroy() para evitar ghost fires.
 *
 * Threat: T-67-01 — re-fetch da row + check status='pending' antes de qualquer mutação
 * garante idempotência mesmo se o cron disparar mais de uma vez.
 */
import * as cron from 'node-cron';
import { EventEmitter } from 'events';
import { db } from '../memory/db.js';
import { reminders } from '../memory/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { isInQuietHours, nextQuietEnd } from './quiet-hours.js';
import type { ProactiveEvent } from './types.js';
import { buildSummaryContext, generateDailySummary } from './summary-generator.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/** Shared EventEmitter — routes/proactive.ts faz subscribe em 'event' para encaminhar via SSE */
export const proactiveEmitter = new EventEmitter();

export class ProactiveScheduler {
  /**
   * reminderId → scheduled cron task.
   * Chave especial -1 = daily summary.
   */
  private static jobs = new Map<number, cron.ScheduledTask>();

  private static quietHours = {
    enabled: false,
    start: '22:00',
    end: '08:00',
  };

  /** LLM injetado pelo index.ts após ChatSession.create() (Plan 67-07). */
  private static llm: BaseChatModel | null = null;

  /**
   * Injeta o LLM usado para gerar o resumo diário.
   * Chamar em index.ts após `ChatSession.create()`.
   */
  static setLlm(llm: BaseChatModel): void {
    ProactiveScheduler.llm = llm;
  }

  /**
   * Chamar após as migrações DB no startup (index.ts).
   * Restaura todos os jobs pending/deferred persistidos.
   */
  static bootstrap(): void {
    const rows = db
      .select()
      .from(reminders)
      .where(inArray(reminders.status, ['pending', 'deferred']))
      .all();

    // Limpar jobs existentes antes de re-registrar (idempotente em restart)
    for (const [, task] of ProactiveScheduler.jobs) {
      task.destroy();
    }
    ProactiveScheduler.jobs.clear();

    for (const row of rows) {
      const dueAt = row.deferred_until ?? row.due_at;
      ProactiveScheduler.registerJob(row.id, dueAt);
    }
  }

  /**
   * Registra um cron job para um lembrete específico em dueAtMs epoch.
   * Se já existir job para esse id, destrói e recria (usado no deferred re-schedule).
   */
  static registerJob(reminderId: number, dueAtMs: number): void {
    // Destruir job existente se houver (re-schedule após deferral)
    ProactiveScheduler.jobs.get(reminderId)?.destroy();

    const due = new Date(dueAtMs);
    const minute = due.getMinutes();
    const hour = due.getHours();
    const day = due.getDate();
    const month = due.getMonth() + 1;
    // One-off: dispara no dia+mês específico, qualquer dia da semana
    const cronExpr = `${minute} ${hour} ${day} ${month} *`;

    const task = cron.schedule(
      cronExpr,
      () => {
        void ProactiveScheduler.fireReminder(reminderId);
      },
    );

    ProactiveScheduler.jobs.set(reminderId, task);
  }

  /**
   * Dispara um lembrete: respeita quiet hours.
   * - Em quiet: adia para o fim do quiet (status='deferred'), re-registra job.
   * - Fora do quiet: marca status='fired', emite evento SSE via proactiveEmitter.
   *
   * Idempotente: re-faz fetch do row e checa status='pending' antes de qualquer mutação.
   */
  static async fireReminder(reminderId: number): Promise<void> {
    const row = db
      .select()
      .from(reminders)
      .where(eq(reminders.id, reminderId))
      .get();

    if (!row || row.status !== 'pending') {
      // Já disparado, cancelado ou adiado por outro caminho — idempotente
      return;
    }

    const now = new Date();

    if (
      ProactiveScheduler.quietHours.enabled &&
      isInQuietHours(now, ProactiveScheduler.quietHours.start, ProactiveScheduler.quietHours.end)
    ) {
      const deferredUntil = nextQuietEnd(now, ProactiveScheduler.quietHours.end);
      db.update(reminders)
        .set({ status: 'deferred', deferred_until: deferredUntil.getTime() })
        .where(eq(reminders.id, reminderId))
        .run();
      // Re-agendar para o horário adiado
      ProactiveScheduler.registerJob(reminderId, deferredUntil.getTime());
    } else {
      db.update(reminders)
        .set({ status: 'fired', fired_at: Date.now() })
        .where(eq(reminders.id, reminderId))
        .run();
      // Emitir evento SSE (routes/proactive.ts faz subscribe)
      const event: ProactiveEvent = {
        kind: 'reminder',
        id: row.id,
        message: row.message,
        dueAt: row.due_at,
      };
      proactiveEmitter.emit('event', event);
      // Limpar job após disparar (evitar ghost fires)
      ProactiveScheduler.jobs.get(reminderId)?.destroy();
      ProactiveScheduler.jobs.delete(reminderId);
    }
  }

  /**
   * Cancela um lembrete: para o cron job + atualiza status no DB.
   */
  static cancelReminder(reminderId: number): void {
    ProactiveScheduler.jobs.get(reminderId)?.destroy();
    ProactiveScheduler.jobs.delete(reminderId);
    db.update(reminders)
      .set({ status: 'cancelled' })
      .where(eq(reminders.id, reminderId))
      .run();
  }

  /**
   * Registra ou atualiza o job recorrente do resumo diário.
   * Chave especial -1 no Map.
   */
  static registerDailySummaryJob(timeHHMM: string): void {
    ProactiveScheduler.jobs.get(-1)?.destroy();
    const [hStr, mStr] = timeHHMM.split(':');
    const h = parseInt(hStr ?? '9', 10);
    const m = parseInt(mStr ?? '0', 10);
    const cronExpr = `${m} ${h} * * *`;

    const task = cron.schedule(
      cronExpr,
      () => {
        void ProactiveScheduler.generateAndEmitDailySummary();
      },
    );
    ProactiveScheduler.jobs.set(-1, task);
  }

  /**
   * Chamado pelo cron do resumo diário.
   * Coleta contexto das últimas 24h, chama LLM, emite ProactiveEvent via proactiveEmitter.
   *
   * Se o LLM ainda não foi injetado (setLlm não chamado), loga aviso e retorna sem emitir.
   * generateDailySummary() nunca lança — fallback pt-BR garantido.
   */
  static async generateAndEmitDailySummary(): Promise<void> {
    if (!ProactiveScheduler.llm) {
      console.warn('[ProactiveScheduler] LLM not set — skipping daily summary (call setLlm first)');
      return;
    }

    const context = buildSummaryContext(db, new Date());
    const text = await generateDailySummary(ProactiveScheduler.llm, context);

    const event: ProactiveEvent = {
      kind: 'daily_summary',
      text,
      generatedAt: Date.now(),
    };
    proactiveEmitter.emit('event', event);
  }

  /**
   * Atualiza configuração de quiet hours em runtime (via Settings IPC).
   */
  static updateQuietHours(enabled: boolean, start: string, end: string): void {
    ProactiveScheduler.quietHours = { enabled, start, end };
  }

  /** Exposto para testes: quantidade de jobs ativos. */
  static get jobCount(): number {
    return ProactiveScheduler.jobs.size;
  }
}
