/**
 * MCP Settings IPC Handlers — Phase 64 (MCP-SRV-03) + Phase 65 (MCP-CLI-01)
 *
 * Phase 64 handlers (server-side):
 *   mcp:toggle               — persists mcpServerEnabled in electron-store
 *   mcp:get-connected-clients — returns connected MCP clients (empty for stdio)
 *
 * Phase 65 handlers (client-side):
 *   mcp-client:reload        — POSTs to backend /internal/mcp-client/reload, broadcasts result
 *   mcp-client:get-status    — GETs from backend /internal/mcp-client/status (cached read)
 *   mcp-client:status-changed — push channel (no handler; broadcast from reload result)
 */
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, type McpClientInfo, type McpClientStatus } from '../../shared/ipc-types.js';
import { getMcpServerEnabled, setMcpServerEnabled } from '../store.js';

/** Backend internal endpoint base — matches BACKEND_TS_PORT=8001 from .env. */
const BACKEND_INTERNAL_BASE = 'http://localhost:8001/internal';

function broadcastClientStatus(status: McpClientStatus): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.MCP_CLIENT_STATUS_CHANGED, status);
    }
  });
}

export function setupMcpSettingsHandlers(): void {
  // ============================================
  // Phase 64 — MCP Server (preserved untouched)
  // ============================================

  // Toggle MCP server enable/disable preference
  ipcMain.handle(IPC_CHANNELS.MCP_TOGGLE, async (_event, enabled: boolean): Promise<{
    success: boolean;
    status: 'started' | 'stopped' | 'unchanged';
    error?: string;
  }> => {
    try {
      const current = getMcpServerEnabled();
      if (current === enabled) {
        return { success: true, status: 'unchanged' };
      }
      setMcpServerEnabled(enabled);
      return { success: true, status: enabled ? 'started' : 'stopped' };
    } catch (err) {
      return { success: false, status: 'unchanged', error: (err as Error).message };
    }
  });

  // Get connected clients list
  // Phase 64: stdio has no back-channel, returns empty list.
  // v3.1 (HTTP Streamable) will populate this from real session data.
  ipcMain.handle(IPC_CHANNELS.MCP_GET_CONNECTED_CLIENTS, async (): Promise<McpClientInfo[]> => {
    return [];
  });

  // ============================================
  // Phase 65 — MCP Client (new)
  // ============================================

  // Reload MCP client by POSTing to backend; broadcasts the resulting status to all windows.
  ipcMain.handle(IPC_CHANNELS.MCP_CLIENT_RELOAD, async (): Promise<McpClientStatus> => {
    try {
      const resp = await fetch(`${BACKEND_INTERNAL_BASE}/mcp-client/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 8s budget — backend reload at most ~5s connect timeout + cushion (T-65-09)
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) {
        const errMsg = `backend reload returned ${resp.status}`;
        const status: McpClientStatus = { status: 'error', serverName: null, toolCount: 0, error: errMsg };
        broadcastClientStatus(status);
        return status;
      }
      const status = (await resp.json()) as McpClientStatus;
      broadcastClientStatus(status);
      return status;
    } catch (err) {
      const status: McpClientStatus = {
        status: 'error',
        serverName: null,
        toolCount: 0,
        error: (err as Error).message,
      };
      broadcastClientStatus(status);
      return status;
    }
  });

  // Read current MCP client status from backend (no broadcast — passive read).
  ipcMain.handle(IPC_CHANNELS.MCP_CLIENT_GET_STATUS, async (): Promise<McpClientStatus> => {
    try {
      const resp = await fetch(`${BACKEND_INTERNAL_BASE}/mcp-client/status`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (!resp.ok) {
        return { status: 'error', serverName: null, toolCount: 0, error: `status returned ${resp.status}` };
      }
      return (await resp.json()) as McpClientStatus;
    } catch (err) {
      return { status: 'error', serverName: null, toolCount: 0, error: (err as Error).message };
    }
  });
}
