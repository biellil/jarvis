/**
 * Chat router — paridade 1:1 com src/jarvis/api/routes/chat.py.
 *
 * - POST /chat  body {message: string} → {message: string}. 429 se lock ocupado.
 * - GET  /chat/stream?message=... → SSE `data: <token>\n\n`. 429 se lock ocupado.
 *
 * O lock é injetado via closure (DI). Libera sempre em try/finally, inclusive quando
 * o handler lança.
 */
import { Router, type Request, type Response } from 'express';
import type { ChatSession } from '../session/chat-session.js';
import type { SessionLock } from '../session/lock.js';

const BUSY_DETAIL = 'Session busy — try again later';

export function createChatRouter(session: ChatSession, lock: SessionLock): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    const message = req.body?.message;
    if (typeof message !== 'string' || message.length === 0) {
      res.status(400).json({ detail: 'message required' });
      return;
    }
    const release = lock.tryAcquire();
    if (!release) {
      res.status(429).json({ detail: BUSY_DETAIL });
      return;
    }
    try {
      const reply = await session.send(message);
      res.json({ message: reply });
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    } finally {
      release();
    }
  });

  router.get('/chat/stream', async (req: Request, res: Response) => {
    const message = req.query?.message;
    if (typeof message !== 'string' || message.length === 0) {
      res.status(400).json({ detail: 'message required' });
      return;
    }
    const release = lock.tryAcquire();
    if (!release) {
      res.status(429).json({ detail: BUSY_DETAIL });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    try {
      for await (const token of session.sendStream(message)) {
        res.write(`data: ${token}\n\n`);
      }
      res.end();
    } catch (err) {
      res.write(`data: [error] ${(err as Error).message}\n\n`);
      res.end();
    } finally {
      release();
    }
  });

  return router;
}
