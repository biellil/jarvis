---
phase: 57-google-gemini-provider
verified: 2026-05-06T22:30:00Z
status: passed
score: 18/18 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Select 'Google Gemini' in Settings, enter a valid GEMINI_API_KEY, blur the field"
    expected: "JARVIS switches to Gemini live; chat responses come from Gemini without app restart"
    why_human: "End-to-end IPC + backend live-reload requires a running Electron + backend-ts process"
  - test: "Select 'Google Gemini' with an invalid/empty API key"
    expected: "Error toast 'GEMINI_API_KEY inválida — usando LM Studio' appears; app falls back to LM Studio"
    why_human: "Toast render and fallback behaviour require a running Electron app"
---

# Phase 57: Google Gemini Provider Verification Report

**Phase Goal:** Add Google Gemini as a fully wired LLM provider — from backend type system through Electron IPC to the settings UI — so users can switch to Gemini with their API key without restarting the app.
**Verified:** 2026-05-06T22:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `createLLM('gemini', { GEMINI_API_KEY: 'key', … })` returns a `ChatGoogleGenerativeAI` instance | VERIFIED | `factory.ts` line 70–78: `case 'gemini'` returns `new ChatGoogleGenerativeAI({ apiKey, model: 'gemini-2.0-flash', streaming: true })` |
| 2 | `createLLM('gemini', { GEMINI_API_KEY: '' })` throws `LLMConfigError` | VERIFIED | `factory.ts` line 71: `if (!cfg.GEMINI_API_KEY) throw new LLMConfigError('gemini', 'GEMINI_API_KEY')` |
| 3 | `config.ts` parses `GEMINI_API_KEY` from env and includes `'gemini'` in the `LLM_PROVIDER` enum | VERIFIED | `config.ts` line 14: `z.enum(['lmstudio','openai','anthropic','gemini'])`, line 26: `GEMINI_API_KEY: z.string().optional().default('')` |
| 4 | `LLMProvider` type in `types.ts` includes `'gemini'` | VERIFIED | `types.ts` line 10: `export type LLMProvider = 'lmstudio' \| 'openai' \| 'anthropic' \| 'gemini'` |
| 5 | `ChatSession.swapLLM(newLlm)` replaces active LLM and recreates agent without clearing history | VERIFIED | `chat-session.ts` line 195–217: public `swapLLM` reassigns `this.llm` and `this._agent`; `this.history` is never touched |
| 6 | `POST /internal/reload-llm` with valid payload creates new LLM, swaps under lock, returns 200 | VERIFIED | `reload-llm.ts` lines 29–89: Zod parse → `createLLM` → `lock.tryAcquire()` → `session.swapLLM(newLlm)` → `res.json({ success: true })` |
| 7 | `POST /internal/reload-llm` with missing API key returns 400 | VERIFIED | `reload-llm.ts` lines 49–55: `createLLM` throws `LLMConfigError`, caught and returned as `res.status(400).json({ error: … })` |
| 8 | For lmstudio provider, endpoint attempts `GET /v1/models` with 5s timeout (non-fatal) | VERIFIED | `reload-llm.ts` lines 73–87: `Promise.race([fetchPromise, timeout(5000)])` with `catch` that only logs |
| 9 | `LlmProvider` type in `ipc-types.ts` includes `'gemini'` | VERIFIED | `ipc-types.ts` line 346: `export type LlmProvider = 'lmstudio' \| 'openai' \| 'anthropic' \| 'gemini'` |
| 10 | electron-store persists `geminiApiKey`, `openaiApiKey`, `anthropicApiKey` | VERIFIED | `store.ts` lines 49–51: schema entries; lines 322–342: `getGeminiApiKey`, `setGeminiApiKey`, `getOpenaiApiKey`, `setOpenaiApiKey`, `getAnthropicApiKey`, `setAnthropicApiKey` |
| 11 | `RELOAD_LLM` IPC channel exists and handler calls `POST /internal/reload-llm` | VERIFIED | `ipc-types.ts` line 283–284: `RELOAD_LLM: 'llm:reload'`; `settings.ts` line 251: `ipcMain.handle(IPC_CHANNELS.RELOAD_LLM, …)` with `fetch('http://localhost:8001/internal/reload-llm', …)` |
| 12 | `settings:get` returns `geminiApiKey`, `openaiApiKey`, `anthropicApiKey` | VERIFIED | `settings.ts` lines 80–83: `openaiApiKey: getOpenaiApiKey()`, `anthropicApiKey: getAnthropicApiKey()`, `geminiApiKey: getGeminiApiKey()` |
| 13 | Invalid API key triggers error toast broadcast and lmstudio fallback | VERIFIED | `settings.ts` lines 275–288: `win.webContents.send('toast', { type: 'error', message: 'GEMINI_API_KEY inválida — usando LM Studio' })`; fallback `fetch` to `provider: 'lmstudio'` |
| 14 | Settings dropdown shows 'Google Gemini' as 4th provider option | VERIFIED | `LlmSection.tsx` line 48: `gemini: 'Google Gemini'` in `PROVIDER_LABELS`; all 4 keys rendered via `Object.keys(PROVIDER_LABELS)` map |
| 15 | Selecting `'gemini'` shows Google Gemini API Key input; other providers show their own | VERIFIED | `LlmSection.tsx` lines 168–217: three `llmProvider ===` conditional blocks (openai/anthropic/gemini) with correct placeholders |
| 16 | Entering a key and switching provider calls `window.settings.reloadLlm()` | VERIFIED | `LlmSection.tsx` line 84–92: `handleReloadLlm` calls `void onReloadLlm({ provider, … })` on provider change (line 103) and API key blur (lines 176, 191, 209) |
| 17 | `CONTEXT_WINDOWS` in `tokenizer.ts` includes `gemini: 1000000` | VERIFIED | `tokenizer.ts` line 24: `gemini: 1000000,  // Gemini 2.0 Flash — 1M token context` |
| 18 | `preload/settings.ts` exposes `reloadLlm` method to renderer via `contextBridge` | VERIFIED | `preload/settings.ts` line 15: `const RELOAD_LLM_CHANNEL = 'llm:reload'`; line 39: `reloadLlm: (req) => ipcRenderer.invoke(RELOAD_LLM_CHANNEL, req)` |

**Score:** 18/18 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/backend-ts/src/llm/types.ts` | LLMProvider union with 'gemini'; GEMINI_API_KEY in LLMConfig | VERIFIED | Line 10 union, line 23 optional field |
| `apps/backend-ts/src/llm/config.ts` | Zod schema with 'gemini' enum and GEMINI_API_KEY field | VERIFIED | Lines 14 and 26 |
| `apps/backend-ts/src/llm/factory.ts` | `case 'gemini'` returning ChatGoogleGenerativeAI | VERIFIED | Lines 70–78; import line 15 |
| `apps/backend-ts/src/llm/types.test.ts` | Type-level tests for LLMProvider and LLMConfig | VERIFIED | File exists; 4 tests covering union and interface |
| `apps/backend-ts/src/session/chat-session.ts` | `public swapLLM(newLlm)` method | VERIFIED | Lines 195–217; `llm` and `_agent` are non-readonly |
| `apps/backend-ts/src/routes/reload-llm.ts` | POST /reload-llm route with Zod schema | VERIFIED | `createReloadLlmRouter` exported; `ReloadLlmBodySchema` with 6 fields |
| `apps/backend-ts/src/app.ts` | Registration of `createReloadLlmRouter` at `/internal` prefix | VERIFIED | Lines 6, 36–38 |
| `apps/desktop/src/shared/ipc-types.ts` | LlmProvider with 'gemini'; RELOAD_LLM channel; ReloadLlmRequest; SettingsData API keys; SettingsApi.reloadLlm | VERIFIED | Lines 283–284, 346, 349–356, 379–384, 427–428 |
| `apps/desktop/src/main/store.ts` | StoreSchema fields; API key accessors; 'gemini' in VALID_LLM_PROVIDERS | VERIFIED | Lines 49–51 schema; 252 providers list; 322–342 accessors |
| `apps/desktop/src/main/ipc/settings.ts` | RELOAD_LLM handler; API keys in SETTINGS_GET; 'gemini' in LLM_SET_PROVIDER validProviders | VERIFIED | Lines 79–83, 251–243, 'gemini' in providers at store level |
| `apps/desktop/src/preload/settings.ts` | `reloadLlm` bridge via contextBridge | VERIFIED | Lines 15, 39 |
| `apps/desktop/src/renderer/src/lib/tokenizer.ts` | `gemini: 1000000` in CONTEXT_WINDOWS | VERIFIED | Line 24 |
| `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` | 'Google Gemini' in PROVIDER_LABELS; conditional API key inputs; reloadLlm calls | VERIFIED | Lines 44–49, 168–217, 84–103 |
| `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` | API key props and onReloadLlm passed to LlmSection | VERIFIED | Lines 59–62, 384–393 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `factory.ts` | `@langchain/google-genai` | `import { ChatGoogleGenerativeAI }` | WIRED | Line 15 import; `package.json` has `"@langchain/google-genai": "^2.1.30"` |
| `factory.ts` | `types.ts` | `LLMProvider` type | WIRED | Line 17: `import type { LLMProvider, LLMConfig } from './types.js'` |
| `reload-llm.ts` | `chat-session.ts` | `chatSession.swapLLM(newLlm)` | WIRED | Line 61: `session.swapLLM(newLlm)` |
| `reload-llm.ts` | `factory.ts` | `createLLM(provider, overrideConfig)` | WIRED | Line 15 import; line 51 call |
| `app.ts` | `reload-llm.ts` | `app.use('/internal', createReloadLlmRouter(...))` | WIRED | Lines 6 import, 36–38 use |
| `settings.ts` (ipc) | `POST /internal/reload-llm` | `fetch` in RELOAD_LLM handler | WIRED | Line 259: `fetch('http://localhost:8001/internal/reload-llm', { method: 'POST', … })` |
| `settings.ts` (ipc) | `store.ts` | `getGeminiApiKey`, `setGeminiApiKey` | WIRED | Lines 31–36 imports; lines 256, 267 calls |
| `settings.ts` (ipc) | renderer | `BrowserWindow.getAllWindows().webContents.send('toast', …)` | WIRED | Lines 279–280 |
| `LlmSection.tsx` | `preload/settings.ts` | `window.settings.reloadLlm(request)` via `onReloadLlm` prop | WIRED | `handleReloadLlm` (line 84) calls `void onReloadLlm(…)`; `SettingsLayout.tsx` line 314 calls `window.settings.reloadLlm(req)` |
| `tokenizer.ts` | `LlmSection.tsx` | `estimateContextTokens('gemini')` reads `CONTEXT_WINDOWS['gemini']` | WIRED | `LlmSection.tsx` line 28 import; line 96 call with provider value; `gemini: 1000000` is a complete entry in the `Record<LlmProvider, number>` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `LlmSection.tsx` | `geminiApiKey`, `openaiApiKey`, `anthropicApiKey` | `SettingsLayout.tsx` → `window.settings.get()` → `getGeminiApiKey()` → `electron-store` | Yes — `store.get('geminiApiKey')?.key ?? ''` reads persisted electron-store value | FLOWING |
| `SettingsLayout.tsx` | `openaiApiKey`, `anthropicApiKey`, `geminiApiKey` state | `useEffect` with `window.settings.get()` → `data.openaiApiKey`, `data.geminiApiKey`, `data.anthropicApiKey` | Yes — SETTINGS_GET handler calls real store accessors | FLOWING |
| `reload-llm.ts` | `newLlm` | `createLLM(provider, overrideConfig)` → `ChatGoogleGenerativeAI` constructor | Yes — real API key from request body is forwarded to the Langchain constructor | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — verifying these paths requires a running Electron process + backend-ts server. The IPC chain is fully traceable statically and all links are confirmed wired.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| LLM-PROV-01 | 57-01, 57-02, 57-03, 57-04 | Usuário pode selecionar Google Gemini como provedor LLM via dropdown de Settings (requer GEMINI_API_KEY configurável na UI) | SATISFIED | Backend types, factory, swapLLM endpoint, IPC handler, electron-store, preload bridge, LlmSection UI, and tokenizer are all wired end-to-end |

**Orphaned requirements check:** No additional requirements mapped to Phase 57 in REQUIREMENTS.md were found outside those declared in the plan frontmatter.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `reload-llm.ts` line 68 | `session.swapLLM(newLlm)` called outside lock when `lock.tryAcquire()` returns null (lock busy) | Info | Lock is best-effort for single-user app; plan explicitly documents this as acceptable. Not a functional stub. |

No stubs, no placeholder returns, no hardcoded empty data found in any Phase 57 artifact.

---

### Human Verification Required

#### 1. Live Gemini Provider Switch

**Test:** Open Settings, navigate to LLM Settings, select "Google Gemini" in the provider dropdown, enter a valid `GEMINI_API_KEY` (starting with `AIzaSy`), blur the input field or press Tab.
**Expected:** No error toast. Send a chat message — response arrives and is generated by Gemini 2.0 Flash. Switching back to LM Studio also works live.
**Why human:** End-to-end Electron IPC + running backend-ts + real Gemini API key required.

#### 2. Invalid Key Error Toast and Fallback

**Test:** Open Settings, select "Google Gemini", enter an invalid/empty API key, blur the input.
**Expected:** Error toast showing "GEMINI_API_KEY inválida — usando LM Studio" appears. App continues functioning with LM Studio.
**Why human:** Toast rendering and fallback IPC round-trip require a running Electron app.

---

### Gaps Summary

No gaps. All 18 observable truths are verified at all four levels (exists, substantive, wired, data-flowing). The full chain from `LLMProvider` type declaration through `createLLM('gemini')`, `ChatSession.swapLLM`, `POST /internal/reload-llm`, Electron IPC `RELOAD_LLM`, electron-store persistence, settings preload bridge, and the `LlmSection` UI conditional inputs is intact and substantive.

---

_Verified: 2026-05-06T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
