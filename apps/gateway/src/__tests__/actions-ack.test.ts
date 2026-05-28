import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { actionsAckRouter } from '../routes/actions-ack.js';
import { pendingAckResolvers } from '../lib/ws-server.js';
import type { ActionAck } from '../lib/path-validator.js';

// Mock logger to suppress output in tests
vi.mock('../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', actionsAckRouter);
  return app;
}

describe('POST /api/actions/ack', () => {
  beforeEach(() => {
    pendingAckResolvers.clear();
  });

  it('returns 400 for missing requestId', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/actions/ack')
      .send({ status: 'confirmed' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid payload');
  });

  it('returns 400 for invalid status', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/actions/ack')
      .send({ requestId: '550e8400-e29b-41d4-a716-446655440000', status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no pending resolver exists', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/actions/ack')
      .send({ requestId: '550e8400-e29b-41d4-a716-446655440000', status: 'confirmed' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Request not found or already processed');
  });

  it('resolves pending resolver and returns { ok: true }', async () => {
    const app = buildApp();
    const requestId = '550e8400-e29b-41d4-a716-446655440001';
    let resolved: ActionAck | null = null;

    pendingAckResolvers.set(requestId, (ack) => {
      resolved = ack;
    });

    const res = await request(app)
      .post('/api/actions/ack')
      .send({ requestId, status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe('confirmed');
    expect(resolved!.requestId).toBe(requestId);
    // Resolver must be removed after resolution
    expect(pendingAckResolvers.has(requestId)).toBe(false);
  });

  it('resolver includes content for viewContent actions', async () => {
    const app = buildApp();
    const requestId = '550e8400-e29b-41d4-a716-446655440002';
    let resolved: ActionAck | null = null;

    pendingAckResolvers.set(requestId, (ack) => {
      resolved = ack;
    });

    await request(app)
      .post('/api/actions/ack')
      .send({ requestId, status: 'confirmed', content: 'file content here' });

    expect(resolved!.content).toBe('file content here');
  });

  it('returns 404 on second call with same requestId (no double-resolution)', async () => {
    const app = buildApp();
    const requestId = '550e8400-e29b-41d4-a716-446655440003';

    pendingAckResolvers.set(requestId, vi.fn());

    await request(app)
      .post('/api/actions/ack')
      .send({ requestId, status: 'confirmed' });

    // Second call — resolver already deleted
    const res2 = await request(app)
      .post('/api/actions/ack')
      .send({ requestId, status: 'confirmed' });

    expect(res2.status).toBe(404);
  });
});
