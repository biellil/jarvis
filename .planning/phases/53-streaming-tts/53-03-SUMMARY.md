---
phase: 53-streaming-tts
plan: 03
subsystem: settings
tags: [streaming-tts, settings, ipc, electron-store, ui-primitive, radix]
requires:
  - "Phase 52 SEXT-03 wakeWordThreshold pattern (store + IPC + multi-window broadcast)"
  - "Phase 49 SettingsLayout sectionProps Pick narrowing pattern"
  - "Phase 48 design tokens (bg-accent, bg-surface, ring-accent-ring, focus-visible)"
provides:
  - "getStreamingTtsEnabled() / setStreamingTtsEnabled() — main process store accessors"
  - "ipcMain.handle('streamingTts:set') — persist + broadcast to all BrowserWindows"
  - "window.settings.setStreamingTts(boolean) preload bridge"
  - "window.settings.onStreamingTtsChanged(cb) subscription"
  - "Switch primitive (Radix-based) — components/ui/switch.tsx"
  - "Streaming TTS toggle row in TtsSection (apply-without-restart)"
affects:
  - "SettingsData shape gains streamingTtsEnabled boolean"
  - "SettingsSectionProps gains streamingTtsEnabled / onStreamingTtsChange"
tech-stack:
  added:
    - "@radix-ui/react-switch ^1.2.6 (peer dep aligned with existing Radix primitives)"
  patterns:
    - "SEXT-03 store accessor pattern adapted to boolean (typeof guard, default false)"
    - "Multi-window IPC broadcast with isDestroyed() guard"
    - "Apply-without-restart: optimistic UI + IPC fire-and-forget; no Save button cycle"
key-files:
  created:
    - "apps/desktop/src/renderer/src/components/ui/switch.tsx"
    - "apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx"
  modified:
    - "apps/desktop/src/main/store.ts"
    - "apps/desktop/src/main/ipc/settings.ts"
    - "apps/desktop/src/shared/ipc-types.ts"
    - "apps/desktop/src/preload/settings.ts"
    - "apps/desktop/src/renderer/src/components/ui/index.ts"
    - "apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx"
    - "apps/desktop/src/renderer/src/settings/SettingsLayout.tsx"
    - "apps/desktop/src/main/__tests__/store.test.ts"
    - "apps/desktop/src/main/ipc/__tests__/settings.test.ts"
    - "apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx"
    - "apps/desktop/package.json"
    - "pnpm-lock.yaml"
decisions:
  - "Apply-without-restart over Save bar: matches Phase 52 SEXT-03 (D-11 — Plan 04 reads flag at start of each turn)"
  - "Switch primitive uses bg-accent/bg-surface tokens (not bg-primary/bg-input shadcn defaults) to match existing JARVIS design system"
  - "Mock BrowserWindow in settings.test.ts gained isDestroyed: () => false — required by Phase 52+ broadcast handlers"
metrics:
  duration: "~25 min"
  completed: 2026-05-05
---

# Phase 53 Plan 03: Streaming TTS Settings Toggle Summary

JWT-style feature flag plumbing for `streamingTtsEnabled`: electron-store accessors, multi-window IPC broadcast, settings preload bridge, new shadcn-style Radix Switch primitive, and a "Streaming TTS (beta)" toggle in TtsSection — all live-applied without restart.

## Objective Recap

Satisfy STTS-02 (`STREAMING_TTS=true/false` ativa/desativa streaming sem restart) by mirroring the Phase 52 SEXT-03 wakeWordThreshold pattern verbatim with boolean instead of number. Default `false` (D-10). Plan 04 reads the flag at the start of each voice turn (D-11).

## What Was Built

### Task 1 — Store + IPC + Preload (commits a2d2803, 924a8d3, f9f7257)

- **`apps/desktop/src/main/store.ts`** — added `getStreamingTtsEnabled() / setStreamingTtsEnabled(enabled)` plus `streamingTtsEnabled?: boolean` in `StoreSchema`. Default `false` (D-10). Strict `typeof v === 'boolean'` guard on read; `typeof enabled !== 'boolean'` early-return on write.
- **`apps/desktop/src/shared/ipc-types.ts`** — added `STREAMING_TTS_SET / STREAMING_TTS_CHANGED` channels, `streamingTtsEnabled: boolean` in `SettingsData`, and `setStreamingTts / onStreamingTtsChanged` on `SettingsApi`.
- **`apps/desktop/src/main/ipc/settings.ts`** — added `ipcMain.handle(IPC_CHANNELS.STREAMING_TTS_SET)`: coerces payload via `!!enabled`, persists, then broadcasts `STREAMING_TTS_CHANGED` to every non-destroyed BrowserWindow. SETTINGS_GET handler now returns `streamingTtsEnabled`.
- **`apps/desktop/src/preload/settings.ts`** — exposes `setStreamingTts(enabled)` invoke + `onStreamingTtsChanged(cb)` subscription with proper unsubscribe. Channel strings inlined (matches existing pattern to avoid Rollup chunk extraction in preload).

### Task 2 — Switch primitive + UI toggle (commits fe91f2a, 6b902f0)

- **`apps/desktop/src/renderer/src/components/ui/switch.tsx`** — new Radix-based `Switch` primitive (forwardRef, displayName, `cn()` merge). Uses JARVIS design tokens: `bg-accent` checked / `bg-surface` unchecked, `ring-accent-ring` focus, `disabled:opacity-50`. Thumb translates `5` units on checked.
- **`apps/desktop/src/renderer/src/components/ui/index.ts`** — exports `Switch`.
- **`apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx`** — added "Streaming TTS (beta)" Field below Voice ID with helper text "Begins playback at the first complete sentence". `Pick<SettingsSectionProps>` extended with `streamingTtsEnabled / onStreamingTtsChange`.
- **`apps/desktop/src/renderer/src/settings/SettingsLayout.tsx`** — added local `streamingTtsEnabled` state, hydrated from `settings.get()`, kept in sync via `onStreamingTtsChanged` subscription, dispatched on click via fire-and-forget IPC. Excluded from `dirty` tracking (apply-without-restart, mirrors Phase 52 wakeWordThreshold).
- **`@radix-ui/react-switch ^1.2.6`** added as a dependency.

## Test Coverage Added

- `store.test.ts` — 6 cases: default false, get/set roundtrip, store key, non-boolean rejection (set + read corruption guard).
- `settings.test.ts` — 5 cases: handler registration, payload `true`/`false` persists, multi-window broadcast verified, `!!`-coercion of non-boolean payloads. Plus `streamingTtsEnabled: false` added to existing SETTINGS_GET shape assertions.
- `TtsSection.test.tsx` (new file) — 5 cases: unchecked render, checked render, click → `onStreamingTtsChange(true)`, helper text present, label present. Uses `getByRole('switch')` WITHOUT name filter (Phase 52-03 happy-dom note) and `fireEvent.click` (never `fireEvent.change` on Radix).
- `SettingsForm.test.tsx` — mock extended with `setStreamingTts`/`onStreamingTtsChanged` and `streamingTtsEnabled` in mocked SETTINGS_GET response.

All 107 plan-relevant tests green.

## Confirmation for Plan 04

`getStreamingTtsEnabled()` is exported from `apps/desktop/src/main/store.ts` and ready to be imported by Plan 04's TTS pipeline at the start of each voice turn (per D-11 — live flip without restart).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock BrowserWindow in settings.test.ts lacked `isDestroyed`**
- **Found during:** Task 1 GREEN run.
- **Issue:** Phase 52 broadcast pattern uses `if (!win.isDestroyed())`; the existing mock returned plain objects without that method, causing `TypeError: win.isDestroyed is not a function` in 4 new tests (and would have hidden a real production crash if tests ever exercised the new handler).
- **Fix:** Added `isDestroyed: () => false` to both mocked windows in `getAllWindowsMock`.
- **Commit:** 924a8d3.

**2. [Rule 1 - Bug] SettingsForm.test.tsx mock missing `onStreamingTtsChanged`**
- **Found during:** Task 2 GREEN full-suite run.
- **Issue:** New `useEffect` in SettingsLayout subscribes to `window.settings.onStreamingTtsChanged`, which broke 23 existing SettingsForm tests with `TypeError: window.settings.onStreamingTtsChanged is not a function`.
- **Fix:** Added `setStreamingTts`/`onStreamingTtsChanged` mocks and `streamingTtsEnabled: false` in mocked `settings.get()` response.
- **Commit:** 6b902f0.

### Out-of-scope discoveries (logged, NOT fixed)

- 8 pre-existing test failures in `voiceHandler.test.ts`, `vramDetection.test.ts`, `whisper-gpu-detection.test.ts`, `tts-providers.test.ts`, `modelLoader.test.ts`, `tray.platform.test.ts`, `security.test.ts`, `integration-chat.test.ts`, `chat-send-audio.test.ts`, `ipc-chat.test.ts` — verified pre-existing via `git stash` rerun. Out of scope for this plan.
- Tailwind canonical-class lint warnings on SettingsLayout.tsx (pre-existing, lines 349/351/380).

## Self-Check: PASSED

- `apps/desktop/src/main/store.ts` contains `getStreamingTtsEnabled` + `setStreamingTtsEnabled` + `'streamingTtsEnabled'` ✓
- `apps/desktop/src/shared/ipc-types.ts` contains `STREAMING_TTS_SET` + `STREAMING_TTS_CHANGED` ✓
- `apps/desktop/src/main/ipc/settings.ts` contains `IPC_CHANNELS.STREAMING_TTS_SET` + `BrowserWindow.getAllWindows()` near new handler ✓
- `apps/desktop/src/preload/settings.ts` exposes `setStreamingTts` ✓
- `apps/desktop/src/renderer/src/components/ui/switch.tsx` exists, imports `@radix-ui/react-switch` ✓
- `apps/desktop/src/renderer/src/components/ui/index.ts` contains `export { Switch }` ✓
- `apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx` contains `Streaming TTS` and imports `Switch` from `../../components/ui` ✓
- `apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx` contains `getByRole('switch')` ✓
- `apps/desktop/package.json` lists `@radix-ui/react-switch` ✓
- All commits exist: a2d2803, 924a8d3, f9f7257, fe91f2a, 6b902f0 ✓
- `npm --workspace @jarvis/desktop run test -- store.test.ts settings.test.ts TtsSection.test.tsx SettingsForm.test.tsx` exits 0 ✓
