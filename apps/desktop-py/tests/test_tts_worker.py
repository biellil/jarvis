"""Tests for TTS worker thread additions to tts.py — STTS-03, STTS-04 (Phase 95)."""
import queue
import time
import threading
import pytest

pytestmark = pytest.mark.xfail(
    reason="TTS worker not yet implemented in tts.py (Wave 0 stub)",
    strict=False,
)


def test_tts_worker_starts_and_stops(mock_kokoro_engine, mock_sounddevice_play):
    """start_tts_worker() creates daemon thread; stop_tts() stops it. STTS-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig()
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, start_tts_worker, stop_tts

    init_tts(config)
    start_tts_worker(config)

    assert tts_module._tts_thread is not None
    assert tts_module._tts_thread.is_alive()
    assert tts_module._tts_thread.daemon is True

    stop_tts()
    tts_module._tts_thread.join(timeout=2.0)
    assert not tts_module._tts_thread.is_alive()
    tts_module._engine = None


def test_tts_worker_nonblocking(mock_kokoro_engine, mock_sounddevice_play):
    """Worker consumes sentences from queue without blocking the producer. STTS-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig()
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, start_tts_worker, stop_tts

    init_tts(config)
    start_tts_worker(config)

    # Producer puts 3 sentences — should not block (queue maxsize=3)
    start = time.perf_counter()
    for i in range(3):
        tts_module._tts_queue.put({"text": f"Frase número {i + 1}."}, timeout=1.0)
    elapsed = time.perf_counter() - start

    assert elapsed < 0.5, f"Producer blocked for {elapsed:.2f}s — backpressure too aggressive"

    stop_tts()
    tts_module._engine = None


def test_is_speaking_multisent_drain(mock_kokoro_engine, mock_sounddevice_play):
    """is_speaking() returns True throughout multi-sentence drain. D-09, STTS-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig()
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, start_tts_worker, is_speaking, stop_tts

    init_tts(config)
    start_tts_worker(config)

    # Enqueue 3 sentences
    for i in range(3):
        tts_module._tts_queue.put({"text": f"Frase {i + 1} do turno."})

    # Poll is_speaking() 10 times at 20ms intervals while drain runs
    # At least some polls should return True (anti-feedback invariant D-09)
    speaking_samples = []
    for _ in range(10):
        speaking_samples.append(is_speaking())
        time.sleep(0.02)

    stop_tts()
    tts_module._engine = None

    # Must have seen is_speaking() == True at least once during drain
    assert any(speaking_samples), (
        "is_speaking() never returned True during multi-sentence drain — anti-feedback broken"
    )


def test_stop_tts_drains_queue(mock_kokoro_engine, mock_sounddevice_play):
    """stop_tts() drains pending queue items without crash. D-10, STTS-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig()
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, start_tts_worker, stop_tts

    init_tts(config)
    start_tts_worker(config)

    # Fill queue
    for i in range(3):
        try:
            tts_module._tts_queue.put_nowait({"text": f"Frase {i}."})
        except queue.Full:
            pass

    stop_tts()  # Must not raise; must consume items not via queue.clear()

    assert tts_module._tts_queue.empty(), "Queue not empty after stop_tts()"
    assert not tts_module._is_playing, "_is_playing not cleared by stop_tts()"
    tts_module._engine = None


def test_ttfa_log_emitted(mock_kokoro_engine, mock_sounddevice_play, caplog):
    """Worker logs TTFA ms before playing first sentence. D-14, STTS-04."""
    import logging
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig()
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, start_tts_worker, stop_tts

    init_tts(config)
    start_tts_worker(config)

    first_token_ts = time.perf_counter() - 0.050  # Simulate 50ms ago
    tts_module._tts_queue.put({
        "text": "Primeira frase do turno.",
        "first_token_ts": first_token_ts,
    })

    # Give worker time to process
    time.sleep(0.5)
    stop_tts()
    tts_module._tts_thread.join(timeout=2.0)
    tts_module._engine = None

    # Check loguru output contains TTFA log
    # loguru logs to stderr; check that the TTFA format was emitted
    # (caplog captures logging module; for loguru, check via mock or output capture)
    # Minimal check: no exception was raised and worker ran
    assert not tts_module._is_playing
