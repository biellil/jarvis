---
phase: 29
slug: stt-core-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 + node environment |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test -- src/main/__tests__/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test -- src/main/__tests__/whisper*.test.ts`
- **Before `/gsd:verify-work`:** Full suite must be green + manual verification of success criteria 4–5 (ASAR unpacking + transcription PoC)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | STT-01, STT-03 | unit | `pnpm test -- src/main/__tests__/whisper-gpu-detection.test.ts` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | STT-04 | unit | `pnpm test -- src/main/__tests__/whisper-audio-normalizer.test.ts` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 2 | INFRA-02 | unit | `pnpm test -- src/main/ipc/__tests__/chat-send-audio.test.ts` | ✅ | ⬜ pending |
| 29-01-04 | 01 | 3 | INFRA-01 | integration | `pnpm build:dist && verify app.asar.unpacked/node_modules/@fugood/` | Manual | ⬜ pending |
| 29-01-05 | 01 | 3 | STT-01 | manual | Transcription PoC — call whisper with test audio, verify text output | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/__tests__/whisper-gpu-detection.test.ts` — stubs for STT-01, STT-03
  - Test each GPU backend attempt (mock `initWhisper` success/failure per backend)
  - Verify log statements match exact strings: `"Using GPU backend: [cuda|vulkan|metal]"` and `"Falling back to CPU"`
  - Verify caching: second call returns same backend without re-detection
- [ ] `src/main/__tests__/whisper-audio-normalizer.test.ts` — stubs for STT-04
  - Mock `child_process.spawn` to avoid actual ffmpeg call in CI
  - Verify output includes log confirming `"16kHz, mono"` confirmation
  - Verify error handling on spawn failure

*Existing infrastructure (vitest, node environment, pure handler pattern) covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ASAR unpacking: `.node` binaries accessible in packaged app | INFRA-01 | Requires `pnpm build` + inspection of dist artifact | Run `pnpm build`, inspect `release-v2/` — verify `app.asar.unpacked/node_modules/@fugood/` exists with `.node` files |
| Transcription PoC: whisper.cpp returns correct text | STT-01 | Requires real model download + audio input | Set `USE_WHISPER_CPP=true`, run Electron dev, send test audio via PTT, verify transcription appears in console |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
