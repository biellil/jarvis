"""JARVIS Python Desktop Client — entry point.

Invoked via: uv run python -m jarvis_desktop
Or via pnpm: pnpm dev:desktop-py (from repo root)

Phase 72 behavior (D-10):
  1. Load and display config (~/.jarvis/config.json)
  2. GET /api/health on gateway
  3. Show gateway status (online or offline — never crash on offline, per D-11)
  4. Await Ctrl+C (chat loop added in Phase 73)
"""
import signal
import sys


def main() -> None:
    from jarvis_desktop.config import load_config
    from jarvis_desktop.health import check_health

    print("JARVIS Desktop Client — Python")
    print("=" * 40)

    # Step 1: Load config (auto-creates ~/.jarvis/config.json if missing)
    config = load_config()
    print(f"[Config] Gateway URL : {config.gateway_url}")
    print(f"[Config] Whisper     : {config.whisper_model}")
    print(f"[Config] TTS         : {config.tts_provider}")
    print(f"[Config] Voice mode  : {config.voice_mode}")
    print()

    # Step 2: Health check (never crashes — D-11)
    health = check_health(config.gateway_url)
    if health.get("gateway") == "ok":
        backend_status = health.get("backend", "unknown")
        print(f"Gateway: ✔ online  (backend: {backend_status})")
    else:
        print(f"Gateway: ✖ offline (retrying in next phase)")

    print()
    print("Client running. Press Ctrl+C to exit.")

    # Step 3: Await Ctrl+C (Phase 73 replaces this with chat loop)
    def _handle_sigint(sig: int, frame: object) -> None:
        print("\nShutdown.")
        sys.exit(0)

    signal.signal(signal.SIGINT, _handle_sigint)

    try:
        while True:
            # Placeholder — Phase 73 adds chat input loop here
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutdown.")
        sys.exit(0)


if __name__ == "__main__":
    main()
