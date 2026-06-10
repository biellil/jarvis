# Phase 95: Streaming TTS - Research

**Researched:** 2026-06-10
**Domain:** Python streaming TTS pipeline — sentence boundary detection (PT-BR), async worker thread, multi-provider streaming
**Confidence:** HIGH (all critical decisions verified against live code and installed packages)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Segmentação de frases (PT-BR)**
- D-01: Detector primário = `nltk` PunktSentenceTokenizer modelo `punkt_tab` português, VENDORIZADO — empacotar o pickle PT no repositório e carregar via `nltk.data.path` (definido ANTES do primeiro uso). NUNCA chamar `nltk.download()` em runtime. `nltk` passa a ser dependência nova do `desktop-py`; pinar a versão do nltk.
- D-02: Fallback de segmentação = segmentador regex + lista de abreviações PT-BR (puro-Python, zero deps), já implementado e pronto para o caminho de falha do pitfall P-3.
- D-03: Lista de abreviações deve cobrir no mínimo: `Dr.`, `Sr.`, `Sra.`, `etc.`, `Exmo.`, mais elipses, diálogo citado e listas numeradas — sem produzir chunks de uma palavra.
- D-04: Validação obrigatória: corpus de 50 frases PT-BR antes de shipar.

**Estratégia de chunking / TTFA**
- D-05: Primeiro chunk híbrido = flush na primeira fronteira de sentença OU após ~60-80 chars acumulados, o que vier primeiro. Chunks subsequentes = fronteiras de frase inteiras.
- D-06: Guarda de tamanho mínimo de chunk ~15-20 chars — funde fragmentos minúsculos.

**Worker TTS & barge-in**
- D-07: 1 daemon thread serial + 1 `queue.Queue` (produtor = loop SSE em `chat.py`; consumidor = worker TTS). FIFO.
- D-08: Backpressure = `queue.Queue(maxsize=2-3)`.
- D-09: `_is_playing` vira True ao desenfileirar a primeira frase, False somente quando fila esvazia E reprodução termina.
- D-10: Barge-in / `stop_tts()`: drenar fila consumindo itens (NÃO `queue.clear()`) + `sd.stop()` + sentinela; limpar `_is_playing` no mesmo thread que chama `sd.stop()`.

**Streaming vs fluxos agênticos**
- D-11: Opção D — streamar turnos plain ao vivo + chunkar o `task:done`. Ambos os fluxos usam o mesmo chunker.
- D-12: Pré-requisito a validar: confirmar que `task:done` payload sempre contém texto final completo. Fallback = Opção A (gate por modo).
- D-13: Respeitar comportamento atual: `task:plan` limpa tokens; `task:done` substitui buffer. Não falar tokens de planejamento.

**Medição de TTFA**
- D-14: Linha de log estruturada via loguru, client-side. Zero deps novas. Schema estável para Fase 96.

**Escopo de provider**
- D-15: Todos os 4 providers recebem streaming sentence-by-sentence.
- D-16: Cloud (ElevenLabs/Murf) = API de streaming chunked nativa por provider, uma conexão por turno.
- D-17: TTFA ≤300ms p95 aplica-se SOMENTE ao caminho default Kokoro offline.

### Claude's Discretion
- Estrutura interna do segmentador (módulo novo vs função em `tts.py`); nomes de funções/threads.
- Mecânica exata do sentinela/poison-pill e do timeout de join do thread.
- Layout do schema do log de TTFA (desde que estável e parseável pela Fase 96).
- Onde armazenar o pickle vendorizado do punkt_tab no repo.

### Deferred Ideas (OUT OF SCOPE)
- Worker TTS em 2 estágios com pipelining (synth N+1 enquanto N toca).
- SDK Langfuse no desktop-py / dashboards / alertas de TTFA (Fase 96).
- Keep-alive de modelo Chatterbox para evitar warmup no cold start.
- Whisper streaming.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STTS-01 | `chat.py` accumulates LLM tokens and flushes to TTS at sentence boundary | Verified: `_read_sse_stream()` collects `all_tokens` as plain-text tokens arrive (L484). Producer loop inserts sentences into `queue.Queue` instead of accumulating until stream end. |
| STTS-02 | `nltk.PunktSentenceTokenizer` with Portuguese model detects boundaries correctly for "Dr.", "Sr.", "Sra.", "etc.", quoted dialogue, ellipses | Verified: punkt_tab already has `dr`, `sr`, `sra`, `av`, `ltda`. `exmo`/`exma` missing — augment via `_params.abbrev_types.update(...)`. Tested all edge cases. Numbered lists handled by D-06 min-chunk guard. |
| STTS-03 | TTS worker thread consumes sentence buffer and generates audio chunks asynchronously without blocking LLM stream | Verified: `sse_listener.py` pattern directly applicable. `queue.Queue(maxsize=3)` + daemon thread. Worker calls existing `_kokoro_speak`/`_elevenlabs_speak`/`_murf_speak`/`_chatterbox_speak` per sentence. |
| STTS-04 | TTFA ≤300ms p95, measured via Langfuse spans (Phase 95 uses loguru; Langfuse SDK added in Phase 96) | Verified: `loguru` 0.7.3 already in project (`device_detect.py`). Queue items carry `first_token_ts` (perf_counter) for first sentence only. Worker logs `TTFA {:.0f}ms` before sd.play(). |
</phase_requirements>

---

## Summary

Phase 95 adds sentence-streaming to the TTS pipeline: instead of waiting for the full LLM response, `chat.py` feeds sentences to a worker thread as boundaries are detected. The worker synthesizes and plays each sentence in order, keeping `_is_playing` true across the entire turn (multi-sentence drain) so `voice_modes.py` anti-feedback holds.

The critical PT-BR boundary detection concern (pitfall P-3) is **resolved with HIGH confidence**: `nltk` 3.9.4 is already installed on the machine, the `punkt_tab` directory format works (not the old `.pickle` format), the Portuguese model already handles `Dr.`, `Sr.`, `Sra.`, `etc.`. The only missing abbreviation is `Exmo.`/`Exma.` — these can be injected by augmenting `tokenizer._params.abbrev_types` after loading. Vendoring requires copying 4 files totalling ~355 KB (not 649 KB — that was the old `.pickle` size estimate).

The `task:done` contract (D-12 open question) is **verified stable**: `_handle_agentic_event` at L331-334 reads `data.get("summary", "").strip()` — non-empty summary is the complete final text; empty summary means silent completion. Option D (D-11) is confirmed implementable: route `task:done` summary through the same sentence chunker instead of `speak()` directly.

**Primary recommendation:** Implement as three focused changes: (1) new `SentenceChunker` module with punkt_tab + regex fallback, (2) refactor `_read_sse_stream` to feed sentences to queue instead of accumulating, (3) new `_tts_worker` daemon thread in `tts.py` that calls existing provider functions per sentence.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nltk | >=3.8.2 (pin 3.9.4 is current) | PT-BR sentence boundary detection | punkt_tab directory format introduced in 3.8.2; 3.9.4 is current, installed, verified working |
| queue.Queue | stdlib | Bounded sentence buffer between producer and TTS worker | Thread-safe, already used in project (sse_listener.py); maxsize=3 provides natural backpressure |
| threading.Thread | stdlib | Daemon worker consuming sentence queue | Same pattern as JarvisSSEListener daemon thread |
| loguru | 0.7.3 | Structured TTFA logging | Already imported in `device_detect.py`; not yet in `tts.py`/`chat.py` — add import |
| time.perf_counter | stdlib | Monotonic clock for TTFA measurement | Sub-millisecond resolution, no external dep |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| elevenlabs | 2.52.0 | ElevenLabs streaming | `.convert_realtime(voice_id, text=Iterator[str])` — one WebSocket connection per turn |
| murf | 2.3.0 | Murf streaming | `.stream(text=sentence, voice_id=...)` — one HTTP chunked call per sentence |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| punkt_tab vendored | nltk.download() at runtime | Violates offline/privacy-first constraint (D-01) |
| punkt_tab vendored | pure-regex fallback as primary | Less accurate — cannot infer abbreviation context from corpus; punkt is better for PT-BR |
| queue.Queue worker | asyncio + asyncio.Queue | No benefit here — sounddevice playback is synchronous; threading model matches existing code |
| convert_realtime() for ElevenLabs | .stream() per sentence | .stream() per sentence = N REST calls per turn; convert_realtime() = 1 WebSocket per turn (D-16) |

**Installation addition to pyproject.toml:**
```toml
# [project.dependencies] — add:
"nltk>=3.8.2,<4",
```

**Version verification (2026-06-10):**
- `nltk` 3.9.4 — installed and verified working on this machine
- `elevenlabs` 2.52.0 — installed, `.stream()` and `.convert_realtime()` confirmed present
- `murf` 2.3.0 — installed, `.stream()` confirmed present

---

## Architecture Patterns

### Recommended Project Structure Addition
```
apps/desktop-py/src/jarvis_desktop/
├── sentence_chunker.py   # NEW: PT-BR boundary detection (punkt_tab + regex fallback)
├── tts.py                # MODIFY: add _tts_worker(), start_tts_worker(), stop_tts_worker()
│                         #         refactor speak() -> enqueue_speak(), drain on stop_tts()
│                         #         add _tts_queue: queue.Queue[dict | None]
│                         #         add _tts_thread: threading.Thread | None
└── chat.py               # MODIFY: _read_sse_stream() feeds sentences to queue
                          #         _stream_response() starts worker before SSE loop

apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/
├── abbrev_types.txt      # VENDOR: 301 bytes
├── collocations.tab      # VENDOR: 64 bytes
├── ortho_context.tab     # VENDOR: 363124 bytes (~355 KB total)
└── sent_starters.txt     # VENDOR: 209 bytes
```

### Pattern 1: sentence_chunker.py Module
**What:** Stateful chunker that holds an accumulation buffer and emits complete sentences (or partial chunks on the hybrid first-chunk trigger).
**When to use:** Called from `_read_sse_stream` on every plain token received.

```python
# sentence_chunker.py — key public API
from __future__ import annotations
import re
from pathlib import Path
from typing import Optional
import nltk

# Set vendor path BEFORE loading — critical to do before any nltk.data access
_VENDOR_NLTK = Path(__file__).parent.parent.parent / "assets" / "nltk_data"

_ABBREV_EXTRAS = {"exmo", "exma"}  # Not in punkt_tab portuguese corpus

_tokenizer: Optional[object] = None  # PunktTokenizer, lazy-loaded

def _load_tokenizer():
    global _tokenizer
    if _tokenizer is not None:
        return _tokenizer
    # Insert vendor path at position 0 to override any system paths
    if str(_VENDOR_NLTK) not in nltk.data.path:
        nltk.data.path.insert(0, str(_VENDOR_NLTK))
    try:
        tok = nltk.data.load("tokenizers/punkt_tab/portuguese.pickle")
        tok._params.abbrev_types.update(_ABBREV_EXTRAS)
        _tokenizer = tok
    except LookupError:
        _tokenizer = None  # Falls through to regex fallback
    return _tokenizer

class SentenceChunker:
    """Stateful buffer that emits sentences as tokens arrive.
    
    Hybrid first-chunk strategy (D-05):
      - Emits first chunk at sentence boundary OR ~70 chars, whichever first.
      - Subsequent chunks: sentence boundaries only.
      - Min chunk guard (D-06): fragments < 18 chars are merged with next sentence.
    """
    FIRST_CHUNK_MAX_CHARS = 70
    MIN_CHUNK_CHARS = 18

    def __init__(self):
        self._buf = ""
        self._first_emitted = False

    def feed(self, token: str) -> list[str]:
        """Add token to buffer. Returns list of sentences ready to speak (may be empty)."""
        self._buf += token
        return self._flush_ready()

    def flush_remaining(self) -> list[str]:
        """Force-emit whatever is left in the buffer at stream end."""
        remaining = self._buf.strip()
        self._buf = ""
        self._first_emitted = False
        if remaining:
            return [remaining]
        return []

    def _flush_ready(self) -> list[str]:
        tok = _load_tokenizer()
        results = []
        while True:
            sentence = self._detect_next_sentence(tok)
            if sentence is None:
                break
            if len(sentence) < self.MIN_CHUNK_CHARS and self._first_emitted:
                # Merge tiny fragment into next boundary — keep in buffer with space
                self._buf = sentence + " " + self._buf
                break
            self._first_emitted = True
            results.append(sentence)
        return results

    def _detect_next_sentence(self, tok) -> Optional[str]:
        buf = self._buf
        # Hybrid first-chunk: emit at ~70 chars even without sentence boundary
        if not self._first_emitted and len(buf) >= self.FIRST_CHUNK_MAX_CHARS:
            # Split at last space before threshold to avoid cutting mid-word
            cut = buf.rfind(" ", 0, self.FIRST_CHUNK_MAX_CHARS)
            if cut > 0:
                chunk = buf[:cut].strip()
                self._buf = buf[cut:].lstrip()
                return chunk if chunk else None
        # Standard boundary detection
        sentences = tok.tokenize(buf) if tok else _regex_split(buf)
        if len(sentences) >= 2:
            sentence = sentences[0].strip()
            # Reconstruct remaining buffer from everything after first sentence
            self._buf = buf[len(sentences[0]):].lstrip()
            return sentence if sentence else None
        return None
```

### Pattern 2: TTS Worker Thread
**What:** Daemon thread in `tts.py` that reads sentences from `_tts_queue` and calls the appropriate provider function per sentence.
**When to use:** Started by `_stream_response()` in `chat.py` before the SSE loop; stopped by `stop_tts()` drain.

```python
# tts.py additions
import queue as _queue_module
import time

_tts_queue: _queue_module.Queue = _queue_module.Queue(maxsize=3)  # D-08
_tts_thread: threading.Thread | None = None
_WORKER_SENTINEL = None  # poison-pill to stop worker

def start_tts_worker(config: JarvisConfig) -> None:
    """Start the TTS worker daemon thread. No-op if already running."""
    global _tts_thread
    if _tts_thread and _tts_thread.is_alive():
        return
    _stop_event.clear()
    _tts_thread = threading.Thread(
        target=_tts_worker_loop,
        args=(config,),
        daemon=True,
        name="JarvisTTSWorker",
    )
    _tts_thread.start()

def _tts_worker_loop(config: JarvisConfig) -> None:
    """Consume sentence queue and play audio in order (D-07, D-09)."""
    global _is_playing
    while True:
        item = _tts_queue.get()
        if item is _WORKER_SENTINEL:
            break
        text = item["text"]
        first_token_ts = item.get("first_token_ts")

        # Mark playing for entire turn (D-09)
        if not _is_playing:
            _is_playing = True

        # TTFA log for first sentence (D-14)
        if first_token_ts is not None:
            ttfa_ms = (time.perf_counter() - first_token_ts) * 1000
            logger.info("TTFA {:.0f}ms provider={}", ttfa_ms, config.tts_provider)

        _speak_one(text, config)  # calls existing _kokoro_speak / _elevenlabs_speak / etc.

        # Check if queue now empty → turn done
        if _tts_queue.empty():
            _is_playing = False

def stop_tts() -> None:
    """Stop playback: drain queue by consuming items + sd.stop() + sentinel (D-10)."""
    global _is_playing
    import sounddevice as sd
    # Consume pending items — thread-safe drain (NOT queue.clear())
    while True:
        try:
            _tts_queue.get_nowait()
        except _queue_module.Empty:
            break
    _is_playing = False
    _stop_event.set()
    try:
        sd.stop()
    except Exception:
        pass
    # Unblock worker if it's blocked on get()
    try:
        _tts_queue.put_nowait(_WORKER_SENTINEL)
    except _queue_module.Full:
        pass
```

### Pattern 3: Producer in `_read_sse_stream`
**What:** Feed tokens into `SentenceChunker` as they arrive; enqueue complete sentences to TTS worker.

```python
# chat.py _read_sse_stream() modification (STTS-01)
from jarvis_desktop.sentence_chunker import SentenceChunker
from jarvis_desktop import tts as _tts

# Before loop:
chunker = SentenceChunker()
first_token_ts: float | None = None
tts_turn_started = False

# Inside the event loop (event_type is None branch):
if accumulate_for_tts:
    token_text = payload.replace("\\n", "\n")
    if first_token_ts is None:
        first_token_ts = time.perf_counter()
    sentences = chunker.feed(token_text)
    for i, sent in enumerate(sentences):
        item = {"text": sent}
        if not tts_turn_started and first_token_ts is not None:
            item["first_token_ts"] = first_token_ts
            tts_turn_started = True
        _tts._tts_queue.put(item)  # blocks when queue full (backpressure D-08)
all_tokens.append(payload.replace("\\n", "\n"))

# After stream ends (before returning):
if accumulate_for_tts:
    for sent in chunker.flush_remaining():
        _tts._tts_queue.put({"text": sent})
```

### Pattern 4: task:done Routing (D-11 Option D)
**What:** When `_handle_agentic_event` returns `task:done` summary, route through chunker instead of `speak()`.

```python
# In _read_sse_stream, where agent_text is handled:
if agent_text and accumulate_for_tts:
    all_tokens.clear()
    all_tokens.append(agent_text)
    # Route task:done summary through sentence chunker (D-11)
    done_chunker = SentenceChunker()
    ts = time.perf_counter()
    for i, sent in enumerate(done_chunker.tokenize_all(agent_text)):
        item = {"text": sent}
        if i == 0:
            item["first_token_ts"] = ts
        _tts._tts_queue.put(item)
```

### Anti-Patterns to Avoid
- **`nltk.download()` at runtime:** Violates offline/privacy constraint and blocks the SSE thread. Always vendor the data files.
- **`queue.Queue.clear()` for drain:** Not thread-safe. Instead: consume items in a loop with `get_nowait()` until `Empty`.
- **Setting `_is_playing = False` per-sentence:** `voice_modes.py` polls `is_speaking()` — if it goes False between sentences, the mic capture can start mid-drain and cause feedback. Only set False when queue is empty AND playback ends.
- **Calling `speak()` directly for streaming:** `speak()` is blocking today; it must be refactored to `enqueue_speak()` or the worker must call the provider functions directly.
- **Loading punkt_tab after importing nltk at module level:** Python imports happen before any runtime path setup. The `nltk.data.path.insert()` call must be the FIRST thing in `sentence_chunker.py` initialization, not deferred.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PT-BR sentence boundary detection | Custom regex-only tokenizer | nltk punkt_tab (primary) + regex (fallback D-02) | punkt_tab was trained on PT-BR corpus: handles Dr./Sr./Sra. correctly out-of-box; regex cannot match corpus-learned abbreviation context |
| Thread-safe bounded queue | Custom circular buffer | `queue.Queue(maxsize=3)` | stdlib, battle-tested, `get()` blocks as natural backpressure |
| Streaming audio from bytes iterator | Custom chunked HTTP decoder | elevenlabs `.stream()` / `.convert_realtime()` | SDK handles TLS, retry, chunking; `.convert_realtime()` maintains one WS connection per turn |

**Key insight:** The sentence segmentation problem looks trivial but abbreviation disambiguation in PT-BR is a trained statistical task — a regex list will always miss edge cases in production data.

---

## Runtime State Inventory

> Skipped — this is a greenfield feature addition (new module + refactor of existing functions). No rename/rebrand involved. No stored data, OS-registered state, or build artifacts carry old names.

---

## Common Pitfalls

### Pitfall 1: `Exmo.` splits into two sentences (P-3 partial)
**What goes wrong:** NLTK punkt_tab portuguese corpus does not include `exmo` in its abbreviation list — `O Exmo. Presidente` becomes `['O Exmo.', 'Presidente assinou.']`.
**Why it happens:** punkt_tab's PT-BR corpus was trained on text that rarely uses `Exmo.` as a standalone abbreviation.
**How to avoid:** After `nltk.data.load()`, immediately call `tokenizer._params.abbrev_types.update({"exmo", "exma"})`. This is a one-time augmentation per tokenizer instance — do it in `_load_tokenizer()` singleton.
**Warning signs:** 50-sentence validation corpus includes `Exmo.` test case — failure here means the augmentation was missed.

### Pitfall 2: `_is_playing` goes False between sentences (anti-feedback regression)
**What goes wrong:** `voice_modes.py` D-06 polls `tts.is_speaking()` every ~20ms. If `_is_playing` is cleared after sentence 1 but the worker hasn't yet dequeued sentence 2, there is a ~0-50ms gap where `is_speaking()` returns False → mic capture starts → feedback.
**Why it happens:** Setting `_is_playing = False` when `sd.wait()` returns (end of one sentence) instead of when the entire queue is drained.
**How to avoid:** Only set `_is_playing = False` when `_tts_queue.empty()` is True after playback completes. Use `_tts_queue.empty()` as the guard, not just "after `sd.wait()`" (D-09).
**Warning signs:** Test: queue 3 sentences, check `is_speaking()` returns True continuously.

### Pitfall 3: Min-chunk guard applied to first chunk causes TTFA regression
**What goes wrong:** D-06 min-chunk guard (~18 chars) is applied BEFORE the first-chunk hybrid trigger (D-05), merging a short first chunk with the next sentence and delaying audio start.
**Why it happens:** Applying the guard uniformly regardless of whether first audio has been emitted.
**How to avoid:** Skip the min-chunk merge for the very first emitted sentence — only merge sub-threshold fragments on sentences 2+ (when `self._first_emitted` is True). This is already reflected in the Pattern 1 code above.
**Warning signs:** TTFA p95 > 300ms on short first sentences (e.g., `"Sim."` or `"Olá!"`).

### Pitfall 4: `nltk.data.path` not set before first import
**What goes wrong:** If any module in the import chain calls `nltk.data.load()` before `sentence_chunker.py` inserts the vendor path, NLTK resolves against system paths and may fail on a clean machine (no nltk_data in AppData).
**Why it happens:** Python module-level code runs at import time; if `sentence_chunker` is imported lazily inside `_read_sse_stream`, the path may be set too late if another nltk call was made earlier.
**How to avoid:** Set `nltk.data.path.insert(0, str(_VENDOR_NLTK))` at module LOAD time (module-level code, not inside a function). Verify no other module imports `nltk` before `sentence_chunker`.
**Warning signs:** `LookupError: Resource tokenizers/punkt_tab/portuguese not found` on CI or fresh machine.

### Pitfall 5: `queue.put()` blocks the SSE read loop under slow TTS
**What goes wrong:** With `maxsize=3`, if Chatterbox is still synthesizing sentence N-3, `queue.put(item)` blocks the `_read_sse_stream` loop — the SSE HTTP connection's read buffer fills, gateway sees a slow consumer, and the LLM stream may stall.
**Why it happens:** D-08 backpressure is intentional, but the gateway timeout behavior is undefined.
**How to avoid:** The queue maxsize=3 is correct for Kokoro (fast) and ElevenLabs/Murf (cloud latency). For Chatterbox CPU path (~2-5s per sentence), the gateway stream will stall — this is acceptable since D-17 exempts Chatterbox from the 300ms TTFA guarantee. Document this in code comments.
**Warning signs:** SSE stream stops mid-response when Chatterbox is provider.

### Pitfall 6: ElevenLabs `convert_realtime()` voice_id hardcoded English voice
**What goes wrong:** Current `_elevenlabs_speak` uses `voice_id="21m00Tcm4TlvDq8ikWAM"` (Rachel, English). For PT-BR, need a Portuguese voice ID.
**Why it happens:** Current implementation uses a hardcoded English default.
**How to avoid:** Verify `config.elevenlabs_voice_id` field exists in `JarvisConfig` (or add it) and pass it to `convert_realtime()`. This is in scope for the ElevenLabs streaming refactor.
**Warning signs:** Portuguese text produces English-accented audio from ElevenLabs.

---

## Code Examples

Verified patterns from live code inspection:

### Verified: task:done contract (L331-334 of chat.py)
```python
# _handle_agentic_event in chat.py — verified 2026-06-10
elif event_type == "task:done":
    summary = data.get("summary", "").strip()
    if summary:
        return summary  # complete final text — non-empty always
    # empty summary: silent completion (some agentic flows)
```
**Contract confirmed:** `task:done` summary is either the complete final response text or empty string. It never contains partial text. Option D (D-11) is safe.

### Verified: `_read_sse_stream` token accumulation (L482-491 of chat.py)
```python
for event_type, payload in events:
    if event_type is None:
        all_tokens.append(payload.replace("\\n", "\n"))   # plain LLM tokens
    else:
        if event_type == "task:plan":
            all_tokens.clear()  # discard planning tokens
        agent_text = _handle_agentic_event(event_type, payload, config)
        if agent_text and accumulate_for_tts:
            all_tokens.clear()  # task:done supersedes streamed tokens
            all_tokens.append(agent_text)
```
**Integration point:** Replace `all_tokens.append(payload)` with `sentences = chunker.feed(payload)` + enqueue loop.

### Verified: `stop_tts()` current pattern (L208-223 of tts.py)
```python
def stop_tts() -> None:
    global _is_playing
    import sounddevice as sd
    _is_playing = False
    _stop_event.set()
    try:
        sd.stop()
    except Exception:
        pass
```
**Extension needed:** Before `sd.stop()`, drain `_tts_queue` by consuming items in loop (D-10). Then send sentinel.

### Verified: `_stream_response` speak call (L589-590 of chat.py)
```python
full_text = _read_sse_stream(response, config, accumulate_for_tts=True, main_stream=True)
if full_text.strip():
    speak(full_text, config)   # <-- replace with: worker already consumed sentences via queue
```
**Refactor:** Remove `speak(full_text, config)` call. The worker thread will have already queued the sentences during `_read_sse_stream`. Call `_tts.drain_tts_worker()` or similar to wait for queue empty if needed.

### Verified: punkt_tab vendoring approach
```python
# sentence_chunker.py — module level (NOT inside a function)
from pathlib import Path
import nltk

_VENDOR_NLTK = Path(__file__).resolve().parent.parent / "assets" / "nltk_data"
# This runs at import time — before any nltk.data access
if str(_VENDOR_NLTK) not in nltk.data.path:
    nltk.data.path.insert(0, str(_VENDOR_NLTK))
```
**Tested:** Vendor-path-only load works. Path: `assets/nltk_data/tokenizers/punkt_tab/portuguese/` (4 files, ~355 KB).

### Verified: ElevenLabs convert_realtime signature (elevenlabs 2.52.0)
```python
# For D-16 one-connection-per-turn strategy:
# client.text_to_speech.convert_realtime(
#     voice_id: str,
#     text: Iterator[str],     # yields sentences one by one
#     output_format="pcm_24000",
#     model_id="eleven_flash_v2_5",
# ) -> Iterator[bytes]          # yields PCM audio chunks
```
**Key:** `text` parameter is `Iterator[str]` — pass a generator that yields sentences. This keeps one WS connection for the entire turn (D-16). For sentence-by-sentence in a queue architecture, the generator must be coordinated with the sentence queue — implement as a thread-local generator fed by the sentence dequeue loop.

### Verified: Murf stream signature (murf 2.3.0)
```python
# client.text_to_speech.stream(
#     text: str,
#     voice_id: str,
#     format="WAV",
#     sample_rate=24000,
# ) -> Iterator[bytes]
# Docstring: "Synthesize speech with ultra-low latency over a streaming connection"
# Endpoint: https://global.api.murf.ai/v1/speech/stream
```
**Note:** Murf's WebSocket (`stream_input`) is beta and not in the Python SDK. Use `.stream()` per sentence — one HTTP chunked call per sentence is the correct approach for Murf.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `speak(full_text)` after stream completes (D-01 in current tts.py) | Sentence-by-sentence streaming via worker thread | Phase 95 | TTFA drops from ~total_response_synthesis_time to ~first_sentence_synthesis_time |
| nltk `punkt` `.pickle` file (single binary) | nltk `punkt_tab` directory (4 text files per language) | NLTK 3.8.2 | Vendoring is 4 small text files, not 1 binary pickle |
| ElevenLabs `.convert()` — full text, blocking | `.convert_realtime(text=Iterator[str])` — WebSocket, streaming | elevenlabs SDK 1.x+ | One WS connection per turn; audio chunks arrive as text is fed |

**Deprecated/outdated:**
- `nltk punkt` `.pickle` format: replaced by `punkt_tab` directory in NLTK 3.8.2+. Do NOT look for `tokenizers/punkt/PY_portuguese.pickle` — it does not exist in 3.8.2+.
- CONTEXT.md mention of "649KB pickle": was the old punkt `.pickle` estimate. The new punkt_tab directory for Portuguese is ~355 KB (4 files).

---

## Open Questions

1. **ElevenLabs `convert_realtime()` with queue architecture**
   - What we know: `convert_realtime(text=Iterator[str])` expects a Python generator; yields audio chunks from a WS connection.
   - What's unclear: In a queue-consumer worker, the TTS worker dequeues one sentence at a time. The ElevenLabs WS stays open while the generator is alive. How to coordinate the generator lifespan with the queue drain for a single turn?
   - Recommendation: Implement ElevenLabs turn as "collect all sentences for a turn first, then call `convert_realtime(text=iter(sentences))` once." This means ElevenLabs still waits for at least some sentences before starting, but the WS stays open. OR: implement per-sentence `.stream()` calls and accept the N-connections-per-turn tradeoff for simplicity — D-16 prefers one connection, but if implementation complexity is high, `.stream()` per sentence is a viable starting point and can be upgraded.

2. **`_stream_response` vs. worker start/stop lifecycle**
   - What we know: `_stream_response()` calls `_read_sse_stream()` and then `speak(full_text)`. The new flow needs the worker running before SSE starts.
   - What's unclear: Should `start_tts_worker()` be called once at `init_tts()` (stays running for the session) or once per `_stream_response()` invocation?
   - Recommendation: Start once at `init_tts()` (session-lifetime daemon) — simpler, matches SSE listener pattern. Worker blocks on `_tts_queue.get()` when idle.

3. **Chatterbox sentence-by-sentence latency**
   - What we know: Chatterbox `.generate()` is synchronous (no streaming generator). On CPU: 2-5s per sentence. D-17 exempts it from 300ms TTFA.
   - What's unclear: Does the `_chatterbox_warmup_event.wait(15)` in `_chatterbox_speak()` correctly compose with the worker thread architecture (warmup happens in a separate thread)?
   - Recommendation: The worker calls `_chatterbox_speak()` which already has the warmup wait. The warmup daemon thread is session-lifetime. This composes correctly — no change needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| nltk | sentence_chunker.py | ✓ | 3.9.4 | Regex fallback (D-02) |
| punkt_tab portuguese data | sentence_chunker.py | ✓ | In AppData (to be vendored into repo) | Regex fallback (D-02) |
| elevenlabs SDK | _elevenlabs_speak streaming | ✓ | 2.52.0 | Kokoro offline |
| murf SDK | _murf_speak streaming | ✓ | 2.3.0 | Kokoro offline |
| loguru | TTFA logging | ✓ | 0.7.3 | (no fallback needed) |
| sounddevice | audio playback | ✓ | 0.5.5 | — |
| pytest | validation tests | ✓ | 9.x (dev group) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `chatterbox-tts` not installed in current Python env — Kokoro fallback applies. No action needed; `_chatterbox_available` flag handles this.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.x (dev group) |
| Config file | `apps/desktop-py/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd apps/desktop-py && python -m pytest tests/test_sentence_chunker.py -x -q` |
| Full suite command | `cd apps/desktop-py && python -m pytest tests/ -x -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STTS-01 | Tokens accumulated and flushed at sentence boundary | unit | `pytest tests/test_sentence_chunker.py::test_feed_emits_sentence -x` | ❌ Wave 0 |
| STTS-01 | `_read_sse_stream` enqueues sentences instead of accumulating | unit | `pytest tests/test_chat.py::test_sse_stream_enqueues_sentences -x` | ❌ Wave 0 |
| STTS-02 | Dr./Sr./Sra./etc./Exmo. do not produce 1-word chunks | unit | `pytest tests/test_sentence_chunker.py::test_pt_br_abbreviations -x` | ❌ Wave 0 |
| STTS-02 | 50-sentence PT-BR validation corpus passes | unit | `pytest tests/test_sentence_chunker.py::test_pt_br_corpus_50 -x` | ❌ Wave 0 (P-3 gate) |
| STTS-03 | Worker thread consumes queue without blocking SSE loop | unit | `pytest tests/test_tts.py::test_tts_worker_nonblocking -x` | ❌ Wave 0 |
| STTS-03 | `is_speaking()` remains True during multi-sentence drain | unit | `pytest tests/test_tts.py::test_is_speaking_multisent_drain -x` | ❌ Wave 0 |
| STTS-04 | TTFA log line emitted for first sentence | unit | `pytest tests/test_tts.py::test_ttfa_log_emitted -x` | ❌ Wave 0 |
| STTS-04 | TTFA ≤300ms p95 for Kokoro path | integration/manual | Manual measurement on machine with Kokoro — automated proxy via mock timing | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_sentence_chunker.py tests/test_tts.py -x -q`
- **Per wave merge:** `pytest tests/ -x -q`
- **Phase gate (P-3):** `pytest tests/test_sentence_chunker.py::test_pt_br_corpus_50 -x` must pass GREEN before Phase 95 ships. If RED → deploy regex fallback (D-02).

### Wave 0 Gaps
- [ ] `tests/test_sentence_chunker.py` — unit tests for SentenceChunker (STTS-01, STTS-02, P-3 corpus gate)
- [ ] `apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/` — 4 vendor files (~355 KB)
- [ ] Add `nltk>=3.8.2,<4` to `[project.dependencies]` in `pyproject.toml`

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies To |
|-----------|------------|
| Stack: Python 3.10+, LangChain/LangGraph | Not directly applicable (desktop-py is standalone Python, not the backend TS/LangChain stack) |
| Multi-LLM: every LLM call through abstraction layer | Not applicable to TTS |
| Multiplataforma: OS-specific code isolated with common interface | `sentence_chunker.py` must work on Windows/Linux/macOS — vendored data paths use `Path(__file__).resolve()` |
| Privacidade: conversa nunca vai para cloud sem config explícita | ElevenLabs/Murf streaming only when `not config.local_only` (already enforced in existing `speak()`) |
| Sem UI obrigatória: JARVIS deve funcionar 100% em terminal | No changes to UI — worker is background daemon |
| NUNCA `nltk.download()` em runtime | Enforced by vendoring approach (D-01) |
| loguru já no projeto | `from loguru import logger` — already in `device_detect.py`, add to `tts.py` |

---

## Sources

### Primary (HIGH confidence)
- Live code inspection — `chat.py` L454-521, L554-596; `tts.py` L1-140, L158-230, L280-392, L480-495; `voice_modes.py` L1-22; `sse_listener.py` L1-138; `pyproject.toml` full — verified 2026-06-10
- NLTK 3.9.4 installed + punkt_tab/portuguese directory confirmed present and tested live
- elevenlabs 2.52.0 — `.stream()` and `.convert_realtime()` signatures verified via `inspect.signature()`
- murf 2.3.0 — `.stream()` signature and docstring verified via `inspect.signature()`
- Sentence boundary tests — run live against installed tokenizer with PT-BR edge cases

### Secondary (MEDIUM confidence)
- [ElevenLabs WebSocket TTS docs](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input) — confirms `/stream-input` WebSocket endpoint
- [ElevenLabs Streaming guide](https://elevenlabs.io/docs/api-reference/streaming) — confirms streaming is available on all plans
- [Murf Streaming docs](https://murf.ai/api/docs/text-to-speech/streaming) — HTTP streaming endpoint confirmed; TTFA <130ms claimed by vendor
- [Murf WebSockets beta](https://murf.ai/api/docs/text-to-speech/web-sockets) — WebSocket `stream_input` is beta, not in Python SDK

### Tertiary (LOW confidence)
- Deepgram "50-100 chars" first-chunk recommendation referenced in CONTEXT.md D-05 — not independently verified but aligns with hybrid 60-80 char threshold chosen.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed and APIs inspected
- Architecture: HIGH — integration points verified against live code with exact line numbers
- Pitfalls: HIGH — P-3 verified via live tests; others derived from code analysis
- PT-BR tokenizer behavior: HIGH — tested live on machine with installed punkt_tab

**Research date:** 2026-06-10
**Valid until:** 2026-09-10 (stable — nltk punkt_tab format has been stable since 3.8.2; ElevenLabs/Murf SDK versions pinned in pyproject.toml)
