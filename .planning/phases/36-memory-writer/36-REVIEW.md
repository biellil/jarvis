---
phase: 36-memory-writer
reviewed: 2026-04-25T20:53:13Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/backend-ts/src/memory/extractor.ts
  - apps/backend-ts/src/memory/manager.ts
  - apps/backend-ts/src/memory/vectors.ts
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/index.ts
  - apps/backend-ts/test/memory/extractor.test.ts
  - apps/backend-ts/test/memory/vectors-typed.test.ts
  - apps/backend-ts/test/memory/manager-typed.test.ts
  - apps/backend-ts/test/session/extraction-wiring.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-04-25T20:53:13Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 36 introduces `MemoryExtractor` (LLM-backed Zod-validated extraction), typed memory persistence in `MemoryManager` (`saveTypedMemory`), three typed ChromaDB collections in `MemoryVectors`, and fire-and-forget wiring in `ChatSession`. The architecture is sound and the silent-failure contract (MEMW-03) is correctly applied throughout.

Four warnings were found — no critical security or data-loss issues. The most impactful is an unvalidated type cast in `extractor.ts` that bypasses the Zod schema the class was built to enforce. The other three are a fragile initialization guard in `vectors.ts`, a `MemoryExtractor` instantiated per-call instead of per-session, and an unhandled rejection risk for the fire-and-forget void in `sendStream`.

---

## Warnings

### WR-01: Zod schema bypassed — LLM output cast without validation in `extractMemories`

**File:** `apps/backend-ts/src/memory/extractor.ts:101-107`

**Issue:** The whole point of `withStructuredOutput(extractionSchema)` is to guarantee that every element written to the database has been validated by Zod. However, `extractMemories` short-circuits that guarantee: when the LLM returns an array it is cast directly to `Extraction[]` (line 102) without calling `extractionSchema.safeParse()`. When the LLM returns a single object it is also cast without validation (line 104). A malformed response (e.g., `content` shorter than 10 chars, `confidence` > 1, unknown `type`) would pass straight through to `saveTypedMemory` and land in the database.

Note that `withStructuredOutput` may itself run Zod validation internally depending on the provider, but the code's type-level handling treats the result as `unknown` (line 79) and then immediately casts it — there is no explicit parse call that the application code controls.

**Fix:**
```typescript
async extractMemories(userText: string, assistantText: string): Promise<Extraction[]> {
  try {
    const prompt = EXTRACTION_PROMPT.replace('{userText}', userText).replace(
      '{assistantText}', assistantText,
    );
    const result = await this.structuredLlm.invoke([new HumanMessage(prompt)]);

    const raw: unknown[] = Array.isArray(result) ? result : [result];
    const validated: Extraction[] = [];
    for (const item of raw) {
      const parsed = extractionSchema.safeParse(item);
      if (parsed.success) {
        validated.push(parsed.data);
      } else {
        console.warn(`[extractor] invalid extraction item dropped: ${parsed.error.message}`);
      }
    }
    return validated;
  } catch (err) {
    console.warn(`[extractor] extractMemories failed: ${(err as Error).message}`);
    return [];
  }
}
```

---

### WR-02: Fragile typed-collection guard allows partial initialization to be treated as complete

**File:** `apps/backend-ts/src/memory/vectors.ts:164`

**Issue:** `initTypedCollections` guards with `this.typedCollections.size === 3`. If `getOrCreateCollection` succeeds for `semantic` and `episodic` but throws for `procedural`, the catch block resets `this.typedInitPromise = null` (line 185) but leaves `typedCollections` populated with 2 entries (size = 2). On the next call the guard `size === 3` is false, so it tries again — but the catch is asymmetric with the state: the second attempt creates a new promise, but the first two entries in the map are already stale `Collection` handles from the failed attempt. If the Chroma server recovered they would be re-inserted with duplicate `set()` calls, which is benign. If it fails again the partial state accumulates. This is a subtle but exploitable inconsistency: `addTypedMemory('proc', ...)` returns silently (collection not found, throws inside, warn-logged) even though `size` will be < 3 on the next call.

More concretely: after a partial failure, `typedCollections.size` could oscillate between 2 and 3 across concurrent callers because `typedInitPromise` was reset to `null` while partial entries remain.

**Fix:** Clear `typedCollections` before retrying, or track initialization with an explicit boolean flag independent of map size:
```typescript
private typedInitialized = false;

private async initTypedCollections(): Promise<void> {
  if (this.typedInitialized) return;
  if (this.typedInitPromise !== null) {
    await this.typedInitPromise;
    return;
  }
  this.typedInitPromise = (async () => {
    await this.init();
    if (this.client === null) throw new Error('ChromaDB client not initialized');
    const types = ['semantic', 'episodic', 'procedural'] as const;
    for (const type of types) {
      const col = await this.client.getOrCreateCollection({
        name: `memories_${type}`,
        metadata: { type },
        embeddingFunction: null,
      });
      this.typedCollections.set(type, col);
    }
    this.typedInitialized = true; // set only after all three succeed
  })();
  try {
    await this.typedInitPromise;
  } catch (err) {
    this.typedInitPromise = null;
    this.typedCollections.clear(); // reset partial state on failure
    throw err;
  }
}
```

---

### WR-03: `MemoryExtractor` instantiated per `send()` / `sendStream()` call — LLM binding rebuilt on every turn

**File:** `apps/backend-ts/src/session/chat-session.ts:236`

**Issue:** `_extractAndWriteMemories` creates `new MemoryExtractor(this.llm)` on every invocation. The constructor calls `llm.withStructuredOutput(extractionSchema)`, which — depending on the LangChain provider — may allocate resources, bind output parsers, or involve reflection over the schema object. For a long-running session with many turns this is unnecessary churn. More importantly, if `withStructuredOutput` is stateful (some providers wrap the runnable in a chain with state), re-binding on every call could produce subtle behavioral differences.

**Fix:** Create the extractor once in `ChatSession.create()` and store it as a private field, analogous to how `_agent` is constructed once:
```typescript
// In ChatSession constructor / create():
private readonly _memoryExtractor: MemoryExtractor;

// In create():
const memoryExtractor = new MemoryExtractor(opts.llm);
return new ChatSession(opts.llm, opts.memory, convId, agent, toolLogger, listenerBox, memoryExtractor);

// In _extractAndWriteMemories():
const extractions = await this._memoryExtractor.extractMemories(userText, assistantText);
```

---

### WR-04: Unhandled rejection risk — `void` in `sendStream` has no process-level guard

**File:** `apps/backend-ts/src/session/chat-session.ts:222`

**Issue:** In `sendStream` (line 222) the fire-and-forget is:
```typescript
void this._extractAndWriteMemories(text, assembled);
```
`_extractAndWriteMemories` has an internal `try/catch` (lines 241-244), so under normal paths it should not reject. However if a future code change inside that method throws *before* the try block (e.g., a synchronous throw in the constructor, or a refactor that moves code above the try), the rejection becomes unhandled at the Node.js process level. In `send()` this is less risky because the `void` is also present (line 165) — but in `sendStream` the generator caller cannot observe the rejection either.

The test suite covers the `send()` path (test line 109) but does not test that `sendStream` swallows a rejecting `_extractAndWriteMemories`. The existing internal catch makes this low-probability today, but it is worth documenting explicitly.

**Fix:** Wrap with an explicit catch at the call site, consistent with how `saveTurn` is protected:
```typescript
// sendStream — fire-and-forget with explicit rejection guard
this._extractAndWriteMemories(text, assembled).catch((err) => {
  console.warn(`[memory extraction] sendStream: ${(err as Error).message}`);
});
```

---

## Info

### IN-01: Extraction prompt uses raw string interpolation — user content is not sanitized

**File:** `apps/backend-ts/src/memory/extractor.ts:95-98`

**Issue:** The prompt is assembled by `String.replace('{userText}', userText)`. If `userText` happens to contain the literal string `{assistantText}` (unlikely but possible), the second replace would substitute it with the assistant text in the wrong position, producing a garbled prompt. The approach also makes the template harder to validate statically. This is not a security issue since the text goes to the LLM (trusted boundary), but it is a correctness edge case.

**Fix:** Use a template function or positional replacement to avoid accidental collisions:
```typescript
const prompt = EXTRACTION_PROMPT
  .replace('{userText}', () => userText)        // replacer fn — no special $ interpretation
  .replace('{assistantText}', () => assistantText);
```
Or replace `{userText}` before `{assistantText}` and verify the order is guaranteed (it currently is, but is fragile to template edits).

---

### IN-02: `endConversation` result not awaited in `MemoryManager`

**File:** `apps/backend-ts/src/memory/manager.ts:49-51`

**Issue:** `endConversation` calls `this.store.endConversation(convId)` without `await`. `MemoryStore.endConversation` is a synchronous method (SQLite via better-sqlite3 runs synchronously), so this does not cause a bug today. However the method signature on `MemoryManager` is `async Promise<void>`, which implies an async store boundary. If the store layer is ever replaced with an async driver (e.g., `@libsql/client`), this will silently drop the `await` and the conversation end timestamp will not be written. Adding `await` costs nothing and makes the intent explicit.

**Fix:**
```typescript
async endConversation(convId: number): Promise<void> {
  await this.store.endConversation(convId);
}
```

---

### IN-03: Test for fire-and-forget timing relies on unspecified event-loop ordering

**File:** `apps/backend-ts/test/session/extraction-wiring.test.ts:78-104`

**Issue:** The test "send() returns before extraction completes (void context)" (lines 78-104) sets up a 50 ms `setTimeout` inside the spy and asserts that `extractionCompleted` is `false` after `send()` resolves. This assertion is commented out (line 101-102) with "In void context, extractionCompleted could be false here depending on event loop." The comment reveals that the test does not actually enforce the fire-and-forget invariant — it tests only that `send()` resolves with the correct string, which is already covered by the adjacent test. The timing assertion is absent. The test could be tightened (e.g., using `vi.useFakeTimers()`) or the ambiguous section should be removed to avoid confusion.

This does not affect production correctness, but it is a test reliability note.

**Fix:** Either remove the misleading timer-based setup and keep only the string assertion, or use `vi.useFakeTimers()` to make the invariant deterministic:
```typescript
it('send() returns before extraction completes (void context)', async () => {
  vi.useFakeTimers();
  const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });
  let completed = false;
  const slowExtract = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 50));
    completed = true;
  });
  Object.assign(session, { _extractAndWriteMemories: slowExtract });

  await session.send('test');
  expect(completed).toBe(false); // timer not advanced — extraction not done
  vi.useRealTimers();
});
```

---

_Reviewed: 2026-04-25T20:53:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
