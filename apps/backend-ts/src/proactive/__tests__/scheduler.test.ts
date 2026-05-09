import { describe, it } from 'vitest';

describe('ProactiveScheduler', () => {
  it.todo('bootstrap: registers cron jobs for all pending reminders');
  it.todo('bootstrap: registers cron jobs for all deferred reminders');
  it.todo('fireReminder: updates status to fired and emits SSE event');
  it.todo('fireReminder: defers when in quiet hours, sets deferred_until');
  it.todo('cancel: destroys cron job and updates status to cancelled');
});
