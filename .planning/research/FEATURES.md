# Feature Landscape: Emotional Voice Cloning TTS

**Domain:** Offline text-to-speech with zero-shot voice cloning and emotion control  
**Project:** JARVIS v3.5 Emotional Voice Cloning TTS milestone (apps/desktop-py)  
**Researched:** 2026-05-28  
**Overall Confidence:** MEDIUM

## Executive Summary

JARVIS v3.5 replaces Kokoro with Chatterbox TTS, adding zero-shot voice cloning from reference audio and emotion control via inline tags. The ecosystem (Chatterbox, Orpheus, CosyVoice2, Fish Audio) converges on two features:

1. **Voice Cloning:** 5–15s reference audio file → instant voice adaptation (no retraining)
2. **Emotion Tags:** Inline brackets `[angry]`, `[whispering]`, etc. map to parameter adjustments (exaggeration, cfg_weight, speed)

Table stakes: reference audio file picker in `/config`, Chatterbox synthesis with cloned voice. Differentiators: emotion tag dropdown in config, real-time tag validation. Anti-features: web UI, voice mixing, custom emotion training.

## Table Stakes

Features users expect in a voice cloning + emotion TTS system. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Zero-shot voice cloning from reference audio** | All modern TTS (Chatterbox, Orpheus, CosyVoice2, Fish Audio) support it; users expect passable synthesis from a short clip | Medium | Baseline: 5–15s reference audio; auto-transcribe via Whisper if needed (MEDIUM confidence) |
| **Emotion control via inline tags** | ElevenLabs v3, Fish Audio, Orpheus, CosyVoice2 all expose emotion as first-class feature; users expect `[angry]` in text to work | Medium | Format: square brackets `[tag_name]`. Chatterbox v0.x doesn't recognize tags natively; JARVIS maps them to parameters (HIGH confidence) |
| **Emotion intensity parameter** | Chatterbox/CosyVoice2/Fish S2 expose dial to control "drama"; default should be neutral/moderate | Low | Single parameter (exaggeration 0.0–1.0+, default 0.5). (HIGH confidence) |
| **Voice conformity control** | Chatterbox `cfg_weight` balances fidelity to reference vs. handling novel words; essential for production voice cloning | Low | 0.3–0.7 range typical; interactions with emotion intensity documented. (MEDIUM confidence) |
| **Fallback to offline Kokoro** | v3.4 shipped Kokoro; users expect Chatterbox errors → graceful degrade without crash | Low | Already implemented in tts.py speak() chain (Phase 75). (HIGH confidence) |
| **Reference audio file picker in /config** | Users don't memorize paths; browse filesystem + store selection | Medium | UX: button → file dialog → path persisted in JarvisConfig. (MEDIUM confidence) |

## Differentiators

Features that set product apart. Not expected universally, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Emotion tag dropdown in /config** | Pre-configured emotion preset (Default/Angry/Whispering/...); one-click override | Low | Dropdown applies emotion → exaggeration multiplier automatically. (MEDIUM confidence) |
| **Real-time emotion tag validation** | Pre-parse text for `[tag]` patterns; warn on unknown tags before synthesis | Low | Regex highlight in chat output or preview panel. (LOW confidence—no offline TTS reference) |
| **Voice profile persistence** | Save voice ID + settings as named profile (e.g., "calm_review_voice") | Medium | JSON in config: reference audio path + exaggeration + cfg_weight + speed. (MEDIUM confidence) |
| **Speed parameter in /config** | Slider 0.8–1.2 to compensate for emotion-driven acceleration | Low | Emotion tags naturally accelerate speech; speed control balances delivery. (MEDIUM confidence) |
| **Audio normalization warning** | Check reference audio RMS; warn if too quiet/loud | Low | Pre-synthesis check; suggest re-record if dB out of range. (LOW confidence—exploratory) |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Web UI for audio upload** | Scope creep; Python Desktop is terminal-based. Audio upload goes through /config file picker, not separate web interface | Keep unified `/config` menu → "Select reference audio" button |
| **Multiple simultaneous voices (voice mixing)** | Chatterbox synthesizes 1 voice per call; mixing requires downstream audio blending. Deferred to v3.6+ | Generate TTS with single selected voice; audio mixing is separate downstream concern |
| **Training custom emotion models** | All systems use pre-trained emotion tags baked into model weights; fine-tuning is 10x+ complexity | Use Chatterbox's pre-trained emotion categories; tags are inference-only |
| **Real-time parameter sliders during playback** | Synthesis is blocking (sounddevice.wait()); live parameter injection unsupported | Synthesize once with parameters; stop + regenerate if user wants different emotion |
| **Streaming emotion tag parsing** | Chatterbox is atomic—takes full text, returns full audio; mid-stream parsing unsupported | Emit full response before synthesis; TTS sees complete text with tags embedded |
| **Chatterbox proprietary emotion tags** | Chatterbox v0.x doesn't natively recognize `[tag]` in text; implementing proprietary format couples to model version | Use tags as JARVIS-internal markers; map to cfg_weight/exaggeration/speed at synthesis time |

## Feature Dependencies

```
Reference Audio File Selection → Chatterbox Cloning Parameters
                                    ↓
                            Emotion Tag Parsing
                                    ↓
                        Emotion → Parameter Mapping
                        (exaggeration/cfg_weight/speed)
                                    ↓
                            Chatterbox Synthesis
                                    ↓
                            Audio Playback (sounddevice)
```

- Voice cloning (reference audio) is independent of emotion tags — either can be used alone or together
- Emotion tags are optional — text without brackets uses defaults (exaggeration=0.5, cfg_weight=0.5, speed=1.0)

## MVP Recommendation

**Phase 1 (Core Voice Cloning + Basic Emotion):**

1. **Chatterbox TTS provider in tts.py** — Add `_chatterbox_speak()` function; load model at `init_tts()`; call with reference audio if configured; fallback to Kokoro on error. **[Table stakes]**

2. **Reference audio file picker in /config** — New menu section "TTS Voice Cloning" with button "[Select File...]" → file dialog → store path in `JarvisConfig.chatterbox_reference_audio`. Display filename + duration if audio library available. **[Table stakes]**

3. **8 emotion tags as inline markers** — Document tags for text input: `[angry]`, `[whispering]`, `[sad]`, `[soft]`, `[embarrassed]`, `[breathy]`, `[emphasis]`, `[excited]`. No synthesis-time validation yet — tags present in text, parsed for parameter control. **[Table stakes]**

4. **Static emotion → parameter mapping** — Parse text for first recognized tag; apply exaggeration/cfg_weight/speed from mapping table (see below). Default to neutral (exaggeration=0.5, cfg_weight=0.5, speed=1.0) if no tag or unknown tag. **[Table stakes]**

5. **Fallback chain** — Chatterbox → (error) → Kokoro. Existing tts.py speak() chain unchanged. **[Already shipped Phase 75]**

**Phase 2 (Optional Post-MVP):**
- Emotion tag dropdown in /config (pre-configured preset)
- Real-time emotion tag highlighting in terminal chat
- Voice profile persistence (save cloning settings)
- Speed parameter slider in /config (0.8–1.2 range)

**Defer to v3.6+:**
- Emotion tag inference via LLM ("I'm furious!" → [angry])
- Multiple voice profiles with A/B preview
- Audio normalization UX

## Emotion Tag → Parameter Mapping Table

Maps JARVIS's 8 emotion tags to Chatterbox parameters. Apply exaggeration multiplier to default (0.5); cfg_weight and speed override for specific emotions.

| Tag | Semantics | Exaggeration | cfg_weight | speed | Rationale |
|-----|-----------|--------------|------------|-------|-----------|
| `[angry]` | Heightened energy, sharp tone, faster pace | 0.8 | 0.5 | 1.1 | Increased exaggeration + slight speed-up mimics irritated delivery |
| `[whispering]` | Soft, intimate, low volume, conspiratorial | 0.3 | 0.5 | 0.9 | Low exaggeration + slow-down ensures intelligibility in quiet voice |
| `[sad]` | Melancholic, downturned prosody, slower | 0.4 | 0.5 | 0.85 | Moderate exaggeration + reduced speed conveys resignation |
| `[soft]` | Gentle, careful articulation, reduced energy | 0.2 | 0.5 | 0.95 | Minimal exaggeration; near-neutral but intentional care |
| `[embarrassed]` | Uncertain, quiet, apologetic undertone | 0.3 | 0.5 | 0.9 | Low exaggeration + reduced speed; similar to whispering but less conspiratorial |
| `[breathy]` | Intimate, aspirated, vulnerable tone | 0.35 | 0.4 | 0.95 | Lower cfg_weight allows more synthesis flexibility; reduced speed |
| `[emphasis]` | Strong stress, deliberate, loud | 0.7 | 0.5 | 1.0 | High exaggeration without speed increase; maintains clarity |
| `[excited]` | Energetic, upbeat, rapid, bright | 0.75 | 0.5 | 1.15 | High exaggeration + faster pace sustained until punctuation |

**Rationale:**
- **Exaggeration (0.2–0.8):** Chatterbox default 0.5 (neutral). Values <0.2 lose color; >0.8 risk artifacts. Range tested in Chatterbox v0.x docs.
- **cfg_weight (0.4–0.5):** Only `[breathy]` drops to 0.4 to allow creative freedom; others default 0.5 (balanced voice fidelity). Higher = more creative but less stable.
- **Speed (0.85–1.15):** Emotional speech naturally varies. `[angry]`/`[excited]` speed up (~10%); `[sad]` slows (~15%); others minimal.
- **Interaction:** High exaggeration + low cfg_weight = more creative synthesis but less predictable. Document in /config tooltip.

## Implementation Detail: Tag Parsing

Emotion tags enclosed in square brackets: `[tag_name]`. Examples:

```
"I'm [angry] about this!"
    ↓ parse [angry]
    ↓ apply exaggeration=0.8, cfg_weight=0.5, speed=1.1
    ↓ call chatterbox(..., exaggeration=0.8, cfg_weight=0.5, speed=1.1)

"[whispering] don't tell anyone"
    ↓ parse [whispering]
    ↓ apply exaggeration=0.3, cfg_weight=0.5, speed=0.9
    ↓ synthesize with quiet, intimate delivery

"That's [emphasis] important."
    ↓ parse [emphasis]
    ↓ apply exaggeration=0.7, cfg_weight=0.5, speed=1.0
    ↓ synthesize with strong stress on "important"
```

**Parsing algorithm (Python pseudo-code):**

```python
import re

EMOTION_MAP = {
    'angry': {'exaggeration': 0.8, 'cfg_weight': 0.5, 'speed': 1.1},
    'whispering': {'exaggeration': 0.3, 'cfg_weight': 0.5, 'speed': 0.9},
    'sad': {'exaggeration': 0.4, 'cfg_weight': 0.5, 'speed': 0.85},
    'soft': {'exaggeration': 0.2, 'cfg_weight': 0.5, 'speed': 0.95},
    'embarrassed': {'exaggeration': 0.3, 'cfg_weight': 0.5, 'speed': 0.9},
    'breathy': {'exaggeration': 0.35, 'cfg_weight': 0.4, 'speed': 0.95},
    'emphasis': {'exaggeration': 0.7, 'cfg_weight': 0.5, 'speed': 1.0},
    'excited': {'exaggeration': 0.75, 'cfg_weight': 0.5, 'speed': 1.15},
}

def extract_emotion_tag(text: str) -> dict:
    """Extract first recognized emotion tag from text; return parameter dict."""
    pattern = r'\[([a-z_]+)\]'
    matches = re.findall(pattern, text, re.IGNORECASE)
    
    for tag in matches:
        tag_lower = tag.lower()
        if tag_lower in EMOTION_MAP:
            return EMOTION_MAP[tag_lower]
    
    # Default: neutral emotion
    return {'exaggeration': 0.5, 'cfg_weight': 0.5, 'speed': 1.0}
```

**Important:** Text passed to Chatterbox includes tags as-is. Chatterbox v0.x does not recognize `[tag]` natively; tags are JARVIS-internal markers for parameter control.

## /config Menu UX Flow

Extends existing menu structure (Phase 77: Whisper model, TTS provider, voice mode, voice preset):

```
=== JARVIS Config ===

1. [x] Whisper Model: base
2. [x] TTS Provider: kokoro
3. [x] Voice Mode: wake-word
4. [x] TTS Voice Preset: pf_dora
   
→ NEW SECTION: TTS Voice Cloning

   a) Reference Audio File: [Select File...]
      Current: /home/user/voice_ref.wav (23s)
      [Button]  (triggers file picker dialog)
      
   b) Emotion Preset: [Dropdown ▼]
      Options: Default (neutral) | Angry | Whispering | Sad | Soft | 
               Embarrassed | Breathy | Emphasis | Excited
      Selected: Default
      → On change: apply emotion → exaggeration multiplier
      
   c) Voice Intensity (Exaggeration): [Slider] 0.5
      Range: 0.0 (neutral) ← → 1.0 (dramatic)
      Tooltip: "0.2=barely noticeable; 0.5=default; 0.8=very expressive"
      
   d) Voice Fidelity (cfg_weight): [Slider] 0.5
      Range: 0.3 (creative) ← → 0.7 (conservative)
      Tooltip: "Higher=closer to reference voice; Lower=more flexible"

[Save] [Cancel] [Test Voice] (optional: preview button)
```

## Dependencies on Existing Infrastructure

- **tts.py speak() chain** (Phase 75): Extends with `_chatterbox_speak()` function. Existing fallback logic unchanged.
- **/config menu** (Phase 77): Add new sub-section for voice cloning config. Terminal UI (rich Console) already exists.
- **JarvisConfig Pydantic schema** (Phase 78): Extend with:
  ```python
  chatterbox_reference_audio: Optional[Path] = None
  chatterbox_exaggeration: float = 0.5
  chatterbox_cfg_weight: float = 0.5
  chatterbox_speed: float = 1.0
  chatterbox_emotion_preset: str = "default"  # Or skip if using exaggeration slider
  ```
- **File picker library:** tkinter (stdlib) or pathlib + manual terminal input (if tkinter unavailable)

## Ecosystem Emotion Tag Landscape

Other offline TTS systems for reference (not implemented, but inform design):

| System | Format | Tags | Intensity | cfg_weight equivalent |
|--------|--------|------|-----------|----------------------|
| **Chatterbox** | `[tag]` brackets | Not native (v0.x); tags are JARVIS metadata | exaggeration (0–1+) | cfg_weight (0.3–0.7) |
| **Fish Audio S1** | `(tag)` parentheses | 64+ emotions (happy, sad, angry, excited, ...) | (included in tag) | (included in tag) |
| **Fish Audio S2** | `[natural language]` brackets | 15,000+ free-form descriptions | (free-form) | (free-form) |
| **Orpheus** | `<tag>` angle brackets | 8 tags: laugh, chuckle, sigh, cough, sniffle, groan, yawn, gasp | (included in tag) | (none documented) |
| **CosyVoice2** | Embedded instructions + emoji | emotion, accent, role, fine-grained control | Intensity slider (0–100) | (implicit in instruction) |

**JARVIS v3.5 uses Chatterbox format ([brackets]) because:**
1. Aligns with ElevenLabs v3 + Fish Audio S2 (bracket syntax familiar to users)
2. Decouples JARVIS emotion tags from Chatterbox model (future model upgrade won't break UX)
3. Enables parameter mapping independent of model — same UI/config works if switching to Orpheus/CosyVoice2

## Known Pitfalls

1. **Chatterbox model download (2.5–3.5GB).** Phase needs network, storage space, and download progress feedback.
2. **Reference audio quality.** Low-quality, noisy reference audio produces low-quality cloned voices. Recommend 10–15s of clean speech at normal volume.
3. **Emotion parameter interaction.** Higher exaggeration + lower cfg_weight = unstable. Document defaults as safe starting point.
4. **Tag parsing edge cases.** Multiple tags in same text → apply first recognized tag. Tags at sentence boundaries (e.g., `. [angry]`) may not parse correctly with naive regex.
5. **Speed + emotion interaction.** Some emotion tags already include implicit speed (e.g., [angry] → faster). Stacking speed parameter may over-accelerate. Document interaction.
6. **Reference audio file path validation.** User selects non-existent file (deleted after config) → synthesis fails. Add file existence check at speak() time with clear error message.

## Sources

- [Chatterbox GitHub](https://github.com/resemble-ai/chatterbox) — Zero-shot cloning, cfg_weight/exaggeration parameters (HIGH confidence)
- [Chatterbox Configuration Guide](https://yocxy2-chatterboxyocxy.mintlify.app/guides/configuration) — Default values, ranges, interactions (MEDIUM confidence)
- [Fish Audio Emotion Reference](https://docs.fish.audio/api-reference/emotion-reference) — 64+ S1 tags, S2 free-form format (HIGH confidence)
- [ElevenLabs v3 Audio Tags User Guide](https://jonathanmast.com/elevenlabs-v3-text-to-speech-user-guide/) — Inline emotion tag UX patterns (MEDIUM confidence)
- [CosyVoice2 Documentation](https://funaudiollm.github.io/cosyvoice2/) — Emotion intensity slider, instruction embedding (MEDIUM confidence)
- [Orpheus TTS GitHub](https://github.com/canopyai/Orpheus-TTS) — Emotion tags as first-class trained feature (MEDIUM confidence)
- [Qwen3-TTS Voice Cloning Guide 2026](https://ocdevel.com/blog/20260302-qwen-tts-voice-cloning) — Reference audio specs 10–15s optimal (MEDIUM confidence)
- [XTTS-v2 Voice Cloning Docs](https://huggingface.co/coqui/XTTS-v2) — 6–15s audio, caching, Whisper transcription (MEDIUM confidence)
- [TTS WebUI GitHub](https://github.com/rsxdalv/TTS-WebUI) — Configuration patterns, file path handling (LOW confidence—web-based)
