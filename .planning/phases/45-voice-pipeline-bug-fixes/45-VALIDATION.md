---
phase: 45
slug: voice-pipeline-bug-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `npm run test:unit -- --run` (in apps/desktop/) |
| **Full suite command** | `npm run test` (in apps/desktop/) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --run`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | PATCH-01 | unit | `npm run test:unit -- ptt-hotkey.test.ts --run` | ✅ Needs update | ⬜ pending |
| 45-01-02 | 01 | 1 | PATCH-01 | unit | `npm run test:unit -- ptt-hotkey.test.ts --run` | ✅ Needs update | ⬜ pending |
| 45-02-01 | 02 | 1 | PATCH-02 | unit | `npm run test:unit -- --run` | ❌ Wave 0 | ⬜ pending |
| 45-02-02 | 02 | 1 | PATCH-02 | unit | `npm run test:unit -- --run` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/__tests__/index.main.test.ts` — startup model selection (VRAM + override branches for PATCH-02)
- [ ] Mock `VoiceModeManager` in `ptt-hotkey.test.ts` — fixture returning each of 'ptt-only', 'wake-word', 'always-listening'

*Existing `ptt-hotkey.test.ts` and `store.test.ts` cover registration and persistence respectively — they need extension, not replacement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PTT hotkey silent in wake-word mode | PATCH-01 | Electron globalShortcut integration requires running Electron | Switch to wake-word mode via tray; press PTT hotkey; confirm no recording starts and log shows `[PTT] Hotkey ignored` |
| PTT hotkey silent in always-listening mode | PATCH-01 | Same as above | Switch to always-listening mode via tray; press PTT hotkey; confirm no recording |
| Whisper override applied at startup | PATCH-02 | Requires app restart with STT backend running | Set Whisper model to "medium" in Settings; restart app; check logs for `[voice] Applying user override: medium` |
| VRAM auto-detection unaffected when override = auto | PATCH-02 | Requires running STT backend | Set Whisper model to "auto" in Settings; restart; confirm `[voice] Model selected by VRAM` appears and no override log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
