# Phase 8: Docker Compose - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 08-docker-compose
**Areas discussed:** Dev vs prod Docker, Build strategy do Node no Docker

---

## Dev vs prod Docker

| Option | Description | Selected |
|--------|-------------|----------|
| Só produção | Um único docker-compose.yml com imagens compiladas. Dev local sem Docker. | ✓ |
| Dev + prod separados | docker-compose.yml + docker-compose.dev.yml com bind mounts e hot-reload. | |

**User's choice:** Só produção
**Notes:** Desenvolvimento local continua sem Docker (python -m jarvis.api + pnpm dev). Um único docker-compose.yml é suficiente para uso pessoal.

---

## Build strategy do Node no Docker

| Option | Description | Selected |
|--------|-------------|----------|
| tsc + node | Multi-stage: compila com tsc no builder, copia dist/ + roda node no runtime. Imagem menor. | ✓ |
| tsx (sem compilar) | Roda tsx diretamente no container. Simples mas inclui devDependencies na imagem. | |

**User's choice:** tsc + node (Recomendado)
**Notes:** Prod-grade — imagem final sem devDependencies, esbuild ou tsx.

---

## Claude's Discretion

- Makefile com atalhos de conveniência (não selecionado para discussão)
- Intervalos e retries do healthcheck
- Estrutura interna dos Dockerfiles (stage naming, layer ordering)
- `.dockerignore` paths completos

## Deferred Ideas

- docker-compose.dev.yml — descartado (D-01: só produção)
- Makefile/scripts de conveniência — não priorizado nessa fase
