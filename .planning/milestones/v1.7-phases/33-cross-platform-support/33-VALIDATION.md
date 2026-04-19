---
phase: 33
slug: cross-platform-support
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 + happy-dom (renderer tests), Node environment (main process tests) |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @jarvis/desktop test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds (unit tests) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @jarvis/desktop test`
- **After every plan wave:** Run `pnpm test` (full monorepo)
- **Before `/gsd:verify-work`:** Full suite must be green + manual E2E on macOS and Linux
- **Max feedback latency:** 5 seconds (unit), manual E2E per wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01 | 01 | 0 | PLAT-01, PLAT-04 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/index.platform.test.ts` | ❌ W0 | ⬜ pending |
| 33-02 | 01 | 0 | PLAT-03, PLAT-06 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/tray.platform.test.ts` | ❌ W0 | ⬜ pending |
| 33-03 | 01 | 1 | PLAT-01 | unit | `pnpm --filter @jarvis/desktop test src/main/__tests__/position.test.ts` | ✅ | ⬜ pending |
| 33-04 | 01 | 1 | PLAT-02, PLAT-05 | manual | Launch on target OS, say "Hey JARVIS", verify pipeline runs | — | ⬜ pending |
| 33-05 | 01 | 1 | PLAT-03, PLAT-06 | manual | Launch on target OS, verify tray icon + Settings/Quit menu | — | ⬜ pending |
| 33-06 | 02 | 2 | PLAT-01–06 | manual | `pnpm build:dist:mac` + `pnpm build:dist:linux`, verify artifacts | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/__tests__/index.platform.test.ts` — Test `app.dock.hide()` on macOS, `app.on('window-all-closed')` cross-platform behavior (PLAT-01, PLAT-04)
- [ ] `src/main/__tests__/tray.platform.test.ts` — Verify Tray initialization with mocked Tray API; doesn't crash on non-existent icon path (PLAT-03, PLAT-06)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| macOS: wake word triggers mic capture without permission errors | PLAT-02 | GUI + microphone — no automation possible | Launch JARVIS on macOS, say "Hey JARVIS", observe orb wake burst → listening → STT → LLM → TTS → idle without permission dialog errors |
| macOS: tray icon visible in menu bar with Settings/Quit | PLAT-03 | Visual + OS system tray — GUI-only | Launch JARVIS on macOS, verify icon appears in menu bar, right-click shows Settings and Quit, Quit exits app |
| Linux X11: orb renders frameless with transparency | PLAT-04 | Requires compositor — cannot mock | Launch JARVIS on Linux X11 with compositor, verify orb visible in bottom-right, no frame or title bar, transparency working |
| Linux: wake word triggers speech pipeline | PLAT-05 | GUI + microphone — no automation possible | Launch JARVIS on Linux X11, say "Hey JARVIS", observe full voice pipeline executes |
| Linux: tray icon in system tray with Settings/Quit | PLAT-06 | Visual + OS system tray — GUI-only | Launch JARVIS on Linux, verify tray icon in system tray area, right-click shows Settings and Quit |
| macOS: dist build bundles correct whisper prebuilds | PLAT-01, PLAT-02 | Packaging verification | Run `pnpm build:dist:mac`, inspect artifact for `@fugood/node-whisper-darwin-arm64` or `darwin-x64` prebuild |
| Linux: dist build bundles correct whisper prebuilds | PLAT-04, PLAT-05 | Packaging verification | Run `pnpm build:dist:linux`, inspect artifact for `@fugood/node-whisper-linux-x64` prebuild |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (unit tests)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
