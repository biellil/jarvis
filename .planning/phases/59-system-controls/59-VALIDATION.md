---
phase: 59
slug: system-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `cd apps/desktop && npx vitest run src/main/actions/__tests__/` |
| **Full suite command** | `cd apps/desktop && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop && npx vitest run src/main/actions/__tests__/`
- **After every plan wave:** Run `cd apps/desktop && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | SYSCTRL-01 | unit | `cd apps/desktop && npx vitest run src/main/actions/__tests__/system-controls.test.ts` | ❌ W0 | ⬜ pending |
| 59-01-02 | 01 | 1 | SYSCTRL-02 | unit | `cd apps/desktop && npx vitest run src/main/actions/__tests__/system-controls.test.ts` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 2 | SYSCTRL-01 | unit | `cd apps/backend-ts && npx vitest run src/session/__tests__/pc-tools.test.ts` | ✅ | ⬜ pending |
| 59-02-02 | 02 | 2 | SYSCTRL-02 | unit | `cd apps/backend-ts && npx vitest run src/session/__tests__/pc-tools.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/actions/__tests__/system-controls.test.ts` — stubs para handlers adjust_volume, toggle_mute, media_control (mocked subprocess)

*Existing infrastructure (vitest, runExecFile mocks) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Volume changes detectável no OS | SYSCTRL-01 | Requer SO real com placa de som | Dizer "aumenta o volume" e verificar barra de volume do sistema |
| Media player responde ao comando | SYSCTRL-02 | Requer player de mídia ativo | Tocar música, dizer "pause a música", verificar pausa |
| macOS Accessibility toast aparece | SYSCTRL-02 | Requer macOS sem permissão concedida | Revogar permissão de Accessibility e tentar comando de mídia |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
