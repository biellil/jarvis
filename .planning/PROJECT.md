# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente para uso próprio que roda no PC (Linux, Windows, macOS). Conversa naturalmente por voz e texto, lembra de tudo entre sessões via SQLite + ChromaDB semântico, executa ações no PC (abre apps, gerencia arquivos, controla sistema), e analisa a tela com pipeline de visão com fallback inteligente. O cérebro é multi-LLM: conecta com modelos locais via LM Studio ou provedores cloud (Claude, GPT-4) sem travar em nenhum.

## Core Value

Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## Current State (v1.0)

**Shipped:** 2026-04-05 | **Stack:** Python 3.10+ | **LOC:** ~2.638 Python

O MVP v1.0 está completo com 5 fases, 21 planos executados, 234 testes passando.

| Capability | Status |
|-----------|--------|
| CLI conversacional com multi-LLM | ✓ Shipped v1.0 |
| Memória SQLite + ChromaDB semântica | ✓ Shipped v1.0 |
| Pipeline de voz (PTT + TTS + wake word) | ✓ Shipped v1.0 |
| PC Control (9 ferramentas + confirmação + audit log) | ✓ Shipped v1.0 |
| Vision pipeline + ScreenAnalyzer + hot-reload | ✓ Shipped v1.0 |

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

### Active (v1.1)

A definir em REQUIREMENTS.md — ver milestone v1.1.

### Out of Scope

| Feature | Reason |
|---------|--------|
| Interface web/UI | Validar CLI + voz primeiro |
| IoT / Raspberry Pi | Milestone futuro (v2+) |
| Multi-usuário / autenticação | Uso pessoal — um único usuário |
| Fine-tuning de modelos | Usa modelos prontos via API |
| Cloud sync de histórico | Privacy-first: todo dado local |
| Geração de imagens | Ferramenta discreta, sem dependência do core |
| App mobile | Validar CLI + voz primeiro |
| WebSearch | LLMs locais têm conhecimento suficiente para uso pessoal |

## Context

- Projeto roda em Linux (ambiente atual: /root/jarvis)
- Python 3.10+, LangChain 1.x, LangGraph, pydantic-settings
- LM Studio como backend local primário; suporte a Claude e OpenAI via factory
- ChromaDB embeddado (sem servidor), SQLite via stdlib
- 234 testes passando (pytest + pytest-asyncio)
- Código isolado por plataforma em `src/jarvis/platform/`

## Constraints

- **Stack**: Python 3.10+ com LangChain/LangGraph como framework principal
- **Multi-LLM**: Toda chamada ao LLM passa por camada de abstração — nunca hardcode de provider
- **Multiplataforma**: Código OS-específico isolado em módulos de plataforma com interface comum
- **Privacidade**: Conversa nunca vai para cloud sem configuração explícita do usuário — padrão é local
- **Sem UI obrigatória**: JARVIS funciona 100% em terminal; UI é opcional

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python-only (sem Express/Node) | Stack unificada — Express removido do escopo durante planejamento | ✓ Correto |
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

## Current Milestone: v1.1 Monorepo + API

**Goal:** Transformar o projeto em monorepo pnpm workspaces, expor o core Python via FastAPI HTTP e construir a API Express/TS como gateway central entre interfaces e LangChain.

**Target features:**
- Monorepo pnpm workspaces (reorganizar estrutura de pastas)
- Python core expõe HTTP via FastAPI (serviço interno)
- API Node/Express TS como gateway (recebe clientes, encaminha pro Python)
- Docker Compose orquestrando todos os serviços
- UI/UX deferida para milestone futuro

---
*Last updated: 2026-04-05 — v1.1 Monorepo + API milestone started*
