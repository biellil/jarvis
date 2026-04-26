# Pitfalls Research: Voice Capture Mode Switching (v1.9 Milestone)

**Domain:** Multi-mode voice capture in Electron desktop assistant (Wake Word + Always-Listening + PTT-only)
**Researched:** 2026-04-25
**Confidence:** MEDIUM-HIGH (field-tested patterns + Electron docs + VAD/LLM research)

---

## Critical Pitfalls

### Pitfall 1: VAD Threshold Miscalibration — Unusable Always-Listening Mode

**What goes wrong:**
- Threshold too low (≤0.3): VAD triggers on breathing, keyboard clicks, AC noise, or user clearing throat → bot interrupts mid-sentence or constantly starts processing
- Threshold too high (≥0.8): VAD misses entire speech segments, requires shouting or clear enunciation → user frustration, mode feels broken
- No adaptive calibration: Static threshold fails in quiet office vs. noisy kitchen → one mode works, other doesn't

**Why it happens:**
- VAD is not binary speech/silence; it's a probabilistic score (0–1) that requires tuning for environment and speaker
- Developers often use library defaults without testing in actual deployment environments
- Async feedback loop: user says something → VAD triggers → classifier says "not intent" → user says again → VAD threshold adjusted → now triggers on breathing
- Portuguese-language models may have different optimal thresholds than English-trained VAD engines

**How to avoid:**
1. **Make VAD threshold configurable via Settings UI** (not just .env):
   - Range: 0.4–0.7, default 0.5
   - Real-time preview: mic test mode shows VAD state (listening/not listening) with current threshold
   - Persist via electron-store: `settings.vad_threshold`

2. **Implement environment-aware defaults**:
   ```typescript
   const vadThreshold = settings.vad_threshold ?? 
     (isTesting ? 0.7 : isQuietHour() ? 0.6 : 0.5);
   ```

3. **Log VAD events with confidence scores** (for debugging):
   ```typescript
   voiceHandler.on('vad-frame', (score: number, threshold: number) => {
     if (score !== lastScore) {
       log.debug(`VAD: ${score.toFixed(2)} vs threshold ${threshold.toFixed(2)}`);
     }
   });
   ```

4. **Test in 3 acoustic environments** before shipping: quiet office, home kitchen, outdoor wind noise

5. **Silero VAD specifically**: Use `silero_vad.js` with post-processing smoothing (0.5–1s moving average) to avoid frame-by-frame jitter

**Warning signs:**
- User complains: "It keeps interrupting me" or "It never listens"
- Server logs show intent classifier getting fragments like "Ye—" or "—s" (clipped speech)
- Debug logs: VAD transitioning between speech/silence 50+ times per 10s window

**Phase to address:** Phase 39 (Always-Listening foundation) — must be validated with human testing

---

### Pitfall 2: Audio Buffer Memory Leak in Always-Listening Mode

**What goes wrong:**
- Audio ringbuffer never deallocates old frames (append-only, no circular drain)
- ~16kHz mono WAV = 32KB/sec → 1 hour always-listening = 115MB unbounded growth
- After 4–8 hours, process hits memory ceiling → hangs, crashes, or forces restart
- Electron Chromium's MediaRecorder has known leaks depending on codec (AV1: crash ~1hr, VP9: crash ~1.5hrs)

**Why it happens:**
- Easy to write: `audioBuffer.push(frame)` without corresponding `.shift()` or ringbuffer wrap
- Developers test MVP with 5–10 minute sessions, never see leak in development
- Async audio pipeline makes ownership unclear: who owns each chunk? When is it safe to free?
- MediaRecorder lifecycle not properly cleaned up on mode switch (still recording in background)

**How to avoid:**
1. **Use explicit ringbuffer pattern** (not dynamic array):
   ```typescript
   class AudioRingBuffer {
     private buffer = new Float32Array(CAPACITY); // Fixed size
     private writeHead = 0;
     private readHead = 0;
     
     write(frames: Float32Array): void {
       for (let i = 0; i < frames.length; i++) {
         this.buffer[this.writeHead] = frames[i];
         this.writeHead = (this.writeHead + 1) % CAPACITY;
         if (this.writeHead === this.readHead) {
           this.readHead = (this.readHead + 1) % CAPACITY; // Drop oldest
         }
       }
     }
   }
   ```

2. **Stop MediaRecorder on mode switch explicitly**:
   ```typescript
   async switchMode(newMode: VoiceMode): Promise<void> {
     if (this.mediaRecorder?.state !== 'inactive') {
       this.mediaRecorder.stop();
       await new Promise(resolve => {
         this.mediaRecorder.ondataavailable = () => resolve(undefined);
       });
     }
     // Wait one microtask for cleanup
     await new Promise(resolve => setTimeout(resolve, 0));
     // Now safe to start new mode
   }
   ```

3. **Monitor heap usage in dev console**:
   ```typescript
   setInterval(() => {
     const heap = (performance as any).memory?.usedJSHeapSize ?? 0;
     if (heap > HEAP_WARNING_THRESHOLD) {
       log.warn(`Heap high: ${(heap / 1e6).toFixed(1)}MB, audio buffer may be leaking`);
     }
   }, 30000);
   ```

4. **Test sustained mode**: Run always-listening for 8+ hours, check heap growth
   - Expected: flat after 30s (equilibrium)
   - Bad: steady 2–5MB/min growth

5. **Chromium codec workaround**: Use VP8 instead of VP9/AV1 if available (fewer Electron leaks)

**Warning signs:**
- Desktop widget becomes sluggish after 2–3 hours continuous use
- Heap snapshot shows `WaveAudioFifo` or `AudioBuffer` objects accumulating
- Process kills itself or system memory warnings appear

**Phase to address:** Phase 39 (Always-Listening implementation) — test with 12-hour soak test before shipping

---

### Pitfall 3: Intent Classifier Cold Start Latency Breaks UX

**What goes wrong:**
- First always-listening utterance gets VAD → LLM intent classifier invoked → model loads from disk (50–300ms on SSD, up to 2s on HDD) → STT starts late → user's speech partially missed or clipped
- Subsequent calls fast (~100ms), but first call is terrible
- User perceives: "It didn't hear the start of my sentence"
- Worse: classifier is too slow (>1s), so by time classifier decides "intent present," utterance is already complete or dropped

**Why it happens:**
- Lazy loading is convenient: `await loadModel()` on first call
- No one tests the cold path in dev; models are cached after first load
- If using cloud LLM (Claude, OpenAI) + PTT overlay → network latency + model latency stack

**How to avoid:**
1. **Eager load classifier on app startup** (or at mode switch to always-listening):
   ```typescript
   async loadIntentClassifier(): Promise<void> {
     // Load once at startup, not on first utterance
     try {
       this.classifier = await pipeline('zero-shot-classification', {
         model: 'Xenova/mobilebert-base-uncased-finetuned-clinc', // or local)
       });
       log.info('Intent classifier loaded');
     } catch (err) {
       log.warn('Intent classifier failed to load, disabling always-listening', { err });
       this.disableAlwaysListening();
     }
   }
   
   // In voiceHandler.ts:
   async onAppReady() {
     await this.loadIntentClassifier();
   }
   ```

2. **Measure latency of classifier inference**:
   ```typescript
   const t0 = performance.now();
   const result = await this.classifier('user said something', ['greeting', 'question', 'idle']);
   const latency = performance.now() - t0;
   log.debug(`Intent classification: ${latency.toFixed(0)}ms`);
   ```

3. **Fallback if classifier is slow**: If latency > 300ms, bypass classifier on that utterance:
   ```typescript
   const classifyStart = performance.now();
   const intentResult = await Promise.race([
     this.classifier(utterance, INTENTS),
     new Promise((_, reject) =>
       setTimeout(() => reject(new Error('Classifier timeout')), 300)
     ),
   ]).catch(() => {
     log.warn('Intent classifier timed out, processing utterance anyway');
     return { labels: ['unknown'], scores: [0] }; // Default: process anyway
   });
   ```

4. **Profile model load time**:
   - Local model (Transformers.js): 50–200ms on modern CPU after warm start
   - Cloud model (Claude): 100–300ms + network round-trip
   - Quantized model: 20–50ms (if available)

5. **For pt-BR models**: Check if model has explicit Portuguese support:
   - Xenova/mobilebert only English, so quantize/distill first or use larger multilingual model
   - GlórIA/AMALIA (pt-BR) may have better accuracy but slower cold start

**Warning signs:**
- First utterance in always-listening mode gets partial transcription ("just heard 'the' not 'the meeting'")
- Timing logs show 500ms+ between VAD trigger and STT start
- User report: "I have to repeat myself on the first sentence"

**Phase to address:** Phase 39 (Always-Listening implementation) — benchmark cold start during phase validation

---

### Pitfall 4: Mode Switch Race Condition — Broken State

**What goes wrong:**
- User clicks "Always-Listening" in tray menu
- App switches state in renderer, but main process is mid-capture in PTT
- Mode switch IPC message arrives while `sendAudioAndHandle()` is processing
- Result: PTT handler tries to cleanup audio stream that's being switched to wake-word cleanup → both attempt cleanup → double-free or hung process
- Or: state gets stuck between modes (tray shows "PTT" but code thinks "Wake Word")

**Why it happens:**
- Mode switching is synchronous in UI (user clicks), but audio pipeline is async (several operations queued)
- No guard against concurrent mode transitions
- electron-store writes to disk async, so state in-memory differs from persisted state after restart

**How to avoid:**
1. **Use a state machine with strict transition guards**:
   ```typescript
   type VoiceMode = 'wake-word' | 'always-listening' | 'ptt-only';
   type ModeState = {
     current: VoiceMode;
     transitioning: boolean;
     lastSwitch: number;
   };
   
   async switchMode(newMode: VoiceMode): Promise<void> {
     if (this.state.transitioning) {
       throw new Error(`Mode switch in progress, ignoring ${newMode}`);
     }
     if (this.state.current === newMode) {
       log.debug(`Already in ${newMode}, skipping`);
       return;
     }
     
     this.state.transitioning = true;
     try {
       // 1. Stop current mode (blocking)
       await this.stopCurrentMode();
       // 2. Clean up resources
       await new Promise(resolve => setTimeout(resolve, 10)); // Yield
       // 3. Start new mode
       await this.startMode(newMode);
       this.state.current = newMode;
       // 4. Persist atomically
       this.settings.save({ voiceMode: newMode });
     } finally {
       this.state.transitioning = false;
     }
   }
   ```

2. **Debounce rapid mode switches** (user clicks twice):
   ```typescript
   private modeSwitchTimeout: NodeJS.Timeout | null = null;
   
   requestModeSwitch(newMode: VoiceMode): void {
     if (this.modeSwitchTimeout) clearTimeout(this.modeSwitchTimeout);
     this.modeSwitchTimeout = setTimeout(() => {
       this.switchMode(newMode).catch(err => log.error('Mode switch failed', { err }));
     }, 100); // Batch rapid clicks
   }
   ```

3. **Guard audio operations against mode changes**:
   ```typescript
   async sendAudioAndHandle(audio: Buffer): Promise<void> {
     const modeAtStart = this.state.current;
     // ... STT, LLM, TTS pipeline ...
     
     // Before playing TTS, verify mode hasn't changed
     if (this.state.current !== modeAtStart) {
       log.warn('Mode switched mid-pipeline, aborting TTS playback');
       return;
     }
     await tts.play(response);
   }
   ```

4. **electron-store consistency check on startup**:
   ```typescript
   const storedMode = this.settings.get('voiceMode') as VoiceMode | undefined;
   if (!['wake-word', 'always-listening', 'ptt-only'].includes(storedMode ?? '')) {
     log.warn(`Invalid stored mode ${storedMode}, resetting to wake-word`);
     this.settings.set('voiceMode', 'wake-word');
   }
   ```

5. **IPC handler for mode switch** (main process):
   ```typescript
   ipcMain.handle('voice-mode:switch', async (_, mode: VoiceMode) => {
     try {
       await voiceManager.switchMode(mode);
       return { success: true };
     } catch (err) {
       log.error('Mode switch IPC failed', { err });
       return { success: false, error: (err as Error).message };
     }
   });
   ```

**Warning signs:**
- Tray menu shows "Always-Listening" but app is still in wake-word mode
- Switching modes causes widget to hang for 2–5 seconds
- After rapid mode switching, wake word stops working (resource not released)
- Heap snapshot shows dangling audio stream handles

**Phase to address:** Phase 39 (Mode switching foundation) — must pass race condition test suite

---

### Pitfall 5: Intent Classifier Language Bias — Responds to Wrong Things

**What goes wrong:**
- Classifier trained on English-only data (typical for open-source models)
- User speaks Portuguese (pt-BR): "ei JARVIS" (informal greeting)
- Model doesn't recognize it as intent → always-listening mode stays silent → mode feels broken
- Or: common pt-BR phrases get high scores by accident, classifier triggers on "tá bom" (okay) or "oi" (hi) at end of neighbor's conversation

**Why it happens:**
- Developers default to English models without considering language
- pt-BR training data is ~1% of English in typical LLM datasets (GlórIA/AMALIA only recent)
- Zero-shot classifiers extrapolate poorly to out-of-distribution languages
- No validation that classifier works in actual usage language

**How to avoid:**
1. **Use language-aware classifier explicitly**:
   ```typescript
   const INTENT_LABELS = [
     'greeting', 'question', 'command', 'confirmation', 'idle'
   ];
   const INTENT_EXAMPLES = {
     'greeting': ['oi', 'olá', 'ei', 'e aí', 'como vai'],
     'question': ['qual é', 'como', 'por que', 'quando', 'onde'],
     'command': ['abre', 'fecha', 'liga', 'desliga', 'reproduz'],
     'confirmation': ['sim', 'tá bom', 'certo', 'ok'],
     'idle': ['tá', 'uh', 'hmm', 'deixa aí'],
   };
   
   // Use hypothesis-based zero-shot, not label-only
   const result = await classifier(utterance, INTENT_EXAMPLES);
   ```

2. **Pre-filter on STT confidence**:
   ```typescript
   const transcript = await whisper.transcribe(audio);
   
   if (transcript.confidence < 0.7) {
     log.debug(`STT confidence ${transcript.confidence} < 0.7, ignoring`);
     return; // Skip intent classifier if transcription unclear
   }
   ```

3. **Fallback to simpler keyword match if model unavailable**:
   ```typescript
   const simpleIntentDetector = (text: string): boolean => {
     const keywords = ['oi', 'olá', 'ei', 'abre', 'fecha', 'liga', 'desliga'];
     return keywords.some(kw => text.toLowerCase().includes(kw));
   };
   
   const hasIntent = modelAvailable 
     ? (await classifier(...)).scores[0] > 0.5
     : simpleIntentDetector(transcript);
   ```

4. **Log classification results for debugging**:
   ```typescript
   log.debug('Intent classification', {
     transcript,
     topLabel: result.labels[0],
     score: result.scores[0],
     language: 'pt-BR',
   });
   ```

5. **Test with native Portuguese speakers** before shipping (not just dev team)

**Warning signs:**
- Always-listening mode activates on random background chatter (neighbor, TV)
- Never activates on valid user intent because pt-BR phrasing is out-of-distribution
- Server logs: classifier scores all below 0.3 for actual user utterances

**Phase to address:** Phase 39 (Always-Listening intent classifier) — validation with pt-BR test suite mandatory

---

### Pitfall 6: Electron Microphone Permission Caching — macOS Always-Listening Blocked

**What goes wrong:**
- User denies microphone permission when JARVIS first launches on macOS
- Later, user grants permission in System Settings → Microphone
- JARVIS tries always-listening mode, but Chromium still has cached "denied" → no audio stream
- Or: macOS Sonoma/Sequoia permission dialog appears repeatedly even after granting, if handler is incorrect

**Why it happens:**
- Electron's `session.setPermissionRequestHandler()` is called once at startup
- macOS caches permissions at app-identity level; Electron doesn't refresh without explicit re-check
- `systemPreferences.askForMediaAccess()` is async but not awaited in some codepaths

**How to avoid:**
1. **Explicit permission check before always-listening mode**:
   ```typescript
   import { systemPreferences } from 'electron';
   
   async ensureMicrophonePermission(): Promise<boolean> {
     if (process.platform !== 'darwin') return true; // Linux/Windows don't need this
     
     const status = await systemPreferences.getMediaAccessStatus('microphone');
     if (status === 'granted') return true;
     
     if (status === 'denied') {
       log.warn('Microphone permission denied by user');
       return false;
     }
     
     if (status === 'prompt') {
       const granted = await systemPreferences.askForMediaAccess('microphone');
       return granted;
     }
     
     return false;
   }
   ```

2. **Check permission at mode-switch time** (not just startup):
   ```typescript
   async switchMode(newMode: VoiceMode): Promise<void> {
     if (newMode === 'always-listening' && process.platform === 'darwin') {
       const hasPermission = await this.ensureMicrophonePermission();
       if (!hasPermission) {
         log.error('Cannot switch to always-listening: no microphone permission');
         return; // Revert mode switch
       }
     }
     // ... proceed with mode switch ...
   }
   ```

3. **Handle permission handler in main**:
   ```typescript
   session.defaultSession.setPermissionRequestHandler(
     (webContents, permission, callback) => {
       if (permission === 'media') {
         callback(true);
       } else {
         callback(false);
       }
     }
   );
   ```

4. **Set Info.plist keys for macOS**:
   ```xml
   <key>NSMicrophoneUsageDescription</key>
   <string>JARVIS needs microphone access for voice commands in always-listening mode.</string>
   <key>NSLocalNetworkUsageDescription</key>
   <string>JARVIS may communicate with local LM Studio instance.</string>
   ```

5. **Test on macOS Sonoma/Sequoia**:
   - Deny permission on first launch
   - Grant permission in System Settings
   - Verify always-listening mode works immediately after (no app restart needed)

**Warning signs:**
- macOS users report "always-listening mode does nothing" after permission denial
- Permission prompt appears multiple times even after granting
- Audio stream fails silently (no error, just no audio data)

**Phase to address:** Phase 40 (Always-Listening cross-platform hardening)

---

## Moderate Pitfalls

### Pitfall 7: PTT Hotkey Conflict with System Shortcuts

**What goes wrong:**
- User configures PTT hotkey as Ctrl+Shift+J (legacy v1.7 default)
- macOS has Cmd+Shift+J for some system function → app never receives hotkey event
- Or: Linux X11 window manager owns Ctrl+Shift+J for workspace switch → app sees 0 hotkey presses

**Why it happens:**
- Electron `globalShortcut.register()` can fail silently if system owns the key
- No feedback to user when registration fails
- Platform differences: macOS Command vs. Control, Linux varies by WM (i3, Openbox, GNOME)

**How to avoid:**
1. **Check registration success**:
   ```typescript
   const success = globalShortcut.register(hotkey, () => {
     handlePTTHotkey();
   });
   
   if (!success) {
     log.error(`Failed to register hotkey ${hotkey}, system may own this key`);
     this.showToast(`Hotkey ${hotkey} unavailable. Check System Preferences.`);
   }
   ```

2. **Provide conflict detection UI in Settings**:
   ```typescript
   async testHotkey(key: string): Promise<{ available: boolean; reason?: string }> {
     const test = globalShortcut.register(`test-${Date.now()}`, () => {});
     if (!test) {
       return { available: false, reason: 'System owns this key' };
     }
     globalShortcut.unregister(`test-${Date.now()}`);
     return { available: true };
   }
   ```

3. **Suggest safe defaults by platform**:
   ```typescript
   const suggestedHotkeys = {
     darwin: 'Cmd+Shift+Space', // Less likely to conflict
     linux: 'Ctrl+Alt+V',       // Unused on most WMs
     win32: 'Ctrl+Shift+J',     // Default
   };
   ```

**Warning signs:**
- User reports "hotkey does nothing" on specific platform
- Debug logs show `globalShortcut.register()` returning false
- Works on dev machine (Windows) but not user's macOS

**Phase to address:** Phase 39 (Mode switching) — validate hotkey availability on all platforms

---

### Pitfall 8: Tray Menu Radio Button State Out of Sync

**What goes wrong:**
- User clicks "Always-Listening" radio button in tray menu
- Mode switches successfully
- User clicks tray again → radio shows "Wake Word" is selected (stale UI)
- Or: on Linux, setContextMenu() changes don't appear until user clicks tray again

**Why it happens:**
- Tray menu is a static object created at app startup
- IPC updates mode state in main process, but menu template doesn't know to refresh
- Linux tray requires explicit `setContextMenu()` call after state change (different from macOS/Windows)

**How to avoid:**
1. **Rebuild menu after mode switch** (all platforms):
   ```typescript
   function buildVoiceModeMenu(current: VoiceMode): MenuItemConstructorOptions[] {
     return [
       {
         label: 'Voice Mode',
         submenu: [
           { label: 'Wake Word', type: 'radio', checked: current === 'wake-word', click: () => switchMode('wake-word') },
           { label: 'Always-Listening', type: 'radio', checked: current === 'always-listening', click: () => switchMode('always-listening') },
           { label: 'PTT Only', type: 'radio', checked: current === 'ptt-only', click: () => switchMode('ptt-only') },
         ],
       },
       // ... other menu items ...
     ];
   }
   
   async switchMode(newMode: VoiceMode): Promise<void> {
     // ... mode switch logic ...
     
     // Update menu after successful switch
     const menu = Menu.buildFromTemplate(buildVoiceModeMenu(newMode));
     tray.setContextMenu(menu);
   }
   ```

2. **Platform-specific menu updates for Linux**:
   ```typescript
   if (process.platform === 'linux') {
     // Linux app indicator needs explicit rebuild
     tray.setContextMenu(Menu.buildFromTemplate(buildVoiceModeMenu(newMode)));
   }
   // macOS/Windows will update automatically in newer Electron versions
   ```

3. **Store mode in renderer and sync** (React state):
   ```typescript
   const [voiceMode, setVoiceMode] = useState<VoiceMode>('wake-word');
   
   const handleModeChange = async (newMode: VoiceMode) => {
     const result = await ipcRenderer.invoke('voice-mode:switch', newMode);
     if (result.success) {
       setVoiceMode(newMode);
       // Trigger main process to update menu
       ipcRenderer.send('voice-mode:sync-menu', newMode);
     }
   };
   ```

4. **Test on all platforms** (specific to Linux with GNOME/KDE)

**Warning signs:**
- Tray menu radio buttons don't reflect actual mode after switch
- Linux users see stale menu until clicking tray twice

**Phase to address:** Phase 40 (Cross-platform polish) — Linux tray test mandatory

---

### Pitfall 9: Config Migration on Update — Users Stuck in Old Mode

**What goes wrong:**
- User on v1.8 (no voiceMode config, defaults to wake-word)
- Updates to v1.9
- App reads `settings.voiceMode` → undefined → crashes or hangs
- Or: app silently fails mode detection, always uses wake-word but user thought they had PTT-only

**Why it happens:**
- electron-store doesn't version configs
- No migration logic for new fields
- Assumption: "field always exists" breaks on first-run-after-update

**How to avoid:**
1. **Versioned config with migration**:
   ```typescript
   const CONFIG_VERSION = 2;
   
   type ConfigV1 = { hotkey: string; ttsProvider: string; };
   type ConfigV2 = { hotkey: string; ttsProvider: string; voiceMode: VoiceMode; };
   
   async loadAndMigrateConfig(): Promise<ConfigV2> {
     const stored = this.store.get('config');
     const version = this.store.get('configVersion') ?? 1;
     
     if (version === 1) {
       const v1 = stored as ConfigV1;
       const v2: ConfigV2 = {
         ...v1,
         voiceMode: 'wake-word', // Default for old configs
       };
       this.store.set('config', v2);
       this.store.set('configVersion', 2);
       log.info('Migrated config from v1 to v2, defaulting to wake-word mode');
       return v2;
     }
     return stored as ConfigV2;
   }
   ```

2. **Provide fallback on missing fields**:
   ```typescript
   const voiceMode = settings.voiceMode ?? 'wake-word';
   const hotkey = settings.hotkey ?? 'Ctrl+Shift+J';
   ```

3. **Log migration on first run after update**:
   ```typescript
   if (this.store.get('appVersion') !== APP_VERSION) {
     log.info('First run after update', {
       from: this.store.get('appVersion'),
       to: APP_VERSION,
     });
     this.store.set('appVersion', APP_VERSION);
     await this.migrateOldConfigs();
   }
   ```

4. **Test upgrade path**: v1.8 → v1.9 with existing config

**Warning signs:**
- User upgrades app, widget crashes on startup
- No error in logs (config reads succeed but value is undefined)
- Tray menu shows wrong mode after update

**Phase to address:** Phase 39 (Config persistence) — migration test required before shipping

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| VAD threshold hardcoded | MVP faster, no settings UI | Breaks in real environments, user can't fix | Never — make configurable from day 1 |
| Audio buffer as array (push/pop) | Simple code | Memory leak after hours, crashes | Never — use ringbuffer immediately |
| Load intent classifier on first call | Fewer startup checks | First utterance clipped, UX bad | Only if classified as "lazy mode" explicitly |
| Mode switch without state guard | Quick to code | Race conditions, hung process | Never — cost of race condition > cost of guard |
| Single intent classifier model | Simpler deployment | Broken for pt-BR, user complaints | Only if you own testing burden of poor UX |
| No permission check on macOS | Assume granted | Users can't use always-listening | Never — check before switch |
| Tray menu built once at startup | Fewer updates | Stale radio buttons on Linux | Never — rebuild on mode change |
| No config migration | Fewer lines of code | Users blocked on update | Never — cost > 1 hour migration code |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Electron IPC + audio chunks** | Send raw audio buffer over IPC (hits size limits ~128MB, unpredictable) | Batch small frames (4–10ms) into 500ms chunks, send via `postMessage()` with `Transferable`, not IPC |
| **electron-store + multi-window** | Assume one store per app, write without debounce | Sync via main process, emit IPC events to all windows, debounce writes (100ms) |
| **VAD + always-listening** | Feed entire audio stream to VAD, get boolean result | Use Silero VAD with frame-by-frame processing (20–30ms frames), smooth scores over time |
| **LLM classifier + fast mode switch** | Start classification, switch modes before result → process wrong audio | Cancel in-flight classifier requests on mode switch: `AbortController` with cleanup |
| **Tray menu + state sync** | Update state in renderer, assume tray will know → stale UI | Rebuild menu from main process after state change, emit IPC to trigger rebuilds |
| **macOS permissions + always-listening** | Call `askForMediaAccess()` once at startup, cache result → fails after user changes System Settings | Re-check permission every mode switch or on app wake from sleep |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **VAD running at full audio rate (16kHz)** | CPU 2–5% idle, 15%+ when VAD active | Downsample to 8kHz or process 20–30ms frames batched, not per-sample | Always-listening 8+ hours, multicore CPU shows one core pegged at 100% |
| **Intent classifier inference on every VAD trigger** | 100ms pause per utterance, classifier called 50x/session | Only classify on VAD "speech ended" event, not continuously | 1–2 hour session, cumulative 5+ seconds delay |
| **Audio ringbuffer not bounded** | Memory growth 2–5MB/min, crash after 2–4 hours | Use fixed-size circular buffer, drop oldest on overflow | 24/7 usage or always-listening mode >4 hours |
| **IPC message batching (every frame over IPC)** | Main thread blocked, UI hangs every 10–20ms | Batch 10–50 frames (100–500ms) before IPC send | Always-listening mode with high-latency backend (cloud LLM) |
| **Mode switch cleanup not yielding** | Mode change IPC returns immediately, old audio handler still running → state corrupted | Yield with `setTimeout(..., 0)` after cleanup, await promises | Back-to-back mode switches within 200ms |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Audio persisted to disk in debug logs** | Voice conversations saved unencrypted; privacy violation | Strip audio from logs: `log.debug('audio', { length: data.length, NOT data })`, never dump raw buffers |
| **Intent classifier cloud fallback without privacy check** | User preferences: "always local" → system sends audio to OpenAI/Claude anyway | Fail hard if local classifier unavailable in privacy mode: `if (isPrivacyMode && !hasLocalClassifier) throw new Error('...')` |
| **Microphone stream left open on mode switch** | Stream persists in background, user thinks always-listening is off but it's still running | Explicitly close all handles: `stream.getTracks().forEach(t => t.stop())` before mode switch |
| **electron-store readable by other processes** | Settings file in plain JSON, contains API keys if user copies config | Use OS credential stores (Keychain/Credential Manager) for secrets, never electron-store |
| **Mode switch without user acknowledgment** | Tray click → mode changes without confirmation → always-listening silently active | Add toast notification: "Switched to Always-Listening mode" so user knows |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **VAD threshold not tunable** | User says "it never listens" or "it interrupts me", can't fix it | Settings UI slider with live preview (mic test mode shows whether VAD triggers on current environment) |
| **Mode switch with no visual feedback** | User clicks tray, doesn't know if change took effect or is still processing | Toast notification on every mode switch: "Now using Always-Listening mode" |
| **Cold start latency on first utterance** | First sentence gets clipped, user has to repeat → frustration | Pre-load classifier on app start, show in debug console: "Classifier ready" |
| **Always-listening triggers on background noise** | User hears bot respond to TV or neighbor → distrust, mode disabled | Explain threshold in Settings: "Higher threshold = fewer false alarms but may miss quiet speech" |
| **Config migration on update, no feedback** | User upgrades, voice mode resets to default, no explanation | Log "Config migrated to new version, voice mode defaulted to Wake-Word" as toast |
| **macOS permission denial, no recovery path** | Always-listening "doesn't work", user doesn't know why → blames app | Show actionable error: "To enable Always-Listening: System Settings → Privacy → Microphone → [Allow JARVIS]" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Always-Listening mode:** Verify VAD works in 3 acoustic environments (quiet office, kitchen, outdoor wind) — not just dev setup
- [ ] **Always-Listening mode:** Test for memory leak with 8+ hour soak test — check heap doesn't grow >10MB
- [ ] **Intent classifier:** Measure cold start latency <300ms, or implement fallback if slower
- [ ] **Intent classifier:** Test with Portuguese speakers (pt-BR) to verify accuracy — not just English
- [ ] **Mode switching:** Test rapid clicks (5x in 1 second) — verify no hangs, state consistent
- [ ] **Mode switching:** Test switching while audio is being captured — verify no double-free or resource leaks
- [ ] **PTT hotkey:** Test on macOS, Linux, Windows that hotkey works and doesn't conflict with system shortcuts
- [ ] **Tray menu:** On Linux, click tray after mode switch, verify radio button reflects actual mode (not stale)
- [ ] **Config migration:** Upgrade from v1.8 to v1.9 with existing config — app shouldn't crash, mode defaults correctly
- [ ] **Permissions (macOS):** Deny microphone on first launch, grant in System Settings, verify always-listening works without app restart
- [ ] **Electron IPC:** Measure audio chunk payload size — verify <128MB limit with batching strategy

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **VAD threshold wrong, always-listening unusable** | LOW | 1. Roll back to wake-word mode 2. Add Settings UI for threshold 3. Let user tune 4. Re-test |
| **Memory leak detected after 4 hours** | MEDIUM | 1. Emergency: disable always-listening 2. Implement ringbuffer fix 3. Stress-test 8h 4. Patch release |
| **Intent classifier too slow, utterances clipped** | MEDIUM | 1. Pre-load classifier on startup 2. Add timeout/fallback 3. Benchmark cold start 4. Consider quantized model |
| **Mode switch race condition crashes app** | HIGH | 1. Roll back mode-switching feature 2. Implement state machine guards + tests 3. Add race condition test suite 4. Re-enable |
| **Intent classifier broken for pt-BR** | MEDIUM | 1. Detect language at runtime 2. Fall back to keyword matching for pt-BR 3. Source multilingual model (AMALIA) 4. Validate with native speakers |
| **macOS always-listening blocked by permission** | LOW | 1. Check permission before mode switch 2. Show actionable error message 3. Link to System Settings 4. Retry after permission granted |
| **Tray menu stale on Linux** | LOW | 1. Rebuild menu after mode change 2. Test on GNOME + KDE 3. Explicit setContextMenu() call |
| **Config migration fails on update** | LOW | 1. Detect version mismatch 2. Implement migration 3. Default to safe mode (wake-word) 4. Log for debugging |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| VAD threshold miscalibration | Phase 39 (Always-Listening foundation) | 3-environment acoustic test + human feedback |
| Audio buffer memory leak | Phase 39 (Always-Listening implementation) | 8-hour soak test, heap flat after 30s |
| Intent classifier cold start | Phase 39 (Classifier integration) | <300ms latency measurement, fallback implemented |
| Mode switch race condition | Phase 39 (Mode switching) | 5x rapid clicks, no hangs, state consistent |
| Intent classifier language bias | Phase 39 (pt-BR validation) | Test with native Portuguese speakers, 5+ utterances |
| macOS permission caching | Phase 40 (Cross-platform hardening) | Permission denied → granted → always-listening works |
| PTT hotkey conflicts | Phase 39 (Mode switching) | All platforms (macOS, Linux, Windows) hotkey active |
| Tray menu state sync | Phase 40 (Polish) | Linux tray updates after mode switch, radio correct |
| Config migration | Phase 39 (Persistence) | v1.8 → v1.9 upgrade, no crash, defaults correct |
| Intent classifier + cloud fallback | Phase 40 (Privacy hardening) | Privacy mode enforces local-only, fails if unavailable |

---

## Sources

- [Electron Tray API Documentation](https://www.electronjs.org/docs/latest/api/tray) — radio button support and platform quirks
- [Picovoice: VAD 2026 Guide](https://picovoice.ai/blog/complete-guide-voice-activity-detection-vad/) — threshold configuration and tradeoffs
- [Choosing Best VAD 2026](https://picovoice.ai/blog/best-voice-activity-detection-vad/) — Cobra vs Silero performance metrics at 5% FPR
- [OpenAI VAD Documentation](https://developers.openai.com/api/docs/guides/realtime-vad) — real-time VAD thresholds (0.5 vs 0.8)
- [NVIDIA Cold Start Latency](https://developer.nvidia.com/blog/reducing-cold-start-latency-for-llm-inference-with-nvidia-runai-model-streamer/) — LLM load time mitigation
- [LLM Latency Benchmark 2026](https://research.aimultiple.com/llm-latency-benchmark/) — local model inference times
- [Electron GitHub Issue #41123](https://github.com/electron/electron/issues/41123) — MediaRecorder memory leaks by codec
- [Electron GitHub Issue #17640](https://github.com/electron/electron/issues/17640) — macOS camera/microphone permissions post-signing
- [Syncing State in Electron (Bruno Scheufler)](https://brunoscheufler.com/blog/2023-10-29-syncing-state-between-electron-contexts) — race condition patterns and solutions
- [electron-store GitHub](https://github.com/sindresorhus/electron-store) — configuration persistence and file watching limitations
- [Audio Buffer + Real-time Voice Processing (Sonarworks)](https://www.sonarworks.com/blog/learn/buffer-settings-and-latency-management-for-ai-voice-production) — latency sources in voice pipeline
- [Voice Activity Detection Noisy Environments (ArXiv 2312.05815)](https://arxiv.org/html/2312.05815v1) — false positive/negative tradeoffs
- [GlórIA: Portuguese LLM (ArXiv 2402.12969)](https://arxiv.org/html/2402.12969v1) — Portuguese model limitations and biases
- [AMALIA: pt-PT/pt-BR LLM (ArXiv 2603.26511)](https://arxiv.org/html/2603.26511v1) — European Portuguese underrepresentation
- [VoiceBench: LLM Voice Assistants (MIT Press TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/TACL.a.628/136245/VoiceBench-Benchmarking-LLM-Based-Voice-Assistants) — voice assistant bias metrics across languages
- [Deepgram "Olá" Portuguese STT (2026)](https://deepgram.com/learn/ola-enhanced-portuguese-beta-speech-to-text-language-model-now-available) — pt-BR specific speech recognition advances

---

**Pitfalls research for:** Voice capture modes (Wake Word + Always-Listening + PTT-only) in Electron desktop assistant  
**Researched:** 2026-04-25  
**Confidence:** MEDIUM-HIGH (field-tested patterns, Electron docs, VAD/LLM research, pt-BR language considerations)
