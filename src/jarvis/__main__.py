"""Entry point for `python -m jarvis` and the `jarvis` CLI command.

Wires together startup validation, LLM creation, capability detection,
banner display, and the streaming conversation loop.

Per D-14: ASCII banner + status block shown at startup.
Per D-01: Rich-styled prompt for user input.
Per D-02/D-03: Rich used ONLY for prompt label and system messages —
               NEVER on the streamed token output (plain print() in session.py).
Per D-04: Exit via 'exit', 'quit', or Ctrl+C.
Per D-15: Error messages in Portuguese handled by startup.py.
Per D-01 (voice): --voice flag activates voice mode.
Per D-02 (voice): /voice <path> or > <path> commands trigger transcription.
Per D-08: State messages as simple terminal text (processando, transcricao, errors).
Per D-09: Transcript forwarded to session.send() identically to typed text.
"""

import argparse
import asyncio
import os
from pathlib import Path

from loguru import logger
from rich.console import Console
from rich.prompt import Prompt

from jarvis.config import settings
from jarvis.llm.factory import create_llm
from jarvis.llm.capabilities import detect_capabilities
from jarvis.core.startup import validate_versions, validate_lm_studio_reachable
from jarvis.core.session import ChatSession
from jarvis.core.tts import KokoroTTS
from jarvis.core.voice import WhisperTranscriber
from jarvis.memory.store import MemoryStore
from jarvis.memory.vectors import MemoryVectors


console = Console()


def show_banner(caps=None) -> None:
    """Display startup banner per D-14: ASCII art + provider status block."""
    console.print("\n[bold cyan]╔══════════════════════════════════════╗[/bold cyan]")
    console.print("[bold cyan]║         J.A.R.V.I.S.  v0.1.0        ║[/bold cyan]")
    console.print("[bold cyan]╚══════════════════════════════════════╝[/bold cyan]\n")

    console.print(f"  [dim]Provider:[/dim]  [bold]{settings.llm_provider}[/bold]")
    model_name = settings.lm_studio_model or settings.llm_model or "(default)"
    console.print(f"  [dim]Model:[/dim]     [bold]{model_name}[/bold]")

    if caps:
        tools_str = "[green]sim[/green]" if caps.tool_calling else "[red]nao[/red]"
        vision_str = "[green]sim[/green]" if caps.vision else "[red]nao[/red]"
        ctx_str = str(caps.context_window) if caps.context_window else "desconhecido"
        console.print(f"  [dim]Ferramentas:[/dim] {tools_str}")
        console.print(f"  [dim]Visao:[/dim]     {vision_str}")
        console.print(f"  [dim]Contexto:[/dim]  [bold]{ctx_str}[/bold]")

    console.print()


async def main_async(voice_mode: bool = False) -> None:
    """Async main — startup validation, LLM init, banner, conversation loop."""
    # ARCH-04: Validate dependency versions
    validate_versions()

    # ARCH-04: Validate LM Studio reachability (only for lmstudio provider)
    if settings.llm_provider == "lmstudio":
        validate_lm_studio_reachable(settings.lm_studio_url)

    # LLM-01: Create LLM via factory (multi-LLM abstraction — never hardcoded provider)
    llm = create_llm()

    # LLM-02: Detect capabilities for banner (heuristic, no LLM call per D-16)
    caps = None
    model_id = settings.lm_studio_model or settings.llm_model
    if model_id:
        caps = detect_capabilities(settings.lm_studio_url, model_id)

    # D-14: Show banner with provider, model, and capabilities
    show_banner(caps)

    # Ensure data directories exist (Pitfall 6)
    os.makedirs(os.path.dirname(settings.sqlite_path) or ".", exist_ok=True)
    os.makedirs(settings.chroma_path, exist_ok=True)

    # MEM-01/MEM-02: Initialize memory subsystem
    db = MemoryStore(settings.sqlite_path)
    vectors = MemoryVectors(settings.chroma_path)

    # Context window from capabilities (may be None -- session handles fallback)
    ctx_window = caps.context_window if caps else None

    # CONV-01: Create session with full memory pipeline wired
    session = ChatSession(llm, db=db, vectors=vectors, context_window=ctx_window)
    console.print("[dim]Digite 'exit' ou 'quit' para sair. Ctrl+C tambem funciona.[/dim]\n")

    # CONV-02: Initialize voice transcriber only in voice mode (lazy — no model load yet)
    transcriber = None
    if voice_mode:
        transcriber = WhisperTranscriber(
            model_size=settings.whisper_model,
            language=settings.whisper_language,
        )
        console.print("[dim]Modo voz ativo. Use /voice <arquivo> ou > <arquivo> para transcrever audio.[/dim]")

    # CONV-03: Initialize TTS for voice responses (lazy — model loads on first speak())
    tts = None
    if voice_mode and settings.tts_enabled:
        tts = KokoroTTS(
            voice=settings.tts_voice,
            lang=settings.tts_lang,
        )
        console.print("[dim]TTS ativo (kokoro). JARVIS responde por voz.[/dim]")

    try:
        while True:
            try:
                # D-01: Rich-styled prompt
                user_input = Prompt.ask("[bold green]Voce[/bold green]")
            except (KeyboardInterrupt, EOFError):
                # D-04: Ctrl+C or EOF exits gracefully
                console.print("\n[dim]Encerrando...[/dim]")
                break

            if not user_input.strip():
                continue

            # D-04: exit/quit keywords exit gracefully
            if user_input.strip().lower() in ("exit", "quit"):
                console.print("[dim]Ate logo![/dim]")
                break

            # CONV-02: Voice command dispatch — /voice <path> or > <path>
            if transcriber and (
                user_input.strip().startswith("/voice ")
                or user_input.strip().startswith("> ")
            ):
                # Extract path — slice after prefix, not split() (Pitfall 6: spaces in paths)
                stripped = user_input.strip()
                if stripped.startswith("/voice "):
                    raw_path = stripped[7:].strip()
                else:
                    raw_path = stripped[2:].strip()

                if not raw_path:
                    console.print("[red][voz]: caminho do arquivo nao informado[/red]")
                    continue

                audio_path = Path(raw_path).resolve()

                # D-08: State message — processando (before await, per Pitfall 2)
                console.print(f"[dim][voz]: processando {audio_path.name}...[/dim]")

                try:
                    transcript = await transcriber.transcribe(str(audio_path))
                except FileNotFoundError:
                    console.print(f"[red][voz]: arquivo nao encontrado: {audio_path}[/red]")
                    continue
                except Exception as e:
                    logger.warning(f"Transcricao falhou: {e}")
                    console.print(f"[red][voz]: falha na transcricao — {e}[/red]")
                    continue

                # Pitfall 3: Empty transcript means silence — skip session.send()
                if not transcript:
                    console.print("[yellow][voz]: audio sem fala detectada[/yellow]")
                    continue

                # D-08: State message — transcricao result
                console.print(f'[dim][transcricao]: "{transcript}"[/dim]')

                # D-09: Forward transcript to session exactly as typed text
                console.print("[bold cyan]JARVIS:[/bold cyan] ", end="")
                response = await session.send(transcript)
                # CONV-03: Speak response sentence by sentence (SC2 streaming)
                if tts and response:
                    console.print("\n[dim][falando]...[/dim]")
                    await tts.speak(response)
                continue

            # D-03: Rich label for JARVIS, then plain streaming output (D-02)
            console.print("[bold cyan]JARVIS:[/bold cyan] ", end="")
            response = await session.send(user_input)
            # CONV-03: Speak response in voice mode (even for text-typed input)
            if tts and response:
                console.print("\n[dim][falando]...[/dim]")
                await tts.speak(response)
    finally:
        await session.save()
        db.close()
        console.print("[dim]Memorias salvas.[/dim]")


def main() -> None:
    """Synchronous entry point — parse args, then run async main."""
    parser = argparse.ArgumentParser(
        prog="jarvis",
        description="JARVIS — Just A Rather Very Intelligent System",
    )
    parser.add_argument(
        "--voice",
        action="store_true",
        help="Ativa modo voz: use /voice <arquivo> para transcrever audio",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main_async(voice_mode=args.voice))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
