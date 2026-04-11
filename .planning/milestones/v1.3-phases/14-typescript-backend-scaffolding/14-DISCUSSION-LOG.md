# Phase 14: TypeScript Backend Scaffolding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 14-typescript-backend-scaffolding
**Areas discussed:** Package Structure, HTTP Server, Build System, Docker Base, Health Check

---

## Package Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Flat `src/` | Seguir estrutura do gateway (flat `src/`) | ✓ |
| Layered structure | Criar estrutura em camadas (`src/api/`, `src/llm/`, `src/memory/`) | |

**User's choice:** Flat `src/` (option 1)
**Notes:** Gateway é simples mas backend-ts será complexo. User preferiu começar flat e refatorar quando camadas forem adicionadas (Phase 15+).

---

## HTTP Server

| Option | Description | Selected |
|--------|-------------|----------|
| Express | Consistência com gateway — Express 5.x já está no monorepo | ✓ |
| Fastify | Performance melhor, mas adiciona nova dependency | |

**User's choice:** Express (option 2)
**Notes:** Consistência com gateway mais importante que performance marginal nesta fase.

---

## Build System

| Option | Description | Selected |
|--------|-------------|----------|
| `tsx --watch` | Hot-reload instantâneo sem build explícito (igual gateway) | ✓ |
| `tsc --watch` | Build explícito — mais próximo do Docker production | |

**User's choice:** `tsx --watch` (option A)
**Notes:** Development speed prioritizado. Production build via `tsc` continua disponível.

---

## Docker Base Image

| Option | Description | Selected |
|--------|-------------|----------|
| `node:22-slim` + build tools | Builder stage com python3, make, g++ para native modules | ✓ |
| `node:22-slim` apenas | Simples mas falha com native modules (better-sqlite3, @nut-tree-fork/nut-js) | |

**User's choice:** Claude's discretion
**Claude chose:** `node:22-slim` + build tools na builder stage (option 1)
**Rationale:** Native modules virão no Phase 16/18 — preparar infra agora evita rebuild depois.

---

## Health Check Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Simple `{"status":"ok"}` | Endpoint básico agora, expansível no Phase 16 | ✓ |
| Dependency checks desde já | Checar SQLite/ChromaDB imediatamente | |

**User's choice:** Claude's discretion
**Claude chose:** Simple `{"status":"ok"}` (option 1)
**Rationale:** SQLite e ChromaDB só vêm no Phase 16. Health check evolui junto com dependencies.

---

## Claude's Discretion

User delegou as seguintes áreas para Claude decidir durante planning:
- Error handling strategy (middleware structure, error normalization)
- Logging approach (console.log vs structured logging library)
- Test framework setup (seguir vitest do gateway)
- TypeScript config details (target, module, lib)
- Package.json engines exact versions

---

## Deferred Ideas

Nenhuma ideia foi diferida — discussão permaneceu focada no scaffolding da Phase 14.

