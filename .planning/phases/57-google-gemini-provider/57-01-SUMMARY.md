---
phase: 57-google-gemini-provider
plan: 01
subsystem: llm
tags: [gemini, langchain, google-genai, llm-provider, typescript]

# Dependency graph
requires: []
provides:
  - LLMProvider union type with 'gemini' in types.ts
  - GEMINI_API_KEY field in LLMConfig interface and Zod schema
  - ChatGoogleGenerativeAI factory case in factory.ts (gemini-2.0-flash default, streaming:true)
  - LLMConfigError thrown when GEMINI_API_KEY is absent
  - types.test.ts with type-level validation tests
  - config.test.ts gemini tests (provider enum, GEMINI_API_KEY parsing, default)
  - factory.test.ts gemini provider and error tests
affects: [57-02, 57-03, 57-04]

# Tech tracking
tech-stack:
  added: ["@langchain/google-genai@^2.1.30"]
  patterns:
    - "Gemini added as 4th case in createLLM() switch — same LLMConfigError pattern as openai/anthropic"
    - "ChatGoogleGenerativeAI constructed with apiKey, model, streaming:true — parity with other providers"

key-files:
  created:
    - apps/backend-ts/src/llm/types.test.ts
  modified:
    - apps/backend-ts/src/llm/types.ts
    - apps/backend-ts/src/llm/config.ts
    - apps/backend-ts/src/llm/config.test.ts
    - apps/backend-ts/src/llm/factory.ts
    - apps/backend-ts/src/llm/factory.test.ts
    - apps/backend-ts/package.json
    - apps/backend-ts/package-lock.json

key-decisions:
  - "Default Gemini model is 'gemini-2.0-flash' (per D-11) when cfg.LLM_MODEL is empty"
  - "streaming:true set on ChatGoogleGenerativeAI for parity with openai/anthropic cases"
  - "No safetySettings added — Phase 58 scope per plan"

patterns-established:
  - "LLMConfigError pattern: if (!cfg.GEMINI_API_KEY) throw new LLMConfigError('gemini', 'GEMINI_API_KEY') — consistent with existing providers"
  - "Type-level test file (types.test.ts) validates union type inclusion — compilation failure = test failure"

requirements-completed: [LLM-PROV-01]

# Metrics
duration: 10min
completed: 2026-05-06
---

# Phase 57 Plan 01: Gemini LLM Provider — Type System, Config and Factory Summary

**@langchain/google-genai installed; LLMProvider union extended to 4 providers; factory returns ChatGoogleGenerativeAI with gemini-2.0-flash and streaming:true; all 30 llm/ tests pass**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-06T21:55:00Z
- **Completed:** 2026-05-06T21:58:43Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended `LLMProvider` type to include 'gemini' and added `GEMINI_API_KEY?: string` to `LLMConfig` interface in types.ts
- Updated `envSchema` in config.ts to enumerate 'gemini' and parse `GEMINI_API_KEY` from env (defaults to '')
- Installed `@langchain/google-genai@^2.1.30` and added `case 'gemini'` to factory returning `ChatGoogleGenerativeAI({model: 'gemini-2.0-flash', streaming: true})`
- Created types.test.ts (4 tests) and updated config.test.ts (+3 tests) and factory.test.ts (+2 tests); all 30 tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend LLMProvider type and config schema with Gemini** - `099a70f` (feat)
2. **Task 2: Install @langchain/google-genai and add Gemini case to factory** - `9967654` (feat)

## Files Created/Modified
- `apps/backend-ts/src/llm/types.ts` - Added 'gemini' to LLMProvider union; GEMINI_API_KEY to LLMConfig interface
- `apps/backend-ts/src/llm/config.ts` - Added 'gemini' to z.enum; GEMINI_API_KEY z.string().optional().default('')
- `apps/backend-ts/src/llm/types.test.ts` - NEW: Type-level tests for LLMProvider and LLMConfig with gemini
- `apps/backend-ts/src/llm/config.test.ts` - Added 3 gemini tests; updated providers array to 4
- `apps/backend-ts/src/llm/factory.ts` - ChatGoogleGenerativeAI import; case 'gemini'; updated default error message
- `apps/backend-ts/src/llm/factory.test.ts` - Added gemini provider test + gemini error test; mockConfig includes GEMINI_API_KEY
- `apps/backend-ts/package.json` - @langchain/google-genai added to dependencies
- `apps/backend-ts/package-lock.json` - Updated lockfile

## Decisions Made
- Default Gemini model is `gemini-2.0-flash` per D-11 when `cfg.LLM_MODEL` is empty
- `streaming: true` set on `ChatGoogleGenerativeAI` for parity with openai/anthropic cases
- No `safetySettings` added — that is Phase 58 scope per plan specification

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Linter reverted intermediate edits to factory.ts and factory.test.ts during typing; resolved by reading latest file state and applying all changes atomically.

## User Setup Required
None - no external service configuration required. Users will add GEMINI_API_KEY to .env in a later plan (57-03 Settings UI).

## Next Phase Readiness
- Gemini type contracts and factory are in place — plan 57-02 (ChatSession.swapLLM) and 57-03 (Settings UI) can proceed
- All downstream code (ChatSession, reload-llm endpoint) can reference LLMProvider 'gemini' and LLMConfig.GEMINI_API_KEY
- `npx vitest run src/llm/` exits 0 with 30 tests passing

## Self-Check: PASSED

---
*Phase: 57-google-gemini-provider*
*Completed: 2026-05-06*
