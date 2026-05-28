# Phase 83: Quero coloca o langfuse - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 83-quero-coloca-o-langfuse
**Areas discussed:** Deployment model, Integration method, Tracing scope, Client scope

---

## Deployment Model

| Option | Description | Selected |
|--------|-------------|----------|
| Self-hosted Docker Compose | Local, privacy-first, MIT, zero cost | |
| Langfuse Cloud | Zero infra, free tier, mas viola privacy default | |
| Ambos (self-hosted default, cloud via env var) | Default local, opt-in cloud via LANGFUSE_HOST no .env | ✓ |

**User's choice:** Ambos — self-hosted default, cloud opt-in via env var
**Notes:** Respeita o constraint de privacidade do PROJECT.md enquanto dá flexibilidade para usar cloud se quiser.

---

## Integration Method

| Option | Description | Selected |
|--------|-------------|----------|
| CallbackHandler (`@langfuse/langchain`) | Inject via `{ callbacks: [handler] }`, zero graph changes | ✓ |
| SDK Manual + CallbackHandler root | Multi-turn session grouping, mais controle | |
| OTEL-first | Auto-instrumenta tudo, API ainda nova (< 9 meses) | |

**User's choice:** CallbackHandler (recomendado)
**Notes:** Menor footprint, funciona com todos os 4 providers do factory.ts.

---

## Tracing Scope

| Option | Description | Selected |
|--------|-------------|----------|
| LLM calls apenas | Custo/tokens, menos ruído | |
| Full LangGraph traces | Planner + executor + LLM, automático | |
| Full traces + ChromaDB memory | + Retrieval latency spans manuais | |
| Full traces + tool/MCP calls | + MCP tool wrappers manuais | |

**User's choice:** "quero tudo" → All of the above (confirmado com follow-up)
**Notes:** Phase 83 faz tudo em uma fase — full LangGraph + ChromaDB manual spans + MCP tool wrappers.

---

## Client Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Só backend-ts | Todo LLM/agente está lá, 95% do valor | ✓ |
| Backend-ts + desktop-py | + Latência STT/TTS/HTTP no Python client | |

**User's choice:** Só backend-ts
**Notes:** Desktop-py é thin HTTP wrapper. Python Langfuse deferido para milestone futuro.

---

## Claude's Discretion

- Estrutura do módulo `observability/langfuse.ts`
- Schema de config LANGFUSE_* em config.ts
- Granularidade dos spans ChromaDB e MCP
- docker-compose.yml para Langfuse self-hosted

## Deferred Ideas

- Langfuse no desktop-py (latência STT/TTS)
- OTEL-first (API nova, defer)
- SDK Manual root trace para multi-turn sessions
- Scores e feedback via thumbs up no cliente
