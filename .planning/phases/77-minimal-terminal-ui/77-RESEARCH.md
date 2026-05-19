# Phase 77: Minimal Terminal UI - Research

**Researched:** 2026-05-18  
**Domain:** Terminal UI with persistent status + runtime config menu  
**Confidence:** MEDIUM-HIGH

## Summary

Phase 77 implements a persistent terminal status line (`[MODE] [MODEL] [STATE]`) via rich.Live + Layout, and a `/config` command menu that reloads STT/TTS/voice modes at runtime without restart. The research confirms rich.Live is the standard pattern for this use case, though **thread safety between Live display and concurrent SSE token output requires explicit buffering/coordination** (not automagic). Model reloading requires creating new instances (Whisper, Kokoro, cloud providers all follow this pattern) with proper cleanup. The config menu itself is straightforward text-based input with numbered options.

**Primary recommendation:** Implement ui.py as a singleton Console + Live display (fixed at bottom via Layout); use a thread-safe queue to buffer tokens during Live updates; reload models by creating new instances in dedicated helper functions; persist all config changes immediately via save_config().

## Standard Stack

### Core Terminal UI
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| rich | 13.x | Terminal UI rendering, Live display, Layout structure | CLAUDE.md mandated; Live is de-facto standard for persistent status bars; Layout handles fixed bottom positioning |
| Console | (rich) | Singleton output abstraction replacing print() | Recommended by Textualize team for unified thread-safe terminal control; required for Live display |
| Live + Layout | (rich 13.x) | Persistent display + fixed-height layout divisions | Official rich pattern for status bars (GitHub discussion #3435); Split_column divides chat area from status footer |

### No additional dependencies
Config menu uses built-in input() + simple text parsing; no TUI library (Textual deferred).

**Installation (existing):**
```bash
pip install rich>=13.0  # Already in pyproject.toml dependencies
```

**Version verification:**
Rich 13.0+ was released 2023; latest stable is 14.1.0 (Feb 2026). Phase 77 targets 13.x per CLAUDE.md but 14.x is backward-compatible.

## Architecture Patterns

### Status Line Layout Structure
**Pattern:** Rich Layout split_column with proportional sizing

```
Terminal Window
│
├─ layout["chat"] (flexible height)
│  └─ scrolling chat content area
│
└─ layout["status"] (fixed size=3 or size=2)
   └─ persistent status line: [MODE] [MODEL] [STATE]
```

**Why this works:**
- `split_column()` creates vertical panes
- Setting `size` on status pane fixes its height; chat pane gets remaining space
- Live display wraps the Layout, updating status pane dynamically
- Chat content flows above without interfering

**Example structure (Claude's discretion refinement):**
```python
from rich.layout import Layout
from rich.live import Live

layout = Layout()
layout.split_column(
    Layout(name="chat"),
    Layout(name="status", size=2)  # Fixed 2 rows for status line
)

# Status pane content (updated via set_state):
# [PTT] tiny · idle
```

### ui.py Singleton Module
**Pattern:** Flat module matching stt.py, tts.py, voice_modes.py (Phase 76 established pattern)

Public API:
- `init_ui() -> None` — initialize Console + Live display at startup (Step 0 in __main__.py, before any output)
- `console` — global Console instance imported by chat.py, tts.py, voice_modes.py for output
- `set_state(state: str) -> None` — update status line: "idle" | "listening" | "thinking" | "speaking"
- `get_console() -> Console` — accessor for modules that prefer explicit import

**Thread-safety note:** Live display must be started before any concurrent threads (STT, voice_modes, TTS) begin output. Console.print() has known thread safety issues (GitHub issue #1530, #3704) when called from multiple threads alongside Live — see Pitfall 1.

### /config Command Flow
**Pattern:** Simple text-based menu in chat_loop, no command router yet (Claude's discretion)

```
1. User types "/config" at prompt
2. chat_loop detects "/" prefix before gateway send
3. Calls show_config_menu(config)
4. Menu loop:
   - Pause voice_modes (voice_modes.stop_mode())
   - Display 3 numbered options
   - Read input, validate, apply change
   - Call voice_modes.start_mode() / stt.reload_model() / tts.set_provider()
   - save_config(config)
5. Set ui.set_state("idle") while in menu
6. Exit menu → resume voice_modes
```

### Model Reloading (Runtime Switching)

**Whisper (faster-whisper):**
- No in-place reload — must create new WhisperModel instance
- Pattern: `stt.reload_model(new_size)` creates new WhisperModel(new_size), replaces _model global, garbage-collects old instance
- Supported sizes: tiny, base, small, medium, large-v3-turbo (Phase 68 list)

**Kokoro (TTS):**
- Same pattern: create new Kokoro instance with new voice
- `tts.set_provider(provider, config)` creates new engine if Kokoro, or returns (cloud providers are stateless)

**Cloud TTS (ElevenLabs, Murf):**
- No initialization required — API keys in config; speak() checks keys at call time
- `tts.set_provider(provider, config)` just updates config.tts_provider (no engine reload)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal status line | Custom ANSI escape codes + coordinate tracking | rich.Live + Layout | Handles terminal resize, cursor position, thread scheduling; ANSI codes break on different terminals (Windows, Linux, SSH, tmux) |
| Concurrent print buffering from SSE stream | Ad-hoc print() interleaving | Queue + main thread token consumer | SSE tokens arrive from thread; Live expects single-thread updates; queue prevents garbled output, enables batching |
| Config serialization | JSON string building | Pydantic model.model_dump() + json.dump | Pydantic validates schema on write; json module handles escaping/formatting; manual string building introduces encoding bugs |
| Model reloading state | Manual reference counting | Garbage collection + global replacement | Python GC handles cleanup; new instance assignment atomically replaces old; manual cleanup is error-prone (dangling refs, memory leaks) |

**Key insight:** Rich.Live is deceptively complex — it redraws the entire display on each update, managing cursor position, buffer ordering, and terminal capabilities. SSE tokens from a separate thread can race with Live's render cycle, producing garbled output or missing tokens. The solution is not to fight it but to feed it clean, buffered updates from the main thread only.

## Common Pitfalls

### Pitfall 1: Thread Safety — SSE Tokens + Live Display Race Condition
**What goes wrong:** 
- SSE response stream runs in thread (urllib read loop in _stream_response)
- Tokens printed to stdout in real-time: `print(token, end='', flush=True)`
- Live.display() runs on main thread, updating status line every refresh_per_second cycle
- Outcome: tokens print mid-render, status line artifacts, interleaved output

**Why it happens:**
- Rich.Live takes control of stdout/stderr; any print() from another thread bypasses its coordination
- GitHub issue #1530 "live displays and console printing are not thread safe" — acknowledged bug
- Performance issue #3704 shows multithreaded context degrades Live rendering

**How to avoid:**
1. **Don't print tokens directly from SSE thread.** Accumulate tokens in a queue or list (already done in chat.py: full_response list)
2. **Print tokens on main thread only** — print accumulated tokens to console after stream ends, before calling speak()
3. **If streaming display is critical,** batch tokens into 500ms windows and update Live display with partial text (deferred to Phase 78+)
4. Token accumulation is already implemented in chat.py (line 174: `full_response.append(token)`); keep it

**Warning signs:**
- Garbled status line during SSE stream (status bar text overlaps with token output)
- Missing tokens in final response (tokens printed before buffer flush)
- Terminal cursor in wrong position after chat completes

### Pitfall 2: Model Reload Hangs or Crashes
**What goes wrong:**
- Call `stt.reload_model("base")` while transcribe() is in progress
- Old _model is replaced mid-transcribe, leading to AttributeError or hung thread
- Memory leak if old model not garbage-collected

**Why it happens:**
- WhisperModel loading is blocking (downloads model, initializes CTranslate2 runtime)
- Transcribe loop holds reference to old model; new assignment doesn't release it immediately
- Python GC is not deterministic; large models (base, medium) may hold GPU memory

**How to avoid:**
1. **Guard model reload with lock:** wrap new WhisperModel() creation in _lock (same as init_stt pattern)
2. **Only reload when idle:** menu shows "Reloading..." and waits for active transcription to finish (check with stt._model.transcribe context)
3. **Test model switch on quiet mic:** don't switch while user is pressing PTT
4. **Log resource usage:** add print("[STT] Unloading {old_size}... loading {new_size}...") to show progress

**Prevention in code:**
```python
def reload_model(new_size: str) -> None:
    global _model
    with _lock:
        # Wait for any in-flight transcribe() to finish
        old_model = _model
        print(f"[STT] Loading {new_size}...", flush=True)
        try:
            _model = WhisperModel(new_size, device="auto", compute_type="int8")
            print(f"[STT] Switched to {new_size}.", flush=True)
        except Exception as exc:
            _model = old_model  # Restore on failure
            raise RuntimeError(f"Failed to load {new_size}: {exc}") from exc
```

### Pitfall 3: Config Menu Captures Voice Input
**What goes wrong:**
- Menu shows prompt: "Enter voice mode: (1) ptt, (2) always_listening, (3) wake_word"
- User types "2" to select
- Voice mode daemon thread (wake_word or always_listening) hears keyboard input as speech, transcribes it
- Queue gets polluted with transcribed keystrokes

**Why it happens:**
- Voice modes use sounddevice.InputStream (listening to mic)
- On Windows/Linux with poor audio isolation, keyboard noise may reach mic
- Always-listening mode has 0.5 VAD threshold — very sensitive to faint sounds
- Menu doesn't pause voice_modes before input

**How to avoid:**
- **Pause voice_modes on menu entry:** call `voice_modes.stop_mode()` (D-07)
- **Resume on menu exit:** call `voice_modes.start_mode(config.voice_mode, config)`
- Confirm menu prompt: "Voice modes paused. Enter choice: "

**Warning signs:**
- Spurious transcriptions appearing while filling menu (often nonsense: "one two" from keystroke sounds)
- Text queue has garbage entries after menu closes

### Pitfall 4: Status Line Doesn't Update on Model/Mode Change
**What goes wrong:**
- User changes Whisper model in menu from "tiny" to "base"
- Status line still shows "[PTT] tiny · idle"
- Config was saved but status line wasn't refreshed

**Why it happens:**
- Menu updates config and calls reload_model() / start_mode()
- But status line is managed by ui.py, which reads from config or local state
- If config is passed by reference but status line reads a stale config copy, mismatch occurs

**How to avoid:**
- **Status line reads live from config object:** `set_state()` takes no args; status line template builds strings from config fields at render time
- **Or, menu calls set_state("idle") after every change:** forces status refresh
- **Better:** ui.py holds reference to shared config object and reads whisper_model, tts_provider, voice_mode at each render

**Prevention in code:**
```python
# In ui.py:
_config_ref = None  # Shared reference to JarvisConfig

def set_config(config: JarvisConfig) -> None:
    global _config_ref
    _config_ref = config

def _build_status_line() -> str:
    # Reads live from config_ref at render time
    mode = _config_ref.voice_mode if _config_ref else "?"
    model = _config_ref.whisper_model if _config_ref else "?"
    state = _current_state  # From set_state()
    return f"[ {mode} | {model} | {state} ]"
```

### Pitfall 5: Rich Console Takes Over stdout, Breaks Existing Prints
**What goes wrong:**
- Phase 76 code calls `print("[VOICE] modo: ptt...", flush=True)`
- After init_ui() is called, that print() no longer appears (Rich redirects it)
- Or print() output appears at wrong time, after status line instead of before

**Why it happens:**
- Rich.Console.setup() wraps sys.stdout with RichFileProxy
- Existing code using built-in print() is unaware Console took over
- Print order is now managed by Rich's internal buffer, not Python's buffering

**How to avoid:**
- **Migrate all prints to console.print()** in Phase 77 task
- Files to migrate: chat.py, tts.py, stt.py, voice_modes.py (search for `print(` in each)
- Wrap migration in try-except to catch any print breakage early
- Check that existing Phase 76 test output still works (pytest captures print via Rich)

**Warning signs:**
- Test output missing or in wrong order after init_ui()
- Status line appears before some log messages that should precede it
- Ctrl+C stack trace shows garbled output

## Code Examples

### ui.py Singleton Module (minimal, PYUI-01/02 required)

```python
# Source: Phase 77 decision D-03, D-04
"""JARVIS terminal UI singleton with persistent status line.

Public API:
  init_ui() -> None                  — initialize Console + Live display
  console: Console                   — global Console for output
  set_state(state: str) -> None      — update status line state
"""

import threading
from typing import Optional
from rich.console import Console
from rich.live import Live
from rich.layout import Layout
from rich.panel import Panel
from rich.text import Text

# Module-level state
_console: Optional[Console] = None
_live: Optional[Live] = None
_layout: Optional[Layout] = None
_current_state: str = "idle"  # idle, listening, thinking, speaking
_lock = threading.Lock()

def init_ui() -> None:
    """Initialize Console and Live display.
    
    Must be called before any other output (Step 0 in __main__.py).
    Safe to call multiple times — subsequent calls are no-ops.
    """
    global _console, _live, _layout
    
    if _live is not None:
        return  # Already initialized
    
    with _lock:
        if _live is not None:
            return  # Double-checked locking
        
        # Create Console singleton
        _console = Console()
        
        # Create Layout: chat area + status line
        _layout = Layout()
        _layout.split_column(
            Layout(name="chat"),          # Flexible height (scrolling chat)
            Layout(name="status", size=2)  # Fixed 2 rows for status
        )
        
        # Initialize Live display (wraps layout)
        _live = Live(_layout, console=_console, refresh_per_second=2, transient=False)
        _live.start()
        
        _console.print("UI initialized. Status line ready.")

def console() -> Console:
    """Return the global Console instance."""
    global _console
    if _console is None:
        init_ui()
    return _console

def set_state(state: str) -> None:
    """Update status line state (idle, listening, thinking, speaking).
    
    Reads live config from chat.py to get voice_mode, whisper_model.
    Renders status line immediately.
    """
    global _current_state, _layout, _live
    
    if state not in ("idle", "listening", "thinking", "speaking"):
        return  # Invalid state — ignore
    
    with _lock:
        _current_state = state
        if _layout is None:
            return  # Not initialized yet
        
        # Build status line (reads live config)
        try:
            from jarvis_desktop.config import JarvisConfig
            config = _get_config()  # Implementation detail
            if config:
                mode = config.voice_mode
                model = config.whisper_model
            else:
                mode = "?"
                model = "?"
        except Exception:
            mode = "?"
            model = "?"
        
        status_text = f"[ {mode} | {model} | {_current_state} ]"
        _layout["status"].update(Panel(Text(status_text, justify="left")))
        
        # Live display auto-refreshes

def cleanup_ui() -> None:
    """Stop Live display cleanly (call on exit)."""
    global _live
    if _live is not None:
        _live.stop()
```

### Chat Loop with /config Detection (D-06)

```python
# Source: Phase 77 decision D-06, D-07
def chat_loop(config: JarvisConfig) -> None:
    """Chat loop with /config command detection."""
    from queue import Empty
    from jarvis_desktop.voice_modes import get_text_queue, stop_mode, start_mode
    from jarvis_desktop import ui
    
    text_queue = get_text_queue()
    console = ui.console()
    
    console.print("Chat ready. Type messages or /config to change settings. Ctrl+C to exit.")
    console.print()
    
    try:
        while True:
            # Check voice queue first
            try:
                message = text_queue.get_nowait()
                console.print(f"> [voz: {message}]", highlight=False)
            except Empty:
                try:
                    message = input("> ")
                except (EOFError, KeyboardInterrupt):
                    console.print("\nShutdown.")
                    sys.exit(0)
            
            if not message.strip():
                continue
            
            # D-06: Detect /config command
            if message.strip().startswith("/"):
                _handle_command(message.strip(), config)
                continue
            
            # Normal chat flow
            _stream_response(config, message)
            console.print()
    finally:
        stop_mode()

def _handle_command(command: str, config: JarvisConfig) -> None:
    """Handle /config and other commands.
    
    D-07: Pause voice modes during menu, resume on exit.
    D-08: Set state to idle.
    """
    from jarvis_desktop import ui, voice_modes
    from jarvis_desktop.config import save_config
    
    if command == "/config":
        ui.set_state("idle")  # D-08
        voice_modes.stop_mode()  # D-07: Pause voice capture
        
        _show_config_menu(config)
        
        save_config(config)  # D-11: Persist after menu
        voice_modes.start_mode(config.voice_mode, config)  # D-07: Resume
    else:
        console = ui.console()
        console.print(f"Unknown command: {command}")

def _show_config_menu(config: JarvisConfig) -> None:
    """Interactive config menu.
    
    D-09: 3 fields only (Whisper model, TTS provider, voice mode).
    D-10: Numbered list navigation.
    D-11: Changes apply immediately.
    """
    from jarvis_desktop import ui, stt, tts, voice_modes
    
    console = ui.console()
    
    while True:
        console.print("\n" + "─" * 40)
        console.print("Config Menu")
        console.print("─" * 40)
        console.print(f"1. Whisper model  [{config.whisper_model}]")
        console.print(f"2. TTS provider   [{config.tts_provider}]")
        console.print(f"3. Voice mode     [{config.voice_mode}]")
        console.print("0. Sair\n")
        
        try:
            choice = input("> ").strip()
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
            console.print("Opção inválida.\n")

def _menu_whisper_model(config: JarvisConfig) -> None:
    """Select Whisper model (D-11: applies immediately)."""
    from jarvis_desktop import ui, stt
    from jarvis_desktop.config import save_config
    
    console = ui.console()
    models = ["tiny", "base", "small", "medium", "large-v3-turbo"]
    
    console.print("\nWhisper Models:")
    for i, m in enumerate(models, 1):
        marker = "[x]" if m == config.whisper_model else "[ ]"
        console.print(f"  {i}. {m} {marker}")
    
    try:
        choice = input("\nSelect (1-5): ").strip()
        idx = int(choice) - 1
        if 0 <= idx < len(models):
            new_model = models[idx]
            console.print(f"[STT] Switching to {new_model}...", flush=True)
            stt.reload_model(new_model)  # D-11: Apply immediately
            config.whisper_model = new_model
            save_config(config)  # D-11: Persist
            console.print(f"[STT] Ready with {new_model}.")
    except (ValueError, IndexError):
        console.print("Invalid selection.")

# Similar _menu_tts_provider(), _menu_voice_mode() follow same pattern
```

### STT Model Reloading (stt.py addition)

```python
# Source: Phase 77 decision for stt.reload_model()
def reload_model(new_size: str) -> None:
    """Reload Whisper model with a different size (runtime switch).
    
    Thread-safe. Blocks until new model loads. Old model garbage-collected.
    
    Args:
        new_size: one of "tiny", "base", "small", "medium", "large-v3-turbo"
    
    Raises:
        RuntimeError: if model load fails
    """
    global _model
    
    with _lock:
        old_size = "unknown"
        try:
            # Find old model size for logging
            if _model is not None:
                old_size = _model.model_size or "unknown"
        except:
            pass
        
        try:
            print(f"[STT] Loading {new_size}... (replaces {old_size})", flush=True)
            _model = WhisperModel(new_size, device="auto", compute_type="int8")
            print(f"[STT] Switched to {new_size}.", flush=True)
        except Exception as exc:
            print(f"[STT] Error loading {new_size}: {exc}", flush=True)
            raise RuntimeError(f"Failed to load Whisper {new_size}: {exc}") from exc
```

## State of the Art

| Aspect | Current (Phase 77) | Next (Phase 78+) | Changed |
|--------|-------------------|------------------|---------|
| Status display | Static text bar via Layout | Live-updating token preview during SSE stream | Q3 2026 — streaming display complex due to threading |
| Config persistence | JSON file (~/.jarvis/config.json) | Database (SQLite) with versioning | Deferred; JSON sufficient for v3.2 |
| Terminal control | Rich Console (stdout only) | Rich Console + Textual (full TUI framework) | Deferred; Rich sufficient for MVP |
| Model reload feedback | "Loading..." message + status line | Progress bar during model download | Nice-to-have; depends on Hugging Face download API |

**Deprecated/outdated:**
- **Old approach:** Direct print() with ANSI codes — fragile across terminals, no cross-platform cursor control
- **Why it changed:** Rich library (2019+) standardized terminal rendering with capability detection (Windows VT100 support, SSH TERM detection, etc.)

## Open Questions

1. **Config storage location:** Home dir (~/.jarvis/config.json) vs project dir (.jarvis/config.json) vs XDG_CONFIG_HOME?
   - Current decision: Home dir (Phase 72 locked)
   - No blocker for Phase 77

2. **Status line format — exact template:**
   - Research shows `[MODE | MODEL | STATE]` is readable
   - Planner may prefer `[MODE] MODEL STATE` (no pipes) or `MODE▸MODEL▸STATE` (emoji separators)
   - This is "Claude's Discretion" in CONTEXT.md — planner decides

3. **Token streaming during config menu:** Should tokens continue in background or be fully paused?
   - Menu pauses voice_modes but SSE stream might still be active from previous chat
   - Current design: Menu can only be entered at prompt (not mid-stream), so no conflict
   - If deferred to Phase 78+ for concurrent display, will need token buffering

4. **Error recovery on model reload failure:** Should menu loop retry, or exit to chat?
   - Research shows model load is blocking; if it fails, user is stuck in menu
   - Planner should add try-except and "Retry? (y/n)" prompt

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Python | Core | ✓ | 3.12 | — |
| rich library | Terminal UI | ✓ (in pyproject.toml) | 13.x | Use basic print() (loses status line) |
| Whisper model files | STT reload | ✓ (auto-download) | varies by size | tiny model (~75 MB) always available |
| Kokoro model files | TTS provider switch | ✓ (auto-download) | 0.9.4 | Kokoro unavailable → fallback to pyttsx3 (voice quality degrades) |
| ElevenLabs API | Cloud TTS option | Requires API key | — | Skip (local_only=True) |
| Murf API | Cloud TTS option | Requires API key | — | Skip (local_only=True) |

**Missing dependencies with fallback:**
- Kokoro model: If espeak-ng missing on Windows, TTS output is silent (handled in Phase 75, D-04)
- Cloud providers: If API key missing or service down, fallback to Kokoro

**No blocking dependencies:** Config menu can function with all offline features only (no cloud TTS).

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | pytest 8.x |
| Config file | tests/conftest.py (shared fixtures) |
| Quick run command | `pytest tests/test_ui.py -x` |
| Full suite command | `uv sync --extra dev && pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PYUI-01 | Status line displays [MODE] [MODEL] [STATE] at terminal bottom | unit | `pytest tests/test_ui.py::test_status_line_format -x` | ❌ Wave 0 |
| PYUI-01 | Status updates on set_state("listening"\|"thinking"\|"speaking"\|"idle") | unit | `pytest tests/test_ui.py::test_set_state_updates_display -x` | ❌ Wave 0 |
| PYUI-02 | /config command detected in chat_loop before gateway send | unit | `pytest tests/test_chat.py::test_config_command_detected -x` | ❌ Wave 0 |
| PYUI-02 | Menu allows selection of 3 Whisper models + applies immediately | integration | `pytest tests/test_config_menu.py::test_whisper_model_switch -x` | ❌ Wave 0 |
| PYUI-02 | Menu allows selection of 3 TTS providers + applies immediately | integration | `pytest tests/test_config_menu.py::test_tts_provider_switch -x` | ❌ Wave 0 |
| PYUI-02 | Menu allows selection of 3 voice modes + applies immediately | integration | `pytest tests/test_config_menu.py::test_voice_mode_switch -x` | ❌ Wave 0 |
| PYUI-02 | voice_modes paused on menu entry, resumed on exit | integration | `pytest tests/test_config_menu.py::test_voice_modes_pause_resume -x` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `tests/test_ui.py` — ui.py singleton initialization, set_state() behavior, status line rendering
- [ ] `tests/test_config_menu.py` — menu flow, field selection, immediate apply, config persistence
- [ ] `tests/test_chat.py::test_config_command_detected` — /config prefix detection in chat_loop
- [ ] Fixtures: mock_config (JarvisConfig), mock_live_display (Rich Live object), capture_console_output

*(Wave 0 will define xfail stubs; Wave 1 will implement and pass all tests)*

## Common Pitfalls Summary

| # | Pitfall | Prevention |
|---|---------|-----------|
| 1 | SSE tokens + Live display race condition (garbled output) | Don't print tokens from SSE thread; accumulate & print on main thread after stream; queue buffering already in chat.py |
| 2 | Model reload hangs/crashes mid-transcribe | Lock-guard reload, only reload when idle; check for in-flight operations before switch |
| 3 | Menu captures voice input (keyboard transcribed as speech) | Pause voice_modes before menu, resume after |
| 4 | Status line doesn't reflect config changes | Status reads live from config object, not cached copy; or call set_state() after each menu change |
| 5 | Print() breaks after init_ui() (output missing/garbled) | Migrate all print() to console.print(); check Phase 76 files for print calls |

## Sources

### Primary (HIGH confidence)
- **Rich 14.1.0 documentation** — Console, Live, Layout API verified via official docs; split_column() pattern confirmed
- **GitHub Textualize/rich issue #3435** — "Fixed status bar" discussion; maintainer confirms rich.Live + Layout is standard pattern for persistent status bars (MEDIUM confidence — discussion, not official docs)
- **GitHub SYSTRAN/faster-whisper** — WhisperModel API; model sizes confirmed (tiny, base, small, medium, large-v3-turbo); no in-place reload, requires new instance
- **CLAUDE.md Technology Stack** — Rich 13.x mandated; Terminal UI rendering confirmed as use case

### Secondary (MEDIUM confidence)
- **GitHub issue #1530 & #3704** — Rich threading safety issues acknowledged; concurrent print() + Live known to be unsafe
- **Phase 76 code (voice_modes.py, tts.py)** — Existing patterns for module-level singletons, threading events, config reloading (proven to work in current codebase)
- **WebSearch "persistent status bar" results** — Multiple sources (freeCodeCamp, Medium) recommend rich.Live + Layout; consensus pattern

### Tertiary (LOW confidence)
- **WebFetch Whisper/OpenAI GitHub** — Limited info on model switching; inferred from WhisperModel constructor behavior, not explicit documentation
- **Kokoro TTS GitHub results** — No official Python API documentation for provider switching; pattern inferred from similar TTS libraries
- **SSE streaming best practices** — Token buffering/threading patterns are general knowledge, not specific to this phase

## Metadata

**Confidence breakdown:**
- Rich.Live + Layout: **HIGH** — official docs + maintainer discussion confirm pattern
- Model reloading: **MEDIUM** — working from API signatures, not explicit reload API
- Threading safety: **MEDIUM** — GitHub issues confirm problems, solutions are general best practices
- Config persistence: **HIGH** — Phase 72 locked, working code exists
- Overall: **MEDIUM-HIGH** — UI architecture is solid, threading edge cases require careful implementation but are well-documented

**Research date:** 2026-05-18  
**Valid until:** 2026-06-18 (30 days for stable library; rich 13.x unlikely to break before then)

---

*Phase: 77-minimal-terminal-ui*  
*Research: 2026-05-18*
