"""JARVIS desktop client configuration.

Schema is locked (Phase 72). Downstream phases add new fields but never
redefine existing ones. Load order: .env > ~/.jarvis/config.json > defaults.
"""
import json
import os
import tempfile
import threading
from pathlib import Path

from pydantic import BaseModel, Field

# Module-level lock for thread-safe atomic config writes (CONF-01, Phase 78)
_config_lock = threading.Lock()


class JarvisConfig(BaseModel):
    """JARVIS desktop client configuration schema.

    DO NOT change field names or defaults — downstream phases depend on these.
    Add new fields below when needed (Phases 73-77), never redefine existing ones.
    """
    gateway_url: str = Field(default="http://localhost:3000")
    whisper_model: str = Field(default="tiny")
    tts_provider: str = Field(default="kokoro")
    voice_mode: str = Field(default="ptt")
    api_key: str = Field(default="")  # D-05 (Phase 73): optional Bearer token for gateway auth
    # Phase 74: PTT hotkey + VAD config (D-02, discretion)
    ptt_key: str = Field(default="ctrl+shift+q", description="Global PTT hotkey binding (D-02, Phase 74)")
    silence_threshold_ms: int = Field(default=500, description="VAD silence pause in ms before end-of-speech trigger (Phase 74)")
    # Phase 75: TTS config fields (D-03, D-05, D-08, D-10)
    kokoro_voice: str = Field(default="pf_dora", description="Kokoro PT-BR voice name (pf_dora|pm_alex|pm_santa) — D-05")
    local_only: bool = Field(default=False, description="Disable all cloud TTS providers (D-10, PYTTS-04)")
    elevenlabs_api_key: str = Field(default="", description="ElevenLabs API key; empty string = skip (D-08)")
    murf_api_key: str = Field(default="", description="Murf.ai API key; empty string = skip (D-08)")
    # Phase 78: Agentic task config
    agentic_confirm: bool = Field(default=False, description="Show plan confirmation prompt before executing tasks (Phase 78)")
    debug_events: bool = Field(default=False, description="Show raw agentic SSE events in terminal (Phase 78)")
    # Phase 82: Silent mode para execução de tarefas
    agentic_step_progress: bool = Field(
        default=False,
        description="Show step-by-step progress during task execution; False = silent until final result (Phase 82)"
    )
    # Phase 76: Voice modes config (D-01, D-03, PYMODE-01)
    wake_word_threshold: float = Field(
        default=0.7,
        description="openwakeword detection threshold (0.0–1.0). Default 0.7 per PYMODE-01 — higher = stricter, fewer false positives",
    )
    # Phase 78: Whisper GPU auto-detection lock (WGPU-02)
    whisper_model_locked: bool = Field(
        default=False,
        description="If True, auto-detect skips model selection and uses whisper_model as-is (set by /config user choice)",
    )
    # Quick task 260524-h98: whisper.cpp Vulkan backend for AMD GPU (Windows)
    stt_backend: str = Field(
        default="auto",
        description=(
            "STT backend: 'auto' = detect AMD on Windows -> whisper_cpp else faster_whisper; "
            "'faster_whisper' = force faster-whisper; 'whisper_cpp' = force whisper.cpp subprocess"
        ),
    )
    whisper_cpp_binary: str = Field(
        default="",
        description="Path to whisper-cli.exe. Empty = auto-find in ~/.jarvis/bin/whisper-cli.exe then PATH.",
    )
    # Phase 84: Python client registration ID (REQ-84-02)
    client_id: str = Field(
        default="",
        description="Python client UUID sent as x-jarvis-client-id header on all gateway requests (Phase 84, D-02)"
    )


def _config_file_path() -> Path:
    """Return platform-safe path to ~/.jarvis/config.json."""
    return Path.home() / ".jarvis" / "config.json"


def load_config() -> JarvisConfig:
    """Load config from .env then ~/.jarvis/config.json, falling back to defaults.

    Load order:
    1. Defaults (hardcoded in JarvisConfig)
    2. GATEWAY_URL from environment (set by .env via python-dotenv)
    3. ~/.jarvis/config.json (user preferences — overrides env for preference fields)

    If ~/.jarvis/config.json does not exist, it is created with defaults.
    Unknown keys in config.json are silently ignored (forward-compat).
    """
    from dotenv import load_dotenv

    # Step 1: Load .env from project root (two levels up from this file's location)
    # __file__ = apps/desktop-py/src/jarvis_desktop/config.py
    # project root = 4 levels up
    _env_candidates = [
        Path(__file__).parents[4] / ".env",   # monorepo root
        Path.cwd() / ".env",                   # fallback: cwd
        Path.cwd() / ".." / ".." / ".env",     # fallback: two levels up
    ]
    for env_path in _env_candidates:
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
            break
    else:
        load_dotenv(override=False)  # Let python-dotenv try default locations

    # Step 2: Build base config (defaults + env vars)
    gateway_url = os.getenv("GATEWAY_URL", "http://localhost:3000")
    api_key = os.getenv("JARVIS_API_KEY", "")
    tts_provider_env = os.getenv("TTS_PROVIDER", "")
    config_kwargs: dict = dict(gateway_url=gateway_url, api_key=api_key)
    if tts_provider_env:
        config_kwargs["tts_provider"] = tts_provider_env
    config = JarvisConfig(**config_kwargs)

    # Step 3: Load ~/.jarvis/config.json (user preferences override defaults)
    config_file = _config_file_path()
    if config_file.exists():
        try:
            with open(config_file, encoding="utf-8") as f:
                user_data = json.load(f)
            # Only apply known fields — ignore unknown keys for forward-compat
            known_fields = JarvisConfig.model_fields.keys()
            filtered = {k: v for k, v in user_data.items() if k in known_fields}
            config = JarvisConfig(**{**config.model_dump(), **filtered})
        except (json.JSONDecodeError, ValueError):
            # Corrupted config.json — use defaults, overwrite with clean file below
            pass
    else:
        # Auto-create ~/.jarvis/ and write defaults
        config_file.parent.mkdir(parents=True, exist_ok=True)

    # Step 4: Fill empty API key fields from env (env > empty config.json value)
    # Config.json wins for preferences (tts_provider); env fills secrets left blank.
    env_key_fill = {
        "elevenlabs_api_key": os.getenv("ELEVENLABS_API_KEY", ""),
        "murf_api_key": os.getenv("MURF_API_KEY", ""),
    }
    updates = {k: v for k, v in env_key_fill.items() if v and not getattr(config, k)}
    if updates:
        config = JarvisConfig(**{**config.model_dump(), **updates})
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump(config.model_dump(), f, indent=2)
            f.write("\n")

    return config


def save_config(config: JarvisConfig) -> None:
    """Persist config to ~/.jarvis/config.json atomically and thread-safely (CONF-01).

    Thread-safe: module-level _config_lock guards entire operation.
    Atomic write: writes to temp file first, then os.replace() (rename) swaps atomically.
    os.replace() is atomic on POSIX and safe on Windows (same filesystem guaranteed
    because temp file is in same directory as target).

    Called by: voice_modes.switch_mode() and chat.py /config menu handler.
    """
    with _config_lock:
        config_file = _config_file_path()
        config_file.parent.mkdir(parents=True, exist_ok=True)

        # Write to temp file in same directory (same filesystem = atomic rename)
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                dir=config_file.parent,
                delete=False,
                encoding="utf-8",
                suffix=".tmp",
            ) as tmp:
                json.dump(config.model_dump(), tmp, indent=2)
                tmp.write("\n")
                tmp_path = tmp.name

            # Atomic replace: os.replace handles Windows + POSIX
            os.replace(tmp_path, config_file)
        except Exception as exc:
            # Clean up temp file to avoid leaving garbage
            if tmp_path is not None:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            raise RuntimeError(f"[Config] Falha ao salvar config: {exc}") from exc
