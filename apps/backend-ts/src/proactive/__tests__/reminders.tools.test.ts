import { describe, it } from 'vitest';

describe('createReminderTool', () => {
  it.todo('returns pt-BR confirmation string on success');
  it.todo('rejects invalid delayMs (negative, zero, over 30 days)');
  it.todo('rejects invalid atIso (non-ISO string)');
  it.todo('rejects message over 500 chars');
});

describe('listRemindersTool', () => {
  it.todo('returns pt-BR formatted list of pending reminders');
  it.todo('returns "Nenhum lembrete pendente" when list is empty');
});

describe('cancelReminderTool', () => {
  it.todo('returns pt-BR confirmation on successful cancel');
  it.todo('returns "Não achei lembrete" when query matches nothing');
  it.todo('returns disambiguated list when query matches multiple');
});
