---
phase: 86-identificacao-de-voz-speaker-recognition
plan: 04
subsystem: tts
tags: [chatterbox, threading, warmup, fallback, kokoro, pytorch, multilingual]

requires:
  - phase: 75
    provides: Kokoro TTS engine, _kokoro_speak, init_tts/speak public API
  - phase: 86
    provides: 86-01 fixtures, 86-02 chatterbox extra, 86-03 singletons/device cascade/factory
provides:
  - _start_chatterbox_warmup (thread daemon com cascade)
  - _chatterbox_speak (síntese + playback com fallback completo)
  - Integração em init_tts (warmup automático) e speak (rota chatterbox)
  - Fallback runtime sticky (D-08) + degradação só em memória (D-10)
affects: [future phase 87 voice cloning — pode estender _chatterbox_speak com audio_prompt_path]

tech-stack:
  added: [threading.Thread daemon pattern, Event.wait com timeout fallback]
  patterns:
    - "Warmup async com Event signaling — init_tts retorna em <1s, speak espera até 15s"
    - "Cascade de device com fallback graceful — primeiro ImportError aborta cadeia, outros erros tentam próximo device"
    - "Provider state degradation in-memory only — config persistido NUNCA muda em fallback"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/pyproject.toml (fix torchaudio override)
    - apps/desktop-py/tests/conftest.py (thread join na teardown)

key-decisions:
  - "ImportError detectado dentro do loop da cascade (não up-front) para permitir monkeypatch de _create_chatterbox_engine sem mock de sys.modules"
  - "_chatterbox_speak só auto-dispara warmup quando state está vazio (_chatterbox_available is None) — evita threads concorrentes quando init_tts/set_provider já disparou"
  - "Labels D-21 exatas via dict mapping device→label — facilita audit por grep"
  - "Auto-spawn de warmup em _chatterbox_speak preserva D-02 (path quando user troca provider via set_provider) sem race com init_tts"
  - "torchaudio==2.6.0 adicionado ao override-dependencies — chatterbox-tts requer torchaudio>=2.9.0 em Python 3.14, força nossa versão"

patterns-established:
  - "Daemon thread + Event signaling — pattern reutilizável para qualquer warmup async"
  - "Sticky disabled flag (_chatterbox_disabled) — runtime degradation pela sessão sem persistir em disco"

requirements-completed: [CHTB-01, CHTB-03, CHTB-04]

duration: ~25min (TDD + 3 iterações para resolver flakiness de daemon threads)
completed: 2026-05-28
---

# Phase 86 Plan 04 Summary

**Chatterbox TTS warmup async + synthesis pipeline com fallback runtime para Kokoro — fecha CHTB-03 e CHTB-04.**

## What was built

### Task 1: `_start_chatterbox_warmup` (+95 linhas)
- Thread daemon nomeado "chatterbox-warmup" (D-06)
- Cascade de device via `_detect_chatterbox_device()`: tenta cada um até sucesso ou exhaustion
- Texto warmup `"olá"` com `language_id="pt"` (D-03)
- `_chatterbox_warmup_event.set()` em todos os caminhos terminais (success, ImportError, exhaustion)
- Idempotência: skip se evento já setado OU se `_chatterbox_available is False` (D-09 sticky)
- D-21 device labels: dict `{cuda→"GPU (CUDA)", mps→"GPU (MPS)", directml→"GPU (DirectML)", cpu→"CPU"}`
- ImportError dentro da cascade aborta cadeia inteira com mensagem "uv sync --extra chatterbox" (D-09)
- Outras exceções loggadas + tenta próximo device (D-14)

### Task 2: `_chatterbox_speak` + integração (+93 linhas)
- Fast-path fallback se `_chatterbox_disabled` (D-08) ou `_chatterbox_available is False` (D-09)
- Auto-spawn warmup só quando state vazio (`_chatterbox_available is None`) — evita threads concorrentes
- D-05: `_chatterbox_warmup_event.wait(timeout=15.0)` antes do fallback
- Geração síncrona: `_chatterbox_engine.generate(text, language_id="pt")`
- Pitfall 4 + A4: `wav_tensor.squeeze().cpu().numpy().astype(np.float32)`
- `set_state("speaking")` antes / `set_state("idle")` em finally (D-24, mesmo pattern do Kokoro)
- RuntimeError em generate: marca `_chatterbox_disabled = True` (sticky), chama `_kokoro_speak` (D-08)
- D-10 reforçado: NUNCA `config.tts_provider = "kokoro"` — degradação só em memória

### Integração em init_tts (linha 80-83)
```python
if config.tts_provider == "chatterbox":
    _start_chatterbox_warmup(config)
```
Kokoro continua sendo carregado abaixo como fallback offline universal (D-24).

### Integração em speak (linha 124-131)
```python
if config.tts_provider == "chatterbox":
    _chatterbox_speak(text, config)
    return
```
Chatterbox tem mesma prioridade que Kokoro (offline-first), antes dos cloud providers.

## Fixes auxiliares
- **`pyproject.toml`**: Adicionado `torchaudio==2.6.0` ao `override-dependencies` para resolver
  conflito com `chatterbox-tts==0.1.7` que requer `torchaudio>=2.9.0` em Python 3.14.
- **`conftest.py`**: Autouse fixture faz join de threads `chatterbox-warmup` pendentes (timeout 2s)
  na teardown para evitar flakiness causada por daemon threads que sobrevivem ao teste.

## Self-Check

- `pytest tests/test_tts.py -q` → 23/23 passed (estável em 3 runs)
- 10 testes RED de Plan 01 Task 2 agora GREEN
- Suite total do projeto: 85 passed (falhas restantes são pré-existentes em test_config/test_pc_control/test_voice_modes, não relacionadas a Phase 86)
- `grep -c "^def _start_chatterbox_warmup\|^def _chatterbox_speak" apps/desktop-py/src/jarvis_desktop/tts.py` → 2
- `grep -c "language_id=\"pt\"" apps/desktop-py/src/jarvis_desktop/tts.py` → 2 (warmup + speak)
- `grep '_chatterbox_warmup_event.set()' apps/desktop-py/src/jarvis_desktop/tts.py | wc -l` → 3

## Smoke manual pendente (Manual-Only de VALIDATION.md)

Para validar end-to-end com hardware AMD/Windows:
```bash
cd apps/desktop-py && ./scripts/smoke_chatterbox_install.sh
# então: uv run python -m jarvis_desktop → /provider chatterbox → fala
```
