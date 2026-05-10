---
plan: 62-05
phase: 62-kokoro-offline-tts
status: complete
completed_at: "2026-05-07"
---

# Plan 62-05 Summary — Human Verification

## Result: APPROVED ✓

All 5 verification flows passed by human.

## Flows Verified

| Flow | Description | Result |
|------|-------------|--------|
| 1 | Provider select UI — Kokoro option, API Key/Voice ID hide, KokoroSection appears, switch back restores UI | ✓ |
| 2 | Model download — progress bar, % tracking, Cancel stops download | ✓ |
| 3 | No model: text-only response, no crash, no cloud API key attempt | ✓ |
| 4 | Local-only toggle persists across Settings close/reopen | ✓ |
| 5 | Switching to Murf/ElevenLabs: full API Key UI returns, zero Kokoro UI | ✓ |

## Bug Fixes Applied During Verification

**404 download error** (discovered in first verification attempt):
- Root cause: manual `fetch()` download to `userData/kokoro/model.onnx` was completely disconnected from `KokoroTTS.from_pretrained()` which cached to a different path
- Fix: rewrote `kokoroResources.ts` to use `from_pretrained()` with `progress_callback`; `env.cacheDir = userData/hf-cache/`; cache detection via HF snapshot directory structure

**Rollup bundling error** (`Could not dynamically require onnxruntime_binding.node`):
- Root cause: `externalizeDeps: false` caused Rollup to follow dynamic imports into `onnxruntime-node` (native addon with dynamic `require()`)
- Fix: externalized `onnxruntime-node`, `@huggingface/transformers`, `kokoro-js` in `electron.vite.config.ts`; added `extraResources` entries in `electron-builder.yml`

## Phase 62 Success Criteria Status

All 5 phase success criteria confirmed:
1. ✓ JARVIS speaks using offline Kokoro TTS (no API key required)
2. ✓ Kokoro failure → text-only response (non-local-only: Murf fallback via FallbackTTSProvider)
3. ✓ TTS provider switch in Settings applies without restart
4. ✓ First Kokoro selection: progress bar shows download with % tracking
5. ✓ Local-only toggle persists and prevents cloud fallback
