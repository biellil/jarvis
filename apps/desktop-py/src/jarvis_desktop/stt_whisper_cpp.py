"""JARVIS STT backend: whisper.cpp via subprocess (Vulkan-capable).

Public API (matches faster-whisper backend contract):
  WhisperCppBackend.load(model_size, binary_path) -> bool
  WhisperCppBackend.transcribe(audio: np.ndarray) -> str

Internal helpers (module-level, testable):
  _write_wav(audio, path, rate=16000)
  _run_whisper(wav_path, binary, model_path) -> str
  _find_binary(config_path: str) -> str | None
  _model_path(model_size: str) -> Path
  _download_binary() -> str | None
  _download_model(model_size: str) -> bool
"""
import io
import json
import os
import subprocess
import tempfile
import urllib.request
import wave
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np


_SAMPLE_RATE = 16000
# Flags: pt language, no timestamps, no timestamp tokens (default; overridden by set_language())
_WHISPER_FLAGS = ["-l", "pt", "--no-timestamps", "-nt"]
# Written when the binary crashes at transcription time (GPU incompatibility)
# Presence signals load() to skip official releases and try community builds
_CRASH_MARKER = Path.home() / ".jarvis" / "bin" / ".whisper_cpp_crashed"
# Model size -> GGML filename mapping
_GGML_NAMES = {
    "tiny": "ggml-tiny.bin",
    "base": "ggml-base.bin",
    "small": "ggml-small.bin",
    "medium": "ggml-medium.bin",
    "large-v3-turbo": "ggml-large-v3-turbo-q5_0.bin",
}
# HuggingFace base URL for GGML models
_HF_MODEL_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
# GitHub API for latest whisper.cpp release (official + community fallbacks)
_GH_RELEASE_API = "https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest"
# Community repos that ship pre-built Vulkan Windows binaries (tried in order)
_GH_COMMUNITY_VULKAN_REPOS = [
    "jerryshell/whisper.cpp-windows-vulkan-bin",
    "DomoticX/whisper.cpp-windows-vulkan",
]


def set_language(language: str) -> None:
    """Set transcription language for whisper.cpp flags (ISO 639-1, e.g. 'pt', 'en').

    Updates _WHISPER_FLAGS in-place so all subsequent transcribe() calls use the new language.
    Called by stt.init_stt() after reading config.stt_language.
    """
    global _WHISPER_FLAGS
    _WHISPER_FLAGS = ["-l", language, "--no-timestamps", "-nt"]


class WhisperCppBackend:
    """whisper.cpp subprocess backend. One instance per STT session."""

    def __init__(self) -> None:
        self._binary: Optional[str] = None
        self._model_path_str: Optional[str] = None

    def load(self, model_size: str, binary_path: str = "") -> bool:
        """Locate (or auto-download) binary and model. Returns True on success.

        Auto-download flow (normal):
          1. Look for existing binary via _find_binary()
          2. If missing: attempt _download_binary() from GitHub releases
          3. Look for model via _model_path()
          4. If missing: attempt _download_model() from HuggingFace
          5. Return True only if both exist after all attempts

        Crash-retry flow (when _CRASH_MARKER exists):
          Previous binary failed at transcription time (GPU crash). Skip official
          releases and go straight to community repos which may use different
          compiler flags / Vulkan SDK versions.

        Args:
            model_size: key in _GGML_NAMES (e.g. "large-v3-turbo")
            binary_path: from config.whisper_cpp_binary (empty = auto-find)
        """
        dest = Path.home() / ".jarvis" / "bin" / "whisper-cli.exe"

        if _CRASH_MARKER.exists():
            print("[STT] Binário anterior falhou na GPU — tentando build da comunidade...")
            binary = _download_binary_from_community(dest)
            if binary is None:
                print("[STT] Nenhum build da comunidade disponível — usando faster-whisper.")
                return False
            # Community binary obtained; clear marker so it gets a fair chance
            try:
                _CRASH_MARKER.unlink()
            except OSError:
                pass
        else:
            binary = _find_binary(binary_path)
            if binary is None:
                print("[STT] whisper-cli.exe não encontrado — baixando automaticamente...")
                binary = _download_binary()
                if binary is None:
                    print("[STT] Falha ao obter binário whisper.cpp — usando faster-whisper como fallback.")
                    return False

        model = _model_path(model_size)
        if not model.exists():
            print(f"[STT] Modelo {model.name} não encontrado — baixando automaticamente...")
            ok = _download_model(model_size)
            if not ok:
                print("[STT] Falha ao baixar modelo — usando faster-whisper como fallback.")
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
    """Write float32 numpy array as 16-bit PCM WAV using stdlib wave module."""
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

    GGML_VK_VISIBLE_DEVICES=0 restricts Vulkan to the first (discrete) GPU only.
    This prevents access violation crashes (0xC0000005) on systems with both a
    discrete and integrated AMD GPU — ggml crashes enumerating the integrated device.
    """
    import os as _os
    env = _os.environ.copy()
    # Restrict to discrete GPU only (avoids crash enumerating integrated AMD GPU)
    env["GGML_VK_VISIBLE_DEVICES"] = "0"
    # Disable KHR_coopmat — RDNA3 supports it but some whisper.cpp builds crash
    # during shader compilation/model init when this extension is active
    env["GGML_VK_DISABLE_COOPMAT"] = "1"
    env["GGML_VK_DISABLE_COOPMAT2"] = "1"
    cmd = [binary, "-m", model_path, "-f", wav_path] + _WHISPER_FLAGS
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if result.returncode != 0:
        stderr_snippet = result.stderr[:300].strip() if result.stderr else "(sem stderr)"
        raise RuntimeError(f"whisper-cli.exe saiu com código {result.returncode}: {stderr_snippet}")

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

    Discovery chain:
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


def _download_with_progress(url: str, dest: Path) -> None:
    """Download URL to dest with a simple progress indicator.

    Uses urllib (stdlib). Shows MB downloaded every 5% or 10 MB.
    Creates parent directories automatically.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "jarvis-stt/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        total = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        last_pct = -1
        chunk_size = 1024 * 256  # 256 KB chunks
        with open(dest, "wb") as f:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    pct = int(downloaded / total * 100)
                    if pct >= last_pct + 5:
                        mb = downloaded / (1024 * 1024)
                        total_mb = total / (1024 * 1024)
                        print(f"[STT] {pct}%  {mb:.1f}/{total_mb:.1f} MB", flush=True)
                        last_pct = pct
                else:
                    mb = downloaded / (1024 * 1024)
                    if mb - (last_pct * 10) >= 10:
                        print(f"[STT] {mb:.1f} MB baixados...", flush=True)
                        last_pct = int(mb // 10)


def _download_binary() -> Optional[str]:
    """Download whisper-cli.exe with Vulkan from latest GitHub release.

    Queries GitHub API for the latest release, looks for a Windows Vulkan asset.
    Downloads zip, extracts whisper-cli.exe to ~/.jarvis/bin/.
    Returns path to binary on success, None on failure.
    """
    dest_dir = Path.home() / ".jarvis" / "bin"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "whisper-cli.exe"

    # Query GitHub releases API
    print("[STT] Consultando GitHub releases de whisper.cpp...", flush=True)
    try:
        req = urllib.request.Request(_GH_RELEASE_API, headers={"User-Agent": "jarvis-stt/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            release = json.loads(r.read())
    except Exception as e:
        print(f"[STT] Falha ao consultar GitHub API: {e}")
        return None

    release_tag = release.get("tag_name", "?")
    print(f"[STT] Release mais recente: {release_tag}")

    # Find Vulkan Windows asset
    asset_url = None
    asset_name = None
    for asset in release.get("assets", []):
        name = asset["name"].lower()
        if "vulkan" in name and ("win" in name or "windows" in name):
            asset_url = asset["browser_download_url"]
            asset_name = asset["name"]
            break

    if not asset_url:
        print("[STT] Binário Vulkan não encontrado no release oficial — tentando repos da comunidade...")
        result = _download_binary_from_community(dest)
        return result

    # Download zip
    zip_path = dest_dir / asset_name
    print(f"[STT] Baixando {asset_name}...", flush=True)
    try:
        _download_with_progress(asset_url, zip_path)
    except Exception as e:
        print(f"[STT] Falha no download: {e}")
        if zip_path.exists():
            zip_path.unlink()
        return None

    # Extract all files flat to dest_dir (DLLs must live alongside whisper-cli.exe)
    print("[STT] Extraindo arquivos...", flush=True)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            candidates = [
                n for n in zf.namelist()
                if n.lower().endswith("whisper-cli.exe") or n.lower().endswith("main.exe")
            ]
            if not candidates:
                print(f"[STT] whisper-cli.exe não encontrado dentro de {asset_name}.")
                print(f"[STT] Arquivos no zip: {', '.join(zf.namelist()[:10])}")
                return None
            # Extract exe + DLLs flat (strip directory prefix so all land in dest_dir)
            for member in zf.namelist():
                name = Path(member).name
                if not name or name.endswith("/"):
                    continue  # skip directory entries
                if name.lower().endswith((".exe", ".dll")):
                    with zf.open(member) as src:
                        (dest_dir / name).write_bytes(src.read())
            # Rename main.exe → whisper-cli.exe if needed
            chosen_name = Path(next((c for c in candidates if "whisper-cli" in c.lower()), candidates[0])).name
            if chosen_name != "whisper-cli.exe" and (dest_dir / chosen_name).exists():
                (dest_dir / chosen_name).rename(dest)
    except Exception as e:
        print(f"[STT] Falha ao extrair: {e}")
        return None
    finally:
        try:
            zip_path.unlink()
        except OSError:
            pass

    if dest.exists():
        print(f"[STT] Binário instalado em: {dest}", flush=True)
        return str(dest)
    return None


def _download_binary_from_community(dest: Path) -> Optional[str]:
    """Try community GitHub repos for a pre-built Vulkan Windows whisper-cli.exe.

    Tries each repo in _GH_COMMUNITY_VULKAN_REPOS, queries latest release,
    looks for a zip/exe asset, downloads and extracts whisper-cli.exe.
    Returns path to binary on first success, None if all fail.
    """
    dest_dir = dest.parent
    for repo in _GH_COMMUNITY_VULKAN_REPOS:
        api = f"https://api.github.com/repos/{repo}/releases/latest"
        print(f"[STT] Tentando {repo}...", flush=True)
        try:
            req = urllib.request.Request(api, headers={"User-Agent": "jarvis-stt/1.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                release = json.loads(r.read())
        except Exception as e:
            print(f"[STT]   Falha ao consultar {repo}: {e}")
            continue

        # Find any zip or exe asset (community repos vary in naming)
        asset_url = None
        asset_name = None
        for asset in release.get("assets", []):
            n = asset["name"].lower()
            if n.endswith(".zip") or n.endswith(".exe"):
                asset_url = asset["browser_download_url"]
                asset_name = asset["name"]
                break

        if not asset_url:
            print(f"[STT]   Sem assets utilizáveis em {repo}")
            continue

        # Download
        tmp = dest_dir / asset_name
        print(f"[STT] Baixando {asset_name}...", flush=True)
        try:
            _download_with_progress(asset_url, tmp)
        except Exception as e:
            print(f"[STT]   Falha no download: {e}")
            if tmp.exists():
                tmp.unlink()
            continue

        # If it's a zip, extract; if it's an exe, use directly
        try:
            if asset_name.lower().endswith(".zip"):
                with zipfile.ZipFile(tmp) as zf:
                    candidates = [
                        n for n in zf.namelist()
                        if n.lower().endswith("whisper-cli.exe") or n.lower().endswith("main.exe")
                    ]
                    if not candidates:
                        print(f"[STT]   whisper-cli.exe não encontrado em {asset_name}")
                        continue
                    # Extract exe + DLLs flat so DLLs ficam ao lado do exe
                    for member in zf.namelist():
                        name = Path(member).name
                        if not name or name.endswith("/"):
                            continue
                        if name.lower().endswith((".exe", ".dll")):
                            with zf.open(member) as src:
                                (dest_dir / name).write_bytes(src.read())
                    chosen_name = Path(next((c for c in candidates if "whisper-cli" in c.lower()), candidates[0])).name
                    if chosen_name != "whisper-cli.exe" and (dest_dir / chosen_name).exists():
                        (dest_dir / chosen_name).rename(dest)
                tmp.unlink()
            else:
                # Direct exe
                tmp.rename(dest)
        except Exception as e:
            print(f"[STT]   Falha ao extrair: {e}")
            if tmp.exists():
                tmp.unlink()
            continue

        if dest.exists():
            print(f"[STT] Binário instalado de {repo}: {dest}", flush=True)
            return str(dest)

    print("[STT] Nenhum repo da comunidade retornou um binário válido.")
    print(f"[STT] Baixe manualmente de: https://github.com/ggerganov/whisper.cpp/releases")
    print(f"[STT] Extraia whisper-cli.exe em: {dest_dir}")
    return None


def mark_binary_crashed() -> None:
    """Write crash marker so the next load() skips official releases and tries community builds."""
    _CRASH_MARKER.parent.mkdir(parents=True, exist_ok=True)
    _CRASH_MARKER.touch()


def _download_model(model_size: str) -> bool:
    """Download GGML model from HuggingFace to ~/.jarvis/models/.

    Returns True on success, False on failure (cleans up partial file).
    """
    filename = _GGML_NAMES.get(model_size, f"ggml-{model_size}.bin")
    url = f"{_HF_MODEL_BASE}/{filename}"
    dest = _model_path(model_size)
    dest.parent.mkdir(parents=True, exist_ok=True)

    print(f"[STT] Baixando modelo {filename} de HuggingFace...", flush=True)
    try:
        _download_with_progress(url, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"[STT] Modelo baixado: {dest} ({size_mb:.0f} MB)", flush=True)
        return True
    except Exception as e:
        print(f"[STT] Falha ao baixar modelo: {e}")
        if dest.exists():
            dest.unlink()
        return False
