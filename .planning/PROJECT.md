# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente inspirado no companheiro de Tony Stark. Roda como um processo local que conversa em linguagem natural, controla o PC (abre apps, gerencia arquivos, lê a tela, executa comandos shell) e mantém memória entre sessões. Arquitetura monorepo com Express (Node.js/pnpm) como gateway de API e Python/LangChain como motor de IA.

## Core Value

Conversar com o JARVIS via CLI e ter ele executar ações reais no computador — sem precisar decorar comandos, só falar naturalmente.

## Requirements

### Validated

(Nenhum ainda — entregar para validar)

### Active

- [ ] Monorepo pnpm + Python com Express gateway chamando serviço LangChain via HTTP interno
- [ ] CLI para interação com o JARVIS (entrada de texto, saída formatada no terminal)
- [ ] LangChain/LangGraph como motor de IA com suporte a ferramentas (tools)
- [ ] LLM configurável via env — OpenAI GPT-4 e LM Studio local com mesma interface
- [ ] Ferramentas de controle de PC: gerenciar arquivos, abrir aplicativos, ler tela (screenshot + OCR), executar comandos shell
- [ ] Memória de sessão (histórico de conversa) e memória de longo prazo (SQLite + ChromaDB/vetorial)
- [ ] Testes CLI durante desenvolvimento (sem UI)

### Out of Scope (v1)

- Interface web/UI — vem após a base de IA e API estar sólida
- IoT / Raspberry Pi / controle de dispositivos — milestone futuro
- Processamento de voz (STT/TTS) — milestone futuro
- Visão computacional avançada (GPT-4 Vision) — pode vir com UI

## Context

- Projeto roda em Linux (ambiente atual: /root/jarvis)
- Já existe código de fundação no repo (session.py, config.py, memory/store.py, platform abstractions)
- LangChain é o framework central para orquestração de agentes e ferramentas
- LangGraph para fluxos de agentes mais complexos no futuro
- LM Studio como alternativa local para privacidade e desenvolvimento offline
- Express serve como API gateway — clientes externos (futura UI, IoT) chamam Express, que chama o serviço Python LangChain
- OCR com pytesseract + OpenCV para leitura de tela

## Constraints

- **Stack**: Python 3.10+ (LangChain), Node.js/pnpm (Express) — monorepo
- **LLM**: Interface unificada que suporta OpenAI e LM Studio (OpenAI-compatible API)
- **Privacidade**: Suporte a rodar 100% local com LM Studio quando necessário
- **Plataforma**: Linux primeiro, abstração de plataforma já existe no código

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express como gateway, não Flask/FastAPI | Express para a API principal (pnpm monorepo), Python expõe serviço interno | — Pending |
| LLM via interface OpenAI-compatible | LM Studio expõe API compatível com OpenAI — um cliente serve ambos | — Pending |
| CLI primeiro, UI depois | Valida o core de IA sem overhead de frontend | — Pending |
| IoT no futuro | Foco em PC control e IA sólida antes de expandir para hardware | — Pending |

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

---
*Last updated: 2026-04-04 after initialization*
