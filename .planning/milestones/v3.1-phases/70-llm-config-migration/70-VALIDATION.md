---
phase: 70
slug: llm-config-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/desktop, apps/backend-ts) |
| **Config file** | apps/desktop/vitest.config.ts, apps/backend-ts/vitest.config.ts |
| **Quick run command** | `pnpm --filter @jarvis/desktop test:run` or `pnpm --filter @jarvis/backend-ts test:run` (scoped por workspace afetado) |
| **Full suite command** | `pnpm -r test:run` |
| **Estimated runtime** | ~60-90 seconds for full suite |

---

## Sampling Rate

- **After every task commit:** Run scoped test (`pnpm --filter @jarvis/desktop test:run path/to/test`)
- **After every plan wave:** Run workspace suite (`pnpm --filter @jarvis/desktop test:run` or backend-ts)
- **Before `/gsd-verify-work`:** Full repo suite must be green (`pnpm -r test:run`)
- **Max feedback latency:** ~30 seconds per scoped run

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | SIMP-03 | Pure migration function preserves comments, key order, blank lines | unit | `pnpm --filter @jarvis/desktop test:run src/main/migrations/__tests__/llm-config.test.ts` | ❌ W0 | ⬜ pending |
| 70-01-02 | 01 | 1 | SIMP-03 | `.env` wins over electron-store; empty/missing key triggers fill | unit | `pnpm --filter @jarvis/desktop test:run src/main/migrations/__tests__/llm-config.test.ts` | ❌ W0 | ⬜ pending |
| 70-01-03 | 01 | 1 | SIMP-03 | electron-store keys batch-deleted in single atomic write after success | unit | `pnpm --filter @jarvis/desktop test:run src/main/migrations/__tests__/llm-config.test.ts` | ❌ W0 | ⬜ pending |
| 70-01-04 | 01 | 1 | SIMP-03 | Idempotency: 2nd run is no-op | unit | `pnpm --filter @jarvis/desktop test:run src/main/migrations/__tests__/llm-config.test.ts` | ❌ W0 | ⬜ pending |
| 70-01-05 | 01 | 1 | SIMP-03 | Missing `.env` → silent no-op with log warning | unit | `pnpm --filter @jarvis/desktop test:run src/main/migrations/__tests__/llm-config.test.ts` | ❌ W0 | ⬜ pending |
| 70-01-06 | 01 | 1 | SIMP-03 | Atomic write via temp file + rename; no partial state on crash | unit | `pnpm --filter @jarvis/desktop test:run src/main/migrations/__tests__/llm-config.test.ts` | ❌ W0 | ⬜ pending |
| 70-01-07 | 01 | 2 | SIMP-03 | Migration hook called before `process.loadEnvFile` in `main/index.ts` | integration | `grep "migrateLlmConfigToEnv" apps/desktop/src/main/index.ts` + manual smoke | ✅ existing | ⬜ pending |
| 70-01-08 | 01 | 2 | SIMP-04 | electron-store schema entries for migrated keys deleted from `store.ts` | grep | `! grep -E "lmStudioUrl\\?|llmProvider\\?|geminiApiKey\\?|openaiApiKey\\?|anthropicApiKey\\?|streamingLMStudioEventsEnabled\\?" apps/desktop/src/main/store.ts` | ✅ existing | ⬜ pending |
| 70-01-09 | 01 | 2 | SIMP-04 | Accessors removed from `store.ts` | grep | `! grep -E "getLmStudioUrl\|setLmStudioUrl\|getLlmProvider\|setLlmProvider\|getGeminiApiKey\|setGeminiApiKey\|getOpenaiApiKey\|setOpenaiApiKey\|getAnthropicApiKey\|setAnthropicApiKey\|getStreamingLMStudioEventsEnabled\|setStreamingLMStudioEventsEnabled" apps/desktop/src/main/store.ts` | ✅ existing | ⬜ pending |
| 70-02-01 | 02 | 1 | SIMP-04 | Backend `routes/reload-llm.ts` deleted | grep | `! test -f apps/backend-ts/src/routes/reload-llm.ts` | ❌ W0 | ⬜ pending |
| 70-02-02 | 02 | 1 | SIMP-04 | `app.ts` no longer registers reload-llm router | grep | `! grep "createReloadLlmRouter\|reload-llm" apps/backend-ts/src/app.ts` | ✅ existing | ⬜ pending |
| 70-02-03 | 02 | 1 | SIMP-01 | `.env.example` contains `USE_LM_STUDIO_STREAMING_EVENTS=false` with comment | grep | `grep "USE_LM_STUDIO_STREAMING_EVENTS" .env.example` | ✅ existing | ⬜ pending |
| 70-02-04 | 02 | 1 | SIMP-04 | Backend Zod schema still parses all 6 keys correctly (no regression) | unit | `pnpm --filter @jarvis/backend-ts test:run src/llm/config.test.ts` | ✅ existing | ⬜ pending |
| 70-02-05 | 02 | 2 | SIMP-04 | `routes/mcp-client.ts` deleted (D-20 default) | grep | `! test -f apps/backend-ts/src/routes/mcp-client.ts` | ❌ W0 | ⬜ pending |
| 70-03-01 | 03 | 1 | SIMP-01 | `LlmSection.tsx` deleted | grep | `! test -f apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` | ❌ W0 | ⬜ pending |
| 70-03-02 | 03 | 1 | SIMP-02 | `McpSection.tsx` deleted | grep | `! test -f apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` | ❌ W0 | ⬜ pending |
| 70-03-03 | 03 | 1 | SIMP-01 | `SettingsLayout.tsx` no longer imports LlmSection/McpSection | grep | `! grep "LlmSection\|McpSection" apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` | ✅ existing | ⬜ pending |
| 70-03-04 | 03 | 1 | SIMP-01 | SectionKey union excludes `'llm'` and `'mcp-server'` | grep | `! grep -E "'llm'\\|.*'mcp-server'\|'mcp-server'\\|.*'llm'" apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` | ✅ existing | ⬜ pending |
| 70-03-05 | 03 | 1 | SIMP-01 | IPC channels RELOAD_LLM, LLM_SET_PROVIDER, STREAMING_LM_STUDIO_EVENTS_SET removed from ipc-types | grep | `! grep -E "RELOAD_LLM\|LLM_SET_PROVIDER\|STREAMING_LM_STUDIO_EVENTS_SET" apps/desktop/src/shared/ipc-types.ts` | ✅ existing | ⬜ pending |
| 70-03-06 | 03 | 1 | SIMP-02 | `mcp-settings.ts` IPC file deleted | grep | `! test -f apps/desktop/src/main/ipc/mcp-settings.ts` | ❌ W0 | ⬜ pending |
| 70-03-07 | 03 | 1 | SIMP-01/02 | Preload `window.mcp` bridge removed | grep | `! grep "exposeInMainWorld.*mcp" apps/desktop/src/preload/settings.ts` | ✅ existing | ⬜ pending |
| 70-03-08 | 03 | 1 | SIMP-01 | IPC handlers for LLM removed from `settings.ts` (handlers §226-244, §277-309, §316-364) | grep | `! grep -E "LLM_SET_PROVIDER\|RELOAD_LLM\|STREAMING_LM_STUDIO_EVENTS_SET" apps/desktop/src/main/ipc/settings.ts` | ✅ existing | ⬜ pending |
| 70-03-09 | 03 | 1 | SIMP-04 | `settings:get` payload no longer ships llmProvider/lmStudioUrl/*ApiKey/streaming | grep | `! grep -E "lmStudioUrl:\|llmProvider:\|geminiApiKey:\|openaiApiKey:\|anthropicApiKey:\|streamingLMStudioEventsEnabled:" apps/desktop/src/main/ipc/settings.ts` | ✅ existing | ⬜ pending |
| 70-03-10 | 03 | 2 | SIMP-01/02 | Settings tests no longer mock LLM/MCP getters | unit | `pnpm --filter @jarvis/desktop test:run src/main/ipc/__tests__/settings.test.ts` | ✅ existing | ⬜ pending |
| 70-03-11 | 03 | 2 | SIMP-01 | `tokenizer.ts` deleted if orphaned (planner verifies via grep) | grep | `(test -f apps/desktop/src/renderer/src/lib/tokenizer.ts && ! grep -rn "estimateContextTokens" apps/desktop/src/renderer/) || ! test -f apps/desktop/src/renderer/src/lib/tokenizer.ts` | ✅ existing | ⬜ pending |
| 70-03-12 | 03 | 2 | SIMP-01 | `LlmProvider` type deleted if orphaned | grep | `(grep "LlmProvider" apps/desktop/src/shared/ipc-types.ts && grep -rn "LlmProvider" apps/) || ! grep "LlmProvider" apps/desktop/src/shared/ipc-types.ts` | ✅ existing | ⬜ pending |
| 70-03-13 | 03 | 2 | SIMP-01/02 | TypeScript compiles cleanly post-strip | typecheck | `pnpm -r typecheck` | ✅ existing | ⬜ pending |
| 70-03-14 | 03 | 2 | SIMP-04 | End-to-end smoke: edit `.env` LLM_PROVIDER, restart Electron, backend uses new provider | manual | Manual smoke test per acceptance criterion 4 | ❌ Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/migrations/__tests__/llm-config.test.ts` — unit tests for pure migration function (SIMP-03)
- [ ] Reuse existing vitest infrastructure (no new framework install needed)

*Existing infrastructure (`vitest`, `pnpm`, workspace test scripts) covers all phase requirements except the new migration test file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First boot post-v3.1 with legacy electron-store migrates to `.env` without user intervention | SIMP-03 | Real OS user data dir + real `.env` file, can't replicate in CI | (a) Backup current `.env` and `settings.json` (`app.getPath('userData')/config.json`). (b) Restore an old `settings.json` with `llmProvider`, `lmStudioUrl`, and `*ApiKey` keys populated. (c) Edit `.env` to remove `LLM_PROVIDER=` line. (d) Start Electron app. (e) Verify `.env` now has the migrated values; `settings.json` no longer has those keys. (f) Verify chat uses the migrated provider. |
| `.env` change + restart applies new provider | SIMP-04 | Requires real LM Studio + real provider switch | (a) Set `LLM_PROVIDER=lmstudio` in `.env`, start app, verify chat uses LM Studio. (b) Close app. (c) Edit `.env` to `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=sk-ant-...`. (d) Restart app. (e) Verify chat uses Anthropic Claude. |
| Settings UI no longer shows LLM/MCP sections | SIMP-01, SIMP-02 | Visual confirmation of absence | (a) Open Settings window. (b) Verify nav has no "LLM" or "Servidor MCP" entries. (c) Confirm no provider dropdown, API key fields, or LM Studio URL input. (d) Confirm no MCP toggle, client list, or reload button. |
| MCP Client `.env` hot-reload still works (no UI button after P70) | SIMP-02 + P65 regression | Confirm P65 env-watcher path remains intact | (a) With app running and MCP_SERVER_URL set in `.env`, verify tools available in chat. (b) Edit `.env` to change `MCP_SERVER_URL` (or remove it). (c) Save file. (d) Trigger new ChatSession (new conversation). (e) Verify tools reflect updated `.env` without restart. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`llm-config.test.ts`)
- [ ] No watch-mode flags (vitest used with `:run` suffix)
- [ ] Feedback latency < 30s per scoped run
- [ ] `nyquist_compliant: true` set in frontmatter after planner ratifies coverage

**Approval:** pending
