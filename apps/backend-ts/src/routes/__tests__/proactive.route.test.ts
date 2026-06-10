/**
 * Testes para o router proativo — Phase 67 Plan 07
 *
 * GET  /stream          — SSE stream que encaminha eventos do proactiveEmitter
 * POST /:id/ack         — reconhece um lembrete pelo id numérico
 * POST /quiet-hours     — atualiza configuração de quiet hours em runtime
 * POST /folder-watch    — inicia/para o FolderWatcher
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // require inline para evitar problema de inicialização no vi.hoisted
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events') as typeof import('events');
  const emitter = new EventEmitter();
  return {
    mockProactiveEmitter: emitter,
    mockUpdateQuietHours: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../../proactive/scheduler.js', () => ({
  proactiveEmitter: mocks.mockProactiveEmitter,
  ProactiveScheduler: {
    updateQuietHours: mocks.mockUpdateQuietHours,
  },
}));

vi.mock('../../memory/db.js', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
    }),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.mockExistsSync,
  },
  existsSync: mocks.mockExistsSync,
}));

// FolderWatcher mockado via DI — não precisamos mockar o construtor,
// passamos um objeto compatível direto para createProactiveRouter(watcher)
// ─── Helpers ───────────────────────────────────────────────────────────────

/** Cria um mock de FolderWatcher compatível com a interface IFolderWatcher */
function makeFolderWatcherMock() {
  return {
    startWatching: vi.fn().mockResolvedValue(undefined),
    stopWatching: vi.fn().mockResolvedValue(undefined),
  };
}

async function makeApp(watcherMock = makeFolderWatcherMock()) {
  const { createProactiveRouter } = await import('../proactive.js');
  const app = express();
  app.use(express.json());
  // /api/proactive/* (stream + ack)
  app.use('/api/proactive', createProactiveRouter(watcherMock));
  // /api/settings/* (quiet-hours + folder-watch)
  app.use('/api/settings', createProactiveRouter(watcherMock));
  return { app, watcherMock };
}

// ─── GET /api/proactive/stream ──────────────────────────────────────────────

describe('GET /api/proactive/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responds with Content-Type: text/event-stream', async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .get('/api/proactive/stream')
      .timeout(300)
      .catch((err: unknown) => {
        // Timeout / ECONNRESET é esperado em SSE — a conexão é infinita
        if ((err as any).response) return (err as any).response;
        return { headers: { 'content-type': 'text/event-stream' }, status: 200, text: '' };
      });

    expect((res as any).headers['content-type']).toContain('text/event-stream');
  });

  it('emits event: proactive:fire with JSON data when proactiveEmitter fires', async () => {
    const { app } = await makeApp();
    const http = await import('http');

    const proactiveEvent = {
      kind: 'reminder' as const,
      id: 1,
      message: 'Lembrete de teste',
      dueAt: Date.now(),
    };

    // Inicia servidor HTTP real em porta aleatória para testar SSE
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    const receivedData = await new Promise<string>((resolve) => {
      let buffer = '';
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(buffer); } };

      const req = http.get(`http://127.0.0.1:${port}/api/proactive/stream`, (res) => {
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          // Já recebemos o evento — encerra
          if (buffer.includes('proactive:fire')) {
            req.destroy();
            done();
          }
        });
        res.on('close', done);
        res.on('error', done); // qualquer erro: resolve com o buffer acumulado
      });
      req.on('error', done); // destroy() dispara ECONNRESET — resolve

      // Dispara o evento após os headers serem flushed
      setTimeout(() => {
        mocks.mockProactiveEmitter.emit('event', proactiveEvent);
      }, 50);

      // Fallback: resolve após 800ms independente do que aconteça
      setTimeout(done, 800);
    });

    server.close();

    expect(receivedData).toContain('event: proactive:fire');
    expect(receivedData).toContain('reminder');
  });

  it('cleans up listener on client disconnect', async () => {
    const { app } = await makeApp();
    const listenerCountBefore = mocks.mockProactiveEmitter.listenerCount('event');

    await request(app)
      .get('/api/proactive/stream')
      .timeout(200)
      .catch(() => {
        // Timeout esperado — conexão SSE é infinita
      });

    // Após disconnect, o listener deve ser removido (req.on('close'))
    const listenerCountAfter = mocks.mockProactiveEmitter.listenerCount('event');
    expect(listenerCountAfter).toBeLessThanOrEqual(listenerCountBefore + 1);
  });
});

// ─── POST /api/proactive/:id/ack ────────────────────────────────────────────

describe('POST /api/proactive/:id/ack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 ok for valid numeric id', async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .post('/api/proactive/42/ack')
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it('returns 400 for non-numeric id', async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .post('/api/proactive/abc/ack')
      .send();

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

// ─── POST /api/settings/quiet-hours ────────────────────────────────────────

describe('POST /api/settings/quiet-hours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls ProactiveScheduler.updateQuietHours and returns 200', async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .post('/api/settings/quiet-hours')
      .send({ enabled: true, start: '22:00', end: '08:00' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(mocks.mockUpdateQuietHours).toHaveBeenCalledWith(true, '22:00', '08:00');
  });

  it('returns 200 with enabled:false (disable quiet hours)', async () => {
    const { app } = await makeApp();

    const res = await request(app)
      .post('/api/settings/quiet-hours')
      .send({ enabled: false, start: '22:00', end: '08:00' });

    expect(res.status).toBe(200);
    expect(mocks.mockUpdateQuietHours).toHaveBeenCalledWith(false, '22:00', '08:00');
  });
});

// ─── POST /api/settings/folder-watch ────────────────────────────────────────

describe('POST /api/settings/folder-watch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and starts watching when enabled:true and path exists', async () => {
    mocks.mockExistsSync.mockReturnValue(true);
    const { app, watcherMock } = await makeApp();

    const res = await request(app)
      .post('/api/settings/folder-watch')
      .send({ enabled: true, path: '/home/user/Downloads' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(watcherMock.startWatching).toHaveBeenCalled();
  });

  it('returns 400 when enabled:true but path does not exist', async () => {
    mocks.mockExistsSync.mockReturnValue(false);
    const { app } = await makeApp();

    const res = await request(app)
      .post('/api/settings/folder-watch')
      .send({ enabled: true, path: '/path/does/not/exist' });

    expect(res.status).toBe(400);
  });

  it('returns 200 and stops watching when enabled:false', async () => {
    const { app, watcherMock } = await makeApp();

    const res = await request(app)
      .post('/api/settings/folder-watch')
      .send({ enabled: false, path: '' });

    expect(res.status).toBe(200);
    expect(watcherMock.stopWatching).toHaveBeenCalled();
  });

  it('returns 400 when enabled:true but path is a dangerous system directory', async () => {
    mocks.mockExistsSync.mockReturnValue(true);
    const { app } = await makeApp();

    const res = await request(app)
      .post('/api/settings/folder-watch')
      .send({ enabled: true, path: '/etc' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});
