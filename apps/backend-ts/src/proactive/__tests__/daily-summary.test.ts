import { describe, it } from 'vitest';

describe('DailySummaryGenerator', () => {
  it.todo('buildSummaryContext: collects last 24h messages from SQLite');
  it.todo('buildSummaryContext: collects last 24h actions from actions_log');
  it.todo('buildSummaryContext: collects upcoming reminders (24h lookahead)');
  it.todo('generate: returns pt-BR summary string from LLM');
  it.todo('generate: returns fallback string when LLM throws');
});
