# Deferred Items — Quick 260715-07o

## Pre-existing test failures (out of scope)

`src/session/chat-session.test.ts` has 2 failing tests unrelated to this plan's changes:

- `chama createReactAgent uma vez com llm, tools e prompt durante create()` — expects
  `arg.tools` to have length 14, receives 16.
- `Phase 65: external tools spread into allTools when mcpManager has tools (MCP-CLI-02)` —
  expects length 15, receives 17.

Confirmed pre-existing via `git stash` + re-run before any Quick 260715-07o edits — same 2
failures with identical counts (16/17 vs expected 14/15). Likely caused by tool count drift
from a prior phase (extra PC tools registered) that never updated these hardcoded length
assertions. Not touched by this plan's provider-aware `withStructuredOutput` threading —
left as-is per scope boundary (deviation rules).
