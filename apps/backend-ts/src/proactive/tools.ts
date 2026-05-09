import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ZodError } from 'zod';
import type { RemindersRepository } from './repository.js';
import { createReminderInputSchema, cancelReminderInputSchema } from './types.js';

// ============================================================
// Helper: ms → human-readable pt-BR string
// ============================================================

const MS_MINUTE = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

export function msToHumanPtBR(ms: number): string {
  if (ms < MS_HOUR) {
    const minutes = Math.round(ms / MS_MINUTE);
    return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }
  if (ms < MS_DAY) {
    const hours = Math.round(ms / MS_HOUR);
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  const days = Math.round(ms / MS_DAY);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

// ============================================================
// Helper: format due_at epoch ms to dd/MM às HH:mm (pt-BR)
// ============================================================

function formatDueAt(dueAt: number): string {
  const d = new Date(dueAt);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} às ${hours}:${minutes}`;
}

// ============================================================
// createReminderTool
// ============================================================

/**
 * LangChain tool: cria um lembrete no SQLite.
 * Nunca lança — retorna string pt-BR com resultado ou erro.
 */
export function createReminderTool(repo: RemindersRepository) {
  return tool(
    async (input: unknown): Promise<string> => {
      try {
        const parsed = createReminderInputSchema.parse(input);

        const now = Date.now();
        let confirmText: string;

        if ('delayMs' in parsed.when) {
          confirmText = `pra daqui ${msToHumanPtBR(parsed.when.delayMs)}`;
        } else {
          const dueAt = new Date(parsed.when.atIso).getTime();
          confirmText = `para ${formatDueAt(dueAt)}`;
        }

        repo.create(parsed);
        return `Lembrete criado ${confirmText}: ${parsed.message}.`;
      } catch (err) {
        if (err instanceof ZodError) {
          // Zod v4 usa .issues (não .errors)
          const issues = (err as any).issues as Array<{ message: string }> | undefined;
          const msg = issues ? issues.map((e) => e.message).join('; ') : err.message;
          return `Erro de validação: ${msg}`;
        }
        return `Erro ao criar lembrete: ${(err as Error).message}`;
      }
    },
    {
      name: 'create_reminder',
      description:
        'Cria um lembrete agendado. Use when.delayMs para "em X minutos/horas" ou when.atIso para horário específico em ISO 8601.',
      schema: z.object({
        when: z.union([
          z.object({ delayMs: z.number().describe('Delay em milissegundos a partir de agora.') }),
          z.object({ atIso: z.string().describe('Horário exato em ISO 8601 com timezone.') }),
        ]),
        message: z.string().describe('Texto do lembrete (1-500 caracteres).'),
      }),
    },
  );
}

// ============================================================
// listRemindersTool
// ============================================================

/**
 * LangChain tool: lista lembretes pendentes em pt-BR.
 */
export function listRemindersTool(repo: RemindersRepository) {
  return tool(
    async (): Promise<string> => {
      try {
        const items = repo.list();
        if (items.length === 0) {
          return 'Nenhum lembrete pendente.';
        }

        const now = Date.now();
        const lines = items.map((r, idx) => {
          const remaining = r.due_at - now;
          const timeStr = remaining > 0 ? `em ${msToHumanPtBR(remaining)}` : 'agora';
          return `${idx + 1}. ${r.message} (${timeStr})`;
        });

        return lines.join('\n');
      } catch (err) {
        return `Erro ao listar lembretes: ${(err as Error).message}`;
      }
    },
    {
      name: 'list_reminders',
      description: 'Lista todos os lembretes pendentes do usuário.',
      schema: z.object({}),
    },
  );
}

// ============================================================
// cancelReminderTool
// ============================================================

/**
 * LangChain tool: cancela um lembrete por busca fuzzy no texto.
 * Desambigua se houver mais de um resultado.
 */
export function cancelReminderTool(repo: RemindersRepository) {
  return tool(
    async ({ query }: { query: string }): Promise<string> => {
      try {
        const parsed = cancelReminderInputSchema.parse({ query });
        const matches = repo.fuzzyFind(parsed.query);

        if (matches.length === 0) {
          return 'Não achei lembrete com esse texto.';
        }

        if (matches.length === 1) {
          const [r] = matches;
          repo.cancelById(r.id);
          return `Cancelado: ${r.message}.`;
        }

        // Ambiguous — return disambiguation list
        const lines = matches
          .map((r, idx) => `${idx + 1}. ${r.message}`)
          .join('\n');
        return `Encontrei mais de um lembrete:\n${lines}\nQual você quer cancelar?`;
      } catch (err) {
        if (err instanceof ZodError) {
          // Zod v4 usa .issues (não .errors)
          const issues = (err as any).issues as Array<{ message: string }> | undefined;
          const msg = issues ? issues.map((e) => e.message).join('; ') : err.message;
          return `Erro de validação: ${msg}`;
        }
        return `Erro ao cancelar lembrete: ${(err as Error).message}`;
      }
    },
    {
      name: 'cancel_reminder',
      description:
        'Cancela um lembrete por busca no texto. query = parte do texto do lembrete a cancelar.',
      schema: cancelReminderInputSchema,
    },
  );
}
