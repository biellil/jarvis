import { describe, it } from 'vitest';

describe('GET /api/proactive/stream', () => {
  it.todo('responds with Content-Type: text/event-stream');
  it.todo('emits event: proactive:fire with JSON data when proactiveEmitter fires');
  it.todo('sends heartbeat : ping every 30s');
  it.todo('cleans up listener on client disconnect');
});

describe('POST /api/proactive/:id/ack', () => {
  it.todo('returns 200 ok for valid id');
  it.todo('returns 400 for non-numeric id');
});
