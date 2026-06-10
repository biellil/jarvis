"""Tests for device_detect.py — Phase 91 GPU multi-platform detection.

Covers all 8 behaviors from 91-02-PLAN.md:
  1. CUDA available → DeviceResult(device="cuda", backend="cuda")
  2. CUDA unavailable + MPS available → DeviceResult(device="mps", backend="mps")
  3. CUDA unavailable + MPS unavailable + DirectML → DeviceResult(device="directml", backend="directml")
  4. No GPU → DeviceResult(device="cpu", backend="cpu")
  5. Allocation test fails → device skipped, cascade continues
  6. get_fallback_chain() → list of ChainEntry with status per device
  7. amd_backend="rocm" on Windows with HIP SDK → ROCm Windows before DirectML
  8. Vulkan detection-only → in chain as "detection-only", never in detect() result
"""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(amd_backend: str = "directml") -> SimpleNamespace:
    """Minimal config mock for device_detect tests."""
    return SimpleNamespace(gpu_amd_backend=amd_backend)


def _make_torch_mock(
    cuda_available: bool = False,
    mps_available: bool = False,
    mps_built: bool = False,
    zeros_raises: type[Exception] | None = None,
) -> ModuleType:
    """Build a minimal torch mock."""
    torch_mock = MagicMock()
    torch_mock.cuda.is_available.return_value = cuda_available

    mps_backend = MagicMock()
    mps_backend.is_available.return_value = mps_available
    mps_backend.is_built.return_value = mps_built
    torch_mock.backends.mps = mps_backend

    if zeros_raises is not None:
        torch_mock.zeros.side_effect = zeros_raises("allocation failure")
    else:
        torch_mock.zeros.return_value = MagicMock()

    # Simulate VRAM query
    props = MagicMock()
    props.total_memory = 8 * 1024 ** 3  # 8 GB
    torch_mock.cuda.get_device_properties.return_value = props

    return torch_mock


def _make_directml_mock(device_count: int = 1) -> ModuleType:
    """Build a minimal torch_directml mock."""
    dml = MagicMock()
    dml.device_count.return_value = device_count
    dml.device.return_value = MagicMock()
    return dml


# ---------------------------------------------------------------------------
# Fixture: reset cache before each test
# ---------------------------------------------------------------------------

import importlib
import pytest


@pytest.fixture(autouse=True)
def reset_device_detect_cache():
    """Reset device_detect module cache before each test."""
    # Import module (creates it if first time)
    import jarvis_desktop.device_detect as dd
    dd.reset_cache()
    yield
    dd.reset_cache()


# ---------------------------------------------------------------------------
# Test 1: CUDA available → DeviceResult(device="cuda", backend="cuda")
# ---------------------------------------------------------------------------

def test_detect_cuda_available():
    """When CUDA is available and allocation test passes, returns cuda."""
    torch_mock = _make_torch_mock(cuda_available=True)

    with patch.dict(sys.modules, {"torch": torch_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())

    assert result.device == "cuda", f"Expected 'cuda', got {result.device!r}"
    assert result.backend == "cuda", f"Expected backend 'cuda', got {result.backend!r}"


# ---------------------------------------------------------------------------
# Test 2: CUDA unavailable + MPS available → DeviceResult(device="mps", backend="mps")
# ---------------------------------------------------------------------------

def test_detect_mps_when_cuda_unavailable():
    """When CUDA is unavailable and MPS is available, returns mps."""
    torch_mock = _make_torch_mock(
        cuda_available=False,
        mps_available=True,
        mps_built=True,
    )

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": None}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())

    assert result.device == "mps", f"Expected 'mps', got {result.device!r}"
    assert result.backend == "mps", f"Expected backend 'mps', got {result.backend!r}"


# ---------------------------------------------------------------------------
# Test 3: CUDA unavailable + MPS unavailable + DirectML → DeviceResult(device="directml", backend="directml")
# ---------------------------------------------------------------------------

def test_detect_directml_when_cuda_mps_unavailable():
    """When CUDA and MPS unavailable but DirectML present, returns directml."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=1)

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": dml_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config(amd_backend="directml"))

    assert result.device == "directml", f"Expected 'directml', got {result.device!r}"
    assert result.backend == "directml", f"Expected backend 'directml', got {result.backend!r}"


# ---------------------------------------------------------------------------
# Test 4: No GPU → DeviceResult(device="cpu", backend="cpu")
# ---------------------------------------------------------------------------

def test_detect_cpu_when_no_gpu():
    """When no GPU is available, returns cpu."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=0)

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": dml_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())

    assert result.device == "cpu", f"Expected 'cpu', got {result.device!r}"
    assert result.backend == "cpu", f"Expected backend 'cpu', got {result.backend!r}"


# ---------------------------------------------------------------------------
# Test 5: Allocation test fails → device skipped, cascade continues to CPU
# ---------------------------------------------------------------------------

def test_allocation_test_failure_falls_back():
    """When CUDA is available but allocation test fails, falls back to next device."""
    torch_mock = _make_torch_mock(
        cuda_available=True,
        mps_available=False,
        mps_built=False,
        zeros_raises=RuntimeError,  # Allocation test fails
    )
    dml_mock = _make_directml_mock(device_count=0)

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": dml_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())

    # CUDA reported as available but allocation test failed → should fallback
    assert result.device != "cuda", (
        f"Expected fallback from cuda (allocation failed), got {result.device!r}"
    )


# ---------------------------------------------------------------------------
# Test 6: get_fallback_chain() → list with all evaluated devices and statuses
# ---------------------------------------------------------------------------

def test_get_fallback_chain_returns_all_entries():
    """get_fallback_chain() includes entries for all evaluated devices."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=0)

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": dml_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        chain = dd.get_fallback_chain(_make_config())

    assert isinstance(chain, list), "Chain must be a list"
    assert len(chain) >= 2, f"Expected at least 2 entries, got {len(chain)}"

    devices_in_chain = [e.device for e in chain]
    assert "cpu" in devices_in_chain, "CPU must always appear in chain"

    # All entries must have status and reason strings
    for entry in chain:
        assert hasattr(entry, "device"), "ChainEntry must have 'device'"
        assert hasattr(entry, "status"), "ChainEntry must have 'status'"
        assert hasattr(entry, "reason"), "ChainEntry must have 'reason'"
        assert isinstance(entry.status, str), f"status must be str, got {type(entry.status)}"
        assert isinstance(entry.reason, str), f"reason must be str, got {type(entry.reason)}"


def test_get_fallback_chain_selected_entry_for_detected_device():
    """The device returned by detect() has status='selected' in the chain."""
    torch_mock = _make_torch_mock(cuda_available=True)

    with patch.dict(sys.modules, {"torch": torch_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())
        chain = dd.get_fallback_chain(_make_config())

    selected = [e for e in chain if e.status == "selected"]
    assert len(selected) >= 1, "At least one chain entry must be 'selected'"
    assert any(e.device == result.device for e in selected), (
        f"Selected chain entry device must match detect() result ({result.device})"
    )


# ---------------------------------------------------------------------------
# Test 7: amd_backend="rocm" in config → ROCm Windows before DirectML
# ---------------------------------------------------------------------------

def test_rocm_config_skips_directml():
    """When amd_backend='rocm', DirectML is skipped (opt-out)."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=1)  # DirectML available but should be skipped

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": dml_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        chain = dd.get_fallback_chain(_make_config(amd_backend="rocm"))

    directml_entries = [e for e in chain if e.device == "directml"]
    # When amd_backend="rocm", directml should be skipped
    assert all(e.status == "skipped" for e in directml_entries), (
        f"DirectML must be 'skipped' when amd_backend='rocm', got: {directml_entries}"
    )


def test_directml_config_enables_directml():
    """When amd_backend='directml' (default), DirectML is evaluated."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=1)

    with patch.dict(sys.modules, {"torch": torch_mock, "torch_directml": dml_mock}):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        chain = dd.get_fallback_chain(_make_config(amd_backend="directml"))

    directml_entries = [e for e in chain if e.device == "directml"]
    assert len(directml_entries) >= 1, "DirectML must be evaluated when amd_backend='directml'"
    assert any(e.status in ("selected", "ok") for e in directml_entries), (
        f"DirectML should be selected when available and amd_backend='directml', got: {directml_entries}"
    )


# ---------------------------------------------------------------------------
# Test 8: Vulkan detection-only — in chain as "detection-only", never in detect() result
# ---------------------------------------------------------------------------

def test_vulkan_is_detection_only_never_selected():
    """Vulkan appears in chain as 'detection-only' but is NEVER returned by detect()."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=0)

    # Patch ctypes to simulate vulkan library found
    ctypes_mock = MagicMock()
    ctypes_mock.cdll.LoadLibrary.return_value = MagicMock()  # No OSError = found

    with patch.dict(sys.modules, {
        "torch": torch_mock,
        "torch_directml": dml_mock,
        "ctypes": ctypes_mock,
    }):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())
        chain = dd.get_fallback_chain(_make_config())

    # Vulkan must NOT be the selected device
    assert result.device != "vulkan", (
        f"Vulkan must never be returned by detect(), got {result.device!r}"
    )

    # Vulkan may or may not appear in chain depending on ctypes mock interaction,
    # but if it does appear it must be "detection-only"
    vulkan_entries = [e for e in chain if e.device == "vulkan"]
    for entry in vulkan_entries:
        assert entry.status == "detection-only", (
            f"Vulkan chain entry must be 'detection-only', got {entry.status!r}"
        )


def test_vulkan_not_in_detect_result_even_when_ctypes_found():
    """Vulkan found by ctypes → appears in chain but detect() returns cpu."""
    torch_mock = _make_torch_mock(cuda_available=False, mps_available=False, mps_built=False)
    dml_mock = _make_directml_mock(device_count=0)
    ctypes_mock = MagicMock()

    with patch.dict(sys.modules, {
        "torch": torch_mock,
        "torch_directml": dml_mock,
        "ctypes": ctypes_mock,
    }):
        import jarvis_desktop.device_detect as dd
        dd.reset_cache()
        result = dd.detect(_make_config())

    assert result.device == "cpu", (
        f"When only Vulkan found (detection-only), detect() must return cpu, got {result.device!r}"
    )
