# JARVIS Requirements

**Current milestone:** v1.5 Conversation Quality & Docker Polish
**Defined:** 2026-04-12

## Multi-Turn Voice (MTURN)

**P1 — must ship:**

- [ ] **MTURN-01** — Após resposta TTS terminar, JARVIS fica em "listening window" por N segundos (configurável via `VITE_MULTI_TURN_WINDOW_MS` env, default 8000ms) — usuário pode falar novamente sem dizer "Hey JARVIS"
- [ ] **MTURN-02** — Se o usuário não falar durante a listening window, orb volta ao idle com wake word ativo (sem toast, transição silenciosa)
- [ ] **MTURN-03** — Orb tem estado visual distinto para "aguardando follow-up" (diferente de idle e listening normal)

## Conversation Quality (CONV)

**P1 — must ship:**

- [ ] **CONV-07** — System prompt em pt-BR instruindo JARVIS a sempre responder em português brasileiro
- [ ] **CONV-08** — Memória cross-session funcional — JARVIS recupera contexto de conversas anteriores via ChromaDB ao responder
- [ ] **CONV-09** — Respostas do LLM incluem contexto de memória relevante (recall_memory tool funcionando E2E com ChromaDB)

## Docker Infrastructure (DOCK)

**P1 — must ship:**

- [ ] **DOCK-06** — ChromaDB roda como serviço separado no docker-compose com volume persistente
- [ ] **DOCK-07** — Backend-ts conecta ao ChromaDB via rede Docker (ChromaConnectionError eliminado)
- [ ] **DOCK-08** — Modelo STT (whisper base) pré-baixado durante `docker build` — zero download em runtime
- [ ] **DOCK-09** — `docker compose up` sobe o ambiente completo pronto pra uso (gateway + backend + chromadb + modelo STT)

## Traceability (v1.5)

Coverage: **0/10 P1 requirements mapped**

| Requirement | Priority | Phase | Plans |
|-------------|----------|-------|-------|
| MTURN-01 | P1 | TBD | TBD |
| MTURN-02 | P1 | TBD | TBD |
| MTURN-03 | P1 | TBD | TBD |
| CONV-07 | P1 | TBD | TBD |
| CONV-08 | P1 | TBD | TBD |
| CONV-09 | P1 | TBD | TBD |
| DOCK-06 | P1 | TBD | TBD |
| DOCK-07 | P1 | TBD | TBD |
| DOCK-08 | P1 | TBD | TBD |
| DOCK-09 | P1 | TBD | TBD |
