---
phase: 5
slug: advanced-features
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 5 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio |
| **Config file** | `pyproject.toml` (ja existe) |
| **Quick run command** | `pytest tests/ -x -q --tb=short` |
| **Full suite command** | `pytest tests/ -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/ -x -q --tb=short`
- **After every plan wave:** Run `pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | VISION-01 | unit | `pytest tests/test_vision.py::test_analyze_screen -x -q` | NO W0 | pending |
| 5-01-02 | 01 | 1 | VISION-02, VISION-03 | unit | `pytest tests/test_vision.py::test_screen_analyzer -x -q` | NO W0 | pending |
| 5-02-01 | 02 | 2 | LLM-04 | unit | `pytest tests/test_session_vision.py::test_create_llm_settings_override -x -q` | NO W0 | pending |
| 5-02-02 | 02 | 2 | VISION-01, LLM-03 | unit | `pytest tests/test_session_vision.py::test_send_with_image -x -q` | NO W0 | pending |
| 5-02-03 | 02 | 2 | LLM-03 | unit | `pytest tests/test_session_vision.py::test_non_vision_send_uses_local_model_only -x -q` | NO W0 | pending |
| 5-02-04 | 02 | 2 | LLM-04 | unit | `pytest tests/test_session_vision.py::test_hot_reload -x -q` | NO W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_vision.py` -- stubs for VISION-01 (analyze_screen), VISION-02 (OCR fallback), VISION-03 (cloud fallback)
- [ ] `tests/test_session_vision.py` -- stubs for VISION-01 (multimodal message), LLM-03 (vision + local routing), LLM-04 (hot-reload)
- [ ] `pyproject.toml` updated -- add `pyautogui`, `pillow`, `pytesseract` as dependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screenshot real da tela capturado | VISION-01 | Requer display/X11 no ambiente de exec | `python -c "import pyautogui; img=pyautogui.screenshot(); img.save('/tmp/test.png')"` e verificar o arquivo |
| OCR sobre screenshot real | VISION-02 | Requer Tesseract instalado no sistema | `python -c "import pytesseract, pyautogui; img=pyautogui.screenshot(); print(pytesseract.image_to_string(img)[:100])"` |
| LLM vision responde sobre imagem real | VISION-03 | Requer modelo vision-capable carregado | Iniciar JARVIS, digitar `/screenshot o que ha na tela?` e verificar resposta |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
