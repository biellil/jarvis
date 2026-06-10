# Phase 92: OpenRouter Provider - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 92-openrouter-provider
**Areas discussed:** Config flow, Modelo free padrão, UX do rate limit 429, Localização do retry/backoff

---

## Config flow do provider

| Option | Description | Selected |
|--------|-------------|----------|
| JarvisConfig + sync com backend | Adiciona llm_provider/llm_model ao JarvisConfig Python, envia via headers ao backend TS | |
| Só OpenRouter: campo dedicado | openrouter_enabled + openrouter_model no JarvisConfig, backend detecta | |
| Só .env por enquanto | Provider via LLM_PROVIDER=openrouter, menu /config continua placeholder | ✓ |

**User's choice:** "quero da mesma forma que estão os outros llm" → .env only, same pattern as existing providers
**Notes:** Python /config LLM menu remains a placeholder. OPENR-01 (menu UI) deferred.

---

## Modelo free padrão

| Option | Description | Selected |
|--------|-------------|----------|
| meta-llama/llama-3.1-8b-instruct:free | Most popular free tier model | |
| google/gemma-3-12b-it:free | Gemma 3 12B, more capable | |
| Configurar via LLM_MODEL no .env | No hardcoded default — user always specifies LLM_MODEL | ✓ |

**User's choice:** Sem default embutido — exige LLM_MODEL no .env, erro claro se vazio

---

## UX do rate limit 429

| Option | Description | Selected |
|--------|-------------|----------|
| Log + mensagem no terminal | Print retry status during backoff, clear error after 3 failures | |
| Só log silencioso | Transparent retry, user only notices slowness | |
| Mensagem no chat como resposta | After retries exhausted, JARVIS responds in chat | ✓ |

**User's choice:** Mensagem no chat como resposta — rate limit failure surfaces as a normal JARVIS chat reply

---

## Localização do retry/backoff

| Option | Description | Selected |
|--------|-------------|----------|
| LangChain .withRetry() no factory.ts | Native LangChain wrapper on BaseChatModel | |
| Handler dedicado no backend TS | Custom openrouterRetry() function with manual backoff+jitter | |
| Middleware no LangGraph (graph.ts) | Intercept errors in agent node | |

**User's choice:** "para que isso?" → Claude's Discretion — planner decides implementation approach

---

## Claude's Discretion

- Retry/backoff implementation location and mechanics
- Exact wording of rate-limit chat message
- OpenRouter capabilities matrix entry

## Deferred Ideas

- OPENR-01: Python /config LLM menu showing OpenRouter — deferred to future phase with full provider-switching UI
- Quota display in /config — deferred with UI work
