/**
 * Tasks IPC Handlers — Phase 66 (AGENT-02, AGENT-03, AGENT-04)
 *
 * HTTP proxy from renderer → main → backend for agentic task lifecycle:
 *   - TASK_RESUME: POST /api/tasks/:taskId/resume (body: ResumeRequestBody)
 *   - TASK_CANCEL: POST /api/tasks/:taskId/cancel
 *   - TASK_GET_BACKEND_URL: returns { url, bearer } so renderer can open SSE via fetch
 *
 * Bearer token is held in main process only — renderer never receives it directly
 * except via TASK_GET_BACKEND_URL which is needed to authenticate the SSE stream.
 * This is the same exposure pattern as existing /api/chat/stream (Phase 53/60);
 * accepted at the platform level (single-user, local backend, auth gate at preload).
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { ResumeRequestBody } from '../../shared/ipc-types.js';
import { loadBackendConfig } from '../backend-client.js';

let _cachedConfig: { backendUrl: string; apiKey: string } | null = null;

function getConfig() {
  if (!_cachedConfig) {
    _cachedConfig = loadBackendConfig(process.env as Record<string, string>);
  }
  return _cachedConfig;
}

export function registerTaskHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TASK_RESUME,
    async (_evt, taskId: string, body: ResumeRequestBody) => {
      try {
        const cfg = getConfig();
        const response = await fetch(
          `${cfg.backendUrl}/api/tasks/${encodeURIComponent(taskId)}/resume`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify(body),
          },
        );
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return { success: false, error: `Backend ${response.status}: ${text}` };
        }
        // Backend returns SSE on resume; we just confirm the POST was accepted.
        // Actual SSE consumption happens via fetch from the renderer (useTaskSse).
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.TASK_CANCEL, async (_evt, taskId: string) => {
    try {
      const cfg = getConfig();
      const response = await fetch(
        `${cfg.backendUrl}/api/tasks/${encodeURIComponent(taskId)}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
          },
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { success: false, error: `Backend ${response.status}: ${text}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_GET_BACKEND_URL, async () => {
    try {
      const cfg = getConfig();
      return { success: true, data: { url: cfg.backendUrl, bearer: cfg.apiKey } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}
