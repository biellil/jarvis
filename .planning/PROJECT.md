# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente para uso próprio que roda no PC (Linux, Windows, macOS). Ele conversa naturalmente por voz e texto, lembra de tudo entre sessões, e executa ações no computador — abrir apps, mover arquivos, analisar a tela. O cérebro é multi-LLM: conecta com modelos locais via LM Studio (API compatível com OpenAI) ou provedores cloud (Claude, GPT-4) sem travar em nenhum.

## Core Value

Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Núcleo Conversacional**
- [ ] Interface de voz (wake word + Whisper STT + TTS) e texto no mesmo loop
- [ ] Camada multi-LLM: suporte a LM Studio local (OpenAI-compatible API) e provedores cloud (Anthropic, OpenAI) com troca configurável
- [ ] Memória de longo prazo: toda conversa salva e recuperada por relevância (ChromaDB + embeddings)
- [ ] Memória de curto prazo: contexto da sessão atual preservado no ReAct Agent
- [ ] Perfil do usuário: JARVIS aprende e persiste preferências, rotinas e fatos sobre o dono

**Ferramentas do Sistema**
- [ ] FileManager: abrir, mover, buscar arquivos por linguagem natural
- [ ] AppLauncher: abrir e fechar aplicativos por nome
- [ ] ScreenAnalyzer: capturar tela e analisar com LLM Vision (OCR + descrição)
- [ ] SystemControl: volume, brilho, processos ativos
- [ ] WebSearch: busca na internet sob demanda

**Arquitetura**
- [ ] Multiplataforma: roda em Linux, Windows e macOS (abstrações para APIs nativas)
- [ ] Agent executor com LangChain/LangGraph orquestrando tools
- [ ] SQLite para dados estruturados (histórico, perfil)

### Out of Scope

- **Multi-usuário** — uso pessoal, sem auth ou isolamento de contas
- **IoT / Raspberry Pi** — Fase 2, não pertence ao MVP
- **Interface gráfica rica (PyQt6/Electron)** — CLI/voz primeiro; UI pode vir depois
- **Fine-tuning de modelos** — usa modelos prontos via API, não treina próprios

## Context

- **Ambiente**: Desenvolvimento em Linux (/root/jarvis), mas JARVIS precisa rodar multiplataforma
- **LM Studio**: usuário já tem servidor local rodando com API OpenAI-compatible — integração nativa via `base_url` configurável
- **Modelos locais**: flexíveis (Llama, Mistral, Qwen, DeepSeek etc) — arquitetura não pode assumir capabilities de um modelo específico
- **Voz**: Whisper para STT (offline, preciso); TTS a definir (pyttsx3 offline ou ElevenLabs online)
- **Memória persistente**: ChromaDB para vetorial + SQLite para estruturado — toda sessão é salva automaticamente

## Constraints

- **Stack**: Python 3.10+ com LangChain/LangGraph como framework principal
- **Multi-LLM**: Toda chamada ao LLM deve passar por camada de abstração — nunca hardcode de provider
- **Multiplataforma**: Código OS-específico (pywin32, python-xlib, pyobjc) isolado em módulos de plataforma com interface comum
- **Privacidade**: Conversa nunca vai para cloud sem configuração explícita do usuário — padrão é local
- **Sem UI obrigatória**: JARVIS deve funcionar 100% em terminal; UI é opcional por cima

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LangChain/LangGraph como orquestrador | Ecossistema maduro para agents, tools e memória; evita reinventar wheel | — Pending |
| LM Studio como default local | Usuário já tem rodando; API OpenAI-compatible elimina lock-in | — Pending |
| ChromaDB para memória vetorial | Open source, embutível, sem servidor separado necessário | — Pending |
| Multiplataforma desde o início | Usuário quer rodar em qualquer OS; abstrair cedo evita reescrita | — Pending |
| Voz + texto no mesmo loop de V1 | É a experiência central — degradar para só texto reduz o valor | — Pending |

## Evolution

Este documento evolui a cada transição de fase e milestone.

**Após cada fase** (via `/gsd:transition`):
1. Requisitos invalidados? → Mover para Out of Scope com motivo
2. Requisitos validados? → Mover para Validated com referência de fase
3. Novos requisitos emergiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se derivou

**Após cada milestone** (via `/gsd:complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditar Out of Scope — motivos ainda válidos?
4. Atualizar Context com estado atual

---
*Last updated: 2026-04-02 after initialization*
