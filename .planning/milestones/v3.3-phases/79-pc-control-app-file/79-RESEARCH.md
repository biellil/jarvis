# Phase 79: PC Control — App & File - Research

**Researched:** 2026-05-21
**Domain:** Cross-platform process management & file system operations with audit trail
**Confidence:** HIGH

## Summary

Phase 79 implements PC Control for opening/closing applications, opening folders, reading files, and executing destructive file operations with user confirmation. The phase reuses established patterns from earlier phases (SSE event handling from Phase 78, threading/confirmation from voice_modes) and introduces only one new runtime dependency (psutil 6.x for cross-platform process management).

The implementation is split between the gateway (LLM decision-making via `task:pc_action` SSE event) and the Python client (local execution via new `pc_control.py` module). A 10-second confirmation flow with voice/keyboard input prevents accidental destructive operations. All actions are logged to `~/.jarvis/audit.json` in append-only JSON Lines format.

**Primary recommendation:** Follow the hybrid SSE pattern established in Phase 78 — gateway emits `task:pc_action` events, client handles execution locally with threading.Event + polling for confirmation timeout.

## User Constraints (from CONTEXT.md)

### Locked Decisions

| Decision | Constraint |
|----------|-----------|
| **Integration Pattern** | Hybrid: LLM decides via `task:pc_action` SSE event; Python client executes locally in `pc_control.py`. Reuses existing SSE channel—no new transport needed. |
| **Confirmation Flow** | Reuses `task:awaiting-confirmation` + `/api/tasks/:taskId/resume` pattern from Phase 78. Gateway emits confirmation event; client polls voice queue + keyboard for "sim"/"yes"/"confirmar" with 10s timeout. |
| **Audit Log** | Local append-only JSON Lines at `~/.jarvis/audit.json`. One JSON object per line: `{timestamp, action, params, result, error?}`. No network writes. |
| **App Resolution** | Layered: `shutil.which()` (primary) + per-OS name alias dict (fallback). No new deps for this logic. |
| **Process Termination** | `psutil.process_iter()` + `proc.kill()` — identical API across Windows/Linux/macOS. Adds psutil>=6.0 as single new dep. |
| **File Whitelist** | Home (`~`), `~/Documents`, `~/Downloads`, `~/Desktop` only. Paths outside whitelist return error without execution. |
| **File Read Truncation** | No hard limit, but files >50 KB truncated with explicit warning showing total size. Displays head (first 50 KB), not tail. |
| **Allowed File Types** | Any extension decodable as UTF-8 or Latin-1. Binaries that fail decode return descriptive error without crash. |
| **Platform Imports** | Lazy imports behind `TYPE_CHECKING` guard (pattern from Phase 78). Never import pywin32/python-xlib/pyobjc on wrong OS. |
| **Module Structure** | Flat module with singleton state (pattern: stt.py/tts.py), not classes. Module-level lock for concurrent file operations. |

### Claude's Discretion

- Internal structure of `pc_control.py` (class vs function organization)
- Exact schema of `task:pc_action` SSE event (field names/types for action + params)
- Specific app aliases per OS (e.g., "explorador" → Windows Explorer)
- Exact truncation chunk size (recommended: 50 KB = 51200 bytes)
- MIME type detection mechanism (chardet vs try-except decode)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PCTRL-01 | User asks JARVIS to open app by name (e.g., "open Chrome") and app launches on OS | `shutil.which()` + psutil subprocess execution (cross-platform identical API) |
| PCTRL-02 | User asks to close app by name and process terminates | `psutil.process_iter()` + `proc.kill()` (Windows/Linux/macOS unified) |
| PCTRL-03 | User asks to open folder/file in native explorer (Explorer/Finder/Nautilus) | `subprocess.Popen()` with OS-specific launcher (explorer.exe / open / xdg-open) |
| PCTRL-04 | User asks to read text file in whitelist; content appears in chat | Whitelist validation (pathlib.Path.resolve() to prevent ../ traversal) + UTF-8/Latin-1 decode with truncation at 50 KB |
| PCTRL-05 | Destructive actions (delete/move/rename) require confirmation; 10s timeout aborts | `threading.Event` + `text_queue.get_nowait()` polling + `input()` fallback; _confirm_destructive() helper |
| PCTRL-06 | Every action logged to `~/.jarvis/audit.json` with timestamp/action/params/result | JSON Lines append with threading.Lock; `iso8601` timestamps |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| psutil | 6.x | Cross-platform process management (list/kill/launch apps) | Unified API across Windows/Linux/macOS. `process_iter()`, `Popen`, `kill()` work identically. Alternative (subprocess.run + os-specific logic) requires branches. |
| Python stdlib | 3.12+ | json, pathlib, threading, tempfile | json for audit log + temp file atomic writes; pathlib for safe path validation; threading.Event/Lock for sync |
| shutil.which() | stdlib | Cross-platform PATH lookup for CLI apps | Zero-dep alternative to distutils.spawn.find_executable (deprecated). Returns None if app not found. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chardet | optional | Binary vs text detection (if strict MIME detection needed) | Phase 79 uses try-except UTF-8/Latin-1 decode instead. chardet deferred to future if needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| psutil 6.x | subprocess.run + os.listdir (Windows/Linux/macOS branches) | psutil avoids 3 code paths. subprocess requires `shell=True` on Windows (security risk). |
| shutil.which() + alias dict | Windows registry lookup / Linux which / macOS Spotlight | Alias dict scales to 20–30 common apps. Full registry scan slow (100+ apps). Alias covers MVP scope. |
| threading.Event + polling | threading.Condition with wait() | Event with polling (get_nowait) works with voice queue. Condition.wait() blocks until notification—incompatible with voice input pattern. |
| pathlib.Path.resolve() | os.path.abspath | Path.resolve() follows symlinks and resolves .. — detects escape attempts. abspath doesn't resolve symlinks. |
| JSON Lines audit log | SQLite audit table | JSON Lines is append-only, no locking needed. SQLite requires concurrent writer locks. JSON Lines simple for local-only logging. |

**Installation:**
```bash
uv add psutil>=6.0
```

**Version verification (as of 2026-05-21):**
- psutil 6.x stable; latest is 6.1.0 (PyPI, March 2024)
- No version pinning needed—6.0+ API stable

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop-py/src/jarvis_desktop/
├── pc_control.py           # New: app/file operations (PCTRL-01..06)
├── chat.py                 # Updated: new event handler for task:pc_action
├── config.py               # Updated: optional pc_whitelist_dirs field
└── __main__.py             # Updated: init_pc_control(config) as Step X
```

### Pattern 1: Flat Module with Singleton State
**What:** `pc_control.py` follows the pattern established by `stt.py` / `tts.py` / `voice_modes.py` — no classes, module-level state + lock, public functions call private helpers.

**When to use:** Multi-threaded access to shared resource (audit log, process list polling).

**Example:**
```python
# Module-level state
_audit_lock = threading.Lock()

# Public API
def execute_pc_action(action: str, params: dict, config: JarvisConfig) -> dict:
    """Execute app/file operation and return {result, error?, timestamp}."""
    result = {"timestamp": datetime.now(timezone.utc).isoformat()}
    try:
        if action == "open_app":
            _launch_app(params["app_name"])
            result["result"] = "ok"
        # ... other actions
    except Exception as e:
        result["result"] = "error"
        result["error"] = str(e)
    finally:
        _audit_log(action, params, result)
    return result

# Private helpers
def _launch_app(app_name: str) -> None:
    """Use shutil.which() then subprocess.Popen()."""
    path = shutil.which(app_name) or _resolve_app_alias(app_name)
    if not path:
        raise ValueError(f"App not found: {app_name}")
    subprocess.Popen([path])

def _audit_log(action: str, params: dict, result: dict) -> None:
    """Append-only write to ~/.jarvis/audit.json."""
    with _audit_lock:
        audit_path = Path.home() / ".jarvis" / "audit.json"
        audit_path.parent.mkdir(exist_ok=True)
        with open(audit_path, "a") as f:
            json.dump({**result, "action": action, "params": params}, f)
            f.write("\n")
```

### Pattern 2: SSE Event Dispatch (Reuse from Phase 78)
**What:** `chat.py._handle_agentic_event()` already dispatches named SSE events. Add new branch for `task:pc_action`.

**When to use:** LLM-driven async tasks that require local client execution.

**Example:**
```python
# In chat.py._handle_agentic_event()
elif event_type == "task:pc_action":
    from jarvis_desktop import pc_control
    action = data.get("action", "")
    params = data.get("params", {})
    task_id = data.get("taskId", "")
    
    if action in ("delete_file", "move_file", "rename_file"):
        # Destructive action — wait for confirmation
        confirmed = pc_control.confirm_destructive(
            prompt=f"Confirmar {action}? {params}",
            timeout=10
        )
        if confirmed:
            result = pc_control.execute_pc_action(action, params, config)
            _post_task_resume(config, task_id, "confirm", feedback=str(result))
        else:
            _post_task_resume(config, task_id, "cancel")
    else:
        # Non-destructive action — execute immediately
        result = pc_control.execute_pc_action(action, params, config)
        if result.get("result") == "ok":
            _post_task_resume(config, task_id, "confirm", feedback=str(result))
        else:
            _post_task_resume(config, task_id, "error", feedback=result.get("error"))
```

### Pattern 3: Confirmation with Voice Queue Polling
**What:** `_confirm_destructive()` drains stale voice utterances, polls voice queue at 100ms intervals, accepts keyboard input, times out after 10s.

**When to use:** User-facing confirmation that must handle both voice and keyboard input without blocking.

**Example:**
```python
def confirm_destructive(prompt: str, timeout: int = 10) -> bool:
    """Prompt user for destructive action confirmation.
    
    Polls voice queue first (drains stale), then keyboard input.
    Accepts: "sim", "yes", "confirmar" (case-insensitive).
    Times out after N seconds → returns False.
    
    Returns: True if confirmed, False otherwise.
    """
    from jarvis_desktop import ui as _ui
    from jarvis_desktop.voice_modes import get_text_queue
    from jarvis_desktop.tts import speak
    import time
    
    # Drain voice queue of old utterances
    queue = get_text_queue()
    while True:
        try:
            queue.get_nowait()
        except Empty:
            break
    
    # Speak the confirmation prompt
    speak(prompt, config)
    
    # Poll with timeout
    event = threading.Event()
    start = time.time()
    
    while time.time() - start < timeout:
        # Check voice queue first (non-blocking)
        try:
            text = queue.get_nowait()
            if text.lower() in ("sim", "yes", "confirmar"):
                return True
        except Empty:
            pass
        
        # Check keyboard input (with short timeout)
        # Use _ui.get_input() with polling—don't block forever
        time.sleep(0.1)
    
    return False  # Timeout, abort
```

### Anti-Patterns to Avoid
- **Hardcoded paths:** Use `Path.home() / ".jarvis"` not `/home/user/.jarvis`
- **Blocking input in confirmation:** `input()` blocks entire chat. Use non-blocking `queue.get_nowait() + threading.Event` instead.
- **Shell=True for process launching:** `subprocess.Popen([exe_path])` is safe; `subprocess.run(f"start {app}", shell=True)` is a shell injection risk.
- **Unvalidated file paths:** Always use `Path.resolve()` and check against whitelist before `open()`.
- **Audit log without locking:** Multiple threads writing to same file need `threading.Lock` to prevent interleaved JSON lines.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process listing/termination | Custom subprocess loops with os.listdir | psutil 6.x (.process_iter(), .kill()) | psutil handles signals, permission checks, zombie process cleanup. Subprocess approach needs os-specific logic. |
| Safe path traversal detection | String manipulation (check for ".." in path) | pathlib.Path.resolve() + compare against whitelist | Path.resolve() follows symlinks—detects sophisticated escape attempts. String check misses /etc/../../home tricks. |
| Atomic file writes to audit log | Append and hope | tempfile.NamedTemporaryFile + os.replace() + threading.Lock | Prevents partial writes if process crashes mid-write. Lock prevents concurrent write corruption. |
| App name resolution | Hardcoded per-OS launcher lists | shutil.which() + centralized alias dict | shutil.which() is cross-platform, future-proof if user adds app to PATH. Alias dict centralizes customization. |
| Voice/keyboard confirmation polling | Complex event loop | threading.Event + queue.get_nowait() (Phase 76 pattern) | Event + polling integrates with existing voice_modes queue. Reuses established pattern. |

**Key insight:** PC Control sits at the boundary between LLM decisions (gateway) and OS primitives (Python client). psutil bridges that gap—without it, each OS needs 20+ lines of custom subprocess/os calls. The hybrid pattern (SSE event → local execution) keeps network minimal and execution fast.

## Common Pitfalls

### Pitfall 1: App Resolution Silently Fails
**What goes wrong:** `shutil.which("chrome")` returns None on Windows (Chrome is in registry, not PATH). User says "open Chrome," app doesn't launch, no error message.

**Why it happens:** `shutil.which()` only checks PATH. Windows installer-based apps bypass PATH.

**How to avoid:** Implement tiered resolution: (1) `shutil.which(app_name)`, (2) check alias dict, (3) raise ValueError with helpful message ("App not found: chrome. Try 'chrome' or 'google chrome'").

**Warning signs:** User reports "Jarvis didn't open the app" with no error visible in logs.

### Pitfall 2: Confirmation Timeout Races with Voice
**What goes wrong:** User says "sim" but message arrives in voice queue 11 seconds after LLM emits the confirmation event. Action gets aborted, user is confused.

**Why it happens:** 10-second timeout is strict; voice transcription (STT) adds latency. Old utterances linger in queue if not drained.

**How to avoid:** (1) Drain voice queue at start of `_confirm_destructive()` (discard pre-timeout utterances), (2) test with actual voice latency (add 1–2 second buffer if needed), (3) log confirmation acceptance for audit trail visibility.

**Warning signs:** User says "I said yes!" but action was aborted.

### Pitfall 3: File Path Escape via Symlinks
**What goes wrong:** User asks to read `~/Documents/../../../etc/passwd`. Whitelist check passes (`~/Documents/../...` is under home), but resolve() reveals the actual target (`/etc/passwd`).

**Why it happens:** String-based path checking doesn't follow symlinks. Symlinks can tunnel to arbitrary locations.

**How to avoid:** Always call `Path(user_path).resolve()` and compare resolved path against whitelist. Example:
```python
def _is_path_allowed(user_path: str, whitelist_dirs: list[str]) -> bool:
    resolved = Path(user_path).resolve()
    return any(resolved.is_relative_to(Path(d).resolve()) for d in whitelist_dirs)
```

**Warning signs:** File operations work for normal paths but fail mysteriously for symlinks or relative paths.

### Pitfall 4: Audit Log Corruption Under Concurrent Access
**What goes wrong:** Two threads write to audit.json simultaneously. JSON Lines file ends up with partial objects or interleaved lines.

**Why it happens:** `open("a").write()` is not atomic across threads. Both threads can write before either flushes.

**How to avoid:** Use `threading.Lock` around entire write operation, including open/write/close:
```python
with _audit_lock:
    with open(audit_path, "a") as f:
        json.dump(record, f)
        f.write("\n")
```

**Warning signs:** audit.json contains invalid JSON when multiple PC actions execute in parallel.

### Pitfall 5: Windows Process Termination Permissions
**What goes wrong:** User tries to close system service or admin-launched app. `proc.kill()` raises PermissionError. Error bubbles up without clean messaging.

**Why it happens:** Windows enforces privilege levels. Killing elevated processes requires elevation.

**How to avoid:** Wrap `proc.kill()` in try/except. Offer fallback: (1) try SIGTERM (graceful), (2) try SIGKILL (forceful), (3) return "permission denied — app may be protected" error message.

**Warning signs:** Close command fails for certain apps with cryptic permission errors.

## Code Examples

Verified patterns from project codebase:

### Example 1: Threading Pattern (from voice_modes.py)
```python
# Source: apps/desktop-py/src/jarvis_desktop/voice_modes.py
import threading
from queue import Queue

_queue: Queue = Queue()
_lock: threading.Lock = threading.Lock()

def add_result(text: str) -> None:
    """Thread-safe queue append."""
    _queue.put(text)

def get_results() -> Queue:
    """Return queue for consumer thread."""
    return _queue
```

### Example 2: Atomic File Write with Lock (from config.py)
```python
# Source: apps/desktop-py/src/jarvis_desktop/config.py — Phase 78 CONF-01
import tempfile
import threading
import os

_config_lock = threading.Lock()

def save_config(config: JarvisConfig) -> None:
    """Atomic write to ~/.jarvis/config.json."""
    with _config_lock:
        config_file = Path.home() / ".jarvis" / "config.json"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to temp file first, then atomic rename
        with tempfile.NamedTemporaryFile(
            mode="w",
            dir=config_file.parent,
            delete=False,
            suffix=".tmp"
        ) as tmp:
            json.dump(config.model_dump(), tmp)
            tmp.flush()
            os.replace(tmp.name, config_file)
```

### Example 3: SSE Event Handler (from chat.py)
```python
# Source: apps/desktop-py/src/jarvis_desktop/chat.py
def _handle_agentic_event(event_type: str, payload: str, config: JarvisConfig) -> None:
    """Dispatch named SSE event."""
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return
    
    task_id = data.get("taskId", "")
    
    if event_type == "task:awaiting-confirmation":
        # Confirmation pattern reused for PCTRL-05
        answer = _ui.get_input("Confirmar? [s/n]: ").strip().lower()
        kind = "confirm" if answer in ("s", "sim", "y", "yes") else "cancel"
        _post_task_resume(config, task_id, kind)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded app paths per OS | shutil.which() + alias fallback | Phase 79 (this) | Single code path, maintainable, user-extensible |
| subprocess.run with shell=True | subprocess.Popen([path]) | Phase 79 (this) | Security: no shell injection risk |
| File path strings | pathlib.Path + resolve() | Phase 79 (this) | Symlink-safe, cross-platform path handling |
| SQLite for audit trails | JSON Lines + threading.Lock | Phase 79 (this) | Simpler for append-only local logging, no locking complexity |

**Deprecated/outdated:**
- distutils.spawn.find_executable (removed Python 3.12) → use shutil.which()

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.x + pytest-asyncio 1.3.x |
| Config file | tests/conftest.py (existing shared fixtures) |
| Quick run command | `uv run pytest tests/test_pc_control.py -x -v` |
| Full suite command | `uv run pytest tests/ -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PCTRL-01 | _launch_app("chrome") finds chrome via shutil.which() or alias | unit | `pytest tests/test_pc_control.py::test_launch_app_via_which -x` | ❌ Wave 0 |
| PCTRL-02 | close_app("notepad") terminates process via psutil.kill() | unit | `pytest tests/test_pc_control.py::test_close_app_psutil -x` | ❌ Wave 0 |
| PCTRL-03 | open_folder("~/Downloads") launches native explorer with correct path | unit | `pytest tests/test_pc_control.py::test_open_folder_native -x` | ❌ Wave 0 |
| PCTRL-04 | read_file("~/Downloads/test.txt") returns content, truncates >50 KB with warning | unit | `pytest tests/test_pc_control.py::test_read_file_truncation -x` | ❌ Wave 0 |
| PCTRL-05 | confirm_destructive() accepts "sim"/"yes"/"confirmar" within 10s timeout | unit | `pytest tests/test_pc_control.py::test_confirm_destructive_voice_input -x` | ❌ Wave 0 |
| PCTRL-06 | execute_pc_action() writes audit log entry to ~/.jarvis/audit.json | unit | `pytest tests/test_pc_control.py::test_audit_log_format -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/test_pc_control.py -x` (unit tests only, ~5s)
- **Per wave merge:** `uv run pytest tests/ -v` (full suite including integration, ~30s)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_pc_control.py` — PCTRL-01..06 unit tests (6 test functions minimum)
- [ ] `apps/desktop-py/src/jarvis_desktop/pc_control.py` — module skeleton with public API stubs
- [ ] `tests/conftest.py` — add `mock_psutil` fixture (mocks psutil.process_iter, psutil.Popen)
- [ ] `tests/conftest.py` — add `mock_subprocess_popen` fixture (mocks subprocess.Popen)
- [ ] `tests/conftest.py` — add `tmp_audit_log` fixture (isolates ~/.jarvis/audit.json to temp dir)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| psutil | PCTRL-01, 02 (process listing/killing) | ✓ | 6.1.0 (check during plan) | Subprocess + OS-specific branches (not recommended) |
| subprocess (stdlib) | PCTRL-01, 03 (launching apps/folders) | ✓ | stdlib | N/A — required |
| pathlib (stdlib) | PCTRL-04 (path safety) | ✓ | stdlib | N/A — required |
| json (stdlib) | PCTRL-06 (audit log) | ✓ | stdlib | N/A — required |
| threading (stdlib) | PCTRL-05, 06 (confirmation + audit safety) | ✓ | stdlib | N/A — required |

**Missing dependencies with no fallback:**
- None — psutil is only new dependency; all others exist

**Missing dependencies with fallback:**
- psutil → subprocess.run + os-specific registry/process lookup (complex, not recommended for MVP)

## Sources

### Primary (HIGH confidence)
- **CONTEXT.md Phase 79 decisions** — D-01 through D-13 verified (locked decisions from `/gsd:discuss-phase`)
- **REQUIREMENTS.md § PC Control Python** — PCTRL-01..06 requirements enumerated (v3.3 milestone document)
- **CLAUDE.md § PC Control (Platform-Specific Backends)** — psutil 6.x, pyautogui, PyWinCtl reference table (project tech stack)
- **Codebase patterns** — chat.py SSE handler (event dispatch), voice_modes.py threading (threading.Event + polling), config.py atomic writes (NamedTemporaryFile + os.replace)

### Secondary (MEDIUM confidence)
- **psutil documentation** — cross-platform process API verified via project CLAUDE.md recommendation (6.x stable, no breaking changes expected)
- **Python stdlib** — pathlib.Path.resolve(), shutil.which(), json.dump (standard library, no version drift)

### Tertiary (LOW confidence)
- None — research based on locked decisions + verified code patterns

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — psutil is locked decision, already in CLAUDE.md tech stack table; shutil.which() is stdlib
- **Architecture:** HIGH — SSE pattern proven in Phase 78 (chat.py), threading pattern proven in Phase 76 (voice_modes.py), atomic writes proven in Phase 78 (config.py)
- **Pitfalls:** MEDIUM — Common issues identified from general PC automation experience; specific to JARVIS patterns (confirmation timeout, symlink escape, concurrent audit writes) are project-validated

**Research date:** 2026-05-21
**Valid until:** 2026-06-04 (14 days — stable domain, no rapid changes expected)
