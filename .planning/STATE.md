---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Cross-Platform + Settings UI
current_phase: 33
status: roadmap_ready
last_updated: "2026-04-15T00:00:00.000Z"
last_activity: 2026-04-15
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-15)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Milestone v1.7 — Cross-Platform + Settings UI

## Current Position

Phase: 33 — Cross-Platform Support (not started)
Plan: —
Status: Roadmap ready — awaiting first plan
Last activity: 2026-04-15 — v1.7 roadmap created (Phases 33-34)

Progress: ░░░░░░░░░░ 0%

## Milestone v1.7 Phase List

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 33 | Cross-Platform Support | PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06 | Not started |
| 34 | Settings UI | SET-01, SET-02, SET-03, SET-04, SET-05 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 20 (v1.6)
- Average duration: -
- Total execution time: 0 hours

**Current phase:**
33

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
- [Phase 30-01]: handleAudio named function export with VoiceHandlerDeps injection for testability (follows ChatHandlerDeps pattern)
- [Phase 30-01]: TTS graceful degrade returns audioBase64=null with message intact, not a hard error (WAKE-10 precedent)
- [Phase 30-voice-handler-tts-migration]: vramMb=0 fallback to base (D-03) — integrated GPU or driver incomplete, safe conservative
- [Phase 30-voice-handler-tts-migration]: getWhisperModelPath(modelName='base') default arg preserves backward compatibility
- [Phase 30-voice-handler-tts-migration]: Stub-with-migration-error pattern for backend-ts TTS files — preserves TypeScript compilation until Phase 32 removes /chat/audio endpoint
- [Phase 30-voice-handler-tts-migration]: getWhisperInstance extracted to whisperResources.ts as testable mock point for voiceHandler
- [Phase 30-voice-handler-tts-migration]: VoiceHandlerDeps optional on ChatHandlerDeps — USE_WHISPER_CPP=false path unchanged, no gateway test regression
- [Phase 30]: TTS migrated to Electron main (apps/desktop/src/main/voiceInput/tts/), backend-ts providers stubbed. VRAM detection via app.getGPUInfo at startup. voiceHandler.ts orchestrates STT->LLM->TTS pipeline. handleSendAudio wired to voiceHandler when USE_WHISPER_CPP=true.
- [Phase 32]: Keep voice_calls schema in SQLite — part of DB schema, removal requires migration with no user-facing benefit

### Key Constraints This Milestone

- **Electron Frameless on macOS**: `titleBarStyle: 'hiddenInset'` ou `frame: false` — comportamento difere do Windows; `hasShadow: false` pode ser necessário para transparência real
- **Electron Frameless on Linux (X11)**: `frame: false` + `transparent: true` requer compositor X11 (Compton/Picom); sem compositor, transparência cai para cor sólida
- **Tray icon macOS**: precisa de ícone 16x16 Template PNG (sufixo `Template`) para integrar com menu bar escura/clara
- **Tray icon Linux**: requer `libappindicator` ou `libayatana-appindicator` instalado; Electron 28+ usa AppIndicator por padrão
- **globalShortcut macOS**: requer "Accessibility" permission no System Settings → Privacy & Security; falha silenciosa sem essa permissão
- **getUserMedia macOS**: requer "Microphone" permission no System Settings → Privacy & Security; primeira vez pede autorização ao usuário
- **Settings window**: nova `BrowserWindow` com preload dedicado e contextIsolation — nunca reusar o preload do orb
- **electron-store já em uso**: todas as configurações de Settings devem usar a instância existente de `electron-store` — não criar nova instância paralela
- **IPC Settings ↔ main**: renderer de Settings nunca acessa store diretamente — tudo via IPC handlers dedicados (get-settings, save-settings)

### Open Questions

- macOS: usar `vibrancy: 'sidebar'` no BrowserWindow para efeito visual nativo, ou manter transparência atual?
- Linux Wayland: testar com XWayland como fallback — documentar resultado para PLAT-08 (v2)?
- Settings window: janela modal (parent: mainWindow) ou independente? Modal bloqueia o orb enquanto Settings está aberto.

### Current Blockers

None

### Pending Todos

- Planejar Phase 33 via `/gsd:plan-phase 33`

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260407-cvd | Fix window config test to expect height 300 | 2026-04-07 | 1de325c | .planning/quick/260407-cvd-fix-window-config-test-to-expect-height- |
| 260410-sox | Fix Electron orb — transparent window, 160x160, click-through | 2026-04-10 | 671e65c | .planning/quick/260410-sox-fix-electron-orb-only-visible-no-rectang/ |
| 260410-slm | fix electron transparent window orb only visible | 2026-04-10 | ed921af | .planning/quick/260410-slm-fix-electron-transparent-window-orb-only/ |
| 260410-td5 | ajustes ui/ux orb: janela 240x240, drop-shadow externo, colar taskbar | 2026-04-11 | cd27a4e | .planning/quick/260410-td5-ajustes-ui-ux-orb-janela-240x240-drop-sh/ |
| 260413-gtv | upgrade STT to whisper medium + multi-platform GPU support (Vulkan/CUDA/CPU) | 2026-04-13 | ead2789 | .planning/quick/260413-gtv-upgrade-stt-to-whisper-medium-multi-plat/ |

## Session Continuity

**If resuming mid-phase:**

- Current phase: 33 — Cross-Platform Support
- Next action: Run `/gsd:plan-phase 33`

**If between phases:**

- Last completed: Phase 32 — Backend & Docker Cleanup (v1.6, completed 2026-04-15)
- Next phase: Phase 33 — Cross-Platform Support
- Next action: `/gsd:plan-phase 33`

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
- v1.6 Local Voice Pipeline (Shipped: 2026-04-15) — whisper.cpp STT local no Electron, GPU auto-detection, TTS migrado para Electron, IPC path E2E, Docker sem dependências de áudio

**v1.7 scope:**

- Phase 33: macOS + Linux frameless window + tray icon + globalShortcut + wake word (PLAT-01..06)
- Phase 34: Settings BrowserWindow + hotkey config + TTS config + Whisper model override + electron-store persistence (SET-01..05)

## Archive

### Completed Phases (v1.6)

- Phase 29 — STT Core Infrastructure (completed 2026-04-14): whisper.cpp Node bindings, GPU auto-detection, audio normalization, ASAR config, USE_WHISPER_CPP feature flag
- Phase 30 — Voice Handler + TTS Migration (completed 2026-04-14): voiceHandler.ts STT→LLM→TTS orchestration, TTS migrated to Electron main, VRAM-based model selection, human sign-off passed
- Phase 31 — IPC Refactor & E2E Rollout (completed 2026-04-15): sendAudioAndHandle refactored for IPC, feature flag E2E rollout validated
- Phase 32 — Backend & Docker Cleanup (completed 2026-04-15): /chat/audio endpoints removed from gateway + backend-ts, nodejs-whisper removed from Docker

### Deferred Items

- Performance optimization: latência <100ms p95 — v1.8+
- Vision pipeline migração para TypeScript — v1.8+
- Speech bubble redesign, History/context panel — v1.8+
- Offline TTS local (Kokoro Node.js port) — v1.8+
- Streaming TTS (token-by-token playback) — v1.8+
- Wayland support no Linux (PLAT-08) — v2
- PTT hotkey funcional no macOS/Linux (PLAT-07) — v2

### Invalidated Requirements

None yet

---

*STATE.md is the living memory of this project. Update after every phase transition, plan completion, and blocker resolution.*
