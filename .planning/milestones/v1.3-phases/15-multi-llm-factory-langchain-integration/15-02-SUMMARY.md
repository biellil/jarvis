---
phase: 15-multi-llm-factory-langchain-integration
plan: 02
subsystem: llm
tags: [langchain, factory-pattern, multi-provider, integration-test]
dependency_graph:
  requires: [llm-config, llm-types]
  provides: [createLLM, llm-errors]
  affects: [backend-ts]
tech_stack:
  added: []
  patterns: [factory-pattern, provider-switching, error-handling, conditional-testing]
key_files:
  created:
    - apps/backend-ts/src/llm/errors.ts
    - apps/backend-ts/src/llm/factory.ts
    - apps/backend-ts/src/llm/factory.test.ts
  modified: []
decisions:
  - "Use configuration: { baseURL } for LM Studio (not basePath) - LangChain.js 1.x pattern"
  - "Always set streaming: true for all providers (Python parity per D-01)"
  - "Default models match Python exactly (gpt-4o-mini, claude-3-5-haiku-20241022)"
  - "LM Studio integration test skips gracefully if service not running (per D-24)"
  - "Error messages replicate Python format exactly (per D-17)"
metrics:
  duration: 18 minutes
  tasks: 3
  files: 3
  tests: 7
  commits: 3
  completed: 2026-04-07T22:04:17Z
---

# Phase 15 Plan 02: Multi-LLM Factory Implementation Summary

**One-liner:** createLLM() factory function with provider switching (LM Studio, OpenAI, Claude) using LangChain.js 1.x and comprehensive test coverage

## What Was Built

Multi-provider LLM factory with:
- Custom error classes (LLMConfigError, LLMConnectionError) matching Python error patterns
- createLLM() factory function supporting three providers via BaseChatModel interface
- LM Studio connection using `configuration: { baseURL }` pattern (LangChain.js 1.x)
- Cloud provider validation (throws LLMConfigError if API keys missing)
- Conditional integration test that skips gracefully if LM Studio not running
- All providers configured with streaming: true and Python-matching default models

## Implementation Notes

### Task 1: Create error classes
**Commit:** `6413789`

**File created:** `apps/backend-ts/src/llm/errors.ts`

**Error classes implemented:**
1. **LLMConfigError** - Thrown when required config is missing
   - Constructor: `(provider: string, missingField: string)`
   - Message format: `"${missingField} required when LLM_PROVIDER=${provider}"`
   - Use case: OPENAI_API_KEY or ANTHROPIC_API_KEY missing for cloud providers

2. **LLMConnectionError** - Thrown when connection to provider fails
   - Constructor: `(provider: string, url: string)`
   - Message format: `"Could not connect to ${provider} at ${url}"`
   - Use case: LM Studio not running, network errors (not used yet - Phase 17)

**Python parity:** Error message formats match `src/jarvis/llm/factory.py` exactly (per D-17).

### Task 2: Implement factory function
**Commit:** `f5f77c5`

**File created:** `apps/backend-ts/src/llm/factory.ts`

**Factory implementation:**
```typescript
export function createLLM(
  provider?: LLMProvider,
  config?: LLMConfig
): BaseChatModel
```

**Provider configurations:**

1. **LM Studio (lmstudio):**
   ```typescript
   new ChatOpenAI({
     configuration: {
       baseURL: cfg.LM_STUDIO_URL,  // "http://localhost:1234/v1"
     },
     apiKey: 'lm-studio',  // Required but ignored
     model: cfg.LM_STUDIO_MODEL || cfg.LLM_MODEL || 'default',
     streaming: true,
   })
   ```
   - **CRITICAL:** Uses `configuration: { baseURL }` (not legacy `basePath` parameter)
   - Per RESEARCH.md: LangChain.js 1.x moved baseURL into nested configuration object

2. **OpenAI (openai):**
   ```typescript
   new ChatOpenAI({
     apiKey: cfg.OPENAI_API_KEY,  // Validated not empty
     model: cfg.LLM_MODEL || 'gpt-4o-mini',  // Python default
     streaming: true,
   })
   ```
   - Throws `LLMConfigError` if OPENAI_API_KEY is empty
   - Default model matches Python: `gpt-4o-mini`

3. **Anthropic (anthropic):**
   ```typescript
   new ChatAnthropic({
     apiKey: cfg.ANTHROPIC_API_KEY,  // Validated not empty
     model: cfg.LLM_MODEL || 'claude-3-5-haiku-20241022',  // Python default
     streaming: true,
   })
   ```
   - Throws `LLMConfigError` if ANTHROPIC_API_KEY is empty
   - Default model matches Python: `claude-3-5-haiku-20241022`

**Key design decisions:**
- All providers return `BaseChatModel` interface (provider-agnostic)
- `streaming: true` set for all providers (Python parity per D-01)
- Config override parameter allows testing without environment variables
- Provider parameter allows runtime override of config.LLM_PROVIDER
- Unknown provider throws clear error message listing valid options

**Import fixes applied:**
- Added `.js` extensions to relative imports (TypeScript ESM requirement)
- Removed unused `_exhaustive: never` variable (TypeScript inference issue with optional params)

### Task 3: Create integration tests
**Commit:** `e6f020a`

**File created:** `apps/backend-ts/src/llm/factory.test.ts`

**Test coverage (7 tests total):**

**Provider Selection (4 tests):**
- ✅ Returns BaseChatModel for lmstudio provider
- ✅ Returns BaseChatModel for openai provider with API key
- ✅ Returns BaseChatModel for anthropic provider with API key
- ✅ Throws for unknown provider with clear error message

**Error Handling (2 tests):**
- ✅ Throws LLMConfigError when OPENAI_API_KEY is missing
- ✅ Throws LLMConfigError when ANTHROPIC_API_KEY is missing

**LM Studio Integration (1 test):**
- ✅ Sends message and receives response if LM Studio is running
  - Uses `isLMStudioRunning()` helper function
  - Skips gracefully with console message if LM Studio offline (per D-24)
  - 10-second timeout for slow first request
  - Validates response is non-empty string

**Test patterns used:**
- `isLMStudioRunning()` async helper checks `http://localhost:1234/v1/models`
- Early return pattern for conditional skip (cleaner than `test.skipIf` with top-level await)
- Mock config objects for isolated testing
- Timeout configuration for slow LM Studio responses

**Console output when LM Studio offline:**
```
ℹ️  LM Studio not running at localhost:1234 — integration test skipped
   Start LM Studio and re-run tests to validate LM Studio integration (per D-22)
```

## Verification Results

**Automated verification passed:**
```bash
$ cd apps/backend-ts && pnpm test src/llm/ --run
✓ 21 tests passed (13 config + 7 factory + 1 types)
✓ Duration: 2.21s

$ cd apps/backend-ts && npx tsc --noEmit
✓ No TypeScript errors
```

**Must-haves verified:**
- ✅ Factory function creates correct LLM instance based on provider
- ✅ LM Studio connects via custom baseURL configuration (`configuration: { baseURL }`)
- ✅ All providers return BaseChatModel with streaming enabled
- ✅ errors.ts exports LLMConfigError and LLMConnectionError
- ✅ factory.ts exports createLLM function
- ✅ factory.test.ts has 7 tests (>60 line minimum: 118 lines)
- ✅ ChatOpenAI import from @langchain/openai
- ✅ ChatAnthropic import from @langchain/anthropic
- ✅ Error messages match Python format exactly

**Key links verified:**
- ✅ `import.*ChatOpenAI.*from.*@langchain/openai` - Line 13 of factory.ts
- ✅ `import.*ChatAnthropic.*from.*@langchain/anthropic` - Line 14 of factory.ts

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions

1. **configuration: { baseURL } for LM Studio**
   - Context: RESEARCH.md documented LangChain.js 1.x uses nested configuration object
   - Decision: Use `configuration: { baseURL }` (not legacy `basePath` second parameter)
   - Impact: Matches LangChain.js 1.x documentation, prevents connection to wrong endpoint
   - Rationale: LangChain.js 1.x deprecated basePath constructor parameter

2. **Graceful skip for LM Studio integration test**
   - Context: D-24 requires test to skip if LM Studio not running (don't fail CI)
   - Decision: Use early return pattern instead of `test.skipIf` with top-level await
   - Impact: Test runs and skips gracefully with helpful console message
   - Rationale: Top-level await in describe block caused esbuild transform error

3. **streaming: true for all providers**
   - Context: Python factory sets `streaming=True` on all LLMs
   - Decision: Always set `streaming: true` in TypeScript factory
   - Impact: Phase 20 E2E validation will pass (streaming behavior matches)
   - Rationale: D-01 requires functional parity with Python

4. **Default models match Python exactly**
   - Context: Python uses `gpt-4o-mini` for OpenAI, `claude-3-5-haiku-20241022` for Anthropic
   - Decision: Use identical default model strings in TypeScript
   - Impact: Both implementations produce same LLM responses for E2E validation
   - Rationale: D-01 requires functional parity, D-03 gates cutover on matching outputs

## Known Stubs

None — all functionality is fully implemented.

## Integration Points

**Upstream dependencies:**
- Plan 15-01: loadConfig(), LLMProvider type, LLMConfig interface

**Downstream consumers:**
- Plan 15-03 (Capabilities): Will use createLLM() to test provider capabilities
- Phase 17 (ChatSession): Will call createLLM() to get LLM instance for conversation
- Phase 20 (E2E Validation): Will compare createLLM() output to Python create_llm()

**Python parity:**
- TypeScript factory.ts ↔ Python src/jarvis/llm/factory.py (create_llm function)
- Configuration patterns match (baseURL, streaming, defaults)
- Error messages are identical (per D-17)

## Next Steps

**Immediate (Plan 15-03):**
- Implement capability detection (vision support, streaming, function calling)
- Add version validation for @langchain/core peer dependency
- Add startup health checks

**Follow-up (Phase 17):**
- Implement ChatSession using createLLM()
- Add retry logic on connection failures
- Implement provider fallback/routing

## Files Changed

**Created:**
- `apps/backend-ts/src/llm/errors.ts` (26 lines) — Custom error classes
- `apps/backend-ts/src/llm/factory.ts` (75 lines) — createLLM() factory function
- `apps/backend-ts/src/llm/factory.test.ts` (118 lines) — 7 integration/unit tests

**Modified:**
None

## Self-Check: PASSED

✅ All created files exist:
```bash
$ ls apps/backend-ts/src/llm/
config.test.ts  config.ts  errors.ts  factory.test.ts  factory.ts  types.ts
```

✅ All commits exist:
```bash
$ git log --oneline --all -3 | grep 15-02
e6f020a ✅ test(15-02): add factory integration tests
f5f77c5 ✨ feat(15-02): implement createLLM factory function
6413789 ✨ feat(15-02): create LLM error classes
```

✅ All tests pass:
```bash
$ pnpm test src/llm/ --run
Test Files  3 passed (3)
Tests  21 passed (21)
```

✅ TypeScript compiles without errors:
```bash
$ npx tsc --noEmit
(no output = success)
```

## Commits

| Hash | Type | Description | Files |
|------|------|-------------|-------|
| `6413789` | feat | Create LLM error classes | errors.ts |
| `f5f77c5` | feat | Implement createLLM factory function | factory.ts |
| `e6f020a` | test | Add factory integration tests | factory.test.ts |

**Total:** 3 commits, 3 files, 219 lines of code, 7 tests

---

**Plan Status:** ✅ COMPLETE
**Phase Status:** 2 of 3 plans complete
**Next Plan:** 15-03-PLAN.md (Capability Detection & Version Validation)
