# Architecture: Python Desktop Client (apps/desktop-py/)

**Domain:** Cross-platform desktop assistant client (Python)  
**Researched:** 2026-05-17  
**Confidence:** HIGH  
**Milestone Context:** v3.2 — Thin client integrating with existing gateway + backend-ts

---

## Executive Summary

The Python desktop client (`apps/desktop-py/`) is a **thin voice I/O wrapper** around the existing TypeScript backend, not a replacement. It sits alongside the Electron widget (`apps/desktop/`) as an alternative interface for terminal-first, voice-enabled conversation.

Architecture goals:
1. **Thin abstraction** — voice I/O (STT → HTTP → TTS) only; LLM logic stays in backend-ts
2. **Asyncio-native** — all I/O operations non-blocking; voice pipeline runs on single event loop
3. **Config-driven** — no hardcoded endpoints; reads from `.env` or JSON config file
4. **Monorepo-aware** — coexists with Node.js stack; Python installed via `uv` with isolated venv
5. **Reusable modules** — STT, TTS, HTTP client, config can be extracted to shared packages later

**Key findings:**
- Gateway API unchanged; Python client calls existing `/api/chat` (POST) and `/api/chat/stream` (GET/SSE)
- All CPU-bound work (Whisper, Kokoro inference) runs in asyncio thread pool via `asyncio.to_thread()`
- Voice pipeline orchestrates STT → HTTP streaming → TTS with concurrent I/O where safe
- Config via `.env` + optional `~/.jarvis/config.json` for user preferences
- uv package manager (Rust-based, fast) for Python dependencies; coexists cleanly with pnpm
- Build order: gateway must run before desktop-py tests; no new external services needed

---

## Folder Structure

```
apps/desktop-py/
├── pyproject.toml                 # Python project metadata, dependencies, uv config
├── README.md                      # Setup, usage, dev instructions
├── .env.example                   # Template: GATEWAY_URL, TTS_PROVIDER, WHISPER_MODEL
│
├── src/
│   ├── __init__.py
│   ├── main.py                    # Entry point: argparse CLI, asyncio.run(main())
│   │
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py            # Pydantic BaseSettings: gateway_url, lm_studio_url, tts_provider
│   │   ├── voices.py              # Voice mode enum (PTT, AlwaysListening, WakeWord)
│   │   └── persistence.py         # JSON config file read/write (simple dict + json.dump)
│   │
│   ├── http/
│   │   ├── __init__.py
│   │   ├── client.py              # httpx.AsyncClient wrapper for gateway API
│   │   ├── models.py              # Pydantic models: ChatRequest, ChatResponse, ChatStreamEvent
│   │   └── sse.py                 # SSE event parser (iterate over SSE chunks from /chat/stream)
│   │
│   ├── voice/
│   │   ├── __init__.py
│   │   ├── pipeline.py            # VoicePipeline: orchestrates STT → chat → TTS
│   │   ├── stt.py                 # STT wrapper: faster-whisper transcription
│   │   ├── tts.py                 # TTS router: Kokoro offline or cloud (Murf/ElevenLabs)
│   │   ├── audio.py               # Audio I/O: sounddevice record/play, NumPy arrays
│   │   └── wake_word.py           # Wake word detection: openwakeword + Silero VAD
│   │
│   ├── modes/
│   │   ├── __init__.py
│   │   ├── base.py                # VoiceCaptureMode abstract base
│   │   ├── ptt.py                 # Push-to-talk: hotkey or CLI flag
│   │   ├── always_listening.py    # Always-listening: VAD loop + ring buffer
│   │   └── wake_word.py           # Wake word: openwakeword trigger
│   │
│   ├── ui/
│   │   ├── __init__.py
│   │   ├── terminal.py            # rich console: spinner, status updates, colored output
│   │   ├── state.py               # UI state machine: IDLE, LISTENING, PROCESSING, SPEAKING
│   │   └── chat_display.py        # Message rendering with formatting
│   │
│   ├── session/
│   │   ├── __init__.py
│   │   └── chat_handler.py        # ChatSession: wraps HTTP client, maintains conversation context
│   │
│   └── utils/
│       ├── __init__.py
│       ├── logging.py             # loguru setup: file + console with rotation
│       └── platform.py            # OS detection: get_platform(), platform-specific fallbacks
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py                # pytest fixtures, mock httpx, mock audio
│   ├── test_config.py
│   ├── test_http_client.py
│   ├── test_stt.py
│   ├── test_tts.py
│   ├── test_pipeline.py           # asyncio integration test
│   └── test_main.py               # CLI interface tests
│
└── scripts/
    ├── install-deps.sh            # Linux system deps (libportaudio2, espeak-ng)
    └── install-deps.mac.sh        # macOS deps (portaudio via brew)
```

---

## Module Responsibilities

### **config/** — Configuration & Persistence

**settings.py** — Pydantic BaseSettings
- Loads from `.env` or environment variables
- Fields: `gateway_url` (default: `http://localhost:3000`), `lm_studio_url`, `tts_provider`, `whisper_model`, `voice_mode`
- Re-instantiation reads `.env` again (enables hot-reload without restart)
- Type-safe with validation errors on startup

**voices.py** — Voice mode enum
```python
from enum import Enum

class VoiceMode(str, Enum):
    WAKE_WORD = "wake-word"
    ALWAYS_LISTENING = "always-listening"
    PTT = "ptt"
```

**persistence.py** — Config file I/O
- Reads/writes simple JSON to `~/.jarvis/config.json` (or `XDG_CONFIG_HOME` on Linux)
- Fallback to in-memory dict if no file exists
- Used for: current voice mode, last UI state, user preferences not in `.env`
- Example: `{"voice_mode": "wake-word", "last_gateway_url": "http://localhost:3000"}`

### **http/** — Gateway HTTP Client

**client.py** — AsyncClient wrapper
```python
class GatewayClient:
    def __init__(self, base_url: str):
        self.client = httpx.AsyncClient(base_url=base_url, timeout=30.0)
    
    async def chat(self, message: str) -> str:
        """POST /api/chat — get full response"""
        resp = await self.client.post("/api/chat", json={"message": message})
        resp.raise_for_status()
        return resp.json()["response"]
    
    async def chat_stream(self, message: str) -> AsyncGenerator[str, None]:
        """GET /api/chat/stream — iterate SSE events"""
        async with self.client.stream("GET", "/api/chat/stream", 
                                      params={"message": message}) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    yield json.loads(line[6:])["content"]
```

**models.py** — Pydantic schemas
- `ChatRequest` (message, optional metadata)
- `ChatResponse` (response text)
- `ChatStreamEvent` (delta text chunk for SSE)

**sse.py** — SSE parser
- Handles newline-delimited JSON from gateway
- Filters `event: content` or `data: {...}` formats
- Yields text chunks for TTS pipeline

### **voice/** — Voice I/O Pipeline

**pipeline.py** — VoicePipeline orchestrator
```python
class VoicePipeline:
    def __init__(self, stt: STT, tts: TTS, http: GatewayClient, mode: VoiceMode):
        self.stt = stt
        self.tts = tts
        self.http = http
        self.mode = mode
        self.ui_state = UIState()
    
    async def handle_audio(self, audio: np.ndarray) -> None:
        """Core pipeline: STT → HTTP → TTS"""
        self.ui_state.set(UIState.PROCESSING)
        
        # 1. STT
        text = await self.stt.transcribe(audio)
        print(f"You: {text}")
        
        # 2. HTTP streaming chat
        self.ui_state.set(UIState.THINKING)
        response_text = ""
        async for chunk in self.http.chat_stream(text):
            response_text += chunk
            # Print tokens as they arrive
        
        # 3. TTS
        self.ui_state.set(UIState.SPEAKING)
        await self.tts.speak(response_text)
        
        self.ui_state.set(UIState.IDLE)
```

**stt.py** — STT wrapper
```python
class STT:
    def __init__(self, model_name: str = "base"):
        from faster_whisper import WhisperModel
        self.model = WhisperModel(model_name, device="auto", compute_type="auto")
    
    async def transcribe(self, audio: np.ndarray, sr: int = 16000) -> str:
        """Async wrapper via asyncio.to_thread"""
        def _transcribe():
            segments, info = self.model.transcribe(audio, language="pt")
            return " ".join(seg.text for seg in segments)
        
        return await asyncio.to_thread(_transcribe)
```

**tts.py** — TTS router
```python
class TTS:
    def __init__(self, provider: str = "kokoro", api_key: str | None = None):
        self.provider = provider
        self.api_key = api_key
        self._tts = self._init_provider()
    
    async def speak(self, text: str) -> None:
        if self.provider == "kokoro":
            await self._speak_kokoro(text)
        elif self.provider == "murf":
            await self._speak_murf(text)
        else:
            await self._speak_elevenlabs(text)
    
    async def _speak_kokoro(self, text: str) -> None:
        """Local TTS via kokoro (offline, no API key)"""
        def _synthesize():
            from kokoro import generate
            # kokoro.generate returns numpy array
            audio = generate(text)
            return audio
        
        audio = await asyncio.to_thread(_synthesize)
        await self.audio.play(audio)
```

**audio.py** — Audio I/O
```python
class AudioIO:
    def __init__(self, sr: int = 16000):
        self.sr = sr
        import sounddevice as sd
        self.sd = sd
    
    async def record(self, duration: float) -> np.ndarray:
        """Record audio via sounddevice"""
        def _record():
            return self.sd.rec(int(self.sr * duration), samplerate=self.sr, channels=1)
        
        audio = await asyncio.to_thread(_record)
        return audio
    
    async def play(self, audio: np.ndarray) -> None:
        """Play audio via sounddevice"""
        def _play():
            self.sd.play(audio, samplerate=self.sr)
            self.sd.wait()
        
        await asyncio.to_thread(_play)
```

**wake_word.py** — Wake word detection
```python
class WakeWordDetector:
    def __init__(self, sensitivity: float = 0.5):
        from openwakeword.model import Model
        self.model = Model(inference_framework="onnxruntime")
        self.sensitivity = sensitivity
    
    async def detect(self, audio: np.ndarray, sr: int = 16000) -> bool:
        """Check if audio contains 'Hey JARVIS' wake word"""
        def _detect():
            predictions = self.model.predict(audio, sr)
            return predictions.get("hey jarvis", 0) > self.sensitivity
        
        return await asyncio.to_thread(_detect)
```

### **modes/** — Voice Capture Strategies

Each mode implements `VoiceCaptureMode` interface:
```python
class VoiceCaptureMode(ABC):
    @abstractmethod
    async def capture(self) -> np.ndarray | None:
        """Block until audio ready or None if cancelled"""
        pass
    
    @abstractmethod
    async def stop(self) -> None:
        """Stop capturing"""
        pass
```

**ptt.py** — Push-to-talk
```python
class PTTMode(VoiceCaptureMode):
    def __init__(self, audio: AudioIO, hotkey: str = "ctrl+shift+j"):
        self.audio = audio
        self.hotkey = hotkey
        self.listening = False
    
    async def capture(self) -> np.ndarray | None:
        """Wait for hotkey, record until hotkey released"""
        # pynput.keyboard.Listener in thread
        # Block until key pressed, return recorded audio
        ...
```

**always_listening.py** — Always-listening
```python
class AlwaysListeningMode(VoiceCaptureMode):
    def __init__(self, audio: AudioIO, wake_word: WakeWordDetector, intent_classifier):
        self.audio = audio
        self.wake_word = wake_word
        self.intent = intent_classifier
        self._cancel = asyncio.Event()
    
    async def capture(self) -> np.ndarray | None:
        """Continuous VAD loop with ring buffer pre-roll"""
        ring_buffer = collections.deque(maxlen=int(16000 * 0.5))  # 500ms
        
        while not self._cancel.is_set():
            chunk = await self.audio.record(0.1)  # 100ms chunks
            ring_buffer.append(chunk)
            
            # VAD check (Silero)
            if await self._vad.is_speech(chunk):
                # Collect until silence, then return
                audio = await self._collect_until_silence(ring_buffer)
                return audio
        
        return None
```

**wake_word.py** — Wake word trigger
```python
class WakeWordMode(VoiceCaptureMode):
    def __init__(self, audio: AudioIO, wake_word: WakeWordDetector):
        self.audio = audio
        self.wake_word = wake_word
    
    async def capture(self) -> np.ndarray | None:
        """Listen for wake word, then capture response"""
        while True:
            chunk = await self.audio.record(0.1)
            if await self.wake_word.detect(chunk):
                # Wake word detected, record user response
                return await self._record_user_input()
```

### **ui/** — Terminal UI

**terminal.py** — rich console output
```python
from rich.console import Console

class TerminalUI:
    def __init__(self):
        self.console = Console()
        self.state = UIState.IDLE
    
    def set_state(self, state: UIState) -> None:
        self.state = state
        status_map = {
            UIState.LISTENING: "🎤 Listening...",
            UIState.PROCESSING: "⏳ Processing...",
            UIState.SPEAKING: "🔊 Speaking...",
            UIState.IDLE: "✨ Ready",
        }
        self.console.print(f"[cyan]{status_map[state]}[/cyan]")
    
    def print_message(self, role: str, text: str) -> None:
        color = "blue" if role == "assistant" else "green"
        self.console.print(f"[{color}]{role.title()}[/{color}]: {text}")
```

**state.py** — UI state enum
```python
class UIState(Enum):
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    ERROR = "error"
```

### **session/** — Chat Session Management

**chat_handler.py** — ChatSession wrapper
```python
class ChatSession:
    def __init__(self, http: GatewayClient):
        self.http = http
        self.history: list[dict] = []
    
    async def send(self, message: str) -> str:
        """Send message, collect full response"""
        self.history.append({"role": "user", "content": message})
        response = await self.http.chat(message)
        self.history.append({"role": "assistant", "content": response})
        return response
    
    async def send_stream(self, message: str) -> AsyncGenerator[str, None]:
        """Send message, stream tokens"""
        self.history.append({"role": "user", "content": message})
        full_response = ""
        async for chunk in self.http.chat_stream(message):
            full_response += chunk
            yield chunk
        self.history.append({"role": "assistant", "content": full_response})
```

### **utils/** — Utilities

**logging.py** — loguru setup
```python
from loguru import logger

def setup_logging(level: str = "INFO", logfile: str | None = None):
    logger.remove()  # Remove default handler
    logger.add(
        sys.stderr,
        level=level,
        format="<level>{level: <8}</level> | {name}:{function}:{line} - {message}",
    )
    if logfile:
        logger.add(logfile, rotation="500 MB", retention="7 days")
```

**platform.py** — OS-specific fallbacks
```python
def get_platform() -> str:
    import platform
    return platform.system()  # "Windows", "Darwin", "Linux"

def get_audio_device() -> int | None:
    """Auto-detect default audio device"""
    import sounddevice as sd
    return sd.default.device[0]  # Input device ID
```

---

## Asyncio Pipeline Design (STT → Chat → TTS)

### **Event Loop Architecture**

All I/O is async-first; CPU-bound work (model inference) runs in thread pool:

```python
async def main():
    # Single event loop for entire app
    stt = STT("base")
    tts = TTS("kokoro")
    http = GatewayClient("http://localhost:3000")
    pipeline = VoicePipeline(stt, tts, http, VoiceMode.ALWAYS_LISTENING)
    
    # Run voice capture loop
    await pipeline.run()
```

### **Concurrent Operations**

Voice pipeline overlaps I/O where safe:
1. **STT:** Blocking model inference → `asyncio.to_thread()`
2. **HTTP:** Streaming SSE chunks → native `httpx.AsyncClient`
3. **TTS:** Cloud API calls or local inference → `asyncio.to_thread()`

Example: **TTY output during HTTP streaming**
```python
async def handle_audio(self, audio):
    # 1. STT (blocking in thread pool)
    text = await asyncio.to_thread(self.stt.transcribe, audio)
    
    # 2. HTTP chat stream (async I/O, yield chunks as they arrive)
    full_response = ""
    async for chunk in self.http.chat_stream(text):
        full_response += chunk
        print(chunk, end="", flush=True)
    
    # 3. TTS (blocking in thread pool, but only after full response)
    await asyncio.to_thread(self.tts.speak, full_response)
```

### **Cancellation & Timeout**

Use `asyncio.CancelledError` for graceful shutdown:
```python
async def pipeline_loop(self):
    try:
        while True:
            audio = await self.current_mode.capture()
            if audio is not None:
                await self.handle_audio(audio)
    except asyncio.CancelledError:
        logger.info("Pipeline cancelled, cleaning up...")
        await self.current_mode.stop()
        raise
```

---

## Config Persistence (No Electron-Store)

### **File Structure**

**`.env`** (root monorepo, git-ignored)
```bash
# Gateway integration
GATEWAY_URL=http://localhost:3000

# LM Studio (optional, used only if backend not running)
LM_STUDIO_URL=http://localhost:1234/v1

# Voice config
WHISPER_MODEL=base
TTS_PROVIDER=kokoro
TTS_PROVIDER_API_KEY=  # For cloud TTS

# Voice mode
VOICE_MODE=wake-word
```

**`~/.jarvis/config.json`** (persistent user prefs)
```json
{
  "voice_mode": "wake-word",
  "last_gateway_url": "http://localhost:3000",
  "tts_provider": "kokoro",
  "whisper_model": "base",
  "wake_word_sensitivity": 0.5
}
```

### **Settings Resolution Priority**

1. Environment variables (highest priority)
2. `.env` file
3. `~/.jarvis/config.json` (user defaults)
4. Hardcoded defaults (lowest priority)

### **Hot-Reload Pattern**

```python
async def apply_settings(new_settings: Settings) -> None:
    """Re-instantiate models on config change"""
    # Don't reload if URL unchanged
    if new_settings.gateway_url != self.settings.gateway_url:
        self.http = GatewayClient(new_settings.gateway_url)
    
    # Reload STT model if model name changed
    if new_settings.whisper_model != self.settings.whisper_model:
        self.stt = STT(new_settings.whisper_model)
    
    # Reload TTS provider if changed
    if new_settings.tts_provider != self.settings.tts_provider:
        self.tts = TTS(new_settings.tts_provider)
    
    self.settings = new_settings
```

---

## Gateway Integration Pattern

### **API Contract**

The Python client calls the **existing** gateway endpoints (unchanged):

| Endpoint | Method | Purpose | Client Usage |
|----------|--------|---------|--------------|
| `/api/chat` | POST | Full response (text-only) | `http.chat(message)` |
| `/api/chat/stream` | GET | Streaming response (SSE) | `http.chat_stream(message)` |
| `/api/health` | GET | Liveness check | Optional: startup verification |

### **Request/Response Format**

**POST /api/chat**
```json
{
  "message": "Olá, como você está?",
  "metadata": {
    "voice_mode": "wake-word",
    "client": "desktop-py"
  }
}
```

Response:
```json
{
  "response": "Olá! Estou funcionando bem, obrigado por perguntar..."
}
```

**GET /api/chat/stream?message=...**

Server-Sent Events (SSE):
```
data: {"content": "Olá"}
data: {"content": "! "}
data: {"content": "Estou"}
...
```

### **Error Handling**

Python client catches HTTP errors and surfaces to UI:
```python
try:
    response = await self.http.chat(message)
except httpx.ConnectError:
    logger.error("Gateway unreachable at {self.settings.gateway_url}")
    raise RuntimeError("Unable to connect to JARVIS backend")
except httpx.HTTPStatusError as e:
    logger.error(f"Backend error: {e.response.status_code}")
    raise RuntimeError(f"Backend error: {e.response.text}")
```

---

## Pnpm Coexistence Strategy

### **Problem**: Python + Node.js in single monorepo

**Constraints:**
- Root `pnpm-workspace.yaml` defines `apps/*` (Node-only)
- Python needs isolated environment without npm install
- Build order matters: gateway must be running before desktop-py tests

### **Solution: uv for Python Package Management**

Why `uv`:
- **Fast**: Rust-based resolver, 10-100x faster than pip
- **Workspaces**: Can manage multiple Python projects (future: shared packages)
- **Lock file**: `uv.lock` ensures reproducible builds (like `pnpm-lock.yaml`)
- **Mono-repo friendly**: Coexists with pnpm cleanly; separate lock files

### **Project Structure**

```
jarvis/
├── pnpm-workspace.yaml          # Node workspaces
├── pnpm-lock.yaml               # Node lock (git-committed)
├── uv.lock                       # Python lock (git-committed)
│
├── apps/
│   ├── gateway/                 # Node app
│   ├── backend-ts/              # Node app
│   ├── desktop/                 # Node app (Electron)
│   └── desktop-py/              # Python app ← NEW
│       ├── pyproject.toml       # uv metadata
│       ├── src/
│       └── tests/
│
└── .env                          # Shared config (both Node & Python read)
```

### **Installation & Dev Workflow**

**Root setup:**
```bash
# Install Node dependencies
pnpm install

# Install Python dependencies (first-time or after pyproject.toml change)
uv sync --all-packages

# Run all services (Node + Python)
# Terminal 1: Node apps
pnpm dev

# Terminal 2: Python client
uv run python -m jarvis.desktop_py
```

**Python-specific tasks:**
```bash
# Run Python client in dev mode
uv run python -m jarvis.desktop_py --voice-mode ptt

# Run tests
uv run pytest tests/ -v

# Type check
uv run pyright src/

# Format & lint
uv run ruff check src/ --fix
uv run ruff format src/
```

### **pyproject.toml Layout**

```toml
[project]
name = "jarvis-desktop-py"
version = "3.2.0"
description = "Python voice client for JARVIS"
requires-python = ">=3.10"

[tool.uv]
# Override pip's default behavior for consistency
python-preference = "managed"

[tool.uv.sources]
# Could reference local packages later:
# jarvis-common = { path = "../../packages/jarvis-common", editable = true }

[project.dependencies]
# Core
pydantic = ">=2.7"
pydantic-settings = "^2.1"

# HTTP & SSE
httpx = "^0.28.0"

# Voice I/O
faster-whisper = "^1.2.1"
sounddevice = "^0.5.5"
openwakeword = "^0.6"
kokoro = "^0.9.4"
soundfile = "^0.13.0"

# UI & logging
rich = "^13.7"
loguru = "^0.7.2"

# Utilities
python-dotenv = "^1.0"

# Platform-specific
pywin32 = { version = "^306", markers = "sys_platform == 'win32'" }
python-xlib = { version = "^0.33", markers = "sys_platform == 'linux'" }
pyobjc-framework-Cocoa = { version = "^10.0", markers = "sys_platform == 'darwin'" }

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "pytest-cov>=4.1",
    "pyright>=1.1.348",
    "ruff>=0.3.0",
]

[project.scripts]
jarvis-desktop-py = "jarvis.desktop_py.main:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

### **CI/CD & Build Order**

**GitHub Actions** (conceptual):
```yaml
# 1. Build Node apps (gateway, backend-ts)
- run: pnpm install
- run: pnpm build
- run: pnpm --filter @jarvis/gateway start &
- run: pnpm --filter @jarvis/backend-ts start &

# 2. Build Python client (depends on gateway)
- run: uv sync
- run: uv run pytest tests/ -v
```

---

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      main.py (asyncio)                       │
│                   Event loop orchestrator                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        v                v                v
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Persistence │ │   Terminal   │ │  VoicePipeline   │
│  (JSON file) │ │      UI      │ │  (orchestrates)  │
│              │ │  (rich text) │ │                  │
└──────────────┘ └──────────────┘ └────────┬─────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    v                      v                      v
            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
            │     STT      │      │  GatewayHTTP │      │     TTS      │
            │(faster-whsp) │      │   (httpx)    │      │(kokoro/murf) │
            └──────────────┘      └──────────────┘      └──────────────┘
                    │                      │                      │
                    │                      │                      │
            asyncio.to_thread()   async await pool    asyncio.to_thread()
                    │                      │                      │
                    v                      v                      v
            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
            │ Audio Input  │      │   Gateway    │      │ Audio Output │
            │ (sounddev)   │◄─────┤  :3000/api   │─────►│ (sounddev)   │
            └──────────────┘      │              │      └──────────────┘
                                  │ POST /chat   │
                                  │ GET /stream  │
                                  └──────────────┘
                                           │
                                           │ HTTP proxy
                                           v
                                  ┌──────────────────┐
                                  │  backend-ts      │
                                  │  :8001           │
                                  │  (LLM + Memory)  │
                                  └──────────────────┘
```

---

## Cross-Cutting Concerns

### **Error Handling Strategy**

All modules surface errors via custom exceptions:
```python
class JarvisException(Exception):
    """Base exception"""
    pass

class GatewayError(JarvisException):
    """HTTP/connection error"""
    pass

class AudioError(JarvisException):
    """Audio I/O error (mic not available, etc.)"""
    pass

class STTError(JarvisException):
    """Whisper model load or transcription failed"""
    pass

class ConfigError(JarvisException):
    """Settings validation failed"""
    pass
```

Pipeline catches and logs gracefully:
```python
async def handle_audio(self, audio):
    try:
        text = await self.stt.transcribe(audio)
    except STTError as e:
        logger.error(f"STT failed: {e}")
        self.ui.set_state(UIState.ERROR)
        self.ui.print_message("Error", "Unable to transcribe audio. Try again.")
        return
    
    # Continue with HTTP and TTS...
```

### **Logging & Observability**

loguru for all logs:
```python
# src/utils/logging.py
from loguru import logger

logger.add(
    sink=sys.stderr,
    format="<level>{level: <8}</level> | {name}:{function}:{line} - {message}",
    level="INFO",
)

logger.add(
    sink="~/.jarvis/logs/desktop-py.log",
    rotation="500 MB",
    retention="7 days",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
)
```

### **Testing Strategy**

- **Unit tests** (config, HTTP models, STT/TTS mocking)
- **Integration tests** (pipeline with mock gateway)
- **E2E tests** (full pipeline against real gateway running in test container)

```python
# tests/test_pipeline.py
@pytest.mark.asyncio
async def test_pipeline_stt_to_tts(mocker):
    # Mock gateway responses
    mocker.patch("jarvis.http.client.GatewayClient.chat_stream", 
                 return_value=async_generator(["Olá", " ", "mundo"]))
    
    # Mock STT output
    mocker.patch("jarvis.voice.stt.STT.transcribe", 
                 return_value="Oi JARVIS")
    
    # Mock TTS speak
    mocker.patch("jarvis.voice.tts.TTS.speak")
    
    pipeline = VoicePipeline(...)
    audio = np.random.randn(16000)  # 1s audio
    
    await pipeline.handle_audio(audio)
    
    # Verify calls
    pipeline.stt.transcribe.assert_called_once()
    pipeline.http.chat_stream.assert_called_once()
    pipeline.tts.speak.assert_called_once()
```

---

## Known Pitfalls & Mitigations

| Pitfall | Cause | Mitigation |
|---------|-------|-----------|
| Deadlock in asyncio | Blocking I/O in main loop | Always use `asyncio.to_thread()` for CPU/blocking ops |
| SSE event loss | Partial reads from stream | Buffer entire `data: ` line before parsing |
| Audio feedback loop | Mic picks up speaker output | Test with headphones; add input filtering option |
| Wake word false positives | Sensitivity too high | Default 0.5, configurable in settings |
| Model download on first use | User waits 5+ min on startup | Prompt user, show progress bar, cache models in `~/.jarvis/models/` |
| Config file corruption | Concurrent JSON writes | Use atomic rename (write to temp, then rename) |
| Gateway timeout | Network slow or down | Set httpx timeout; implement exponential backoff retry |
| Memory leak on long runs | Unbounded conversation history | Implement rolling summarization (gateway-side, as backend-ts already does) |

---

## Build & Runtime Checklist

### **Development Setup**
- [ ] `pyproject.toml` specifies Python ≥3.10, uv workspace config
- [ ] `uv sync` installs all dependencies + dev tools
- [ ] Platform-specific deps conditional in pyproject.toml (pywin32, python-xlib, pyobjc)
- [ ] `.env.example` documents all vars
- [ ] `src/config/settings.py` validates on instantiation

### **Voice Pipeline**
- [ ] STT models auto-download on first use (faster-whisper)
- [ ] TTS models auto-download on first use (Kokoro 350MB)
- [ ] Wake word model auto-downloads (openwakeword)
- [ ] All I/O via asyncio.to_thread() for CPU-bound ops
- [ ] SSE event parsing correctly strips prefixes

### **Gateway Integration**
- [ ] POST /api/chat request format matches schema (ChatRequest)
- [ ] GET /api/chat/stream SSE parsing handles all newline variants
- [ ] Errors from gateway caught and logged (not re-raised)
- [ ] `GATEWAY_URL` configurable via `.env`

### **Monorepo Coexistence**
- [ ] Python client ignores `pnpm-lock.yaml`
- [ ] uv.lock committed to git (reproducible builds)
- [ ] Root `.env` readable by both Node and Python
- [ ] Build order: gateway starts before desktop-py tests run

### **Config & State**
- [ ] `~/.jarvis/config.json` created on first run
- [ ] Voice mode persists across restarts
- [ ] Hot-reload: changing settings re-instantiates models
- [ ] Logging to file + stderr with rotation

---

## Integration Checklist with Existing Stack

### **Shared Resources**
- ✅ `.env` file (both Node and Python read)
- ✅ Gateway API (port 3000, already running for Electron)
- ✅ Backend-ts (port 8001, already provides /chat endpoints)
- ✅ SQLite + ChromaDB (backend-ts owns; Python client stateless)

### **No Duplication**
- ✅ LLM inference stays in backend-ts
- ✅ Memory management stays in backend-ts
- ✅ MCP tools stay in backend-ts
- ✅ Screen vision stays in Electron (platform-specific)

### **New & Modified Files**
| Path | Status | Purpose |
|------|--------|---------|
| `apps/desktop-py/` | **NEW** | Python client app |
| `apps/desktop-py/pyproject.toml` | **NEW** | Python deps |
| `.env` | **MODIFIED** | Add GATEWAY_URL if missing |
| Root `package.json` | **OPTIONAL** | Add `pnpm dev:desktop-py` script |
| GitHub Actions | **OPTIONAL** | Add `uv sync && uv run pytest` to CI |

---

## Sources

- [Pydantic BaseSettings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) — Configuration management (HIGH confidence)
- [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper) — STT library, asyncio patterns (HIGH confidence)
- [httpx AsyncClient docs](https://www.python-httpx.org/) — Async HTTP with SSE streaming (HIGH confidence)
- [asyncio.to_thread()](https://docs.python.org/3/library/asyncio-task-utils.html#asyncio.to_thread) — Running blocking code in thread pool (HIGH confidence)
- [uv package manager](https://docs.astral.sh/uv/) — Modern Python package manager (HIGH confidence — recent, actively maintained)
- [loguru](https://github.com/Delgan/loguru) — Structured logging (HIGH confidence)
- [openwakeword GitHub](https://github.com/dscripka/openWakeWord) — Wake word detection (HIGH confidence from CLAUDE.md)
- [Rich library](https://rich.readthedocs.io/) — Terminal output formatting (HIGH confidence)
