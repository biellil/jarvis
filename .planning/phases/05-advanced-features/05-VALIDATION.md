---
phase: 5
slug: advanced-features
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio |
| **Config file** | `pyproject.toml` (já existe) |
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
| 5-01-01 | 01 | 0 | VISION-01 | unit | `pytest tests/test_vision.py -x -q` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | VISION-01 | unit | `pytest tests/test_vision.py::test_screenshot_capture -x -q` | ❌ W0 | ⬜ pending |
| 5-01-03 | 01 | 1 | VISION-01 | unit | `pytest tests/test_vision.py::test_analyze_screen_tool -x -q` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | VISION-02 | unit | `pytest tests/test_vision.py::test_vision_fallback -x -q` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | VISION-02 | unit | `pytest tests/test_vision.py::test_ocr_fallback -x -q` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 1 | VISION-03 | integration | `pytest tests/test_session_vision.py -x -q` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 1 | LLM-03 | unit | `pytest tests/test_routing.py -x -q` | ❌ W0 | ⬜ pending |
| 5-04-01 | 04 | 2 | LLM-04 | unit | `pytest tests/test_hot_reload.py -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_vision.py` — stubs para VISION-01, VISION-02
- [ ] `tests/test_session_vision.py` — stubs para VISION-03 (ChatSession com image=)
- [ ] `tests/test_routing.py` — stubs para LLM-03 (model routing)
- [ ] `tests/test_hot_reload.py` — stubs para LLM-04 (hot-reload config)
- [ ] `pyproject.toml` updated — adicionar `pyautogui`, `pillow`, `pytesseract` como dependências

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screenshot real da tela capturado | VISION-01 | Requer display/X11 no ambiente de exec | `python -c "import pyautogui; img=pyautogui.screenshot(); img.save('/tmp/test.png')"` e verificar o arquivo |
| OCR sobre screenshot real | VISION-02 | Requer Tesseract instalado no sistema | `python -c "import pytesseract, pyautogui; img=pyautogui.screenshot(); print(pytesseract.image_to_string(img)[:100])"` |
| LLM vision responde sobre imagem real | VISION-03 | Requer modelo vision-capable carregado | Iniciar JARVIS, digitar `/screenshot o que há na tela?` e verificar resposta |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
