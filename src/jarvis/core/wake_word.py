"""Wake word detection via openwakeword — "Hey JARVIS" activation.

Per CONV-05: User can say "Hey JARVIS" to activate without pressing a key.
Per CLAUDE.md: Use openwakeword (NOT pvporcupine/Picovoice — requires API key).
Per ARCH-02: Runs as background async task, never blocks the event loop.

Architecture:
- A sounddevice InputStream continuously feeds audio to openwakeword
- openwakeword Model.predict() runs on each audio chunk
- When prediction exceeds threshold, an asyncio.Event is set
- The main loop awaits this event and triggers recording + transcription
"""

import asyncio
from typing import Optional, Callable, Awaitable

import numpy as np
import sounddevice as sd
from loguru import logger


class WakeWordListener:
    """Background wake word detector using openwakeword + sounddevice.

    Usage:
        listener = WakeWordListener(
            model_name="hey_jarvis",
            threshold=0.5,
            on_detected=my_async_callback,
        )
        await listener.start()  # Runs in background
        # ... later ...
        await listener.stop()
    """

    def __init__(
        self,
        model_name: str = "hey_jarvis",
        threshold: float = 0.5,
        sample_rate: int = 16000,
        on_detected: Optional[Callable[[], Awaitable[None]]] = None,
    ) -> None:
        self._model_name = model_name
        self._threshold = threshold
        self._sample_rate = sample_rate
        self._on_detected = on_detected
        self._oww_model = None  # Lazy
        self._stream: Optional[sd.InputStream] = None
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._chunk_size = 1280  # ~80ms at 16kHz — openwakeword expects this

    def _load_model(self):
        """Load openwakeword model on first use. Downloads model if not cached."""
        if self._oww_model is None:
            logger.info(f"Carregando modelo wake word '{self._model_name}'...")
            import openwakeword
            from openwakeword import Model as OWWModel
            # Download default models if not present
            openwakeword.utils.download_models()
            self._oww_model = OWWModel(
                wakeword_models=[self._model_name],
                inference_framework="onnx",
            )
            logger.info("Modelo wake word carregado.")
        return self._oww_model

    def _audio_callback(
        self, indata: np.ndarray, frames: int, time_info, status
    ) -> None:
        """Called by sounddevice for each audio chunk. Runs prediction."""
        if status:
            logger.warning(f"Wake word sounddevice status: {status}")
        if not self._running:
            return

        try:
            model = self._oww_model
            if model is None:
                return

            # openwakeword expects int16 audio
            audio_int16 = indata[:, 0] if indata.ndim > 1 else indata.flatten()

            # Feed audio to openwakeword
            prediction = model.predict(audio_int16)

            # Check if any model exceeds threshold
            for model_name, score in prediction.items():
                if score >= self._threshold:
                    logger.info(f"Wake word detected: {model_name} (score: {score:.2f})")
                    model.reset()  # Reset to avoid repeated triggers
                    # Schedule callback on the event loop (we're in a thread)
                    if self._on_detected and self._loop:
                        asyncio.run_coroutine_threadsafe(
                            self._on_detected(), self._loop
                        )
                    break
        except Exception as e:
            logger.warning(f"Wake word prediction error: {e}")

    async def start(self) -> None:
        """Start background wake word listening.

        Opens a sounddevice InputStream that continuously feeds audio
        to openwakeword for detection. Does not block the event loop.
        """
        # Load model (in thread to avoid blocking)
        await asyncio.to_thread(self._load_model)

        self._loop = asyncio.get_running_loop()
        self._running = True
        self._stream = sd.InputStream(
            samplerate=self._sample_rate,
            channels=1,
            dtype="int16",
            blocksize=self._chunk_size,
            callback=self._audio_callback,
        )
        self._stream.start()
        logger.info("Wake word listener started — say 'Hey JARVIS' to activate")

    async def stop(self) -> None:
        """Stop wake word listening and clean up."""
        self._running = False
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        logger.info("Wake word listener stopped")

    def is_running(self) -> bool:
        return self._running
