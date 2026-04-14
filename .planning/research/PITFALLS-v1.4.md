# Pitfalls Research — v1.4 Voice & UX Polish (Wake Word + Orb)

**Domain:** Electron/TypeScript desktop assistant — adding always-listening wake word + UX refinement
**Researched:** 2026-04-11
**Confidence:** HIGH (verified against Electron issues, wake word project trackers, and existing JARVIS code in `apps/desktop`)
**Scope:** Pitfalls specific to ADDING wake word + orb polish to the already-shipped v1.3 Electron widget. Integration with existing PTT hotkey (`apps/desktop/src/main/ptt-hotkey.ts`), widget hotkey (`apps/desktop/src/main/hotkey.ts`), tray, and MediaRecorder-based audio pipeline (`useAudioRecorder.ts`) is the primary risk surface.

---

## Critical Pitfalls

### Pitfall 1: Porcupine/Picovoice AccessKey lock-in (licensing trap)

**What goes wrong:**
Developer picks Porcupine for wake word because it "just works" in 10 minutes. Ships v1.4. Three months later Picovoice throttles or revokes the free-tier key, or the 30-day auto-reset punishes users who clear localStorage, or — worse — the project ever gets distributed to a second user and now technically violates the non-commercial license. JARVIS becomes unusable without a paid Foundation plan.

**Why it happens:**
Porcupine docs push the AccessKey as "free, no credit card." The fine print: (a) every SDK init call phones home, (b) usage resets every 30 days with a hard device cap, (c) commercial use (even POCs written by a paid contractor) requires Foundation tier, (d) browser-based installs where localStorage is cleared regenerate device IDs and hit the free-tier cap immediately. CLAUDE.md already lists Porcupine under "Avoid" for exactly this reason — but a new dev or Claude instance unaware of that note will reach for it first.

**How to avoid:**
- **Hard ban Porcupine, pvporcupine, @picovoice/porcupine-node, and bumblebee-hotword (Porcupine-derived).** Add an explicit "NEVER USE" note in the phase plan and grep the lockfile in CI: `grep -E "porcupine|picovoice|bumblebee-hotword" pnpm-lock.yaml && exit 1`.
- **Privacy-first candidates, in order:** (1) openwakeword via `onnxruntime-node` calling the same ONNX models the Python v1.0 used — zero key, Apache 2.0, proven false-positive profile; (2) `@ricky0123/vad-node` + custom small keyword classifier; (3) Vosk with a tiny keyword grammar. Document the chosen library + license + last-commit-date in the phase CONTEXT.md.
- **License audit script** in `tools/` that fails the build if any added dep has a license that requires runtime key verification.

**Warning signs:**
- Any import of `@picovoice/*`, `pvporcupine`, `bumblebee-hotword*`.
- A `PICOVOICE_ACCESS_KEY` env var appearing in `.env.example`.
- A network call from the wake word module at startup (Porcupine phones home).

**Phase to address:** Phase 22 (wake word lib selection) — Decision gate before ANY code lands.

---

### Pitfall 2: Wake word self-trigger from TTS playback (feedback loop)

**What goes wrong:**
User says "Hey JARVIS" → JARVIS responds via TTS "Yes, how can I help?" → the phrase "Hey JARVIS" inside a later response ("Hey, JARVIS can do that too") re-triggers the wake word → orb flips to listening → captures JARVIS's own voice → sends it to STT → garbage input. Worse, if the response itself contains the trigger, you get an infinite bounce. This is documented for wyoming-openwakeword + wyoming-satellite: "when the audio output is playing, the microphone is listening, and the speakers can self-trigger the wake word" (rhasspy/wyoming-satellite#185).

**Why it happens:**
The wake word engine has no concept of who is speaking — it matches acoustic pattern regardless of source. Unlike smart speakers with dedicated echo-cancellation DSPs, a desktop mic picks up speaker output directly. Developers assume "I just won't say 'hey JARVIS' in my prompts" but the LLM generates novel text that can contain the phrase, and TTS cadence often matches the training distribution closer than real user speech.

**How to avoid:**
- **Gate the wake word detector by orb state** — only run inference when `state === 'idle'`. Pause the detection loop at the entry of `listening`, `processing`, and `responding`. Resume on idle transition. The existing `OrbContext.tsx` is the single source of truth; subscribe the wake word module to it via IPC from main or a shared store.
- **Explicit audio-output mute window:** wrap TTS playback in `beforePlay → wakeword.pause()` / `afterPlay → setTimeout(wakeword.resume, 300)` to absorb speaker tail. Existing `apps/desktop/src/renderer/src/audio/ttsPlayer.ts` is the integration point.
- **Never use the wake word as part of the TTS output** — sanity-check by post-filtering LLM responses for the trigger phrase and substituting "the assistant" if found. Belt and braces.
- **Do not try to solve this with software AEC** in v1.4 — WebRTC AEC inside Chromium is not reliable for non-call audio and adds latency. Gating is the pragmatic fix.

**Warning signs:**
- Logs show wake word detections with timestamps inside a TTS-playing window.
- STT transcript contains JARVIS's own last response verbatim.
- Orb flickers from `responding → listening → responding` within the same conversational turn.

**Phase to address:** Phase 22 — must be baked into the detector state machine from the first PR, not retrofitted.

---

### Pitfall 3: PTT hotkey + wake word double-trigger (recording state corruption)

**What goes wrong:**
User presses PTT hotkey → `isRecording = true`, MediaRecorder starts → user then says "Hey JARVIS" out of habit → wake word fires, tries to start its own recording → two MediaRecorder instances on the same MediaStream → one calls `stream.getTracks().forEach(t => t.stop())` in its `onstop` → the other one's data is lost, orb state corrupts, backend receives empty or truncated audio. Or worse: wake word fires first, starts recording, user then presses PTT thinking nothing is happening, both code paths race to send `/api/chat/audio`.

**Why it happens:**
The existing `ptt-hotkey.ts` owns a module-level `isRecording` flag. The wake word will introduce a second independent owner of microphone state with no mutex. The renderer's `useAudioRecorder` hook also holds MediaRecorder refs. Three competing owners, zero coordination. Classic race from adding a new actor to an implicit single-writer state.

**How to avoid:**
- **Introduce a single `VoiceInputManager`** (main process or a renderer singleton) that owns mic acquisition and tracks a single `source: 'ptt' | 'wakeword' | null`. Both PTT and wake word go through it. Second concurrent request is rejected or replaces depending on policy.
- **Rejection policy:** wake word loses to PTT (explicit user action wins). If `source === 'wakeword'` and PTT fires, cancel wake word capture and start PTT. If `source === 'ptt'` and wake word fires, drop the wake word event entirely and log.
- **Wake word must not call `getUserMedia` directly** if PTT already acquired the stream. Share the MediaStream across consumers or gate acquisition via the manager.
- **Rewrite `ptt-hotkey.ts`** to read from the manager instead of its own `isRecording` local. The current pattern (`let isRecording = false;` at module scope) is incompatible with a second wake-word actor.

**Warning signs:**
- Two `[PTT] Starting recording` + `[WakeWord] Starting recording` logs within 100ms.
- Orb stuck in `listening` after backend returned a response (state-machine desync).
- `stopRecording called but not recording` warning in useAudioRecorder.

**Phase to address:** Phase 22 — refactor PTT state ownership BEFORE adding wake word, not during. Separate plan task: "Extract VoiceInputManager from ptt-hotkey.ts."

---

### Pitfall 4: Always-on inference loop drains CPU and battery

**What goes wrong:**
Wake word module runs its ONNX inference in a hot `setInterval(16ms)` (60 Hz) loop on the renderer main thread. CPU sits at 8-12% idle. Laptop battery life drops from 6h to 3h. Fan kicks in. User disables wake word. Or: inference runs in the renderer, blocking paint → orb pulse animation stutters whenever wake word does a forward pass. Electron docs explicitly call this out: "Electron apps tend to keep more processes open than they should really need, wake up often in the background... more CPU time, more GPU work, more battery drain."

**Why it happens:**
Naive ports of wake word examples run inference in a tight JS loop on the main thread because it's easier than worker setup. openwakeword's 80ms frame size means 12.5 Hz inference is sufficient, not 60 Hz. Onnxruntime-node without thread-pool tuning spawns N threads per logical core.

**How to avoid:**
- **Run inference in a worker_thread or renderer Web Worker** — never the main thread. Pass raw PCM chunks via `postMessage` with Transferable `ArrayBuffer`.
- **Match the frame rate to the model:** openwakeword needs 80ms windows → ~12.5 inference calls/sec, not 60. Use audio callback cadence, not `setInterval`.
- **Cap onnxruntime threads:** `ort.env.wasm.numThreads = 1` or `ort.env.node.intraOpNumThreads = 2`. Measure — default spawns many.
- **Enable VAD pre-filter** (openwakeword has built-in Silero VAD). Set `vad_threshold: 0.5` so wake-word inference only runs when speech is detected — cuts idle CPU ~90% for a silent room.
- **Battery-mode auto-pause:** subscribe to `powerMonitor.on('on-battery'/'on-ac')` and offer a user setting "pause wake word on battery." Not default-on, but available.
- **Benchmark budget before shipping:** phase success criterion is "<2% CPU sustained on a 4-core laptop during 10 minutes of silence." Measured with `process.getCPUUsage()` or Activity Monitor.

**Warning signs:**
- `process.getCPUUsage()` percentCPUUsage > 0.05 (5%) after 30 seconds of silence.
- Orb idle-pulse animation drops below 60 FPS when wake word is enabled.
- Laptop fans audible within 5 minutes of launching JARVIS.

**Phase to address:** Phase 22 — CPU budget is a blocking success criterion, not a polish item.

---

### Pitfall 5: ONNX model files don't ship with the packaged Electron app

**What goes wrong:**
Dev environment works perfectly — wake word loads `./models/alexa_v0.1.onnx` from `resources/`. `pnpm build` finishes. User runs the `.AppImage` / `.exe` / `.dmg` and crashes on launch: `ENOENT: no such file or directory, open '/tmp/.mount_JARVIS_xxx/resources/app.asar/models/alexa_v0.1.onnx'`. Model files inside `app.asar` can be `fs.read`-accessible but not passed to `onnxruntime-node` which expects a real path (or they're inside `app.asar.unpacked` at a different path than expected).

**Why it happens:**
Electron's `asar` archive is transparent to `fs.readFile` but not to native addons that need real filesystem paths. `onnxruntime-node` loads models via a C++ path call. Devs test in `npm run dev` where files are on disk, not in asar. `electron-builder`'s `asarUnpack` glob is tricky — `**/*.onnx` works but the path at runtime becomes `process.resourcesPath + '/app.asar.unpacked/models/xxx.onnx'`, not `./models/xxx.onnx`.

**How to avoid:**
- **Use `extraResources` in `electron-builder.yml`**, not `asarUnpack`, for model files. Puts them in `process.resourcesPath` cleanly, no asar confusion. Example:
  ```yaml
  extraResources:
    - from: "apps/desktop/resources/wakeword-models"
      to: "wakeword-models"
      filter: ["**/*.onnx", "**/*.tflite"]
  ```
- **Runtime path resolver** that handles both dev and packaged:
  ```ts
  const modelPath = app.isPackaged
    ? path.join(process.resourcesPath, 'wakeword-models', 'hey_jarvis.onnx')
    : path.join(__dirname, '../../resources/wakeword-models/hey_jarvis.onnx');
  ```
- **Post-build smoke test:** `pnpm build && unzip -l dist/*.AppImage | grep wakeword-models` fails build if model absent.
- **Don't bundle with Vite asset import** — Vite inlines/fingerprints the filename, breaking model path lookup. Mark the model directory as an external resource.

**Warning signs:**
- `fs.existsSync(modelPath)` works in dev, fails after `pnpm build`.
- `app.asar.unpacked` contents include source files or README that shouldn't be there (electron-builder#8640 — asarUnpack glob bleeds).
- Installer size increased only slightly after adding models (models went into asar, not extraResources).

**Phase to address:** Phase 22 (wake word install) + phase validation step "install the packaged artifact on a clean VM and run it" before marking done.

---

### Pitfall 6: Native module build failures on Windows (Electron rebuild hell)

**What goes wrong:**
`onnxruntime-node` / `node-pty` / any native dep builds fine on Linux dev machine. Contributor on Windows runs `pnpm install` and gets: `gyp ERR! find VS`, `Python is not installed`, `MSBuild not found`, or worse — builds against Node ABI instead of Electron ABI, so `require('onnxruntime-node')` crashes at runtime with `NODE_MODULE_VERSION mismatch`. PROJECT.md already notes `scripts/postinstall.mjs` handling for better-sqlite3; adding onnxruntime-node doubles the surface area.

**Why it happens:**
Electron has its own Node ABI. Native modules must be rebuilt against Electron headers, not system Node. Windows lacks build tools by default. Even with `@electron/rebuild`, modules without Electron-specific prebuilds must compile from source → needs `node-gyp` + VS Build Tools + Python. onnxruntime-node 1.18+ ships prebuilds for common platforms, but only x64 Windows and arm64/x64 macOS — Linux arm64 falls back to source build.

**How to avoid:**
- **Pin the wake word library version** based on whether prebuilds exist for win32-x64, darwin-arm64, linux-x64. Verify `ls node_modules/onnxruntime-node/bin/napi-v3/` after install — should show platform dirs.
- **Add `@electron/rebuild` invocation to `scripts/postinstall.mjs`** with explicit target Electron version. Fail loudly if it fails (don't silently continue).
- **Use `--only-binary` / prefer-prebuilds strategies in pnpm config** to avoid accidental from-source builds.
- **CI matrix** (even simple GitHub Actions on ubuntu/windows/macos) that just runs `pnpm install && pnpm build` catches this before merge.
- **Document prereqs in PROJECT.md `Context` section** — "Windows dev: install VS 2022 Build Tools + Python 3.12 if contributing to wake word module."
- **Fallback: ship a feature flag** `WAKE_WORD_ENABLED=false` default so a broken native module doesn't brick the whole app.

**Warning signs:**
- `NODE_MODULE_VERSION X. This version of Node.js requires NODE_MODULE_VERSION Y.`
- Build succeeds on Linux, fails on Windows with `gyp ERR!`.
- `require('onnxruntime-node')` throws at runtime but TypeScript compile passed (native modules not type-checked).

**Phase to address:** Phase 22 (install + scaffolding). Prereq task: "verify prebuilds exist for all target platforms" before committing to the library.

---

### Pitfall 7: macOS microphone permission dialog never shows (silent mic failure)

**What goes wrong:**
User installs JARVIS on macOS. Wake word is enabled. Nothing happens. No error. `navigator.mediaDevices.getUserMedia` resolves successfully but the audio track is all zeros. There's no permission prompt. Wake word never detects anything. Electron issue #42714 and #29861 document this: getUserMedia resolves even when mic access is blocked at the system level, silently returning a dead stream.

**Why it happens:**
macOS requires (a) `NSMicrophoneUsageDescription` in Info.plist, (b) hardened runtime entitlement `com.apple.security.device.audio-input`, (c) the app must be signed (even ad-hoc self-signed is OK for local dev, but notarization needed for distribution), (d) Electron < 28 had a bug where getUserMedia silently succeeded if the system permission was "not determined" yet. Electron PRs #42936-42938 fixed this but only in recent versions.

**How to avoid:**
- **Set `NSMicrophoneUsageDescription`** via `electron-builder.yml` `mac.extendInfo` with a human string: `"JARVIS precisa do microfone para ouvir o wake word 'Hey JARVIS'."`
- **Hardened runtime + entitlements** in `build/entitlements.mac.plist`:
  ```xml
  <key>com.apple.security.device.audio-input</key><true/>
  ```
  and electron-builder config `"hardenedRuntime": true, "entitlements": "build/entitlements.mac.plist"`.
- **Pin Electron >= 31** to get the getUserMedia permission-check fixes.
- **Explicit permission probe at startup:** use `systemPreferences.getMediaAccessStatus('microphone')` (main process) to check state; if `not-determined`, call `systemPreferences.askForMediaAccess('microphone')` BEFORE the first getUserMedia call. This guarantees the prompt shows.
- **Detect silent-zero streams:** first 500ms of wake word audio should fail a "not pure silence" check — if RMS == 0, assume permission denied, show a UI error with a "Open System Settings → Privacy → Microphone" link via `shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')`.
- **Only relevant if Mac is in scope for v1.4.** PROJECT.md says "Mac/Linux cross-platform support deferred to future milestones" — if Mac is explicitly deferred, document this pitfall as a "future concern" warning in the phase SUMMARY so it's not re-discovered later.

**Warning signs:**
- getUserMedia resolves but audio chunk RMS is exactly 0.0 for 10+ consecutive frames.
- `systemPreferences.getMediaAccessStatus('microphone') === 'denied'` and no error raised.
- macOS Console.app shows `TCC: access denied` for the JARVIS bundle ID.

**Phase to address:** Phase 22 or defer if Mac is out of scope. Document in PITFALLS even if deferred — avoids re-research later.

---

### Pitfall 8: Linux headless / WSL microphone unavailable (silent degradation)

**What goes wrong:**
Developer runs JARVIS in WSL2 or on a headless Linux box (SSH with X forwarding, or a dev container). Wake word module calls `getUserMedia` → throws `NotFoundError: no audio input devices` or `DOMException: Permission denied by system`. Whole renderer crashes or wake word silently disables but no UI feedback. WSL2 doesn't forward audio devices by default, and Wayland adds another permission layer. JARVIS already declared "Projeto roda em Windows (dev) / Linux (Docker)" in PROJECT.md — Linux Docker has no mic.

**Why it happens:**
WSL2 uses a Hyper-V VM with no PulseAudio passthrough unless specifically configured. Wayland routes audio through pipewire with PortalDesktop permissions. Docker containers have no mic unless `--device /dev/snd` is passed. Assistant code assumes mic is always available because in dev-on-Windows it just works.

**How to avoid:**
- **Capability probe at startup:** enumerate devices via `navigator.mediaDevices.enumerateDevices()`; if no `audioinput` device, disable wake word gracefully and show toast "No microphone detected — wake word unavailable. Voice input via PTT also disabled."
- **Feature flag the wake word module off by default in headless mode.** Detect via `process.env.DISPLAY`, `process.env.WAYLAND_DISPLAY`, or `process.env.WSL_DISTRO_NAME` — skip init if any indicate a non-interactive environment.
- **Don't crash — degrade.** Wake word failure must never break text chat. Wrap init in try/catch with a top-level kill-switch.
- **Document WSL audio setup** in README if the primary dev box is WSL: either develop wake word on bare Windows or use `wslg` + PulseAudio bridge (complex, not worth it for personal use).

**Warning signs:**
- `enumerateDevices()` returns zero audioinput devices.
- `getUserMedia` rejects with `NotFoundError` immediately (not after timeout).
- Wake word module tried to init in a Docker healthcheck and crashed the container.

**Phase to address:** Phase 22 — graceful degradation is a day-1 requirement, not polish.

---

### Pitfall 9: MediaRecorder memory leak on long-running sessions

**What goes wrong:**
User leaves JARVIS running all day. Renderer memory grows from 200 MB → 600 MB → 1.2 GB over 8 hours. Eventually the renderer crashes with "Aw, Snap!" or Electron kills it on OOM. Electron issues #41123 (WebRTC getUserMedia MediaRecorder memory leak) and #15451 (MediaRecorder objects retained even when not held by app code) document exactly this. Wake word using getUserMedia continuously hits it directly.

**Why it happens:**
Chromium retains MediaRecorder and its internal buffers even after `stop()` if any reference dangles. Continuous recording that doesn't call `requestData()` periodically accumulates in the renderer. Codec matters — VP9/VP8 leak more than OPUS-only. For the wake word use case, the "right" pattern is not MediaRecorder at all — it's AudioWorkletNode pulling raw Float32 PCM directly, no encoding pipeline.

**How to avoid:**
- **Do NOT use MediaRecorder for wake word capture.** Use `AudioContext` + `AudioWorkletNode` to get raw PCM frames. MediaRecorder is for PTT (one-shot, encoded upload). Wake word is streaming raw samples — different tool.
- **Reuse the MediaStream, don't re-acquire.** Call `getUserMedia({ audio: true })` once at init; share across wake word worklet and (if needed) PTT. Stopping and restarting streams leaks internal buffers.
- **Explicitly `stream.getTracks().forEach(t => t.stop())` AND null out references on shutdown.** Existing `useAudioRecorder.ts` does this for PTT — verify wake word does too.
- **Memory regression test:** run the packaged app for 2 hours with wake word enabled under Playwright/Spectron, measure `process.memoryUsage().rss` before/after. Phase success criterion: < 50 MB growth.
- **Periodic `requestData()` if stuck with MediaRecorder:** forces buffer flush, prevents unbounded growth (from Electron #40440 workaround).

**Warning signs:**
- Renderer process RSS grows linearly with time during idle.
- Chrome DevTools Memory snapshot shows > 100 MediaStreamTrack instances.
- App crashes after 1-2 hours with no user interaction.

**Phase to address:** Phase 22 — use AudioWorklet from the start. Retrofit from MediaRecorder is a rewrite.

---

### Pitfall 10: Over-animated orb tanks GPU / battery

**What goes wrong:**
Orb polish phase adds: drop-shadow pulse, ripple rings, hue rotation, blur filter, particle halo. Looks stunning in the demo. Runtime: GPU compositor hits 30%, laptop fan screams, battery drops. Electron performance docs: "JavaScript timers, animations, and frameworks that never really sleep... more GPU work... battery drain." CSS `filter: blur()` and `filter: drop-shadow()` trigger full-texture repaints every frame when animated — animating them at 60fps on a 240x240 window is fine individually but compounds fast.

**Why it happens:**
CSS pulse animations feel cheap because they're "just CSS" — devs add layers without measuring. Animating `width/height/top/left/box-shadow` triggers layout + paint. Only `transform` and `opacity` are truly compositor-only. `filter: blur()` and `filter: drop-shadow()` are compositor but expensive. Multiple simultaneous `@keyframes` with `animation-iteration-count: infinite` never let the compositor rest. Existing Orb.tsx already uses drop-shadow + gradient — new polish must stay within budget.

**How to avoid:**
- **Budget discipline:** phase plan sets a GPU compositor budget (e.g., `< 5% idle GPU`). Measure with `chrome://tracing` or macOS Activity Monitor GPU tab.
- **Animate only `transform` and `opacity` for new effects.** Width/height pulses → replace with `transform: scale()`. Box-shadow pulses → replace with a sibling `<div>` scaled and faded.
- **Pause animations when window is hidden:** `document.visibilitychange` → add `animation-play-state: paused` class. Tray-hidden state should be zero GPU.
- **Pause idle animations after N seconds of no interaction:** after 30s in idle, let the orb settle to a static gradient. Resume on hover or state change.
- **Single rAF loop instead of multiple CSS keyframes:** if doing more than 2 simultaneous animations, combine into one `requestAnimationFrame` JS loop that can be throttled centrally.
- **Test on the weakest target hardware** (integrated GPU laptop, not dev machine with discrete GPU).
- **Don't add a canvas/WebGL orb** — that's a 10x GPU jump. If the CSS orb isn't "polished enough," that's a scope red flag.

**Warning signs:**
- `chrome://gpu` compositor frames show > 5ms on idle.
- Laptop fan within 60s of launching JARVIS with orb visible and idle.
- `performance.now()` frame time > 16.6ms during orb idle animation.
- Task Manager / Activity Monitor shows renderer GPU column > 2% when orb is just pulsing.

**Phase to address:** Phase 22 or a dedicated "orb polish" phase — performance budget is a success criterion, not a checklist item. Enforce via measurement, not vibes.

---

### Pitfall 11: False negatives — wake word misses natural speech

**What goes wrong:**
User says "Hey JARVIS" naturally while walking past the mic — nothing happens. Says it louder — still nothing. Says it staring at the mic in a robot voice — works. User loses trust, disables the feature, goes back to PTT. Home Assistant community has documented this extensively: "I have to shout at it" is the #1 wake word complaint.

**Why it happens:**
Threshold set too high out of fear of false positives. Or: the wake word model was trained primarily on American English + studio recordings, user speaks with Portuguese accent, far from mic, in a room with ambient noise. Or: Silero VAD threshold rejects quiet speech before the wake word model even runs. Or: the model's 80ms frame window catches only the tail of "JARVIS" if user enunciates quickly.

**How to avoid:**
- **Ship with a threshold TUNING UI** (even just a tray menu submenu "Sensitivity: Low / Medium / High"). Default Medium. Let the single user tune it to their voice. This is a personal assistant — tune for one person, not averages.
- **Use openwakeword's "hey_jarvis" pretrained model** if available (dscripka/openWakeWord has community models). Don't train from scratch in v1.4.
- **Lower the Silero VAD threshold** to 0.3 (not the default 0.5) — favors hearing user over rejecting noise. Pair with explicit wake word threshold of 0.5-0.6 rather than 0.8.
- **Log every detection attempt with score** to a debug file (opt-in) so the user can see "I said 'hey jarvis' at 14:32:15, score was 0.43" and tune based on real data.
- **Acoustic test harness:** record 30 samples of the user saying "hey JARVIS" in different conditions (quiet, typing, TV on, far from mic). Replay against the detector in tests. Phase exit criterion: > 85% detection rate on this personal corpus.
- **Don't promise 99% detection.** Personal assistant use: one user, known acoustic environment, can retrain with their voice in v2 if needed.

**Warning signs:**
- User says "hey jarvis" 3 times, orb flickers once.
- Debug log shows detection scores consistently 0.3-0.45 (just below threshold).
- User complaints "I have to yell at it."

**Phase to address:** Phase 22 — tune to the user, not the defaults.

---

### Pitfall 12: False positives — wake word fires on music, TV, normal conversation

**What goes wrong:**
User watches YouTube → some random word in the video triggers "hey JARVIS" → orb flips to listening → captures video audio → sends to STT → LLM receives garbage → responds with nonsense. Music with lyrics that rhyme with "Hey JARVIS" is the worst. User quickly disables the feature. The "<0.5/hour false-accept" target from openwakeword docs is generous — uncontrolled media environments blow past it.

**Why it happens:**
Wake word models trained on speech-vs-silence; music and TV are speech with different acoustic properties (heavy compression, reverb, multiple speakers) that occasionally match the template. VAD alone doesn't help — music IS voice-active. Thresholds tuned for silence-vs-user-voice fail for silence-vs-user-voice-vs-media.

**How to avoid:**
- **VAD + Silero pre-filter enabled** (see Pitfall 4).
- **Custom verifier model** (openwakeword supports this): a second small classifier trained on the user's own voice vs. anything else. Dramatically reduces false positives from media. This can be built post-MVP with a simple enrollment flow.
- **System audio mute detection:** if system is playing audio > 50% volume, raise the wake word threshold temporarily. On Windows via `systeminformation` or platform APIs; on Linux via pactl.
- **Cooldown after false positive:** if wake word fires and STT returns gibberish / empty / unknown-language, suppress the next wake word for 10 seconds.
- **User override: "Pause wake word while media is playing"** — detect via known media app process names (spotify, chrome, vlc) via `psutil` equivalent. Opt-in setting.
- **Test against adversarial audio:** run wake word detector against 10 minutes of random YouTube + Spotify + podcasts. Target: < 2 false positives per 10 minutes of media.

**Warning signs:**
- Orb randomly flips to listening while user isn't talking.
- LLM receives transcripts like "and that's why we love" or song lyrics.
- User disables wake word within the first day.

**Phase to address:** Phase 22 — VAD pre-filter mandatory. Custom verifier deferrable to phase 23 or v1.5.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode wake word threshold in code | Ships faster, no UI work | User can't tune → disables feature → wasted phase | Never — expose via tray menu minimum |
| Inference on renderer main thread (no worker) | Simpler code, no IPC | Orb animation stutters, battery drain | Demo only, never ship |
| MediaRecorder for wake word instead of AudioWorklet | Reuse existing useAudioRecorder | Memory leak, codec overhead, 10x data flow | Never — wrong tool |
| Load model with Vite asset import | "Works in dev" | Breaks in packaged app, model fingerprinted | Never — use extraResources |
| Two independent `isRecording` flags (PTT + wake word) | Less refactor | Race conditions, state corruption | Never — single owner required |
| Skip Silero VAD pre-filter | Faster to integrate | 10x CPU idle, battery tanks | Only if benchmarked < 2% CPU without VAD |
| No degradation path for headless/Linux | "It works on my Windows box" | Docker container crashes, CI breaks | Only if Linux/headless explicitly out of scope with CI skip |
| Bundled Porcupine trial key | Fastest wake word in 10 minutes | License violation, forced rewrite | Never — banned per CLAUDE.md |
| Disable wake word module entirely when any init step fails | Robustness | User doesn't know why it failed | Acceptable if error is logged AND shown as toast |
| Ship without CPU/memory benchmark | Ship faster | Battery complaints, silent regressions later | Never for always-on features |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PTT hotkey + wake word | Two independent `isRecording` flags | Single `VoiceInputManager` with `source` field and priority policy |
| Wake word + TTS playback | Detector keeps running during speak | Pause detector on `responding` state entry, resume on `idle` |
| Wake word + widget hotkey (Ctrl+Shift+J) | Hotkey shows widget but doesn't cancel wake word listening | Hotkey handler should call `voiceManager.cancelIfWakeWord()` |
| onnxruntime-node + Electron | Loaded via `require()` but ABI mismatch | `@electron/rebuild` in postinstall + pin Electron ABI version |
| Model files + electron-builder | Put in `src/`, Vite fingerprints them | `extraResources` in builder config, runtime path via `process.resourcesPath` |
| getUserMedia + AudioWorklet | Create new stream per wake word frame | Single long-lived stream + AudioWorkletNode; stream acquired once |
| Orb state + wake word | Wake word writes to `OrbContext` directly from main process | IPC event `wakeword:detected` → renderer subscribes → sets state via context |
| electron-store + wake word settings | Default sensitivity hardcoded | Default in `store.ts` schema, user-configurable via tray menu |
| Tray menu + wake word toggle | Toggle updates UI but doesn't stop detector | Toggle must call `voiceManager.setWakeWordEnabled(bool)` which stops worker + releases stream |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Inference on main thread | Orb animation stutters, renderer frame drops | Worker thread for wake word inference | Immediately noticeable on < 4-core CPUs |
| No VAD pre-filter | CPU 8-12% idle, fan noise | Enable Silero VAD with threshold 0.3-0.5 | Always-on → laptop battery life halved |
| MediaRecorder for continuous capture | Memory grows linearly over hours | AudioWorkletNode with Float32 frames | After 1-2 hours runtime → renderer crash |
| Animated `filter: blur()` / `drop-shadow` on orb | GPU compositor > 5%, fan noise | Animate only transform/opacity | Combined with other renderer load → fan kicks in |
| Infinite CSS animations when window hidden | Background GPU usage | `animation-play-state: paused` on visibilitychange | Laptop sleep → wake cycles waste battery |
| ONNX int32 quantization (not int8) | Larger model, slower inference, more memory | Use int8 quantized models (openwakeword provides) | Cold start > 500ms, inference > 20ms |
| Creating new AudioContext per detection | Memory growth, audio glitches | Single AudioContext for app lifetime | After ~30 detections → audio dropouts |
| Logging every audio frame to stdout | Renderer blocked on console.log | Log only state transitions, not frames | Debug mode left on in prod build |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Wake word module phones home with AccessKey | Privacy leak, violates "privacy-first" constraint | Ban libraries that require keys (see Pitfall 1) |
| Raw audio frames sent via IPC without size cap | Malicious renderer DOS via memory | Fixed-size ring buffer, drop frames on back-pressure |
| Wake word transcripts logged to disk by default | Always-on audio surveillance risk | Opt-in debug logging only, with file rotation + deletion |
| Wake word captures trigger PC tools directly | Accidental file delete from misheard command | Keep existing confirmation layer (TOOL-04) for destructive ops — wake word shouldn't bypass |
| No mic indicator when wake word is listening | User doesn't know mic is hot | Tray icon badge or orb subtle animation when detector active |
| Packaged app requests mic without explanation | macOS rejection, user distrust | NSMicrophoneUsageDescription with clear Portuguese string |
| Wake word runs even when screen is locked | Captures audio during private conversations | Hook `powerMonitor.on('lock-screen')` → pause detector |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback when wake word detected | "Did it hear me? Should I just talk?" | Orb transitions to `listening` state immediately on detection (< 100ms) |
| Wake word detection with no audio cue | User doesn't know when to start speaking | Short tone or "ding" (under 80ms) on detection — like Alexa |
| Tuning sensitivity requires editing config files | Feature abandoned after first false positive | Tray menu: Sensitivity Low/Medium/High with preset thresholds |
| No way to disable wake word quickly | User in a meeting can't mute | Tray menu "Pause listening" with 15min/1h/until quit options |
| Wake word + PTT both active with no hint which is which | Confusion, double-triggers | Tray menu shows both states; orb glow differs slightly for each trigger source |
| Detection cooldown invisible | Second "hey jarvis" within 2s seems ignored | Brief orb flicker on cooldown-suppressed detection |
| No error when wake word fails to load | User thinks it's working, nothing happens | Toast on init failure: "Wake word indisponível: [reason]" |
| Orb pulse in idle is too busy | Distracting while user is working | Slow, quiet pulse (4-6s period, 10% opacity variation) |
| Orb state changes are abrupt | Jarring, cheap feel | Cross-fade transitions 200-300ms between states |
| New orb effects only visible on hover | "Polish" nobody sees | Visible micro-interaction on state change, not hover |
| Wake word sensitivity resets on update | User has to re-tune every release | Persist in electron-store with schema version |

---

## "Looks Done But Isn't" Checklist

- [ ] **Wake word module:** Loads model from packaged app (not just dev) — verify by running built `.AppImage`/`.exe`
- [ ] **Wake word module:** Runs in worker thread — verify main thread < 2% CPU during detection
- [ ] **Wake word module:** Pauses during TTS playback — verify no self-trigger in integration test
- [ ] **Wake word module:** Pauses when orb state is not `idle` — verify state transitions in unit test
- [ ] **Wake word + PTT:** Both paths go through single VoiceInputManager — grep for `isRecording` confirms no duplicates
- [ ] **Wake word:** Gracefully disables on headless/no-mic systems — verify in Docker or `--audio=none` run
- [ ] **Wake word:** Sensitivity configurable via tray menu — not just a constant in code
- [ ] **Wake word:** Shows toast error on init failure — test by renaming model file
- [ ] **Wake word:** Memory stable over 2h idle — verify with `process.memoryUsage()` logging
- [ ] **Wake word:** License check in CI — no porcupine/picovoice/bumblebee deps
- [ ] **Orb polish:** GPU compositor < 5% idle — verify in `chrome://tracing`
- [ ] **Orb polish:** Animations pause on `visibilitychange: hidden` — verify via devtools
- [ ] **Orb polish:** 60fps maintained during state transitions — verify with performance.now()
- [ ] **Orb polish:** Visible on low-DPI + high-DPI displays — test both
- [ ] **macOS (if in scope):** NSMicrophoneUsageDescription set — verify in packaged Info.plist
- [ ] **macOS (if in scope):** Hardened runtime + audio-input entitlement — verify `codesign --display --entitlements -`
- [ ] **Windows:** Native modules built for Electron ABI — verify `require('onnxruntime-node')` works in packaged app
- [ ] **Linux:** Wake word init gracefully skipped when no audio device — verify in headless container
- [ ] **Feature flag:** `WAKE_WORD_ENABLED=false` cleanly disables module, no runtime errors
- [ ] **Regression:** Existing PTT flow still works identically — v1.3 tests all green
- [ ] **Regression:** Existing Ctrl+Shift+J widget toggle still works — not hijacked by wake word

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Porcupine shipped accidentally | HIGH | Rip out, replace with openwakeword, retest all wake word paths, remove AccessKey env var |
| TTS self-trigger loop | LOW | Add state-gate in detector entry point; single file change + test |
| PTT state race | MEDIUM | Extract VoiceInputManager, refactor both ptt-hotkey.ts and wake word to use it; 1-2 days |
| CPU drain | MEDIUM | Move inference to worker, add VAD pre-filter, tune thread count |
| Model not packaged | LOW | Fix electron-builder extraResources config, rebuild, test packaged artifact |
| Native module won't build on Windows | HIGH | Pin different library version with prebuilds, or contribute a prebuild, or hard-disable on Windows with feature flag |
| macOS mic permission silent failure | LOW | Add entitlements + Info.plist, re-sign, re-notarize |
| Memory leak over hours | MEDIUM | Swap MediaRecorder → AudioWorklet, verify with 2h soak test |
| Orb GPU drain | LOW-MEDIUM | Remove expensive filters, pause on hidden, measure |
| False positives on media | MEDIUM | Lower sensitivity default, add media-playing detection, offer custom verifier in v1.5 |
| False negatives | LOW | Ship sensitivity tuning UI, document how to tune |

---

## Pitfall-to-Phase Mapping

> v1.4 is currently scoped to 1-2 phases starting at 22. Mapping assumes Phase 22 = Wake Word, Phase 23 = Orb Polish (if split); otherwise all in 22.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Porcupine lock-in | Phase 22 (lib selection, decision gate) | CI grep blocks `porcupine\|picovoice\|bumblebee-hotword`; license audit script |
| 2. TTS self-trigger | Phase 22 (detector state machine) | Integration test: play TTS containing "hey jarvis" → detector must not fire |
| 3. PTT + wake word race | Phase 22 (refactor VoiceInputManager BEFORE wake word code) | Unit test: fire PTT + wake word within 50ms, verify only one captures |
| 4. CPU/battery drain | Phase 22 (worker thread + VAD) | Benchmark: < 2% CPU sustained, 10min silence on 4-core |
| 5. Model not packaged | Phase 22 (electron-builder config) | Smoke test packaged AppImage/exe on clean machine |
| 6. Native module Windows build | Phase 22 (postinstall + prebuild verification) | CI matrix: ubuntu + windows + macos `pnpm install && build` |
| 7. macOS mic permission | Phase 22 or defer | Only if Mac in scope; otherwise document as future work |
| 8. Headless/WSL degradation | Phase 22 (capability probe) | Run in Docker → toast shown, no crash |
| 9. MediaRecorder memory leak | Phase 22 (AudioWorklet from day 1) | 2h soak test, RSS delta < 50 MB |
| 10. Orb over-animation GPU drain | Phase 22 or 23 (polish) | GPU compositor < 5% idle in chrome://tracing |
| 11. False negatives | Phase 22 (sensitivity tuning UI) | Personal corpus test: 85% detection rate |
| 12. False positives on media | Phase 22 (VAD + cooldown) | 10min YouTube test: < 2 false positives |

---

## Sources

**Electron issues and docs (HIGH confidence):**
- [Electron #41123 — WebRTC MediaRecorder Memory Leak by Codec](https://github.com/electron/electron/issues/41123)
- [Electron #15451 — MediaRecorder objects retained in memory](https://github.com/electron/electron/issues/15451)
- [Electron #40440 — MediaRecorder Crashing After 1h10m](https://github.com/electron/electron/issues/40440)
- [Electron #42714 — getUserMedia doesn't throw without audio permissions](https://github.com/electron/electron/issues/42714)
- [Electron #29861 — getUserMedia always fulfilled on macOS even if disabled](https://github.com/electron/electron/issues/29861)
- [Electron PR #42936-42938 — macOS permissions check fix](https://github.com/electron/electron/pull/42936)
- [Electron #11908 — High CPU Usage While Idling](https://github.com/electron/electron/issues/11908)
- [Electron globalShortcut API docs](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Electron Performance Guidelines](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron Native Node Modules guide](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

**Wake word projects (HIGH confidence):**
- [openWakeWord GitHub — dscripka](https://github.com/dscripka/openWakeWord) — VAD, threshold tuning, custom verifier models
- [openWakeWord custom verifier docs](https://github.com/dscripka/openWakeWord/blob/main/docs/custom_verifier_models.md)
- [rhasspy/wyoming-satellite #185 — OpenWakeWord Can Trigger Itself](https://github.com/rhasspy/wyoming-satellite/issues/185)
- [home-assistant/core #159262 — TTS Stream Token expires with wake word](https://github.com/home-assistant/core/issues/159262)
- [esphome/issues #5207 — wake word trigger sound delayed during playback](https://github.com/esphome/issues/issues/5207)
- [Home Assistant wake word community — sensitivity thread](https://community.home-assistant.io/t/wake-word-sensitivity/629189)

**Licensing / Porcupine (HIGH confidence):**
- [Picovoice Pricing](https://picovoice.ai/pricing/) — Foundation/Enterprise tiers for commercial
- [Picovoice Porcupine Issue #1241 — Licensing and AccessKey](https://github.com/Picovoice/porcupine/issues/1241)
- [Picovoice FAQ — free tier device cap, 30-day reset](https://picovoice.ai/docs/faq/general/)
- [bumblebee-hotword-node Snyk report](https://snyk.io/advisor/npm-package/bumblebee-hotword-node) — Inactive, no updates in 12+ months
- `CLAUDE.md` — JARVIS project already bans Porcupine in "What NOT to Use" table

**Electron-builder / packaging (HIGH confidence):**
- [electron-builder Configuration — extraResources, asarUnpack](https://www.electron.build/configuration.html)
- [electron-builder #8640 — asarUnpack not honored](https://github.com/electron-userland/electron-builder/issues/8640)
- [electron-builder #6949 — File exists in both asar and asar.unpacked](https://github.com/electron-userland/electron-builder/issues/6949)
- [@electron/rebuild on GitHub](https://github.com/electron/rebuild)

**macOS permissions (HIGH confidence):**
- [BigBinary — Requesting camera/mic permission in Electron](https://www.bigbinary.com/blog/request-camera-micophone-permission-electron)
- [electron-builder #6948 — Info.plist not applied](https://github.com/electron-userland/electron-builder/issues/6948)
- [electron-builder #7514 — NSMicrophoneUsageDescription duplicate](https://github.com/electron-userland/electron-builder/issues/7514)

**CSS animation performance (MEDIUM-HIGH confidence):**
- [Electron #21289 — Animation performance](https://github.com/electron/electron/issues/21289)
- [Electron #31399 — CSS animation freeze](https://github.com/electron/electron/issues/31399)
- [dev.to — Optimizing CSS animations, what to avoid](https://dev.to/nasehbadalov/optimizing-performance-in-css-animations-what-to-avoid-and-how-to-improve-it-bfa)

**Existing JARVIS code reviewed (HIGH confidence — direct read):**
- `/root/jarvis/apps/desktop/src/main/ptt-hotkey.ts` — module-scoped `isRecording` flag, conflicts with future wake word
- `/root/jarvis/apps/desktop/src/main/hotkey.ts` — globalShortcut pattern for widget toggle
- `/root/jarvis/apps/desktop/src/renderer/hooks/useAudioRecorder.ts` — MediaRecorder+webm pattern for PTT
- `/root/jarvis/apps/desktop/src/renderer/components/Orb/Orb.tsx` — existing drop-shadow + gradient + animation classes
- `/root/jarvis/.planning/PROJECT.md` — wake word is a v1.3 regression reimplementation, Mac/Linux deferred
- `/root/jarvis/CLAUDE.md` — explicit Porcupine ban, privacy-first constraint

---
*Pitfalls research for: Electron/TypeScript desktop assistant — wake word + UX polish (JARVIS v1.4)*
*Researched: 2026-04-11*
