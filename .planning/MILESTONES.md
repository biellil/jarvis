# Milestones

## v1.6 Local Voice Pipeline (Shipped: 2026-04-16)

**Phases completed:** 8 phases, 20 plans, 27 tasks

**Key accomplishments:**

- Commit:
- GPU auto-detection (CUDA/Vulkan/Metal/CPU), WebM-to-16kHz-PCM audio normalization via ffmpeg spawn, model path resolver, and asarUnpack packaging config — all 8 Plan 01 tests GREEN
- One-liner:
- Diagnosis:
- Three failing test files define interface contracts for VRAM-based model selection, Murf/ElevenLabs TTS migration, and voiceHandler pipeline orchestration before any implementation
- VRAM detection with model selection thresholds, multi-model path resolver with packaged/dev duality, and whisper model extraResources wired into electron-builder config
- One-liner:
- One-liner:
- Phase 30 manually verified and approved by user — VRAM detection, E2E voice pipeline, and STT latency all confirmed passing.
- Status:
- Stripped whisper.cpp Vulkan build, ggml-medium.bin model download, binary COPYs, and LD_LIBRARY_PATH from Dockerfile.backend-ts.gpu — GPU image now builds Node.js + SQLite + Vulkan runtime only

---

## v1.5 Conversation Quality & Docker Polish (Shipped: 2026-04-13)

**Phases completed:** 4 phases, 7 plans, 9 tasks

**Key accomplishments:**

- Commit:

---

## v1.4 Voice & UX Polish (Shipped: 2026-04-12)

**Phases completed:** 4 phases, 15 plans, 20 tasks

**Key accomplishments:**

- None.
- Decision:
- Commit:
- `apps/desktop/src/renderer/hooks/useWakeWord.ts`
- Status:
- OrbContext estendido com `wakeWordPaused` e `burstActive`, Orb.tsx renderizando visual paused discreto e amber ring one-shot de 350ms, e bloco `@media (prefers-reduced-motion: reduce)` desligando as 6 animações mas preservando transitions — tudo em renderer puro, zero IPC.
- None — plan executed exactly as written.
- One-liner:
- 1. [Rule 2 — Missing critical functionality] Added D08_STRINGS map inside sendAudioAndHandle.ts
- File touched:
- Install + assets (commit `5f48827`):
- WAKE-10..13 requirements formalized, traceability updated, human UAT approved — E2E wake word pipeline confirmed with real mic
- One-liner:
- Dois sublayers sobrepostos com opacity transition 400ms substituem troca instantânea de gradiente no orb (ORB-POL-04)
- One-liner:

---

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
