import { describe, it } from 'vitest';

describe('RemindersRepository', () => {
  it.todo('create: inserts reminder with delayMs converted to due_at epoch ms');
  it.todo('create: inserts reminder with atIso converted to due_at epoch ms');
  it.todo('list: returns all pending reminders sorted by due_at');
  it.todo('cancel: updates status to cancelled and stops cron job');
  it.todo('message max length: rejects messages over 500 chars');
  it.todo('delayMs max: rejects delayMs over 30 days');
});
