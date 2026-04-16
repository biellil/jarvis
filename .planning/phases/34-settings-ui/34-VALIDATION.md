---
phase: 34
slug: settings-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 + happy-dom |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @jarvis/desktop test src/main/ipc/__tests__/settings.test.ts` |
| **Full suite command** | `pnpm --filter @jarvis/desktop test` |
| **Estimated runtime** | ~5 seconds (unit), ~15 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @jarvis/desktop test src/main/ipc/__tests__/settings.test.ts`
- **After every plan wave:** Run `pnpm --filter @jarvis/desktop test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-W0-01 | 01 | 0 | SET-02, SET-03, SET-05 | unit | `pnpm --filter @jarvis/desktop test src/main/ipc/__tests__/settings.test.ts` | ❌ W0 | ⬜ pending |
| 34-W0-02 | 01 | 0 | SET-04, SET-05 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/store.test.ts` | ❌ W0 | ⬜ pending |
| 34-W0-03 | 01 | 0 | SET-01 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/tray.test.ts` | ❌ W0 | ⬜ pending |
| 34-W0-04 | 01 | 0 | SET-02 | unit | `pnpm --filter @jarvis/desktop test src/renderer/src/settings/__tests__/HotkeyRecorder.test.tsx` | ❌ W0 | ⬜ pending |
| 34-W0-05 | 01 | 0 | SET-01–05 | unit | `pnpm --filter @jarvis/desktop test src/renderer/src/settings/__tests__/SettingsForm.test.tsx` | ❌ W0 | ⬜ pending |
| 34-01 | 02 | 1 | SET-05 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/store.test.ts` | ❌ W0 | ⬜ pending |
| 34-02 | 02 | 1 | SET-02, SET-03, SET-04 | unit | `pnpm --filter @jarvis/desktop test src/main/ipc/__tests__/settings.test.ts` | ❌ W0 | ⬜ pending |
| 34-03 | 03 | 2 | SET-01 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/tray.test.ts` | ❌ W0 | ⬜ pending |
| 34-04 | 03 | 2 | SET-02–04 | unit | `pnpm --filter @jarvis/desktop test src/renderer/src/settings/__tests__/SettingsForm.test.tsx` | ❌ W0 | ⬜ pending |
| 34-05 | 04 | 3 | SET-01–05 | manual | Launch app, open Settings via tray, verify all fields load and save correctly | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/ipc/__tests__/settings.test.ts` — IPC SETTINGS_GET + SETTINGS_SAVE handlers (SET-02, SET-03, SET-05)
- [ ] `src/main/__tests__/store.test.ts` — new store fields: ttsProvider, ttsApiKey, whisperModelOverride (SET-04, SET-05)
- [ ] `src/main/__tests__/tray.test.ts` — Settings menu item opens window (SET-01)
- [ ] `src/renderer/src/settings/__tests__/HotkeyRecorder.test.tsx` — keydown capture → Electron accelerator format (SET-02)
- [ ] `src/renderer/src/settings/__tests__/SettingsForm.test.tsx` — form rendering, field population from IPC.get(), Save handler (SET-01–05)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings window opens via tray click | SET-01 | GUI interaction requires real Electron process | Launch `pnpm --filter @jarvis/desktop dev`, right-click tray icon, click Settings, verify window opens with current config loaded |
| PTT hotkey change persists after restart | SET-02 | Requires app restart to verify persistence | Change hotkey in Settings, click Save, quit app, relaunch, verify new hotkey works and old one does not |
| TTS provider live-reload | SET-03 | Requires live TTS audio playback verification | Select provider, enter API key, save, trigger TTS immediately — verify audio plays via new provider without restart |
| Whisper model override | SET-04 | Requires actual STT transcription | Select "tiny" model, save, speak to JARVIS, verify STT uses tiny model (check logs or latency) |
| All settings persist across sessions | SET-05 | Requires app restart | Set all fields, save, quit app, relaunch, open Settings — verify all values are preserved |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
