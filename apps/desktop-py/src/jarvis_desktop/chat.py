"""JARVIS terminal chat — SSE streaming loop.

Phase 73: Replaces placeholder sleep loop in __main__.py.
Phase 74: Adds PTT hotkey voice input via pynput GlobalHotKeys.

Decisions honored:
  D-01: print() only — no rich
  D-02: input('> ') prompt
  D-03: pynput GlobalHotKeys for global PTT listener
  D-05/D-06: api_key from config, injected as Bearer token if non-empty
  D-08: mid-stream failure → print partial tokens + \n[erro: conexão perdida]
  D-09: gateway offline at startup → print error + sys.exit(1); loop not entered
"""
import sys
import threading
import urllib.parse
import urllib.request
from urllib.error import URLError

from pynput import keyboard

from jarvis_desktop.config import JarvisConfig
from jarvis_desktop.health import check_health


# ---------------------------------------------------------------------------
# SSE parsing helpers (tested independently — test_chat.py stubs target these)
# ---------------------------------------------------------------------------

def parse_sse_line(line: str):
    """Parse a single SSE line and return the data payload, or None if not a data line.

    Returns:
        str  — data payload (may be empty string for "data: " lines)
        None — for comment lines (:), event lines, id lines, or empty lines
    """
    if line.startswith("data: "):
        return line[6:]
    return None


def parse_sse_chunk(chunk: str, buffer: str) -> tuple:
    """Accumulate SSE chunk into buffer and extract complete data lines.

    Handles chunk-boundary splits: a 'data: token' line may arrive across two
    read() calls. The last incomplete line is kept in the buffer for the next call.

    Args:
        chunk:  New data received from read(1024).
        buffer: Leftover incomplete line from previous call. Pass "" for first call.

    Returns:
        (tokens, new_buffer):
            tokens     — list of extracted data payloads from complete lines
            new_buffer — remaining incomplete line (pass back to next call)
    """
    combined = buffer + chunk
    lines = combined.split("\n")
    # Last element may be an incomplete line — keep it in buffer
    incomplete = lines[-1]
    tokens = []
    for line in lines[:-1]:
        line = line.rstrip("\r")  # Strip CR from CRLF if present
        payload = parse_sse_line(line)
        if payload is not None:
            tokens.append(payload)
    return tokens, incomplete


def build_request_headers(api_key: str) -> dict:
    """Build HTTP headers for SSE request.

    Returns Authorization header only if api_key is non-empty (D-06).
    """
    if api_key:
        return {"Authorization": f"Bearer {api_key}"}
    return {}


# ---------------------------------------------------------------------------
# Health gate
# ---------------------------------------------------------------------------

def run_with_health_check(config: JarvisConfig) -> None:
    """Verify gateway is reachable. Exits with code 1 if not.

    Called by __main__.py before entering chat_loop(). Satisfies PYCHAT-02:
    clear error on unreachable gateway, no crash (controlled sys.exit).
    """
    health = check_health(config.gateway_url)
    if health.get("gateway") == "ok":
        backend_status = health.get("backend", "unknown")
        print(f"Gateway: online  (backend: {backend_status})")
    else:
        print(f"Gateway: offline — {health.get('message', health.get('gateway', 'unreachable'))}")
        print("Chat requires gateway. Exiting.")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Chat loop
# ---------------------------------------------------------------------------

def chat_loop(config: JarvisConfig) -> None:
    """Chat loop with PTT hotkey and text input.

    Phase 74: adds pynput GlobalHotKeys listener for PTT voice input (D-03).
    PTT triggers record_until_silence() + transcribe() in main thread.
    Text input mode unchanged — input('> ') still works (D-05).

    Status feedback (D-06):
      Key press  → "[STT] ouvindo..."
      VAD/release → "[STT] transcrevendo..."
      Result      → "> [transcrito: <text>]" then gateway response
    """
    from jarvis_desktop.stt import record_until_silence, transcribe, _parse_ptt_hotkey

    ptt_combo = _parse_ptt_hotkey(config.ptt_key)
    ptt_triggered = threading.Event()

    def _on_ptt():
        print("[STT] ouvindo...", flush=True)
        ptt_triggered.set()

    listener = keyboard.GlobalHotKeys({ptt_combo: _on_ptt})
    listener.start()

    print("Chat ready. Type messages and press Enter. Ctrl+C to exit.")
    print(f"Voice input: hold {config.ptt_key} and speak.")
    print()

    try:
        while True:
            if ptt_triggered.is_set():
                ptt_triggered.clear()
                print("[STT] transcrevendo...", flush=True)
                try:
                    audio = record_until_silence(
                        threshold_ms=config.silence_threshold_ms,
                    )
                    text = transcribe(audio)
                    if text.strip():
                        print(f"> [transcrito: {text}]", flush=True)
                        _stream_response(config, text)
                        print()
                except RuntimeError as exc:
                    print(f"\n[STT erro: {exc}]", flush=True)
            else:
                try:
                    message = input("> ")
                except (EOFError, KeyboardInterrupt):
                    print("\nShutdown.")
                    sys.exit(0)

                if not message.strip():
                    continue

                _stream_response(config, message)
                print()
    finally:
        listener.stop()


def _stream_response(config: JarvisConfig, message: str) -> None:
    """Send message to gateway and stream SSE response to stdout.

    Uses urllib.request (stdlib-only, consistent with health.py — CLAUDE.md constraint).
    Timeout of 30 seconds prevents indefinite hangs (research pitfall 4).
    Buffer accumulation prevents chunk-boundary token drops (research pitfall 1).
    """
    url = (
        config.gateway_url.rstrip("/")
        + "/api/chat/stream"
        + "?message="
        + urllib.parse.quote(message, safe="")
    )
    headers = build_request_headers(config.api_key)

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            buffer = ""
            while True:
                raw = response.read(1024)
                if not raw:
                    break
                chunk = raw.decode("utf-8", errors="replace")
                tokens, buffer = parse_sse_chunk(chunk, buffer)
                for token in tokens:
                    print(token, end="", flush=True)  # D-01: flush=True for real-time display
            print()  # Final newline after full response
    except URLError:
        print("\n[erro: conexão perdida]")  # D-08: partial tokens already printed above
    except Exception as exc:  # noqa: BLE001
        print(f"\n[erro: {exc}]")  # D-08: never crash — show error and return
