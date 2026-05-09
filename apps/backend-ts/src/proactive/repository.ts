import { eq, inArray, like } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { reminders } from '../memory/schema.js';
import type { Reminder, CreateReminderInput } from './types.js';
import { createReminderInputSchema } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = BetterSQLite3Database<any>;

const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * CRUD synchronous operations for the `reminders` table.
 * All methods use better-sqlite3 (sync) via Drizzle ORM.
 *
 * Accepts a Drizzle db instance to allow injection in tests.
 */
export class RemindersRepository {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * Insert a new reminder.
   * Validates input via Zod — throws ZodError on invalid data.
   */
  create(input: CreateReminderInput): number {
    // Validate via Zod schema (throws on invalid input)
    const parsed = createReminderInputSchema.parse(input);

    const now = Date.now();
    let due_at: number;

    if ('delayMs' in parsed.when) {
      due_at = now + parsed.when.delayMs;
    } else {
      due_at = new Date(parsed.when.atIso).getTime();
    }

    const result = this.db
      .insert(reminders)
      .values({
        due_at,
        message: parsed.message,
        kind: 'reminder',
        status: 'pending',
        created_at: now,
      })
      .returning({ id: reminders.id })
      .get();

    if (!result) {
      throw new Error('Falha ao inserir lembrete no banco de dados.');
    }

    return result.id;
  }

  /**
   * Returns all pending and deferred reminders ordered by due_at ascending.
   */
  list(): Reminder[] {
    return this.db
      .select()
      .from(reminders)
      .where(inArray(reminders.status, ['pending', 'deferred']))
      .orderBy(reminders.due_at)
      .all() as Reminder[];
  }

  /**
   * Cancels a reminder by ID (sets status to 'cancelled').
   */
  cancelById(id: number): void {
    this.db
      .update(reminders)
      .set({ status: 'cancelled' })
      .where(eq(reminders.id, id))
      .run();
  }

  /**
   * Fuzzy search: returns all pending/deferred reminders whose message contains query.
   */
  fuzzyFind(query: string): Reminder[] {
    return this.db
      .select()
      .from(reminders)
      .where(like(reminders.message, `%${query}%`))
      .all()
      .filter((r) => r.status === 'pending' || r.status === 'deferred') as Reminder[];
  }
}
