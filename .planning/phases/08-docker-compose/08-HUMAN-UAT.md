---
status: partial
phase: 08-docker-compose
source: [08-VERIFICATION.md]
started: 2026-04-06
updated: 2026-04-06
---

## Current Test

Human verification checkpoint approved — confirming runtime items.

## Tests

### 1. Full stack startup
expected: `docker compose up --wait` completa com ambos os serviços healthy sem intervenção manual
result: [pending]

### 2. Gateway-to-Python communication
expected: `curl -X POST http://localhost:3000/api/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` retorna resposta JARVIS
result: [pending]

### 3. Data persistence
expected: `docker compose down && docker compose up --wait` preserva histórico de conversa — dados SQLite e ChromaDB no volume `./data`
result: [pending]

### 4. Port 8000 not exposed
expected: `curl http://localhost:8000/health` retorna connection refused (porta não exposta no host)
result: [pending]

### 5. ML imports in container
expected: `docker compose exec python-service python -c "import faster_whisper; import sounddevice; import kokoro; print('OK')"` exits 0
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
