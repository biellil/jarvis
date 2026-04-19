# Domain Pitfalls: Memory Intelligence for LangChain.js Agent

**Domain:** Adding Memory Writer, typed memory, rolling summarization, and top-k retrieval to existing LangChain.js agent with ChromaDB

**Researched:** 2026-04-19

**Overall Confidence:** MEDIUM - WebSearch findings on memory latency and ChromaDB metadata filtering. Official LangChain/Chroma docs consulted. Voice pipeline integration pitfalls based on JARVIS architecture constraints.

---

## Critical Pitfalls

### Pitfall 1: Memory Writer Blocking Voice Pipeline Response

**What goes wrong:**
Memory Writer runs as a synchronous LLM call _after_ response text is generated but _before_ TTS begins. If the LLM inference (reasoning about what to extract + deciding what to save) takes >2s, the user hears silence before TTS starts. For a 10s conversation, this can feel like a 2-3 second delay, breaking perceived responsiveness.

Example failure path:
1. User speaks → STT completes in 1s
2. LLM processes query, generates response (2-3s)
3. Memory Writer LLM called to extract facts (2s) ← BLOCKS HERE
4. TTS only starts after Memory Writer completes
5. User hears 2s of silence → perceived latency = 5-6s total

**Why it happens:**
- The natural implementation places Memory Writer extraction synchronously in the response handler
- LangChain's `create_react_agent` doesn't differentiate between critical-path and background LLM calls
- Voice pipeline expects buildContext() + LLM + TTS to complete in <3s for acceptable UX
- Memory Writer calls are treated as sync work when they should be fire-and-forget

**Consequences:**
- Voice responses feel sluggish (p50 latency 5-6s instead of 2-3s)
- Users think JARVIS is broken/slow compared to v1.7
- Multi-turn voice becomes frustrating (each turn adds 2s overhead)
- Regression in core value prop (conversational naturalness)

**Prevention:**
- Dispatch Memory Writer as async background task _after_ TTS playback starts, not before
- Use `void Promise()` or background queue (Bull, BullMQ) to decouple from response path
- Measure critical path latency before and after: `voiceHandler.ts` should not block on Memory Writer
- Add latency tracing at buildContext → LLM → TTS boundaries; flag if Memory Writer adds >500ms to critical path
- Test with slow LLM (4-5s inference time) to ensure degradation is graceful

**Detection:**
- User reports: "Voice responses are noticeably slower than v1.7"
- Latency increase of 1-2s in voice pipeline during testing
- TTS start time metric shows correlation with Memory Writer presence
- `console.error("Memory Writer timeout")` patterns in logs

**Phase to address:** Phase 1 (Core Memory Writer) — must avoid regression before shipping.

---

### Pitfall 2: buildContext() Refactoring Breaks Existing RAG

**What goes wrong:**
The new buildContext() signature changes from:
```
buildContext(messages: BaseMessage[]): string
```
to:
```
async buildContext(
  messages: BaseMessage[],
  conversationId: string,
  memoryTypeFilter?: MemoryType[]
): Promise<string>
```

Existing callers (streaming handlers, tool execution, vision pipeline) fail because:
- buildContext is now async but callers expect sync return
- New `conversationId` parameter breaks old call sites
- Memory retrieval happens at prompt-building time, blocking LLM invocation
- Vision responses that don't need memory still pay the cost of retrieval

Example failure:
```typescript
// OLD: sync, no memory type filtering
const context = buildContext(messages);
const response = await llm.invoke(context);

// NEW: async, requires conversationId
const context = await buildContext(messages, conversationId, ['semantic']); // ← breaks here
const response = await llm.invoke(context);
```

**Why it happens:**
- Existing `ChatSession.buildPrompt()` and streaming response handler both call buildContext synchronously
- Top-k memory retrieval (async operation) is inserted into the middle of the critical path
- No migration layer provided to handle both old and new callers
- Refactoring done in isolation without updating all call sites

**Consequences:**
- TypeScript compilation errors or runtime "buildContext is not a function" crashes
- Streaming response handler hangs (awaiting memory retrieval during SSE stream)
- Vision pipeline blocks on memory retrieval even for image-only queries
- Old CLI tests fail with "Expected string, got Promise"
- Rollback required if discovered late in phase

**Prevention:**
- Create compatibility wrapper: `buildContextSync()` that calls async version internally and caches result
- Keep old signature for 2 phases, deprecate with warnings
- Add overload: `buildContext(sync) | buildContextAsync(async)`
- Test ALL existing callers (not just main chat loop):
  - Streaming response handler
  - Vision ScreenAnalyzer query
  - Tool execution prompts
  - Fallback vision model prompts
  - CLI test suite
- Use parallel/shadow implementation to test new path without breaking old one

**Detection:**
- Compilation errors in multiple modules
- Streaming responses hang on first token
- Vision pipeline becomes very slow (~2-3s latency added)
- CLI returns "Expected string, got Promise"

**Phase to address:** Phase 1 (Core Memory Writer) — must not break existing functionality.

---

### Pitfall 3: Memory Retrieval Latency Cascades in Voice Pipeline

**What goes wrong:**
Top-k retrieval from ChromaDB (semantic + episodic + procedural × 5 each = 15 vectors) adds 500ms-1s latency per LLM invocation when:

1. buildContext() calls memory.retrieve({type: 'semantic', topK: 5}) sequentially
2. Each retrieval requires ChromaDB to:
   - Parse metadata filter (`memory_type === 'semantic'`)
   - Score all embeddings against query
   - Return top-5 with metadata
3. Three sequential calls (semantic + episodic + procedural) = 1.5-3s total

For a voice interaction:
- STT: 1s
- Memory retrieval: 1.5s ← cascades here
- LLM: 2.5s
- TTS: 2s
- **Total: 7s** (user perceives "hanging")

Expected latency budget:
- STT: <1s
- Prompt building (including memory): <500ms
- LLM: 2-3s
- TTS: 2s
- **Budget total: ~5.5s**

**Why it happens:**
- No batching of memory retrievals (could fetch all 3 types in one query with metadata filter)
- No caching of retrieved memories across multiple buildContext() calls in same turn
- ChromaDB metadata filtering performance degrades with large collections
- No attention to query-time optimization; everything uses default settings

**Consequences:**
- P50 voice latency 6-7s (vs. v1.7 goal of <5s)
- Voice pipeline feels unresponsive and sluggish
- Multi-turn voice interaction becomes frustrating (compounded latency per turn)
- Users switch back to text input, voice feature regression

**Prevention:**
- Batch memory retrievals: fetch all memory types in one query with `$or` metadata filter
- Cache retrieved memories for the turn (store in `conversationState`)
- Measure memory retrieval latency separately: goal <200ms for 3 types × 5 each
- Add feature flag `SKIP_MEMORY_RETRIEVAL` for performance testing
- Profile with realistic ChromaDB collection size (>100k vectors)
- Use `where` clause correctly: `{memory_type: {$in: ['semantic', 'episodic', 'procedural']}}`
- Consider lazy loading: only fetch episodic/procedural if semantic retrieval returns <3 results

**Detection:**
- Voice latency metric increases when Memory Writer phase ships
- Memory retrieval logs show 3 sequential ChromaDB queries in chain
- TTS start time increases by >1s after memory feature added
- P95 latency spikes during voice interactions

**Phase to address:** Phase 1 (Core Memory Writer) — latency budget must be respected from day 1.

---

### Pitfall 4: ChromaDB Metadata Filtering Doesn't Scale

**What goes wrong:**
Metadata filtering in ChromaDB works fine for collections <50k documents, but degrades sharply:

- 40k documents + `{memory_type === 'semantic'}` filter: ~5 minutes to return
- 20M+ documents + any `where` clause: hangs, returns no results
- Combined `where` (metadata) + `where_document` (text) filters: exponential slowdown

Current JARVIS history:
- ~30k conversation messages
- ~50k memory vectors (if 2 per message average)
- Projected v1.8: ~100-200k vectors after rolling summarization

At scale, a simple query like:
```javascript
const results = await chromaVectorStore.similaritySearch(query, k=5, {
  where: { memory_type: { $eq: 'semantic' } }
});
```

Takes 500ms-2s instead of 50-100ms.

**Why it happens:**
- ChromaDB's SQLite backend doesn't index metadata columns efficiently
- Metadata filtering happens _before_ vector similarity search in the query pipeline
- Large dataset size amplifies the O(n) metadata scan
- No query optimization for combined where+where_document filters
- Known issue: GitHub chroma-core/chroma#1394, #4089 (2023-2024)

**Consequences:**
- Memory retrieval latency creeps up over time as collection grows
- Voice responses get slower as user talks more (degrades over session length)
- Summarization triggers become frequent, adding more vectors
- System becomes unusable after 6-12 months of conversation history

**Prevention:**
- Implement alternative indexing:
  - Store memory_type as separate ChromaDB collection (semantic_collection, episodic_collection, procedural_collection) instead of metadata field
  - Eliminates metadata filter from hot path
- Monitor collection size and retrieval latency:
  - Alert if retrieval >200ms
  - Check vector count monthly
- Add archival strategy:
  - Move vectors older than N days to cold storage (separate collection)
  - Only search active collection in hot path
- Test with realistic scale before shipping:
  - Generate 200k vectors
  - Measure retrieval latency with memory filters
  - Must be <200ms p95
- Avoid combining `where` + `where_document` filters; use separate queries if both needed

**Detection:**
- Memory retrieval latency increases by 2-3x after 100k vectors
- ChromaDB query logs show `where` clause in slow queries
- Voice responses get progressively slower after weeks of use
- Monitor: `retrieval_latency_ms` metric increasing over time

**Phase to address:** Phase 2 (Rolling Summarization) — must implement archival before summarization creates massive vector growth.

---

### Pitfall 5: Memory Type Mixing Degrades Retrieval Quality

**What goes wrong:**
If semantic, episodic, and procedural memories are stored in the same ChromaDB collection with only a metadata tag to distinguish type, then:

1. Similarity search on mixed collection returns irrelevant results
   - Query: "How do I use Python?" (procedural intent)
   - Returns: Episodic memory from 2 months ago about learning Python (false positive)
   - Also returns: Semantic fact "You prefer Python 3.11" (irrelevant, but similar vector space)
   - Only 2 of top-5 results are actually procedural knowledge

2. Mixing degrades semantic search
   - Query: "What's my timezone?" (semantic intent)
   - Returns: Procedural "Here's how to set timezone" (wrong type)
   - Also returns: Episodic "Set timezone to America/Toronto yesterday" (partially relevant)
   - Actual semantic fact buried at position 4-5

3. Vector space becomes noisy
   - "Learn Python" and "Use Python" are semantically similar, but one is episodic, one is procedural
   - LLM can't easily distinguish which is which after top-k retrieval
   - Forces post-filtering in prompt engineering instead of at storage time

**Why it happens:**
- Sentence-transformer embeddings (all-MiniLM-L6-v2) treat all text the same way — sentence structure matters more than metadata labels
- No semantic awareness that "I learned Python" (episodic) is different from "How to use Python" (procedural)
- Mixed embedding space means top-5 by similarity doesn't preserve type homogeneity
- Tempting to store all in one collection for simplicity

**Consequences:**
- LLM gets confused by mixed memory types and includes irrelevant context
- Rolling summarization produces poor summaries (mixes time-bound episodic facts into timeless semantic statements)
- Users report "JARVIS forgot something" when actually irrelevant memory was returned instead
- Retrieval quality degrades over time as mixed collection grows
- Post-hoc filtering doesn't help if wrong vectors are already in top-5

**Prevention:**
- Separate storage: three collections (one per memory type) or partitioned indices
  - chromadb.get_or_create_collection('semantic')
  - chromadb.get_or_create_collection('episodic')
  - chromadb.get_or_create_collection('procedural')
- Avoid relying on metadata `{memory_type: 'semantic'}` as primary filter
- Validate retrieval quality:
  - Spot-check top-5 results for mixed-type collection vs. three separate collections
  - Query type should match result type
  - If mixing, metadata filter must remove non-matching types from results before returning
- Memory Writer must assign strict type at write time; no ambiguous "semantic or episodic?" decisions

**Detection:**
- LLM responses include context that doesn't match query intent
- Users report "JARVIS repeating information from months ago when answering a procedure"
- Retrieval logs show memory_type mismatch between query intent and results
- Manual spot-check: query for "How do I..." returns episodic facts instead of procedural rules

**Phase to address:** Phase 1 (Core Memory Writer) — must design storage architecture correctly before writing large volumes.

---

### Pitfall 6: Rolling Summarization Triggering at Wrong Time Blocks Voice

**What goes wrong:**
Rolling summarization runs on a trigger: "every N messages, create a summary of older messages and store it as a memory."

If triggered during active voice conversation:
```
User speaks → STT → buildContext() [calls summarize()] ← BLOCKS HERE
  → Summarize runs LLM on 50 old messages (3-5s)
  → Result stored in ChromaDB (500ms)
  → Finally calls main LLM for response
User waits 5-6s total before response starts
```

Compounding effect:
- Turn 15: Summary not triggered, normal speed (3s)
- Turn 16: Summary triggered (5-6s delay)
- Turn 17: Summary triggered again (5-6s delay)
- User perceives JARVIS as randomly hanging

**Why it happens:**
- Summarization runs inline in the critical path (during buildContext)
- No debouncing — triggered on every Nth message even if conversation is active
- LLM inference for summarization is expensive (processing 50+ messages)
- No background task queue available for deferred work

**Consequences:**
- Voice interaction becomes unreliable (random 2-3s delays)
- Multi-turn voice mode breaks (each turn might trigger summary)
- User experience regression from v1.7
- Users feel JARVIS is broken, not improved

**Prevention:**
- Never trigger summarization during active conversation
- Options:
  1. Trigger only at session end (after idle timeout or explicit close)
  2. Trigger only on explicit command (user asks "Summarize our conversation")
  3. Trigger asynchronously in background after conversation ends, with feature flag
  4. Trigger during low-activity windows (checked in background poll, not in response handler)
- Debounce: don't summarize more than once per hour, even if threshold crossed multiple times
- Test trigger logic:
  - 20-turn conversation should not trigger summarization until session ends
  - No latency increase during multi-turn voice
- Logging: track every summarization trigger (reason + duration)

**Detection:**
- Voice latency metric spikes at regular message intervals (every 10-15 messages)
- LLM is called twice in quick succession: once for summary, once for response
- buildContext() latency increases as conversation progresses
- User reports: "JARVIS randomly hangs for 2-3s in the middle of conversation"

**Phase to address:** Phase 2 (Rolling Summarization) — must not break voice pipeline that was just optimized in Phase 1.

---

### Pitfall 7: SQLite-ChromaDB Consistency Under Concurrency

**What goes wrong:**
Memory Writer writes to both SQLite (conversation history + metadata) and ChromaDB (vector storage) in two separate operations. If either fails or is delayed:

Failure scenario:
1. Memory Writer extracts fact: "User prefers Python"
2. Writes to SQLite: ✓ success, inserted as row ID 42
3. Writes to ChromaDB: **timeout or error** (network issue, disk full, ChromaDB busy)
4. SQLite has memory, ChromaDB doesn't
5. Next retrieval: only SQLite shows the memory, ChromaDB misses it
6. LLM context is incomplete

Consistency break with concurrency:
- Memory Writer: writing to SQLite + ChromaDB (2 separate txns, not atomic)
- Chat query: reading from ChromaDB
- If these run in parallel, read might see old state while write is in-flight

SQLite + ChromaDB concurrency model:
- SQLite: ACID, single-threaded writes, WAL mode allows concurrent reads
- ChromaDB: built on SQLite but embeddings are Rust-based; unclear transaction boundaries
- **Result:** No distributed transaction — writes to SQLite and ChromaDB are NOT atomic

**Why it happens:**
- Two separate systems (SQLite for metadata/history, ChromaDB for vectors)
- No transaction coordinator; writes assumed to succeed
- Error handling: if ChromaDB write fails, SQLite already committed
- Async Memory Writer: race condition if user asks for context before write completes

**Consequences:**
- Memory inconsistency: SQLite shows fact, ChromaDB doesn't (or vice versa)
- LLM misses context that should be retrieved
- Repeated writes to same fact cause duplicates across systems
- Silent data loss (user doesn't know memory was only partially saved)
- Difficult to debug (invisible inconsistency in production)

**Prevention:**
- Implement transactional wrapper:
  ```typescript
  async saveMemory(fact: SemanticMemory) {
    const savedSQLite = await db.insert(fact); // get ID
    try {
      const savedChroma = await chroma.add({
        ids: [savedSQLite.id],
        embeddings: [...],
        metadata: { memory_type: 'semantic', source_id: savedSQLite.id }
      });
      // both succeeded
    } catch (e) {
      // ChromaDB failed; rollback SQLite
      await db.delete(savedSQLite.id);
      throw e;
    }
  }
  ```
- Add consistency check at startup:
  ```typescript
  // On boot: query SQLite for all memory with source_id
  // Cross-check against ChromaDB metadata source_id field
  // Log mismatches; alert if >5% inconsistency
  ```
- All memory writes must include source_id linking SQLite row → ChromaDB vector
- Write tests that simulate ChromaDB failures and verify rollback
- Monitor for inconsistency: `mismatched_memory_count` metric

**Detection:**
- User reports: "I told JARVIS X yesterday, but it doesn't remember" (SQLite has it, ChromaDB doesn't)
- Consistency check logs show mismatches
- ChromaDB write timeout in logs → SQLite still has data → inconsistency
- Manual audit: count memories in SQLite vs ChromaDB; should match (within archival window)

**Phase to address:** Phase 1 (Core Memory Writer) — must handle failures correctly from day 1.

---

## Moderate Pitfalls

### Pitfall 8: Top-k=5 Without Score Threshold Retrieves Noise

**What goes wrong:**
Returning top-5 memories without a similarity score threshold can return irrelevant results:

Query: "What time is the meeting?"
- Top-1: "The meeting is at 3pm" (0.87 similarity) ✓ relevant
- Top-2: "I have a meeting today" (0.74 similarity) ✓ still relevant
- Top-3: "Meetings are important" (0.61 similarity) ~ borderline
- Top-4: "I meet my friends often" (0.52 similarity) ✗ not relevant
- Top-5: "Time flies when you're having fun" (0.48 similarity) ✗ not relevant

Including the last two wastes token budget and pollutes context.

**Why it happens:**
- Fixed top-k=5 treats all results equally regardless of score
- Sentence-transformer embeddings produce similarity in [0, 1] range; 0.5 is high by chance
- No confidence threshold; all retrieved vectors included in context
- Simpler to implement (no threshold tuning) but lower quality

**Consequences:**
- LLM context includes irrelevant memories
- Token budget wasted on noise
- Reduces effective retrieval quality
- May introduce conflicting information

**Prevention:**
- Use hybrid top-k + threshold:
  ```typescript
  const results = await retrieve({ type: 'semantic', topK: 10 });
  const filtered = results.filter(r => r.similarity > 0.65); // Keep results with score >0.65
  return filtered.slice(0, 5); // But never more than 5
  ```
- Tune threshold empirically: test queries where results below 0.65 are marked as "not useful" by human review
- Monitor: average similarity score of returned results; flag if dropping below 0.70
- Log: how many of top-10 passed threshold; if <3, may need tuning

**Detection:**
- LLM responses include out-of-context memories
- Similarity scores in logs show variance (0.48-0.87); consider threshold
- Manual review: check what "top-5" memories say vs. query intent

**Phase to address:** Phase 1 (Core Memory Writer) — quality control before large-scale testing.

---

### Pitfall 9: Procedural Memory Forgotten (Underused)

**What goes wrong:**
Implementation focuses on semantic + episodic, treating procedural as an afterthought or skipping it entirely. Result:

- Semantic memory: "You like Python" ✓
- Episodic memory: "You used Python yesterday" ✓
- Procedural memory: ✗ never written (no Memory Writer extraction)

JARVIS answers "How do I set up Python?" with generic OpenAI knowledge, forgetting that the user showed JARVIS how to do it 3 times already.

**Why it happens:**
- Semantic and episodic are more obvious (facts and events)
- Procedural is harder to extract: requires recognizing procedures, steps, and context-dependent logic
- Memory Writer prompt doesn't instruct LLM to look for procedures
- Easier to skip than to get right

**Consequences:**
- User frustration: "I already showed you this"
- JARVIS doesn't improve over time (learning is blocked)
- Core value prop degraded (system should improve with interaction)

**Prevention:**
- Include procedural extraction in Memory Writer prompt:
  ```
  Extract:
  - Semantic facts (stable, timeless)
  - Episodic events (what happened, when)
  - Procedural knowledge (how to do things, steps)
  ```
- Validate Memory Writer output includes all three types for a diverse conversation
- Test case: conversation showing JARVIS a new process → verify procedural memory created
- Logging: track extraction count by type; if procedural is 0%, investigate prompt

**Detection:**
- Memory Writer output never includes type='procedural'
- User has to repeat procedures after doing them multiple times
- Inspection of memory table shows 80% semantic, 20% episodic, 0% procedural

**Phase to address:** Phase 1 (Core Memory Writer) — design the prompt correctly from the start.

---

### Pitfall 10: Decay Mechanism Missing (Staleness)

**What goes wrong:**
Memory never expires or decreases in confidence. A fact learned 12 months ago is treated as equally true today:

- Stored 2025-04-01: "User works at Company X" (confidence=1.0)
- Now (2026-04-01): User actually works at Company Y
- Query: "Where do you work?"
- Retrieved: "You work at Company X" (confidence=1.0, no decay)
- LLM responds with outdated information

Real-world examples:
- "You prefer Windows 7" (from 2019, now Windows 11)
- "Your favorite language is JavaScript" (learned when building JARVIS, but user moved to Rust)
- "You live in New York" (moved to Brazil 6 months ago)

**Why it happens:**
- Simpler implementation (no time-based decay logic)
- No automatic expiration; memories are permanent
- No reinforcement mechanism (fresh memories stay fresh, stale ones age gracefully)
- Assumes user interactions will naturally overwrite old facts (but they don't)

**Consequences:**
- LLM confidently states false information
- User loses trust (JARVIS seems to have wrong mental model)
- No automated cleanup; memory table grows indefinitely with contradictions
- Requires manual intervention (user says "I don't work there anymore")

**Prevention:**
- Add decay mechanism at retrieval time:
  ```typescript
  const decayedScore = similarity * decay(createdAt, now);
  // decay(old, now) = 1.0 if <1 week old, decreases to 0.5 at 6 months, 0.2 at 1 year
  ```
- Add reinforcement on retrieval:
  - If memory is retrieved and confirmed by user, reset age to 0
  - If memory is retrieved and contradicted, mark as stale
- Add refresh mechanism:
  - Every N sessions (or monthly), run: "Tell me about recent changes in your situation" → updates stale memories
- Logging: track average age of retrieved memories; alert if creeping above 6 months

**Detection:**
- LLM confidently states outdated information
- Memory table has conflicting facts with same semantic meaning but different values
- Average memory age is >6 months and still being retrieved
- User reports: "I told JARVIS about a change, but it still remembers the old thing"

**Phase to address:** Phase 3 (Rolling Summarization and Cleanup) — should be integrated with summarization logic.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| **Phase 1: Core Memory Writer** | Blocking voice response (Pitfall #1) | Dispatch async before TTS, not before. Measure latency. |
| **Phase 1: Core Memory Writer** | buildContext() refactoring breaks RAG (Pitfall #2) | Compatibility layer, gradual migration, test all callers. |
| **Phase 1: Core Memory Writer** | Retrieval latency cascades (Pitfall #3) | Batch queries, cache results, measure <200ms budget. |
| **Phase 1: Core Memory Writer** | Memory type mixing (Pitfall #5) | Separate collections per type, validate retrieval quality. |
| **Phase 1: Core Memory Writer** | SQLite-ChromaDB consistency (Pitfall #7) | Transactional wrapper, source_id links, consistency checks. |
| **Phase 1: Core Memory Writer** | Top-k=5 retrieves noise (Pitfall #8) | Add threshold, human review, logging. |
| **Phase 1: Core Memory Writer** | Procedural memory skipped (Pitfall #9) | Include in extraction prompt, log by type. |
| **Phase 2: Rolling Summarization** | ChromaDB metadata filtering doesn't scale (Pitfall #4) | Separate collections, archival strategy, test at scale. |
| **Phase 2: Rolling Summarization** | Trigger blocks voice (Pitfall #6) | Defer to session end or background, never in critical path. |
| **Phase 3: Memory Cleanup** | Decay and staleness (Pitfall #10) | Add decay formula, reinforcement, refresh mechanism. |

---

## Integration Pitfalls (Voice + Memory)

### Critical Path Latency Budget (Voice)

Voice pipeline total latency budget (v1.7 requirement):
```
STT:             <1.0s (faster-whisper on GPU)
Prompt building: <0.5s (including memory retrieval)
  - buildContext: <0.2s
  - Memory retrieval: <0.2s
  - System prompt assembly: <0.1s
LLM inference:   2-3s (default for fast models)
TTS:             <2.0s (streaming, first token <100ms)
───────────────────────
Total:           ~5.5-6s
```

Memory intelligence changes:
- **If Memory Writer is sync**: adds 1-2s to LLM inference, breaks budget
- **If memory retrieval blocks prompt building**: adds 500ms-1s, breaks budget
- **If rolling summary triggers inline**: adds 3-5s, breaks budget severely

### Voice-Specific Testing Checklist

- [ ] Single-turn voice: measure latency with memory feature flag enabled
  - TTS should start <3s after STT completes
  - If >4s, investigate memory retrieval or Memory Writer
- [ ] Multi-turn voice (5+ turns): verify no latency creep
  - Each turn should be consistent (not slowing down)
  - P95 latency <6s per turn
- [ ] Concurrent memory + LLM operations
  - Simulate slow ChromaDB (add 500ms delay)
  - Voice response should not hang
- [ ] Memory Writer failure tolerance
  - Kill ChromaDB mid-test, verify voice still works
  - Chat logs show memory failure, but conversation continues
- [ ] Summarization trigger during voice
  - 20-turn voice conversation
  - No unexpected delays
  - Summary only triggers at session end

---

## Sources

- [Long-Term Memory LangChain Agents: LangGraph and LangMem Guide](https://atlan.com/know/long-term-memory-langchain-agents/)
- [10 Best AI Agent Memory Solutions in 2026 (Tested, Compared & GitHub-Ready)](https://powerdrill.ai/blog/best-ai-agent-memory-solutions)
- [LangChain Performance Optimization: Reduce Latency by 60% with These 8 Proven Techniques](https://markaicode.com/langchain-performance-optimization-reduce-latency/)
- [Zep x LangChain: Diagnosing and Fixing Slow Chatbots](https://blog.langchain.com/zep-x-langchain-slow-chatbots/)
- [Metadata Filtering - Chroma Docs](https://docs.trychroma.com/docs/querying-collections/metadata-filtering)
- [Vector Database Migration and Implementation: Lessons from 20 Enterprise Deployments](https://nimblewasps.medium.com/vector-database-migration-and-implementation-lessons-from-20-enterprise-deployments-027f09f7daa3)
- [Semantic vs Episodic vs Procedural Memory in AI Agents](https://medium.com/womenintechnology/semantic-vs-episodic-vs-procedural-memory-in-ai-agents-and-why-you-need-all-three-8479cd1c7ba6)
- [The Three Memory Systems Every Production AI Agent Needs](https://tianpan.co/blog/long-term-memory-types-ai-agents)
- [AI Agent Memory Explained: Types, Implementation & Best Practices](https://47billion.com/blog/ai-agent-memory-types-implementation-best-practices/)
- [Toward Low-Latency End-to-End Voice Agents for Telecommunications Using Streaming ASR, Quantized LLMs, and Real-Time TTS](https://arxiv.org/html/2508.04721v1)
- [12 Ways to Reduce Voice Agent Latency](https://getbluejay.ai/blog/12-ways-to-reduce-voice-agent-latency)
- [Reducing RAG Pipeline Latency for Real-Time Voice Conversations](https://developer.vonage.com/en/blog/reducing-rag-pipeline-latency-for-real-time-voice-conversations)
- [GitHub chroma-core/chroma Issue #1394: Very slow metadata filtering](https://github.com/chroma-core/chroma/issues/1394)
- [GitHub chroma-core/chroma Issue #4089: metadata filter does not work over 20 millions chunk](https://github.com/chroma-core/chroma/issues/4089)
- [Chroma Troubleshooting Guide](https://docs.trychroma.com/troubleshooting/)
- [How to Implement Long-Term Memory for AI Agents (2026)](https://atlan.com/know/how-to-implement-long-term-memory-ai-agents/)
