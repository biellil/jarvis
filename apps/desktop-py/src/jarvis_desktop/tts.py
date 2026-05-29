"""JARVIS Text-to-Speech singleton module.

Phase 75: Kokoro offline TTS (primary) with cloud fallback chain (ElevenLabs, Murf).
Phase 77: Migrated all print() to ui.get_console().print(); added set_state() calls.
Phase 86: Chatterbox provider added — singletons, device cascade, lazy imports, set_provider extended.

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
  D-05: set_state("speaking") before playback, set_state("idle") in finally — all providers
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
# Phase 86: Chatterbox singletons (D-25 — separados do Kokoro para warmup paralelo)
# ---------------------------------------------------------------------------
_chatterbox_engine: Optional[Any] = None     # ChatterboxMultilingualTTS instance, lazy
_chatterbox_disabled: bool = False           # D-08 — fallback runtime persiste pela sessão
_chatterbox_available: Optional[bool] = None # D-09 — None=não testado, True=OK, False=ImportError
_chatterbox_warmup_event = threading.Event() # D-05 — sinaliza fim do warmup; .wait(timeout=15)
_chatterbox_device: Optional[str] = None     # "cuda" | "mps" | "directml" | "cpu" — set após warmup

_CHATTERBOX_SAMPLE_RATE = 24000  # S3GEN_SR confirmado no source (chatterbox/models/s3gen/const.py)


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

        # Phase 86 D-02: dispara warmup Chatterbox SÓ se provider=chatterbox.
        # Kokoro continua sendo carregado abaixo como fallback offline universal (D-24).
        if config.tts_provider == "chatterbox":
            _start_chatterbox_warmup(config)

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

    Provider selection order (D-04, D-06):
      1. tts_provider="elevenlabs" + key present + not local_only → try ElevenLabs, fallback Kokoro
      2. tts_provider="murf" + key present + not local_only → try Murf, fallback Kokoro
      3. tts_provider="kokoro" OR provider fails OR local_only=True → Kokoro offline
      4. Kokoro unavailable (engine=None) → silent (text already printed to terminal)

    Args:
        text: Full response text to speak
        config: JarvisConfig controlling provider selection
    """
    if not text.strip():
        return  # Silent on empty text

    if config.tts_provider == "none":
        return  # TTS disabled — text already shown in terminal

    # Phase 86: Chatterbox path (offline, mesma prioridade que Kokoro).
    # _chatterbox_speak já contém a lógica completa de fallback para Kokoro
    # nos casos D-05 (timeout), D-08 (runtime error), D-09 (ImportError).
    if config.tts_provider == "chatterbox":
        _chatterbox_speak(text, config)
        return

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
    For Chatterbox (Phase 86): valida import lazy; se falhar, mantém provider anterior (D-11).
                               Se já marcado _chatterbox_available=False (D-09), recusa sem
                               alterar config. Warmup é disparado em init_tts/Plan 04, não aqui.
    For cloud providers (ElevenLabs, Murf): no engine needed — API keys read at call time.
    Updates config.tts_provider in-place; caller must call save_config() after.

    Args:
        provider: "kokoro" | "chatterbox" | "elevenlabs" | "murf" | "none"
        config: JarvisConfig instance to update (tts_provider field written in-place)

    Raises:
        ValueError: if provider is not one of the supported values
    """
    global _engine, _chatterbox_available, _chatterbox_engine

    from jarvis_desktop import ui
    console = ui.get_console()

    valid_providers = {"kokoro", "chatterbox", "elevenlabs", "murf", "none"}  # D-07
    if provider not in valid_providers:
        raise ValueError(f"[TTS] Provider desconhecido: {provider!r}. Válidos: {sorted(valid_providers)}")

    with _lock:
        if provider == "chatterbox":
            # D-09: se já detectado ImportError em sessão anterior, recusa sem alterar config
            if _chatterbox_available is False:
                console.print(
                    "[TTS] Chatterbox não instalado. Rode: uv sync --extra chatterbox",
                    highlight=False,
                )
                # D-11: NÃO altera config.tts_provider — usuário continua no provider anterior
                return

            # Testa import lazy (D-09)
            try:
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: F401
                _chatterbox_available = True
            except ImportError:
                _chatterbox_available = False
                console.print(
                    "[TTS] Chatterbox não instalado. Rode: uv sync --extra chatterbox",
                    highlight=False,
                )
                # D-11: NÃO altera config.tts_provider
                return

            # Import OK — aceita o provider. Reset do engine para forçar warmup novo.
            config.tts_provider = "chatterbox"
            _chatterbox_engine = None
            console.print(
                "[TTS] Provider definido: chatterbox (warmup na próxima fala ou em init_tts).",
                highlight=False,
            )
            return

        # Branches existentes (kokoro/elevenlabs/murf/none) — manter comportamento original
        config.tts_provider = provider

        if provider == "kokoro":
            # Reset engine so next speak() lazy-initializes with current config
            _engine = None
            console.print("[TTS] Provider definido: kokoro (inicializa na próxima fala).", highlight=False)
        else:
            # Cloud providers / "none" são stateless — sem engine para resetar
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


# ---------------------------------------------------------------------------
# Phase 86: Chatterbox helpers (CHTB-01)
# ---------------------------------------------------------------------------

def _detect_chatterbox_device() -> list:
    """Cascade de detecção de device para Chatterbox (D-12).

    Ordem: CUDA → MPS → DirectML → CPU. Apenas verifica disponibilidade
    básica via APIs públicas do torch — NÃO carrega modelo (carga vem no warmup).

    DirectML é pulado silenciosamente se `torch_directml` não estiver instalado
    (D-19: extra opcional dentro do grupo `chatterbox`).

    Returns:
        Lista ordenada de device strings disponíveis. Sempre inclui "cpu" como
        último fallback universal. Exemplos:
          ["cuda", "cpu"] — máquina com NVIDIA GPU
          ["mps", "cpu"] — macOS Apple Silicon
          ["directml", "cpu"] — Windows AMD GPU com torch-directml instalado
          ["cpu"] — máquina sem GPU compatível
    """
    import torch  # Lazy import (D-20)

    candidates: list = []

    # 1. CUDA (NVIDIA Linux/Windows; ROCm Linux quando PyTorch ROCm build)
    if torch.cuda.is_available():
        candidates.append("cuda")

    # 2. MPS (macOS Apple Silicon)
    if (
        hasattr(torch.backends, "mps")
        and torch.backends.mps.is_available()
        and torch.backends.mps.is_built()
    ):
        candidates.append("mps")

    # 3. DirectML (AMD/Intel GPU no Windows). D-19: pacote opcional, ausência não é erro.
    try:
        import torch_directml  # type: ignore[import-not-found]
        if torch_directml.device_count() > 0:
            candidates.append("directml")
    except ImportError:
        pass

    # 4. CPU sempre como fallback universal
    candidates.append("cpu")

    return candidates


def _create_chatterbox_engine(config: "JarvisConfig", device: str) -> Any:
    """Instancia ChatterboxMultilingualTTS no device escolhido (D-20 lazy import).

    USAR `chatterbox.mtl_tts.ChatterboxMultilingualTTS`, NÃO `chatterbox.tts.ChatterboxTTS`.
    O `ChatterboxTTS` é English-only e não aceita `language_id` (Pitfall 2 do RESEARCH).

    Args:
        config: JarvisConfig (não usa campos nesta phase — Phase 87 vai consumir
                cloned_voice_path quando audio_prompt_path entrar em jogo).
        device: "cuda" | "mps" | "directml" | "cpu" (string da cascade).

    Returns:
        Instância de ChatterboxMultilingualTTS pronta para .generate(text, language_id="pt").

    Raises:
        ImportError: se chatterbox-tts não estiver instalado. Caller deve marcar
                     _chatterbox_available = False (D-09).
        RuntimeError: se device escolhido falhar no load. Caller deve tentar
                      próximo device da cascade (D-14).
    """
    import warnings
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # Lazy (D-20). NÃO de chatterbox.tts.

    # DirectML usa device object (não string). Outros backends aceitam string.
    if device == "directml":
        import torch_directml  # type: ignore[import-not-found]
        torch_device: Any = torch_directml.device()
    else:
        torch_device = device

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # Suprime UserWarning/FutureWarning do torch no init
        return ChatterboxMultilingualTTS.from_pretrained(device=torch_device)


def _start_chatterbox_warmup(config: JarvisConfig) -> None:
    """Dispara warmup do Chatterbox em background thread daemon (D-01).

    Idempotente: se warmup já completou (_chatterbox_warmup_event setado) ou se
    sessão já marcou _chatterbox_available=False (D-09), retorna imediatamente.

    Aplica cascade de device (D-14): se primeiro device falhar no load ou no
    smoke test do warmup, tenta próximo da cadeia antes de declarar indisponível.

    Texto do warmup: "olá" (D-03 — texto curto fixo PT-BR; áudio descartado).
    NÃO usa audio_prompt_path (D-04 — voice cloning é Phase 87).
    """
    global _chatterbox_engine, _chatterbox_device, _chatterbox_available

    # Idempotência (D-06: thread daemon, sem cleanup elegante)
    if _chatterbox_warmup_event.is_set():
        return
    if _chatterbox_available is False:
        # D-09: sessão já decidiu que Chatterbox não está instalado
        return

    def _warmup_worker() -> None:
        global _chatterbox_engine, _chatterbox_device, _chatterbox_available

        # Cascade de device (D-14). ImportError detectado dentro do loop —
        # _create_chatterbox_engine faz lazy import e propaga ImportError se
        # chatterbox-tts não estiver instalado (D-09).
        devices = _detect_chatterbox_device()
        last_error: Optional[BaseException] = None

        # D-21: labels EXATAS — "GPU (CUDA)" / "GPU (MPS)" / "GPU (DirectML)" / "CPU"
        device_labels = {
            "cuda": "GPU (CUDA)",
            "mps": "GPU (MPS)",
            "directml": "GPU (DirectML)",
            "cpu": "CPU",
        }

        for device in devices:
            try:
                _console().print(
                    f"[TTS] Chatterbox: aquecendo ({device.upper()})...",
                    highlight=False,
                )
                engine = _create_chatterbox_engine(config, device)
                # D-03: warmup com texto mínimo PT-BR; áudio descartado
                _ = engine.generate("olá", language_id="pt")

                with _lock:
                    _chatterbox_engine = engine
                    _chatterbox_device = device
                    _chatterbox_available = True

                label = device_labels.get(device, device)
                _console().print(f"[TTS] Chatterbox: {label}. Pronto.", highlight=False)
                _chatterbox_warmup_event.set()
                return
            except ImportError as exc:
                # D-09: pacote chatterbox-tts não instalado. Mensagem específica
                # ajudando o usuário a instalar. NÃO faz sentido tentar outros devices.
                last_error = exc
                _console().print(
                    "[TTS] Chatterbox não instalado. Rode: uv sync --extra chatterbox",
                    highlight=False,
                )
                _chatterbox_available = False
                _chatterbox_warmup_event.set()
                return
            except Exception as exc:
                last_error = exc
                _console().print(
                    f"[TTS] Chatterbox: {device} falhou ({type(exc).__name__}) — tentando próximo.",
                    highlight=False,
                )
                continue

        # Cascade esgotada (D-14) → Chatterbox indisponível pela sessão
        _console().print(
            f"[TTS] Chatterbox indisponível ({type(last_error).__name__ if last_error else 'unknown'}) — usando Kokoro pela sessão.",
            highlight=False,
        )
        _chatterbox_available = False
        _chatterbox_warmup_event.set()

    thread = threading.Thread(
        target=_warmup_worker,
        daemon=True,  # D-06: morre com o processo
        name="chatterbox-warmup",
    )
    thread.start()


def _chatterbox_speak(text: str, config: JarvisConfig) -> None:
    """Synthesize text with Chatterbox and play via sounddevice.

    Replica o pattern de _kokoro_speak (set_state, _is_playing, _stop_event, finally)
    e adiciona:
      - D-05: bloqueia até 15s aguardando _chatterbox_warmup_event
      - D-08: erro runtime marca _chatterbox_disabled=True e chama _kokoro_speak
      - D-10: NUNCA altera config.tts_provider (estado de degradação só em memória)
    """
    global _is_playing, _chatterbox_disabled, _chatterbox_engine
    import sounddevice as sd
    import numpy as np

    # Caminhos rápidos de fallback (sem tocar engine)
    if _chatterbox_disabled or _chatterbox_available is False:
        # D-08 (runtime error sticky) ou D-09 (ImportError sticky) — Kokoro direto
        _kokoro_speak(text, config)
        return

    # Garantir que warmup já foi disparado. Só dispara sob demanda quando state
    # está realmente vazio (_chatterbox_available is None) — se já está True,
    # significa que warmup foi iniciado por init_tts/set_provider e ainda está
    # em progresso. Re-disparar criaria threads concorrentes.
    if (
        not _chatterbox_warmup_event.is_set()
        and _chatterbox_engine is None
        and _chatterbox_available is None
    ):
        _start_chatterbox_warmup(config)

    # D-05: bloquear até 15s aguardando warmup
    if not _chatterbox_warmup_event.is_set():
        _console().print("[TTS] aguardando inicialização...", highlight=False)
        completed = _chatterbox_warmup_event.wait(timeout=15.0)
        if not completed:
            _console().print(
                "[TTS] timeout aguardando Chatterbox — usando Kokoro.",
                highlight=False,
            )
            _kokoro_speak(text, config)
            return

    # Re-checar disponibilidade após warmup
    if _chatterbox_engine is None or _chatterbox_disabled or _chatterbox_available is False:
        _kokoro_speak(text, config)
        return

    try:
        _stop_event.clear()
        from jarvis_desktop import ui as _ui
        _ui.set_state("speaking")   # D-24
        _is_playing = True

        # Geração síncrona (Chatterbox não tem streaming nativo)
        wav_tensor = _chatterbox_engine.generate(text, language_id="pt")

        # Pitfall 4: tensor em GPU exige .cpu() antes de .numpy()
        # A4: .squeeze() para garantir forma 1D antes do sounddevice
        audio_data = wav_tensor.squeeze().cpu().numpy().astype(np.float32)

        if _stop_event.is_set():
            return

        _console().print("[TTS] falando (Chatterbox)...", highlight=False)
        sd.play(audio_data, samplerate=_CHATTERBOX_SAMPLE_RATE)
        sd.wait()
        if _stop_event.is_set():
            sd.stop()

    except Exception as exc:
        # D-08: marca disabled pela sessão (sticky) + Kokoro fallback
        # D-10: NUNCA mexer em config.tts_provider — estado fica em memória
        _chatterbox_disabled = True
        _console().print(
            f"[TTS] Chatterbox falhou ({type(exc).__name__}: {exc}) — usando Kokoro pela sessão.",
            highlight=False,
        )
        _is_playing = False
        try:
            from jarvis_desktop import ui as _ui
            _ui.set_state("idle")
        except Exception:
            pass
        _kokoro_speak(text, config)
        return
    finally:
        _is_playing = False
        try:
            from jarvis_desktop import ui as _ui
            _ui.set_state("idle")
        except Exception:
            pass
