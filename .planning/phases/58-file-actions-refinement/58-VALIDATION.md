---
phase: 58
slug: file-actions-refinement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x / vitest |
| **Config file** | desktop/jest.config.ts or vitest.config.ts |
| **Quick run command** | `npm test -- --testPathPattern=file-actions` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=file-actions`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 0 | FACT-11 | unit | `npm test -- --testPathPattern=file-actions` | ❌ W0 | ⬜ pending |
| 58-01-02 | 01 | 1 | FACT-10 | unit | `npm test -- --testPathPattern=confirmation-toast` | ✅ | ⬜ pending |
| 58-01-03 | 01 | 1 | FACT-12 | unit | `npm test -- --testPathPattern=file-actions` | ✅ | ⬜ pending |
| 58-01-04 | 01 | 2 | FACT-11 | unit | `npm test -- --testPathPattern=file-actions` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `desktop/src/__tests__/file-actions.test.ts` — stubs for FACT-11 destructive actions (deleteFile, moveFile, renameFile)
- [ ] Verify `open` package is in desktop/package.json — `npm ls open`

*Existing infrastructure (confirmation-toast.test.tsx, file-actions.test.ts) covers FACT-10 and FACT-12 patterns.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Read-only action executes without toast | FACT-10 | Requires running Electron app + UI interaction | Launch app, ask "abrir pasta Downloads", verify no confirmation toast appears |
| Destructive action shows confirmation toast | FACT-11 | Requires running Electron app + UI interaction | Launch app, ask "deletar arquivo X", verify confirmation toast appears before action |
| .zip file fallback to OS default app | FACT-12 | OS-level behavior, cross-platform | Ask JARVIS to open a .zip, verify OS opens it without error message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
