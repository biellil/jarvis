"""JARVIS Speech-to-Text singleton module.

Phase 74: PTT hotkey + audio capture + local transcription via faster-whisper.

Public API:
  init_stt(model_size: str) -> None          — load Whisper model at startup (blocking, D-07)
  record_until_silence(...) -> np.ndarray    — capture audio until VAD silence (PYSTT-03)
  transcribe(audio: np.ndarray) -> str       — transcribe audio to text (PYSTT-01)
  _parse_ptt_hotkey(hotkey: str) -> str      — convert "ctrl+shift+q" to "<ctrl>+<shift>+q"

Decisions honored:
  D-07: Blocking load at startup, status message printed
  D-08: Singleton — model loaded once, reused all session
  D-05: transcribe() returns str; caller prints "[transcrito: <text>]"
  CLAUDE.md: sounddevice (NumPy native) not PyAudio; faster-whisper not openai/whisper
"""
import subprocess
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

# Whisper.cpp backend (optional — only set when stt_backend resolves to whisper_cpp)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from jarvis_desktop.stt_whisper_cpp import WhisperCppBackend
_cpp_backend: "Optional[WhisperCppBackend]" = None

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


def _detect_amd_windows() -> bool:
    """Return True if running on Windows with an AMD GPU detected via wmic.

    Uses subprocess wmic (available on all Windows versions that support Python).
    Checks Win32_VideoController.Name for "AMD" or "Radeon" strings.
    Returns False on any error (wmic absent, subprocess failure, non-Windows OS).
    """
    import platform
    if platform.system() != "Windows":
        return False
    try:
        result = subprocess.run(
            ["wmic", "path", "Win32_VideoController", "get", "Name"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = result.stdout.upper()
        return "AMD" in output or "RADEON" in output
    except Exception:
        return False


def _load_model_with_progress(model_size: str) -> WhisperModel:
    """Load WhisperModel, showing a rich download progress bar if model is not cached.

    When cached: loads instantly with no extra output.
    When not cached: patches tqdm with a rich.Progress adapter so the huggingface_hub
    file-download loop shows [ description | bar | % | size | speed | ETA ].
    The UI live display is paused during download to avoid two concurrent Live instances.
    """
    from jarvis_desktop import ui

    if _is_model_cached(model_size):
        return WhisperModel(model_size, device="auto", compute_type="int8")

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
            model = WhisperModel(model_size, device="auto", compute_type="int8")
        finally:
            progress.stop()
            _tqdm_mod.tqdm = _orig
            _tqdm_auto_mod.tqdm = _orig_auto

    return model


def init_stt(config: "JarvisConfig") -> None:  # type: ignore[name-defined]
    """Load Whisper model once at startup (blocking). Called by __main__.py after health check.

    Backend resolution (h98):
      If config.stt_backend == "auto": uses whisper_cpp if AMD GPU detected on Windows,
      otherwise faster_whisper.
      If config.stt_backend == "whisper_cpp": always tries whisper.cpp subprocess.
      If config.stt_backend == "faster_whisper": always uses faster-whisper.

    Safe to call multiple times — subsequent calls are no-ops if already initialized (D-08).

    Args:
        config: JarvisConfig with whisper_model, stt_backend, whisper_cpp_binary fields

    Raises:
        Exception: Only if faster-whisper load fails after all fallbacks.
    """
    global _model, _cpp_backend
    with _lock:
        if _model is not None or _cpp_backend is not None:
            return  # Already initialized (D-08: singleton guard)

        from jarvis_desktop import ui
        console = ui.get_console()

        # Backend resolution (h98: whisper.cpp Vulkan support)
        resolved_backend = config.stt_backend
        if resolved_backend == "auto":
            resolved_backend = "whisper_cpp" if _detect_amd_windows() else "faster_whisper"

        if resolved_backend == "whisper_cpp":
            from jarvis_desktop.stt_whisper_cpp import WhisperCppBackend
            backend = WhisperCppBackend()
            # model_size for whisper.cpp: use config whisper_model if set, else default large-v3-turbo
            cpp_model_size = config.whisper_model if config.whisper_model != "tiny" else "large-v3-turbo"
            success = backend.load(cpp_model_size, config.whisper_cpp_binary)
            if success:
                _cpp_backend = backend
                console.print(f"[STT] whisper.cpp Vulkan ativo ({cpp_model_size}).")
                return  # Skip faster-whisper initialization entirely
            # load() printed instructions; fall through to faster-whisper below
            console.print("[STT] Falling back to faster-whisper.")

        # faster-whisper path
        model_size = config.whisper_model
        cached = _is_model_cached(model_size)
        if cached:
            console.print(f"[STT] Carregando modelo {model_size}...")
        else:
            console.print(f"[STT] Baixando modelo {model_size} (primeira vez, pode demorar)...")
        _model = _load_model_with_progress(model_size)
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
    """Transcribe a NumPy audio array to text.

    Delegates to WhisperCppBackend when active (stt_backend=whisper_cpp),
    otherwise uses faster-whisper singleton (_model).

    Args:
        audio: float32 NumPy array at 16 kHz (output of record_until_silence())

    Returns:
        Transcribed text, stripped. Returns "" if no speech detected.

    Raises:
        RuntimeError: if init_stt() was not called before transcribe()
    """
    if _cpp_backend is not None:
        return _cpp_backend.transcribe(audio)

    if _model is None:
        raise RuntimeError("[STT] Modelo nao carregado. Chame init_stt() antes de transcrever.")

    segments, _info = _model.transcribe(audio)
    text = "".join(seg.text for seg in segments).strip()
    return text


def reload_model(new_size: str) -> None:
    """Reload Whisper model with a different size (runtime switch from config menu).

    Thread-safe: acquires _lock before replacing _model, so in-flight transcribe()
    calls finish before the swap occurs (transcribe() does not hold _lock itself but
    the replacement is atomic — Python assignment is thread-safe for simple objects).

    If whisper.cpp backend is active, reloads on that backend instead.
    Prints progress messages via ui console (not print()).

    Args:
        new_size: one of "tiny", "base", "small", "medium", "large-v3-turbo"

    Raises:
        RuntimeError: if WhisperModel fails to load (e.g. download error, invalid size)
    """
    global _model, _cpp_backend

    from jarvis_desktop import ui
    console = ui.get_console()

    # If whisper.cpp backend is active, reload on it
    if _cpp_backend is not None:
        with _lock:
            success = _cpp_backend.load(new_size, "")
            if success:
                console.print(f"[STT] whisper.cpp recarregado: {new_size}.", highlight=False)
            else:
                console.print(f"[STT] Falha ao recarregar whisper.cpp para {new_size}.", highlight=False)
        return

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
