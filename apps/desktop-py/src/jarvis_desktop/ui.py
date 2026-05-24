"""JARVIS terminal UI singleton with persistent rich.Live status line.

Phase 77: Adds persistent status bar showing [MODE | MODEL | STATE] at terminal bottom.

Public API:
  init_ui() -> None               — initialize Console and start Live display (Step 0 in __main__.py)
  console: Console                — global Console instance; import and use instead of print()
  get_console() -> Console        — explicit accessor for the Console singleton
  set_state(state: str) -> None   — update state display: "idle"|"listening"|"thinking"|"speaking"
  set_config(config) -> None      — store shared config reference for status line rendering
  cleanup_ui() -> None            — stop Live display cleanly on exit

Internal (exposed for tests):
  _build_status_text() -> str     — render status line text from live config + current state

Decisions honored:
  D-01: Console singleton replaces all print() across modules
  D-02: rich.Live + Layout, status fixed at bottom (size=2)
  D-03: Flat module pattern matching stt.py, tts.py, voice_modes.py
  D-04: Modules call set_state() at correct transition points
  D-05: 4 valid states: idle / listening / thinking / speaking
  Threading: No print() from non-main threads while Live is active (Pitfall 1 prevention)
             Console is initialized once; Live wraps it; callers use console.print() only.
"""
import threading
from typing import Optional, Any

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.text import Text

# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------
_console: Optional[Console] = None
_live: Optional[Live] = None
_current_state: str = "idle"
_config_ref: Optional[Any] = None  # JarvisConfig reference (set via set_config())
_active_stt_model: Optional[str] = None  # Overrides config.whisper_model in status line (set by stt.py)
_lock = threading.Lock()
_live_started: bool = False

# State → display color mapping
_STATE_COLORS = {
    "idle": "white",
    "listening": "green",
    "transcribing": "blue",
    "thinking": "yellow",
    "speaking": "cyan",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def init_ui() -> None:
    """Initialize Console and start Live display. Must be called before any output.

    Safe to call multiple times — subsequent calls after first are no-ops.
    Call as Step 0 in __main__.py before any other init (health check, STT, TTS).
    """
    global _console, _live, _live_started

    if _live is not None:
        return  # Already initialized

    with _lock:
        if _live is not None:
            return  # Double-checked locking

        _console = Console()

        # Live renders only the status panel — console.print() output scrolls above it naturally.
        # No Layout needed: Layout fills the whole terminal; a bare renderable stays at bottom.
        _live = Live(
            _build_status_panel(),
            console=_console,
            refresh_per_second=4,
            transient=True,  # erase on stop so panel doesn't stamp duplicate lines on restart
        )
        _live.start()
        _live_started = True


def get_console() -> Console:
    """Return the global Console singleton.

    Auto-initializes if init_ui() was not called (safe fallback for tests).
    """
    global _console
    if _console is None:
        init_ui()
    return _console  # type: ignore[return-value]


# Module-level attribute — modules import `from jarvis_desktop.ui import console` only if
# they need the Console at module load time. Prefer get_console() for lazy access.
console: Optional[Console] = None  # Populated after init_ui()


def set_state(state: str) -> None:
    """Update status line state (D-04, D-05).

    Valid states: "idle", "listening", "thinking", "speaking"
    Invalid states are silently ignored (defensive coding).

    Thread-safe: may be called from TTS thread, voice_modes daemon threads, or main thread.
    """
    global _current_state

    if state not in ("idle", "listening", "transcribing", "thinking", "speaking"):
        return  # D-05: ignore invalid states

    with _lock:
        _current_state = state
        if _live is None:
            return  # Not initialized yet — silently ignore

        _live.update(_build_status_panel())


def set_active_stt_model(model_name: str) -> None:
    """Override the model name shown in the status bar (called by stt.py after backend init)."""
    global _active_stt_model
    _active_stt_model = model_name


def set_config(config: Any) -> None:
    """Store shared JarvisConfig reference for status line rendering (Pitfall 4 prevention).

    The status line reads voice_mode and whisper_model from this reference at render time,
    so config changes (from config menu) are reflected immediately without explicit refresh.

    Args:
        config: JarvisConfig instance from __main__.py
    """
    global _config_ref, _layout, _live

    with _lock:
        _config_ref = config
        if _live is None:
            return  # Not initialized yet

        _live.update(_build_status_panel())


def cleanup_ui() -> None:
    """Stop Live display cleanly. Call on application exit (in __main__.py finally block)."""
    global _live, _live_started
    if _live is not None:
        try:
            _live.stop()
            _live_started = False
        except Exception:
            pass  # Best-effort cleanup


def live_paused():
    """Context manager: stop Live rendering, yield, then restart.

    Uses _live_started flag to distinguish between Live instance existing
    but stopped (nested call) versus Live genuinely running.
    Nested calls (live already stopped by outer context) are no-ops.
    """
    from contextlib import contextmanager

    @contextmanager
    def _ctx():
        global _live, _live_started
        was_started = _live_started
        if was_started:
            _live.stop()
            _live_started = False
        try:
            yield
        finally:
            if was_started and _live is not None:
                try:
                    _live.start()
                    _live_started = True
                except Exception:
                    pass  # Best-effort — don't mask original exception or crash on shutdown

    return _ctx()


def get_input(prompt: str = "") -> str:
    """Get user input with Live display paused to prevent terminal echo interference.

    rich.Live's background refresh loop repositions the cursor and breaks terminal
    echo when input() is called concurrently. Stopping Live before input() and
    restarting after is the correct pattern.
    """
    global _live, _live_started
    if _live is None or not _live_started:
        return input(prompt)
    _live.stop()
    _live_started = False
    try:
        return input(prompt)
    finally:
        if _live is not None:
            try:
                _live.start()
                _live_started = True
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Internal helpers (exposed for tests)
# ---------------------------------------------------------------------------

def _build_status_text() -> str:
    """Build status line text string from live config and current state.

    Exposed at module level for unit tests (test_ui.py::test_status_line_format).
    Format: [ mode | model | state ]
    """
    if _config_ref is not None:
        mode = getattr(_config_ref, "voice_mode", "?")
        model = _active_stt_model if _active_stt_model else getattr(_config_ref, "whisper_model", "?")
    else:
        mode = "?"
        model = "?"

    state = _current_state
    return f"[ {mode} | {model} | {state} ]"


def _build_status_panel() -> Panel:
    """Build rich Panel for the status layout pane."""
    status_text = _build_status_text()
    color = _STATE_COLORS.get(_current_state, "white")
    styled = Text(status_text, style=color, justify="left")
    return Panel(styled, border_style="dim white", padding=(0, 1))
