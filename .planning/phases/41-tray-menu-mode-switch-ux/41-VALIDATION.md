---
phase: 41
slug: tray-menu-mode-switch-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `cd apps/desktop && pnpm test -- --testPathPattern="tray" --no-coverage` |
| **Full suite command** | `cd apps/desktop && pnpm test -- --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop && pnpm test -- --testPathPattern="tray" --no-coverage`
- **After every plan wave:** Run `cd apps/desktop && pnpm test -- --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 0 | VUI-01 | — | N/A | unit stub | `pnpm test -- --testPathPattern="tray" --no-coverage` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 1 | VUI-01 | T-41-MODE | setMode called with correct VoiceMode | unit | `pnpm test -- --testPathPattern="tray" --no-coverage` | ❌ W0 | ⬜ pending |
| 41-02-02 | 02 | 1 | VUI-01 | T-41-MODE | IPC broadcast sent on success + failure | unit | `pnpm test -- --testPathPattern="tray" --no-coverage` | ❌ W0 | ⬜ pending |
| 41-02-03 | 02 | 1 | VUI-01 | — | radio checked state reflects current mode | unit | `pnpm test -- --testPathPattern="tray" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/__tests__/tray.test.ts` — extend existing file with Voice Mode submenu stubs (VUI-01)

*Existing tray.test.ts and tray.platform.test.ts infrastructure present — Wave 0 extends, doesn't create from scratch.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Radio state survives app restart | VUI-01 SC-3 | Electron app restart can't be automated in vitest | Restart app, open tray, verify correct radio still checked |
| <1s mode switch on real hardware | VUI-01 SC-2 | Timing test in vitest doesn't reflect real OS tray performance | Open tray, click different mode, stopwatch |
| Cross-platform tray rendering | VUI-01 | Requires actual Linux/macOS/Windows OS | Test on each supported platform |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
