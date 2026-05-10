---
phase: 65
slug: mcp-client
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: derived from `65-RESEARCH.md` § Validation Architecture (lines 665-711).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 (already in `apps/backend-ts/devDependencies`) |
| **Config file** | `apps/backend-ts/vitest.config.ts` (existing — Phase 65 inherits) |
| **Quick run command** | `pnpm --filter @jarvis/backend-ts test -- src/mcp/client/__tests__` |
| **Full suite command** | `pnpm --filter @jarvis/backend-ts test` |
| **Estimated runtime** | ~25 seconds (quick) / ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @jarvis/backend-ts test -- src/mcp/client/__tests__`
- **After every plan wave:** Run `pnpm --filter @jarvis/backend-ts test src/mcp src/session src/config`
- **Before `/gsd-verify-work`:** Full suite must be green + manual E2E (Plan 65-04)
- **Max feedback latency:** 30 seconds (quick run target)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-02-XX | 02 | 1 | MCP-CLI-01 | — | configFromEnv reads 3 envs, validates URL | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "configFromEnv"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-01 | — | empty MCP_SERVER_URL → silent disable | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "boot silent opt-in"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-01 | — | malformed URL → log error, stay disconnected | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "invalid URL"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-02 | — | external tools spread into ChatSession allTools | unit | `pnpm --filter @jarvis/backend-ts test src/session/__tests__/chat-session.test.ts -t "external tools spread"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-02 | — | tool.invoke forwards to client.callTool | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "invoke forwards to client.callTool"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-02 (D-05) | — | tool name prefixed with MCP_SERVER_NAME | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "prefixed name"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-02 (D-07) | — | description annotated `[via {NAME}]` | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "annotated description"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-02 (D-06) | — | collision with native tool → external skipped + warn | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "collision skip"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-03 | — | listTools() results converted to LangChain tools | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "discovers and registers"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | MCP-CLI-03 | — | JSON Schema → Zod preserves required fields | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "schema preserves required"` | ❌ W0 | ⬜ pending |
| 65-03-XX | 03 | 2 | MCP-CLI-01 (SC1) | — | chokidar change on .env with MCP_SERVER_URL change → reload called | integration | `pnpm --filter @jarvis/backend-ts test src/config/__tests__/env-watcher.test.ts -t "MCP_SERVER_URL change triggers reload"` | ❌ W0 | ⬜ pending |
| 65-03-XX | 03 | 2 | MCP-CLI-01 (SC1) | — | non-MCP key change → reload NOT called | integration | `pnpm --filter @jarvis/backend-ts test src/config/__tests__/env-watcher.test.ts -t "non-MCP change ignored"` | ❌ W0 | ⬜ pending |
| 65-03-XX | 03 | 2 | MCP-CLI-01 (SC1) | — | atomic save (unlink+add <100ms) debounced to single reload | integration | `pnpm --filter @jarvis/backend-ts test src/config/__tests__/env-watcher.test.ts -t "atomic save debounce"` | ❌ W0 | ⬜ pending |
| 65-03-XX | 03 | 2 | MCP-CLI-02 (D-11) | — | reload during active turn → tool array snapshot stable | unit | `pnpm --filter @jarvis/backend-ts test src/session/__tests__/chat-session.test.ts -t "tools snapshot stable across reload"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | SC2 | — | agent uses external tool end-to-end (mock server) | integration | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/e2e-mock-server.test.ts -t "agent uses external tool"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | SC3 | — | connect failure on boot → manager empty, no crash | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "connect failure leaves manager empty"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | SC3 (D-16) | — | server dies mid-call → pt-BR structured error to LLM | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "server down returns pt-BR error"` | ❌ W0 | ⬜ pending |
| 65-02-XX | 02 | 1 | SC3 (D-17) | — | tool timeout >30s → returns timeout error, agent unblocked | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "30s timeout"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Note:** Task IDs use `65-{plan}-XX` placeholders — final IDs assigned by gsd-planner.

---

## Wave 0 Requirements

- [ ] `apps/backend-ts/src/mcp/client/__tests__/manager.test.ts` — covers MCP-CLI-01, MCP-CLI-03, SC3
- [ ] `apps/backend-ts/src/mcp/client/__tests__/tool-adapter.test.ts` — covers MCP-CLI-02, MCP-CLI-03, SC3
- [ ] `apps/backend-ts/src/mcp/client/__tests__/env-diff.test.ts` — covers env-diff helper
- [ ] `apps/backend-ts/src/mcp/client/__tests__/e2e-mock-server.test.ts` — covers SC2 with in-process mock MCP server
- [ ] `apps/backend-ts/src/config/__tests__/env-watcher.test.ts` — covers SC1
- [ ] Extend `apps/backend-ts/src/session/__tests__/chat-session.test.ts` — external tools spread + D-11 snapshot stability
- [ ] Mock MCP server fixture (`apps/backend-ts/src/mcp/client/__tests__/fixtures/mock-server.ts`) — in-process MCP server, used by e2e-mock-server.test.ts
- [ ] No new framework install — vitest is already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real n8n connection (Bearer auth + tool call round-trip) | MCP-CLI-01/02/03 | Requires running n8n instance + valid credentials; not reproducible in CI | Plan 65-04: configure `.env` with live n8n URL+token, run `pnpm dev`, ask JARVIS via voice/text to invoke an n8n tool, observe response |
| Hot reload UX (edit `.env` mid-session, see new tools next turn) | SC1 | Combines file watcher + ChatSession lifecycle + IPC + UI status — better proven by manual sequence | Plan 65-04: with backend running, append/change `MCP_SERVER_NAME` in `.env`, send next message, verify new prefix appears in tool log |
| Settings UI sub-block (status label + Reconectar button) | D-10 | UI rendering, IPC subscription, focus/loading states best verified visually | Plan 65-04: open Settings, observe `Conectado a {N}: {N} tools`, click Reconectar after server bounce, observe spinner + status update |
| Voice narration of pt-BR error when server dies mid-conversation | SC3 (D-16) | Audible TTS quality + LLM tone better verified by ear | Plan 65-04: kill n8n process during tool call, listen to JARVIS narrate the error in pt-BR |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
