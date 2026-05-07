# Milestones

## v2.3 LLM Providers & System Actions (Shipped: 2026-05-07)

**Phases completed:** 5 phases, 13 plans, 15 tasks

**Key accomplishments:**

- @langchain/google-genai installed; LLMProvider union extended to 4 providers; factory returns ChatGoogleGenerativeAI with gemini-2.0-flash and streaming:true; all 30 llm/ tests pass
- One-liner:
- electron-store API key storage for geminiApiKey/openaiApiKey/anthropicApiKey, RELOAD_LLM IPC channel with error-toast lmstudio-fallback handler, and 'gemini' added to LlmProvider union
- One-liner:
- One-liner:
- One-liner:
- createAdjustVolumeTool
- ChatOpenAIStreamingEvents subclass with native /api/v1/chat SSE parser, fallback to super.stream() on error, factory feature flag USE_LM_STUDIO_STREAMING_EVENTS, and reload-llm route extension
- One-liner:
- One-liner:
- embeddingQueue.enqueueEmbed wired into vectors.ts write paths; manager.ts saveTurn split into synchronous SQLite persistence + fire-and-forget Chroma indexing via _queueVectorIndexing.
- One-liner:

---

## v2.2 LLM Actions & Polish (Shipped: 2026-05-06)

**Phases completed:** 6 phases, 22 plans, 25 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] settings:get IPC handler missing new SettingsData fields
- One-liner:
- One-liner:
- 1. [Rule 3 - Blocking] Added `getActiveTtsProvider()` to `tts/index.ts`
- Commit:
- File:
- WebSocket server at /api/actions with clientId connection Map, Zod path whitelist (home/Downloads/Documents/Desktop), audit POST to /internal/actions-log, and http.Server refactor in gateway index.ts
- One-liner:
- Stable clientId persisted via crypto.randomUUID + electron-store; actionsClient.ts WebSocket client with 1s→30s exponential backoff connects to gateway /api/actions and bridges action_request messages to renderer via ACTION_REQUEST IPC channel
- useActionConfirmation hook
- 1. [Rule 1 - Bug] Fixed unhandled rejection in timeout test
- One-liner:
- One-liner:
- One-liner:
- HTTP-polling soak test with QA-01 thresholds (100MB heap / 200MB RSS / 50ms p99 / ctx=1) and Chart.js HTML report generated at test completion

---

## v2.1 Settings UX (Shipped: 2026-05-05)

**Phases completed:** 3 phases, 12 plans, 9 tasks

**Key accomplishments:**

- Sidebar-nav settings shell with 200px fixed sidebar, internal-scroll content panel, sticky save bar, and SettingsSectionProps interface contract for Wave 2 section components
- PttSection with Phase 48 HotkeyRecorder/Field and AlwaysListeningSection with Radix Slider, exact ARIA strings, and real-time VAD IPC delegation
- TTS provider/key/voice section and Whisper model select section built with Phase 48 Field + Select + Input primitives — no legacy HTML selects or gray tokens
- SettingsLayout wired to real section components, SettingsForm delegated as re-export shim, legacy HotkeyRecorder deleted, Vitest suite fully green (24 passed, 1 skipped)
- Task 1 — `whisperModelResolver.ts`:
- 1. [Rule 1 - Adaptation] 'auto' model resolution uses getSelectedModel() instead of resolveWhisperModel
- Task 1 — `voiceHandler.ts` extensions:
- Task 1 — `WhisperSection.tsx` extensions:
- Task 1 — whisper-ipc.test.ts (5 tests, all passing):

---

## v1.9 Voice Capture Modes (Shipped: 2026-04-30)

**Phases completed:** 6 phases, 20 plans, 20 tasks

**Key accomplishments:**

- Decision:

---

## v1.8 Memory Intelligence (Shipped: 2026-04-25)

**Phases completed:** 4 phases, 10 plans, 12 tasks
**Git range:** b091d5e..a34a26a (68 commits)
**Code delta:** 71 files, +12.825 / -358 LOC | TS codebase: ~21.565 LOC | Tests: 351 passing

**Key accomplishments:**

- **Phase 35 (Schema & Type Foundation):** typed_memories Drizzle table com CHECK constraint no enum type, migration 0003, 3 ChromaDB collections separadas (semantic/episodic/procedural), e validateMemoryConsistency() non-blocking no startup com source_id cross-check
- **Phase 36 (Memory Writer):** MemoryExtractor com `withStructuredOutput` + Zod discriminated union, dual-write SQLite+ChromaDB em saveTypedMemory(), fire-and-forget `_extractAndWriteMemories()` wireado em ChatSession.send/sendStream — extração de fatos sem impactar pipeline de voz
- **Phase 37 (Context Builder):** buildContext() refatorado com Promise.all paralelo (3 queryMemoriesByType simultâneas), top-k=5 sem threshold (remove 0.7 hardcoded), headers pt-BR, rollingSum opcional — latência total <200ms verificada
- **Phase 38 (Rolling Summarization):** runRollingSummarization com threshold 20, pitfall-3 protection (delete só após summary não-vazio), cache `_latestSummary`, fire-and-forget em send/sendStream — conversas nunca crescem unbounded
- **Reliability:** MEM-05 error handling parity em 7 métodos; consistency check startup; void pattern consistente em 4 call sites cross-phase
- **Audit:** 17/17 requirements satisfeitos via 3-source cross-reference; 3/3 E2E flows verificados; 0 critical gaps

**Tech debt (advisory, não-bloqueante):**

- 4 warnings em Phase 38 code review (WR-01..04 — MessageContent array, role consistency, race condition em sends concorrentes, _latestSummary não rehidratado no startup)
- Nyquist VALIDATION.md em status `draft` em todas as 4 phases (meta-validação não fechada)

---

## v1.7 Cross-Platform + Settings UI (Shipped: 2026-04-19)

**Phases completed:** 5 phases, 14 plans, 17 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- One-liner:
- One-liner:
- Structured E2E verification template for Portuguese responses, cross-session memory recall, and recall_memory tool validation
- One-liner:
- One-liner:
- macOS Dock hide + mac/linux whisper prebuilds bundled + Linux X11 compositor documented — JARVIS now has complete cross-platform packaging and startup behavior.
- Human sign-off received for macOS (PLAT-01/02/03) and Linux X11 (PLAT-04/05/06) — Phase 33 Cross-Platform Support complete
- Task 1 — store.ts + ipc-types.ts (TDD GREEN)
- Task 1: settings.ts extended with SETTINGS_GET and SETTINGS_SAVE
- Settings renderer page: 5 React components (HotkeyRecorder, TtsProviderSelect, SettingsForm, settings.tsx entry, settings.html) with all 14 component tests GREEN
- Settings window fully wired: preload exposes window.settings IPC bridge, tray menu has "Settings" item, singleton BrowserWindow with hide-on-close

---

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
