---
phase: 56
slug: always-listening-soak-test
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual soak test (node --expose-gc) |
| **Config file** | `apps/desktop/scripts/soak-test.ts` — constants SOAK_DURATION_MS, SAMPLE_INTERVAL_MS, thresholds |
| **Quick run command** | `node --expose-gc apps/desktop/scripts/soak-test.ts --duration 60000` |
| **Full suite command** | `node --expose-gc apps/desktop/scripts/soak-test.ts` (8h) |
| **Estimated runtime** | ~28800 seconds (8 hours) |

---

## Sampling Rate

- **After every task commit:** Verify TypeScript compiles + existing tests pass (`pnpm -F desktop typecheck`)
- **After every plan wave:** Smoke test with `--duration 60000` (1 minute quick soak)
- **Before `/gsd:verify-work`:** Full 8h run must produce PASS report
- **Max feedback latency:** 60 seconds (quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | QA-01 | unit | `pnpm -F desktop typecheck` | ❌ W0 | ⬜ pending |
| 56-01-02 | 01 | 1 | QA-01 | smoke | `node --expose-gc apps/desktop/scripts/soak-test.ts --duration 60000` | ❌ W0 | ⬜ pending |
| 56-02-01 | 02 | 1 | QA-01 | manual | Run full 8h soak test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/diagnostics/collector.ts` — NEW: perf_hooks init + AudioContext IPC handler
- [ ] `apps/desktop/src/shared/ipc-types.ts` — NEW channel `DIAGNOSTICS_GET_AUDIO_CONTEXT_COUNT`
- [ ] `apps/backend-ts/src/routes/diagnostics.ts` — NEW: GET /internal/diagnostics endpoint
- [ ] `apps/backend-ts/src/app.ts` — register diagnosticsRouter at /internal prefix
- [ ] `apps/desktop/src/main/ipc/index.ts` — register AudioContext count IPC handler
- [ ] `apps/desktop/scripts/soak-test.ts` — refactor to HTTP polling + HTML report generation

*All Wave 0 items are new files/edits — no existing test infrastructure to extend.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Heap delta <100MB after 8h | QA-01 | Requires 8h real execution; cannot be automated in CI | Run full soak test; check final PASS/FAIL in HTML report |
| RSS delta <200MB after 8h | QA-01 | Same — requires sustained 8h run | Same HTML report; RSS line stays below threshold marker |
| Event loop p99 <50ms | QA-01 | Requires real Electron process under load | Same report; event loop p99 chart line |
| AudioContext count = 1 | QA-01 | Requires real renderer process | Same report; audioContextCount column in sample table |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
