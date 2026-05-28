# Research: whisper.cpp + Vulkan on Windows (AMD RX 7600)

**Date:** 2026-05-24
**Confidence:** MEDIUM — official Vulkan Windows binaries do not exist yet; subprocess path is HIGH confidence.

---

## Executive Summary

whisper.cpp has solid Vulkan support in its C++ codebase, but the **official GitHub releases do not ship a Vulkan Windows binary** (as of v1.8.4, March 2026 — an open issue exists: ggml-org/whisper.cpp#3673). Your AMD RX 7600 with Windows 11 can use Vulkan inference, but it requires either building from source or using a third-party community binary.

Two viable integration paths exist for Python:

| Path | Effort | Numpy-native | GPU | Risk |
|------|--------|--------------|-----|------|
| **subprocess (whisper-cli.exe)** | Low | No — temp WAV file | Yes (Vulkan binary) | LOW |
| **pywhispercpp + Vulkan build** | Medium-High | Yes | Yes (if build succeeds) | MEDIUM-HIGH |

**Recommended path:** subprocess with a community Vulkan binary. It preserves your existing `stt.py` API with minimal changes (~40 lines), avoids the painful Windows/Vulkan build process for pywhispercpp, and can be swapped later.

---

## Q1: Official whisper.cpp Vulkan Binaries for Windows

**Finding: NONE exist in official releases.**

Latest release: **v1.8.4** (March 19, 2026). Official Windows assets:
- `whisper-bin-x64.zip` — CPU only
- `whisper-bin-Win32.zip` — CPU only
- `whisper-blas-bin-x64.zip` — CPU + OpenBLAS
- `whisper-blas-bin-Win32.zip` — CPU + OpenBLAS
- `whisper-cublas-11.8.0-bin-x64.zip` — CUDA 11.8 (NVIDIA only)
- `whisper-cublas-12.4.0-bin-x64.zip` — CUDA 12.4 (NVIDIA only)

No Vulkan binary. Issue #3673 (opened Feb 22, 2026) requests one with a draft CI workflow, but no milestone or PR exists yet.

**Community alternatives (verified by search, not official):**
- `jerryshell/whisper.cpp-windows-vulkan-bin` — v1.0.0 release (Aug 2025), ships `whisper.cpp-windows-vulkan.zip`
- `DomoticX/whisper.cpp-windows-vulkan` — v1.0 release (Mar 12, 2026), build instructions + binaries

Confidence: HIGH (from GitHub API + direct page checks)

---

## Q2: Python Integration Options

### Option A: subprocess (whisper-cli.exe)

Call the prebuilt Vulkan `whisper-cli.exe` via `subprocess.run()`. Pass audio as a temp WAV file (stdin piping is NOT supported — confirmed via issues #3080 and #3521).

```python
import subprocess, tempfile, wave, struct, os

def transcribe(audio: np.ndarray) -> str:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name
        _write_wav(f, audio, sample_rate=16000)
    try:
        result = subprocess.run(
            [WHISPER_CLI_PATH, "-m", MODEL_PATH, "-f", tmp_path,
             "-l", "pt", "--no-timestamps", "-nt"],
            capture_output=True, text=True, timeout=60
        )
        return result.stdout.strip()
    finally:
        os.unlink(tmp_path)
```

WAV writing: use `scipy.io.wavfile.write(path, 16000, (audio * 32767).astype(np.int16))` or stdlib `wave` module.

**Pros:** Low risk, easy, no compilation, drop-in for your API.
**Cons:** Temp file I/O adds ~10-50ms latency; no model singleton (process starts per call — mitigated by keeping model loaded via server mode or accepting the overhead).

### Option B: pywhispercpp (PyPI: `absadiki/pywhispercpp`, v1.4.1)

Python bindings that wrap whisper.cpp via pybind11. The `transcribe()` method accepts `Union[str, np.ndarray]` directly — no temp file needed.

```python
from pywhispercpp.model import Model
model = Model('base', models_dir='/path/to/models')  # loads GGML file
segments = model.transcribe(audio_np_float32)
text = ''.join(s.text for s in segments)
```

**Vulkan installation on Windows (MEDIUM risk):**
```bat
set GGML_VULKAN=1
set CMAKE_GENERATOR=Visual Studio 17 2022
set FORCE_CMAKE=1
set NO_REPAIR=1
pip install git+https://github.com/absadiki/pywhispercpp --no-build-isolation
```

Known Windows build problems (issue #156 in absadiki/pywhispercpp):
- `setup.py` lines 153-154 dump all env vars as CMake flags — causes CMake failure; must be commented out before building
- After install, DLLs (`ggml.dll`, `ggml-base.dll`, `ggml-cpu.dll`, `ggml-vulkan.dll`, `whisper.dll`) stay in the build tree; must be manually copied to `site-packages/`
- Requires Visual Studio 2022 Build Tools + Vulkan SDK (tested: 1.4.341.1)

**Pros:** Numpy-native, model singleton, no temp file.
**Cons:** Painful Windows build, undocumented Vulkan path, DLL copy step, no prebuilt Vulkan wheel.

### Option C: whispercpp (PyPI: `aarnphm/whispercpp`)

Alternative pybind11 binding. Accepts numpy float32. Last release appears older (0.0.17) and less maintained than pywhispercpp. No verified Vulkan support on Windows.

**Not recommended** — pursue pywhispercpp if you want the binding path.

---

## Q3: Vulkan SDK Requirement

**AMD drivers include the Vulkan runtime (ICD) — sufficient for running a pre-built Vulkan binary.**

The Vulkan SDK (lunarg.com) is only needed for **compilation**:
- Building pywhispercpp from source: SDK required
- Building whisper.cpp from source: SDK required
- Running a pre-built Vulkan `.exe`: AMD Adrenalin drivers sufficient (they include `amdvlk64.dll` or the Windows WDDM Vulkan layer)

The RX 7600 is RDNA3 — full Vulkan 1.3 support via AMD drivers. No extra install needed to run a pre-built Vulkan binary.

Confidence: HIGH (Vulkan runtime vs SDK distinction is well-documented)

---

## Q4: Audio Input Compatibility

**whisper-cli.exe requires a file path — no stdin support.**

Issues #3080 (April 2025) and #3521 (November 2025) confirm stdin is not implemented. The `-f -` flag errors with "failed to open WAV file from stdin."

**Workaround for subprocess path:** Write float32 numpy array to a temp WAV (16-bit PCM, 16kHz):

```python
import scipy.io.wavfile as wav
import tempfile, os

def _np_to_wav(audio: np.ndarray, path: str, rate: int = 16000):
    pcm = (audio * 32767).astype(np.int16)
    wav.write(path, rate, pcm)
```

`scipy` is already a transitive dependency of several ML packages in the stack. Alternatively use stdlib `wave`:

```python
import wave, struct
def _np_to_wav(audio: np.ndarray, path: str, rate: int = 16000):
    pcm = (audio * 32767).astype('int16')
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(rate)
        wf.writeframes(pcm.tobytes())
```

**pywhispercpp path:** `model.transcribe(audio_np)` accepts float32 numpy directly — no conversion needed.

Confidence: HIGH (API docs confirmed for pywhispercpp; stdin limitation confirmed via GitHub issues)

---

## Q5: Model Files

whisper.cpp uses its own GGML binary format (`.bin`), NOT HuggingFace `.safetensors` or faster-whisper's format.

**Download source:** `https://huggingface.co/ggerganov/whisper.cpp` (official, maintained by the author)

| faster-whisper name | GGML equivalent | Size (fp16) | Quantized option |
|---------------------|-----------------|-------------|-----------------|
| `tiny` | `ggml-tiny.bin` | 77.7 MB | q5_1: 32 MB |
| `base` | `ggml-base.bin` | 148 MB | q5_1: 60 MB |
| `small` | `ggml-small.bin` | 488 MB | q5_1: 190 MB |
| `medium` | `ggml-medium.bin` | 1.53 GB | q5_0: 539 MB |
| `large-v3-turbo` | `ggml-large-v3-turbo.bin` | 1.62 GB | q5_0: 574 MB |

With 8GB VRAM on the RX 7600, `large-v3-turbo` or `medium` fit easily. Recommend `ggml-large-v3-turbo-q5_0.bin` (574 MB) — best accuracy/size tradeoff with Vulkan.

pywhispercpp downloads models automatically using the model name string (e.g., `Model('large-v3-turbo')`).

Confidence: HIGH (HuggingFace repo directly verified)

---

## Q6: Minimal Viable Approach

### Recommended: subprocess + community Vulkan binary

**Estimated changes to stt.py: ~40-60 lines** (new engine class, same public API).

Steps:
1. Download `whisper.cpp-windows-vulkan.zip` from `jerryshell/whisper.cpp-windows-vulkan-bin` (v1.0.0, Aug 2025) or `DomoticX/whisper.cpp-windows-vulkan` (v1.0, Mar 2026)
2. Extract to a known path (e.g., `%APPDATA%\jarvis\whisper-vulkan\`)
3. Download `ggml-large-v3-turbo-q5_0.bin` from HuggingFace to the same dir
4. Add `WHISPER_CLI_PATH` and `WHISPER_MODEL_PATH` to config/`.env`
5. Refactor `stt.py` to add a `WhisperCppEngine` that implements `init()` and `transcribe(audio: np.ndarray) -> str` using subprocess + temp WAV

**API preservation:** The existing `init_stt(config)`, `transcribe(audio)`, `record_until_silence()` signatures remain unchanged. The engine selection becomes a config flag:

```python
# config.py addition
stt_backend: Literal["faster-whisper", "whisper-cpp"] = "faster-whisper"
whisper_cpp_cli: str = ""   # path to whisper-cli.exe
whisper_cpp_model: str = "" # path to .bin model
```

**Performance expectation:** Community reports ~7.5-8x realtime on AMD RDNA3 (RX 9070 XT) with large models. The RX 7600 is weaker but RDNA3 — expect 4-6x realtime with large-v3-turbo-q5_0. Current faster-whisper on CPU with tiny model runs ~1-2x realtime on a modern CPU.

---

## Pitfalls

1. **Temp file cleanup on crash** — use `try/finally` or `tempfile.NamedTemporaryFile(delete=False)` with explicit cleanup. Windows locks open files.

2. **subprocess timeout** — long audio clips can hang. Always pass `timeout=` to `subprocess.run()`.

3. **whisper-cli.exe output parsing** — stdout includes segment text but also timestamps and status lines (e.g., `whisper_init_from_file_with_params_no_state: loading model from ...`). Use `-nt` (no timestamps) flag and filter stderr from stdout with `capture_output=True`.

4. **Community binary trust** — third-party Vulkan binaries are not signed by the whisper.cpp authors. Inspect the build CI before deploying. The official Vulkan binary issue (#3673) may be resolved by mid-2026.

5. **pywhispercpp DLL path on Windows** — even if the build succeeds, the Vulkan DLL (`ggml-vulkan.dll`) must be on `PATH` or in the same directory as the `.pyd` file. Missing DLL = silent CPU fallback or import error.

6. **Model format mismatch** — faster-whisper's cached HuggingFace models cannot be reused by whisper.cpp. Two separate model downloads are required if running both engines.

---

## Sources

- GitHub API: `ggml-org/whisper.cpp` releases — v1.8.4 assets listed above (HIGH)
- [ggml-org/whisper.cpp#3673](https://github.com/ggml-org/whisper.cpp/issues/3673) — Vulkan Windows binary request (HIGH)
- [absadiki/pywhispercpp PyPI](https://pypi.org/project/pywhispercpp/) — v1.4.1, Vulkan flag documented (HIGH)
- [pywhispercpp API docs](https://absadiki.github.io/pywhispercpp/) — `transcribe(Union[str, np.ndarray])` confirmed (HIGH)
- [absadiki/pywhispercpp#156](https://github.com/absadiki/pywhispercpp/issues/156) — Windows build issues (MEDIUM)
- [jerryshell/whisper.cpp-windows-vulkan-bin](https://github.com/jerryshell/whisper.cpp-windows-vulkan-bin) — community Vulkan binary (MEDIUM — community, not official)
- [DomoticX/whisper.cpp-windows-vulkan](https://github.com/DomoticX/whisper.cpp-windows-vulkan) — community build instructions (MEDIUM)
- [maroonmed.com Vulkan guide](https://www.maroonmed.com/subtitle-edit-and-whisper-cpp-stt-on-amd-and-other-non-nvidia-gpus-with-vulkan/) — AMD performance numbers, Vulkan SDK required for build (MEDIUM)
- [ggml-org/whisper.cpp#3080](https://github.com/ggml-org/whisper.cpp/issues/3080) — stdin pipe not supported (HIGH)
- [ggml-org/whisper.cpp#3521](https://github.com/ggml-org/whisper.cpp/issues/3521) — stdin streaming not supported (HIGH)
- [HuggingFace ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main) — GGML model files and sizes (HIGH)
