import { describe, it } from 'vitest';

describe('POST /api/tasks/:taskId/resume', () => {
  it.todo('400 when body fails resumeRequestSchema validation');
  it.todo('404 when taskId is not in active controllers map');
  it.todo('400 when taskId fails UUID format validation (security defense in depth)');
  it.todo('with kind:"confirm" → invokes graph.stream(Command({resume:{kind:"confirm"}})) and pipes SSE');
  it.todo('with kind:"edit", feedback >500 chars → 400 (max length cap, T-66-01 mitigation)');
});

describe('POST /api/tasks/:taskId/cancel', () => {
  it.todo('aborts AbortController and updates state.cancelRequested=true');
  it.todo('404 when taskId not found');
  it.todo('200 + {status:"cancelling"} on success');
  it.todo('cleans up activeControllers.delete(taskId) after task:cancelled drains');
});
