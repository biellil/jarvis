---
phase: 57-google-gemini-provider
plan: "04"
subsystem: desktop-renderer
tags: [gemini, llm-provider, settings-ui, renderer, tdd]
dependency_graph:
  requires: [57-01, 57-03]
  provides: [renderer-gemini-ui, settings-api-key-inputs, tokenizer-1m-context]
  affects: [LlmSection, SettingsLayout, tokenizer, preload-settings]
tech_stack:
  added: []
  patterns:
    - Conditional API key inputs per selected LLM provider (DOM insertion/removal)
    - handleReloadLlm helper triggers window.settings.reloadLlm() on provider change and key blur
    - Pick<SettingsSectionProps> narrowing to pass only required props to LlmSection
key_files:
  created: []
  modified:
    - apps/desktop/src/renderer/src/lib/tokenizer.ts
    - apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
decisions:
  - "Radix Select in happy-dom requires fireEvent.click on trigger before SelectContent items are queryable"
  - "Use @shared alias for ipc-types import in LlmSection to avoid fragile 5-level relative path"
  - "handleReloadLlm called on both provider change and API key blur — single source of truth"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-06"
  tasks_completed: 2
  files_changed: 4
---

# Phase 57 Plan 04: Renderer UI — Gemini Dropdown, API Key Inputs, Tokenizer Fix Summary

One-liner: Wired renderer-side Gemini provider UI — conditional API key inputs for all cloud providers, 1M context window in tokenizer, and reloadLlm trigger on provider switch and key blur.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix gemini context window in tokenizer (32000 → 1000000) | 1652400 | tokenizer.ts |
| 2 | Extend LlmSection with Gemini dropdown, conditional API key inputs, update tests | 7d39a6d | LlmSection.tsx, LlmSection.test.tsx, SettingsLayout.tsx |

## What Was Built

**Tokenizer fix:** Corrected `CONTEXT_WINDOWS['gemini']` from 32000 (incorrect value left by Wave 2 executor) to 1000000 — Gemini 2.0 Flash's actual 1M token context window. This prevents false context overflow warnings when users select the Gemini provider.

**LlmSection enhancements:**
- Added `gemini: 'Google Gemini'` to `PROVIDER_LABELS` — dropdown now shows 4 options
- Added 3 conditional API key Field blocks (openai / anthropic / gemini) — DOM insertion/removal, one visible at a time per selected provider
- Added `handleReloadLlm()` helper that calls `window.settings.reloadLlm()` with the active provider and relevant API key
- `handleProviderSelect` now calls `handleReloadLlm` after `onLlmProviderChange` for immediate backend reload
- `handleModalConfirm` (context overflow modal) also calls `handleReloadLlm` after confirming provider switch
- API key input blur triggers `handleReloadLlm` so changed keys take effect without a Save button

**SettingsLayout enhancements:**
- Added `openaiApiKey`, `anthropicApiKey`, `geminiApiKey`, `onReloadLlm` to `SettingsSectionProps` interface
- Added state variables for each API key, populated from `settings:get` in `useEffect`
- Added `handleReloadLlm` async handler calling `window.settings.reloadLlm(req)` with error toast on failure
- Passed new props to `<LlmSection>` in the `renderSection()` switch

**Tests:** Added 5 new tests in `LlmSection.test.tsx` for Phase 57 behavior. All 11 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected pre-existing wrong import path in LlmSection**
- **Found during:** Task 2
- **Issue:** LlmSection.tsx imported `'../../../../../shared/ipc-types'` (5 levels up) which resolves to `apps/desktop/shared/ipc-types` — a path that doesn't exist. Caused TS compilation error.
- **Fix:** Changed to `'@shared/ipc-types'` using the `@shared/*` path alias defined in `tsconfig.json`.
- **Files modified:** `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx`
- **Commit:** 7d39a6d

**2. [Rule 1 - Bug] Fixed test for Radix Select "Google Gemini" text discovery**
- **Found during:** Task 2 TDD green phase
- **Issue:** Test `screen.getByText('Google Gemini')` failed because Radix Select renders SelectContent items in a portal that isn't populated in happy-dom until the trigger is clicked.
- **Fix:** Added `fireEvent.click(selectTrigger)` before the text assertion — consistent with existing test pattern in the file.
- **Files modified:** `apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx`
- **Commit:** 7d39a6d

**3. [Context note] Tokenizer had wrong gemini value (32000)**
- The context note warned about this: Wave 2 executor pre-emptively added `gemini: 32000` to tokenizer.ts with an incorrect value. Task 1 corrected it to `1000000`.
- The preload `reloadLlm` was already correctly added by Wave 2 — no duplication needed.

**4. [Context note] Merged from master before starting**
- This worktree was at commit `099a70f` (plan 01 only). Plans 02 and 03 existed on master but not in this worktree. Merged master (fast-forward) to get current state before executing plan 04.

## Verification Results

```
Test Files  1 passed (1)
     Tests  11 passed (11)
  Duration  3.10s
```

Grep verification:
- `gemini: 'Google Gemini'` in LlmSection.tsx — FOUND (line 48)
- `llmProvider === 'gemini'` conditional block — FOUND (line 190)
- `llmProvider === 'openai'` conditional block — FOUND (line 163)
- `llmProvider === 'anthropic'` conditional block — FOUND (line 178)
- `placeholder="AIzaSy…"` — FOUND (line 209)
- `geminiApiKey` in SettingsLayout.tsx — FOUND (multiple lines)
- `onReloadLlm` in SettingsLayout.tsx — FOUND (multiple lines)
- `gemini: 1000000` in tokenizer.ts — FOUND (line 24)
- `reloadLlm` in preload/settings.ts — FOUND (line 39, already present from plan 03)

## Known Stubs

None — all data sources are wired. API key values are loaded from `settings:get` and passed to the UI. `onReloadLlm` calls `window.settings.reloadLlm()` which was implemented in plan 03.

## Self-Check: PASSED
