# Quick Task 260527-rgm: desktop-py load_config ler ELEVENLABS_API_KEY e TTS_PROVIDER do env

**Date:** 2026-05-27
**Status:** planned

## Goal

Em `load_config()` (apps/desktop-py/src/jarvis_desktop/config.py), após carregar o config.json,
aplicar as env vars `ELEVENLABS_API_KEY` e `TTS_PROVIDER` como fallback quando os campos
correspondentes estiverem vazios/default. Segue o padrão já existente de `GATEWAY_URL` e `JARVIS_API_KEY`.

Prioridade resultante:
- `elevenlabs_api_key`: env `ELEVENLABS_API_KEY` > config.json > default `""`
- `tts_provider`: config.json > env `TTS_PROVIDER` > default `"kokoro"` (config.json tem precedência pois é preferência persistida pelo usuário)

Também adicionar `MURF_API_KEY` e `GEMINI_*` enquanto estamos no arquivo (mesmo padrão).

## Tasks

### Task 1: Atualizar load_config() para ler env vars de TTS

**Files:** `apps/desktop-py/src/jarvis_desktop/config.py`

**Action:**
- Após o Step 2 (build base config), adicionar leitura de:
  - `ELEVENLABS_API_KEY` → `elevenlabs_api_key` (só se env não vazio)
  - `MURF_API_KEY` → `murf_api_key` (só se env não vazio)
  - `TTS_PROVIDER` → `tts_provider` (só se env não vazio E config.json não sobrescreveu — ver abaixo)
- A lógica correta: env vars são aplicadas no Step 2 (base config), config.json sobrescreve no Step 3.
  Assim config.json tem precedência sobre env para tts_provider (preferência do usuário), mas env tem
  precedência sobre default hardcoded. Para api keys, env preenche quando config.json está vazio.

**Implementação concreta:**
No Step 2, construir o base config com os env vars:
```python
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "")
murf_api_key = os.getenv("MURF_API_KEY", "")
tts_provider = os.getenv("TTS_PROVIDER", "kokoro")
config = JarvisConfig(
    gateway_url=gateway_url,
    api_key=api_key,
    elevenlabs_api_key=elevenlabs_api_key,
    murf_api_key=murf_api_key,
    tts_provider=tts_provider,
)
```

O Step 3 (config.json merge) já sobrescreve tudo — então se o usuário mudou via /config, prevalece.
Se config.json tem `elevenlabs_api_key: ""`, o merge vai zerar a env var. Para api keys, fazer
merge seletivo: só aplicar config.json value se não for string vazia.

**Verify:** `load_config()` retorna `elevenlabs_api_key` preenchida quando `ELEVENLABS_API_KEY` está no env

### Task 2: Atualizar testes

**Files:** `apps/desktop-py/tests/test_config.py`

**Action:**
- Adicionar teste que verifica leitura de `ELEVENLABS_API_KEY` do env
- Verificar que config.json não-vazio sobrescreve env para `tts_provider`
- Verificar que config.json vazio NÃO zera a env key para `elevenlabs_api_key`

**Verify:** testes passando
