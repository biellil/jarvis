/**
 * POST /internal/dispatch-action Tests — Phase 55 (LACT-01..05)
 *
 * Tests for the dispatch-action route handler.
 * Covers: valid dispatch, invalid payload, CLIENT_NOT_CONNECTED, timeout/throw.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock sendActionRequest BEFORE importing the router
vi.mock('../lib/action-dispatcher.js', () => ({
  sendActionRequest: vi.fn(),
}));

// Mock logger to suppress output in tests
vi.mock('../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { dispatchActionRouter } from '../routes/dispatch-action.js';
import { sendActionRequest } from '../lib/action-dispatcher.js';

const mockSendActionRequest = sendActionRequest as ReturnType<typeof vi.fn>;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/internal', dispatchActionRouter);
  return app;
}

const VALID_BODY = {
  clientId: 'test-client-001',
  action: 'openFolder' as const,
  path: '/home/user/Downloads/test',
  model: 'test-model',
};

describe('POST /internal/dispatch-action', () => {
  beforeEach(() => {
    mockSendActionRequest.mockClear();
  });

  it('Scenario 1 — valid payload + sendActionRequest returns confirmed → 200 { status, content }', async () => {
    mockSendActionRequest.mockResolvedValue({ status: 'confirmed', content: undefined });

    const app = createTestApp();
    const res = await request(app)
      .post('/internal/dispatch-action')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body).toEqual({ status: 'confirmed' });
    expect(mockSendActionRequest).toHaveBeenCalledTimes(1);
    expect(mockSendActionRequest).toHaveBeenCalledWith(VALID_BODY);
  });

  it('Scenario 2 — valid payload + viewContent returns content → 200 { status, content }', async () => {
    mockSendActionRequest.mockResolvedValue({ status: 'confirmed', content: 'file content here' });

    const body = { ...VALID_BODY, action: 'viewContent' as const };
    const app = createTestApp();
    const res = await request(app)
      .post('/internal/dispatch-action')
      .send(body)
      .expect(200);

    expect(res.body).toEqual({ status: 'confirmed', content: 'file content here' });
    expect(mockSendActionRequest).toHaveBeenCalledWith(body);
  });

  it('Scenario 3 — invalid payload (missing clientId) → 400 { error: "Invalid payload" }', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/internal/dispatch-action')
      .send({ action: 'openFolder', path: '/home/user/Downloads', model: 'x' })
      .expect(400);

    expect(res.body).toEqual({ error: 'Invalid payload' });
    expect(mockSendActionRequest).not.toHaveBeenCalled();
  });

  it('Scenario 4 — invalid payload (unknown action) → 400 { error: "Invalid payload" }', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/internal/dispatch-action')
      .send({ ...VALID_BODY, action: 'deleteFile' })
      .expect(400);

    expect(res.body).toEqual({ error: 'Invalid payload' });
    expect(mockSendActionRequest).not.toHaveBeenCalled();
  });

  it('Scenario 5 — sendActionRequest throws CLIENT_NOT_CONNECTED → 500 { error: message }', async () => {
    const errorMsg = 'CLIENT_NOT_CONNECTED: no active WS for clientId=test-client-001';
    mockSendActionRequest.mockRejectedValue(new Error(errorMsg));

    const app = createTestApp();
    const res = await request(app)
      .post('/internal/dispatch-action')
      .send(VALID_BODY)
      .expect(500);

    expect(res.body).toEqual({ error: errorMsg });
    expect(mockSendActionRequest).toHaveBeenCalledTimes(1);
  });

  it('Scenario 6 — sendActionRequest throws TIMEOUT → 500 { error: message }', async () => {
    const errorMsg = 'TIMEOUT: no ACK received within 12000ms for requestId=abc-123';
    mockSendActionRequest.mockRejectedValue(new Error(errorMsg));

    const app = createTestApp();
    const res = await request(app)
      .post('/internal/dispatch-action')
      .send(VALID_BODY)
      .expect(500);

    expect(res.body).toEqual({ error: errorMsg });
  });
});
