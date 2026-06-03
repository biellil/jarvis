# Technology Stack: JARVIS v3.6

**Project:** JARVIS — Just A Rather Very Intelligent System (v3.6 NEW FEATURES)
**Researched:** June 2, 2026
**Scope:** GPU multi-platform, OpenRouter integration, hybrid memory retrieval, per-speaker memory, streaming TTS, performance metrics

## Executive Summary

JARVIS v3.6 adds GPU acceleration across Windows (AMD ROCm + NVIDIA CUDA), Linux (ROCm + CUDA), and macOS (Metal Performance Shaders), multi-provider LLM flexibility via OpenRouter, enhanced memory with hybrid semantic-keyword retrieval and speaker partitioning, and streaming TTS for real-time audio output. The stack leverages existing LangChain/LangGraph abstractions — **no breaking changes to core architecture**.

---

## Recommended Stack Additions

### 1. GPU Multi-Platform Detection & Acceleration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **torch** | 2.6.0 (CPU default) + 2.9.1+rocm7.2.1 (AMD Windows, optional) | GPU detection + acceleration | PyTorch's `torch.cuda.is_available()`, `torch.backends.mps.is_available()` provide cross-platform GPU detection. ROCm 7.2.1 on Windows requires optional wheel from AMD repo (not PyPI). CUDA auto-detected if NVIDIA driver present. |
| **pynvml** (or **nvidia-ml-py**) | 12.x | NVIDIA GPU monitoring (optional) | Provides programmatic access to NVML for GPU diagnostics (memory, utilization, temp). Works on Windows/Linux. For monitoring only — not required for operation. |
| **py3nvml** | 0.2.x+ | Cross-platform GPU utilities (optional) | Lightweight wrapper for GPU detection across platforms. MEDIUM confidence — niche adoption, but works. |

**Detection Approach (RECOMMENDED):**
```python
# Unified GPU detection layer (add to existing llm_factory.py)
import torch

def detect_gpu_device():
    """Returns best GPU device available on current platform."""
    # 1. Check CUDA (NVIDIA) — works on Windows/Linux
    if torch.cuda.is_available():
        return "cuda"  # NVIDIA via CUDA
    
    # 2. Check ROCm (AMD) — for Linux, or Windows with ROCm installed
    # On Windows: ROCm appears as "cuda" to PyTorch when installed
    
    # 3. Check Metal (macOS)
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"  # Apple Metal Performance Shaders
    
    # 4. Fallback
    return "cpu"
```

**For Windows AMD (ROCm 7.2.1):**
- AMD HIP SDK must be installed separately (C++ runtime)
- Torch 2.9.1+rocm wheels installed manually (not via uv/pip):
  ```bash
  pip install --no-cache-dir \
    "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl"
  ```
- This is OPTIONAL; v3.6 must work without it (fallback to CPU)
- Update `pyproject.toml` with `[extra-amd-gpu]` doc for manual install
- **Status:** Existing code at `/root/jarvis/docs/ROCM-WINDOWS-IMPLEMENTATION.md` already covers this

**For Linux GPU (Docker or native):**
- Use nvidia-docker for NVIDIA CUDA
- Use device passthrough (`--device=/dev/dri:/dev/dri`) for Vulkan (ROCm/Intel/AMD)
- **Status:** Existing Docker setup works; no new stack items required

**For macOS Metal:**
- torch built with Metal support auto-detects via `torch.backends.mps.is_available()`
- No separate install needed (included in torch)

---

### 2. OpenRouter LLM Provider Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **langchain-openrouter** | 0.2.3+ (current May 2026) | LangChain integration for OpenRouter | First-party LangChain package (not community). Supports 300+ models via single API. Streaming, tool-calling, structured output all work out-of-the-box. Requires OpenRouter API key (free tier available). |

**Why OpenRouter instead of direct OpenAI SDK?**
- Multi-provider access (OpenAI, Anthropic, Google, Meta, etc.) with **single API**
- Fallback routing — if model unavailable, automatically tries alternative
- Cost efficiency — free tier available with rate limits (20 req/min, 200+ req/day)
- Already integrates with existing `langchain-openai` abstraction layer

**Installation:**
```bash
# Core
pip install langchain-openrouter==0.2.3

# Optional: explicit dependency management in pyproject.toml
[project.optional-dependencies]
openrouter = ["langchain-openrouter==0.2.3"]
```

**Configuration (add to existing Settings in config.py):**
```python
from pydantic import BaseSettings

class Settings(BaseSettings):
    # Existing
    llm_provider: str = "lm-studio"  # "lm-studio", "openai", "anthropic", "openrouter"
    
    # NEW
    openrouter_api_key: str = ""  # From .env or env var
    openrouter_model: str = "deepseek/deepseek-r1:free"  # Default to free tier
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
```

**Free Tier Models (June 2026):**
- `deepseek/deepseek-r1:free` — Code/reasoning, 64K context
- `deepseek/deepseek-v3:free` — Balanced, 200K context
- `qwen/qwen3-coder:free` — Coding, 1M context
- `meta-llama/llama-3.3-70b:free` — Text, 8K context
- `google/gemini-2.0-flash:free` — Multimodal
- Full list: https://openrouter.ai/models?q=free

**LangChain Integration (in llm_factory.py):**
```python
from langchain_openrouter import ChatOpenRouter

def get_llm(provider: str = None, **kwargs):
    provider = provider or settings.llm_provider
    
    if provider == "openrouter":
        return ChatOpenRouter(
            model=settings.openrouter_model,
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            **kwargs
        )
    
    # ... existing providers (lm-studio, openai, anthropic)
```

**Key Point:** OpenRouter uses OpenAI-compatible API — it works with `base_url` override just like `langchain-openai` + LM Studio. **No new abstraction layer needed.**

---

### 3. Hybrid Memory Retrieval (Semantic + Keyword + Recency)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **chromadb** | 1.5.5 (existing) | Hybrid search backend | Latest Rust core (2025 rewrite) now supports sparse vectors (BM25 keyword embeddings) + dense vectors (semantic). NEW: Reciprocal Rank Fusion (RRF) merges both. |
| **bm25s** or **rank-bm25** | 0.3.x+ | Sparse vector generation for keyword search | BM25 algorithm ranks by term frequency. Use for keyword embeddings in ChromaDB hybrid search. |
| **nltk** | 3.9+ | Tokenization + stopwords for BM25 | Required by BM25 implementations; already common. |

**Hybrid Retrieval Strategy:**
- **Dense vector:** sentence-transformers `all-MiniLM-L6-v2` (existing) — semantic meaning
- **Sparse vector:** BM25 embeddings — keyword/rare term matching
- **Metadata:** conversation timestamp, speaker_id, context_type
- **Fusion:** ChromaDB's RRF with configurable weights (70% semantic, 30% keyword)
- **Recency:** Metadata filter + recent boost in LangGraph retriever

**Implementation (in memory retriever):**
```python
from chromadb.utils.embedding_functions import create_default_embedding_function
from bm25s import BM25

class HybridMemoryRetriever(BaseRetriever):
    """Combines semantic, keyword, and recency-based retrieval."""
    
    def __init__(self, chroma_collection, bm25_index):
        self.chroma = chroma_collection
        self.bm25 = bm25_index
        self.embedding_fn = create_default_embedding_function()
    
    def retrieve(self, query: str, speaker_id: str = None, top_k: int = 5):
        # 1. Semantic search (dense)
        semantic_results = self.chroma.query(
            query_embeddings=[self.embedding_fn([query])[0]],
            n_results=top_k * 2,  # Get more, will rerank
            where={"speaker_id": speaker_id} if speaker_id else None
        )
        
        # 2. Keyword search (sparse BM25)
        bm25_results = self.bm25.retrieve(query, k=top_k * 2)
        
        # 3. Merge with RRF + recency boost
        return self._reciprocal_rank_fusion(
            semantic_results, 
            bm25_results, 
            weights=(0.7, 0.3),  # 70% semantic, 30% keyword
            top_k=top_k
        )
```

**Installation:**
```bash
# Add to pyproject.toml
pip install rank-bm25==0.3.x  # or bm25s 0.3.x
pip install nltk==3.9+
```

**Status:** ChromaDB 1.5.5 already has hybrid search API (`Search()` with RRF). Only need to implement retriever layer above it.

---

### 4. Per-Speaker Memory Partitioning (Integration with v3.5 Speaker Recognition)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **resemblyzer** | 0.1.4+ (existing, used in v3.5) | Speaker embeddings from audio | Already integrated. Provides 256-dim speaker vectors for identification. |

**Architecture (extends existing ChromaDB setup):**
- **Collection per speaker** OR **metadata filter + speaker_id** in single collection
- RECOMMENDATION: **Single collection + speaker_id metadata** — simpler, allows cross-speaker context when needed
- Each conversation turn stored with `speaker_id` (derived from resemblyzer embedding)
- Hybrid retrieval filters by `speaker_id` for personalized memory
- System memory (intents, preferences) stored with `speaker_id = "system"` (accessible to all)

**No new library needed** — just extend existing SQLite schema + ChromaDB metadata:
```sql
-- Existing turns table, add speaker tracking
ALTER TABLE conversation_turns ADD COLUMN speaker_id TEXT DEFAULT 'unknown';
ALTER TABLE conversation_turns ADD COLUMN speaker_embedding BLOB;  -- 256-dim from resemblyzer
```

**ChromaDB metadata:**
```python
collection.add(
    ids=[turn_id],
    embeddings=[semantic_embedding],
    documents=[turn_text],
    metadatas=[{
        "speaker_id": speaker_id,
        "timestamp": iso8601_timestamp,
        "turn_type": "user|assistant",
        "context_type": "conversation|preference|system"
    }]
)
```

---

### 5. Streaming TTS (Token Streaming from LLM to Audio Output)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **RealtimeTTS** | latest (0.5.x+, maintained 2026) | Streaming TTS wrapper with sentence chunking | Chunk-based streaming: collects tokens until sentence boundary, synthesizes chunks asynchronously. Works with Kokoro. Built for real-time use. |
| **kokoro** | 0.9.4+ (existing) | Neural TTS engine (88M params) | Already integrated. RealtimeTTS can use it as backend. |

**Why NOT true token-streaming (single tokens → audio)?**
- Speech has natural rhythm at sentence/phrase level — token-level synthesis sounds jarring
- Chunk-based buffering (200-500ms) is imperceptible latency but produces natural prosody
- RealtimeTTS + sentence tokenizer balances responsiveness vs quality

**Approach:**
1. LLM generates tokens (streaming via `astream()`)
2. Sentence splitter buffers tokens until `.`, `?`, `!` detected
3. Each buffered chunk → Kokoro TTS in async thread
4. Audio queued and played while LLM continues
5. User hears response ~500ms after LLM starts (TTFT + TTS latency)

**Installation:**
```bash
pip install realtimetts>=0.5.0
```

**Integration (in agent response handler):**
```python
from realtimetts import RealtimeTTS
from langchain.schema import BaseCallbackHandler

class StreamingTTSCallback(BaseCallbackHandler):
    """Streams LLM tokens → sentence buffer → TTS queue."""
    
    def __init__(self, tts_engine: RealtimeTTS):
        self.tts = tts_engine
        self.buffer = ""
        self.sentence_splitter = re.compile(r'[.!?]\s+')
    
    def on_llm_new_token(self, token: str, **kwargs):
        """Called for each LLM token."""
        self.buffer += token
        
        # Check if buffer contains complete sentence
        if re.search(r'[.!?]', self.buffer):
            sentences = self.sentence_splitter.split(self.buffer)
            # Send all but last (incomplete) sentence to TTS
            for sentence in sentences[:-1]:
                self.tts.speak(sentence, stream=True)  # Async/non-blocking
            self.buffer = sentences[-1]  # Keep incomplete

# Use in LangGraph agent:
chain = create_react_agent(...)
callback = StreamingTTSCallback(tts_engine)

result = chain.invoke(
    input,
    callbacks=[callback]
)
```

**Status:** RealtimeTTS already works with async patterns. LangGraph's `astream_events()` emits `on_llm_new_token` callbacks suitable for this pattern.

---

### 6. Performance Metrics (TTFT, TTFA, p95) via Langfuse

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **langfuse** | 2.x (existing self-hosted Docker Compose) | Observability + performance metrics | Already integrated. Can track TTFT (time-to-first-token), TTFA (time-to-first-audio), p95 latency automatically. |

**No new libraries needed.** Existing Langfuse setup already captures:
- LLM call latency (via `on_llm_start` / `on_llm_end` callbacks)
- Tool execution time
- Agent loop iterations

**For TTS + streaming metrics, extend callback:**
```python
from langfuse import Langfuse

class LangfuseStreamingMetricsCallback(BaseCallbackHandler):
    """Tracks TTFT, TTFA, total latency via Langfuse."""
    
    def __init__(self, langfuse_client: Langfuse):
        self.langfuse = langfuse_client
        self.trace = None
        self.first_token_at = None
        self.first_audio_at = None
    
    def on_llm_start(self, **kwargs):
        self.trace = self.langfuse.trace(name="response_generation")
        self.first_token_at = time.time()
    
    def on_llm_new_token(self, token: str, **kwargs):
        if self.first_token_at is None:
            self.trace.log_metric("ttft_ms", (time.time() - self.start_time) * 1000)
    
    def on_tts_start(self, **kwargs):
        self.first_audio_at = time.time()
        self.trace.log_metric("ttfa_ms", (self.first_audio_at - self.start_time) * 1000)
```

---

## Installation Summary

### Core (ALL platforms, no changes to v3.5)
```bash
# Existing stack — unchanged
pip install langchain==1.2.14 langgraph==1.1.4 pydantic==2.x
pip install chromadb==1.5.5 sentence-transformers==3.x
```

### GPU Detection (ALL platforms, optional for monitoring)
```bash
# Torch — already installed for chatterbox-tts
# (no new torch version needed unless specifically using Windows AMD ROCm)

# Optional: NVIDIA GPU monitoring
pip install nvidia-ml-py==12.x  # or pynvml==12.x
```

### OpenRouter (optional, if using free models)
```bash
pip install langchain-openrouter==0.2.3

# Add to .env:
OPENROUTER_API_KEY=  # Leave empty to use free tier
OPENROUTER_MODEL=deepseek/deepseek-r1:free
```

### Hybrid Memory Retrieval
```bash
pip install rank-bm25==0.3.x  # BM25 embeddings for keyword search
pip install nltk==3.9+
```

### Streaming TTS
```bash
pip install realtimetts>=0.5.0
```

### Windows AMD ROCm (OPTIONAL, manual install if needed)
```bash
# Install AMD HIP SDK from https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html

# Replace PyTorch (manual, not via uv):
pip install --no-cache-dir \
  "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl"

pip install chatterbox-tts --no-deps
pip install librosa conformer diffusers omegaconf pyloudnorm resemble-perth s3tokenizer safetensors spacy-pkuseg
```

---

## Alternatives Considered

| Feature | Recommended | Alternative | Why Not |
|---------|-------------|-------------|---------|
| **GPU Detection** | torch built-ins (`torch.cuda.is_available()`, `torch.backends.mps.is_available()`) | Custom GPU detection lib | Built-in methods sufficient, no third-party needed |
| **LLM Routing** | langchain-openrouter | Direct OpenRouter SDK | LangChain abstraction keeps multi-LLM pattern consistent |
| **Keyword Search** | BM25 (rank-bm25) | Elasticsearch + OpenSearch | Elasticsearch adds deployment complexity (need server). BM25 runs in-process. |
| **Hybrid Merge** | ChromaDB RRF | Custom scoring function | ChromaDB's RRF is production-tested; custom adds maintenance burden |
| **TTS Streaming** | RealtimeTTS (chunk-based) | Token-level streaming | Chunk-based maintains prosody quality; token-level sounds unnatural. |
| **Speaker Memory** | Metadata filter in ChromaDB | Separate collection per speaker | Single collection + metadata simpler, allows cross-speaker queries. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **GPUtil** (gpu-utils) | Deprecated in favor of torch/pynvml | Use torch native GPU detection + optional pynvml for NVIDIA |
| **Coqui TTS for streaming** | Project archived (2024); no new updates | Use Kokoro + RealtimeTTS |
| **Direct ROCm Python bindings** (rocm-ctypes) | Complex, platform-specific; torch abstracts it | Rely on torch ROCm wheels + GPU detection via torch |
| **Speech Recognition library** (with built-in STT) | Leaky abstraction; defaults to cloud; forces Whisper wrapper | Use faster-whisper directly (existing) |
| **Custom GPU monitoring** | Maintenance burden; pynvml + torch sufficient | Use pynvml for optional monitoring only |
| **Qdrant for vector storage** | Requires separate server; ChromaDB embeddable | Keep ChromaDB 1.5.5 (already integrated) |
| **Multiple LLM SDKs hardcoded** | Forces conditional imports; breaks abstraction | Route via langchain-openrouter (single entry) |

---

## Version Compatibility Matrix

| Package | Requires | Notes |
|---------|----------|-------|
| langchain-openrouter 0.2.3 | Python >=3.10, langchain >=1.0, openai >=2.0 | First-party LangChain package; works with existing openai SDK |
| realtimetts 0.5.x | Python >=3.10, kokoro >=0.9.4 | Uses Kokoro backend; async-compatible for streaming |
| rank-bm25 0.3.x | Python >=3.8, numpy | Lightweight; no torch dependency |
| chromadb 1.5.5 | Python >=3.9, pydantic >=2.x | Already integrated; Rust core from 2025 supports sparse vectors |
| nvidia-ml-py 12.x | Python >=3.6, NVIDIA driver on system | Optional; NVIDIA GPUs only |

---

## Breaking Changes & Migration Notes

**NONE.** This is a feature addition, not a refactor:
- Existing LangChain/LangGraph patterns unchanged
- GPU detection is transparent (fallback to CPU if unavailable)
- OpenRouter is optional LLM provider (default remains LM Studio if configured)
- ChromaDB API unchanged (hybrid search is additive)
- Streaming TTS is opt-in (fallback to existing sync TTS)
- v3.5 speaker recognition (resemblyzer) continues unchanged

**Rollout strategy:**
1. **Phase 1:** GPU detection + OpenRouter (LLM flexibility)
2. **Phase 2:** Hybrid memory retrieval (search quality)
3. **Phase 3:** Per-speaker memory + streaming TTS (UX improvements)
4. **Phase 4:** Performance metrics (observability)

Each phase can ship independently without affecting earlier phases.

---

## Sources

**GPU Detection & PyTorch:**
- [PyPI torch — Version Info](https://pypi.org/project/torch/)
- [PyTorch MPS Availability Check](https://discuss.pytorch.org/t/how-to-check-mps-availability/152015)
- [AMD ROCm for PyTorch on Windows](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html)
- [pynvml GitHub](https://github.com/gpuopenanalytics/pynvml)

**OpenRouter:**
- [LangChain OpenRouter Integration Docs](https://docs.langchain.com/oss/python/integrations/providers/openrouter)
- [OpenRouter LangChain Guide](https://openrouter.ai/docs/guides/community/langchain)
- [langchain-openrouter PyPI](https://pypi.org/project/langchain-openrouter/)
- [OpenRouter Free Models List (June 2026)](https://openrouter.ai/models?q=free)
- [OpenRouter Free Tier Documentation](https://costgoat.com/pricing/openrouter-free-models)

**Hybrid Memory Retrieval:**
- [ChromaDB Sparse Vector Support](https://www.trychroma.com/project/sparse-vector-search)
- [ChromaDB Hybrid Search Guide](https://cookbook.chromadb.dev/strategies/hybrid-search/)
- [BM25 Keyword Search with ChromaDB](https://cookbook.chromadb.dev/strategies/keyword-search/)

**Streaming TTS:**
- [RealtimeTTS PyPI](https://pypi.org/project/realtimetts/)
- [RealtimeTTS GitHub Releases](https://github.com/KoljaB/RealtimeTTS/releases)
- [Real-time LLM Voice Chat with Kokoro](https://medium.com/@princekrampah/real-time-llm-voice-chat-in-python-kokoro-moonshine-open-source-models-6c6270cbe967)

**LangChain Streaming:**
- [LangChain Streaming Documentation](https://docs.langchain.com/oss/python/langgraph/streaming)
- [LangGraph Token Streaming](https://www.abstractalgorithms.dev/langgraph-streaming-agent-responses)

**Speaker Recognition:**
- [Resemblyzer PyPI](https://pypi.org/project/Resemblyzer/)
- [Resemblyzer GitHub](https://github.com/resemble-ai/resemblyzer)
- [Speaker Recognition with Resemblyzer & QdrantDB](https://codingwithcody.com/2025/04/02/containerized-voice-identification-with-resemblyzer-qdrantdb/)

**Performance Monitoring:**
- [Langfuse Documentation (Existing)](https://langfuse.com)
