---
phase: 36-memory-writer
plan: P03
type: execute
wave: 3
depends_on: [36-P01, 36-P02]
files_modified:
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/index.ts
  - apps/backend-ts/test/session/extraction-wiring.test.ts
autonomous: true
requirements: [MEMW-01, MEMW-03, REL-01]

must_haves:
  truths:
    - "After ChatSession.send() returns, _extractAndWriteMemories() runs in background without blocking the caller"
    - "After ChatSession.sendStream() drains, _extractAndWriteMemories() runs in background without blocking the generator"
    - "The call sites always use void context — no await on the extraction call path"
    - "MemoryManager is constructed with the llm option in index.ts ChatSession.create() call"
    - "Extraction failure never surfaces to the user — only a console.warn appears"
  artifacts:
    - path: "apps/backend-ts/src/session/chat-session.ts"
      provides: "_extractAndWriteMemories() private method + void call in send() + void call in sendStream()"
      contains: "void this._extractAndWriteMemories"
    - path: "apps/backend-ts/src/index.ts"
      provides: "MemoryManager constructed with llm option"
      contains: "llm:"
    - path: "apps/backend-ts/test/session/extraction-wiring.test.ts"
      provides: "Tests for fire-and-forget behavior and silent failure"
  key_links:
    - from: "apps/backend-ts/src/session/chat-session.ts"
      to: "apps/backend-ts/src/memory/extractor.ts"
      via: "import { MemoryExtractor } from '../memory/extractor.js'"
      pattern: "MemoryExtractor"
    - from: "apps/backend-ts/src/session/chat-session.ts"
      to: "apps/backend-ts/src/memory/manager.ts"
      via: "this.memory.saveTypedMemory(this._convId, extraction)"
      pattern: "saveTypedMemory"
    - from: "apps/backend-ts/src/session/chat-session.ts"
      to: "void this._extractAndWriteMemories"
      via: "fire-and-forget at end of send() and sendStream()"
      pattern: "void this._extractAndWriteMemories"
---

<objective>
Wire the fire-and-forget extraction into ChatSession.send() and sendStream(), and pass the llm to MemoryManager in index.ts. This is the final integration step — extraction now runs automatically after every LLM response without ever blocking the voice pipeline.

Purpose: Complete the REL-01 requirement. The extraction pipeline is invisible to the user: voice response returns immediately, extraction runs in background, failures only appear in logs.

Output: chat-session.ts with _extractAndWriteMemories() private method + void call sites. index.ts with llm wired into MemoryManager constructor. Tests proving the fire-and-forget behavior.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-memory-writer/36-P01-SUMMARY.md
@.planning/phases/36-memory-writer/36-P02-SUMMARY.md

@apps/backend-ts/src/session/chat-session.ts
@apps/backend-ts/src/index.ts
@apps/backend-ts/src/memory/extractor.ts
@apps/backend-ts/src/memory/manager.ts
@apps/backend-ts/test/session/chat-session-stream.test.ts
</context>

<interfaces>
<!-- Key contracts the executor needs for wiring. -->

From apps/backend-ts/src/session/chat-session.ts (existing):
```typescript
export class ChatSession {
  public history: BaseMessage[];
  private readonly llm: BaseChatModel;   // already exists — pass to MemoryExtractor
  private readonly memory: MemoryManager;
  private readonly _convId: number | null;
  // ...

  // send() returns finalText AFTER saveTurn. Wire void extraction AFTER the saveTurn try/catch.
  async send(text: string): Promise<string> {
    // ... agent.invoke, history update, extractFinalAiText, saveTurn try/catch ...
    // ADD HERE: void this._extractAndWriteMemories(text, finalText);
    return finalText;
  }

  // sendStream() yields tokens then awaits saveTurn. Wire void extraction AFTER the saveTurn try/catch.
  async *sendStream(text: string): AsyncGenerator<string, void, unknown> {
    // ... stream, assemble, push AIMessage, saveTurn try/catch ...
    // ADD HERE: void this._extractAndWriteMemories(text, assembled);
  }
}
```

From apps/backend-ts/src/memory/extractor.ts (P01):
```typescript
export class MemoryExtractor {
  constructor(llm: BaseChatModel) { ... }
  async extractMemories(userText: string, assistantText: string): Promise<Extraction[]>
}
```

From apps/backend-ts/src/memory/manager.ts (P02):
```typescript
export class MemoryManager {
  readonly llm: BaseChatModel | undefined;
  async saveTypedMemory(convId: number | null, extraction: Extraction): Promise<void>
}
// MemoryManagerOptions now has llm?: BaseChatModel
```

From apps/backend-ts/src/index.ts (existing pattern to understand):
// Find where MemoryManager is constructed and where llm is available.
// The llm is created before ChatSession.create() — add llm: llm to MemoryManager construction.
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wire _extractAndWriteMemories() into ChatSession</name>
  <files>apps/backend-ts/src/session/chat-session.ts, apps/backend-ts/test/session/extraction-wiring.test.ts</files>
  <read_first>
    - apps/backend-ts/src/session/chat-session.ts (read the FULL file — must know exact location of saveTurn try/catch in both send() and sendStream(), existing imports, class structure)
    - apps/backend-ts/src/memory/extractor.ts (MemoryExtractor constructor signature + extractMemories() signature)
    - apps/backend-ts/src/memory/manager.ts (saveTypedMemory() signature)
    - apps/backend-ts/test/session/chat-session-stream.test.ts (test mock pattern for ChatSession — how llm, memory, agent are mocked)
  </read_first>
  <behavior>
    - _extractAndWriteMemories(userText, assistantText): creates MemoryExtractor(this.llm), calls extractMemories(), iterates results and calls this.memory.saveTypedMemory(this._convId, extraction)
    - _extractAndWriteMemories: entire body wrapped in try/catch → console.warn('[memory extraction] {message}') on error, never re-throws (MEMW-03)
    - send(): adds `void this._extractAndWriteMemories(text, finalText)` AFTER the saveTurn try/catch block, BEFORE return finalText
    - sendStream(): adds `void this._extractAndWriteMemories(text, assembled)` AFTER the saveTurn try/catch block, at the end of the generator body
    - Test 1: send() calls _extractAndWriteMemories with correct userText + assistantText arguments
    - Test 2: send() returns finalText immediately without awaiting extraction (void context confirmed)
    - Test 3: send() does NOT throw when _extractAndWriteMemories throws internally
    - Test 4: sendStream() calls _extractAndWriteMemories with correct assembled text after streaming completes
  </behavior>
  <action>
    STEP 1 — Write the test file first (RED):
    Create `apps/backend-ts/test/session/extraction-wiring.test.ts`.

    Read `apps/backend-ts/test/session/chat-session-stream.test.ts` first to understand the mocking pattern used for ChatSession. Match that pattern.

    Key mock setup:
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { ChatSession } from '../../src/session/chat-session.js';

    // Spy on _extractAndWriteMemories to track calls without running real extraction
    const extractSpy = vi.fn().mockResolvedValue(undefined);

    // Build a minimal ChatSession with _extractAndWriteMemories overridden
    async function makeSession(): Promise<ChatSession> {
      const mockLlm = { ... } as any;  // minimal mock
      const mockMemory = {
        startConversation: vi.fn().mockResolvedValue(1),
        saveTurn: vi.fn().mockResolvedValue(undefined),
        saveTypedMemory: vi.fn().mockResolvedValue(undefined),
        buildContext: vi.fn().mockResolvedValue(''),
        vectors: { queryMemories: vi.fn().mockResolvedValue([]) },
      } as any;
      const session = await ChatSession.create({ llm: mockLlm, memory: mockMemory });
      // Override _extractAndWriteMemories to spy without real LLM
      Object.assign(session, { _extractAndWriteMemories: extractSpy });
      return session;
    }
    ```

    Test structure:
    ```typescript
    describe('ChatSession fire-and-forget extraction', () => {
      it('send() calls _extractAndWriteMemories with user + assistant text', ...)
      it('send() returns before extraction completes (void context)', ...)
      it('send() does not throw when extraction fails', ...)
      it('sendStream() calls _extractAndWriteMemories with assembled text', ...)
    });
    ```

    Run tests — FAIL (method does not exist, or void call not present). Commit: `✅ test(36-P03): add failing tests for extraction call-site wiring`

    STEP 2 — Implement changes in chat-session.ts (GREEN):

    2a. Add import at top of chat-session.ts (after existing imports):
    ```typescript
    import { MemoryExtractor } from '../memory/extractor.js';
    import type { Extraction } from '../memory/extractor.js';
    ```

    2b. In the `send()` method, add `void this._extractAndWriteMemories(text, finalText);` AFTER the saveTurn try/catch and BEFORE `return finalText`:
    ```typescript
    async send(text: string): Promise<string> {
      // ... existing code (agent.invoke, history update, extractFinalAiText) ...

      if (this._convId !== null) {
        try {
          await this.memory.saveTurn(this._convId, text, finalText);
        } catch (exc) {
          console.warn(`ChatSession.send: saveTurn falhou: ${(exc as Error).message}`);
        }
      }

      // Phase 36 (MEMW-01, REL-01): fire-and-forget memory extraction
      // CRITICAL: void context — never await — extraction must not block message handler
      void this._extractAndWriteMemories(text, finalText);

      return finalText;
    }
    ```

    2c. In the `sendStream()` method, add `void this._extractAndWriteMemories(text, assembled);` AFTER the saveTurn try/catch, at the end of the generator body:
    ```typescript
    // ... after saveTurn try/catch ...

    // Phase 36 (MEMW-01, REL-01): fire-and-forget memory extraction (after stream drains)
    void this._extractAndWriteMemories(text, assembled);
    ```

    2d. Add the private `_extractAndWriteMemories()` method to the ChatSession class, BEFORE the closing `}` of the class:
    ```typescript
    /**
     * Background memory extraction — Phase 36 (MEMW-01, MEMW-03, REL-01).
     *
     * This method is ALWAYS called via `void` — never awaited at call site.
     * Errors are caught and logged only; never re-thrown; voice pipeline is unaffected.
     */
    private async _extractAndWriteMemories(
      userText: string,
      assistantText: string,
    ): Promise<void> {
      try {
        const extractor = new MemoryExtractor(this.llm);
        const extractions = await extractor.extractMemories(userText, assistantText);
        for (const extraction of extractions) {
          await this.memory.saveTypedMemory(this._convId, extraction);
        }
      } catch (err) {
        // MEMW-03: Silent failure — log only, never re-throw, never block caller
        console.warn(`[memory extraction] ${(err as Error).message}`);
      }
    }
    ```

    Run tests: `cd apps/backend-ts && npx vitest run test/session/extraction-wiring.test.ts`
    EXPECTED: 4 tests pass.
    Commit: `✨ feat(36-P03): wire void _extractAndWriteMemories into ChatSession.send + sendStream`
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/session/extraction-wiring.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "void this._extractAndWriteMemories" apps/backend-ts/src/session/chat-session.ts` returns 2 lines (one in send(), one in sendStream())
    - `grep -n "private async _extractAndWriteMemories" apps/backend-ts/src/session/chat-session.ts` returns 1 line
    - `grep -n "import.*MemoryExtractor" apps/backend-ts/src/session/chat-session.ts` returns 1 line
    - `grep -n "\[memory extraction\]" apps/backend-ts/src/session/chat-session.ts` returns 1 line (MEMW-03 silent failure)
    - `cd apps/backend-ts && npx vitest run test/session/extraction-wiring.test.ts` exits 0 with 4 tests passing
    - 2 atomic commits: RED (test stubs) + GREEN (implementation)
  </acceptance_criteria>
  <done>_extractAndWriteMemories() private method added to ChatSession. void call sites in send() and sendStream(). 4 tests passing.</done>
</task>

<task type="auto">
  <name>Task 2: Pass llm to MemoryManager in index.ts + full suite green check</name>
  <files>apps/backend-ts/src/index.ts</files>
  <read_first>
    - apps/backend-ts/src/index.ts (read the FULL file — find where MemoryManager is constructed and where llm is available; understand the startup flow)
    - apps/backend-ts/src/memory/manager.ts (MemoryManagerOptions interface — confirm llm?: BaseChatModel is present after P02)
  </read_first>
  <action>
    STEP 1 — Locate MemoryManager construction in index.ts:
    Read `apps/backend-ts/src/index.ts`. Find the `new MemoryManager(...)` call. Find where `llm` (the BaseChatModel instance) is created or available in the same scope.

    STEP 2 — Add `llm` to the MemoryManager constructor options:
    In the existing `new MemoryManager({ ... })` call, add `llm: llm` (or whatever the variable name is for the BaseChatModel). Example:

    BEFORE:
    ```typescript
    const memory = new MemoryManager({
      vectorsOptions: { host: ..., port: ... },
    });
    ```

    AFTER:
    ```typescript
    const memory = new MemoryManager({
      vectorsOptions: { host: ..., port: ... },
      llm,  // Phase 36: required for background memory extraction
    });
    ```

    CRITICAL: Do NOT add this if the llm variable is not yet defined at that point in the file. If MemoryManager is constructed BEFORE llm is created, restructure the construction order so llm is created first. Verify the build compiles: `cd apps/backend-ts && npx tsc --noEmit 2>&1 | head -20`.

    STEP 3 — Run the full test suite and verify no regressions:
    ```
    cd apps/backend-ts && npx vitest run 2>&1 | tail -30
    ```

    The pre-existing failure in `src/memory/manager.test.ts` (requires live ChromaDB for vector recall assertion) is acceptable — it existed before Phase 36. All other tests must pass.

    Commit: `🔧 chore(36-P03): pass llm to MemoryManager in index.ts startup`
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx tsc --noEmit 2>&1 | head -20 && npx vitest run 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "llm" apps/backend-ts/src/index.ts` returns at least 1 line showing llm passed to MemoryManager options
    - `cd apps/backend-ts && npx tsc --noEmit` exits 0 with no TypeScript errors
    - `cd apps/backend-ts && npx vitest run` shows all Phase 36 tests (extractor, vectors-typed, manager-typed, extraction-wiring) passing
    - The pre-existing manager.test.ts failure (if present) is the ONLY failure in the suite
    - 1 commit: chore(36-P03)
  </acceptance_criteria>
  <done>index.ts passes llm to MemoryManager. TypeScript compiles cleanly. Full vitest suite green (excluding pre-existing failure).</done>
</task>

</tasks>

<verification>
Full Phase 36 end-to-end verification:
- `grep -rn "void this._extractAndWriteMemories" apps/backend-ts/src/session/chat-session.ts` returns 2 lines
- `grep -n "void.*never await\|REL-01\|MEMW-01" apps/backend-ts/src/session/chat-session.ts` returns at least 1 comment confirming fire-and-forget intent
- `cd apps/backend-ts && npx vitest run test/memory/extractor.test.ts test/memory/vectors-typed.test.ts test/memory/manager-typed.test.ts test/session/extraction-wiring.test.ts` exits 0 with 22/22 tests passing (10+4+4+4)
- `cd apps/backend-ts && npx tsc --noEmit` exits 0

Phase requirements check:
- MEMW-01: extractAndWriteMemories fires after every LLM response → void call site in send() + sendStream() (P03-Task1)
- MEMW-02: withStructuredOutput() + Zod discriminated union → MemoryExtractor (P01-Task2)
- MEMW-03: silent failure pattern → try/catch in _extractAndWriteMemories + extractMemories() (P01-Task2 + P03-Task1)
- MTYPE-01: 3 typed collections → addTypedMemory() routing by type (P02-Task1)
- MTYPE-02: semantic collection → Zod schema + routing confirmed (P01 + P02)
- MTYPE-03: episodic collection → Zod schema + routing confirmed (P01 + P02)
- MTYPE-04: procedural collection → Zod schema + routing confirmed (P01 + P02)
- REL-01: void call site confirmed → grep returns 2 lines (P03-Task1)
</verification>

<success_criteria>
- ChatSession.send() and sendStream() both call void this._extractAndWriteMemories() after saveTurn (never before, never awaited)
- _extractAndWriteMemories() is private — not callable from outside ChatSession
- index.ts passes the llm instance to MemoryManager constructor
- TypeScript compiles cleanly (npx tsc --noEmit exits 0)
- All 22 Phase 36 unit tests pass
- 3 atomic commits in this plan: RED test stubs + GREEN implementation + chore wiring
</success_criteria>

<output>
After completion, create `.planning/phases/36-memory-writer/36-P03-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`
</output>
