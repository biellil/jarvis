# Research Summary — JARVIS v3.6

**Milestone:** v3.6 GPU Multi-Platform + OpenRouter + Polish/Memory/Performance
**Date:** 2026-06-02
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

JARVIS v3.6 extends v3.5 (speaker recognition + voice cloning) with **GPU multi-platform acceleration**, **OpenRouter LLM provider (free tier)**, **hybrid memory retrieval (semantic + keyword + recency)**, **per-speaker memory isolation**, **`/memory` CLI command**, **streaming TTS**, and **performance instrumentation**. The approach is **additive with zero breaking changes** — existing LangChain abstractions accommodate all features.

**Stack additions verified on PyPI (2026-06-02).** Critical risk is implementation quality, not architecture: torch version conflicts with Chatterbox, GPU false positives, OpenRouter rate limits, and streaming TTS sentence boundaries require careful phase validation.

**Recommended:** 7 phases. Phases 1 (GPU) + 2 (OpenRouter) run in parallel. Phase 3 (hybrid retrieval) unlocks Phases 4 (per-speaker) + 5 (`/memory`). Phase 6 (streaming TTS) depends on Phase 1. Phase 7 (metrics) ships last.

---

## Stack Additions

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| torch | 2.6.0 (CPU) + 2.9.1+rocm7.2.1 (AMD Win optional) | GPU detection + acceleration | PyPI / repo.radeon.com |
| langchain-openrouter | 0.2.3 | OpenRouter LLM provider (300+ models, free tier) | PyPI 2026-05 |
| chromadb (existing) | 1.5.5 | Sparse vector + RRF support for hybrid retrieval | Already in stack |
| rank-bm25 | 0.3.x | BM25 keyword scoring (lightweight, no torch dep) | PyPI |
| nltk | 3.9+ | Tokenization + sentence boundary (Phase 6) | PyPI |
| RealtimeTTS | 0.5.x+ | Streaming TTS wrapper with sentence chunking | PyPI 2026 |
| pynvml | 12.x (optional) | NVIDIA GPU telemetry for observability | PyPI |

**Anti-recommendations:**
- Do NOT pin torch to a single version — use `pyproject.toml` extras (`[amd-gpu-windows]`, `[nvidia-gpu]`) so the user picks at install time
- Do NOT use community OpenRouter wrappers — `langchain-openrouter` is first-party
- Do NOT add Vulkan as primary GPU backend — Vulkan is fallback only

**OpenRouter free tier (2026-06):** Rate limits 20 req/min, 200 req/day. Available `:free` models include `meta-llama/llama-3.1-8b-instruct:free`, `google/gemini-2.0-flash-exp:free`, `deepseek/deepseek-r1:free`, `qwen/qwen-2.5-72b-instruct:free`. Always use `:free` suffix — without it, requests route to paid tier.

---

## Features (categorized)

### Table Stakes (must-ship)

- **TS-1** Multi-LLM with provider hot-swap (existing) + OpenRouter as 6th option
- **TS-2** Voice I/O with GPU acceleration (best-fit per OS, transparent fallback to CPU)
- **TS-3** Persistent memory with `/memory` inspection capability
- **TS-4** Performance observability (TTFT, TTFA, p95 via Langfuse)
- **TS-5** `/config` menu reorganization (hierarchical navigation, hot-swap preserved)

### Differentiators

- **D-1** **GPU best-fit cascade per OS** — Ollama/LM Studio set the bar; JARVIS extends to STT+TTS (~4-10x latency win)
- **D-2** **Hybrid retrieval** — semantic + keyword + recency via RRF (~7.4% NDCG lift over pure vector)
- **D-3** **Per-speaker memory isolation** — privacy-first (uses v3.5 speaker recognition output)
- **D-4** **`/memory` CRUD command** — user can search/edit/delete/promote memories (transparency → trust)
- **D-5** **Streaming TTS** — perceived first-audio latency <300ms via sentence chunking

### Anti-Features (defer to v3.7+)

- Agent self-editing memory (autonomy without consent risk)
- Multi-speaker shared knowledge base (cross-contamination risk)
- Vision + memory fusion (Phase complexity too high)
- Whisper streaming STT (defer — VAD edge cases costly)
- Multi-GPU coordination (overkill for personal use)

---

## Architecture

### Three-tier integration (zero breaking changes)

**Tier 1 — Python desktop (`apps/desktop-py/`):**
- NEW `device_detect.py` — central GPU detection factory (CUDA/ROCm/Metal/Vulkan/CPU cascade)
- MODIFIED `stt.py` — use `device_detect.detect()` instead of local `_detect_device()`
- MODIFIED `tts.py` — apply device cascade to Chatterbox + Kokoro
- NEW `commands.py` — `/memory` CLI router
- MODIFIED `chat.py` — sentence buffering for streaming TTS, metric instrumentation
- MODIFIED `ui.py` — `/config` hierarchical menu refactor

**Tier 2 — Gateway (TypeScript):**
- NEW `/api/memory/*` REST endpoints (search/list/delete/tag/promote)
- Header `x-jarvis-speaker` pass-through (already exists from v3.5)

**Tier 3 — Backend-ts:**
- MODIFIED LLM provider factory — add `openrouter` case via `ChatOpenAI` with `baseURL='https://openrouter.ai/api/v1'`
- NEW `HybridRetriever` class — semantic + BM25 + recency merged via RRF
- MODIFIED memory schema — add `speakerId` column + index
- MODIFIED retriever filter by speaker
- Langfuse spans for TTFT/TTFA/retrieval latency

### Build order (dependency graph)

```
Phase 1 (GPU) ──────────┬─→ Phase 6 (Streaming TTS) ──→ Phase 7 (Metrics)
                        │
Phase 2 (OpenRouter) ───┤  (parallel with Phase 1)
                        │
                        └─→ Phase 3 (Hybrid Retrieval)
                                    │
                                    ├─→ Phase 4 (Per-Speaker Memory)
                                    │           │
                                    │           └─→ Phase 5 (/memory command)
                                    │                       ↑
                                    └───────────────────────┘
```

---

## Critical Pitfalls (with prevention)

### 🔴 CRITICAL

**P-1: Torch version conflict (Phase 1 blocker)** — Chatterbox pins `torch==2.6.0` but ROCm Windows requires `torch==2.9.1+rocm7.2.1`. Possible API breakage.
- **Prevention:** Validate Chatterbox runs on torch 2.9.1 in isolated env *before* shipping Phase 1. If incompatible, patch chatterbox or pin AMD users to CPU-only Chatterbox + GPU for Kokoro/Whisper only.
- **Detection:** Integration test in Phase 1 runs `_chatterbox_speak("test")` on torch 2.9.1.
- **Phase to address:** Phase 1 (must validate before Phase 1 ships).

**P-2: GPU false positives** — `torch.cuda.is_available()` returns True without checking actual device capability. RDNA1 GPUs fail silently. Intel Macs return `mps.is_available()=True` but have no GPU.
- **Prevention:** Always validate with test allocation (`torch.zeros(1, device='cuda:0')`) before committing to a device. Cache result at startup. Document Windows AMD requires RDNA2+ (RX 6000+).
- **Detection:** New `jd validate-gpu` command runs allocation test and reports.
- **Phase to address:** Phase 1.

**P-3: Sentence boundary detection fails** — Naive regex splits "Dr. Smith" → ["Dr.", "Smith"] → choppy audio. Portuguese has its own abbreviations (Dr., Sr., Sra., etc.).
- **Prevention:** Use `nltk.tokenize.PunktSentenceTokenizer` with Portuguese model. Buffer with deduplication. Hard interrupt 100ms timeout.
- **Detection:** Test corpus of 50 Portuguese sentences with abbreviations.
- **Phase to address:** Phase 6 — **defer Phase 6 if validation shows issues**.

### 🟡 MODERATE

**P-4: RRF weights uncalibrated** — Default 1:1:1 semantic:keyword:recency means recency drowns relevance.
- **Prevention:** Document weighting (semantic 0.6, keyword 0.25, recency 0.15 as tiebreaker only). Benchmark NDCG on 50 test queries during Phase 3.
- **Phase to address:** Phase 3.

**P-5: OpenRouter rate limits not handled** — Free tier 20 req/min, 200 req/day. 429 errors stall chat with no fallback.
- **Prevention:** Exponential backoff + jitter (3 retries). Track daily quota. Show remaining requests in `/config`. Fallback to LM Studio on quota exhaust with user notification.
- **Phase to address:** Phase 2.

**P-6: Per-speaker memory cross-contamination** — Unknown-speaker messages leak into named speakers' context. Threshold mismatch (0.70 vs 0.75) causes binary retrieval bugs.
- **Prevention:** Three-state ID (high/low/unknown). Only use named memory if confidence ≥ 0.75. Mark deleted speakers as orphaned, don't erase. Test isolation in 3-speaker scenario.
- **Phase to address:** Phase 4.

**P-7: `/memory` destructive ops without confirmation** — Typo deletes months of context. Concurrent edits + partial failures corrupt DB.
- **Prevention:** Require typed "DELETE" confirmation. Transactional safety with rollback. Auto-backup to `~/.jarvis/memory_backups/` before destructive ops. FileLock for concurrent access.
- **Phase to address:** Phase 5.

### 🟢 MINOR

**P-8: GPU warmup latency** — First inference 2-5s delay (JIT compile). Already addressed in v3.5 for Chatterbox; extend pattern to Kokoro + Whisper.
**P-9: OpenRouter model churn** — Free tier models disappear mid-week. Fetch available list from API at startup; log model switches.

---

## Proposed Phase Structure (7 phases)

| # | Phase | Complexity | Depends | Key Deliverables |
|---|-------|-----------|---------|------------------|
| 1 | GPU Multi-Platform Detection | Medium | — | `device_detect.py`, OS cascades (Win AMD/NVIDIA, Linux ROCm/CUDA, macOS Metal), `jd validate-gpu` |
| 2 | OpenRouter LLM Provider | Small | — | `openrouter` provider case, free tier (no key, `:free` models), rate-limit handling, `/config` integration |
| 3 | Hybrid Memory Retrieval | Medium | — | `HybridRetriever` (semantic + BM25 + recency), SQLite FTS5, RRF merge with tuned weights |
| 4 | Per-Speaker Memory Isolation | Medium | 3 | `speakerId` schema column, retrieval filter by speaker, contamination test suite |
| 5 | `/memory` Command | Medium | 3, 4 | `/memory search\|list\|delete\|tag\|promote`, transactional safety, auto-backup |
| 6 | Streaming TTS | Large | 1 | Sentence buffering (PT-BR aware), TTS worker thread, TTFA <300ms |
| 7 | Performance Metrics | Small | 6 | TTFT/TTFA/p95 spans, Langfuse dashboard, alert thresholds |
| — | Polish & Estabilidade | Small | — | Close 6 warnings + 7 info from Phase 89 code review; execute 3 HUMAN-UAT tests; `/config` menu reorg; E2E pipeline tests |

**Polish work** can be a standalone phase or distributed (suggest: dedicated polish phase early to clear v3.5 debt before adding more features).

---

## Open Questions for Phase-Specific Research

1. **Phase 1:** Does torch 2.9.1 actually work with current chatterbox-tts version? (must validate in isolation before Phase 1 ships)
2. **Phase 2:** Which `:free` models are currently available on OpenRouter (model list churns)? Recommend fetching at startup, not hardcoding.
3. **Phase 3:** What RRF weights work best for Portuguese conversational retrieval? Recommend NDCG benchmark on 50 queries.
4. **Phase 4:** What's the speaker-confidence threshold that minimizes cross-contamination without hurting named-speaker recall?
5. **Phase 6:** Does `nltk.PunktSentenceTokenizer` Portuguese model handle "Dr.", "Sr.", dialogue quotes correctly? Recommend voice testing with real conversations.

---

## Confidence Breakdown

| Area | Confidence | Notes |
|------|-----------|-------|
| Stack | HIGH | All versions verified PyPI 2026-06-02. Torch conflict flagged as known blocker. |
| Features | MEDIUM-HIGH | Differentiators researched with precedent (Ollama, MemGPT, Letta). UX patterns need phase validation. |
| Architecture | HIGH | Three-tier base from v3.5 unchanged. Orthogonal features verified independent. |
| Pitfalls | MEDIUM-HIGH | 5 critical/moderate documented with concrete prevention strategies. |
| **Overall** | **MEDIUM-HIGH** | Ready for requirements + roadmap. |

---

## Sources

- `.planning/research/STACK.md` (libraries, versions, install paths per OS)
- `.planning/research/FEATURES.md` (categorization, complexity, dependencies)
- `.planning/research/ARCHITECTURE.md` (three-tier integration, build order, data flow)
- `.planning/research/PITFALLS.md` (10 documented pitfalls + prevention)
- `docs/ROCM-WINDOWS-IMPLEMENTATION.md` (existing ROCm research, torch 2.9.1 path)
- PyPI verification (2026-06-02): torch, langchain-openrouter, chromadb, rank-bm25, RealtimeTTS
