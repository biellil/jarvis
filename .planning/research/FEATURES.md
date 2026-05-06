# Feature Landscape: JARVIS v2.3 LLM Providers & System Actions

**Domain:** Personal AI Assistant (Multi-LLM, PC Control, Media & Volume)
**Researched:** 2026-05-06
**Confidence:** HIGH for LLM integrations, MEDIUM-HIGH for streaming patterns, MEDIUM for system media control edge cases

---

## Table Stakes

Features users expect in a multi-LLM assistant. Missing = feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Google Gemini as LLM provider** | Users expect major LLM providers (Claude, GPT, Gemini) to be interchangeable | Medium | Existing multi-LLM abstraction in place; Gemini is mature with strong streaming support |
| **File open with fallback** | User tries to open `.zip` → expects system to handle it, not fail silently | Low-Medium | Already have file open action; fallback is natural extension |
| **Volume & media control by voice** | "Hey JARVIS, pause music" / "increase volume" are natural voice commands | Medium | System control tools are partially in place; media key integration is the extension |

---

## Differentiators

Features that set JARVIS apart — valuable but not strictly expected.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **LM Studio Streaming Events** | Deterministic, fine-grained progress feedback; reasoning/tool calls separated from message content | Medium-High | Adds latency visibility; enables better UX (e.g., show reasoning separately) vs basic SSE |
| **LM Studio model priority (embeddings degrade gracefully)** | Voice response never blocked by slow embedding pass; chat always responsive | Medium | Requires AbortController pattern + graceful error handling; not critical but professional |
| **Settings UI dropdown for Gemini** | Unified provider selection; no ENV file editing | Low | Reuses existing Settings infrastructure; consistency win |

---

## Feature Requirements Breakdown

### 1. Google Gemini as LLM Provider (LLM-PROV-01)

**What it does:**
- User opens Settings → selects "Google Gemini" from LLM provider dropdown (alongside Claude, OpenAI, LM Studio)
- JARVIS connects to Gemini API using `@langchain/google-genai` package
- Conversations route through ChatGoogleGenerativeAI same as other providers

**User flow:**
1. User clicks Settings tray menu
2. Settings window opens → LLM Provider section
3. Dropdown shows: "LM Studio", "Claude (Anthropic)", "OpenAI", "Google Gemini"
4. User selects "Google Gemini"
5. Settings prompts for API key → stores in electron-store
6. Next message uses Gemini; no restart required

**Technical details:**
- Package: `@langchain/google-genai` (npm install)
- Authentication: `GOOGLE_API_KEY` environment variable or constructor param
- Available models: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3.1-pro-preview` (check [Google AI docs](https://ai.google.dev/gemini-api/docs/models/gemini))
- Streaming: ChatGoogleGenerativeAI supports token-level streaming via `stream()` method
- Temperature: Auto-sets to 1.0 for Gemini 3.0+ (vs default 0.7) per Google best practices
- **Note:** Docs warn that langchain-google-genai is deprecated in favor of ChatGoogle; plan migration path for v2.4+

**Complexity:** Medium
- Reuses existing multi-LLM abstraction (llm_factory.ts pattern)
- New package + API key management straightforward
- Streaming already handled by LangChain interface

**Dependencies:** 
- Settings UI already exists (v2.1+)
- Multi-LLM factory pattern established

**Anti-feature:** Do NOT hardcode Gemini API calls or fall back to cloud Gemini if LM Studio fails — violates multi-LLM abstraction principle.

---

### 2. LM Studio Streaming Events API (LLM-PROV-02)

**What it does:**
- When LM Studio model supports streaming events (beyond OpenAI-compatible SSE), use native `/api/v1/chat` streaming events
- Provides deterministic event sequence: `chat.start` → `prompt_processing.*` → `reasoning.*` → `message.delta` → `tool_call.*` → `chat.end`
- Enables separate rendering of reasoning, tool calls, and message content

**Why it matters:**
- OpenAI-compatible SSE is generic: client doesn't know if a delta is reasoning, tool call, or final answer
- LM Studio events distinguish: e.g., show reasoning in gray, final message in normal text, tool calls in code blocks
- Better UX for reasoning-first models; lower latency visibility (not waiting for `chat.end` to show partial progress)

**User flow:**
- Transparent to user; internal optimization
- Reasoning/long-think models appear to show work-in-progress
- Chat responses render progressively per component type

**Technical details:**
- LM Studio endpoint: `POST /api/v1/chat` with `stream: true` (not `/v1/chat/completions`)
- Event types (20 total per [LM Studio docs](https://lmstudio.ai/docs/developer/rest/streaming-events)):
  - `chat.start`, `chat.end` — session boundaries
  - `model_load.start`, `model_load.progress`, `model_load.end` — model loading progress
  - `prompt_processing.start`, `prompt_processing.progress`, `prompt_processing.end` — input processing
  - `reasoning.start`, `reasoning.delta`, `reasoning.end` — chain-of-thought output
  - `message.start`, `message.delta`, `message.end` — final response
  - `tool_call.start`, `tool_call.arguments`, `tool_call.success`, `tool_call.failure` — function calls
  - `error` — exception handling
- Model detection: Check LM Studio `/api/v1/models/loaded` or `/api/v1/models/available` for streaming_events capability flag (if present)
- Fallback: If model doesn't support events, use OpenAI-compatible SSE transparently
- **Critical:** Events arrive in strict order; can't batch or reorder them

**Complexity:** Medium-High
- Requires new event-driven streaming handler vs existing LangChain SSE adapter
- Need capability detection (does model support events?)
- Fallback to OpenAI SSE if not available — double code path
- Breaking change: Can't use LangChain's built-in streaming for LM Studio; must parse raw events

**Dependencies:**
- LM Studio 0.3.0+ (stable, widely deployed)
- Existing Express 5 gateway handles both SSE and raw event streams
- WebSocket path already in place from v2.2 PC control actions

**Anti-features:**
- Do NOT block on streaming events — fallback to SSE always available
- Do NOT parse events as Markdown; events are structured JSON

---

### 3. LM Studio Model Priority: Embedding Degrade Gracefully (LLM-PRIO-01 & LLM-PRIO-02)

**What it does:**
- When JARVIS's voice handler triggers background embedding of conversation into memory while chat LLM is responding:
  - Chat request takes priority; embedding request gets cancelled or downgraded
  - Chat response is never blocked waiting for embedding to finish
  - Embedding retries on next idle moment without user-facing delay

**Why it matters:**
- Current bug risk: Long STT utterance + memory embedding pass simultaneously → chat blocked → perceived latency
- JARVIS voice is conversational; blocking for embeddings breaks natural flow
- Professional behavior: Prioritize interactive (chat) over background (embedding)

**User flow:**
- Transparent; no UI change
- User speaks, JARVIS responds immediately
- Memory indexed in background; no perceptible delay

**Technical details:**
- LM Studio API: AbortController pattern for request cancellation ([LM Studio docs](https://lmstudio.ai/docs/typescript/llm-prediction/cancelling-predictions))
  - Pass `signal` to prediction method: `llm.predict(prompt, { signal: abortController.signal })`
  - Call `abortController.abort()` to cancel in-flight request
  - Cancellation reason: `"userStopped"` stop reason
- Implementation pattern:
  1. Memory embedding starts with `embeddingAbortController = new AbortController()`
  2. Chat request arrives → immediately call `embeddingAbortController.abort()`
  3. Embedding handler catches abort exception → schedules retry on next idle (e.g., 2s after chat ends)
  4. Chat proceeds without waiting
- Graceful degrade (LLM-PRIO-02): If embedding doesn't support AbortController or cancellation fails
  - Embedding continues in background; chat is NOT blocked (design assumption: embeddings should never block)
  - Error handling: log warning, continue without retry
  - System remains responsive

**Complexity:** Medium
- Requires AbortController integration (standard Node.js)
- Memory writer already fire-and-forget (v1.8); just needs cancellation awareness
- Error handling: Graceful degrade is already partial design

**Dependencies:**
- LM Studio 0.4.0+ (AbortController support stable)
- Memory writer (v1.8+) already structured
- Chat session flow (v1.3+) established

**Anti-features:**
- Do NOT block chat on embedding — violates conversational responsiveness
- Do NOT retry embedding endlessly; max 1 retry per conversation turn
- Do NOT propagate embedding errors to user UI

---

### 4. System Default File Opener with Fallback (FACT-12)

**What it does:**
- When file open action tries to open file (e.g., `.zip`, `.dmg`, `.rar`) and fails (no handler or handler crashes):
  - Fallback: Invoke system default opener (`xdg-open` / `start` / `open` CLI)
  - System handles it (opens in appropriate app or shows "choose app" dialog)
  - User sees toast: "Opened [filename] with system opener" (not error)

**Why it matters:**
- File open action supports `.txt`, `.md`, `.pdf`, `.json` well (native handlers)
- But `.zip`, `.dmg`, `.rar`, `.7z`, `.exe`, `.dmg` etc. fail → UX feels broken
- System opener always available; graceful degradation

**User flow:**
1. User: "Open my archive"
2. JARVIS: Attempts built-in open via `open(path)` (shell.openPath)
3. If error (ENOENT, EACCES, permission denied, etc.):
   - Fallback: Launch system opener CLI
   - macOS: `/usr/bin/open [path]`
   - Windows: `start "" [path]`
   - Linux: `xdg-open [path]`
4. System handles → Opens archive manager or shows app picker
5. User sees toast: "Opened archive.zip with system opener"

**Technical details:**
- **For Electron (recommended):** Use `shell.openPath(path)` from main process
  - Returns Promise<string> (empty if success, error message if fails)
  - Handles macOS/Windows/Linux natively
  - No CLI spawning needed; native APIs only
  - Example:
    ```typescript
    try {
      const error = await shell.openPath(filePath);
      if (error) {
        // Fallback: spawn system opener
        const cmd = process.platform === 'darwin' ? 'open' 
                  : process.platform === 'win32' ? 'start' : 'xdg-open';
        execFile(cmd, [filePath], (err) => {
          if (err) logger.warn(`Fallback opener failed: ${err.message}`);
        });
      }
    } catch (err) {
      logger.error(`openPath failed: ${err.message}`);
    }
    ```
- **For Node.js backend:** Use `open` npm package (v11+, maintained by Sindre Sorhus)
  - Not for Electron renderer (use shell.openPath instead)
  - For CLI tools or Docker — `npm install open`
  - Usage: `await open(filePath)`
- **Electron-specific note:** Do NOT use `open` npm package in Electron app; shell.openPath is native and better

**Complexity:** Low-Medium
- shell.openPath already stable (Electron 40+)
- Fallback is simple execFile spawning
- Error handling: Log + graceful degrade (no error toast)

**Dependencies:**
- Electron shell API (already used for tray menus, etc.)
- Backend: child_process.execFile (Node.js stdlib)
- File action executor already exists (v2.2)

**Anti-features:**
- Do NOT use `open` npm package in Electron renderer
- Do NOT spawn subshell (exec) for system opener; use execFile
- Do NOT wait for system opener to complete; fire-and-forget

---

### 5. System Media Controls by Voice (SYSCTRL-01 & SYSCTRL-02)

**What it does:**
- User voice commands:
  - **Volume:** "Increase volume", "Decrease volume", "Mute", "Set volume to 50%"
    - Maps to system master volume control (not app-specific)
  - **Media playback:** "Play/Pause", "Next track", "Previous track"
    - Routes to currently active media app (Spotify, YouTube, Apple Music, etc.) via system media controls

**Why it matters:**
- JARVIS is voice-first; "Hey JARVIS, increase volume" is natural conversational command
- System media control is standard in modern OS (media keys work globally)
- Differentiator: Conversational trigger ("by voice") vs pressing physical media buttons

**User flow:**

**Volume control:**
1. User: "Hey JARVIS, volume to 75%"
2. LLM recognizes intent → calls `setSystemVolume(75)` tool
3. JARVIS adjusts OS master volume
4. Toast: "Volume set to 75%"

**Media playback:**
1. User: "Hey JARVIS, play music"
2. LLM calls `mediaPlayPause()` tool
3. JARVIS sends play signal to active media app
4. Spotify/Apple Music/etc. starts playing
5. No toast (system visual feedback sufficient)

**Technical details:**

**Volume Control:**
- **macOS:** Use osascript (AppleScript)
  ```bash
  osascript -e "set volume output volume 75"
  ```
  - Read current: `osascript -e "output volume of (get volume settings)"`
  - Set: `osascript -e "set volume output volume N"` where N is 0-100
  - Via Node.js: `child_process.execFile('osascript', ['-e', 'set volume output volume 75'])`

- **Windows:** Use `nircmd` CLI (nircmd.exe setsysvolume N) or PowerShell
  - `nircmd setsysvolume 49152` (0-65535 scale)
  - Or: `powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"` (VolumeUp key)
  - **Caveat:** nircmd requires separate installer; PowerShell key emulation is fragile
  - Alternative: Use Electron media key shortcuts (see below)

- **Linux:** Use `amixer` or `pactl` (PulseAudio) or `wpctl` (PipeWire)
  - `amixer sset Master 75%` or `pactl set-sink-volume @DEFAULT_SINK@ 75%`
  - Fallback: KeyPress emulation VolumeUp/VolumeDown via xdotool

- **All platforms fallback:** Electron `globalShortcut.register('VolumeUp')` to trigger system shortcuts
  - Not direct volume setting, but functional workaround

**Media Playback Control:**
- **Electron globalShortcut approach** (PRIMARY):
  ```typescript
  globalShortcut.register('MediaPlayPause', () => {
    // Toggles active app's playback
  });
  globalShortcut.register('MediaNextTrack', () => {
    // Skips to next track in active app
  });
  ```
  - **Problem (known limitation):** globalShortcut doesn't reliably register bare media keys on Linux
  - Workaround: Use key combinations like `Ctrl+MediaPlayPause` (works on all platforms per [Electron issue #3600](https://github.com/electron/electron/issues/3600))
  - **macOS limitation:** [Issue #20788](https://github.com/electron/electron/issues/20788) — media key registration succeeds but system default app may trigger instead

- **Alternative: Media Session API** (Web standard, limited scope)
  - Used in web browsers to handle media key events
  - Requires audio context or video element in renderer
  - Not suitable for global system control (doesn't work when app unfocused)

- **Alternative: node-global-key-listener** (npm package)
  - Cross-platform global key listening
  - Requires compilation with node-gyp
  - Platform-specific capabilities vary
  - Complexity: High; maintenance burden

- **Practical implementation:**
  1. Try Electron `globalShortcut.register('MediaPlayPause')` + `globalShortcut.register('MediaNextTrack')`
  2. On failure or no-op, fallback to OS-specific media control:
     - **macOS:** `osascript -e "tell application \"Spotify\" to activate" && osascript -e "tell application \"Spotify\" to play"`
     - **Windows:** `powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"` (Play key code)
     - **Linux:** `dbus-send` to media player (MPRIS protocol) or `xdotool key XF86AudioPlay`

**Complexity:** Medium-High
- **Volume:** Medium (straightforward OS CLI calls; multi-platform branch logic)
- **Media controls:** High (Electron globalShortcut unreliable on Linux; fallback patterns needed)
- Cross-platform branching (darwin/win32/linux)
- Error handling: Graceful degrade if OS command unavailable

**Dependencies:**
- Electron main process (for globalShortcut registration)
- LLM tool system already in place (v2.2)
- No new npm packages needed (use stdlib child_process + osascript/PowerShell)
- Electron version: 40+ (media key constants stable)

**Known issues & mitigations:**
- **Linux media keys:** globalShortcut doesn't work for bare media keys; use MPRIS D-Bus or key emulation
- **macOS media keys:** May not override system default behavior; app-specific fallback needed
- **Windows volume:** nircmd requires separate installer; PowerShell fallback less reliable
- **Recommendation:** Implement platform branching with fallbacks; treat media control as "best-effort"

**Anti-features:**
- Do NOT require physical media button bindings; voice commands are primary
- Do NOT try to control other apps' volume separately (only system master)
- Do NOT fail entire feature if media control unavailable; gracefully skip

---

## Feature Dependencies

```
Google Gemini provider
  ↓
  Requires: Multi-LLM abstraction ✓ (exists v1.3+)
  Requires: Settings UI provider dropdown ✓ (exists v2.1+)

LM Studio Streaming Events
  ↓
  Requires: LM Studio 0.3.0+ (capability detection)
  Requires: Fallback to OpenAI SSE (always available)
  Depends on: Express gateway ✓ (v1.1+)

Model Priority (embeddings degrade)
  ↓
  Requires: Memory writer ✓ (v1.8+)
  Requires: AbortController pattern ✓ (Node.js stdlib)
  Depends on: LM Studio 0.4.0+ (AbortController support)

File open with fallback
  ↓
  Requires: File action executor ✓ (v2.2)
  Requires: Electron shell API ✓ (v40+)

Volume + Media controls
  ↓
  Requires: LLM tool system ✓ (v1.3+)
  Requires: Electron main process access ✓ (v1.2+)
  No blocking dependencies
```

---

## MVP Recommendation

**For v2.3 MVP, prioritize in this order:**

1. **Google Gemini provider** (LLM-PROV-01) — HIGHEST PRIORITY
   - Directly addresses v2.3 goal ("Expandir provedores LLM")
   - Low risk, reuses existing patterns
   - User-visible immediately in Settings
   - Estimated effort: 2-3 days

2. **File open with fallback** (FACT-12) — HIGH PRIORITY
   - Closes existing UX gap (users hit `.zip` → fails)
   - Low complexity, non-breaking
   - Works for both backend + Electron paths
   - Estimated effort: 1-2 days

3. **Volume control** (SYSCTRL-01) — MEDIUM PRIORITY
   - Good differentiator for voice-first UX
   - Platform branching straightforward (osascript/nircmd/pactl)
   - Doesn't block other features
   - Estimated effort: 2-3 days

4. **LM Studio Streaming Events** (LLM-PROV-02) — DEFERRED
   - Nice-to-have optimization; not blocking
   - Higher complexity (new event handler, model capability detection, dual code path)
   - Benefit is latency visibility + fine-grained rendering (can ship v2.4)
   - Estimated effort: 4-5 days

5. **Model priority (embedding degrade)** (LLM-PRIO-01/02) — DEFERRED
   - Defensive feature (prevents rare blocking scenario)
   - Fire-and-forget memory is already non-blocking by design (v1.8+)
   - Add only if soak tests reveal embedding blocking chat
   - Estimated effort: 2-3 days (but conditional)

6. **Media playback controls** (SYSCTRL-02) — DEFERRED
   - Lowest ROI; media key support fragile across platforms
   - Volume control more immediately useful (SysCtrl-01)
   - Ship after platform testing; likely v2.4
   - Estimated effort: 3-4 days + platform testing

**Total MVP effort: ~6-8 days for #1-3**

---

## Complexity & Risk Summary

| Feature | Complexity | Risk | Dependencies | Notes |
|---------|-----------|------|--------------|-------|
| Google Gemini | Medium | Low | @langchain/google-genai, Settings UI | Reuses LLM abstraction; streaming built-in |
| File open fallback | Low-Medium | Low | Electron shell, child_process | Simple error handling; graceful degrade |
| Volume control | Medium | Medium | OS-specific CLIs (osascript/nircmd/pactl) | Platform branching; fallbacks needed |
| LM Studio streaming events | Medium-High | Medium | LM Studio 0.3.0+, model capability detection | Double code path (events + SSE fallback) |
| Model priority (embed degrade) | Medium | Low-Medium | Memory writer v1.8+, AbortController | Non-blocking by design already; polish only |
| Media playback controls | Medium-High | Medium-High | Electron globalShortcut, OS-specific fallbacks | Known Electron bugs; unreliable on Linux |

---

## Sources

- [LangChain.js @langchain/google-genai integration](https://docs.langchain.com/oss/javascript/integrations/chat/google_generative_ai)
- [LangChain Reference: ChatGoogleGenerativeAI](https://reference.langchain.com/javascript/langchain-google-genai/ChatGoogleGenerativeAI)
- [Google AI Gemini Models Documentation](https://ai.google.dev/gemini-api/docs/models/gemini)
- [LM Studio Streaming Events API](https://lmstudio.ai/docs/developer/rest/streaming-events)
- [LM Studio Cancelling Predictions (AbortController)](https://lmstudio.ai/docs/typescript/llm-prediction/cancelling-predictions)
- [LM Studio Chat API Documentation](https://lmstudio.ai/docs/developer/rest/chat)
- [Electron shell.openPath() API](https://www.electronjs.org/docs/latest/api/shell)
- [open npm package (Sindre Sorhus)](https://www.npmjs.com/package/open)
- [Electron globalShortcut Documentation](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Electron globalShortcut Issue #3600 (media keys unreliable)](https://github.com/electron/electron/issues/3600)
- [Electron media key issue #20788 (macOS regression)](https://github.com/electron/electron/issues/20788)
- [Node.js child_process Documentation](https://nodejs.org/api/child_process.html)
- [MDN HTMLMediaElement API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement)
- [macOS volume control via osascript](https://excessivelyadequate.com/posts/vol.html)
