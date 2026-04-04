"""Voice transcription — offline STT via faster-whisper.

Per CONV-02: Transcribes audio files to text using WhisperModel.
Per ARCH-02: transcribe() uses asyncio.to_thread() to avoid blocking the event loop.
Per D-05/D-06: Model size and language are configurable via Settings.

CRITICAL (Research Pitfall 1): The segments generator from model.transcribe() is
consumed INSIDE _transcribe_sync() before returning. Never return a generator
across thread boundaries.
"""

import asyncio
from pathlib import Path
from typing import Optional

from faster_whisper import WhisperModel
from loguru import logger


class WhisperTranscriber:
    """Wraps WhisperModel with lazy loading and async-safe transcription."""

    def __init__(self, model_size: str = "base", language: str = "pt") -> None:
        self._model_size = model_size
        self._language = language
        self._model: Optional[WhisperModel] = None

    def _load_model(self) -> WhisperModel:
        """Load WhisperModel on first use (lazy). Runs inside thread."""
        if self._model is None:
            logger.info(f"Carregando modelo Whisper '{self._model_size}'...")
            self._model = WhisperModel(
                self._model_size,
                device="auto",
                compute_type="default",
            )
        return self._model

    def _transcribe_sync(self, audio_path: str) -> str:
        """Synchronous transcription. MUST run inside a thread, not the event loop.

        Fully consumes the segments generator here — never returns a generator.
        """
        model = self._load_model()
        segments, _info = model.transcribe(
            audio_path,
            language=self._language,
            beam_size=5,
            vad_filter=True,
        )
        # Consume generator inside thread — CRITICAL (Pitfall 1)
        return " ".join(seg.text.strip() for seg in segments).strip()

    async def transcribe(self, audio_path: str) -> str:
        """Async wrapper — offloads blocking transcription to thread pool.

        Per ARCH-02: never blocks the main event loop.
        Raises FileNotFoundError if audio_path does not exist.
        """
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        return await asyncio.to_thread(self._transcribe_sync, str(path))
