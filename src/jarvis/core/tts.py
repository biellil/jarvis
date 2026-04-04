"""Text-to-Speech via kokoro — offline neural TTS.

Per CONV-03: JARVIS responds by voice using kokoro.
Per SC2: Streaming sentence by sentence — play each sentence as it's ready.
Per ARCH-02: TTS synthesis and playback must not block the event loop.
Per CLAUDE.md: Use kokoro (NOT pyttsx3, NOT ElevenLabs, NOT Coqui).
"""

import asyncio
import re
from typing import Optional

import numpy as np
from loguru import logger


class KokoroTTS:
    """Wraps kokoro with lazy loading and sentence-level streaming.

    Usage:
        tts = KokoroTTS(voice="af_heart", lang="a")
        await tts.speak("Hello world. How are you?")
        # Plays "Hello world." first, then "How are you?" — streaming.
    """

    def __init__(self, voice: str = "af_heart", lang: str = "a") -> None:
        self._voice = voice
        self._lang = lang
        self._pipeline = None  # Lazy — loaded on first speak()

    def _load_pipeline(self):
        """Load kokoro KPipeline on first use. Model download ~350MB on first call."""
        if self._pipeline is None:
            logger.info(f"Carregando modelo kokoro TTS (voz: {self._voice})...")
            from kokoro import KPipeline
            self._pipeline = KPipeline(lang_code=self._lang)
            logger.info("Modelo kokoro TTS carregado.")
        return self._pipeline

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """Split text into sentences for streaming TTS.

        Simple regex split on sentence-ending punctuation.
        Handles: . ! ? and Portuguese-specific patterns.
        """
        # Split on sentence boundaries, keeping the delimiter
        parts = re.split(r'(?<=[.!?])\s+', text.strip())
        return [p.strip() for p in parts if p.strip()]

    def _synthesize_sync(self, text: str) -> Optional[np.ndarray]:
        """Synchronous synthesis of a single text chunk. Runs in thread.

        Returns numpy array of audio samples, or None on failure.
        """
        try:
            pipeline = self._load_pipeline()
            # kokoro KPipeline.__call__ generates audio
            # It returns a generator of (graphemes, phonemes, audio) tuples
            samples = []
            for _, _, audio in pipeline(text, voice=self._voice):
                samples.append(audio)

            if not samples:
                return None

            return np.concatenate(samples)
        except Exception as e:
            logger.warning(f"TTS synthesis failed: {e}")
            return None

    def _play_audio_sync(self, audio: np.ndarray, sample_rate: int = 24000) -> None:
        """Play audio array through speakers. Synchronous — runs in thread.

        kokoro outputs 24kHz audio by default.
        """
        try:
            import sounddevice as sd
            sd.play(audio, samplerate=sample_rate)
            sd.wait()  # Block until playback finishes
        except Exception as e:
            logger.warning(f"TTS playback failed: {e}")

    async def speak(self, text: str) -> None:
        """Speak text with sentence-level streaming.

        Per SC2: Splits text into sentences, synthesizes and plays each
        before the full response is complete. This reduces perceived latency.

        Per ARCH-02: synthesis and playback run in threads via asyncio.to_thread().
        """
        sentences = self._split_sentences(text)
        if not sentences:
            return

        for sentence in sentences:
            # Synthesize in thread (CPU-bound)
            audio = await asyncio.to_thread(self._synthesize_sync, sentence)
            if audio is not None:
                # Play in thread (blocks on sounddevice.wait())
                await asyncio.to_thread(self._play_audio_sync, audio)

    async def speak_sentence(self, sentence: str) -> None:
        """Speak a single sentence. Used for incremental streaming."""
        audio = await asyncio.to_thread(self._synthesize_sync, sentence)
        if audio is not None:
            await asyncio.to_thread(self._play_audio_sync, audio)
