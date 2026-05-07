---
phase: 60-lm-studio-streaming-events
plan: 01
subsystem: llm
tags: [lmstudio, streaming, sse, chatOpenAI, langchain, vitest, tdd]

requires:
  - phase: 57-google-gemini-provider
    provides: factory.ts pattern with ChatOpenAI lmstudio case and LLMConfig Zod schema

provides:
  - ChatOpenAIStreamingEvents subclass with native LM Studio /api/v1/chat SSE parser
  - USE_LM_STUDIO_STREAMING_EVENTS feature flag in LLMConfig and Zod schema
  - Conditional factory instantiation: lmstudio + flag=true → ChatOpenAIStreamingEvents
  - reload-llm route accepts useStreamingEvents boolean from Electron payload

affects: [60-02-electron-store-ui, future-llm-plans]

tech-stack:
  added: []
  patterns:
    - "SSE buffer management: split by double-newline, keep incomplete tail in buffer for next chunk"
    - "Silent fallback: _streamNativeEvents error → catch → yield* super.stream() (D-02)"
    - "Idempotent URL builder: /api/v1 suffix check before /v1 replacement"
    - "TDD cycle: test file first (RED), implementation (GREEN), bug fix inline (idempotent URL logic)"

key-files:
  created:
    - apps/backend-ts/src/llm/streaming-events.ts
    - apps/backend-ts/src/llm/streaming-events.test.ts
  modified:
    - apps/backend-ts/src/llm/config.ts
    - apps/backend-ts/src/llm/factory.ts
    - apps/backend-ts/src/llm/factory.test.ts
    - apps/backend-ts/src/routes/reload-llm.ts

key-decisions:
  - "Idempotent _buildNativeUrl: check /api/v1 suffix first before removing /v1 — prevents double-prefix bug when LM_STUDIO_URL already contains /api/v1"
  - "constructor destructures nativeEventsEnabled from opts before passing rest to super() — clean ChatOpenAI subclassing pattern"
  - "Test 3/8 use prototype chain manipulation to mock super.stream() — necessary for testing override behavior in JavaScript class inheritance"
  - "Pre-existing test failures (8 tests: pc-tools count, chat-session mocks, LM Studio integration) confirmed pre-date this plan via git stash verification"

patterns-established:
  - "SSE buffer pattern: decoder.decode(value, {stream:true}) + split on \\n\\n + pop() tail for boundary-safe parsing"
  - "Feature flag gating in factory switch case: cfg.USE_LM_STUDIO_STREAMING_EVENTS controls which class is returned for lmstudio"

requirements-completed: [LLM-PROV-02]

duration: 7min
completed: 2026-05-07
---

# Phase 60 Plan 01: LM Studio Streaming Events Backend Summary

**ChatOpenAIStreamingEvents subclass with native /api/v1/chat SSE parser, fallback to super.stream() on error, factory feature flag USE_LM_STUDIO_STREAMING_EVENTS, and reload-llm route extension**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-07T02:10:00Z
- **Completed:** 2026-05-07T02:17:13Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created ChatOpenAIStreamingEvents extending ChatOpenAI with full LM Studio native SSE event parser (message.delta yields, reasoning.delta logged, chat.end TTFT logged, error events throw)
- SSE buffer management handles events split across TCP chunks via double-newline splitting with incomplete-tail buffering
- Silent fallback D-02: _streamNativeEvents errors are caught and super.stream() is transparently substituted
- Factory conditionally returns ChatOpenAIStreamingEvents when USE_LM_STUDIO_STREAMING_EVENTS=true for lmstudio provider
- reload-llm route extended with useStreamingEvents boolean field that propagates to overrideConfig
- 9 unit tests + 4 factory integration tests — all green

## Task Commits

1. **Task 1: ChatOpenAIStreamingEvents subclass + tests (TDD)** - `2f15cac` (feat)
2. **Task 2: Factory flag + config extension + reload-llm route update** - `8d400dc` (feat)

## Files Created/Modified

- `apps/backend-ts/src/llm/streaming-events.ts` - ChatOpenAIStreamingEvents class with _buildNativeUrl, stream() override, _streamNativeEvents SSE parser
- `apps/backend-ts/src/llm/streaming-events.test.ts` - 9 unit tests covering all behavior points (TDD)
- `apps/backend-ts/src/llm/config.ts` - Added USE_LM_STUDIO_STREAMING_EVENTS z.coerce.boolean().default(false) to Zod schema
- `apps/backend-ts/src/llm/factory.ts` - Conditional lmstudio branch returning ChatOpenAIStreamingEvents when flag=true; import added
- `apps/backend-ts/src/llm/factory.test.ts` - Added USE_LM_STUDIO_STREAMING_EVENTS to mockConfig; added 4 new tests (Tests A-D)
- `apps/backend-ts/src/routes/reload-llm.ts` - useStreamingEvents optional boolean in body schema; USE_LM_STUDIO_STREAMING_EVENTS in overrideConfig

## Decisions Made

- Idempotent _buildNativeUrl: check /api/v1 suffix before stripping /v1 — discovered via Test 2 failure during TDD RED phase (auto-fixed inline as Rule 1 bug)
- Prototype chain manipulation to mock super.stream() in Tests 3 and 8 — necessary because vitest cannot spy on super method calls in JavaScript inheritance without this approach

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed idempotent _buildNativeUrl for URLs already containing /api/v1**
- **Found during:** Task 1 GREEN phase (Test 2 failure)
- **Issue:** Original implementation applied `/\/v1\/?$/` regex to `http://host:1234/api/v1`, stripping the `/v1` and then prepending `/api/v1`, producing `http://host:1234/api/api/v1/chat`
- **Fix:** Added `/api\/v1` prefix check — if base already ends with `/api/v1`, append `/chat` directly without replacement
- **Files modified:** apps/backend-ts/src/llm/streaming-events.ts
- **Verification:** Test 2 passes: `http://host:1234/api/v1` → `http://host:1234/api/v1/chat`
- **Committed in:** 2f15cac (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Essential correctness fix — without it, custom LM Studio ports/paths would get double-prefixed URLs. No scope creep.

## Issues Encountered

- 8 pre-existing test failures confirmed via `git stash` comparison: pc-tools count mismatch (9 vs 12 tools), chat-session mock failures, LM Studio integration test (no model loaded). None caused by this plan's changes.

## Known Stubs

None — all factory/config/route wiring is fully connected. The `nativeEventsEnabled` flag flows from config → factory → ChatOpenAIStreamingEvents constructor. Electron UI integration (toggle switch) is handled in Plan 02.

## Next Phase Readiness

- Plan 02 (Electron store + UI toggle) can now import `useStreamingEvents` from the reload-llm route payload and set it in electron-store
- The `POST /internal/reload-llm` endpoint already accepts `useStreamingEvents: boolean` — Plan 02 just needs to send it
- No regressions in existing factory/config/types tests

---
*Phase: 60-lm-studio-streaming-events*
*Completed: 2026-05-07*
