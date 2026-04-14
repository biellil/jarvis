# Domain Pitfalls: Adding whisper.cpp with GPU to Electron

**Domain:** Local voice pipeline (whisper.cpp + TTS) in existing Electron + Node.js TypeScript app
**Researched:** 2026-04-13
**Project Context:** JARVIS v1.6 — Migrating STT/TTS from backend-ts Docker to Electron with cross-vendor GPU
**Overall Confidence:** HIGH on ASAR/code-signing and GPU fallback (verified against Electron docs + whisper.cpp GitHub). MEDIUM on sendAudioAndHandle refactoring (general SE practices applied to JARVIS). Audio format verified via nodejs-whisper docs.

---

## Critical Pitfalls

### Pitfall 1: Native Module ASAR Packing & Code Signing Breakage

**What goes wrong:**
- whisper.cpp Node.js bindings (.node files) are packed into ASAR archive by default
- When ASAR packed, native modules must unpack to temp directory at runtime — slow, breaks code signatures on macOS, triggers virus scanner false positives on Windows
- On macOS: Code signature becomes invalid after app.asar modified during signing, app fails to launch on other machines with "Code signature not valid"
- On Windows: ASAR integrity validation (Electron 30+) can be exploited if .node file modified after signing
- Electron code signing doesn't automatically handle app.asar.unpacked/ — requires manual signing of unpacked natives on macOS

**Why it happens:**
- whisper.cpp bindings are precompiled .node files specific to each platform/architecture (x64, arm64, arm32)
- Electron doesn't know native modules need special handling unless explicitly configured
- electron-builder auto-unpack-natives plugin not enabled by default
- Most tutorials assume only framework code in ASAR, not binary dependencies

**Consequences:**
- **macOS:** App fails to launch with "Code Signature Invalid" error; users see "App is damaged and can't be opened"
- **Windows:** Native modules work in dev (unsigned) but distribution via ASAR integrity validation fails
- **All platforms:** First-run performance hit unpacking .node files from archive to temp directory
- **Code signing workflow:** Entire signing process must be re-run after code signing if ASAR changes; CI/CD pipeline breaks

**Prevention:**
1. Enable electron-forge auto-unpack-natives plugin in forge.config.ts
2. Explicit asar.unpack configuration to unpack all .node files and whisper models
3. Code signing order (macOS): Build ASAR → Unpack natives → Sign unpacked binaries → Sign entire app
4. Use electron-builder signing hooks to automate the code signing workflow
5. Test matrix: Always test packaged build on each platform before shipping (macOS code signature verification, Windows signing enabled, Linux binary linking)
6. CI/CD: Build binaries for target architecture only; don't cross-compile .node files

**Detection:**
- macOS: App crashes on launch with console error "App is damaged"
- Windows: Native module fails with cryptic error like NOOPEN_ERROR or DLL not found
- All: Whisper function call throws "Module not found" or "Binding not loaded" after packaging
- Add preload.ts check to verify whisper module loads successfully before app ready event

**Phase:** P1 (immediate) — ASAR packing must be configured before ANY native module code lands

---

### Pitfall 2: GPU Fallback Chain Breaks Silently or Hard-Fails Without Recovery

**What goes wrong:**
- whisper.cpp can use Vulkan (AMD), CUDA (NVIDIA), Metal (Apple Silicon), or CPU fallback
- Driver version mismatches (Vulkan 1.2 requires drivers from late 2023+) cause silent GPU detection failures — system falls back to CPU without user awareness
- Hard GPU failures (OOM, incompatible SM architecture) crash the transcription without fallback
- User sees "Whisper failed" but doesn't know if it's transient GPU issue or permanent configuration problem
- Metal on macOS requires exact OS version match — older macOS gets mysterious failures
- NVIDIA CUDA requires MSVC runtime (Visual C++ 2015-2022 Redistributable x64) — missing on some Windows machines causes immediate crash

**Why it happens:**
- GPU backends have complex version requirements (CUDA ≥11.8, CUDA compute capability ≥3.7, Vulkan 1.2 drivers)
- Driver version detection is difficult — many systems have outdated or duplicate drivers
- whisper.cpp libraries (ggml) don't expose detailed fallback diagnostics; they fail silently or throw generic errors
- No production logging of which GPU backend was actually used vs. attempted
- Testing GPU paths locally masks the issue — dev machine has latest drivers
- Different platforms have different driver availability patterns

**Consequences:**
- **Silent CPU fallback:** User thinks STT working, but it's 10-50x slower than GPU; multi-turn voice becomes unusable (30s latency instead of 1s)
- **OOM crash:** Large model (base+) on constrained GPU (< 4GB VRAM) crashes mid-transcription; audio lost
- **Hard error loops:** User retries voice input repeatedly, each time hitting same GPU crash, can't proceed without restart
- **Opacity:** Logs show "whisper completed successfully" but GPU was never used — impossible to debug user issues
- **Cross-platform nightmare:** GPU detection working on Linux, failing on Windows for same hardware due to driver availability

**Prevention:**

1. **Explicit GPU detection before whisper.cpp init:**
   - Detect CUDA driver availability
   - Detect Vulkan driver version (1.2 minimum)
   - Detect Metal support on macOS
   - Log all available backends

2. **Driver version checks before initialization:**
   - Check NVIDIA CUDA runtime availability (VC++ redistributable on Windows)
   - Check Vulkan driver version via vulkan.version (if available)
   - Check Metal availability on macOS via system version check

3. **Separate GPU crash handling from transcription failure:**
   - OOM errors trigger "Try smaller model" message (not silent fallback)
   - GPU crashes trigger "Using CPU (slow)" message with option to disable GPU
   - Network errors propagate normally
   - Log exact error type with context

4. **Model selection based on available GPU memory:**
   - 8GB+ VRAM: use base (274M)
   - 4GB VRAM: use tiny (39M)
   - <4GB VRAM: force CPU

5. **Logging and user feedback:**
   - Log all GPU decisions to persistent log file (app data directory)
   - Send diagnostics to IPC for Settings display
   - Display GPU status in UI (Settings or system tray tooltip)
   - On GPU error, show recoverable message: "Speech recognition will be slow (using CPU). Check Settings."

6. **Testing strategy:**
   - Dev machine (latest drivers): Test GPU path explicitly
   - CI/CD (CPU-only): Test fallback path
   - Real-world test: Machine without CUDA/Vulkan drivers, verify CPU fallback works
   - OOM test: Load tiny model, run on GPU with memory constraint simulator

**Detection:**
- **Silent fallback:** Transcription times 10x slower than expected; check logs for "GPU_BACKEND=cpu"
- **Hard crash:** Whisper process exits with signal 11 (segfault) or error code without message
- **Wrong backend:** Logs show attempt but not actual backend used; add telemetry post-transcription
- **User report:** "Voice is slow" without obvious cause

**Phase:** P1 (day 1) — GPU detection must be logged before any production release

---

### Pitfall 3: sendAudioAndHandle Refactoring Breaks Both PTT and Wake Word Simultaneously

**What goes wrong:**
- Current system: sendAudioAndHandle is shared helper used by **both** Push-to-Talk (PTT) and Wake Word detection
- Refactoring this helper to use whisper.cpp (instead of nodejs-whisper) touches both entry points at once
- Bug in refactor affects both features simultaneously — can't isolate problem
- Wake word detection uses different audio format/sample rate than PTT (16kHz mono required, but recording might be stereo)
- Testing one path (e.g., PTT) passes; testing other path (wake word continuous monitoring) fails
- Shared state (model loading, audio device management) can cause race conditions
- Wake word runs in background; PTT issue is immediate — easier to debug the visible path first

**Why it happens:**
- sendAudioAndHandle was consolidated in v1.4 to eliminate duplication ("single source of truth")
- No feature flag or A/B testing strategy exists to safely roll out changes
- Tests for sendAudioAndHandle may not cover both entry points; PTT tests pass, wake word tests skipped
- Audio format assumptions baked into helper: if whisper.cpp has different requirements than nodejs-whisper, both paths break

**Consequences:**
- **Both broken:** Change intended for PTT breaks wake word detection simultaneously
- **No isolated rollback:** Can't disable just one path; must revert entire refactor
- **Cascading user impact:** Voice assistant becomes unusable (can't trigger + can't respond)
- **Complex debugging:** Error trace appears in both PTT and wake word logs; unclear which is root cause
- **Extended downtime:** Rollback required, then careful re-implementation with feature flag
- **Testing gap:** Existing tests may pass but real-world usage (long session with wake word + PTT mixed) fails

**Prevention:**

1. **Feature flag for sendAudioAndHandle refactor:**
   ```
   USE_WHISPER_CPP environment variable
   Defaults to false (nodejs-whisper) until proven stable
   Allows fast rollback via env var change
   ```

2. **Separate internal functions initially (no sharing except audio normalization):**
   ```
   transcribe-common.ts: Only normalizeAudio function
   ptt-transcriber.ts: Separate implementation with feature flag
   wake-word-transcriber.ts: Separate implementation with feature flag
   ```

3. **Canary rollout strategy:**
   - Phase 1: whisper.cpp support in PTT only (wake word uses nodejs-whisper)
   - Phase 2: Enable feature flag for 10% of users
   - Phase 3: Expand to 50% + monitor error rates
   - Phase 4: 100% rollout when error rate < 0.5%

4. **Comprehensive test matrix:**
   - Test both backends (nodejs-whisper and whisper.cpp)
   - Test both entry points (PTT and wake word)
   - PTT: transcribe 16kHz mono WAV, handle stereo input gracefully
   - Wake word: continuous monitoring, 24h audio stream without crash

5. **Monitoring during rollout:**
   - Log backend, entryPoint, duration, confidence for every transcription
   - Alert on error rate spike in either path
   - Compare latency between backends
   - Track false-positive/false-negative rates for wake word

6. **Rollback procedure:**
   - Keep nodejs-whisper in dependencies for 2-3 releases after whisper.cpp rollout
   - Feature flag defaults to false (nodejs-whisper) until proven stable
   - If error rate spikes, set USE_WHISPER_CPP=false immediately via env var
   - Clear communication with users about what changed

**Detection:**
- PTT works, wake word broken — logs show sendAudioAndHandle called from both paths
- Sporadic crashes — race condition in shared state
- Audio format mismatch — Whisper complains about sample rate
- Tests pass, real-world fails — missing test coverage for long-duration audio

**Phase:** P1 refactor prerequisite — add feature flag BEFORE changing sendAudioAndHandle

---

### Pitfall 4: Audio Format Incompatibility Between nodejs-whisper and whisper.cpp

**What goes wrong:**
- Current system: nodejs-whisper accepts various audio formats; internally converts to 16kHz WAV
- whisper.cpp Node.js bindings may have stricter requirements or different format expectations
- MediaRecorder (browser) produces 48kHz by default; nodejs-whisper resamples automatically, but whisper.cpp binding might not
- WAV header parsing differs: some whisper.cpp bindings expect specific codec (PCM), others accept µ-law/A-law
- Stereo input from dual-microphone systems: nodejs-whisper downgrades silently, whisper.cpp might error
- Endianness mismatch (big-endian vs little-endian): GGML models expect specific byte order
- Different whisper.cpp Node.js bindings have different assumptions about input validation

**Why it happens:**
- nodejs-whisper is a wrapper that handles format normalization transparently
- whisper.cpp bindings are thinner — closer to C++ code, less abstraction
- Different Node.js binding authors have different assumptions about input validation
- Testing uses clean 16kHz mono WAV from test fixtures — real audio has variation
- MediaRecorder output varies by browser/OS (48kHz macOS, 44.1kHz Windows)

**Consequences:**
- **Silent transcription failure:** Whisper returns empty string or invalid JSON instead of error
- **Unpredictable quality:** Same audio transcribes differently depending on format
- **Wake word misdetection:** Format mismatch causes audio artifacts; wake word false negatives spike
- **PTT fails intermittently:** Desktop browser produces different sample rate on different OS
- **Production support nightmare:** "Sometimes transcription fails" with no clear root cause

**Prevention:**

1. **Normalize audio to exact specification before any STT:**
   ```
   Sample rate: 16000 Hz exactly
   Channels: 1 (mono)
   Bytes per sample: 2 (16-bit)
   Encoding: PCM (not µ-law/A-law)
   Byte order: little-endian
   ```

2. **Explicit format validation with detailed errors:**
   ```
   Audio buffer length not even (requires 16-bit samples)
   Audio too short (requires ≥1s)
   Audio too long (max 30 minutes)
   Invalid encoding type
   ```

3. **Test matrix covering all input formats:**
   ```
   16kHz mono WAV (clean)
   48kHz mono WAV (macOS default)
   44.1kHz stereo (common)
   8kHz WAV (phone quality)
   ```

4. **Format detection before transcription:**
   - Infer format from MediaRecorder blob headers
   - Log detected format before normalization
   - Validate output of normalization
   - Fail fast with detailed error if format invalid

5. **Document whisper.cpp binding requirements explicitly:**
   - Create .planning/voice-pipeline/whisper-cpp-requirements.md
   - List exact format spec: 16kHz, mono, PCM, 16-bit, little-endian
   - Include examples of valid/invalid input
   - Note any differences from nodejs-whisper
   - Include debug checklist for format-related failures

**Detection:**
- Empty transcription: Audio accepted but produced no output
- Gibberish output: Format incompatibility causing data corruption
- Intermittent failures: Different browser/OS producing different sample rates

**Phase:** P1 — normalize audio BEFORE any STT call, regardless of backend

---

## Moderate Pitfalls

### Pitfall 5: GPU Model Caching & Update Strategy Undefined

**What goes wrong:**
- Whisper GGML models (tiny=39MB to large=3GB) must be cached on disk
- No clear strategy: Store in app data? Resources? User home directory?
- Model updates: If new version released, does user get automatic update? Old model kept?
- Disk space not managed: User's app data partition fills up after several models cached
- Different OS have different cache conventions (.cache on Linux, ~/Library on macOS, AppData on Windows)

**Why it happens:**
- Desktop app caching isn't standardized like web browsers
- Whisper models updated occasionally (e.g., v2 → v3); users don't know when to upgrade
- No UI to manage cached models

**Prevention:**
1. Use OS-standard cache directory (electron app.getPath('userData'))
2. Implement model versioning and metadata tracking
3. Add cleanup logic for old models; limit total cache size to 5GB
4. Create UI to manage cached models (delete unused, check for updates)
5. Log model cache state at startup

**Detection:**
- AppData/cache directory grows to GB; user complains about disk space
- First startup takes 5+ minutes with no progress feedback

**Phase:** P2 (model management)

---

### Pitfall 6: TTS HTTP Requests from Electron Main Process Fail with Certificate/CSP Issues

**What goes wrong:**
- TTS providers (Murf.ai, ElevenLabs) require HTTPS with certificate validation
- Electron main process (not renderer) makes requests; CSP doesn't apply
- Self-signed certificates or proxy SSL inspection fails authentication
- Streaming audio response not properly buffered; playback starts before full response received
- Certificate pinning not appropriate for desktop (user might have proxy SSL inspection)

**Why it happens:**
- Most TTS libraries designed for Node.js/server; less testing on desktop clients behind proxies
- Electron's main process has different certificate validation than renderer

**Prevention:**
1. Configure certificate validation appropriately for desktop context
2. Add proxy support via command-line flags
3. Test TTS from main process before release (especially with corporate proxy)
4. Handle certificate errors gracefully with fallback to local TTS

**Detection:**
- TTS fails with "Certificate invalid" error behind corporate proxy
- Streaming audio playback cuts off mid-sentence

**Phase:** P2 (TTS provider integration)

---

### Pitfall 7: Docker Complexity When Removing Audio Endpoints

**What goes wrong:**
- v1.5 Docker still has /chat/audio endpoint in gateway + backend-ts
- Removing endpoints breaks old clients that still try to call them
- Docker Compose config files in .planning/ and docker-compose.yml become out of sync with code
- Users running old Docker compose file can't upgrade without manual intervention

**Why it happens:**
- Audio migrates from Docker to Electron gradually; both implementations exist in transition
- No backwards compatibility layer added before removal
- Unclear when endpoint is "safe" to remove

**Prevention:**
1. Deprecation cycle: Keep endpoint for 2+ releases before removal
2. Return 410 Gone when endpoint removed (signals permanent removal)
3. Include migration message in error response
4. Document deprecation in changelog and migration guide

**Detection:**
- Clients fail with 404/410 after Docker update
- Old Docker compose files still being used in production

**Phase:** P2 (Docker cleanup)

---

## Minor Pitfalls

### Pitfall 8: whisper.cpp Electron Preload Security Isolation Violated

**What goes wrong:**
- Temptation to expose whisper methods directly via contextBridge without validation
- Renderer calls window.whisper.transcribe(userFile) without bounds checking
- Large audio files cause OOM; GPU models can be swapped via IPC without auth

**Prevention:**
- Always validate IPC messages in main process
- Enforce size limits on audio input (e.g., max 30 minutes)
- Validate file paths; don't allow arbitrary user input
- Add rate limiting for transcription requests

**Phase:** P1 (security validation)

---

### Pitfall 9: Model Download Progress Not Communicated to UI

**What goes wrong:**
- First startup: large model (e.g., 274MB base) downloads silently
- UI appears frozen for 30s-5m depending on internet speed
- No progress bar; user thinks app is broken
- Download fails mid-way; unclear how to retry

**Prevention:**
- Emit progress events during model download
- Show progress bar in UI with download percentage
- Cache downloaded models; skip re-download on restart
- Handle download failures with retry UI

**Phase:** P1 (model initialization)

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|-----------|
| P1 | whisper.cpp integration | Native module ASAR packing not configured | Enable electron-forge auto-unpack-natives immediately; test packaged build |
| P1 | GPU detection | Fallback chain not logged; silent CPU fallback | Implement explicit GPU detection + logging before whisper.cpp init |
| P1 | Audio format | Format incompatibility between nodejs-whisper ↔ whisper.cpp | Normalize all audio to 16kHz PCM mono before any STT call |
| P1 | sendAudioAndHandle refactor | Shared helper breaks both PTT + wake word simultaneously | Add feature flag; keep separate implementations during transition |
| P1 | IPC security | Over-expose whisper methods | Validate all IPC messages; enforce size limits on audio input |
| P2 | Model caching | No strategy for storing GGML models | Use app-standard cache directory; implement version tracking |
| P2 | Docker cleanup | Audio endpoints confusing; mixed responsibility | Explicit endpoint deprecation cycle (2+ releases); clear docs |
| P2 | TTS streaming | HTTP certificate issues from Electron main process | Test TTS with corporate proxy; add certificate bypass option |

---

## Sources

- [Electron Forge Auto Unpack Natives Plugin](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [Electron Application Packaging & ASAR](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [electron-builder Code Signing Configuration](https://www.electron.build/configuration.html)
- [GitHub Issue: Code signature in app.asar.unpacked not valid for macOS](https://github.com/electron-userland/electron-builder/issues/3940)
- [GPU and Hardware Support (Ollama Model - GPU Discovery)](https://deepwiki.com/ollama/ollama/6-gpu-and-hardware-support)
- [Vulkan Driver Support (NVIDIA Developer)](https://developer.nvidia.com/vulkan-driver)
- [whisper.cpp Node.js Bindings (@kutalia/whisper-node-addon)](https://github.com/Kutalia/whisper-node-addon)
- [Electron IPC Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Content Security Policy Examples](https://content-security-policy.com/examples/electron/)
- [nodejs-whisper Audio Format Compatibility](https://github.com/ChetanXpro/nodejs-whisper)
- [Refactoring Shared Functions: Testing & Maintenance Risks](https://www.freecodecamp.org/news/how-to-refactor-complex-codebases)
- [API Backwards Compatibility Best Practices (Zuplo)](https://zuplo.com/learning-center/api-versioning-backward-compatibility-best-practices)
- [whisper.cpp Model Caching in OpenWhispr (Electron app)](https://github.com/OpenWhispr/openwhispr)
- [TTS Latency Optimization (DupDub Blog)](https://www.dupdub.com/blog/tts-latency-optimization)
- [Whisper GPU Fallback Mechanisms (WhisperAttack GitHub)](https://github.com/nikoelt/WhisperAttack)

---

**Roadmap Implications:**

**P1 must include:**
1. Feature flag structure for whisper.cpp backend
2. Audio normalization layer (16kHz PCM mono) before ANY STT
3. GPU detection + logging at startup
4. ASAR/code-signing configuration for electron-forge
5. IPC validation for whisper methods
6. Comprehensive test matrix (both backends, both entry points)

**P2 must include:**
1. Model caching strategy with version tracking
2. Docker endpoint deprecation (2-release cycle)
3. TTS provider certificate handling
4. Model download progress UI

**Research Gaps:**
- Exact whisper.cpp Node.js binding API for chosen library (@kutalia/whisper-node-addon vs alternatives)
- GPU memory detection APIs per platform (NVIDIA CUDA runtime, Vulkan, Metal)
- Electron forge exact configuration syntax for current Electron version
- Inter-process communication patterns for GPU diagnostics

These gaps should be addressed during P1 implementation phase.
