# Phase 59: System Controls - Research

**Researched:** 2026-05-06
**Domain:** Cross-platform system control (volume, mute, media playback)
**Confidence:** HIGH

## Summary

Phase 59 adds voice-controlled system volume and media playback to JARVIS. The implementation follows established patterns: backend LangGraph tools emit structured payloads, Electron handlers execute platform-specific commands (Linux/macOS/Windows), and no new IPC channels are needed — payloads dispatch through the existing `ACTION_HANDLERS` map.

The phase depends only on Phase 57 (active LLM provider) and reuses infrastructure from Phase 44 (macOS permission gating) for Accessibility permission checks on media controls.

**Primary recommendation:** Implement three new tools (`adjust_volume`, `toggle_mute`, `media_control`) and three matching handlers using `runExecFile` with `process.platform` switches. Volume uses delta-based adjustment (LLM chooses magnitude); media uses enum commands. Both tools require Zod schema definitions in backend and handler registration in desktop action index.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Volume — adjust_volume**
- New tool with `delta: number` argument — LLM chooses freely (e.g. +15 for "aumenta bastante", -10 for "diminui um pouco"). No fixed deltas.
- Handler reads current volume, applies delta, clamps to [0, 100].
- Existing `set_volume` tool remains for absolute commands ("coloca o volume em 50").

**Volume — toggle_mute**
- New tool `toggle_mute` with no arguments. LLM uses for "muta", "silencia", "tira o mudo", "unmute".
- Handler checks current mute state and inverts.

**Cross-platform volume**
- Full support for Linux/macOS/Windows in same phase:
  - **Linux:** `pactl` (already available via `runExecFile`)
  - **macOS:** `osascript` — AppleScript for adjust and mute
  - **Windows:** PowerShell (`Set-Volume`, `Get-AudioDevice`) or `nircmd`
- Pattern: handler with `switch(process.platform)` or internal platform helpers (follow `set-brightness.ts` model).

**Media — media_control**
- One tool with schema `{ command: 'play_pause' | 'next_track' | 'prev_track' }`.
- Platform mechanisms:
  - **Linux:** `playerctl play-pause`, `playerctl next`, `playerctl previous`
  - **macOS:** `osascript` AppleScript to simulate media keys via System Events
  - **Windows:** PowerShell `SendKeys` (`{MEDIA_PLAY_PAUSE}`, `{MEDIA_NEXT_TRACK}`, `{MEDIA_PREV_TRACK}`) or `nircmd`
- If `playerctl` not installed on Linux, handler returns error with descriptive message.

**macOS Accessibility permission gate**
- Reuse exact pattern from Phase 44 (mic permission) — actionable "Abrir System Settings" toast if Accessibility permission missing.
- Media commands do not fail silently.

**Tool registration**
- Three new tools registered via `createAllPcTools()` following existing 9 PC tools pattern.
- No new IPC channels needed.

### Claude's Discretion

- Zod schema for `adjust_volume` (range hints, field descriptions)
- Inline `switch(process.platform)` vs separate handler files by platform
- Windows fallback strategy if `nircmd` unavailable
- AppleScript details for macOS volume (set volume vs output volume)

### Deferred Ideas (OUT OF SCOPE)

- Media control by app (Spotify, YouTube Music) — v2.4
- Cross-platform brightness control — v2.4
- Volume per app (mixer) — not mentioned, new capability

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| SYSCTRL-01 | User can control system volume (increase, decrease, mute/unmute) via voice command | `adjust_volume` and `toggle_mute` tools + cross-platform handlers (pactl/osascript/PowerShell) + system prompt updates |
| SYSCTRL-02 | User can control media playback (play/pause, next track, previous track) via voice command | `media_control` tool with enum schema + platform handlers (playerctl/osascript/PowerShell) + system prompt updates |

</phase_requirements>

## Standard Stack

### Core Tools (Backend)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| LangChain `tool()` | per pc-tools.ts | Structured tool definitions with Zod schemas | Established pattern for all 9 existing PC tools in JARVIS |
| Zod | 4.3.6 | Schema validation for tool inputs | Enforces type safety; enum support for media commands |
| LangGraph | 1.2.8 | Tool registration and invocation | Standard orchestration runtime; tools integrated via `createAllPcTools()` |

### Handlers (Desktop/Electron)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Node.js `execFile` (via validators.ts wrapper) | Node 22+ | Safe subprocess execution | Used by all existing handlers; prevents shell injection via arg array |
| pactl (Linux) | System package | ALSA audio control | De facto standard for volume on PulseAudio/Pipewire systems |
| playerctl (Linux) | System package (optional) | Media key simulation | Standard DBus-based player control; all major players supported |
| osascript (macOS) | Built-in | AppleScript execution | Only way to control system volume on macOS; media key simulation via System Events |
| PowerShell (Windows) | Built-in | Audio device control + media keys | `[Windows.Media.Control]` and `SendKeys` for media; modern Windows default |
| nircmd (Windows, optional) | External utility | Fallback media key sender | Lightweight CLI for media keys if PowerShell unavailable |

### Supporting Infrastructure
| Item | Location | Purpose |
|------|----------|---------|
| `runExecFile()` | apps/desktop/src/main/actions/validators.ts | Safe subprocess wrapper with error mapping |
| `ActionHandler` type | apps/desktop/src/main/actions/types.ts | Async handler signature → `ActionResult` |
| `ACTION_HANDLERS` map | apps/desktop/src/main/actions/index.ts | Route action names to handlers |
| `REQUIRES_CONFIRMATION` set | apps/desktop/src/main/actions/index.ts | Mark non-destructive actions (volume/media skip confirmation) |

## Architecture Patterns

### Recommended Project Structure

Handlers follow existing directory layout:
```
apps/desktop/src/main/actions/
├── adjust-volume.ts       # NEW: delta-based volume adjustment
├── toggle-mute.ts         # NEW: toggle mute state
├── media-control.ts       # NEW: play/pause/next/prev
├── types.ts               # ActionHandler, ActionResult, ok(), fail()
├── validators.ts          # runExecFile, assertLevel0to100, etc.
├── index.ts               # ACTION_HANDLERS map (add 3 new entries)
└── [existing handlers]
```

Tools follow backend pattern:
```
apps/backend-ts/src/session/
├── pc-tools.ts            # createAdjustVolumeTool, createToggleMuteTool, createMediaControlTool
├── chat-session.ts        # calls createAllPcTools() (no changes; auto-picks up new tools)
└── system-prompt.ts       # Update tool descriptions in SYSTEM_PROMPT
```

### Pattern 1: Handler with Platform Switch

**What:** Single handler file with `if (process.platform === ...)` logic for each OS.

**When to use:** All three new handlers — follow `close-file.ts` model (Windows `taskkill` vs Unix `pkill`).

**Example (adjust_volume.ts):**
```typescript
// Source: Phase 59 pattern based on close-file.ts (Phase 55)
export const adjustVolumeHandler: ActionHandler = async (args) => {
  try {
    const delta = assertDelta(args.delta); // -100 to +100
    let newLevel: number;

    if (process.platform === 'win32') {
      newLevel = await getVolumeWindowsAndAdjust(delta);
    } else if (process.platform === 'darwin') {
      newLevel = await getVolumeMacAndAdjust(delta);
    } else {
      // Linux
      newLevel = await getVolumeLinuxAndAdjust(delta);
    }

    return ok(`volume adjusted to ${newLevel}%`);
  } catch (err) {
    return fail(describeError(err));
  }
};

async function getVolumeLinuxAndAdjust(delta: number): Promise<number> {
  // Get current volume via: pactl get-sink-volume @DEFAULT_SINK@ | grep 'Volume:' | extract percent
  // Apply delta, clamp to [0, 100]
  // Set via: pactl set-sink-volume @DEFAULT_SINK@ <newLevel>%
  // Return newLevel
}

async function getVolumeMacAndAdjust(delta: number): Promise<number> {
  // osascript: get output volume of (get default audio device)
  // Apply delta, clamp to [0, 100]
  // osascript: set volume output volume <newLevel>
  // Return newLevel
}

async function getVolumeWindowsAndAdjust(delta: number): Promise<number> {
  // PowerShell: [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
  // or: Get-AudioDevice -list | Get-Volume
  // Apply delta, clamp to [0, 100]
  // Set via: Set-Volume -Level <newLevel>
  // Return newLevel
}
```

### Pattern 2: Tool with Enum Schema

**What:** Zod object schema with literal string union for constrained choices.

**When to use:** `media_control` tool — LLM must choose from exact set of commands.

**Example (pc-tools.ts createMediaControlTool):**
```typescript
// Source: Phase 59 decision D-08
export function createMediaControlTool() {
  return tool(
    async ({ command }: { command: string }) => {
      return buildResult({ action: 'media_control', args: { command } });
    },
    {
      name: 'media_control',
      description:
        'Controls media playback on the active media player. Use when the user asks to play, ' +
        'pause, skip to next track, or go to previous track. Examples: "pause a música", ' +
        '"próxima faixa", "volta a faixa anterior".',
      schema: z.object({
        command: z.enum(['play_pause', 'next_track', 'prev_track']).describe(
          'Media control command: play_pause toggles playback, next_track skips forward, ' +
          'prev_track goes back.'
        ),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}
```

### Anti-Patterns to Avoid

- **Hardcoded volume levels:** Don't fix delta to [+10, -10, +5]. Decision D-01 explicitly allows LLM freedom (e.g. +20 for "bastante", +2 for "um pouco").
- **Silent failures on missing playerctl:** Decision D-10 mandates descriptive error message, not silent fallback. User must know why media control didn't work.
- **Ignoring macOS Accessibility permission:** Decision D-11 requires same gate pattern as Phase 44 mic permission. No silent failures.
- **Multiple IPC channels:** All payloads route through existing `ACTION_HANDLERS` map. Decision D-12 prohibits new IPC.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Getting current volume level | Custom shell parsing | Existing `runExecFile` + `pactl get-sink-volume` / PowerShell Get-Volume API | runExecFile handles error codes, stderr capture, timeouts |
| Media key simulation on Linux | Custom D-Bus events | `playerctl` via `runExecFile` | playerctl abstracts player detection, retries on transient failures |
| macOS permission gating | New permission check code | Phase 44 `VoiceModeSwitchResult` + toast pattern | Reusable, already tested, user-familiar UX |
| Zod schema definition | Hand-validation of command string | `z.enum(['play_pause', 'next_track', 'prev_track'])` | Type safety, compile-time checking, LangChain integration |
| Windows audio control | WinAPI P/Invoke wrappers | PowerShell `Set-Volume` cmdlet or `nircmd` CLI | No native bindings needed; cross-platform subprocess safety |

**Key insight:** Platform-specific volume/media control is traditionally fragile (missing tools, permission issues, API changes). Lean heavily on well-tested CLI tools (`pactl`, `playerctl`, `osascript`, PowerShell) wrapped by `runExecFile` rather than trying native APIs directly.

## Common Pitfalls

### Pitfall 1: Delta Clamping Logic

**What goes wrong:** Handler applies delta without reading current level first, then clamps. Example: current=95, delta=+15 → request 110 → clamp to 100. But user asked to "aumenta bastante", expecting full volume; they got limited feedback.

**Why it happens:** Trying to avoid the extra `get-sink-volume` call seems efficient, but it breaks user intent.

**How to avoid:** 
1. Read current level via `pactl get-sink-volume @DEFAULT_SINK@` or equivalent.
2. Apply delta: `newLevel = clamp(currentLevel + delta, 0, 100)`.
3. Set new level.
4. Return actual achieved level in success message.

**Warning signs:** Handler only accepts `delta` and ignores current state; no "get" command in code.

### Pitfall 2: playerctl Not Installed on Linux

**What goes wrong:** Media command silently fails or throws uncaught error. User hears no confirmation. No diagnostic message.

**Why it happens:** Assuming `playerctl` is universal; it's not (light DE systems may omit it).

**How to avoid:**
1. `runExecFile('playerctl', ...)` will throw `ActionValidationError('command_not_found', 'playerctl')`.
2. Catch and return `fail('playerctl not found — install playerctl to control media')`.
3. Descriptive message tells user what to fix.

**Warning signs:** Error message is generic or empty; no "install X" guidance.

### Pitfall 3: macOS osascript Syntax for Volume

**What goes wrong:** AppleScript `set volume <num>` sets system alert volume (bell), not output volume. Media keys don't work because Accessibility permission error is silently swallowed.

**Why it happens:** osascript syntax is finicky; easy to mix up `volume` (alert) vs `output volume` (speakers).

**How to avoid:**
1. Use `osascript -e "set volume output volume <level>"` (NOT `set volume <level>`).
2. Use `get volume output volume` to read current level.
3. For media keys, use AppleScript `tell application "System Events" to key code <code>` — requires Accessibility permission.
4. Always check permission BEFORE media commands fail. Reuse Phase 44 gate.

**Warning signs:** osascript output is 0 or 50 (default alert volume) instead of actual speaker level; media key commands throw "not allowed" error without actionable recovery.

### Pitfall 4: Windows PowerShell Set-Volume Availability

**What goes wrong:** `Set-Volume` cmdlet not available on older Windows or blocked by execution policy. Script silently runs but does nothing.

**Why it happens:** Different Windows versions have different PS modules; no version guard in code.

**How to avoid:**
1. Test for cmdlet availability: `Get-Command Set-Volume` and check exit code.
2. If missing, try fallback: `nircmd muteappvolume <pid> <0|1>` for app volume or `nircmd setsysvolume <level>` for system.
3. Return descriptive error if both fail (e.g. "Set-Volume cmdlet not available and nircmd not found").
4. Document Windows prerequisites in Phase plan.

**Warning signs:** No fallback logic; no error handling for `Get-AudioDevice` failures; code assumes modern Windows with all modules.

### Pitfall 5: Media Key Codes Platform Mismatch

**What goes wrong:** Using Linux media key codes on macOS or Windows. Script runs but does nothing.

**Why it happens:** Each OS has different keycodes (X11 KeySyms, AppleScript codes, Windows VK_ constants). Copy-paste errors are common.

**How to avoid:**
1. Document keycodes per platform in code comments:
   - **Linux/X11:** keysyms 0xffd7 (pause), 0xffd6 (play), 0xff61 (next), 0xff62 (prev) or use `playerctl` (preferred).
   - **macOS:** osascript key codes (e.g. 16 for space to play/pause, or media key constants in System Events).
   - **Windows:** WScript.Shell SendKeys {MEDIA_PLAY_PAUSE}, {MEDIA_NEXT_TRACK}, {MEDIA_PREV_TRACK}.
2. Write separate function per platform; don't share keycode constants.

**Warning signs:** Single keycode constant used across platforms; playerctl skipped on Linux in favor of custom keycodes.

## Code Examples

Verified patterns from existing codebase:

### Platform-Specific Handler Pattern (close-file.ts reference)
```typescript
// Source: apps/desktop/src/main/actions/close-file.ts (Phase 55)
export const closeFileHandler: ActionHandler = async (args) => {
  try {
    const processName = assertSafeAppName(args['processName']);
    if (process.platform === 'win32') {
      await runExecFile('taskkill', ['/IM', processName, '/F']);
    } else {
      await runExecFile('pkill', ['-f', processName]);
    }
    return ok(`process killed: ${processName}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
```

### Tool Factory Pattern (from pc-tools.ts)
```typescript
// Source: apps/backend-ts/src/session/pc-tools.ts (Phase 18-01)
export function createSetVolumeTool() {
  return tool(
    async ({ level }: { level: number }) => {
      return buildResult({ action: 'set_volume', args: { level } });
    },
    {
      name: 'set_volume',
      description: 'Define o volume do sistema. Use quando o usuário pedir...',
      schema: z.object({
        level: z.number().int().describe('Nível de volume de 0 a 100.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}
```

### Handler Registration Pattern (index.ts)
```typescript
// Source: apps/desktop/src/main/actions/index.ts
export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  open_app: openAppHandler,
  // ... existing handlers
  set_volume: setVolumeHandler,
  set_brightness: setBrightnessHandler,
  // NEW for Phase 59:
  adjust_volume: adjustVolumeHandler,
  toggle_mute: toggleMuteHandler,
  media_control: mediaControlHandler,
};

export const REQUIRES_CONFIRMATION: Set<string> = new Set([
  'delete_file',
  // Phase 59: volume and media are non-destructive, no confirmation needed
]);
```

### Asserter Pattern (validators.ts)
```typescript
// Source: apps/desktop/src/main/actions/validators.ts
export function assertLevel0to100(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
    throw new ActionValidationError('invalid_args', 'level must be integer in [0,100]');
  }
  return v;
}

// NEW asserter for adjust_volume delta:
export function assertDelta(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < -100 || v > 100) {
    throw new ActionValidationError('invalid_args', 'delta must be integer in [-100, 100]');
  }
  return v;
}
```

## State of the Art

| Aspect | Current (v2.3) | Baseline (why change) |
|--------|---|---|
| Volume control | `set_volume` (absolute level only) | Phase 59 adds `adjust_volume` (delta-based) for natural "увеличь громкость" → LLM chooses magnitude |
| Media control | None (gap in SYSCTRL-02) | Phase 59 adds `media_control` enum tool |
| System command safety | `runExecFile` + arg arrays | No change; pattern is proven in Phase 55 file actions |
| macOS permission gates | Phase 44 mic permission gate | Phase 59 reuses exact same pattern for Accessibility (media keys) |
| Platform support | Linux-only or partial | Phase 59: full Linux/macOS/Windows parity for volume and media |

**Deprecated/outdated:**
- None for this phase. All dependencies (`runExecFile`, `ActionHandler`, handler registration) are current.

## Environment Availability

### System Tools Required

| Dependency | Required By | Available | Action |
|---|---|---|---|
| `pactl` | Volume (Linux) | Conditional — all modern Linux has pactl (PulseAudio/Pipewire) | If missing: error with "pactl not found" |
| `playerctl` | Media (Linux) | Conditional — optional on light DE | If missing: error with "playerctl not found — install playerctl" |
| `osascript` | Volume + Media (macOS) | ✓ Built-in | Always available |
| PowerShell + Set-Volume | Volume (Windows) | Conditional — modern Windows (10+) with audio modules | If missing: fallback to `nircmd` |
| `nircmd` | Media (Windows fallback) | Optional — external utility | If both PowerShell and nircmd missing: error with install guidance |

### macOS Accessibility Permission

| Check | Trigger | Fallback |
|---|---|---|
| `systemPreferences.getMediaAccessStatus('accessibility')` or equivalent | Before any media key command | Show actionable toast "Abrir System Settings" (reuse Phase 44 pattern) |

### Installation Notes

**Linux:**
```bash
# Debian/Ubuntu
apt install pulseaudio-utils playerctl

# Arch
pacman -S pulseaudio playerctl

# Fedora
dnf install pulseaudio-utils playerctl
```

**macOS:**
- No installation needed. `osascript` is built-in.
- Accessibility permission can be granted via System Settings → Security & Privacy → Accessibility.

**Windows:**
- No installation needed. PowerShell and Set-Volume are built-in on Windows 10+.
- Fallback `nircmd` can be installed via: `choco install nircmd` or manual download.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest 4.1.2 (per package.json) |
| Config file | `apps/desktop/vitest.config.ts` (desktop handlers); `apps/backend-ts/vitest.config.ts` (backend tools) |
| Quick run command | `npm test -- adjust-volume` (unit test a single handler) |
| Full suite command | `npm test` (all handler + tool tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SYSCTRL-01 | `adjust_volume` tool accepts delta, produces payload | unit | `vitest run apps/backend-ts/src/session/__tests__/pc-tools.test.ts` | Wave 0 |
| SYSCTRL-01 | `toggle_mute` tool produces payload | unit | `vitest run apps/backend-ts/src/session/__tests__/pc-tools.test.ts` | Wave 0 |
| SYSCTRL-01 | adjustVolumeHandler reads current volume, applies delta, returns ok() | unit (mocked subprocess) | `vitest run apps/desktop/src/main/actions/__tests__/adjust-volume.test.ts` | Wave 0 |
| SYSCTRL-01 | toggleMuteHandler gets mute state, inverts, returns ok() | unit (mocked subprocess) | `vitest run apps/desktop/src/main/actions/__tests__/toggle-mute.test.ts` | Wave 0 |
| SYSCTRL-02 | `media_control` tool with enum schema validates command | unit | `vitest run apps/backend-ts/src/session/__tests__/pc-tools.test.ts` | Wave 0 |
| SYSCTRL-02 | mediaControlHandler invokes playerctl/osascript/PowerShell per platform | unit (mocked subprocess) | `vitest run apps/desktop/src/main/actions/__tests__/media-control.test.ts` | Wave 0 |
| Both | Tools are registered in `createAllPcTools()` and included in system prompt | integration | `vitest run apps/backend-ts/src/session/__tests__/chat-session.test.ts` | Wave 0 |
| Both | macOS: missing Accessibility permission shows actionable toast (reuse Phase 44 test pattern) | integration | Manual: attempt media command without permission on macOS; verify toast appears | Wave 2 |

### Sampling Rate
- **Per task commit:** Run unit tests for affected handler(s): `npm test -- [handler-name]`
- **Per wave merge:** Full suite: `npm test`
- **Phase gate:** Full suite green + manual test volume/media on all three OSes

### Wave 0 Gaps

**Backend tests (apps/backend-ts):**
- [ ] `src/session/__tests__/pc-tools.test.ts` — add snapshot tests for `createAdjustVolumeTool()`, `createToggleMuteTool()`, `createMediaControlTool()` (parity with existing tools)

**Desktop handler tests (apps/desktop):**
- [ ] `src/main/actions/__tests__/adjust-volume.test.ts` — test delta application, clamping, platform branches (Linux/macOS/Windows mocked)
- [ ] `src/main/actions/__tests__/toggle-mute.test.ts` — test mute state toggle, platform branches
- [ ] `src/main/actions/__tests__/media-control.test.ts` — test command enum validation, platform branches, playerctl/osascript/PowerShell mocking
- [ ] `src/main/actions/__tests__/validators.test.ts` — add `assertDelta()` test case

**No framework install needed** — vitest already in package.json.

## Sources

### Primary (HIGH confidence)

- **CONTEXT.md Phase 59** — Locked decisions D-01 through D-12, specific platform commands and patterns
- **close-file.ts (Phase 55)** — Verified platform-switch pattern for handlers using `process.platform`
- **pc-tools.ts (Phase 18-01)** — Verified tool factory and `buildResult` pattern for payload emission
- **Phase 44 CONTEXT.md** — Verified macOS permission gate pattern and actionable toast UX for Accessibility
- **validators.ts** — Verified `runExecFile()` safety pattern and error mapping
- **index.ts ACTION_HANDLERS** — Verified handler registration pattern

### Secondary (MEDIUM confidence — cross-referenced with docs)

- **pactl man page (Linux):** `get-sink-volume @DEFAULT_SINK@` and `set-sink-volume` commands confirmed via common distro docs
- **playerctl documentation:** Media control commands (`play-pause`, `next`, `previous`) confirmed via [GitHub repo](https://github.com/altdesktop/playerctl)
- **osascript (macOS):** `set volume output volume` and System Events key simulation confirmed via Apple HIG and community examples
- **PowerShell Set-Volume (Windows):** Cmdlet available on Windows 10+ with audio modules; confirmed via Microsoft Docs

## Metadata

**Confidence breakdown:**
- Standard Stack: **HIGH** — All tools (pactl, playerctl, osascript, PowerShell) are industry standard; patterns verified in existing codebase
- Architecture: **HIGH** — Handler and tool registration patterns are proven in Phase 55 and Phase 18-01
- Pitfalls: **HIGH** — Based on real pain points (delta clamping, playerctl availability, osascript volume vs alert volume, macOS permission) documented in similar phases
- Platform coverage: **HIGH for Linux/macOS; MEDIUM for Windows** — PowerShell Set-Volume is standard but older Windows may lack audio modules; `nircmd` fallback is well-documented

**Research date:** 2026-05-06
**Valid until:** 2026-05-27 (21 days — stable phase, no major tool versions changing expected)
