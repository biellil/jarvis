"""JARVIS Text-to-Speech singleton module.

Phase 75: Kokoro offline TTS (primary) with cloud fallback chain (ElevenLabs, Murf).
Phase 77: Migrated all print() to ui.get_console().print(); added set_state() calls.

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
  D-04: espeak-ng missing → silent + warning, never crash
  D-05: set_state("speaking") before playback, set_state("idle") in finally — all 3 providers
  D-06: tts_provider selects engine; Kokoro is always offline fallback
  D-10: local_only=True → skip all cloud providers
  D-11: stop_tts() is thread-safe; Phase 76 calls it on PTT during playback
"""
import threading
from typing import Optional, Any

from jarvis_desktop.config import JarvisConfig


def _console():
    """Lazy accessor for ui console — avoids circular import at module level."""
    from jarvis_desktop import ui
    return ui.get_console()


# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------
_engine: Optional[Any] = None   # Kokoro engine instance (lazy-loaded)
_lock = threading.Lock()
_stop_event = threading.Event()
_is_playing: bool = False        # D-06: True while TTS audio is active

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
        if config.tts_provider == "none":
            _console().print("[TTS] TTS desabilitado.")
            return

        if _engine is not None:
            return  # Singleton guard — already initialized

        _console().print(f"[TTS] Inicializando Kokoro (voz: {config.kokoro_voice})...")
        try:
            _engine = _create_kokoro_engine(config)
            _console().print("[TTS] Pronto.")
        except RuntimeError as exc:
            if "espeak-ng" in str(exc).lower() or "espeak" in str(exc).lower():
                # D-04: espeak-ng not installed on Windows — silent TTS, no crash
                _console().print(
                    "[TTS] espeak-ng não encontrado — voz PT-BR indisponível. Texto exibido normalmente."
                )
            else:
                _console().print(f"[TTS] Erro ao carregar Kokoro: {exc} — TTS desabilitado.")
            _engine = None
        except Exception as exc:
            _console().print(f"[TTS] Erro ao carregar Kokoro: {exc} — TTS desabilitado.")
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

    if config.tts_provider == "none":
        return  # TTS disabled — text already shown in terminal

    # Cloud provider path (D-06, D-10)
    if not config.local_only:
        if config.tts_provider == "elevenlabs":
            if config.elevenlabs_api_key:
                if _elevenlabs_speak(text, config.elevenlabs_api_key):
                    return  # Success — done
                _console().print("[TTS] ElevenLabs indisponível — usando Kokoro offline.")
            else:
                _console().print("[TTS] ElevenLabs sem chave — usando Kokoro offline.")
        elif config.tts_provider == "murf":
            if config.murf_api_key:
                if _murf_speak(text, config.murf_api_key):
                    return  # Success — done
                _console().print("[TTS] Murf indisponível — usando Kokoro offline.")
            else:
                _console().print("[TTS] Murf sem chave — usando Kokoro offline.")

    # Kokoro offline path (primary or fallback)
    _kokoro_speak(text, config)


def stop_tts() -> None:
    """Stop current TTS audio playback immediately.

    Thread-safe: called by Phase 76 PTT hotkey handler from a different thread.
    Sets stop event and calls sounddevice.stop() to interrupt sd.wait().

    Safe to call when nothing is playing.
    """
    global _is_playing
    import sounddevice as sd
    _is_playing = False
    _stop_event.set()
    try:
        sd.stop()
    except Exception:
        pass  # Never raise — stop is best-effort


def set_provider(provider: str, config: "JarvisConfig") -> None:
    """Switch TTS provider at runtime (from config menu).

    For Kokoro: resets _engine so next speak() call lazy-initializes with updated config.
    For cloud providers (ElevenLabs, Murf): no engine needed — API keys read at call time.
    Updates config.tts_provider in-place; caller must call save_config() after.

    Args:
        provider: "kokoro" | "elevenlabs" | "murf"
        config: JarvisConfig instance to update (tts_provider field written in-place)

    Raises:
        ValueError: if provider is not one of the 3 supported values
    """
    global _engine

    from jarvis_desktop import ui
    console = ui.get_console()

    valid_providers = {"kokoro", "elevenlabs", "murf", "none"}
    if provider not in valid_providers:
        raise ValueError(f"[TTS] Provider desconhecido: {provider!r}. Válidos: {sorted(valid_providers)}")

    with _lock:
        config.tts_provider = provider

        if provider == "kokoro":
            # Reset engine so next speak() lazy-initializes with current config
            _engine = None
            console.print(f"[TTS] Provider definido: kokoro (inicializa na próxima fala).", highlight=False)
        else:
            # Cloud providers are stateless — no engine to reset
            # _engine (Kokoro) remains as offline fallback per speak() logic
            console.print(f"[TTS] Provider definido: {provider}.", highlight=False)


def is_speaking() -> bool:
    """Return True if TTS audio is currently playing.

    Called by voice_modes.py to implement D-06: block all audio capture
    while JARVIS is speaking (prevents feedback loop).

    Returns:
        True  — audio is actively playing (_kokoro_speak / cloud TTS in progress)
        False — idle, safe to start audio capture
    """
    return _is_playing


# ---------------------------------------------------------------------------
# Private helpers (exposed at module level for monkeypatching in tests)
# ---------------------------------------------------------------------------

def _create_kokoro_engine(config: JarvisConfig) -> Any:
    """Instantiate KPipeline for the configured voice.

    Separated from init_tts() so tests can monkeypatch this function.
    lang_code is derived from the voice name prefix (e.g. "pf_dora" → "p").

    Args:
        config: JarvisConfig with kokoro_voice (e.g. "pf_dora")

    Returns:
        KPipeline instance

    Raises:
        Exception: if model download fails or other init error
    """
    import warnings
    from kokoro import KPipeline  # Lazy import — not at module level to avoid startup cost
    lang_code = config.kokoro_voice[0] if config.kokoro_voice else "p"
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # suppress torch UserWarning/FutureWarning at init
        return KPipeline(lang_code=lang_code, repo_id="hexgrad/Kokoro-82M")


def _kokoro_speak(text: str, config: JarvisConfig) -> None:
    """Synthesize text with Kokoro and play via sounddevice.

    Lazy-initializes Kokoro engine if not yet loaded.
    Prints "[TTS] falando..." before playback (D-02).
    Prints error and returns silently on any playback failure.

    Args:
        text: Text to synthesize
        config: JarvisConfig (needed if lazy-init required)
    """
    global _engine, _is_playing
    import sounddevice as sd

    # Lazy-init if init_tts() was not called (or failed)
    if _engine is None:
        try:
            with _lock:
                if _engine is None:  # Double-checked locking
                    _engine = _create_kokoro_engine(config)
        except Exception as exc:
            _console().print(f"[TTS] Kokoro indisponível: {exc} — voz silenciosa.")
            return  # Silent fallback

    try:
        _stop_event.clear()
        from jarvis_desktop import ui as _ui
        _ui.set_state("speaking")   # D-05: status → speaking before playback
        _is_playing = True          # D-06: mark TTS active

        # KPipeline returns a generator of Result objects; collect all audio chunks
        import numpy as np
        chunks = []
        for result in _engine(text, voice=config.kokoro_voice, speed=1.0):
            if _stop_event.is_set():
                break
            chunks.append(result.audio.numpy())
        if not chunks or _stop_event.is_set():
            return
        audio_data = np.concatenate(chunks)  # float32, 24 kHz

        _console().print("[TTS] falando...")
        sd.play(audio_data, samplerate=_KOKORO_SAMPLE_RATE)
        while not _stop_event.is_set():
            sd.wait()
            break
        if _stop_event.is_set():
            sd.stop()
    except Exception as exc:
        _console().print(f"[TTS] Erro ao falar: {exc}")
    finally:
        _is_playing = False         # D-06: always clear on exit
        from jarvis_desktop import ui as _ui
        _ui.set_state("idle")       # D-05: status → idle after playback


def _elevenlabs_speak(text: str, api_key: str) -> bool:
    """Try ElevenLabs cloud TTS. Returns True on success, False on any failure.

    Uses elevenlabs official Python SDK. Timeout: 30 seconds.
    Audio format: pcm_24000 (matches Kokoro sample rate for uniform playback).

    Args:
        text: Text to synthesize
        api_key: ElevenLabs API key from config.elevenlabs_api_key

    Returns:
        True if audio played successfully, False if any error occurred
    """
    global _is_playing
    import numpy as np
    import sounddevice as sd
    try:
        from elevenlabs.client import ElevenLabs  # Lazy import
        client = ElevenLabs(api_key=api_key)
        # eleven_flash_v2_5: low-latency multilingual model (2026)
        # pcm_24000: 24kHz PCM — matches Kokoro sample rate, no resampling needed
        audio_bytes = client.text_to_speech.convert(
            text=text,
            voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel (English default)
            model_id="eleven_flash_v2_5",
            output_format="pcm_24000",
        )
        if isinstance(audio_bytes, (bytes, bytearray)):
            raw = bytes(audio_bytes)
        else:
            # SDK may return iterator — consume it
            raw = b"".join(audio_bytes)
        # PCM int16 → float32 normalized to [-1, 1]
        audio_array = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        _console().print("[TTS] falando (ElevenLabs)...")
        from jarvis_desktop import ui as _ui
        _ui.set_state("speaking")   # D-05: status → speaking before playback
        _is_playing = True
        sd.play(audio_array, samplerate=_KOKORO_SAMPLE_RATE)
        sd.wait()
        return True
    except Exception as exc:
        _console().print(f"[TTS] ElevenLabs erro: {exc}")
        return False
    finally:
        _is_playing = False
        from jarvis_desktop import ui as _ui
        _ui.set_state("idle")       # D-05: status → idle after playback


def _murf_speak(text: str, api_key: str) -> bool:
    """Try Murf.ai cloud TTS. Returns True on success, False on any failure.

    Uses murf-python-sdk official Python SDK.
    Downloads audio URL and plays via sounddevice.

    Args:
        text: Text to synthesize
        api_key: Murf.ai API key from config.murf_api_key

    Returns:
        True if audio played successfully, False if any error occurred
    """
    global _is_playing
    import numpy as np
    import sounddevice as sd
    try:
        from murf import Murf  # Lazy import
        import urllib.request
        import io
        import soundfile as sf
        client = Murf(api_key=api_key)
        response = client.text_to_speech.generate(
            text=text,
            voice_id="en-US-natalie",  # Default English voice
            format="WAV",
            sample_rate=24000,
        )
        # response.audio_file may be URL (string) or bytes
        if hasattr(response, "audio_file") and isinstance(response.audio_file, str):
            with urllib.request.urlopen(response.audio_file, timeout=30) as r:
                audio_data = r.read()
        elif hasattr(response, "audio_file"):
            audio_data = response.audio_file
        else:
            return False
        audio_array, sample_rate = sf.read(io.BytesIO(audio_data))
        audio_f32 = audio_array.astype(np.float32)
        _console().print("[TTS] falando (Murf)...")
        from jarvis_desktop import ui as _ui
        _ui.set_state("speaking")   # D-05: status → speaking before playback
        _is_playing = True
        sd.play(audio_f32, samplerate=sample_rate)
        sd.wait()
        return True
    except Exception as exc:
        _console().print(f"[TTS] Murf erro: {exc}")
        return False
    finally:
        _is_playing = False
        from jarvis_desktop import ui as _ui
        _ui.set_state("idle")       # D-05: status → idle after playback
