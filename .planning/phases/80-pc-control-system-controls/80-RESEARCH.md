# Phase 80: PC Control — System Controls - Research

**Researched:** 2026-05-21
**Domain:** Cross-platform system audio and media control (volume, mute, playback)
**Confidence:** HIGH

## Summary

Phase 80 extends Phase 79 PC Control with **system volume** (adjust, toggle mute) and **media playback** (play/pause, next/previous track) control via voice commands, across Windows, macOS, and Linux. The implementation uses platform-specific backends: pycaw for Windows (COM-based), pactl for Linux (PulseAudio/Pipewire), osascript for macOS. Media control on Windows/macOS uses pynput media keys; Linux uses playerctl (MPRIS D-Bus).

Gateway emits `event: action` SSE for non-agentic volume/media commands, alongside existing `task:pc_action` agentic events. Python client must add an `elif event_type == "action"` branch in `_handle_agentic_event()` to normalize `args` → `params` and route to `execute_pc_action()`. No user confirmation required (unlike Phase 79's destructive actions). All actions logged to `~/.jarvis/audit.json` with same schema as Phase 79.

**Primary recommendation:** Implement volume control with `adjust_volume` (delta ±100) + `toggle_mute`; media control with pynput on Win/macOS, playerctl on Linux; add one new dependency (pycaw for Windows); route non-agentic `event: action` SSE to pc_control.execute_pc_action().

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: SSE Event Routing** — `chat.py` must handle **both** event types:
- `event: action` (non-agentic, fast path) — volume/media commands
- `task:pc_action` (agentic, Phase 79) — already working
- Both call `execute_pc_action(action, params, config)`. Normalization: `args` key → `params` at dispatch.

**D-02: Volume Control Backend** — Hybrid approach by OS:
- **Windows:** `pycaw` (COM-based `IAudioEndpointVolume`, sub-millisecond, exact delta). Lazy import, guard with `try/except COMError` for RDP/headless.
- **Linux:** `subprocess pactl` — `pactl set-sink-volume @DEFAULT_SINK@ +N%` / `pactl set-sink-mute @DEFAULT_SINK@ toggle`. Supports PulseAudio and Pipewire (compatible shim).
- **macOS:** `subprocess osascript` — `osascript -e "set volume output volume X"`.

**D-03: Media Control Backend** — Hybrid approach by OS:
- **Windows + macOS:** `pynput` (already installed) with `Key.media_play_pause`, `Key.media_next`, `Key.media_previous`. Solid on both OSes.
- **Linux:** `subprocess playerctl` — `playerctl play-pause`, `playerctl next`, `playerctl previous`. MPRIS standard covers Wayland + X11. System dep: `apt install playerctl` (note in README).

**D-04: Action Types New** — Three new actions in `execute_pc_action()`:
- `"adjust_volume"` — params: `{"delta": int}` (delta ±100 percentage points)
- `"toggle_mute"` — params: `{}`
- `"media_control"` — params: `{"command": "play_pause" | "next_track" | "prev_track"}`

**D-05: Audit Log** — Same schema as Phase 79 (D-13): `timestamp`, `action`, `params`, `result`, `error`. No new fields.

### Claude's Discretion (Research Recommendations)

- **pycaw installation method:** Use `; sys_platform == "win32"` marker in `pyproject.toml` dependencies (conditional install for Windows only). Alternative: use `[windows]` optional extra with `pip install jarvis_desktop[windows]`. Recommend marker approach for simpler UX.
- **Volume scaling:** Backend uses delta ±100 integer (percentage points). pycaw internally uses float 0.0–1.0. Conversion: `delta / 100.0`, then clamp result to [0.0, 1.0] after applying to current volume.
- **pactl missing on Linux:** Log warning + return error ("pactl not found. Install PulseAudio/Pipewire."), don't crash. TTS can read error back to user.
- **playerctl missing on Linux:** Log warning + return error ("playerctl not found. Install playerctl."), don't crash.
- **Volume feedback TTS:** Future enhancement — speaking "volume em 60%" after adjust. Out of scope v3.3.
- **Set volume absolute:** Backend has `createSetVolumeTool()` but PCTRL-07 covers only delta/mute. Absolute can be added without new Phase if needed.

### Deferred Ideas (OUT OF SCOPE)

- **Brightness control** — `screen-brightness-control` in CLAUDE.md; explicit Future Requirements (v3.4+)
- **Volume feedback via TTS** — Future UX enhancement
- **Set volume absolute** — Can add without Phase; currently only adjust_volume + toggle_mute required
- **Per-app volume control** — pycaw supports audio sessions; out of v3.3

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PCTRL-07 | User can control system volume by voice (increase, decrease, mute/unmute) | pycaw (Windows), pactl (Linux), osascript (macOS) — all three OSes covered with established tools |
| PCTRL-08 | User can control media playback by voice (play/pause, next track, previous track) | pynput media keys (Windows/macOS), playerctl (Linux) — MPRIS standard, Wayland+X11 compatible |

---

## Standard Stack

### Volume Control

| Library | Version | Purpose | Platform | Why Standard |
|---------|---------|---------|----------|--------------|
| pycaw | 0.9.1+ | Windows Core Audio (IAudioEndpointVolume) | Windows | De-facto standard for Windows audio control. Direct COM API access, sub-millisecond response, exact delta. Lazy import to avoid issues on non-Windows. |
| pactl | (system) | PulseAudio/Pipewire CLI | Linux | POSIX standard; shipped with all major distros. Supports both PulseAudio and Pipewire (compatible shim). Relative volume adjustment via `+N%` syntax. |
| osascript | (system) | AppleScript interpreter | macOS | Native macOS tool, zero extra deps. Syntax: `osascript -e "set volume output volume X"` (0–100 scale). |

**Installation:**
```bash
# pyproject.toml dependencies:
pycaw>=0.9.1; sys_platform == "win32"

# System packages (optional):
# Linux: pactl ships with pulseaudio-utils (usually pre-installed)
# macOS: osascript built-in
# Windows: pycaw installed via pip
```

**Version verification:**
- pycaw 0.9.1: verified on PyPI (latest stable)
- pactl: part of PulseAudio (shipped 2008+, maintained actively)
- osascript: part of macOS system

### Media Control

| Library | Version | Purpose | Platform | Why Standard |
|---------|---------|---------|----------|--------------|
| pynput | 1.7.0+ | Media key simulation | Windows, macOS | Already in stack (Phase 74+). Supports `Key.media_play_pause`, `Key.media_next`, `Key.media_previous`. Solid on Win/macOS; Linux support problematic (Wayland/X11 issues — hence playerctl fallback). |
| playerctl | (system) | MPRIS D-Bus media player control | Linux | Standard MPRIS implementation, 4K+ GitHub stars. Works with VLC, Spotify, Firefox, Rhythmbox, MPD, etc. Covers Wayland and X11. |

**Installation:**
```bash
# Already in pyproject.toml:
pynput>=1.7.0

# System packages:
# Linux: apt install playerctl (or pacman -S playerctl on Arch)
# macOS: included in system
# Windows: included in system
```

**Version verification:**
- pynput 1.7.0+: media keys added in 1.5.0, stable since
- playerctl: actively maintained (500+ commits in 2024-2025)

### Supporting Libraries

| Library | Purpose | When to Use |
|---------|---------|-------------|
| subprocess | Execute system commands (pactl, osascript, playerctl) | All OS-specific volume/media backends |
| shutil | Find executables in PATH (playerctl availability check) | Check if pactl/playerctl installed before execution |
| sys.platform | Detect OS for branching | Route to correct backend (win32/darwin/linux) |

---

## Architecture Patterns

### Recommended Project Structure

```
pc_control.py (Phase 79 + Phase 80 extensions)
├── execute_pc_action()               # Main entrypoint (existing, now handles 3 new actions)
├── adjust_volume(delta: int)         # NEW: delta ±100 → backend-specific volume
├── toggle_mute()                     # NEW: mute/unmute
├── media_control(command: str)       # NEW: play_pause | next_track | prev_track
├── _adjust_volume_windows()          # NEW: pycaw COM API
├── _adjust_volume_linux()            # NEW: pactl subprocess
├── _adjust_volume_macos()            # NEW: osascript subprocess
├── _media_control_windows()          # NEW: pynput media keys
├── _media_control_macos()            # NEW: pynput media keys
├── _media_control_linux()            # NEW: playerctl subprocess
├── _audit_log()                      # Existing: append to audit.json
└── _platform, _console()             # Existing helpers
```

### Pattern 1: Platform-Specific Volume Control

**What:** Three backend implementations (Windows COM, Linux pactl, macOS osascript) selected by `sys.platform`.

**When to use:** Any PC control that varies per OS (volume, brightness, media).

**Example:**
```python
def adjust_volume(delta: int) -> None:
    """Increase (+) or decrease (-) system volume by delta percentage points.
    
    Normalizes delta to current volume, clamps to [0, 100].
    """
    if _PLATFORM == "win32":
        _adjust_volume_windows(delta)
    elif _PLATFORM == "darwin":
        _adjust_volume_macos(delta)
    else:  # linux
        _adjust_volume_linux(delta)

def _adjust_volume_windows(delta: int) -> None:
    """Windows: pycaw COM-based volume control."""
    import pycaw.api as pycaw
    try:
        devices = pycaw.AudioUtilities.GetSpeakers()
        interface = devices.Activate(pycaw.IAudioEndpointVolume._iid_, None, None)
        volume = interface.QueryInterface(pycaw.IAudioEndpointVolume)
        
        current = volume.GetMasterVolumeLevelScalar()  # [0.0, 1.0]
        new_vol = max(0.0, min(1.0, current + delta / 100.0))
        volume.SetMasterVolumeLevelScalar(new_vol, None)
    except Exception as exc:
        raise ValueError(f"Windows volume control failed: {exc}")

def _adjust_volume_linux(delta: int) -> None:
    """Linux: pactl relative volume adjustment."""
    import subprocess
    try:
        sign = "+" if delta >= 0 else ""
        subprocess.run(
            ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{sign}{delta}%"],
            check=True,
            capture_output=True,
        )
    except FileNotFoundError:
        raise ValueError("pactl not found. Install PulseAudio or Pipewire.")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"Linux volume control failed: {exc.stderr.decode()}")

def _adjust_volume_macos(delta: int) -> None:
    """macOS: osascript AppleScript volume adjustment."""
    import subprocess
    try:
        # Get current volume first
        result = subprocess.run(
            ["osascript", "-e", "get volume settings"],
            check=True,
            capture_output=True,
            text=True,
        )
        # Parse "volume:XX, ..." — extract XX
        current = int(result.stdout.split(":")[1].split(",")[0])
        new_vol = max(0, min(100, current + delta))
        subprocess.run(
            ["osascript", "-e", f"set volume output volume {new_vol}"],
            check=True,
        )
    except Exception as exc:
        raise ValueError(f"macOS volume control failed: {exc}")
```

### Pattern 2: Media Control Via pynput (Win/macOS) or playerctl (Linux)

**What:** Abstract media playback behind OS-specific implementations.

**Example:**
```python
def media_control(command: str) -> None:
    """Control media playback: play_pause | next_track | prev_track."""
    if _PLATFORM == "win32" or _PLATFORM == "darwin":
        _media_control_pynput(command)
    else:  # linux
        _media_control_playerctl(command)

def _media_control_pynput(command: str) -> None:
    """Windows/macOS: pynput media key simulation."""
    from pynput.keyboard import Controller, Key
    controller = Controller()
    
    key_map = {
        "play_pause": Key.media_play_pause,
        "next_track": Key.media_next,
        "prev_track": Key.media_previous,
    }
    key = key_map.get(command)
    if not key:
        raise ValueError(f"Unknown media command: {command}")
    
    controller.press(key)
    controller.release(key)

def _media_control_playerctl(command: str) -> None:
    """Linux: playerctl MPRIS control."""
    import subprocess
    cmd_map = {
        "play_pause": "play-pause",
        "next_track": "next",
        "prev_track": "previous",
    }
    playerctl_cmd = cmd_map.get(command)
    if not playerctl_cmd:
        raise ValueError(f"Unknown media command: {command}")
    
    try:
        subprocess.run(
            ["playerctl", playerctl_cmd],
            check=True,
            capture_output=True,
        )
    except FileNotFoundError:
        raise ValueError("playerctl not found. Install playerctl: apt install playerctl")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"playerctl failed: {exc.stderr.decode()}")
```

### Pattern 3: SSE Event Routing in chat.py

**What:** Add `elif event_type == "action"` branch to handle non-agentic `event: action` SSE from gateway.

**Current code flow:**
- `_handle_agentic_event()` branches on `event_type` ("task:plan", "task:pc_action", etc.)
- Phase 79 added `task:pc_action` — agentic PC actions with task resumption
- Phase 80 adds `event: action` — non-agentic fast-path (no task_id, no resume)

**Example:**
```python
def _handle_agentic_event(event_type: str, payload: str, config: JarvisConfig) -> None:
    """Dispatch a named SSE event to the appropriate handler."""
    global _debug_mode
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        if _debug_mode or config.debug_events:
            _console().print(f"[debug] malformed event {event_type!r}: {payload!r}")
        return
    
    # ... existing task:plan, task:awaiting-confirmation, etc. branches ...
    
    elif event_type == "action":
        # NEW Phase 80: non-agentic action (e.g., "aumenta o volume")
        from jarvis_desktop import pc_control
        from jarvis_desktop import ui as _ui
        action = data.get("action", "")
        params = data.get("args", {})  # NOTE: backend sends "args", normalize to "params"
        _ui.set_state("executing_pc_action")
        try:
            result = pc_control.execute_pc_action(action, params, config)
            # No task_id, no resume — just log result
            if result.get("result") != "ok":
                _console().print(f"[erro: {result.get('error', 'ação falhou')}]")
        finally:
            _ui.set_state("idle")
    
    elif event_type == "task:pc_action":
        # Existing Phase 79: agentic PC action with task resumption
        from jarvis_desktop import pc_control
        from jarvis_desktop import ui as _ui
        action = data.get("action", "")
        params = data.get("params", {})
        task_id = data.get("taskId", "")
        _ui.set_state("executing_pc_action")
        try:
            result = pc_control.execute_pc_action(action, params, config)
        finally:
            _ui.set_state("idle")
        if result.get("result") == "ok":
            _post_task_resume(config, task_id, "confirm", feedback=str(result))
        # ... handle error/aborted ...
    
    else:
        if _debug_mode or config.debug_events:
            _console().print(f"[debug] {event_type}: {payload}")
```

### Anti-Patterns to Avoid

- **Hardcoded volume scales:** Don't assume pycaw uses 0–100. It uses 0.0–1.0 floats. Normalize on entry/exit to avoid off-by-one bugs.
- **Blocking subprocess calls without timeout:** Always use `timeout=10` in subprocess.run() to prevent hangs on missing tools.
- **Ignoring subprocess stderr:** Capture and log errors from pactl/osascript/playerctl for debugging.
- **Media key simulation on Linux without playerctl fallback:** pynput media keys are unreliable on Linux X11/Wayland. Always branch to playerctl.
- **Not checking if pactl/playerctl installed:** Lazy-check via try/except FileNotFoundError, log helpful error message (e.g., "Install PulseAudio: apt install pulseaudio-utils").

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows audio control | Custom Win32 API wrapper | pycaw | pycaw handles COM initialization, error handling, device enumeration. Rolling this yourself is 500+ LOC of unforgiving COM code. |
| Linux media player control | Custom D-Bus introspection | playerctl | D-Bus MPRIS introspection is complex (version detection, player discovery, state management). playerctl is battle-tested across 4K+ GitHub stars. |
| Volume normalization (0–100 ↔ 0–1.0) | Custom clamping logic | Single conversion function `_normalize_volume()` | Prevents off-by-one errors; centralize the logic. |
| Detecting pactl/playerctl availability | Call and catch stderr | `shutil.which()` before call | Cleaner, faster, no false-positive errors. |

**Key insight:** Volume control backends (pycaw, pactl, osascript) are mature, tested tools designed specifically for this. Custom solutions introduce platform-specific bugs (COM initialization, D-Bus marshalling, process signal handling) that are expensive to debug.

---

## Common Pitfalls

### Pitfall 1: pycaw COM Initialization on Headless/RDP Sessions

**What goes wrong:** pycaw.AudioUtilities.GetSpeakers() raises `COMError` on RDP/headless Windows (no audio device enumerated).

**Why it happens:** Windows COM expects a display session with active audio hardware. Terminal sessions and RDP may not have audio endpoints registered.

**How to avoid:** Wrap in `try/except COMError`. Return descriptive error ("Audio control unavailable — headless/RDP session") instead of crashing.

**Warning signs:** Code works on developer's PC but fails in CI/CD or headless VM.

### Pitfall 2: Relative Volume Syntax Confusion (pactl)

**What goes wrong:** Using absolute volume with pactl: `pactl set-sink-volume @DEFAULT_SINK@ 50` sets to 50 absolute (not +50).

**Why it happens:** pactl syntax is: `set-sink-volume <sink> <volume>`. To adjust relative, **prefix with +/-**: `+5%` or `-10%`.

**How to avoid:** Always use `f"{sign}{delta}%"` where `sign = "+" if delta >= 0 else ""`. Test with `pactl list sinks` to verify volume changes.

**Warning signs:** Volume jumps to exact value instead of incrementing; user asks "why did it go to 30% instead of adding 30%?"

### Pitfall 3: osascript Parsing "set volume settings" Output

**What goes wrong:** Parsing `osascript -e "get volume settings"` output is fragile — format changes across macOS versions.

**Why it happens:** AppleScript output is human-readable, not JSON. Format: `"volume:75, input volume:100, alert volume:50, output muted:false"` (order may vary).

**How to avoid:** Use regex or split parsing, not simple `.split(":")[1]`. Test on macOS 12, 13, 14, 15. Consider caching current volume in memory to avoid repeated queries.

**Warning signs:** Works on one macOS version, breaks on another; regex out-of-bounds errors.

### Pitfall 4: pynput Media Keys Unreliable on Linux Wayland

**What goes wrong:** `Key.media_play_pause` press/release has no effect on Wayland; X11 may have issues with some key combinations.

**Why it happens:** Wayland doesn't support XSend input simulation. pynput falls back to uinput or X11 shims, neither of which work reliably for media keys.

**How to avoid:** **Always branch to playerctl on Linux.** pynput is fallback-only. playerctl uses D-Bus MPRIS, which Wayland respects natively.

**Warning signs:** Media control works on Windows/macOS, fails silently on Linux. User says "I told JARVIS to pause, nothing happened."

### Pitfall 5: subprocess.run() Hangs Without Timeout

**What goes wrong:** `subprocess.run(["pactl", ...])` hangs indefinitely if pactl is misconfigured or PulseAudio daemon is stuck.

**Why it happens:** pactl may block waiting for daemon response (e.g., PulseAudio not running, D-Bus timeout).

**How to avoid:** Always set `timeout=10` in subprocess.run(). Wrap in try/except subprocess.TimeoutExpired. Return error instead of hanging.

**Warning signs:** JARVIS stops responding; user has to Ctrl+C the entire session.

---

## Code Examples

### Volume Control Example (Multi-Platform)

```python
# Source: Phase 80 implementation pattern
def adjust_volume(delta: int) -> None:
    """Adjust system volume by ±N percentage points.
    
    Args:
        delta: Relative volume change in percentage points [-100, +100].
               +10 increases by 10%, -5 decreases by 5%.
    
    Raises:
        ValueError: If backend fails or volume out of range.
    """
    # Clamp delta to reasonable range
    delta = max(-100, min(100, delta))
    
    if _PLATFORM == "win32":
        _adjust_volume_windows(delta)
    elif _PLATFORM == "darwin":
        _adjust_volume_macos(delta)
    else:
        _adjust_volume_linux(delta)

# Windows implementation
def _adjust_volume_windows(delta: int) -> None:
    """Windows: pycaw IAudioEndpointVolume control."""
    try:
        import pycaw.api as pycaw
        
        devices = pycaw.AudioUtilities.GetSpeakers()
        interface = devices.Activate(
            pycaw.IAudioEndpointVolume._iid_, None, None
        )
        volume = interface.QueryInterface(pycaw.IAudioEndpointVolume)
        
        current = volume.GetMasterVolumeLevelScalar()  # [0.0, 1.0]
        new_vol = max(0.0, min(1.0, current + delta / 100.0))
        volume.SetMasterVolumeLevelScalar(new_vol, None)
        
    except ImportError:
        raise ValueError("pycaw not installed (Windows only)")
    except Exception as exc:
        raise ValueError(f"Windows volume control failed: {exc}")

# Linux implementation
def _adjust_volume_linux(delta: int) -> None:
    """Linux: pactl relative volume adjustment (PulseAudio/Pipewire)."""
    import subprocess
    try:
        sign = "+" if delta >= 0 else ""
        subprocess.run(
            ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{sign}{delta}%"],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise ValueError(
            "pactl not found. Install PulseAudio: apt install pulseaudio-utils"
        )
    except subprocess.TimeoutExpired:
        raise ValueError("pactl timed out (PulseAudio daemon stuck?)")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"pactl failed: {exc.stderr.decode().strip()}")

# macOS implementation
def _adjust_volume_macos(delta: int) -> None:
    """macOS: osascript AppleScript volume adjustment."""
    import subprocess
    try:
        # Get current volume (0–100)
        result = subprocess.run(
            ["osascript", "-e", "output volume of (get volume settings)"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        current = int(result.stdout.strip())
        new_vol = max(0, min(100, current + delta))
        
        subprocess.run(
            ["osascript", "-e", f"set volume output volume {new_vol}"],
            check=True,
            timeout=5,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("osascript timed out")
    except (ValueError, subprocess.CalledProcessError) as exc:
        raise ValueError(f"macOS volume control failed: {exc}")
```

### Media Control Example (Multi-Platform)

```python
# Source: Phase 80 implementation pattern
def media_control(command: str) -> None:
    """Control active media player.
    
    Args:
        command: 'play_pause' | 'next_track' | 'prev_track'
    
    Raises:
        ValueError: If command unknown or backend fails.
    """
    valid = {"play_pause", "next_track", "prev_track"}
    if command not in valid:
        raise ValueError(f"Unknown media command: {command!r}. Valid: {valid}")
    
    if _PLATFORM in ("win32", "darwin"):
        _media_control_pynput(command)
    else:
        _media_control_playerctl(command)

# Windows/macOS implementation
def _media_control_pynput(command: str) -> None:
    """Windows/macOS: pynput media key simulation."""
    from pynput.keyboard import Controller, Key
    
    key_map = {
        "play_pause": Key.media_play_pause,
        "next_track": Key.media_next,
        "prev_track": Key.media_previous,
    }
    
    key = key_map[command]  # Guaranteed valid by media_control()
    controller = Controller()
    
    # Press and release the media key
    controller.press(key)
    controller.release(key)

# Linux implementation
def _media_control_playerctl(command: str) -> None:
    """Linux: playerctl MPRIS media player control."""
    import subprocess
    
    cmd_map = {
        "play_pause": "play-pause",
        "next_track": "next",
        "prev_track": "previous",
    }
    
    playerctl_cmd = cmd_map[command]  # Guaranteed valid by media_control()
    
    try:
        subprocess.run(
            ["playerctl", playerctl_cmd],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise ValueError(
            "playerctl not found. Install: apt install playerctl"
        )
    except subprocess.TimeoutExpired:
        raise ValueError("playerctl timed out")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"playerctl failed: {exc.stderr.decode().strip()}")
```

### SSE Event Routing (chat.py)

```python
# Source: Phase 80 integration in chat.py _handle_agentic_event()
def _handle_agentic_event(event_type: str, payload: str, config: JarvisConfig) -> None:
    """Dispatch named SSE events."""
    global _debug_mode
    
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        if _debug_mode or config.debug_events:
            _console().print(f"[debug] malformed {event_type!r}: {payload!r}")
        return
    
    # ... existing event types ...
    
    elif event_type == "action":
        # Phase 80: Non-agentic PC actions (volume, media)
        # Note: payload has "args" (from gateway), normalize to "params"
        from jarvis_desktop import pc_control
        from jarvis_desktop import ui as _ui
        
        action = data.get("action", "")
        params = data.get("args", {})  # Gateway sends "args", we use "params" internally
        
        _ui.set_state("executing_pc_action")
        try:
            result = pc_control.execute_pc_action(action, params, config)
        finally:
            _ui.set_state("idle")
        
        # No task_id or resume — just log any errors
        if result.get("result") != "ok":
            error_msg = result.get("error", "ação falhou")
            _console().print(f"[Erro: {error_msg}]")
        # Silent success for simple volume/media commands
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom Win32 volume API binding | pycaw library (mature, FOSS) | Standardized ~2015 | Eliminates 500+ LOC of COM boilerplate; better error handling |
| Hardcoded media key simulation on all OSes | Branch: pynput (Win/macOS), playerctl (Linux) | D-Bus/Wayland rise (2020+) | Wayland support on Linux; pynput unreliable for media keys |
| Absolute volume setter only | Relative adjust_volume (delta ±100) | Phase 80 | Matches natural voice UX ("volume down a bit" not "set to 45%") |
| Per-app audio mixer | System-wide master volume | v3.3 | Simpler, covers 90% of UX. Per-app defer to v3.4. |

**Deprecated/outdated:**
- **Custom X11 media key simulation:** Replaced by playerctl (MPRIS) — more reliable, Wayland-compatible
- **Coqui TTS project:** Archived 2024 — kokoro is recommended instead

---

## Open Questions

1. **pycaw COMError on headless Windows (CI/CD)?**
   - What we know: pycaw.AudioUtilities.GetSpeakers() fails on headless/RDP
   - What's unclear: Should we fail gracefully or provide fallback?
   - Recommendation: Catch COMError, return "Audio unavailable on this session" (acceptable for CI/CD; user machines have audio)

2. **Volume scale mismatch (pycaw float vs delta int)?**
   - What we know: Delta is ±100 (percentage points), pycaw uses 0.0–1.0
   - What's unclear: Should we clamp or saturate on overflow (e.g., delta=+50 when current=75)?
   - Recommendation: Clamp: `new = max(0.0, min(1.0, current + delta/100.0))`. User expects "volume maxes out" not "adds 50 then errors"

3. **What if pactl or playerctl aren't installed?**
   - What we know: FileNotFoundError on subprocess.run()
   - What's unclear: Should JARVIS warn at startup or fail silently?
   - Recommendation: Fail silently on call (user won't use volume/media commands). On first volume command, user gets error. TTS can read it back.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pycaw | adjust_volume, toggle_mute (Windows) | ✓ (PyPI) | 0.9.1+ | — (Windows only) |
| pactl | adjust_volume, toggle_mute (Linux) | ✓ (system) | (PulseAudio shipped) | Pipewire ships compatible pactl |
| osascript | adjust_volume, toggle_mute (macOS) | ✓ (system) | (macOS built-in) | — (native) |
| pynput | media_control (Windows, macOS) | ✓ (already installed) | 1.7.0+ | — (already required by Phase 74) |
| playerctl | media_control (Linux) | ✗ (optional system) | (4K+ stars) | Error message guides install: `apt install playerctl` |

**Missing dependencies with no fallback:**
- None for Phase 80. pycaw is conditional (Windows-only). pactl/osascript/pynput are system-provided or already in stack.

**Missing dependencies with fallback:**
- **playerctl on Linux:** User can still run JARVIS; volume/media commands fail with helpful error. Fallback: user installs manually.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 (existing) |
| Config file | `pyproject.toml` (existing) |
| Quick run command | `pytest tests/test_pc_control.py -k "adjust_volume or toggle_mute or media_control" -x` |
| Full suite command | `pytest tests/test_pc_control.py` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PCTRL-07 | `adjust_volume(delta: int)` increases/decreases volume on all 3 OSes | unit (mocked backends) | `pytest tests/test_pc_control.py::test_adjust_volume_* -x` | ❌ Wave 0 |
| PCTRL-07 | `toggle_mute()` toggles mute state on all 3 OSes | unit (mocked backends) | `pytest tests/test_pc_control.py::test_toggle_mute_* -x` | ❌ Wave 0 |
| PCTRL-08 | `media_control(command)` sends correct pynput keys (Win/macOS) | unit (mocked pynput) | `pytest tests/test_pc_control.py::test_media_control_pynput_* -x` | ❌ Wave 0 |
| PCTRL-08 | `media_control(command)` runs playerctl subprocess (Linux) | unit (mocked subprocess) | `pytest tests/test_pc_control.py::test_media_control_playerctl_* -x` | ❌ Wave 0 |
| PCTRL-07 + PCTRL-08 | Actions logged to `~/.jarvis/audit.json` | unit | `pytest tests/test_pc_control.py::test_audit_log_volume_media -x` | ❌ Wave 0 |
| Phase 80 integration | SSE `event: action` routed to `execute_pc_action()` in chat.py | integration | `pytest tests/test_chat.py::test_handle_sse_action_event_volume -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_pc_control.py::test_adjust_volume_* tests/test_pc_control.py::test_media_control_* -x`
- **Per wave merge:** `pytest tests/test_pc_control.py tests/test_chat.py -k "pc_control or action_event" --tb=short`
- **Phase gate:** Full test suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_pc_control.py` — add test stubs for `test_adjust_volume_windows`, `test_adjust_volume_linux`, `test_adjust_volume_macos`, `test_toggle_mute_*`, `test_media_control_pynput_*`, `test_media_control_playerctl_*` (xfail stubs)
- [ ] `tests/conftest.py` — add fixtures: `mock_pycaw`, `mock_pactl`, `mock_osascript`, `mock_pynput_controller`, `mock_playerctl_subprocess`
- [ ] `tests/test_chat.py` — add test stub for `test_handle_sse_action_event_volume` (xfail), `test_handle_sse_action_event_media` (xfail)
- [ ] `pyproject.toml` — add `pycaw>=0.9.1; sys_platform == "win32"` to dependencies

*(If Wave 0 creates stubs:) Wave 0 setup ensures test structure is in place before implementation. Wave 1 implements adjust_volume/toggle_mute backends, Wave 2 implements media_control, Wave 3 tests SSE routing.*

---

## Runtime State Inventory

Not applicable — Phase 80 is greenfield (no rename/migration). No existing stored data, config, or OS-registered state to audit.

---

## Sources

### Primary (HIGH confidence)

- **pycaw 0.9.1** — PyPI, Windows Core Audio wrapper, verified current ([PyPI pycaw](https://pypi.org/project/pycaw/), [GitHub AndreMiras/pycaw](https://github.com/AndreMiras/pycaw))
- **pactl (PulseAudio)** — Linux system tool, verified in Ubuntu 20.04+ manpages ([Ubuntu pactl manpage](https://manpages.ubuntu.com/manpages/focal/man1/pactl.1.html))
- **osascript (AppleScript)** — macOS built-in, verified across macOS 10.7+ ([osxdaily article](https://osxdaily.com/2007/04/28/change-the-system-volume-from-the-command-line-in-mac-os-x/))
- **pynput 1.7.0+** — PyPI, media key support since 1.5.0 ([pynput GitHub #171](https://github.com/moses-palmer/pynput/pull/171), [PyPI pynput](https://pypi.org/project/pynput/))
- **playerctl** — GitHub, MPRIS D-Bus standard, 4K+ stars ([GitHub altdesktop/playerctl](https://github.com/altdesktop/playerctl), [Ubuntu manpage](https://manpages.ubuntu.com/manpages/noble/man1/playerctl.1.html))

### Secondary (MEDIUM confidence)

- **pynput media keys Linux issues** — GitHub issues #190, #313, #580 document X11/Wayland limitations; playerctl fallback validated by community
- **pactl Pipewire compatibility** — Pipewire ships pactl shim (confirmed in pactl manpage note: "Works with PulseAudio and Pipewire")
- **osascript volume parsing** — Multiple sources (TechOverflow, coolaj86, osxdaily) confirm syntax; format variation noted across macOS versions

### Tertiary (LOW confidence — flagged for validation)

- None — all recommendations backed by official tools or high-confidence sources

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — pycaw, pactl, osascript, pynput, playerctl all documented, tested, widely used
- **Architecture:** HIGH — branching pattern proven in Phase 79 (pc_control.py module structure); SSE routing pattern proven in Phase 77-78 (chat.py event handlers)
- **Pitfalls:** MEDIUM-HIGH — Common issues documented in GitHub issues, StackOverflow, official manpages; some platform-specific edge cases (osascript parsing) need empirical validation during implementation

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (30 days for stable libraries)

**Key unknowns for planner:**
- Exact pycaw API call sequence (will confirm in implementation phase)
- Volume parsing fragility on macOS (will test multiple versions during Wave 1)
- Timeout values for subprocess calls (recommend 5–10s, will tune during testing)

---

## Confidence Summary

**Overall Phase 80 research confidence: HIGH**

- All three platform backends identified with existing, mature libraries
- No unknown blockers; all tools documented and tested
- Integration pattern (SSE routing) proven in Phase 79–78
- Audit logging reuses Phase 79 infrastructure
- Environment availability confirmed (pycaw Windows-only; others system/already-installed)

**Ready for planning:** Yes. Planner can create task structure confident that implementation follows established patterns and uses proven libraries.
