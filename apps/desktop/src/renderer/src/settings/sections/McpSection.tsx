/**
 * McpSection — Phase 64 (MCP-SRV-03, D-11, D-12)
 * Settings section to enable/disable JARVIS MCP server and show connected clients.
 */
import React from 'react';
import { Field, Button } from '../../components/ui';
import type { McpClientInfo } from '../../../../shared/ipc-types';

interface McpSectionProps {
  enabled: boolean;
  connectedClients: McpClientInfo[];
  onToggle: (enabled: boolean) => Promise<void>;
  isToggling: boolean;
}

export function McpSection({ enabled, connectedClients, onToggle, isToggling }: McpSectionProps) {
  const statusText = enabled ? 'Ativo' : 'Inativo';
  const clientCount = connectedClients.length;

  return (
    <div className="space-y-base">
      <Field>
        <Field.Label>Servidor MCP</Field.Label>
        <Field.Control>
          <div className="flex items-center gap-sm">
            <Button
              variant={enabled ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => void onToggle(!enabled)}
              disabled={isToggling}
            >
              {enabled ? 'Desabilitar' : 'Habilitar'}
            </Button>
            <span className="text-sm text-fg-muted">
              Servidor MCP: {statusText}
            </span>
          </div>
        </Field.Control>
        <Field.Helper>
          {enabled
            ? `Clientes conectados: ${clientCount}`
            : 'Habilite para expor tools do JARVIS via protocolo MCP (Claude Desktop, Cursor, Windsurf)'}
        </Field.Helper>
      </Field>
    </div>
  );
}
