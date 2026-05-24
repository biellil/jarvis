"""JARVIS Speech-to-Text singleton module.

Phase 74: PTT hotkey + audio capture + local transcription via faster-whisper.
Phase 78: GPU auto-detection (WGPU-01/02/03).
Quick 260524-h98: whisper.cpp Vulkan backend for AMD GPU on Windows.

Public API:
  init_stt(config: JarvisConfig) -> None     — load Whisper model at startup (blocking, D-07)
  record_until_silence(...) -> np.ndarray    — capture audio until VAD silence (PYSTT-03)
  transcribe(audio: np.ndarray) -> str       — transcribe audio to text (PYSTT-01)
  _parse_ptt_hotkey(hotkey: str) -> str      — convert "ctrl+shift+q" to "<ctrl>+<shift>+q"
  _detect_device() -> str                    — detect CUDA/CPU (WGPU-01)
  _detect_amd_windows() -> bool              — detect AMD GPU on Windows (h98)
  _select_model_for_device(device, vram_mb)  — VRAM-tier model selection (WGPU-02)

Decisions honored:
  D-07: Blocking load at startup, status message printed
  D-08: Singleton — model loaded once, reused all session
  D-05: transcribe() returns str; caller prints "[transcrito: <text>]"
  CLAUDE.md: sounddevice (NumPy native) not PyAudio; faster-whisper not openai/whisper
"""
from __future__ import annotations

import subprocess
import threading
from typing import TYPE_CHECKING, Optional

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop.stt_whisper_cpp import WhisperCppBackend

# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------

_model: Optional[WhisperModel] = None
_cpp_backend: Optional[WhisperCppBackend] = None
_lock = threading.Lock()
_cpp_model_size: str = "large-v3-turbo"  # model size used by whisper.cpp (stored for CPU fallback)

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
        from jarvis_desktop import ui as _ui
        _ui.get_console().print(
            "[STT] ROCm detectado mas sem suporte ctranslate2 — usando CPU (fallback silencioso)."
        )
        return "cpu"

    # 3. Try Apple Metal (MPS) via torch
    try:
        import torch
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            from jarvis_desktop import ui as _ui
            _ui.get_console().print(
                "[STT] Apple Metal (MPS) detectado mas sem suporte ctranslate2 — usando CPU (fallback silencioso)."
            )
            return "cpu"
    except (ImportError, Exception):
        pass

    # 4. CPU — always available
    return "cpu"


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

    Backend resolution (h98):
      If config.stt_backend == "whisper_cpp" OR ("auto" AND AMD on Windows):
        → tries WhisperCppBackend; falls back to faster-whisper on failure.
      Otherwise → faster-whisper with GPU auto-detection (WGPU-01/02/03).

    GPU auto-detection (WGPU-01, faster-whisper path):
      Calls _detect_device() to determine best device (CUDA → ROCm → Metal → CPU).

    Model tier selection (WGPU-02):
      If config.whisper_model_locked is False: auto-selects model size by VRAM tier.
      If config.whisper_model_locked is True: uses config.whisper_model as-is (user choice).

    Device fallback (WGPU-03):
      If WhisperModel init fails on detected device, retries with device="cpu".

    Safe to call multiple times — subsequent calls are no-ops if already initialized (D-08).

    Args:
        config: JarvisConfig with whisper_model, whisper_model_locked, stt_backend, whisper_cpp_binary

    Raises:
        Exception: Only if both device and CPU fallback fail (rare; bad install)
    """
    global _model, _cpp_backend
    with _lock:
        if _model is not None or _cpp_backend is not None:
            return  # Already initialized (D-08: singleton guard)

        from jarvis_desktop import ui
        console = ui.get_console()

        # h98: whisper.cpp backend resolution
        resolved_backend = config.stt_backend
        if resolved_backend == "auto":
            resolved_backend = "whisper_cpp" if _detect_amd_windows() else "faster_whisper"

        if resolved_backend == "whisper_cpp":
            from jarvis_desktop.stt_whisper_cpp import WhisperCppBackend
            backend = WhisperCppBackend()
            cpp_model = config.whisper_model if config.whisper_model not in ("tiny", "") else "large-v3-turbo"
            _cpp_model_size = cpp_model
            success = backend.load(cpp_model, config.whisper_cpp_binary)
            if success:
                _cpp_backend = backend
                console.print(f"[STT] whisper.cpp Vulkan ativo ({cpp_model}).")
                from jarvis_desktop import ui as _ui
                _ui.set_active_stt_model(cpp_model)
                return
            console.print("[STT] Usando faster-whisper como fallback.")

        # faster-whisper path (WGPU-01/02/03)
        device = _detect_device()

        if config.whisper_model_locked:
            model_size = config.whisper_model
        else:
            vram_mb = _query_vram_mb() if device == "cuda" else 0
            model_size = _select_model_for_device(device, vram_mb)

        cached = _is_model_cached(model_size)
        if cached:
            console.print(f"[STT] Carregando {model_size} em {device}...")
        else:
            console.print(f"[STT] Baixando {model_size} (primeira vez, pode demorar)...")

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
        raise RuntimeError(f"[STT] Microfone não encontrado ou inacessível: {exc}") from exc

    return audio.squeeze()  # shape (N, 1) → (N,) — faster-whisper expects 1D


def _activate_faster_whisper_fallback() -> None:
    """Load faster-whisper small/cpu as one-time fallback when whisper.cpp binary fails.

    Uses 'small' model — better quality than tiny while still usable on CPU.
    Also removes the bad whisper.cpp binary so 'jd setup' can try a different source.
    """
    global _model
    from pathlib import Path
    from jarvis_desktop import ui as _ui
    console = _ui.get_console()

    # Remove bad binary so next `jd setup` downloads a different build
    bad_binary = Path.home() / ".jarvis" / "bin" / "whisper-cli.exe"
    if bad_binary.exists():
        try:
            bad_binary.unlink()
            console.print("[STT] Binário incompatível removido — execute 'jd setup' para tentar outro build.")
        except OSError:
            pass

    fallback_size = "small"
    console.print(f"[STT] Carregando faster-whisper {fallback_size} (CPU) como fallback permanente...")
    try:
        _model = WhisperModel(fallback_size, device="cpu", compute_type="int8")
        from jarvis_desktop.ui import set_active_stt_model
        set_active_stt_model(f"{fallback_size} (cpu)")
        console.print(f"[STT] faster-whisper {fallback_size} pronto.")
    except Exception as exc:
        console.print(f"[STT] Falha ao carregar fallback: {exc}")
        raise RuntimeError(f"[STT] Fallback falhou: {exc}") from exc


def transcribe(audio: np.ndarray) -> str:
    """Transcribe a NumPy audio array to text using the active backend.

    Delegates to WhisperCppBackend when active (stt_backend=whisper_cpp),
    otherwise uses faster-whisper singleton (_model).

    If whisper.cpp crashes at runtime (e.g. illegal instruction — binary compiled for
    incompatible CPU), automatically falls back to faster-whisper tiny for all
    subsequent calls without requiring a restart.

    Args:
        audio: float32 NumPy array at 16 kHz (output of record_until_silence())

    Returns:
        Transcribed text, stripped of leading/trailing whitespace.
        Returns empty string "" if no speech detected.

    Raises:
        RuntimeError: if init_stt() was not called before transcribe()
    """
    global _cpp_backend

    if _cpp_backend is not None:
        try:
            return _cpp_backend.transcribe(audio)
        except RuntimeError as exc:
            from jarvis_desktop import ui as _ui
            _ui.get_console().print(
                f"[STT] whisper.cpp incompatível com este sistema — {exc}\n"
                "[STT] Ativando faster-whisper como fallback permanente."
            )
            _cpp_backend = None
            with _lock:
                if _model is None:
                    _activate_faster_whisper_fallback()

    if _model is None:
        raise RuntimeError("[STT] Modelo não carregado. Chame init_stt() antes de transcrever.")

    segments, _info = _model.transcribe(audio)
    return "".join(seg.text for seg in segments).strip()


def reload_model(new_size: str) -> None:
    """Reload Whisper model with a different size (runtime switch from config menu).

    Thread-safe: acquires _lock before replacing _model. If whisper.cpp backend
    is active, reloads on that backend instead.

    Args:
        new_size: one of "tiny", "base", "small", "medium", "large-v3-turbo"

    Raises:
        RuntimeError: if WhisperModel fails to load (e.g. download error, invalid size)
    """
    global _model, _cpp_backend

    from jarvis_desktop import ui
    console = ui.get_console()

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
