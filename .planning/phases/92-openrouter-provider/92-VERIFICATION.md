---
phase: 92-openrouter-provider
verified: 2026-06-10T12:35:00Z
status: passed
score: 5/5 truths verified (OPENR-01 explicitly deferred to Phase 93+)
re_verification: false
gaps:
  - truth: "User can select openrouter in /config LLM provider menu"
    status: failed
    reason: "OPENR-01 requirement explicitly marked as deferred to Phase 93+ in REQUIREMENTS.md. No UI endpoint to list/select OpenRouter in /config menu exists."
    artifacts:
      - path: "apps/desktop-py or gateway (TBD in Phase 93)"
        issue: "No /config menu implementation for openrouter provider selection"
    missing:
      - "/config endpoint that includes openrouter in LLM_PROVIDER enum options"
      - "Frontend /config menu UI component that displays openrouter alongside lmstudio/openai/anthropic/gemini"
---

# Phase 92: OpenRouter Provider Verification Report

**Phase Goal:** Add OpenRouter as an LLM provider option in the TypeScript backend so users can route requests through the OpenRouter aggregator API.

**Verified:** 2026-06-10T12:35:00Z

**Status:** gaps_found

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                       | Status     | Evidence                                                              |
| --- | --------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| 1   | Setting LLM_PROVIDER=openrouter in .env selects OpenRouter without code changes | ✓ VERIFIED | types.ts line 10 has 'openrouter' in union; config.ts line 14 accepts it in Zod enum |
| 2   | Free-tier models (:free suffix) work without OPENROUTER_API_KEY set | ✓ VERIFIED | factory.ts line 103: `apiKey: cfg.OPENROUTER_API_KEY \|\| 'free-tier'` — OpenRouter accepts any non-empty string for free tier |
| 3   | Missing LLM_MODEL when provider=openrouter throws LLMConfigError at startup | ✓ VERIFIED | factory.ts lines 93-97 throw LLMConfigError with descriptive hint when LLM_MODEL empty |
| 4   | Any model name (free or paid) passes through to ChatOpenAI unchanged | ✓ VERIFIED | factory.ts line 104: `model: cfg.LLM_MODEL` — no validation, passes directly to ChatOpenAI |
| 5   | User can select openrouter in /config LLM provider menu | ✗ FAILED  | OPENR-01 marked as deferred to Phase 93+ in REQUIREMENTS.md (line 104); no /config endpoint exists |
| 6   | 429 rate-limit exhaustion surfaces as a chat message, not a crash or silent stall | ✓ VERIFIED | factory.ts lines 121-126 catch status===429 and return AIMessage with user-facing explanation |

**Score:** 5/6 truths verified (1 blocked by external requirement deferral)

### Required Artifacts

| Artifact                                         | Expected                                                      | Status      | Details                                                           |
| ------------------------------------------------ | ------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| `apps/backend-ts/src/llm/types.ts` line 10      | LLMProvider union including 'openrouter'                      | ✓ VERIFIED  | `'lmstudio' \| 'openai' \| 'anthropic' \| 'gemini' \| 'openrouter'` |
| `apps/backend-ts/src/llm/types.ts` line 27      | OPENROUTER_API_KEY field in LLMConfig interface              | ✓ VERIFIED  | `OPENROUTER_API_KEY?: string;`                                     |
| `apps/backend-ts/src/llm/config.ts` line 14     | Zod enum with 'openrouter'                                    | ✓ VERIFIED  | `z.enum(['lmstudio', 'openai', 'anthropic', 'gemini', 'openrouter'])` |
| `apps/backend-ts/src/llm/config.ts` line 38     | OPENROUTER_API_KEY in Zod schema                              | ✓ VERIFIED  | `OPENROUTER_API_KEY: z.string().optional().default('')`            |
| `apps/backend-ts/src/llm/factory.ts` lines 92-133 | openrouter case in createLLM switch                           | ✓ VERIFIED  | case block with ChatOpenAI baseURL, free-tier support, 429 handling |
| `apps/backend-ts/src/llm/capabilities.ts` lines 74-80 | OpenRouter entry in capability matrix                        | ✓ VERIFIED  | `capabilities.openrouter = { streaming: true, vision: false, functionCalling: true }` |
| `.env.example` lines 29-35                      | Documented OPENROUTER_API_KEY and example free-tier model    | ✓ VERIFIED  | OpenRouter section with free-tier example and paid-tier note       |

All required artifacts present and substantive (not stubs).

### Key Link Verification

| From                                           | To                              | Via                                                    | Status      | Details                                           |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------------------ | ----------- | ------------------------------------------------- |
| `config.ts` enum                               | `types.ts` LLMProvider union    | Manual duplicate sync (both include 'openrouter')     | ✓ WIRED     | types.ts line 10 and config.ts line 14 both have 'openrouter' |
| `factory.ts` case 'openrouter'                 | `https://openrouter.ai/api/v1` | ChatOpenAI baseURL configuration                      | ✓ WIRED     | factory.ts line 101: `baseURL: 'https://openrouter.ai/api/v1'` |
| `factory.ts` openrouter case                   | types.ts LLMProvider            | selectedProvider switch dispatch                      | ✓ WIRED     | factory.ts line 92: `case 'openrouter':` matches union type |
| `index.ts` bootstrap                           | factory.ts createLLM()          | Direct function call                                  | ✓ WIRED     | index.ts line 66: `const llm = createLLM();` — reads config.LLM_PROVIDER from env |
| `factory.ts` openrouter invoke wrapper         | ChatOpenAI.invoke()             | Method override with try/catch                        | ✓ WIRED     | factory.ts lines 111-130: Original invoke bound, wrapped, reassigned |
| `capabilities.ts` detectCapabilities()         | config.ts LLMConfig             | Type parameter and conditional check                  | ✓ WIRED     | capabilities.ts line 74: checks `config.OPENROUTER_API_KEY` to detect openrouter |

All wiring verified — data flows correctly from config → factory → capabilities.

### Data-Flow Trace (Level 4)

| Artifact                                        | Data Variable               | Source                           | Produces Real Data | Status      |
| ----------------------------------------------- | --------------------------- | -------------------------------- | ------------------ | ----------- |
| `factory.ts` createLLM('openrouter', config)   | N/A — factory, not rendering | Environment config + .env override | N/A — factory only | ✓ VERIFIED  |
| `capabilities.ts` openrouter block              | capabilities.openrouter object | Conditional detection logic      | ✓ Hardcoded but correct | ✓ VERIFIED |

Factory is a pure function that returns a BaseChatModel; no dynamic rendering. Capabilities detection returns hardcoded values appropriate for OpenRouter (streaming: true, vision: false — conservative, functionCalling: true). Data flows from config → factory → returned ChatOpenAI instance → backend conversation graph.

### Behavioral Spot-Checks

| Behavior                                                      | Command                                                                           | Result       | Status      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------ | ----------- |
| createLLM accepts 'openrouter' provider and returns BaseChatModel | `cd apps/backend-ts && npm test -- src/llm/factory.test.ts` (OpenRouter block) | 6/6 passing  | ✓ PASS      |
| Zod schema validates 'openrouter' in LLM_PROVIDER enum       | `cd apps/backend-ts && npm test -- src/llm/config.test.ts` (openrouter provider) | 3/3 passing  | ✓ PASS      |
| LLMProvider type includes 'openrouter'                       | `cd apps/backend-ts && npm test -- src/llm/types.test.ts` (openrouter union)     | 2/2 passing  | ✓ PASS      |
| Full LLM suite (56 tests) passes without regressions         | `cd apps/backend-ts && npm run test -- src/llm/`                                 | 56/56 passing | ✓ PASS     |
| Free-tier flow (no API key) executes without errors          | factory.test.ts "succeeds without OPENROUTER_API_KEY"                           | ✓ PASS       | ✓ PASS      |
| LLM_MODEL required validation works                          | factory.test.ts "throws LLMConfigError when LLM_MODEL is empty"                   | ✓ PASS       | ✓ PASS      |

### Requirements Coverage

| Requirement | Phase | Plan | Status              | Evidence                                                  |
| ----------- | ----- | ---- | ------------------- | --------------------------------------------------------- |
| OPENR-01    | 92    | -    | ✗ DEFERRED (Phase 93+) | Marked as deferred in REQUIREMENTS.md line 104; no /config endpoint exists |
| OPENR-02    | 92    | 01   | ✓ SATISFIED         | factory.ts createLLM('openrouter') returns ChatOpenAI baseURL pattern |
| OPENR-03    | 92    | 01   | ✓ SATISFIED         | Free-tier support via optional OPENROUTER_API_KEY with 'free-tier' fallback |
| OPENR-04    | 92    | 01   | ✓ SATISFIED         | Any model name accepted and passed unchanged to ChatOpenAI |

**Traceability:** OPENR-01 is explicitly marked as deferred in REQUIREMENTS.md (line 104: "Phase 93+ | Deferred"). Plans 01 and 02 claimed OPENR-02, OPENR-03, OPENR-04 — all three are satisfied. No mismatch.

### Anti-Patterns Found

| File                                           | Line(s) | Pattern        | Severity | Impact                                                       |
| ---------------------------------------------- | ------- | -------------- | -------- | ------------------------------------------------------------ |
| None detected across modified files            | —       | —              | —        | All code is substantive (no TODO, FIXME, hardcoded placeholders) |

### Human Verification Required

No additional human testing required. Phase 92 is complete as defined:
- Plan 01: Implementation (types, config, factory, capabilities, .env) ✓
- Plan 02: Test coverage (factory, config, types tests) ✓

OPENR-01 (user UI to select openrouter in /config menu) is explicitly deferred to Phase 93+ and is outside the scope of Phase 92.

### Gaps Summary

**1 Gap Found — Non-Blocking (External Deferral)**

**Truth:** "User can select openrouter in /config LLM provider menu"
- **Status:** Not implemented — OPENR-01 is explicitly deferred to Phase 93+ in REQUIREMENTS.md (line 104)
- **Why:** Phase 92 scope is TypeScript backend only (types, config, factory, capabilities, tests). Frontend /config UI menu is out of scope.
- **Impact:** Phase 92 goal is fully achieved at the backend level. Users must currently set LLM_PROVIDER=openrouter manually in .env. No code change needed — this is planned for Phase 93.

**All other must-haves (5/5 truths + data wiring + tests) are verified and working.**

---

## Verification Summary

**Phase 92: OpenRouter Provider — Backend Implementation COMPLETE**

Phase goal: "Add OpenRouter as an LLM provider option in the TypeScript backend so users can route requests through the OpenRouter aggregator API."

✓ **ACHIEVED:** Users can set LLM_PROVIDER=openrouter in .env and route chat requests through OpenRouter.

✓ **Artifacts:** All 7 required artifacts present, substantive, and wired.

✓ **Tests:** 56 LLM tests pass (including 11 new openrouter-specific tests).

✓ **Wiring:** Config → Factory → Capabilities → Main bootstrap all connected correctly.

✓ **Data Flow:** Environment config flows through Zod validation → factory dispatch → ChatOpenAI instantiation → returned to bootstrap and used for conversation graph.

✗ **OPENR-01 (UI selection in /config menu):** Deferred to Phase 93+ per requirements traceability. Not in Phase 92 scope.

---

_Verified: 2026-06-10T12:35:00Z_
_Verifier: Claude (gsd-verifier)_
