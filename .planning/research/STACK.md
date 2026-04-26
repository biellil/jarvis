# Technology Stack Additions

**Project:** JARVIS v1.9 Voice Capture Modes  
**Researched:** 2026-04-25  
**Focus:** Stack additions for 3 mutually exclusive voice modes (Wake Word, Always-Listening, PTT-only)

## Executive Summary

v1.9 introduces three selectable voice capture modes via a tray menu radio button group. The existing stack (whisper.cpp STT, openwakeword wake word, Silero VAD endpoint detection) provides most infrastructure. Additions required are:

1. **VAD + Ring Buffer** — Upgrade Silero VAD to v5 for always-listening endpoint detection + circular buffer for rolling audio window
2. **LLM Intent Classifier** — Small local model (via LM Studio Phi-3/Gemma-2 or Transformers.js DistilBERT ONNX) to filter false positives ("is this utterance for JARVIS?")
3. **Electron Tray Radio Menu** — Native Electron 30+ API (no new deps) for cross-platform mode switching
4. **Audio Ring Buffer** — `ringbufferjs` for circular audio buffering without disk spill

**Zero breaking changes.** All existing v1.8 capabilities remain. New dependencies are optional and isolated behind feature flags.

---

## Recommended Stack Additions

### Voice Activity Detection (VAD) — Always-Listening Mode

| Technology | Version | Purpose | Why This |
|-----------|---------|---------|----------|
| @ricky0123/vad-web | 0.0.30+ | Silero VAD v5 in Node.js via ONNX | Already in use (v1.4), v5 has improved accuracy (87.7% TPR vs WebRTC 50% TPR) at 5% FPR. Endpoint detection: configurable negative threshold frames (~450ms pause = stop listening) |
| onnxruntime | 1.16.x+ | ONNX inference runtime (transitive via @ricky0123/vad-web) | Handles Silero ONNX models, <1ms per 30ms frame, CPU-only acceptable |

**Migration Path:**  
Currently using `@ricky0123/vad` (0.2.4, last update 2022). Upgrade to `@ricky0123/vad-web` 0.0.30+ (actively maintained, 4 months ago). Same API; benefits from v5 model improvements. Test local vs cloud inference switching.

**Configuration (new):**
```typescript
// VoiceModeManager.ts pseudo-code
interface VadConfig {
  negativeSpeechThreshold: number;  // 0.2 default, lower = longer listening window
  negativeFramesToClose: number;    // 6 @ 30ms = 180ms window (tunable)
  positive_speech_threshold: number; // 0.5 default
}
```

---

### Intent Classification — False Positive Filtering

| Technology | Version | Purpose | Why This |
|-----------|---------|---------|----------|
| @xenova/transformers | 2.6.x+ | ONNX text-classification (DistilBERT) in Node.js | 40-50ms latency per utterance (acceptable for offline), <100MB model, supports `distilbert-base-uncased` for intent. Integrates with existing transformers ecosystem. Fully local, no API calls. |
| DistilBERT ONNX (Hugging Face) | N/A | Pre-trained intent classifier | onnx-community/all-MiniLM-L6-v2-ONNX for embeddings (~22MB), or distilbert-base for classification. Two-stage: (1) embedding → cosine similarity to "is this for me?" examples, or (2) zero-shot classification of "intent: command | chatter | background". |

**Latency Profile:**  
- Encoding utterance text → embedding: ~20ms
- Similarity comparison or classification: ~10-20ms
- Total: ~40-50ms (acceptable gate before sending to LLM)

**Alternative (if LM Studio configured):**  
Use Ollama client + Phi-3 (3.8B, ~4s per utterance) or TinyLlama (1.1B, ~2s) via existing LM Studio connection. Trade-off: lower latency with Transformers.js, but requires training/tuning phrases. Use LM Studio path for "conversational" intent classifier that understands context better.

**Configuration (new):**
```typescript
// IntentClassifierConfig.ts
interface IntentConfig {
  mode: 'transformers-js' | 'lm-studio-small';
  useThreshold: boolean;             // If true, skip LLM if intent score < 0.7
  cosmicDrift: number;               // Confidence threshold (0.6-0.8)
  trainingExamples: string[];        // "hey jarvis open calc", "play music", etc.
}
```

---

### Circular Audio Buffer — Always-Listening Ring

| Technology | Version | Purpose | Why This |
|-----------|---------|---------|----------|
| ringbufferjs | 2.0.0+ | Circular buffer for rolling audio frames | Simple O(1) enqueue/dequeue, no garbage collection during realtime audio streaming. Pre-allocates fixed buffer; oldest frames discarded automatically. No disk spill by design. ~1.5KB minified. |

**Usage Pattern:**
```typescript
// VoiceInputManager.ts (always-listening mode)
const audioRing = new RingBuffer<Int16Array>(RING_SIZE_FRAMES); // e.g., 10s @ 16kHz = 160k samples

// Each 30ms frame from whisper.cpp:
audioRing.enqueue(frameBuffer);

// If VAD triggers listen:
const recent_audio = audioRing.toArray(); // Last 10s
sendToWhisper(recent_audio);
```

**Buffer Size Strategy:**
- Ring capacity: 10s @ 16kHz = 160,000 samples ≈ 320KB (raw PCM int16)
- Fits in memory, no disk I/O
- Discard on enqueue overflow (oldest frames discarded)
- Explicit `.clear()` when switching modes or user pauses

---

### Electron Tray Menu — Radio Button Mode Selector

| Technology | Version | Purpose | Why This |
|-----------|---------|---------|----------|
| Electron | 30.x (existing) | Native Menu API with radio button type | No new dependency. Tray.setContextMenu() supports `type: 'radio'` items. Mutually exclusive by design. Checked/unchecked state persists via electron-store (existing). |

**Cross-Platform Behavior:**
- **Windows**: Native radio button group in context menu. Visual style matches system theme.
- **macOS**: Native NSMenuItem with radioButton state. Mutually exclusive.
- **Linux (X11)**: GtkStatusIcon fallback; radio buttons supported. Must call `setContextMenu()` again after state change to redraw.

**Implementation (pseudo-code):**
```typescript
// TrayManager.ts
const contextMenu = Menu.buildFromTemplate([
  {
    label: 'Voice Mode',
    submenu: [
      {
        label: '🎤 Wake Word ("Hey JARVIS")',
        type: 'radio',
        checked: voiceMode === 'wake-word',
        click: () => switchVoiceMode('wake-word')
      },
      {
        label: '👂 Always-Listening (VAD)',
        type: 'radio',
        checked: voiceMode === 'always-listening',
        click: () => switchVoiceMode('always-listening')
      },
      {
        label: '⏺️  Push-to-Talk (Hotkey)',
        type: 'radio',
        checked: voiceMode === 'ptt',
        click: () => switchVoiceMode('ptt')
      }
    ]
  },
  { type: 'separator' },
  { label: 'Settings', click: () => openSettings() },
  { label: 'Quit', role: 'quit' }
]);

tray.setContextMenu(contextMenu);

// On mode change, update and re-render (Linux requirement)
function switchVoiceMode(mode: string) {
  settings.voiceMode = mode;
  contextMenu.items[0].submenu.items.forEach((item, idx) => {
    item.checked = (idx === modeIndex);
  });
  tray.setContextMenu(contextMenu); // Force redraw on Linux
}
```

**No new npm package required.** Uses Electron's native `Menu` and `Tray` classes.

---

## Implementation Strategy by Mode

### Mode 1: Wake Word (Existing, v1.4+)

✓ No changes. Reuse openwakeword + Silero VAD endpoint detection (negative threshold ~450ms).

---

### Mode 2: Always-Listening (New)

**Flow:**
1. Capture raw audio frames (16 kHz, PCM int16)
2. Feed to Silero VAD continuously (30ms chunks)
3. When VAD speech detected: accumulate frames in ring buffer
4. When VAD speech ends (negative threshold frames): trim to utterance boundaries
5. Send accumulated audio to whisper.cpp STT
6. **NEW**: On STT result, run intent classifier
7. If confidence > threshold: send to LLM; else discard (log as "filtered false positive")

**VoiceInputManager.ts changes:**
```typescript
class VoiceInputManager {
  private audioRing: RingBuffer<Int16Array>;
  private intentClassifier: IntentClassifier;
  private vadState: 'idle' | 'speaking' | 'ending';
  private negativeFrameCounter: number = 0;

  async handleAlwaysListeningFrame(frame: Int16Array) {
    // 1. Ring buffer update
    this.audioRing.enqueue(frame);

    // 2. VAD endpoint detection
    const { isSpeech, confidence } = await this.vad.process(frame);

    switch (this.vadState) {
      case 'idle':
        if (isSpeech) {
          this.vadState = 'speaking';
          this.negativeFrameCounter = 0;
        }
        break;

      case 'speaking':
        if (!isSpeech) {
          this.negativeFrameCounter++;
          if (this.negativeFrameCounter >= VAD_NEGATIVE_THRESHOLD) {
            // Speech ended
            const audio = this.audioRing.toArray();
            await this.processUtterance(audio);
            this.vadState = 'idle';
          }
        } else {
          this.negativeFrameCounter = 0;
        }
        break;
    }
  }

  private async processUtterance(audio: Int16Array) {
    // 3. STT
    const text = await whisperCpp.transcribe(audio);

    // 4. Intent classification (NEW)
    const intent = await this.intentClassifier.classify(text);
    if (intent.confidence < INTENT_THRESHOLD) {
      console.warn(`[VAD] Filtered false positive: "${text}" (score ${intent.confidence})`);
      return; // Discard
    }

    // 5. Send to LLM
    await this.sendAudioAndHandle(text);
  }
}
```

---

### Mode 3: PTT-Only

✓ Mostly existing. Disable wake word listener, reuse hotkey from v1.7 Settings. No VAD, no intent classifier.

---

## Libraries NOT Needed (Already Have Equivalents)

| What You Might Think | Already Have | Why |
|---------------------|--------------|-----|
| webrtcvad for VAD | Silero VAD v5 via @ricky0123/vad-web | Silero has 4x fewer FP errors; already working |
| Full LLM for intent (Claude/Phi-3) | LM Studio backend (tunable size) + Transformers.js (ONNX) | Transformers.js sufficient for binary classification; LM Studio fallback if needed |
| Custom TTS for "listening" feedback | Existing kokoro/Murf.ai/ElevenLabs | Reuse existing TTS pipeline for "listening..." prompt |
| Web workers for concurrent VAD | Electron main process sufficient | VAD latency <1ms per frame; no threading needed for Electron main |
| Persist ring buffer to disk | Simple enqueue/dequeue in memory | Ring buffer pre-allocates fixed size; never needs disk |

---

## Breaking Changes

**None.** All additions are behind feature flags or new code paths.

- `USE_SILERO_VAD_V5` feature flag gates @ricky0123/vad-web upgrade
- `ENABLE_INTENT_CLASSIFIER` gates intent filtering
- `VOICE_MODE` setting (electron-store) selects active mode; defaults to 'wake-word' (existing behavior)

---

## Installation Commands

```bash
# Core additions
npm install @ricky0123/vad-web@0.0.30
npm install @xenova/transformers@2.6.x
npm install ringbufferjs@2.0.0

# Optional: for Ollama intent classification path (if LM Studio small model preferred)
npm install ollama@0.5.x

# Already installed (v1.8+)
# — onnxruntime (transitive via @ricky0123/vad-web)
# — Electron 30+ (existing)
# — electron-store (existing, for persistence)
# — LangChain.js 1.x + OpenAI SDK (for LLM calls)
```

---

## Versions & Compatibility

| Package | Min Version | Current Best | Notes |
|---------|------------|--------------|-------|
| Node.js | 22 LTS (existing) | 22.x or 24.x | Transformers.js and ringbufferjs are pure JS |
| Electron | 30 (existing) | 30.x+ | Tray API stable since v1.8 |
| @ricky0123/vad-web | 0.0.30 | 0.0.30+ | Last published 4mo ago; maintained |
| @xenova/transformers | 2.6.x | 2.6.x+ | Published Jan 2026; ONNX models auto-download |
| ringbufferjs | 2.0.0 | 2.0.0 | Last update 6yr ago; stable micro-library |
| onnxruntime | 1.16.x | 1.16.x+ (transitive) | Installed by @ricky0123/vad-web |

---

## Integration Checkpoints

### Checkpoint 1: VAD + Ring Buffer
- [ ] @ricky0123/vad-web v0.0.30+ installed and tested
- [ ] ringbufferjs hooked into VoiceInputManager
- [ ] Silero VAD v5 model auto-downloads on first use
- [ ] Ring buffer discards oldest frames on overflow (test with 60s continuous audio)

### Checkpoint 2: Intent Classifier
- [ ] @xenova/transformers imported; DistilBERT ONNX model cached
- [ ] IntentClassifier wrapper class written (supports both Transformers.js + LM Studio paths)
- [ ] Latency verified <50ms on typical 3-5 word utterances
- [ ] False positive filtering tested (e.g., "play music" filtered if INTENT_THRESHOLD > 0.7)

### Checkpoint 3: Tray Mode Switcher
- [ ] Electron.Menu template updated with radio buttons
- [ ] Mode state persisted to electron-store
- [ ] Cross-platform tested (macOS, Linux X11, Windows)
- [ ] Linux: setContextMenu() called after state change

### Checkpoint 4: Voice Mode State Machine
- [ ] VoiceModeManager orchestrates mode lifecycle
- [ ] Mode switching disables/enables listeners cleanly
- [ ] Orb visual feedback per mode (colors, animations)
- [ ] User guide updated (Settings UI + tray tooltip)

---

## Confidence Assessment

| Area | Level | Rationale |
|------|-------|-----------|
| Silero VAD v5 strategy | HIGH | @ricky0123/vad-web actively maintained (4mo old), Silero ONNX proven, 4x better accuracy vs WebRTC documented |
| Intent classifier approach | MEDIUM | Transformers.js + DistilBERT is solid for binary classification, but "tuning" phrases for good accuracy requires iteration. LM Studio fallback increases confidence. |
| Electron Tray radio API | HIGH | Native API, well-documented, cross-platform quirks known (Linux redraw requirement) |
| Ring buffer strategy | HIGH | ringbufferjs stable; pattern proven in web audio worklets; no allocation overhead during streaming |

---

## Sources

- [@ricky0123/vad-web npm](https://www.npmjs.com/package/@ricky0123/vad-web)
- [GitHub ricky0123/vad](https://github.com/ricky0123/vad)
- [Silero VAD Picovoice 2026 Comparison](https://picovoice.ai/blog/best-voice-activity-detection-in-2026-cobra-vs-silero-vs-webrtc-vad/)
- [@xenova/transformers npm](https://www.npmjs.com/package/@xenova/transformers)
- [Transformers.js Hugging Face Docs](https://huggingface.co/docs/transformers.js/index)
- [DistilBERT ONNX Latency (Medium)](https://medium.com/expedia-group-tech/accelerating-nlp-model-inferencing-with-distillbert-onnx-23edd7e187b5)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [ringbufferjs npm](https://www.npmjs.com/package/ringbufferjs)
- [GitHub padenot/ringbuf.js (lock-free reference)](https://github.com/padenot/ringbuf.js/)
- [Ollama Local LLM Node.js Integration](https://oneuptime.com/blog/post/2026-01-27-ollama-local-llm-inference/)

