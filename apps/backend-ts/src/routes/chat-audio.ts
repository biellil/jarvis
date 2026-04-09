/**
 * Chat audio router — POST /chat/audio.
 *
 * Multipart upload (campo 'audio', max 25MB, memoryStorage) → VoiceHandler.handle →
 * JSON {transcription, message, audio_base64, audio_format, stt_provider, tts_provider}.
 *
 * Lock compartilhado com /chat (SessionLock) — 429 se ocupado. Libera sempre em finally.
 * Error mapping:
 *   EMPTY_AUDIO / NO_SPEECH → 400
 *   STT_FAILED / LLM_FAILED / TTS_FAILED → 500
 *   unknown → 500
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { VoiceHandler } from '../voice/voice-handler.js';
import type { SessionLock } from '../session/lock.js';

const BUSY_DETAIL = 'Session busy — try again later';

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
]);

export function createChatAudioRouter(
  handler: VoiceHandler,
  lock: SessionLock,
): Router {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mt = (file.mimetype || '').split(';')[0].trim().toLowerCase();
      if (ALLOWED_MIME.has(mt)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported audio content-type: ${file.mimetype}`));
      }
    },
  });

  router.post('/chat/audio', (req: Request, res: Response) => {
    upload.single('audio')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ detail: message, code: 'INVALID_UPLOAD' });
        return;
      }
      handleRequest(req, res, handler, lock).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        if (!res.headersSent) {
          res.status(500).json({ detail: message, code: 'UNKNOWN' });
        }
      });
    });
  });

  return router;
}

async function handleRequest(
  req: Request,
  res: Response,
  handler: VoiceHandler,
  lock: SessionLock,
): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file || !file.buffer || file.buffer.length === 0) {
    res.status(400).json({ detail: 'audio file required', code: 'MISSING_FILE' });
    return;
  }
  const release = lock.tryAcquire();
  if (!release) {
    res.status(429).json({ detail: BUSY_DETAIL });
    return;
  }
  try {
    const out = await handler.handle(file.buffer);
    res.json({
      transcription: out.transcription,
      message: out.message,
      audio_base64: out.audio.toString('base64'),
      audio_format: out.audioFormat,
      stt_provider: out.sttProvider,
      tts_provider: out.ttsProvider,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    const code = e.code ?? 'UNKNOWN';
    const status = code === 'EMPTY_AUDIO' || code === 'NO_SPEECH' ? 400 : 500;
    res.status(status).json({ detail: e.message, code });
  } finally {
    release();
  }
}
