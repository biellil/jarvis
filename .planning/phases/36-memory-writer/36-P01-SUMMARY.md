---
phase: 36-memory-writer
plan: P01
subsystem: memory
tags: [zod, langchain, llm, extraction, discriminated-union, tdd]

requires:
  - phase: 35-schema-type-foundation
    provides: TypedMemoryEntry interface, typed_memories Drizzle schema, MemoryStore typed methods

provides:
  - MemoryExtractor class wrapping BaseChatModel with withStructuredOutput(extractionSchema)
  - extractionSchema: Zod discriminatedUnion('type') enforcing semantic | episodic | procedural
  - Extraction type: z.infer<typeof extractionSchema>
  - Silent-failure contract: extractMemories() returns [] on any LLM error (MEMW-03)

affects: [36-P02-writer, 36-P03-wiring, 37-context-builder]

tech-stack:
  added: []
  patterns:
    - "withStructuredOutput(schema): LangChain structured output binding for type-safe LLM responses"
    - "Zod discriminatedUnion for memory type enforcement at schema level"
    - "Silent-failure pattern: catch all errors, console.warn, return []"

key-files:
  created:
    - apps/backend-ts/src/memory/extractor.ts
    - apps/backend-ts/test/memory/extractor.test.ts
  modified: []

key-decisions:
  - "extractionSchema uses Zod discriminatedUnion('type') — discriminator is first field in each branch for LLM prompt clarity"
  - "MemoryExtractor.extractMemories() normalises both array and single-object LLM responses for provider flexibility"
  - "content min(10) enforced at schema level — prevents trivially short extractions from polluting memory"

patterns-established:
  - "TDD RED/GREEN cycle: test file committed first with import error, then implementation makes all 10 tests pass"
  - "withStructuredOutput pattern: constructor binds structured LLM once, extractMemories() calls invoke()"

requirements-completed: [MEMW-01, MEMW-02, MEMW-03, MTYPE-01, MTYPE-02, MTYPE-03, MTYPE-04]

duration: 15min
completed: 2026-04-19
---

# Phase 36 Plan P01: Memory Extractor Summary

**Zod discriminatedUnion extraction schema + MemoryExtractor class wrapping LangChain BaseChatModel.withStructuredOutput() — 10 TDD tests passing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-19T12:15:00Z
- **Completed:** 2026-04-19T12:17:30Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2

## Accomplishments

- extractionSchema Zod discriminatedUnion enforcing exactly three types: semantic, episodic, procedural — with content min(10)/max(500) and confidence min(0)/max(1)
- MemoryExtractor class wrapping any LangChain BaseChatModel via withStructuredOutput(extractionSchema) — guarantees typed output before any DB write
- extractMemories() normalises array vs single-object LLM responses and returns [] on any error (never throws — MEMW-03)
- 10 unit tests covering happy path (3 types), empty response, error silencing, and 4 schema validation edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Write failing test stubs for MemoryExtractor** - `92340ef` (test)
2. **Task 2: GREEN — Implement extractor.ts to pass all tests** - `d53d9d9` (feat)

_Note: TDD tasks — test stub committed first (RED), then implementation (GREEN)_

## Files Created/Modified

- `apps/backend-ts/src/memory/extractor.ts` - MemoryExtractor class + extractionSchema Zod discriminated union + Extraction type
- `apps/backend-ts/test/memory/extractor.test.ts` - 10 unit tests: 6 behavior + 4 schema validation

## Decisions Made

- extractionSchema uses `z.discriminatedUnion('type', [...])` with `type` as first field in each branch — ensures the LLM's structured output discriminator is clear
- MemoryExtractor constructor binds `llm.withStructuredOutput(extractionSchema)` once — reused across all extractMemories() calls
- extractMemories() handles both array and single-object LLM responses for compatibility with different provider behaviours (tool_use vs json_mode)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed async test pattern for error-handling test**

- **Found during:** Task 2 (GREEN — running all 10 tests)
- **Issue:** Test 6 used `await expect(async () => { result = ... }).not.toThrow()` — the async callback result variable was `undefined` because vitest's not.toThrow() doesn't await async callbacks properly
- **Fix:** Changed to direct `const result = await extractor.extractMemories(...)` followed by `expect(result).toEqual([])`
- **Files modified:** apps/backend-ts/test/memory/extractor.test.ts
- **Verification:** 10/10 tests now pass
- **Committed in:** `d53d9d9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test pattern)
**Impact on plan:** Test semantics corrected; still validates the same behavior (no throw, returns []). No scope creep.

## Issues Encountered

None — implementation matched plan exactly. Deviation was in the test file, not the implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- extractor.ts exports are ready for Plan P02 (persistence writer) to import MemoryExtractor + Extraction type
- extractionSchema and Extraction type available for downstream schema cross-referencing
- Silent-failure contract established — P02 writer can safely call extractMemories() without try/catch

---
*Phase: 36-memory-writer*
*Completed: 2026-04-19*
