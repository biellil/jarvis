---
phase: 52
slug: settings-extras
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) + jest (electron) |
| **Config file** | vitest.config.ts / jest.config.ts |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test:all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | SEXT-01 | unit | `npm run test -- --run src/tests/lm-studio-url.test.ts` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 1 | SEXT-02 | unit | `npm run test -- --run src/tests/llm-provider-switch.test.ts` | ❌ W0 | ⬜ pending |
| 52-01-03 | 01 | 1 | SEXT-03 | unit | `npm run test -- --run src/tests/wake-word-sensitivity.test.ts` | ❌ W0 | ⬜ pending |
| 52-02-01 | 02 | 2 | SEXT-01 | e2e | `npm run test:e2e -- lm-studio-url` | ❌ W0 | ⬜ pending |
| 52-02-02 | 02 | 2 | SEXT-02 | e2e | `npm run test:e2e -- llm-provider` | ❌ W0 | ⬜ pending |
| 52-02-03 | 02 | 2 | SEXT-03 | e2e | `npm run test:e2e -- wake-word-slider` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/lm-studio-url.test.ts` — stubs for SEXT-01 (URL validation, IPC, persistence)
- [ ] `src/tests/llm-provider-switch.test.ts` — stubs for SEXT-02 (provider switch, context overflow warning)
- [ ] `src/tests/wake-word-sensitivity.test.ts` — stubs for SEXT-03 (slider IPC, real-time apply, persistence)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LM Studio URL applied immediately without restart | SEXT-01 | Requires live LM Studio instance | Enter custom URL in Settings, send message, verify request hits new URL |
| Context overflow warning before provider switch | SEXT-02 | UI modal interaction | Switch provider with long context, verify warning appears before confirmation |
| Wake word sensitivity change in real-time | SEXT-03 | Requires live audio input | Move slider, speak wake word, verify detection behavior changes |
| All settings persist after app restart | All | Requires full app restart cycle | Set all 3 values, close JARVIS, reopen, verify values retained |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
