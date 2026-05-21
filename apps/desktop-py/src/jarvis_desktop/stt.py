"""JARVIS Speech-to-Text singleton module.

Phase 74: PTT hotkey + audio capture + local transcription via faster-whisper.
Phase 78: GPU auto-detection (WGPU-01/02/03).

Public API:
  init_stt(config: JarvisConfig) -> None     — load Whisper model at startup (blocking, D-07)
  record_until_silence(...) -> np.ndarray    — capture audio until VAD silence (PYSTT-03)
  transcribe(audio: np.ndarray) -> str       — transcribe audio to text (PYSTT-01)
  _parse_ptt_hotkey(hotkey: str) -> str      — convert "ctrl+shift+q" to "<ctrl>+<shift>+q"
  _detect_device() -> str                    — detect CUDA/CPU (WGPU-01)
  _select_model_for_device(device, vram_mb)  — VRAM-tier model selection (WGPU-02)

Decisions honored:
  D-07: Blocking load at startup, status message printed
  D-08: Singleton — model loaded once, reused all session
  D-05: transcribe() returns str; caller prints "[transcrito: <text>]"
  CLAUDE.md: sounddevice (NumPy native) not PyAudio; faster-whisper not openai/whisper
"""
import threading
from typing import Optional

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------
_model: Optional[WhisperModel] = None
_lock = threading.Lock()

# Whisper standard sample rate
_SAMPLE_RATE = 16000

# Recognized modifier key names for hotkey parsing
_MODIFIER_KEYS = {"ctrl", "shift", "alt", "cmd", "super", "meta"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _is_model_cached(model_size: str) -> bool:
    """Return True if the faster-whisper model is already in the huggingface cache."""
    from pathlib import Path
    from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE
    slug = f"models--Systran--faster-whisper-{model_size}"
    return (Path(HUGGINGFACE_HUB_CACHE) / slug / "snapshots").exists()


def _detect_device() -> str:
    """Detect best available compute device: CUDA > ROCm > Metal > CPU.

    Detection order (D-06, Phase 78):
      1. CUDA — try torch.cuda.is_available()
      2. ROCm — check /opt/rocm exists (Linux AMD GPU)
      3. Metal — try torch.backends.mps.is_available() (Apple Silicon)
      4. CPU   — always available fallback

    ROCm/Metal are detected but ctranslate2 standard wheels only support CUDA/CPU.
    When detected without wheels, falls back to CPU with log warning (D-11).

    Returns:
        "cuda" or "cpu"
    """
    from pathlib import Path as _Path

    # 1. Try CUDA via torch
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except (ImportError, Exception):
        pass

    # 2. Try ROCm (AMD GPU on Linux — /opt/rocm present)
    if _Path("/opt/rocm").exists():
        # ROCm detected; ctranslate2 standard wheels do NOT include ROCm support.
        # Fall back to CPU with warning (D-11).
        from jarvis_desktop import ui as _ui
        _ui.get_console().print(
            "[STT] ROCm detectado mas sem suporte ctranslate2 — usando CPU (fallback silencioso)."
        )
        return "cpu"

    # 3. Try Apple Metal (MPS) via torch
    try:
        import torch
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            # ctranslate2 standard wheels do NOT include Metal support.
            # Fall back to CPU with warning (D-11).
            from jarvis_desktop import ui as _ui
            _ui.get_console().print(
                "[STT] Apple Metal (MPS) detectado mas sem suporte ctranslate2 — usando CPU (fallback silencioso)."
            )
            return "cpu"
    except (ImportError, Exception):
        pass

    # 4. CPU — always available
    return "cpu"


def _query_vram_mb() -> int:
    """Query available GPU VRAM in megabytes. Returns 0 if no GPU or torch not installed.

    Used by _select_model_for_device() to pick Whisper model tier.
    """
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            return props.total_memory // (1024 ** 2)
    except (ImportError, Exception):
        pass
    return 0


def _select_model_for_device(device: str, vram_mb: int = 0) -> str:
    """Auto-select Whisper model size based on device and VRAM (D-09, Phase 78).

    VRAM thresholds (int8 quantization active, ~50% reduction from fp16):
      CPU                  → tiny   (fastest CPU inference, low memory)
      CUDA, VRAM < 2000 MB → tiny   (1 GB after int8 quantization)
      CUDA, VRAM 2–4 GB   → base   (1.5 GB after int8 quantization)
      CUDA, VRAM > 4000 MB → large-v3-turbo (5 GB estimated after int8)

    Args:
        device: "cuda", "cpu", or other (treated as cpu)
        vram_mb: GPU VRAM in MB (from _query_vram_mb()); 0 for CPU

    Returns:
        Whisper model size string: "tiny", "base", or "large-v3-turbo"
    """
    if device != "cuda":
        return "tiny"
    if vram_mb > 4000:
        return "large-v3-turbo"
    if vram_mb > 2000:
        return "base"
    return "tiny"


def _load_model_with_progress(model_size: str, device: str = "auto") -> WhisperModel:
    """Load WhisperModel, showing a rich download progress bar if model is not cached.

    When cached: loads instantly with no extra output.
    When not cached: patches tqdm with a rich.Progress adapter so the huggingface_hub
    file-download loop shows [ description | bar | % | size | speed | ETA ].
    The UI live display is paused during download to avoid two concurrent Live instances.

    Args:
        model_size: one of "tiny", "base", "small", "medium", "large-v3-turbo"
        device: compute device string for WhisperModel ("cuda", "cpu", "auto")
    """
    from jarvis_desktop import ui

    if _is_model_cached(model_size):
        return WhisperModel(model_size, device=device, compute_type="int8")

    # Model not in cache — show rich progress bar during download
    import tqdm as _tqdm_mod
    import tqdm.auto as _tqdm_auto_mod
    from rich.progress import (
        Progress, TextColumn, BarColumn, DownloadColumn,
        TransferSpeedColumn, TimeRemainingColumn,
    )

    console = ui.get_console()
    progress = Progress(
        TextColumn("[bold]{task.description}"),
        BarColumn(),
        "[progress.percentage]{task.percentage:>3.0f}%",
        DownloadColumn(),
        TransferSpeedColumn(),
        TimeRemainingColumn(),
        console=console,
        transient=True,
    )

    class _RichTqdm:
        """Minimal tqdm drop-in that forwards updates to rich.Progress."""

        def __init__(self, iterable=None, desc=None, total=None, unit="it",
                     unit_scale=False, disable=False, **kw):
            self.iterable = iterable
            name = desc or f"Baixando {model_size}"
            self.task_id = progress.add_task(name, total=total)

        def __iter__(self):
            if self.iterable is not None:
                for item in self.iterable:
                    yield item
                    progress.advance(self.task_id, 1)

        def update(self, n=1):
            progress.advance(self.task_id, n)

        def __enter__(self): return self
        def __exit__(self, *a): self.close()
        def close(self): pass
        def set_postfix(self, **kw): pass
        def set_description(self, desc=None, **kw):
            if desc:
                progress.update(self.task_id, description=desc)
        def reset(self, total=None):
            if total is not None:
                progress.update(self.task_id, total=total, completed=0)

    _orig = _tqdm_mod.tqdm
    _orig_auto = _tqdm_auto_mod.tqdm
    _tqdm_mod.tqdm = _RichTqdm
    _tqdm_auto_mod.tqdm = _RichTqdm

    with ui.live_paused():
        progress.start()
        try:
            model = WhisperModel(model_size, device=device, compute_type="int8")
        finally:
            progress.stop()
            _tqdm_mod.tqdm = _orig
            _tqdm_auto_mod.tqdm = _orig_auto

    return model


def init_stt(config: "JarvisConfig") -> None:  # type: ignore[name-defined]
    """Load Whisper model once at startup (blocking). Called by __main__.py after health check.

    GPU auto-detection (WGPU-01):
      Calls _detect_device() to determine best device (CUDA → ROCm → Metal → CPU).

    Model tier selection (WGPU-02):
      If config.whisper_model_locked is False: auto-selects model size by VRAM tier.
      If config.whisper_model_locked is True: uses config.whisper_model as-is (user choice).

    Device fallback (WGPU-03):
      If WhisperModel init fails on detected device, retries with device="cpu".

    Terminal output (D-10):
      Always prints: [STT] Carregando {model} em {device}...

    Safe to call multiple times — subsequent calls are no-ops if already initialized (D-08).

    Args:
        config: JarvisConfig with whisper_model, whisper_model_locked fields

    Raises:
        Exception: Only if both device and CPU fallback fail (rare; bad install)
    """
    global _model
    with _lock:
        if _model is not None:
            return  # Already initialized (D-08: singleton guard)

        from jarvis_desktop import ui
        console = ui.get_console()

        # WGPU-01: detect best device
        device = _detect_device()

        # WGPU-02: select model size
        if config.whisper_model_locked:
            model_size = config.whisper_model  # User locked their choice — respect it
        else:
            vram_mb = _query_vram_mb() if device == "cuda" else 0
            model_size = _select_model_for_device(device, vram_mb)

        # D-10: always show chosen device and model
        cached = _is_model_cached(model_size)
        if cached:
            console.print(f"[STT] Carregando {model_size} em {device}...")
        else:
            console.print(f"[STT] Baixando {model_size} (primeira vez, pode demorar)...")

        # WGPU-03: attempt load; fall back to CPU on device failure
        try:
            _model = _load_model_with_progress(model_size, device=device)
        except Exception as exc:
            if device != "cpu":
                console.print(f"[STT] {device.upper()} indisponível — usando CPU.")
                _model = _load_model_with_progress(model_size, device="cpu")
            else:
                raise

        console.print("[STT] Pronto.")


def record_until_silence(
    threshold_ms: int = 500,
    sample_rate: int = _SAMPLE_RATE,
    max_duration_s: int = 60,
) -> np.ndarray:
    """Record from microphone until VAD detects silence or max_duration_s reached.

    Uses faster-whisper's internal Silero VAD applied post-recording. The silence
    detection is performed during transcribe() via VadOptions — this function
    captures the full audio window then transcribe() trims silence (PYSTT-03).

    Args:
        threshold_ms: silence pause in ms that triggers end-of-speech (passed to transcribe via config)
        sample_rate: recording sample rate — must be 16000 Hz for Whisper
        max_duration_s: safety limit; recording stops after this even if no silence

    Returns:
        NumPy float32 array, shape (N,), 16 kHz mono — ready for transcribe()

    Raises:
        RuntimeError: if microphone not found (PortAudioError) — clear message, no crash
    """
    num_frames = max_duration_s * sample_rate
    try:
        audio = sd.rec(
            num_frames,
            samplerate=sample_rate,
            channels=1,
            dtype=np.float32,
            blocking=True,  # Wait for full recording (PTT release or max duration)
        )
    except Exception as exc:
        # Covers sd.PortAudioError and any other sounddevice error
        raise RuntimeError(f"[STT] Microfone não encontrado ou inacessível: {exc}") from exc

    return audio.squeeze()  # shape (N, 1) → (N,) — faster-whisper expects 1D


def transcribe(audio: np.ndarray) -> str:
    """Transcribe a NumPy audio array to text using the singleton Whisper model.

    Args:
        audio: float32 NumPy array at 16 kHz (output of record_until_silence())

    Returns:
        Transcribed text, stripped of leading/trailing whitespace.
        Returns empty string "" if no speech detected.

    Raises:
        RuntimeError: if init_stt() was not called before transcribe()
    """
    if _model is None:
        raise RuntimeError("[STT] Modelo não carregado. Chame init_stt() antes de transcrever.")

    segments, _info = _model.transcribe(audio)
    text = "".join(seg.text for seg in segments).strip()
    return text


def reload_model(new_size: str) -> None:
    """Reload Whisper model with a different size (runtime switch from config menu).

    Thread-safe: acquires _lock before replacing _model, so in-flight transcribe()
    calls finish before the swap occurs (transcribe() does not hold _lock itself but
    the replacement is atomic — Python assignment is thread-safe for simple objects).

    Prints progress messages via ui console (not print()).

    Args:
        new_size: one of "tiny", "base", "small", "medium", "large-v3-turbo"

    Raises:
        RuntimeError: if WhisperModel fails to load (e.g. download error, invalid size)
    """
    global _model

    from jarvis_desktop import ui
    console = ui.get_console()

    valid_sizes = {"tiny", "base", "small", "medium", "large-v3-turbo"}
    if new_size not in valid_sizes:
        raise RuntimeError(f"[STT] Modelo desconhecido: {new_size!r}. Válidos: {sorted(valid_sizes)}")

    with _lock:
        cached = _is_model_cached(new_size)
        if cached:
            console.print(f"[STT] Carregando {new_size}...", highlight=False)
        else:
            console.print(f"[STT] Baixando {new_size} (primeira vez)...", highlight=False)
        old_model = _model
        try:
            _model = _load_model_with_progress(new_size)
            del old_model  # Release reference so GC can reclaim GPU/CPU memory
            console.print(f"[STT] Pronto: {new_size}.", highlight=False)
        except Exception as exc:
            # Restore old model on failure so STT keeps working
            _model = old_model
            raise RuntimeError(f"[STT] Falha ao carregar {new_size}: {exc}") from exc


def _parse_ptt_hotkey(hotkey_str: str) -> str:
    """Convert config hotkey string to pynput GlobalHotKeys format.

    pynput expects modifier keys wrapped in angle brackets:
      Input:  "ctrl+shift+q"
      Output: "<ctrl>+<shift>+q"

    Non-modifier keys (alphanumeric) are left unchanged.

    Args:
        hotkey_str: hotkey string from JarvisConfig.ptt_key (e.g. "ctrl+shift+q")

    Returns:
        pynput-compatible hotkey string (e.g. "<ctrl>+<shift>+q")
    """
    parts = hotkey_str.lower().strip().split("+")
    pynput_parts = []
    for part in parts:
        part = part.strip()
        if part in _MODIFIER_KEYS:
            pynput_parts.append(f"<{part}>")
        else:
            pynput_parts.append(part)
    return "+".join(pynput_parts)
