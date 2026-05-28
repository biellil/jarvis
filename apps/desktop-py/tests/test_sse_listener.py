"""Tests for sse_listener.py -- Phase 84 (REQ-84-01).

Tests the SSE listener daemon thread: start/stop lifecycle, reconnect backoff,
event dispatch, and header injection.
"""
import threading
import time
import unittest.mock as mock
from unittest.mock import MagicMock, patch

import pytest

from jarvis_desktop.config import JarvisConfig


@pytest.fixture
def config() -> JarvisConfig:
    return JarvisConfig(gateway_url="http://localhost:3000", api_key="test-key")


@pytest.fixture(autouse=True)
def reset_listener():
    """Reset module-level state before each test."""
    import jarvis_desktop.sse_listener as sl
    sl._stop_event.clear()
    sl._listener_thread = None
    yield
    sl.stop_sse_listener()


class TestStartStopLifecycle:
    def test_start_creates_daemon_thread(self, config):
        import jarvis_desktop.sse_listener as sl

        with patch.object(sl, "_sse_loop", return_value=None) as mock_loop:
            sl.start_sse_listener(config, "test-client-id")
            time.sleep(0.05)  # Give thread time to start

            assert sl._listener_thread is not None
            # The thread is daemon
            assert sl._listener_thread.daemon is True

    def test_start_is_idempotent(self, config):
        """Calling start twice does not create a second thread."""
        import jarvis_desktop.sse_listener as sl

        stop_event_local = threading.Event()

        def slow_loop(*_):
            stop_event_local.wait(timeout=2)

        with patch.object(sl, "_sse_loop", side_effect=slow_loop):
            sl.start_sse_listener(config, "client-1")
            first_thread = sl._listener_thread

            sl.start_sse_listener(config, "client-1")
            second_thread = sl._listener_thread

            assert first_thread is second_thread
            stop_event_local.set()

    def test_stop_sets_stop_event(self, config):
        import jarvis_desktop.sse_listener as sl

        sl.stop_sse_listener()
        assert sl._stop_event.is_set()


class TestReconnectBackoff:
    def test_backoff_doubles_on_url_error(self, config):
        """_sse_loop should increment backoff on each connection failure."""
        import jarvis_desktop.sse_listener as sl
        import urllib.error

        call_count = 0
        backoff_values = []

        original_wait = sl._stop_event.wait

        def fake_wait(timeout=None):
            nonlocal call_count
            call_count += 1
            backoff_values.append(timeout)
            if call_count >= 3:
                sl._stop_event.set()
            return sl._stop_event.is_set()

        def fail_request(*_a, **_kw):
            raise urllib.error.URLError("Connection refused")

        with (
            patch("urllib.request.urlopen", side_effect=fail_request),
            patch.object(sl._stop_event, "wait", side_effect=fake_wait),
            patch.object(sl, "_console", return_value=MagicMock()),
        ):
            sl._sse_loop(config, "test-client")

        # Verify backoff grows: 1, 2 (3rd call sets stop)
        assert len(backoff_values) >= 2
        assert backoff_values[0] == 1
        assert backoff_values[1] == 2

    def test_backoff_caps_at_30(self, config):
        """Backoff should not exceed 30s."""
        import jarvis_desktop.sse_listener as sl
        import urllib.error

        call_count = 0

        def fake_wait(timeout=None):
            nonlocal call_count
            call_count += 1
            if call_count >= 8:
                sl._stop_event.set()
            assert timeout is None or timeout <= 30, f"Backoff {timeout} > 30s cap"
            return sl._stop_event.is_set()

        def fail_request(*_a, **_kw):
            raise urllib.error.URLError("refused")

        with (
            patch("urllib.request.urlopen", side_effect=fail_request),
            patch.object(sl._stop_event, "wait", side_effect=fake_wait),
            patch.object(sl, "_console", return_value=MagicMock()),
        ):
            sl._sse_loop(config, "test-client")


class TestSseHeaderInjection:
    def test_sse_loop_sends_client_id_header(self, config):
        """SSE URL must include clientId query param."""
        import jarvis_desktop.sse_listener as sl

        captured_req = []

        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, n):
                sl._stop_event.set()
                return b""

        def fake_urlopen(req, timeout=None):
            captured_req.append(req)
            return FakeResponse()

        with (
            patch("urllib.request.urlopen", side_effect=fake_urlopen),
            patch.object(sl, "_console", return_value=MagicMock()),
            patch("jarvis_desktop.chat.parse_sse_chunk", return_value=([], "")),
        ):
            sl._sse_loop(config, "my-client-uuid")

        assert len(captured_req) >= 1
        url = captured_req[0].full_url
        assert "clientId=my-client-uuid" in url
        assert captured_req[0].get_header("X-jarvis-client-id") == "my-client-uuid"
