// Phase 64 — MCP Server client session tracker (MCP-SRV-03, D-08, D-09)
// For stdio transport (Phase 64), there is at most one implicit client per process.
// Rich session tracking (HTTP Streamable, User-Agent) deferred to v3.1.
export interface McpClientEntry {
  id: string;
  name: string;           // "Unknown Client via stdio" — Phase 64
  connectedAt: Date;
  lastActivity: Date;
}

const sessions = new Map<string, McpClientEntry>();

export const clientSessions = {
  connect(id: string): McpClientEntry {
    const entry: McpClientEntry = {
      id,
      name: 'Unknown Client via stdio',
      connectedAt: new Date(),
      lastActivity: new Date(),
    };
    sessions.set(id, entry);
    return entry;
  },
  disconnect(id: string): void {
    sessions.delete(id);
  },
  updateActivity(id: string): void {
    const entry = sessions.get(id);
    if (entry) entry.lastActivity = new Date();
  },
  getAll(): McpClientEntry[] {
    return Array.from(sessions.values());
  },
  clear(): void {
    sessions.clear();
  },
};
