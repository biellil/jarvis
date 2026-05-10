# Phase 64: MCP Server - Context (Draft)

**Status:** Ready for discussion/planning
**Researched:** 2026-05-08

## Phase Boundary

Implementar servidor MCP (Model Context Protocol) no backend TypeScript que expõe as tools do JARVIS (PC control, memória) via protocolo stdin-based para que clientes como Claude Desktop, Cursor e Windsurf possam chamá-las nativamente. Escopo: McpServer com StdioServerTransport, tool registration via Zod schema, integração com `MemoryManager` e `pc-tools` existentes, toggle enable/disable em Settings UI, tracking básico de clientes. Fora de escopo: HTTP Streamable transport (v3.1), múltiplos servidores MCP (v3.1), OAuth/autenticação, rate limiting, streaming responses.

---

## Proposed Decisions (Claude's Discretion)

### MCP Server Architecture

- **D-01:** MCP server roda como parte do processo backend-ts (não subprocess isolado). Inicia na primeira interação do usuário com Settings toggle (lazy startup), não no boot automático. Reduz overhead de memória quando usuário não usa MCP.

- **D-02:** Transport **stdio only** para Phase 64. Cliente (Claude Desktop, Cursor, Windsurf) spawna server como child process; comunicação via stdin/stdout com JSON-RPC 2.0 newline-delimited messages. HTTP Streamable deferred v3.1.

- **D-03:** Tools expostas via MCP são **delegados** para business logic existente (MemoryManager, pc-tools.ts, etc.). Não duplicar lógica. McpServer apenas wraps as chamadas com schema Zod validation e response formatting.

- **D-04:** **Sem stdout logging** em stdio server. Use `console.error()` ou file-based logging (pino com file transport). `console.log()` corrompe JSON-RPC protocol — crítico.

### Tool Exposure Scope

- **D-05:** Phase 64 expõe **subset conservador**: `recall_memory`, `list_files`, `openFile`, `openFolder`, `viewContent`. Essas são read-safe ou não destrutivas. Operações destrutivas (moveFile, renameFile, mediaControl) defer para Phase 65+ (MCP-SRV-01 satisfeito com read-safe subset).

- **D-06:** Cada tool registrada com `inputSchema` Zod que auto-gera JSON Schema para client discovery. Client chama `listTools()` para descobrir capabilities. Zero custom schema needed.

- **D-07:** Tool execution **nunca propaga errors não-tratados**. Sempre retorna `{ content: [{ type: "text", text: "erro description", isError: true }] }`. Exemplo: recall_memory que falha retorna string amigável em pt-BR, não exception.

### Client Session Tracking (MCP-SRV-03)

- **D-08:** Client tracking é **application-level** (não SDK built-in). Manter Map<sessionId, ClientMetadata> em memory no mcp/client-sessions.ts. sessionId pode ser "stdio" (implícito, único per processo).

- **D-09:** Para Phase 64, client identification é simpificada: "Unknown Client via stdio" ou anotação manual pelo usuário em Settings. Rich identification (Claude Desktop vs Cursor vs Windsurf) defer v3.1 com HTTP Streamable + User-Agent headers.

- **D-10:** Settings IPC handler `mcp:get-connected-clients` retorna lista simples (name, connectedAt, lastActivity). UI mostra clients conectados em widget simples (ex: "1 client connected: Unknown").

### Settings UI & Electron Integration

- **D-11:** Settings nova seção `McpSection` com toggle on/off. Toggle persiste em electron-store (`mcpServerEnabled: boolean`). Ao toggle on, IPC handler `mcp:toggle` inicia server (lazy); toggle off para server.

- **D-12:** UI mostra status "Servidor MCP: [Ativo / Inativo]" + "Clientes conectados: X". Botão "Desabilitar" ou toggle switch simples.

- **D-13:** **Sem erro UI** se MCP server falhar ao iniciar (ex: porta locked, ONNX runtime issue). Mostrar toast de aviso "MCP server não iniciou — verifique logs". Servidor MCP é **optional feature**, não critical path.

### JSON-RPC & Protocol Compliance

- **D-14:** MCP SDK (StdioServerTransport) maneja message framing (newline-delimited), request/response routing, error codes per spec. Developer apenas registra tools + implementa handlers.

- **D-15:** Input validation via Zod schema em server.tool(). Prevent injection attacks reusando `isPathValid()` de Phase 54 para path tools (list_files, openFile, viewContent).

---

## Deferred Ideas

- **HTTP Streamable transport** — Remote MCP server access, load balancer support, multi-instance. Defer v3.1+ quando usar case remoto existir.

- **Múltiplos servidores MCP** — Multiple upstream MCP servers (n8n, etc.). Phase 65 (MCP-CLI-01) e v3.1+.

- **OAuth / Autenticação** — Relevante apenas se MCP server ficar remoto (internet-exposed). Local stdio é implicitamente local-trusted.

- **Tool timeout configurável** — Usuário define timeout per-tool. MVP simples: timeout padrão 30s, logs warning se tool lento. Revisit se problema real aparecer.

- **Streaming tool responses** — Long-running tools retornam chunks progressivamente. Util para batch operations (Phase 66+). Phase 64 tools sync-only.

- **Rate limiting** — Agentic tasks (Phase 66) poderão abusar tools; rate limiting importante então. Phase 64 não precisa.

- **Prompts (MCP third capability)** — Templates para planejamento de tarefas. Defer Phase 66 (Agentic Tasks).

---

## Canonical References

**Agents MUST read before planning:**

### Phase scope
- `.planning/ROADMAP.md` § Phase 64 — goal, success criteria (3 critérios)
- `.planning/REQUIREMENTS.md` § MCP Server (JARVIS expõe tools via MCP) — MCP-SRV-01/02/03

### Existing tool infrastructure
- `apps/backend-ts/src/session/tools.ts` — `createRecallMemoryTool()`, interface tool creation
- `apps/backend-ts/src/session/pc-tools.ts` — PC control tools (list_files, openFile, etc.) — MCP expõe essas
- `apps/backend-ts/src/memory/index.ts` — MemoryManager.buildContext() — recall_memory delega aqui
- `apps/backend-ts/src/session/request-file-action.ts` — File action tool (openFile, moveFile, etc.)

### Security reference
- `apps/backend-ts/src/session/tool-dispatch.ts` — Path validation pattern (`isPathValid` from Phase 54)

### Phase 62 patterns (TTS, Settings)
- `.planning/phases/62-kokoro-offline-tts/62-CONTEXT.md` — Apply-without-restart pattern, Settings UI toggle, IPC handlers

### MCP Official Docs
- [Build an MCP server](https://modelcontextprotocol.io/docs/develop/build-server) — McpServer, tool registration, logging
- [Getting Started with Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) — stdio transport, client config
- [Transports - Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — JSON-RPC, protocol compliance, security

---

## Code Context

### Reusable Assets

- **Tool creation pattern from Phase 17:** `tool()` from `@langchain/core/tools` + Zod schema — MCP tools reuse same pattern, just wrap for MCP response format
- **Tool execution from existing code:** `pc-tools.ts` has all PC control logic already; MCP layer just delegates
- **IPC patterns from Phase 52+:** electron-store + ipcMain.handle() — reuse for `mcp:toggle`, `mcp:get-connected-clients`
- **Settings UI from Phase 48+:** Field, Select, Label primitivos — build McpSection from existing patterns
- **Error handling precedent:** Phase 54 (LLM Actions) shows how to safely execute arbitrary tools with validation + logging

### Integration Points

- `backend-ts/src/index.ts` — MCP server init at backend startup (lazy, after first Settings toggle)
- `apps/desktop/src/main/ipc/mcp-settings.ts` — New file for IPC handlers (mcp:toggle, mcp:get-connected-clients)
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — New Settings UI section
- `apps/desktop/src/main/store.ts` — `StoreSchema` extension: `mcpServerEnabled: boolean`

---

*Phase: 64-mcp-server*
*Context prepared: 2026-05-08*
*Status: Ready for discussion*
