---
phase: 91-gpu-multi-platform-detection
plan: "02"
subsystem: device-detection
tags: [gpu, device-detect, multi-platform, tdd, cascade]
dependency_graph:
  requires: [91-01]
  provides: [device_detect.detect, device_detect.get_fallback_chain, JarvisConfig.gpu_amd_backend]
  affects: [stt.py, tts.py, plan-03-wiring]
tech_stack:
  added: []
  patterns: [singleton-lock, lazy-import, allocation-test, tdd-red-green]
key_files:
  created:
    - apps/desktop-py/src/jarvis_desktop/device_detect.py
    - apps/desktop-py/tests/test_device_detect.py
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py
decisions:
  - "Vulkan detection-only via ctypes (D-07) — nunca roteado como device ativo em Phase 91"
  - "Allocation test torch.zeros(1, device=...) obrigatório antes de commitar a qualquer device (GPU P-2)"
  - "gpu_amd_backend campo flat em JarvisConfig (não nested gpu.amd_backend) — Pydantic BaseModel não suporta dot notation"
  - "11 testes unitários via mocks — zero dependência de hardware GPU real"
metrics:
  duration_seconds: 718
  completed_date: "2026-06-10"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 91 Plan 02: Device Detection Factory — Summary

**One-liner:** Factory centralizada `device_detect.py` com cascade CUDA→MPS→DirectML→CPU, allocation test obrigatório (GPU P-2), e campo `gpu_amd_backend` no JarvisConfig.

## What Was Built

### Task 1: device_detect.py (TDD)

Criado `apps/desktop-py/src/jarvis_desktop/device_detect.py` — fonte única de verdade de detecção de device para todos os subsistemas (STT, TTS Chatterbox, TTS Kokoro).

**API pública exportada:**
- `detect(config) -> DeviceResult` — retorna melhor device validado, thread-safe com cache em memória
- `get_fallback_chain(config) -> list[ChainEntry]` — cascade completa avaliada com status por device
- `DeviceResult(device, backend, vram_mb, driver_info)` — resultado tipado
- `ChainEntry(device, status, reason)` — log de cada etapa da cascade
- `reset_cache()` — para testes unitários

**Cascade implementada (D-02):**
1. CUDA (NVIDIA/ROCm Linux via torch+rocm build)
2. MPS (macOS Apple Silicon — D-04)
3. DirectML (Windows AMD/Intel, se `amd_backend="directml"` — default)
4. ROCm Windows (opt-in via `amd_backend="rocm"` — D-03)
5. Vulkan — detection-only via ctypes, nunca selecionado (D-07)
6. CPU — fallback universal

**GPU P-2 safeguard:** Todo device candidato passa por `_allocation_test()` antes de ser retornado:
```python
torch.zeros(1, device=device_str)  # RuntimeError = false positive → skip
```

**Thread-safety:** Singleton com `threading.Lock` — mesmo padrão de `stt.py`, `tts.py`, `speaker.py`.

### Task 2: Campo gpu_amd_backend em JarvisConfig

Adicionado campo no final da classe `JarvisConfig` em `config.py`:
- `gpu_amd_backend: str = Field(default="directml", ...)`
- Default `"directml"` = zero friction para usuários Windows AMD existentes
- Opt-in `"rocm"` para usuários com HIP SDK instalado (Linux)

### Testes Unitários (11 testes, todos passando)

Arquivo `apps/desktop-py/tests/test_device_detect.py` com 11 testes cobrindo os 8 comportamentos do plano:

| Test | Comportamento |
|------|--------------|
| test_detect_cuda_available | CUDA disponível → device="cuda", backend="cuda" |
| test_detect_mps_when_cuda_unavailable | CUDA indisponível + MPS disponível → mps |
| test_detect_directml_when_cuda_mps_unavailable | Sem CUDA/MPS + DirectML → directml |
| test_detect_cpu_when_no_gpu | Sem GPU → cpu |
| test_allocation_test_failure_falls_back | Allocation test falha → skip device, continua cascade |
| test_get_fallback_chain_returns_all_entries | Chain inclui todas as entradas avaliadas |
| test_get_fallback_chain_selected_entry_for_detected_device | Device selecionado tem status="selected" na chain |
| test_rocm_config_skips_directml | amd_backend="rocm" → DirectML "skipped" |
| test_directml_config_enables_directml | amd_backend="directml" → DirectML avaliado |
| test_vulkan_is_detection_only_never_selected | Vulkan="detection-only" nunca em detect() |
| test_vulkan_not_in_detect_result_even_when_ctypes_found | Vulkan encontrado → detect() retorna cpu |

Estratégia de mock: `patch.dict(sys.modules, {"torch": torch_mock, ...})` sem hardware real.

## Deviations from Plan

None — plano executado exatamente como escrito.

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| Task 1 (TDD) | 7b3cb44 | feat(91-02): criar device_detect.py com cascade multi-OS e allocation test |
| Task 2 | c11f947 | feat(91-02): adicionar campo gpu_amd_backend em JarvisConfig |

## Known Stubs

None — `device_detect.detect()` retorna resultado real baseado no ambiente detectado. Chatterbox em CPU é comportamento intencional (fallback_strategy: CPU-ONLY confirmado em Plan 01).

## Self-Check: PASSED

- [x] `apps/desktop-py/src/jarvis_desktop/device_detect.py` exists
- [x] File exports `detect`, `DeviceResult`, `get_fallback_chain`, `reset_cache`, `ChainEntry`
- [x] `device_detect.py` contains `torch.zeros` (allocation test GPU P-2)
- [x] `device_detect.py` contains `threading.Lock` (thread-safe singleton)
- [x] `device_detect.py` contains `"directml"` and `"mps"` and `"vulkan"` (all cascade branches)
- [x] `device_detect.py` contains `"detection-only"` (Vulkan D-07)
- [x] `tests/test_device_detect.py` exists with 11 test functions (≥8 required)
- [x] `pytest tests/test_device_detect.py` exits 0 (11 passed)
- [x] `JarvisConfig().gpu_amd_backend == "directml"` (verified)
- [x] Commits 7b3cb44 and c11f947 exist in git log
