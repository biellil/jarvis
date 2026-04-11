---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Voice & UX Polish
current_phase: 22
status: executing
last_updated: "2026-04-11T12:45:02.952Z"
last_activity: 2026-04-11
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 22 — voiceinputmanager-refactor-wake-word-core

## Current Position

Phase: 22 (voiceinputmanager-refactor-wake-word-core) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-04-11

Progress: [░░░░░░░░░░] 0% (v1.4 — 0/2 phases)

## Milestone v1.4 Phase List

- [ ] **Phase 22: VoiceInputManager Refactor + Wake Word Core**
  - Requirements: WAKE-01, WAKE-05, WAKE-06, WAKE-07, WAKE-08, WAKE-09
  - Research flag: YES (needs `/gsd-research-phase` before planning)
  - Critical prereq: extract `VoiceInputManager` from `ptt-hotkey.ts` BEFORE any wake word code (PITFALL #2 mitigation)
- [ ] **Phase 23: Orb UX Polish + Wake Word Visual Feedback**
  - Requirements: WAKE-02, WAKE-03, WAKE-04, ORB-POL-01, ORB-POL-02
  - P2 stretch: ORB-POL-03, ORB-POL-04, ORB-POL-05
  - Research flag: NO (CSS + React patterns already proven in v1.2)
  - Depends on: Phase 22 (needs real `onDetected()` callback)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.4)
- Average duration: -
- Total execution time: 0 hours

**Current phase:**
22

- Tasks completed: 0
- Status: Not started
- Blockers: 0

**Milestone to date:**

- Phases completed: 0/2
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

Decisões v1.4 (roadmap):

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
- [Phase 22]: VoiceInputManager: closure-based singleton no renderer com política PTT-preempts-wakeword (acquire/release/subscribe)

### Key Constraints This Milestone

- **Sequencial obrigatória:** Phase 23 depende do callback `onDetected` real de Phase 22 — não paralelizável
- **Refactor antes de feature:** dentro de Phase 22, `VoiceInputManager` é o primeiro commit ANTES de qualquer código de wake word (invariante de PITFALL #2)
- **CPU budget blocker:** <2% sustained em 4-core após 10min de silêncio é critério de aceitação, não polish
- **Privacy-first:** nenhum áudio de wake word sai do dispositivo (WAKE-09) — verificado pela escolha de lib
- **Zero AccessKey:** Porcupine/Picovoice/Bumblebee banidos — hard-ban via grep em pnpm-lock.yaml no CI
- **Milestone curto:** 2 phases planejadas, MVP (wake word funcional) concentrado em Phase 22. Se Phase 23 precisar ser cortada por tempo, Phase 22 sozinha já recupera CONV-05 e fecha o Goal principal

### Open Questions

1. Cold start latency do modelo ONNX estimada em "500-1000ms" (MEDIUM confidence de blog post) — validar empiricamente no início da Phase 22; se >2s, preload durante `ready-to-show`
2. Viabilidade do CSP de AudioWorklet em Electron+Vite — pode precisar `worker-src 'self' blob:`, mas padrão moderno `new URL('./worklet.js', import.meta.url)` talvez funcione out-of-the-box
3. VAD threshold default de 0.5 foi calibrado para v0.1 do `hey_jarvis` em ambiente específico — mitigado via `.env` (`WAKE_WORD_THRESHOLD`)

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
| 260410-td5 | ajustes ui/ux orb: janela 240x240, drop-shadow externo, colar taskbar | 2026-04-11 | cd27a4e | [260410-td5](./quick/260410-td5-ajustes-ui-ux-orb-janela-240x240-drop-sh/) |
| Phase 22 P01 | 8 | 3 tasks | 6 files |

## Session Continuity

**If resuming mid-phase:**

- Current phase: 22 — VoiceInputManager Refactor + Wake Word Core
- Next action: Run `/gsd:research-phase 22` (research flag YES) → then `/gsd:plan-phase 22`

**If between phases:**

- Last completed: Phase 21 — Cutover & Python Deprecation (v1.3, completed 2026-04-10)
- Next phase: Phase 22 — VoiceInputManager Refactor + Wake Word Core (v1.4)
- Next action: Run `/gsd:research-phase 22`

**If blocked:**

- No blockers currently

## Milestone Context

**Previous milestones:**

- v1.0 MVP (Shipped: 2026-04-05) — CLI conversational, multi-LLM, SQLite + ChromaDB memory, voice pipeline, PC control, vision pipeline
- v1.1 FastAPI + Gateway + Docker (Shipped: 2026-04-06) — HTTP API layer, Express gateway, Docker Compose
- v1.2 Desktop UI (Shipped: 2026-04-07) — Electron widget, frameless window, orb animations, global hotkey, text + voice chat, PTT toggle
- v1.3 Migração Python → TypeScript (Shipped: 2026-04-10) — stack 100% TypeScript, Python removido

**v1.4 scope:**

- 11 P1 requirements across 2 categories (WAKE × 9, ORB-POL × 2) + 3 P2 stretch (ORB-POL-03/04/05)
- 2 phases (22-23)
- Phase 22 MVP é suficiente para fechar o goal principal do milestone (recuperar CONV-05)
- Phase 23 é polish determinístico, baixo risco, pode ser cortado se necessário

**Regression context:**

- `CONV-05` (wake word "Hey JARVIS" via openwakeword) era validated em v1.0 em Python
- Foi removido na v1.3 junto com o backend Python
- v1.4 é reimplementação em TypeScript/Electron — agora rodando client-side no renderer em vez de subprocess Python

## Archive

### Completed Phases (v1.4)

None yet

### Deferred Items

- Custom/user-trained wake words (`VOICE-FUT-04`) — requer horas de dataset, fora de escopo
- Mic device selection (`VOICE-FUT-05`) — defer v1.5+
- Mac/Linux cross-platform polish (`PLAT-FUT-01`) — defer v1.5+
- Hover tooltip explicando estado do orb (`DESK-FUT-04`) — defer v1.5+
- Settings/preferences UI panel (`DESK-FUT-01`) — defer v1.5+

### Invalidated Requirements

None yet

---

*STATE.md is the living memory of this project. Update after every phase transition, plan completion, and blocker resolution.*
