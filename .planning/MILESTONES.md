# Milestones

## v1.2 Desktop UI (Shipped: 2026-04-07)

**Phases completed:** 5 phases (9-13), 14 plans, 42 tasks

**Key accomplishments:**

- Electron desktop widget with security-first architecture (contextIsolation + nodeIntegration=false)
- Frameless window always-on-top with tray icon, multi-monitor positioning, and persistent window state
- Orb component with 4 animated states (idle, listening, processing, responding) via CSS-only compositor thread
- Global hotkey Ctrl+Shift+J for widget activation with graceful fallback and tray menu configuration
- Complete IPC chain: renderer → preload → main → Gateway → FastAPI with Result<T> pattern
- Text chat integration with orb state transitions and speech bubble response display
- PTT voice input with toggle-mode hotkey (Space, Ctrl+Space, CapsLock) via electron-store persistence
- Audio pipeline: MediaRecorder → AudioContext → 16kHz WAV → IPC → Gateway multer → FastAPI WhisperTranscriber
- Retry logic with exponential backoff (3 attempts, jitter ±10%) for audio upload resilience

---

## v1.0 MVP (Shipped: 2026-04-05)

**Phases completed:** 5 phases, 21 plans, 21 tasks

**Key accomplishments:**

- Installable jarvis package with pydantic-settings config layer, ARCH-03 version pins, and 17 xfail test stubs covering all Phase 1 requirements
- Multi-provider LLM factory (lmstudio/openai/anthropic) via create_llm() and heuristic model capability detection via detect_capabilities() — no hardcoded providers, streaming always on
- One-liner:
- Startup validation with Portuguese errors + streaming ChatSession using BaseChatModel.astream() wired into Rich CLI entry point
- SQLite MemoryStore with 4-table schema (conversations/messages/summaries/user_profile), Settings extended with memory paths, and chromadb+sentence-transformers added as dependencies
- One-liner:
- One-liner:
- Human-verified that session history, SQLite persistence, user profile extraction, cross-session profile injection, and ChromaDB semantic recall all work in live LLM conversations.
- CONV-06 formally deferred to v2: within-session coherence satisfied by ChatSession plain message history; LangGraph checkpointer cross-session resume is a v2 concern
- WhisperTranscriber with lazy-loaded faster-whisper, async-safe transcription via asyncio.to_thread(), and 9 mocked unit tests
- argparse --voice flag, /voice command dispatch, and D-08 state messages wired into __main__.py with 13 new integration tests
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 9 @tool payload functions across files/apps/system modules plus ToolLogger audit class — tools return structured dicts for local execution, never call subprocess directly
- ActionExecutor dispatches tool payloads to Linux handlers with confirmation flow, ToolLogger wiring, and graceful error handling for missing system tools
- One-liner:
- 1. [Rule 1 - Bug] pyautogui import fails on headless Linux without DISPLAY
- One-liner:

---
