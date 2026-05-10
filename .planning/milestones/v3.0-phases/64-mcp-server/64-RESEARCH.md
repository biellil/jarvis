# Phase 64: MCP Server - Research

**Researched:** 2026-05-08
**Domain:** Model Context Protocol (MCP) server implementation, stdio transport, tool exposure
**Confidence:** HIGH overall; MEDIUM on client tracking specifics

## Summary

Phase 64 requires exposing JARVIS tools (PC control, memory recall) via Model Context Protocol so that external tools like Claude Desktop, Cursor, and Windsurf can use them. This research investigates the official TypeScript SDK (@modelcontextprotocol/sdk 1.29.0), stdio transport patterns, security considerations, and existing JARVIS tool infrastructure that can be reused.

The core pattern is straightforward: create an MCP server in the backend-ts process that exposes existing tools (`recall_memory`, file actions, system controls) via stdio. The stdio transport spawns the server as a child process and communicates over JSON-RPC 2.0, preventing stdout corruption (critical: only `console.error()` for logging). Tools are defined via Zod schemas and execute existing business logic from `src/session/tools.ts` and `src/session/pc-tools.ts`.

Client connectivity tracking (MCP-SRV-03) is handled application-side: a lightweight Map in the MCP server tracks client sessions by ID, and Settings UI queries this state via IPC to list connected clients.

**Primary recommendation:** Implement MCP server as a stdio-based `McpServer` instance in `backend-ts/src/mcp/server.ts` that bridges existing JARVIS tool infrastructure. Wire into Electron Settings as a toggle (enable/disable). No HTTP Streamable transport needed for v3.0 (deferred to v3.1).

---

## User Constraints (from CONTEXT.md)

No CONTEXT.md file exists for Phase 64 yet. Constraints below are inferred from STATE.md and ROADMAP.md:

### Locked Decisions
None yet — Phase 64 planning hasn't occurred.

### Claude's Discretion
- MCP server architecture (stdio vs. HTTP Streamable; v3.0 scope is stdio only)
- Client session tracking implementation (Map-based vs. database-backed)
- Tool exposure strategy (which tools to expose in Phase 64 vs. defer to Phase 65)
- Authentication/authorization model for MCP connections (local stdio only, no OAuth needed)

### Deferred Ideas
- HTTP Streamable transport (deferred to v3.1, per STATE.md line 174: "MCP client connects to 1 static server URL from .env (HTTP transport, ex: n8n); multi-server deferred to v3.1")
- Multi-server MCP client support (Phase 65)
- Remote MCP server capability (requires Streamable HTTP, v3.1+)

---

## Phase Requirements

| ID | Description | Research Support |
|-------|-------------|------------------|
| MCP-SRV-01 | Usuário pode usar JARVIS como servidor MCP via stdio, expondo PC control tools para clientes como Claude Desktop e Cursor | McpServer + stdio transport + existing `pc-tools.ts` (list_files, openFile, moveFile, etc.) |
| MCP-SRV-02 | Clientes MCP externos podem consultar memória do JARVIS (histórico de conversas + preferências do usuário) | Existing `recall_memory` tool in `src/session/tools.ts` exposed via MCP |
| MCP-SRV-03 | Usuário pode ativar/desativar o servidor MCP e ver quais clientes estão conectados na Settings UI | Settings toggle via electron-store + IPC handler; client session Map in MCP server |

---

## Standard Stack

### Core MCP Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.29.0 | Official TypeScript SDK for MCP servers and clients | Stable, maintained by Anthropic; ships McpServer, StdioServerTransport, tool/resource registration |
| zod | 4.x+ | Input validation for tool parameters | Already in JARVIS stack; MCP tool schemas use Zod for type-safe parameter validation |

### MCP Concepts (Not Packages)
| Concept | Standard in v3.0 | Notes |
|---------|------------------|-------|
| **Transport** | stdio (child process) | Client spawns server as subprocess, communicates via stdin/stdout with JSON-RPC 2.0 newline-delimited messages. Recommended for local tools. |
| **Tool Definition** | Tools (not Resources) | Tools are LLM-callable functions. Resources are read-only data. For PC control and memory recall, tools are correct (LLM acts, tools execute). |
| **Capability Types** | Tools + Resources | MCP supports Tools (functions), Resources (data), Prompts (templates). Phase 64 focuses on Tools; Resources deferred if needed. |

### Supporting Libraries (Already in Stack)
| Library | Version | Purpose | In Use |
|---------|---------|---------|--------|
| langchain | 1.2.14 | Tool definition, LangChain compatibility | Tools created with `tool()` helper for LLM integration |
| @langchain/core | Latest in stack | BaseTool abstraction | Some tools may use LangChain BaseTool for consistency |

### Installation
```bash
npm install @modelcontextprotocol/sdk@1.29.0
# zod already installed globally in JARVIS
```

**Version Verification:** @modelcontextprotocol/sdk 1.29.0 verified via npm as stable production version (2026-05-08). SDK is actively maintained; v2.0 anticipated Q1 2026 but not yet released.

---

## Architecture Patterns

### Recommended Project Structure
```
backend-ts/src/mcp/
├── server.ts                  # McpServer instance, tool/resource registration
├── tools/
│   ├── memory.ts             # Expose recall_memory tool
│   ├── file-actions.ts       # Expose list_files, openFile, moveFile, etc.
│   └── system-controls.ts    # Expose media_control, adjust_volume (future)
├── transport.ts              # StdioServerTransport initialization
└── client-sessions.ts        # Map-based client tracking (optional, Phase 64.3)

backend-ts/src/routes/
├── mcp-settings.ts           # IPC handlers for enable/disable toggle + list connected clients (Electron)
```

### Pattern 1: MCP Server Initialization (stdio)
**What:** Create `McpServer` instance, register tools via Zod schema validation, connect to `StdioServerTransport`
**When to use:** At backend startup; server runs for lifetime of backend process
**Example:**
```typescript
// backend-ts/src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "jarvis",
  version: "3.0.0",
});

// Register a tool
server.tool("recall_memory", 
  {
    description: "Search conversation history and user preferences",
    inputSchema: z.object({
      query: z.string().describe("Natural language search query")
    })
  },
  async ({ query }) => {
    // Delegate to existing MemoryManager.buildContext()
    const context = await memory.buildContext(query);
    return {
      content: [{ type: "text", text: context || "No memories found" }]
    };
  }
);

// Connect to transport at startup
const transport = new StdioServerTransport();
await server.connect(transport);
```
**Source:** [Build an MCP server - Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server)

### Pattern 2: Tool Schema Definition (Zod + MCP)
**What:** Define tool input parameters using Zod; MCP SDK auto-generates JSON schema for client discovery
**When to use:** For every tool exposed via MCP
**Example:**
```typescript
// Reuse existing schema from pc-tools.ts or define MCP-specific schema
const listFilesSchema = z.object({
  path: z.string().describe("Directory path to list files"),
  recursive: z.boolean().optional().describe("Recursively list subdirectories")
});

server.tool("list_files", 
  { 
    description: "List files in a directory",
    inputSchema: listFilesSchema
  },
  async ({ path, recursive }) => {
    try {
      const files = await listFilesInDirectory(path, { recursive });
      return {
        content: [{ type: "text", text: JSON.stringify(files, null, 2) }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}`, isError: true }]
      };
    }
  }
);
```

### Pattern 3: Logging in stdio Servers (CRITICAL)
**What:** Use `console.error()` or file-based logging; NEVER use `console.log()` — it corrupts JSON-RPC protocol
**When to use:** Always, in stdio-based MCP servers
**Anti-pattern:**
```typescript
// ❌ BAD — stdout corruption
console.log("Processing tool call");
server.tool(...);
```
**Correct pattern:**
```typescript
// ✅ GOOD — stderr safe
console.error("[MCP] Tool registered: recall_memory");
server.tool(...);

// ✅ GOOD — file logging
import { pino } from "pino";
const logger = pino({ 
  transport: { target: "pino/file", options: { destination: "./mcp.log" } }
});
logger.info("Server started");
```
**Source:** [Build an MCP server - Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server) §Logging in MCP Servers

### Pattern 4: Client Session Tracking (Application-Level)
**What:** Maintain a Map<sessionId, ClientMetadata> in the MCP server; hand out session IDs on first connection
**When to use:** For MCP-SRV-03 (show connected clients in Settings)
**Example:**
```typescript
// backend-ts/src/mcp/client-sessions.ts
const connectedClients = new Map<string, ClientMetadata>();

export interface ClientMetadata {
  id: string;
  name?: string;          // "Claude Desktop", "Cursor", etc.
  connectedAt: Date;
  lastActivity: Date;
}

// On each MCP request (tool call), update lastActivity
function updateClientActivity(sessionId: string) {
  const client = connectedClients.get(sessionId);
  if (client) {
    client.lastActivity = new Date();
  }
}

// Expose to Settings via IPC
export function getConnectedClients(): ClientMetadata[] {
  return Array.from(connectedClients.values());
}
```

**Note:** Session ID protocol is transport-specific. For stdio, the client (Claude Desktop, Cursor) spawns the server once and maintains a single stateful connection, so there's typically one implicit "session". Explicit session IDs are more relevant for HTTP Streamable transport (v3.1).

For Phase 64 (stdio only), session tracking can be simplified: track whether the server is running and optionally record which client tool is calling (via User-Agent header analogue if available, or just one implicit "stdio client").

### Anti-Patterns to Avoid
- **Hardcoding paths in MCP tools:** Use absolute paths from backend config, not relative paths. Tools may be called from different working directories.
- **Long-running tool executions:** If a tool takes >30s, client may timeout. Break into async tasks for long operations.
- **Exposing secrets in tool descriptions:** Don't mention API key names or database URLs in tool descriptions — LLM can see them.
- **Missing error handling in tool execution:** Tools should never crash the server. Always wrap in try/catch and return error content.
- **Using console.log() in stdio server:** Corrupts JSON-RPC protocol. Use `console.error()` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool input validation | Custom regex / manual type guards | Zod schemas → MCP SDK auto-validates | Zod is type-safe, generates JSON Schema automatically, prevents injection attacks |
| MCP message serialization | Manual JSON.stringify/parse | @modelcontextprotocol/sdk handles JSON-RPC | SDK handles message framing, request/response routing, error codes per spec |
| Stdio message framing | Manual line-splitting, buffering | StdioServerTransport | Transport spec requires newline-delimited JSON; sdk handles edge cases (partial messages, backpressure) |
| Client capability discovery | Custom metadata exchange | McpServer built-in initialization/meta | SDK advertises server capabilities (tools, resources, prompts) at connection time |
| Tool execution loop | Custom async/await orchestration | Server.tool() registration | SDK handles queueing, error propagation, response routing to correct client |

**Key insight:** MCP is a protocol spec, not a framework. The SDK implements all message framing, routing, and capability discovery. Rolling custom JSON-RPC over stdio adds maintenance burden and risks protocol violations.

---

## Runtime State Inventory

**Not applicable.** Phase 64 is a new feature (no existing MCP server state to migrate). Skip this section.

---

## Common Pitfalls

### Pitfall 1: Stdout Corruption in stdio Servers (Severity: CRITICAL)
**What goes wrong:** Logging to `console.log()` writes to stdout; MCP protocol expects only JSON-RPC messages on stdout. Any extraneous output breaks the protocol and crashes the client connection.
**Why it happens:** Developers familiar with Node.js assume `console.log()` is safe; it's safe in HTTP servers, but stdio transport requires strict stdout discipline.
**How to avoid:** 
  1. Use `console.error()` for all logging in stdio servers
  2. Configure a logging library (e.g., pino, winston) to write to a file or stderr, not stdout
  3. Search codebase for `console.log()` in MCP server code — remove or redirect to stderr
**Warning signs:** MCP client disconnects immediately after connecting, or tool calls hang indefinitely without response.

### Pitfall 2: Tool Timeout / Long-Running Operations
**What goes wrong:** Tool takes >30 seconds to complete; client times out waiting for response and assumes server crashed.
**Why it happens:** PC control tools (file I/O, system actions) can be slow; no timeout configuration in MCP SDK.
**How to avoid:**
  1. For Phase 64, keep tools fast (memory recall <500ms, file listing <1s, open file <2s)
  2. For long operations (large file transfers, batch jobs), implement async queueing: tool returns "task queued" immediately, client polls status separately (deferred to Phase 65+)
  3. Set reasonable expectations in tool description: "Opens file synchronously; may block for up to 5 seconds"
**Warning signs:** Cursor/Claude Desktop UI freezes when calling certain tools.

### Pitfall 3: Missing Error Context in Tool Responses
**What goes wrong:** Tool fails (e.g., "file not found") but returns empty string or generic error; LLM can't understand what went wrong and repeats same failed action.
**Why it happens:** Tool developer skips error handling or returns `{ content: [] }`
**How to avoid:**
  1. Always return descriptive error text in `{ content: [{ type: "text", text: "Error message" }], isError: true }`
  2. Include actionable context: "File 'report.txt' not found at /Users/alice/Documents. Available files: [list]"
  3. Existing JARVIS tools already do this (see `recall_memory` in tools.ts: returns `EMPTY_FALLBACK` string, not empty)
**Warning signs:** LLM keeps trying same action repeatedly without learning from failure.

### Pitfall 4: Mixing Tools vs. Resources (Semantic Confusion)
**What goes wrong:** Expose a data source as a Tool (with side effects) when it should be a Resource (read-only), or vice versa.
**Why it happens:** Unclear distinction; both are callable via MCP.
**How to avoid:**
  1. **Tools = actions:** `recall_memory`, `openFile`, `moveFile`, `adjustVolume` — things that do something or compute a result based on input
  2. **Resources = data:** conversation index, user preferences document, system status — things that exist and can be read, but don't execute
  3. For Phase 64: expose PC control and memory recall as Tools (correct semantic); if Phase 65 adds a "conversation history resource", that would be a Resource
**Warning signs:** LLM tries to read-then-act on a Tool (expecting state), or ignores a Resource because it doesn't invoke it as a function.

### Pitfall 5: Hard Paths in Tool Arguments
**What goes wrong:** Tool receives a path like `./documents/file.txt` from client; server resolves it relative to current working directory, not user's home or app directory.
**Why it happens:** Tools are called from arbitrary client contexts; relative paths don't mean what the user expects.
**How to avoid:**
  1. In tool schemas, accept **absolute paths only** or user-friendly shortcuts (`~/Downloads`, `$DESKTOP`)
  2. In tool execution, resolve all paths via `path.resolve(process.cwd(), ...)` + validation (traversal attack check, per Phase 54 isPathValid pattern)
  3. Keep reference to allowed directories: `process.env.HOME`, `app.getPath('documents')`, etc.
  4. JARVIS already does this in `isPathValid()` (Phase 54) — reuse that function
**Warning signs:** Tools open files in unexpected directories, or fail with "permission denied" when path is valid.

---

## Code Examples

### Example 1: recall_memory Tool Exposed via MCP
```typescript
// Source: backend-ts/src/session/tools.ts (existing) + mcp/server.ts (new)
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const recallSchema = z.object({
  query: z.string().describe('Termos de busca em linguagem natural'),
});

// Existing tool in session/tools.ts
export function createRecallMemoryTool(memory: MemoryManager) {
  return tool(
    async ({ query }: { query: string }): Promise<string> => {
      try {
        const ctx = await memory.buildContext(query);
        return ctx === '' ? 'Nenhuma memória relevante encontrada.' : ctx;
      } catch (exc) {
        return `Erro ao buscar memórias: ${(exc as Error).message}`;
      }
    },
    { name: 'recall_memory', description: '...', schema: recallSchema }
  );
}

// Expose via MCP (new in mcp/server.ts)
const memoryTool = createRecallMemoryTool(memoryManager);
server.tool(
  'recall_memory',
  {
    description: memoryTool.description,
    inputSchema: recallSchema
  },
  async ({ query }) => {
    const result = await memoryTool.invoke({ query });
    return {
      content: [{ type: "text", text: result }]
    };
  }
);
```

### Example 2: list_files Tool with Error Handling
```typescript
// backend-ts/src/mcp/tools/file-actions.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

const listFilesSchema = z.object({
  path: z.string().describe("Absolute path to directory"),
  recursive: z.boolean().optional().default(false)
});

export function registerListFilesTool(server: McpServer) {
  server.tool(
    "list_files",
    { description: "List files in a directory", inputSchema: listFilesSchema },
    async ({ path: dirPath, recursive }) => {
      try {
        // Validate path (reuse Phase 54 isPathValid)
        if (!isPathValid(dirPath)) {
          return {
            content: [{
              type: "text",
              text: `Access denied: path outside allowed directories`,
              isError: true
            }]
          };
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory()
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify(files, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Error listing ${dirPath}: ${(err as Error).message}`,
            isError: true
          }]
        };
      }
    }
  );
}
```

### Example 3: Settings Toggle for MCP Server (Electron IPC)
```typescript
// apps/desktop/src/main/ipc/mcp-settings.ts (new)
import { ipcMain } from "electron";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

let mcpServer: McpServer | null = null;
let mcpTransport: StdioServerTransport | null = null;

ipcMain.handle("mcp:toggle", async (_, enabled: boolean) => {
  if (enabled && !mcpServer) {
    // Start MCP server
    mcpServer = new McpServer({ name: "jarvis", version: "3.0.0" });
    mcpTransport = new StdioServerTransport();
    
    // Register tools...
    registerMemoryTools(mcpServer);
    registerFileTools(mcpServer);
    
    await mcpServer.connect(mcpTransport);
    return { status: "started" };
  } else if (!enabled && mcpServer) {
    // Stop MCP server
    await mcpServer?.close();
    mcpServer = null;
    mcpTransport = null;
    return { status: "stopped" };
  }
  return { status: "unchanged" };
});

ipcMain.handle("mcp:get-connected-clients", () => {
  // Return list of connected clients (Phase 64.3)
  return getConnectedClients();
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom tool execution in agent | MCP protocol standard | 2024+ | Decouples tool provider from agent runtime; Claude/Cursor/Windsurf all speak MCP natively |
| HTTP + SSE transport | Streamable HTTP transport | March 2025 (spec v2025-03-26) | Stateless, loadbalancer-friendly; stdio remains for local tools |
| Agent-specific tool definitions | Unified MCP tool schemas | 2024+ | Same tool works in Claude, Cursor, Windsurf; no per-platform adaptation needed |
| Per-client tool exposure | Server-wide tool discovery | 2024+ | Client calls `listTools()` once; LLM can use any exposed tool |

**Deprecated/Outdated:**
- **Custom tool JSON-RPC:** MCP spec removed this requirement; use SDK for message framing
- **HTTP + SSE transport:** Replaced by Streamable HTTP; stdio unchanged (still recommended for local)
- **Tool registration per-client:** All tools registered once at server startup; clients discover via protocol

---

## Open Questions

1. **Client Session Tracking Details**
   - What we know: MCP protocol allows optional `Mcp-Session-Id` header for HTTP Streamable; stdio is implicitly single-session per process
   - What's unclear: How to distinguish "Claude Desktop" from "Cursor" from "Windsurf" in stdio transport? (User-Agent not available in stdio)
   - Recommendation: For Phase 64, track "stdin client" (singular) or mark all stdio clients as "Unknown Client". Store client identification in Settings UI as free-text annotation if needed. Implement rich session tracking in Phase 65 with HTTP Streamable.

2. **MCP Server Startup & Backend Initialization**
   - What we know: Backend process runs the entire time Electron is running
   - What's unclear: Should MCP server start automatically on backend init, or only when Electron Settings toggle is enabled?
   - Recommendation: Start MCP server lazily on first user Settings interaction (toggle enable). Implement graceful shutdown when disabled. This reduces complexity and memory overhead when users don't need MCP.

3. **Scope of Tool Exposure in Phase 64**
   - What we know: MCP-SRV-01 requires PC control tools; MCP-SRV-02 requires memory recall
   - What's unclear: Which specific PC control tools? All of them, or a safe subset (read-only like `list_files`, `viewContent`)?
   - Recommendation: Expose conservative subset for Phase 64: `recall_memory`, `list_files`, `openFile`, `openFolder`, `viewContent` (read-safe). Add destructive tools (`moveFile`, `renameFile`) and system controls (`mediaControl`, `adjustVolume`) in Phase 65+ after safety validation.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | MCP server process | ✓ | 18.x+ | — |
| @modelcontextprotocol/sdk | MCP server + tool registration | ✗ (will install) | 1.29.0 | — |
| Backend TypeScript process | MCP host | ✓ | compiled + running | — |
| Electron (Claude Desktop, Cursor, Windsurf) | MCP client to test | ✓ (on user machine) | varies | Test with command-line MCP client |

**Missing dependencies with fallback:**
- If developer doesn't have Claude Desktop installed: use `mcp-cli` (npm package) to test stdio server locally

**Testing without Claude Desktop:**
```bash
npm install -g @modelcontextprotocol/mcp-cli
mcp-cli run node backend-ts/src/mcp/server.js
# Connects to stdio server; manual tool testing
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 1.x (matches existing project config) |
| Config file | vitest.config.ts (existing; no changes needed) |
| Quick run command | `pnpm test backend-ts/src/mcp --run` |
| Full suite command | `pnpm test backend-ts/src/mcp --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-SRV-01 | McpServer registered with tool definitions for PC control (list_files, openFile, etc.); client can discover via listTools | unit | `vitest run src/mcp/__tests__/server.test.ts -t "register tools"` | ❌ Wave 0 |
| MCP-SRV-01 | StdioServerTransport spawned; JSON-RPC messages on stdin/stdout validated | integration | `vitest run src/mcp/__tests__/transport.test.ts` | ❌ Wave 0 |
| MCP-SRV-02 | recall_memory tool executes; delegates to MemoryManager.buildContext(); returns formatted content | unit | `vitest run src/mcp/__tests__/tools/memory.test.ts -t "recall_memory"` | ❌ Wave 0 |
| MCP-SRV-03 | IPC handler mcp:toggle enables/disables server; mcp:get-connected-clients returns client list | unit | `vitest run apps/desktop/__tests__/ipc/mcp-settings.test.ts` | ❌ Wave 0 |
| MCP-SRV-03 | Settings UI toggle renders, state persists via electron-store, reflects server enable/disable | integration | `vitest run apps/desktop/__tests__/renderer/sections/McpSection.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test backend-ts/src/mcp --run`
- **Per wave merge:** `pnpm test backend-ts/src/mcp --coverage` + `pnpm test apps/desktop/src --coverage` (MCP Settings UI)
- **Phase gate:** Full suite + manual test connecting Claude Desktop to stdio server

### Wave 0 Gaps
- [ ] `backend-ts/src/mcp/__tests__/server.test.ts` — test McpServer initialization, tool registration, schema validation
- [ ] `backend-ts/src/mcp/__tests__/transport.test.ts` — test StdioServerTransport with mock stdin/stdout streams
- [ ] `backend-ts/src/mcp/__tests__/tools/memory.test.ts` — test recall_memory tool invocation and MemoryManager integration
- [ ] `backend-ts/src/mcp/__tests__/tools/file-actions.test.ts` — test list_files, openFile, isPathValid validation
- [ ] `apps/desktop/__tests__/ipc/mcp-settings.test.ts` — test IPC handlers for mcp:toggle, mcp:get-connected-clients
- [ ] `apps/desktop/__tests__/renderer/sections/McpSection.test.tsx` — test Settings UI toggle, enabled/disabled states, client list display
- [ ] Test utilities: mock McpServer, mock StdioServerTransport, mock stdin/stdout streams, mock electron-store

*(If existing test infrastructure covers any of the above, note it; otherwise, implement in Wave 0 to unblock implementation tasks)*

---

## Sources

### Primary (HIGH confidence)

- **@modelcontextprotocol/sdk npm** — Package verified 1.29.0 stable, active maintenance
  - Link: [https://www.npmjs.com/package/@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

- **Build an MCP server - Model Context Protocol (Official Docs)** — Core patterns for McpServer, StdioServerTransport, tool registration, logging best practices
  - Link: [https://modelcontextprotocol.io/docs/develop/build-server](https://modelcontextprotocol.io/docs/develop/build-server)

- **Getting Started with Local MCP Servers on Claude Desktop (Official Support)** — Claude Desktop configuration, stdio transport mechanics, client capabilities
  - Link: [https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

- **Transports - Model Context Protocol Specification (2025-06-18)** — JSON-RPC message format, stdio framing, protocol compliance, security best practices
  - Link: [https://modelcontextprotocol.io/specification/2025-06-18/basic/transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

### Secondary (MEDIUM confidence)

- **LangGraph MCP Client Setup Made Easy [2026 Guide]** — LangChain integration patterns, `@langchain/mcp-adapters` usage (relevant for Phase 65 client)
  - Link: [https://generect.com/blog/langgraph-mcp/](https://generect.com/blog/langgraph-mcp/)

- **MCP Made Simple: Your First Client–Server** — Alternative implementation pattern, tool schema examples
  - Link: [https://medium.com/@kiranpuli/mcp-made-simple-your-first-client-server-554bad55dd42](https://medium.com/@kiranpuli/mcp-made-simple-your-first-client-server-554bad55dd42)

- **Setting Up Custom MCP Servers in Windsurf / Cursor** — Cursor/Windsurf-specific MCP configuration, tool discovery UI
  - Link: [https://medium.com/@phanibhushanksa/how-to-set-up-mcp-servers-in-windsurf-9ee137470c79](https://medium.com/@phanibhushanksa/how-to-set-up-mcp-servers-in-windsurf-9ee137470c79)

- **@modelcontextprotocol/server-memory npm** — Reference implementation for memory recall tools via MCP
  - Link: [https://www.npmjs.com/package/@modelcontextprotocol/server-memory](https://www.npmjs.com/package/@modelcontextprotocol/server-memory)

- **Streamable HTTP vs SSE for MCP Servers | Toolradar Blog** — Transport comparison; Streamable HTTP is v3.1 future
  - Link: [https://toolradar.com/blog/streamable-http-vs-sse](https://toolradar.com/blog/streamable-http-vs-sse)

### Tertiary (LOW confidence - marked for validation)

- **The Complete Guide to Model Context Protocol (MCP) in 2026: Building the USB-C for AI-Native Applications** — Market overview, adoption stats (verified but promotional)
  - Link: [https://www.essamamdani.com/blog/complete-guide-model-context-protocol-mcp-2026](https://www.essamamdani.com/blog/complete-guide-model-context-protocol-mcp-2026)

---

## Metadata

**Confidence breakdown:**
- **Standard Stack (HIGH):** @modelcontextprotocol/sdk 1.29.0 verified via npm; official docs cross-referenced. No uncertainty.
- **Architecture (HIGH):** Stdio transport pattern verified in official docs + multiple implementations. McpServer + StdioServerTransport is standard reference pattern.
- **Pitfalls (HIGH):** stdout corruption in stdio servers documented in official docs; client timeout, error handling are well-known. Paths + injection attacks covered by existing Phase 54 isPathValid().
- **Client Tracking (MEDIUM):** No official SDK API for tracking connected clients exposed. Map-based tracking is application-level pattern; HTTP Streamable session IDs mentioned in spec but implementation details sparse.
- **Tool Exposure Scope (MEDIUM):** Unclear which tools are "safe" to expose in Phase 64; recommendation based on conservative principle (read-only first) but could be overridden by planner.

**Research date:** 2026-05-08
**Valid until:** 2026-05-15 (one week; MCP is rapidly evolving, check for v2.0 release or major SDK updates)

---

## What Might I Have Missed?

1. **OAuth / Authentication for Remote MCP** — Phase 64 is local stdio only, so authentication not needed. But if Phase 65 adds HTTP Streamable or remote support, OAuth patterns should be researched separately.

2. **Tool Execution Limits / Rate Limiting** — MCP SDK doesn't enforce rate limits; application must implement if needed. Not critical for Phase 64 but worth noting for Phase 66+ (agentic task execution).

3. **MCP Prompts (Third Capability Type)** — Prompts are pre-written templates for common tasks. Not needed for Phase 64 (tools + resources sufficient), but could enhance UX in Phase 66 (agentic tasks can use prompts for planning steps).

4. **Streaming Responses from Tools** — MCP spec supports streaming tool responses (for long-running operations). Phase 64 tools are synchronous; streaming could reduce latency in Phase 65+ (e.g., streaming file read results).

5. **Client Disconnection Handling** — How does MCP server detect or handle client disconnection? Important for cleanup in Phase 64.3 (client list accuracy). Likely handled automatically by StdioServerTransport, but details not verified.

6. **Performance / Concurrency** — Can stdio transport handle concurrent tool calls? Or does it serialize requests? Not critical for Phase 64 (single client typical), but relevant for Phase 65 (multiple tools from different clients).

These gaps are low-priority and can be addressed in future phases or detailed planning without blocking Phase 64 implementation.

---

*Phase: 64-mcp-server*
*Research completed: 2026-05-08*
