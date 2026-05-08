/**
 * MCP Settings IPC Handlers — Phase 64 (MCP-SRV-03, D-11, D-12, D-13)
 *
 * mcp:toggle — persists mcpServerEnabled in electron-store.
 *   The MCP server itself runs as a stdio child process spawned by the client
 *   (Claude Desktop, Cursor). Electron stores the preference; users configure
 *   their client to spawn `node backend-ts/dist/mcp/server.js` when enabled.
 *
 * mcp:get-connected-clients — returns empty list for Phase 64 (stdio has no
 *   back-channel to report connections). Rich tracking deferred to v3.1 (HTTP Streamable).
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS, type McpClientInfo } from '../../shared/ipc-types.js';
import { getMcpServerEnabled, setMcpServerEnabled } from '../store.js';

export function setupMcpSettingsHandlers(): void {
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
}
