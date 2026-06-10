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
    # Phase 91: use device_detect.detect() instead of removed _detect_amd_windows() (GPU-06)
    import platform as _platform
    _resolved_backend = config.stt_backend
    if _resolved_backend == "auto":
        if _platform.system() == "Windows":
            from jarvis_desktop.device_detect import detect as _dd
            _resolved_backend = "whisper_cpp" if _dd(config).backend == "directml" else "faster_whisper"
        else:
            _resolved_backend = "faster_whisper"
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


def _cmd_validate_gpu(args: list[str]) -> None:
    """jd validate-gpu — mostra device detectado, fallback chain e compat por subsistema.

    Flags:
      --verbose : expande para diagnóstico completo (driver info, todas GPUs enumeradas)
      --json    : saída JSON estruturada para scripting/health-check (D-09)
    """
    import json as _json
    from jarvis_desktop.config import load_config
    from jarvis_desktop.device_detect import detect, get_fallback_chain, reset_cache

    verbose = "--verbose" in args
    as_json = "--json" in args

    config = load_config()
    # Force fresh detection (in case called standalone; no cached result from main())
    reset_cache()

    result = detect(config)
    chain = get_fallback_chain(config)

    if as_json:
        data = {
            "device": result.device,
            "backend": result.backend,
            "vram_mb": result.vram_mb,
            "driver_info": result.driver_info,
            "fallback_chain": [
                {"device": e.device, "status": e.status, "reason": e.reason}
                for e in chain
            ],
            "subsystems": {
                "whisper_faster": result.device,
                "kokoro": result.device,
                "chatterbox": result.device,
            },
        }
        print(_json.dumps(data, ensure_ascii=False, indent=2))
        return

    # Rich table output (PT-BR — D-10)
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel

    console = Console()

    # Header
    vram_str = f" — {result.vram_mb} MB VRAM" if result.vram_mb > 0 else ""
    console.print(Panel(
        f"[bold cyan]Device selecionado:[/bold cyan] [bold green]{result.device}[/bold green]{vram_str}",
        title="[bold]JARVIS — Detecção de GPU[/bold]",
        expand=False,
    ))

    # Fallback chain table
    table = Table(title="Fallback Chain Avaliada", show_header=True, header_style="bold magenta")
    table.add_column("Device", style="cyan", width=14)
    table.add_column("Status", width=16)
    table.add_column("Motivo")

    status_styles = {
        "selected": "[bold green]selected[/bold green]",
        "ok": "[green]ok[/green]",
        "failed": "[red]failed[/red]",
        "skipped": "[yellow]skipped[/yellow]",
        "detection-only": "[blue]detection-only[/blue]",
    }

    for entry in chain:
        styled_status = status_styles.get(entry.status, entry.status)
        table.add_row(entry.device, styled_status, entry.reason)

    console.print(table)

    # Subsystem compat
    console.print("\n[bold]Compatibilidade por subsistema:[/bold]")
    subsystem_device = result.device
    console.print(f"  Whisper (faster-whisper) : [green]{subsystem_device}[/green]")
    console.print(f"  Kokoro TTS               : [green]{subsystem_device}[/green]")
    console.print(f"  Chatterbox TTS           : [green]{subsystem_device}[/green]")

    if verbose:
        console.print("\n[bold]Diagnóstico detalhado:[/bold]")
        console.print(f"  gpu_amd_backend config   : {config.gpu_amd_backend}")
        if result.driver_info:
            console.print(f"  Driver info              : {result.driver_info}")


def _entry() -> None:
    """Console script entry point — routes 'jarvis setup', 'validate-gpu' or runs main chat loop."""
    import sys
    args = sys.argv[1:]
    if args and args[0] == "setup":
        from jarvis_desktop.setup_wizard import run_setup
        run_setup()
    elif args and args[0] == "validate-gpu":
        _cmd_validate_gpu(args[1:])
    else:
        main()


if __name__ == "__main__":
    _entry()
