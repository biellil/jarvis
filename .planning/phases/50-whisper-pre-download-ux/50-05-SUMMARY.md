---
phase: 50-whisper-pre-download-ux
plan: 05
status: complete
---

# Plan 50-05 Summary — Tests + Smoke Test

## What was built

**Task 1 — whisper-ipc.test.ts (5 tests, all passing):**
- Cache hit path: broadcasts success immediately, no ensureWhisperModel call
- Download happy path: onProgress broadcasts + success broadcast + setActiveWhisperModel
- Error path: broadcasts error, does NOT call setActiveWhisperModel
- AbortError path: silently returns, no error broadcast
- resolveWhisperModel called with option and vramMb for non-auto options

**Task 2 — SettingsForm.test.tsx additions (4 new tests + 1 skipped):**
- Renders without progress bar initially
- Shows progress bar with "Downloading Auto… 42%" text when download event fires
- Error state shows "Couldn't download" text + Try again button
- Clicking Try again calls window.whisper.downloadModel
- Cache-hit Toast skipped (Radix portal in happy-dom — consistent with Phase 49)

**Smoke test — approved:**
- Download trigger: Select disabled, progress bar animates with MB text
- Cache hit: Toast "Model already cached" appears, no progress bar
- Error state: error text + Try again button visible, Select re-enables
- Model activation: transcription uses new model without restart

## Bugs fixed during smoke test

- **HTTP 403**: MODEL_URLS were pre-signed S3 URLs with 1h expiry (generated 2026-04-26). Replaced with stable `huggingface.co/ggerganov/whisper.cpp` URLs.
- **`.tmp` never renamed to `.bin`**: On HTTP redirect (HuggingFace → S3), code called `file.close()` before following the redirect, leaving the WriteStream closed so `finish` never fired and `renameSync` never ran. Fixed by calling `res.resume()` instead of `file.close()` on redirect.

## Commits
- `✅ test(50-05)`: whisper IPC handler tests + frontend download UX tests
- `🐛 fix(whisper)`: replace expired pre-signed S3 URLs with stable HuggingFace URLs
- `🐛 fix(whisper)`: don't close WriteStream on redirect
- `✨ feat(whisper)`: show model sizes in dropdown labels
