# Domain Pitfalls: v2.2 LLM Actions + Streaming TTS + Settings Expansion

**Domain:** Electron + Node.js + Express SSE + LangChain.js bidirectional action routing, streaming TTS, configuration hot-reload, platform-specific UI, long-running voice capture.

**Researched:** 2026-05-05

---

## Feature 1: LLM → Electron Actions via SSE Bidirectional Stream

### Pitfall 1: Action Arrives After SSE Connection Closes

**What goes wrong:** Backend generates an action (open_file, open_folder, view_screenshot) mid-response, appends to SSE stream, but by the time the message reaches Electron, the EventSource client has already closed the connection (timeout, user interrupt, or natural completion). Action payload is lost silently. User never sees the requested action.

**Why it happens:** SSE is unidirectional by design — server → client only. Once the server sends a `:` keep-alive or the response completes naturally, the client closes the EventSource. If LLM decides to emit an action in the last chunk or after a delay, it arrives on a dead connection.

**Consequences:**
- User asks "open my files folder" → LLM generates response + open_folder action → SSE closes before action arrives
- Action log shows attempted dispatch, but Electron never receives it
- User thinks action failed, asks again, creates duplicate requests

**Prevention:**
1. **Preempt actions in the response stream** — Ensure actions are embedded in SSE before TTS/response completes, not appended after
2. **Connection state awareness** — Renderer-side EventSource must stay open until final confirmation of all actions received
3. **Action acknowledgment protocol** — Client sends `POST /api/actions/ack/{actionId}` confirming receipt; server retries unacknowledged actions via retry queue
4. **Separate action stream** — Consider bifurcating: response text via SSE, critical actions via WebSocket with explicit ACK/NAK

**Detection:**
- Action in audit log but not executed on Electron
- Timestamp gap between SSE completion and action log entry
- Server logs show action emit attempt, Electron logs show no matching IPC dispatch

---

### Pitfall 2: Action Routing Race Condition — Wrong Client Executes Action

**What goes wrong:** Multiple Electron instances running JARVIS on the same user's machine (dev/staging + production, or accidental duplicate launch). Backend receives action request but broadcasts to all connected Electron clients via single SSE response stream. Both instances try to execute the same action simultaneously, or wrong instance receives the action (e.g., staging app opens production files).

**Why it happens:** SSE stream doesn't include session/client identity in action payload. If the backend maintains a broadcast queue or doesn't correlate actions to specific client connections, any listening client will consume the action.

**Consequences:**
- User has JARVIS production + dev running → "Open folder" action from production session routes to dev Electron
- File opens in wrong location (dev's working directory vs production's sandbox)
- Multiple instances of the same action execute (if both clients accept the broadcast)
- Confusion about which app actually executed the action

**Prevention:**
1. **Session token in action payload** — Each action includes `{ actionId, clientSessionId, command, ... }` where clientSessionId must match current Electron session
2. **Electron session ID on startup** — Electron generates a UUID on launch, includes it in first API call (`POST /api/chat` includes header `X-Client-Session: <uuid>`)
3. **Backend route actions to client session** — Backend stores sessionId → SSE connection mapping; on action emit, send only to the specific session's connection
4. **Action validation in preload** — Preload.ts verifies clientSessionId matches current app instance UUID before passing action to main process
5. **Single-instance lock (macOS/Linux/Windows)** — App enforces only one instance per user via lock file or system mechanisms (Electron has `app.requestSingleInstanceLock()`)

**Detection:**
- Multiple Electron windows executing the same action
- File opened in unexpected working directory
- Audit logs show action executed on "wrong" JARVIS instance (if logging includes instance ID)

---

### Pitfall 3: Unvalidated Action Payloads — Arbitrary Code Execution Risk

**What goes wrong:** Backend generates action payload `{ command: "open_file", path: "/user/path" }` without Zod validation. A malformed or injected payload (e.g., from JSON parser confusion or man-in-the-middle if HTTP, not HTTPS) reaches Electron with invalid `command` or `path` containing shell metacharacters. Preload/IPC handler executes it unsanitized.

**Why it happens:** LLM output is probabilistic — it may hallucinate action payloads that don't match the schema. If the LLM's action extraction isn't validated before SSE emit, invalid JSON or missing fields can slip through.

**Consequences:**
- `{ command: "open_file", path: "/etc/passwd" }` opens sensitive files
- `{ command: "open_file", path: "$(rm -rf /)" }` if shell evaluation happens (extremely bad)
- Action with unknown `command` crashes preload handler
- Renders the action feature security risk

**Prevention:**
1. **Zod validation on SSE emit** — Backend validates `ZodAction.parse(actionPayload)` before writing to SSE stream; throw if validation fails, emit error-safe message to user instead
2. **Allowlist commands** — Only permit `["open_file", "open_folder", "view_screenshot", "show_notification"]` — hardcoded list in preload
3. **Path sanitization** — Validate path is within expected boundaries (no `..` traversal, no absolute `/etc/` paths), use `path.resolve()` and check against whitelist
4. **No shell evaluation** — Use `execFile` (no shell) instead of `exec` (shell), pass arguments as array
5. **Preload-side Zod re-validation** — Preload.ts also validates action payload before IPC dispatch; fail safely with toast notification if invalid

**Detection:**
- Unexpected file opens or system commands executing
- Preload error logs showing validation failures
- Audit trail shows action received but not executed (validation block)

---

### Pitfall 4: SSE Connection Lifecycle Leak — Dangling Listeners

**What goes wrong:** Electron renderer component (VoiceDisplay, ActionPanel) mounts, sets up `EventSource("/api/chat/stream")`, attaches listeners. Component unmounts during conversation (user navigates away, window minimizes). Listener is never removed. Next chat session opens a new EventSource, but old one remains active in background. Over many sessions, accumulated listeners consume memory and slow down message processing.

**Why it happens:** React component cleanup is not guaranteed during rapid mount/unmount cycles. If the component doesn't properly `.close()` the EventSource in its cleanup function, or doesn't remove event listeners, they persist.

**Consequences:**
- Memory grows with each conversation (1 MB+ per dangling listener)
- SSE messages process twice (old listener + new listener)
- Chat latency increases over hours of use
- Always-Listening soak test shows memory leak pattern

**Prevention:**
1. **Explicit EventSource.close() in useEffect cleanup** — Use a useEffect hook that creates EventSource on mount and calls `eventSource.close()` in the cleanup function
2. **Event listener removal** — For each `eventSource.addEventListener(...)`, store the handler and call `eventSource.removeEventListener()` in cleanup
3. **Null check before close** — Ensure eventSource exists before calling `.close()` to prevent null-ref errors in cleanup
4. **Single EventSource instance** — Use Context or custom hook to manage one global EventSource instance, not one per component; only close when user stops chatting
5. **Memory monitoring hook** — In dev, log listener count via `eventSource.listeners` or a custom wrapper tracking listener lifecycle

**Detection:**
- Memory usage grows by 1-5 MB per chat session (should be <500 KB)
- Multiple instances of same message appear in logs (duplicate listeners firing)
- `process.memoryUsage().heapUsed` jumps during soak test
- CSS DevTools shows thousands of "open requests" or "active listeners"

---

## Feature 2: Streaming TTS (Token-by-Token Playback)

### Pitfall 1: Buffer Underrun — Audio Glitches During Playback

**What goes wrong:** TTS chunks arrive faster than audio playback rate (e.g., 200 ms chunks arriving every 100 ms while audio plays at 192 kbps). Audio player pulls from buffer faster than it's being filled. Playback stalls, audio cuts out mid-word, or skips ahead. User hears robotic stuttering: "The quick... [silence]... brown fox."

**Why it happens:** LLM responds fast in bursts (multiple tokens at once) and TTS encodes quickly (ElevenLabs ~75ms, Murf ~55ms per chunk), but audio playback is fixed-rate. If buffering strategy doesn't account for bursty arrivals + playback rate mismatch, the ring buffer drains faster than it fills.

**Consequences:**
- Audio cuts out in 500-1000 ms increments (buffer exhaustion)
- Words sound garbled or truncated mid-phoneme
- User loses confidence in voice feature
- Soak test reveals issue after 2-3 hours (buffer fragmentation + GC pauses)

**Prevention:**
1. **Pre-buffering before playback** — Accumulate at least 500-1000 ms of audio (typically 3-5 chunks) before starting playback; adjust via `PREBUFFER_MS` config
2. **Ring buffer with watermark** — Maintain min/max watermarks: if buffer falls below min, pause playback; if it exceeds max, discard oldest chunks or slow playback rate
3. **Chunk arrival rate monitoring** — Log inter-arrival times between chunks; if >500ms gap detected, reduce playback rate or increase buffer
4. **Audio player jitter compensation** — Use Web Audio API's native buffer mechanism (`AudioContext.createScriptProcessor` or modern `AudioWorklet`) instead of direct HTMLAudioElement playback for streaming
5. **Separate TTS fetch from playback threads** — Fetch chunks in a background worker (Web Worker or Node.js stream handler), decode audio in parallel, feed to playback queue
6. **Fallback to full-buffer mode** — If streaming lags (buffer <100ms), automatically switch to waiting-for-full-response mode; notify user "preparing audio..."

**Detection:**
- Audio playback duration shorter than expected (chunks dropped)
- Logs show buffer size fluctuating wildly (0-5000ms) or hitting min watermark repeatedly
- User reports audio cutting out after 30-60 seconds of speech
- Soak test shows stutter rate increasing over time (indicates accumulating buffer fragmentation)

---

### Pitfall 2: Chunk Ordering Race Condition — Audio Plays Out of Order

**What goes wrong:** TTS generates multiple chunks in parallel (some providers support concurrent requests). Chunk 3 arrives from the network before Chunk 2. If playback queue appends chunks immediately without sequence validation, audio plays in wrong order: "brown quick The fox" instead of "The quick brown fox."

**Why it happens:** HTTP streaming doesn't guarantee in-order delivery for concurrent chunks. If TTS uses async/parallel fetch (Promise.all instead of sequential await), or if Express stream handler flushes chunks out of order, chunks can arrive scrambled.

**Consequences:**
- Words spoken backwards or scrambled
- Intelligibility drops to near-zero
- User disables TTS feature
- Particularly bad in Always-Listening where user hears the response

**Prevention:**
1. **Sequence numbering on chunks** — Each chunk includes `{ seqNum, audioData }` where seqNum starts at 0 and increments
2. **Queue validation on append** — Before adding chunk to playback buffer, verify `seqNum == lastSeqNum + 1`; if not, buffer it and wait for missing chunks
3. **Out-of-order chunk handler** — If chunk arrives out of order, store it in a "pending" map and fill gaps when earlier chunks arrive
4. **Sequential TTS requests** — Use `for await` or `.then()` chaining instead of `Promise.all()` to guarantee one chunk generation at a time
5. **SSE event ordering guarantee** — Express middleware logs chunk seq before write; server-side test verifies seq numbers are monotonic

**Detection:**
- Playback sounds intelligible for 1-2 chunks, then scrambled
- Logs show chunk seqNum not incrementing by 1
- First chunk is always correct, later chunks sometimes garbled (indicates gap-fill issue)
- Soak test with concurrent TTS requests shows scramble rate increasing

---

### Pitfall 3: Cleanup When Interrupted Mid-Stream — Dangling Resources

**What goes wrong:** User interrupts TTS playback (taps to stop, says "stop", navigates away). Streaming response from backend is still active (still pulling from LLM, still generating TTS chunks). Electron kills the audio player but doesn't abort the backend stream. Server keeps generating chunks nobody listens to. Electron's Web Audio API context remains open. Next playback request starts a new context without closing the old one.

**Why it happens:** Proper cleanup requires coordination between Electron (abort fetch, close AudioContext) and backend (detect client disconnect, stop TTS generation). If this handshake isn't implemented, resources linger.

**Consequences:**
- Memory grows 5-10 MB per interrupted audio stream (AudioContext + WebWorker + fetch buffers)
- Soak test reveals leak pattern: interrupt → memory +X MB → repeat
- AudioContext limits hit (some browsers allow only 6 concurrent contexts)
- Performance degrades after 20-30 interruptions

**Prevention:**
1. **AbortController on fetch** — Electron's fetch for TTS stream includes `const controller = new AbortController()` and passes `signal: controller.signal`
2. **Cleanup on interruption** — When user clicks stop or new chat starts, call `controller.abort()` immediately; this cancels the fetch and closes the reader
3. **Backend disconnect detection** — Express middleware monitors request close event: `req.on('close', () => { stopTtsGeneration() })` — ensures TTS provider is queued for cancellation
4. **AudioContext lifecycle** — Create AudioContext once (global singleton) and reuse; when stopping playback, `audioContext.suspend()` instead of closing (closing is expensive)
5. **Stream reader cleanup** — When aborting fetch, ensure any open `ReadableStreamDefaultReader` calls `reader.cancel()` to release buffers
6. **Graceful TTS provider cancellation** — ElevenLabs/Murf may not support fetch cancellation — instead, stop pulling chunks from their stream (don't send more text input) and let them timeout

**Detection:**
- `process.memoryUsage().heapUsed` grows after each interruption
- Chrome DevTools shows "open requests" growing (AbortController not fired)
- AudioContext.state === 'suspended' count increases (not reset)
- Soak test: 50 interrupts in sequence → memory > 500 MB (should be <100 MB)

---

### Pitfall 4: ElevenLabs/Murf Streaming Peculiarities

**What goes wrong:**

**ElevenLabs:** Chunk scheduling requires explicit "chunk schedule" (e.g., 125 characters per chunk). If text arrives faster than chunk schedule, ElevenLabs stalls, waiting for the specified amount before generating. Latency jumps from 75ms to 500ms+.

**Murf:** Does not support streaming at all (as of Feb 2025) — returns full audio at once. Attempting to stream results in single 1-5s blob arrival instead of incremental chunks. Streaming UI looks broken (one long pause then audio dumps out).

**Why it happens:** Different TTS providers have different API designs. ElevenLabs has WebSocket + chunk_schedule for streaming, while Murf's API is request-response only.

**Consequences:**
- Perceived latency spikes when using ElevenLabs if chunk schedule not tuned
- Murf doesn't stream at all — defeats the purpose of streaming TTS feature
- Fallback logic may not catch this and user sees frozen UI

**Prevention:**
1. **ElevenLabs chunk_schedule tuning** — Set to expected LLM token output rate (e.g., 50 characters per chunk for ~100 tokens/sec LLM). This is configurable via Settings
2. **Latency monitoring** — Log time-to-first-chunk and average inter-chunk latency; if >200ms, log warning and user can adjust chunk_schedule
3. **Murf special case** — Detect if TTS provider is Murf; if so, fetch full response once instead of streaming; show "loading audio..." placeholder
4. **Fallback to non-streaming** — If streaming provider unavailable or misconfigured, auto-switch to local offline TTS (Kokoro) with fallback to full-buffer Murf mode
5. **Provider capability flag** — Each TTS provider declares `supportsStreaming: boolean` and `chunkScheduleMs: number`; UI respects this to set expectations

**Detection:**
- ElevenLabs: logs show inter-chunk latency > 300ms
- Murf: single chunk arrives with full audio (seqNum should increment but doesn't)
- User notices audio starts after 1s pause instead of <200ms
- Soak test compares latency across providers; Murf shows consistent 1-2s, ElevenLabs shows variable

---

## Feature 3: Settings Expansion (LM Studio URL, LLM Provider Switch, Wake Word Sensitivity)

### Pitfall 1: In-Flight Requests When Provider Switches

**What goes wrong:** User switches from "LM Studio" to "Claude" in Settings UI. At the same moment, a chat request is in-flight to LM Studio (waiting for LLM response). Settings persists new provider to electron-store. Backend reads env var and creates new ChatModel instance for Claude. The in-flight request tries to write response from LM Studio thread, but the new ChatModel instance is Claude. Response data type mismatch or incomplete response handling.

**Why it happens:** Settings change and active request are not synchronized. Config reads happen once per request, but multiple requests can be pending. If a request started with LM Studio but config changed mid-response, the callback doesn't know which provider it actually used.

**Consequences:**
- In-flight LM Studio response tries to deserialize as Claude response format → JSON parse error
- Chat shows "Error: unexpected token" or partial response
- User confused about which provider was used
- Audit log doesn't match actual provider execution

**Prevention:**
1. **Lock active requests during config change** — Before persisting new provider to electron-store, acquire a lock; wait for all pending requests to complete (or timeout after 30s); then swap provider
2. **Config pinning per request** — Each ChatSession captures the current provider at request-start time: `config = { provider: process.env.LLM_PROVIDER, ... }` and uses that for the entire request lifecycle, ignoring config changes mid-request
3. **Provider instance caching** — Instead of re-reading env var each time, maintain `currentProvider` instance variable; only recreate when explicitly changed via Settings
4. **Request tracking** — Track in-flight request count per provider; Settings UI shows toast "X requests in flight, waiting to switch..." if user tries to change provider mid-flight
5. **Graceful hotswap** — New requests use new provider, existing requests complete with old provider; add metadata `{ usedProvider: "lm_studio", ... }` to response for audit

**Detection:**
- Response parse errors when switching providers during chat
- Audit log shows request metadata `usedProvider` doesn't match Settings current provider
- User reports "it tried to use old provider even though I switched"
- Soak test: switch providers every 500ms → increasing parse error rate

---

### Pitfall 2: Env Var vs Runtime Config Tension

**What goes wrong:** Settings UI saves new LM Studio URL (e.g., `http://10.0.0.5:1234/v1` instead of localhost) to electron-store. Backend reads it from electron-store at request time, but earlier in startup, `.env` file was loaded and cached in `process.env.LM_STUDIO_URL=http://localhost:1234/v1`. Backend still uses the cached env var value instead of the electron-store value. User's custom URL is ignored.

**Why it happens:** Node.js caches `process.env` at startup. `dotenv` reads `.env` once and populates it. Settings changes write to electron-store, but if backend doesn't re-read electron-store for every request, it uses stale env var.

**Consequences:**
- User changes LM Studio URL in Settings → requests still go to old localhost
- User confused: "I changed the URL but it's not working"
- Hard to debug: Settings says new URL, but requests clearly hitting localhost
- Breaks switching between multiple LM Studio instances (dev on port 1234, staging on 2234)

**Prevention:**
1. **Priority: electron-store over env var** — At request time, check electron-store first for `lmStudioUrl`, use env var as fallback only if electron-store is empty
2. **Config factory function** — Instead of accessing `process.env` directly, call `getConfig()` function that reads electron-store then env var each time, not once at startup
3. **Config object passed down** — ChatSession constructor receives config object (not env), ensuring it uses the caller's values, not global process.env
4. **Environment variable consolidation** — Pick one source of truth. Either: all settings in electron-store (preferred for GUI control), or all in env var + GUI writes .env file (requires restart)
5. **Request-time config validation** — Log which config source was used: `{ source: "electron-store", lmStudioUrl: "...", ... }` in every request for audit trail

**Detection:**
- Settings UI shows new URL, but logs show requests hitting old URL
- Audit trail has `{ source: "process.env", lmStudioUrl: "..." }` instead of `electron-store`
- User reports "I can't switch between two LM Studio instances"
- Regression test: set electron-store url → verify request uses it, not env var default

---

### Pitfall 3: LangChain ChatModel Reinitialization Complexity

**What goes wrong:** User switches from LM Studio to Claude in Settings. Backend needs to recreate the ChatModel instance (because LangChain ChatModel is provider-specific: `ChatOpenAI` for LM Studio, `ChatAnthropic` for Claude). Old instance holds LM Studio connection; new instance should connect to Anthropic. But if old instance is still referenced in an active ChatSession or is cached globally, or if reinitialization doesn't close the old connection, then both instances are active, consuming resources and potentially sending requests to the wrong provider.

**Why it happens:** LangChain doesn't provide a standard "switch provider" method. Creating a new ChatModel instance doesn't automatically garbage-collect the old one if it's still referenced somewhere. Node.js HTTP pools may keep old connections open.

**Consequences:**
- Memory grows due to multiple ChatModel instances living simultaneously
- Requests may be load-balanced across old and new providers (50% to LM Studio, 50% to Claude)
- Old provider continues consuming tokens/quota even though user switched
- Soak test shows memory increasing 5-10 MB per provider switch

**Prevention:**
1. **ChatModel factory with explicit cleanup** — Create a factory function that holds single current instance and exposes a `switch(provider, config)` method. On switch, call `.close()` or `.cleanup()` on old instance, then create new one
2. **Singleton pattern for ChatModel** — Use a module-level singleton that gets replaced entirely when config changes; old instance is immediately dereferenced and eligible for GC
3. **Request-scoped ChatModel** — Instead of global ChatModel, pass ChatModel instance to each ChatSession at creation time (captures provider at that moment); session's copy is independent of global config
4. **HTTP client pooling** — Both old and new ChatModel instances may be using the same HTTP agent/pool. Explicitly close pools: `oldModel.client?.pool?.destroy()` or similar
5. **Config version tagging** — Each response includes `{ configVersion: 123 }`. If config version changes, log it as a provider switch event in audit; don't continue serving responses from old instance

**Detection:**
- `process.memoryUsage().heapUsed` jumps 10+ MB after provider switch
- Two different providers appearing in audit logs for same session (e.g., requests 1-5 → LM Studio, requests 6-10 → Claude, should be all one or all the other)
- HTTP connection inspector shows multiple open connections to both LM Studio and Anthropic endpoints
- Request latency spikes after provider switch (indicates contention for resources)

---

### Pitfall 4: Wake Word Sensitivity Change Not Applied At Runtime

**What goes wrong:** User adjusts "Wake Word Sensitivity" slider in Settings from default 0.5 to 0.7 (more sensitive). Setting saves to electron-store. But Always-Listening process is running in Electron main thread with cached threshold value 0.5. New sensitivity is never applied because the threshold is hardcoded in the openwakeword event handler. User must restart JARVIS for new sensitivity to take effect.

**Why it happens:** Settings change is stored but not communicated to the active VoiceInputManager or Always-Listening handler. If the handler reads settings once at startup and caches the value, runtime changes are ignored.

**Consequences:**
- User frustrated: "I turned up sensitivity but it's still not responding to quiet speech"
- User has to restart app for setting to take effect (bad UX)
- Soak test shows sensitivity setting stuck at initial value
- May appear as a bug vs. intentional design

**Prevention:**
1. **EventEmitter for settings changes** — VoiceModeManager or global settings module emits "settings-changed" event. VoiceInputManager and Always-Listening handler listen to this event and update threshold on each emission
2. **No-cache threshold read** — Instead of `const THRESHOLD = await loadSettings().wakeWordSensitivity` once at startup, read it every time: `const threshold = await getSettings().wakeWordSensitivity` in the openwakeword score comparison
3. **Electron IPC for config push** — When Settings UI persists to electron-store, also send IPC message to main process: `ipcMain.invoke('update-settings', { wakeWordSensitivity: 0.7 })`, main process updates active handlers
4. **Subscription pattern** — VoiceInputManager subscribes to electron-store changes: `electronStore.onDidChange('wakeWordSensitivity', (newValue) => { this.threshold = newValue; })`
5. **Validation on change** — When sensitivity changes, log it: `[Always-Listening] Updated wake word threshold 0.5 → 0.7`, ensuring audit trail shows the change took effect

**Detection:**
- Logs show setting persisted but not applied to active handler
- Wake word behavior unchanged after adjustment (verify via manual tests: speak quietly → check if detected with new sensitivity)
- Soak test logs show static threshold value (should show change)
- User reports needing restart for setting to apply

---

## Feature 4: macOS Tray Icon Template

### Pitfall 1: PNG Not Truly Transparent or Wrong Alpha Channel

**What goes wrong:** Designer creates tray icon as PNG with white icon on colored background. When set as template in macOS, the system ignores the color and tries to use the alpha channel, but the PNG was saved with opaque alpha (fully solid). Result: icon appears as solid white blob in light mode, invisible in dark mode. Or, icon was created with proper transparency but saved with wrong color space (sRGB vs Grayscale), so macOS can't interpret the alpha properly.

**Why it happens:** Template images in macOS require a specific format: black icon + alpha channel only, no color information. Many PNG editors default to preserving color even when alpha is set to 0. If the icon has any color information (RGBA where R, G, B ≠ 0), macOS ignores the alpha and uses the color.

**Consequences:**
- Icon invisible in light mode or renders as white blob
- Icon invisible in dark mode
- User can't see tray icon, can't tell if JARVIS is running
- App appears broken
- Looks unprofessional on first launch

**Prevention:**
1. **Create in Grayscale + Alpha mode** — Use design tool (Figma, Sketch) to create icon in Grayscale color mode, not RGB. This ensures no color information, only alpha
2. **PNG export settings** — When exporting to PNG, ensure color space is "Grayscale Alpha" or equivalent; do not use RGB with alpha
3. **Validation script** — Before shipping, run a Node.js script that reads PNG metadata: check color channels, verify RGB values are all 0 (or very close) for non-transparent pixels
4. **Template test on macOS** — After export, load PNG in a simple test app that sets `NSImage *image = [[NSImage alloc] initWithContentsOfFile:path]; image.template = YES;` and verify appearance in both light and dark mode
5. **Two-size asset requirement** — Provide 16x16@1x and 32x32@2x (or 16x16 and 16x16@2x) PNGs; macOS automatically scales between them. Ensure both are identical in design, just different resolutions

**Detection:**
- Icon in tray is solid white or invisible on launch
- Light mode: icon barely visible, dark mode: icon invisible (or vice versa)
- PNG metadata tool reports RGB values > 0 for pixels with partial alpha
- Design review: compare icon appearance in system light/dark mode against Figma mockup

---

### Pitfall 2: Wrong Icon Size or No @2x Variant

**What goes wrong:** Tray icon provided as single 16x16 PNG. Retina (2x resolution) macOS systems can't find a @2x variant, so they upscale the 16x16 image 2x, resulting in blurry pixelated icon in tray. Or, icon provided as 32x32 only, system tries to scale it down and loses detail.

**Why it happens:** macOS menu bar expects a size/resolution pair: 16x16@1x and 32x32@2x (or 16x16 and 16x16@2x depending on naming). If only one is provided, scaling happens automatically, losing quality.

**Consequences:**
- Tray icon looks blurry or pixelated on Retina displays
- Icon appears smaller or larger than other tray icons
- Unprofessional appearance
- User notices immediately and questions quality

**Prevention:**
1. **Provide 16x16@1x and 32x32@2x pair** — Create two PNG files: icon-tray-16x16.png (16x16) and icon-tray-32x32.png (32x32); macOS loads based on device resolution
2. **Or use @2x naming** — Provide icon-tray-16x16@1x.png and icon-tray-16x16@2x.png (same base size, different pixel densities)
3. **Icon design at high resolution** — Design at 64x64 or higher, then export down to 16x16 and 32x32 using vector tools to maintain crispness
4. **Electron tray API enforcement** — When setting tray icon in Electron, explicitly provide `new Tray(path)` where path points to the @2x variant; Electron will downscale for @1x automatically OR manually pass both paths to Tray constructor if supported
5. **QA checklist** — On Retina Mac, verify tray icon is crisp (not blurry) and matches size of other system tray icons (clock, Bluetooth, etc.)

**Detection:**
- Icon in tray appears blurry compared to other system icons
- Icon size inconsistent (too small or too large)
- Retina display: icon looks pixelated
- QA report: "icon doesn't look as crisp as designed"

---

## Feature 5: Always-Listening Soak Test (8 Hours, Memory Stability)

### Pitfall 1: AudioContext Not Closed — Accumulating Web Audio Contexts

**What goes wrong:** Always-Listening runs in a loop: capture audio → VAD → TTS → repeat. Each audio capture creates a new `AudioContext` or `AudioWorklet` instance. If contexts are not explicitly closed/suspended, they accumulate. After 8 hours and thousands of capture cycles, 100+ contexts are live, consuming 50-100 MB heap. GC can't collect them because they're referenced somewhere in a closure or event listener.

**Why it happens:** Web Audio API doesn't always garbage collect contexts automatically when the component unmounts or the recorder stops. If the context is created in a useEffect or in the main VoiceInputManager but never explicitly `.close()`'d, it persists indefinitely.

**Consequences:**
- Memory grows from 200 MB to 800+ MB over 8 hours
- App becomes sluggish (GC pressure)
- May hit process memory limit and crash
- Soak test fails; feature deemed "not production-ready"

**Prevention:**
1. **Singleton AudioContext** — Create one global `audioContext` at startup and reuse for all recordings. Don't create a new context per recording
2. **Explicit close on cleanup** — When stopping Always-Listening, call `audioContext.close()` explicitly. When resuming, create a new context
3. **AudioWorklet lifecycle** — If using AudioWorklet, ensure `.port.close()` is called when the worklet is no longer needed
4. **Media stream cleanup** — After getting audio stream with `navigator.mediaDevices.getUserMedia()`, call `stream.getTracks().forEach(track => track.stop())` when done. Each unclosed track consumes memory
5. **Weak references for event listeners** — Use a cleanup map to track all event listeners on the context; on close, remove all listeners: `context.removeAllListeners()`

**Detection:**
- `process.memoryUsage().heapUsed` grows monotonically over 8 hours (should be stable ±50 MB)
- Chrome DevTools heap snapshot shows increasing count of `AudioContext` or `MediaStream` objects
- Soak test: after 8 hours, measure `activeAudioContexts > 5` (should be 1)
- App responsiveness decreases noticeably after 4+ hours

---

### Pitfall 2: IPC Listeners Accumulating Without Cleanup

**What goes wrong:** Always-Listening mode runs in Electron main process and communicates with renderer via IPC. Each VAD detection or action sends IPC message. If `ipcRenderer.on('vad-detected', ...)` is registered without cleanup, and the component (or dialog) is shown/hidden multiple times, the listener is registered again on each show, but the old listener is never removed. After 8 hours with 1000s of show/hide cycles, 1000s of listeners are stacked on the same event, each firing redundantly.

**Why it happens:** React component mounts/unmounts without proper IPC cleanup. If the component doesn't use a cleanup function in `useEffect` to call `ipcRenderer.removeListener()`, listeners persist across component lifecycles.

**Consequences:**
- Memory grows 1-5 MB per show/hide cycle
- IPC message handling is extremely slow (1000+ listeners each processing the message)
- App becomes unresponsive
- Soak test: show/hide widget 100 times → memory jump from 200 MB to 600+ MB

**Prevention:**
1. **IPC listener cleanup in useEffect** — Register IPC listener in useEffect, clean up with `return () => { ipcRenderer.removeListener(...) }`
2. **Use once() instead of on() when appropriate** — For one-time messages, use `ipcRenderer.once('action', handler)` which auto-removes
3. **Handler reference stability** — Store handler in a ref or outside of component to ensure the same reference is removed: `const handlerRef = useRef(handler); useEffect(() => { ipcRenderer.on('event', handlerRef.current); return () => ipcRenderer.removeListener('event', handlerRef.current); })`
4. **Listener count assertion** — In soak test, periodically log `ipcRenderer.listenerCount('event-name')` and assert it stays <= 1 (if component mounts once) or <= N (if N mounts are expected)
5. **Global cleanup on app close** — When app closes, call `ipcRenderer.removeAllListeners()` to ensure no dangling listeners in next session

**Detection:**
- `ipcRenderer.listenerCount('some-event')` grows with each show/hide
- IPC message processing time increases (one message takes 50ms to process 1000 listeners)
- Memory grows 5-10 MB per show/hide cycle
- Soak test: measure `listenerCount` every minute; should remain constant, not grow

---

### Pitfall 3: Transformers.js Intent Classifier Model Not Disposed

**What goes wrong:** Always-Listening uses Transformers.js for intent classification (`multilingual-e5-small` model, ~50 MB). Model is loaded once at startup via `pipeline('feature-extraction', ...)`. After each VAD detection, the model infers the audio intent. If the pipeline's internal tensors are not explicitly disposed, they accumulate. After 1000s of inferences over 8 hours, undisposed tensors consume 500+ MB.

**Why it happens:** Transformers.js pipelines hold typed arrays and tensors in memory after each inference. Unlike TensorFlow.js, Transformers.js doesn't automatically garbage collect these intermediate tensors. If the user code doesn't call `.dispose()` or `.then(result => { tf.dispose(result); })`, they persist.

**Consequences:**
- Memory grows from 300 MB to 1500+ MB over 8 hours
- Soak test memory profile shows ramp-up (not stable plateau)
- May exhaust available system RAM, causing OOM kill
- Feature deemed unreliable for long-running use

**Prevention:**
1. **Pipeline inference with manual disposal** — After calling `pipeline(input)`, explicitly dispose returned tensors: `const result = await classifier(text); const features = result.data; tf.dispose(result); return features;` (if using TF.js backend)
2. **Check Transformers.js version** — Verify latest version handles disposal correctly. Older versions (v3) had severe memory leaks; v4+ improved but still requires explicit cleanup in some cases
3. **Use Singleton pipeline** — Create pipeline once at startup, reuse for all inferences. Avoid recreating pipeline on each inference
4. **Fallback to simpler classifier** — For MVP, use a lighter-weight intent classifier (e.g., keyword matching) instead of deep learning model. Reserve Transformers.js for later optimization
5. **Soak test memory assertion** — Script measures heap every 1 minute over 8 hours. After 2 hours (baseline stabilization), assert memory variance < 100 MB over next 6 hours. If variance > 100 MB, fail test

**Detection:**
- Heap snapshot after 8 hours shows accumulating `Uint8Array`, `Float32Array` objects with count = inference count
- Memory curve shows monotonic growth (not stable plateau)
- Soak test: model loaded, 1000 inferences → memory grows 500+ MB
- Performance degrades noticeably after 4+ hours (GC pressure)

---

### Pitfall 4: VAD Ring Buffer Not Reused — Creating New Buffers Per Cycle

**What goes wrong:** Always-Listening runs VAD detection in a loop. Each cycle, a new ring buffer is allocated: `const buffer = new Float32Array(16000 * 5)` (5 seconds of audio). Buffer is filled, processed, discarded. After 8 hours, 28800 iterations create 28800 ring buffers (even if GC collects them, allocation overhead is huge). Each allocation is ~320 KB, totaling 9.2 GB memory allocations.

**Why it happens:** If the code creates a new buffer each cycle instead of reusing one, GC must collect all old buffers. High allocation rate causes GC pauses and fragmentation.

**Consequences:**
- GC pressure increases over time (more objects to collect)
- GC pauses every few seconds, causing audio dropouts
- Memory usage spikes before GC runs, then drops (sawtooth pattern)
- Soak test shows memory spikes every 30-60 seconds

**Prevention:**
1. **Reusable ring buffer** — Create one ring buffer at startup, reuse it every cycle. Use `buffer.set(newData, writeIndex)` to overwrite old data instead of creating new buffer
2. **Object pooling** — Maintain a pool of pre-allocated buffers (e.g., 5 buffers); cycle through them instead of allocating new ones. After processing, return buffer to pool
3. **Typed array slicing instead of allocation** — Instead of `new Float32Array(size)`, use `buffer.subarray(start, end)` to create views without allocating
4. **Memory assertion in soak test** — Script logs memory every 10 seconds and watches for sawtooth pattern (should be stable line, not sawtooth). If sawtooth detected, investigate allocations

**Detection:**
- Memory curve in soak test shows sawtooth pattern (spikes and dips every 30-60s)
- Chrome DevTools timeline shows GC running frequently (every 30-60s instead of every 5+ minutes)
- Heap snapshots show 1000s of `Float32Array` objects with similar size (indicates new allocations)
- Audio dropouts or timing glitches after 2-3 hours (correlated with GC pauses)

---

## Summary Table: Critical Pitfalls by Feature

| Feature | Pitfall | Risk | Prevention |
|---------|---------|------|-----------|
| **SSE Actions** | Action arrives after SSE closes | Action lost silently | Preempt actions in response stream; ACK protocol; separate action WebSocket |
| **SSE Actions** | Wrong client executes action (race condition) | Action on wrong machine/instance | Session token in payload; single-instance lock; client-side validation |
| **SSE Actions** | Unvalidated action payloads (arbitrary code exec) | Security/integrity breach | Zod validation on emit + preload; allowlist commands; path sanitization; no shell eval |
| **SSE Actions** | Dangling SSE listeners on component unmount | Memory leak 5-10 MB per session | Explicit `close()` in useEffect cleanup; global singleton EventSource |
| **Streaming TTS** | Buffer underrun → audio glitches | User hears stuttering/cutting out | Pre-buffer 500-1000ms; ring buffer watermarks; chunk monitoring; fallback to full-buffer |
| **Streaming TTS** | Chunks arrive out of order | Words scrambled/reversed | Sequence numbering; queue validation; out-of-order handler; sequential requests |
| **Streaming TTS** | Resource leak on interruption | Memory grows 5-10 MB per interrupt | `AbortController.abort()`; backend disconnect detection; `AudioContext.suspend()` reuse |
| **Streaming TTS** | ElevenLabs/Murf streaming quirks | Latency spikes or no streaming | Tune ElevenLabs `chunk_schedule`; detect Murf → use full-response mode; provider capability flags |
| **Settings** | In-flight requests during provider switch | Parse error; response data mismatch | Lock requests during switch; config pinning per request; request tracking |
| **Settings** | env var vs electron-store config conflict | User changes ignored; stale values | electron-store first, env var fallback; config factory function; request-time validation |
| **Settings** | LangChain ChatModel not reinitialized properly | Multiple instances active; memory leak | Singleton ChatModel with explicit cleanup; factory with `close()` method |
| **Settings** | Wake word sensitivity change not applied | User must restart for setting to work | EventEmitter for settings changes; runtime config read (no cache); IPC push on change |
| **macOS Tray Icon** | PNG not truly transparent or wrong alpha | Icon invisible or solid white blob | Grayscale+Alpha mode; PNG validation script; template test on macOS |
| **macOS Tray Icon** | Wrong size or no @2x variant | Blurry pixelated icon on Retina displays | Provide 16x16@1x + 32x32@2x pair; design at high resolution; QA on Retina |
| **Always-Listening Soak** | AudioContext not closed; accumulating contexts | Memory grows 50-100 MB over 8h | Singleton `audioContext`; explicit `.close()` on cleanup; media stream `.stop()` |
| **Always-Listening Soak** | IPC listeners accumulating without cleanup | Memory 1-5 MB per show/hide; slow handling | Cleanup in useEffect; `once()` for one-time events; listener count assertions |
| **Always-Listening Soak** | Transformers.js model tensors not disposed | Memory grows 500+ MB over 8h | Explicit tensor disposal; singleton pipeline; fallback to simpler classifier |
| **Always-Listening Soak** | Ring buffer allocated new per cycle | GC sawtooth pattern; memory spikes | Reusable ring buffer; object pooling; assertion for stable memory band |

---

## Sources & References

- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Server-Sent Events: Client Disconnection Detection](https://deepwiki.com/sysid/sse-starlette/3.5-client-disconnection-detection)
- [ElevenLabs: Understanding Audio Streaming](https://elevenlabs.io/docs/eleven-api/concepts/audio-streaming)
- [ElevenLabs: Latency Optimization](https://elevenlabs.io/docs/best-practices/latency-optimization)
- [Transformers.js Memory Leaks (Issue #860)](https://github.com/huggingface/transformers.js/issues/860)
- [macOS Template Images: ToDesktop Docs](https://www.todesktop.com/docs/trays/tray-icons)
- [Closing SSE Connections: Browser Compatibility](https://blog.apartment304.com/sse-close-connection/)
- [Diagnosing Memory Leaks in Electron Applications](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html)
- [Electron Memory Leak: IPC Events Over contextBridge (Issue #27039)](https://github.com/electron/electron/issues/27039)
- [LM Studio Server Settings Documentation](https://lmstudio.ai/docs/developer/core/server/settings)

---

*Last updated: 2026-05-05 — Research for v2.2 milestone feature pitfalls.*
