---
phase: 36-memory-writer
plan: P01
type: tdd
wave: 1
depends_on: []
files_modified:
  - apps/backend-ts/src/memory/extractor.ts
  - apps/backend-ts/test/memory/extractor.test.ts
autonomous: true
requirements: [MEMW-01, MEMW-02, MEMW-03, MTYPE-01, MTYPE-02, MTYPE-03, MTYPE-04]

must_haves:
  truths:
    - "MemoryExtractor.extractMemories() returns a typed Extraction[] validated against the Zod discriminated union"
    - "Extraction failure (LLM error, invalid JSON, Zod rejection) returns [] and logs a warn — never throws"
    - "Extraction schema enforces exactly three types: semantic | episodic | procedural"
    - "The module exports extractionSchema and Extraction type for downstream consumers"
  artifacts:
    - path: "apps/backend-ts/src/memory/extractor.ts"
      provides: "MemoryExtractor class + extractionSchema Zod discriminated union"
      exports: ["MemoryExtractor", "extractionSchema", "Extraction"]
    - path: "apps/backend-ts/test/memory/extractor.test.ts"
      provides: "Unit tests for extraction, schema, error handling"
  key_links:
    - from: "apps/backend-ts/src/memory/extractor.ts"
      to: "@langchain/core/language_models/chat_models"
      via: "BaseChatModel.withStructuredOutput(extractionSchema)"
      pattern: "withStructuredOutput"
    - from: "apps/backend-ts/src/memory/extractor.ts"
      to: "zod"
      via: "z.discriminatedUnion('type', [...])"
      pattern: "discriminatedUnion"
---

<objective>
Create the MemoryExtractor class with a Zod discriminated union schema. This is the core extraction engine for Phase 36 — it wraps any LangChain BaseChatModel with `withStructuredOutput()` to guarantee that LLM output is always a typed Extraction[] before touching any database.

Purpose: Establish the extraction contract before building the persistence layer (Plan P02) or the call-site wiring (Plan P03). Tests define the expected behavior first (TDD RED), then the implementation makes them green.

Output: `extractor.ts` exporting MemoryExtractor + extractionSchema + Extraction type. Tests covering happy path, schema enforcement, and silent error handling.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/35-schema-type-foundation/35-P02-SUMMARY.md

# Source files the executor must understand before writing extractor.ts
@apps/backend-ts/src/memory/store.ts
@apps/backend-ts/src/memory/vectors.ts
@apps/backend-ts/test/memory/store-typed.test.ts
</context>

<interfaces>
<!-- Key types the executor needs. Extracted from Phase 35 artifacts. -->

From apps/backend-ts/src/memory/store.ts:
```typescript
export interface TypedMemoryEntry {
  id: string;
  conversationId: number;
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  confidence?: number;
  extractedAt: string;
  sourceId?: number;
  source?: string;
  createdAt: string;
}
```

From @langchain/core (already in package.json):
```typescript
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
// BaseChatModel.withStructuredOutput(schema) returns a Runnable that calls the LLM
// and validates output against the Zod schema (tool_use or json_mode depending on provider)
```

From zod 4.3.6 (already in package.json):
```typescript
import { z } from 'zod';
// z.discriminatedUnion('type', [...]) — discriminator is 'type' field (first field in each branch)
// z.literal('semantic') | z.literal('episodic') | z.literal('procedural')
// z.infer<typeof schema> — derives TypeScript type from Zod schema
```
</interfaces>

<tasks>

<task type="tdd">
  <name>Task 1 (RED): Write failing test stubs for MemoryExtractor</name>
  <files>apps/backend-ts/test/memory/extractor.test.ts</files>
  <read_first>
    - apps/backend-ts/test/memory/store-typed.test.ts (test file pattern: imports, describe/it structure, beforeEach setup)
    - apps/backend-ts/vitest.config.ts (test config: globals=true, root=".")
    - apps/backend-ts/src/memory/store.ts (TypedMemoryEntry interface for type reference)
  </read_first>
  <behavior>
    - Test 1: MemoryExtractor class can be instantiated with a mock LLM that has withStructuredOutput()
    - Test 2: extractMemories() returns [] when mocked LLM returns an empty array
    - Test 3: extractMemories() returns a valid Extraction[] when mocked LLM returns { type: 'semantic', content: 'User prefers dark mode', confidence: 0.9 }
    - Test 4: extractMemories() returns a valid Extraction[] when mocked LLM returns { type: 'episodic', content: 'Discussed login bug', confidence: 0.7 }
    - Test 5: extractMemories() returns a valid Extraction[] when mocked LLM returns { type: 'procedural', content: 'To reset WiFi: Settings → Network', confidence: 0.8 }
    - Test 6: extractMemories() returns [] and does NOT throw when mocked LLM throws an Error
    - Test 7: extractionSchema validates { type: 'semantic', content: 'x'.repeat(10), confidence: 0.8 } passes
    - Test 8: extractionSchema rejects { type: 'unknown', content: 'foo', confidence: 0.5 } (invalid discriminator)
    - Test 9: extractionSchema rejects { type: 'semantic', content: 'short', confidence: 0.8 } (content.length < 10, min=10)
    - Test 10: extractionSchema rejects { type: 'semantic', content: 'valid content here', confidence: 1.5 } (confidence > 1)
  </behavior>
  <action>
    Create `apps/backend-ts/test/memory/extractor.test.ts` with failing stubs. The file does NOT yet import from extractor.ts (file doesn't exist) — import will be added to make tests compile.

    File header:
    ```
    /**
     * Tests for MemoryExtractor — Phase 36-P01 (MEMW-01, MEMW-02, MEMW-03, MTYPE-01..04)
     */
    ```

    Import pattern (matches store-typed.test.ts conventions):
    ```typescript
    import { describe, it, expect, vi } from 'vitest';
    import { z } from 'zod';
    import { MemoryExtractor, extractionSchema, type Extraction } from '../../src/memory/extractor.js';
    ```

    Mock LLM pattern — create a mock BaseChatModel-like object using vi.fn():
    ```typescript
    function makeMockLlm(returnValue: unknown) {
      const runnable = { invoke: vi.fn().mockResolvedValue(returnValue) };
      return {
        withStructuredOutput: vi.fn().mockReturnValue(runnable),
      } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;
    }
    ```

    Test group 1 — MemoryExtractor behavior (6 tests):
    - `describe('MemoryExtractor', () => { ... })`
    - Test 1: `it('can be instantiated', () => { ... })` — calls `new MemoryExtractor(mockLlm)` and expects no throw
    - Test 2: `it('returns [] when LLM returns empty array', async () => { ... })` — mockLlm returns [], extractMemories returns []
    - Test 3: `it('returns semantic extraction', async () => { ... })` — checks returned[0].type === 'semantic'
    - Test 4: `it('returns episodic extraction', async () => { ... })` — checks returned[0].type === 'episodic'
    - Test 5: `it('returns procedural extraction', async () => { ... })` — checks returned[0].type === 'procedural'
    - Test 6: `it('returns [] and does not throw on LLM error', async () => { ... })` — mockLlm.invoke throws; extractMemories returns []

    Test group 2 — extractionSchema validation (4 tests):
    - `describe('extractionSchema', () => { ... })`
    - Tests 7-10 as listed in behavior using `extractionSchema.safeParse(...)` and checking `.success` true/false

    Run command after writing: `cd apps/backend-ts && npx vitest run test/memory/extractor.test.ts 2>&1 | tail -20`
    EXPECTED: tests FAIL (extractor.ts does not exist yet). Commit: `✅ test(36-P01): add failing tests for MemoryExtractor`
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/memory/extractor.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/backend-ts/test/memory/extractor.test.ts` exists
    - File contains `import { MemoryExtractor, extractionSchema` (grep verifiable)
    - File contains exactly 10 `it(` test declarations (grep -c "  it(" returns 10)
    - Tests FAIL with "Cannot find module '../../src/memory/extractor.js'" or similar import error (RED phase confirmed)
  </acceptance_criteria>
  <done>10 failing test stubs committed for MemoryExtractor and extractionSchema. Import error confirms RED state — extractor.ts does not yet exist.</done>
</task>

<task type="tdd">
  <name>Task 2 (GREEN): Implement extractor.ts to pass all tests</name>
  <files>apps/backend-ts/src/memory/extractor.ts</files>
  <read_first>
    - apps/backend-ts/test/memory/extractor.test.ts (the failing tests — implement exactly what they expect)
    - apps/backend-ts/src/memory/store.ts (TypedMemoryEntry for type cross-reference)
    - apps/backend-ts/src/memory/vectors.ts (style reference: error handling pattern, console.warn format)
    - apps/backend-ts/src/memory/consistency.ts (import style reference: type-only imports, JSDoc format)
  </read_first>
  <behavior>
    - extractionSchema: Zod discriminatedUnion('type', [...]) with 3 branches
    - Each branch: z.object({ type: z.literal(...), content: z.string().min(10).max(500), confidence: z.number().min(0).max(1) })
    - Extraction type: z.infer<typeof extractionSchema>
    - MemoryExtractor constructor: takes BaseChatModel, assigns `this.structuredLlm = llm.withStructuredOutput(extractionSchema)`
    - extractMemories(): invokes this.structuredLlm, normalizes array vs single object, catches ALL errors and returns []
  </behavior>
  <action>
    Create `apps/backend-ts/src/memory/extractor.ts` with this exact content:

    ```typescript
    /**
     * MemoryExtractor — Phase 36-P01 (MEMW-01, MEMW-02, MEMW-03, MTYPE-01..04)
     *
     * Wraps any LangChain BaseChatModel with withStructuredOutput() + Zod discriminated union
     * to guarantee type-safe extraction. LLM output is validated server-side before any
     * database write.
     *
     * Error handling: all errors are caught and logged (MEMW-03 parity) — never throws.
     */
    import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
    import { HumanMessage } from '@langchain/core/messages';
    import { z } from 'zod';

    /**
     * Discriminated union for memory extraction output.
     * Discriminator field is 'type' — must appear first in each branch for LLM clarity.
     */
    export const extractionSchema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('semantic'),
        content: z
          .string()
          .min(10)
          .max(500)
          .describe(
            'Stable user fact or preference that persists across sessions. Example: "Biel prefers direct answers"',
          ),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('0.0–1.0 confidence in this extraction; 0.8+ recommended for semantic'),
      }),
      z.object({
        type: z.literal('episodic'),
        content: z
          .string()
          .min(10)
          .max(500)
          .describe(
            'Timestamped event, decision, or statement from this conversation. Example: "User reported a bug in login flow"',
          ),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('Confidence in event extraction; lower thresholds OK for episodic'),
      }),
      z.object({
        type: z.literal('procedural'),
        content: z
          .string()
          .min(10)
          .max(500)
          .describe(
            'How-to, workaround, or problem-solving flow. Example: "To reset WiFi: Settings → Network → Reset"',
          ),
        confidence: z.number().min(0).max(1),
      }),
    ]);

    export type Extraction = z.infer<typeof extractionSchema>;

    const EXTRACTION_PROMPT = `You are an expert at extracting key facts and events from conversations.

    Given a user message and JARVIS's response, extract 1-3 memories that are:
    - **semantic**: Stable facts about the user's preferences, work, or situation (e.g., "uses TypeScript", "prefers concise answers")
    - **episodic**: Specific events, decisions, or problems mentioned (e.g., "reported bug in login", "discussed architecture yesterday")
    - **procedural**: How-tos, workflows, or solutions (e.g., "to reset the device, hold power for 10s")

    Return an array of extracted memories. Each must have type, content (10-500 chars), and confidence (0.0-1.0).
    If no memories are worth extracting, return an empty array.

    User message: {userText}
    Assistant response: {assistantText}`;

    export class MemoryExtractor {
      private readonly structuredLlm: {
        invoke: (messages: HumanMessage[]) => Promise<unknown>;
      };

      constructor(llm: BaseChatModel) {
        // Enforce structured output — LLM must return JSON matching extractionSchema
        this.structuredLlm = llm.withStructuredOutput(extractionSchema) as {
          invoke: (messages: HumanMessage[]) => Promise<unknown>;
        };
      }

      /**
       * Extract 0-3 typed memories from a conversation turn.
       * Returns [] on any error (MEMW-03: silent failure, log only).
       */
      async extractMemories(userText: string, assistantText: string): Promise<Extraction[]> {
        try {
          const prompt = EXTRACTION_PROMPT.replace('{userText}', userText).replace(
            '{assistantText}',
            assistantText,
          );
          const result = await this.structuredLlm.invoke([new HumanMessage(prompt)]);

          if (Array.isArray(result)) {
            return result as Extraction[];
          } else if (result !== null && result !== undefined && typeof result === 'object' && 'type' in result) {
            return [result as Extraction];
          } else {
            return [];
          }
        } catch (err) {
          console.warn(`[extractor] extractMemories failed: ${(err as Error).message}`);
          return [];
        }
      }
    }
    ```

    After writing, run tests:
    `cd apps/backend-ts && npx vitest run test/memory/extractor.test.ts 2>&1 | tail -20`
    EXPECTED: all 10 tests PASS.
    Commit: `✨ feat(36-P01): implement MemoryExtractor + Zod extraction schema`
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/memory/extractor.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/backend-ts/src/memory/extractor.ts` exists
    - File contains `export const extractionSchema = z.discriminatedUnion('type'` (grep verifiable)
    - File contains `export type Extraction = z.infer<typeof extractionSchema>` (grep verifiable)
    - File contains `export class MemoryExtractor` (grep verifiable)
    - File contains `llm.withStructuredOutput(extractionSchema)` (grep verifiable)
    - File contains `console.warn(\`[extractor] extractMemories failed` (grep verifiable — MEMW-03 silent failure)
    - `cd apps/backend-ts && npx vitest run test/memory/extractor.test.ts` exits 0 with 10 tests passing
  </acceptance_criteria>
  <done>All 10 tests passing. extractor.ts exports MemoryExtractor, extractionSchema, Extraction. RED→GREEN cycle complete.</done>
</task>

</tasks>

<verification>
After both tasks complete:
- `cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/memory/extractor.test.ts` exits 0 with 10/10 passing
- `grep -n "export class MemoryExtractor\|export const extractionSchema\|export type Extraction" apps/backend-ts/src/memory/extractor.ts` returns 3 lines
- `grep -n "withStructuredOutput" apps/backend-ts/src/memory/extractor.ts` returns at least 1 line
- `grep -c "  it(" apps/backend-ts/test/memory/extractor.test.ts` returns 10
</verification>

<success_criteria>
- extractor.ts exists and exports MemoryExtractor, extractionSchema, Extraction
- MemoryExtractor.extractMemories() returns typed Extraction[] or [] on any error (never throws)
- extractionSchema enforces the discriminated union — invalid types and out-of-range values are rejected
- All 10 unit tests pass
- 2 atomic commits: RED (test stubs) + GREEN (implementation)
</success_criteria>

<output>
After completion, create `.planning/phases/36-memory-writer/36-P01-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`
</output>
