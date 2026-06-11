---
phase: 95-streaming-tts
plan: "04"
subsystem: desktop-py/chat
tags: [streaming-tts, sentence-chunker, tts-worker, integration, chat]
dependency_graph:
  requires:
    - 95-02 (SentenceChunker + tokenize_all)
    - 95-03 (TTS worker + _tts_queue)
  provides:
    - Full streaming TTS pipeline: tokens → chunker → _tts_queue → worker → audio
  affects:
    - chat.py _read_sse_stream (producer wired)
    - chat.py _stream_response (start_tts_worker called, speak() removed)
tech_stack:
  added: []
  patterns:
    - SentenceChunker.feed() per token in SSE loop
    - tokenize_all() for task:done agentic summaries (D-11)
    - chunker.flush_remaining() at stream end
    - start_tts_worker() called before SSE loop
    - _tts._tts_queue.put() with first_token_ts on first sentence only
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_chat.py
decisions:
  - "[Phase 95-04]: speak(full_text) removed from _stream_response — worker drains asynchronously; test_stream_response_triggers_tts updated to assert queue-based TTS"
  - "[Phase 95-04]: start_tts_worker called in _stream_response before SSE loop (not in init_tts only) — ensures worker is ready even if called without prior init_tts"
  - "[Phase 95-04]: task:done D-11 routing added in BOTH main loop and trailing flush section — consistent behavior regardless of when agentic event arrives"
metrics:
  duration: "273s"
  completed_date: "2026-06-11"
  tasks: 2
  files_modified: 2
requirements:
  - STTS-01
---

# Phase 95 Plan 04: Chat.py Producer Integration Summary

**One-liner:** Wired SentenceChunker + _tts_queue producer into `_read_sse_stream()`, replacing blocking `speak(full_text)` with sentence-level streaming TTS via worker thread.

## What Was Built

The final integration step of Phase 95. Plans 02 and 03 built the components (SentenceChunker, TTS worker); Plan 04 connects them into `chat.py`.

### Changes to chat.py

**Imports added:**
- `import time`
- `from jarvis_desktop.sentence_chunker import SentenceChunker, tokenize_all`
- `from jarvis_desktop import tts as _tts`

**`_read_sse_stream()` modifications:**
- Local `chunker = SentenceChunker()`, `_first_token_ts`, `_tts_turn_started` initialized before the while loop
- Each plain token (`event_type is None`) feeds `chunker.feed(token_text)` and enqueues ready sentences to `_tts._tts_queue`
- First sentence carries `first_token_ts` for TTFA metric (D-14)
- `task:done` agentic summaries routed via `tokenize_all(agent_text)` — same queue, same chunker state (D-11)
- Both main loop AND trailing buffer flush section updated consistently
- `chunker.flush_remaining()` called after both sections to drain partial sentences at stream end

**`_stream_response()` modifications:**
- `_tts.start_tts_worker(config)` called before `urlopen` — worker ready before first token arrives
- `if full_text.strip(): speak(full_text, config)` removed — worker already consumed sentences; calling `speak()` here would double-speak

### Changes to test_chat.py

**`test_stream_response_triggers_tts` updated:**
- Old: asserted `speak()` called once with full text (D-01 behavior)
- New: asserts sentences enqueued to `_tts._tts_queue` (Phase 95 streaming TTS)
- Patches `start_tts_worker` to stay unit-scoped

**New test: `test_sse_stream_enqueues_sentences`:**
- Feeds 6 tokens forming "Olá, como vai? Estou bem, obrigado."
- Asserts at least 1 sentence enqueued to `_tts._tts_queue`
- Verifies `"Olá"` present in enqueued content
- Patches `start_tts_worker` — no real threads in unit tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test_stream_response_triggers_tts to reflect Phase 95 behavior**
- **Found during:** Task 1 verification
- **Issue:** Existing test asserted `speak(full_text)` called once — this is the old D-01 behavior that Phase 95 intentionally removes
- **Fix:** Updated test to assert sentences are enqueued to `_tts._tts_queue` instead of `speak()` being called
- **Files modified:** `apps/desktop-py/tests/test_chat.py`
- **Commit:** 82c826b

### Pre-existing Flaky Test (Out of Scope)

`test_tts.py::test_import_error_disables_session` fails when run in the full suite but passes in isolation — a pre-existing test ordering/state issue from Phase 95-03. Not caused by Plan 04 changes. Logged to deferred-items.

## Test Results

```
tests/test_chat.py::test_sse_stream_enqueues_sentences PASSED
Full chat suite: 9 passed, 1 xfailed, 3 xpassed
P-3 gate (test_pt_br_corpus_50): PASSED
Integration smoke (imports + _tts_queue.maxsize): OK
```

## Known Stubs

None — all data flows are wired. `_tts_queue.put()` calls are live code paths, not stubs.

## Self-Check: PASSED

- FOUND: apps/desktop-py/src/jarvis_desktop/chat.py
- FOUND: apps/desktop-py/tests/test_chat.py
- FOUND: commit 82c826b (feat — chat.py wired)
- FOUND: commit 577470d (test — test_sse_stream_enqueues_sentences added)
