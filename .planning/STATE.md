---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Local Voice Pipeline
current_phase: 29
status: executing
last_updated: "2026-04-14T13:35:58.275Z"
last_activity: 2026-04-14
progress:
  total_phases: 11
  completed_phases: 3
  total_plans: 11
  completed_plans: 10
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-13)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 29 — STT Core Infrastructure

## Current Position

Phase: 29 (STT Core Infrastructure) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-04-14

Progress: ░░░░░░░░░░ 0% (0/4 phases)

## Milestone v1.6 Phase List

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 29 | STT Core Infrastructure | STT-01, STT-03, STT-04, INFRA-01, INFRA-02 | Not started |
| 30 | Voice Handler + TTS Migration | ARCH-05, STT-02, STT-05, TTS-01, TTS-02, TTS-03 | Not started |
| 31 | IPC Refactor & E2E Rollout | ARCH-06 | Not started |
| 32 | Backend & Docker Cleanup | INFRA-03, INFRA-04, INFRA-05 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 7 (v1.5)
- Average duration: -
- Total execution time: 0 hours

**Current phase:**
29

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
- [Phase 13]: PTT toggle mode instead of press-and-hold (Electron globalShortcut limitation)
- [Phase 13]: MediaRecorder with audio/webm;codecs=opus for browser recording
- [Phase 13]: AudioContext with 16kHz sample rate for Whisper compatibility
- [Phase 13]: Retry logic with exponential backoff and jitter; skip 4xx errors
- [Phase 13]: Centralized store.ts module for all electron-store config persistence
- [Phase 13]: Default PTT hotkey CmdOrCtrl+Space for low conflict probability

Decisões v1.3:

- Migração gradual Python → TypeScript mantendo ambos em paralelo durante transição
- Core primeiro (LLM, Memory, Session) → depois Tools/Voice
- Validação E2E: mesma entrada deve produzir mesma saída em ambos
- [Phase 14]: Port 8001 chosen for TypeScript backend (Python 8000, Gateway 3000)
- [Phase 15]: LangChain.js 1.x chosen over 0.3.x (0.3.x entered maintenance mode Nov 2025)
- [Phase 21-cutover-python-deprecation]: .env não commitado (gitignore) — edição local aplicada, vars Python-only removidas sem expor segredos

Decisões v1.4:

- **Wake word roda no renderer, não no main process** — reusa `getUserMedia` já wired pelo `useAudioRecorder`, zero binários nativos, zero IPC por chunk de 80ms
- **`onnxruntime-web@1.24.3` + openwakeword ONNX models** é a escolha única
- **`VoiceInputManager` é refactor prerequisito** — extrair de `apps/desktop/src/main/ptt-hotkey.ts` ANTES de qualquer código de wake word
- **Wake word gated por `OrbContext` state** — só roda inferência quando `state === 'idle'`
- **TTS player faz `wakeword.pause()/resume()`** no wrapping de `beforePlay/afterPlay + 300ms`
- **Política PTT sempre ganha** sobre wake word em caso de conflito (WAKE-07)
- **CPU budget <2% sustained** após 10min de silêncio num laptop 4-core
- **`backgroundThrottling: false`** obrigatório na BrowserWindow
- **Modelos ONNX via `extraResources`** no electron-builder, NÃO `asarUnpack`
- **sendAudioAndHandle como helper compartilhado** — elimina duplicação PTT/wake word
- **ffmpeg-static como fallback** — dev local Windows não precisa instalar ffmpeg manualmente
- **Docker compila whisper-cli** — container autossuficiente, zero setup manual pra STT
- **Murf.ai TTS com fallback local** — voz pt-BR masculina cloud, degrade pra local se sem key
- **extractFinalAiText usa _getType()** — AIMessageChunk não é instanceof AIMessage no LangChain

Decisões v1.5:

- [Phase 26]: ChromaDB 1.0.12 image chosen (latest stable as of April 2026)
- [Phase 26]: Backend-ts depends_on chromadb with service_healthy condition
- [Phase 26]: CHROMA_HOST env var defaults to localhost for dev, chromadb for Docker
- [Phase 26]: Switched from npx nodejs-whisper download to direct curl download to avoid TTY prompt issues in Docker build
- [Phase 26]: WHISPER_MODEL env var set to base to match pre-downloaded model and prevent runtime fallback download
- [Phase 27]: Translated system prompt to Portuguese Brazilian with casual tone and explicit language instruction (CONV-07)
- [Phase 27]: Implemented dynamic topK memory recall (3-10 results with similarity >0.7) instead of fixed topK=5 (CONV-08)
- [Phase 27-02]: Manual E2E verification chosen over automated tests for conversation quality validation
- [Phase 28]: Multi-turn window 8s configurável via VITE_MULTI_TURN_WINDOW_MS (MTURN-01)
- [Phase 29]: asarUnpack for @fugood .node binaries (D-01): node_modules/@fugood/** covers all native addons
- [Phase 29]: whisperResources uses app.getPath('userData') directly — not isPackaged branching — because userData is always real filesystem (D-02, D-03)
- [Phase 29]: USE_WHISPER_CPP wired at module/startup scope — single env read, no per-call overhead (D-09, D-13, INFRA-02)
- [Phase 29]: handleSendAudio guard-clause stub returns NOT_IMPLEMENTED for Phase 31 — gateway path intact when flag=false

### Key Constraints This Milestone

- **`@fugood/whisper.node@1.0.16`** é o pacote escolhido — suporte CUDA/Vulkan/Metal/CPU, prebuilt binaries, atualizado março 2026
- **ASAR unpacking é critical path** — `.node` binários quebram sem `asarUnpack` configurado — validar em Phase 29 antes de qualquer outra coisa
- **Feature flag `USE_WHISPER_CPP=false` default** — rollout seguro, comportamento anterior preservado durante desenvolvimento
- **Audio normalization obrigatória** — MediaRecorder produz 48kHz, whisper.cpp requer 16kHz PCM mono — normalizar ANTES de qualquer chamada STT
- **Backend-ts só recebe texto após v1.6** — endpoints /chat/audio e código TTS devem ser removidos no Phase 32
- **sendAudioAndHandle vai mudar profundamente** — atualmente envia áudio ao backend, passará a enviar áudio ao main via IPC
- **GPU fallback deve ser explícito** — log visível quando CPU fallback ocorre, nunca silencioso

### Open Questions

- whisper.cpp models: `base` como default ou upgrade para `medium` após Phase 29 PoC? Verificar latência real no RX 7600.
- Model cache location: `app.getPath('userData')/models/whisper/` — confirmar caminho no Phase 29.

### Current Blockers

None

### Pending Todos

- Planejar Phase 29 via `/gsd:plan-phase 29`

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260407-cvd | Fix window config test to expect height 300 | 2026-04-07 | 1de325c | .planning/quick/260407-cvd-fix-window-config-test-to-expect-height- |
| 260410-sox | Fix Electron orb — transparent window, 160x160, click-through | 2026-04-10 | 671e65c | .planning/quick/260410-sox-fix-electron-orb-only-visible-no-rectang/ |
| 260410-slm | fix electron transparent window orb only visible | 2026-04-10 | ed921af | .planning/quick/260410-slm-fix-electron-transparent-window-orb-only/ |
| 260410-td5 | ajustes ui/ux orb: janela 240x240, drop-shadow externo, colar taskbar | 2026-04-11 | cd27a4e | .planning/quick/260410-td5-ajustes-ui-ux-orb-janela-240x240-drop-sh/ |
| 260413-gtv | upgrade STT to whisper medium + multi-platform GPU support (Vulkan/CUDA/CPU) | 2026-04-13 | ead2789 | .planning/quick/260413-gtv-upgrade-stt-to-whisper-medium-multi-plat/ |
| Phase 29 P02 | 6 | 3 tasks | 5 files |
| Phase 29 P03 | 8 | 2 tasks | 3 files |

## Session Continuity

**If resuming mid-phase:**

- Current phase: 29 — STT Core Infrastructure
- Next action: Run `/gsd:plan-phase 29`

**If between phases:**

- Last completed: Phase 28 — Multi-Turn Voice (v1.5, completed 2026-04-13)
- Next phase: Phase 29 — STT Core Infrastructure
- Next action: `/gsd:plan-phase 29`

**If blocked:**

- No blockers currently

## Milestone Context

**Previous milestones:**

- v1.0 MVP (Shipped: 2026-04-05) — CLI conversacional, multi-LLM, SQLite + ChromaDB memory, voice pipeline, PC control, vision pipeline
- v1.1 FastAPI + Gateway + Docker (Shipped: 2026-04-06) — HTTP API layer, Express gateway, Docker Compose
- v1.2 Desktop UI (Shipped: 2026-04-07) — Electron widget, frameless window, orb animations, global hotkey, text + voice chat, PTT toggle
- v1.3 Migração Python → TypeScript (Shipped: 2026-04-10) — stack 100% TypeScript, Python removido
- v1.4 Voice & UX Polish (Shipped: 2026-04-12) — wake word offline, VAD real Silero, Murf.ai TTS, orb polish completo
- v1.5 Conversation Quality & Docker Polish (Shipped: 2026-04-13) — ChromaDB Docker, whisper base pré-baixado, system prompt pt-BR, multi-turn voice

**v1.6 scope:**

- Phase 29: whisper.cpp Node bindings + GPU auto-detection + audio normalization + ASAR + feature flag
- Phase 30: voiceHandler.ts orquestração + TTS migrado para Electron main + seleção modelo por VRAM
- Phase 31: sendAudioAndHandle refactor IPC + E2E rollout
- Phase 32: remover endpoints áudio do gateway/backend-ts + remover nodejs-whisper do Docker

## Archive

### Completed Phases (v1.6)

None yet

### Deferred Items

- Mac/Linux cross-platform support (Electron position/tray quirks) — v1.7+
- Performance optimization: latência <100ms p95 — v1.7+
- Vision pipeline migração para TypeScript — v1.7+
- Settings/preferences UI, Speech bubble redesign, History/context panel — v1.7+
- Offline TTS local (Kokoro Node.js port) — v1.7+
- Streaming TTS (token-by-token playback) — v1.7+

### Invalidated Requirements

None yet

---

*STATE.md is the living memory of this project. Update after every phase transition, plan completion, and blocker resolution.*
