# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "jarvis-desktop @ .",
#   "kokoro>=0.9.4",
#   # kokoclone: not on PyPI — install manually: pip install git+https://github.com/Ashish-Patnaik/kokoclone
#   "librosa>=0.10.0",
#   "torch>=2.0.0",
#   "soundfile>=0.12.0",
#   "rich>=13.0",
#   "pydantic>=2.7.0",
#   "python-dotenv>=1.0.0",
# ]
# ///
"""Clone a voice from reference audio file and save to JARVIS voice profile.

Standalone PEP 723 script — runs without full desktop-py environment.
Uses KokoClone ECAPA-TDNN encoder to extract speaker embedding from 3-30 seconds
of reference audio, saved as ~/.jarvis/voices/cloned_voice.pt.

Usage:
  uv run apps/desktop-py/tools/clone_voice.py reference.wav
  uv run apps/desktop-py/tools/clone_voice.py reference.mp3 --output ~/custom.pt

Requirements:
  uv 0.4+ (PEP 723 inline deps support)
  Python 3.10+
  Reference audio: .wav, .mp3, .m4a, .ogg (3-30 seconds recommended)

After cloning, activate the voice in JARVIS:
  1. Run JARVIS: jd
  2. Type /config
  3. Select "Voz clonada" and enter the path shown after cloning
"""
import argparse
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_JARVIS_DIR = Path.home() / ".jarvis"
_VOICES_DIR = _JARVIS_DIR / "voices"
_DEFAULT_OUTPUT = str(_VOICES_DIR / "cloned_voice.pt")


def clone_voice(reference_audio: str, output_path: str = _DEFAULT_OUTPUT) -> str:
    """Clone voice from reference audio file.

    Validates audio duration, extracts ECAPA-TDNN speaker embedding,
    and saves .pt profile to output_path.

    Args:
        reference_audio: Path to .wav, .mp3, .m4a, etc. (3-30s recommended)
        output_path: Destination .pt file (default: ~/.jarvis/voices/cloned_voice.pt)

    Returns:
        str: Absolute path to saved cloned_voice.pt

    Raises:
        SystemExit: On file not found or encoder failure
    """
    from rich.console import Console
    console = Console()

    # Validate file exists
    ref_path = Path(reference_audio)
    if not ref_path.exists():
        console.print(f"[red]ERRO: Arquivo nao encontrado: {reference_audio}[/red]")
        sys.exit(1)

    # Lazy imports — heavy deps
    from jarvis_desktop.voice_cloning import (
        validate_reference_audio,
        extract_speaker_embedding,
        save_cloned_voice,
    )

    # Validate duration (warn but continue — D-02: user controls)
    console.print(f"[cyan]Verificando audio: {reference_audio}[/cyan]")
    is_long_enough = validate_reference_audio(reference_audio, min_duration_sec=3.0)
    if not is_long_enough:
        console.print("[yellow]Aviso: duracao minima recomendada e 3 segundos. Continuando...[/yellow]")

    # Extract speaker embedding
    console.print("[cyan]Extraindo perfil de voz (ECAPA-TDNN)...[/cyan]")
    console.print("[dim]Isso pode levar 5-30 segundos na primeira execucao (download de modelo).[/dim]")
    try:
        embedding = extract_speaker_embedding(reference_audio, device="cpu")
    except Exception as exc:
        console.print(f"[red]ERRO ao extrair embedding: {exc}[/red]")
        sys.exit(1)

    # Save profile — use save_cloned_voice for default path; torch.save for custom
    out = Path(output_path).expanduser()
    console.print(f"[cyan]Salvando perfil em: {out}[/cyan]")

    out_dir = out.parent
    out_name = out.name

    if str(out_dir) == str(_VOICES_DIR):
        # Default path — use save_cloned_voice (creates dirs, logs)
        saved = save_cloned_voice(embedding, name=out_name)
    else:
        # Custom path — create dir and save directly
        import torch
        out_dir.mkdir(parents=True, exist_ok=True)
        torch.save(embedding, str(out))
        saved = str(out)

    console.print(f"[green]Voz clonada com sucesso![/green]")
    console.print(f"[green]Perfil salvo em: {saved}[/green]")
    console.print()
    console.print("[dim]Para ativar no JARVIS:[/dim]")
    console.print(f"[dim]  1. Execute: jd[/dim]")
    console.print(f"[dim]  2. Digite: /config[/dim]")
    console.print(f"[dim]  3. Selecione 'Voz clonada' e informe: {saved}[/dim]")

    return saved


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Clona voz de arquivo de audio de referencia para uso no JARVIS.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  uv run apps/desktop-py/tools/clone_voice.py minha_voz.wav
  uv run apps/desktop-py/tools/clone_voice.py gravacao.mp3 --output ~/minha_voz.pt

Requisitos de qualidade:
  - Minimo: 3 segundos
  - Recomendado: 5-10 segundos com fala natural
  - Ideal: 10-30 segundos com variacao de entonacao
  - Formatos: .wav, .mp3, .m4a, .ogg
        """,
    )
    parser.add_argument(
        "reference",
        help="Caminho para o arquivo de audio de referencia (.wav, .mp3, etc.)",
    )
    parser.add_argument(
        "--output",
        default=_DEFAULT_OUTPUT,
        help=f"Caminho de saida para o perfil .pt (padrao: {_DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()
    clone_voice(args.reference, args.output)
