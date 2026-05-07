# Phase 60: LM Studio Streaming Events - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 60-lm-studio-streaming-events
**Areas discussed:** Abordagem de implementação, Detecção de capacidade, Feature flag na UI, Comportamento do fallback

---

## Abordagem de Implementação

| Option | Description | Selected |
|--------|-------------|----------|
| Investigar primeiro | Pesquisar se ChatOpenAI já usa o protocolo mais eficiente antes de subclassificar. RESEARCH.md documenta a decisão antes do plano. | ✓ |
| @lmstudio/sdk nativo | SDK oficial do LM Studio (WebSocket, eventos tipados). Quebra abstração LangChain. | |
| Subclasse de ChatOpenAI | ChatLMStudio extends ChatOpenAI com headers/params específicos. | |

**User's choice:** Investigar primeiro (Recomendado)

**Output da investigação:** RESEARCH.md com decisão documentada (suficiente / precisa de subclasse / SDK nativo)

---

## Detecção de Capacidade

| Option | Description | Selected |
|--------|-------------|----------|
| Try + fallback automático | Tenta Streaming Events; em erro, cai para SSE padrão silenciosamente. | ✓ |
| Probe HTTP no boot | Request de teste na inicialização. Preciso mas adiciona latency. | |
| Header/campo na response | Verifica headers HTTP. Depende do LM Studio sinalizar suporte. | |

**User's choice:** Try + fallback automático (Recomendado)

**Persistência do fallback:** Não persistir — retry a cada turn (modelo pode trocar entre requests).

---

## Feature Flag na UI

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle nas Settings UI | Replicar padrão streamingTtsEnabled (Phase 53): store + IPC + LlmSection, apply-sem-restart. | ✓ |
| Apenas env var no backend | USE_LM_STUDIO_STREAMING_EVENTS no .env. Sem UI, exige restart. | |

**User's choice:** Toggle nas Settings UI (Recomendado)

**Visibilidade:** Sempre visível na LlmSection (sem conditional render por provider).

---

## Comportamento do Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Silencioso | Apenas log interno. Usuário recebe resposta normalmente. | ✓ |
| Toast informativo | Toast 'Usando SSE padrão (Streaming Events indisponível)'. | |

**User's choice:** Silencioso (Recomendado)

---

## Claude's Discretion

- Nome exato do IPC e chave do store para o feature flag
- Estrutura dos planos baseada no output da pesquisa
- Se ChatOpenAI já for suficiente: apenas adicionar feature flag sem nova implementação de streaming

## Deferred Ideas

- Feedback de progresso por etapa (reasoning/message/tool) — v2.4
- Toggle condicional ao provider LM Studio — polish futuro
