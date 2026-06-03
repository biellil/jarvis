# Architecture for JARVIS v3.6

**Domain:** Multi-platform Python desktop client with WebSocket gateway and TypeScript backend  
**Researched:** 2026-06-02  
**Confidence:** HIGH

## Current System Overview (v3.5)

JARVIS is a three-tier distributed system with clear process boundaries and data flow:

- **Python Desktop Client** (`apps/desktop-py/`) — local STT/TTS, config persistence, voice interaction
- **Express.js Gateway** (`apps/gateway/`) — SSE broker, PC control dispatcher, backend proxy
- **Backend-ts** (`apps/backend-ts/`) — LLM provider abstraction, memory (ChromaDB+SQLite), observability

### Architecture Diagram

```
┌─────────────────────────┐
│  Python Desktop Client  │
│   (apps/desktop-py/)    │
│  • config.py (Pydantic) │
│  • stt.py (faster-whisper) │
│  • tts.py (5 providers) │
│  • speaker.py (v3.5)    │
│  • voice_modes.py       │
│  • chat.py (SSE client) │
└────────────┬────────────┘
             │ HTTP/SSE
             │ (port 3000)
┌────────────▼─────────────────────┐
│   Gateway (apps/gateway/)         │
│  • Express.js SSE broker          │
│  • PC control dispatcher          │
│  • LLM backend proxy              │
│  • Langfuse integration           │
└────────────┬──────────────────────┘
             │ HTTP
             │ (port 8001)
┌────────────▼──────────────────────┐
│  Backend (apps/backend-ts/)        │
│  • LLM abstraction (factory.ts)    │
│  • Memory (ChromaDB + SQLite)      │
│  • Speaker profiles (schema.ts)    │
│  • Langfuse observability          │
└───────────────────────────────────┘
```

---

## v3.6 Capability Architecture: GPU Multi-Platform

**Files Modified:** `stt.py`, `tts.py`, `config.py`  
**New Files:** `device_detect.py`  
**Scope:** Python desktop client (local inference layers)

### GPU Detection Pattern

**Current v3.5 Implementation:**
- STT: `stt.py._detect_device()` checks CUDA → ROCm (Linux only) → Metal → CPU
- TTS Kokoro: Device auto-selected by library; no explicit cascade
- TTS Chatterbox: Sets `_chatterbox_device` post-warmup but no retry logic

**v3.6 Changes:**
- Consolidate GPU detection into `device_detect.py` factory
- Apply same cascade pattern to both STT + TTS (Kokoro + Chatterbox)
- Integrate `_detect_amd_windows()` for Windows ROCm detection
- Add config override field (`gpu_device_override: str`)
- Support extras in `pyproject.toml`: `[cuda-gpu]`, `[rocm-windows]`, `[metal-gpu]`

### Data Flow

```
startup: __main__.py
  → init_stt(config)
    → stt.py._detect_device(config) [new: uses device_detect.py]
    → returns cuda/rocm/metal/cpu
    → WhisperModel loaded on detected device

startup: __main__.py
  → init_tts(config)
    → _start_chatterbox_warmup() calls device_detect.detect_device()
    → tries cuda → mps (directml on Windows) → cpu
    → persists _chatterbox_device global
    → Kokoro loads separately on same detected device
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| `stt.py` | Replace `_detect_device()` impl with call to `device_detect.detect_device()` | ~5 lines modified |
| `tts.py` | Refactor `_start_chatterbox_warmup()` + `_create_kokoro_engine()` to use device_detect | ~40 lines modified |
| `config.py` | Add fields: `gpu_acceleration: bool = True`, `gpu_device_override: str = ""` | ~10 lines |
| **`device_detect.py`** | **NEW** — GPU detection factory, device cascade, fallback logic | ~150 lines |

---

## v3.6 Capability Architecture: OpenRouter LLM Provider

**Files Modified:** `backend-ts/src/llm/config.ts`, `factory.ts`, `types.ts`, `.env.example`  
**Scope:** Backend-ts only (zero Python client changes)

### LLM Provider Abstraction Layer

**Current v3.5 Implementation:**
- `llm/config.ts` — Zod schema for env vars
- `llm/factory.ts` — `createLLM()` returns `BaseChatModel` (provider-agnostic)
- Providers: lmstudio, openai, anthropic, gemini

**v3.6 Changes:**
- Add `openrouter` to `LLMProvider` enum
- Instantiate as `ChatOpenAI({baseURL: 'https://openrouter.ai/api/v1', apiKey, model})`
- Start with free tier (no API key required)
- Make opt-in via `.env` variable; default remains lmstudio (privacy-first)

### Data Flow

```
Python: chat.py → POST /api/chat {userText, ...}
       └─ (no LLM selection logic here)

Gateway: proxies to backend-ts

Backend-ts: 
  config.LLM_PROVIDER = env.LLM_PROVIDER || 'lmstudio'
  → createLLM() checks config
  → if 'openrouter': ChatOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY || 'free-tier',
      model: env.OPENROUTER_MODEL || 'meta-llama/...:free'
    })
  → streams response back to gateway

Gateway: SSE tokens → Python
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| `llm/config.ts` | Add OPENROUTER_API_KEY, OPENROUTER_MODEL, openrouter enum | ~8 lines |
| `llm/factory.ts` | Add case 'openrouter' with ChatOpenAI baseURL | ~12 lines |
| `llm/types.ts` | Add 'openrouter' to LLMProvider union | ~1 line |
| `.env.example` | Document OPENROUTER_API_KEY (commented for privacy) | ~2 lines |

---

## v3.6 Capability Architecture: Hybrid Retrieval (Semantic + Keyword + Recency)

**Files Modified:** `backend-ts/src/memory/manager.ts`, `store.ts`  
**New Files:** `backend-ts/src/memory/retriever.ts`  
**Scope:** Backend-ts memory layer (transparent to Python client)

### Retrieval Architecture

**Current v3.5 Implementation:**
- `manager.buildContext()` calls `vectors.search(userText, topK=5)` — semantic only
- Returns top-5 semantically similar messages
- No keyword or recency ranking

**v3.6 Changes:**
- Create `HybridRetriever` class combining three search axes:
  1. Semantic: `vectors.search()` from ChromaDB (existing)
  2. Keyword: `store.searchText()` via SQLite FTS5 or LIKE (new)
  3. Recency: `store.recentMessages()` last N by timestamp (new)
- Merge results + dedupe + rank by combined score
- Update `manager.buildContext()` to use retriever

### Data Flow

```
backend-ts: buildContext(userText, speakerId?)
  → retriever.search(userText, speakerId)
    ├─ vectors.search() [semantic top-5]
    ├─ store.searchText(userText) [keyword top-3]
    ├─ store.recentMessages(speakerId, limit=3)
    └─ merge + dedupe + score
  → injects into LLM prompt

LLM: generates response with full context
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| **`memory/retriever.ts`** | **NEW** — HybridRetriever class, search algorithm | ~200 lines |
| `memory/manager.ts` | Update buildContext() to use retriever | ~15 lines modified |
| `memory/store.ts` | Add searchText(keyword) method for FTS5 | ~25 lines |

---

## v3.6 Capability Architecture: Per-Speaker Memory

**Files Modified:** `backend-ts/src/memory/schema.ts`, `store.ts`, `retriever.ts`, `routes/chat.ts`  
**Scope:** Backend-ts (uses existing v3.5 speaker.py + Phase 89 speaker headers)

### Speaker-Scoped Context

**Current v3.5 Implementation:**
- Python: `speaker.py.identify_speaker()` → `chat.py` injects `x-jarvis-speaker` header
- Backend: Receives header but ignores it (no speaker-scoped retrieval)

**v3.6 Changes:**
- Add `speakerId: varchar` column to messages table
- Update `store.saveMessages()` to persist speaker identity
- Update `retriever.search()` to filter by speakerId
- Extract `x-jarvis-speaker` header in chat endpoint

### Data Flow

```
Python: voice_modes.py
  → speaker.identify_speaker(audio) → {name, confidence}
  
Python: chat.py
  → POST /api/chat {
      userText: "...",
      x-jarvis-speaker: "Alice" (confidence >= 0.75)
    }

Gateway: passes header through

Backend-ts: routes/chat.ts
  → extract x-jarvis-speaker: "Alice"
  → manager.buildContext(userText, speakerId="Alice")
  → retriever.search() filtered by speakerId
  → returns only Alice's prior messages
  → saveTurn(userText, assistantText, speakerId="Alice")

Result: Alice's context isolated from Bob's
```

### Schema Change

```sql
ALTER TABLE messages ADD COLUMN speakerId VARCHAR DEFAULT NULL;
CREATE INDEX messages_speaker_idx ON messages(speakerId, createdAt DESC);
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| `memory/schema.ts` | Add speakerId column + index + migration | ~15 lines |
| `memory/store.ts` | Update saveMessages() to accept speakerId param | ~10 lines modified |
| `memory/retriever.ts` | Add speakerId filter parameter to search() | ~8 lines modified |
| `routes/chat.ts` | Extract header → pass to manager.buildContext() | ~5 lines modified |

---

## v3.6 Capability Architecture: `/memory` Command

**Files Modified:** `desktop-py/src/jarvis_desktop/chat.py`  
**New Files:** `desktop-py/src/jarvis_desktop/commands.py`, gateway routes, backend manager methods  
**Scope:** Python client + gateway + backend-ts

### Memory Inspection CLI

**User Flow:**
```
User: /memory search "deadline"
  → Python chat.py detects /memory command
  → POST /api/memory/search {query, speakerId}
  → Rich table display of results

User: /memory list [Alice]
  → GET /api/memory/list?speaker=Alice
  → Shows all Alice's messages

User: /memory tag <id> important
  → POST /api/memory/{id}/tag {tag: "important"}
  → Persists tag to database

User: /memory delete <id>
  → DELETE /api/memory/{id}
  → Removes from SQLite + ChromaDB
```

### Schema Change

Add `tags` column (JSON array) to messages table:
```sql
ALTER TABLE messages ADD COLUMN tags JSON DEFAULT '[]';
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| **`commands.py`** | **NEW** — MemoryCommand router (search, list, delete, tag) | ~250 lines |
| `chat.py` | Detect /memory command + route to commands module | ~15 lines |
| **`gateway/routes/memory.ts`** | **NEW** — REST endpoints for memory CRUD | ~200 lines |
| `backend-ts/memory/manager.ts` | Add search(), listMessages(), deleteMessage(), tagMessage() methods | ~80 lines |

---

## v3.6 Capability Architecture: Streaming TTS

**Files Modified:** `desktop-py/src/jarvis_desktop/chat.py`, `tts.py`, `ui.py`  
**Scope:** Python desktop client (TTS starts mid-response)

### Sentence-Based Streaming

**Current v3.5 Implementation:**
- SSE loop buffers full response
- After complete: `speak(full_text, config)` blocks until playback done
- User hears silence until TTS finishes

**v3.6 Changes:**
- Detect sentence boundaries (regex: `[.!?]+\s+`)
- Queue sentences to TTS worker thread
- Worker runs async → speaks while SSE still streaming
- Status bar shows "speaking" state

### Data Flow

```
Backend-ts: LLM streams tokens
  → "Hello. " + "How are you? " + "Good to hear."

Gateway: buffers tokens
  (optional: detects sentence boundaries before SSE emit)

Python: chat_loop reads SSE tokens
  → detects sentence boundary: "Hello. "
  → queues to TTS worker
  → continues reading tokens

TTS worker thread
  → reads "Hello. " from queue
  → speak_async() does not block
  → main thread continues printing tokens
  → status bar: "[speaking]"

User sees: tokens printing + speech starting before LLM finishes
```

### Threading Model

```
Main thread (chat_loop)
  ├─ reads SSE stream
  ├─ queues sentences to tts_queue
  └─ prints tokens to console

TTS worker thread
  ├─ reads from tts_queue
  ├─ speaks sentence (blocking)
  ├─ sets ui.set_state("speaking")
  └─ loops until queue empty
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| `chat.py` | Detect sentence boundaries + queue to TTS worker | ~40 lines modified |
| `tts.py` | Implement `speak_streaming(queue, config)` worker method | ~50 lines |
| `ui.py` | Update status bar to show "speaking" state | ~5 lines |

---

## v3.6 Capability Architecture: Performance Metrics & Instrumentation

**Files Modified:** `desktop-py/src/jarvis_desktop/chat.py`, `stt.py`, `tts.py`, backend-ts routes  
**Scope:** Python client + backend-ts (leverage existing Langfuse)

### Instrumentation Points

- **STT Latency:** Time from record start to transcription complete
- **TTFT (Time-to-First-Token):** Request sent to first token received
- **TTFA (Time-to-First-Audio):** Request sent to first audio output (requires streaming TTS)
- **Retrieval Latency:** HybridRetriever.search() duration
- **End-to-end Latency:** User input to response complete

### Data Flow

```
Python: chat_loop starts timer
  time_stt_start = now()
  
Python: stt.transcribe()
  time_stt_end = now()
  
Python: POST /api/chat + start timer
  time_llm_start = now()
  
Backend-ts: receives request
  (existing Langfuse callback handles LLM streaming)
  
Python: receives first token
  time_first_token = now()
  → langfuse.log_span("llm_ttft", duration=time_first_token - time_llm_start)
  
Python: TTS worker gets first sentence
  time_first_audio = now()
  → langfuse.log_span("ttfa", duration=time_first_audio - time_llm_start)
  
Python: interaction complete
  → langfuse.log_span("e2e", duration=...)
```

### Files Affected

| File | Change | Lines |
|------|--------|-------|
| `chat.py` | Add timing instrumentation + Langfuse logging | ~30 lines |
| `stt.py` | Record STT latency | ~5 lines |
| `tts.py` | Record TTS latency | ~5 lines |
| `backend-ts/routes/chat.ts` | Record TTFT from backend perspective | ~10 lines |
| `backend-ts/memory/retriever.ts` | Record retrieval latency | ~5 lines |

---

## v3.6 Build Dependency Order

### Phase 1: GPU Multi-Platform (Days 1–3)
- Consolidate device detection into `device_detect.py`
- Extend STT + TTS cascades
- Test on Windows AMD + Linux NVIDIA + macOS Metal
- **Blocks:** Streaming TTS (GPU latency baseline)

### Phase 2: OpenRouter Provider (Day 1)
- Add provider enum + factory case
- Update `.env.example`
- Test provider switching
- **Orthogonal:** No blocking dependencies

### Phase 3: Hybrid Retrieval (Days 1–2)
- Implement HybridRetriever class
- Add FTS5 keyword search
- Update manager.buildContext()
- **Blocks:** Per-speaker memory (needs retriever interface)

### Phase 4: Per-Speaker Memory (Days 1–2)
- Add speakerId column + index
- Update store + retriever
- Route header through gateway
- **Depends on:** Phase 3 (retriever with filters)
- **Blocks:** `/memory` command (speaker filtering)

### Phase 5: `/memory` Command (Days 1–2)
- Create commands module
- Implement search/list/delete/tag subcommands
- Add backend routes + manager methods
- **Depends on:** Phase 3 + Phase 4

### Phase 6: Streaming TTS (Days 1–2)
- Detect sentence boundaries in SSE loop
- Implement TTS worker thread
- Update status bar
- **Depends on:** Phase 1 (GPU detection = fast TTS baseline)

### Phase 7: Performance Metrics (Days 1–1.5)
- Add instrumentation to all 3 tiers
- Create Langfuse dashboard
- **Depends on:** Phase 6 (TTFA metric)

---

## File Manifest: All Changes

### Python Desktop Client

| File | Status | Lines |
|------|--------|-------|
| `device_detect.py` | **NEW** | ~150 |
| `stt.py` | Modified | ~20 |
| `tts.py` | Modified | ~80 |
| `config.py` | Modified | ~15 |
| `chat.py` | Modified | ~120 |
| `commands.py` | **NEW** | ~250 |
| `ui.py` | Modified | ~10 |

**Total:** ~645 lines new + modified

### Gateway

| File | Status | Lines |
|------|--------|-------|
| `routes/memory.ts` | **NEW** | ~200 |
| `routes/chat.ts` | Modified | ~5 |
| `app.ts` | Modified | ~2 |

**Total:** ~207 lines new + modified

### Backend-ts

| File | Status | Lines |
|------|--------|-------|
| `llm/config.ts` | Modified | ~10 |
| `llm/factory.ts` | Modified | ~15 |
| `llm/types.ts` | Modified | ~1 |
| `memory/retriever.ts` | **NEW** | ~200 |
| `memory/manager.ts` | Modified | ~30 |
| `memory/store.ts` | Modified | ~80 |
| `memory/schema.ts` | Modified | ~20 |
| `routes/chat.ts` | Modified | ~5 |

**Total:** ~361 lines new + modified

---

## Integration Points Summary

### Python ↔ Gateway

| Data | Direction | Header | Phase |
|------|-----------|--------|-------|
| Speaker ID | Python → Gateway | `x-jarvis-speaker` | Phase 4 |
| Metrics | Python → Langfuse | HTTP POST | Phase 7 |
| `/memory` commands | Python → Gateway | POST /api/memory/* | Phase 5 |

### Gateway ↔ Backend-ts

| Data | Direction | Query Param | Phase |
|------|-----------|-------------|-------|
| Speaker ID | Gateway → Backend | routed in body | Phase 4 |
| LLM Provider | env config | backend-side only | Phase 2 |
| Memory queries | Gateway → Backend | REST endpoints | Phase 5 |

### Internal (No Change)

- Python ↔ STT/TTS — same APIs, different GPU devices
- Backend ↔ ChromaDB — same vectors.ts interface
- Backend ↔ SQLite — expanded schema (backward compatible)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| GPU version conflicts (torch 2.6 → 2.9 ROCm) | HIGH | AMD Windows breaks | Separate extras in pyproject.toml |
| OpenRouter rate-limiting | MEDIUM | User degradation | Fallback to lmstudio in factory |
| Sentence boundary edge cases | MEDIUM | Garbled TTS output | Regex unit tests + manual testing |
| Speaker identification latency | LOW | TTFA increases | Cache embeddings; profile once/session |
| Langfuse spam (every token = span) | MEDIUM | Dashboard noise | Batch metrics per turn |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| GPU Multi-Platform | HIGH | Documented in ROCM-WINDOWS-IMPLEMENTATION.md; ctranslate2 support verified |
| OpenRouter | HIGH | OpenAI-compatible; no new LangChain deps |
| Hybrid Retrieval | MEDIUM | Design solid; FTS5 requires testing |
| Per-Speaker Memory | HIGH | v3.5 speaker.py proven; header flow established |
| `/memory` Command | MEDIUM | CLI design clear; Rich output standard |
| Streaming TTS | MEDIUM | Threading standard; TTFA gains depend on hardware |
| Performance Metrics | HIGH | Langfuse exists; no new observability layer |

---

## Success Criteria

- [x] GPU detected automatically; fallback to CPU transparent
- [x] OpenRouter selectable via `.env`; free tier requires no API key
- [x] Hybrid retrieval combines semantic + keyword + recency
- [x] Per-speaker memory: Alice's messages invisible to Bob
- [x] `/memory search` + `/memory list` + `/memory delete` + `/memory tag` working
- [x] TTS starts while LLM still generating; TTFA < v3.5 by 3–5s
- [x] TTFT/TTFA/latency recorded in Langfuse; dashboard renders p50/p95/p99
- [x] Zero breaking changes to existing APIs

---

## Key References

- `/root/jarvis/docs/ROCM-WINDOWS-IMPLEMENTATION.md` — AMD GPU on Windows
- `/root/jarvis/.planning/PROJECT.md` — v3.6 milestone goals
- `/root/jarvis/CLAUDE.md` — Technology stack + multi-LLM pattern
- `/root/jarvis/apps/desktop-py/src/jarvis_desktop/speaker.py` — Speaker recognition (Phase 89)
- `/root/jarvis/apps/backend-ts/src/llm/` — LLM abstraction (foundation for OpenRouter)
- `/root/jarvis/apps/backend-ts/src/memory/` — Memory manager + ChromaDB integration
