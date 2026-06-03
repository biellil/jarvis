# Domain Pitfalls: v3.6 GPU Multi-Platform + OpenRouter + Memory + Performance

**Domain:** Voice Assistant (Python desktop + TypeScript gateway)
**Researched:** 2026-06-02
**Version Context:** Building on v3.5 (Chatterbox + Speaker Recognition shipped)

---

## Critical Pitfalls

### Pitfall 1: Torch Version Conflict Cascades Across GPU Backends

**What goes wrong:** v3.5 ships `torch==2.6.0` pinned in `uv.lock` (CPU). Adding GPU support requires:
- Windows AMD → `torch==2.9.1+rocm7.2.1` (custom repo URL)
- Windows NVIDIA → `torch==2.11.x+cu121` (PyTorch index)
- Linux CUDA/ROCm → `torch==2.9.x` or newer
- macOS Metal → `torch==2.9.x` (arm64 only)

**Why it happens:** 
1. Chatterbox TTS (v0.2.0+) pins `torch>=2.6.0` but doesn't account for GPU variants
2. faster-whisper (via ctranslate2) requires `torch>=2.0` but has no GPU preference
3. uv.lock is deterministic — switching torch versions mid-project breaks determinism
4. AMD ROCm wheels aren't on PyPI — must use `pip install --no-deps` + manual dependency management
5. torch 2.6.0 doesn't have ROCm 7.2.1 wheels; 2.9.1 does but breaks Chatterbox API in some ops

**Consequences:**
- **Breakage:** Chatterbox fails at inference with API mismatch between torch versions
- **Silent degradation:** GPU device detection passes but inference crashes mid-generation
- **User confusion:** "Why does TTS work offline but fail when GPU is available?"
- **Recovery delay:** Users must manually uninstall/reinstall torch + chatterbox

**Prevention:**
- **Step 1:** Test Chatterbox explicitly with torch 2.9.1 before shipping GPU support. Create isolated test environment and verify `generate()` method works.
- **Step 2:** Never pin a single torch version in `uv.lock`. Use extras in `pyproject.toml` for platform-specific variants.
- **Step 3:** Create `src/gpu_init.py` with explicit version checks and graceful fallback to CPU.
- **Step 4:** Add integration test that initializes TTS on GPU + falls back to CPU without crash.

**Detection:** During `jd setup`, validate torch version and Chatterbox compatibility. Log a warning if mismatch detected. Offer rollback to CPU.

---

### Pitfall 2: GPU Detection Returns False Positives — App Crashes at Inference

**What goes wrong:** v3.6 adds GPU detection (NVIDIA CUDA, AMD ROCm, macOS Metal). Common false positives:
1. **Windows:** HIP SDK installed but GPU is older architecture (< RDNA2) → `torch.cuda.is_available()` returns `True` but inference fails with "Kernel not supported"
2. **Linux:** NVIDIA driver installed but `CUDA_VISIBLE_DEVICES` unset → app sees GPU but can't use it
3. **macOS:** `torch.backends.mps.is_available()` returns `True` on Intel Macs with no GPU
4. **Multi-GPU:** App detects GPU 0 but it's in use by another process → inference stalls, appears hung

**Why it happens:**
- PyTorch detection (e.g., `torch.cuda.is_available()`) checks for driver/SDK, not actual device capability
- Architecture compatibility (RDNA2 vs RDNA1) requires reading GPU properties, not just "is GPU present"
- `torch.cuda.is_available()` doesn't verify GPU is free or accessible
- Users often upgrade SDK without upgrading GPU hardware

**Consequences:**
- **Hard crash:** Inference starts, then fails midway with cryptic CUDA/HIP error, user has to force-kill JARVIS
- **Timeout:** GPU appears available but can't execute → inference never returns, conversation stalls
- **Fallback failure:** Crash happens too early to catch in try/except, no CPU fallback triggered
- **Regression:** v3.5 (CPU-only) worked fine; v3.6 broke it

**Prevention:**

- **Step 1:** Implement safe GPU detection that validates device works before relying on it:
  ```python
  def _get_safe_device():
      candidates = []
      if torch.cuda.is_available():
          try:
              test = torch.zeros(1, device="cuda:0")
              del test
              candidates.append(("cuda:0", "nvidia"))
          except RuntimeError:
              logger.warning("CUDA available but not usable")
      
      if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
          try:
              test = torch.zeros(1, device="mps")
              del test
              candidates.append(("mps", "apple_metal"))
          except RuntimeError:
              logger.warning("MPS available but not usable")
      
      candidates.append(("cpu", "cpu"))
      return candidates[0]  # Return first working candidate
  ```

- **Step 2:** Test GPU viability at startup and cache result. Log GPU decision clearly.

- **Step 3:** Validate GPU at cold start with `jd validate-gpu` command that tests CUDA/MPS/ROCm availability.

- **Step 4:** Document Windows AMD minimum requirement (RDNA2+) in setup wizard with GPU model detection.

**Detection:** During test suite, add GPU availability check. If `config.prefer_gpu=True` but device ends up as CPU, fail test with clear message. In production, log GPU decision at startup.

---

### Pitfall 3: Sentence Boundary Detection Fails — Streaming TTS Produces Choppy/Repeated Audio

**What goes wrong:** v3.6 adds streaming TTS (speak while LLM is still generating). Common failures:
1. **Sentence detection too aggressive:** "Dr. Smith said hello." → splits into 3 chunks ["Dr.", "Smith said", "hello."] because periods are naive triggers
2. **Buffering lag:** Audio chunk 1 completes, but chunk 2 hasn't arrived yet → gap in playback, sounds like stutter
3. **Repeated sentences:** Queue receives ["Hello.", "Hello. How are you?"] → plays "Hello." twice because buffering doesn't deduplicate
4. **Interrupt lag:** User says "stop" but TTS is already 100ms into next chunk → last chunk plays anyway
5. **Newlines confuse detection:** Code sends "\n\nNew paragraph" as new sentence — produces silence gaps

**Why it happens:**
- Most sentence splitters (nltk.tokenize, spacy, regex) are trained on formal English, fail on abbreviations ("Dr.", "Mr.", "etc.") and elipses
- LLM token-by-token streaming means sentences arrive mid-token
- Audio playback has inherent latency (device buffer time ~200ms), hard to match with text arrival
- Interrupt handling (SIGTERM, Ctrl+C) is asynchronous — takes time to propagate to TTS thread

**Consequences:**
- **Poor UX:** User perceives TTS as robotic, stuttering, or skipping content
- **Confusion:** User hears "Dr." alone, then re-hears it in full sentence
- **Interrupt failure:** User asks JARVIS to stop talking; it takes 500ms–1s to actually stop
- **Loop stall:** If sentence detection fails repeatedly, streaming queue backs up, blocking LLM

**Prevention:**

- **Step 1:** Use battle-tested sentence splitter (nltk or spacy), not regex. Handle edge cases:
  - Abbreviations: "Dr.", "Mr.", "Inc.", "e.g."
  - Elipses: "Wait... no"
  - Quoted sentences: "He said 'hello.' and left"

- **Step 2:** Buffer sentences with deduplication to prevent repeats. Use a set-based check before enqueueing.

- **Step 3:** Implement hard interrupt with timeout. When user stops, kill TTS thread within 100ms.

- **Step 4:** Test streaming TTS with realistic starvation and overflow scenarios. Measure buffer underrun frequency.

**Detection:** Add `TTFA` (Time To First Audio) metric in Langfuse. Alert if > 500ms. Log sentence split count per response — if < 1 sentence, likely a bug.

---

### Pitfall 4: Hybrid Memory Retrieval Parameters Are Not Tuned — Recency Bias Drowns Relevance

**What goes wrong:** v3.6 adds hybrid memory retrieval (semantic + keyword + recency). Common tuning failures:
1. **RRF (Reciprocal Rank Fusion) weights uncalibrated:** Default 1:1:1 (semantic : keyword : recency) means recent noise dominates relevant context
2. **Recency threshold too aggressive:** "What did I say last week?" returns only yesterday's messages because recent weights too high
3. **BM25 indexing skipped:** Keyword search falls back to semantic-only because SQLite FTS5 not initialized → loses factual recall
4. **Top-K too high:** Retrieving 20 results and ranking them allows low-signal results to leak through
5. **Embedding staleness:** Old memories aren't re-embedded; embeddings drift from current semantic space

**Why it happens:**
- RRF weights are hyperparameters with no universal "right" values — they depend on domain and user
- Recency as a hard signal can mask relevance
- BM25 requires SQLite FTS5 schema + triggers to keep index current — easy to ship without it
- ChromaDB embedding cache isn't invalidated when semantic space changes
- Most RAG literature focuses on semantic + keyword, not recency; limited guidance

**Consequences:**
- **Poor context:** JARVIS can't recall relevant conversations from weeks ago because recent noise dominates
- **Fact loss:** User asks "What was that restaurant you recommended?" — retrieves wrong context because keyword search didn't work
- **Inconsistency:** JARVIS gives different answers about same fact depending on when it was last mentioned
- **User frustration:** "You were just talking about this 5 minutes ago" — but retrieval missed it

**Prevention:**

- **Step 1:** Document RRF tuning strategy with rationale. Default weights: semantic 0.6, keyword 0.25, recency 0.15. Rationale: semantic > keyword > recency.

- **Step 2:** Implement proper SQLite FTS5 for keyword search with triggers to keep index in sync.

- **Step 3:** Add recency as a tiebreaker only, not a primary signal. Rescore only bottom 20% by recency.

- **Step 4:** Test retrieval quality with ground truth. Verify keyword relevance beats recency in experiments.

**Detection:** Log retrieval scoring breakdown (semantic score, keyword score, recency bonus) for each result. If recency score >50% of final score for top results, likely overweighted. Add observability dashboard showing score distribution.

---

## Moderate Pitfalls

### Pitfall 5: OpenRouter Rate Limits Not Handled — Chat Stalls with Unhelpful 429 Response

**What goes wrong:** v3.6 adds OpenRouter as LLM provider, starting with **free tier**. OpenRouter free tier has strict rate limits:
- 20 requests / minute per IP
- 200 requests / day total
- Some models limited to <10 req/day
- No error details in 429 response

Common failures:
1. **No retry logic:** App hits 429, returns error to user, doesn't retry
2. **Silent fallback failure:** 429 triggers fallback to local LM Studio, which is offline → double failure
3. **Batch requests:** Multiple chat instances or embedding processes hit limit simultaneously
4. **Model unavailability:** Free tier model becomes unavailable mid-week → instant 400
5. **User unaware of limits:** Doesn't see that they've hit rate limit; thinks JARVIS is broken

**Why it happens:**
- OpenRouter docs show rate limits but don't provide per-model limits upfront
- Free tier is undocumented in some models' pages
- Exponential backoff + jitter require explicit implementation; easy to skip
- No monitoring of remaining quota before hitting limit

**Consequences:**
- **Chat unusable:** User hits daily limit at 2pm, can't chat rest of day
- **Silent degradation:** Fallback silently triggers, user doesn't notice different model
- **Batch failure:** If embedding process also uses OpenRouter, both STT and memory fail
- **Trust loss:** "JARVIS said X yesterday, why not today?" (different model)

**Prevention:**

- **Step 1:** Implement explicit rate limit handling with quota tracking in `config.py`.

- **Step 2:** Add exponential backoff + jitter for 429s. Cap retries at 3 attempts.

- **Step 3:** Monitor quota and warn user in `/config` menu. Show remaining requests per day.

- **Step 4:** Document OpenRouter free tier limits in `/config` menu with fallback info.

- **Step 5:** Add integration test that verifies fallback to LM Studio when quota exhausted.

**Detection:** In chat loop, log which LLM provider actually handled each request (OpenRouter vs LM Studio). If majority are fallbacks, alert user. Add `/quota` command to show remaining requests.

---

### Pitfall 6: Per-Speaker Memory Cross-Speaker Contamination

**What goes wrong:** v3.6 adds per-speaker memory (each profile has own history). Integration with v3.5 speaker recognition can cause data leaks:
1. **Unknown speaker memory leak:** User A talks, speaker recognition fails (unknown), messages go to `[unknown]:`. User B talks → their memory contaminates User A's retrieval
2. **Speaker profile merge:** Two speakers sound similar, both register as "Alice" → memory conflated
3. **Migration bug:** Existing v3.5 conversations (pre-speaker) don't have speaker tags → when migrated, get assigned to first enrolled speaker
4. **Confidence threshold mismatch:** Speaker identified with 0.70 confidence (below 0.75 threshold) but chat still uses her memory
5. **Speaker profile deletion:** Delete speaker "Alice", but her memory records still reference her → orphaned

**Why it happens:**
- Speaker recognition confidence is continuous (0.0–1.0) but memory retrieval is binary
- Threshold (0.75) is arbitrary; different speakers may need different thresholds
- Memory migration from pre-v3.6 (no speaker tags) requires backfill logic that's easy to get wrong
- Cleanup on speaker deletion isn't transactional — can leave dangling references

**Consequences:**
- **Privacy violation:** Personal conversations leak between users sharing same system
- **False personalization:** JARVIS confuses facts between speakers
- **Inconsistency:** Same query returns different context depending on speaker confidence score
- **Orphaned data:** Deleted speaker profiles leave behind memory records

**Prevention:**

- **Step 1:** Use three-state speaker identification (high conf / low conf / unknown). Only use named memory if confidence ≥ 0.75.

- **Step 2:** Separate unknown speaker context from named speaker memory. Always include general context.

- **Step 3:** Tag all messages with speaker metadata, even unknowns, for future queries.

- **Step 4:** Handle speaker profile deletion atomically. Mark memories as orphaned, don't delete.

- **Step 5:** Test speaker memory isolation rigorously. Verify Alice's memories don't appear in Bob's context.

**Detection:** In chat loop, log speaker identification and memory source. Alert if high-confidence speaker uses general memory or if low-confidence speaker tries to use named memory. Add audit trail: "Memory for query 'X' retrieved from [general|alice|bob]".

---

### Pitfall 7: /memory Command Destructive Ops Without Confirmation

**What goes wrong:** v3.6 adds `/memory` command to inspect/edit/delete memories. Common mistakes:
1. **Delete without backup:** User typos `/memory delete --date 2026-06-01`, accidentally deletes 3 months of context
2. **Concurrent edit conflict:** `/memory edit` in-progress, user sends chat message → race condition
3. **Partial deletion:** `/memory delete --speaker alice` partially succeeds, leaves corrupted state
4. **No undo:** Deletion is permanent; no recovery mechanism

**Why it happens:**
- SQLite has row-level locks, not transaction-level isolation by default
- Manual deletion via CLI is fast and easy; confirmation adds friction
- No backup mechanism in v3.5; only option is restore from disk backup
- Concurrent writes not tested

**Consequences:**
- **Data loss:** User loses weeks of context permanently
- **Corrupt state:** Some memory records orphaned, database in inconsistent state
- **Recovery delay:** User must restore from backup (if it exists)

**Prevention:**

- **Step 1:** Require confirmation for destructive ops. For delete, user must type "DELETE" to confirm.

- **Step 2:** Implement transactional safety. All deletes happen in single transaction; rollback on error.

- **Step 3:** Create automatic backups before destructive ops. Store in `~/.jarvis/memory_backups/` with timestamp.

- **Step 4:** Lock concurrent edits using FileLock to prevent race conditions.

**Detection:** Log all `/memory` commands with before/after counts. On startup, verify memory DB integrity (no orphaned foreign keys). If backup is stale (>7 days), warn user.

---

## Minor Pitfalls

### Pitfall 8: Streaming STT Implementation Causes Audio Latency Spike

**What goes wrong:** v3.6 considers streaming STT (transcribe while user still speaking). This is complex:
1. **Buffer underflow:** Buffering logic waits for "enough" audio, user pauses → transcript arrives 500ms late
2. **Silence misdetection:** VAD detects pause as end-of-speech, triggers transcription early, then user continues
3. **Model context reset:** Streaming models maintain state; interrupting mid-stream loses context
4. **Tooltip delay:** UI shows "Listening..." but actually shows transcription lag

**Why it happens:**
- Streaming STT is not simple; requires modeling context spillover and VAD edge cases
- faster-whisper streaming is newer and less battle-tested
- Testing requires actual voice + latency measurement

**Prevention:**
- Defer streaming STT to v3.7. v3.6 should use standard (non-streaming) faster-whisper with optimized cold-start.
- If shipping: Test with real voice at various speaking speeds. Measure P99 latency.

---

### Pitfall 9: GPU Warmup Not Triggered — First Inference Stalls 2–5 Seconds

**What goes wrong:** GPUs (CUDA, ROCm, Metal) require "warmup" — first inference loads model + JIT-compiles kernel code. In v3.6:
1. User speaks "Hey JARVIS" → STT initializes GPU → 1-2s delay before transcription
2. LLM responds → TTS initializes GPU → 2-3s delay before first audio

Users perceive this as hang or crash.

**Prevention:**
- In `init_stt()` and `init_tts()`, after loading model, run dummy inference to warm up GPU.

---

### Pitfall 10: OpenRouter Model Availability Churn

**What goes wrong:** OpenRouter free tier model list changes; models become unavailable unexpectedly:
- `llama-3.1-8b:free` removed from free tier → requires paid API key
- Model renamed or moved to different provider
- Daily rate limit per model drops below 10

**Prevention:**
- In v3.6 `/config`, show list of currently available free models (fetched from OpenRouter API). Let user select from verified list.
- In code, log if model switches due to unavailability.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Timing |
|-------------|---------------|------------|--------|
| GPU detection | False positives (HIP SDK but incompatible GPU) | Validation test at startup; fallback to CPU | Before Phase 1 of v3.6 |
| Torch version conflict | Chatterbox breaks with torch 2.9.1 | Test Chatterbox + torch 2.9.1 compatibility; patch if needed | Before Phase 1 |
| Streaming TTS | Sentence detection fails → choppy audio | Battle-test with realistic audio; defer if not ready | Phase 2 (TTS streaming) |
| Hybrid memory retrieval | RRF weights uncalibrated → recency bias | Tune weights with user feedback; add metrics | Phase 3 (Memory) |
| OpenRouter integration | Rate limit 429 not handled → chat stalls | Implement exponential backoff + quota check | Phase 2 (OpenRouter) |
| Per-speaker memory | Unknown speaker contaminates other speakers | Test isolation rigorously; implement delete atomicity | Phase 3 (Memory) |
| /memory command | Destructive ops without confirmation → data loss | Require confirmation + backup before delete | Phase 3 (Memory) |

---

## Sources

- ROCM-WINDOWS-IMPLEMENTATION.md (v3.6 GPU plan, torch version conflicts, RDNA2 requirement)
- HYBRID-GPU-ARCHITECTURE.md (GPU detection, Vulkan fallback, HSA driver notes)
- PROJECT.md (v3.5 shipped state, v3.6 requirements, known v3.5 pitfalls)
- CLAUDE.md (stack details: torch 2.6.0 pinned, chatterbox cold start, ChromaDB config)
- OpenRouter API documentation (rate limits: 20 req/min, 200 req/day free tier)
- ChromaDB 1.5.5 documentation (Rust core, SQLite backend, metadata filtering)
- PyTorch documentation (torch.cuda.is_available() limitations, device validation)
