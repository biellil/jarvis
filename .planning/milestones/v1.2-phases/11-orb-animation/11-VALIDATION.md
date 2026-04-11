---
phase: 11
slug: orb-animation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 + @testing-library/react 16.3.2 + happy-dom 20.8.9 |
| **Config file** | `apps/desktop/vitest.config.ts` (requires update for happy-dom environment) |
| **Quick run command** | `pnpm test Orb.test.tsx` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~8 seconds (full suite including main + renderer tests) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test Orb.test.tsx`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual DevTools Performance validation
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | ORB-01 | — | N/A (visual animation) | unit | `pnpm test Orb.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | ORB-02 | — | N/A (visual animation) | unit | `pnpm test Orb.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | ORB-03 | — | N/A (visual animation) | unit | `pnpm test Orb.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | ORB-04 | — | N/A (visual animation) | unit | `pnpm test Orb.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/renderer/components/Orb/__tests__/Orb.test.tsx` — unit tests for ORB-01 through ORB-04 (state transitions, className assertions)
- [ ] `src/renderer/components/Orb/__tests__/OrbContext.test.tsx` — context provider initialization and state updates
- [ ] `vitest.config.ts` update — add `happy-dom` environment for renderer tests (currently Node-only for main process tests)
- [ ] Framework install: `pnpm add -D @testing-library/react@16.3.2 happy-dom@20.8.9`

*Rationale:* Phase 10 implemented main process window logic with vitest Node tests. Phase 11 adds first renderer React component — requires DOM environment. Testing orb state transitions is straightforward: render with different context values, assert className and style attributes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Idle pulse animation continuous | ORB-01 | Visual timing observation | 1. Launch app; 2. Watch orb for 5+ minutes; 3. PASS if animation never stops pulsing |
| Listening state transition <300ms | ORB-02 | Timing-dependent visual observation | 1. Open DevTools; 2. Run `window.jarvis.setOrbState('listening')` in console; 3. PASS if orb changes to amber within 300ms (use stopwatch or screen recording at 60fps) |
| Processing spin distinct from idle | ORB-03 | Visual distinction assessment | 1. Set state to 'processing' via DevTools; 2. Compare to idle animation; 3. PASS if spin is clearly visible and different |
| Responding ripple rings visible | ORB-04 | Visual effect observation | 1. Set state to 'responding' via DevTools; 2. PASS if 3 ripple rings expand outward in staggered sequence |
| Compositor thread rendering | Success Criteria #5 | DevTools Performance API required | 1. Open DevTools Performance tab; 2. Enable "Advanced Paint Instrumentation"; 3. Record 5s of idle animation; 4. PASS if no green "Paint" bars during steady-state animation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 test files/updates identified)
- [ ] No watch-mode flags (pnpm test runs once and exits)
- [ ] Feedback latency < 8s (pnpm test completes in ~8 seconds)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
