# Phase 3: Voice Pipeline - Research

**Researched:** 2026-04-04
**Domain:** Speech-to-Text (faster-whisper), async Python, CLI integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Voice mode ativado via flag `--voice` — `python -m jarvis --voice`. Sem a flag, comportamento de texto idêntico ao atual (Phase 1/2). Dois modos distintos sem interferência.
- **D-02:** Usuário aponta o arquivo manualmente no terminal: `/voice audio.wav` ou `> audio.wav`. Sem monitoramento automático de pasta — o usuário controla quando processar.
- **D-03:** Caminho aceito: relativo ao diretório atual ou absoluto. JARVIS resolve o path, transcreve e responde.
- **D-04:** Formatos aceitos: qualquer formato suportado pelo faster-whisper (wav, mp3, m4a, ogg, flac). Sem conversão obrigatória — faster-whisper lida internamente.
- **D-05:** Transcrição via faster-whisper (offline, sem cloud). Modelo configurável via `.env` (`WHISPER_MODEL`, default: `base`).
- **D-06:** Idioma configurável via `.env` (`WHISPER_LANGUAGE`, default: `pt` para português). Sem auto-detect no MVP para evitar latência extra.
- **D-07:** Sem TTS — JARVIS responde apenas em texto no terminal.
- **D-08:** Estado exibido como mensagens simples no terminal (ex: `[voz]: processando audio.wav...`, `[transcrição]: "abre o spotify"`). Sem barras de estado animadas ou Rich elaborado.
- **D-09:** Transcrição entra no `ChatSession.send()` exatamente como texto digitado — memória, perfil e ChromaDB funcionam normalmente para inputs de voz.

### Claude's Discretion

- Intervalo de polling da pasta (500ms sugerido)
- Como lidar com arquivos corrompidos ou formatos inválidos (log + skip)
- Nome do arquivo processado no histórico de conversa (usar nome do arquivo ou timestamp)
- Configuração do modelo Whisper (tiny/base/small) — base é o default razoável para CPU

### Deferred Ideas (OUT OF SCOPE)

- **TTS no JARVIS** — responsabilidade do cliente. Se JARVIS vier a precisar de TTS embutido, entra em fase futura.
- **Wake word embutido** (openwakeword) — cliente faz isso. Pode entrar em fase futura se houver modo standalone.
- **Endpoint HTTP para receber áudio** — quando o cliente real for construído (Phase 5 ou posterior).
- **Push-to-talk no terminal** — sem mouse/teclado para PTT no modo simulação; cliente real gerencia isso.
- **Auto-detect de idioma** — desabilitado no MVP para evitar latência; pode ser opção configurável depois.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-02 | Usuário pode falar com o JARVIS via push-to-talk (tecla ativa microfone, Whisper transcreve) | Satisfied by `/voice <path>` command: user manually submits audio file, faster-whisper transcribes → ChatSession.send() |
| CONV-03 | JARVIS responde por voz (TTS neural via kokoro, offline) | Out of scope per CONTEXT.md — satisfied by text response in terminal (D-07). Requirement formally deferred to client. |
| CONV-04 | JARVIS indica claramente seu estado: ouvindo / pensando / falando | Satisfied by terminal state messages per D-08: `[voz]: processando...`, `[transcrição]: ...`, `JARVIS:` |
| CONV-05 | Usuário pode ativar JARVIS por wake word ("Hey JARVIS") sem precisar pressionar tecla | Out of scope per CONTEXT.md — wake word is client responsibility. Requirement formally deferred. |
| ARCH-02 | Pipeline de voz é totalmente assíncrono (asyncio.Queue) — sem bloqueio na thread principal | Satisfied by `asyncio.to_thread()` wrapping synchronous `WhisperModel.transcribe()`. Event loop stays unblocked. |
</phase_requirements>

---

## Summary

Phase 3 adds voice input to JARVIS via faster-whisper STT. The user explicitly narrows scope to: a `/voice <path>` command in the text loop, faster-whisper transcription in a non-blocking async wrapper, three new Settings fields, and simple terminal state messages. TTS, wake word, and mic capture are explicitly deferred to the client layer.

The core technical challenge is that `WhisperModel.transcribe()` is a synchronous, CPU-bound call that blocks the event loop if called with `await`. The correct pattern is `asyncio.to_thread(model.transcribe, audio_path, ...)`, which offloads the blocking work to a thread pool and returns an awaitable, keeping the async event loop responsive (ARCH-02). The segments result is a lazy generator — it must be fully consumed inside the thread before returning to the async context.

The secondary challenge is wiring the `--voice` flag into `__main__.py`. Python's `argparse` is called before `asyncio.run()`, so the parsed flag flows into `main_async()` as a parameter. The existing `main_async()` loop receives a simple boolean and changes only its command-dispatch logic — no structural change to the async architecture.

**Primary recommendation:** Add `argparse` in `main()`, parse `--voice`, pass into `main_async(voice_mode: bool)`, intercept `/voice <path>` before `session.send()`, call `asyncio.to_thread(model.transcribe, ...)`, print state messages per D-08, forward transcript to `session.send()`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| faster-whisper | 1.2.1 | Offline STT via CTranslate2 | 4x faster than openai/whisper, int8 CPU support, bundles PyAV (no system ffmpeg), CLAUDE.md mandated |
| asyncio (stdlib) | 3.12 built-in | Non-blocking coordination | Already used in main_async(); to_thread() bridges sync Whisper to async loop |
| argparse (stdlib) | 3.12 built-in | CLI flag `--voice` | Zero-dependency, already the Python standard for CLI argument parsing |
| pydantic-settings | 2.13.1 | New Settings fields | Already in use — add WHISPER_MODEL, WHISPER_LANGUAGE, VOICE_INPUT_DIR per CLAUDE.md pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pathlib (stdlib) | 3.12 built-in | Resolving relative/absolute audio paths | D-03 — Path(user_input).resolve() handles both relative and absolute cleanly |
| loguru | 0.7.3 | Logging corrupt/invalid files | Already installed; use logger.warning() for skip decisions (Claude's Discretion) |
| rich | 14.3.3 | Terminal state messages | Already used for console.print() in __main__.py; use for D-08 state messages |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| asyncio.to_thread() | asyncio.get_event_loop().run_in_executor() | run_in_executor() is lower-level and verbose; to_thread() is the modern idiomatic choice (Python 3.9+, matches project's 3.12) |
| argparse | sys.argv manual parse | argparse gives --help for free, handles errors cleanly; no reason to avoid it here |
| pathlib.Path | os.path | pathlib is already used in project; consistent |

**Installation:**
```bash
pip install faster-whisper==1.2.1
```

**Version verification:** Confirmed via `pip index versions faster-whisper` — 1.2.1 is the latest available.

---

## Architecture Patterns

### Recommended Project Structure

```
src/jarvis/
├── __main__.py          # Add argparse, voice_mode param, /voice command dispatch
├── config.py            # Add WHISPER_MODEL, WHISPER_LANGUAGE, VOICE_INPUT_DIR
├── core/
│   ├── session.py       # No changes — ChatSession.send() already accepts any string
│   └── voice.py         # NEW: WhisperTranscriber class (lazy model loading + async transcribe)
└── tests/
    └── test_voice.py    # NEW: unit tests for CONV-02, ARCH-02, CONV-04
```

### Pattern 1: Lazy WhisperModel with Async Transcription

**What:** Load the WhisperModel once on first use (lazy) and expose an async `transcribe()` method that offloads the synchronous CTranslate2 call to a thread pool.

**When to use:** Any time audio transcription is needed. Never call `model.transcribe()` directly in async context — it blocks the event loop.

**Why lazy loading:** WhisperModel loading is slow (model download + deserialization). Loading at startup would penalize users who never use voice mode. Loading on first `/voice` command is responsive and expected.

**Example:**
```python
# src/jarvis/core/voice.py
# Source: faster-whisper README + asyncio.to_thread() Python 3.9+ docs

import asyncio
from pathlib import Path
from typing import Optional
from faster_whisper import WhisperModel
from loguru import logger


class WhisperTranscriber:
    """Wraps WhisperModel with lazy loading and async-safe transcription.

    Per ARCH-02: transcribe() uses asyncio.to_thread() to avoid blocking
    the event loop. The segments generator is consumed inside the thread
    before returning — generators are NOT safe to pass across thread boundaries.
    """

    def __init__(self, model_size: str = "base", language: str = "pt") -> None:
        self._model_size = model_size
        self._language = language
        self._model: Optional[WhisperModel] = None

    def _load_model(self) -> WhisperModel:
        """Synchronous model load — called once, inside thread."""
        if self._model is None:
            logger.info(f"Carregando modelo Whisper '{self._model_size}'...")
            self._model = WhisperModel(
                self._model_size,
                device="auto",
                compute_type="default",
            )
        return self._model

    def _transcribe_sync(self, audio_path: str) -> str:
        """Synchronous transcription — must run inside a thread (not the event loop).

        Fully consumes the segments generator here before returning.
        Never return a generator across thread boundaries.
        """
        model = self._load_model()
        segments, _info = model.transcribe(
            audio_path,
            language=self._language,
            beam_size=5,
            vad_filter=True,  # Silero VAD: filters silence/background noise
        )
        # Consume generator inside thread — CRITICAL (see Pitfall 1)
        return " ".join(seg.text.strip() for seg in segments).strip()

    async def transcribe(self, audio_path: str) -> str:
        """Async wrapper — offloads blocking transcription to thread pool.

        Per ARCH-02: never blocks the main event loop.
        """
        return await asyncio.to_thread(self._transcribe_sync, audio_path)
```

### Pattern 2: Command Dispatch in the Text Loop

**What:** Intercept `/voice <path>` (and `> <path>`) before passing input to `session.send()`. Resolve the path, validate existence, call transcriber, print state messages, then forward transcript.

**When to use:** In `main_async()` inside the existing `while True` input loop, immediately after `user_input.strip()` checks.

**Example:**
```python
# src/jarvis/__main__.py — additions to main_async()
# Source: existing __main__.py patterns + D-02, D-08, D-09

import argparse
from pathlib import Path
from jarvis.core.voice import WhisperTranscriber

# In main_async(voice_mode: bool = False):
transcriber = WhisperTranscriber(
    model_size=settings.whisper_model,
    language=settings.whisper_language,
) if voice_mode else None

# Inside the while True loop, after exit/quit check:
if voice_mode and (
    user_input.strip().startswith("/voice ") or
    user_input.strip().startswith("> ")
):
    # Extract path from command
    if user_input.strip().startswith("/voice "):
        raw_path = user_input.strip()[7:].strip()
    else:
        raw_path = user_input.strip()[2:].strip()

    audio_path = Path(raw_path).resolve()
    if not audio_path.exists():
        console.print(f"[red][voz]: arquivo nao encontrado: {audio_path}[/red]")
        continue

    console.print(f"[dim][voz]: processando {audio_path.name}...[/dim]")
    try:
        transcript = await transcriber.transcribe(str(audio_path))
    except Exception as e:
        logger.warning(f"Transcricao falhou: {e}")
        console.print(f"[red][voz]: falha na transcricao — {e}[/red]")
        continue

    if not transcript:
        console.print("[yellow][voz]: audio sem fala detectada[/yellow]")
        continue

    console.print(f"[dim][transcricao]: \"{transcript}\"[/dim]")
    console.print("[bold cyan]JARVIS:[/bold cyan] ", end="")
    await session.send(transcript)   # D-09: enters session exactly as typed text
    continue
```

### Pattern 3: argparse Integration with asyncio

**What:** Parse `--voice` flag in synchronous `main()` before calling `asyncio.run()`. Pass the boolean into `main_async()` as a parameter.

**When to use:** Whenever a CLI flag must influence async behavior. Parse outside the event loop — argparse is synchronous.

**Example:**
```python
# src/jarvis/__main__.py — updated main()

def main() -> None:
    """Synchronous entry point — parse args, then run async main."""
    parser = argparse.ArgumentParser(
        prog="jarvis",
        description="JARVIS personal assistant"
    )
    parser.add_argument(
        "--voice",
        action="store_true",
        help="Ativa o modo de voz: use /voice <arquivo> para transcrever audio",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main_async(voice_mode=args.voice))
    except KeyboardInterrupt:
        pass
```

### Anti-Patterns to Avoid

- **Calling `model.transcribe()` directly in async code:** Blocks the event loop for the full transcription duration (seconds). Always use `asyncio.to_thread()`.
- **Returning the segments generator across thread boundaries:** `transcribe()` returns a lazy generator. If you pass it back to the async context and iterate there, you re-enter the thread implicitly and break the non-blocking contract. Consume it fully inside `_transcribe_sync`.
- **Loading WhisperModel at module import time:** Downloads model (~150 MB for `base`) at startup even for text-only users. Use lazy loading inside `WhisperTranscriber`.
- **Using `os.environ` directly for WHISPER_MODEL:** Violates project convention. Use `settings.whisper_model` from pydantic BaseSettings.
- **Calling `console.print()` for streamed LLM tokens:** Already established pattern — `print(token, end='', flush=True)`. The voice path follows same convention for the JARVIS response.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio file decoding (mp3, m4a, ogg) | Custom ffmpeg subprocess wrapper | faster-whisper + PyAV (bundled) | PyAV bundles ffmpeg libs — no system ffmpeg required. faster-whisper handles all format conversion internally. |
| Voice Activity Detection (silence filtering) | Manual amplitude threshold detector | `vad_filter=True` in faster-whisper | Silero VAD is built into faster-whisper 1.x — production-grade silence detection, zero extra code |
| Thread-pool management for blocking calls | Manual ThreadPoolExecutor lifecycle | `asyncio.to_thread()` | asyncio manages the default thread pool; to_thread() is idiomatic Python 3.9+, no boilerplate |
| Path resolution (relative vs. absolute) | String manipulation + os.getcwd() | `pathlib.Path(raw).resolve()` | Already in stdlib, handles both cases correctly on all platforms |
| Config fields for Whisper settings | os.environ reads | pydantic BaseSettings fields | Project convention established in Phase 1 — never read os.environ directly |

**Key insight:** faster-whisper bundles everything it needs (PyAV, Silero VAD, CTranslate2). The only integration work is the async wrapper and CLI wiring.

---

## Common Pitfalls

### Pitfall 1: Generator Consumed Outside Thread
**What goes wrong:** `asyncio.to_thread(model.transcribe, path)` returns a coroutine that resolves to `(segments_generator, info)`. If you `await` that and then iterate `segments_generator` in the async context, you're running Whisper inference back on the event loop thread — blocking it.

**Why it happens:** `WhisperModel.transcribe()` returns a *lazy generator*. The actual CTranslate2 inference runs during iteration, not during the `transcribe()` call itself.

**How to avoid:** In `_transcribe_sync`, call `model.transcribe()` AND exhaust the generator (join all segment texts) before returning the final string. Never return a generator from a `to_thread` function.

**Warning signs:** Event loop appears to hang only when voice command runs, not during the `transcribe()` call. "asyncio: [coroutine was never awaited]" warnings.

### Pitfall 2: First Transcription Latency Surprise
**What goes wrong:** User runs `/voice audio.wav` and JARVIS appears frozen for 5-30 seconds with no feedback. The model is downloading or loading for the first time.

**Why it happens:** WhisperModel lazily downloads the model (~150 MB for `base`) from Hugging Face Hub on first instantiation. Even if already downloaded, CTranslate2 model loading takes 2-5 seconds on CPU.

**How to avoid:** Print a loading message BEFORE calling `transcriber.transcribe()`. The state message `[voz]: processando audio.wav...` (D-08) must print before the `await`, not after.

**Warning signs:** No console output between `/voice` command and transcription result.

### Pitfall 3: Empty Transcript Passed to LLM
**What goes wrong:** Audio file contains only silence or background noise. Whisper transcribes nothing. An empty string `""` is forwarded to `session.send("")` — LLM receives empty input, wastes tokens, produces confused response.

**Why it happens:** `vad_filter=True` with very short audio or pure silence yields zero segments. Joining zero segments = empty string.

**How to avoid:** Check `if not transcript:` after transcription. Print `[voz]: audio sem fala detectada` and `continue` the loop without calling `session.send()`.

**Warning signs:** JARVIS responds to silence with confused or generic messages.

### Pitfall 4: `--voice` Flag Without argparse Breaks Existing Tests
**What goes wrong:** If `--voice` is read from `sys.argv` manually or via a module-level check, pytest's own argument parsing injects test paths into `sys.argv`, causing false positives or crashes.

**Why it happens:** pytest calls `main()` or imports `__main__` during test collection; `sys.argv` contains pytest's arguments.

**How to avoid:** Use `argparse.parse_args()` only inside `main()`, never at module level. Tests that exercise `main_async()` pass `voice_mode=False` directly. `__main__.py` is not imported by tests — it's invoked via `python -m jarvis`.

**Warning signs:** Tests crash with `error: unrecognized arguments: tests/test_voice.py`.

### Pitfall 5: WhisperModel Instantiation in Settings Validation
**What goes wrong:** If `WhisperTranscriber` is created at module import time or during `Settings()` construction, it triggers model download at import — slowing every test run.

**Why it happens:** pydantic validators run eagerly; module-level singletons instantiate on import.

**How to avoid:** Instantiate `WhisperTranscriber` inside `main_async()` only when `voice_mode=True`. Tests for `ChatSession` and `MemoryStore` never see the Whisper dependency.

**Warning signs:** `pip install` runs during test setup; first test run takes minutes.

### Pitfall 6: File Path With Spaces
**What goes wrong:** `/voice /home/user/my audio.wav` — the space in the filename is treated as a second argument by naive string splitting.

**Why it happens:** `user_input.strip()[7:].strip()` correctly captures the rest of the string including spaces — but only if parsing starts after the command prefix, not with `split()`.

**How to avoid:** Slice the string after the prefix (`/voice ` = 7 chars), not `split()[1]`. `Path(raw_path).resolve()` handles spaces correctly.

**Warning signs:** `FileNotFoundError` for valid paths containing spaces.

---

## Code Examples

Verified patterns from official sources:

### faster-whisper Basic Transcription (Official README)
```python
# Source: https://github.com/SYSTRAN/faster-whisper README
from faster_whisper import WhisperModel

model = WhisperModel("base", device="auto", compute_type="default")
segments, info = model.transcribe("audio.wav", language="pt", beam_size=5)

# segments is a GENERATOR — inference happens here during iteration
for segment in segments:
    print(segment.text)
```

### Async-safe Transcription via asyncio.to_thread
```python
# Source: Python 3.12 docs — asyncio.to_thread()
# https://docs.python.org/3/library/asyncio-task.html#asyncio.to_thread

import asyncio

async def transcribe_async(model, path: str, language: str) -> str:
    def _sync():
        segments, _ = model.transcribe(path, language=language, vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()  # consume generator here

    return await asyncio.to_thread(_sync)
```

### argparse with asyncio.run() (Python stdlib pattern)
```python
# Source: Python 3.12 docs — argparse + asyncio
import argparse, asyncio

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", action="store_true")
    args = parser.parse_args()
    asyncio.run(main_async(voice_mode=args.voice))

async def main_async(voice_mode: bool = False) -> None:
    ...  # voice_mode flows in as parameter, never read from sys.argv inside
```

### Settings Extension (pydantic BaseSettings pattern — existing project)
```python
# Source: existing src/jarvis/config.py pattern — extending with Whisper fields
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # ... existing fields ...

    # Voice pipeline (Phase 3)
    whisper_model: str = Field(default="base")       # WHISPER_MODEL in .env
    whisper_language: str = Field(default="pt")      # WHISPER_LANGUAGE in .env
    voice_input_dir: str = Field(default="data/voice_input")  # VOICE_INPUT_DIR in .env
```

### VAD Filter Usage (faster-whisper built-in Silero VAD)
```python
# Source: https://github.com/SYSTRAN/faster-whisper README
segments, info = model.transcribe(
    "audio.wav",
    language="pt",
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 500},  # optional tuning
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| openai/whisper (PyTorch) | faster-whisper (CTranslate2) | 2022-2023 | 4x speedup, int8 CPU support, no system ffmpeg dependency |
| Manual silence detection | `vad_filter=True` (Silero VAD built-in) | faster-whisper 0.5+ | Zero-code VAD — just pass the flag |
| asyncio.get_event_loop().run_in_executor() | asyncio.to_thread() | Python 3.9 | Simpler API, same thread pool semantics |
| model download on instantiation | Automatic from HuggingFace Hub | Ongoing | Model cached in ~/.cache/huggingface after first use |

**Deprecated/outdated:**
- `openai/whisper`: PyTorch-based, 4x slower, no int8 quantization — CLAUDE.md explicitly forbids it
- `RealtimeSTT`: Higher-level wrapper around faster-whisper for mic capture — not needed here (no mic capture in Phase 3)
- `pyttsx3` / `kokoro` for TTS: Out of scope for this phase

---

## Open Questions

1. **faster-whisper model download in restricted environments**
   - What we know: Model downloads from HuggingFace Hub on first use; cached in `~/.cache/huggingface`
   - What's unclear: Offline/air-gapped environments may fail silently on first transcription
   - Recommendation: Plan Wave 0 test to download base model explicitly. Consider `local_files_only=True` fallback path documentation.

2. **VAD filter false-positive on short Portuguese utterances**
   - What we know: `vad_filter=True` uses Silero VAD; tunable via `vad_parameters`
   - What's unclear: Default thresholds may drop short commands ("abrir Spotify") if preceded by silence
   - Recommendation: Default `vad_parameters={"min_silence_duration_ms": 500}` — test with short clips in Wave 2 manual smoke test

3. **`compute_type="default"` on this Linux machine (no GPU detected)**
   - What we know: `device="auto"` falls back to CPU; `compute_type="default"` picks int8 on CPU for faster-whisper 1.x
   - What's unclear: int8 vs float32 behavior on this specific CPU
   - Recommendation: Accept default; note in test that first transcription may be 3-10 seconds on `base` model with CPU

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| Python 3.12 | Runtime | ✓ | 3.12.3 | — |
| pip | Package install | ✓ | 24.0 | — |
| faster-whisper | STT / CONV-02 | ✗ (not installed) | — | Must install: `pip install faster-whisper==1.2.1` |
| ffmpeg (system) | Audio decode | Not required | — | PyAV bundled in faster-whisper — system ffmpeg NOT needed |
| espeak-ng | TTS (kokoro) | Not required | — | TTS is out of scope for Phase 3 |
| GPU/CUDA | faster-whisper acceleration | Unknown | — | device="auto" falls back to CPU; base model is acceptable |

**Missing dependencies with no fallback:**
- `faster-whisper==1.2.1` — must be installed before any voice functionality can run. Wave 0 plan must include `pip install faster-whisper==1.2.1`.

**Missing dependencies with fallback:**
- None — system ffmpeg is not needed (PyAV bundled).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` — `[tool.pytest.ini_options]` asyncio_mode = "auto" |
| Quick run command | `PYTHONPATH=src pytest tests/test_voice.py -x` |
| Full suite command | `PYTHONPATH=src pytest tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-02 | `/voice <path>` transcribes audio and forwards transcript to session.send() | unit (mock WhisperTranscriber) | `PYTHONPATH=src pytest tests/test_voice.py::test_voice_command_dispatches_to_session -x` | ❌ Wave 0 |
| CONV-02 | Relative and absolute paths both resolve correctly | unit | `PYTHONPATH=src pytest tests/test_voice.py::test_path_resolution -x` | ❌ Wave 0 |
| CONV-02 | Non-existent file prints error and continues loop | unit | `PYTHONPATH=src pytest tests/test_voice.py::test_missing_file_error -x` | ❌ Wave 0 |
| CONV-02 | Empty transcript (silent audio) skips session.send() | unit (mock transcriber returns "") | `PYTHONPATH=src pytest tests/test_voice.py::test_empty_transcript_skipped -x` | ❌ Wave 0 |
| CONV-04 | State messages printed in correct order: processando → transcrição → JARVIS | unit (capture console output) | `PYTHONPATH=src pytest tests/test_voice.py::test_state_messages_order -x` | ❌ Wave 0 |
| ARCH-02 | transcribe() does not block event loop — completes as awaitable | unit (asyncio.to_thread mock) | `PYTHONPATH=src pytest tests/test_voice.py::test_transcribe_is_non_blocking -x` | ❌ Wave 0 |
| ARCH-02 | WhisperTranscriber.transcribe() is awaitable (coroutine) | unit | `PYTHONPATH=src pytest tests/test_voice.py::test_transcribe_returns_coroutine -x` | ❌ Wave 0 |
| CONV-03 | Deferred — TTS is client responsibility | manual-only | N/A — out of scope | N/A |
| CONV-05 | Deferred — wake word is client responsibility | manual-only | N/A — out of scope | N/A |

**Note on CONV-03 and CONV-05:** Per CONTEXT.md, these requirements are satisfied at the infrastructure level (STT contract + client contract) and formally deferred to client layer. The planner should document this in the plan's verification section.

### Sampling Rate
- **Per task commit:** `PYTHONPATH=src pytest tests/test_voice.py -x`
- **Per wave merge:** `PYTHONPATH=src pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_voice.py` — covers CONV-02 (command dispatch, path resolution, missing file, empty transcript), CONV-04 (state messages), ARCH-02 (non-blocking, awaitable)
- [ ] `src/jarvis/core/voice.py` — WhisperTranscriber class must exist before tests import it
- [ ] faster-whisper install: `pip install faster-whisper==1.2.1` — required before any voice test runs (mock in unit tests avoids actual model load)
- [ ] `pyproject.toml` dependency update: add `faster-whisper==1.2.1` to `[project.dependencies]`

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives are binding. The planner MUST verify all plans comply:

| Directive | Enforcement |
|-----------|-------------|
| `faster-whisper 1.2.1` — mandated STT library | Use exactly this version. Never use `openai/whisper`, `SpeechRecognition`, or cloud STT. |
| `sounddevice` for mic capture | Not needed in Phase 3 (no mic capture). Skip. |
| Multi-LLM: every LLM call via abstraction layer | No change — ChatSession.send() already handles this. |
| Multiplataforma: OS-specific code isolated | WhisperTranscriber has no OS-specific code — faster-whisper is cross-platform. |
| Privacidade: audio never to cloud | faster-whisper is offline. No network call in transcription path. |
| Configuração via `.env` + pydantic BaseSettings | WHISPER_MODEL, WHISPER_LANGUAGE read from Settings singleton. Never `os.environ` direct. |
| Token streaming: `print(token, end='', flush=True)` — Rich forbidden on output path | Voice path calls `session.send()` which already follows this. State messages (`[voz]`, `[transcrição]`) use `console.print()` — these are system messages, not token output. This is compliant. |
| `AgentExecutor` / `initialize_agent()` forbidden | Phase 3 adds no new agent layer. Not applicable. |
| GSD workflow before file edits | Enforced at orchestration level. |
| Commit messages: Conventional Commits + emoji | Enforced at commit time. |

---

## Sources

### Primary (HIGH confidence)
- [SYSTRAN/faster-whisper GitHub README](https://github.com/SYSTRAN/faster-whisper) — WhisperModel API, vad_filter, segments generator laziness, PyAV bundling, model size names
- [faster-whisper transcribe.py source](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) — Complete method signatures, Segment dataclass fields, TranscriptionInfo
- [Python 3.12 asyncio.to_thread() docs](https://docs.python.org/3/library/asyncio-task.html#asyncio.to_thread) — correct pattern for offloading blocking calls
- PyPI `pip index versions faster-whisper` — confirmed 1.2.1 is latest (verified 2026-04-04)
- Existing codebase: `src/jarvis/__main__.py`, `src/jarvis/core/session.py`, `src/jarvis/config.py` — integration constraints verified by direct code read

### Secondary (MEDIUM confidence)
- [faster-whisper GitHub Issue #1207](https://github.com/SYSTRAN/faster-whisper/issues/1207) — thread-safety analysis; conclusion: non-determinism is parameter-driven, not a concurrency bug; temperature=0 yields deterministic results
- [modal.com: Choosing Whisper variants](https://modal.com/blog/choosing-whisper-variants) — 4x speedup claim verification, technical benchmark

### Tertiary (LOW confidence)
- WebSearch: asyncio.to_thread + faster-whisper pattern — multiple sources agree on the to_thread() approach; MEDIUM confidence after cross-reference with official asyncio docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against PyPI, API verified from source code and README
- Architecture: HIGH — asyncio.to_thread() is documented Python stdlib pattern; integration with existing code verified by direct read
- Pitfalls: HIGH (generator pitfall is documented in faster-whisper source); MEDIUM (VAD false-positive is speculative)
- Environment: HIGH — pip index versions run live; system checked for ffmpeg/espeak

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable library — faster-whisper has no active breaking changes expected)
