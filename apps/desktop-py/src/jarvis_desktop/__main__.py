"""JARVIS Python Desktop Client — entry point.

Invoked via: uv run python -m jarvis_desktop
Or via pnpm: pnpm dev:desktop-py (from repo root)

Phase 77/79 behavior:
  0. UI init — Console + Live status line (PYUI-01) — must be first
  1. Load config (~/.jarvis/config.json) + load/create persistent client ID (Phase 84, D-02)
  2. Health check gate — exits cleanly if gateway offline (D-09, PYCHAT-02)
  3. STT init — loads Whisper singleton (D-07, PYSTT-02)
  4. TTS init — loads Kokoro singleton (D-06, PYTTS-01)
  5. Voice modes init — starts configured mode daemon thread (PYMODE-01/02/03)
  6. PC Control init — stores config for app/file operations (PCTRL-01..06)
  7. Start SSE listener for PC control dispatch (Phase 84, REQ-84-01)
  8. Chat loop — SSE streaming + voice queue + keyboard input + TTS
"""
from pathlib import Path


def _load_or_create_client_id() -> str:
    """Load persistent client UUID from ~/.jarvis/client_id or generate and persist a new one.

    Persistent across process restarts so the gateway can correlate the SSE listener
    with the same clientId used in chat requests (Phase 84, D-02).
    """
    import uuid
    client_id_file = Path.home() / ".jarvis" / "client_id"
    if client_id_file.exists():
        existing = client_id_file.read_text().strip()
        if existing:
            return existing
    new_id = str(uuid.uuid4())
    client_id_file.parent.mkdir(parents=True, exist_ok=True)
    client_id_file.write_text(new_id)
    return new_id


def main() -> None:
    from jarvis_desktop.ui import init_ui, set_config
    from jarvis_desktop import ui
    from jarvis_desktop.config import load_config
    from jarvis_desktop.chat import run_with_health_check, chat_loop
    from jarvis_desktop.stt import init_stt
    from jarvis_desktop.tts import init_tts
    from jarvis_desktop.voice_modes import init_voice_modes

    # Step 0: Initialize terminal UI (Console + Live status line) — must be first (PYUI-01)
    init_ui()
    c = ui.get_console()

    c.print("JARVIS Desktop Client — Python")
    c.print("=" * 40)

    # Step 1: Load config (auto-creates ~/.jarvis/config.json if missing)
    config = load_config()
    set_config(config)  # Share config reference with ui.py for status line

    # Load/create persistent client ID early so it prints with the other config lines
    client_id = _load_or_create_client_id()
    config.client_id = client_id

    # Pre-resolve whisper display: if whisper.cpp backend will be used, show its model
    from jarvis_desktop.stt import _detect_amd_windows
    _resolved_backend = config.stt_backend
    if _resolved_backend == "auto":
        _resolved_backend = "whisper_cpp" if _detect_amd_windows() else "faster_whisper"
    if _resolved_backend == "whisper_cpp":
        _whisper_display = config.whisper_model if config.whisper_model not in ("tiny", "") else "large-v3-turbo"
    else:
        _whisper_display = config.whisper_model

    c.print(f"[Config] Gateway URL : {config.gateway_url}")
    c.print(f"[Config] Whisper     : {_whisper_display}")
    c.print(f"[Config] TTS         : {config.tts_provider}")
    c.print(f"[Config] Voice mode  : {config.voice_mode}")
    c.print(f"[Config] Client ID   : {client_id[:8]}...")
    c.print("")

    # Step 2: Health check — exits cleanly if gateway offline (D-09, PYCHAT-02)
    run_with_health_check(config)
    c.print("")

    # Step 3: Initialize STT singleton before chat loop (D-07, PYSTT-02, WGPU-01/02/03)
    init_stt(config)
    c.print("")

    # Step 4: Initialize TTS singleton before chat loop (D-06, PYTTS-01)
    init_tts(config)
    c.print("")

    # Step 5: Initialize voice modes — starts configured mode daemon thread (PYMODE-01/02/03)
    init_voice_modes(config)
    c.print("")

    # Step 6: Initialize PC Control module (PCTRL-01..06)
    from jarvis_desktop.pc_control import init_pc_control
    init_pc_control(config)
    c.print("")

    # Step 7: Start SSE listener for PC control dispatch (Phase 84, REQ-84-01)
    from jarvis_desktop.sse_listener import start_sse_listener  # noqa: PLC0415
    start_sse_listener(config, client_id)

    # Step 8: Chat loop — SSE streaming + voice queue + keyboard input + TTS
    try:
        chat_loop(config)
    finally:
        ui.cleanup_ui()  # Stop Live display cleanly on exit


def _entry() -> None:
    """Console script entry point — routes 'jarvis setup' or runs main chat loop."""
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "setup":
        from jarvis_desktop.setup_wizard import run_setup
        run_setup()
    else:
        main()


if __name__ == "__main__":
    _entry()
