# Phase 75: Text-to-Speech (TTS) - Research

**Researched:** 2026-05-18  
**Domain:** Offline/cloud TTS integration, voice synthesis, audio playback, configuration management  
**Confidence:** HIGH

## Summary

Phase 75 adds Text-to-Speech capabilities to JARVIS using **Kokoro 0.9.4** as the primary offline engine (PT-BR voices: `pf_dora`, `pm_alex`, `pm_santa`) with automatic fallback to ElevenLabs (cloud) and Murf.ai (second cloud). Audio playback uses the existing `sounddevice 0.5.5` stack. The implementation follows the singleton pattern established in Phase 74 (stt.py), with TTS triggered **after full SSE stream completion** rather than streaming by sentence. Configuration fields extend `JarvisConfig` with `kokoro_voice`, `tts_provider`, `local_only`, and API keys. Thread-safe `stop_tts()` is exposed for Phase 76 PTT interruption.

**Primary recommendation:** Implement `tts.py` singleton module with Kokoro as engine, stdlib-only HTTP for cloud fallback (no SDK dependencies), and thread-safe audio playback. Extend config.py with TTS-specific fields. Modify chat.py to accumulate full response text and trigger TTS after stream completes. Add pytest fixtures for mock Kokoro model (offline test) and mock HTTP responses (cloud fallback test).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** TTS plays **after response completes** — accumulate all tokens during SSE stream, when stream terminates execute TTS on full text
- **D-02:** Sequence: text appears in terminal (stream) → stream terminates → `[TTS] falando...` message → audio plays → returns to prompt
- **D-03:** Default voice: **PT-BR via Kokoro**; `kokoro_voice` field in config.json determines voice (configurable)
- **D-04:** If espeak-ng unavailable (Windows without manual install): TTS silent with warning `[TTS] espeak-ng não encontrado — voz PT-BR indisponível. Texto exibido normalmente.`
- **D-05:** `kokoro_voice` is configurable via `~/.jarvis/config.json` with default to a valid PT-BR voice
- **D-06:** Architecture: user chooses provider via `tts_provider` → if fails → Kokoro offline as fallback (NOT fixed 3-provider chain)
- **D-07:** `tts_provider` in JarvisConfig (default `"kokoro"`) controls which provider to use: `"kokoro"` | `"elevenlabs"` | `"murf"`
- **D-08:** API keys in `~/.jarvis/config.json`: fields `elevenlabs_api_key: str = ""` and `murf_api_key: str = ""`
- **D-09:** Missing key/provider failure → fall back to Kokoro with print notification: `[TTS] ElevenLabs indisponível — usando Kokoro offline.`
- **D-10:** Field `local_only: bool = False` in JarvisConfig; when `true`, never accesses ElevenLabs or Murf (PYTTS-04)
- **D-11:** `tts.py` exposes `stop_tts()` function (thread-safe) for Phase 76 PTT hotkey interruption
- **D-12:** No rich formatting this phase — `print()` only for TTS status (consistent with Phase 73)

### Claude's Discretion
- Internal structure of `tts.py` (class vs module plat, singleton pattern)
- Audio playback engine choice (sounddevice already in stack)
- Kokoro generation parameters (speed, pitch)
- First-run model download progress display
- Timeout/retry for cloud API calls

### Deferred Ideas (OUT OF SCOPE)
- Streaming TTS per sentence (lower latency perception) — future phase
- Velocity/pitch config menu — Phase 77
- Full PTT mid-playback interruption with immediate STT — Phase 76 behavior

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PYTTS-01 | JARVIS speaks responses via Kokoro offline (no API key); first run shows download progress (350 MB) | Kokoro 0.9.4 available on PyPI with Apache license; soundfile dependency confirmed; download auto-triggered on first generate() call |
| PYTTS-02 | Client falls back to ElevenLabs when Kokoro fails | ElevenLabs official Python SDK available; REST API with synchronous text_to_speech.convert() method; supports streaming output |
| PYTTS-03 | Client falls back to Murf.ai when ElevenLabs also fails | Murf official Python SDK available; REST API documented; supports multiple models (Falcon, Gen2) with voice/speed/pitch parameters |
| PYTTS-04 | User can enable local-only mode to disable all cloud TTS | Requires `local_only: bool` config field; when true, skip ElevenLabs/Murf entirely, use Kokoro or silent |

</phase_requirements>

## Standard Stack

### Core TTS
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **kokoro** | 0.9.4+ | Offline TTS engine (primary) | 82M-parameter neural model, Apache-licensed, 350MB, offline (no API key), human-quality voice. CLAUDE.md recommends over pyttsx3 (robotic), Coqui (archived 2024), ElevenLabs (privacy violation). Supports 54 voices including PT-BR. |
| **sounddevice** | 0.5.5 | Audio playback | Already in Phase 74 stack for STT; reused for TTS playback. Pure NumPy integration — Kokoro outputs float32 arrays, sounddevice.play() consumes them directly. No PIL conversion needed. |
| **soundfile** | (auto via kokoro) | Audio I/O (Kokoro dependency) | Installed transitively by `pip install kokoro>=0.9.4`. Provides scipy-compatible WAV I/O. CLAUDE.md §Version Compatibility Matrix confirms dependency. |

### Cloud TTS Fallback Chain
| Library | Version | Purpose | When Used |
|---------|---------|---------|-----------|
| **elevenlabs** | latest (2.x) | Cloud TTS fallback #1 | When `tts_provider: "elevenlabs"` selected AND API key present in config AND Kokoro fails. Supports 70+ languages, text_to_speech.convert() method. |
| **murf-python-sdk** | latest | Cloud TTS fallback #2 | When `tts_provider: "murf"` selected AND API key present AND prior fallback fails. Supports 130+ voices, 21 languages, Falcon model for low latency. |

### Supporting
| Library | Version | Purpose | When Used |
|---------|---------|---------|-----------|
| **pydantic** | 2.x | Config schema validation | Extending JarvisConfig with TTS fields (`kokoro_voice`, `local_only`, `elevenlabs_api_key`, `murf_api_key`). Already required by Phase 72. |

**Installation:**
```bash
# Core TTS + playback
pip install kokoro>=0.9.4 sounddevice==0.5.5 soundfile

# Cloud fallback (optional, only if using cloud providers)
pip install elevenlabs>=0.2.0
pip install murf-python-sdk>=0.9.0
```

**Version verification:**
- `kokoro`: PyPI latest is 0.9.4 (verified May 2026) — Apache license
- `sounddevice`: PyPI latest is 0.5.5 (verified May 2026) — cross-platform wheels included
- `soundfile`: Transitive dependency of kokoro
- `elevenlabs`: PyPI latest is ~0.2.x (as of May 2026) — official Python SDK from ElevenLabs
- `murf-python-sdk`: PyPI latest is ~0.9.x (as of May 2026) — official Python SDK from Murf

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Kokoro offline | pyttsx3 | pyttsx3 voice quality is robotic, jarring for conversational UX. CLAUDE.md §What NOT to Use marks it rejected. |
| Kokoro offline | Coqui TTS | Coqui project archived in 2024 — no security fixes, no Python 3.12 support. CLAUDE.md §What NOT to Use marks it rejected. |
| Kokoro + cloud | Only cloud (ElevenLabs/Murf) | Violates privacy-first constraint (CLAUDE.md §Privacidade — default is local). `local_only: true` requirement would be unsatisfiable. |
| sounddevice playback | PyAudio | PyAudio requires PortAudio build headers on Linux (pain in containers). sounddevice has prebuilt wheels. CLAUDE.md prefers sounddevice. |
| Cloud TTS SDKs | Raw urllib/httpx calls | Simplifies dependency footprint for minimal features (async would require httpx, adding complexity). CLAUDE.md establishes urllib-only precedent in chat.py. However, SDKs provide error handling and retry — worth trade-off for cloud fallback complexity. |

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop-py/src/jarvis_desktop/
├── tts.py              # NEW — TTS singleton module (follows stt.py pattern)
├── config.py           # MODIFY — add TTS fields (kokoro_voice, local_only, API keys)
├── chat.py             # MODIFY — accumulate full response, call speak() after stream
├── __main__.py         # MODIFY — init_tts() after init_stt(), before chat_loop()
└── health.py           # (unchanged)

apps/desktop-py/tests/
├── test_tts.py         # NEW — unit tests for TTS (mocks Kokoro, mock HTTP for cloud)
├── conftest.py         # MODIFY — add mock_kokoro_engine, mock_elevenlabs_api fixtures
└── ... existing test files
```

### Pattern 1: Singleton TTS Module (tts.py)
**What:** Module-level state (cached TTS engine instance) + public API functions (`init_tts()`, `speak()`, `stop_tts()`). Mirrors stt.py structure.

**When to use:** Phase 75 TTS engine initialization (once at startup), reused throughout session. Lazy initialization on first `speak()` call.

**Example:**
```python
# tts.py — Singleton pattern (Phase 75)
import threading
from typing import Optional

_engine = None  # Cached Kokoro engine instance
_lock = threading.Lock()
_current_playback_stream = None  # For stop_tts() interruption

def init_tts(config: JarvisConfig) -> None:
    """Initialize TTS engine at startup. Safe to call multiple times."""
    global _engine
    with _lock:
        if _engine is not None:
            return  # Already initialized
        print("[TTS] Inicializando motor TTS...", flush=True)
        try:
            import kokoro
            _engine = kokoro.Kokoro(lang="p", voice=config.kokoro_voice)
            print("[TTS] Pronto.", flush=True)
        except Exception as exc:
            print(f"[TTS] Erro ao carregar Kokoro: {exc} — usando fallback", flush=True)
            _engine = None  # Lazy fallback on first speak()

def speak(text: str, config: JarvisConfig) -> None:
    """Synthesize and play text to speech. Caller is blocking; playback completes before return."""
    if not text.strip():
        return  # Silent on empty text
    
    # Try configured provider first
    if config.tts_provider == "elevenlabs" and not config.local_only:
        if _elevenlabs_speak(text, config.elevenlabs_api_key):
            return  # Success
        print("[TTS] ElevenLabs indisponível — usando Kokoro offline.", flush=True)
    
    # Fallback to Kokoro (always available as offline option)
    _kokoro_speak(text, config)

def stop_tts() -> None:
    """Stop current audio playback. Called by Phase 76 PTT hotkey handler."""
    global _current_playback_stream
    with _lock:
        if _current_playback_stream is not None:
            _current_playback_stream.stop()
            _current_playback_stream = None

def _kokoro_speak(text: str, config: JarvisConfig) -> None:
    """Internal: Synthesize with Kokoro and play."""
    global _engine, _current_playback_stream
    import kokoro
    import sounddevice as sd
    
    if _engine is None:
        try:
            _engine = kokoro.Kokoro(lang="p", voice=config.kokoro_voice)
        except Exception as exc:
            print(f"[TTS] Kokoro indisponível: {exc} — voz silenciosa", flush=True)
            return  # Silent fallback
    
    try:
        audio_data = _engine.create(text)  # Returns NumPy array (float32)
        print("[TTS] falando...", flush=True)
        _current_playback_stream = sd.play(audio_data, samplerate=24000)  # Kokoro default 24kHz
        sd.wait()  # Block until playback complete
    except Exception as exc:
        print(f"[TTS] Erro ao falar: {exc}", flush=True)
    finally:
        _current_playback_stream = None

def _elevenlabs_speak(text: str, api_key: str) -> bool:
    """Internal: Try ElevenLabs TTS via API. Return True on success, False on failure."""
    # Implementation uses elevenlabs SDK or stdlib urllib
```

**Source:** Follows pattern established in stt.py (Phase 74) — module-level `_model`, `_lock`, public `init_stt()`, internal helpers.

### Pattern 2: Configuration Schema Extension
**What:** Add new fields to JarvisConfig (Pydantic BaseModel) without redefining existing ones.

**When to use:** Phase 72 established JarvisConfig schema. Phase 75 extends it with TTS-specific fields (D-05, D-08, D-10).

**Example:**
```python
# config.py — Extend JarvisConfig (Phase 75)
from pydantic import BaseModel, Field

class JarvisConfig(BaseModel):
    # ... existing fields (D-07 locked schema) ...
    whisper_model: str = Field(default="tiny")
    tts_provider: str = Field(default="kokoro")  # Phase 75: D-07
    
    # Phase 75 NEW fields — D-05, D-08, D-10
    kokoro_voice: str = Field(default="pf_dora", description="PT-BR voice: pf_dora|pm_alex|pm_santa")
    local_only: bool = Field(default=False, description="Disable all cloud TTS (D-10)")
    elevenlabs_api_key: str = Field(default="", description="ElevenLabs API key for cloud fallback")
    murf_api_key: str = Field(default="", description="Murf.ai API key for second cloud fallback")
```

**Source:** Matches Phase 72 pattern (pydantic v2, Field defaults, descriptions).

### Pattern 3: Stream Completion → TTS Trigger
**What:** Modify chat.py `_stream_response()` to accumulate full response text, then call `speak()` after SSE stream ends.

**When to use:** Phase 73 established streaming loop. Phase 75 adds post-stream TTS invocation (D-01, D-02).

**Example:**
```python
# chat.py — Modify _stream_response() (Phase 75)
def _stream_response(config: JarvisConfig, message: str) -> None:
    """Send message to gateway, stream response to stdout, then speak via TTS."""
    from jarvis_desktop.tts import speak  # NEW import
    
    # ... existing SSE streaming code ...
    buffer = ""
    full_response = []  # NEW: accumulate for TTS
    while True:
        raw = response.read(1024)
        if not raw:
            break
        chunk = raw.decode("utf-8", errors="replace")
        tokens, buffer = parse_sse_chunk(chunk, buffer)
        for token in tokens:
            print(token, end="", flush=True)
            full_response.append(token)  # NEW
    print()  # Final newline (existing)
    
    # NEW: After stream completes, speak full response (D-01)
    full_text = "".join(full_response)
    if full_text.strip():
        speak(full_text, config)
```

**Source:** Follows existing pattern in chat.py (stream tokens, print each one).

### Anti-Patterns to Avoid
- **Hardcoded Kokoro model path:** Never assume `~/.cache/huggingface/hub/` location. Kokoro library handles download automatically on first init.
- **Blocking audio playback in event loop:** TTS audio playback must not block the chat loop's input() or hotkey listener. Use threading or non-blocking stream if Phase 76 requires concurrent STT.
- **Unhandled API key absence:** If cloud provider key is empty string (""), fail gracefully to Kokoro. Never raise exception.
- **Synchronous cloud calls without timeout:** ElevenLabs and Murf API calls must timeout (30s default) to prevent infinite hangs.
- **Mixing SDK and raw HTTP calls:** If using elevenlabs SDK, don't also write raw urllib code to the same endpoint. Consistency reduces bugs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio synthesis from text | Custom vocoder, WaveNet, etc. | Kokoro (82M pre-trained model) | Pre-trained model available, 350MB, Apache-licensed. Building a vocoder takes months and requires GPU training. |
| Audio playback to speaker | Direct PortAudio calls, OS-specific code | sounddevice.play() | Cross-platform (Windows/Linux/macOS), handles sample rate conversion, buffer management. sounddevice.play() is 5 lines vs 50+ for raw portaudio. |
| Voice selection UI | Custom voice enumeration | Use documented voice names (Kokoro: `pf_dora`/`pm_alex`/`pm_santa`) | Voice names are fixed per model. Config file string suffices for MVP. Phase 77 adds menu UI. |
| HTTP retry logic for cloud fallback | Custom retry loop with exponential backoff | Use SDK built-in retry (elevenlabs, murf-python-sdk provide exponential backoff) | SDK libraries handle timeouts, retries, rate-limiting. Custom code duplicates effort and introduces bugs. |
| Detecting first-run model download | Poll disk space, check directory timestamps | Kokoro library raises exception on missing model, handles download automatically | Kokoro.create() automatically downloads model (~350MB) on first call and reports progress. No polling needed. |

**Key insight:** TTS domain has well-established libraries (Kokoro, ElevenLabs SDK, Murf SDK). Hand-rolling any of voice synthesis, audio playback, or API clients adds weeks of work and introduces platform-specific bugs. Phase 75 should _compose_ existing libraries, not build primitives.

## Runtime State Inventory

> This is a greenfield phase (new TTS module). No renamed/refactored state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — TTS is stateless (no conversation history, memories, or vector DB involvement) | — |
| Live service config | None — ElevenLabs/Murf API keys stored in ~/.jarvis/config.json (JSON text file, not external service) | — |
| OS-registered state | None — No system-level registration (e.g., Task Scheduler, launchd) | — |
| Secrets/env vars | elevenlabs_api_key, murf_api_key stored in config.json (code reads them, no rename risk) | — |
| Build artifacts | Kokoro model cached in ~/.cache/huggingface/hub/kokoro/ after first run (~350MB) — not in git, auto-redownloaded on demand | None — auto-managed by Kokoro library |

**All categories verified:** No runtime state migration required.

## Common Pitfalls

### Pitfall 1: Blocking Audio Playback in Input Loop
**What goes wrong:** `sd.wait()` blocks main thread; user cannot interrupt with Ctrl+C or press PTT hotkey during playback.

**Why it happens:** sounddevice.play() starts playback but returns immediately; `sd.wait()` blocks until playback completes. During wait, the thread cannot receive signals.

**How to avoid:** (Phase 75) Use `sd.wait()` for now since playback is synchronous post-stream completion (no concurrent input). Phase 76 state machine may require threading to allow PTT interrupt during playback. For MVP, accept that user cannot interrupt TTS mid-playback.

**Warning signs:** User presses Ctrl+C during playback → no response until audio finishes. This is acceptable for Phase 75.

### Pitfall 2: Missing espeak-ng on Windows
**What goes wrong:** Kokoro on Windows without espeak-ng installed → TTS fails with "espeak-ng not found" error.

**Why it happens:** PT-BR voice synthesis requires espeak-ng for phoneme generation. Windows doesn't include it (unlike Linux with system package). User must install manually via MSYS2 or equivalent.

**How to avoid:** (Per D-04) Catch exception on first init_tts(), warn user clearly: `[TTS] espeak-ng não encontrado — voz PT-BR indisponível.` Degrade gracefully to silent (no audio, but text still prints). Document installation in README for Windows users.

**Warning signs:** init_tts() raises RuntimeError mentioning "espeak-ng" or "FAILED to import MeCab" (indicator of missing phoneme engine).

### Pitfall 3: Unhandled API Key Absence
**What goes wrong:** User selects `tts_provider: "elevenlabs"` but config.json has `elevenlabs_api_key: ""` → code crashes trying to authenticate.

**Why it happens:** Missing validation between config selection and API call. Easy to forget empty string check.

**How to avoid:** Always check `if not config.elevenlabs_api_key:` before calling API. Fall back to Kokoro with warning message (D-09). Never raise exception on missing key.

**Warning signs:** speak() called with configured provider but no API key → HTTPError 401 Unauthorized. Should print message instead.

### Pitfall 4: Cloud API Timeout Indefinite Hang
**What goes wrong:** ElevenLabs/Murf API call hangs for 5+ minutes if network is slow or API is overloaded. User thinks chat froze.

**Why it happens:** No timeout on HTTP request. Some APIs have slow response times under load.

**How to avoid:** Set socket timeout (30 seconds default, configurable). If cloud TTS takes >30s, fall back to Kokoro with warning. Catch timeout exceptions explicitly.

**Warning signs:** speak() called with "elevenlabs" or "murf" → ~45 seconds of silence (socket timeout default), then app seems unresponsive.

### Pitfall 5: First-Run Kokoro Model Download Progress Not Shown
**What goes wrong:** User runs JARVIS first time → Kokoro.create() downloads 350MB model in background → no progress indicator → user thinks app hung.

**Why it happens:** Model download is automatic but silent. HuggingFace Hub's download_file() doesn't expose progress by default.

**How to avoid:** (Per PYTTS-01) Wrap Kokoro model loading in try/except. If HuggingFace download is slow, print periodic status. Kokoro library _may_ show progress via stderr — document for users. Alternatively, pre-download model in init_tts() with explicit progress handling.

**Warning signs:** First speak() call takes 2+ minutes on slow internet with no feedback. User may kill the process thinking it's stuck.

## Code Examples

Verified patterns from official sources and existing codebase:

### Example 1: Kokoro initialization and synthesis
```python
# Source: Kokoro GitHub https://github.com/hexgrad/kokoro, CLAUDE.md §Voice Pipeline
import kokoro

# Initialize engine with PT-BR voice
engine = kokoro.Kokoro(lang="p", voice="pf_dora")

# Generate audio (float32 NumPy array)
audio_array = engine.create("Olá, como você está?")

# audio_array shape: (N,) at 24 kHz sample rate
```

**Why this pattern:** Kokoro's standard init and create() method. Lang code "p" = Portuguese Brazil. Voice names verified from HuggingFace VOICES.md (Phase 75 research).

### Example 2: Playing audio with sounddevice
```python
# Source: python-sounddevice docs https://python-sounddevice.readthedocs.io/, already in Phase 74 stack
import sounddevice as sd

# Play NumPy audio array (float32, any sample rate)
stream = sd.play(audio_array, samplerate=24000)  # Kokoro outputs 24kHz
sd.wait()  # Block until playback complete

# To stop playback (Phase 76 PTT interrupt):
stream.stop()
```

**Why this pattern:** sounddevice is already in pyproject.toml (Phase 74). No additional dependency. play() handles NumPy arrays natively (no conversion needed). 24kHz is Kokoro's default output sample rate.

### Example 3: ElevenLabs SDK usage
```python
# Source: ElevenLabs Python SDK https://github.com/elevenlabs/elevenlabs-python
from elevenlabs.client import ElevenLabs

client = ElevenLabs(api_key=config.elevenlabs_api_key)
audio_bytes = client.text_to_speech.convert(
    text="Hello, how are you?",
    voice_id="21m00Tcm4TlvDq8ikWAM",  # Pre-defined voice ID
    model_id="eleven_v3",  # Latest model (2026)
    output_format="mp3_44100_128",
)

# audio_bytes is bytes object — decode to NumPy for playback
import io
import scipy.io.wavfile as wavfile
sample_rate, audio_array = wavfile.read(io.BytesIO(audio_bytes))
sd.play(audio_array, samplerate=sample_rate)
```

**Why this pattern:** Official SDK recommended by CLAUDE.md (elevenlabs 0.2.x). text_to_speech.convert() is standard entry point. SDK handles authentication, retry, error messages.

### Example 4: Config field extension (Pydantic)
```python
# Source: Phase 72 config.py pattern, Pydantic v2 docs https://docs.pydantic.dev/
from pydantic import BaseModel, Field

class JarvisConfig(BaseModel):
    # ... existing fields (locked Phase 72) ...
    whisper_model: str = Field(default="tiny")
    tts_provider: str = Field(default="kokoro")
    
    # Phase 75 NEW — follow same pattern: Field with default + description
    kokoro_voice: str = Field(
        default="pf_dora",
        description="PT-BR voice name (pf_dora|pm_alex|pm_santa)"
    )
    local_only: bool = Field(
        default=False,
        description="Disable cloud TTS (D-10, PYTTS-04)"
    )
    elevenlabs_api_key: str = Field(
        default="",
        description="ElevenLabs API key (optional, empty = skip)"
    )
    murf_api_key: str = Field(
        default="",
        description="Murf.ai API key (optional, empty = skip)"
    )
```

**Why this pattern:** Pydantic v2 is mandatory (CLAUDE.md §Constraints, LangChain 1.x requirement). Field() provides validation and schema documentation. Defaults match decision makers' intent (D-05, D-08, D-10).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pyttsx3 OS SAPI wrapper | Kokoro neural TTS | CLAUDE.md (pre-Phase 75) | Higher voice quality, offline availability, cross-platform consistency. pyttsx3 robotic voice unacceptable for conversational UX. |
| Coqui TTS (2024 archive) | Kokoro (active 2025-2026) | CLAUDE.md (pre-Phase 75) | Coqui project archived 2024, no maintenance. Kokoro active, security patches, Python 3.12 support. |
| Fixed 3-provider chain (Kokoro → ElevenLabs → Murf) | User-configurable provider + Kokoro fallback | Phase 75 decision (D-06) | More flexible: user picks preferred provider, Kokoro always available offline. Mirrors Electron client behavior. |
| Cloud-first TTS (ElevenLabs) | Offline-first TTS (Kokoro default) | CLAUDE.md (Privacidade) | Aligns with privacy-first design (Conversa nunca vai para cloud sem configuração explícita). Default local protects user data. |

**Deprecated/outdated:**
- **pyttsx3**: CLAUDE.md §What NOT to Use explicitly marks it rejected. Voice quality inadequate for UX.
- **Coqui TTS**: Project archived 2024 (no active maintenance). CLAUDE.md §What NOT to Use marks it rejected.
- **Hard-coded LM Studio base_url:** CLAUDE.md marks this pattern rejected (settings-driven instead). tts.py should read `config.tts_provider` not assume provider order.

## Open Questions

1. **What is the exact sample rate and format of Kokoro output?**
   - What we know: Kokoro.create() returns NumPy float32 array at 24 kHz (confirmed in examples)
   - What's unclear: Mono or stereo? Normalized to [-1, 1] or [0, 1]?
   - Recommendation: Test on first implementation. Phase 74 stt.py test pattern can verify. sounddevice.play() handles both, so safe.

2. **How to handle first-run Kokoro model download progress?**
   - What we know: Kokoro downloads ~350MB model from HuggingFace on first create() call
   - What's unclear: Does HuggingFace Hub show download progress in stderr? Can we wrap with custom progress bar?
   - Recommendation: Per PYTTS-01, show download progress. Kokoro/HuggingFace Hub may handle automatically. If not, wrap with tqdm or similar.

3. **What is the ideal timeout for cloud TTS API calls?**
   - What we know: ElevenLabs/Murf both have API endpoints with ~200-500ms latency typical
   - What's unclear: Acceptable timeout? 30s seems safe but may be overkill. Is 10s sufficient?
   - Recommendation: Start with 30s (same as chat.py gateway timeout). Tune based on user feedback in Phase 76 testing.

4. **Should stop_tts() also clear any buffered API requests?**
   - What we know: stop_tts() interrupts audio playback via stream.stop()
   - What's unclear: If ElevenLabs API call is in-flight and user presses PTT hotkey, should we cancel HTTP request?
   - Recommendation: For MVP (Phase 75), accept in-flight request completes. Phase 76 state machine can add cancellation token if needed.

## Environment Availability

> Phase 75 depends on external dependencies: Kokoro, sounddevice, and optionally ElevenLabs/Murf APIs.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Kokoro (PyPI package) | PYTTS-01 (offline TTS) | ✓ | 0.9.4+ available May 2026 | N/A — PYTTS-01 requires offline Kokoro |
| sounddevice (PyPI) | PYTTS-01 (audio playback) | ✓ | 0.5.5 already installed Phase 74 | N/A — already in stack |
| espeak-ng (system package) | PYTTS-01 (PT-BR phonemes) | ✗ Windows (✓ Linux/macOS) | — | D-04: Silent TTS with warning on Windows |
| ElevenLabs API (cloud) | PYTTS-02 (cloud fallback #1) | ✓ (requires API key) | https://elevenlabs.io | Kokoro offline fallback (D-06) |
| Murf.ai API (cloud) | PYTTS-03 (cloud fallback #2) | ✓ (requires API key) | https://murf.ai | Kokoro offline fallback (D-06) |
| HuggingFace Hub network access | Kokoro model download | ✓ | Standard PyPI → HF Hub mirror | Offline mode: skip if model already cached |
| Speaker/headphone device | Audio playback | ✓ (user hardware) | — | Silent fallback (no playback device available) |

**Missing dependencies with no fallback:**
- None — Phase 75 can run without cloud APIs (local_only mode) and without speaker (silent mode).

**Missing dependencies with fallback:**
- **espeak-ng on Windows:** D-04 specifies silent with warning. No English fallback (user configured PT-BR).
- **Speaker/headphones:** If sounddevice.play() fails, log error and continue (text was printed to terminal already).
- **ElevenLabs API key:** If not configured, skip and use Kokoro (D-08, D-09).
- **Murf.ai API key:** If not configured, skip and use Kokoro (D-08, D-09).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.0+ (already used Phase 72-74) |
| Config file | `apps/desktop-py/pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `pytest tests/test_tts.py -xvs` (single file, ~3-5s) |
| Full suite command | `pytest tests/ -x` (all tests, ~30s including STT tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PYTTS-01 | Kokoro offline TTS generates audio; first run shows download (mocked in test) | unit | `pytest tests/test_tts.py::test_kokoro_speak -xvs` | ❌ Wave 0 |
| PYTTS-01 | init_tts() loads Kokoro singleton without error | unit | `pytest tests/test_tts.py::test_init_tts -xvs` | ❌ Wave 0 |
| PYTTS-02 | speak() falls back to ElevenLabs when Kokoro selected but fails (mock HTTP) | unit | `pytest tests/test_tts.py::test_elevenlabs_fallback -xvs` | ❌ Wave 0 |
| PYTTS-03 | speak() falls back to Murf when ElevenLabs fails (mock HTTP) | unit | `pytest tests/test_tts.py::test_murf_fallback -xvs` | ❌ Wave 0 |
| PYTTS-04 | local_only=true skips all cloud TTS (ElevenLabs/Murf) | unit | `pytest tests/test_tts.py::test_local_only_mode -xvs` | ❌ Wave 0 |
| PYTTS-01 (config) | JarvisConfig accepts kokoro_voice, local_only, api key fields | unit | `pytest tests/test_config.py::test_tts_config_fields -xvs` | ❌ Wave 0 |
| PYTTS-01 (integration) | chat.py accumulates full response and calls speak() after stream | integration | `pytest tests/test_chat.py::test_stream_response_triggers_tts -xvs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_tts.py -xvs` (quick unit tests, ~3-5s)
- **Per wave merge:** `pytest tests/ -x` (full suite including STT/config/chat, ~30s)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_tts.py` — Unit tests for tts.py module
  - test_init_tts() — singleton initialization
  - test_kokoro_speak() — Kokoro synthesis + playback (mock sounddevice)
  - test_elevenlabs_fallback() — ElevenLabs API call (mock urllib)
  - test_murf_fallback() — Murf.ai API call (mock urllib)
  - test_local_only_mode() — Config enforcement
  - test_stop_tts() — Thread-safe stop() function
  - test_espeak_ng_missing_handling() — Windows graceful degradation

- [ ] `tests/conftest.py` — Add fixtures:
  - `mock_kokoro_engine` — Mock Kokoro.create() to return NumPy audio array
  - `mock_elevenlabs_api` — Mock urllib response for ElevenLabs API
  - `mock_murf_api` — Mock urllib response for Murf.ai API
  - `mock_sounddevice_play` — Mock sounddevice.play() and sd.wait()

- [ ] `tests/test_config.py` — Add assertions:
  - Config fields `kokoro_voice`, `local_only`, `elevenlabs_api_key`, `murf_api_key` present
  - Defaults match decisions (kokoro_voice="pf_dora", local_only=False, keys="")
  - load_config() reads values from ~/.jarvis/config.json

- [ ] `tests/test_chat.py` — Add integration test:
  - _stream_response() accumulates tokens
  - After SSE stream completes, speak() called with full text
  - TTS status message printed before playback

- [ ] `apps/desktop-py/pyproject.toml` — Dependencies:
  - Add `kokoro>=0.9.4` to [project] dependencies
  - Add `soundfile` (transitive from kokoro, but list explicitly)
  - Optional: Add `elevenlabs` and `murf-python-sdk` with comment "cloud fallback"

**Framework install command (if needed):**
```bash
cd apps/desktop-py
uv sync  # Already includes pytest from Phase 72
```

**Note:** All TTS tests will mock Kokoro model and HTTP calls. No real model download or network access in CI.

## Sources

### Primary (HIGH confidence)
- [Kokoro GitHub repository](https://github.com/hexgrad/kokoro) — Voice synthesis engine, architecture, voice list (verified VOICES.md)
- [HuggingFace Kokoro-82M VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) — Brazilian Portuguese voice names (pf_dora, pm_alex, pm_santa)
- CLAUDE.md (project) — Stack recommendations (Kokoro 0.9.4+, sounddevice 0.5.5, pyttsx3/Coqui rejected)
- [python-sounddevice documentation](https://python-sounddevice.readthedocs.io/) — play() API, sample rate handling
- [Phase 74 CONTEXT.md](C:\Users\biel1\OneDrive\Documentos\GitHub\jarvis\.planning\phases\75-text-to-speech-tts\75-CONTEXT.md) — Locked decisions (D-01 through D-12)

### Secondary (MEDIUM confidence)
- [ElevenLabs Python SDK GitHub](https://github.com/elevenlabs/elevenlabs-python) — text_to_speech.convert() API signature, auth pattern
- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference/introduction) — Models (eleven_v3, eleven_flash_v2_5), voice IDs, streaming
- [Murf.ai Python SDK GitHub](https://github.com/murf-ai/murf-python-sdk) — SDK structure, Falcon/Gen2 models, voice count (130+), languages (21)
- [Murf.ai API Documentation](https://murf.ai/api/docs/api-reference/text-to-speech/generate) — REST API endpoints, authentication

### Tertiary (LOW confidence, needing validation)
- None — all critical information verified via GitHub official repos and official documentation

## Metadata

**Confidence breakdown:**
- **Standard Stack (Kokoro/sounddevice/ElevenLabs/Murf):** HIGH — All libraries verified on PyPI, official SDKs available, CLAUDE.md recommendations confirmed
- **Architecture (singleton pattern, config extension, stream-→-TTS):** HIGH — Pattern mirrors Phase 74 stt.py precedent; config follows Pydantic v2 established in Phase 72
- **PT-BR voices (pf_dora/pm_alex/pm_santa):** HIGH — Verified on HuggingFace official VOICES.md (May 2026)
- **Fallback chain logic (provider selection → Kokoro offline):** HIGH — Locked in Phase 75 CONTEXT.md decisions
- **sounddevice playback integration:** HIGH — 0.5.5 already in Phase 74; play() API stable and well-documented
- **Cloud API timeout/retry patterns:** MEDIUM — General best practice (30s timeout, exponential backoff) but specific to Phase 75 implementation detail (discretion area)
- **First-run model download progress:** MEDIUM — Kokoro handles automatically but exact UX depends on HuggingFace Hub behavior (not explicitly documented for progress bars)
- **Windows espeak-ng workaround:** MEDIUM — D-04 specifies silent + warning, but exact exception handling pattern TBD in implementation

**Research date:** 2026-05-18  
**Valid until:** 2026-06-18 (30 days — Kokoro stable, Pydantic stable, ElevenLabs/Murf may change API)

---

*Phase: 75-text-to-speech-tts*  
*Milestone: v3.2 — Python Desktop Client*  
*Prepared for: gsd-planner*
