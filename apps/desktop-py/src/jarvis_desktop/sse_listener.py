"""JARVIS PC Control — Background SSE listener for Python client dispatch.

Phase 84 (REQ-84-01, D-01): Connects to /api/actions/events on the gateway
and handles task:pc_action events in a daemon thread separate from the chat loop.

Reconnects automatically with exponential backoff (1s -> 2s -> 4s -> ... -> 30s cap)
on any connection failure.

Architecture:
  Main thread: chat_loop() -- voice/keyboard input + LLM responses
  SSE thread: _sse_loop() -- receives task:pc_action, runs confirmation, POSTs ACK
"""
from __future__ import annotations

import threading
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_listener_thread: threading.Thread | None = None
_stop_event = threading.Event()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_sse_listener(config: "JarvisConfig", client_id: str) -> None:
    """Start the background SSE listener daemon thread.

    Safe to call multiple times -- no-ops if thread already running.

    Args:
        config: JarvisConfig with gateway_url for connection target.
        client_id: UUID string sent as clientId query param in SSE URL.
    """
    global _listener_thread

    if _listener_thread and _listener_thread.is_alive():
        return

    _stop_event.clear()
    _listener_thread = threading.Thread(
        target=_sse_loop,
        args=(config, client_id),
        daemon=True,
        name="JarvisSSEListener",
    )
    _listener_thread.start()


def stop_sse_listener() -> None:
    """Signal SSE listener to stop and wait up to 5s for thread exit."""
    global _listener_thread
    _stop_event.set()
    if _listener_thread and _listener_thread.is_alive():
        _listener_thread.join(timeout=5)


# ---------------------------------------------------------------------------
# Internal implementation
# ---------------------------------------------------------------------------

def _sse_loop(config: "JarvisConfig", client_id: str) -> None:
    """Main SSE reconnect loop -- runs in daemon thread.

    Reconnects with exponential backoff (1, 2, 4, 8, 16, 30s max) on any error.
    Stops cleanly when _stop_event is set (Ctrl+C / stop_sse_listener()).
    """
    # Lazy imports -- avoid circular imports at module load time
    from jarvis_desktop.chat import parse_sse_chunk  # noqa: PLC0415

    backoff = 1

    while not _stop_event.is_set():
        try:
            url = config.gateway_url.rstrip("/") + f"/api/actions/events?clientId={client_id}"
            headers = {
                "x-jarvis-client-id": client_id,
                "Accept": "text/event-stream",
                "Cache-Control": "no-cache",
            }

            req = urllib.request.Request(url, headers=headers)
            # timeout=300: 5-minute read timeout; reconnect loop handles actual reconnection
            with urllib.request.urlopen(req, timeout=300) as response:
                backoff = 1  # Reset backoff on successful connection
                _console().print(f"[SSE] Python client registered (clientId={client_id[:8]}...)")
                buffer = ""

                while not _stop_event.is_set():
                    chunk = response.read(1024)
                    if not chunk:
                        break  # Server closed connection -- reconnect
                    chunk_str = chunk.decode("utf-8", errors="replace")
                    events, buffer = parse_sse_chunk(chunk_str, buffer)

                    for event_type, payload in events:
                        if event_type == "task:pc_action":
                            # Queue for main-thread processing — avoids background-thread
                            # keyboard issues where msvcrt.kbhit() may not work reliably
                            # in non-main threads (e.g. MSYS2/mintty environments).
                            from jarvis_desktop.pc_control import queue_pending_action  # noqa: PLC0415
                            queue_pending_action(event_type, payload)
                        # Other event types (heartbeat comments, etc.) are ignored

        except urllib.error.URLError as exc:
            if not _stop_event.is_set():
                reason = getattr(exc, "reason", str(exc))
                _console().print(f"[SSE] Connection failed: {reason} -- reconnecting in {backoff}s")
                _stop_event.wait(backoff)
                backoff = min(backoff * 2, 30)

        except OSError as exc:
            if not _stop_event.is_set():
                _console().print(f"[SSE] Network error: {exc} -- reconnecting in {backoff}s")
                _stop_event.wait(backoff)
                backoff = min(backoff * 2, 30)

        except Exception as exc:  # noqa: BLE001
            if not _stop_event.is_set():
                _console().print(f"[SSE] Unexpected error: {exc} -- reconnecting in {backoff}s")
                _stop_event.wait(backoff)
                backoff = min(backoff * 2, 30)


def _console():
    """Lazy console accessor -- avoids circular import at module level."""
    from jarvis_desktop import ui  # noqa: PLC0415
    return ui.get_console()
