# JARVIS v3.6 — Roadmap

**Milestone:** v3.6 GPU Multi-Platform + OpenRouter + Polish/Memory/Performance
**Created:** 2026-06-02
**Granularity:** standard
**Coverage:** 37/37 requirements mapped

---

## Phases

- [x] **Phase 90: Polish & Stability** — Close v3.5 debt and harden the base before adding new features (completed 2026-06-09)
- [x] **Phase 91: GPU Multi-Platform Detection** — Central device detection factory with OS-specific cascade and validation gate (completed 2026-06-10)
- [x] **Phase 92: OpenRouter Provider** — Add OpenRouter as the 6th LLM provider with free-tier support and rate-limit handling (completed 2026-06-10)
- [x] **Phase 93: Hybrid Memory Retrieval** — Replace pure-semantic retrieval with semantic + keyword + recency RRF fusion (completed 2026-06-10)
- [x] **Phase 94: Per-Speaker Memory Isolation** — Scope memory retrieval to individual speakers using v3.5 recognition output (completed 2026-06-10)
- [x] **Phase 95: Streaming TTS** — Begin playing audio before LLM finishes generating, with PT-BR sentence boundary detection (completed 2026-06-11)
- [ ] **Phase 96: Performance Metrics** — Instrument full pipeline with Langfuse spans and alert thresholds

---

## Phase Details

### Phase 90: Polish & Stability
**Goal**: The v3.5 code debt is resolved and the pipeline runs reliably end-to-end in CI before v3.6 features are added
**Depends on**: Nothing (closes v3.5 debt)
**Requirements**: POL-01, POL-02, POL-03, POL-04
**Success Criteria** (what must be TRUE):
  1. All 6 warnings and 7 info items from the Phase 89 code review are either fixed or explicitly accepted with written rationale
  2. The 3 HUMAN-UAT speaker recognition tests are executed with real microphone hardware and outcomes are documented in HUMAN-UAT.md
  3. The `/config` menu navigates through hierarchical categories (LLM / Voice / Memory / Speakers / System) instead of a flat list of 10+ items
  4. The full PTT → STT → LLM → TTS pipeline runs as an automated CI test using audio mocks — no real hardware required
**Plans**: 4 plans
- [x] 90-01-PLAN.md — POL-01: Fixes 6 warnings (WR-01..WR-06) + 3 testes (IN-04..IN-06) em speaker.py/chat.py/test_speaker.py + 90-REVIEW-FIX.md
- [x] 90-02-PLAN.md — POL-04: Teste E2E pipeline em CI (fixture hello.wav + test_e2e_pipeline.py + workflow desktop-py-tests.yml)
- [x] 90-03-PLAN.md — POL-03: Menu /config hierarquico (5 grupos LLM/Voice/Memory/Speakers/System) + testes de navegacao
- [x] 90-04-PLAN.md — POL-02: HUMAN-UAT speaker recognition com microfone real (3 testes via /gsd:verify-work)

### Phase 91: GPU Multi-Platform Detection
**Goal**: JARVIS automatically selects the best available GPU on every supported OS, with safe validation before committing to a device
**Depends on**: Phase 90
**Requirements**: GPU-01, GPU-02, GPU-03, GPU-04, GPU-05, GPU-06, GPU-07, GPU-08, GPU-09
**Success Criteria** (what must be TRUE):
  1. Running `jd validate-gpu` prints the detected hardware, the selected device (e.g., `cuda:0`, `mps`, `cpu`), and the full fallback chain evaluated
  2. On a machine where the GPU SDK is installed but the device is unsupported (e.g., RDNA1 with HIP SDK, Intel Mac), JARVIS falls back to CPU transparently without crashing
  3. STT (faster-whisper) and TTS (Chatterbox + Kokoro) both query the same `device_detect.detect()` — there is no separate local detection logic in `stt.py` or `tts.py`
  4. Chatterbox TTS runs successfully on torch 2.9.1 (validated in isolation before the phase ships; if incompatible, the fallback strategy is documented and applied)
  5. The README install section documents the `[amd-gpu-windows]`, `[nvidia-gpu]`, `[apple-silicon]`, and `[vulkan]` extras in `pyproject.toml`
**Plans**: 4 plans
Plans:
- [x] 91-01-PLAN.md — GPU-03: Gate de validação P-1 (compat torch 2.9.1+rocm7.2.1 + Chatterbox) + fallback_strategy documentada
- [x] 91-02-PLAN.md — GPU-01/02/04/05: device_detect.py factory com cascade + allocation test + config gpu_amd_backend
- [x] 91-03-PLAN.md — GPU-06/07: Refatorar stt.py + tts.py para consumir device_detect.detect() (remove local detection)
- [x] 91-04-PLAN.md — GPU-08/09: jd validate-gpu CLI + 4 extras pyproject.toml + README documentação
**Critical Pitfall**: P-1 (torch 2.9.1 vs Chatterbox API) must be validated in isolation before this phase ships. P-2 (GPU false positives) prevented by `torch.zeros(1, device=...)` allocation test in `device_detect.py`.

### Phase 92: OpenRouter Provider
**Goal**: Users can configure OpenRouter as an LLM provider via `.env` and chat using free-tier models without an API key
**Depends on**: Phase 90
**Requirements**: OPENR-01, OPENR-02, OPENR-03, OPENR-04
**Success Criteria** (what must be TRUE):
  1. OpenRouter appears as a selectable option in the `/config` LLM provider menu alongside LM Studio, Anthropic, OpenAI, and Gemini
  2. A user with no `OPENROUTER_API_KEY` in `.env` can chat using a `:free` model without any code change or error
  3. When the OpenRouter free tier limit is hit (429), JARVIS retries with exponential backoff and notifies the user rather than silently stalling
  4. A user with `OPENROUTER_API_KEY` set can configure any paid model name via the `/config` model selector and it works identically to free models
**Plans**: 2 plans
Plans:
- [x] 92-01-PLAN.md — OPENR-02/03/04: Factory openrouter case (ChatOpenAI + baseURL), config Zod extension, capabilities entry, .env.example docs
- [x] 92-02-PLAN.md — OPENR-02/03/04: Tests — factory.test.ts openrouter describe block, config.test.ts Zod validation, types.test.ts 5-provider assertion
**Critical Pitfall**: P-5 (OpenRouter 429 rate limits) — implement exponential backoff + jitter (3 retries) and show remaining quota in `/config`.
**Note**: OPENR-01 (Python /config menu selection) deferred to future phase — backend supports OpenRouter via .env only in this phase.

### Phase 93: Hybrid Memory Retrieval
**Goal**: Memory retrieval combines semantic, keyword, and recency signals so JARVIS recalls relevant facts more accurately than pure vector search
**Depends on**: Phase 90
**Requirements**: HMEM-01, HMEM-02, HMEM-03, HMEM-04, HMEM-05, HMEM-06
**Success Criteria** (what must be TRUE):
  1. Asking JARVIS about a specific fact mentioned weeks ago (keyword-rich query) returns the correct memory, even when semantically similar recent noise exists
  2. Asking JARVIS about a recent topic does not suppress older semantically-relevant memories — recency acts as a tiebreaker, not a primary filter
  3. The NDCG benchmark on 50 hand-crafted queries shows at least 7% lift over the pure-semantic baseline before the phase ships
  4. Callers of `manager.buildContext()` require no API changes — the hybrid retrieval is transparent to the rest of the system
**Plans**: 3 plans
Plans:
- [x] 93-01-PLAN.md — HMEM-01/02/03: Export sqlite + FTS5 setup in MemoryStore + HybridRetriever class with weighted RRF
- [x] 93-02-PLAN.md — HMEM-04/06: Wire HybridRetriever into manager.buildContext() + recency tiebreaker validation
- [x] 93-03-PLAN.md — HMEM-05: 50-query NDCG fixture + benchmark gate (hybrid >= semantic + 7%)
**Critical Pitfall**: P-4 (RRF weights uncalibrated) — ship with documented defaults (semantic 0.6, keyword 0.25, recency 0.15) and NDCG gate validates before release.

### Phase 94: Per-Speaker Memory Isolation
**Goal**: Each enrolled speaker's memory is isolated so JARVIS never surfaces one person's private context in another person's conversation
**Depends on**: Phase 93
**Requirements**: PSPK-01, PSPK-02, PSPK-03, PSPK-04, PSPK-05
**Success Criteria** (what must be TRUE):
  1. When speaker A asks a question, memories stored under speaker B's profile do not appear in the retrieved context
  2. Conversations where speaker recognition confidence is below 0.75 are stored and retrieved as `unknown_speaker` — they do not contaminate any named speaker's context
  3. Deleting a speaker profile does not remove their memories from the database; their records are marked `orphan_speaker` and remain recoverable
  4. The `messages` SQLite table and ChromaDB embeddings both carry `speaker_id`, and existing rows/embeddings from v3.5 are backfilled as `null` (treated as unknown) without data loss
**Plans**: 4 plans
Plans:
- [x] 94-01-PLAN.md — PSPK-01/02/04/05: Schema foundation — speaker_id in Drizzle schema + migration, normalizeSpeakerId helper, SQLite + ChromaDB backfill, enrollment guard for "unknown"
- [x] 94-02-PLAN.md — PSPK-01: Plumbing — gateway forwards x-jarvis-speaker, backend reads it + ChatSession.setSpeaker(), write path propagates speakerId to SQLite + ChromaDB
- [x] 94-03-PLAN.md — PSPK-03/04: Read path isolation — HybridRetriever.retrieve() filtered by speakerId on all branches (ChromaDB where, FTS5 JOIN, recency); buildContext passes speaker
- [x] 94-04-PLAN.md — PSPK-03/05: Cross-speaker recall + startup backfill — recall_memory tool extended with target_speaker param + access guard; backfill wired on MemoryStore init
**Critical Pitfall**: P-6 (cross-speaker contamination) — three-state speaker ID (high conf / low conf / unknown); isolation verified with 3-speaker test scenario.

### Phase 95: Streaming TTS
**Goal**: Users hear JARVIS begin speaking within 300ms of the first LLM tokens arriving, without waiting for the complete response
**Depends on**: Phase 91 (GPU baseline established), Phase 90
**Requirements**: STTS-01, STTS-02, STTS-03, STTS-04
**Success Criteria** (what must be TRUE):
  1. JARVIS begins speaking the first sentence while the LLM is still generating the rest of the response — the user does not wait for the full answer before audio starts
  2. Abbreviated forms like "Dr.", "Sr.", "Sra.", "etc." do not cause the sentence splitter to produce choppy one-word audio chunks
  3. Time-to-first-audio (TTFA) is at or below 300ms at p95, measured via Langfuse spans
  4. The TTS worker thread produces audio chunks without blocking the LLM token stream — both run concurrently
**Plans**: 4 plans
Plans:
- [x] 95-01-PLAN.md — STTS-01..04: Wave 0 — vendor punkt_tab PT-BR (~355KB), pin nltk dep, create test stubs (P-3 corpus gate + worker tests)
- [x] 95-02-PLAN.md — STTS-02: sentence_chunker.py — SentenceChunker class, punkt_tab primary + regex fallback, P-3 corpus gate GREEN
- [x] 95-03-PLAN.md — STTS-03/04: tts.py worker thread — _tts_queue(maxsize=3), start_tts_worker(), extended stop_tts(), TTFA loguru log
- [x] 95-04-PLAN.md — STTS-01: chat.py producer — _read_sse_stream feeds chunker→queue, task:done D-11 routing, speak(full_text) removed
**Critical Pitfall**: P-3 (PT-BR sentence boundary detection) — use `nltk.PunktSentenceTokenizer` with Portuguese model; validate with 50-sentence test corpus before shipping. Defer Phase 95 if validation fails.

### Phase 96: Performance Metrics
**Goal**: Every significant latency boundary in the pipeline is instrumented, visible in Langfuse, and alerts fire when thresholds are exceeded
**Depends on**: Phase 95 (TTFA measurement requires streaming TTS), Phase 91 (GPU paths must be in place)
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):
  1. Opening a Langfuse trace for any conversation shows spans for TTFT, TTFA, STT latency, retrieval latency, and TTS latency as distinct labeled segments
  2. The Langfuse dashboard displays p50/p95/p99 aggregates for each metric across recent conversations
  3. When TTFT exceeds 1s, TTFA exceeds 500ms, or end-to-end exceeds 3s, a Langfuse alert fires — verified by triggering a slow response during testing
**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 90. Polish & Stability | 4/4 | Complete | 2026-06-09 |
| 91. GPU Multi-Platform Detection | 4/4 | Complete   | 2026-06-10 |
| 92. OpenRouter Provider | 2/2 | Complete    | 2026-06-10 |
| 93. Hybrid Memory Retrieval | 3/3 | Complete    | 2026-06-10 |
| 94. Per-Speaker Memory Isolation | 4/4 | Complete    | 2026-06-10 |
| 95. Streaming TTS | 4/4 | Complete   | 2026-06-11 |
| 96. Performance Metrics | 0/? | Not started | - |
