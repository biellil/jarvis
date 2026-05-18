"""JARVIS Python Desktop Client — entry point.

Invoked via: uv run python -m jarvis_desktop
Or via pnpm: pnpm dev:desktop-py (from repo root)

Phase 74 behavior:
  1. Load config (~/.jarvis/config.json)
  2. Health check gate — exits cleanly if gateway offline (D-09, PYCHAT-02)
  3. STT init — loads Whisper singleton (D-07, PYSTT-02)
  4. Chat loop — SSE streaming + PTT voice input (PYCHAT-01, PYSTT-01)
"""


def main() -> None:
    from jarvis_desktop.config import load_config
    from jarvis_desktop.chat import run_with_health_check, chat_loop
    from jarvis_desktop.stt import init_stt

    print("JARVIS Desktop Client — Python")
    print("=" * 40)

    # Step 1: Load config (auto-creates ~/.jarvis/config.json if missing)
    config = load_config()
    print(f"[Config] Gateway URL : {config.gateway_url}")
    print(f"[Config] Whisper     : {config.whisper_model}")
    print(f"[Config] TTS         : {config.tts_provider}")
    print(f"[Config] Voice mode  : {config.voice_mode}")
    print()

    # Step 2: Health check — exits cleanly if gateway offline (D-09, PYCHAT-02)
    run_with_health_check(config)
    print()

    # Step 3: Initialize STT singleton before chat loop (D-07, PYSTT-02)
    init_stt(config.whisper_model)
    print()

    # Step 4: Chat loop — Phase 74 (PTT + text input, PYCHAT-01, PYSTT-01)
    chat_loop(config)


if __name__ == "__main__":
    main()
