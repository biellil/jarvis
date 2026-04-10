---
phase: 21-cutover-python-deprecation
plan: "03"
subsystem: docs-env
tags: [docs, cleanup, python-removal, env]
dependency_graph:
  requires: ["21-01", "21-02"]
  provides: ["documentacao-ts-only", "env-limpo"]
  affects: ["README.md", ".env.example", ".env"]
tech_stack:
  added: []
  patterns: ["surgical-edit"]
key_files:
  modified:
    - README.md
    - .env.example
    - .env (local, não versionado)
decisions:
  - ".env não é commitado (está no .gitignore) — edição local realizada com sucesso mas não incluída no commit"
metrics:
  duration: "5 min"
  completed: "2026-04-09"
  tasks: 2
  files: 3
---

# Phase 21 Plan 03: Remove Python Backend Docs and Env Vars — Summary

**One-liner:** Remoção cirúrgica de referências Python (status badge, src/jarvis/, SQLITE_PATH, FASTAPI_URL) de README.md e arquivos env.

## Status: Complete

## Tasks Executadas

### Task 1 — Atualizar README.md

Duas edições cirúrgicas no README.md:

1. **Status badge (linha 5):** Alterado de `v1.3 em desenvolvimento — migração Python → TypeScript. 14/18 fases completas.` para `v1.3 completo — stack TypeScript-only. Backend Python removido.`

2. **Estrutura do projeto:** Removida a linha `├── src/jarvis/              # Python backend (legado v1.0-1.2, será removido na Phase 21)` do bloco de árvore de diretórios.

Conteúdo preservado: arquitetura ASCII art, tabela de stack, comandos pnpm, seção ChromaDB (porta 8000), toda a seção de desenvolvimento.

### Task 2 — Limpar .env.example e .env

**.env.example:**
- Removida linha `SQLITE_PATH=data/jarvis.db` da seção Memory (cabeçalho da seção atualizado de "SQLite + ChromaDB" para "ChromaDB")
- Removido bloco de 3 linhas: comentário + `FASTAPI_URL=http://localhost:8000`
- Preservados: `CHROMA_PATH`, `BACKEND_TS_URL`, `GATEWAY_PORT`, `JARVIS_API_KEY` e todas as outras vars

**.env (arquivo local, não versionado):**
- Removida linha `SQLITE_PATH=data/jarvis.db`
- Removido bloco completo `# Python backend (legado...)` + `FASTAPI_URL=http://127.0.0.1:8000`

## Commits

| Hash | Mensagem |
|------|----------|
| 7fdbf13 | 📝 docs: remove referências Python backend do README e env files |

Nota: `.env` está no `.gitignore` (correto por segurança) — a edição foi realizada localmente mas não inclusa no commit.

## Verificação

```
grep -i "python backend|FastAPI|uvicorn|src/jarvis|legado v1.0" README.md  → vazio (OK)
grep "backend-ts" README.md | wc -l                                          → 4 (>= 2, OK)
grep "ChromaDB" README.md | wc -l                                            → 7 (>= 2, OK)
grep "FASTAPI_URL|SQLITE_PATH" .env.example                                  → vazio (OK)
grep "CHROMA_PATH|BACKEND_TS_URL|JARVIS_API_KEY" .env.example               → 3 matches (OK)
grep "FASTAPI_URL|SQLITE_PATH" .env                                           → vazio (OK)
```

Todos os critérios de aceitação satisfeitos.

## Deviations from Plan

None — plano executado exatamente como especificado.

## Known Stubs

None.

## Threat Flags

None — remoção de vars obsoletas reduz superfície (T-21-07 mitigado), sem novas exposições.

## Self-Check: PASSED

- README.md editado: FOUND
- .env.example editado: FOUND
- .env editado (local): FOUND
- Commit 7fdbf13: FOUND
