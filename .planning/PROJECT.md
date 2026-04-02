# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente que roda em Linux como serviço Python headless. Ele processa conversas por voz e texto, lembra de tudo entre sessões, executa ações — e expõe uma API API de rede que permite conexões externas: apps de interface, IoT, automações, consultas de outros sistemas. O cérebro é multi-LLM: conecta com modelos locais via LM Studio ou provedores cloud (Claude, GPT-4) sem travar em nenhum.

A UI gráfica é um projeto separado que se conecta ao JARVIS via API de rede — o brain não sabe nem se importa quem está conectado.

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
- [ ] Serviço headless Linux com API API de rede — qualquer cliente externo pode se conectar
- [ ] Agent executor com LangChain/LangGraph orquestrando tools
- [ ] SQLite para dados estruturados (histórico, perfil)
- [ ] Docker: imagem pronta para rodar o brain como container

### Out of Scope

- **Multi-usuário** — uso pessoal, sem auth ou isolamento de contas
- **Interface gráfica embutida** — UI é projeto separado que conecta via API de rede
- **Fine-tuning de modelos** — usa modelos prontos via API, não treina próprios
- **Windows / macOS nativos** — Linux first; outras plataformas podem vir depois via Docker

## Context

- **Ambiente**: Linux (/root/jarvis) — plataforma alvo é Linux; Docker para portabilidade
- **Arquitetura**: Brain headless com API API de rede; CLI mantida como ferramenta de dev/teste local
- **LM Studio**: usuário já tem servidor local rodando com API OpenAI-compatible — integração nativa via `base_url` configurável
- **Modelos locais**: flexíveis (Llama, Mistral, Qwen, DeepSeek etc) — arquitetura não pode assumir capabilities de um modelo específico
- **Voz**: Whisper para STT (offline, preciso); kokoro para TTS (offline, neural)
- **Memória persistente**: ChromaDB para vetorial + SQLite para estruturado — toda sessão é salva automaticamente
- **Conexões externas**: API de rede expõe o brain para IoT, apps de interface, automações

## Constraints

- **Stack**: Python 3.10+ com LangChain/LangGraph como framework principal
- **Multi-LLM**: Toda chamada ao LLM deve passar por camada de abstração — nunca hardcode de provider
- **Linux first**: Código OS-específico isolado no módulo de plataforma; Windows/macOS podem ser adicionados depois
- **Privacidade**: Conversa nunca vai para cloud sem configuração explícita do usuário — padrão é local
- **Headless by design**: Brain não tem UI embutida; toda interação humana passa pela API API de rede
- **Docker**: Dockerfile mantido como forma oficial de distribuir e rodar o brain

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LangChain/LangGraph como orquestrador | Ecossistema maduro para agents, tools e memória; evita reinventar wheel | — Pending |
| LM Studio como default local | Usuário já tem rodando; API OpenAI-compatible elimina lock-in | — Pending |
| ChromaDB para memória vetorial | Open source, embutível, sem servidor separado necessário | — Pending |
| Linux first, Docker para portabilidade | JARVIS é um brain headless — Docker resolve portabilidade melhor que abstrações nativas por OS | — 2026-04-02 |
| API de rede para conexões externas | Brain roda num servidor local, UI/IoT/automações conectam pela rede — protocolo definido na fase de planejamento | — 2026-04-02 |
| UI separada do brain | Desacopla entrega — brain evolui independente da interface; qualquer app pode conectar | — 2026-04-02 |
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
