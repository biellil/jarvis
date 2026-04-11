---
phase: 15-multi-llm-factory-langchain-integration
plan: 01
subsystem: llm
tags: [langchain, config-validation, zod, typescript]
dependency_graph:
  requires: []
  provides: [llm-config, llm-types]
  affects: [backend-ts]
tech_stack:
  added: ["@langchain/core@1.1.39", "@langchain/openai@1.4.3", "@langchain/anthropic@1.3.26", "zod@4.3.6"]
  patterns: [zod-validation, type-safe-config, process-env-validation]
key_files:
  created:
    - apps/backend-ts/src/llm/types.ts
    - apps/backend-ts/src/llm/config.ts
    - apps/backend-ts/src/llm/config.test.ts
  modified:
    - apps/backend-ts/package.json
decisions:
  - "Use Zod for runtime validation instead of io-ts for simpler API and better TypeScript integration"
  - "Use z.coerce.number() for BACKEND_TS_PORT to handle string-to-number conversion from process.env"
  - "Default LLM_PROVIDER to 'lmstudio' for privacy-first approach (parity with Python)"
  - "Config validation exits with process.exit(1) on invalid config (fail-fast startup pattern)"
  - "LangChain.js 1.x chosen over 0.3.x (0.3.x entered maintenance mode Nov 2025)"
metrics:
  duration: 7 minutes
  tasks: 3
  files: 4
  tests: 13
  commits: 3
  completed: 2026-04-07T20:53:27Z
---

# Phase 15 Plan 01: Install LangChain.js and Config Validation Summary

**One-liner:** LangChain.js 1.x packages installed with Zod-validated type-safe config layer replicating Python Settings behavior

## What Was Built

Foundation for multi-LLM factory with:
- LangChain.js 1.x core packages (@langchain/core, @langchain/openai, @langchain/anthropic)
- Type-safe LLMProvider union type ('lmstudio' | 'openai' | 'anthropic')
- Zod schema for runtime validation of all LLM-related environment variables
- loadConfig() function with clear error messages and fail-fast behavior
- Comprehensive test coverage (13 tests) validating error handling and defaults

## Implementation Notes

### Task 1: Install LangChain.js packages
**Commit:** `eab2f6b`

Installed LangChain.js 1.x packages matching research-verified versions:
- @langchain/core@1.1.39 (base abstractions, published 2026-03-31)
- @langchain/openai@1.4.3 (OpenAI + LM Studio support, published 2026-04-01)
- @langchain/anthropic@1.3.26 (Claude support, published 2026-03-28)
- zod@4.3.6 (runtime validation, published 2025-11-15)

All packages share compatible @langchain/core version (peer dependency satisfied).

**Key decision:** Used 1.x versions (not 0.3.x from initial CONTEXT.md) — research confirmed 1.x is current LTS, 0.3.x entered maintenance mode Nov 2025.

### Task 2: Create types and config schema
**Commit:** `4b25043`

**Files created:**
- `apps/backend-ts/src/llm/types.ts` — LLMProvider type and LLMConfig interface
- `apps/backend-ts/src/llm/config.ts` — Zod schema with loadConfig() function

**Key patterns implemented:**
1. **Type-safe provider selection:** String literal union prevents typos at compile time
2. **Zod runtime validation:** Validates env vars at startup, generates TypeScript types
3. **Fail-fast behavior:** process.exit(1) on invalid config with clear error messages
4. **Python parity:** Replicates Python Settings class from src/jarvis/config.py

**Zod schema fields:**
- LLM_PROVIDER: enum with default 'lmstudio' (privacy-first)
- LLM_MODEL: optional string
- LM_STUDIO_URL: URL-validated string with default 'http://localhost:1234/v1'
- LM_STUDIO_MODEL: optional string
- OPENAI_API_KEY: optional string
- ANTHROPIC_API_KEY: optional string
- BACKEND_TS_PORT: coerced number with default 8001

**Config validation behavior:**
- Invalid provider → clear error message + exit(1)
- Invalid URL → Zod URL validation error + exit(1)
- Missing optional fields → defaults applied
- String port → coerced to number

### Task 3: Create config tests
**Commit:** `91f535c`

**File created:** `apps/backend-ts/src/llm/config.test.ts`

**Test coverage (13 tests total):**

**envSchema validation (7 tests):**
- ✅ Accepts valid config with all fields
- ✅ Applies default values for missing optional fields
- ✅ Rejects invalid provider
- ✅ Rejects invalid URL format
- ✅ Coerces port string to number
- ✅ Accepts all three valid providers
- ✅ Validates all field types

**loadConfig() behavior (6 tests):**
- ✅ Returns validated config for valid environment
- ✅ Exits with code 1 on invalid provider
- ✅ Exits with code 1 on invalid URL
- ✅ Logs clear error messages on validation failure
- ✅ Uses defaults when environment is empty
- ✅ Does NOT require cloud API keys when provider is lmstudio
- ✅ Does NOT require cloud API keys when provider is openai/anthropic

**Test patterns used:**
- `vi.spyOn(process, 'exit')` to capture exit calls without killing test process
- `vi.spyOn(console, 'error')` to verify error messages logged
- beforeEach/afterEach to reset process.env between tests
- Mock implementation throws error to prevent actual exit

## Verification Results

**Automated verification passed:**
```bash
$ cd apps/backend-ts && pnpm test src/llm/config.test.ts --run
✓ 13 tests passed in 446ms

$ cd apps/backend-ts && npx tsc --noEmit
✓ No TypeScript errors

$ cd apps/backend-ts && pnpm ls @langchain/core @langchain/openai @langchain/anthropic zod --depth=0
✓ All packages installed at correct versions
```

**Must-haves verified:**
- ✅ TypeScript config validation rejects invalid env vars and exits with clear errors
- ✅ LangChain.js packages installed with correct versions (1.x not 0.3.x)
- ✅ Zod schema validates all LLM-related environment variables
- ✅ types.ts exports LLMProvider type and LLMConfig interface
- ✅ config.ts exports loadConfig, envSchema, LLMConfig
- ✅ config.test.ts has 13 tests (>50 line minimum)
- ✅ Zod safeParse validation pattern matches specification

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions

1. **LangChain.js 1.x over 0.3.x**
   - Context: CONTEXT.md referenced "0.3.x" but research found this is outdated
   - Decision: Use 1.x (current LTS) — 0.3.x entered maintenance Nov 2025
   - Impact: All future plans use 1.x API patterns and constructor signatures

2. **z.coerce.number() for BACKEND_TS_PORT**
   - Context: process.env values are always strings; TypeScript expects number
   - Decision: Use Zod's .coerce prefix for automatic type coercion
   - Impact: Config handles both string and number inputs transparently

3. **Fail-fast validation at startup**
   - Context: Python Settings raises error on invalid config
   - Decision: process.exit(1) on validation failure (no silent fallbacks)
   - Impact: Invalid config prevents server startup (fail-fast principle)

4. **Privacy-first default provider**
   - Context: Python defaults to lmstudio (local, no API key)
   - Decision: LLM_PROVIDER defaults to 'lmstudio' in Zod schema
   - Impact: Users must explicitly opt-in to cloud providers

## Known Stubs

None — this plan establishes config layer only, no runtime behavior to stub.

## Integration Points

**Upstream dependencies:**
None — this is the foundation layer

**Downstream consumers (Phase 15 Plans 02-03):**
- Plan 02 (Factory) will import `loadConfig()` and `LLMProvider` type
- Plan 03 (Capabilities) will import `LLMConfig` interface
- All future plans import from `src/llm/config.ts` for validated config

**Python parity:**
- TypeScript config.ts ↔ Python src/jarvis/config.py (Settings class)
- Zod schema ↔ Pydantic BaseSettings validation
- TypeScript union type ↔ Python string pattern validation

## Next Steps

**Immediate (Plan 15-02):**
- Implement createLLM() factory function
- Connect to LM Studio via ChatOpenAI with custom baseURL
- Test LM Studio integration with conditional skip

**Follow-up (Plan 15-03):**
- Implement capability detection (vision, streaming, function calling)
- Add version validation for @langchain/core peer dependency
- Add startup health checks

## Files Changed

**Created:**
- `apps/backend-ts/src/llm/types.ts` (25 lines) — LLMProvider type, LLMConfig interface
- `apps/backend-ts/src/llm/config.ts` (60 lines) — Zod schema, loadConfig() function
- `apps/backend-ts/src/llm/config.test.ts` (235 lines) — 13 tests covering validation and error handling

**Modified:**
- `apps/backend-ts/package.json` — Added 4 dependencies (@langchain/*, zod)

## Self-Check: PASSED

✅ All created files exist:
```bash
$ ls apps/backend-ts/src/llm/
config.test.ts  config.ts  types.ts
```

✅ All commits exist:
```bash
$ git log --oneline --all -4 | grep 15-01
91f535c ✅ test(15-01): add comprehensive config validation tests
4b25043 ✨ feat(15-01): create LLM types and Zod config validation
eab2f6b 🏗️ build(15-01): install LangChain.js 1.x packages
```

✅ All tests pass:
```bash
$ pnpm test src/llm/config.test.ts --run
Test Files  1 passed (1)
Tests  13 passed (13)
```

✅ TypeScript compiles without errors:
```bash
$ npx tsc --noEmit
(no output = success)
```

## Commits

| Hash | Type | Description | Files |
|------|------|-------------|-------|
| `eab2f6b` | build | Install LangChain.js 1.x packages | package.json, pnpm-lock.yaml |
| `4b25043` | feat | Create LLM types and Zod config validation | types.ts, config.ts |
| `91f535c` | test | Add comprehensive config validation tests | config.test.ts |

**Total:** 3 commits, 4 files, 320 lines of code, 13 tests

---

**Plan Status:** ✅ COMPLETE
**Phase Status:** 1 of 3 plans complete
**Next Plan:** 15-02-PLAN.md (Multi-LLM Factory Implementation)
