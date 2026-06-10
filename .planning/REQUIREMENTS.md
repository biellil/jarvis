# JARVIS v3.6 — Requirements

**Milestone:** v3.6 GPU Multi-Platform + OpenRouter + Polish/Memory/Performance
**Date:** 2026-06-02

---

## v3.6 Requirements

### GPU Multi-Platform Detection & Acceleration

- [x] **GPU-01**: User can run JARVIS on Windows AMD (RDNA2+), Windows NVIDIA, Linux ROCm, Linux CUDA, macOS Apple Silicon, macOS Intel — `device_detect.py` factory returns correct `(device, backend)` tuple per OS via cascade
- [x] **GPU-02**: Device detection validates with allocation test (`torch.zeros(1, device=...)`) before committing — false positives (e.g., RDNA1 with HIP SDK, Intel Mac with MPS) detected and fall back transparently
- [x] **GPU-03**: Windows AMD with HIP SDK installed loads `torch==2.9.1+rocm7.2.1` and Chatterbox TTS runs on GPU (validated compat with Chatterbox API before shipping)
- [x] **GPU-04**: macOS Apple Silicon uses Metal/MPS backend for Chatterbox + Kokoro TTS
- [x] **GPU-05**: Vulkan available as generic fallback when ROCm/CUDA/Metal unavailable (e.g., older Linux AMD, generic GPUs)
- [x] **GPU-06**: `stt.py` (faster-whisper) uses `device_detect.detect()` instead of local detection — single source of truth
- [x] **GPU-07**: `tts.py` Chatterbox + Kokoro use `device_detect.detect()` with automatic CPU fallback on init failure
- [x] **GPU-08**: `jd validate-gpu` CLI command shows detected hardware, selected device, full fallback chain
- [x] **GPU-09**: `pyproject.toml` extras (`[amd-gpu-windows]`, `[nvidia-gpu]`, `[apple-silicon]`, `[vulkan]`) documented in README install section

### OpenRouter LLM Provider

- [ ] **OPENR-01**: User can select `openrouter` in `/config` LLM provider menu alongside LM Studio/Anthropic/OpenAI/Gemini
- [x] **OPENR-02**: Provider uses `base_url=https://openrouter.ai/api/v1` via existing `langchain-openai` pattern — same abstraction layer as other providers
- [x] **OPENR-03**: `OPENROUTER_API_KEY` in `.env` is optional — provider works with free models (`:free` suffix) without key and unlocks paid models when key present, with no code change required
- [x] **OPENR-04**: User can configure any OpenRouter model name (free or paid) via `/config` model selector — provider treats them identically

### Hybrid Memory Retrieval

- [x] **HMEM-01**: New `HybridRetriever` class combines semantic (ChromaDB), keyword (SQLite FTS5), and recency-based ranking
- [x] **HMEM-02**: SQLite FTS5 virtual table created for messages with triggers maintaining sync on INSERT/UPDATE/DELETE
- [x] **HMEM-03**: RRF (Reciprocal Rank Fusion) merges three ranked lists with weights (semantic 0.6, keyword 0.25, recency 0.15)
- [x] **HMEM-04**: Recency applied as tiebreaker only — does not dominate ranking when semantic+keyword strongly agree
- [x] **HMEM-05**: NDCG benchmark with 50 hand-crafted queries validates ≥7% lift vs pure semantic baseline before shipping
- [x] **HMEM-06**: `manager.buildContext()` uses HybridRetriever transparently — no API change to callers

### Per-Speaker Memory Isolation

- [ ] **PSPK-01**: SQLite `messages` table gains `speaker_id` column + index; existing rows backfilled as `null` (treated as unknown)
- [ ] **PSPK-02**: ChromaDB embeddings carry `speaker_id` in metadata; existing embeddings re-indexed or marked legacy
- [ ] **PSPK-03**: HybridRetriever filters results by `speaker_id` when speaker context is known (high confidence ≥ 0.75)
- [ ] **PSPK-04**: Memories from low-confidence (<0.75) speaker recognition stored as `unknown_speaker` and not mixed into named-speaker contexts
- [ ] **PSPK-05**: Deleting a speaker profile marks their memories as `orphan_speaker` (not removed) — recoverable if profile is re-enrolled

### Streaming TTS

- [ ] **STTS-01**: `chat.py` accumulates LLM tokens and flushes to TTS at sentence boundary (instead of waiting for full response)
- [ ] **STTS-02**: `nltk.PunktSentenceTokenizer` with Portuguese model detects boundaries correctly for "Dr.", "Sr.", "Sra.", "etc.", quoted dialogue, ellipses
- [ ] **STTS-03**: TTS worker thread consumes sentence buffer and generates audio chunks asynchronously without blocking LLM stream
- [ ] **STTS-04**: TTFA (time-to-first-audio) ≤ 300ms p95 measured via Langfuse spans

### Performance Metrics

- [ ] **PERF-01**: Langfuse spans capture TTFT (time-to-first-token) on all 3 `graph.stream()` call sites in backend-ts
- [ ] **PERF-02**: Langfuse spans capture TTFA (time-to-first-audio) at TTS init and p95 end-to-end voice round-trip
- [ ] **PERF-03**: Separate spans capture retrieval latency, STT latency, TTS latency — visible in Langfuse traces
- [ ] **PERF-04**: Langfuse dashboard template configured with p50/p95/p99 aggregates per metric
- [ ] **PERF-05**: Alert thresholds defined: TTFT > 1s, TTFA > 500ms, E2E > 3s — fire via Langfuse alerts

### Polish & Estabilidade

- [x] **POL-01**: 6 warnings + 7 info from Phase 89 code review (speaker recognition) closed or explicitly accepted with rationale
- [ ] **POL-02**: 3 HUMAN-UAT tests pending in HUMAN-UAT.md (speaker recognition with real hardware) executed and documented
- [x] **POL-03**: `/config` menu reorganized into hierarchical navigation (LLM / Voice / Memory / Speakers / Advanced) replacing flat 10+ item list
- [x] **POL-04**: E2E pipeline tests automated (PTT → STT → LLM → TTS) running in CI with audio mocks — no hardware required

---

## Future Requirements (deferred to v3.7+)

- `/memory` CLI command (search, list, edit, delete, tag, promote, auto-backup)
- Streaming STT (Whisper transcribe while user still speaking) — VAD edge cases too costly
- Multi-speaker shared knowledge base (cross-speaker memory pool) — privacy risk
- Vision + memory fusion (visual context indexed alongside text) — phase complexity
- Multi-GPU coordination (split inference across cards) — overkill for personal use
- Agent self-editing memory (autonomous mutation of long-term store) — autonomy without consent risk

---

## Out of Scope (v3.6)

- **Hardware-specific tuning for non-standard configs** (e.g., dual-GPU, GPU passthrough) — JARVIS targets typical personal computers
- **OpenRouter paid-tier billing UI / quota dashboard** — billing managed via OpenRouter web; JARVIS just consumes the API
- **Sharing memories across users / cloud sync** — privacy-first, single-user assistant
- **Voice cloning per speaker (auto-clone on enrollment)** — Chatterbox voice cloning already exists but requires user-provided reference; auto-cloning from enrollment audio is out
- **Real-time language switching mid-conversation** — Portuguese-first; multilingual stays as-is

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| GPU-01 | Phase 91 | Complete |
| GPU-02 | Phase 91 | Complete |
| GPU-03 | Phase 91 | Complete |
| GPU-04 | Phase 91 | Complete |
| GPU-05 | Phase 91 | Complete |
| GPU-06 | Phase 91 | Complete |
| GPU-07 | Phase 91 | Complete |
| GPU-08 | Phase 91 | Complete |
| GPU-09 | Phase 91 | Complete |
| OPENR-01 | Phase 93+ | Deferred |
| OPENR-02 | Phase 92 | Complete |
| OPENR-03 | Phase 92 | Complete |
| OPENR-04 | Phase 92 | Complete |
| HMEM-01 | Phase 93 | Complete |
| HMEM-02 | Phase 93 | Complete |
| HMEM-03 | Phase 93 | Complete |
| HMEM-04 | Phase 93 | Complete |
| HMEM-05 | Phase 93 | Complete |
| HMEM-06 | Phase 93 | Complete |
| PSPK-01 | Phase 94 | Pending |
| PSPK-02 | Phase 94 | Pending |
| PSPK-03 | Phase 94 | Pending |
| PSPK-04 | Phase 94 | Pending |
| PSPK-05 | Phase 94 | Pending |
| STTS-01 | Phase 95 | Pending |
| STTS-02 | Phase 95 | Pending |
| STTS-03 | Phase 95 | Pending |
| STTS-04 | Phase 95 | Pending |
| PERF-01 | Phase 96 | Pending |
| PERF-02 | Phase 96 | Pending |
| PERF-03 | Phase 96 | Pending |
| PERF-04 | Phase 96 | Pending |
| PERF-05 | Phase 96 | Pending |
| POL-01 | Phase 90 | Complete |
| POL-02 | Phase 90 | Pending |
| POL-03 | Phase 90 | Complete |
| POL-04 | Phase 90 | Complete |

**Total: 37/37 requirements mapped.**
