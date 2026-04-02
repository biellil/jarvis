# Technology Stack

**Project:** JARVIS — Local AI Personal Assistant
**Researched:** 2026-04-02
**Confidence:** HIGH (all versions verified via PyPI; architecture from official docs)

---

## Recommended Stack

### Core Framework & Orchestration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python | 3.10+ | Runtime | Minimum for `match`/`case`, required by LangChain 1.x. 3.12 preferred — faster, better error messages. |
| langchain | 1.2.14 | Agent framework, tool abstraction, prompt management | Stable 1.0 API, no breaking changes until 2.0. Provides `create_react_agent`, tool decorators, and provider-agnostic `ChatModel` interface. |
| langgraph | 1.1.4 | Stateful agent runtime (ReAct loop, conversation graph) | Durable state persistence built-in — agent survives restart mid-conversation. First-class human-in-the-loop support. Production-tested at Uber, LinkedIn. |
| langchain-openai | 0.3.x | LangChain integration for OpenAI-compatible endpoints | Powers both LM Studio (via `base_url`) and OpenAI cloud. Same import path, swap by config. |
| langchain-anthropic | 0.3.x | LangChain integration for Claude (Anthropic) | Same abstraction layer — multi-LLM switch is config, not code. |
| openai | 2.30.0 | Low-level OpenAI-compatible client | Used directly for LM Studio connection (`base_url="http://localhost:1234/v1"`). Also underlies langchain-openai. |

### Voice Pipeline

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| faster-whisper | 1.2.1 | Speech-to-Text (offline, local) | 4x faster than openai/whisper at same accuracy via CTranslate2. Runs on CPU and GPU. Supports Whisper large-v3-turbo (5.4x speedup, near-v2 accuracy). Privacy: audio never leaves device. |
| sounddevice | 0.5.5 | Microphone audio capture | Pure NumPy arrays — integrates cleanly with Whisper's numpy input. Works on Linux/macOS/Windows without PortAudio build pain. Preferred over PyAudio. |
| openwakeword | 0.6.x | Wake word detection (offline) | Fully open-source, no API key required (unlike Porcupine). Includes Silero VAD to suppress false positives on non-speech noise. Runs on onnxruntime (cross-platform). |
| kokoro | 0.9.4+ | Text-to-Speech (offline, high quality) | 82M-parameter neural TTS, 350 MB model, Apache-licensed. Dramatically better quality than pyttsx3/espeak. Runs fully offline after download. Supports 54 voices. |
| RealtimeTTS | latest | TTS streaming wrapper (optional) | Same author as RealtimeSTT — handles sentence chunking and streaming playback to reduce perceived latency. Supports kokoro as backend. |

### Memory Architecture

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| chromadb | 1.5.5 | Long-term semantic memory (vector store) | Embeddable — no separate server process. Rust-core rewrite (2025) gives 4x write/query throughput. Uses SQLite internally for persistence. Supports billion-scale embeddings. |
| sentence-transformers | 3.x | Local embedding generation | `all-MiniLM-L6-v2` model (22 MB, 384-dim) runs offline on CPU. Fast enough for real-time conversation indexing. Integrates with ChromaDB's default embedding function. |
| SQLite (stdlib) | 3.x | Structured persistent storage | Conversation history, user profile, preferences, tool logs. Zero-config, zero-dependency. Part of Python stdlib via `sqlite3`. |
| langchain-community | 0.3.x | ChromaDB vector store adapter for LangChain | `Chroma` retriever integrates with LangGraph memory nodes. Abstracts collection management. |

### PC Control (Platform-Specific Backends)

| Technology | Version | Purpose | Platform | Why |
|------------|---------|---------|----------|-----|
| pyautogui | 0.9.54 | Mouse, keyboard, screenshots | Linux/macOS/Win | De-facto standard for screen automation. PIL-based screenshot. |
| PyWinCtl | 0.43 | Window enumeration and control | Linux/macOS/Win | Cross-platform wrapper over python-xlib (Linux), pywin32 (Win), pyobjc (macOS). Fills the gap where pygetwindow fails on Linux/macOS. |
| pywin32 | 306 | Windows-native APIs (processes, registry) | Windows only | Required for AppLauncher, SystemControl on Windows. |
| python-xlib | 0.33 | X11 window management | Linux only | Required by pyautogui and PyWinCtl on Linux. |
| pyobjc-framework-Cocoa | 10.x | macOS AppKit/Cocoa APIs | macOS only | Required by pyautogui on macOS. System volume, brightness on macOS. |
| psutil | 6.x | Cross-platform process management | Linux/macOS/Win | List running processes, kill/start apps, CPU/memory stats. Works identically on all three OSes. |
| screen-brightness-control | 0.23.x | Brightness control | Linux/macOS/Win | Unified API — abstracts DDC/CI (external), backlight sysfs (Linux), CoreDisplay (macOS), WMI (Windows). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pydantic | 2.x | Settings, tool input validation, data models | Always — LangChain 1.x requires Pydantic v2. Use `BaseSettings` for typed config management. |
| python-dotenv | 1.x | `.env` file loading | Development and production config — API keys, LM Studio URL, feature flags. |
| httpx | 0.28.x | Async HTTP client | Used internally by `openai` SDK. Direct use for WebSearch tool (DuckDuckGo API or similar). |
| pillow | 10.x | Image processing for ScreenAnalyzer | Screenshot capture via pyautogui uses PIL. Pass to LLM vision API as base64. |
| loguru | 0.7.x | Structured logging | Replaces stdlib logging — zero-config, colored output, file rotation, no boilerplate. |
| rich | 13.x | Terminal UI rendering | CLI output formatting — agent thinking display, memory retrieval feedback. |
| pytest | 8.x | Test framework | Unit tests for tools, integration tests for agent chains. |
| pytest-asyncio | 0.23.x | Async test support | LangGraph nodes are async; required to test them properly. |

---

## LM Studio Integration Pattern

LM Studio exposes an OpenAI-compatible REST API. The correct integration pattern is:

```python
from langchain_openai import ChatOpenAI

# Local LM Studio — any loaded model
local_llm = ChatOpenAI(
    base_url="http://localhost:1234/v1",
    api_key="lm-studio",          # any non-empty string; LM Studio ignores it
    model="loaded-model-identifier",
    temperature=0.7,
)

# Cloud OpenAI
cloud_llm = ChatOpenAI(
    model="gpt-4o",
    api_key=os.getenv("OPENAI_API_KEY"),
)

# Anthropic Claude
from langchain_anthropic import ChatAnthropic
claude_llm = ChatAnthropic(
    model="claude-3-5-sonnet-20241022",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
)
```

All three implement the same `BaseChatModel` interface. Swap by config, not code. The `base_url` should be read from `settings.lm_studio_url` (pydantic BaseSettings), not hardcoded.

---

## Voice Pipeline Architecture

```
Microphone
    |
sounddevice (raw audio, numpy array, 16kHz mono)
    |
openwakeword (always-on listener, CPU)
    | wake word detected
    |
RealtimeSTT / faster-whisper (transcribe utterance)
    |
text → LangGraph agent
    |
response text
    |
kokoro (neural TTS synthesis, offline)
    |
sounddevice.play() / RealtimeTTS
    |
Speakers
```

**Why sounddevice over PyAudio:**
- sounddevice outputs NumPy arrays directly — faster-whisper accepts NumPy without conversion
- PyAudio produces raw bytes and requires manual format conversion
- sounddevice has prebuilt wheels for all platforms; PyAudio requires PortAudio headers on Linux (build pain in containers)
- sounddevice is actively maintained (0.5.5 released Jan 2026); PyAudio last updated 2023

**Why faster-whisper over openai/whisper:**
- 4x faster at identical accuracy (CTranslate2 runtime vs PyTorch)
- Supports int8 quantization — runs acceptably on CPU-only machines
- `large-v3-turbo` variant: 5.4x speedup over large-v3 with near-identical accuracy

**Why kokoro over pyttsx3:**
- pyttsx3 wraps the OS SAPI/espeak engine — robotic, unnatural voice
- kokoro is a 82M neural model with human-quality synthesis
- Offline after model download (Apache license, no API key)
- 350 MB model is acceptable for a desktop assistant

---

## Multi-LLM Abstraction Layer

The architecture must never hardcode a provider. All LLM calls route through a factory:

```python
# config.py
class LLMProvider(str, Enum):
    LM_STUDIO = "lm_studio"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"

class Settings(BaseSettings):
    active_provider: LLMProvider = LLMProvider.LM_STUDIO
    lm_studio_url: str = "http://localhost:1234/v1"
    lm_studio_model: str = "local-model"
    # ...
```

```python
# llm_factory.py
def get_llm(settings: Settings) -> BaseChatModel:
    match settings.active_provider:
        case LLMProvider.LM_STUDIO:
            return ChatOpenAI(base_url=settings.lm_studio_url, ...)
        case LLMProvider.OPENAI:
            return ChatOpenAI(model="gpt-4o", ...)
        case LLMProvider.ANTHROPIC:
            return ChatAnthropic(model="claude-3-5-sonnet-...", ...)
```

**Critical constraint:** Local models (LM Studio) have variable capabilities. Never assume function-calling, vision, or long context works — test for each model and degrade gracefully.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Agent framework | LangChain/LangGraph 1.x | Raw OpenAI SDK | LangChain provides tool abstraction, memory integration, and multi-LLM interface. Rolling it from scratch adds months of work. |
| STT | faster-whisper | openai/whisper | openai/whisper is 4x slower; uses more VRAM; no int8 quantization support. |
| STT | faster-whisper | RealtimeSTT | RealtimeSTT is a higher-level wrapper built on faster-whisper. Use RealtimeSTT for the audio pipeline layer; keep faster-whisper as the engine. |
| TTS | kokoro | pyttsx3 | pyttsx3 voice quality is robotic and jarring for a conversational assistant. |
| TTS | kokoro | ElevenLabs | ElevenLabs requires internet + API key — violates privacy-first default. |
| TTS | kokoro | Coqui TTS | Coqui project is archived (2024); no active maintenance. |
| Wake word | openwakeword | pvporcupine (Picovoice) | Porcupine requires a Picovoice API key for initialization — unacceptable for offline/privacy-first use. openwakeword is fully open-source. |
| Vector DB | ChromaDB | Qdrant | Qdrant requires a separate server process (Docker or native). ChromaDB is embeddable — no infra overhead for personal use. |
| Vector DB | ChromaDB | FAISS | FAISS has no metadata filtering or persistence management. ChromaDB is a complete solution. |
| Audio capture | sounddevice | PyAudio | PyAudio requires PortAudio build headers on Linux; outputs bytes not numpy; less actively maintained. |
| Window control | PyWinCtl | pygetwindow | pygetwindow only works on Windows despite claiming cross-platform. PyWinCtl is the maintained cross-platform fork. |
| Process control | psutil | platform-specific (subprocess/os) | psutil provides a unified API across all three OSes — no conditional imports needed for basic process management. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `AgentExecutor` (legacy LangChain) | Deprecated in LangChain 1.0. Replaced by `create_react_agent` + LangGraph runtime. Using it means migrating again. | `langgraph` with `create_react_agent` |
| `initialize_agent()` | Same deprecation — removed in 1.0. | `create_react_agent` |
| `openai/whisper` (original) | PyTorch-based, 4x slower, high VRAM usage. No int8 support. | `faster-whisper` |
| `pyttsx3` | OS SAPI/espeak wrapper — robotic voice quality, unacceptable for conversational UX. | `kokoro` |
| Coqui TTS | Project archived in 2024. No security fixes, no Python 3.12 support. | `kokoro` |
| `pygetwindow` | Only works on Windows. Crashes on Linux/macOS. | `PyWinCtl` |
| `langchain-community` for LLM calls | Community package has slower update cycles and inconsistent interfaces. Use provider-specific packages. | `langchain-openai`, `langchain-anthropic` |
| Hardcoded `base_url="http://localhost:1234/v1"` | Breaks when user changes port or host. Must be read from settings. | `Settings.lm_studio_url` via pydantic BaseSettings |
| ChromaDB client-server mode | Unnecessary complexity for single-user local assistant. Adds Docker/network dependency. | ChromaDB embedded mode (default) |
| `SpeechRecognition` library | Wraps Google Web Speech API by default — sends audio to the cloud. Even with Whisper backend, it's a leaky abstraction. | `faster-whisper` directly |

---

## Cross-Platform Audio Notes

### Linux
- sounddevice requires `libportaudio2` system package: `apt install libportaudio2`
- openwakeword requires `onnxruntime` (not `tflite-runtime`, which is Linux-only anyway)
- Wayland users: pyautogui may have issues; X11/Xwayland is the safer target for MVP

### Windows
- sounddevice prebuilt wheels include PortAudio — no system dependencies
- pywin32 required for AppLauncher and SystemControl
- Wake word: openwakeword works via onnxruntime only (not tflite)

### macOS
- sounddevice requires `portaudio` via Homebrew: `brew install portaudio`
- pyautogui requires `pyobjc-core pyobjc` and Accessibility permissions in System Settings
- kokoro on macOS: no espeak-ng required (uses built-in phonemizer fallback)

---

## Version Compatibility Matrix

| Package | Requires | Notes |
|---------|----------|-------|
| langchain 1.2.x | Python >=3.10, pydantic >=2.7 | Must use Pydantic v2 — v1 shim removed in 1.0 |
| langgraph 1.1.x | langchain >=1.0 | Do not mix langgraph 0.x with langchain 1.x |
| langchain-openai 0.3.x | openai >=2.0 | openai 2.x has breaking changes from 1.x; required |
| faster-whisper 1.2.x | ctranslate2 >=4.0, Python >=3.9 | ctranslate2 installed automatically as dependency |
| chromadb 1.5.x | Python >=3.9 | Rust core; pydantic v2 required |
| sentence-transformers 3.x | torch >=2.0 | Downloads model on first use (~22 MB) |
| kokoro 0.9.x | espeak-ng (Linux only), soundfile | `pip install kokoro soundfile` + `apt install espeak-ng` on Linux |

---

## Installation

```bash
# Core orchestration
pip install langchain==1.2.14 langgraph==1.1.4 langchain-openai langchain-anthropic langchain-community

# OpenAI client (LM Studio + OpenAI cloud)
pip install openai==2.30.0

# Memory
pip install chromadb==1.5.5 sentence-transformers

# Voice pipeline
pip install faster-whisper==1.2.1 sounddevice kokoro soundfile openwakeword

# PC control (cross-platform)
pip install pyautogui PyWinCtl psutil screen-brightness-control pillow

# Platform-specific (install only on target OS)
# Windows: pip install pywin32
# Linux:   pip install python-xlib
# macOS:   pip install pyobjc-core pyobjc

# Config & utilities
pip install pydantic[dotenv] python-dotenv httpx loguru rich

# Dev
pip install pytest pytest-asyncio
```

```bash
# Linux system packages
apt install libportaudio2 espeak-ng

# macOS system packages
brew install portaudio
```

---

## Sources

- PyPI langchain 1.2.14 — version verified March 31, 2026
- PyPI langgraph 1.1.4 — version verified March 31, 2026
- PyPI chromadb 1.5.5 — version verified March 10, 2026
- PyPI openai 2.30.0 — version verified March 25, 2026
- PyPI faster-whisper 1.2.1 — version verified October 31, 2025
- PyPI sounddevice 0.5.5 — version verified January 23, 2026
- [LM Studio OpenAI Compatibility Docs](https://lmstudio.ai/docs/app/api/endpoints/openai) — base_url pattern confirmed
- [LangChain/LangGraph 1.0 blog post](https://blog.langchain.com/langchain-langgraph-1dot0/) — stability commitment, deprecation notes (MEDIUM confidence — blog post)
- [SYSTRAN/faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper) — 4x speedup claim, CTranslate2 backend (HIGH confidence)
- [openWakeWord GitHub](https://github.com/dscripka/openWakeWord) — offline, no API key, Silero VAD (HIGH confidence)
- [hexgrad/kokoro GitHub](https://github.com/hexgrad/kokoro) — 82M params, Apache license, 350MB (HIGH confidence)
- [PyWinCtl GitHub](https://github.com/Kalmat/PyWinCtl) — cross-platform window control (MEDIUM confidence — smaller project)
- [Chroma 2025 Rust rewrite](https://www.trychroma.com/) — 4x performance, billion-scale (MEDIUM confidence — vendor marketing, but PyPI version confirms recent activity)
- [Modal.com Whisper comparison](https://modal.com/blog/choosing-whisper-variants) — faster-whisper vs alternatives analysis (HIGH confidence — technical benchmark)

---

*Stack research for: Local AI Personal Assistant (JARVIS)*
*Researched: 2026-04-02*
