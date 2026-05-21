---
gsd_state_version: 1.0
milestone: v3.3
milestone_name: Python PC Control & Voice Reliability
status: ready_to_plan
stopped_at: Roadmap created — Phase 78 ready to plan
last_updated: "2026-05-20"
last_activity: 2026-05-20
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-20 — v3.3 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 78 — voice-reliability-config

## Current Position

Milestone: v3.3 — Python PC Control & Voice Reliability
Phase: 78 of 81 (Voice Reliability & Config)
Plan: —
Status: Ready to plan
Last activity: 2026-05-20 — Roadmap v3.3 created (4 phases, 21 requirements)

Progress: [          ] 0%

## Phase Map (v3.3)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 78 | Voice Reliability & Config | VAD-01..02, CONF-01..03, WGPU-01..03 | Not started |
| 79 | PC Control — App & File | PCTRL-01..06 | Not started |
| 80 | PC Control — System Controls | PCTRL-07..08 | Not started |
| 81 | Custom Wake Word pt-BR | WAKE-01..05 | Not started |

## Backlog (carry-over de v3.1)

- **999.2** — Testes do app desktop pendentes
- **999.3** — Linux smoke test (DIST-04 UAT, retoma plan 71-04)
- **999.4** — Windows cross-build + UAT em PC físico (DIST-01/02 UAT, retoma plan 71-05)

## Accumulated Context

### Key Decisions (v3.3 — pre-execution)

- Zero new deps in main venv — PC Control uses psutil, pyautogui, pynput already installed
- VAD fix is single-line: `Model(wakeword_models=[])` in always_listening mode
- Config atomic write required: temp file + os.replace() + threading.Lock to prevent race on concurrent saves
- Whisper GPU detection order: CUDA → ROCm (detect /opt/rocm) → Metal (detect MPS) → CPU
- ROCm/Metal: no prebuilt ctranslate2 wheels — detect and log warning, fall back to CPU silently
- Wake word training: `uv run` isolated venv (NOT main .venv) to avoid PyTorch 1.13 / TF 2.8 conflicts with Python 3.12
- PC Control: lazy platform imports behind TYPE_CHECKING guard — pywin32/pyobjc never imported on wrong OS
- Audit log: `~/.jarvis/audit.json` append-only (not SQLite) — keeps PC Control self-contained

### Blockers/Concerns

- WAKE-01 specifies `uv run` without Docker; research found openwakeword training deps (PyTorch 1.13 + TF 2.8) incompatible with Python 3.12. Mitigation: isolated uv venv with Python 3.10 via `uv venv --python 3.10`. Verify during Phase 81 planning.

## Session Continuity

Last session: 2026-05-20
Stopped at: Roadmap created — 4 phases (78-81), 21/21 requirements mapped
Resume file: None
