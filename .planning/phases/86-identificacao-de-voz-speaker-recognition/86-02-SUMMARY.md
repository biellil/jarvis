---
phase: 86
plan: "02"
subsystem: packaging
tags: [chatterbox, pyproject, uv, torch, packaging, smoke-test]
dependency_graph:
  requires: [86-01]
  provides: [chatterbox-extra-optional, torch-override, smoke-script]
  affects: [apps/desktop-py/pyproject.toml, apps/desktop-py/scripts/smoke_chatterbox_install.sh]
tech_stack:
  added: [chatterbox-tts==0.1.7, torch==2.6.0, torchaudio==2.6.0, transformers==5.2.0, diffusers==0.29.0, torch-directml (win32)]
  patterns: [uv override-dependencies, optional-dependency group, bash smoke script with set -euo pipefail]
key_files:
  modified: [apps/desktop-py/pyproject.toml]
  created: [apps/desktop-py/scripts/smoke_chatterbox_install.sh]
decisions:
  - "D-18 functional equivalent: uv override-dependencies + explicit transitive listing replaces --no-deps (uv does not support --no-deps in pyproject.toml)"
  - "torch-directml pinned with sys_platform == 'win32' marker — skipped silently on Linux/macOS"
  - "transformers==5.2.0 pin safe: grep confirms 0 direct usages in apps/desktop-py/src/"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-29T01:14:27Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 86 Plan 02: Chatterbox Packaging — pyproject.toml + Smoke Script

Extra opcional `chatterbox` declarado em `pyproject.toml` com 14 entradas, override `torch==2.6.0` em `[tool.uv]`, e script de smoke install que valida co-existência com `faster-whisper`.

---

## What Was Built

### Task 1: Extra `chatterbox` em pyproject.toml

Adicionado grupo `[project.optional-dependencies].chatterbox` com 14 entradas:

```toml
chatterbox = [
    "chatterbox-tts==0.1.7",
    "torch==2.6.0",
    "torchaudio==2.6.0",
    "transformers==5.2.0",
    "diffusers==0.29.0",
    "librosa==0.11.0",
    "safetensors==0.5.3",
    "conformer==0.3.2",
    "pykakasi==2.3.0",
    "s3tokenizer",
    "resemble-perth>=1.0.0",
    "omegaconf",
    "pyloudnorm",
    "spacy-pkuseg",
    "torch-directml==0.2.5.dev240914; sys_platform == 'win32'",
]
```

`[tool.uv].override-dependencies` estendido (preservando `tflite-runtime` existente):

```toml
override-dependencies = [
    "tflite-runtime; sys_platform == 'linux' and python_version < '3.12'",
    "torch==2.6.0",
    "torchvision==0.21.0",
]
```

### Task 2: Script smoke_chatterbox_install.sh

Script criado em `apps/desktop-py/scripts/smoke_chatterbox_install.sh` com 3 etapas:
1. `uv sync --extra chatterbox` — resolve dependências sem conflito
2. `from faster_whisper import WhisperModel` — confirma que faster-whisper continua funcional
3. `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` — lazy import sem carregar modelo

---

## Traceability D-18 / CHTB-02

CONTEXT.md D-18 e CHTB-02 mencionam `--no-deps`. A implementação usa a **equivalência funcional** porque `uv` não suporta `--no-deps` por-pacote em `pyproject.toml`:

- `[tool.uv].override-dependencies` força `torch==2.6.0` independente das pins do `torch-directml`
- Listagem explícita das transitives garante as versões exatas sem deixar o resolver decidir livremente
- Resultado idêntico ao `--no-deps`: `torch-directml` não arrasta `torch==2.4.1`

Comentários inline em `pyproject.toml` linkam para este plan (86-02-PLAN.md) para auditoria futura.

---

## Auditoria A5 — transformers 5.2.0 vs Kokoro

```bash
grep -rE "^(import|from) transformers" apps/desktop-py/src/ | wc -l
# Resultado: 0
```

Kokoro NÃO usa `transformers` diretamente no código-fonte do projeto. O pin `transformers==5.2.0` no extra `chatterbox` não quebra Phase 75 (Kokoro).

---

## Aviso para Usuário — Smoke Manual Obrigatório

O script `./scripts/smoke_chatterbox_install.sh` **deve ser rodado manualmente** antes de declarar Phase 86 verde. Isso é uma "Manual-Only Verification" conforme VALIDATION.md:

```bash
cd apps/desktop-py
./scripts/smoke_chatterbox_install.sh
```

Esperado:
- Etapa 1: `uv sync` resolve sem erro de conflito de versão
- Etapa 2: `faster-whisper OK`
- Etapa 3: `chatterbox OK`
- Tempo na 1a execução: ~3-10min (download torch + chatterbox + transformers); subsequentes ~10s (cache uv)

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | fd277e94 | build(86-02): extra chatterbox + override torch em pyproject.toml |
| Task 2 | 2b1c03d7 | test(86-02): smoke_chatterbox_install.sh |

---

## Self-Check: PASSED

- [x] `apps/desktop-py/pyproject.toml` — chatterbox extra com 14+ entradas, override torch==2.6.0
- [x] `apps/desktop-py/scripts/smoke_chatterbox_install.sh` — executável, syntax válida
- [x] TOML válido (python3 tomllib parse OK)
- [x] D-18 traceability: 4 linhas com D-18/--no-deps/86-02-PLAN em pyproject.toml
- [x] A5 audit: 0 usos diretos de `transformers` em src/
- [x] Commits fd277e94 e 2b1c03d7 existem no git log
