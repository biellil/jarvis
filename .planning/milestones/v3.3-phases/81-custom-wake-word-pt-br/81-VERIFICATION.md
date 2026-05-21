---
phase: 81-custom-wake-word-pt-br
verified: 2026-05-21T22:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 81: Custom Wake Word pt-BR Verification Report

**Phase Goal:** Custom wake word "Ei Jarvis" pt-BR — users can train a personalized Portuguese wake word model from the terminal
**Verified:** 2026-05-21T22:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Script scaffold exists with PEP 723 header and runnable --help/--dry-run | VERIFIED | `train_wake_word.py` line 1 is `# /// script`; `--help` exits 0; `--dry-run` exits 0 with `[DRY-RUN]` output |
| 2 | User can be guided through 20-50 sample recordings interactively | VERIFIED | `_run_recording_session()` implemented with min 20 enforcement, per-sample `_record_sample()` with Rich Live countdown and RMS feedback |
| 3 | After training, `.pkl` verifier is saved to `~/.jarvis/models/wake_word_custom.pkl` | VERIFIED | `_CUSTOM_PKL = _MODELS_DIR / "wake_word_custom.pkl"`; `_train_verifier()` calls `train_custom_verifier()` then `joblib.load(_CUSTOM_PKL)` |
| 4 | `voice_modes.py` auto-detects and loads custom model on startup | VERIFIED | `_wake_word_loop()` checks `_custom_pkl.exists()` at lines 248-249, loads via `joblib.load()` at line 266, logs D-11 message |
| 5 | Threshold is auto-calibrated via ROC curve and persisted to config.json | VERIFIED | `_calibrate_threshold()` uses `roc_curve()` at 5% FPR; `main()` calls `save_config(config)` with fallback direct JSON write |
| 6 | When baseline score < 0.25, Colab URL is shown instead of training | VERIFIED | `main()` checks `median_score < _MEDIAN_THRESHOLD` and calls `_show_colab_fallback()` then `sys.exit(0)` |
| 7 | D-11 terminal log shows which model is active | VERIFIED | Exact strings at voice_modes.py lines 267 and 274: `[VOICE] Modelo customizado carregado (ei jarvis pt-BR)` and `[VOICE] Usando modelo padrão (hey jarvis en)` |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop-py/tools/train_wake_word.py` | PEP 723 script with full training flow | VERIFIED | 562 lines; starts with `# /// script`; all 8 functions fully implemented (no NotImplementedError in any body) |
| `apps/desktop-py/tests/test_train_wake_word.py` | 5 passing + 5 xfail tests for WAKE-01..05 | VERIFIED | 144 lines; 5 passed, 5 xfailed confirmed by live pytest run |
| `apps/desktop-py/src/jarvis_desktop/voice_modes.py` | D-10/D-11 custom model detection in `_wake_word_loop()` | VERIFIED | 7 matching lines for `wake_word_custom.pkl`, `Modelo customizado carregado`, `Usando modelo padrão`, `joblib` |
| `apps/desktop-py/tests/test_voice_modes.py` | 2 WAKE-04 tests (custom detection + default log) | VERIFIED | `test_custom_model_detection` at line 641 and `test_custom_model_log_message_default` at line 722 — both PASS |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `train_wake_word.py` | `~/.jarvis/models/wake_word_custom.pkl` | `joblib.dump` inside `train_custom_verifier()` + `_CUSTOM_PKL` path | WIRED | `_CUSTOM_PKL` passed as `output_path` to `train_custom_verifier()`; `joblib.load(_CUSTOM_PKL)` reloads for return |
| `train_wake_word.py` | `~/.jarvis/config.json` | `save_config(config)` with JSON fallback | WIRED | `config.wake_word_threshold = auto_threshold; save_config(config)` at main() step 6; ImportError fallback writes JSON directly |
| `train_wake_word.py` | `openwakeword.train_custom_verifier` | `from openwakeword import train_custom_verifier` inside `_train_verifier()` | WIRED | Pattern confirmed at line 360 |
| `voice_modes.py:_wake_word_loop()` | `~/.jarvis/models/wake_word_custom.pkl` | `Path.home() / ".jarvis" / "models" / "wake_word_custom.pkl"` path check | WIRED | Lines 248-249; `joblib.load(str(_custom_pkl))` at line 266 |
| `_wake_word_loop()` | `verifier.predict_proba()` | `predict_buffer` scoring block when `confidence > 0.1` | WIRED | Lines 304-313; non-fatal exception handling if buffer unavailable |

---

### Data-Flow Trace (Level 4)

Data-flow analysis is not applicable to this phase. The primary artifact is a CLI training tool (not a rendering component). The `voice_modes.py` change reads from the filesystem (`_custom_pkl.exists()`) and loads a model that influences a confidence score at runtime — not a data-rendering pipeline that could carry empty/static data.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `train_wake_word.py` main() | `samples` | `_run_recording_session()` → microphone via sounddevice | Real (requires hardware) | VERIFIED — logic correct; hardware-dependent tests appropriately xfail |
| `train_wake_word.py` main() | `auto_threshold` | ROC curve on `neg_features` | Real (requires corpus) | VERIFIED — `roc_curve()` call confirmed; fallback to 0.5 if corpus empty |
| `voice_modes.py` `_wake_word_loop()` | `confidence` | `model.predict(chunk_1d)` + optional `verifier.predict_proba()` | Real (runtime detection) | VERIFIED — combining logic at line 304-313 |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `--help` exits 0 | `python tools/train_wake_word.py --help` | exit 0, pt-BR description printed | PASS |
| `--dry-run` exits 0 with DRY-RUN marker | `python tools/train_wake_word.py --dry-run` | exit 0, `[DRY-RUN]` in stdout | PASS |
| test_train_wake_word.py: 5 passed, 5 xfailed | `uv run pytest tests/test_train_wake_word.py -v` | `5 passed, 5 xfailed in 0.49s` | PASS |
| WAKE-04 tests pass | `uv run pytest tests/test_voice_modes.py::test_custom_model_detection tests/test_voice_modes.py::test_custom_model_log_message_default -v` | `2 passed in 6.42s` | PASS |
| Full test suite green | `uv run pytest tests/ -v` | `73 passed, 6 xfailed, 14 xpassed in 14.03s` | PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WAKE-01 | 81-01, 81-02 | Script roda via `uv run` em venv isolado; PEP 723 header com deps declaradas | SATISFIED | `# /// script` at line 1; `openwakeword==0.6.0`, `torch>=2.0`, `scikit-learn>=1.3` in header; `test_pep723_metadata` PASSES; `--help` stdlib-only (no heavy imports at module level) |
| WAKE-02 | 81-01, 81-02 | Script guia gravação de 20-50 amostras interativamente | SATISFIED | `_run_recording_session()` with `_MIN_SAMPLES=20`, Rich Live countdown in `_record_sample()`, RMS feedback per sample; hardware-dependent tests correctly xfail |
| WAKE-03 | 81-02 | Modelo instalado automaticamente em `~/.jarvis/models/` | SATISFIED* | `_CUSTOM_PKL = _MODELS_DIR / "wake_word_custom.pkl"` confirmed; `test_model_save_path` PASSES. **Note:** REQUIREMENTS.md text says `.onnx` but implementation delivers `.pkl` (sklearn verifier). This deviation was a documented architectural decision in CONTEXT.md (verifier path uses `.pkl` alongside existing `hey_jarvis_v0.1.onnx`). The requirement intent — auto-install in `~/.jarvis/models/` — is met. The REQUIREMENTS.md text describing `.onnx` is stale vs. the implemented approach. |
| WAKE-04 | 81-03 | `voice_modes.py` detecta e usa modelo customizado automaticamente se presente | SATISFIED | Path check at `_wake_word_loop()` lines 248-249; `joblib.load()` at line 266; `test_custom_model_detection` PASSES with real sklearn verifier |
| WAKE-05 | 81-02 | Threshold calibrado automaticamente baseado em taxa de falsos positivos | SATISFIED | `_calibrate_threshold()` uses `roc_curve()` at `_TARGET_FPR=0.05`; result clipped to `[0.1, 0.95]`; persisted via `save_config()` or JSON fallback |

*See WAKE-03 note above for `.onnx` vs `.pkl` deviation.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `train_wake_word.py` (module level) | Only `argparse`, `sys`, `pathlib` imported at module level | INFO (good pattern) | Heavy deps isolated in function bodies — `--help` works with stdlib only. Intentional per plan spec. |
| `_generate_tts_negatives()` | `except Exception as exc: ... (continuando sem elas)` | INFO | Silently continues if kokoro fails. Non-fatal by design — TTS negatives are optional corpus enhancement. |
| `_download_negative_corpus()` | Catches broad `Exception` on download, continues | INFO | Idempotent + graceful degradation. Non-blocking. |
| REQUIREMENTS.md line 49 | WAKE-03 description says `wake_word_custom.onnx` | WARNING | Stale spec text — implementation uses `.pkl` (sklearn verifier). The functional intent is met but the requirement description no longer matches the actual output path. Does not block the goal but could confuse future readers. |

No blockers found. No TODO/FIXME/placeholder patterns in delivered files.

---

### Human Verification Required

#### 1. End-to-end training run

**Test:** Run `uv run apps/desktop-py/tools/train_wake_word.py` on a machine with a microphone. Record ~25 samples of "ei jarvis". Observe countdown and RMS feedback.
**Expected:** Script guides through recording, baseline calibration, negative corpus prep, training, and writes `~/.jarvis/models/wake_word_custom.pkl` and updates `~/.jarvis/config.json:wake_word_threshold`.
**Why human:** Requires real microphone hardware and openwakeword runtime (GPU/CPU-intensive training).

#### 2. Countdown UX rendering

**Test:** Run with `--ptt` or in live mode; observe Rich Live countdown in terminal.
**Expected:** `3...2...1... Gravando...` visible in terminal with real-time update.
**Why human:** Rich Live panel rendering cannot be asserted in pytest without a real TTY.

#### 3. Custom model auto-detection at JARVIS startup

**Test:** Place a `.pkl` at `~/.jarvis/models/wake_word_custom.pkl` (produced by training), start JARVIS in wake-word mode, observe terminal.
**Expected:** `[VOICE] Modelo customizado carregado (ei jarvis pt-BR)` in startup log.
**Why human:** Requires real trained file + JARVIS voice mode start in a terminal.

#### 4. WAKE-03 .onnx vs .pkl clarification (optional)

**Test:** Confirm with product owner whether the model artifact should be `.onnx` (full ONNX-converted model, REQUIREMENTS.md text) or `.pkl` (sklearn verifier alongside default `.onnx`, implemented approach).
**Expected:** Either (a) REQUIREMENTS.md updated to say `.pkl` or (b) skl2onnx conversion added to produce a `.onnx` output.
**Why human:** Architectural decision between compatibility (`.onnx` for openwakeword runtime) vs simplicity (`.pkl` verifier wrapping existing ONNX model). Both approaches work functionally.

---

### Gaps Summary

No blocking gaps. The phase goal is achieved: users can train a personalized Portuguese wake word model from the terminal, the training script is fully implemented with Rich UX, the model auto-detects in `voice_modes.py`, and all non-hardware-dependent tests pass.

One minor documentation drift noted: REQUIREMENTS.md WAKE-03 text describes the output as `.onnx` while the implementation delivers a scikit-learn `.pkl` verifier (the CONTEXT.md architectural decision at D-10/D-11 documents this intentional approach). The functional outcome — model auto-installed in `~/.jarvis/models/` and loaded at startup — is fully delivered.

---

_Verified: 2026-05-21T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
