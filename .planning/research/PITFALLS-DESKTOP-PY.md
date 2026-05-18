# Domain Pitfalls: Python Desktop STT+TTS Voice Client (asyncio + HTTP Backend Integration)

**Domain:** Python thin client connecting to TypeScript HTTP backend for STT (faster-whisper) + TTS (kokoro) with asyncio pipeline

**Researched:** 2026-05-17

**Overall Confidence:** MEDIUM-HIGH (sounddevice/asyncio patterns verified, faster-whisper caching behavior reported across multiple GH issues, gateway timeout handling best practices documented; specific Windows/kokoro initialization pitfalls from limited sources)

---

## Critical Pitfalls

### Pitfall 1: Audio Callback Thread Racing Event Loop (BLOCKING)

**What goes wrong:** sounddevice's audio callback runs in a separate OS-level thread, not the asyncio event loop. If the callback directly calls asyncio primitives (locks, events, queue.put), it deadlocks or silently fails. The event loop doesn't see the state change, leading to silent hangs and missed audio data.

**Why it happens:**
- sounddevice documentation doesn't warn about this clearly in simple examples
- Developers new to audio assume callbacks are always async-compatible
- asyncio primitives (`asyncio.Event`, `asyncio.Lock`, `asyncio.Queue`) are NOT thread-safe—they require `call_soon_threadsafe()` from OS threads
- Mixing threading.Lock (thread-safe) with asyncio primitives (not thread-safe) causes subtle hangs under concurrency

**Consequences:**
- Microphone stops responding mid-conversation but no error is raised
- VAD or wake-word detection silently fails to trigger transcription
- Entire pipeline hangs waiting for event that never fires from callback
- Very hard to debug—looks like the backend timed out, but it's a local deadlock

**Prevention:**
1. **ALWAYS use `loop.call_soon_threadsafe()` when callback needs to wake asyncio.** Example:
   ```python
   import asyncio
   
   class AudioCallback:
       def __init__(self, loop):
           self.loop = loop
           self.event = asyncio.Event()
       
       def callback(self, indata, frames, time_info, status):
           # Runs in separate thread
           if status:
               self.loop.call_soon_threadsafe(self.event.set)
       
       async def wait_audio(self):
           await self.event.wait()
   ```

2. Use `threading.Event` (thread-safe) for cross-thread coordination, then convert to asyncio signal if needed:
   ```python
   threading_event = threading.Event()
   # In callback: threading_event.set()
   # In asyncio: await loop.run_in_executor(None, threading_event.wait)
   ```

3. Document in code comments which functions run in which thread and which primitives are safe

4. Run callback-free version locally first (test VAD with prerecorded audio) before connecting to real microphone

**Detection:** Add logging at callback entry/exit + all asyncio calls. If asyncio.Event.wait() hangs forever in tests but set() was called, you've hit this pitfall.

**Phase to Address:** Phase 2 (Voice Capture STT Setup) — Critical for VAD loop to work reliably. Unit test with mock callback must pass before integrating real sounddevice.

---

### Pitfall 2: faster-whisper Model Stays Resident in Memory After First Load

**What goes wrong:** faster-whisper caches the loaded model in the `WhisperModel` instance. If you create multiple model instances or forget to unload between sessions, VRAM/RAM fills up and never gets freed. The garbage collector doesn't automatically release PyTorch's internal caching allocator.

**Why it happens:**
- PyTorch's memory allocator (CTranslate2 underlying faster-whisper) holds allocated memory even after objects are deleted
- No explicit `.unload()` or `.close()` method on WhisperModel
- Users create new model instance per transcription instead of reusing singleton
- Memory "stabilizes" over time but starts at high baseline
- On Windows with limited VRAM, this triggers OOM errors before stabilization

**Consequences:**
- First 3-5 transcriptions trigger rapid memory growth (each adds 40-200MB)
- On 4GB VRAM systems, pipeline crashes after 10-20 utterances
- Windows 11 Home can show "out of memory" dialog even with 8GB RAM if VRAM fragmented
- Soak tests (8h continuous listening) fail at hour 2-3

**Prevention:**
1. **Load model ONCE at startup, reuse singleton:**
   ```python
   # ❌ WRONG: creates new instance every transcription
   model = WhisperModel(model_size)
   result = model.transcribe(audio)
   
   # ✅ RIGHT: singleton pattern
   class STTManager:
       _instance = None
       def __init__(self, model_size='base'):
           if STTManager._instance is not None:
               raise RuntimeError("Use get_instance()")
           self.model = WhisperModel(model_size, device='cuda')
       
       @classmethod
       def get_instance(cls, model_size='base'):
           if cls._instance is None:
               cls._instance = STTManager(model_size)
           return cls._instance
       
       async def transcribe(self, audio):
           return await asyncio.to_thread(self.model.transcribe, audio)
   ```

2. Track memory before/after first transcription; if jump >200MB, it's caching behavior (expected). If it keeps growing, leak.

3. Add memory threshold check in voice pipeline: if RSS > 500MB, log warning. If > 800MB, degrade to smaller model or warn user.

4. Don't reinitialize WhisperModel when user changes "model size" setting—implement model swapping by creating new instance ONLY if old one has memory footprint <100MB.

5. Test with `tracemalloc` for 30-min continuous transcription to establish baseline memory profile

**Detection:** Run simple benchmark:
```python
import psutil
p = psutil.Process()
print(f"Before: {p.memory_info().rss / 1024**2:.1f}MB")
stt.transcribe(audio)
print(f"After: {p.memory_info().rss / 1024**2:.1f}MB")
```
If jump >100MB on second transcription, you're creating new model instances.

**Phase to Address:** Phase 2 (Voice Capture STT Setup) — Memory test matrix before TTS integration. Document model lifecycle in code.

---

### Pitfall 3: sounddevice Stream Closes Unexpectedly Under High CPU Load

**What goes wrong:** sounddevice's C-level stream runs in a separate thread with its own priority. If the asyncio event loop blocks (e.g., faster-whisper inference on CPU), the OS may pause the audio thread. When it resumes, sounddevice's internal ring buffer overflows or the stream resets, losing samples or corrupting audio. User hears stuttering or dropouts.

**Why it happens:**
- sounddevice callback expects to return quickly (typically <5ms per block)
- faster-whisper inference on CPU takes 500ms-2s per audio chunk
- If inference and audio capture happen on same thread (bad design), one starves the other
- On Windows with WASAPI, shared-mode audio can be stolen by other apps
- On Linux ALSA with low buffer settings (16 frames × 2 channels × 16-bit = 64 bytes), underruns happen immediately under CPU spike

**Consequences:**
- Audio input suddenly stops mid-word; user repeats, creating confusing conversation lag
- Intermittent "audio glitches" that are hard to reproduce (depends on CPU load)
- On weak machines, VAD never triggers because audio is corrupted before VAD gets it
- Tests pass on idle system but fail under load

**Prevention:**
1. **Audio capture and inference MUST run on separate threads:**
   ```python
   import queue
   
   class VoicePipeline:
       def __init__(self):
           self.audio_queue = queue.Queue()  # thread-safe, not asyncio.Queue
           self.stream = None
       
       def _audio_callback(self, indata, frames, time, status):
           # Runs in sounddevice thread, ONLY copies data
           if status:
               logging.warning(f"Audio status: {status}")
           # Use threading.Queue, NOT asyncio.Queue
           self.audio_queue.put(indata.copy())
       
       async def _inference_loop(self):
           # Separate task, can block without affecting audio
           while True:
               chunk = await asyncio.to_thread(
                   self.audio_queue.get, timeout=1.0
               )
               result = await asyncio.to_thread(
                   self.stt.transcribe, chunk
               )
               await self.handle_transcription(result)
   ```

2. Configure sounddevice stream with sufficient buffer:
   ```python
   # Don't rely on defaults; be explicit
   stream = sd.InputStream(
       channels=1,
       samplerate=16000,
       blocksize=4096,  # ~256ms at 16kHz, gives breathing room
       device=None,     # auto-detect, but log which device
       dtype='int16'
   )
   ```

3. Log audio status (underruns, overruns, etc.). If status != 0 appears in logs, prioritize latency optimization:
   ```python
   def _audio_callback(self, indata, frames, time, status):
       if status.input_overflow:
           logging.error("Input overflow—increase blocksize")
       if status.input_underflow:
           logging.error("Input underflow—decrease blocksize or reduce CPU load")
   ```

4. Profile inference latency. If faster-whisper inference is >100ms per block, pre-buffer multiple blocks before transcription:
   ```python
   buffer = []
   async def accumulate_and_transcribe():
       while len(buffer) < 4:  # Accumulate 4 blocks (~512ms)
           await asyncio.sleep(0.1)
       combined = np.concatenate(buffer)
       result = await transcribe(combined)
       buffer.clear()
   ```

5. Test with stress: `while true: busy_loop()` in parallel, ensure audio doesn't stutter

**Detection:** Add `sd.query_devices()` log at startup showing sample rates + buffer size. Add callback status logging. Run 5-min test with high CPU usage in background.

**Phase to Address:** Phase 2 (Voice Capture STT Setup) — Buffer tuning + callback status monitoring before Phase 3 (TTS).

---

### Pitfall 4: openwakeword False Positive Rate Too High in Noisy Environments

**What goes wrong:** openwakeword's default threshold (0.5) is tuned for quiet office environments. In real homes with TV, traffic, or background speech, it triggers on random acoustic patterns. User gets startled by phantom activations. Sensitivity slider in Phase 4 can fix this, but if defaults are wrong, users won't know how to tune.

**Why it happens:**
- Training data ("Hey JARVIS") is from clean speech
- Default threshold 0.5 is a generic compromise
- Wake word "JARVIS" has phonemes similar to common English words ("garage", "Jarrah")
- Dinner Party Corpus (background noise) used for testing is less noisy than typical home
- Most users don't read docs—they expect "just works"

**Consequences:**
- Widget suddenly activates during movie scenes
- Users disable wake word entirely, defeating voice-first UX
- Orb visual feedback creates paranoia ("why did it just light up?")
- Support questions: "Why is JARVIS listening to my TV?"

**Prevention:**
1. **Ship with conservative default: threshold 0.7 (not 0.5).** Accept higher false reject rate (user might need to speak clearer) rather than false acceptance:
   ```python
   DEFAULT_WAKE_THRESHOLD = 0.7  # Document: higher = fewer false positives
   ```

2. Test matrix in Phase 4: record 1-min samples from real homes (TV on, traffic, conversation) and measure false positive rate (FPR) at thresholds 0.5, 0.6, 0.7, 0.8. Choose threshold where FPR < 1 false positive per hour.

3. In Settings UI, add explanation text: "Lower = more sensitive to background noise. Raise if hearing false activations."

4. Log every wake-word detection with confidence score to Memory database. Build dashboard: "wake words past 7 days" with score histogram. If cluster of high-score detections at 3am (no user input), model is drifting.

5. **Never auto-adjust threshold based on FPR.** Let user tune explicitly via slider (Phase 4 feature).

**Detection:** Run 8-hour soak test with recorded YouTube videos (nature, office, cocktail party) looping. Count wake-word activations with no user press. If >0.5 per hour, threshold is too low.

**Phase to Address:** Phase 3 (Wake Word Detection + VAD) — Must be tuned before Phase 4 (Voice Modes). Defer to backlog if soak test fails.

---

## Moderate Pitfalls

### Pitfall 5: asyncio.to_thread() Spawns Too Many Threads, Starves Event Loop

**What goes wrong:** Each `asyncio.to_thread(inference_task)` creates a new thread. With concurrent STT/TTS + HTTP requests + VAD, thread pool fills up. OS scheduler context-switches heavily. Event loop responsiveness degrades: user presses hotkey, 500ms+ delay before orb lights up.

**Why it happens:**
- Default `ThreadPoolExecutor` has 5×CPU_COUNT threads (on 8-core, that's 40 threads)
- Developers naively call `asyncio.to_thread()` for every blocking I/O without pooling
- No visibility into thread pool usage—hidden behind asyncio convenience function
- Audio callback + inference + HTTP request + VAD all call `asyncio.to_thread()` concurrently

**Consequences:**
- UI feels sluggish; orb state changes lag behind actual state
- Wake-word detection delayed by 200-500ms (user thinks it's not working)
- Gateway timeout errors are actually thread pool starvation, not backend
- Windows Task Manager shows "Python (32 threads)" but user doesn't know why

**Prevention:**
1. **Create a bounded ThreadPoolExecutor explicitly, reuse for all CPU-bound tasks:**
   ```python
   from concurrent.futures import ThreadPoolExecutor
   
   # At app startup
   INFERENCE_EXECUTOR = ThreadPoolExecutor(max_workers=2)  # 1 for STT, 1 for TTS
   
   async def transcribe(audio):
       loop = asyncio.get_running_loop()
       return await loop.run_in_executor(INFERENCE_EXECUTOR, stt.transcribe, audio)
   ```

2. Log thread pool usage periodically:
   ```python
   def log_executor_stats():
       # ThreadPoolExecutor._threads is internal, use psutil instead
       p = psutil.Process()
       thread_count = p.num_threads()
       if thread_count > 10:
           logging.warning(f"High thread count: {thread_count}")
   
   asyncio.create_task(periodic_stats(interval=10))
   ```

3. Configure httpx with connection pool limits to reduce threads for HTTP:
   ```python
   limits = httpx.Limits(max_connections=5, max_keepalive_connections=2)
   async with httpx.AsyncClient(limits=limits) as client:
       ...
   ```

**Detection:** Run with `python -X dev` which enables asyncio debug mode. At shutdown, check for "thread not joined" warnings.

**Phase to Address:** Phase 2 (Async Architecture Setup) — Must be correct before VAD loop in Phase 3 to avoid hidden latency.

---

### Pitfall 6: HTTP Session Not Reused Across Requests

**What goes wrong:** Each chat request creates a new httpx.AsyncClient() or doesn't keep-alive the connection. TCP handshakes happen every time. First request to gateway takes 500ms, subsequent requests take 50ms. VoiceUX feels slow.

**Why it happens:**
- Developers copy-paste example code using `async with httpx.AsyncClient() as client:` inside request function
- Each context manager closes the connection (or client) at the end of block
- No persistent connection pool setup

**Consequences:**
- First utterance after app launch takes 1.5s total (500ms TCP + 500ms inference + 500ms TTS) instead of 1s
- Gateway connection pool underutilized; server sees many new connections instead of reuse
- Network stack stress; many TIME_WAIT connections on Windows
- Energy waste; mobile laptop battery drain

**Prevention:**
1. **Create AsyncClient once at app startup, reuse globally:**
   ```python
   class GatewayClient:
       _instance = None
       
       @classmethod
       def get_client(cls):
           if cls._instance is None:
               cls._instance = httpx.AsyncClient(
                   base_url="http://localhost:3000",
                   timeout=httpx.Timeout(30.0),
                   limits=httpx.Limits(
                       max_connections=10,
                       max_keepalive_connections=5
                   )
               )
           return cls._instance
       
       @classmethod
       async def close(cls):
           if cls._instance:
               await cls._instance.aclose()
   
   # At shutdown: await GatewayClient.close()
   ```

2. Document explicit keep-alive:
   ```python
   client = httpx.AsyncClient(
       ...,
       http2=True,  # HTTP/2 multiplexing, better than HTTP/1.1 keep-alive
   )
   ```

3. Never create AsyncClient inside request handler—pass client as dependency

**Detection:** Monitor gateway server logs for connection count. Should stay stable ~1-3 connections, not spike to 10+.

**Phase to Address:** Phase 1 (Terminal Chat HTTP Setup) — Foundation for all subsequent phases.

---

### Pitfall 7: Gateway Connection Timeout But No Fallback or Retry Logic

**What goes wrong:** User presses hotkey while backend is starting up (or crashed). Python client sends STT request, waits 30s for timeout, then silently fails. No retry, no user feedback, no fallback. User assumes JARVIS is broken.

**Why it happens:**
- Simple `await client.post(...)` has no retry loop
- Gateway might be booting (Node.js startup is ~2-3s)
- Network hiccup causes one request to fail
- Developers assume backend is always up (it's not during dev/testing)

**Consequences:**
- Frustrating UX: "JARVIS, do X" → silence for 30s → "Sorry, error"
- Looks like Python client is broken, when it's actually backend temporarily down
- User restarts app multiple times, missing the real issue
- In production, unhandled exception in callback can leave stream in bad state

**Prevention:**
1. **Implement exponential backoff retry with max 3 attempts:**
   ```python
   import backoff
   
   @backoff.on_exception(
       backoff.expo,
       httpx.RequestError,
       max_tries=3,
       max_time=10,  # Give up after 10s total
       jitter=backoff.full_jitter,
   )
   async def chat_with_retry(client, text):
       response = await client.post(
           "/api/chat",
           json={"message": text},
           timeout=5.0,  # Individual request timeout
       )
       return response.json()
   ```

2. Add health check on startup:
   ```python
   async def ensure_gateway_ready(client, timeout=10):
       start = time.time()
       while time.time() - start < timeout:
           try:
               await client.get("/api/health", timeout=2.0)
               logging.info("Gateway ready")
               return True
           except httpx.RequestError:
               logging.warning("Gateway not ready, retrying...")
               await asyncio.sleep(1.0)
       raise RuntimeError("Gateway unreachable after 10s")
   
   # At app startup
   await ensure_gateway_ready(client)
   ```

3. Log each retry with reason (timeout vs connection refused vs 502 vs 503):
   ```python
   @backoff.on_exception(..., on_backoff=lambda details: logging.warning(
       f"Retry {details['tries']}/{3}: {details['exception']}"
   ))
   ```

4. Show user feedback for slow requests: if response takes >2s, show "Thinking..." toast

**Detection:** Kill backend with `pkill -f 'node.*gateway'` and send voice request. App should recover gracefully in <15s with retry feedback.

**Phase to Address:** Phase 1 (Terminal Chat HTTP Setup) — Essential before any voice work.

---

### Pitfall 8: kokoro TTS Initialization Fails on Windows Without Clear Error

**What goes wrong:** kokoro requires espeak-ng on all platforms, including Windows (for phoneme generation). If user installs kokoro via pip but doesn't install espeak-ng binary, import succeeds but first TTS call fails with cryptic error: "espeak-ng not found in PATH" or "ONNX error".

**Why it happens:**
- `pip install kokoro` doesn't pull espeak-ng as a system dependency
- Windows users don't have a package manager like apt/brew readily available
- Error message comes from deep inside ONNX runtime, not from kokoro
- Documentation says "install espeak-ng" but doesn't say HOW on Windows (requires choco or manual MSI)

**Consequences:**
- TTS crashes on first use ("First launch" experience is broken)
- User thinks kokoro doesn't work on Windows
- Fallback to cloud TTS silently activates, user thinks it's the only option
- Support burden: "kokoro doesn't work for me"

**Prevention:**
1. **Validate kokoro at app startup, fail fast with helpful error:**
   ```python
   import subprocess
   
   def validate_kokoro_dependencies():
       try:
           result = subprocess.run(
               ["espeak-ng", "--version"],
               capture_output=True,
               timeout=2.0,
               check=False
           )
           if result.returncode != 0:
               raise RuntimeError("espeak-ng not working")
       except FileNotFoundError:
           raise RuntimeError(
               "espeak-ng not found. Install via:\n"
               "  Windows: choco install espeak-ng\n"
               "  macOS: brew install espeak-ng\n"
               "  Linux: apt-get install espeak-ng"
           )
       
       try:
           from kokoro import KPipeline
           KPipeline(lang_code='a')  # Test instantiation
           logging.info("Kokoro initialized successfully")
       except Exception as e:
           raise RuntimeError(f"Kokoro init failed: {e}")
   
   # At app startup
   try:
       validate_kokoro_dependencies()
   except RuntimeError as e:
       logging.error(e)
       # Disable TTS or use cloud-only fallback
   ```

2. Cache kokoro model on first boot, check version:
   ```python
   kokoro_model_dir = Path.home() / ".jarvis" / "kokoro_models"
   kokoro_model_dir.mkdir(parents=True, exist_ok=True)
   # Set KOKORO_MODEL_DIR env var
   ```

3. Log time taken for kokoro initialization:
   ```python
   start = time.time()
   pipeline = KPipeline(lang_code='a')
   elapsed = time.time() - start
   logging.info(f"Kokoro init took {elapsed:.1f}s")
   ```

**Detection:** Fresh install on Windows, run app, try TTS before checking logs. Should show helpful error message, not cryptic ONNX error.

**Phase to Address:** Phase 3 (TTS Integration + kokoro) — Validation before shipping, or gate TTS behind feature flag if kokoro unavailable.

---

### Pitfall 9: Sample Rate Mismatch Between Capture and Transcription

**What goes wrong:** sounddevice streams at 48kHz (device default) but faster-whisper expects 16kHz. Audio is played back 3x slower than spoken, creating garbage transcription. Or user specifies 16kHz but device doesn't support it, sounddevice fails with "Invalid sample rate" error.

**Why it happens:**
- sounddevice doesn't auto-convert sample rate
- Device capabilities vary widely (Windows default is 48kHz, Linux ALSA might be 44.1kHz)
- faster-whisper hardcoded to 16kHz internally
- Code doesn't validate device supports requested sample rate before opening stream

**Consequences:**
- Transcription is nonsense (sounds like Darth Vader)
- Or stream refuses to open with cryptic PortAudio error
- User thinks microphone is broken
- Fallback to cloud STT hides the local issue

**Prevention:**
1. **Always resample to 16kHz explicitly. Use librosa or scipy.signal:**
   ```python
   import librosa
   
   def get_audio_at_16khz(stream, duration=3.0):
       # Capture at whatever device supports
       # Then resample
       sample_rate_device = 48000  # Query device actual rate
       audio = stream.read(int(sample_rate_device * duration))
       
       # Resample to 16kHz
       audio_16k = librosa.resample(audio, orig_sr=sample_rate_device, target_sr=16000)
       return audio_16k
   ```

2. Query device capabilities at startup:
   ```python
   import sounddevice as sd
   
   def get_supported_samplerates(device_id=None):
       info = sd.query_devices(device_id)
       supported = []
       for sr in [16000, 44100, 48000]:
           try:
               stream = sd.InputStream(
                   device=device_id,
                   samplerate=sr,
                   blocksize=512,
                   channels=1
               )
               stream.close()
               supported.append(sr)
           except:
               pass
       return supported
   
   logging.info(f"Device supports: {get_supported_samplerates()}")
   ```

3. Open stream with explicit sample rate, handle error:
   ```python
   try:
       stream = sd.InputStream(
           device=device_id,
           samplerate=16000,
           blocksize=4096,
           channels=1,
           dtype='int16'
       )
   except sd.PortAudioError as e:
       if "Invalid sample rate" in str(e):
           logging.error(f"Device doesn't support 16kHz. Supported: {get_supported_samplerates()}")
           # Fallback: use device native rate + resample
       else:
           raise
   ```

**Detection:** Test on different machines (laptop built-in mic, USB headset, external USB mic). If transcription is garbage on any device, check sample rate.

**Phase to Address:** Phase 2 (Voice Capture STT Setup) — Audio capture validation matrix before integration.

---

## Minor Pitfalls

### Pitfall 10: VAD Silence Threshold Tuned for Quiet Room, Fails in Noisy Home

**What goes wrong:** Default VAD threshold (e.g., 500ms of silence) works in quiet office. In home with AC hum, keyboard typing, or dog barking, VAD triggers mid-word because the "silence" detection never reaches threshold.

**Why it happens:**
- VAD is amplitude-based (Silero in TypeScript, similar in Python)
- Threshold is global, not adaptive
- Training data for Silero VAD is office/lab speech

**Consequences:**
- User says "What's the weather" → VAD cuts off at "weather" thinking silence started
- Transcription is "What's the"
- User repeats, frustrating UX
- Some homes can't use always-listening mode, regress to PTT-only

**Prevention:**
1. **Make VAD silence threshold configurable, default to 1000ms (generous):**
   ```python
   DEFAULT_VAD_SILENCE_MS = 1000  # vs 500ms
   VAD_THRESHOLD_MIN = 300
   VAD_THRESHOLD_MAX = 2000
   ```

2. Log VAD silence detections with durations:
   ```python
   logging.info(f"VAD silence detected: {silence_duration_ms}ms")
   ```

3. In Phase 4 (Voice Modes UI), add Settings slider: "End of speech detection speed" (fast/normal/patient)

4. Test in soak scenarios: TV on, music playing, traffic noise

**Detection:** Record home audio with background noise, feed to VAD detector in isolation. Measure false positive rate (silence triggered mid-word).

**Phase to Address:** Phase 3 (Wake Word + VAD) → defer tuning to Phase 4 (Voice Modes UI) if needed.

---

### Pitfall 11: Orb State Desyncs from Actual Pipeline State

**What goes wrong:** Pipeline is LISTENING (capturing audio) but orb still shows IDLE (blue pulsing). Or orb shows SPEAKING but audio has finished. State is managed in two places and they diverge.

**Why it happens:**
- Audio callback sets internal state
- Orb rendered by separate React component in Electron
- State communicated via IPC message
- If message is lost or delayed, they diverge
- No reconciliation mechanism

**Consequences:**
- User presses hotkey expecting to activate, orb doesn't light up (but it actually did)
- Confuses user about what mode is active
- Looks buggy, damages trust

**Prevention:**
1. **Single source of truth for state: emit state change event, both backend and UI listen.**
   
   This is actually handled well in the existing TypeScript design (VoiceModeManager + EventEmitter). Python should follow same pattern: define state enum, emit to Python logger, let Electron subscribe via stdout.

2. If Python handles audio state, Python should emit state change, Electron should NOT auto-update from timer.

**Detection:** Manual test: press hotkey 10 times rapidly, observe orb responds to each. If any miss, state logic is wrong.

**Phase to Address:** Already solved in v1.9 (VoiceMode state machine). Python client should replicate this pattern in Phase 2.

---

### Pitfall 12: asyncio.TimeoutError Swallowed, Timeout Appears as Hang

**What goes wrong:** Code catches all exceptions, or catches `asyncio.CancelledError` without re-raising. TimeoutError is lost in logs. From user perspective, request just hangs forever.

**Why it happens:**
- Developers use broad `except Exception:` or `except: pass`
- `asyncio.wait_for()` raises `asyncio.TimeoutError`, but code catches it as generic error
- No re-raise means other tasks never know timeout happened

**Consequences:**
- User thinks app is frozen
- Eventually other timeout or user cancels
- Very hard to debug (timeout is silent)

**Prevention:**
1. **Never catch TimeoutError without handling it explicitly:**
   ```python
   # ❌ WRONG
   try:
       result = await asyncio.wait_for(transcribe(audio), timeout=30)
   except:
       pass
   
   # ✅ RIGHT
   try:
       result = await asyncio.wait_for(transcribe(audio), timeout=30)
   except asyncio.TimeoutError:
       logging.error("Transcription timed out after 30s")
       # Maybe retry or degrade
       raise
   except Exception as e:
       logging.error(f"Transcription failed: {e}")
       raise
   ```

2. Use structured concurrency (Python 3.11+):
   ```python
   async with asyncio.TaskGroup() as tg:
       task = tg.create_task(transcribe(audio))
       # Timeout applies to whole group
   ```

**Detection:** Add timeout explicitly to every async operation, log each. Search codebase for `except.*:` patterns.

**Phase to Address:** Phase 1 (Terminal Chat HTTP Setup) — code review checklist.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|-----------------|-----------|
| Phase 1 | HTTP Client Init | Gateway timeout (Pitfall 7) | Health check + retry backoff at startup |
| Phase 1 | HTTP Session | No connection reuse (Pitfall 6) | Create AsyncClient once, singleton pattern |
| Phase 2 | Audio Capture | Callback thread race (Pitfall 1) | Use `loop.call_soon_threadsafe()`, not asyncio primitives in callback |
| Phase 2 | faster-whisper Init | Memory leak from reinit (Pitfall 2) | Singleton WhisperModel, load once at startup |
| Phase 2 | sounddevice Config | Stream closes under load (Pitfall 3) | Separate threads for capture vs inference, sufficient blocksize |
| Phase 2 | Sample Rate | 48kHz device, 16kHz assumption (Pitfall 9) | Explicit resample, query device capabilities |
| Phase 3 | Wake Word | False positives too high (Pitfall 4) | Conservative default 0.7, soak test matrix |
| Phase 3 | VAD Tuning | Silence threshold too aggressive (Pitfall 10) | Default 1000ms, configurable in Phase 4 |
| Phase 3 | TTS Init (kokoro) | Missing espeak-ng on Windows (Pitfall 8) | Validate at startup, helpful error message |
| Phase 2-3 | Async Design | Too many threads from `to_thread()` (Pitfall 5) | Bounded ThreadPoolExecutor, explicit max_workers |
| Phase 2+ | Error Handling | TimeoutError swallowed (Pitfall 12) | Explicit exception handling, avoid bare except |
| Phase 4 | Voice Modes UI | State desync (Pitfall 11) | Already solved in TypeScript; replicate pattern in Python |

---

## Research Gaps & Validation Needed

- **Kokoro on Windows:** Limited real-world data on espeak-ng installation friction. Recommend Phase 3 includes Windows user testing.
- **openwakeword Threshold Tuning:** "Dinner Party Corpus" baseline may not match typical home noise. Phase 3 soak test should use recorded home audio, not synthetic.
- **faster-whisper Memory Baseline:** Reported 40-200MB per transcription, but no consensus on acceptable level. Phase 2 should establish memory budget: target <500MB RSS for 1h continuous use.
- **sounddevice Buffer Tuning:** blocksize=4096 is recommendation, but may need platform-specific tuning. Phase 2 testing matrix needed: blocksize ∈ {512, 2048, 4096, 8192} × platforms (Windows/Linux).

---

## Sources

- [python-sounddevice asyncio patterns](https://deepwiki.com/spatialaudio/python-sounddevice/4.4-asynchronous-audio) — Thread-safe coordination with sounddevice callbacks
- [faster-whisper GitHub Issue #660](https://github.com/SYSTRAN/faster-whisper/issues/660) — Memory not released after model unload
- [openWakeWord GitHub](https://github.com/dscripka/openWakeWord) — Threshold tuning, FPR benchmarks
- [aiohttp connection pooling docs](https://aiohttp.readthedocs.io/en/stable/client_advanced.html) — Connection reuse, pool limits
- [Python asyncio timeout & cancellation](https://runebook.dev/en/docs/python/library/asyncio-task/asyncio.timeout) — Structured concurrency, resource cleanup
- [httpx async patterns](https://medium.com/@sparknp1/8-httpx-asyncio-patterns-for-safer-faster-clients-f27bc82e93e6) — Retry backoff, timeout configuration
- [Avoiding race conditions in asyncio (2025)](https://medium.com/pythoneers/avoiding-race-conditions-in-python-in-2025-best-practices-for-async-and-threads-4e006579a622) — Thread-safe primitives
- [sounddevice sample rate errors](https://github.com/spatialaudio/python-sounddevice/issues/353) — Device capability querying, WASAPI shared mode
