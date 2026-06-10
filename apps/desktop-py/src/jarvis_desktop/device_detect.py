"""JARVIS device detection factory — Phase 91.

Single source of truth for GPU/device selection across all subsystems
(STT, TTS Chatterbox, TTS Kokoro). Replaces fragmented detection in
stt.py (_detect_device, _detect_amd_windows) and tts.py (_detect_chatterbox_device).

Public API:
  detect(config) -> DeviceResult          — returns best validated device
  get_fallback_chain(config) -> list[ChainEntry]  — full cascade evaluated

Cascade order (D-02 from 91-CONTEXT.md):
  CUDA → ROCm Linux → MPS (macOS) → DirectML (Windows AMD, if amd_backend="directml")
       → ROCm Windows (if amd_backend="rocm" + HIP SDK) → CPU

Vulkan: detection-only. Exposed in get_fallback_chain() as status string.
Never routed to any subsystem in Phase 91 (D-07).

GPU P-2 safeguard: every candidate passes _allocation_test() before commit.
torch.zeros(1, device=device_str) — RuntimeError = false positive → skip.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

from loguru import logger

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


@dataclass
class DeviceResult:
    """Result of device detection."""
    device: str          # "cuda" | "mps" | "directml" | "cpu"
    backend: str         # same as device; future: "rocm", "metal" for display
    vram_mb: int = 0     # 0 if unknown or CPU
    driver_info: str = ""  # Optional driver version string for --verbose


@dataclass
class ChainEntry:
    """One entry in the fallback chain evaluation log."""
    device: str
    status: str   # "selected" | "ok" | "failed" | "skipped" | "detection-only"
    reason: str   # Human-readable explanation


# ---------------------------------------------------------------------------
# Module-level cache (D-10: detect on startup, in-memory only, no disk cache)
# ---------------------------------------------------------------------------

_cached_result: Optional[DeviceResult] = None
_cached_chain: Optional[list] = None
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect(config: "JarvisConfig") -> DeviceResult:
    """Return best validated compute device.

    First call runs the full cascade + allocation tests.
    Subsequent calls return the cached result (D-10: ~50ms, not hot path).
    Thread-safe.

    Args:
        config: JarvisConfig — reads config.gpu_amd_backend for AMD strategy

    Returns:
        DeviceResult with validated device string ready for use in torch/ctranslate2
    """
    global _cached_result, _cached_chain
    with _lock:
        if _cached_result is None:
            _cached_result, _cached_chain = _run_cascade(config)
        return _cached_result


def get_fallback_chain(config: "JarvisConfig") -> list[ChainEntry]:
    """Return full fallback chain evaluated during last detect() call.

    Triggers detect() if not yet called. Used by jd validate-gpu (GPU-08).

    Args:
        config: JarvisConfig

    Returns:
        List of ChainEntry, one per candidate evaluated (including detection-only)
    """
    global _cached_result, _cached_chain
    with _lock:
        if _cached_chain is None:
            _cached_result, _cached_chain = _run_cascade(config)
        return list(_cached_chain)


def reset_cache() -> None:
    """Clear detection cache. Use in tests only."""
    global _cached_result, _cached_chain
    with _lock:
        _cached_result = None
        _cached_chain = None


# ---------------------------------------------------------------------------
# Internal cascade
# ---------------------------------------------------------------------------

def _run_cascade(config: "JarvisConfig") -> tuple[DeviceResult, list[ChainEntry]]:
    """Run full device cascade. Returns (selected, full_chain_log).

    Cascade order (D-02):
      1. CUDA (NVIDIA, or ROCm Linux via PyTorch ROCm build)
      2. MPS (macOS Apple Silicon — D-04)
      3. DirectML (Windows AMD/Intel, if amd_backend="directml" and torch_directml installed)
      4. ROCm Windows (if amd_backend="rocm" and HIP SDK via torch ROCm wheel)
      5. [Vulkan detection-only — never selected, D-07]
      6. CPU (always available)
    """
    chain: list[ChainEntry] = []
    amd_backend = getattr(config, "gpu_amd_backend", "directml")

    # 1. CUDA (covers NVIDIA and ROCm Linux via torch+rocm build)
    if _try_cuda(chain):
        return DeviceResult(device="cuda", backend="cuda", vram_mb=_query_vram_mb()), chain

    # 2. MPS (macOS Apple Silicon — D-04)
    if _try_mps(chain):
        return DeviceResult(device="mps", backend="mps"), chain

    # 3. DirectML (Windows AMD/Intel, default path — D-01)
    if amd_backend == "directml":
        if _try_directml(chain):
            return DeviceResult(device="directml", backend="directml"), chain
    else:
        chain.append(ChainEntry("directml", "skipped", f"amd_backend='{amd_backend}' — DirectML opt-out"))

    # 4. ROCm Windows (opt-in via amd_backend="rocm" — D-03)
    if amd_backend == "rocm":
        if _try_cuda(chain, label="rocm-windows"):  # ROCm Windows also reports via torch.cuda
            return DeviceResult(device="cuda", backend="rocm"), chain

    # 5. Vulkan — detection-only (D-07)
    _detect_vulkan(chain)

    # 6. CPU — always available
    chain.append(ChainEntry("cpu", "selected", "Universal fallback"))
    return DeviceResult(device="cpu", backend="cpu"), chain


def _allocation_test(device_str: str) -> bool:
    """GPU P-2: verify device is actually usable by allocating a 1-element tensor.

    Returns True if allocation succeeds, False on any error.
    This catches false positives (e.g., RDNA1 with HIP SDK, Intel Mac with MPS stub).
    """
    try:
        import torch
        t = torch.zeros(1, device=device_str)
        del t
        return True
    except Exception as exc:
        logger.debug(f"[device_detect] allocation test failed for {device_str!r}: {exc}")
        return False


def _try_cuda(chain: list, label: str = "cuda") -> bool:
    """Check CUDA availability and run allocation test."""
    try:
        import torch
        if not torch.cuda.is_available():
            chain.append(ChainEntry(label, "skipped", "torch.cuda.is_available() = False"))
            return False
        if _allocation_test("cuda"):
            chain.append(ChainEntry(label, "selected", "torch.cuda OK — device 0"))
            return True
        else:
            chain.append(ChainEntry(label, "failed", "allocation test failed (false positive)"))
            return False
    except ImportError:
        chain.append(ChainEntry(label, "skipped", "torch not installed"))
        return False
    except Exception as exc:
        chain.append(ChainEntry(label, "failed", str(exc)))
        return False


def _try_mps(chain: list) -> bool:
    """Check Apple MPS availability and run allocation test (D-04)."""
    try:
        import torch
        if not (hasattr(torch.backends, "mps")
                and torch.backends.mps.is_available()
                and torch.backends.mps.is_built()):
            chain.append(ChainEntry("mps", "skipped", "MPS not available or not built"))
            return False
        if _allocation_test("mps"):
            chain.append(ChainEntry("mps", "selected", "Apple Metal MPS OK"))
            return True
        else:
            chain.append(ChainEntry("mps", "failed", "allocation test failed (Intel Mac false positive)"))
            return False
    except ImportError:
        chain.append(ChainEntry("mps", "skipped", "torch not installed"))
        return False
    except Exception as exc:
        chain.append(ChainEntry("mps", "failed", str(exc)))
        return False


def _try_directml(chain: list) -> bool:
    """Check torch-directml availability and run allocation test."""
    try:
        import torch_directml  # type: ignore[import-not-found]
        if torch_directml.device_count() == 0:
            chain.append(ChainEntry("directml", "skipped", "torch_directml.device_count() = 0"))
            return False
        dml_device = torch_directml.device(0)
        # Allocation test: create tensor on the dml device object
        try:
            import torch
            t = torch.zeros(1, device=dml_device)
            del t
            chain.append(ChainEntry("directml", "selected", "torch-directml allocation OK"))
            return True
        except Exception as exc:
            chain.append(ChainEntry("directml", "failed", f"allocation test failed: {exc}"))
            return False
    except ImportError:
        chain.append(ChainEntry("directml", "skipped", "torch-directml not installed"))
        return False
    except Exception as exc:
        chain.append(ChainEntry("directml", "failed", str(exc)))
        return False


def _detect_vulkan(chain: list) -> None:
    """Detection-only Vulkan check (D-07). Never selected as active device."""
    import ctypes
    import platform
    lib_name = "vulkan-1.dll" if platform.system() == "Windows" else "libvulkan.so.1"
    try:
        ctypes.cdll.LoadLibrary(lib_name)
        chain.append(ChainEntry("vulkan", "detection-only",
                                f"{lib_name} found — routing not enabled in Phase 91"))
    except OSError:
        chain.append(ChainEntry("vulkan", "skipped", f"{lib_name} not found"))


def _query_vram_mb() -> int:
    """Return total VRAM in MB for device 0. Returns 0 if unknown."""
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            return props.total_memory // (1024 ** 2)
    except Exception:
        pass
    return 0
