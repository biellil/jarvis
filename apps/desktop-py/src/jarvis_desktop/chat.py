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
Phase 78: Agentic SSE protocol — parse named events (task:plan, task:awaiting-confirmation,
          task:step:*, task:done, task:error). LLM planning tokens buffered silently;
          plan rendered formatted on task:plan. Task metadata hidden by default.
          /debug toggle shows raw events. POST /api/tasks/:taskId/resume for confirmation.

Decisions honored:
  D-01: TTS after full stream completes — speak(full_text, config) after SSE loop
  D-02: input('> ') prompt
  D-05/D-06: api_key from config, injected as Bearer token if non-empty
  D-08: mid-stream failure → print partial tokens + \\n[erro: conexão perdida]
  D-09: gateway offline at startup → print error + sys.exit(1); loop not entered
  D-11: task metadata events suppressed; /debug reveals raw event stream
"""
import json
import sys
import urllib.parse
import urllib.request
from urllib.error import URLError

from jarvis_desktop.config import JarvisConfig
from jarvis_desktop.health import check_health
from jarvis_desktop.tts import speak

# Debug mode — toggled by /debug command; shows raw agentic events
_debug_mode: bool = False


def _console():
    """Lazy accessor for ui console — avoids circular import at module level."""
    from jarvis_desktop import ui
    return ui.get_console()


# ---------------------------------------------------------------------------
# SSE parsing helpers
# ---------------------------------------------------------------------------

def parse_sse_line(line: str):
    """Parse a single SSE data line and return the payload, or None.

    Returns:
        str  — data payload (may be empty string for "data: " lines)
        None — for comment lines (:), event lines, id lines, or empty lines
    """
    if line.startswith("data: "):
        return line[6:]
    return None


def parse_sse_chunk(chunk: str, buffer: str) -> tuple:
    """Accumulate SSE chunk and extract (event_type, payload) tuples.

    Each complete SSE event (separated by \\n\\n) yields:
      - Named event (has event: line): one (event_name, data_str) tuple
      - Plain data-only lines (no event:): one (None, token) tuple per data: line

    Handles chunk-boundary splits — incomplete event tail kept in buffer.

    Args:
        chunk:  New data received from read(1024).
        buffer: Incomplete event tail from previous call. Pass "" for first call.

    Returns:
        (events, new_buffer):
            events     — list of (event_type, payload) tuples
            new_buffer — incomplete tail (pass back to next call)
    """
    combined = buffer + chunk
    # SSE events are terminated by double newline
    parts = combined.split("\n\n")
    incomplete = parts[-1]  # last part may be an incomplete event

    events = []
    for part in parts[:-1]:
        if not part.strip():
            continue
        lines = [line.rstrip("\r") for line in part.split("\n")]
        event_type = None
        data_lines = []
        for line in lines:
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data_lines.append(line[6:])

        if not data_lines:
            continue

        if event_type is not None:
            # Named event: single tuple (join multiple data: lines per SSE spec)
            events.append((event_type, "\n".join(data_lines)))
        else:
            # Plain tokens: one tuple per data: line (preserves token-by-token stream)
            for payload in data_lines:
                events.append((None, payload))

    return events, incomplete


def build_request_headers(api_key: str, client_id: str = "") -> dict:
    """Build HTTP headers for gateway requests.

    Includes Authorization Bearer if api_key is non-empty (D-06, Phase 73).
    Includes x-jarvis-client-id if client_id is non-empty (D-02, Phase 84).
    """
    headers: dict = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if client_id:
        headers["x-jarvis-client-id"] = client_id
    return headers


# ---------------------------------------------------------------------------
# Health gate
# ---------------------------------------------------------------------------

def run_with_health_check(config: JarvisConfig) -> None:
    """Verify gateway is reachable. Exits with code 1 if not."""
    health = check_health(config.gateway_url)
    if health.get("gateway") == "ok":
        backend_status = health.get("backend", "unknown")
        _console().print(f"Gateway: online  (backend: {backend_status})")
    else:
        _console().print(f"Gateway: offline — {health.get('message', health.get('gateway', 'unreachable'))}")
        _console().print("Chat requires gateway. Exiting.")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Agentic event helpers
# ---------------------------------------------------------------------------

def _render_plan(steps: list) -> None:
    """Print plan steps in a readable format."""
    _console().print("")
    _console().print("[bold]Plano:[/bold]")
    for step in steps:
        _console().print(f"  {step.get('id', '?')}. {step.get('description', '')}", markup=False)
    _console().print("")


def _post_task_resume(config: JarvisConfig, task_id: str, kind: str, feedback: str = "") -> None:
    """POST to /api/tasks/:taskId/resume and consume the follow-up SSE stream.

    Uses main_stream=True so the LLM's reply gets the [jarvis] label and TTS.
    """
    url = config.gateway_url.rstrip("/") + f"/api/tasks/{task_id}/resume"
    body: dict = {"kind": kind}
    if feedback:
        body["feedback"] = feedback
    request_bytes = json.dumps(body).encode()
    headers = {"Content-Type": "application/json", **build_request_headers(config.api_key, getattr(config, 'client_id', ''))}
    try:
        req = urllib.request.Request(url, data=request_bytes, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            text = _read_sse_stream(response, config, accumulate_for_tts=True, main_stream=True)
        if text.strip():
            speak(text, config)
    except URLError as exc:
        _console().print(f"[erro ao resumir tarefa: {exc.reason}]")
    except Exception as exc:  # noqa: BLE001
        _console().print(f"[erro ao resumir tarefa: {exc}]")


def _post_action_ack(config: JarvisConfig, request_id: str, status: str, content: str = "") -> None:
    """POST action ACK to /api/actions/ack (Phase 84, REQ-84-05).

    Called after Python client executes (or refuses) a task:pc_action event dispatched
    via the SSE listener. Uses the gateway ACK endpoint instead of _post_task_resume.

    Args:
        config:     JarvisConfig with gateway_url and api_key.
        request_id: UUID from the task:pc_action event payload.
        status:     'confirmed' (executed), 'denied' (refused or timeout), 'timeout'.
        content:    Optional text content (for viewContent results).
    """
    if not request_id:
        _console().print("[SSE] Erro: requestId vazio — não foi possível enviar ACK")
        return
    url = config.gateway_url.rstrip("/") + "/api/actions/ack"
    body: dict = {"requestId": request_id, "status": status}
    if content:
        body["content"] = content
    request_bytes = json.dumps(body).encode()
    headers = {
        "Content-Type": "application/json",
        **build_request_headers(config.api_key, getattr(config, "client_id", "")),
    }
    try:
        req = urllib.request.Request(url, data=request_bytes, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as _:
            pass  # Silent success
    except URLError as exc:
        _console().print(f"[erro ao enviar ACK: {exc.reason}]")
    except Exception as exc:  # noqa: BLE001
        _console().print(f"[erro ao enviar ACK: {exc}]")


def _handle_agentic_event(event_type: str, payload: str, config: JarvisConfig) -> "str | None":
    """Dispatch a named SSE event to the appropriate handler.

    Returns displayable text (e.g. task:done summary) for the caller to accumulate.
    Unknown events and bare task metadata are suppressed unless /debug is active.
    """
    global _debug_mode

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        if _debug_mode or config.debug_events:
            _console().print(f"[debug] malformed event {event_type!r}: {payload!r}")
        return

    task_id = data.get("taskId", "")

    # D-05 (Phase 82): Filtro silencioso para eventos de progresso step
    # task:step:start e task:step:end só são exibidos quando agentic_step_progress=True
    if event_type in ("task:step:start", "task:step:end"):
        if not config.agentic_step_progress:
            # Supressão silenciosa — não exibir, retornar sem acumular para TTS
            if _debug_mode or config.debug_events:
                _console().print(f"[debug] {event_type} (suprimido — agentic_step_progress=False)")
            return None
        # Fall through para o handler abaixo quando flag=True

    if event_type == "task:plan":
        if _debug_mode or config.debug_events:
            steps = data.get("plan", {}).get("steps", [])
            _render_plan(steps)

    elif event_type == "task:awaiting-confirmation":
        if config.agentic_confirm:
            from jarvis_desktop import ui as _ui
            try:
                answer = _ui.get_input("Confirmar plano? [s/n]: ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                answer = "n"
            kind = "confirm" if answer in ("s", "sim", "y", "yes", "") else "cancel"
        else:
            kind = "confirm"  # auto-confirm when agentic_confirm=False (default)
        _post_task_resume(config, task_id, kind)

    elif event_type == "task:step:start":
        step_id = data.get("stepId", "?")
        description = data.get("description", "")
        _console().print(f"  [{step_id}] {description}...", markup=False)

    elif event_type == "task:step:end":
        step_id = data.get("stepId", "?")
        _console().print(f"  [{step_id}] concluído", markup=False)

    elif event_type == "task:done":
        summary = data.get("summary", "").strip()
        if summary:
            return summary  # caller (_read_sse_stream) prints with [jarvis] label + TTS
        # empty summary: silent completion

    elif event_type == "task:cancelled":
        _console().print("[Tarefa cancelada]")

    elif event_type == "task:error":
        error_msg = data.get("message", "erro desconhecido")
        _console().print(f"[Erro: {error_msg}]")

    elif event_type == "task:awaiting-failure-decision":
        step_id = data.get("stepId", "?")
        error = data.get("error", "erro desconhecido")
        _console().print(f"\n[Falha no passo {step_id}: {error}]", markup=False)
        from jarvis_desktop import ui as _ui
        try:
            answer = _ui.get_input("Tentar novamente? [s/n]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            answer = "n"
        kind = "confirm" if answer in ("s", "sim", "y", "yes") else "cancel"
        _post_task_resume(config, task_id, kind)

    elif event_type == "task:pc_action":
        from jarvis_desktop import pc_control  # noqa: PLC0415
        from jarvis_desktop import ui as _ui  # noqa: PLC0415
        from pathlib import Path  # noqa: PLC0415

        action = data.get("action", "")
        params = data.get("params", {})
        request_id = data.get("requestId", "")

        # D-06: viewContent is OUT OF SCOPE for Phase 84 Python dispatch — return unsupported immediately
        if action == "viewContent":
            _post_action_ack(config, request_id, "denied", "viewContent unsupported in Python client (Phase 84 scope: openFolder/openFile/closeFile only)")
            return

        # D-05: Ask for confirmation before executing open actions (Phase 84)
        confirmed = True
        if action in ("openFolder", "openFile"):
            path_display = params.get("path", "?")
            action_label = "abrir pasta" if action == "openFolder" else "abrir arquivo"
            try:
                filename = Path(path_display).name or path_display
            except Exception:
                filename = path_display
            prompt = f"Confirmar: {action_label} {filename}? [s/n] (5s): "
            # Reuse confirm_destructive with 5s timeout (D-05: non-destructive confirmation)
            confirmed = pc_control.confirm_destructive(prompt, timeout=5)

        if confirmed:
            _ui.set_state("executing_pc_action")
            try:
                result = pc_control.execute_pc_action(action, params, config)
            finally:
                _ui.set_state("idle")

            if result.get("result") == "ok":
                content = result.get("content") or ""
                _post_action_ack(config, request_id, "confirmed", content)
            elif result.get("result") == "aborted":
                _post_action_ack(config, request_id, "denied", "Ação abortada pelo usuário")
            else:
                error_msg = result.get("error", "Execução falhou")
                _post_action_ack(config, request_id, "denied", error_msg)
        else:
            _post_action_ack(config, request_id, "denied", "Ação recusada pelo usuário")

    elif event_type == "task:auto-approved":
        # D-05 (Phase 82): Plano auto-aprovado do cache — silencioso para o usuário
        # task:done com o resultado final é suficiente como feedback
        if _debug_mode or config.debug_events:
            _console().print("[debug] plano auto-aprovado do cache")
        return None  # Não acumular para TTS

    elif event_type == "action":
        # Phase 80 (D-01): non-agentic PC action (volume, media).
        # Gateway sends "args" key; normalize to "params" for execute_pc_action.
        # No task_id in payload → no _post_task_resume call.
        from jarvis_desktop import pc_control
        from jarvis_desktop import ui as _ui
        action = data.get("action", "")
        params = data.get("args", {})
        _ui.set_state("executing_pc_action")
        try:
            result = pc_control.execute_pc_action(action, params, config)
        finally:
            _ui.set_state("idle")
        if result.get("result") != "ok":
            error_msg = result.get("error", "ação falhou")
            _console().print(f"[Erro: {error_msg}]")
        # Silent success for simple volume/media commands

    else:
        # Bare metadata events (task:awaiting-confirmation ack, etc.) — suppress by default
        if _debug_mode or config.debug_events:
            _console().print(f"[debug] {event_type}: {payload}")


# ---------------------------------------------------------------------------
# Core SSE stream reader
# ---------------------------------------------------------------------------

_LABEL_YOU = "[bold cyan]\\[você][/bold cyan]"
_LABEL_JARVIS = "[bold green]\\[jarvis][/bold green]"
# Continuation indent aligns with text after "[jarvis] " (9 chars)
_RESPONSE_INDENT = " " * 9


def _read_sse_stream(
    response,
    config: JarvisConfig,
    accumulate_for_tts: bool = True,
    main_stream: bool = False,
) -> str:
    """Read SSE stream from open response, handle events, return accumulated text.

    Plain tokens are collected and printed as one complete block after the stream ends.
    Named events (agentic: task:plan, task:step:*, task:done, etc.) are dispatched to
    _handle_agentic_event which prints them immediately. This avoids cursor-positioning
    issues from printing partial lines (end="") while Rich Live is stopped via transient=True.

    Returns accumulated plain-text content (for TTS when accumulate_for_tts=True).
    """
    buffer = ""
    all_tokens: list[str] = []

    while True:
        raw = response.read(1024)
        if not raw:
            break
        chunk = raw.decode("utf-8", errors="replace")
        events, buffer = parse_sse_chunk(chunk, buffer)

        for event_type, payload in events:
            if event_type is None:
                all_tokens.append(payload.replace("\\n", "\n"))
            else:
                if event_type == "task:plan":
                    all_tokens.clear()  # discard planning-phase LLM tokens, keep only final answer
                agent_text = _handle_agentic_event(event_type, payload, config)
                if agent_text and accumulate_for_tts:
                    all_tokens.clear()  # task:done summary supersedes any streamed tokens
                    all_tokens.append(agent_text)

    # Flush any trailing incomplete event left in buffer after connection closes
    if buffer.strip():
        final_events, _ = parse_sse_chunk("\n\n", buffer)
        for event_type, payload in final_events:
            if event_type is None:
                all_tokens.append(payload.replace("\\n", "\n"))
            else:
                if event_type == "task:plan":
                    all_tokens.clear()
                agent_text = _handle_agentic_event(event_type, payload, config)
                if agent_text and accumulate_for_tts:
                    all_tokens.clear()
                    all_tokens.append(agent_text)

    # Print complete response via sys.stdout.write() — bypasses Rich cursor management
    # that truncates wrapped lines when transient=True is active on the Live panel.
    full_text = "".join(all_tokens)
    if full_text.strip():
        display = full_text.rstrip("\n").replace("\n", "\n" + _RESPONSE_INDENT)
        if main_stream:
            # ANSI: bold (\x1b[1m) + green (\x1b[32m) + reset (\x1b[0m)
            sys.stdout.write(f"\x1b[1m\x1b[32m[jarvis]\x1b[0m {display}\n")
        else:
            sys.stdout.write(f"{_RESPONSE_INDENT}{display}\n")
        sys.stdout.flush()
    else:
        sys.stdout.write("\n")
        sys.stdout.flush()
    return full_text


# ---------------------------------------------------------------------------
# Stream response (main entry point for sending a message)
# ---------------------------------------------------------------------------

def _stream_response(config: JarvisConfig, message: str) -> None:
    """Send message to gateway and stream SSE response to stdout, then speak via TTS."""
    url = (
        config.gateway_url.rstrip("/")
        + "/api/chat/stream"
        + "?message="
        + urllib.parse.quote(message, safe="")
    )
    headers = build_request_headers(config.api_key, getattr(config, 'client_id', ''))

    from jarvis_desktop import ui as _ui
    try:
        req = urllib.request.Request(url, headers=headers)
        _ui.set_state("thinking")
        with urllib.request.urlopen(req, timeout=None) as response:
            full_text = _read_sse_stream(response, config, accumulate_for_tts=True, main_stream=True)
        _ui.set_state("idle")
        if full_text.strip():
            speak(full_text, config)
    except URLError:
        _ui.set_state("idle")
        _console().print("\n[erro: conexão perdida]")
    except Exception as exc:  # noqa: BLE001
        _ui.set_state("idle")
        _console().print(f"\n[erro: {exc}]")


# ---------------------------------------------------------------------------
# Chat loop
# ---------------------------------------------------------------------------

def _await_input(text_queue) -> tuple:
    """Block until voice OR keyboard input arrives. Returns (text, is_voice).

    On Windows: polls msvcrt every 20ms so voice queue is checked while typing.
    Drops control characters (^Q, ^S, etc.) so PTT keys don't corrupt the line.
    On other platforms: falls back to blocking input() (voice won't interrupt it).
    """
    import sys
    from queue import Empty

    # Fast path: voice already waiting
    try:
        return text_queue.get_nowait(), True
    except Empty:
        pass

    if sys.platform != "win32":
        from jarvis_desktop import ui as _ui
        try:
            return _ui.get_input("> "), False
        except (EOFError, KeyboardInterrupt):
            raise

    # Windows: character-by-character polling
    import msvcrt
    import time
    from jarvis_desktop import ui as _ui

    if _ui._live_started and _ui._live:
        _ui._live.stop()
        _ui._live_started = False
    chars: list = []
    try:
        sys.stdout.write("> ")
        sys.stdout.flush()

        _pending_surrogate = ""
        while True:
            # Check voice queue every tick
            try:
                msg = text_queue.get_nowait()
                # Clear current input line before returning
                if chars:
                    sys.stdout.write("\r> " + " " * len(chars) + "\r> ")
                    sys.stdout.flush()
                    chars.clear()
                return msg, True
            except Empty:
                pass

            if not msvcrt.kbhit():
                time.sleep(0.02)
                continue

            raw = msvcrt.getwch()

            if raw in ("\x00", "\xe0"):   # special key (arrows, F-keys) — skip both bytes
                msvcrt.getwch()
                continue
            if raw == "\r":               # Enter
                sys.stdout.write("\n")
                sys.stdout.flush()
                return "".join(chars), False
            if raw == "\x03":             # Ctrl+C
                sys.stdout.write("\n")
                sys.stdout.flush()
                raise KeyboardInterrupt
            if raw in ("\x04", "\x1a"):   # Ctrl+D / Ctrl+Z (EOF)
                sys.stdout.write("\n")
                sys.stdout.flush()
                raise EOFError
            if raw == "\x08":             # Backspace
                if chars:
                    chars.pop()
                    sys.stdout.write("\b \b")
                    sys.stdout.flush()
                continue
            if ord(raw) < 32:             # Any other control char (^Q etc.) — drop silently
                continue

            # Handle UTF-16 surrogate pairs from msvcrt.getwch() on Windows
            if "\ud800" <= raw <= "\udbff":   # high surrogate — hold and wait for low
                _pending_surrogate = raw
                continue
            if "\udc00" <= raw <= "\udfff":   # low surrogate — join with pending high
                if _pending_surrogate:
                    raw = _pending_surrogate + raw  # form the surrogate pair string
                    _pending_surrogate = ""
                else:
                    continue                        # orphan low surrogate — drop silently
            else:
                _pending_surrogate = ""             # non-surrogate resets any pending high

            chars.append(raw)
            try:
                sys.stdout.write(raw)
            except UnicodeEncodeError:
                pass  # drop unencodable character silently rather than crashing
            sys.stdout.flush()
    finally:
        try:
            if _ui._live and not _ui._live_started:
                _ui._live.start()
                _ui._live_started = True
        except Exception:
            pass


def chat_loop(config: JarvisConfig) -> None:
    """Chat loop consuming from voice_modes queue and keyboard input."""
    from jarvis_desktop.voice_modes import get_text_queue, stop_mode

    global _debug_mode
    text_queue = get_text_queue()
    _debug_mode = config.debug_events

    _console().print("Chat ready. Type messages and press Enter, or use voice mode. Ctrl+C to exit.")
    _console().print("")

    try:
        while True:
            try:
                message, is_voice = _await_input(text_queue)
            except (EOFError, KeyboardInterrupt):
                _console().print("\nShutdown.")
                sys.exit(0)

            if not message.strip():
                continue

            if message.strip().startswith("/"):
                _handle_command(message.strip(), config)
                continue

            from jarvis_desktop import ui as _ui
            # Stop Live once; _await_input will restart it on the next iteration.
            # transient=True cursor-up clears the panel and puts cursor just below the prompt.
            if _ui._live_started and _ui._live:
                _ui._live.stop()
                _ui._live_started = False
            if is_voice:
                _console().print(f"{_LABEL_YOU} {message} [dim](voz)[/dim]", highlight=False)
            else:
                _console().print(f"{_LABEL_YOU} {message}", highlight=False)
            _stream_response(config, message)
            _console().print("")
    finally:
        stop_mode()


# ---------------------------------------------------------------------------
# Config menu (PYUI-02)
# ---------------------------------------------------------------------------

def _handle_command(command: str, config: JarvisConfig) -> None:
    """Handle local / commands.

    /config: Opens config menu with voice modes paused.
    /debug:  Toggles raw agentic event visibility (D-11).
    Unknown: print error, do not send to gateway.
    """
    global _debug_mode
    from jarvis_desktop import ui, voice_modes
    from jarvis_desktop.config import save_config

    console = ui.get_console()

    if command == "/config":
        ui.set_state("idle")
        voice_modes.stop_mode()
        try:
            _show_config_menu(config)
        finally:
            voice_modes.start_mode(config.voice_mode, config)
            save_config(config)

    elif command == "/debug":
        _debug_mode = not _debug_mode
        config.debug_events = _debug_mode
        save_config(config)
        status = "ativado" if _debug_mode else "desativado"
        console.print(f"[debug] modo debug {status}")

    else:
        console.print(f"[Comando desconhecido: {command!r}. Use /config ou /debug]", highlight=False)


def _show_config_menu(config: JarvisConfig) -> None:
    """Interactive terminal config menu."""
    from jarvis_desktop import ui
    console = ui.get_console()

    while True:
        console.print()
        console.print("-" * 40, highlight=False)
        console.print("[bold]Config JARVIS[/bold]")
        console.print("-" * 40, highlight=False)
        console.print(f"1. Whisper model      [{config.whisper_model}]", markup=False)
        console.print(f"2. TTS provider       [{config.tts_provider}]", markup=False)
        console.print(f"3. Voice mode         [{config.voice_mode}]", markup=False)
        console.print(f"4. Confirmar planos   [{'sim' if config.agentic_confirm else 'nao'}]", markup=False)
        console.print(f"5. Debug eventos      [{'sim' if config.debug_events else 'nao'}]", markup=False)
        console.print(f"6. Progresso tarefas  [{'sim' if config.agentic_step_progress else 'nao'}]", markup=False)
        console.print(f"7. Voz Kokoro         [{config.kokoro_voice}]", markup=False)
        console.print("0. Sair")
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
        elif choice == "4":
            config.agentic_confirm = not config.agentic_confirm
            status = "sim" if config.agentic_confirm else "nao"
            console.print(f"[Confirmar planos: {status}]", highlight=False)
        elif choice == "5":
            global _debug_mode
            config.debug_events = not config.debug_events
            _debug_mode = config.debug_events
            status = "sim" if config.debug_events else "nao"
            console.print(f"[Debug eventos: {status}]", highlight=False)
        elif choice == "6":
            config.agentic_step_progress = not config.agentic_step_progress
            status = "sim" if config.agentic_step_progress else "nao"
            console.print(f"[Progresso tarefas: {status}]", highlight=False)
        elif choice == "7":
            _menu_kokoro_voice(config)
        else:
            console.print(f"[Opção inválida: {choice!r}]", highlight=False)


def _menu_whisper_model(config: JarvisConfig) -> None:
    """Whisper model selection sub-menu."""
    from jarvis_desktop import ui, stt
    from jarvis_desktop.config import save_config

    console = ui.get_console()
    models = ["tiny", "base", "small", "medium", "large-v3-turbo"]

    console.print()
    console.print("Whisper Models:", highlight=False)
    for i, m in enumerate(models, 1):
        marker = "[x]" if m == config.whisper_model else "[ ]"
        console.print(f"  {i}. {m} {marker}", markup=False)
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
                stt.reload_model(new_model)
                config.whisper_model = new_model
                save_config(config)
            except RuntimeError as exc:
                console.print(f"[Erro ao carregar modelo: {exc}]", highlight=False)
        else:
            console.print("[Seleção fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada inválida — insira um número]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass


def _menu_tts_provider(config: JarvisConfig) -> None:
    """TTS provider selection sub-menu."""
    from jarvis_desktop import ui, tts
    from jarvis_desktop.config import save_config

    console = ui.get_console()
    providers = ["kokoro", "elevenlabs", "murf", "none"]

    console.print()
    console.print("TTS Providers:", highlight=False)
    for i, p in enumerate(providers, 1):
        marker = "[x]" if p == config.tts_provider else "[ ]"
        console.print(f"  {i}. {p} {marker}", markup=False)
    console.print()

    try:
        raw = ui.get_input("Selecione (1-4, Enter para cancelar): ").strip()
        if not raw:
            return
        idx = int(raw) - 1
        if 0 <= idx < len(providers):
            new_provider = providers[idx]
            if new_provider == config.tts_provider:
                console.print(f"[TTS] Já usando {new_provider}.", highlight=False)
                return
            try:
                tts.set_provider(new_provider, config)
                config.tts_provider = new_provider
                save_config(config)
            except ValueError as exc:
                console.print(f"[Erro: {exc}]", highlight=False)
        else:
            console.print("[Seleção fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada inválida — insira um número]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass


def _menu_voice_mode(config: JarvisConfig) -> None:
    """Voice mode selection sub-menu."""
    from jarvis_desktop import ui, voice_modes

    console = ui.get_console()
    modes = ["ptt", "always_listening", "wake_word"]

    console.print()
    console.print("Voice Modes:", highlight=False)
    for i, m in enumerate(modes, 1):
        marker = "[x]" if m == config.voice_mode else "[ ]"
        console.print(f"  {i}. {m} {marker}", markup=False)
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
            voice_modes.switch_mode(new_mode, config)
            console.print(f"[VOICE] Modo {new_mode} ativado.", highlight=False)
        else:
            console.print("[Seleção fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada inválida — insira um número]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass


def _menu_kokoro_voice(config: JarvisConfig) -> None:
    """Kokoro voice preset selection sub-menu.

    Lists available PT-BR Kokoro voices. Selecting one updates config.kokoro_voice
    and resets the Kokoro engine so the next speak() call uses the new voice.
    """
    from jarvis_desktop import ui, tts
    from jarvis_desktop.config import save_config

    console = ui.get_console()
    voices = ["pf_dora", "pm_alex", "pm_santa"]

    console.print()
    console.print("Vozes Kokoro:", highlight=False)
    for i, v in enumerate(voices, 1):
        marker = "[x]" if v == config.kokoro_voice else "[ ]"
        console.print(f"  {i}. {v} {marker}", markup=False)
    console.print()

    try:
        raw = ui.get_input("Selecione (1-3, Enter para cancelar): ").strip()
        if not raw:
            return
        idx = int(raw) - 1
        if 0 <= idx < len(voices):
            new_voice = voices[idx]
            if new_voice == config.kokoro_voice:
                console.print(f"[TTS] Ja usando {new_voice}.", highlight=False)
                return
            config.kokoro_voice = new_voice
            # Reset engine so next speak() lazy-initializes with new voice
            tts._engine = None
            save_config(config)
            console.print(f"[TTS] Voz Kokoro: {new_voice}.", highlight=False)
        else:
            console.print("[Selecao fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada invalida — insira um numero]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass
