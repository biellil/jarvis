---
phase: 9
slug: electron-scaffold
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (monorepo precedent from gateway) |
| **Config file** | `apps/desktop/vitest.config.ts` — Wave 0 creates |
| **Quick run command** | `pnpm --filter desktop test` |
| **Full suite command** | `pnpm --filter desktop test` |
| **Estimated runtime** | ~5 seconds (scaffold phase — minimal tests) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter desktop test`
- **After every plan wave:** Run `pnpm --filter desktop test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DESK-01 | — | contextIsolation: true enforced | unit | `pnpm --filter desktop test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/__tests__/security.test.ts` — stubs for DESK-01 (contextIsolation + nodeIntegration verification)
- [ ] `apps/desktop/vitest.config.ts` — Vitest configuration for Electron environment
- [ ] `vitest` — install if not in monorepo root (likely already there from gateway)

*Planner will determine exact Wave 0 tasks based on current monorepo state.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Electron window opens without errors | DESK-01 success criteria #1 | Visual confirmation + DevTools console check | Run `pnpm --filter desktop dev`, confirm window opens, check DevTools console for errors |
| `window.jarvis.sendText('teste')` works | DESK-01 success criteria #2 | IPC integration test requires running Electron process | In DevTools console, run `window.jarvis.sendText('teste')`, check terminal logs for received message |

*Phase 9 is infrastructure — most verification is manual (dev server starts, window opens, IPC works). Unit tests cover security architecture enforcement.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
