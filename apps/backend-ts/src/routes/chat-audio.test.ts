import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatAudioRouter } from './chat-audio.js';
import { SessionLock } from '../session/lock.js';
import { VoiceError } from '../voice/voice-handler.js';
import type { VoiceHandler, VoiceHandlerResult } from '../voice/voice-handler.js';

function makeApp(handler: VoiceHandler, lock: SessionLock) {
  const app = express();
  app.use('/', createChatAudioRouter(handler, lock));
  return app;
}

function stubHandler(
  impl: (buf: Buffer) => Promise<VoiceHandlerResult>,
): VoiceHandler {
  return { handle: vi.fn(impl) } as unknown as VoiceHandler;
}

const okResult: VoiceHandlerResult = {
  transcription: 'olá',
  message: 'oi!',
  audio: Buffer.from('FAKEAUDIO'),
  audioFormat: 'mp3',
  sttProvider: 'local',
  ttsProvider: 'elevenlabs',
};

describe('POST /chat/audio', () => {
  let lock: SessionLock;
  beforeEach(() => {
    lock = new SessionLock();
  });

  it('400 MISSING_FILE quando sem arquivo', async () => {
    const handler = stubHandler(async () => okResult);
    const res = await request(makeApp(handler, lock)).post('/chat/audio');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FILE');
  });

  it('400 INVALID_UPLOAD quando content-type inválido', async () => {
    const handler = stubHandler(async () => okResult);
    const res = await request(makeApp(handler, lock))
      .post('/chat/audio')
      .attach('audio', Buffer.from('hello'), {
        filename: 'r.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UPLOAD');
  });

  it('429 quando lock ocupado', async () => {
    const handler = stubHandler(async () => okResult);
    const release = lock.tryAcquire();
    expect(release).not.toBeNull();
    try {
      const res = await request(makeApp(handler, lock))
        .post('/chat/audio')
        .attach('audio', Buffer.from([1, 2, 3]), {
          filename: 'r.webm',
          contentType: 'audio/webm',
        });
      expect(res.status).toBe(429);
      expect(res.body.detail).toBe('Session busy — try again later');
    } finally {
      release!();
    }
  });

  it('happy path 200 com payload completo', async () => {
    const handler = stubHandler(async () => okResult);
    const res = await request(makeApp(handler, lock))
      .post('/chat/audio')
      .attach('audio', Buffer.from([1, 2, 3]), {
        filename: 'r.webm',
        contentType: 'audio/webm',
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      transcription: 'olá',
      message: 'oi!',
      audio_base64: Buffer.from('FAKEAUDIO').toString('base64'),
      audio_format: 'mp3',
      stt_provider: 'local',
      tts_provider: 'elevenlabs',
    });
    // lock liberado
    const r = lock.tryAcquire();
    expect(r).not.toBeNull();
    r!();
  });

  it('400 NO_SPEECH quando VoiceError NO_SPEECH', async () => {
    const handler = stubHandler(async () => {
      throw new VoiceError('NO_SPEECH', 'no speech detected');
    });
    const res = await request(makeApp(handler, lock))
      .post('/chat/audio')
      .attach('audio', Buffer.from([1, 2, 3]), {
        filename: 'r.webm',
        contentType: 'audio/webm',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_SPEECH');
  });

  it('500 STT_FAILED', async () => {
    const handler = stubHandler(async () => {
      throw new VoiceError('STT_FAILED', 'STT failed: boom');
    });
    const res = await request(makeApp(handler, lock))
      .post('/chat/audio')
      .attach('audio', Buffer.from([1, 2, 3]), {
        filename: 'r.webm',
        contentType: 'audio/webm',
      });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('STT_FAILED');
  });

  it('500 TTS_FAILED e lock liberado', async () => {
    const handler = stubHandler(async () => {
      throw new VoiceError('TTS_FAILED', 'TTS failed: boom');
    });
    const res = await request(makeApp(handler, lock))
      .post('/chat/audio')
      .attach('audio', Buffer.from([1, 2, 3]), {
        filename: 'r.webm',
        contentType: 'audio/webm',
      });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('TTS_FAILED');
    const r = lock.tryAcquire();
    expect(r).not.toBeNull();
    r!();
  });
});
