---
quick_id: 260426-mgj
description: Converter bind mount ./data do SQLite para named volume jarvis_sqlite-data
status: completed
date: 2026-04-26
---

# Quick 260426-mgj — Summary

## O que foi feito

### Task 1 — `docker-compose.yml`

- Trocado `./data:/app/data` → `sqlite-data:/app/data` no service `backend-ts`.
- Adicionado `sqlite-data:` na seção `volumes:` (ao lado de `chroma-data:`).

### Task 2 — `docker-compose.gpu.yml`

- Mesma troca: `./data:/app/data` → `sqlite-data:/app/data`.
- Adicionado `sqlite-data:` na seção `volumes:` (junto com `whisper-models:` e `chroma-data:`).
- **Bonus fix:** adicionado `DATABASE_PATH=/app/data/jarvis.sqlite` no env do `backend-ts` (estava ausente no compose GPU; bug latente que poderia escrever o DB em local diferente do volume).

### Resultado esperado

Após `docker compose up`, o `docker volume ls` deve mostrar:

```
DRIVER    VOLUME NAME
local     jarvis_chroma-data
local     jarvis_sqlite-data    ← novo
local     jarvis_whisper-models (apenas com docker-compose.gpu.yml)
```

## Migração do `.sqlite` existente (operador)

A pasta `./data/` (bind mount antigo) ainda existe na sua máquina com o `.sqlite` que tem seu histórico. Para preservar:

```bash
# 1. Pare o stack
docker compose down

# 2. Suba só pra criar o volume vazio (e pare logo)
docker compose up -d backend-ts
docker compose stop backend-ts

# 3. Copie o .sqlite antigo pra dentro do novo volume
docker run --rm \
  -v "$(pwd)/data:/old:ro" \
  -v jarvis_sqlite-data:/new \
  alpine sh -c "cp /old/jarvis.sqlite /new/jarvis.sqlite && ls -la /new"

# 4. Suba normalmente
docker compose up -d

# 5. Confirme via /debug/db-stats que as contagens preservaram
curl http://localhost:8001/debug/db-stats
```

Se preferir começar do zero (sem migrar histórico), apenas `docker compose down && docker compose up -d` — Docker cria `jarvis_sqlite-data` vazio.

A pasta `./data/` no host pode ser apagada após confirmar a migração.

## Como inspecionar o DB depois

Antes (bind mount):
```bash
sqlite3 ./data/jarvis.sqlite "SELECT COUNT(*) FROM messages;"
```

Agora (named volume):
```bash
# Opção A: dentro do container
docker exec jarvis-backend-ts sqlite3 /app/data/jarvis.sqlite \
  "SELECT COUNT(*) FROM messages;"

# Opção B: copiar pro host pra inspecionar
docker cp jarvis-backend-ts:/app/data/jarvis.sqlite /tmp/jarvis.sqlite
sqlite3 /tmp/jarvis.sqlite "SELECT COUNT(*) FROM messages;"

# Opção C: usar o endpoint criado no quick anterior (mais fácil)
curl http://localhost:8001/debug/db-stats
```

## Arquivos modificados

- `docker-compose.yml` — bind → named volume + declaração
- `docker-compose.gpu.yml` — bind → named volume + declaração + fix de `DATABASE_PATH`

## Commits

- `1c959e7` — 🔧 chore(docker): converter SQLite para named volume jarvis_sqlite-data
