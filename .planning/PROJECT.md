# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente para uso próprio que roda no PC (Linux, Windows, macOS). Conversa naturalmente por voz e texto, lembra de tudo entre sessões via SQLite + ChromaDB semântico, executa ações no PC (abre apps, gerencia arquivos, controla sistema), e analisa a tela com pipeline de visão com fallback inteligente. O cérebro é multi-LLM: conecta com modelos locais via LM Studio ou provedores cloud (Claude, GPT-4) sem travar em nenhum.

## Core Value

Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## Current State (v1.3 shipped — 2026-04-10)

**Stack:** Node.js 22 + TypeScript + Express 5 + LangChain.js 1.x + Electron | **LOC:** ~12.500 TS (backend-ts + gateway + desktop) | **Tests:** passing

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

### Active (v1.4)

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

## Next Milestone: v1.4

To be defined via `/gsd:new-milestone`. Candidates deferred from v1.3:

- Wake word "Hey JARVIS" (openwakeword ou alternativa sem AccessKey)
- TTS quality improvement (Kokoro Node.js port ou C++ bindings)
- Mac/Linux cross-platform support (Electron position/tray quirks)
- Performance optimization: latency <100ms p95
- Vision pipeline migração para TypeScript

---
*Last updated: 2026-04-10 — Milestone v1.3 shipped*
