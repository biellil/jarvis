---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Conversation Quality & Docker Polish
current_phase: 28
status: verifying
last_updated: "2026-04-13T13:15:02.934Z"
last_activity: 2026-04-13
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 28 — multi-turn-voice

## Current Position

Phase: 28 (multi-turn-voice) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-04-13

Progress: [░░░░░░░░░░] 0% (v1.5 — 0/3 phases)

## Milestone v1.5 Phase List

- [ ] **Phase 26: Docker Infrastructure**
  - Requirements: DOCK-06, DOCK-07, DOCK-08, DOCK-09
  - Research flag: LIGHT (ChromaDB JS client Docker networking, whisper model pre-download in multi-stage build)
  - Depends on: Phase 25 (v1.4 shipped)
- [ ] **Phase 27: Conversation Quality**
  - Requirements: CONV-07, CONV-08, CONV-09
  - Research flag: NO (system prompt and ChromaDB recall patterns already exist in codebase)
  - Depends on: Phase 26 (ChromaDB service must be running for cross-session memory to work)
- [ ] **Phase 28: Multi-Turn Voice**
  - Requirements: MTURN-01, MTURN-02, MTURN-03
  - Research flag: NO (hooks and orb state machine already proven in v1.4)
  - Depends on: Phase 24 (wake word full pipeline — TTS→idle cycle exists and needs interception)

## Performance Metrics

**Velocity:**

- Total plans completed: 15 (v1.4)
- Average duration: -
- Total execution time: 0 hours

**Current phase:**
28

- Tasks completed: 0
- Status: Not started
- Blockers: 0

**Milestone to date:**

- Phases completed: 0/3
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
- **`onnxruntime-web@1.24.3` + openwakeword ONNX models** é a escolha única — rejeita `bumblebee-hotword-node` (Porcupine-derivado banido por CLAUDE.md + README explícito "NOT for Electron"), `@picovoice/porcupine-node` (AccessKey viola privacy), `snowboy` (descontinuado)
- **`VoiceInputManager` é refactor prerequisito** — extrair de `ptt-hotkey.ts` ANTES de qualquer código de wake word. Sem isso, duas instâncias de `MediaRecorder` competem pelo mesmo `MediaStream` em produção
- **Wake word gated por `OrbContext` state** — só roda inferência quando `state === 'idle'`, previne TTS self-trigger feedback loop
- **TTS player faz `wakeword.pause()/resume()`** no wrapping de `beforePlay/afterPlay + 300ms` para absorber speaker tail
- **Política PTT sempre ganha** sobre wake word em caso de conflito (WAKE-07)
- **CPU budget <2% sustained** após 10min de silêncio num laptop 4-core — success criterion bloqueante (PITFALL #4)
- **`backgroundThrottling: false`** obrigatório na BrowserWindow (janela oculta continua processando áudio)
- **Modelos ONNX via `extraResources`** no electron-builder, NÃO `asarUnpack` — runtime path resolver `app.isPackaged ? process.resourcesPath : __dirname/../..`
- **Phase 22 sequencial antes de Phase 23** — polish visual precisa do callback `onDetected()` real, animar contra stub é retrabalho
- **Mac/Linux continua deferido** para v1.5+ (permission dialog silencioso, WSL sem mic documentados em PITFALLS mas fora de escopo)
- **Modelo `hey_jarvis_v0.1.onnx`** tem licença CC BY-NC-SA 4.0 — aceitável porque PROJECT.md declara "assistente pessoal para uso próprio"
- **sendAudioAndHandle como helper compartilhado** — elimina duplicação PTT/wake word, single source of truth para áudio → backend
- **ffmpeg-static como fallback** — dev local Windows não precisa instalar ffmpeg manualmente
- **Docker compila whisper-cli** — container autossuficiente, zero setup manual pra STT
- **Murf.ai TTS com fallback local** — voz pt-BR masculina cloud, degrade pra local se sem key
- **extractFinalAiText usa _getType()** — AIMessageChunk não é instanceof AIMessage no LangChain
- [Phase 26]: ChromaDB 1.0.12 image chosen (latest stable as of April 2026)
- [Phase 26]: Backend-ts depends_on chromadb with service_healthy condition
- [Phase 26]: CHROMA_HOST env var defaults to localhost for dev, chromadb for Docker
- [Phase 26]: Switched from npx nodejs-whisper download to direct curl download to avoid TTY prompt issues in Docker build
- [Phase 26]: WHISPER_MODEL env var set to base to match pre-downloaded model and prevent runtime fallback download
- [Phase 26]: Gap identified in verification was already fixed in plan 26-02 commit dc1822c — zero-work plan documented pre-existing solution
- [Phase 27]: Translated system prompt to Portuguese Brazilian with casual tone and explicit language instruction (CONV-07)
- [Phase 27]: Implemented dynamic topK memory recall (3-10 results with similarity >0.7) instead of fixed topK=5 (CONV-08)
- [Phase 27-02]: Manual E2E verification chosen over automated tests for conversation quality validation - behavioral patterns require human judgment
- [Phase 27-02]: Checkpoint:human-verify gate ensures verification template is executed before phase completion

### Key Constraints This Milestone

- **Phase 26 antes de Phase 27:** CONV-08/09 requerem ChromaDB funcional em Docker — não paralelizável
- **Phase 26 pode ser paralela a Phase 28:** Multi-turn voice (Electron renderer) não depende de mudanças Docker
- **System prompt é backend-only:** CONV-07 é mudança cirúrgica no ChatSession, não afeta Electron
- **Multi-turn window é renderer-only:** MTURN-01..03 são hooks e orb state, zero mudança no backend-ts

### Open Questions

1. ChromaDB JS client em Docker: precisa de `chromadb` npm package apontando para serviço interno ou cliente HTTP direto? Investigar durante Phase 26.
2. Whisper model pre-download: `whisper-cli --download-model base` durante `docker build` requer acesso à internet na build — confirmar se ambiente CI tem acesso.
3. Multi-turn window: se usuário começa a falar antes dos N segundos expirarem, o VAD (`@ricky0123/vad-web`) detecta automaticamente ou precisa de lógica extra de detecção de início de fala?

### Current Blockers

None

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260407-cvd | Fix window config test to expect height 300 | 2026-04-07 | 1de325c | .planning/quick/260407-cvd-fix-window-config-test-to-expect-height- |
| 260410-sox | Fix Electron orb — transparent window, 160x160, click-through | 2026-04-10 | 671e65c | .planning/quick/260410-sox-fix-electron-orb-only-visible-no-rectang/ |
| 260410-slm | fix electron transparent window orb only visible | 2026-04-10 | ed921af | .planning/quick/260410-slm-fix-electron-transparent-window-orb-only/ |
| 260410-td5 | ajustes ui/ux orb: janela 240x240, drop-shadow externo, colar taskbar | 2026-04-11 | cd27a4e | .planning/quick/260410-td5-ajustes-ui-ux-orb-janela-240x240-drop-sh/ |
| Phase 26 P01 | 2 | 2 tasks | 4 files |
| Phase 26 P02 | 8 | 2 tasks | 2 files |
| Phase 26 P03 | 2 | 1 tasks | 0 files |
| Phase 27 P01 | 12 | 2 tasks | 2 files |
| Phase 27 P02 | 5 | 2 tasks | 1 files |
| Phase 28 P01 | 11 | 3 tasks | 4 files |
| Phase 28 P02 | 7 | 5 tasks | 6 files |

## Session Continuity

**If resuming mid-phase:**

- Current phase: 26 — Docker Infrastructure
- Next action: Run `/gsd:plan-phase 26`

**If between phases:**

- Last completed: Phase 25 — Orb Visual Polish P2 (v1.4, completed 2026-04-12)
- Next phase: Phase 26 — Docker Infrastructure (v1.5)
- Next action: Run `/gsd:plan-phase 26`

**If blocked:**

- No blockers currently

## Milestone Context

**Previous milestones:**

- v1.0 MVP (Shipped: 2026-04-05) — CLI conversacional, multi-LLM, SQLite + ChromaDB memory, voice pipeline, PC control, vision pipeline
- v1.1 FastAPI + Gateway + Docker (Shipped: 2026-04-06) — HTTP API layer, Express gateway, Docker Compose
- v1.2 Desktop UI (Shipped: 2026-04-07) — Electron widget, frameless window, orb animations, global hotkey, text + voice chat, PTT toggle
- v1.3 Migração Python → TypeScript (Shipped: 2026-04-10) — stack 100% TypeScript, Python removido
- v1.4 Voice & UX Polish (Shipped: 2026-04-12) — wake word offline, VAD real Silero, Murf.ai TTS, orb polish completo

**v1.5 scope:**

- 10 P1 requirements across 3 categories (DOCK × 4, CONV × 3, MTURN × 3)
- 3 phases (26-28)
- Phase 26 e Phase 28 podem ser desenvolvidas em paralelo (sem dependência entre si)
- Phase 27 depende de Phase 26 (ChromaDB funcional em Docker)

**Regression context:**

- ChromaDB em container apresentava `ChromaConnectionError` porque o cliente JS tentava conectar em `localhost` dentro do container, não no serviço Docker
- System prompt pt-BR estava ausente — JARVIS respondia em inglês dependendo do modelo
- `recall_memory` tool existia mas ChromaDB não estava populado em produção (sempre retornava vazio)

## Archive

### Completed Phases (v1.5)

None yet

### Deferred Items

- TTS quality improvement (Kokoro Node.js port ou C++ bindings) — v1.6+
- Mac/Linux cross-platform support (Electron position/tray quirks) — v1.6+
- Performance optimization: latência <100ms p95 — v1.6+
- Vision pipeline migração para TypeScript — v1.6+
- STT 100% offline sem fallback cloud — v1.6+
- Settings/preferences UI, Speech bubble redesign, History/context panel — v1.6+

### Invalidated Requirements

None yet

---

*STATE.md is the living memory of this project. Update after every phase transition, plan completion, and blocker resolution.*
