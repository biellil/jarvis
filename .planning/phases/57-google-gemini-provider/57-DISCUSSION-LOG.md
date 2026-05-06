# Phase 57: Google Gemini Provider — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 57-google-gemini-provider
**Areas discussed:** Live reload do backend, API key storage, Modelo Gemini default, UI para API key

---

## Live Reload do Backend

| Option | Description | Selected |
|--------|-------------|----------|
| Reload endpoint | Electron chama POST /internal/reload-llm após salvar settings. Backend re-lê config, recria LLM e ChatSession. Segue padrão /internal/ já estabelecido. | ✓ |
| Header por request | Gateway injeta X-Jarvis-Provider e X-Jarvis-Api-Key em cada request. Backend cria LLM por request. | |
| Reiniciar o backend-ts | Electron mata e reinicia o processo backend-ts após salvar. | |

**User's choice:** Reload endpoint

---

### Escopo do reload

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas LLM | ChatSession.swapLLM(newLlm) — substitui o modelo mas mantém histórico e memória. | ✓ |
| Session completa | Zera ChatSession junto — histórico perdido, começa fresh. | |

**User's choice:** Apenas LLM — histórico preservado

---

## API Key Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Electron-store | Usuário digita na UI, salvo no electron-store, Electron passa para backend-ts via body no reload. Padrão TTS. | ✓ |
| Env var / .env file | Usuário edita .env manualmente. Padrão atual para OpenAI/Anthropic. | |

**User's choice:** Electron-store

---

### Scope de API keys

| Option | Description | Selected |
|--------|-------------|----------|
| Só Gemini nesta fase | Input de key apenas para Gemini. OpenAI e Anthropic continuam via env var. | |
| Todos os providers | Adicionar inputs para OpenAI e Anthropic também nesta fase. | ✓ |

**User's choice:** Todos os providers — unificar padrão

---

## Modelo Gemini Default

| Option | Description | Selected |
|--------|-------------|----------|
| gemini-2.0-flash | Rápido, barato, bom para chat conversacional. | ✓ |
| gemini-2.5-flash-preview | Mais capaz, mas preview. Maior latency e custo. | |
| gemini-1.5-pro | Proven, contexto longo (1M tokens). Mais pesado e caro. | |

**User's choice:** gemini-2.0-flash

---

## UI para API Key

| Option | Description | Selected |
|--------|-------------|----------|
| Condicional por provider | Input de API key aparece somente quando o provider que requer key está selecionado. | ✓ |
| Sempre visível | Todos os campos de API key sempre renderizados. | |

**User's choice:** Condicional por provider

---

### Label do Gemini no dropdown

| Option | Description | Selected |
|--------|-------------|----------|
| Google Gemini | Segue padrão atual dos labels existentes. | ✓ |
| Gemini (Google) | Marca do modelo primeiro. | |

**User's choice:** "Google Gemini"

---

## Claude's Discretion

- Schema Zod exato do body do POST /internal/reload-llm
- Implementação interna do ChatSession.swapLLM() (mutex, race conditions)
- Nome exato das chaves no electron-store para API keys
- CONTEXT_WINDOWS do tokenizer para lmstudio (se atualizar junto)

## Deferred Ideas

- Model selector por provider (dropdown para escolher entre modelos Gemini) — fora do escopo desta fase
