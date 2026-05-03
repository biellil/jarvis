---
phase: 46
slug: wake-word-reliability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `apps/desktop/vite.config.ts` |
| **Quick run command** | `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` |
| **Full suite command** | `pnpm --filter @jarvis/desktop test -- run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts`
- **After every plan wave:** Run `pnpm --filter @jarvis/desktop test -- run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | WW-01 | unit | `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` | ✅ | ⬜ pending |
| 46-01-02 | 01 | 1 | WW-02 | unit | `pnpm --filter @jarvis/desktop test -- run src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `WakeWordEngine.test.ts` already exists — only needs `// @vitest-environment happy-dom` annotation and mock fixes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Hey JARVIS" activates on 1st or 2nd attempt | WW-01 | Requires real microphone + openwakeword inference | Launch app in wake-word mode, say "Hey JARVIS" twice, confirm orb activates |
| False positive rate unchanged | WW-02 | Requires real audio environment | Run app for 5 min with background noise, count accidental triggers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
