---
phase: quick
plan: 260609-rw9
subsystem: stt
tags: [stt, faster-whisper, whisper-cpp, language-detection, pt-br]
key-decisions:
  - "stt_language como campo JarvisConfig (nao env var) — consistente com padrao do projeto para preferencias de usuario"
  - "_language global em stt.py setado antes do lock singleton — funciona mesmo se init_stt chamado novamente"
  - "set_language() no stt_whisper_cpp mantem default 'pt' na declaracao — backward-compat se backend chamado sem init_stt"
key-files:
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/src/jarvis_desktop/stt.py
    - apps/desktop-py/src/jarvis_desktop/stt_whisper_cpp.py
    - apps/desktop-py/tests/test_stt.py
metrics:
  completed: "2026-06-09"
  tasks: 2
  files: 4
---

# Quick Task 260609-rw9: Fix STT Language Detection — Pinar Idioma PT-BR Summary

**One-liner:** Pinado idioma PT-BR no faster-whisper via `language=_language` kwarg; `stt_language` tornada configuravel em `JarvisConfig`; whisper.cpp dinamizado via `set_language()`.

## Root Cause

`stt.py:451` chamava `_model.transcribe(audio)` sem `language=`, deixando o Whisper auto-detectar e transcrever audio curto/ruidoso PT-BR como russo/cirílico.

## Changes Made

### Task 1 — Implementacao (commit `1e9d71b3`)

**`apps/desktop-py/src/jarvis_desktop/config.py`**
- Adicionado campo `stt_language: str = Field(default="pt")` apos `speaker_threshold`
- ISO 639-1, configuravel via `/config` ou `~/.jarvis/config.json`

**`apps/desktop-py/src/jarvis_desktop/stt.py`**
- Adicionado global `_language: str = "pt"` apos `_cpp_model_size`
- `init_stt()`: le `config.stt_language` em `_language` ANTES do lock singleton, sincroniza ao backend cpp via `_set_cpp_language(_language)`
- `transcribe()`: linha 451 alterada de `_model.transcribe(audio)` para `_model.transcribe(audio, language=_language)`

**`apps/desktop-py/src/jarvis_desktop/stt_whisper_cpp.py`**
- Adicionada funcao publica `set_language(language: str)` que atualiza `_WHISPER_FLAGS` in-place
- Declaracao de `_WHISPER_FLAGS` mantem default `"-l", "pt"` para backward-compat

### Task 2 — Testes (commit `7a61a504`)

**`apps/desktop-py/tests/test_stt.py`**
- `test_transcribe_passes_language_kwarg_default`: asserta `language='pt'` no `WhisperModel.transcribe.call_args`
- `test_transcribe_passes_language_kwarg_custom`: asserta `language='en'` quando `stt_language="en"` configurado

## Test Results

```
7 passed in 1.99s

tests/test_stt.py::test_init_whisper_model_loads_successfully PASSED
tests/test_stt.py::test_init_whisper_model_with_invalid_size PASSED
tests/test_stt.py::test_transcribe_audio_returns_text PASSED
tests/test_stt.py::test_ptt_hotkey_parser PASSED
tests/test_stt.py::test_vad_silence_threshold PASSED
tests/test_stt.py::test_transcribe_passes_language_kwarg_default PASSED
tests/test_stt.py::test_transcribe_passes_language_kwarg_custom PASSED
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `1e9d71b3` | `fix(stt): pinar idioma PT-BR no transcribe — evita auto-deteccao errada` |
| 2 | `7a61a504` | `test(stt): assertar language kwarg em WhisperModel.transcribe (fix 260609-rw9)` |

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None — todas as mudancas estao completamente implementadas e testadas.

## Self-Check: PASSED

- `config.py` contem `stt_language`: confirmed
- `stt.py` contem `_language` global: confirmed
- `stt_whisper_cpp.py` contem `set_language()`: confirmed
- Commits `1e9d71b3` e `7a61a504` existem no worktree branch
- 7 testes passando, 0 falhas
