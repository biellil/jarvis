---
phase: 22
slug: voiceinputmanager-refactor-wake-word-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 + happy-dom 20.8.9 |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/` |
| **Full suite command** | `pnpm --filter @jarvis/desktop test --run` |
| **Estimated runtime** | ~30 seconds (quick) / ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/`
- **After every plan wave:** Run `pnpm --filter @jarvis/desktop test --run`
- **Before `/gsd-verify-work`:** Full suite + CPU benchmark script + packaged `.exe` smoke test must all be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | WAKE-07 | — | Single-writer mic arbitration (PTT preempts wakeword) | unit | `pnpm --filter @jarvis/desktop test -- voiceInputManager.test.ts` | ❌ W0 | ⬜ pending |

*Populated by planner/auditor from RESEARCH.md §Validation Architecture → Phase Requirements → Test Map (17 tests / 6 WAKE reqs + CPU + packaging + contextIsolation + cold start + TTS self-trigger).*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` — stubs for WAKE-01, WAKE-05, WAKE-09
- [ ] `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts` — load order + error handling
- [ ] `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts` — sliding window trip logic (WAKE-08)
- [ ] `apps/desktop/src/renderer/src/voice/__tests__/voiceInputManager.test.ts` — state machine table tests (WAKE-07)
- [ ] `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — state gating (WAKE-01, WAKE-05, WAKE-06)
- [ ] `apps/desktop/src/main/__tests__/ptt-hotkey.test.ts` — refactor spec (WAKE-07)
- [ ] `apps/desktop/scripts/cpu-benchmark-wakeword.mjs` — standalone CPU benchmark (WAKE-09 / CPU budget)
- [ ] `apps/desktop/scripts/smoke-packaged-build.sh` — post-builder assertion for 4 `.onnx` files
- [ ] `apps/desktop/electron-builder.yml` — packaging config (new in repo)
- [ ] `scripts/download-wakeword-models.sh` — idempotent model download + checksum
- [ ] CI grep ban for porcupine/picovoice/bumblebee-hotword in lockfile

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wake word latency ≤500ms end-to-end | WAKE-01 | Human perception + real mic required | `pnpm dev`, say "Hey JARVIS", cronometrar orb transition com smartphone/screen recording |
| Full cycle wake → listening → processing → responding → idle → wake again | WAKE-05 | Integration across modules + live LLM | Manual smoke test script in `pnpm dev` |
| PTT preemption during live wake word | WAKE-07 | Keyboard event + real mic | Start `pnpm dev`, deixa wake word rodar, pressionar Ctrl+Space, verificar PTT captura |
| Packaged build contains 4 ONNX files and detects wake word | pitfall #5 | Real electron-builder output | `pnpm --filter @jarvis/desktop build:dist && pnpm start` no artefato instalado |
| CPU sustained <2% após 10min silêncio em laptop 4-core | WAKE-09 + CPU budget | Real hardware required | `node scripts/cpu-benchmark-wakeword.mjs` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
