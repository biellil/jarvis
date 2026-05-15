---
phase: 69-mcp-server-removal
reviewed: 2026-05-10T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  - apps/desktop/src/main/ipc/mcp-settings.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/preload/settings.ts
  - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
  - apps/desktop/src/renderer/src/settings/sections/McpSection.tsx
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 69: Code Review Report

**Reviewed:** 2026-05-10
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found (2 informational items, no blockers)

## Summary

Phase 69 deletes the MCP **Server** surface (stdio transport + tools) from the Electron desktop app, keeping the MCP **Client** surface untouched. The review focused on verifying that no dangling references to removed symbols remain in the eight files in scope, and that the smaller settings contract is internally consistent.

**Verification of removal completeness (all CLEAR):**

- No references to `MCP_TOGGLE`, `MCP_GET_CONNECTED_CLIENTS` anywhere in `apps/desktop/src/` (verified via grep across the whole desktop tree).
- No references to `getMcpServerEnabled`, `setMcpServerEnabled`, or `mcpServerEnabled` in the reviewed files or anywhere else in `apps/desktop/src/`.
- No imports of `McpClientInfo` left in `mcp-settings.ts`, `preload/settings.ts`, `SettingsLayout.tsx`, or `McpSection.tsx`. The type is no longer used.
- `mcpServerEnabled` removed from `StoreSchema`, `SettingsData`, and the `SETTINGS_GET` handler return shape. Test expectations updated accordingly.
- Channel strings `'mcp:toggle'` and `'mcp:get-connected-clients'` no longer appear in the preload layer.
- Sub-block "Cliente MCP" in `McpSection` is preserved intact (uses `reloadClient`, `getClientStatus`, `onClientStatusChanged` — all wired through `window.mcp`).
- Section key `'mcp-server'` and nav label "Servidor MCP" are preserved as intended per phase CONTEXT D-13/D-14 — `McpSection` now renders only the client sub-block.
- `setupMcpSettingsHandlers` is still exported and still called from `apps/desktop/src/main/ipc/index.ts` (verified).
- Test file `settings.test.ts` no longer mocks `getMcpServerEnabled` and no longer expects `mcpServerEnabled` in the `SETTINGS_GET` shape — both diffs match the production code shape.

The remaining `Phase 69:` doc comments in `mcp-settings.ts`, `McpSection.tsx`, and `preload/settings.ts` are accurate "what we removed and why" notes — useful for grep archaeology, not stale code.

No bugs, no security issues, no blockers. Two Info items follow.

## Info

### IN-01: `SettingsData` declares `quietHours` / `folderWatch` / `dailySummary` as required, but `SETTINGS_GET` handler doesn't return them

**File:** `apps/desktop/src/shared/ipc-types.ts:431-433`
**Also at:** `apps/desktop/src/main/ipc/settings.ts:66-100` (handler omits these fields)
**Also at:** `apps/desktop/src/main/ipc/__tests__/settings.test.ts:273-299` (test expectation also omits them)

**Issue:** `SettingsData` declares the three proactive fields as non-optional, but neither the `SETTINGS_GET` handler nor the `settings.test.ts` `toEqual` expectations include them. The test passes only because Vitest `toEqual` performs symmetric structural equality (both expected and actual omit the keys), but at runtime `window.settings.get()` resolves to an object the TypeScript type claims is impossible. `SettingsLayout.tsx:171-173` already handles this defensively (`if (data.quietHours) setQuietHoursState(...)`), so there is no user-visible bug today — but the type contract is dishonest.

This is **pre-existing** (introduced in Phase 67) and **not caused by Phase 69**. Flagging it here only because Phase 69 trimmed the same handler and the next contributor will likely notice the gap when touching this file again. Out of phase scope to fix.

**Fix (deferred — not Phase 69 work):** Either make the three fields optional in `SettingsData`:
```typescript
quietHours?: QuietHoursConfig;
folderWatch?: FolderWatchConfig;
dailySummary?: DailySummaryConfig;
```
…or add them to the `SETTINGS_GET` return:
```typescript
quietHours: getQuietHours(),
folderWatch: getFolderWatch(),
dailySummary: getDailySummary(),
```
Pick one and update the test fixture to match.

### IN-02: `McpRendererApi` interface duplicated in preload — could be hoisted to shared types

**File:** `apps/desktop/src/preload/settings.ts:125-127`

**Issue:** `McpRendererApi` extends `NonNullable<SettingsApi['mcp']>` with an `onClientStatusChanged` method declared locally only because `SettingsApi.mcp` (in `shared/ipc-types.ts:543-548`) predates push-style listeners. The renderer-side `McpSection.tsx` mirrors a similar `McpWindowApi` interface at line 31-35 with the same three fields. Two ad-hoc interfaces describing the same `window.mcp` surface is a code smell — a future MCP method added to one but not the other will silently diverge.

Phase 69 didn't introduce this either, but the duplication is now more visible because the surface got smaller (only three methods instead of five). Cheaper to consolidate now than later.

**Fix (deferred — quality polish, not Phase 69 work):** Move `McpRendererApi` (or equivalent `McpClientApi`) into `shared/ipc-types.ts`, then update the global `Window.mcp` declaration (line 638) and the `McpSection` local interface to consume the shared type. Keeps the renderer free of structural definitions for IPC bridges.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
