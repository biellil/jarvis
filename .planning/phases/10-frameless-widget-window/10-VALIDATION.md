---
phase: 10
slug: frameless-widget-window
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-06
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 (Node environment for main process) |
| **Config file** | `apps/desktop/vitest.config.ts` (already configured in Phase 9) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` (same — desktop app test suite is small) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | DESK-03, DESK-05 | T-10-01 | Bounds validation rejects off-screen coordinates | unit | `pnpm test src/main/__tests__/position.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | DESK-02, DESK-03, DESK-05 | — | Phase 9 security settings preserved (contextIsolation) | unit | `pnpm test src/main/__tests__/window-config.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | — | — | N/A (CSS draggable region, no security implications) | unit | `pnpm test` (no specific test for CSS) | ✅ | ⬜ pending |
| 10-02-01 | 02 | 1 | DESK-04 | — | N/A (static PNG assets) | manual | Visual inspection of icon files | ✅ | ⬜ pending |
| 10-02-02 | 02 | 1 | DESK-04 | T-10-03 | Hardcoded menu items (no dynamic generation) | unit | `pnpm test src/main/__tests__/tray.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/__tests__/window-config.test.ts` — verifies DESK-02 window options present in source code (pattern: extend Phase 9's `security.test.ts`)
- [ ] `src/main/__tests__/position.test.ts` — verifies position calculation logic (offset math, bounds validation)
- [ ] `src/main/__tests__/tray.test.ts` — verifies tray menu structure (3 items, correct labels)
- [ ] `src/main/__tests__/persistence.test.ts` — verifies electron-store integration (mock store, test save/restore)

*Framework install: Already complete (Vitest configured in Phase 9)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No white flash on window open | DESK-02 | Visual observation required (timing-dependent) | 1. Quit app; 2. Launch app; 3. Watch for flash between launch and widget appearing; 4. PASS if no white flash visible |
| Window appears at correct position | DESK-03 | DPI-aware visual positioning | 1. Launch app; 2. Measure distance from screen bottom-right corner; 3. PASS if ~16px offset visible |
| Tray icon visible in system tray | DESK-04 | OS-level integration | 1. Launch app; 2. Check system tray area; 3. PASS if cyan circle icon visible |
| Position persistence across restarts | DESK-05 | End-to-end behavior | 1. Launch app; 2. Drag window to new position; 3. Quit app; 4. Relaunch app; 5. PASS if window appears at dragged position |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (4 test files identified)
- [x] No watch-mode flags (pnpm test runs once and exits)
- [x] Feedback latency < 5s (pnpm test completes in ~5 seconds)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-06
