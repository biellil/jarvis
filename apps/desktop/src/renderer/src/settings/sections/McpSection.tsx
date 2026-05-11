/**
 * McpSection — Phase 65 (MCP-CLI-01, D-10)
 *
 * One sub-block:
 *  - Cliente MCP — connection status + Reconectar button (self-contained,
 *    reads/subscribes via window.mcp directly to avoid touching SettingsLayout's contract)
 *
 * Phase 69: server-side sub-block removed (toggle + connected clients).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Field, Button } from '../../components/ui';
import type { McpClientStatus } from '../../../../shared/ipc-types';

/** Phase 65 — formats backend McpClientStatus into a pt-BR label per D-10. */
function formatClientStatusLabel(s: McpClientStatus | null): string {
  if (s === null) return 'Carregando…';
  switch (s.status) {
    case 'connected':
      return `Conectado a ${s.serverName}: ${s.toolCount} tools`;
    case 'connecting':
      return 'Conectando…';
    case 'error':
      return `Erro: ${s.error ?? 'desconhecido'}`;
    case 'disconnected':
    default:
      return 'Não conectado';
  }
}

/** Minimal shape of window.mcp expected by this component (Plan 03 Task 5 preload bridge). */
interface McpWindowApi {
  reloadClient: () => Promise<McpClientStatus>;
  getClientStatus: () => Promise<McpClientStatus>;
  onClientStatusChanged?: (cb: (status: McpClientStatus) => void) => () => void;
}

export function McpSection() {
  // ===== Phase 65 — Cliente MCP =====
  const [clientStatus, setClientStatus] = useState<McpClientStatus | null>(null);
  const [reloading, setReloading] = useState(false);

  // Initial load + push subscription
  useEffect(() => {
    let cancelled = false;
    const mcpApi = (window as unknown as { mcp?: McpWindowApi }).mcp;
    if (!mcpApi) return;

    // Load current status once
    void mcpApi
      .getClientStatus()
      .then((s: McpClientStatus) => {
        if (!cancelled) setClientStatus(s);
      })
      .catch(() => {
        if (!cancelled) {
          setClientStatus({ status: 'error', serverName: null, toolCount: 0, error: 'IPC unavailable' });
        }
      });

    // Subscribe to status pushes from backend (after reloadClient or .env edit)
    const unsubscribe: (() => void) | undefined = mcpApi.onClientStatusChanged?.((s: McpClientStatus) => {
      if (!cancelled) setClientStatus(s);
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleReconnect = useCallback(async () => {
    setReloading(true);
    try {
      const mcpApi = (window as unknown as { mcp?: McpWindowApi }).mcp;
      if (!mcpApi) return;
      const next = await mcpApi.reloadClient();
      setClientStatus(next);
    } catch (err) {
      console.error('[McpSection] reloadClient error:', (err as Error).message);
    } finally {
      setReloading(false);
    }
  }, []);

  const clientStatusLabel = formatClientStatusLabel(clientStatus);

  return (
    <div className="space-y-base">
      {/* Phase 65 — Cliente MCP (D-10) */}
      <Field>
        <Field.Label>Cliente MCP</Field.Label>
        <Field.Control>
          <div className="flex items-center gap-sm">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleReconnect()}
              disabled={reloading}
            >
              {reloading ? 'Reconectando…' : 'Reconectar'}
            </Button>
            <span className="text-sm text-fg-muted" data-testid="mcp-client-status">
              {clientStatusLabel}
            </span>
          </div>
        </Field.Control>
        <Field.Helper>
          Configure MCP_SERVER_URL em <code>.env</code> para conectar a um servidor MCP externo (ex: n8n).
          Edições no <code>.env</code> são detectadas automaticamente.
        </Field.Helper>
      </Field>
    </div>
  );
}
