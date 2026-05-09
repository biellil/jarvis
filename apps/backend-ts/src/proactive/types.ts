import { z } from 'zod';

// ============================================================
// Reminder interface (mirrors the Drizzle reminders table)
// ============================================================

export interface Reminder {
  id: number;
  due_at: number;        // epoch ms
  message: string;
  kind: 'reminder' | 'daily_summary' | 'folder_event';
  status: 'pending' | 'fired' | 'cancelled' | 'deferred';
  created_at: number;    // epoch ms
  fired_at: number | null;
  deferred_until: number | null;
}

// ============================================================
// Zod input schemas (D-06)
// ============================================================

const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

export const createReminderInputSchema = z.object({
  when: z.union([
    z.object({
      delayMs: z
        .number()
        .int('delayMs deve ser um inteiro.')
        .positive('delayMs deve ser positivo.')
        .max(MAX_DELAY_MS, `delayMs não pode exceder 30 dias (${MAX_DELAY_MS}ms).`),
    }),
    z.object({
      atIso: z
        .string()
        .datetime({ offset: true, message: 'atIso deve ser uma string ISO 8601 com timezone.' }),
    }),
  ]),
  message: z
    .string()
    .min(1, 'message não pode ser vazio.')
    .max(500, 'message não pode exceder 500 caracteres.'),
});

export type CreateReminderInput = z.infer<typeof createReminderInputSchema>;

export const cancelReminderInputSchema = z.object({
  query: z.string().min(1, 'query não pode ser vazio.'),
});

export type CancelReminderInput = z.infer<typeof cancelReminderInputSchema>;

// ============================================================
// ProactiveEvent discriminated union (backend-specific)
// ============================================================

export type ProactiveEvent =
  | { kind: 'reminder'; id: number; message: string; dueAt: number }
  | { kind: 'folder_event'; files: Array<{ name: string; path: string }>; folderPath: string }
  | { kind: 'daily_summary'; text: string; generatedAt: number };
