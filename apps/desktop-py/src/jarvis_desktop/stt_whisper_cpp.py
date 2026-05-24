"""JARVIS STT backend: whisper.cpp via subprocess (Vulkan-capable).

Public API (matches faster-whisper backend contract):
  WhisperCppBackend.load(model_size, binary_path) -> bool
  WhisperCppBackend.transcribe(audio: np.ndarray) -> str

Internal helpers (module-level, testable):
  _write_wav(audio, path, rate=16000)
  _run_whisper(wav_path, binary, model_path) -> str
  _find_binary(config_path: str) -> str | None
  _model_path(model_size: str) -> Path
"""
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Optional

import numpy as np


_SAMPLE_RATE = 16000
# Flags: pt language, no timestamps, no timestamp tokens
_WHISPER_FLAGS = ["-l", "pt", "--no-timestamps", "-nt"]
# Model size -> GGML filename mapping
_GGML_NAMES = {
    "tiny": "ggml-tiny.bin",
    "base": "ggml-base.bin",
    "small": "ggml-small.bin",
    "medium": "ggml-medium.bin",
    "large-v3-turbo": "ggml-large-v3-turbo-q5_0.bin",
}


class WhisperCppBackend:
    """whisper.cpp subprocess backend. One instance per STT session."""

    def __init__(self) -> None:
        self._binary: Optional[str] = None
        self._model_path_str: Optional[str] = None

    def load(self, model_size: str, binary_path: str = "") -> bool:
        """Locate binary and model. Returns True on success, False if either is missing.

        On failure prints actionable download instructions via print() (ui may not be
        initialized yet at startup) and returns False so caller can fall back.

        Args:
            model_size: key in _GGML_NAMES (e.g. "large-v3-turbo")
            binary_path: from config.whisper_cpp_binary (empty = auto-find)
        """
        binary = _find_binary(binary_path)
        if binary is None:
            _print_missing_binary_instructions()
            return False

        model = _model_path(model_size)
        if not model.exists():
            _print_missing_model_instructions(model_size, model)
            return False

        self._binary = binary
        self._model_path_str = str(model)
        return True

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcribe float32 16kHz mono array via whisper-cli.exe subprocess.

        Writes temp WAV, runs whisper-cli.exe, parses stdout. Temp file is
        always deleted even on subprocess crash (try/finally).

        Args:
            audio: float32 NumPy array at 16 kHz, shape (N,)

        Returns:
            Transcribed text stripped of whitespace, or "" if no speech.

        Raises:
            RuntimeError: if load() was not called successfully.
        """
        if self._binary is None or self._model_path_str is None:
            raise RuntimeError("[STT] WhisperCppBackend.load() nao foi chamado ou falhou.")

        tmp_path: Optional[str] = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                tmp_path = f.name
            _write_wav(audio, tmp_path)
            return _run_whisper(tmp_path, self._binary, self._model_path_str)
        finally:
            if tmp_path is not None:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _write_wav(audio: np.ndarray, path: str, rate: int = _SAMPLE_RATE) -> None:
    """Write float32 numpy array as 16-bit PCM WAV using stdlib wave module.

    No external dependencies — avoids scipy import.
    """
    pcm = (audio * 32767).astype("int16")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm.tobytes())


def _run_whisper(wav_path: str, binary: str, model_path: str) -> str:
    """Run whisper-cli.exe and return transcribed text from stdout.

    Uses -nt (no timestamps) so stdout is clean text lines.
    Stderr captured separately and discarded (progress/info lines from whisper.cpp).
    timeout=120 guards against hung processes on long audio.
    """
    cmd = [binary, "-m", model_path, "-f", wav_path] + _WHISPER_FLAGS
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
        encoding="utf-8",
        errors="replace",
    )
    # Filter residual diagnostic lines that may leak to stdout
    lines = [
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip()
        and not line.startswith("[")
        and not line.startswith("whisper_")
        and not line.startswith("ggml_")
    ]
    return " ".join(lines).strip()


def _find_binary(config_path: str) -> Optional[str]:
    """Resolve whisper-cli.exe path.

    Discovery chain (in order):
    1. config.whisper_cpp_binary if non-empty and file exists
    2. ~/.jarvis/bin/whisper-cli.exe
    3. whisper-cli (or whisper-cli.exe) on PATH via shutil.which
    """
    import shutil

    if config_path:
        p = Path(config_path)
        if p.is_file():
            return str(p)

    jarvis_bin = Path.home() / ".jarvis" / "bin" / "whisper-cli.exe"
    if jarvis_bin.is_file():
        return str(jarvis_bin)

    which = shutil.which("whisper-cli") or shutil.which("whisper-cli.exe")
    if which:
        return which

    return None


def _model_path(model_size: str) -> Path:
    """Return expected path for a GGML model file under ~/.jarvis/models/."""
    filename = _GGML_NAMES.get(model_size, f"ggml-{model_size}.bin")
    return Path.home() / ".jarvis" / "models" / filename


def _print_missing_binary_instructions() -> None:
    print("[STT] Backend whisper.cpp selecionado mas binario nao encontrado.")
    print("[STT] Baixe em: https://github.com/ggerganov/whisper.cpp/releases")
    print("[STT] Extraia whisper-cli.exe em: ~/.jarvis/bin/")
    print("[STT] Modelo: baixe ggml-large-v3-turbo-q5_0.bin em: https://huggingface.co/ggerganov/whisper.cpp")
    print("[STT] Coloque em: ~/.jarvis/models/")
    print("[STT] Usando faster-whisper como fallback.")


def _print_missing_model_instructions(model_size: str, model_path: Path) -> None:
    filename = model_path.name
    print(f"[STT] Modelo whisper.cpp nao encontrado: {model_path}")
    print(f"[STT] Baixe {filename} em: https://huggingface.co/ggerganov/whisper.cpp")
    print(f"[STT] Coloque em: {model_path.parent}/")
    print("[STT] Usando faster-whisper como fallback.")
