# Quick Task 260527-rgm: Summary

**Date:** 2026-05-27
**Status:** complete

## What was done

Atualizado `load_config()` em `apps/desktop-py/src/jarvis_desktop/config.py` para ler
`ELEVENLABS_API_KEY`, `MURF_API_KEY` e `TTS_PROVIDER` do `.env`, seguindo o padrão
já existente de `GATEWAY_URL` e `JARVIS_API_KEY`.

### Load order final

| Campo | Prioridade |
|-------|-----------|
| `tts_provider` | config.json > env `TTS_PROVIDER` > default `"kokoro"` |
| `elevenlabs_api_key` | config.json (não-vazio) > env `ELEVENLABS_API_KEY` > `""` |
| `murf_api_key` | config.json (não-vazio) > env `MURF_API_KEY` > `""` |

### Files changed

- **`apps/desktop-py/src/jarvis_desktop/config.py`** — Step 2 lê `TTS_PROVIDER` do env; Step 4 (novo) preenche api keys vazias do env após merge do config.json
- **`apps/desktop-py/tests/test_config.py`** — 5 novos testes + fix em 2 testes existentes (setenv("", "") para isolar do .env real)

## Tests

19/19 passing
