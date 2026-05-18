"""JARVIS Text-to-Speech singleton module.

Phase 75: Kokoro offline TTS (primary) with cloud fallback chain (ElevenLabs, Murf).

Public API:
  init_tts(config: JarvisConfig) -> None    — load Kokoro engine at startup (D-07 pattern)
  speak(text: str, config: JarvisConfig) -> None  — synthesize and play text
  stop_tts() -> None                        — stop current playback (thread-safe, D-11)

Private helpers (exposed for mocking in tests):
  _create_kokoro_engine(config) -> Any      — instantiate Kokoro; raises on espeak-ng missing
  _kokoro_speak(text, config) -> None       — Kokoro synthesis + sounddevice playback
  _elevenlabs_speak(text, api_key) -> bool  — ElevenLabs API call (Plan 03)
  _murf_speak(text, api_key) -> bool        — Murf.ai API call (Plan 03)

Decisions honored:
  D-01: TTS after full stream completes (called from chat.py after SSE stream ends)
  D-02: "[TTS] falando..." printed before audio; print() only, no rich (D-12)
  D-03/D-05: kokoro_voice from config (default pf_dora — PT-BR)
  D-04: espeak-ng missing → silent + warning, never crash
  D-06: tts_provider selects engine; Kokoro is always offline fallback
  D-10: local_only=True → skip all cloud providers
  D-11: stop_tts() is thread-safe; Phase 76 calls it on PTT during playback
"""
import threading
from typing import Optional, Any

from jarvis_desktop.config import JarvisConfig

# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------
_engine: Optional[Any] = None   # Kokoro engine instance (lazy-loaded)
_lock = threading.Lock()
_stop_event = threading.Event()

# Kokoro output sample rate (24 kHz per official docs)
_KOKORO_SAMPLE_RATE = 24000


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def init_tts(config: JarvisConfig) -> None:
    """Initialize TTS engine at startup. Safe to call multiple times.

    Loads Kokoro engine with the configured PT-BR voice (D-05).
    Prints status to stdout per print-only rule (D-12).
    On espeak-ng missing (Windows without install): prints D-04 warning, _engine stays None.

    Args:
        config: JarvisConfig with tts_provider, kokoro_voice fields
    """
    global _engine
    with _lock:
        if _engine is not None:
            return  # Singleton guard — already initialized

        print(f"[TTS] Inicializando Kokoro (voz: {config.kokoro_voice})...", flush=True)
        try:
            _engine = _create_kokoro_engine(config)
            print("[TTS] Pronto.", flush=True)
        except RuntimeError as exc:
            if "espeak-ng" in str(exc).lower() or "espeak" in str(exc).lower():
                # D-04: espeak-ng not installed on Windows — silent TTS, no crash
                print(
                    "[TTS] espeak-ng não encontrado — voz PT-BR indisponível. Texto exibido normalmente.",
                    flush=True,
                )
            else:
                print(f"[TTS] Erro ao carregar Kokoro: {exc} — TTS desabilitado.", flush=True)
            _engine = None
        except Exception as exc:
            print(f"[TTS] Erro ao carregar Kokoro: {exc} — TTS desabilitado.", flush=True)
            _engine = None


def speak(text: str, config: JarvisConfig) -> None:
    """Synthesize and play text using the configured TTS provider.

    Called by chat.py after full SSE stream completes (D-01).
    Blocks until playback finishes (D-02 sequence: stream ends → speak → prompt returns).

    Provider selection (D-06):
      - tts_provider="elevenlabs" + key present + not local_only → try ElevenLabs, fallback Kokoro
      - tts_provider="murf" + key present + not local_only → try Murf, fallback Kokoro
      - tts_provider="kokoro" OR provider fails OR local_only=True → Kokoro offline
      - Kokoro unavailable (engine=None) → silent (text already printed to terminal)

    Args:
        text: Full response text to speak
        config: JarvisConfig controlling provider selection
    """
    if not text.strip():
        return  # Silent on empty text

    # Cloud provider path (D-06, D-10)
    if not config.local_only:
        if config.tts_provider == "elevenlabs":
            if config.elevenlabs_api_key:
                if _elevenlabs_speak(text, config.elevenlabs_api_key):
                    return  # Success — done
                print("[TTS] ElevenLabs indisponível — usando Kokoro offline.", flush=True)
            else:
                print("[TTS] ElevenLabs sem chave — usando Kokoro offline.", flush=True)
        elif config.tts_provider == "murf":
            if config.murf_api_key:
                if _murf_speak(text, config.murf_api_key):
                    return  # Success — done
                print("[TTS] Murf indisponível — usando Kokoro offline.", flush=True)
            else:
                print("[TTS] Murf sem chave — usando Kokoro offline.", flush=True)

    # Kokoro offline path (primary or fallback)
    _kokoro_speak(text, config)


def stop_tts() -> None:
    """Stop current TTS audio playback immediately.

    Thread-safe: called by Phase 76 PTT hotkey handler from a different thread.
    Sets stop event and calls sounddevice.stop() to interrupt sd.wait().

    Safe to call when nothing is playing.
    """
    import sounddevice as sd
    _stop_event.set()
    try:
        sd.stop()
    except Exception:
        pass  # Never raise — stop is best-effort


# ---------------------------------------------------------------------------
# Private helpers (exposed at module level for monkeypatching in tests)
# ---------------------------------------------------------------------------

def _create_kokoro_engine(config: JarvisConfig) -> Any:
    """Instantiate Kokoro engine with the configured PT-BR voice.

    Separated from init_tts() so tests can monkeypatch this function
    to simulate espeak-ng missing without loading the real Kokoro model.

    Args:
        config: JarvisConfig with kokoro_voice (e.g. "pf_dora")

    Returns:
        Kokoro engine instance with .create(text) -> np.ndarray

    Raises:
        RuntimeError: if espeak-ng not installed (Windows without manual setup)
        Exception: if Kokoro model download fails or other init error
    """
    import kokoro  # Lazy import — not at module level to avoid startup cost
    return kokoro.Kokoro(lang="p", voice=config.kokoro_voice)


def _kokoro_speak(text: str, config: JarvisConfig) -> None:
    """Synthesize text with Kokoro and play via sounddevice.

    Lazy-initializes Kokoro engine if not yet loaded.
    Prints "[TTS] falando..." before playback (D-02).
    Prints error and returns silently on any playback failure.

    Args:
        text: Text to synthesize
        config: JarvisConfig (needed if lazy-init required)
    """
    global _engine
    import sounddevice as sd

    # Lazy-init if init_tts() was not called (or failed)
    if _engine is None:
        try:
            with _lock:
                if _engine is None:  # Double-checked locking
                    _engine = _create_kokoro_engine(config)
        except Exception as exc:
            print(f"[TTS] Kokoro indisponível: {exc} — voz silenciosa.", flush=True)
            return  # Silent fallback

    try:
        _stop_event.clear()
        audio_data = _engine.create(text)  # NumPy float32 array at 24 kHz
        print("[TTS] falando...", flush=True)
        sd.play(audio_data, samplerate=_KOKORO_SAMPLE_RATE)
        # Wait for completion or stop_tts() interrupt
        while not _stop_event.is_set():
            # sd.wait() with timeout loop so stop_tts() can interrupt
            # Phase 75: simple wait; Phase 76 may refactor for concurrent PTT
            sd.wait()
            break
        if _stop_event.is_set():
            sd.stop()
    except Exception as exc:
        print(f"[TTS] Erro ao falar: {exc}", flush=True)


def _elevenlabs_speak(text: str, api_key: str) -> bool:
    """Try ElevenLabs cloud TTS. Returns True on success, False on any failure.

    Stub in Plan 02 — full implementation in Plan 03.
    """
    # Plan 03 implements this with elevenlabs SDK
    return False


def _murf_speak(text: str, api_key: str) -> bool:
    """Try Murf.ai cloud TTS. Returns True on success, False on any failure.

    Stub in Plan 02 — full implementation in Plan 03.
    """
    # Plan 03 implements this with murf-python-sdk
    return False
