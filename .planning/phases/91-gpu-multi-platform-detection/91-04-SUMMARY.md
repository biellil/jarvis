---
phase: 91-gpu-multi-platform-detection
plan: "04"
subsystem: desktop-py/cli
tags: [gpu, cli, extras, documentation]
dependency_graph:
  requires: [91-02]
  provides: [jd-validate-gpu-cli, pyproject-gpu-extras, readme-install-docs]
  affects: [apps/desktop-py]
tech_stack:
  added: []
  patterns: [rich-table-output, json-flag-pattern, pyproject-extras]
key_files:
  created:
    - apps/desktop-py/README.md
  modified:
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/pyproject.toml
decisions:
  - "jd validate-gpu como subcomando de _entry() com args[0] pattern — consistente com setup"
  - "reset_cache() antes de detect() em validate-gpu para fresh detection standalone"
  - "apple-silicon e vulkan extras com lista vazia — documenta intenção sem deps desnecessárias"
metrics:
  duration_seconds: 1108
  completed_date: "2026-06-10"
  tasks_completed: 2
  files_modified: 3
---

# Phase 91 Plan 04: CLI validate-gpu + GPU Extras Summary

**One-liner:** `jd validate-gpu` CLI com rich table + --json flag, 4 extras GPU em pyproject.toml, README com documentação de instalação por plataforma.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Adicionar subcomando validate-gpu em __main__.py | 103e6d1 | __main__.py |
| 2 | Adicionar extras GPU em pyproject.toml e criar README | 421a74c | pyproject.toml, README.md |

## What Was Built

**Task 1 — `jd validate-gpu` CLI:**
- `_cmd_validate_gpu(args)` adicionada em `__main__.py`
- Saída padrão: rich Panel (device selecionado + VRAM) + Table (fallback chain completo) + subsystem compat
- Flag `--json`: JSON estruturado com device/backend/vram_mb/driver_info/fallback_chain/subsystems
- Flag `--verbose`: diagnóstico expandido com gpu_amd_backend config e driver_info
- `_entry()` atualizado para `args[0]` pattern — roteia `setup`, `validate-gpu`, ou `main()`
- `reset_cache()` chamado antes de `detect()` para garantir fresh detection no subcomando standalone

**Task 2 — Extras + README:**
- 4 extras GPU adicionados em `[project.optional-dependencies]`:
  - `nvidia-gpu`: torch+cu124 para Linux/Windows (NVIDIA CUDA 12.4+)
  - `amd-gpu-windows`: torch-directml para Windows AMD (default path D-01)
  - `apple-silicon`: lista vazia — MPS incluído no wheel padrão macOS arm64
  - `vulkan`: lista vazia — reservado para resolução do wheel conflict upstream
- `README.md` criado com seção `## Instalação` documentando todos os 4 extras
- README documenta `jd validate-gpu` e comandos de instalação por plataforma

## Deviations from Plan

**1. [Rule 1 - Bug] Linter auto-updated main() to use device_detect**
- **Found during:** Task 1 (linter applied automatically)
- **Issue:** `main()` usava `_detect_amd_windows()` importado de `stt.py` para resolver backend display — inconsistente com o novo `device_detect.py`
- **Fix:** Linter substituiu por `device_detect.detect()` com platform check — usa a nova fonte única de verdade
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/__main__.py`
- **Commit:** 103e6d1

## Verification Results

- `jd validate-gpu --json` executa com exit code 0, retorna JSON com campos device/backend/fallback_chain/subsystems
- `python -c "import tomllib; ..."` verifica os 4 extras presentes — todos OK
- `apps/desktop-py/README.md` criado com `## Instalação` e todos os 4 extras documentados
- `grep validate-gpu __main__.py` retorna 3 matches (docstring + routing + função)

## Requirements Fulfilled

- **GPU-08:** `jd validate-gpu` imprime device detectado, fallback chain completo e status de compat por subsistema
- **GPU-09:** 4 extras em pyproject.toml + README com comandos de instalação documentados por plataforma

## Self-Check: PASSED

- [x] `apps/desktop-py/src/jarvis_desktop/__main__.py` — exists, contains `_cmd_validate_gpu`
- [x] `apps/desktop-py/pyproject.toml` — exists, contains all 4 GPU extras
- [x] `apps/desktop-py/README.md` — exists, contains `## Instalação`
- [x] Commit 103e6d1 — verified in git log
- [x] Commit 421a74c — verified in git log
