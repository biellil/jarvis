---
phase: 92-openrouter-provider
plan: 01
subsystem: llm
tags: [openrouter, langchainjs, chatOpenAI, provider, typescript]

# Dependency graph
requires:
  - phase: 57-google-gemini
    provides: Gemini as 4th LLM provider — established multi-provider factory pattern

provides:
  - OpenRouter as 5th LLM provider in createLLM() factory
  - LLMProvider union updated with 'openrouter'
  - Zod schema extended with OPENROUTER_API_KEY field
  - 429 rate-limit user-facing handling via AIMessage
  - Free-tier support (no API key required for :free models)
  - OpenRouter entry in capability matrix (streaming:true, vision:false, functionCalling:true)

affects: [factory-users, capabilities-callers, config-consumers, env-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChatOpenAI + configuration.baseURL pattern for OpenAI-compatible APIs (reusing lmstudio approach)"
    - "invoke() wrapper pattern for provider-specific error handling without subclassing"
    - "429 surface-as-AIMessage instead of throw — graceful degradation for rate limits"

key-files:
  created: []
  modified:
    - apps/backend-ts/src/llm/types.ts
    - apps/backend-ts/src/llm/config.ts
    - apps/backend-ts/src/llm/factory.ts
    - apps/backend-ts/src/llm/capabilities.ts
    - .env.example

key-decisions:
  - "ChatOpenAI reused with baseURL=https://openrouter.ai/api/v1 — no new dependency; same pattern as lmstudio"
  - "apiKey fallback to 'free-tier' string when OPENROUTER_API_KEY empty — OpenRouter free tier accepts any non-empty key"
  - "LLM_MODEL required for openrouter (no sensible default unlike other providers) — LLMConfigError with hint on missing"
  - "vision:false conservative default — OpenRouter model zoo varies widely; opt-in via LM_STUDIO_VISION env var"
  - "429 wrapped in invoke() — OpenAI SDK already retries 3x; we only catch the final exhausted failure"

patterns-established:
  - "Invoke wrapper pattern: bind original invoke, override with try/catch, re-export same type signature"
  - "Free-tier provider: optional API key with non-empty fallback string allows zero-config usage"

requirements-completed: [OPENR-02, OPENR-03, OPENR-04]

# Metrics
duration: 4min
completed: 2026-06-10
---

# Phase 92 Plan 01: OpenRouter Provider Summary

**OpenRouter added as 5th LLM provider using ChatOpenAI + baseURL reuse pattern, free-tier zero-config support, and 429 rate-limit surfaced as chat message instead of crash**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-10T15:15:04Z
- **Completed:** 2026-06-10T15:18:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `LLMProvider` union and Zod enum extended to include `'openrouter'`
- `OPENROUTER_API_KEY` optional field added to both `LLMConfig` interface (types.ts) and Zod schema (config.ts)
- `case 'openrouter'` added to `createLLM()` factory using `ChatOpenAI` with `baseURL: 'https://openrouter.ai/api/v1'`
- Free-tier usage: no API key required — `apiKey` falls back to `'free-tier'` string
- `LLM_MODEL` required for openrouter with descriptive error hint (example free-tier model in message)
- 429 rate-limit exhaustion wrapped in `invoke()` override — returns `AIMessage` with user-facing explanation instead of throwing
- `capabilities.openrouter` entry added with `streaming: true, vision: false, functionCalling: true`
- `.env.example` updated: Provider comment + new OpenRouter section with free-tier model example

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types.ts and config.ts for OpenRouter** - `30bc556` (feat)
2. **Task 2: Add openrouter case to factory.ts + capabilities.ts + .env.example** - `08412d0` (feat)

## Files Created/Modified

- `apps/backend-ts/src/llm/types.ts` — LLMProvider union + OPENROUTER_API_KEY in LLMConfig interface
- `apps/backend-ts/src/llm/config.ts` — Zod enum + OPENROUTER_API_KEY field in envSchema
- `apps/backend-ts/src/llm/factory.ts` — case 'openrouter' with ChatOpenAI, free-tier support, 429 handling
- `apps/backend-ts/src/llm/capabilities.ts` — openrouter entry in capability matrix
- `.env.example` — Provider comment updated + OpenRouter section documented

## Decisions Made

- ChatOpenAI reused with `baseURL: 'https://openrouter.ai/api/v1'` — no new dependency, same pattern as lmstudio case
- `apiKey` falls back to `'free-tier'` string when `OPENROUTER_API_KEY` is empty — OpenRouter accepts any non-empty string for free-tier models
- `LLM_MODEL` required for openrouter (throws `LLMConfigError`) because there is no sensible default unlike other providers
- `vision: false` as conservative default in capabilities — OpenRouter serves hundreds of models with varying vision support
- 429 caught only after SDK's built-in retry exhaustion (3x backoff) — we surface the final failure as an `AIMessage` to avoid silent stalls

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — OpenRouter is opt-in via `.env`. Default provider remains LM Studio.

To use OpenRouter:
1. Set `LLM_PROVIDER=openrouter` in `.env`
2. Set `LLM_MODEL=meta-llama/llama-3.1-8b-instruct:free` (or any `:free` model for zero-cost usage)
3. Optionally set `OPENROUTER_API_KEY` for paid models

## Next Phase Readiness

- Phase 92 Plan 02 can proceed (separate parallel wave)
- All 47 LLM tests pass — zero regressions across the full `src/llm/` suite
- `createLLM('openrouter', cfg)` is wired and ready for integration testing

---
*Phase: 92-openrouter-provider*
*Completed: 2026-06-10*
