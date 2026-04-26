---
quick_id: 260426-mgj
description: Converter bind mount ./data do SQLite para named volume jarvis_sqlite-data
created: 2026-04-26
status: ready
---

# Quick 260426-mgj — Converter SQLite para named volume

## Goal

Substituir o bind mount `./data:/app/data` (atual) por um named volume `sqlite-data:/app/data` em `docker-compose.yml` e `docker-compose.gpu.yml`, de forma que o volume apareça em `docker volume ls` como `jarvis_sqlite-data` (Docker prefixa com nome do project automaticamente).

Motivação do usuário: bind mount não é listado em `docker volume ls`, só named volumes aparecem. Quer ambos (Chroma e SQLite) seguindo o mesmo padrão.

## Trade-offs aceitos

- ⊖ Inspecionar o `.sqlite` direto do host deixa de funcionar via `cat ./data/jarvis.sqlite`. Substituto: `docker exec jarvis-backend-ts sqlite3 /app/data/jarvis.sqlite "SELECT ..."` ou `docker cp jarvis-backend-ts:/app/data/jarvis.sqlite /tmp/`.
- ⊕ Fica visível em `docker volume ls` como `jarvis_sqlite-data`.
- ⊕ Sobrevive a `docker compose down`; é apagado em `docker compose down -v` (mesma semântica do Chroma).
- ⊕ Backup unificado: `docker run --rm -v jarvis_sqlite-data:/data -v $(pwd):/backup alpine tar czf /backup/sqlite.tgz /data`.

## Tasks

### Task 1 — `docker-compose.yml`

- **Files:** `docker-compose.yml`
- **Action:**
  1. Trocar `./data:/app/data` → `sqlite-data:/app/data` no service `backend-ts`.
  2. Adicionar `sqlite-data:` na seção top-level `volumes:`.
- **Verify:** `docker compose config | grep -A 1 sqlite-data` mostra a referência e a declaração.
- **Done:** `grep "./data:/app/data" docker-compose.yml` retorna vazio.

### Task 2 — `docker-compose.gpu.yml`

- **Files:** `docker-compose.gpu.yml`
- **Action:**
  1. Trocar `./data:/app/data` → `sqlite-data:/app/data` no service `backend-ts`.
  2. Adicionar `sqlite-data:` na seção top-level `volumes:`.
  3. **Bonus fix:** adicionar `DATABASE_PATH=/app/data/jarvis.sqlite` no env (estava faltando — bug latente: sem essa env o backend usaria default que pode não bater com o mount path).
- **Verify:** `docker compose -f docker-compose.gpu.yml config` valida YAML.
- **Done:** `grep "./data:/app/data" docker-compose.gpu.yml` retorna vazio E `grep DATABASE_PATH docker-compose.gpu.yml` retorna a linha.

### Task 3 — Migração manual (operador)

- **checkpoint:human-verify**
- Procedimento documentado no SUMMARY.md (seção "Migração do .sqlite existente"). Não executável aqui — o usuário precisa rodar na máquina onde o `.sqlite` antigo vive.

## Out of scope

- Não trocar Chroma de named volume para bind mount (oposto do que se quer).
- Não adicionar autenticação no `/debug/db-stats` (já fora de escopo no quick anterior).
- Não criar backup automático nem rotação de DB.
