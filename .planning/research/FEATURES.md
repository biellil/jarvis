# Feature Landscape: v3.6 GPU Multi-Platform + OpenRouter + Memory/Performance

**Project:** JARVIS v3.6  
**Domain:** Personal voice assistant (Python desktop, multi-platform Linux/Windows/macOS)  
**Researched:** 2026-06-02  
**Confidence:** MEDIUM (ecosystem patterns verified; feature-specific UX patterns need phase validation)

---

## Table Stakes (Expected Features)

Users of a personal voice assistant on v3.5 expect these features to continue working without degradation. Missing = feels broken.

| Feature | Why Expected | Complexity | Status | Notes |
|---------|--------------|-----------|--------|-------|
| Multi-LLM support (LM Studio/Claude/OpenAI/Gemini) | v3.5 shipped; switching providers is core UX | Small | Existing | Add OpenRouter as 5th provider (same abstraction layer) |
| Voice I/O (STT→LLM→TTS) in 3 modes (PTT/wake-word/always-listening) | v3.5 shipped; zero-handed operation expected | Small | Existing | Performance optimization only; no new features |
| Speaker recognition (v3.5 spk-01..10) | v3.5 shipped; users expect voice-based identity continuity | Small | Existing | Extend to per-speaker memory isolation (new feature below) |
| Persistent memory (ChromaDB + SQLite) | v3.3–v3.5 shipped; users expect to not repeat themselves | Small | Existing | Enhance with hybrid retrieval + per-speaker isolation (new features below) |
| PC Control (launch_app, close_app, read_file, volume, media) | v3.4 shipped; users expect remote execution without mouse | Small | Existing | No new PC control features in v3.6 |
| Config menu (/config) with hot-swap | v3.5 shipped; users expect stateless configuration switching | Small | Existing | Reorganize flat 10-item menu (see Polish features below) |

---

## Differentiators (Value-Adding Features)

Features users don't expect but will value highly. Not in competing voice assistants (yet).

### 1. GPU Multi-Platform Auto-Detection & Acceleration

**What:** Automatic detection of GPU (CUDA/ROCm/Metal/Vulkan) per OS, cascade best-fit→fallback, transparent to user. Applied to Whisper (STT), Chatterbox (TTS), and Kokoro (TTS).

**Why Valuable:**
- **Latency:** GPU inference 4-10x faster than CPU (Chatterbox: 14s→1-2s per response on NVIDIA/AMD; Whisper: 5s→1s on large model)
- **User Signal:** Hardware-aware "Just Works" experience — users purchase M1 MacBook or RTX 4090 and expect automatic acceleration, not manual `CUDA_VISIBLE_DEVICES` configuration
- **Competitive Gap:** Ollama, LM Studio, and llama.cpp all auto-detect GPU transparently; JARVIS should match

**Complexity:** Medium (3 OS branches × 4 GPU backends, with fallback logic)

**Dependencies:**
- Requires `torch` backend detection per OS (existing: WGPU-01..03 from v3.3, extended in v3.6)
- Chatterbox already has `_detect_chatterbox_device()` (ROCM-WINDOWS-IMPLEMENTATION.md confirms automatic detection)
- Kokoro on Metal/ROCm not yet validated

**Cascade Order (per research):**
- **Windows:** CUDA (NVIDIA) → ROCm (AMD RDNA2+) → CPU
- **Linux:** CUDA (NVIDIA) → ROCm (AMD) → Vulkan (fallback generic) → CPU
- **macOS:** Metal (Apple Silicon) → CPU (Intel Macs have no iGPU support in PyTorch as of 2026)

**Transparency & Fallback:**
- User never sees device selection; logs show detected device (info level, not debug)
- Silent fallback on NotImplementedError (e.g., Chatterbox voice cloning not implemented on Metal)
- `jd setup` detects hardware, recommends extras (`[amd-gpu-windows]`, `[nvidia-gpu]`, `[metal-gpu]`)

**Model Requirements per GPU Tier:**
- Whisper: large on 4GB+ VRAM, base on <2GB, CPU fallback always available (WGPU-02 from v3.3)
- Chatterbox: ~8GB VRAM typical; ROCm+torch 2.9.1 requires HIP SDK on Windows (ROCM-WINDOWS-IMPLEMENTATION.md)
- Kokoro: ~2GB for generation; streaming can reduce peak memory

---

### 2. OpenRouter LLM Provider (Starting Free Tier)

**What:** Add OpenRouter as 6th LLM provider (after LM Studio, Anthropic, OpenAI, Gemini, and future providers). **Start with free tier only** — no API key required, using `:free` models.

**Why Valuable:**
- **Cost-Aware:** Free tier enables users to experiment with 25+ models (Llama 3.1 8B, Gemini 2.0 Flash, DeepSeek R1 free, Mistral 7B) without paying, supporting "privacy-first by default" philosophy
- **Model Diversity:** OpenRouter aggregates models from Meta, Google, Mistral, DeepSeek — single API endpoint for testing multiple providers' reasoning and quality
- **Future Migration Path:** Structured for paid tier later (just add `OPENROUTER_API_KEY` to `.env`)

**Complexity:** Small (same LangChain abstraction layer as existing providers)

**Available Free Models (as of June 2026):**

| Model | Provider | Use Case | Limits |
|-------|----------|----------|--------|
| `meta-llama/llama-3.1-8b-instruct:free` | Meta | General instruction, voice agent base | 20 req/min, 200 req/day |
| `google/gemini-2.0-flash-exp:free` | Google | Fast, reasoning, vision-ready | 20 req/min, 200 req/day |
| `deepseek/deepseek-r1:free` | DeepSeek | Complex reasoning, step-by-step | 20 req/min, 200 req/day |
| `mistral/mistral-7b-instruct:free` | Mistral | Fast, lightweight | 20 req/min, 200 req/day |

**Critical UX Consideration:** Always include `:free` suffix in model name. Without it, requests route to paid tier if credits exist on account — will cause unexpected charges.

**Rate Limit Handling:**
- Free tier: 20 requests/minute default, 50-200 requests/day
- Upgrade (future): $10 one-time spend → 1000 requests/day (unlimited /min, never expires)
- Fallback: If rate-limited, silently retry with backoff or cascade to next provider (existing pattern from v3.4)

**Integration:**
- New `llm_factory.py` branch: `if provider == "openrouter" and api_key == "": model_id += ":free"`
- `.env` new var: `OPENROUTER_API_KEY` (optional; leave empty for free tier)
- `/config` menu gains OpenRouter provider option alongside LM Studio, Anthropic, OpenAI, Gemini

---

### 3. Hybrid Memory Retrieval (Semantic + Keyword + Recency)

**What:** When retrieving context for the LLM, query both dense vector embeddings (semantic similarity) and sparse keyword matching (BM25), fuse results via Reciprocal Rank Fusion (RRF), re-rank by recency.

**Why Valuable:**
- **Accuracy Lift:** 7.4% NDCG improvement over pure vector or pure keyword search alone (research benchmark)
- **Real Example:** User says "that bug I mentioned last Tuesday" → keyword match catches "bug" + "Tuesday", vector match catches semantic paraphrase; fusion catches both
- **Mitigates:** Pure vector search fails on exact entity names or product codes; pure keyword fails on paraphrased concepts

**Complexity:** Medium (requires BM25 implementation or ChromaDB hybrid plugin, new retrieval orchestration)

**Architecture:**
```
Query (user message)
  ↓
  ├─→ BM25 sparse retrieval (SQLite FTS on conversation text)
  │    └─→ Ranks by term frequency + document frequency
  ├─→ ChromaDB dense retrieval (semantic embeddings)
  │    └─→ Ranks by cosine similarity
  ↓
  Reciprocal Rank Fusion (RRF)
  - RRF_score(doc) = Σ(1 / (k + rank(doc))) for each retriever
  - k = 60 (typical)
  ↓
  Re-rank by recency (penalize docs >30 days old slightly)
  ↓
  Top-5 results → inject into LLM context
```

**Why RRF:** Can't naively average BM25 (0-50 scale) and vector distance (0-2 scale) — RRF ranks-only fusion solves this without score calibration.

**Dependencies:**
- SQLite FTS (already in CLAUDE.md stack for structured storage) — add `CREATE VIRTUAL TABLE` for full-text search
- ChromaDB already configured (v3.5 shipped with semantic retrieval)
- Embedding model: sentence-transformers all-MiniLM-L6-v2 (already loaded for speaker d-vector, can share)

**Expected Impact:**
- STT errors: "what's that file I deleted last month?" → keyword catches "deleted" even if Whisper transcribes "file" as "vile"
- Paraphrases: "summarize what we discussed yesterday" → semantic match finds prior conversations by topic even if phrasing differs
- Time References: "last Tuesday" → recency re-ranking penalizes unrelated results from 2 months ago

---

### 4. Per-Speaker Memory Isolation

**What:** Extend v3.5 speaker recognition (SPK-01..10) to partition memory by speaker. Each recognized speaker has isolated conversation history + semantic memory, with optional shared knowledge base.

**Why Valuable:**
- **Multi-User Household:** Partner uses voice assistant for their schedule; you don't want to see their tasks in your task list
- **Voice Agent Natural Expectation:** When users switch speakers mid-session, they expect context to reset (or minimize leakage)
- **Privacy:** Sensitive memories (health, finances) stay isolated by speaker

**Complexity:** Medium (requires database schema changes + query filtering)

**Architecture:**
```
Memory Tables (SQLite + ChromaDB)
  ├─ conversations (id, speaker_name, timestamp, text)
  ├─ memories (id, speaker_name, type, content, embedding_id)
  ├─ shared_knowledge (id, content, embedding_id) -- optional shared facts
  └─ speaker_profiles (name, confidence_threshold, created_at)

Retrieval Flow:
  1. Identify speaker (v3.5 identify_speaker() returns {name, confidence})
  2. Query: "SELECT * FROM memories WHERE speaker_name = ? OR is_shared = true"
  3. Hybrid retrieval: BM25 + ChromaDB both filtered by speaker
  4. LLM sees: "You're talking to [Speaker Name]. Context: [their memories + shared]"
```

**Integration:**
- Depends on v3.5 speaker recognition module (already shipped, SPK-01..10)
- SQLite schema migration: add `speaker_name` foreign key to conversation/memory tables
- ChromaDB metadata: add `{"speaker": "name", "shared": false}` to all stored embeddings
- New validation: `_verify_speaker_memory_consistency()` ensures no cross-contamination

**Gradual Rollout:** Start with isolation only (no sharing); add shared knowledge base later if needed.

---

### 5. `/memory` Command for Inspection & Management

**What:** New terminal command `/memory` to view, edit, delete, and promote memories. Gives user control over what JARVIS remembers.

**Why Valuable:**
- **Trust:** Users see what's being remembered; can delete wrong assumptions ("no, I don't have cats")
- **Correction:** Fix hallucinated memories ("I never said that")
- **Cleanup:** Remove noise from early sessions before tuning stabilized
- **Prioritization:** "Promote" important facts to core memory (always in context window, not retrieved)

**Complexity:** Medium (CLI subcommands + search + validation)

**Command Surface:**

```
/memory list [--speaker NAME] [--limit 10] [--recent]
  → List last 10 memories (or filter by speaker, limit, or sort by recency)
  → Output: memory_id | date | speaker | content | type (semantic/episodic/procedural)

/memory search <query> [--speaker NAME]
  → Semantic search + keyword search (same hybrid retrieval)
  → Output: top-5 results with memory_id

/memory inspect <memory_id>
  → Show full record: id, speaker, timestamp, type, content, embedding, source_turn

/memory edit <memory_id> <new_content>
  → User confirms: "Replace '[old text]' with '[new text]'? (y/n)"
  → Update in SQLite + re-embed in ChromaDB

/memory remove <memory_id> [--reason brief_note]
  → User confirms: "Delete memory '[text]'? (y/n)"
  → Log deletion reason in audit table (for learning)

/memory promote <memory_id>
  → Mark as "core_memory" = true in SQLite
  → Always inject into LLM context (never filtered, <200 tokens max)

/memory promote-default [--speaker NAME]
  → Auto-promote top-3 most recent facts by speaker
  → Keeps essential identity facts in context

/memory export [--format json|csv] [--speaker NAME]
  → Dump memories for backup or manual review
```

**UI Patterns from MemGPT/Letta (2026 ecosystem):**
- Letta's three-tier memory (core/recall/archival) — we do semantic/episodic/procedural, map similarly
- Mem0 emphasizes CRUD + search; Letta emphasizes tiers + agent self-editing
- **JARVIS Approach:** Simple CRUD (no agent self-editing yet) + two tiers (core for promotion, recall for retrieval)

**Dependencies:**
- SQLite schema: add `is_promoted`, `edit_reason`, `deletion_reason` columns
- New module `memory_cli.py` for command parsing and validation
- Integration in `chat_loop()`: detect `/memory` prefix, delegate to memory_cli

---

### 6. Streaming TTS (Reduce Perceived Latency)

**What:** Stream audio output while LLM is still generating. Chunk LLM response at sentence boundaries, synthesize each chunk immediately, play while next chunk synthesizes.

**Why Valuable:**
- **Perceived Latency:** User hears audio in <300ms (first audio from TTS) instead of <1500ms (wait for full LLM response)
- **Natural Conversation:** Removes "awkward silence" that breaks immersion in voice assistants
- **JARVIS Competitive Edge:** Most local voice assistants batch TTS (wait for full response); streaming feels more responsive

**Complexity:** Large (requires LLM stream buffering, sentence splitting, concurrent TTS)

**Architecture:**
```
LLM Streaming Response
  ↓
  Sentence Splitter (Punkt, OpenAI Tiktoken, or simple regex)
  ├─ Buffer until sentence boundary (".", "!", "?", ":", dialogue boundary)
  ├─ Usually 1-3 sentences = ~100-300 tokens
  ↓
  TTS Queue (async)
  ├─ Enqueue sentence immediately (don't wait for synthesis)
  ├─ Start playing audio while buffering next sentences
  ├─ Chunk 1: "Hello, how are you today?" → synthesize (150ms) → play (2s)
  └─ Chunk 2: (queued while Chunk 1 playing) "I'm here to help." → synthesize (80ms) → play (1s)

Output Timeline:
  T+0ms:    LLM token 1 arrives
  T+150ms:  First audio from Chunk 1 starts playing (sentence boundary reached)
  T+1500ms: LLM finishes (Chunk 3 queued), Chunk 1 still playing
  T+2000ms: Chunk 1 finishes, Chunk 2 starts playing
  T+3000ms: Chunk 2 finishes, Chunk 3 starts playing
  T+4000ms: All done, agent idle
```

**Tradeoff — Phoneme Context Loss:**
- Streaming uses <5 sentences of context vs batch TTS using full paragraph
- Risk: Entity mispronunciation ("München" vs "Munchen") if context too narrow
- Mitigation: Sentence chunking preserves most entity context for typical responses (<5 sentences)

**Dependencies:**
- LLM response already streaming (v3.3 SSE integration in chat.py)
- TTS providers: Kokoro (supports streaming via sentence boundary), Chatterbox (batch only, can buffer), ElevenLabs (native streaming)
- New module `tts_streamer.py`: sentence splitting + queue management

**Implementation Priority:**
1. Kokoro streaming (offline, owned by us)
2. ElevenLabs streaming (simple API, fallback available)
3. Chatterbox (batch → queue; lower priority)

**Latency Budget (research-backed):**
- VAD + capture: 50ms
- STT (Whisper): 150ms
- LLM TTFT (LM Studio/OpenRouter): 400ms
- TTS first-chunk (streaming): 150ms
- **Total: ~750ms** (acceptable for voice conversation; 800ms is "feels responsive")

---

### 7. Performance Instrumentation & Observability

**What:** Add metrics (TTFT, TTFA, end-to-end latency, memory usage) instrumented via Langfuse (already in v3.4+).

**Why Valuable:**
- **Debugging:** When users report "slow response", know exactly where time is spent (STT? LLM? TTS?)
- **Tuning:** A/B test different memory retrieval strategies, GPU backends, model choices with data
- **Regression Detection:** Catch performance degradation before shipping to users

**Complexity:** Small (Langfuse already integrated; add 5-10 custom spans)

**Metrics to Add:**

| Metric | What It Measures | Alert Threshold |
|--------|-----------------|-----------------|
| TTFT (Time To First Token) | LLM response latency | >1s → investigate STT or LLM wait |
| TTFA (Time To First Audio) | TTS latency | >500ms → check TTS provider |
| E2E (End-to-End) | Voice in → Voice out | >3s → slow somewhere |
| Memory retrieval latency | BM25 + vector + RRF | >200ms → optimize queries |
| STT latency | Audio → text | >2s on large model? check GPU |
| Memory size | ChromaDB collections + SQLite | warn >500MB |

**Integration:**
- Existing: Langfuse CallbackHandler in `graph.stream()` (v3.4 shipped)
- New: Manual span creation in `tts.py`, `stt.py`, `memory.py` for non-LLM ops
- Dashboard: Pre-built Langfuse dashboard (free tier, self-hosted via Docker Compose already in infra/)

---

## Anti-Features (Explicitly NOT Building)

Features outside v3.6 scope; defer to future milestones or avoid entirely.

| Anti-Feature | Why Not | What to Do Instead |
|--------------|---------|-------------------|
| **Agent self-editing memory** (MemGPT/Letta style) | Adds complexity; JARVIS is thin client, not thick agent | Start with user commands (`/memory edit`); agent self-editing is v4.0 |
| **Shared knowledge base** (multi-speaker learning) | Privacy-first constraint; not MVP | Implement per-speaker isolation first (v3.6); sharing is opt-in later |
| **Vision + memory context** (screen analysis → memory) | Orthogonal feature; memory system doesn't yet support image embeddings | Keep vision pipeline separate; future integration |
| **Multi-turn context compression** (rolling summarization v3.5 is sufficient) | v3.5 already shipped rolling summarization (threshold 20 turns); further optimization is v4.0 | Current approach: summarize when >20 turns in session |
| **Whisper streaming** (incremental transcription) | Adds complexity to state machine; not critical for MVP | streaming TTS latency sufficient for MVP; streaming STT deferred |
| **GPU driver auto-installation** | OS-level complexity, liability risk | Document prerequisites in setup guide; user installs HIP SDK / CUDA / Xcode via OS package manager |
| **Multi-GPU support** (data parallelism) | Single-user assistant doesn't need parallelism | Detect first GPU only; defer to future if needed |
| **Quantization UI** (let user choose int8 vs fp16) | Adds config surface; auto-select by device+VRAM works for MVP | Auto-select in `_detect_device()` + `_select_model_for_device()` (existing logic) |

---

## Feature Dependencies & Ordering

### Critical Path (Must-Have for v3.6)
1. **GPU Multi-Platform Detection** → enables TTS/STT performance improvements
2. **OpenRouter Free Tier** → new provider (independent, can ship in parallel)
3. **Hybrid Memory Retrieval** → improves context quality (depends on existing ChromaDB/SQLite, independent feature)

### Medium Priority (Should-Have)
4. **Per-Speaker Memory** → depends on #3 (hybrid retrieval), extends v3.5 speaker recognition
5. **Streaming TTS** → depends on #1 (GPU for TTS performance makes streaming worthwhile)

### Low Priority (Nice-to-Have)
6. **`/memory` Command** → standalone, can ship anytime (depends on #4 for speaker isolation)
7. **Performance Instrumentation** → observability, independent of other features

---

## MVP Recommendation for v3.6

**Must-Ship (Blocking):**
1. GPU Multi-Platform Detection (medium complexity, high impact on latency)
2. OpenRouter Free Tier (small complexity, high impact on accessibility)
3. Hybrid Memory Retrieval (medium complexity, improves context quality)

**Should-Ship (High Value):**
4. Per-Speaker Memory Isolation (medium complexity, essential for multi-user households)
5. `/memory` Command (medium complexity, builds trust, enables user control)

**Nice-to-Ship (If Time Permits):**
6. Streaming TTS (large complexity, polish feature)
7. Performance Instrumentation (small complexity, enables future tuning)

**Defer to v3.7+:**
- Agent self-editing memory
- Whisper streaming
- Multi-GPU support
- Vision+memory integration

---

## Feature Complexity & Effort Estimate

| Feature | Size | Phase Count (est.) | Required Expertise | Risk |
|---------|------|-------------------|-------------------|------|
| GPU Multi-Platform Detection | Medium | 3-4 phases | PyTorch device API, torch.cuda behavior on Metal/ROCm | Medium (untested on all OS+GPU combos) |
| OpenRouter Free Tier | Small | 1-2 phases | LangChain provider abstraction (already mastered) | Low (copy pattern from existing providers) |
| Hybrid Memory Retrieval | Medium | 3-4 phases | SQLite FTS, RRF algorithm, retrieval orchestration | Medium (algorithm correct but requires testing) |
| Per-Speaker Memory Isolation | Medium | 2-3 phases | Database schema evolution, query filtering | Low (straightforward filtering) |
| `/memory` Command | Medium | 2-3 phases | CLI arg parsing, validation, Langfuse logging | Low (standard CRUD patterns) |
| Streaming TTS | Large | 4-5 phases | Async concurrency, sentence splitting, queue management | High (concurrency bugs common) |
| Performance Instrumentation | Small | 1-2 phases | Langfuse custom spans (familiar from v3.4) | Low (observability is additive) |

---

## Validation Checkpoints

| Feature | Test | Validation Approach |
|---------|------|-------------------|
| GPU Multi-Platform | E2E speech pipeline on CUDA/ROCm/Metal | Manual test on each OS; automation via llama.cpp benchmark |
| OpenRouter Free Tier | Rate limit recovery + fallback cascade | Inject rate-limit HTTP 429, verify retry logic |
| Hybrid Retrieval | Recall accuracy (BM25 vs vector vs hybrid) | Benchmark on 50 test queries; measure NDCG lift |
| Per-Speaker Memory | No cross-speaker context leakage | 3-speaker scenario: verify Speaker B doesn't see Speaker A's memories |
| `/memory` Command | Mutation consistency | Edit → search → verify changed text appears |
| Streaming TTS | First-audio latency <300ms | Measure wall-clock time from LLM start to audio playback start |
| Performance Instrumentation | Langfuse dashboard shows metrics | E2E test; check dashboard updates in real-time |

---

## Sources

- [CUDA vs ROCm vs Vulkan vs Metal: GPU Compute in 2026](https://orchestrator.dev/blog/2026-05-24-gpu-compute-platforms-comparison/)
- [Ollama GPU Acceleration Configuration: CUDA, ROCm, and Metal](https://eastondev.com/blog/en/posts/ai/20260516-ollama-gpu-acceleration/)
- [ROCm vs CUDA for Local AI in 2026](https://insiderllm.com/guides/rocm-vs-cuda-local-ai-2026/)
- [OpenRouter Free API 2026: Best Strategy To Maximize Free Models](https://buldrr.com/openrouter-free-api-keys-free-models-simple-guide/)
- [OpenRouter Free Tier 2026: 28+ Models, Limits, BYOK Setup](https://klymentiev.com/blog/openrouter-free-tier)
- [Hybrid Search: BM25, Vector & Reranking Reference 2026](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026)
- [Hybrid Search for RAG: Vector + Keyword + Reranking Guide 2026](https://www.buildmvpfast.com/blog/hybrid-search-rag-vector-keyword-reranking-2026)
- [What is Reciprocal Rank Fusion?](https://www.paradedb.com/learn/search-concepts/reciprocal-rank-fusion)
- [Designing Voice Assistants: STT, LLM, TTS, Tools, and Latency Budget](https://smallest.ai/blog/designing-voice-assistants-stt-llm-tts-tools-latency-budget)
- [Best Speech-to-Speech APIs in 2026: Architecture, Latency](https://inworld.ai/resources/best-speech-to-speech-apis)
- [State of AI Agent Memory 2026: Benchmarks, Architectures & Production Gaps](https://mem0.ai/blog/state-of-ai-memory-2026)
- [A memory fabric for conversational AI agents enabling shared and persistent multiuser memory](https://link.springer.com/article/10.1007/s44163-026-00992-z)
- [Letta API Platform | Letta Docs](https://docs.letta.com/concepts/memgpt/)
- [Mem0 vs Letta (MemGPT): AI Agent Memory Compared (2026)](https://vectorize.io/articles/mem0-vs-letta)
