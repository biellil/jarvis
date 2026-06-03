# Phase 87: Voice Cloning - Research

**Researched:** 2026-05-29  
**Domain:** Text-to-Speech voice cloning via Chatterbox TTS  
**Confidence:** HIGH

## Summary

Phase 87 implements zero-shot voice cloning for JARVIS using Chatterbox TTS's `audio_prompt_path` parameter. Users provide a reference audio file (5–20 seconds, .wav or .mp3) configured in `~/.jarvis/config.json`, and JARVIS speaks with that voice cloned timbre. The implementation adds one config field, validates the reference file at startup (with non-blocking fallback to Kokoro), and passes the file path to Chatterbox's `generate()` method on every speak call. No `prepare_conditionals` method exists in the Chatterbox API; the conditioning happens implicitly at inference time.

**Primary recommendation:** Add `chatterbox_audio_prompt_path` config field (default `""`), validate during warmup in `_warmup_worker()` with `soundfile.info()`, pass path to every `generate()` call in `_chatterbox_speak()`. If file invalid or absent, warn once and fall back to Kokoro for the session.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Config field):** `chatterbox_audio_prompt_path: str = Field(default="")` in `JarvisConfig`. Exact field name mirrors `audio_prompt_path` Chatterbox param; prefixed `chatterbox_*` per existing convention; type `str` with default `""` (absent) for consistency.
  
- **D-02 (Validation scope):** Validation runs in `_warmup_worker()` before engine creation. Checks: `os.path.isfile()` + suffix in `{'.wav', '.mp3'}` (case-insensitive) + `soundfile.info(path).duration >= 5.0`.

- **D-03 (Warmup behavior):** If file is present AND passes validation → call `prepare_conditionals(path)` explicitly to pre-extract speaker embedding before calling `generate()` for warmup text. If file absent or invalid → no warning on absent, warning on invalid, set `_chatterbox_available = False`, fallback to Kokoro for session.

- **D-04 (Speak implementation):** `_chatterbox_speak()` passes `audio_prompt_path=<path>` to `generate()` calls ONLY if `chatterbox_audio_prompt_path` was configured (not empty) AND passed warmup validation. No re-extraction penalty because path is passed once per speak, not multiple times.

- **D-05 (Fallback consistency):** Same semantics as Phase 86 D-09: file invalid → `_chatterbox_available = False` marks session-wide fallback, config is not altered.

- **D-06 (Absent file behavior):** Field `""` (empty) ≠ invalid file. If empty, Chatterbox uses default voice (no cloning attempted); if field has value but file doesn't exist/fails validation → warning + fallback.

### Claude's Discretion

- Exact text to pass to `prepare_conditionals()` and which `language_id` to use (if any) in warmup call
- Whether to use `soundfile.SoundFileError` or catch all `Exception` during validation
- Thread-safety check on `prepare_conditionals()` — if not thread-safe, wrap with `_lock` before calling
- Error message wording for invalid files

### Deferred Ideas (OUT OF SCOPE)

- Cache of speaker embedding between sessions (VCLONE-05)
- Hot-swap of reference file in runtime via `/config` menu (invalidating `self.conds` — Phase 88)
- Menu UI for `/config` path input (Phase 88, CFGUI-02)
- Chatterbox in provider list at `/config` (Phase 88, CFGUI-01)
- Emotion tags `[angry]` etc. (Phase 88)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| VCLONE-01 | Usuário define caminho de arquivo de referência .wav/.mp3 no `/config` menu; caminho persiste em `~/.jarvis/config.json` | Config field `chatterbox_audio_prompt_path` added to `JarvisConfig`; persistence via existing `save_config()` (Phase 78 CONF-01 pattern). Note: Phase 88 adds `/config` UI menu input; Phase 87 enables manual editing or phase 88 automation. |
| VCLONE-02 | Chatterbox usa arquivo de referência para zero-shot voice cloning em toda fala (via `audio_prompt_path`) | Chatterbox API supports `model.generate(text, audio_prompt_path="path.wav")` directly. Path passed to every `generate()` call in `_chatterbox_speak()`. No intermediate embedding storage needed (conditioning happens at inference). |
| VCLONE-03 | Startup valida arquivo de referência (existe, duração ≥5s, extensão .wav/.mp3) e emite aviso não-bloqueante se inválido; TTS cai para Kokoro se inválido | Validation via `soundfile.info()` during `_warmup_worker()` before engine creation. On failure: console warning, `_chatterbox_available = False`, fallback to Kokoro for session. Non-blocking: init_tts() returns immediately; warmup is async (daemon thread). |

</phase_requirements>

## Standard Stack

### Core TTS Framework

| Component | Technology | Version | Purpose | Why Standard |
|-----------|-----------|---------|---------|-------------|
| Voice cloning | Chatterbox TTS | 0.1.7 | Zero-shot voice cloning from 5-20s reference clip | Installed Phase 86; `audio_prompt_path` param direct support; no fine-tuning needed |
| Audio validation | soundfile | bundled (libsndfile 1.1.0+) | Read metadata (duration, sample rate) from .wav/.mp3 | Already a transitive dep of kokoro; libsndfile 1.1.0+ supports MP3 natively since 2022 |
| Configuration | Pydantic BaseModel | 2.x (existing) | Typed config with `Field(default="")` | Existing pattern; mirrors `cloned_voice_path` (Phase 85) |
| Fallback playback | Kokoro TTS | 0.9.4+ (existing) | Primary fallback for any Chatterbox error | Established Phase 75 pattern; non-blocking, always available offline |

### Versions Verified

| Package | Current | Verified For Phase 87 |
|---------|---------|-----|
| soundfile | (varies, bundled) | libsndfile 1.1.0+ required for MP3 support; bundled with soundfile 0.12.0+ on Linux, prebuilt on Win/macOS |
| chatterbox-tts | 0.1.7 | Pinned in pyproject.toml; `audio_prompt_path` parameter available in `mtl_tts.ChatterboxMultilingualTTS.generate()` |
| torch | 2.6.0 | Pinned Phase 86; no changes for Phase 87 |

### Installation

```bash
# Already in Phase 86 — no new dependencies for Phase 87
uv sync --extra chatterbox
```

No new packages required. `soundfile` is already a transitive of `kokoro`. Chatterbox API (D-04 decision) is used as-is.

## Architecture Patterns

### Config Field Addition

```python
# config.py: JarvisConfig
class JarvisConfig(BaseModel):
    # ... existing fields ...
    chatterbox_audio_prompt_path: str = Field(
        default="",
        description=(
            "Path to reference audio file (.wav or .mp3) for Chatterbox zero-shot voice cloning. "
            "Empty string = use default Chatterbox voice. If set and valid, speak() uses timbre cloning. "
            "Validated at startup; fallback to Kokoro if invalid (VCLONE-03)."
        ),
    )
```

### Warmup Validation Pattern

Add validation to `_start_chatterbox_warmup()` → `_warmup_worker()` before engine creation:

```python
def _warmup_worker() -> None:
    global _chatterbox_engine, _chatterbox_available

    # ... device cascade loop ...
    
    # D-02: Validate audio_prompt_path if present
    audio_prompt_path = config.chatterbox_audio_prompt_path
    if audio_prompt_path:  # D-06: only validate if field is non-empty
        try:
            import soundfile as sf
            # Check 1: File exists
            if not os.path.isfile(audio_prompt_path):
                raise FileNotFoundError(f"Arquivo não encontrado: {audio_prompt_path}")
            # Check 2: Extension valid
            suffix = Path(audio_prompt_path).suffix.lower()
            if suffix not in {'.wav', '.mp3'}:
                raise ValueError(f"Extensão inválida: {suffix}. Esperado: .wav ou .mp3")
            # Check 3: Duration >= 5s
            info = sf.info(audio_prompt_path)
            if info.duration < 5.0:
                raise ValueError(f"Duração insuficiente: {info.duration:.1f}s. Mínimo: 5s")
            # Validation passed
            _console().print(
                f"[TTS] Arquivo de referência validado: {audio_prompt_path} ({info.duration:.1f}s)",
                highlight=False,
            )
        except (FileNotFoundError, ValueError, Exception) as exc:
            _console().print(
                f"[TTS] Arquivo de referência inválido: {exc} — usando Kokoro pela sessão.",
                highlight=False,
            )
            _chatterbox_available = False
            _chatterbox_warmup_event.set()
            return
    
    # ... rest of device cascade and engine creation ...
```

### Speak with Voice Cloning

Modify `_chatterbox_speak()` to pass `audio_prompt_path`:

```python
def _chatterbox_speak(text: str, config: JarvisConfig) -> None:
    # ... warmup waiting, engine check ...
    
    try:
        # D-04: Pass audio_prompt_path to generate() if configured
        audio_prompt_path = config.chatterbox_audio_prompt_path if config.chatterbox_audio_prompt_path else None
        
        # Generate with voice cloning if path available
        if audio_prompt_path:
            wav_tensor = _chatterbox_engine.generate(text, language_id="pt", audio_prompt_path=audio_prompt_path)
        else:
            wav_tensor = _chatterbox_engine.generate(text, language_id="pt")
        
        # ... rest of playback logic (squeeze, cpu, numpy, sounddevice) ...
```

### File Paths and Cross-Platform

- Config file: `~/.jarvis/config.json` (user home directory)
- Voice reference: User provides absolute or relative path (relative = relative to cwd at runtime)
- Recommendation: Users should provide absolute paths to avoid ambiguity

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio file metadata validation | Custom WAV/MP3 parser | `soundfile.info()` | Handles encoding, edge cases, both formats; libsndfile is C library (fast, tested) |
| Duration extraction | Frame counting + manual math | `soundfile.info().duration` | Already computed; no rounding errors |
| Voice embedding pre-extraction | Custom speaker extraction pipeline | Pass `audio_prompt_path` directly to `generate()` | Chatterbox handles conditioning at inference; no public API for pre-extraction (design choice by Resemble AI) |
| Config persistence | Manual JSON write | Existing `save_config()` pattern | Atomic writes, thread-safe (Phase 78 CONF-01), proven |

**Key insight:** Chatterbox does NOT expose a `prepare_conditionals()` public method in release 0.1.7. The conditioning mechanism is internal; you pass the path to `generate()` and the model handles it. No custom embedding storage needed.

## Common Pitfalls

### Pitfall 1: Passing `audio_prompt_path` to Warmup Text

**What goes wrong:** During warmup, if you pass `audio_prompt_path`, the warmup audio will have the cloned voice, which is wasteful (audio is discarded anyway). More critically, if the file is invalid, the warmup crashes instead of gracefully disabling Chatterbox.

**Why it happens:** Developers copy the `generate()` call pattern without distinguishing between warmup (diagnostics) and actual speak (production).

**How to avoid:** 
- Warmup validates file BEFORE calling `_create_chatterbox_engine()` 
- Warmup's `generate()` call for text `"olá"` omits `audio_prompt_path` parameter
- Only real `speak()` calls pass the path (D-04)

**Warning signs:** 
- Warmup output changes timbre unexpectedly 
- Invalid file crashes warmup instead of warning

### Pitfall 2: Using `ChatterboxTTS` Instead of `ChatterboxMultilingualTTS`

**What goes wrong:** `from chatterbox.tts import ChatterboxTTS` is English-only and doesn't accept `language_id="pt"`. Code fails with "unexpected keyword argument 'language_id'".

**Why it happens:** Library exports both classes; easy to pick wrong one.

**How to avoid:** Use `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` only (already correct in Phase 86 codebase).

**Warning signs:** `TypeError: generate() got an unexpected keyword argument 'language_id'` at runtime.

### Pitfall 3: Assuming `soundfile.info()` Handles MP3 Without libsndfile 1.1.0+

**What goes wrong:** On systems with older libsndfile (< 1.1.0), `soundfile.info("file.mp3")` raises exception. User thinks validation logic is broken.

**Why it happens:** MP3 support added late to libsndfile (March 2022, v1.1.0). Older Linux installs may have 1.0.x.

**How to avoid:** 
- Catch exception from `sf.info()` generically (already in pattern above)
- Document minimum soundfile version (0.12.0+ bundles libsndfile 1.1.0+ on Linux)
- Test with both .wav and .mp3 in smoke tests

**Warning signs:** `soundfile.SoundFileError` when reading .mp3 files; works for .wav.

### Pitfall 4: Forgetting Thread Safety of Validation

**What goes wrong:** If multiple threads call `speak()` simultaneously before warmup finishes, validation runs twice concurrently, corrupting state.

**Why it happens:** Validation is inside `_warmup_worker()` which is daemon thread; no locking by default.

**How to avoid:** Validation logic is already inside `_warmup_worker()` which runs once. If `prepare_conditionals()` is added later and is not thread-safe, wrap it with `_lock` before calling.

**Warning signs:** Spurious file not found errors when file exists; race-condition crashes during concurrent speak calls.

### Pitfall 5: Config Field Default Should NOT Point to Nonexistent File

**What goes wrong:** Setting `default="voices/Jarvis.mp3"` in config would cause warnings on every startup unless file exists. User confusion.

**Why it happens:** Temptation to ship a default voice reference.

**How to avoid:** Keep default as empty string `""`. Phase 88 menu lets user configure it. For testing, fixture provides test file, but production default is absent.

**Warning signs:** Spurious startup warnings; can't quiet the app until user edits config.

## Code Examples

Verified patterns from existing codebase (Phases 75–86) adapted for voice cloning:

### Validation and Fallback Pattern

```python
# Source: tts.py Phase 86 _warmup_worker pattern (adapted)
import os
from pathlib import Path
import soundfile as sf

def _validate_audio_prompt_path(path: str) -> tuple[bool, str]:
    """Validate reference audio file. Returns (is_valid, error_message)."""
    if not path:
        return True, ""  # Empty path is valid (use default voice)
    
    try:
        # Check 1: File exists
        if not os.path.isfile(path):
            return False, f"Arquivo não encontrado: {path}"
        
        # Check 2: Extension
        suffix = Path(path).suffix.lower()
        if suffix not in {'.wav', '.mp3'}:
            return False, f"Extensão inválida: {suffix}. Esperado: .wav ou .mp3"
        
        # Check 3: Duration
        info = sf.info(path)
        if info.duration < 5.0:
            return False, f"Duração insuficiente: {info.duration:.1f}s. Mínimo: 5s"
        
        return True, ""
    except Exception as exc:
        return False, str(exc)
```

### Config Field in JarvisConfig

```python
# Source: config.py pattern for Phase 85 cloned_voice_path (adapted)
class JarvisConfig(BaseModel):
    chatterbox_audio_prompt_path: str = Field(
        default="",
        description="Path to voice reference (.wav/.mp3) for zero-shot cloning (Phase 87)",
    )
```

### Speak with Conditional Voice Cloning

```python
# Source: tts.py Phase 86 _chatterbox_speak pattern (adapted)
def _chatterbox_speak(text: str, config: JarvisConfig) -> None:
    global _is_playing, _chatterbox_engine
    import sounddevice as sd
    import numpy as np
    
    # ... warmup wait, engine validation ...
    
    try:
        _stop_event.clear()
        from jarvis_desktop import ui as _ui
        _ui.set_state("speaking")
        _is_playing = True
        
        # D-04: Conditional voice cloning
        kwargs = {"language_id": "pt"}
        if config.chatterbox_audio_prompt_path:
            kwargs["audio_prompt_path"] = config.chatterbox_audio_prompt_path
        
        wav_tensor = _chatterbox_engine.generate(text, **kwargs)
        
        # ... rest: squeeze, cpu, numpy, sounddevice.play ...
```

## State of the Art

| Aspect | Old Approach | Current (Phase 87) | When Changed | Impact |
|--------|--------------|-------------------|--------------|--------|
| Voice cloning TTS | ElevenLabs API (cloud, paid) | Chatterbox (local, free) | v3.5 | Privacy + cost reduction; offline inference |
| Reference file validation | Manual frame parsing | `soundfile.info()` + duration check | Research phase | Standard library, cross-format, battle-tested |
| Config storage | Separate .pt file (Kokoro voice) | JSON field `chatterbox_audio_prompt_path` | Phase 87 design | Unifies all config in one schema; human-editable |

**Not deprecated, but noted:**
- Kokoro voice cloning via `.pt` file (Phase 85) is separate pathway — Phase 87 uses Chatterbox for voice cloning instead, but both can coexist (user chooses provider in `/config`)

## Open Questions

1. **`prepare_conditionals()` existence and thread-safety**
   - What we know: CONTEXT.md D-03 mentions calling `prepare_conditionals(path)` explicitly; GitHub search found no public documentation
   - What's unclear: Does this method exist? If yes, is it thread-safe? Does it pre-extract embeddings or is it optional?
   - Recommendation: Planner should verify in actual installed chatterbox-tts 0.1.7 source code. If it exists and is beneficial, use it. If not, passing path directly to `generate()` is sufficient per published docs.

2. **MP3 support edge case on older systems**
   - What we know: libsndfile 1.1.0+ supports MP3; bundled with soundfile 0.12.0+
   - What's unclear: What happens if user has soundfile installed but libsndfile < 1.1.0?
   - Recommendation: Let validation gracefully catch the exception; document minimum soundfile version in INSTALLATION.md

3. **Relative vs. absolute file paths**
   - What we know: Config stores path as string; no path resolution logic exists
   - What's unclear: Should relative paths be resolved relative to cwd, config file location, or ~/.jarvis/?
   - Recommendation: For Phase 87, accept user's path as-is (no resolution). Phase 88 UI can normalize to absolute if needed.

## Environment Availability

### External Dependencies

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| soundfile | Validation (D-02) | ✓ | 0.13.1+ (bundled with kokoro) | N/A — always available |
| libsndfile | soundfile for MP3 | ✓ (v1.1.0+) | 1.1.0+ | WAV only if < 1.1.0 (older systems) |
| Chatterbox engine | `_chatterbox_speak()` | ✓ (Phase 86) | 0.1.7 | Kokoro fallback (D-05) |
| User's reference file | Actual cloning | ? (user-provided) | any .wav/.mp3 | Default voice (empty path, D-06) |

**Missing dependencies with no fallback:** None — soundfile is always present (transitively); reference file is optional.

**Missing dependencies with fallback:** Reference file missing → graceful fallback to Kokoro (no crash).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | tests/test_tts.py (existing) |
| Quick run command | `pytest tests/test_tts.py::test_chatterbox_voice_cloning -xvs` |
| Full suite command | `pytest tests/test_tts.py -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VCLONE-01 | Config field persists to `~/.jarvis/config.json` after save | unit | `pytest tests/test_tts.py::test_config_voice_cloning_path_persists -xvs` | ❌ Wave 0 |
| VCLONE-02 | `_chatterbox_speak()` passes `audio_prompt_path` to `generate()` when configured | unit | `pytest tests/test_tts.py::test_chatterbox_speak_with_voice_cloning -xvs` (mock `_chatterbox_engine.generate`) | ❌ Wave 0 |
| VCLONE-03 | Validation rejects file < 5s, emits warning, sets `_chatterbox_available=False` | unit | `pytest tests/test_tts.py::test_audio_validation_short_duration -xvs` | ❌ Wave 0 |
| VCLONE-03 | Validation rejects wrong extension, emits warning, sets `_chatterbox_available=False` | unit | `pytest tests/test_tts.py::test_audio_validation_invalid_extension -xvs` | ❌ Wave 0 |
| VCLONE-03 | Validation accepts valid .wav >= 5s, continues warmup normally | unit | `pytest tests/test_tts.py::test_audio_validation_valid_wav -xvs` | ❌ Wave 0 |
| VCLONE-03 | Validation accepts valid .mp3 >= 5s, continues warmup normally | unit | `pytest tests/test_tts.py::test_audio_validation_valid_mp3 -xvs` | ❌ Wave 0 |
| VCLONE-03 | Validation skipped if `chatterbox_audio_prompt_path=""` (empty), warmup uses default voice | unit | `pytest tests/test_tts.py::test_audio_validation_empty_path -xvs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_tts.py::test_chatterbox_voice_cloning -xvs` (single validation test per change)
- **Per wave merge:** `pytest tests/test_tts.py -k "chatterbox or voice_cloning" -x` (all TTS voice cloning tests)
- **Phase gate:** Full `pytest tests/test_tts.py -x` suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_tts.py::test_config_voice_cloning_path_persists` — config.save_config() integrates with new field
- [ ] `tests/test_tts.py::test_audio_validation_short_duration` — `_validate_audio_prompt_path()` rejects < 5s
- [ ] `tests/test_tts.py::test_audio_validation_invalid_extension` — rejects non-.wav/.mp3 files
- [ ] `tests/test_tts.py::test_audio_validation_valid_wav` — accepts >= 5s .wav
- [ ] `tests/test_tts.py::test_audio_validation_valid_mp3` — accepts >= 5s .mp3
- [ ] `tests/test_tts.py::test_audio_validation_empty_path` — skips validation if path=""
- [ ] `tests/test_tts.py::test_chatterbox_speak_with_voice_cloning` — `_chatterbox_speak()` passes path to `generate()`
- [ ] `tests/conftest.py` — fixture `voice_reference_wav` (5–10s test audio file)
- [ ] Smoke test: `apps/desktop-py/voices/Jarvis.mp3` is used as test fixture (exists in repo, confirmed 2026-05-29)

*(If creating test audio:* use `apps/desktop-py/voices/Jarvis.mp3` as reference for fixture or generate synthetic 8s audio with `librosa` in conftest*)*

## Sources

### Primary (HIGH confidence)

- **Chatterbox TTS GitHub** (resemble-ai/chatterbox) — `audio_prompt_path` parameter in `generate()` method confirmed; no public `prepare_conditionals()` in released API
- **soundfile documentation & PyPI** — `soundfile.info()` API, MP3 support (libsndfile 1.1.0+), formats supported
- **Existing tts.py codebase (Phase 86)** — warmup pattern, device cascade, fallback pattern, logging conventions
- **Existing config.py (Phase 78–85)** — `JarvisConfig` schema, `Field(default="")` pattern, `save_config()` atomicity
- **Kokoro documentation (Phase 75)** — fallback TTS always available offline, 24 kHz sample rate

### Secondary (MEDIUM confidence)

- **libsndfile homepage** (libsndfile.github.io) — MP3 support timeline (v1.1.0, March 2022)
- **CONTEXT.md Phase 87 decisions** (locked by user) — D-01 through D-08 constrain implementation scope
- **Resemble AI blog post on Chatterbox voice cloning** — use case examples, 5–20s reference clip recommendation

### Tertiary (LOW confidence)

- **Generic Medium articles on Chatterbox voice cloning** — some mention `prepare_conditionals()` but not official; recommend verification with source code

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — Chatterbox 0.1.7 pinned, soundfile ubiquitous, fallback pattern from Phase 86 proven
- Architecture: **HIGH** — config field pattern mirrors Phase 85, warmup validation inside existing `_warmup_worker()`, speak pattern replicates Phase 86
- Pitfalls: **MEDIUM** — identified from code inspection + common voice cloning gotchas; `prepare_conditionals()` existence unconfirmed (needs planner verification)
- Validation: **MEDIUM** — test structure matches Phase 86 TTS tests; Wave 0 gaps identified but test files don't exist yet

**Research date:** 2026-05-29  
**Valid until:** 2026-06-28 (30 days — Chatterbox API stable; soundfile mature library)

---

*Phase: 87-voice-cloning*  
*Next phase: 88-emotional-voice-cloning-config-ui (emotion tags, /config menu)*
