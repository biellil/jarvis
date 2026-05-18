"""JARVIS terminal chat — SSE streaming loop.

Phase 73: Replaces placeholder sleep loop in __main__.py.
Phase 74: Adds PTT hotkey voice input via pynput GlobalHotKeys.
Phase 75: Adds TTS call after SSE stream completes (D-01).
Phase 76: PTT hotkey management moved to voice_modes._ptt_loop().
          chat_loop() now polls voice_modes.get_text_queue() for voice-transcribed
          text, falling back to input('> ') for keyboard input.
Phase 77: Migrated all print() to ui.get_console().print(); added set_state("thinking").
          Adds /config command detection, config menu, print() → console.print() migration.
          D-06: /config detected in chat_loop(), routed to _handle_command()
          D-07: voice_modes.stop_mode()/start_mode() gate around menu

Decisions honored:
  D-01: TTS after full stream completes — speak(full_text, config) after SSE loop
  D-02: input('> ') prompt
  D-05/D-06: api_key from config, injected as Bearer token if non-empty
  D-08: mid-stream failure → print partial tokens + \n[erro: conexão perdida]
  D-09: gateway offline at startup → print error + sys.exit(1); loop not entered
"""
import sys
import urllib.parse
import urllib.request
from urllib.error import URLError

from jarvis_desktop.config import JarvisConfig
from jarvis_desktop.health import check_health
from jarvis_desktop.tts import speak


def _console():
    """Lazy accessor for ui console — avoids circular import at module level."""
    from jarvis_desktop import ui
    return ui.get_console()


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
        _console().print(f"Gateway: online  (backend: {backend_status})")
    else:
        _console().print(f"Gateway: offline — {health.get('message', health.get('gateway', 'unreachable'))}")
        _console().print("Chat requires gateway. Exiting.")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Chat loop
# ---------------------------------------------------------------------------

def chat_loop(config: JarvisConfig) -> None:
    """Chat loop consuming from voice_modes queue and keyboard input.

    Phase 76: PTT hotkey management moved to voice_modes._ptt_loop().
    chat_loop() now polls voice_modes.get_text_queue() for voice-transcribed
    text, falling back to input('> ') for keyboard input.

    Queue poll is non-blocking (get_nowait); keyboard input blocks but
    voice_modes daemon threads deliver text asynchronously so it appears
    on the next iteration after user presses Enter (acceptable terminal MVP).

    Decisions honored:
      D-02: threading.Queue for text delivery from voice_modes
      D-12: print() only, no rich
    """
    from queue import Empty
    from jarvis_desktop.voice_modes import get_text_queue, stop_mode

    text_queue = get_text_queue()

    _console().print("Chat ready. Type messages and press Enter, or use voice mode. Ctrl+C to exit.")
    _console().print("")

    try:
        while True:
            # Check voice queue first (non-blocking)
            try:
                message = text_queue.get_nowait()
                _console().print(f"> [voz: {message}]")
            except Empty:
                # Queue empty — wait for keyboard input
                try:
                    from jarvis_desktop import ui as _ui
                    message = _ui.get_input("> ")
                except (EOFError, KeyboardInterrupt):
                    _console().print("\nShutdown.")
                    sys.exit(0)

            if not message.strip():
                continue

            # PYUI-02: Detect local commands (D-06)
            if message.strip().startswith("/"):
                _handle_command(message.strip(), config)
                continue

            # Normal chat flow
            _stream_response(config, message)
            _console().print("")
    finally:
        stop_mode()  # Clean up voice mode threads on exit


def _stream_response(config: JarvisConfig, message: str) -> None:
    """Send message to gateway and stream SSE response to stdout, then speak via TTS.

    Uses urllib.request (stdlib-only, consistent with health.py — CLAUDE.md constraint).
    Timeout of 30 seconds prevents indefinite hangs (research pitfall 4).
    Buffer accumulation prevents chunk-boundary token drops (research pitfall 1).

    Phase 75 adds: accumulate full_response during stream; call speak() after stream
    completes (D-01). Text display unchanged — tokens still printed in real-time.
    """
    url = (
        config.gateway_url.rstrip("/")
        + "/api/chat/stream"
        + "?message="
        + urllib.parse.quote(message, safe="")
    )
    headers = build_request_headers(config.api_key)

    from jarvis_desktop import ui as _ui
    try:
        req = urllib.request.Request(url, headers=headers)
        _ui.set_state("thinking")   # D-04: status → thinking while waiting for gateway
        with urllib.request.urlopen(req, timeout=30) as response:
            buffer = ""
            full_response: list = []  # accumulate for TTS (D-01)
            while True:
                raw = response.read(1024)
                if not raw:
                    break
                chunk = raw.decode("utf-8", errors="replace")
                tokens, buffer = parse_sse_chunk(chunk, buffer)
                for token in tokens:
                    _console().print(token, end="")  # real-time token display
                    full_response.append(token)  # accumulate for TTS
            _console().print("")  # Final newline after full response
            _ui.set_state("idle")   # D-04: status → idle after stream completes
            # D-01: Speak full response after stream completes
            full_text = "".join(full_response)
            if full_text.strip():
                speak(full_text, config)
    except URLError:
        _ui.set_state("idle")
        _console().print("\n[erro: conexão perdida]")  # D-08: partial tokens already printed above
    except Exception as exc:  # noqa: BLE001
        _ui.set_state("idle")
        _console().print(f"\n[erro: {exc}]")  # D-08: never crash — show error and return


# ---------------------------------------------------------------------------
# Config menu (PYUI-02)
# ---------------------------------------------------------------------------

def _handle_command(command: str, config: JarvisConfig) -> None:
    """Handle local / commands (D-06).

    /config: Opens config menu with voice modes paused (D-07, D-08).
    Unknown commands: print error message, do not send to gateway.

    Args:
        command: stripped input string starting with "/" (e.g. "/config")
        config: JarvisConfig instance (mutated by menu functions)
    """
    from jarvis_desktop import ui, voice_modes
    from jarvis_desktop.config import save_config

    console = ui.get_console()

    if command == "/config":
        ui.set_state("idle")           # D-08: idle while in menu
        voice_modes.stop_mode()        # D-07: pause voice capture during menu input

        try:
            _show_config_menu(config)
        finally:
            # D-07: always resume voice mode, even if menu raises
            voice_modes.start_mode(config.voice_mode, config)
            save_config(config)        # D-11: persist after menu
    else:
        console.print(f"[Comando desconhecido: {command!r}. Use /config]", highlight=False)


def _show_config_menu(config: JarvisConfig) -> None:
    """Interactive terminal config menu (D-09, D-10, D-11).

    Presents 3 fields via numbered list. Each selection applies immediately.
    Returns when user selects 0 (Sair) or presses Ctrl+C.

    Args:
        config: JarvisConfig instance — mutated in-place for each field change
    """
    from jarvis_desktop import ui
    console = ui.get_console()

    while True:
        console.print()
        console.print("-" * 40, highlight=False)
        console.print("[bold]Config JARVIS[/bold]")
        console.print("-" * 40, highlight=False)
        console.print(f"1. Whisper model  [[{config.whisper_model}]]", highlight=False)
        console.print(f"2. TTS provider   [[{config.tts_provider}]]", highlight=False)
        console.print(f"3. Voice mode     [[{config.voice_mode}]]", highlight=False)
        console.print("0. Sair", highlight=False)
        console.print()

        try:
            choice = ui.get_input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            return

        if choice == "0":
            return
        elif choice == "1":
            _menu_whisper_model(config)
        elif choice == "2":
            _menu_tts_provider(config)
        elif choice == "3":
            _menu_voice_mode(config)
        else:
            console.print(f"[Opção inválida: {choice!r}]", highlight=False)


def _menu_whisper_model(config: JarvisConfig) -> None:
    """Whisper model selection sub-menu (D-11: applies immediately via stt.reload_model()).

    Args:
        config: JarvisConfig mutated in-place (whisper_model field updated on selection)
    """
    from jarvis_desktop import ui, stt
    from jarvis_desktop.config import save_config

    console = ui.get_console()
    models = ["tiny", "base", "small", "medium", "large-v3-turbo"]

    console.print()
    console.print("Whisper Models:", highlight=False)
    for i, m in enumerate(models, 1):
        marker = "[x]" if m == config.whisper_model else "[ ]"
        console.print(f"  {i}. {m} {marker}", highlight=False)
    console.print()

    try:
        raw = ui.get_input("Selecione (1-5, Enter para cancelar): ").strip()
        if not raw:
            return
        idx = int(raw) - 1
        if 0 <= idx < len(models):
            new_model = models[idx]
            if new_model == config.whisper_model:
                console.print(f"[STT] Já usando {new_model}.", highlight=False)
                return
            try:
                stt.reload_model(new_model)  # D-11: apply immediately
                config.whisper_model = new_model
                save_config(config)           # D-11: persist
            except RuntimeError as exc:
                console.print(f"[Erro ao carregar modelo: {exc}]", highlight=False)
        else:
            console.print("[Seleção fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada inválida — insira um número]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass


def _menu_tts_provider(config: JarvisConfig) -> None:
    """TTS provider selection sub-menu (D-11: applies immediately via tts.set_provider()).

    Args:
        config: JarvisConfig mutated in-place (tts_provider field updated on selection)
    """
    from jarvis_desktop import ui, tts
    from jarvis_desktop.config import save_config

    console = ui.get_console()
    providers = ["kokoro", "elevenlabs", "murf"]

    console.print()
    console.print("TTS Providers:", highlight=False)
    for i, p in enumerate(providers, 1):
        marker = "[x]" if p == config.tts_provider else "[ ]"
        console.print(f"  {i}. {p} {marker}", highlight=False)
    console.print()

    try:
        raw = ui.get_input("Selecione (1-3, Enter para cancelar): ").strip()
        if not raw:
            return
        idx = int(raw) - 1
        if 0 <= idx < len(providers):
            new_provider = providers[idx]
            if new_provider == config.tts_provider:
                console.print(f"[TTS] Já usando {new_provider}.", highlight=False)
                return
            try:
                tts.set_provider(new_provider, config)  # D-11: apply immediately (also writes config.tts_provider)
                config.tts_provider = new_provider       # Ensure field is updated even if set_provider is mocked
                save_config(config)                      # D-11: persist
            except ValueError as exc:
                console.print(f"[Erro: {exc}]", highlight=False)
        else:
            console.print("[Seleção fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada inválida — insira um número]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass


def _menu_voice_mode(config: JarvisConfig) -> None:
    """Voice mode selection sub-menu (D-11: applies via voice_modes.switch_mode()).

    Note: switch_mode() handles hot-swap AND save_config() internally.
    The menu does not need to call save_config() separately for voice mode.

    Args:
        config: JarvisConfig mutated in-place (voice_mode field updated by switch_mode)
    """
    from jarvis_desktop import ui, voice_modes

    console = ui.get_console()
    modes = ["ptt", "always_listening", "wake_word"]

    console.print()
    console.print("Voice Modes:", highlight=False)
    for i, m in enumerate(modes, 1):
        marker = "[x]" if m == config.voice_mode else "[ ]"
        console.print(f"  {i}. {m} {marker}", highlight=False)
    console.print()

    try:
        raw = ui.get_input("Selecione (1-3, Enter para cancelar): ").strip()
        if not raw:
            return
        idx = int(raw) - 1
        if 0 <= idx < len(modes):
            new_mode = modes[idx]
            if new_mode == config.voice_mode:
                console.print(f"[VOICE] Já em modo {new_mode}.", highlight=False)
                return
            # switch_mode() does: config.voice_mode = new_mode, save_config(), start_mode()
            # Since we're inside _handle_command's stop_mode() pause, switch_mode() will
            # call start_mode() immediately — _handle_command's finally block will then
            # call start_mode() again with the same mode (idempotent per voice_modes.py).
            voice_modes.switch_mode(new_mode, config)
            console.print(f"[VOICE] Modo {new_mode} ativado.", highlight=False)
        else:
            console.print("[Seleção fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada inválida — insira um número]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass
