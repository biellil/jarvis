import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createChatRouter } from './chat.js';
import { SessionLock } from '../session/lock.js';
import type { ChatSession } from '../session/chat-session.js';

function makeApp(session: ChatSession, lock: SessionLock) {
  const app = express();
  app.use(express.json());
  app.use('/', createChatRouter(session, lock));
  return app;
}

function mockSession(overrides: Partial<{
  send: (t: string) => Promise<string>;
  sendStream: (t: string) => AsyncGenerator<string, void, unknown>;
}> = {}): ChatSession {
  const defaults = {
    send: vi.fn().mockResolvedValue('olá do mock'),
    sendStream: async function* () {
      yield 'a';
      yield 'b';
      yield 'c';
    },
    setDispatchListener: vi.fn(),
    clearDispatchListener: vi.fn(),
  };
  return { ...defaults, ...overrides } as unknown as ChatSession;
}

describe('POST /chat', () => {
  it('happy path retorna 200 com {message}', async () => {
    const session = mockSession();
    const app = makeApp(session, new SessionLock());
    const res = await request(app).post('/chat').send({ message: 'oi' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'olá do mock' });
    expect(session.send).toHaveBeenCalledWith('oi');
  });

  it('retorna 400 quando body não tem message', async () => {
    const app = makeApp(mockSession(), new SessionLock());
    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeTruthy();
  });

  it('retorna 429 quando lock está ocupado', async () => {
    const lock = new SessionLock();
    const release = lock.tryAcquire()!;
    const app = makeApp(mockSession(), lock);
    const res = await request(app).post('/chat').send({ message: 'oi' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ detail: 'Session busy — try again later' });
    release();
  });

  it('libera lock mesmo quando session.send lança', async () => {
    const lock = new SessionLock();
    const session = mockSession({
      send: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok'),
    });
    const app = makeApp(session, lock);
    const res1 = await request(app).post('/chat').send({ message: 'x' });
    expect(res1.status).toBe(500);
    expect(lock.isBusy()).toBe(false);
    const res2 = await request(app).post('/chat').send({ message: 'y' });
    expect(res2.status).toBe(200);
    expect(res2.body.message).toBe('ok');
  });
});

describe('GET /chat/stream', () => {
  it('retorna SSE com data: <token>\\n\\n por token', async () => {
    const app = makeApp(mockSession(), new SessionLock());
    const res = await request(app).get('/chat/stream').query({ message: 'oi' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toBe('data: a\n\ndata: b\n\ndata: c\n\n');
  });

  it('retorna 400 sem query message', async () => {
    const app = makeApp(mockSession(), new SessionLock());
    const res = await request(app).get('/chat/stream');
    expect(res.status).toBe(400);
  });

  it('retorna 429 quando lock ocupado', async () => {
    const lock = new SessionLock();
    const release = lock.tryAcquire()!;
    const app = makeApp(mockSession(), lock);
    const res = await request(app).get('/chat/stream').query({ message: 'oi' });
    expect(res.status).toBe(429);
    release();
  });

  it('libera lock após stream completo', async () => {
    const lock = new SessionLock();
    const app = makeApp(mockSession(), lock);
    await request(app).get('/chat/stream').query({ message: 'oi' });
    expect(lock.isBusy()).toBe(false);
  });
});
