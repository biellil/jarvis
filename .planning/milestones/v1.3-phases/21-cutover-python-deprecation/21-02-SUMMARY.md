---
phase: 21-cutover-python-deprecation
plan: "02"
subsystem: infra
tags: [python-removal, docker-compose, deprecation, cleanup]
dependency_graph:
  requires: []
  provides: [monorepo-sem-python, compose-2-servicos]
  affects: [docker-compose.yml]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - docker-compose.yml
  deleted:
    - Dockerfile.python
    - pyproject.toml
    - requirements-docker.txt
    - src/jarvis/ (diretório inteiro — 40 arquivos)
decisions:
  - "Sem necessidade de arquivo de migração ou README de deprecação — histórico preservado no git"
  - "Remoção de comentários internos do backend-ts que referenciavam fases anteriores (Phase 16, Phase 21)"
metrics:
  duration: "~5 minutos"
  completed_date: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_deleted: 43
  files_modified: 1
---

# Phase 21 Plan 02: Remove Python Backend Summary

## One-liner

Remoção permanente do backend Python (src/jarvis/, Dockerfile.python, pyproject.toml) e limpeza do docker-compose.yml para 2 serviços: gateway + backend-ts.

## Status

Complete — todos os critérios de aceitação atendidos.

## What Was Done

### Task 1: Deletar src/jarvis/, Dockerfile.python, pyproject.toml, requirements-docker.txt

Removidos permanentemente (D-02):

- `src/jarvis/` — diretório completo com 40 arquivos Python organizados em subpacotes: `api/`, `core/`, `executor/`, `llm/`, `memory/`, `platform/`, `tools/`
- `Dockerfile.python` — imagem multi-stage builder+runtime para o backend FastAPI
- `pyproject.toml` — manifesto do pacote Python com todas as dependências (langchain, langgraph, kokoro, faster-whisper, etc.)
- `requirements-docker.txt` — lista flat de dependências para o build Docker
- `src/` — diretório removido pois ficou vazio após a deleção do src/jarvis/

Verificação de secrets antes da deleção (T-21-06): nenhum secret hardcoded encontrado — apenas dependências de pacotes e configurações de build padrão.

### Task 2: Limpar docker-compose.yml (D-03)

Removidos do docker-compose.yml:

1. Bloco completo `python-service:` (serviço com build, expose, healthcheck, volumes, etc.)
2. `environment: - FASTAPI_URL=http://python-service:8000` do bloco gateway
3. `depends_on: python-service: condition: service_healthy` do bloco gateway
4. Comentários internos que referenciavam fases anteriores (Phase 16, Phase 21)

Resultado: compose com exatamente 2 serviços — `gateway` e `backend-ts`.

## Commits

| Hash | Mensagem |
|------|----------|
| 70553fa | chore(21-02): remove Python backend do monorepo (D-02) |
| 7ea89fb | chore(21-02): remove python-service do docker-compose.yml (D-03) |

## Verification Results

### Task 1 — Deleção do backend Python

| Verificação | Resultado | Status |
|------------|-----------|--------|
| `ls /root/jarvis/src/jarvis 2>/dev/null \| wc -l` | 0 | PASS |
| `ls /root/jarvis/Dockerfile.python 2>/dev/null \| wc -l` | 0 | PASS |
| `ls /root/jarvis/pyproject.toml 2>/dev/null \| wc -l` | 0 | PASS |
| `ls /root/jarvis/requirements-docker.txt 2>/dev/null \| wc -l` | 0 | PASS |
| `find /root/jarvis/src -name "*.py" 2>/dev/null \| wc -l` | 0 | PASS |
| `ls /root/jarvis/src/ 2>/dev/null \| wc -l` | 0 | PASS |

### Task 2 — Limpeza do docker-compose.yml

| Verificação | Resultado | Status |
|------------|-----------|--------|
| `grep "python-service" docker-compose.yml \| wc -l` | 0 | PASS |
| `grep "FASTAPI_URL" docker-compose.yml \| wc -l` | 0 | PASS |
| `grep "depends_on" docker-compose.yml \| wc -l` | 0 | PASS |
| `docker compose config --quiet` | sem erros | PASS |
| Serviços presentes | gateway, backend-ts | PASS |

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None.

## Threat Flags

None — nenhuma nova superfície de segurança introduzida. Remoção de código não adiciona superfície de ataque.

## Self-Check: PASSED

- [x] src/jarvis/ inexistente (confirmado)
- [x] Dockerfile.python inexistente (confirmado)
- [x] pyproject.toml inexistente (confirmado)
- [x] requirements-docker.txt inexistente (confirmado)
- [x] docker-compose.yml com 2 serviços: gateway e backend-ts (confirmado)
- [x] Nenhuma referência a python-service, FASTAPI_URL ou depends_on no Compose (confirmado)
- [x] docker compose config --quiet sem erros (confirmado)
- [x] Commit 70553fa existe (Task 1)
- [x] Commit 7ea89fb existe (Task 2)
