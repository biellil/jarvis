# Feature Research: Memory Intelligence for JARVIS

**Domain:** Conversational AI agent memory management and recall
**Researched:** 2026-04-19
**Milestone:** v1.8 Memory Intelligence
**Confidence:** HIGH — Multiple 2026 production sources, patterns validated across industry implementations

---

## Executive Summary

Memory intelligence transforms JARVIS from simple RAG (threshold-based retrieval) to a multi-layered memory system where the LLM actively controls what to remember. This research identifies four core features (Memory Writer, Typed Memory, Top-K Retrieval, Rolling Summarization) as table stakes for conversational continuity, with specific expected behaviors, edge cases, and UX impacts drawn from production systems in 2026.

**Key finding:** Memory extraction must run asynchronously (background) to avoid adding latency to response time. Synchronous extraction creates 60+ second delays, unacceptable for a conversational agent. Production systems achieve 0.2s p95 retrieval by doing heavy work at write time.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features essential for conversational continuity and memory coherence. Missing these = JARVIS forgets crucial context despite recent interactions.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Memory Writer — LLM-driven extraction after response** | User tells JARVIS something important (preference, decision, event). On next conversation, JARVIS should remember it without being explicitly prompted. This is the core expectation: "You remember what I told you." | **MEDIUM** | Runs async in background after LLM response sent to user. Never blocks conversation. Extracts discrete facts from both user message + assistant response. Separate node in LangGraph. |
| **Typed memory — Semantic, Episodic, Procedural** | Different types of information need different retrieval strategies. "I prefer coffee" (semantic) is stable; "We decided to ship Friday" (episodic) is time-bound; "Here's how to reset the widget" (procedural) is operational. Flat vector store can't distinguish. | **MEDIUM** | Router node classifies extracted facts into three types. Stored separately in ChromaDB with metadata tags. Retrieved independently. Type determines TTL, update policy, ranking. |
| **Top-K=5 per memory type without fixed threshold** | Current v1.7 uses threshold 0.7 globally—misses relevant context if no embeddings cross threshold. Production 2026 systems abandoned thresholds; retrieve top-5 always and let LLM decide relevance. Diversity matters more than similarity ceiling. | **LOW** | Change ChromaDB: `.query(query_texts, n_results=5)` instead of threshold filtering. Include all 5 results regardless of score. Metadata already supports type filtering. |
| **Context injection in buildContext() with proper ordering** | Existing system has RAG context built ad-hoc. v1.8 needs deterministic ordering: system prompt → [summary] → [semantic] → [episodic] → [procedural] → [recent messages]. Wrong order breaks coherence. | **LOW** | Refactor buildContext() with layer-based ordering. Add summary if triggered. Separate retrieval calls per type. Concatenate with explicit delimiters. |
| **Handling extraction failures gracefully** | LLM extraction occasionally fails (invalid JSON, empty output, timeout). System must not crash, lose conversation, or store garbage. | **MEDIUM** | Try-catch around extraction. On failure: log, skip memory write for that turn, continue conversation. Alert user only if frequent (3+). No visible impact. |

### Differentiators (Competitive Advantage)

Features that set JARVIS apart from basic RAG agents.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Rolling summarization every N messages** | After 10–15 messages, summarize old conversation and replace original messages with summary. Keeps context manageable without losing facts. Enables infinite conversations on 4K context models. Episodic memory captures "what happened" before summary. | **MEDIUM** | Trigger: message count ≥ N. LLM call: "Summarize preserving decisions, preferences, events." Replace old messages with summary. Keep last 5 messages verbatim. Asynchronous. |
| **Memory updates instead of append-only** | Most agents append facts forever. JARVIS updates existing facts if LLM detects contradiction or refinement. "User prefers Python" + "Actually TypeScript" = one semantic fact updated, not two conflicting ones stored. Prevents search degeneracy. | **HIGH** | Extraction includes "update if exists" logic. Router identifies fact type. Search for existing memory same type+entity. If found + LLM confirms related: merge instead of insert. Requires entity resolution (hard). |
| **Temporal metadata on episodic memories** | Episodic memories time-stamped. User can ask "What did we discuss last Tuesday?" or "Changed since then?" Temporal queries impossible without timestamp. Other agents ignore temporal dimension. | **LOW** | Add `timestamp` field to episodic memory JSON. LLM extracts event dates. Enable filtering by date range. Show date in memory display. |
| **Memory summaries visible to user (transparency)** | User can ask "What do you remember about my project?" and JARVIS shows extracted facts. Trust through transparency. Most agents hide memory internals. | **MEDIUM** | Add query tool: `/memory-show-semantic`. Lists all semantic memories. Lists recent episodic (past N days). User can delete false memories, correct facts. |

### Anti-Features (Avoid These)

Tempting features that create problems in practice.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Synchronous memory extraction (wait for LLM to extract, then return response)** | Seems logical: extract, store, respond. Feels complete. | Production 2026 data: 59.82s p95 latency. User experience unacceptable. Agent feels slow. Memory extraction dominates latency, defeats fast conversational goal. | Extract asynchronously after response sent. User never waits. Memory available next turn (~100ms). Trade: newest memories not immediately available (acceptable; users type at human speed). |
| **Threshold-based similarity filtering (keep 0.7)** | Threshold seems safe: "only confident matches." Actually excludes relevant context. Multi-factor queries ("budget AND timeline?"), top-5 all timeline. Threshold makes worse. | Best practice 2026: retrieve top-K always, let LLM rank. Most retrieved memories unused—fine. LLM excellent at ignoring irrelevant context. Pre-filtering results is worse: loses diversity, misses subtle connections. | Switch to fixed top-K (k=5 per type). No threshold. Include scores in context. Accept some retrievals unused. |
| **Store raw conversation text in memory** | Easy: take messages, embed, store in ChromaDB. | Vector store fills with duplicate facts, verbose noise. Retrieval returns five versions of same idea. Hard to update (which copy is "truth"?). Entity resolution fails (three phrasings of "Portland office"). | Extract discrete, atomic facts. Format as structured JSON: type, entity, value fields. One fact per memory, not one per message. Enables updates, precise retrieval. |
| **Indefinite memory growth (append-only forever)** | No deletion policy seems safest. | Quality degrades as store grows. Stale info conflicts with current facts. User preferences change; old memories contradict new. Unbounded storage. Silent failures: agent less responsive from irrelevant old facts. | Implement TTL: semantic 1 year (refresh on retrieval), episodic 3 months (fade old events), procedural indefinite (how-tos don't expire). Archive not delete. User override. |
| **Extract every single fact from every turn** | Completeness seems good. | Memory explosion. Most facts are conversational padding, not useful knowledge. "How are you?" → "User doing fine" (useless). High noise:signal breaks retrieval. | Filter with second LLM pass: "Worth remembering for future conversations?" Only store facts passing filter. Reduces bloat 70–80%. |
| **Treat all memories equally in retrieval** | Simpler code. | Episodic (past events) shouldn't weight equally with semantic (timeless facts). Procedural (how-tos) on fact queries wastes context. Types serve different purposes. | Retrieve per type. Combine in buildContext() with type-aware ordering. Semantic first (global context), episodic (what happened), procedural (if how-to). LLM doesn't parse mixed types. |

---

## Feature Dependencies

```
User sends message + gets response
    ├──requires──> LLM can respond (v1.7, existing)
    └──requires──> Memory Writer runs after response
                       ├──requires──> Extraction LLM call
                       ├──requires──> Type classification router
                       ├──requires──> ChromaDB storage (typed)
                       ├──fails gracefully→ Extraction failure handling
                       └──async background (no latency impact)

Next user message received
    ├──requires──> buildContext() assembles context
    │                ├──requires──> Retrieve semantic memories (top-5)
    │                ├──requires──> Retrieve episodic memories (top-5)
    │                ├──requires──> Retrieve procedural memories (top-5)
    │                ├──enhances──> Rolling summarization (if triggered)
    │                └──concatenates→ Layers: prompt → summary → memory → recent
    │
    └──message count >= N?
           └──triggers→ Rolling summarization (async)
                          ├──requires──> Previous messages exist
                          └──produces──> Conversation summary
                                           └──replaces→ Old messages in context

Updates & Corrections
    ├──Memory Writer detects contradiction
    │   └──requires──> Entity resolution (hard)
    │       └──enhances→ Memory updates instead of appends
    │
    └──User queries memory
        └──requires──> Memory transparency tool
            └──returns──> Typed memories with dates & confidence
```

### Dependency Notes

- **Memory Writer requires LLM response:** Can't extract facts until response complete. Must include user input + assistant output for context.
- **Type classification requires extraction:** Router classifies after raw facts extracted. Must run in same async task.
- **Top-K retrieval enhances buildContext():** Existing buildContext() returns flat context. Refactored version retrieves per type, combines.
- **Rolling summarization requires message history:** Needs N+ previous messages. Triggers only after threshold.
- **Extraction failure handling prevents data loss:** Must wrap Memory Writer in try-catch. Conversation continues regardless.
- **Memory updates conflicts with append-only:** Can't do both. v1.8 chooses append-only (simpler), updates deferred to v2.
- **Temporal metadata requires timestamp extraction:** LLM identifies and extracts event dates. Enable time-range queries.

---

## Expected Behaviors Per Feature

### Memory Writer

**What happens:**
1. User sends message → JARVIS responds → User sees response immediately
2. **Async background:** Extraction task runs parallel to next message handling
3. Extraction LLM receives: `Extract 3-5 key facts from this conversation` + user message + assistant response
4. LLM returns JSON: `{ facts: [ { type: "semantic|episodic|procedural", entity: "...", value: "...", confidence: 0.0-1.0 } ] }`
5. Router classifies each fact into memory type
6. Each fact embedded via Transformers.js model (in JARVIS stack)
7. Inserted into ChromaDB with metadata: `{ type, entity, confidence, timestamp }`

**User experience:**
- Zero latency impact — response sent immediately
- Memory available on next turn (100-500ms after extraction)
- If extraction fails: conversation continues, memory skipped, no error shown

**Edge cases:**
- Invalid JSON from LLM → logged, skipped, conversation continues
- Extraction timeout (>10s) → cancelled, memory skipped
- Network error storing to ChromaDB → retried async
- Duplicate facts from same turn → deduped by entity+value hash

---

### Typed Memory

**Expected states:**

1. **Semantic (stable, generalized facts)**
   - "User prefers Python," "User's timezone CET," "User works healthcare"
   - TTL: 1 year (refresh on retrieval; user can update)
   - Retrieval: keyword + semantic similarity
   - Update: LLM identifies contradictions, merges not appends

2. **Episodic (time-bound events)**
   - "Tuesday discussed shipping timeline," "User reported widget X error"
   - TTL: 3 months (fade old events, keep recent warm)
   - Retrieval: time-aware, filter by date range
   - Update: immutable (events happened when they happened)

3. **Procedural (operational how-tos)**
   - "Reset widget: Ctrl+R, wait 5s," "Feature branch workflow off staging"
   - TTL: indefinite (how-tos don't expire)
   - Retrieval: exact match on task keywords
   - Update: versioned (old version kept if changes)

**User experience:**
- "What coffee shops do I like?" → retrieves semantic
- "What did we work on last week?" → retrieves episodic (time-filtered)
- "How do I do X?" → retrieves procedural

**Edge cases:**
- Fact spans multiple types → stored in both with different emphasis
- Time extraction fails → stored without timestamp, still searchable
- Confidence very low (<0.6) → marked tentative, LLM downweights

---

### Top-K Retrieval (k=5 per type)

**Expected behavior:**
- User: "What's my project timeline?"
- buildContext() calls ChromaDB 3 times:
  - Semantic: `.query(["project timeline"], n_results=5, where={"type": "semantic"})`
  - Episodic: `.query(["project timeline"], n_results=5, where={"type": "episodic"})`
  - Procedural: `.query(["project"], n_results=5, where={"type": "procedural"})`
- All 15 memories passed to LLM with scores
- LLM reads all 15, uses relevant ones, ignores irrelevant

**User experience:**
- May include irrelevant context, but LLM handles
- Improved diversity: 5 different facts per type vs. 5 near-duplicates
- Better response quality (more options to choose from)

**Edge cases:**
- Fewer than 5 memories for a type → returns N<5 (fine)
- All 5 low similarity (0.3) → LLM receives with low confidence
- No exact match in vector space → top-5 closest approximations

---

### Rolling Summarization

**Trigger:** After message count >= 15 (configurable)

**What happens:**
1. Extract messages 1–10 (oldest ~10 turns)
2. LLM call: "Summarize preserving decisions, preferences, facts, action items"
3. Receives: "User building Python CLI. Prefers TDD. Chose Click. 2-week timeline. Deps: Click, pytest."
4. Insert as episodic memory: `{ type: "episodic", entity: "conversation_summary", value: "[summary]", is_summary: true, summary_covers_messages: 1-10 }`
5. Delete original messages 1–10 (archive if auditing)
6. Keep last 5 messages in full
7. New buildContext(): summary + last 5 = 6 items vs. 15 messages

**User experience:**
- Agent maintains context indefinitely
- Conversation feels continuous
- Answers "What did we discuss Tuesday?" correctly
- Old questions answered at summary-level (acceptable)

**Edge cases:**
- Summary LLM fails → don't summarize, retry next trigger
- Summary too long (>500 tokens) → truncate with marker
- User asks "What was our first message?" → retrieve from archive
- Detail lost in summary → mitigated by episodic extraction (facts still stored)

---

### Extraction Failure Handling

| Scenario | Behavior | User Impact |
|----------|----------|-------------|
| LLM returns `null` | Log error, skip write, continue | None — memory missing that turn |
| Malformed JSON | Parse error caught, skip write | None — conversation continues |
| Timeout (>10s) | Task cancelled, skip write | None — response already sent |
| Network error storing | Log warning, retry async | Minimal — fact lost if retry never succeeds |
| 3+ consecutive failures | Alert user: "trouble saving memories" | User aware, can restart or continue |
| Extract succeeds, classify fails | Store without type, mark `type: "unknown"` | Memory stored, less optimized retrieval |

**Design principle:** Extraction failure never blocks conversation or loses conversation data. Graceful degradation.

---

## Complexity Analysis Per Feature

### Memory Writer (MEDIUM)

**Why medium, not low:**
- New async node in LangGraph requires state management understanding
- Extraction prompt needs tuning to avoid hallucination
- Try-catch and logging must be production-ready
- Batching logic if extraction queue backs up

**Estimated effort:** 3-4 days (node, prompt, error handling, testing)

### Typed Memory (MEDIUM)

**Why medium, not low:**
- Metadata schema change requires testing all retrieval paths
- Type classification router must be reliable
- Three separate ChromaDB calls per retrieval
- TTL expiry job adds operational complexity

**Estimated effort:** 4-5 days (schema, router, retrieval refactors, cleanup)

### Top-K Retrieval (LOW)

**Why low:**
- Simple parameter change: `n_results=5` not threshold
- No new dependencies
- Remove old threshold code

**Estimated effort:** 1 day (change, test, validate)

### Rolling Summarization (MEDIUM)

**Why medium, not low:**
- New LLM call adds latency (async but still resource cost)
- Message archival must preserve audit trail
- Summary quality tuning (length, granularity)
- Edge case handling (too long, fails)

**Estimated effort:** 3-4 days (summarizer node, archival, edge cases)

### buildContext() Refactor (MEDIUM)

**Why medium, not low:**
- Heavily used function; changes ripple across agent
- Three retrieval calls not one (perf minimal but verify)
- Delimiter formatting must be LLM-parseable
- Testing must cover all scenarios (memory exists/missing/partial)

**Estimated effort:** 2-3 days (refactor, test, integration)

### Extraction Failure Handling (LOW)

**Why low:**
- Standard try-catch pattern
- Logging via existing loguru
- No new dependencies

**Estimated effort:** 1 day (wrap node, add tests)

---

## MVP Definition

### Launch With (v1.8 core)

- [x] **Memory Writer (async extraction)** — Core feature, enables "remembers" experience
- [x] **Typed memory (semantic + episodic + procedural)** — Differentiates from flat RAG
- [x] **Top-K retrieval without threshold** — Fixes v1.7 limitation
- [x] **Rolling summarization** — Handles infinite conversations
- [x] **buildContext() refactor with layer ordering** — Required for above
- [x] **Extraction failure handling** — Production robustness

### Add After Validation (v1.8.x / v1.9)

- [ ] **Memory updates instead of append-only** — Requires entity resolution. Defer until v1.9.
- [ ] **Temporal queries (date-range filtering)** — Nice-to-have after typing works.
- [ ] **Memory transparency tool (user sees/edits memories)** — Trust feature, add post-launch.
- [ ] **Procedural versioning** — Defer until multiple how-tos accumulate.
- [ ] **Memory TTL expiry job** — Implement nightly cleanup after semantics stable.

### Future Consideration (v2+)

- [ ] **Entity resolution and graph DB** — Hard problem. Defer to v2.
- [ ] **Multi-user memory isolation** — JARVIS single-user; add if shared later.
- [ ] **Memory export / backup UI** — Privacy feature, add when requested.
- [ ] **Fine-grained memory permissions** — Selective sharing. Future.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Memory Writer (async) | HIGH | MEDIUM | **P1** |
| Typed memory (semantic/episodic/procedural) | HIGH | MEDIUM | **P1** |
| Top-K retrieval (no threshold) | HIGH | LOW | **P1** |
| Rolling summarization | HIGH | MEDIUM | **P1** |
| buildContext() refactor | HIGH | MEDIUM | **P1** |
| Extraction failure handling | HIGH | LOW | **P1** |
| Memory updates (not append) | MEDIUM | HIGH | **P2** |
| Temporal metadata | MEDIUM | LOW | **P2** |
| Memory transparency tool | MEDIUM | MEDIUM | **P2** |
| Memory TTL/expiry | MEDIUM | LOW | **P3** |
| Procedural versioning | LOW | MEDIUM | **P3** |
| Entity resolution graph | LOW | HIGH | **P3** |

---

## Edge Cases & Mitigation

### Memory Extraction Quality

**Case:** LLM extracts hallucinations or nonsensical facts  
**Mitigation:** Start with low confidence scores. User deletes false memories via transparency tool (v1.9). Monitor confidence distribution.

### Memory Inflation

**Case:** Vector store grows to 100K+ memories, retrieval noisy  
**Mitigation:** TTL expiry (semantic 1 year, episodic 3 months). Monitor quality metrics. `MEMORY_MAX_SIZE_PER_TYPE=1000` warning if hit.

### Summarization Data Loss

**Case:** Important detail lost in summary  
**Mitigation:** Original episodic memory extraction should capture key facts. Dual capture safety. Accept acceptable loss of fine details.

### Async Extraction Lag

**Case:** User's newest memory not available immediately  
**Mitigation:** By design. Users type at human speed, 100ms-1s gaps. Memory comes from recent messages if immediate. Fine for conversational UX.

### Memory Filtering Brittleness

**Case:** Metadata filtering `where={"type": "semantic"}` fails  
**Mitigation:** Safe default: include if metadata missing. Fallback to type-agnostic retrieval if filtering fails.

---

## Testing Strategy

### Unit Tests

- Extraction: mock LLM, verify JSON parsing, type classification
- Storage: insert semantic/episodic/procedural, verify metadata
- Retrieval: fetch 5 per type, verify empty cases (k > n)
- buildContext: verify layer order, delimiters present
- Failure: extraction fails, verify graceful continuation

### Integration Tests

- End-to-end: message → extraction → storage → retrieval → next buildContext
- Summarization: 15 messages → trigger → summary created → archive → summary in context
- Types in retrieval: query matches semantic + episodic, verify correct ordering
- Async execution: extraction doesn't block conversation

### Manual Testing

- Ask JARVIS to remember a fact, close session, restart, ask if it remembers → should recall
- Provide conflicting info, verify extraction handles without crash
- Generate 50+ turns, verify summarization triggers
- Check ChromaDB for duplicates/malformed entries after extraction failures

---

## Success Metrics

### Quantitative

- **Memory recall accuracy:** ≥80% of explicitly stated facts within 2 months
- **Extraction rate:** ≥90% of user messages result in ≥1 memory
- **Type distribution:** Semantic 40%, episodic 35%, procedural 25%
- **Summary quality:** ≥95% of decisions/preferences preserved
- **Extraction latency:** <2s p95 (invisible to user)
- **Retrieval latency:** buildContext() <500ms (acceptable)

### Qualitative

- **User feedback:** "JARVIS actually remembers" vs. "JARVIS keeps forgetting"
- **Coherence:** Multi-turn conversations feel continuous
- **Trust:** User willing to rely on JARVIS as memory aid

---

## References & Sources

### 2026 Memory Architecture

- [AI Magicx — Agent Memory Architecture Deep Dive](https://www.aimagicx.com/blog/ai-agent-memory-architecture-developer-guide-2026) — Framework for memory types, storage, retrieval patterns
- [Mem0 — State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) — Production benchmarks, latency data, hybrid architecture
- [MachineLearning Mastery — Beyond Short-term Memory](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/) — Semantic/episodic/procedural distinction
- [ByteRover — Agent-Native Memory](https://arxiv.org/html/2604.01599v1) — LLM-curated extraction, hierarchical context

### Memory Extraction & Writing

- [Atlan — How to Implement Long-Term Memory (2026)](https://atlan.com/know/how-to-implement-long-term-memory-ai-agents/) — Extraction vs. summarization, async patterns
- [Hindsight — LangGraph Long-term Memory](https://hindsight.vectorize.io/blog/2026/03/24/langgraph-longterm-memory) — Async memory nodes, LangGraph patterns
- [SimpleMem GitHub](https://github.com/aiming-lab/SimpleMem) — Structured memory extraction reference

### Context Compression & Summarization

- [Factory.ai — Context Compression Evaluation](https://factory.ai/news/evaluating-compression) — Anchored iterative summarization, 36K session benchmark
- [Mem0 — Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) — Window sizes, frequency, best practices
- [Medium — Context Compression for LLM Agents](https://medium.com/the-ai-forum/automatic-context-compression-in-llm-agents-why-agents-need-to-forget-and-how-to-help-them-do-it-43bff14c341d) — Context rot, failure modes

### Retrieval Strategies

- [Getmaxim — xMemory Why Top-K Breaks](https://www.getmaxim.ai/blog/xmemory-why-top-k-retrieval-breaks-for-agent-memory/) — Top-K failure modes, hybrid approaches
- [Zilliz — Metadata Filtering & Hybrid Search](https://zilliz.com/blog/metadata-filtering-hybrid-search-or-agent-in-rag-applications) — Filtering strategies, hybrid retrieval
- [TianPan — Graph Memory for LLM Agents](https://tianpan.co/blog/2026-04-10-graph-memory-llm-agents-relational-reasoning) — Entity resolution, relationship modeling

### Edge Cases & Failure Modes

- [Atlan — Memory Extraction Edge Cases](https://atlan.com/know/how-to-implement-long-term-memory-ai-agents/) — Entity ambiguity, vector limitations, namespace failures
- [Mem0 — AI Memory Management](https://mem0.ai/blog/ai-memory-management-for-llms-and-agents) — Accumulation, schema evolution, silent failures

### LangChain/LangGraph Integration

- [LangGraph Docs](https://docs.langchain.com/oss/javascript/langgraph/overview) — Async nodes, state management, store integration
- [Markaicode — LangGraph Memory Patterns](https://markaicode.com/langgraph-memory-short-term-long-term-storage/) — Short/long-term node design

---

**Research completed:** 2026-04-19  
**Confidence:** HIGH — Multiple production 2026 sources, patterns validated across industry  
**Gaps for phase-specific research:** Entity resolution implementation (hard, may need proof-of-concept); TTL tuning (empirical post-v1.8)
