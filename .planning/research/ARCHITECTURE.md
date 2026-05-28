# Architecture Research: v3.3 Python PC Control & Voice Reliability

**Researched:** 2026-05-20  
**Scope:** Python Desktop Client (apps/desktop-py/) — v3.3 new features integration  
**Context:** 9 existing modules, singleton pattern, config persistence, 3 voice capture modes  
**Confidence:** HIGH (extends proven patterns from Phases 72–77)

---

## Executive Summary

v3.3 adds 5 capabilities to the Python desktop client:

1. **PC Control tools** — New tools.py module executes LLM tool calls (open app, manage files, adjust volume, media)
2. **Config persistence** — Extend JarvisConfig schema with new optional fields; reuse existing save_config() hook
3. **STT GPU acceleration** — Device detection for AMD ROCm + Apple Metal; pass to faster-whisper
4. **Always-listening fix** — openwakeword VAD initialization bug fix (wakeword_models=[])
5. **Custom wake word** — Load .onnx model from config path instead of hardcoded "hey_jarvis"

**Architecture pattern:** New module tools.py matches existing singletons (stt.py, tts.py, voice_modes.py). Config changes are additions only (backward compatible). Chat loop adds tool_call event parsing. Zero circular imports, zero threading model changes.

---

## New Modules

### tools.py (200–250 lines)

**Responsibility:** Execute PC actions triggered by LLM tool calls from gateway.

**Public API:**
```python
def init_tools(config: JarvisConfig) -> None:
    """Initialize tool state (whitelist, audit log)."""

def execute_tool(tool_name: str, payload: dict) -> dict:
    """Route tool_name → handler, execute, return result."""

def get_tool_audit_log() -> list[dict]:
    """Return audit log for inspection."""
```

**Pattern:**
- Flat module, matches stt.py/tts.py singleton signature
- Thread-safe: executes in background thread or spawns subprocess
- Whitelist validation: reject paths outside allowed dirs
- Audit log: JSON to ~/.jarvis/audit.json
- Imports: psutil, pathlib, json, platform, subprocess (no LangChain)
- Error handling: never crash; return `{"success": false, "error": "..."}`

**Tool handlers:**
1. **open_app(app_name)** → psutil.Popen()
2. **close_app(app_name)** → find process + kill
3. **file_action(action, path, ...)** → read/move/delete via pathlib
4. **adjust_volume(delta)** → PyWinCtl/pyautogui OS-specific
5. **media_control(command)** → play/pause/next (OS-specific)

**Why here:** PC actions belong in desktop client (direct access to OS APIs). Gateway generates payload; desktop executes + audits. Matches Electron v1.3 pattern (backend generates, client executes).

---

## Modified Modules

### config.py

**New fields:**
```python
# Phase 79: PC control
pc_control_enabled: bool = Field(default=False)
app_whitelist: list[str] = Field(default_factory=list)
path_whitelist: list[str] = Field(default_factory=lambda: [
    str(Path.home()),
    str(Path.home() / "Desktop"),
    str(Path.home() / "Documents")
])

# Phase 79: Custom wake word
custom_wake_word_path: str = Field(default="")
custom_wake_word_name: str = Field(default="")

# Phase 79: Whisper GPU
whisper_device_type: str = Field(default="auto")
```

**Backward compat:** All optional with sensible defaults. Old config.json files load fine.

**Persistence:** Reuses existing `save_config()` hook (already called by Phase 77 config menu + Phase 76 mode switches).

---

### stt.py

**Changes (30 lines):**

```python
def init_stt(model_size: str = "tiny", device: str = "auto") -> None:
    """Load Whisper model. Device param passed to WhisperModel."""
    device_final = _detect_device(device)
    # ... load with device=device_final

def _detect_device(device_hint: str) -> str:
    """Map config device_type to CTranslate2 device.
    
    Returns: "cpu", "cuda", "rocm", "mps" based on hardware + hint.
    """
    import platform
    
    if device_hint in ("rocm", "cuda", "mps", "cpu"):
        return device_hint
    
    # device_hint == "auto"
    if platform.system() == "Darwin":
        return "mps"  # macOS → Metal
    elif platform.system() == "Linux":
        if Path("/opt/rocm").exists():
            return "rocm"
        return "cpu"
    else:
        return "cuda"  # Windows

def reload_model(new_size: str, device: str = "auto") -> None:
    """Reload model with new size + device."""
```

**Backward compat:** Existing calls still work; device defaults to "auto".

---

### voice_modes.py

**Fix 1: Always-listening VAD (15 lines)**

```python
def _always_listening_loop(config: JarvisConfig) -> None:
    # BROKEN:
    # model = Model(vad_threshold=0.5, inference_framework="onnx")
    
    # FIXED:
    model = Model(
        wakeword_models=[],  # VAD-only, no wake word model
        vad_threshold=0.5,
        inference_framework="onnx"
    )
```

**Fix 2: Custom wake word (15 lines)**

```python
def _wake_word_loop(config: JarvisConfig) -> None:
    # Phase 79: Custom wake word path
    if config.custom_wake_word_path and Path(config.custom_wake_word_path).exists():
        model = Model(
            wakeword_models=[config.custom_wake_word_path],
            vad_threshold=config.wake_word_threshold,
            inference_framework="onnx",
        )
        wake_word_key = config.custom_wake_word_name or "custom"
    else:
        # Default: "Hey JARVIS"
        openwakeword.utils.download_models(["hey_jarvis_v0.1"])
        model = Model(
            wakeword_models=["hey_jarvis"],
            vad_threshold=config.wake_word_threshold,
            inference_framework="onnx",
        )
        wake_word_key = "hey_jarvis"
    
    # Later in loop:
    confidence = predictions.get(wake_word_key, 0.0)
```

---

### chat.py

**Changes (50 lines): Tool call parsing + async execution**

```python
def chat_loop(config: JarvisConfig) -> None:
    # ... existing setup ...
    
    for chunk in response:
        events, buffer = parse_sse_chunk(chunk, buffer)
        
        for event_type, payload in events:
            if event_type == "tool_call":
                # NEW: Parse + dispatch tool call
                try:
                    tool_data = json.loads(payload)
                    tool_name = tool_data.get("tool_name")
                    tool_args = tool_data.get("args", {})
                    _execute_tool_async(tool_name, tool_args, config)
                except json.JSONDecodeError:
                    _console().print(f"[TOOL] Parse error: {payload}")
            else:
                # Existing: accumulate tokens
                full_text += payload
    
    speak(full_text, config)

def _execute_tool_async(tool_name: str, args: dict, config: JarvisConfig) -> None:
    """Execute tool in background thread. Non-blocking."""
    import threading
    
    def _run():
        try:
            from jarvis_desktop import tools
            result = tools.execute_tool(tool_name, args)
            _console().print(f"[TOOL ✓] {tool_name}")
        except Exception as exc:
            _console().print(f"[TOOL erro] {tool_name}: {exc}")
    
    t = threading.Thread(target=_run, daemon=True)
    t.start()
```

---

### __main__.py

**Changes (10 lines):**

```python
# Step 6a (NEW): Initialize tools
from jarvis_desktop.tools import init_tools
init_tools(config)
c.print("")

# Step 6b: Chat loop (unchanged)
try:
    chat_loop(config)
finally:
    ui.cleanup_ui()
```

---

## Integration Points

### 1. Startup Chain

```
load_config()
  ↓
__main__.py steps 0–5 (UI, health, STT, TTS, voice modes)
  ↓
init_tools(config) ← NEW
  ↓
chat_loop(config)
```

### 2. Voice → Chat → Tools

```
voice_modes.py (capture)
  ↓ enqueue
chat.py chat_loop()
  ├→ token accumulation (existing)
  └→ tool_call event ← NEW
     ↓
tools.execute_tool() ← NEW
  ├→ whitelist validation
  ├→ execute action
  ├→ audit log
  └→ fire-and-forget (no callback in MVP)
```

### 3. Config Persistence

**Existing hooks (no new code):**
- Phase 77 config menu: calls save_config()
- Phase 76 mode switch: calls save_config()
- Phase 79 config menu extension: reuses save_config()

---

## Data Flow Example: "Abrir Blender"

```
1. Voice input: "abrir blender"
2. voice_modes._ptt_loop() → transcribe("abrir blender") → enqueue
3. chat_loop() reads queue → POST /api/chat/stream
4. Gateway/backend: LLM → tool_call("open_app", {"app_name": "blender"})
5. Backend SSE stream: event: tool_call; data: {...}
6. chat.py parse_sse_chunk() → detects tool_call
7. Async thread: tools.execute_tool("open_app", {"app_name": "blender"})
8. tools.py: validate whitelist → psutil.Popen("blender") → audit log
9. Chat stream continues with remaining tokens
10. TTS speaks response
```

**Key:** Tool execution doesn't block chat stream.

---

## Build Order (Phase 79)

### Step 1: config.py (15 lines)
- Add pc_control_enabled, whitelist fields
- Add custom_wake_word_path, custom_wake_word_name
- Add whisper_device_type
- Test: backward compat with old config.json

### Step 2: tools.py (200 lines)
- Implement init_tools(), execute_tool()
- Define 5 tool handlers (app, file, volume, media)
- Whitelist validation + audit log
- Test: whitelist rejection, audit format

### Step 3: stt.py (30 lines)
- Add _detect_device() helper
- Update init_stt(device="auto") signature
- Update reload_model(device="auto") signature
- Test: OS → device mapping (Windows/Linux/macOS)

### Step 4: voice_modes.py (15 lines)
- Fix _always_listening_loop() VAD initialization
- Add custom wake word path logic in _wake_word_loop()
- Test: VAD-only initialization, custom .onnx loading

### Step 5: chat.py (50 lines)
- Parse tool_call events from SSE
- Add _execute_tool_async() helper
- Dispatch tools asynchronously
- Test: SSE parsing, async dispatch

### Step 6: __main__.py (10 lines)
- Call init_tools(config)
- Test: tools initialized before chat loop

### Step 7: Config menu (50 lines in chat.py._handle_command())
- New sections: PC Control, Custom Wake Word, Whisper Device
- Reuse existing save_config() hook
- Test: menu display, persistence

---

## Dependency Graph

```
config.py (base — new fields)
  ↓
tools.py (reads config)
  ↓
chat.py (dispatches to tools)
  ↓
__main__.py (orchestrates)

stt.py (independent, reads config)
voice_modes.py (independent, reads config)
```

**Zero circular dependencies.**

---

## New vs Modified Summary

| Module | Status | Lines | Purpose |
|--------|--------|-------|---------|
| tools.py | NEW | 200 | PC action execution + audit |
| config.py | MODIFIED | +15 | New optional fields |
| stt.py | MODIFIED | +30 | Device detection |
| voice_modes.py | MODIFIED | +15 | VAD fix + custom wake word |
| chat.py | MODIFIED | +50 | Tool call parsing + async execute |
| __main__.py | MODIFIED | +10 | tools.init_tools() call |
| health.py | UNCHANGED | — | — |
| tts.py | UNCHANGED | — | — |
| ui.py | UNCHANGED | — | — |

**Total new code:** ~370 lines  
**Breaking changes:** 0  
**Circular imports:** 0

---

## Quality Gates

### Guaranteed
- ✓ No circular imports
- ✓ Singleton pattern maintained
- ✓ Thread-safe (async tool execution)
- ✓ Backward compatible (optional config fields)
- ✓ Config persistence reuses existing hooks
- ✓ Voice capture unchanged

### Deferred (Phase 80+)
- Tool result callbacks to gateway (fire-and-forget MVP)
- SQLite audit log (JSON in Phase 79)
- Advanced whitelist UI (menu in Phase 79; GUI Phase 80+)

---

## Testing

**Unit tests:**
- test_tools_whitelist.py — path validation
- test_tools_audit.py — audit log format
- test_stt_device_detection.py — OS → device mapping
- test_voice_modes_always_listening.py — VAD initialization
- test_voice_modes_custom_wake_word.py — .onnx loading
- test_chat_tool_calls.py — SSE parsing + dispatch
- test_config_new_fields.py — backward compat

**Integration tests:**
- test_voice_to_tool.py — E2E (voice → chat → tool)
- test_config_persistence.py — modify, restart, verify

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│  JARVIS Desktop v3.3 (Python)                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  __main__.py (orchestrator)                          │
│    0. init_ui() → ui.py                              │
│    1. load_config() → config.py                      │
│    2. health check                                   │
│    3. init_stt(device) → stt.py [NEW: device param]  │
│    4. init_tts() → tts.py                            │
│    5. init_voice_modes() → voice_modes.py            │
│    6. init_tools() → tools.py [NEW]                  │
│    7. chat_loop() → chat.py                          │
│                                                      │
│  chat_loop():                                        │
│    voice queue / keyboard input                      │
│       ↓                                               │
│    SSE /api/chat/stream                              │
│       ↓                                               │
│    parse_sse_chunk()                                 │
│       ├→ tokens → accumulate                         │
│       └→ tool_call → tools.execute_tool() [async]    │
│       ↓                                               │
│    speak(full_text) → tts.py                         │
│                                                      │
│  voice_modes (daemon threads):                       │
│    _ptt_loop() → hotkey                              │
│    _wake_word_loop() → custom wake word [NEW]        │
│    _always_listening_loop() → VAD only [FIXED]       │
│       → enqueue to _queue                            │
│                                                      │
│  tools (async thread):                               │
│    execute_tool(name, args)                          │
│       → whitelist validation                         │
│       → execute (psutil/PyWinCtl)                    │
│       → log audit                                    │
│       → return (no callback MVP)                     │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Gateway (unchanged)                                 │
│    /api/chat/stream with tool_call events            │
└──────────────────────────────────────────────────────┘
```

---

## Key Decisions

1. **New tools.py module** — Keeps PC control separate from chat; matches stt.py/tts.py pattern
2. **Async fire-and-forget** — Tool execution doesn't block chat; simpler than callbacks
3. **Optional config fields** — pc_control_enabled defaults False; existing clients unaffected
4. **Reuse save_config()** — No new persistence code needed
5. **Device detection at init** — Auto-detection at startup; deterministic

---

## Summary

v3.3 integrates 5 new features into the Python desktop client with:

- **370 total lines of code** (1 new module + 6 modified)
- **Zero breaking changes** (all additions, backward compatible)
- **Zero new threading models** (async tool execution in background thread)
- **Zero circular imports** (config → tools → chat → __main__)

Build order: config → tools → stt/voice_modes → chat → __main__ (7 steps, ~1 week for Phase 79).

Ready for production.
