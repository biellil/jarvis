---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Migração Python → TypeScript
current_phase: 21
status: executing
last_updated: "2026-04-10T02:10:33.904Z"
last_activity: 2026-04-10 -- Phase 21 execution started
progress:
  total_phases: 18
  completed_phases: 14
  total_plans: 56
  completed_plans: 53
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 21 — cutover-python-deprecation

## Current Position

Phase: 21 (cutover-python-deprecation) — EXECUTING
Plan: 1 of 3
Status: Executing Phase 21
Last activity: 2026-04-10 -- Phase 21 execution started

Progress: [░░░░░░░░░░] 0% (Phase 14/21, v1.3)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.3)
- Average duration: -
- Total execution time: 0 hours

**Current phase:**
21

- Tasks completed: 0
- Status: Not started
- Blockers: 0

**Milestone to date:**

- Phases completed: 0/8
- Plans completed: 0
- Tasks completed: 0
- Total blockers encountered: 0

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Contexto herdado do v1.0:

- Config singleton: `from jarvis.config import settings` — nunca ler os.environ diretamente
- asyncio.to_thread() para chamadas bloqueantes (ARCH-02)
- Comunicação Python ↔ Node via HTTP interno (FastAPI)
- Sem auth por enquanto — uso local em rede local

Contexto herdado do v1.1:

- FastAPI 0.135.3 + uvicorn[standard] 0.43.0 — SSE nativo via EventSourceResponse, sem sse-starlette
- Express 5.1 + Node 22 LTS (Node 20 EOL em abril 2026)
- Zod v4 para validação no gateway — nunca misturar com v3
- Single uvicorn worker obrigatório — in-memory session_store quebra com múltiplos workers
- python:3.12-slim como base Docker — nunca Alpine (glibc incompatibility com onnxruntime/ctranslate2)
- `host.docker.internal` + `extra_hosts: host-gateway` para LM Studio a partir dos containers no Linux
- Voice pipeline fica no host, não entra no Docker

Decisões v1.2:

- Electron renderer nunca chama gateway diretamente — tudo via window.jarvis.* → IPC → main → fetch()
- contextIsolation: true + nodeIntegration: false são inegociáveis — estabelecidos no Phase 9 antes de qualquer feature
- MediaRecorder → PCM via AudioContext.decodeAudioData() no renderer antes de enviar (evita C-1 audio format mismatch)
- Windows-only em v1.2 — Mac/Linux ficam para v1.3 (posicionamento e tray têm quirks de plataforma)
- FastAPI port 8000 fica interno — Electron só fala com gateway na porta 3000
- [Phase 11]: Use @vitest-environment directive for React tests instead of environmentMatchGlobs
- [Phase 12]: Default hotkey CmdOrCtrl+Shift+J chosen for low conflict probability
- [Phase 12]: Boolean return from registerHotkey() enables graceful fallback to tray
- [Phase 12]: Use happy-dom instead of jsdom for tests (already installed)
- [Phase 12]: Orb state transitions merged into Task 1 (integral to submit handler)
- [Phase 12]: Fixed 300px window height for speech bubble instead of dynamic resizing via IPC
- [Phase 12]: CSS clip-path for bubble tail (single element, cleaner than pseudo-elements)
- [Phase 12]: Use port 3001 for integration test mock server to avoid conflict with real gateway
- [Phase 12]: 10-second timeout on gateway requests prevents indefinite hang
- [Phase 13]: PTT toggle mode instead of press-and-hold (Electron globalShortcut limitation)
- [Phase 13]: NamedTemporaryFile with delete=False for manual cleanup control
- [Phase 13]: Field name 'audio' for consistency between Gateway and FastAPI
- [Phase 13]: Added python-multipart to pyproject.toml for FastAPI multipart handling
- [Phase 13]: Created test files following TDD RED phase despite implementations existing
- [Phase 13]: Used existing IPC Result pattern for SendAudioResponse
- [Phase 13]: MediaRecorder with audio/webm;codecs=opus for browser recording
- [Phase 13]: AudioContext with 16kHz sample rate for Whisper compatibility
- [Phase 13]: Retry logic with exponential backoff and jitter; skip 4xx errors
- [Phase 13]: PTT toggle mode instead of press-and-hold (Electron globalShortcut limitation)
- [Phase 13]: Centralized store.ts module for all electron-store config persistence
- [Phase 13]: Default PTT hotkey CmdOrCtrl+Space for low conflict probability

Decisões v1.3:

- Migração gradual Python → TypeScript mantendo ambos em paralelo durante transição
- Core primeiro (LLM, Memory, Session) → depois Tools/Voice
- Validação E2E: mesma entrada deve produzir mesma saída em ambos
- apps/backend-py (mantido) + apps/backend-ts (novo) até validação completa
- [Phase 14]: Port 8001 chosen for TypeScript backend (Python 8000, Gateway 3000)
- [Phase 14]: Port 8001 chosen for TypeScript backend (Python 8000, Gateway 3000)
- [Phase 15]: LangChain.js 1.x chosen over 0.3.x (0.3.x entered maintenance mode Nov 2025)
- [Phase 15]: z.coerce.number() for BACKEND_TS_PORT to handle string-to-number conversion from process.env
- [Phase 15]: Runtime version validation over build-time checks — catches Docker/deployment issues
- [Phase 15]: Non-fatal capability detection allows graceful degradation when providers offline
- [Phase 15]: Use configuration: { baseURL } for LM Studio (not basePath) - LangChain.js 1.x pattern

### Key Constraints This Milestone

- **Stack constraint:** Migrating from Python to TypeScript — maintain 1:1 feature parity, no new features in v1.3
- **Parallel backends:** Python (port 8000) and TypeScript (port 8001) run simultaneously until cutover in Phase 21
- **Version trap:** LangChain.js is 0.3.x (NOT 1.x like Python) — explicit verification required in Phase 15
- **Native modules:** better-sqlite3, @nut-tree-fork/nut-js, node-window-manager require pnpm `.npmrc` config (`shamefully-hoist=true`) to build correctly
- **TTS quality tradeoff:** Transformers.js Speecht5 has lower quality than Python's kokoro (no Node.js port available) — documented as known limitation

### Open Questions

1. Can Drizzle ORM introspect existing Python SQLite database and generate matching TypeScript schema automatically? (Phase 16 research needed)
2. Is nodejs-whisper performance comparable to Python faster-whisper, or do we need whisper.cpp C++ bindings? (Phase 19 research needed)
3. Does Porcupine free tier support custom wake word "Hey JARVIS" or only built-in keywords? (Phase 19 research needed)

### Current Blockers

None

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260407-cvd | Fix window config test to expect height 300 | 2026-04-07 | 1de325c | .planning/quick/260407-cvd-fix-window-config-test-to-expect-height- |
| Phase 13 P02 | 10 | 3 tasks | 5 files |
| Phase 13 P01 | 941 | 3 tasks | 7 files |
| Phase 13 P03 | 1114 | 3 tasks | 4 files |
| Phase 13 P04 | 2 | 3 tasks | 8 files |
| Phase 14 P01 | 209 | 3 tasks | 9 files |
| Phase 14 P02 | 1283 | 3 tasks | 2 files |
| Phase 15 P01 | 7 | 3 tasks | 4 files |
| Phase 15 P03 | 1122 | 3 tasks | 4 files |
| Phase 15 P02 | 18 | 3 tasks | 3 files |

## Session Continuity

**If resuming mid-phase:**

- Current phase: 14 - TypeScript Backend Scaffolding
- Next action: Run `/gsd:plan-phase 14` to decompose phase into executable plans

**If between phases:**

- Last completed: Phase 13 - Audio Endpoint + Voice Input (v1.2, completed 2026-04-07)
- Next phase: Phase 14 - TypeScript Backend Scaffolding
- Next action: Run `/gsd:plan-phase 14`

**If blocked:**

- No blockers currently

## Milestone Context

**Previous milestones:**

- v1.0 MVP (Shipped: 2026-04-05) — CLI conversational, multi-LLM, SQLite + ChromaDB memory, voice pipeline, PC control, vision pipeline
- v1.1 FastAPI + Gateway + Docker (Shipped: Phase 6-8) — HTTP API layer, Express gateway, Docker Compose
- v1.2 Desktop UI (Shipped: 2026-04-07) — Electron widget, frameless window, orb animations, global hotkey, text + voice chat, PTT toggle

**v1.3 scope:**

- 39 requirements across 6 categories (INFRA, LLM-TS, MEM-TS, TOOL-TS, VOICE-TS, VAL)
- 8 phases (14-21)
- Parallel Python + TypeScript backends until Phase 21 cutover
- E2E validation in Phase 20 gates removal of Python backend

**Key differences from Python implementation:**

- LangChain.js 0.3.x (NOT 1.x) for agent orchestration
- Drizzle ORM instead of raw SQL for type-safe database access
- nodejs-whisper instead of faster-whisper for STT
- Transformers.js Speecht5 instead of kokoro for TTS (quality tradeoff)
- Porcupine instead of openwakeword for wake word (AccessKey required)

## Archive

### Completed Phases (v1.3)

None yet

### Deferred Items

None yet

### Invalidated Requirements

None yet

---

*STATE.md is the living memory of this project. Update after every phase transition, plan completion, and blocker resolution.*
