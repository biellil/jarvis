---
phase: 95-streaming-tts
plan: "02"
subsystem: desktop-py/tts
tags: [nltk, punkt_tab, sentence-boundary, streaming, tts, pt-br]

requires:
  - phase: 95-01
    provides: "punkt_tab PT-BR vendored data at assets/nltk_data + xfail test stubs"

provides:
  - "SentenceChunker class — stateful streaming sentence boundary detector"
  - "tokenize_all() function — stateless full-text sentence splitter"
  - "sentence_chunker.py module with hybrid first-chunk + min-chunk guard"
  - "P-3 corpus gate GREEN — 50-sentence PT-BR corpus validated"

affects:
  - "95-03: TTS worker consumes SentenceChunker output via queue"
  - "95-04: chat.py integration feeds LLM tokens to SentenceChunker.feed()"

tech-stack:
  added: []
  patterns:
    - "punkt_tab vendored path inserted at module level (not inside function) — Pitfall 4 prevention"
    - "_postprocess_sentences() merges punkt false splits on capitalized words after abbreviations"
    - "Streaming guard: require remainder >= 4 chars or contains space before accepting split"
    - "_ABBREV_EXTRAS injected into tok._params.abbrev_types after load (exmo/exma/etc/dep/art/dra)"

key-files:
  created:
    - "apps/desktop-py/src/jarvis_desktop/sentence_chunker.py"
  modified:
    - "apps/desktop-py/tests/test_sentence_chunker.py"

key-decisions:
  - "_postprocess_sentences() post-hoc merge: punkt orthographic context overrides abbrev list for capitalized words — post-processing is simpler and more reliable than trying to suppress punkt's statistical model"
  - "Streaming guard of 4 chars minimum remainder prevents false splits when feeding char-by-char (Dr. S vs Dr. Silva)"
  - "_ABBREV_EXTRAS expanded beyond original exmo/exma to include etc/dep/art/dra — these were missing from punkt_tab PT-BR corpus and required for corpus gate"
  - "Lowercase continuation merge in _postprocess_sentences handles quoted dialogue: 'espera!' antes → starts with lowercase 'a'"

patterns-established:
  - "Pattern: punkt_tab load + _params.abbrev_types.update() + _postprocess_sentences() pipeline for PT-BR accuracy"
  - "Pattern: streaming partial-token guard in _detect_next() — never split on remainder < 4 chars without spaces"

requirements-completed:
  - STTS-02

duration: ~20min
completed: "2026-06-11"
---

# Phase 95 Plan 02: SentenceChunker — PT-BR Sentence Boundary Detector Summary

**PT-BR sentence chunker using NLTK punkt_tab + post-processing merges, with hybrid first-chunk at 70 chars and min-chunk guard at 18 chars — P-3 corpus gate GREEN (50/50 sentences)**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-11T00:10:00Z
- **Completed:** 2026-06-11T00:30:00Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 2

## Accomplishments

- `sentence_chunker.py` implemented with `SentenceChunker` class and `tokenize_all()` function
- P-3 corpus gate GREEN: all 50 PT-BR test sentences produce correct sentence counts
- Hybrid first-chunk strategy (D-05): emits at 70 chars OR sentence boundary, whichever first
- Min-chunk guard (D-06): fragments < 18 chars merged with next sentence; first chunk exempt
- xfail mark removed from test stubs — all 6 tests PASSED (not XFAIL)

## Task Commits

1. **Task 1: Implement sentence_chunker.py** - `a3af9f3` (feat)

**Plan metadata:** (next commit)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/sentence_chunker.py` — SentenceChunker + tokenize_all, point_tab primary + regex fallback
- `apps/desktop-py/tests/test_sentence_chunker.py` — removed xfail mark (stubs now implemented)

## Decisions Made

- `_postprocess_sentences()` merges punkt false splits: punkt's orthographic heuristic overrides the abbreviation list when the following word is capitalized (e.g., "Exma. Secretária."). Post-processing is simpler than suppressing the statistical model.
- Streaming guard: require remainder >= 4 chars or containing a space before accepting a punkt split, to prevent false splits on partial tokens (e.g., "O Dr. S" → "S" is partial "Silva").
- `_ABBREV_EXTRAS` expanded to `{exmo, exma, etc, dep, art, dra}` — the punkt_tab PT-BR corpus training data is missing these; they must be injected after load.
- Lowercase-continuation merge handles quoted dialogue: `"espera!" antes de partir.` — the continuation starts with lowercase, merging it with the quote.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Regex lookbehind with variable-length alternation fails in Python 3.13**
- **Found during:** Task 1 (first run of tests)
- **Issue:** The plan's `_SENTENCE_SPLIT_RE` used `(?<!(?:Dr|Sr|...))` lookbehind with alternatives of different lengths — Python's `re` module requires fixed-width lookbehinds; raises `PatternError: look-behind requires fixed-width pattern`
- **Fix:** Replaced with `_BOUNDARY_CANDIDATE_RE` (finds candidate boundaries) + `_is_abbrev_boundary()` (checks preceding word post-hoc) — equivalent logic, fixed-width safe
- **Files modified:** sentence_chunker.py
- **Committed in:** a3af9f3

**2. [Rule 1 - Bug] punkt_tab splits "Exma. Secretária." even with exma in abbrev_types**
- **Found during:** Task 1 (test_pt_br_corpus_50 failure analysis)
- **Issue:** punkt's orthographic context heuristic overrides the abbreviation list when the following word starts with a capital letter. The statistical model interprets "Exma." + uppercase word as a strong sentence boundary signal.
- **Fix:** Added `_postprocess_sentences()` that merges adjacent sentences when: (a) the first ends with a known abbreviation, or (b) the second starts with a lowercase letter (quoted dialogue).
- **Files modified:** sentence_chunker.py
- **Committed in:** a3af9f3

**3. [Rule 1 - Bug] "etc.", "dep.", "art.", "dra." missing from punkt_tab PT-BR corpus**
- **Found during:** Task 1 (corpus analysis)
- **Issue:** Plan's `_ABBREV_EXTRAS` only listed `{exmo, exma}`. Testing the corpus showed punkt also fails on `etc.`, `dep.`, `art.`, `dra.` — these are absent from the corpus training data.
- **Fix:** Expanded `_ABBREV_EXTRAS` to `{exmo, exma, etc, dep, art, dra}` and injected all into `tok._params.abbrev_types` on load.
- **Files modified:** sentence_chunker.py
- **Committed in:** a3af9f3

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs)
**Impact on plan:** All three fixes necessary for the P-3 corpus gate to pass. No scope creep.

## Issues Encountered

- Python 3.13 `re` module raises `PatternError` (not the older `re.error`) for variable-width lookbehinds — resolved by redesigning the regex approach.

## Known Stubs

None — all stubs from Plan 01 are now implemented.

## Next Phase Readiness

- `SentenceChunker` and `tokenize_all` are ready for Plan 03 (TTS worker thread) and Plan 04 (chat.py integration)
- P-3 gate cleared — phase is safe to ship from the boundary detection perspective
- The public API matches the interface spec in the plan's `<interfaces>` section exactly

---
*Phase: 95-streaming-tts*
*Completed: 2026-06-11*
