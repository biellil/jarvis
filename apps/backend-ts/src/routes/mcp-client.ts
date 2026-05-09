/**
 * POST /internal/mcp-client/reload — re-runs mcpManager.reload() (Phase 65, Plan 03)
 * GET  /internal/mcp-client/status — returns current mcpManager.getStatus()
 *
 * Mirrors the Phase 57 reload-llm.ts pattern. Mounted under /internal so the
 * gateway never proxies it externally — only the Electron main process calls
 * this via http://localhost:8001/internal/mcp-client/...
 *
 * Triggered by:
 *   1. chokidar env-watcher when .env / .env.local change (D-09)
 *   2. Settings UI "Reconectar" button via IPC MCP_CLIENT_RELOAD (D-10)
 */
import { Router } from 'express';
import { mcpManager } from '../mcp/client/manager.js';
import { NATIVE_TOOL_NAMES } from '../session/native-tool-names.js';
import type { ToolLogger } from '../memory/store.js';

export function createMcpClientRouter(toolLogger: ToolLogger): Router {
  const router = Router();

  router.post('/mcp-client/reload', async (_req, res) => {
    try {
      await mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger);
    } catch (err) {
      // mcpManager.reload is documented to never throw, but defensive:
      console.error(`[mcp-client] route /reload caught: ${(err as Error).message}`);
    }
    res.json(mcpManager.getStatus());
  });

  router.get('/mcp-client/status', (_req, res) => {
    res.json(mcpManager.getStatus());
  });

  return router;
}
