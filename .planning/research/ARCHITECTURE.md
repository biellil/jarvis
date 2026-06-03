# Architecture: Chatterbox TTS Integration

**Domain:** Emotional Voice Cloning TTS (v3.5 milestone)
**Researched:** 2026-05-28
**Scope:** apps/desktop-py
**Confidence:** HIGH

## Executive Summary

Chatterbox TTS integrates into existing tts.py provider pattern. Key decisions:

1. **ChatterboxProvider joins hierarchy** - Fallback: Chatterbox → Kokoro → ElevenLabs → Murf
2. **Reference audio in JarvisConfig** - New field chatterbox_audio_prompt_path (string, default empty)
3. **Emotion tags are text-level markers** - [happy], [sad], [angry], [whisper], etc. No parser needed
4. **GPU/CPU detection mirrors STT** - CUDA→CPU order, inline in tts.py
5. **/config menu extended** - Menu choice 4 for audio path selection, hot-swap at runtime
6. **Build order** - Core provider first, config schema, menu, device detection, fallback testing

## Architecture: Provider Hierarchy

speak(text, config)
  ├─ if tts_provider == "chatterbox"
  │  └─ _chatterbox_speak(text, config)
  ├─ Fallback: _kokoro_speak()
  └─ Fallback: ElevenLabs/Murf

## Component: ChatterboxProvider

Location: tts.py

Module state:
_chatterbox_engine: Optional[Any] = None
_chatterbox_device: str = "cpu"

Implementation:
1. Device detection: CUDA→CPU order
2. Lazy-init engine on first call, thread-safe with _lock
3. Resolve reference audio path from config, validate existence
4. Synthesize & play via sounddevice (24 kHz)
5. Error handling: any failure triggers Kokoro fallback

## JarvisConfig Schema Changes

New fields:

chatterbox_audio_prompt_path: str = Field(
    default="",
    description="Path to reference audio (.wav or .mp3) for voice cloning"
)

chatterbox_device: str = Field(
    default="auto",
    description="Device: 'auto' = CUDA if available else CPU"
)

Validation: Non-blocking warning at startup if file missing

## Device Detection

Inline implementation (recommended):

def _detect_device_for_tts() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"

Reason: Self-contained, no cross-module dependency

## /config Menu Integration

User flow:
/config → option 4 → "Enter audio file path:"
  - Valid: Save + reset engine + confirm
  - Invalid: Warn + retry

Implementation:
- Add menu choice 4 in chat.py._handle_command()
- File validation: expanduser, resolve, check extension
- Hot-swap: reset _chatterbox_engine = None

## Modified Files

1. tts.py
   - Add _chatterbox_engine, _chatterbox_device
   - Add _detect_device_for_tts()
   - Add _chatterbox_speak()
   - Modify speak() for Chatterbox check
   - Modify set_provider() for engine reset

2. config.py
   - Add chatterbox_audio_prompt_path
   - Add chatterbox_device

3. chat.py
   - Extend /config menu
   - Import tts for engine reset

Unchanged: voice_modes.py, ui.py, __main__.py, stt.py

## Data Flow

Example 1: With reference audio
User: "I'm so [happy] today!"
Config: chatterbox_audio_prompt_path = "/path/to/voice.wav"
Result: speak() → _chatterbox_speak() → model.generate() → sounddevice.play()

Example 2: Missing audio
Config: chatterbox_audio_prompt_path = "/missing/file.wav"
Result: Validation fails → warning → _kokoro_speak()

## Sample Rates

All providers → 24 kHz float32:
- Chatterbox: 24 kHz float32
- Kokoro: 24 kHz float32
- ElevenLabs: 24 kHz int16 PCM (converted)
- Murf: 24 kHz WAV (converted)

No resampling needed.

## Build Order: 8-Phase Roadmap

Phase 1: Core ChatterboxProvider (3-4 days)
Phase 2: Config schema & validation (2 days)
Phase 3: /config menu (2 days)
Phase 4: Device detection & GPU support (1-2 days)
Phase 5: Emotion tag support (1-2 days)
Phase 6: Error handling & fallback (2 days)
Phase 7: Integration testing (2-3 days)
Phase 8: Docs & polish (1 day)

Total: 2-3 weeks (phases can overlap)

## Dependencies

New:
- chatterbox-tts>=1.0
- torch>=2.0 (large ~2GB, CPU-only variant available)

Existing: sounddevice, numpy, soundfile

## Known Pitfalls

1. Short audio (<10s) - Degrades quality. Solution: Doc requirement, warn if <5s
2. GPU OOM - Chatterbox ~6GB VRAM. Solution: Detect VRAM, force CPU if <4GB
3. Format mismatch - MP3 with non-standard rate. Solution: Accept both, fallback
4. Race condition - Two threads init simultaneously. Solution: _lock, double-check-locking
5. Kokoro untested - Fallback path not verified. Solution: Phase 6 testing with Chatterbox uninstalled
6. Path portability - Absolute path stale on new machine. Solution: Check at startup, warn if missing

## Testing

Unit: Device detection, path validation, lazy-init, engine reset
Integration: End-to-end with reference audio, fallback chain, provider switching
Manual QA: Set path, speak, emotion tags, delete file, switch provider

## Confidence

Provider hierarchy: HIGH
Config schema: HIGH
Device detection: HIGH
Emotion tags: MEDIUM (native support confirmed, validation needed)
/config menu: HIGH
Fallback chain: HIGH
Audio playback: HIGH

## Sources

- ResembleAI/chatterbox: https://github.com/resemble-ai/chatterbox
- Chatterbox TTS Docs: https://chatterboxtts.com/docs
- Chatterbox: Open Source TTS: https://www.resemble.ai/learn/models/chatterbox
- Existing tts.py (v3.4) — Provider pattern reference
- Existing stt.py (v3.3) — Device detection pattern

Recommendation: 8 phases over 2-3 weeks. Kokoro remains fallback throughout—zero risk to existing TTS.
