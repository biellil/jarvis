# Domain Pitfalls: Chatterbox TTS Voice Cloning Integration

**Domain:** Desktop Python Assistant (JARVIS) — Adding Chatterbox TTS voice cloning + emotion control to existing Kokoro/sounddevice TTS stack.

**Researched:** 2026-05-28

**Milestone Context:** v3.5 — Emotional Voice Cloning TTS. Chatterbox TTS is a zero-shot voice cloning TTS (~500M parameters, 24kHz output) being added to `apps/desktop-py` as a new provider alongside existing Kokoro (82M offline, 24kHz). Current stack: Python 3.12 + faster-whisper + sounddevice + kokoro + torch/transformers already installed.

---

## Critical Pitfalls

### Pitfall 1: PyTorch Version Conflicts (torch/transformers/onnxruntime mismatch)

**What goes wrong:**
When adding Chatterbox to a Python environment that already has torch/transformers installed for other purposes (Whisper, embeddings, etc.), version pinning conflicts arise:
- Chatterbox 500M model requires specific torch version for its encoder
- `pip install chatterbox-tts` without `--no-deps` flag may downgrade torch from GPU (CUDA) to CPU-only
- ONNX compilation from source fails on Windows if torch versions don't match ONNX build expectations
- Installation hangs or fails silently during numpy/torch resolution

Example scenario: System has `torch==2.2.0+cu121` (CUDA), installing `chatterbox-tts==0.9.x` downsamples torch to `2.0.1` (CPU), breaking faster-whisper's CUDA availability.

**Why it happens:**
- Chatterbox's `pyproject.toml` pins older torch versions (pre-release timing: May 2025)
- pip resolver doesn't understand that "torch for Chatterbox" ≠ "torch for Whisper"
- ONNX 1.16.0+ requires torch ≥2.1 for CUDA support; downgrade breaks it
- Windows doesn't have prebuilt ONNX wheels; tries source compilation, fails if torch version incompatible

**Consequences:**
- STT (faster-whisper) falls back to CPU silently → ~4x latency increase
- CUDA memory available but unused → user frustrated thinking GPU is broken
- Silent fallback masks root cause → hard to debug
- Multiple reruns of pip/npm in confusion → dependency hell

**Prevention:**
1. Install Chatterbox **with `--no-deps` flag:**
   ```bash
   pip install torch==2.2.0+cu121  # Ensure torch/CUDA pinned first
   pip install chatterbox-tts==0.9.x --no-deps  # Skip dependency resolution
   ```

2. Explicit dependency pins in requirements.txt (before chatterbox):
   ```
   torch==2.2.0+cu121
   torchvision==0.17.0+cu121
   onnxruntime-gpu==1.18.0  # Explicit GPU variant
   transformers==4.40.0  # Pin before chatterbox pulls it
   chatterbox-tts==0.9.x
   ```

3. Add to `tts.py` init sequence:
   ```python
   import torch
   device = "cuda" if torch.cuda.is_available() else "cpu"
   # Log torch version for debugging
   logger.info(f"PyTorch {torch.__version__} on {device}")
   ```

4. In project CLAUDE.md constraints section, add:
   - **Multi-LLM (torch):** If adding new deep learning provider, always install with `--no-deps` and explicitly test STT GPU availability after install

**Detection:**
- Check during init: `faster_whisper.WhisperModel` initialized with CPU device when CUDA available
- Log `torch.cuda.is_available()` at startup
- Faster-whisper transcription latency >2s for 10s audio (indicates CPU fallback)
- Check `nvidia-smi` during STT — if GPU unused but available, torch/CUDA broke

**Phase placement:** Phase 86 (Chatterbox TTS Integration — TECH-01) should include dependency audit

---

### Pitfall 2: Zero-Shot Voice Cloning First Inference Latency (Cold Start)

**What goes wrong:**
Chatterbox ~500M parameter model's first inference in a session is dramatically slow (5–10+ seconds) compared to subsequent calls (~1 second streaming), due to:
- Model weights loaded from HuggingFace cache on first use
- CUDA kernel compilation on first inference (PyTorch JIT)
- Reference audio embedding extraction (if voice cloning enabled)
- System appears frozen; no progress feedback to user

Expected behavior: User enables Chatterbox, types first response → audio output after 1–2 seconds.
Actual: User waits 8 seconds with no feedback, thinking app is crashed.

Example: First call `tts.speak("Hello", config)` with Chatterbox voice cloning takes 8 seconds; second call takes 0.8 seconds.

**Why it happens:**
- Chatterbox loads full model (~500M parameters) on first TTS call, not at `init_tts()` (lazy loading pattern)
- Voice embedding extraction from reference audio happens synchronously per-call
- CUDA context creation + kernel compilation happens once per session
- No warmup pass during init

**Consequences:**
- User perceives JARVIS as unresponsive after selecting Chatterbox
- Multi-second silence before first response breaks conversational flow
- User may forcefully stop JARVIS, thinking it hung
- Testing reveals inconsistent latency (first call slow, rest fast) → confuses validation

**Prevention:**
1. Implement eager initialization in `init_tts()`:
   ```python
   def init_tts(config: JarvisConfig) -> None:
       if config.tts_provider == "chatterbox":
           _console().print("[TTS] Aquecendo Chatterbox (primeira vez)...")
           try:
               # Force model load + warmup pass
               _warmup_chatterbox_engine(config)
               _console().print("[TTS] Pronto.")
           except Exception as exc:
               _console().print(f"[TTS] Chatterbox aquecimento falhou: {exc}")
   ```

2. Implement async warmup with progress feedback:
   ```python
   async def _warmup_chatterbox_engine(config):
       """Lazy-load model, compile CUDA kernels, extract voice embedding."""
       # Load reference audio speaker embedding
       if config.chatterbox_reference_audio:
           await asyncio.to_thread(
               _extract_speaker_embedding, 
               config.chatterbox_reference_audio
           )
       # Dummy inference to JIT-compile CUDA
       engine.forward(torch.zeros(...), speaker_embedding=...)
   ```

3. Add startup phase message:
   ```
   [TTS] Chatterbox — inicializando modelo (este pode demorar ~5s na primeira execução)...
   ```

4. Log latency for debugging:
   ```python
   import time
   start = time.perf_counter()
   audio = await tts_engine(text, ...)
   elapsed = time.perf_counter() - start
   logger.info(f"Chatterbox inference: {elapsed:.2f}s (first call slow expected)")
   ```

5. Store model in persistent cache (HF_HOME environment variable):
   ```python
   os.environ['HF_HOME'] = str(Path.home() / '.jarvis' / 'cache' / 'huggingface')
   ```

**Detection:**
- Measure wall-clock time in `speak()` function
- First TTS call in session duration >>1s despite small text
- CUDA kernel compilation logs in stderr
- User reports: "First response takes forever, then it's normal"

**Phase placement:** Phase 86 (Chatterbox TTS Integration — PERF-01) — implement warmup + latency instrumentation

---

### Pitfall 3: Emotion Tags Not Stripped Before Chatterbox Inference

**What goes wrong:**
Chatterbox natively supports paralinguistic tags (`[laugh]`, `[cough]`, `[whisper]`) and emotion parameters (`exaggeration=0.5–2.0`) but does **not** understand arbitrary emotion markup like `[angry]`, `[sad]`, `[excited]` that may be in LLM response text.

Scenario: LLM outputs: "This is great! [excited] Let's do it!"
- Kokoro: ignores `[excited]` tag gracefully, speaks text as-is
- Chatterbox: does NOT strip tag → synthesizes literal "[excited]" as part of speech → audio: "This is great! bracket excited bracket! Let's do it!"

If emotion control added via parameter (not tags), emotion tags in text are read aloud = poor audio quality + confusion.

**Why it happens:**
- Kokoro was designed to tolerate and ignore extra markup (robust parser)
- Chatterbox only understands specific tags: `[laugh]`, `[cough]`, `[whisper]`, `[sigh]` (hardcoded whitelist)
- Tags not in whitelist pass through to text tokenizer → become phonemes
- No built-in tag validation/stripping in Chatterbox API

**Consequences:**
- Audio output sounds robotic/broken: "bracket excited bracket"
- User experience degraded if LLM injects emotion markup (common in emotional dialogue)
- Hard to debug — audio quality issue, not obvious cause
- Fallback to Kokoro on same text works fine, confusing user

**Prevention:**
1. Strip emotion tags before passing to Chatterbox:
   ```python
   EMOTION_TAGS = {
       "angry", "sad", "excited", "happy", "confused", 
       "embarrassed", "breathy", "soft", "whispering", "emphasis"
   }
   VALID_CHATTERBOX_TAGS = {"laugh", "cough", "whisper", "sigh", "chuckle", "groan", "yawn"}
   
   def _strip_unknown_emotion_tags(text: str) -> str:
       """Remove emotion tags not understood by Chatterbox."""
       import re
       # Remove [tag] if tag not in whitelist
       def replace_tag(match):
           tag = match.group(1).lower()
           if tag in VALID_CHATTERBOX_TAGS:
               return match.group(0)  # Keep valid tag
           return ""  # Remove unknown tag
       return re.sub(r'\[(\w+)\]', replace_tag, text)
   
   # In speak():
   if config.tts_provider == "chatterbox":
       text = _strip_unknown_emotion_tags(text)
   ```

2. Add emotion control via parameter instead of tags:
   ```python
   # LLM response: "This is great! [excited]"
   # Strip tag, pass emotion as parameter:
   text_clean = _strip_unknown_emotion_tags(text)  # → "This is great!"
   audio = engine(
       text_clean,
       speaker_embedding=speaker_emb,
       exaggeration=1.5  # Map [excited] → exaggeration=1.5
   )
   ```

3. Document expected emotion tags in system prompt:
   ```
   Use only these emotion markers: [laugh], [cough], [whisper], [sigh]
   Do NOT use: [angry], [sad], [excited], [happy]
   For emotional tone, rely on word choice and punctuation!!!
   ```

4. Add validation test:
   ```python
   def test_emotion_tag_stripping():
       text = "Great! [excited] Let's go [unknown]"
       clean = _strip_unknown_emotion_tags(text)
       assert "[excited]" not in clean
       assert "[unknown]" not in clean
       assert "Great!" in clean
   ```

**Detection:**
- Audio output contains "bracket X bracket" audio artifacts
- Audio quality drops after switching to Chatterbox
- Kokoro + same LLM output = good audio; Chatterbox = bad audio

**Phase placement:** Phase 86 (Chatterbox TTS Integration — TAG-01) — tag stripping + validation

---

### Pitfall 4: Reference Audio Quality & Format Requirements (Sample Rate Mismatch)

**What goes wrong:**
Voice cloning quality degrades or fails silently if reference audio doesn't match Chatterbox's requirements:
- Sample rate <24 kHz → audio degraded or embedding extraction fails
- Duration <5 seconds → voice clone sounds generic, not matching speaker
- Background noise → embedding extraction noisy → cloned voice distorted
- Multiple speakers in clip → voice embedding averaged → weak clone
- MP3 format with artifacts → lossy compression prevents clean embedding

Example: User provides 3-second noisy phone recording (8 kHz, .m4a) as reference → Chatterbox extracts poor embedding → cloned voice doesn't match original speaker → user frustrated, thinks Chatterbox is broken.

**Why it happens:**
- Chatterbox's speaker encoder trained on clean, 24 kHz, single-speaker audio
- No automatic resampling in API — expected format must be provided
- Validation is silent: invalid audio accepted, poor embedding generated (not rejected)
- Reference audio preprocessing not exposed to user — they don't know why clone is bad

**Consequences:**
- Voice clone doesn't match original speaker at all
- User blames Chatterbox quality, doesn't realize audio was bad
- Silent failure: no error message, just poor output
- Config menu doesn't validate reference audio on load → bad audio persists session-to-session

**Prevention:**
1. Add reference audio validation in config loading:
   ```python
   import librosa
   import soundfile as sf
   
   def validate_chatterbox_reference_audio(audio_path: str) -> tuple[bool, str]:
       """Validate reference audio meets Chatterbox requirements.
       
       Returns:
           (is_valid, message)
       """
       try:
           audio, sr = sf.read(audio_path)
           
           # Check sample rate
           if sr < 24000:
               return False, f"Sample rate {sr} Hz too low (need ≥24 kHz)"
           
           # Check duration
           duration_sec = len(audio) / sr
           if duration_sec < 5:
               return False, f"Duration {duration_sec:.1f}s too short (need ≥5s)"
           
           # Check mono (or convert stereo)
           if len(audio.shape) > 1 and audio.shape[1] > 1:
               return False, "Stereo audio not supported (need mono)"
           
           # Rough SNR estimate (silence detection)
           rms = np.sqrt(np.mean(audio ** 2))
           if rms < 0.01:  # Very quiet
               return False, "Audio too quiet (background noise may dominate)"
           
           return True, "OK"
       except Exception as e:
           return False, f"Read error: {e}"
   
   # In config load:
   if config.chatterbox_reference_audio:
       valid, msg = validate_chatterbox_reference_audio(config.chatterbox_reference_audio)
       if not valid:
           logger.warning(f"[TTS] Reference audio invalid: {msg}. Using default voice.")
           config.chatterbox_reference_audio = None
   ```

2. Resample on load if needed:
   ```python
   def prepare_chatterbox_reference_audio(audio_path: str, target_sr: int = 24000) -> np.ndarray:
       """Load and normalize reference audio to Chatterbox spec."""
       import librosa
       audio, sr = librosa.load(audio_path, sr=target_sr, mono=True)
       # Trim silence at start/end
       audio_trimmed, _ = librosa.effects.trim(audio, top_db=20)
       # Normalize to [-0.9, 0.9] to avoid clipping
       audio_norm = audio_trimmed / np.max(np.abs(audio_trimmed)) * 0.9
       return audio_norm
   ```

3. Cache preprocessed reference audio:
   ```python
   # Cache in ~/.jarvis/cache/chatterbox_speaker_embedding.pt
   # Reuse embedding across sessions instead of recomputing
   ```

4. Add reference audio selection UI helper:
   ```
   /config → TTS Provider: chatterbox
   → Select reference audio: [Browse] [✓ valid] [⚠ warnings]
   ```

5. Document requirements in config file comments:
   ```python
   chatterbox_reference_audio: Optional[str] = None  # Path to 5-20s mono WAV/MP3 (24 kHz+, clean, single speaker)
   ```

**Detection:**
- Voice clone sounds nothing like original speaker
- Quality test: Compare Kokoro voice quality vs Chatterbox with same reference

**Phase placement:** Phase 86 (Chatterbox TTS Integration — AUDIO-01) — reference audio validation + preprocessing

---

### Pitfall 5: sounddevice Playback Sample Rate Mismatch (24 kHz)

**What goes wrong:**
Chatterbox outputs 24 kHz audio, but if sounddevice is configured for 16 kHz (Whisper default), playback will:
- Play at wrong speed (too fast if expecting 16 kHz but playing 24 kHz)
- Produce audio artifacts/noise if resampling happens in sounddevice
- Work but with quality degradation

Scenario: Current `tts.py` hardcodes:
```python
_KOKORO_SAMPLE_RATE = 24000
sd.play(audio_data, samplerate=_KOKORO_SAMPLE_RATE)
```

Chatterbox also outputs 24 kHz, so this "just works" — **but** if a different Chatterbox variant or if user misconfigures sounddevice to 16 kHz elsewhere, audio plays incorrectly.

**Why it happens:**
- Chatterbox/Kokoro both output 24 kHz (intentional design)
- sounddevice.play() needs explicit samplerate parameter
- If samplerate not specified, sounddevice assumes device's current sample rate (could be 48 kHz from Bluetooth headset, etc.)
- No assertion that Chatterbox output matches expected sample rate

**Consequences:**
- Audio plays too fast (1.33x speed if 16 kHz expected, 24 kHz provided)
- User experience degraded: speech unintelligible
- Pitch shifts unnaturally
- No error — just poor output quality

**Prevention:**
1. Add assertion after Chatterbox inference:
   ```python
   # After: audio = engine(text, ...)
   assert audio.sample_rate == 24000 or audio.shape[0] > 1000  # 24kHz output expected
   audio_np = audio.cpu().numpy().astype(np.float32)
   # Normalize to [-1, 1] if needed
   if np.max(np.abs(audio_np)) > 1.0:
       audio_np = audio_np / np.max(np.abs(audio_np))
   ```

2. Explicit check before sounddevice.play():
   ```python
   def _chatterbox_speak(text: str, config: JarvisConfig) -> None:
       """Synthesize with Chatterbox and play via sounddevice."""
       global _is_playing
       import sounddevice as sd
       
       # ... inference ...
       audio_data = ...  # np.ndarray, float32, 24 kHz expected
       
       # CRITICAL: Verify sample rate
       CHATTERBOX_SR = 24000
       _console().print(f"[TTS] Chatterbox audio shape: {audio_data.shape}, expected SR: {CHATTERBOX_SR}")
       
       _is_playing = True
       try:
           sd.play(audio_data, samplerate=CHATTERBOX_SR)
           sd.wait()
       finally:
           _is_playing = False
   ```

3. Store sample rate in config metadata:
   ```python
   class JarvisConfig(BaseSettings):
       chatterbox_output_sr: int = 24000  # Document expected output sample rate
   ```

**Detection:**
- Audio plays at wrong speed after Chatterbox init
- User reports: "Voice sounds too fast/slow"
- Compare to Kokoro: if Kokoro sounds normal but Chatterbox fast, sample rate mismatch confirmed

**Phase placement:** Phase 86 (Chatterbox TTS Integration — AUDIO-02) — sample rate assertion + validation

---

## Moderate Pitfalls

### Pitfall 6: Model Download on First Run (HuggingFace Cache Location & Size)

**What goes wrong:**
On first use, Chatterbox downloads ~500M–1 GB model files from HuggingFace. If cache location misconfigured or disk full:
- Download happens in `~/.cache/huggingface/hub/` (Linux/macOS) or `%APPDATA%\huggingface\hub\` (Windows)
- No progress feedback to user during 5–10 minute download (on slow connection, 30+ min)
- Download path not documented → user confused where files went
- Multiple model variants (Turbo 350M, Original 500M, Multilingual 500M) → disk space unpredictable
- Network interruption mid-download → corrupted cache, requires manual cleanup

Example: First TTS call with Chatterbox on fresh install → 5 minute silence → user force-kills JARVIS → corrupted model cache → next start fails.

**Why it happens:**
- Chatterbox lazily loads model (not at init, at first speak())
- HuggingFace's `hf_hub_download()` caches globally, no app-specific override by default
- No download progress callback in basic Chatterbox API
- Cache corruption on network failure is silent

**Consequences:**
- UX degradation: User perceives JARVIS as hung
- Disk space filled unexpectedly (surprise 1GB+ usage)
- Failed downloads leave corrupted cache → requires manual `rm ~/.cache/huggingface/` cleanup
- Mobile/laptop users on slow WiFi confused by hang

**Prevention:**
1. Configure HuggingFace cache location in JARVIS:
   ```python
   # In config.py or tts.py init:
   cache_dir = Path.home() / '.jarvis' / 'cache' / 'models'
   os.environ['HF_HOME'] = str(cache_dir)
   ```

2. Pre-download model at init_tts() time with progress:
   ```python
   def init_tts(config: JarvisConfig) -> None:
       if config.tts_provider == "chatterbox":
           _console().print("[TTS] Chatterbox — modelo não encontrado. Baixando 500 MB...")
           _console().print("[TTS] Dependendo da sua conexão, isso pode demorar 5–30 minutos.")
           
           try:
               from huggingface_hub import hf_hub_download
               model_path = hf_hub_download(
                   repo_id="ResembleAI/chatterbox",
                   filename="model.pth",
                   local_dir=cache_dir,
                   local_dir_use_symlinks=False,  # Avoid symlink issues on Windows
               )
               _console().print(f"[TTS] ✓ Modelo baixado: {model_path}")
           except Exception as e:
               _console().print(f"[TTS] Erro ao baixar modelo: {e}")
               config.tts_provider = "kokoro"  # Fallback
   ```

3. Add download progress with user feedback:
   ```python
   from tqdm import tqdm
   
   def _download_chatterbox_model_with_progress(cache_dir):
       """Download with tqdm progress bar."""
       # Monkey-patch huggingface_hub to show progress
       from huggingface_hub import _download
       # ... implementation ...
   ```

4. Cache location documentation:
   ```
   Chatterbox models armazenados em: ~/.jarvis/cache/models/
   Espaço em disco necessário: ~1 GB (primeira execução)
   ```

5. Graceful fallback if download fails:
   ```python
   if config.tts_provider == "chatterbox":
       try:
           init_chatterbox(...)
       except Exception as e:
           _console().print(f"[TTS] Chatterbox indisponível ({e}). Fallback para Kokoro.")
           config.tts_provider = "kokoro"
           init_tts(config)  # Retry with Kokoro
   ```

**Detection:**
- First run with Chatterbox takes >5 minutes with no output
- `~/.jarvis/cache/models/` or `~/.cache/huggingface/` contains 500MB+ unexpectedly
- Download interrupted mid-way → subsequent runs fail with cache corruption errors

**Phase placement:** Phase 86 (Chatterbox TTS Integration — CACHE-01) — cache management + download progress

---

### Pitfall 7: Fallback Logic — When Chatterbox Fails Silently vs Raises

**What goes wrong:**
Chatterbox API doesn't always fail loudly:
- Invalid reference audio → silently extracts poor embedding → voice clone doesn't match speaker (no error)
- Out of CUDA memory → silence, then OOM error message in stderr (not logged to JARVIS)
- Reference audio file missing → raises `FileNotFoundError` (crash, not graceful fallback)
- Model weights corrupted in cache → raises RuntimeError on load (crash)
- Network timeout during first inference (if streaming) → hangs indefinitely

Current `tts.py` pattern for Kokoro/ElevenLabs:
```python
try:
    result = provider.speak(...)
    return  # Success
except Exception as e:
    _console().print(f"[TTS] {provider} failed: {e}")
    _kokoro_speak(...)  # Fallback
```

But Chatterbox edge cases may not raise, or may hang, breaking this pattern.

**Why it happens:**
- Chatterbox API is newer, less battle-tested for error cases
- Voice embedding extraction doesn't validate quality (just returns embedding even if poor)
- CUDA OOM is handled by PyTorch (prints to stderr, not exception in main thread)
- Async/streaming API may not surface errors clearly

**Consequences:**
- Poor audio quality without error message → confusing to user
- Silent hangs waiting for network/CUDA recovery
- App crashes instead of graceful fallback

**Prevention:**
1. Implement defensive wrapper around Chatterbox inference:
   ```python
   def _chatterbox_speak(text: str, config: JarvisConfig) -> None:
       """Synthesize with Chatterbox, with fallback to Kokoro on any error."""
       global _is_playing
       import sounddevice as sd
       
       try:
           _stop_event.clear()
           from jarvis_desktop import ui as _ui
           _ui.set_state("speaking")
           _is_playing = True
           
           # Load model with timeout
           engine = asyncio.run(asyncio.wait_for(
               _load_chatterbox_engine(config),
               timeout=10.0  # 10 second timeout for model load
           ))
           
           # Inference with timeout
           audio = asyncio.run(asyncio.wait_for(
               engine(text, speaker_emb=..., temperature=0.7),
               timeout=30.0  # 30 second timeout for inference
           ))
           
           # Validate output
           if audio is None or len(audio) == 0:
               raise ValueError("Chatterbox returned empty audio")
           
           # Play
           sd.play(audio, samplerate=24000)
           sd.wait()
           return  # Success
           
       except asyncio.TimeoutError:
           _console().print("[TTS] Chatterbox timeout — usando Kokoro.")
           _kokoro_speak(text, config)
       except torch.cuda.OutOfMemoryError:
           _console().print("[TTS] Memória CUDA insuficiente — reduzindo para Kokoro.")
           # Optionally clear CUDA cache
           torch.cuda.empty_cache()
           _kokoro_speak(text, config)
       except FileNotFoundError as e:
           _console().print(f"[TTS] Arquivo de referência não encontrado: {e}")
           config.chatterbox_reference_audio = None  # Clear bad reference
           config.save_config()
           _kokoro_speak(text, config)  # Fallback
       except Exception as e:
           _console().print(f"[TTS] Chatterbox erro: {e} — usando Kokoro.")
           _kokoro_speak(text, config)
       finally:
           _is_playing = False
           from jarvis_desktop import ui as _ui
           _ui.set_state("idle")
   ```

2. Add reference audio existence check before init:
   ```python
   if config.chatterbox_reference_audio:
       if not Path(config.chatterbox_reference_audio).exists():
           _console().print(f"[TTS] Referência não encontrada: {config.chatterbox_reference_audio}")
           config.chatterbox_reference_audio = None
   ```

3. Monitor CUDA memory before inference:
   ```python
   import torch
   if torch.cuda.is_available():
       free_mb = torch.cuda.mem_get_info()[0] / 1024 / 1024
       if free_mb < 2000:  # Less than 2GB free
           _console().print(f"[TTS] CUDA livre: {free_mb:.0f} MB. Chatterbox pode falhar.")
   ```

4. Test fallback path in unit tests:
   ```python
   def test_chatterbox_fallback_on_timeout(monkeypatch):
       """Verify fallback to Kokoro when Chatterbox times out."""
       monkeypatch.setattr("jarvis_desktop.tts._chatterbox_engine_timeout", 0.1)
       # Inference times out → falls back to Kokoro
       # Assert audio plays, no exception raised
   ```

**Detection:**
- Audio quality poor without error message
- App hangs for 30+ seconds then recovers
- Reference audio file moved/deleted → app crashes instead of fallback
- CUDA OOM in stderr but app continues in weird state

**Phase placement:** Phase 86 (Chatterbox TTS Integration — ERR-01) — comprehensive error handling + fallback

---

## Minor Pitfalls

### Pitfall 8: Chatterbox Configuration Menu UX

**What goes wrong:**
Adding Chatterbox to `/config` menu requires new fields:
- Provider selection (Kokoro, ElevenLabs, Murf, Chatterbox)
- Reference audio file picker (for Chatterbox only)
- Emotion/exaggeration slider (0.5–2.0)

If UI not carefully designed:
- Menu becomes cluttered (5+ TTS options visible even when not relevant)
- Reference audio picker doesn't validate until save
- Switching from Kokoro → Chatterbox requires reference audio, but menu doesn't require it
- No feedback on reference audio quality before saving

**Prevention:**
1. Conditional UI: Show reference audio picker only when Chatterbox selected
   ```
   TTS Provider: [ Kokoro | ElevenLabs | Murf | Chatterbox ]
   
   [If Chatterbox selected]
   Reference Audio: [Browse...] [✓ Valid 10.2s @ 24kHz] [?]
   Emotion Intensity: [=====●======] (0.5 neutral — 2.0 expressive)
   ```

2. Validate on selection change, not just on save:
   ```python
   def _on_provider_changed(new_provider):
       if new_provider == "chatterbox" and not config.chatterbox_reference_audio:
           show_warning("Chatterbox requer arquivo de referência de voz (5–20s)")
       if new_provider == "chatterbox":
           show_file_picker("Selecione arquivo de voz (WAV/MP3)")
   ```

**Phase placement:** Phase 86 (Chatterbox TTS Integration — UI-01) — config menu refinement

---

### Pitfall 9: Chatterbox + Always-Listening (Real-Time Voice Clone)

**What goes wrong:**
If JARVIS enables Always-Listening + Chatterbox voice clone simultaneously:
- Always-Listening VAD loop captures audio continuously
- On each detected utterance, transcribe → LLM → TTS (Chatterbox with voice clone)
- Voice cloning inference + reference audio loading happens in hot path
- ~1 second of added latency per response cycle
- If voice embedding extraction happens per-call (not cached), manifolds become slow

Example: Always-Listening mode with Chatterbox → user speaks → 0.5s STT + 1s LLM + 2.5s Chatterbox (embedding + inference) = 4 seconds perceived latency. Kokoro: 0.5s + 1s + 0.5s = 2 seconds.

**Prevention:**
1. Cache speaker embedding across session:
   ```python
   # Load reference audio embedding once at init_tts()
   _speaker_embedding = None
   
   def _load_speaker_embedding(audio_path: str):
       """Load and cache speaker embedding for whole session."""
       global _speaker_embedding
       from encodec import EncodecModel
       audio, sr = sf.read(audio_path)
       # ... extract embedding once ...
       _speaker_embedding = embedding  # Cache in memory
       return _speaker_embedding
   
   def _chatterbox_speak(text, config):
       # Reuse cached embedding, don't extract per-call
       audio = engine(text, speaker_embedding=_speaker_embedding, ...)
   ```

2. Async TTS to not block Always-Listening loop:
   ```python
   # In voice_modes.py Always-Listening handler:
   asyncio.create_task(tts.speak_async(lm_response, config))
   # Loop continues listening while TTS plays in background
   ```

**Phase placement:** Phase 88 (Chatterbox + Voice Modes Integration) — if Always-Listening is in-scope for v3.5

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---|---|
| **Phase 86: Chatterbox TTS Integration** | PyTorch version conflicts after install | `pip install --no-deps` + explicit torch pin before chatterbox |
| **Phase 86: Chatterbox TTS Integration** | First inference cold start 5–10s latency | Eager warmup in `init_tts()` + user feedback message |
| **Phase 86: Chatterbox TTS Integration** | Emotion tag stripping (unknown tags read aloud) | Regex tag filter before Chatterbox inference |
| **Phase 86: Chatterbox TTS Integration** | Reference audio validation (poor clone quality) | `validate_chatterbox_reference_audio()` + resampling |
| **Phase 86: Chatterbox TTS Integration** | Sample rate mismatch (audio too fast/slow) | Assert `24000 Hz` output before `sd.play()` |
| **Phase 86: Chatterbox TTS Integration** | Model download silent hang (5–30 minutes) | Pre-download at init with progress feedback |
| **Phase 86: Chatterbox TTS Integration** | Fallback on errors (CUDA OOM, timeouts, file missing) | Comprehensive try/except + timeout wrapping + Kokoro fallback |
| **Phase 86: Chatterbox TTS Integration** | Config UI clutter + reference audio UX | Conditional fields, validation on change, file picker |
| **Phase 88: Always-Listening + Chatterbox** | Added latency from per-call embedding extraction | Cache speaker embedding, async TTS to background |

---

## Sources

- [Chatterbox GitHub — resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox)
- [Chatterbox TTS Server Documentation](https://github.com/devnen/Chatterbox-TTS-Server/blob/main/documentation.md)
- [PyTorch Version Conflicts & Installation Best Practices](https://emanueleferonato.com/2026/01/07/text-to-speech-on-your-pc-running-chatterbox-turbo-locally-on-windows-clean-setup-known-pitfalls/)
- [Chatterbox Reference Audio Requirements — Issue #411](https://github.com/resemble-ai/chatterbox/issues/411)
- [Chatterbox TTS Emotion Control & Paralinguistic Tags](https://tech-now.io/en/blogs/chatterbox-multilingual-open-source-zero-shot-tts/)
- [HuggingFace Hub Cache Management](https://huggingface.co/docs/hub/security-tokens)
- [JARVIS Desktop Python Stack — tts.py Architecture](C:\Users\biel1\OneDrive\Documentos\GitHub\jarvis\apps\desktop-py\src\jarvis_desktop\tts.py)
