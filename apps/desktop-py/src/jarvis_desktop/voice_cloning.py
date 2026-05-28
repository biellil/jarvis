"""JARVIS Voice Cloning module.

Phase 85: Speaker embedding extraction via KokoClone ECAPA-TDNN encoder.
Extracted embeddings are saved as .pt files and loaded by tts.py for
custom voice synthesis with Kokoro (D-04).

Public API:
  validate_reference_audio(audio_path, min_duration_sec) -> bool
  extract_speaker_embedding(reference_audio_path, device) -> torch.Tensor
  save_cloned_voice(embedding, name) -> str
  load_cloned_voice(config) -> Optional[torch.Tensor]
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig

# Voices directory (D-03: single active cloned voice)
VOICES_DIR = Path.home() / ".jarvis" / "voices"
CLONED_VOICE_FILE = VOICES_DIR / "cloned_voice.pt"


def _console():
    """Lazy accessor for ui console — avoids circular import at module level."""
    from jarvis_desktop import ui
    return ui.get_console()


def validate_reference_audio(audio_path: str, min_duration_sec: float = 3.0) -> bool:
    """Check if reference audio meets minimum duration for quality embedding.

    Args:
        audio_path: Path to .wav, .mp3, .m4a, .ogg, etc.
        min_duration_sec: Minimum duration in seconds (default 3.0)

    Returns:
        True if duration >= min_duration_sec, False with warning if too short.
    """
    import librosa  # Lazy import — heavy dep, only needed during cloning
    duration = librosa.get_duration(path=audio_path)
    if duration < min_duration_sec:
        _console().print(
            f"[VOICE] Aviso: audio tem {duration:.1f}s; recomendado >={min_duration_sec:.0f}s para boa qualidade."
        )
        return False
    return True


def extract_speaker_embedding(
    reference_audio_path: str,
    device: str = "cpu",
) -> "torch.Tensor":
    """Extract speaker embedding from reference audio using ECAPA-TDNN encoder.

    Resamples audio to 16 kHz (ECAPA-TDNN requirement) via librosa.
    Uses KokoClone SpeakerEncoder to extract 512-dim float32 embedding.

    Args:
        reference_audio_path: Path to .wav, .mp3, etc.
        device: "cpu" or "cuda" (default "cpu" per JARVIS privacy-first)

    Returns:
        torch.Tensor: 512-dim speaker embedding compatible with Kokoro voice parameter

    Raises:
        FileNotFoundError: if reference audio file does not exist
        RuntimeError: if encoder fails (bad audio, missing model weights, etc.)
    """
    import librosa
    import torch
    from kokoclone.core.encoder import SpeakerEncoder  # Lazy import — optional dep

    if not Path(reference_audio_path).exists():
        raise FileNotFoundError(f"[VOICE] Arquivo de referência não encontrado: {reference_audio_path}")

    _console().print(f"[VOICE] Carregando áudio: {reference_audio_path}")
    # Explicit 16 kHz resample — ECAPA-TDNN requirement (Pitfall 4)
    audio, _sr = librosa.load(reference_audio_path, sr=16000, mono=True)

    _console().print("[VOICE] Extraindo embedding de voz (ECAPA-TDNN)...")
    encoder = SpeakerEncoder(device=device)
    embedding_np = encoder.embed_utterance(audio)  # Returns numpy array

    return torch.from_numpy(embedding_np).to(device)


def save_cloned_voice(embedding: "torch.Tensor", name: str = "cloned_voice.pt") -> str:
    """Save speaker embedding tensor to ~/.jarvis/voices/.

    Overwrites previous cloned voice if name matches (D-03: single active voice).

    Args:
        embedding: torch.Tensor speaker embedding from extract_speaker_embedding()
        name: Filename (default: cloned_voice.pt)

    Returns:
        str: Absolute path to saved .pt file
    """
    import torch
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    path = VOICES_DIR / name
    torch.save(embedding, str(path))
    _console().print(f"[VOICE] Perfil de voz salvo: {path}")
    return str(path)


def load_cloned_voice(config: "JarvisConfig") -> Optional["torch.Tensor"]:
    """Load cloned voice embedding from config.cloned_voice_path.

    D-04: Returns None (silent fallback) if:
      - cloned_voice_path is empty string
      - File does not exist (deleted/moved)
      - Any torch.load() error

    Args:
        config: JarvisConfig with cloned_voice_path field

    Returns:
        torch.Tensor: Speaker embedding, or None if unavailable
    """
    import torch
    if not config.cloned_voice_path:
        return None
    path = Path(config.cloned_voice_path)
    if not path.exists():
        return None
    try:
        # weights_only=False required: ECAPA-TDNN embeddings use custom pickle ops (Pitfall 5)
        return torch.load(str(path), weights_only=False)
    except Exception as exc:
        _console().print(f"[VOICE] Erro ao carregar voz clonada: {exc} — usando voz padrão.")
        return None
