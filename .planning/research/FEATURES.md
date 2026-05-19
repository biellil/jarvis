# Feature Landscape: Python Desktop Client (apps/desktop-py/)

**Project:** JARVIS v3.2 Python Thin Client
**Researched:** 2026-05-17
**Overall confidence:** MEDIUM

## Executive Summary

The Python desktop client should follow a **terminal-first, incremental build strategy**, mirroring voice capabilities from the existing Electron desktop while remaining agnostic to UI. Each phase adds a concrete capability (text chat → STT → TTS → voice modes → minimal status UI) with clear table-stakes features.

Terminal-first doesn't mean "ugly" — libraries like `rich`, `prompt-toolkit`, and `textual` enable sophisticated status indicators and minimal UIs without leaving the terminal. Python ecosystem (faster-whisper 1.2.1, kokoro 0.9.4+, openwakeword, sounddevice) is production-ready (2025–2026 verified).

## Phase 1: Terminal Chat (Text Only)

**Goal:** User types questions in terminal, sees token-by-token responses streamed from backend.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Read `~/.env` for gateway URL & API keys | Foundation | Low | Pydantic BaseSettings |
| POST /api/chat streaming (SSE) | Core loop | Low | httpx AsyncClient |
| Display response token-by-token | UX: immediate feedback | Low | sys.stdout or rich Live |
| Multiline input prompt | Power-user: multi-line questions | Low | prompt-toolkit Session |
| History to SQLite | Cross-session context | Medium | chat_history table |

### Technical

- **Framework:** asyncio + httpx.AsyncClient
- **Config:** Pydantic BaseSettings reads ~/.env
- **Output:** rich Console + prompt-toolkit Session
- **Storage:** SQLite (backend manages memory, client stores history)

### Dependencies

```
httpx[http2]
pydantic-settings
rich
prompt-toolkit
```

---

## Phase 2: Speech-to-Text (STT)

**Goal:** Hold hotkey, speak, see transcribed text before sending.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hotkey starts recording | PTT control | Medium | pynput (cross-platform) |
| sounddevice mic → NumPy array | Audio capture | Low | No PyAudio conversion pain |
| faster-whisper offline | Privacy-first STT | Medium | Download to ~/.cache/jarvis/whisper/ |
| Display inferred text | Review before send | Low | rich Panel |
| Auto-send on VAD silence (2s) | Natural flow | Medium | Silence timer |

### Technical

- **Hotkey:** pynput (or pyxdotool on Linux)
- **Audio:** sounddevice.rec() → NumPy
- **STT:** faster-whisper 1.2.1 (CTranslate2 backend, 4x speedup)
- **VAD:** Silero-vad (silero-vad package) or faster-whisper's built-in

### Dependencies

```
pynput
faster-whisper
sounddevice
silero-vad
```

---

## Phase 3: Text-to-Speech (TTS)

**Goal:** Responses read aloud via kokoro (offline) with fallback to ElevenLabs/Murf (cloud).

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Kokoro local TTS (82M, 350MB) | Offline, no API key | Medium | kokoro 0.9.4+ via ONNX |
| Audio playback via sounddevice | Cross-platform | Low | sounddevice.play() |
| Cloud fallback (ElevenLabs/Murf) | Robustness | Medium | httpx POST on failure |
| TTS provider config selector | User choice | Low | config tts_provider |
| Stream by sentences | Real-time feel | Medium | Split by [.!?], queue async |

### Technical

- **Local:** kokoro (0.9.4+) via ONNX Runtime
- **Cloud:** httpx POST to ElevenLabs (ELEVENLABS_API_KEY)
- **Playback:** sounddevice.play() or callback for async
- **Streaming:** Regex split by sentence, parallel TTS + playback

### Dependencies

```
kokoro
onnxruntime
soundfile
```

---

## Phase 4: Voice Capture Modes

**Goal:** Three mutually exclusive modes: wake-word (hands-free), PTT (hotkey), disabled (text-only).

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Wake-word: "Hey JARVIS" always-listening | Hands-free convenience | High | openwakeword + Silero VAD + ring buffer |
| PTT mode: hotkey toggles | User control | Medium | Reuse Phase 2 hotkey |
| Disabled: text-only | Accessibility | Low | Config flag |
| Mode switching (runtime, no restart) | UX fluidity | Medium | Menu option set voice_mode |
| Visual mode indicator | Context | Low | Status line badge |

### Technical

- **Wake word:** openwakeword (0.6.x) ONNX (~10MB)
- **VAD:** silero-vad ONNX (300–800ms threshold, configurable)
- **Ring buffer:** 500ms pre-roll (prevents cutting initial phonemes)
- **State machine:** Python enum + atomicity guard

### Dependencies

```
openwakeword
silero-vad
```

---

## Phase 5: Minimal UI (Status + Config)

**Goal:** Status bar showing [VOICE MODE] [MODEL] [STATE], config menu for settings without editing files.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Status bar (mode + model + state) | Context at a glance | Medium | rich Table or textual StatusBar |
| Live state machine (IDLE → LISTENING → TRANSCRIBING → THINKING → SPEAKING) | Progress feedback | Medium | Event emitter + redraw |
| Config menu (Whisper model, TTS provider, voice mode) | Non-file settings | Medium | prompt-toolkit Menu or textual |
| Graceful shutdown (Ctrl+C, cleanup) | Resource cleanup | Low | Signal handler |
| Help text (keyboard shortcuts) | Discoverability | Low | rich Panel |

### Technical

- **Status bar:** rich Table (simple) or textual StatusBar (reactive)
- **Config menu:** prompt-toolkit Session with Menu, or textual Screen
- **State machine:** Python enum + asyncio.Event
- **Persistence:** TOML config (~/.config/jarvis/settings.toml)

### Dependencies

```
rich[jupyter]
textual  # Optional: heavier but more polished UI
tomli
tomli-w
```

---

## Build Order & Dependencies

```
Phase 1 (Terminal Chat)
  ↓ (requires /api/chat endpoint)
Phase 2 (STT)
  ↓ (requires response streaming)
Phase 3 (TTS)
  ↓ (requires both STT + TTS)
Phase 4 (Voice Modes)
  ↓ (wraps voice components)
Phase 5 (Minimal UI)
```

Phases 1–3 must be serial. Phase 4 refactors voice input. Phase 5 wraps all with status display.

---

## MVP Recommendation

**Tier 1 (MVP):**
1. Terminal chat + streaming display
2. STT hotkey + faster-whisper
3. TTS kokoro + ElevenLabs fallback
4. Basic status line (mode badge)

**Tier 2 (v3.2+):**
5. Wake-word always-listening (openwakeword + VAD)
6. Config menu for model/provider/mode
7. Multi-turn voice (post-TTS listen window)

**Tier 3 (defer):**
- Mode hotkey cycling
- Intent classifier for false positive suppression
- Audio feedback (beeps)
- Systemd daemon mode

---

## Effort Estimates

| Phase | Complexity | Days | Risk |
|-------|-----------|------|------|
| Phase 1 (Terminal chat) | Low | 1–2 | None — httpx + rich stable |
| Phase 2 (STT hotkey + faster-whisper) | Medium | 3–5 | Hotkey portability (pynput finicky on Linux) |
| Phase 3 (TTS kokoro + fallback) | Medium | 2–3 | ONNX runtime compatibility, 350MB download |
| Phase 4a (Wake-word openwakeword) | High | 3–5 | Model accuracy, false positives on noise |
| Phase 4b (Voice mode state machine) | Medium | 2–3 | Race conditions, atomic mode switches |
| Phase 5a (Status UI) | Medium | 2–3 | Terminal redraw perf, async updates |
| Phase 5b (Config menu) | Medium | 2–3 | prompt-toolkit vs textual UX |

---

## Anti-Features: What NOT to Build

| Anti-Feature | Why Avoid | Instead |
|--------------|-----------|---------|
| Electron/Node.js port | Violates thin-client constraint | Keep Python, proxy to TS backend |
| Local LLM in client | Backend-ts already does LLM | POST /api/chat, stream inference |
| Complex UI (tabs, panels) | Minimize scope — focus on voice | Keep terminal minimal |
| Web UI (Streamlit/Gradio) | Overkill for terminal-first | Use TUI (rich/textual) only |
| MCP Server in client | Scope creep | Client consumes /api/chat only |
| PC control tools | Electron + backend-ts have this | Focus on voice UX |
| Audio DSP (librosa, SoX) | Use established libs | sounddevice + faster-whisper + kokoro |

---

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Core stack (httpx, faster-whisper, kokoro) | HIGH | Production-ready (2025–2026) |
| Terminal UI (rich, prompt-toolkit) | MEDIUM | Stable but terminal edge cases exist (width, color support) |
| Hotkey portability (pynput) | MEDIUM | Cross-platform but finicky on Linux with WMs |
| Wake-word accuracy (openwakeword) | MEDIUM | Offline → accuracy/privacy tradeoff; may need tuning |
| Async audio pipeline | MEDIUM | Few wild examples; needs integration testing |
| Voice mode state machine | HIGH | Electron v1.9+ proved this works |

---

## Known Pitfalls

1. **Hotkey conflicts (Linux/macOS):** pynput may fail if WM grabs keys. Fallback to text input.
2. **Sounddevice latency (Windows):** Audio drivers introduce 100–200ms lag. Use small blocksize.
3. **Kokoro ONNX mismatch:** Version compatibility between kokoro + onnxruntime. Test on CI.
4. **Rich terminal width:** Narrow terminals (<80 cols) may break status bar. Add min-width check.
5. **VAD false negatives:** Silero VAD default 0.5 may miss whispers. Make threshold configurable 0.3–0.9.

---

## Sources & References

- [Building a Local Voice AI Stack: Whisper + Ollama + Kokoro TTS (DEV Community, 2025)](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0)
- [Real Time LLM Voice Chat In Python (Medium, Prince Krampah)](https://medium.com/@princekrampah/real-time-llm-voice-chat-in-python-kokoro-moonshine-open-source-models-6c6270cbe967)
- [voice-chat-ai: Speak with AI (GitHub, bigsk1)](https://github.com/bigsk1/voice-chat-ai)
- [Speech Recognition in Python: Complete 2026 Guide (Picovoice)](https://picovoice.ai/blog/python-speech-recognition/)
- [Building Python CLIs with rich user interfaces (W3 Computing, 2025)](https://www.w3computing.com/articles/python-clis-rich-user-interfaces-prompt-toolkit/)
- [Rich Library Documentation](https://rich.readthedocs.io/)
- [Prompt Toolkit Documentation](https://python-prompt-toolkit.readthedocs.io/)
- [Python Textual: Build Beautiful UIs in Terminal (Real Python)](https://realpython.com/python-textual/)
- [10 Best Python TUI Libraries for 2025 (Towards Data Engineering, Medium)](https://medium.com/towards-data-engineering/10-best-python-text-user-interface-tui-libraries-for-2025-79f83b6ea16e)
- [Python-sounddevice Documentation](https://python-sounddevice.readthedocs.io/)
- [VoiceMode: Python CLI for voice typing (GitHub, thomasrice)](https://github.com/thomasrice/voicemode)
