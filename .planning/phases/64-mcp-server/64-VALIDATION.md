---
phase: 64
slug: mcp-server
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing project setup) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/mcp/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/mcp/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | MCP-SRV-01 | unit | `npx vitest run src/mcp/server.test.ts` | ❌ W0 | ⬜ pending |
| 64-01-02 | 01 | 1 | MCP-SRV-01 | unit | `npx vitest run src/mcp/tools.test.ts` | ❌ W0 | ⬜ pending |
| 64-02-01 | 02 | 2 | MCP-SRV-02 | unit | `npx vitest run src/mcp/tools.test.ts` | ❌ W0 | ⬜ pending |
| 64-03-01 | 03 | 2 | MCP-SRV-03 | unit | `npx vitest run src/mcp/client-tracker.test.ts` | ❌ W0 | ⬜ pending |
| 64-03-02 | 03 | 3 | MCP-SRV-03 | manual | N/A — Electron IPC integration | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/mcp/server.test.ts` — stubs for MCP-SRV-01 (server startup, tool registration)
- [ ] `src/mcp/tools.test.ts` — stubs for MCP-SRV-01/02 (tool delegation: recall_memory, list_files)
- [ ] `src/mcp/client-tracker.test.ts` — stubs for MCP-SRV-03 (connect/disconnect tracking)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Desktop connects and calls recall_memory | MCP-SRV-01 | Requires live Claude Desktop install + config | 1. Add JARVIS to claude_desktop_config.json, 2. Restart Claude Desktop, 3. Ask Claude to recall a memory |
| Cursor queries conversation history | MCP-SRV-02 | Requires live Cursor/Windsurf IDE install | 1. Configure MCP server in Cursor, 2. Ask Cursor agent to list recent conversations |
| Settings toggle starts/stops MCP server | MCP-SRV-03 | Electron UI interaction | 1. Open Settings, 2. Toggle MCP off → verify no active server, 3. Toggle on → verify server responds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
