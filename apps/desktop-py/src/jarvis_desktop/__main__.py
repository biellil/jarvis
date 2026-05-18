"""JARVIS Python Desktop Client — entry point.

Invoked via: uv run python -m jarvis_desktop
Or via pnpm: pnpm dev:desktop-py (from repo root)

Phase 73 behavior:
  1. Load and display config (~/.jarvis/config.json)
  2. Health check gate — exits cleanly if gateway offline (D-09, PYCHAT-02)
  3. Chat loop — SSE streaming terminal chat (PYCHAT-01)
"""


def main() -> None:
    from jarvis_desktop.config import load_config
    from jarvis_desktop.chat import run_with_health_check, chat_loop

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

    # Step 3: Chat loop — Phase 73 (replaces placeholder sleep loop)
    chat_loop(config)


if __name__ == "__main__":
    main()
