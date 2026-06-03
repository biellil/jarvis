# Technology Stack: Chatterbox TTS Integration

**Project:** JARVIS v3.5 — Emotional Voice Cloning TTS  
**Researched:** 2026-05-28  
**Scope:** `apps/desktop-py` TTS provider addition

## Executive Summary

Chatterbox-TTS is production-ready MIT-licensed TTS requiring PyTorch 2.6 with fixed dependency pins. **Critical conflict:** torch==2.6.0 incompatible with ctranslate2 (faster-whisper dependency). Mitigation: install with `--no-deps`, manage torch separately. Voice cloning requires 5-10s reference WAV; emotion control via paralinguistic tags ([laugh], [angry]) is Turbo-native. Fallback to Kokoro when unavailable. **Recommendation: Add as optional dependency, not primary TTS.**

## Recommended Stack

| Technology | Version | Purpose | Why |
|-----------|---------|---------|-----|
| chatterbox-tts | 0.1.7 | Open-source TTS with voice cloning + emotion tags | MIT licensed, zero-shot cloning, <200ms latency |
| torch | 2.6.0 | PyTorch runtime (install separately) | Pinned by chatterbox-tts; conflict with faster-whisper's ctranslate2 |
| torchaudio | 2.6.0 | Audio I/O for Chatterbox | Matched version with torch 2.6.0 |
| librosa | 0.10.0+ | Reference audio preprocessing | Required by chatterbox-tts; already in voice-cloning group |

## Dependencies Cascade

```
chatterbox-tts==0.1.7
├─ torch==2.6.0 [PINNED EXACT]
├─ torchaudio==2.6.0
├─ librosa>=0.9.0
├─ transformers>=4.0
├─ diffusers
├─ safetensors
├─ pykakasi (Japanese tokenizer - not needed for English)
├─ conformer
├─ s3tokenizer
├─ pyloudnorm
├─ omegaconf
├─ gradio (Demo UI - not needed)
└─ resemble-perth (watermarking)
```

## Installation

### Recommended: Separate torch, avoid conflicts

```bash
# Add to pyproject.toml:
voice-cloning-chatterbox = [
    "torch>=2.6.0,<2.7",
    "torchaudio>=2.6.0,<2.7",
    "chatterbox-tts==0.1.7",
    "librosa>=0.10.0",
]

# Or CLI:
uv pip install torch==2.6.0 torchaudio==2.6.0
uv pip install chatterbox-tts==0.1.7
```

### What NOT to do:
- AVOID: pip install chatterbox-tts with existing torch (version negotiation → faster-whisper incompatibility)
- AVOID: pip install chatterbox-tts[turbo] (Turbo not an extras group)

## GPU/Inference Requirements

### Model Specs

| Variant | Parameters | VRAM | Latency |
|---------|-----------|------|---------|
| **Chatterbox-Turbo** | 350M | 4-8 GB (min); 8+ (comfortable) | <150ms first-token; ~75ms sustained (RTX 4090) |
| Multilingual | 500M | 8+ GB | ~200-250ms |
| Original | 500M | 8+ GB | ~200-250ms |

**For desktop:** Turbo recommended — smaller, faster, native paralinguistic tags.

### Device Auto-Detection

```python
def _detect_device():
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    else:
        return "cpu"

model = ChatterboxTurboTTS.from_pretrained(device=_detect_device())
```

**CPU Performance:** ~20x slower than GPU. 30s audio takes ~1 min. Acceptable for desktop with warning.

### Memory Overhead

- Model: ~1.4 GB (Turbo)
- Inference batch: ~500 MB (20s text)
- Voice cloning reference: +200 MB
- **Total peak:** ~2 GB

Compatible with 4 GB GPU; recommend 8+ GB for smooth concurrent use.

## Emotion & Voice Cloning

### Paralinguistic Tags (Turbo-Native)

```python
text = "Hello [laugh], I'm [angry] about this!"
```

**Available tags:**
- Emotions: [angry], [happy], [sad], [surprised], [dramatic], [sarcastic]
- Sounds: [cough], [laugh], [chuckle], [gasp], [groan], [sniff], [shush], [sigh], [clear throat]

**Mapping for v3.5 milestone:**

| Feature | Implementation |
|---------|-----------------|
| [angry] | Native [angry] |
| [whispering] | [shush] or lower exaggeration |
| [sad] | Native [sad] |
| [soft] | Lower exaggeration (0.1-0.3) |
| [emphasis] | [dramatic] or exaggeration=0.7+ |
| [excited] | [happy] + exaggeration=0.8+ |

**Key limitation:** Tag-based + exaggeration parameter (0.0=monotone, 1.0=dramatic). Not continuous emotion descriptors.

### Zero-Shot Voice Cloning

```python
from chatterbox.tts_turbo import ChatterboxTurboTTS
import torchaudio as ta

model = ChatterboxTurboTTS.from_pretrained(device="cuda")

wav = model.generate(
    text="Hello, speaking in your cloned voice [happy]!",
    audio_prompt_path="/path/to/reference.wav",
    exaggeration=0.5,
)

ta.save("output.wav", wav, model.sr)  # sr=24000 Hz
```

**Reference requirements:**
- Format: WAV, MP3, or torchaudio-compatible
- Duration: 5-10 seconds (10s optimal)
- Quality: Clear, single speaker, minimal noise
- Permission: Required to clone

## Conflict Analysis

### Critical: torch==2.6.0 × ctranslate2 (faster-whisper)

**Problem:**
- chatterbox-tts==0.1.7 → torch==2.6.0
- faster-whisper==1.2.1 → ctranslate2==4.x
- ctranslate2 compiled for torch 2.4.x; ABI mismatch → crash

**Mitigation (RECOMMENDED):**

1. Install chatterbox-tts with `--no-deps`:
   ```bash
   pip install chatterbox-tts==0.1.7 --no-deps
   pip install librosa>=0.10.0 safetensors transformers diffusers
   ```

2. Keep torch unified between STT and TTS

3. Validate on init:
   ```python
   def _check_tts_deps():
       try:
           from chatterbox.tts_turbo import ChatterboxTurboTTS
           return True
       except ImportError as e:
           logger.warning(f"Chatterbox unavailable: {e}. Fallback to Kokoro.")
           return False
   ```

### Minor: torch + torchaudio version mismatches

**Mitigation:** Pin both:
```
torch==2.6.0
torchaudio==2.6.0
```

## What NOT to Add

| Avoid | Why |
|-------|-----|
| gradio | Demo UI; not needed for library. 15+ MB. |
| pykakasi | Japanese tokenizer; Chatterbox English-only. |
| ctranslate2 2.6 binaries | Not released yet (as of 2026-05-28). |
| Multiple torch versions | Leads to ABI conflicts. |

## Fallback Strategy

**Current:** Kokoro → ElevenLabs → Murf

**New (v3.5):** Chatterbox → Kokoro → ElevenLabs → Murf

```python
def set_provider(provider: str):
    global _tts_provider
    
    if provider == "chatterbox":
        try:
            _init_chatterbox()
            _tts_provider = "chatterbox"
        except ImportError:
            logger.warning("Chatterbox unavailable. Falling back to Kokoro.")
            _init_kokoro()
            _tts_provider = "kokoro"
```

## Version Compatibility Matrix

| Package | Version | Min Python |
|---------|---------|-----------|
| chatterbox-tts | 0.1.7 | 3.10 |
| torch | 2.6.0 | 3.9 |
| torchaudio | 2.6.0 | 3.9 |
| librosa | 0.10.0+ | 3.8 |
| faster-whisper | 1.2.1 | 3.9 |
| Python (env) | 3.12 | — |

Status: ✅ Compatible at Python 3.12; ⚠️ torch conflict (mitigated by --no-deps).

## Audio Output Format

| Property | Value |
|----------|-------|
| Format | WAV (PCM) |
| Sample Rate | 24 kHz |
| Bit Depth | 16-bit |
| Channels | Mono |
| Latency | <150ms first-token, ~75ms sustained |

## Sources

- [chatterbox-tts on PyPI](https://pypi.org/project/chatterbox-tts/)
- [GitHub: resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox)
- [Chatterbox-Turbo on Hugging Face](https://huggingface.co/ResembleAI/chatterbox-turbo)
- [Chatterbox Turbo: Open Source TTS](https://www.resemble.ai/chatterbox-turbo/)
- [Performance & VRAM Requirements](https://www.communeify.com/en/blog/resemble-ai-chatterbox-turbo-opensource-tts-realism-performance/)
- [PyTorch Audio 2.6.0 Installation](https://docs.pytorch.org/audio/2.6.0/installation.html)
- [Chatterbox TTS Server with Device Auto-Detection](https://github.com/devnen/Chatterbox-TTS-Server)
