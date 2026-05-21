"""JARVIS Python Desktop Client — entry point.

Invoked via: uv run python -m jarvis_desktop
Or via pnpm: pnpm dev:desktop-py (from repo root)

Phase 77 behavior:
  0. UI init — Console + Live status line (PYUI-01) — must be first
  1. Load config (~/.jarvis/config.json)
  2. Health check gate — exits cleanly if gateway offline (D-09, PYCHAT-02)
  3. STT init — loads Whisper singleton (D-07, PYSTT-02)
  4. TTS init — loads Kokoro singleton (D-06, PYTTS-01)
  5. Voice modes init — starts configured mode daemon thread (PYMODE-01/02/03)
  6. Chat loop — SSE streaming + voice queue + keyboard input + TTS
"""


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
    c.print(f"[Config] Gateway URL : {config.gateway_url}")
    c.print(f"[Config] Whisper     : {config.whisper_model}")
    c.print(f"[Config] TTS         : {config.tts_provider}")
    c.print(f"[Config] Voice mode  : {config.voice_mode}")
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

    # Step 6: Chat loop — Phase 77 (voice queue + text input + TTS + status line)
    try:
        chat_loop(config)
    finally:
        ui.cleanup_ui()  # Stop Live display cleanly on exit


if __name__ == "__main__":
    main()
