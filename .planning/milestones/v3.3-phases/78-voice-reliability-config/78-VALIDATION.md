---
phase: 78
slug: voice-reliability-config
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | `apps/desktop-py/pyproject.toml` |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 78-01-01 | 01 | 1 | VAD-01 | unit | `uv run pytest tests/test_voice_modes.py::test_always_listening_no_onnx_crash -xvs` | ❌ W0 | ⬜ pending |
| 78-01-02 | 01 | 1 | VAD-02 | unit | `uv run pytest tests/test_voice_modes.py::test_preroll_buffer -xvs` | ❌ W0 | ⬜ pending |
| 78-02-01 | 02 | 1 | CONF-01 | unit | `uv run pytest tests/test_config.py::test_save_config_atomic -xvs` | ❌ W0 | ⬜ pending |
| 78-02-02 | 02 | 1 | CONF-02 | unit | `uv run pytest tests/test_config.py::test_load_persisted_config -xvs` | ❌ W0 | ⬜ pending |
| 78-02-03 | 02 | 1 | CONF-03 | unit | `uv run pytest tests/test_config.py::test_first_run_defaults -xvs` | ✅ | ⬜ pending |
| 78-03-01 | 03 | 2 | WGPU-01 | unit | `uv run pytest tests/test_stt.py::test_detect_device_order -xvs` | ❌ W0 | ⬜ pending |
| 78-03-02 | 03 | 2 | WGPU-02 | unit | `uv run pytest tests/test_stt.py::test_model_tier_selection -xvs` | ❌ W0 | ⬜ pending |
| 78-03-03 | 03 | 2 | WGPU-03 | unit | `uv run pytest tests/test_stt.py::test_device_fallback_to_cpu -xvs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_voice_modes.py` — stubs for VAD-01, VAD-02
- [ ] `apps/desktop-py/tests/test_config.py` — stubs for CONF-01, CONF-02 (CONF-03 may already exist)
- [ ] `apps/desktop-py/tests/test_stt.py` — stubs for WGPU-01, WGPU-02, WGPU-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| always-listening starts without ONNXRuntimeError on live system | VAD-01 | Requires openwakeword runtime + audio hardware | Run `uv run python -m jarvis_desktop` in always_listening mode; verify no ONNX exception in stderr |
| pre-roll captures onset of speech | VAD-02 | Requires microphone + human speech | Speak immediately after silence; verify first word captured in transcription |
| Config persists across restart | CONF-01 | Requires actual process restart | Change model via `/config`, exit JARVIS, restart, verify same model loads |
| GPU device shown on startup | WGPU-01 | Requires GPU hardware or mock | Run JARVIS; verify `[STT] Carregando {model} em {device}...` in stdout |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
