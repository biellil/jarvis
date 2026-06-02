---
phase: 88-emotion-tags-config-ux
plan: "01"
subsystem: tts
tags: [emotion-tags, chatterbox, tts, config]
dependency_graph:
  requires: [Phase 87 voice cloning — _chatterbox_speak base, JarvisConfig chatterbox_audio_prompt_path]
  provides: [_extract_emotion_tag, _EMOTION_TAG_MAP, _KNOWN_TAGS, _TAG_PATTERN, chatterbox_exaggeration field, chatterbox_cfg_weight field]
  affects: [tts._chatterbox_speak — now strips tags and injects exaggeration/cfg_weight per-call]
tech_stack:
  added: [re (stdlib, module-level compile for _TAG_PATTERN)]
  patterns: [TDD RED/GREEN, emotion tag map dict, config field defaults with pydantic Field]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/tests/test_tts.py
decisions:
  - "_EMOTION_TAG_MAP uses (exaggeration, cfg_weight) tuple — lookup by tag_name, fallback to config defaults when tag=None"
  - "tag strip occurs ONLY in Chatterbox path — Kokoro/ElevenLabs/Murf receive original text (D-04)"
  - "All [xxx] patterns stripped from text_clean regardless of recognition (D-02) — prevents literal tags being spoken"
metrics:
  duration: ~8 minutes
  completed: "2026-05-29"
  tasks_completed: 2
  files_changed: 3
---

# Phase 88 Plan 01: Emotion Tag Parsing Summary

Emotion tag parsing for Chatterbox TTS via `_extract_emotion_tag()` — maps `[angry]`, `[whispering]`, etc. to Chatterbox `exaggeration` + `cfg_weight` per-call. Kokoro and other providers receive the original unmodified text.

## What Was Built

### `_extract_emotion_tag(text: str) -> tuple[str | None, str]`

Located in `apps/desktop-py/src/jarvis_desktop/tts.py` at line ~64.

- Scans all `[xxx]` patterns in the text
- Returns first recognized tag name (from `_KNOWN_TAGS`) and text with ALL `[xxx]` removed + stripped
- Unknown tags are silently removed (no log, no error)

### `_EMOTION_TAG_MAP`

```python
_EMOTION_TAG_MAP: dict = {
    "angry":       (1.3, 0.5),
    "excited":     (1.4, 0.5),
    "emphasis":    (1.2, 0.5),
    "sad":         (0.5, 0.5),
    "embarrassed": (0.4, 0.5),
    "soft":        (0.3, 0.8),
    "whispering":  (0.2, 0.9),
    "breathy":     (0.3, 0.8),
}
```

Each entry: `(exaggeration, cfg_weight)`.

### `JarvisConfig` new fields

| Field | Default | Purpose |
|---|---|---|
| `chatterbox_exaggeration` | `0.7` | Default exaggeration when no tag present |
| `chatterbox_cfg_weight` | `0.5` | Default cfg_weight when no tag present |

### `_chatterbox_speak()` modification

Before calling `generate()`, calls `_extract_emotion_tag(text)` to:
1. Get `tag_name` and `text_clean` (tags stripped)
2. Look up `(exag, cfg_w)` from `_EMOTION_TAG_MAP` or fall back to config defaults
3. Pass `text_clean` (not original `text`) as positional arg to `generate()`
4. Always inject `exaggeration` and `cfg_weight` into `_generate_kwargs`

## Test Results

```
41 passed in 2.75s
```

10 new Phase 88 tests all GREEN. 31 existing tests (Phase 86/87) unaffected.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All emotion tags wired to real Chatterbox `generate()` kwargs.

## Self-Check: PASSED
