---
phase: 47
slug: settings-ui-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + React Testing Library |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `cd apps/desktop && npx vitest run src/renderer/src/settings/` |
| **Full suite command** | `pnpm --filter @jarvis/desktop test -- run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop && npx vitest run src/renderer/src/settings/`
- **After every plan wave:** Run `pnpm --filter @jarvis/desktop test -- run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | POLISH-01 | visual + unit | `cd apps/desktop && npx vitest run src/renderer/src/settings/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — SettingsForm.test.tsx already in place.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Window is visually wider and not cramped | POLISH-01 | Visual appearance cannot be asserted in unit tests | Launch `pnpm --filter @jarvis/desktop dev`, open Settings via tray, verify window width and section spacing |
| Sections have clear visual separation | POLISH-01 | Layout/spacing requires human eye | Check PTT, Always-Listening, TTS, Whisper sections for distinct spacing and readable layout |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
