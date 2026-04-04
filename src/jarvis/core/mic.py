"""Push-to-talk microphone capture via sounddevice.

Per CONV-02: Hold a key to record, release to stop.
Per ARCH-02: Recording runs in asyncio-compatible manner via callback.
Per CLAUDE.md: Use sounddevice (NOT PyAudio) — numpy arrays, cross-platform.

sounddevice uses a callback model: audio data arrives in a background thread
via the callback function. We collect chunks in a list and join them when
recording stops. This does NOT block the event loop.
"""

import asyncio
import tempfile
import wave
from typing import Optional

import numpy as np
import sounddevice as sd
from loguru import logger


class MicCapture:
    """Push-to-talk microphone capture using sounddevice callback API.

    Usage:
        mic = MicCapture(sample_rate=16000, channels=1)
        mic.start_recording()
        # ... user holds key ...
        audio_path = mic.stop_recording()
        # audio_path is a temp .wav file ready for WhisperTranscriber
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
    ) -> None:
        self._sample_rate = sample_rate
        self._channels = channels
        self._chunks: list[np.ndarray] = []
        self._stream: Optional[sd.InputStream] = None
        self._recording = False

    def _audio_callback(
        self, indata: np.ndarray, frames: int, time_info, status
    ) -> None:
        """Called by sounddevice from a background thread for each audio chunk."""
        if status:
            logger.warning(f"Sounddevice status: {status}")
        if self._recording:
            self._chunks.append(indata.copy())

    def start_recording(self) -> None:
        """Begin capturing audio from the default microphone.

        Opens a sounddevice InputStream with callback — audio arrives
        in background thread, collected in self._chunks.
        Does NOT block the event loop.
        """
        self._chunks = []
        self._recording = True
        self._stream = sd.InputStream(
            samplerate=self._sample_rate,
            channels=self._channels,
            dtype="int16",
            callback=self._audio_callback,
        )
        self._stream.start()
        logger.debug("Mic recording started")

    def stop_recording(self) -> Optional[str]:
        """Stop recording and save captured audio to a temporary WAV file.

        Returns:
            Path to temp .wav file, or None if no audio was captured.
        """
        self._recording = False
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        logger.debug(f"Mic recording stopped, {len(self._chunks)} chunks captured")

        if not self._chunks:
            return None

        # Concatenate all audio chunks into a single numpy array
        audio_data = np.concatenate(self._chunks, axis=0)
        self._chunks = []

        # Save to temporary WAV file — WhisperTranscriber.transcribe() expects a file path
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        with wave.open(tmp.name, "wb") as wf:
            wf.setnchannels(self._channels)
            wf.setsampwidth(2)  # int16 = 2 bytes
            wf.setframerate(self._sample_rate)
            wf.writeframes(audio_data.tobytes())

        logger.debug(f"Mic audio saved to {tmp.name} ({len(audio_data)} samples)")
        return tmp.name

    def is_recording(self) -> bool:
        """Whether the mic is currently capturing."""
        return self._recording

    async def record_until_release(self, stop_event: asyncio.Event) -> Optional[str]:
        """Async helper: start recording, wait for stop_event, return audio path.

        Per ARCH-02: Uses asyncio.Event for non-blocking wait.
        The sounddevice callback runs in its own thread — the event loop
        just waits on the Event without blocking.
        """
        self.start_recording()
        await stop_event.wait()
        return self.stop_recording()
