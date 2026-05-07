---
phase: 62
slug: kokoro-offline-tts
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-07
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `npm test -- kokoro --run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10s quick / ~30s full |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- kokoro --run`
- **After every plan wave:** Run `npm test` (full TTS provider suite)
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke test
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | TTS-OFF-01..05 | type-check | `cd apps/desktop && npx tsc --noEmit` | ✅ | ⬜ pending |
| 62-02-01 | 02 | 1 | TTS-OFF-04 | unit | `npm test -- kokoro-resources.test.ts --run` | ❌ W0 | ⬜ pending |
| 62-02-02 | 02 | 1 | TTS-OFF-01,04 | unit | `npm test -- kokoro-resources.test.ts --run` | ❌ W0 | ⬜ pending |
| 62-03-01 | 03 | 2 | TTS-OFF-01,05 | unit | `npm test -- kokoro.test.ts --run` | ❌ W0 | ⬜ pending |
| 62-03-02 | 03 | 2 | TTS-OFF-02,05 | unit+grep | `npm test -- kokoro.test.ts --run && grep -ql "KOKORO_DOWNLOAD_MODEL" apps/desktop/src/main/ipc/kokoro.ts` | ❌ W0 | ⬜ pending |
| 62-04-01 | 04 | 3 | TTS-OFF-04 | integration | `npm test -- KokoroSection.test.tsx --run` | ❌ W0 | ⬜ pending |
| 62-04-02 | 04 | 3 | TTS-OFF-03,05 | integration | `npm test -- TtsSection.test.tsx --run` | ❌ W0 | ⬜ pending |
| 62-05-01 | 05 | 4 | TTS-OFF-01..05 | full suite | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/voiceInput/tts/__tests__/kokoro-resources.test.ts` — stubs for TTS-OFF-04 (download, path, AbortController)
- [ ] `apps/desktop/src/main/voiceInput/tts/__tests__/kokoro.test.ts` — stubs for TTS-OFF-01, TTS-OFF-02, TTS-OFF-05 (synthesize, fallback, local-only)
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/KokoroSection.test.tsx` — stubs for TTS-OFF-04 (download UI, progress bar, cancel button)
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx` — extend existing with TTS-OFF-03 (kokoro option, API Key visibility, local-only checkbox)

Wave 0 test files are created in Plan 02 (TDD) before implementation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GPU acceleration via ONNX Runtime | TTS-OFF-01 | Requires actual CUDA/Metal hardware | Check console logs for "ExecutionProvider: CUDA" or "Metal" on startup after selecting Kokoro |
| Offline synthesis quality | TTS-OFF-01 | Audio quality is subjective | Listen to synthesized voice; should be human-quality (not robotic) |
| Progress bar during download | TTS-OFF-04 | Requires actual ~350MB download | Select Kokoro → click Download → verify % progress updates in real time |
| Local-only mode never calls Murf | TTS-OFF-05 | Requires network monitoring | Enable local-only, disable Kokoro model, speak — verify no network call to Murf API |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
