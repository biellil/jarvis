---
phase: 19-voice-backend
plan: 08
status: complete
completed_at: 2026-04-09
commits:
  - 4686556  # feat(19-08): gateway proxy para POST /api/chat/audio
---

# Plan 19-08 Summary — Gateway proxy POST /api/chat/audio

## Delivered

- `apps/gateway/src/routes/chat.ts` — rota `POST /api/chat/audio` agora aponta pro backend TS (`config.backendTsUrl`)
- Limite do multer subiu de 10MB pra 25MB pra casar com o backend
- Forward do header `Authorization` do cliente; fallback pra `Bearer ${config.apiKey}` quando ausente
- FormData preserva filename e content-type originais
- Status + body do backend propagados 1:1 (incluindo 400/429/500)
- `apps/gateway/src/config.ts` — nova config `backendTsUrl`
- 6 testes supertest cobrindo: happy path, MISSING_FILE, 429 (lock ocupado), 500 (erro backend), auth injection, sem auth

## Requirements Covered

- VOICE-TS-01, VOICE-TS-02, VOICE-TS-05 (lado gateway fechando o caminho Electron → gateway → backend)

## Success Criteria Coverage

- SC#1 ✅ (endpoint acessível via gateway, que é por onde o Electron fala)

## Hand-off

Fase 19 backend **COMPLETA**. Próximo passo: Fase 19.5 (Electron voice I/O) — mic capture, upload multipart via gateway, playback do áudio TTS retornado.
