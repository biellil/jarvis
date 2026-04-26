# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente para uso próprio que roda no PC (Linux, Windows, macOS). Conversa naturalmente por voz e texto, lembra de tudo entre sessões via SQLite + ChromaDB semântico, executa ações no PC (abre apps, gerencia arquivos, controla sistema), e analisa a tela com pipeline de visão com fallback inteligente. O cérebro é multi-LLM: conecta com modelos locais via LM Studio ou provedores cloud (Claude, GPT-4) sem travar em nenhum.

## Core Value

Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## Current Milestone: v1.9 Voice Capture Modes

**Goal:** Três modos de captura de voz mutuamente exclusivos selecionáveis via tray menu rápido — wake word (atual), always-listening com VAD+LLM intent classifier, e push-to-talk sem wake word.

**Target features:**
- Mode selector state machine (apenas 1 modo ativo, persiste via electron-store)
- Tray menu de troca rápida (radio submenu "Voice Mode")
- Modo Always-Listening: captura contínua + Silero VAD + LLM intent classifier para filtrar falsos positivos
- Modo PTT-only: desabilita wake word, reutiliza hotkey configurada em v1.7 Settings
- Visual feedback do orb por modo (cores/animação distintas)
- Migração suave: usuários existentes permanecem em wake word

**Key constraints:**
- Modos exclusivos (1 ativo por vez)
- LLM intent classifier deve respeitar privacidade (preferência: local via LM Studio quando configurado)
- Audio buffer para always-listening: sliding window com descarte explícito (não persistir áudio bruto)

## Current State (v1.8 Memory Intelligence shipped — 2026-04-25)

**Stack:** Node.js 22 + TypeScript + Express 5 + LangChain.js 1.x + Electron + Docker | **LOC:** ~21.500 TS (backend-ts + gateway + desktop) | **Tests:** 351 passing

**v1.8 Memory Intelligence complete:** sistema de memória transformado de RAG padrão para pipeline LLM-driven com 3 tipos separados (semantic/episodic/procedural), extração assíncrona via `withStructuredOutput` + Zod, retrieval top-k=5 paralelo (<200ms), e rolling summarization fire-and-forget que comprime conversas após 20 mensagens. 4 phases, 10 plans, 68 commits.

| Capability | Status |
|-----------|--------|
| CLI conversacional com multi-LLM | ✓ Shipped v1.0 |
| Memória SQLite + ChromaDB semântica | ✓ Shipped v1.0 |
| Pipeline de voz (PTT + TTS + wake word) | ✓ Shipped v1.0 |
| PC Control (9 ferramentas + confirmação + audit log) | ✓ Shipped v1.0 |
| Vision pipeline + ScreenAnalyzer + hot-reload | ✓ Shipped v1.0 |
| Express TS gateway (proxy, Zod, SSE passthrough) | ✓ Shipped v1.1 |
| Docker Compose (2 serviços: gateway + backend-ts) | ✓ Shipped v1.3 |
| Electron widget (frameless, hotkey, voice+text, orb animado) | ✓ Shipped v1.2 |
| TypeScript backend completo (LLM + Memory + Agent + Tools + Voice) | ✓ Shipped v1.3 |
| Python backend removido — stack 100% TypeScript | ✓ Shipped v1.3 |
| Wake word "Hey JARVIS" offline + VAD real (Silero) | ✓ Shipped v1.4 |
| Full voice pipeline: wake word → STT → LLM → TTS → idle | ✓ Shipped v1.4 |
| Murf.ai TTS provider com fallback automático | ✓ Shipped v1.4 |
| Orb polish: breathing, crossfade, drag-to-reposition | ✓ Shipped v1.4 |
| ffmpeg-static + Docker whisper-cli compilation | ✓ Shipped v1.4 |
| ChromaDB como serviço Docker dedicado com volume persistente | ✓ Shipped v1.5 Phase 26 |
| System prompt pt-BR + dynamic topK memory recall | ✓ Shipped v1.5 Phase 27 |
| Multi-turn voice: follow-up sem repetir "Hey JARVIS" | ✓ Shipped v1.5 Phase 28 |
| whisper.cpp STT local no Electron (GPU auto-detection) | ✓ Shipped v1.6 Phase 29 |
| VRAM-based model selection (large/base/tiny) | ✓ Shipped v1.6 Phase 30 |
| TTS HTTP no Electron main (Murf.ai/ElevenLabs) | ✓ Shipped v1.6 Phase 30 |
| voiceHandler.ts: pipeline STT→LLM→TTS orquestrado | ✓ Shipped v1.6 Phase 30 |
| IPC path E2E + feature flag USE_WHISPER_CPP | ✓ Shipped v1.6 Phase 31 |
| Backend/Docker sem dependências de áudio | ✓ Shipped v1.6 Phase 32 |
| macOS: menu bar mode (dock.hide), frameless window, tray, wake word | ✓ Shipped v1.7 Phase 33 |
| Linux X11: frameless window transparente, tray, wake word E2E | ✓ Shipped v1.7 Phase 33 |
| 5 whisper prebuilds bundled (darwin-arm64/x64, linux-x64/cuda/vulkan) | ✓ Shipped v1.7 Phase 33 |
| Settings UI: hotkey, TTS provider + API key, Whisper model override | ✓ Shipped v1.7 Phase 34 |
| Settings persistência via electron-store + tray menu integration | ✓ Shipped v1.7 Phase 34 |
| Typed memory: 3 ChromaDB collections (semantic/episodic/procedural) | ✓ Shipped v1.8 Phase 35 |
| Drizzle migration 0003 + source_id consistency check non-blocking | ✓ Shipped v1.8 Phase 35 |
| Memory Writer: extração LLM via withStructuredOutput + Zod discriminated union | ✓ Shipped v1.8 Phase 36 |
| Fire-and-forget extraction wireado em ChatSession.send/sendStream | ✓ Shipped v1.8 Phase 36 |
| Context Builder: Promise.all paralelo, top-k=5 sem threshold, headers pt-BR | ✓ Shipped v1.8 Phase 37 |
| Rolling summarization: threshold 20, pitfall-3 protection, _latestSummary cache | ✓ Shipped v1.8 Phase 38 |

## Requirements

### Validated (v1.0)

- ✓ **CONV-01** — CLI conversacional com multi-LLM — v1.0
- ✓ **CONV-02** — Push-to-talk com Whisper STT — v1.0
- ✓ **CONV-03** — TTS neural offline via kokoro — v1.0
- ✓ **CONV-04** — Estado visual (LISTENING/THINKING/SPEAKING) — v1.0
- ✓ **CONV-05** — Wake word "Hey JARVIS" via openwakeword — v1.0
- ✓ **MEM-01** — Toda conversa salva no SQLite com timestamp — v1.0
- ✓ **MEM-02** — Memórias semânticas cross-session via ChromaDB — v1.0
- ✓ **MEM-03** — Perfil do usuário persistente com preferências — v1.0
- ✓ **MEM-04** — Sumário automático de sessão para compressão de contexto — v1.0
- ✓ **MEM-05** — Persistência com fallback e embedding model versionado — v1.0
- ✓ **LLM-01** — Configuração de LLM via .env (LM Studio, Claude, OpenAI) — v1.0
- ✓ **LLM-02** — Detecção automática de capabilities do modelo — v1.0
- ✓ **LLM-03** — Roteamento inteligente: visão→vision model, resto→local — v1.0
- ✓ **LLM-04** — Hot-reload de modelo sem reiniciar — v1.0
- ✓ **TOOL-01** — Gestão de arquivos por linguagem natural — v1.0
- ✓ **TOOL-02** — Abrir/fechar apps por nome — v1.0
- ✓ **TOOL-03** — Volume, brilho, processos ativos — v1.0
- ✓ **TOOL-04** — Confirmação para ações destrutivas — v1.0
- ✓ **TOOL-05** — Audit log de tool calls no SQLite — v1.0
- ✓ **VISION-01** — Captura e análise de tela — v1.0
- ✓ **VISION-02** — Fallback OCR via pytesseract — v1.0
- ✓ **VISION-03** — Fallback cloud vision (Anthropic/OpenAI) — v1.0
- ✓ **ARCH-01** — Código OS-específico isolado em módulo de plataforma — v1.0
- ✓ **ARCH-02** — Pipeline de voz totalmente assíncrono (asyncio) — v1.0
- ✓ **ARCH-03** — Dependências críticas pinadas — v1.0
- ✓ **ARCH-04** — Validação na inicialização com erros claros — v1.0

### Deferred

- **CONV-06** — LangGraph checkpointer cross-session — Deferred to v2. Within-session coherence funciona via message history; LangGraph necessário apenas para cross-session resume.

### Validated (v1.1)

- ✓ **API-01** — POST /chat — resposta completa via HTTP — Phase 6
- ✓ **API-02** — GET /chat/stream — streaming SSE token-a-token — Phase 6
- ✓ **API-03** — GET /health — liveness probe — Phase 6
- ✓ **API-04** — GET /health/ready — readiness probe (ChromaDB + SQLite) — Phase 6
- ✓ **MONO-01** — pnpm-workspace.yaml + root package.json — Phase 7
- ✓ **GW-01** — POST /api/chat — gateway proxia para FastAPI — Phase 7
- ✓ **GW-02** — GET /api/chat/stream — SSE passthrough sem buffering — Phase 7
- ✓ **GW-03** — GET /api/health — health agregado — Phase 7
- ✓ **GW-04** — Error normalization middleware — Phase 7
- ✓ **GW-05** — Zod validation nas requests — Phase 7
- ✓ **DOCKER-01** — Dockerfile Python multi-stage (python:3.12-slim) — Phase 8
- ✓ **DOCKER-02** — Dockerfile Node multi-stage (node:22-slim) — Phase 8
- ✓ **DOCKER-03** — docker-compose.yml com health checks + depends_on — Phase 8
- ✓ **DOCKER-04** — Volume ./data para persistência SQLite + ChromaDB — Phase 8
- ✓ **DOCKER-05** — .dockerignore correto (sem .env, .venv, data, .planning) — Phase 8

### Validated (v1.2)

- ✓ **DESK-01** — apps/desktop scaffoldado no monorepo pnpm com electron-vite + React + TypeScript, com contextIsolation: true, nodeIntegration: false e preload.ts com contextBridge tipado — Phase 9
- ✓ **DESK-02** — BrowserWindow frameless + transparent + always-on-top + skipTaskbar, sem flash branco no load (show: false + ready-to-show) — Phase 10
- ✓ **DESK-03** — Posicionamento automático no canto inferior direito via screen.getCursorScreenPoint() com multi-monitor awareness — Phase 10
- ✓ **DESK-04** — Tray icon com menu contextual Show/Hide/Quit — Phase 10
- ✓ **DESK-05** — Posição da janela persiste entre sessões via electron-store — Phase 10
- ✓ **ORB-01** — Estado idle com pulsação azul suave (CSS keyframes) — Phase 11- ✓ **ORB-02** — Estado listening com pulso âmbar distinto — Phase 11- ✓ **ORB-03** — Estado processing com pulse/spin — Phase 11- ✓ **ORB-04** — Estado responding com ripple rings, transições suaves — Phase 11- ✓ **ACTV-01** — Hotkey global (Ctrl+Shift+J) para ativar/ocultar widget — Phase 12- ✓ **ACTV-02** — Text input com cadeia IPC completa e orb state transitions — Phase 12- ✓ **AUDIO-01** — POST /api/chat/audio no gateway e FastAPI com multipart upload — Phase 13- ✓ **AUDIO-02** — WhisperTranscriber integrado com FastAPI multipart handler — Phase 13- ✓ **ACTV-03** — PTT toggle-mode hotkey com MediaRecorder → 16kHz WAV — Phase 13

### Validated (v1.3)

- ✓ **INFRA-01..06** — TypeScript backend scaffolded, Docker Compose atualizado — v1.3
- ✓ **LLM-TS-01..07** — Multi-LLM factory LangChain.js + ChatSession + streaming SSE — v1.3
- ✓ **MEM-TS-01..07** — Drizzle ORM + ChromaDB JS + Transformers.js embeddings — v1.3
- ✓ **TOOL-TS-01..09** — 9 PC tools (backend payload + Electron executor) — v1.3
- ✓ **VOICE-TS-01,02,04,05** — nodejs-whisper STT + ElevenLabs/Speecht5 TTS + PTT Electron — v1.3
- ✓ **VAL-01..10** — E2E validation + feature flag + cutover + Python removido — v1.3

### Validated (v1.4)

- ✓ **WAKE-01..09** — Wake word offline com openwakeword + VoiceInputManager + PTT coexistência — v1.4
- ✓ **WAKE-10** — TTS failure graceful degrade (texto visível) — v1.4
- ✓ **WAKE-11** — Hard error recovery com toast pt-BR — v1.4
- ✓ **WAKE-12** — Murf.ai TTS provider com fallback — v1.4
- ✓ **WAKE-13** — Shared sendAudioAndHandle pipeline (PTT + wake word) — v1.4
- ✓ **ORB-POL-01** — prefers-reduced-motion — v1.4
- ✓ **ORB-POL-02** — Wake burst animation — v1.4
- ✓ **ORB-POL-03** — Idle breathing hue drift — v1.4
- ✓ **ORB-POL-04** — Crossfade transitions — v1.4
- ✓ **ORB-POL-05** — Drag-to-reposition persistido — v1.4

### Validated (v1.5)

- ✓ **DOCK-06** — ChromaDB como serviço Docker dedicado com volume persistente — Phase 26
- ✓ **DOCK-07** — Backend-ts conecta ao ChromaDB via rede Docker (ChromaConnectionError eliminado) — Phase 26
- ✓ **DOCK-08** — Modelo STT whisper base pré-baixado durante docker build — Phase 26
- ✓ **DOCK-09** — docker compose up sobe ambiente completo pronto para uso — Phase 26
- ✓ **CONV-07** — System prompt em pt-BR instruindo JARVIS a sempre responder em português — Phase 27
- ✓ **CONV-08** — Memória cross-session funcional via ChromaDB — Phase 27
- ✓ **CONV-09** — recall_memory tool funcionando E2E com ChromaDB — Phase 27
- ✓ **MTURN-01** — Listening window pós-TTS (8s configurável) sem repetir wake word — Phase 28
- ✓ **MTURN-02** — Silent timeout para idle sem toast — Phase 28
- ✓ **MTURN-03** — Estado visual distinto 'awaiting-followup' — Phase 28

### Validated (v1.8 Phase 35)

- ✓ **MTYPE-05** — typedMemories Drizzle schema (9 columns, enum check, 2 FKs), migration 0003, MemoryStore typed methods, MemoryVectors typed collections, non-blocking consistency check wired at startup — Phase 35
- ✓ **REL-02** — SQLite/ChromaDB consistency via source_id validation on startup (non-blocking, never throws) — Phase 35

### Validated (v1.8 Phase 38)

- ✓ **MSUM-01** — Rolling summarization comprime 10 mensagens mais antigas em summary entry no SQLite após threshold de 20; pitfall-3 protection garante delete só após summary não-vazio — Phase 38
- ✓ **MSUM-02** — Trigger fire-and-forget via void calls em ChatSession.send/sendStream — sumarização nunca bloqueia pipeline de voz; erros silenciosos via try/catch+warn — Phase 38
- ✓ **MSUM-03** — Rolling summary injetado em buildContext() entre system prompt e memórias typed via cache _latestSummary com fallback para parâmetro explícito — Phase 38

### Validated (v1.7)

- ✓ **PLAT-01** — macOS frameless window transparente posicionada corretamente — Phase 33
- ✓ **PLAT-02** — macOS wake word "Hey JARVIS" → pipeline de voz completo — Phase 33
- ✓ **PLAT-03** — macOS tray icon com menu Settings/Quit — Phase 33
- ✓ **PLAT-04** — Linux X11 frameless window transparente posicionada corretamente — Phase 33
- ✓ **PLAT-05** — Linux wake word "Hey JARVIS" → pipeline de voz completo — Phase 33
- ✓ **PLAT-06** — Linux tray icon com menu Settings/Quit — Phase 33
- ✓ **SET-01** — Settings UI abre via tray menu sem editar .env — Phase 34
- ✓ **SET-02** — PTT hotkey configurável na UI com persistência — Phase 34
- ✓ **SET-03** — TTS provider + API key configuráveis na UI — Phase 34
- ✓ **SET-04** — Whisper model override manual (tiny/base/large) — Phase 34
- ✓ **SET-05** — Todas as configs persistem via electron-store — Phase 34

### Validated (v1.6)

- ✓ **STT-01** — whisper.cpp STT no Electron main com GPU auto-detection (CUDA/Vulkan/Metal/CPU) — Phase 29
- ✓ **STT-02** — Seleção automática de modelo por VRAM (>8GB→large, 4-8GB→base, <4GB→tiny) — Phase 30
- ✓ **STT-03** — CPU fallback para GPU incompatível — Phase 29
- ✓ **STT-04** — Normalização de áudio 16kHz PCM antes do whisper.cpp — Phase 29
- ✓ **STT-05** — Latência <2s para utterances de 10s no modelo base — Phase 30 (human-verified)
- ✓ **TTS-01** — TTS gerado no Electron main (não mais no backend-ts) — Phase 30
- ✓ **TTS-02** — Mesmas env vars (MURF_API_KEY, ELEVENLABS_API_KEY) funcionam sem mudança — Phase 30
- ✓ **TTS-03** — Código TTS removido do backend-ts — Phase 30/32
- ✓ **ARCH-05** — voiceHandler.ts orquestra pipeline STT→LLM→TTS — Phase 30
- ✓ **ARCH-06** — sendAudioAndHandle usa IPC sob feature flag USE_WHISPER_CPP — Phase 31
- ✓ **INFRA-01** — @fugood .node binários configurados para ASAR unpack — Phase 29
- ✓ **INFRA-02** — USE_WHISPER_CPP feature flag gates IPC vs HTTP path — Phase 29
- ✓ **INFRA-03** — POST /api/chat/audio removido do gateway — Phase 32
- ✓ **INFRA-04** — POST /chat/audio removido do backend-ts — Phase 32
- ✓ **INFRA-05** — nodejs-whisper removido do Dockerfile — Phase 32

### Out of Scope

| Feature | Reason |
|---------|--------|
| Interface web/UI | Em escopo agora como widget desktop Electron (v1.2) |
| IoT / Raspberry Pi | Milestone futuro (v2+) |
| Multi-usuário / autenticação | Uso pessoal — um único usuário |
| Fine-tuning de modelos | Usa modelos prontos via API |
| Cloud sync de histórico | Privacy-first: todo dado local |
| Geração de imagens | Ferramenta discreta, sem dependência do core |
| App mobile | Validar CLI + voz primeiro |
| WebSearch | LLMs locais têm conhecimento suficiente para uso pessoal |

## Context

- Projeto roda em Windows (dev) / Linux (Docker) — Node.js 22 LTS, TypeScript 5.6+
- **Stack:** LangChain.js 1.x + LangGraph JS + Express 5 + Electron + Drizzle ORM
- LM Studio como backend local primário (porta 1234); Claude e OpenAI via env var
- ChromaDB JS embeddado (sem servidor), better-sqlite3 + Drizzle para SQLite
- Gateway porta 3000, backend-ts porta 8001
- Python backend **removido** em v1.3 — nenhum arquivo .py no monorepo
- Binários nativos (electron, better-sqlite3) precisam de `node scripts/postinstall.mjs` após `pnpm install` no Windows com Node v24+

## Constraints

- **Stack**: Node.js + TypeScript como framework principal (migrando de Python)
- **Multi-LLM**: Toda chamada ao LLM passa por camada de abstração — nunca hardcode de provider
- **Multiplataforma**: Código OS-específico isolado em módulos de plataforma com interface comum
- **Privacidade**: Conversa nunca vai para cloud sem configuração explícita do usuário — padrão é local
- **Sem UI obrigatória**: JARVIS funciona 100% em terminal; UI é opcional

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python-only (sem Express/Node) | Stack unificada — Express removido do escopo durante planejamento | → Invalidado v1.3: migrando para TypeScript |
| LLM via interface OpenAI-compatible | LM Studio expõe API compatível — um cliente serve todos | ✓ Correto |
| CLI primeiro, UI depois | Valida o core de IA sem overhead de frontend | ✓ Correto |
| LangChain 1.x sem AgentExecutor | create_react_agent + LangGraph é o caminho recomendado | ✓ Correto |
| ChromaDB embeddado, não client-server | Sem infra overhead para uso pessoal | ✓ Correto |
| sounddevice em vez de PyAudio | Arrays NumPy diretos, sem build pain, ativo maintenance | ✓ Correto |
| kokoro para TTS | 82M model, Apache license, qualidade neural offline | ✓ Correto |
| Config singleton (from jarvis.config import settings) | Isolamento testável — testes fazem patch no módulo | ✓ Correto |
| asyncio.to_thread para chamadas bloqueantes | ARCH-02 compliance — nunca bloquear o event loop | ✓ Correto |
| TYPE_CHECKING guard para imports circulares | ActionExecutor em session.py — evita circular import em runtime | ✓ Correto |
| Cloud LLM temporário para vision fallback | Nunca substituir self.llm — LLM-03 enforcement por design | ✓ Correto |
| Settings() re-instantiation para hot-reload | pydantic-settings lê .env a cada new instance — sem polling | ✓ Correto |
| IoT no futuro | Foco em PC control e IA sólida antes de expandir para hardware | — Pendente |
| LangChain.js 1.x (não 0.3.x) | 0.3.x entrou em modo manutenção Nov 2025 | ✓ Correto — v1.3 |
| Port 8001 para backend-ts | Python 8000, Gateway 3000 — sem conflito | ✓ Correto — v1.3 |
| Backend gera payloads, Electron executa | Separação de responsabilidades PC tools | ✓ Correto — v1.3 |
| Sem período observação Python (VAL-09) | User decidiu não usar mais Python — cutover direto | ✓ Decisão certa — v1.3 |
| Drizzle ORM em vez de raw SQL | Type-safe, migrations auditáveis, DX melhor | ✓ Correto — v1.3 |
| ElevenLabs como TTS default | Qualidade superior ao Speecht5 offline | ✓ Correto — v1.3 |
| openwakeword (não Porcupine) | Totalmente offline, sem API key, Apache license | ✓ Correto — v1.4 |
| @ricky0123/vad-web (Silero) | VAD real em vez de timeout fixo — detecta fim de fala ~1.4s | ✓ Correto — v1.4 |
| sendAudioAndHandle shared helper | Elimina duplicação PTT/wake word — single source of truth | ✓ Correto — v1.4 |
| ffmpeg-static como fallback | Dev local Windows não precisa instalar ffmpeg manualmente | ✓ Correto — v1.4 |
| Docker compila whisper-cli | Container autossuficiente — zero setup manual pra STT | ✓ Correto — v1.4 |
| Murf.ai TTS com fallback local | Voz pt-BR masculina cloud, degrade pra local se sem key | ✓ Correto — v1.4 |
| extractFinalAiText usa _getType() | AIMessageChunk não é instanceof AIMessage no LangChain | ✓ Fix — v1.4 |
| @fugood/whisper.node via asarUnpack | node_modules/@fugood/** cobre todos native addons sem listar cada .node | ✓ Correto — v1.6 |
| whisperResources usa app.getPath('userData') diretamente | userData é sempre real filesystem, sem isPackaged branching | ✓ Correto — v1.6 |
| vramMb=0 fallback para base model | GPU integrada ou driver incompleto — conservativo e seguro | ✓ Correto — v1.6 |
| VoiceHandlerDeps opcional no ChatHandlerDeps | USE_WHISPER_CPP=false path inalterado — zero regressão gateway | ✓ Correto — v1.6 |
| Stub-with-migration-error no backend-ts TTS | Preserva compilação TS até Phase 32 remover /chat/audio | ✓ Correto — v1.6 |
| Docker compila whisper-cli (v1.4) | Decisão revertida em v1.6: whisper movido para Electron, Docker simplificado | ⚠️ Revertido — v1.6 |

## Evolution

Este documento evolui a cada transição de fase e milestone.

**Após cada transição de fase** (via `/gsd:transition`):
1. Requirements invalidados? → Mover para Out of Scope com motivo
2. Requirements validados? → Mover para Validated com referência da fase
3. Novos requirements surgiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se drifted

**Após cada milestone** (via `/gsd:complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditar Out of Scope — razões ainda válidas?
4. Atualizar Context com estado atual

## Completed Milestone: v1.4 Voice & UX Polish (shipped 2026-04-12)

**Delivered:** Wake word "Hey JARVIS" offline com pipeline completo (STT → LLM → TTS → idle), Murf.ai TTS, VAD real com Silero, orb visual polish (breathing, crossfade, drag). 4 phases, 15 plans, 113 commits.

## Completed Milestone: v1.5 Conversation Quality & Docker Polish (shipped 2026-04-13)

**Delivered:** ChromaDB como serviço Docker dedicado, whisper base pré-baixado em build, system prompt pt-BR, memória cross-session funcional, multi-turn voice com awaiting-followup state. 3 phases, 7 plans.

## Completed Milestone: v1.6 Local Voice Pipeline (shipped 2026-04-15)

**Delivered:** whisper.cpp STT local no Electron main com GPU auto-detection (CUDA/Vulkan/Metal/CPU), seleção de modelo por VRAM, TTS HTTP migrado para Electron, IPC path E2E validado com feature flag, endpoints /chat/audio removidos do gateway e backend-ts, nodejs-whisper removido do Docker. 4 phases (29-32), 20 plans.

## Completed Milestone: v1.7 Cross-Platform + Settings UI (shipped 2026-04-18)

**Delivered:** JARVIS roda em macOS e Linux (frameless window, tray, wake word E2E verificado humanamente). Settings UI via BrowserWindow dedicada com configuração de hotkey PTT, TTS provider + API key, e modelo Whisper manual — tudo persistido via electron-store. 2 phases, 7 plans.

## Deferred to Future Milestones

- Memory intelligence: LLM-driven memory extraction, rolling summaries, episodic/semantic separation — v1.8
- PTT hotkey global macOS/Linux (PLAT-07) — v1.8+
- Settings extras: URL LM Studio, provider LLM, wake word sensitivity (SET-06, 07, 08) — v1.8+
- Performance optimization: latência STT <500ms p95 — v1.8+
- Vision pipeline migração para TypeScript — v1.8+
- Speech bubble redesign, History/context panel — v1.9+
- Offline TTS local (Kokoro Node.js port) — v1.9+
- Streaming TTS (token-by-token playback) — v1.9+
- Linux Wayland support (PLAT-08) — v2
- macOS template tray icon (branco/preto) — v1.8+

---
*Last updated: 2026-04-26 — v1.9 Phase 39 complete: Voice Mode State Machine entregue (VMODE-01/02/03 verified, 34/34 testes passando)*
