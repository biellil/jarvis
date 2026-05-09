/**
 * Tests for POST /api/tasks/:taskId/{resume,cancel} — Phase 66 Plan 03
 *
 * Behaviors 6-13 from the plan. Uses supertest + Express test app harness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTasksRouter, activeControllers, activeGraphs } from '../tasks.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const VALID_TASK_ID = 'chat-session-abc-task-550e8400-e29b-41d4-a716-446655440000';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter());
  return app;
}

/** Build a minimal graph mock that tracks calls */
function makeGraphMock(opts: {
  streamEvents?: Array<{ kind: string; [k: string]: unknown }>;
  snapshot?: { tasks: Array<{ interrupts: Array<{ value: unknown }> }> };
  updateStateSpy?: ReturnType<typeof vi.fn>;
} = {}) {
  const events = opts.streamEvents ?? [];
  const snapshot = opts.snapshot ?? { tasks: [] };
  const updateStateSpy = opts.updateStateSpy ?? vi.fn().mockResolvedValue(undefined);

  return {
    stream: vi.fn().mockImplementation(async () => {
      // Return async iterable of [mode, chunk] tuples
      return (async function* () {
        for (const evt of events) {
          yield ['custom', evt];
        }
      })();
    }),
    getState: vi.fn().mockResolvedValue(snapshot),
    updateState: updateStateSpy,
    invoke: vi.fn(),
  };
}

// ─── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  activeControllers.clear();
  activeGraphs.clear();
});

afterEach(() => {
  activeControllers.clear();
  activeGraphs.clear();
  vi.restoreAllMocks();
});

// ─── POST /api/tasks/:taskId/resume ────────────────────────────────────────

describe('POST /api/tasks/:taskId/resume', () => {
  it('Behavior 6: 400 when body fails resumeRequestSchema validation (missing kind)', async () => {
    const graph = makeGraphMock();
    activeGraphs.set(VALID_TASK_ID, graph as any);
    activeControllers.set(VALID_TASK_ID, new AbortController());

    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/resume`)
      .send({ notAValidField: 'oops' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('Behavior 6: 400 when feedback exceeds 500 chars (T-66-01 blast-radius cap)', async () => {
    const graph = makeGraphMock();
    activeGraphs.set(VALID_TASK_ID, graph as any);
    activeControllers.set(VALID_TASK_ID, new AbortController());

    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/resume`)
      .send({ kind: 'edit', feedback: 'x'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('Behavior 7: 404 when taskId is not in activeGraphs map', async () => {
    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/resume`)
      .send({ kind: 'confirm' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('não encontrada');
  });

  it('Behavior 8: 400 when taskId fails UUID format validation (security T-66-03-02)', async () => {
    // Use a taskId that looks like path traversal but Express routes as literal string segment
    const res = await request(makeApp())
      .post('/api/tasks/invalid-task-id-without-uuid/resume')
      .send({ kind: 'confirm' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('malformado');
  });

  it('Behavior 8: 400 on taskId with SQL injection attempt', async () => {
    const res = await request(makeApp())
      .post("/api/tasks/'; DROP TABLE tasks; --/resume")
      .send({ kind: 'confirm' });

    // Express might not route this at all — either 400 or 404 is acceptable
    expect([400, 404]).toContain(res.status);
  });

  it('Behavior 6: kind:"confirm" → invokes graph.stream(Command({resume})) and streams SSE events', async () => {
    const graph = makeGraphMock({
      streamEvents: [{ kind: 'task:step:start', stepId: 1, description: 'step 1' }],
      snapshot: { tasks: [] },
    });
    activeGraphs.set(VALID_TASK_ID, graph as any);
    activeControllers.set(VALID_TASK_ID, new AbortController());

    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/resume`)
      .send({ kind: 'confirm' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(graph.stream).toHaveBeenCalled();
    // Response body should contain the event
    expect(res.text).toContain('task:step:start');
  });

  it('Behavior 12: after task:done event, activeControllers and activeGraphs are cleaned up', async () => {
    const graph = makeGraphMock({
      streamEvents: [{ kind: 'task:done', summary: 'Tarefa concluída' }],
      snapshot: { tasks: [] },
    });
    // Mock deleteThread
    const { taskCheckpointer } = await import('../../agent/graph.js');
    const deleteThreadSpy = vi.spyOn(taskCheckpointer, 'deleteThread').mockResolvedValue(undefined as any);

    activeGraphs.set(VALID_TASK_ID, graph as any);
    activeControllers.set(VALID_TASK_ID, new AbortController());

    await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/resume`)
      .send({ kind: 'confirm' });

    expect(activeControllers.has(VALID_TASK_ID)).toBe(false);
    expect(activeGraphs.has(VALID_TASK_ID)).toBe(false);
    deleteThreadSpy.mockRestore();
  });
});

// ─── POST /api/tasks/:taskId/cancel ────────────────────────────────────────

describe('POST /api/tasks/:taskId/cancel', () => {
  it('Behavior 9: calls controller.abort() AND graph.updateState({cancelRequested:true})', async () => {
    const updateStateSpy = vi.fn().mockResolvedValue(undefined);
    const graph = makeGraphMock({ updateStateSpy });
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');

    activeControllers.set(VALID_TASK_ID, controller);
    activeGraphs.set(VALID_TASK_ID, graph as any);

    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/cancel`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'cancelling' });
    expect(abortSpy).toHaveBeenCalled();
    expect(updateStateSpy).toHaveBeenCalledWith(
      { configurable: { thread_id: VALID_TASK_ID } },
      { cancelRequested: true },
    );
  });

  it('Behavior 10: 404 when taskId not found in activeControllers', async () => {
    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/cancel`)
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('não encontrada');
  });

  it('Behavior 9: 200 + {status:"cancelling"} on success', async () => {
    const graph = makeGraphMock();
    activeControllers.set(VALID_TASK_ID, new AbortController());
    activeGraphs.set(VALID_TASK_ID, graph as any);

    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/cancel`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelling');
  });

  it('Behavior 13: AGENT-04 — cancel is source-agnostic (same endpoint regardless of trigger)', async () => {
    const updateStateSpy = vi.fn().mockResolvedValue(undefined);
    const graph = makeGraphMock({ updateStateSpy });
    activeControllers.set(VALID_TASK_ID, new AbortController());
    activeGraphs.set(VALID_TASK_ID, graph as any);

    // Simulate both a renderer-button cancel and a voice cancel — same endpoint
    const res1 = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/cancel`)
      .set('x-cancel-source', 'renderer-button')
      .send();

    expect(res1.status).toBe(200);
    // Reset for voice cancel simulation
    activeControllers.set(VALID_TASK_ID, new AbortController());
    activeGraphs.set(VALID_TASK_ID, graph as any);

    const res2 = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/cancel`)
      .set('x-cancel-source', 'voice')
      .send();

    expect(res2.status).toBe(200);
  });
});

// ─── SSE format ────────────────────────────────────────────────────────────

describe('SSE event format', () => {
  it('Behavior 11: emits "event: task:step:start\\ndata: ...\\n\\n" format (NOT bare data:)', async () => {
    const graph = makeGraphMock({
      streamEvents: [{ kind: 'task:step:start', stepId: 1, description: 'step 1' }],
      snapshot: { tasks: [] },
    });
    activeGraphs.set(VALID_TASK_ID, graph as any);
    activeControllers.set(VALID_TASK_ID, new AbortController());

    const res = await request(makeApp())
      .post(`/api/tasks/${VALID_TASK_ID}/resume`)
      .send({ kind: 'confirm' });

    // Must have "event: task:step:start" line (not just bare "data:")
    expect(res.text).toContain('event: task:step:start');
    expect(res.text).toContain('data: ');
  });
});
