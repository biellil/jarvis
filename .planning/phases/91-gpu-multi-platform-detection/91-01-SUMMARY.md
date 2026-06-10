---
phase: 91-gpu-multi-platform-detection
plan: 01
subsystem: infra
tags: [torch, rocm, chatterbox, gpu, compatibility, validation]

# Dependency graph
requires:
  - phase: 90-polish-stability
    provides: stable base before Phase 91 GPU features
provides:
  - "P-1 validation gate result: torch 2.9.1+rocm7.2.1 incompatible on Windows (ROCm is Linux-only)"
  - "fallback_strategy: CPU-ONLY — Chatterbox stays on CPU; Whisper+Kokoro receive GPU device"
  - "API compatibility confirmed: Chatterbox 0.1.7 API fully compatible with torch 2.9.1"
affects:
  - 91-02-PLAN.md (device_detect.py factory must implement CPU-ONLY fallback for Chatterbox)
  - 91-03-PLAN.md (stt.py/tts.py refactor must respect CPU-ONLY strategy for Chatterbox)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "P-1 gate: isolation venv test before any feature code — validated with verbatim pip output"
    - "fallback_strategy field in VALIDATION.md — machine-readable signal for downstream plans"

key-files:
  created:
    - .planning/phases/91-gpu-multi-platform-detection/91-P1-VALIDATION.md
  modified: []

key-decisions:
  - "fallback_strategy: CPU-ONLY — torch+ROCm não existe para Windows; Chatterbox fica em CPU em todas as plataformas (conservativo)"
  - "API compatibility PASS — chatterbox-tts 0.1.7 com torch 2.9.1 tem API idêntica; warning de version mismatch é não-fatal"
  - "ROCm é Linux-only — em Windows AMD, backend correto é DirectML (torch-directml), não torch+rocm"

patterns-established:
  - "Isolation gate: criar venv temporário + testar compat antes de qualquer código de feature"

requirements-completed:
  - GPU-03

# Metrics
duration: ~35min (incluindo Task 1 + checkpoint human-verify)
completed: 2026-06-10
---

# Phase 91 Plan 01: P-1 Validation Gate Summary

**Gate P-1 confirmado: torch 2.9.1+rocm7.2.1 não existe no Windows (ROCm é Linux-only); Chatterbox API compatível com torch 2.9.1; fallback_strategy: CPU-ONLY documentada para Plans 02-04**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-10T00:10:00Z
- **Completed:** 2026-06-10T00:45:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments

- Executou teste de compatibilidade em venv isolado — confirmou que `torch==2.9.1+rocm7.2.1` não existe para Windows (pip ERROR: No matching distribution found)
- Confirmou que Chatterbox 0.1.7 API é 100% compatível com torch 2.9.1 (todos os params de `generate()` preservados: text, language_id, audio_prompt_path, exaggeration, cfg_weight)
- Documentou decisão de fallback_strategy: CPU-ONLY com tabela OS×GPU para Plans 02-04 seguirem

## Task Commits

1. **Task 1: Testar compatibilidade torch 2.9.1+rocm7.2.1 com Chatterbox** — `3dbd574` (docs)
2. **Task 2: Revisar resultado do gate P-1** — checkpoint:human-verify aprovado pelo usuário

## Files Created/Modified

- `.planning/phases/91-gpu-multi-platform-detection/91-P1-VALIDATION.md` — documento de gate P-1 com resultado NO-GO para ROCm/Windows, API PASS, fallback_strategy CPU-ONLY, e tabela de decisão por OS+GPU para Plans 02-04

## Decisions Made

- **fallback_strategy: CPU-ONLY** — comportamento conservativo e correto para todas as plataformas até validação com hardware real. Windows AMD usa DirectML (incompatível com chatterbox 0.1.7); macOS usa MPS (historicamente problemático); Linux ROCm não testado em hardware real.
- **Chatterbox em CPU não é degradation** — Phase 86 já faz fallback para CPU; qualidade de voz não é afetada, apenas ausência de aceleração GPU.
- Gate P-1 confirma que o plano D-05 (Chatterbox CPU-only + GPU para Whisper/Kokoro) estava correto desde o design.

## Deviations from Plan

None — plan executado exatamente como escrito. O resultado NO-GO para ROCm/Windows era um caminho previsto no plano (fallback_strategy: CPU-ONLY documentado como opção explícita).

## Issues Encountered

- `torch==2.9.1+rocm7.2.1` retornou pip ERROR em Windows — esperado e documentado. A razão técnica (ROCm é Linux-only, Windows AMD usa DirectML) ficou registrada verbatim no VALIDATION.md.
- Python 3.13.5 no ambiente de teste — acima do Python 3.12 recommended no CLAUDE.md, mas sem impacto no gate de compatibilidade.

## User Setup Required

None — este plano é documentação de gate, não código de produção.

## Next Phase Readiness

- **Plan 02 pode iniciar:** `device_detect.py` deve implementar fallback_strategy CPU-ONLY para Chatterbox em todas as plataformas
- **Contexto para Plan 02:** Ler `91-P1-VALIDATION.md` seção "Notes for Plan 02 Executor" — tabela OS+GPU com razões de cada decisão
- **Nenhum blocker:** gate aprovado pelo usuário, estratégia documentada

---
*Phase: 91-gpu-multi-platform-detection*
*Completed: 2026-06-10*
