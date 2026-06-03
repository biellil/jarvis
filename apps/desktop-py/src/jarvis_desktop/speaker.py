"""JARVIS Speaker Recognition module (Phase 89).

Public API:
  identify_speaker(audio, config) -> dict  — Identifica speaker a partir de NumPy 16kHz
  enroll_speaker(name, config, n=5) -> None — Grava N utterances e salva embedding médio
  save_profile / load_profile / list_profiles / delete_profile — ProfileStore CRUD
  _get_encoder() -> VoiceEncoder            — Singleton accessor (threading.Lock)
  _cosine_similarity(a, b) -> float         — Cosine similarity entre embeddings L2-normed

Decisions honored:
  D-01: Multi-user — ProfileStore gerencia N perfis em ~/.jarvis/speakers/
  D-02: Cada perfil = arquivo .npy (shape (256,) float32 L2-normed)
  D-03: resemblyzer GE2E d-vector
  D-04: Cosine similarity para comparação
  D-05: Threshold default 0.75 (lido de config.speaker_threshold)
  D-13: 5 utterances de ~4s para enrollment
  D-14: encoder.embed_speaker() retorna média dos embeddings
  Pitfall 1 (89-RESEARCH): webrtcvad-wheels antes de resemblyzer
  Pitfall 3 (89-RESEARCH): Singleton com threading.Lock
  T-89-01-01: _safe_profile_name sanitiza contra path traversal
"""
from __future__ import annotations

import re
import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

import numpy as np

if TYPE_CHECKING:
    from resemblyzer import VoiceEncoder
    from jarvis_desktop.config import JarvisConfig

# -------------------------------------------------------------------------
# Module-level singleton state (padrão idêntico a stt.py:40-43)
# -------------------------------------------------------------------------

_encoder: Optional["VoiceEncoder"] = None
_encoder_lock = threading.Lock()

_SAMPLE_RATE: int = 16000
_EMBEDDING_DIM: int = 256
_MIN_UTTERANCE_SAMPLES: int = 16000 * 2  # 2s minimum (Pitfall 5: <2s = embedding ruim)
_DEFAULT_N_UTTERANCES: int = 5            # D-13
_MAX_RETRIES_PER_SLOT: int = 3            # T-89-01-02 (anti-DoS)
_NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")


# -------------------------------------------------------------------------
# Exceptions
# -------------------------------------------------------------------------

class EnrollmentAborted(RuntimeError):
    """Enrollment cancelado por falha de captura após retries (WR-04).

    Levantada por enroll_speaker quando uma amostra não pode ser capturada
    após _MAX_RETRIES_PER_SLOT tentativas. Permite ao caller distinguir
    abort silencioso (return None) de falha real (exceção).
    """


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------

def _console():
    """Lazy console — evita import circular com ui module."""
    from jarvis_desktop import ui
    return ui.get_console()


def _speakers_dir() -> Path:
    """Diretório de perfis. Computado dinâmico para honrar tmp_home em testes."""
    return Path.home() / ".jarvis" / "speakers"


def _safe_profile_name(name: str) -> str:
    """Sanitiza nome de perfil — mitigation T-89-01-01 (path traversal).

    Regras:
      - Strip whitespace
      - Replace espaços por '_'
      - Rejeitar se contém '/', '\\', '..', ou começa com '.'
      - Regex: ^[A-Za-z0-9_\\-]{1,64}$ (apenas ASCII safe)

    Raises:
        ValueError se nome inválido.
    """
    if not isinstance(name, str):
        raise ValueError(f"Nome do perfil deve ser str, recebeu {type(name).__name__}")
    cleaned = name.strip().replace(" ", "_")
    if not cleaned:
        raise ValueError("Nome do perfil não pode ser vazio")
    if ".." in cleaned or "/" in cleaned or "\\" in cleaned or cleaned.startswith("."):
        raise ValueError(f"Nome de perfil inválido (path traversal): {name!r}")
    if not _NAME_RE.match(cleaned):
        raise ValueError(
            f"Nome de perfil inválido: {name!r}. "
            f"Use apenas A-Z, a-z, 0-9, _ ou - (até 64 caracteres)."
        )
    return cleaned


_SPEAKER_PKGS = ["webrtcvad-wheels==2.0.14", "resemblyzer==0.1.4"]


def _ensure_speaker_deps() -> None:
    """Instala resemblyzer + webrtcvad-wheels automaticamente se não estiverem presentes."""
    try:
        import resemblyzer  # noqa: F401
        return
    except ImportError:
        pass
    import shutil
    import subprocess
    import sys as _sys
    _console().print("[SPK] resemblyzer não instalado — instalando automaticamente (pode levar ~30s)...")
    # pyproject.toml tem override webrtcvad->webrtcvad-wheels; usar uv sync
    # para que o override seja aplicado. cwd = apps/desktop-py/
    _project_dir = str(Path(__file__).parent.parent.parent)
    uv = shutil.which("uv")
    cmd = (
        [uv, "sync", "--extra", "speaker"]
        if uv
        else [_sys.executable, "-m", "pip", "install", *_SPEAKER_PKGS]
    )
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=_project_dir)
    if result.returncode != 0:
        raise RuntimeError(
            f"[SPK] Falha ao instalar dependências de speaker recognition:\n{result.stderr}"
        )
    _console().print("[SPK] Dependências instaladas.")


def _get_encoder() -> "VoiceEncoder":
    """Singleton VoiceEncoder com threading.Lock (Pattern 1 / Pitfall 3 do RESEARCH)."""
    global _encoder
    with _encoder_lock:
        if _encoder is None:
            _ensure_speaker_deps()
            from resemblyzer import VoiceEncoder
            _console().print("[SPK] Carregando modelo de voz (resemblyzer GE2E ~30MB)...")
            _encoder = VoiceEncoder()
            _console().print("[SPK] Pronto.")
    return _encoder


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity com guard para vetor zero (Pattern 3 do RESEARCH)."""
    norm_a = float(np.linalg.norm(a))
    norm_b = float(np.linalg.norm(b))
    if norm_a < 1e-8 or norm_b < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# -------------------------------------------------------------------------
# ProfileStore CRUD (D-01, D-02; SPK-04)
# -------------------------------------------------------------------------

def save_profile(name: str, embedding: np.ndarray) -> None:
    """Salva embedding como .npy atomicamente (WR-01 — tempfile + os.replace).

    T-89-01-01 sanitiza name. T-90-01-01 garante save atômico:
    se o processo crashar durante a escrita, o perfil final NÃO é corrompido.
    """
    import os
    import tempfile

    safe = _safe_profile_name(name)
    dir_ = _speakers_dir()
    dir_.mkdir(parents=True, exist_ok=True)
    final_path = dir_ / f"{safe}.npy"
    fd, tmp_path = tempfile.mkstemp(dir=str(dir_), suffix=".npy.tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            np.save(f, embedding.astype(np.float32))
        os.replace(tmp_path, final_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def load_profile(name: str) -> np.ndarray:
    """Carrega embedding de ~/.jarvis/speakers/{name}.npy.

    WR-02 (T-90-01-02): allow_pickle=False explícito previne arbitrary code execution
    via pickle embedded em .npy malicioso. Defesa em profundidade — default do NumPy
    desde 1.16.3 é False, mas explicitar protege contra monkey-patching.
    """
    safe = _safe_profile_name(name)
    path = _speakers_dir() / f"{safe}.npy"
    return np.load(str(path), allow_pickle=False)


def list_profiles() -> list[str]:
    """Lista nomes de perfis válidos (WR-06 — filtra via _safe_profile_name).

    Mitigation T-90-01-04 (Information Disclosure): perfis plantados fora-de-banda
    com nomes inválidos (`evil..name.npy`) NÃO vazam para a UI. Filtra
    silenciosamente — apenas nomes cuja sanitização == stem original são expostos.
    """
    dir_ = _speakers_dir()
    if not dir_.exists():
        return []
    result: list[str] = []
    for p in dir_.glob("*.npy"):
        try:
            safe = _safe_profile_name(p.stem)
            if safe == p.stem:
                result.append(safe)
        except ValueError:
            continue
    return sorted(result)


def delete_profile(name: str) -> bool:
    """Remove perfil. Retorna True se removeu, False se não existia."""
    safe = _safe_profile_name(name)
    path = _speakers_dir() / f"{safe}.npy"
    if path.exists():
        path.unlink()
        return True
    return False


def load_all_profiles() -> dict[str, np.ndarray]:
    """Carrega todos os perfis em dict {name: embedding}."""
    return {name: load_profile(name) for name in list_profiles()}


# -------------------------------------------------------------------------
# Identification (D-04, D-05, D-08; SPK-01, SPK-02, SPK-03, SPK-05, SPK-06)
# -------------------------------------------------------------------------

def identify_speaker(audio: np.ndarray, config: "JarvisConfig") -> dict[str, Any]:
    """Identifica speaker a partir de áudio NumPy 16kHz (D-06).

    Pipeline:
      1. preprocess_wav(audio, source_sr=16000) — normaliza volume, remove silêncio
      2. encoder.embed_utterance(processed) → embedding (256,) L2-normed
      3. cosine_similarity contra cada perfil salvo
      4. Aplica threshold (config.speaker_threshold, default 0.75)

    Returns:
        dict com keys exatas:
          name (str)            — candidate_name se is_known else "unknown"
          confidence (float)    — melhor cosine score
          is_known (bool)       — best_score >= threshold
          candidate_name (str)  — melhor match independente do threshold (usado
                                   pelo hybrid injection no Plan 03 para distinguir
                                   "[Biel?]:" (baixa confiança) de "[unknown]:" (zero match))
        Sem perfis → {"name":"unknown","confidence":0.0,"is_known":False,"candidate_name":"unknown"}
    """
    _ensure_speaker_deps()
    from resemblyzer import preprocess_wav

    encoder = _get_encoder()
    processed = preprocess_wav(audio, source_sr=_SAMPLE_RATE)
    turn_emb = encoder.embed_utterance(processed)

    # WR-03 (T-90-01-03 DoS): itera perfis com defesa por perfil. Um .npy
    # corrompido NÃO derruba o pipeline; é logado e ignorado.
    best_name = "unknown"
    best_score = 0.0
    has_any = False
    for name in list_profiles():
        try:
            profile_emb = load_profile(name)
        except (ValueError, EOFError, OSError) as exc:
            _console().print(f"[SPK] perfil '{name}' corrompido — ignorando ({exc})")
            continue
        has_any = True
        score = _cosine_similarity(turn_emb, profile_emb)
        if score > best_score:
            best_score = score
            best_name = name

    if not has_any:
        return {
            "name": "unknown",
            "confidence": 0.0,
            "is_known": False,
            "candidate_name": "unknown",
        }

    threshold = float(getattr(config, "speaker_threshold", 0.75))
    is_known = best_score >= threshold

    return {
        "name": best_name if is_known else "unknown",
        "confidence": best_score,
        "is_known": is_known,
        "candidate_name": best_name,
    }


# -------------------------------------------------------------------------
# Enrollment (D-12, D-13, D-14; SPK-10)
# -------------------------------------------------------------------------

def enroll_speaker(
    name: str,
    config: "JarvisConfig",
    n_utterances: int = _DEFAULT_N_UTTERANCES,
) -> None:
    """Grava N utterances via microfone, calcula embedding médio, salva perfil.

    D-13: N=5 default. D-14: usa encoder.embed_speaker() (média interna).
    T-89-01-02: máx 3 retries por slot evita loop infinito em mic ruim.
    """
    _ensure_speaker_deps()
    from resemblyzer import preprocess_wav
    from jarvis_desktop import stt

    safe = _safe_profile_name(name)  # falha early se nome inválido (T-89-01-01)
    encoder = _get_encoder()

    console = _console()
    console.print(f"[SPK] Iniciando enrollment de '{safe}' — {n_utterances} amostras.")
    console.print("[SPK] Fale naturalmente por ~4s após cada prompt 'Gravando...'.")

    processed_wavs: list[np.ndarray] = []
    slot = 1
    while slot <= n_utterances:
        retries = 0
        captured = None
        while retries < _MAX_RETRIES_PER_SLOT:
            console.print(f"[SPK] Gravando {slot}/{n_utterances}... (fale agora)")
            audio = stt.record_until_silence(
                threshold_ms=getattr(config, "silence_threshold_ms", 500),
            )
            if len(audio) >= _MIN_UTTERANCE_SAMPLES:
                captured = audio
                break
            console.print(
                f"[SPK] Áudio muito curto ({len(audio) / _SAMPLE_RATE:.1f}s < 2s) — repita."
            )
            retries += 1
        if captured is None:
            console.print(
                f"[SPK] Falha ao gravar amostra {slot} após {_MAX_RETRIES_PER_SLOT} tentativas. Abortando."
            )
            raise EnrollmentAborted(
                f"Falha ao gravar amostra {slot} após {_MAX_RETRIES_PER_SLOT} tentativas"
            )

        processed_wavs.append(preprocess_wav(captured, source_sr=_SAMPLE_RATE))
        slot += 1

    # D-14: embed_speaker recebe lista de wavs processados, retorna média
    mean_embedding = encoder.embed_speaker(processed_wavs)
    save_profile(safe, mean_embedding)
    console.print(f"[SPK] Perfil '{safe}' salvo em ~/.jarvis/speakers/{safe}.npy")
