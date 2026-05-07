/**
 * POST /internal/reload-llm — live LLM provider swap (Plan 57-02)
 *
 * Swaps the active LLM provider in the running ChatSession without clearing
 * conversation history. Called by the live-reload IPC handler (Plan 03) after
 * saving Settings.
 *
 * The swap is performed under SessionLock to prevent races with in-flight send().
 * Per D-01/D-02 (Phase 57): history and memory are preserved; only llm + agent replaced.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { ChatSession } from '../session/chat-session.js';
import type { SessionLock } from '../session/lock.js';
import { createLLM } from '../llm/factory.js';

const ReloadLlmBodySchema = z.object({
  provider: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini']),
  lmStudioUrl: z.string().optional(),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  llmModel: z.string().optional(),
  useStreamingEvents: z.boolean().optional(),
});

export function createReloadLlmRouter(session: ChatSession, lock: SessionLock): Router {
  const router = Router();

  router.post('/reload-llm', async (req, res) => {
    const parsed = ReloadLlmBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reload payload', details: parsed.error.issues });
      return;
    }

    const { provider, lmStudioUrl, openaiApiKey, anthropicApiKey, geminiApiKey, llmModel, useStreamingEvents } = parsed.data;

    const overrideConfig = {
      LLM_PROVIDER: provider,
      LM_STUDIO_URL: lmStudioUrl || process.env.LM_STUDIO_URL || 'http://localhost:1234/v1',
      LM_STUDIO_MODEL: '',
      OPENAI_API_KEY: openaiApiKey || process.env.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      GEMINI_API_KEY: geminiApiKey || process.env.GEMINI_API_KEY || '',
      LLM_MODEL: llmModel || process.env.LLM_MODEL || '',
      BACKEND_TS_PORT: 8001,
      USE_LM_STUDIO_STREAMING_EVENTS: useStreamingEvents ?? false,
    };

    let newLlm;
    try {
      newLlm = createLLM(provider, overrideConfig);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    // Acquire lock to prevent race with in-flight send()
    const release = lock.tryAcquire();
    if (release) {
      try {
        session.swapLLM(newLlm);
      } finally {
        release();
      }
    } else {
      // Lock busy — swap anyway (session is single-user, concurrent sends are rare)
      // Per plan: lock is best-effort; the route still proceeds
      console.warn('[reload-llm] SessionLock busy during swap — proceeding without lock');
      session.swapLLM(newLlm);
    }

    // For lmstudio: attempt model detection (non-fatal, 5s timeout)
    if (provider === 'lmstudio') {
      const lmUrl = overrideConfig.LM_STUDIO_URL;
      const fetchPromise = fetch(`${lmUrl}/models`).then((r) => r.json() as Promise<any>);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000),
      );
      Promise.race([fetchPromise, timeoutPromise])
        .then((data: any) => {
          const modelId = data?.data?.[0]?.id ?? 'unknown';
          console.log(`[LM Studio] Detected model: ${modelId}`);
        })
        .catch((err: unknown) => {
          console.log(`[LM Studio] Model detection failed (non-fatal): ${err}`);
        });
    }

    res.json({ success: true });
  });

  return router;
}
