---
phase: 43
slug: ptt-only-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | apps/desktop/vitest.config.ts |
| **Quick run command** | `cd apps/desktop && pnpm vitest run src/main/__tests__/voiceMode --no-coverage` |
| **Full suite command** | `cd apps/desktop && pnpm vitest run --no-coverage` |
| **Estimated runtime** | ~2s quick / ~15s full |

---

## Sampling Rate

- **After every task commit:** Run quick (target tests modified by the task)
- **After every plan wave:** Run quick (`voiceMode` family) — verifies no listener leaks across runs
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds for quick

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 0 | VPTT-01 | — | N/A | unit | `pnpm vitest run src/main/__tests__/pttOnly.test.ts` | ❌ W0 creates | ⬜ pending |
| 43-01-02 | 01 | 0 | VPTT-03 | — | N/A | unit | `pnpm vitest run src/main/__tests__/voiceMode.race.test.ts` | ❌ W0 creates | ⬜ pending |
| 43-02-01 | 02 | 1 | VPTT-01 | T-43-LEAK | Listener removed on dispose | unit | `pnpm vitest run src/main/__tests__/pttOnly.test.ts` | ❌ W0 created | ⬜ pending |
| 43-02-02 | 02 | 1 | VPTT-02 | — | hotkey reuses store value | unit | `pnpm vitest run src/main/__tests__/pttOnly.test.ts` | ❌ W0 created | ⬜ pending |
| 43-03-01 | 03 | 1 | VPTT-03 | — | force-flush in capturing only | unit | `pnpm vitest run src/main/__tests__/voiceMode/alwaysListening.test.ts` | ✅ exists | ⬜ pending |
| 43-04-01 | 04 | 2 | VPTT-* | T-43-ZUMBI | Re-create previous on factory throw | integration | `pnpm vitest run src/main/__tests__/voiceMode.race.test.ts` | ❌ W0 created | ⬜ pending |
| 43-04-02 | 04 | 2 | SC4 | T-43-RACE | listenerCount ≤ 1 across 5 switches | integration | `pnpm vitest run src/main/__tests__/voiceMode.race.test.ts` | ❌ W0 created | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/__tests__/pttOnly.test.ts` — stubs for VPTT-01, VPTT-02 (PttOnlyStrategy lifecycle, hotkey reuse)
- [ ] `apps/desktop/src/main/__tests__/voiceMode.race.test.ts` — stubs for SC4 + D-04 plan B (3 scenarios: sequential, concurrent, recovery)
- [ ] `apps/desktop/src/main/__tests__/helpers/strategyFactoryMocks.ts` — shared test doubles for VoiceCaptureStrategy

*Existing infrastructure (`vitest`, `__tests__/voiceMode.test.ts`, `alwaysListening.ts` mock pattern) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toggle PTT-only mode via real hotkey + speech sent to backend | VPTT-01 | Requires real microphone + globalShortcut + STT pipeline; CI doesn't simulate keypresses on real OS | (1) Open app, switch to PTT-only via tray. (2) Press configured hotkey. (3) Speak "abre o terminal". (4) Press hotkey again. (5) Verify utterance reached backend (chat history shows the command). |
| Hotkey from v1.7 reused without reconfig after upgrade | VPTT-02 | Requires actual electron-store with v1.7 data | Backup electron-store from v1.8/v1.7. Boot v1.9. Switch to PTT-only. Verify hotkey configured in v1.7 fires PTT (no Settings reconfig needed). |
| AL → PTT hotkey override force-flushes utterance | VPTT-03 | Real VAD timing + microphone audio needed to validate "envio imediato em <100ms" perception | Switch to Always-Listening. Speak short phrase. Before VAD silence threshold (~600ms), press PTT hotkey. Verify utterance sent before threshold expires (timestamp comparison via logs). |
| Rapid 5-mode-switch stress test on real OS | SC4 | Real Electron globalShortcut behavior under rapid succession | Open tray, click 5 different mode items in <500ms total. Verify: no error toast, app responsive, final mode matches last click, `console.log` shows transitioning guard rejected concurrents. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (pttOnly.test.ts, voiceMode.race.test.ts, strategyFactoryMocks.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s for quick / < 15s for full
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
