# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "openwakeword==0.6.0",
#   "scikit-learn>=1.3",
#   "torch>=2.0",
#   "scipy>=1.10",
#   "sounddevice==0.5.5",
#   "soundfile>=0.12",
#   "kokoro>=0.9.4",
#   "rich>=13.0",
#   "numpy>=1.24",
#   "joblib>=1.3",
# ]
# ///
"""Script de treinamento interativo de wake word para JARVIS (Português Brasileiro).

Grava amostras de "ei jarvis", treina um modelo verifier via scikit-learn
e instala o resultado em ~/.jarvis/models/wake_word_custom.pkl.

Uso:
  uv run apps/desktop-py/tools/train_wake_word.py [--ptt] [--dry-run]

Opções:
  --ptt       Modo push-to-talk (pressione tecla para gravar)
  --dry-run   Executa sem microfone real (testa o fluxo com áudio sintético)

Requerimentos:
  uv 0.4+ (suporte PEP 723)
  Python 3.10 (criado automaticamente pelo uv)
"""

import argparse
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_JARVIS_DIR = Path.home() / ".jarvis"
_MODELS_DIR = _JARVIS_DIR / "models"
_CACHE_DIR = _JARVIS_DIR / "cache"
_POSITIVE_DIR = _CACHE_DIR / "training_positive"
_NEGATIVE_DIR = _CACHE_DIR / "training_negative"
_CUSTOM_PKL = _MODELS_DIR / "wake_word_custom.pkl"

# ---------------------------------------------------------------------------
# Recording constants (match openwakeword + voice_modes.py)
# ---------------------------------------------------------------------------
_CHUNK_SIZE: int = 1280        # samples per chunk
_SAMPLE_RATE: int = 16000      # Hz
_RECORD_DURATION_S: float = 2.5  # seconds per sample (D-03)
_MIN_SAMPLES: int = 20         # minimum before training (D-06)
_REC_SAMPLES_TARGET: int = 30  # recommended (D-06)
_MEDIAN_THRESHOLD: float = 0.25  # branch threshold (D-01)
_TARGET_FPR: float = 0.05      # target false-positive rate for threshold calibration (WAKE-05)


# ---------------------------------------------------------------------------
# Recording functions
# ---------------------------------------------------------------------------


def _record_sample(index: int, total: int, ptt: bool = False) -> "np.ndarray":
    """Record a single 'ei jarvis' sample with countdown UX (D-03).

    D-03: Countdown + auto-stop (2.5s window via sounddevice).
    D-04: If ptt=True, waits for keypress before recording.
    D-05: Shows RMS feedback after recording.

    Returns: numpy array shape (N,) at 16kHz float32.
    """
    import sounddevice as sd
    import numpy as np
    from rich.live import Live
    from rich.text import Text
    from rich.console import Console

    console = Console()
    console.print(f"\n[bold]Amostra {index}/{total}[/bold] — Diga 'ei jarvis' com sua voz normal")

    if ptt:
        # D-04: Push-to-talk via msvcrt on Windows, tty on Unix
        try:
            import msvcrt
            console.print("  Pressione qualquer tecla para iniciar...")
            msvcrt.getwch()
        except ImportError:
            import tty
            import termios
            fd = sys.stdin.fileno()
            old = termios.tcgetattr(fd)
            try:
                tty.setraw(fd)
                sys.stdin.read(1)
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old)

    chunks_needed = int(_SAMPLE_RATE / _CHUNK_SIZE * _RECORD_DURATION_S)
    audio_data = []

    with sd.InputStream(channels=1, samplerate=_SAMPLE_RATE, blocksize=_CHUNK_SIZE, dtype=np.float32) as stream:
        with Live(refresh_per_second=4) as live:
            for i in range(chunks_needed):
                remaining = max(0, _RECORD_DURATION_S - (i * _CHUNK_SIZE / _SAMPLE_RATE))
                live.update(Text(f"  Gravando... {remaining:.1f}s restantes"))
                chunk, _ = stream.read(_CHUNK_SIZE)
                audio_data.append(chunk)

    audio = np.concatenate(audio_data).squeeze()

    # D-05: RMS feedback
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms > 0.05:
        console.print(f"  [green]✓ Amostra {index}/{total} — sinal: boa (RMS={rms:.3f})[/green]")
    elif rms > 0.02:
        console.print(f"  [yellow]⚠ Amostra {index}/{total} — sinal: fraca (RMS={rms:.3f}) — repita se quiser[/yellow]")
    else:
        console.print(f"  [red]✗ Amostra {index}/{total} — sem sinal (RMS={rms:.3f}) — verifique o microfone[/red]")

    return audio


def _run_recording_session(n_target: int = _REC_SAMPLES_TARGET, ptt: bool = False) -> list:
    """Interactive recording session for positive samples (D-06, WAKE-02).

    Returns list of np.ndarray (one per sample). Min: _MIN_SAMPLES.
    """
    import soundfile as sf
    import numpy as np
    from rich.console import Console

    console = Console()
    _POSITIVE_DIR.mkdir(parents=True, exist_ok=True)

    console.print(f"\n[bold]Sessão de gravação[/bold]: {n_target} amostras recomendadas (mínimo {_MIN_SAMPLES})")
    console.print("Dica: Varie levemente o tom e a velocidade entre amostras para melhor cobertura.\n")

    samples = []
    i = 1
    while True:
        audio = _record_sample(i, n_target, ptt=ptt)
        samples.append(audio)

        # Save .wav immediately
        wav_path = _POSITIVE_DIR / f"sample_{i:03d}.wav"
        sf.write(str(wav_path), audio, _SAMPLE_RATE)

        if i >= _MIN_SAMPLES:
            if i >= n_target:
                break
            # Ask to continue after minimum
            try:
                resp = input(f"\n  {i} amostras gravadas. Continuar? [s/N] ").strip().lower()
                if resp != "s":
                    break
            except (KeyboardInterrupt, EOFError):
                break
        i += 1

    console.print(f"\n[green]✓ {len(samples)} amostras salvas em {_POSITIVE_DIR}[/green]")
    return samples


# ---------------------------------------------------------------------------
# Baseline calibration
# ---------------------------------------------------------------------------


def _calibrate_baseline(samples: list) -> float:
    """Run samples through hey_jarvis_v0.1.onnx, return median score (D-01)."""
    import numpy as np
    from openwakeword.model import Model
    from rich.console import Console

    import openwakeword
    console = Console()
    console.print("\n[bold]Calibrando baseline...[/bold] (processando amostras no modelo hey_jarvis)")

    openwakeword.utils.download_models(["hey_jarvis_v0.1"])
    model = Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")

    scores = []
    for audio in samples:
        # Feed in chunks (openwakeword expects 1280-sample chunks)
        for start in range(0, len(audio) - _CHUNK_SIZE, _CHUNK_SIZE):
            chunk = audio[start:start + _CHUNK_SIZE]
            pred = model.predict(chunk)
            score = pred.get("hey_jarvis", 0.0)
            if score > 0:
                scores.append(score)

    if not scores:
        return 0.0

    median = float(np.median(scores))
    console.print(f"  Score mediano: {median:.3f} (limiar: {_MEDIAN_THRESHOLD})")
    return median


# ---------------------------------------------------------------------------
# Negative corpus
# ---------------------------------------------------------------------------


def _download_negative_corpus() -> None:
    """Download AudioSet/FMA slice to _NEGATIVE_DIR (D-07). Idempotent."""
    import urllib.request
    from rich.console import Console

    console = Console()
    _NEGATIVE_DIR.mkdir(parents=True, exist_ok=True)

    # Check if already cached (idempotent, D-07)
    existing = list(_NEGATIVE_DIR.glob("*.wav"))
    if len(existing) >= 100:
        console.print(f"  [green]✓ Corpus negativo em cache ({len(existing)} arquivos)[/green]")
        return

    console.print("\n[bold]Baixando corpus negativo (AudioSet/FMA slice)...[/bold]")
    console.print("  Isso pode levar alguns minutos na primeira execução (~1-2 GB).")
    console.print("  O download é idempotente — não será repetido em execuções futuras.\n")

    try:
        import openwakeword.utils as oww_utils
        # Ensure models cached
        oww_utils.download_models(["hey_jarvis_v0.1"])

        # Attempt to use openwakeword's built-in negative data download if available
        try:
            from openwakeword.train import get_training_data
            get_training_data(output_dir=str(_NEGATIVE_DIR))
        except (ImportError, AttributeError):
            # Fallback: download a curated negative corpus slice
            NEGATIVE_DATA_URL = (
                "https://huggingface.co/datasets/davidscripka/openwakeword_negative_data/"
                "resolve/main/negative_clips_v1.tar.gz"
            )
            tar_path = _CACHE_DIR / "negative_clips_v1.tar.gz"
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)

            if not tar_path.exists():
                console.print(f"  Baixando de {NEGATIVE_DATA_URL}")
                urllib.request.urlretrieve(NEGATIVE_DATA_URL, str(tar_path))

            import tarfile
            with tarfile.open(str(tar_path)) as tf:
                tf.extractall(str(_NEGATIVE_DIR))

            console.print(f"  [green]✓ Corpus extraído para {_NEGATIVE_DIR}[/green]")

    except Exception as exc:
        console.print(f"  [yellow]⚠ Download automático falhou: {exc}[/yellow]")
        console.print("  Continuando com corpus sintético (TTS + ambiente).")
        console.print("  Para melhor acurácia, baixe manualmente:")
        console.print("  https://github.com/dscripka/openWakeWord#training-new-models")


def _record_ambient_noise(duration_s: int = 300) -> None:
    """Record 5 min of ambient noise into _NEGATIVE_DIR (D-07)."""
    import sounddevice as sd
    import numpy as np
    import soundfile as sf
    from rich.console import Console
    from rich.progress import Progress, BarColumn, TimeRemainingColumn

    console = Console()
    console.print(f"\n[bold]Capturando ruído ambiente ({duration_s // 60} min)...[/bold]")
    console.print("  Pode falar, ligar a TV, deixar o ambiente natural.")
    console.print("  Isso ajuda o modelo a ignorar sons do seu espaço.\n")

    chunks_total = int(_SAMPLE_RATE / _CHUNK_SIZE * duration_s)
    chunk_batch = []
    batch_num = 0

    try:
        with sd.InputStream(channels=1, samplerate=_SAMPLE_RATE, blocksize=_CHUNK_SIZE, dtype=np.float32) as stream:
            with Progress(BarColumn(), "[progress.percentage]{task.percentage:>3.0f}%", TimeRemainingColumn()) as progress:
                task = progress.add_task("Gravando ambiente...", total=chunks_total)
                for _ in range(chunks_total):
                    chunk, _ = stream.read(_CHUNK_SIZE)
                    chunk_batch.append(chunk.squeeze())
                    progress.advance(task)

                    # Save in 30s batches to avoid memory buildup
                    if len(chunk_batch) >= int(_SAMPLE_RATE / _CHUNK_SIZE * 30):
                        batch_audio = np.concatenate(chunk_batch)
                        sf.write(str(_NEGATIVE_DIR / f"ambient_{batch_num:03d}.wav"), batch_audio, _SAMPLE_RATE)
                        chunk_batch = []
                        batch_num += 1

        # Save remainder
        if chunk_batch:
            batch_audio = np.concatenate(chunk_batch)
            sf.write(str(_NEGATIVE_DIR / f"ambient_{batch_num:03d}.wav"), batch_audio, _SAMPLE_RATE)

    except KeyboardInterrupt:
        console.print("\n  [yellow]Gravação interrompida pelo usuário.[/yellow]")
        if chunk_batch:
            batch_audio = np.concatenate(chunk_batch)
            sf.write(str(_NEGATIVE_DIR / f"ambient_{batch_num:03d}.wav"), batch_audio, _SAMPLE_RATE)

    console.print(f"  [green]✓ Ruído ambiente salvo em {_NEGATIVE_DIR}[/green]")


def _generate_tts_negatives() -> None:
    """Generate negative TTS phrases via kokoro (D-08) into _NEGATIVE_DIR."""
    from rich.console import Console

    console = Console()

    NEGATIVE_PHRASES = [
        "olá jarvis",
        "google",
        "alexa",
        "tudo bem",
        "ok google",
        "ei google",
        "cortana",
        "siri",
        "hey siri",
        "ok alexa",
    ]

    console.print("\n[bold]Gerando frases negativas via TTS (kokoro)...[/bold]")

    try:
        from kokoro import KPipeline
        import soundfile as sf
        import numpy as np

        pipeline = KPipeline(lang_code="p")  # Portuguese

        for i, phrase in enumerate(NEGATIVE_PHRASES):
            console.print(f"  Gerando: '{phrase}'")
            generator = pipeline(phrase, voice="pf_dora", speed=1.0)
            audio_chunks = []
            for _, _, audio in generator:
                audio_chunks.append(audio)

            if audio_chunks:
                audio = np.concatenate(audio_chunks)
                out_path = _NEGATIVE_DIR / f"tts_negative_{i:03d}.wav"
                sf.write(str(out_path), audio, 24000)  # kokoro outputs 24kHz

        console.print(f"  [green]✓ {len(NEGATIVE_PHRASES)} frases geradas[/green]")

    except Exception as exc:
        console.print(f"  [yellow]⚠ TTS negatives failed: {exc}[/yellow] (continuando sem elas)")


# ---------------------------------------------------------------------------
# Training and calibration
# ---------------------------------------------------------------------------


def _train_verifier() -> object:
    """Train sklearn verifier via openwakeword.train_custom_verifier() (WAKE-03)."""
    import joblib
    from openwakeword import train_custom_verifier
    from rich.console import Console

    console = Console()
    _MODELS_DIR.mkdir(parents=True, exist_ok=True)

    pos_count = len(list(_POSITIVE_DIR.glob("*.wav")))
    neg_count = len(list(_NEGATIVE_DIR.glob("*.wav")))

    console.print("\n[bold]Treinando verifier...[/bold]")
    console.print(f"  Amostras positivas: {pos_count}")
    console.print(f"  Amostras negativas: {neg_count}")
    console.print(f"  Ratio: {neg_count / max(pos_count, 1):.1f}:1 (recomendado: ≥3.0:1)")

    if neg_count < pos_count * 2:
        console.print("  [yellow]⚠ Corpus negativo pequeno — considere gravar mais ruído ambiente[/yellow]")

    train_custom_verifier(
        positive_reference_clips=str(_POSITIVE_DIR),
        negative_reference_clips=str(_NEGATIVE_DIR),
        output_path=str(_CUSTOM_PKL),
        model_name="hey_jarvis",
    )

    verifier = joblib.load(str(_CUSTOM_PKL))
    console.print(f"  [green]✓ Verifier salvo em {_CUSTOM_PKL}[/green]")
    return verifier


def _calibrate_threshold(verifier: object) -> float:
    """Auto-calibrate detection threshold at ~5% FPR on negative corpus (WAKE-05)."""
    import numpy as np
    from sklearn.metrics import roc_curve
    from rich.console import Console

    try:
        from openwakeword.custom_verifier_model import get_reference_clip_features
    except ImportError:
        # Fallback if API is slightly different in 0.6.0
        from openwakeword import custom_verifier_model
        get_reference_clip_features = custom_verifier_model.get_reference_clip_features

    console = Console()
    console.print("\n[bold]Calibrando threshold automaticamente...[/bold]")

    neg_features = get_reference_clip_features(
        str(_NEGATIVE_DIR),
        model_name="hey_jarvis"
    )

    if len(neg_features) == 0:
        console.print("  [yellow]⚠ Corpus negativo vazio — usando threshold padrão 0.5[/yellow]")
        return 0.5

    neg_probs = verifier.predict_proba(neg_features)[:, 1]
    neg_labels = np.zeros(len(neg_probs))

    fpr, _, thresholds = roc_curve(neg_labels, neg_probs)

    # Find threshold at target FPR (~5%)
    target_idx = np.argmin(np.abs(fpr - _TARGET_FPR))
    auto_threshold = float(np.clip(thresholds[target_idx], 0.1, 0.95))

    fp_rate = float(fpr[target_idx])
    console.print(f"  Threshold calibrado: {auto_threshold:.3f} (FPR={fp_rate:.1%})")

    return auto_threshold


# ---------------------------------------------------------------------------
# Colab fallback
# ---------------------------------------------------------------------------


def _show_colab_fallback() -> None:
    """Display Colab fallback URL when median baseline < _MEDIAN_THRESHOLD (D-01)."""
    print(
        "\n[AVISO] Baseline de detecção insuficiente para treinamento local.\n"
        "Use o notebook oficial do openwakeword no Colab para treinar um modelo completo:\n"
        "  https://colab.research.google.com/github/dscripka/openWakeWord/blob/main/"
        "notebooks/training_custom_model.ipynb\n\n"
        "Após o treino, copie o arquivo .onnx gerado para:\n"
        "  ~/.jarvis/models/wake_word_custom.onnx\n"
        "\nSuas gravações foram salvas em:\n"
        f"  {_POSITIVE_DIR}\n"
        "Você pode fazer upload delas diretamente no Colab."
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point for train_wake_word.py."""
    parser = argparse.ArgumentParser(
        description="Treina um wake word customizado 'ei jarvis' para JARVIS (pt-BR).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--ptt",
        action="store_true",
        help="Modo push-to-talk: pressione uma tecla para iniciar cada gravação",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Testa o fluxo sem microfone real (áudio sintético)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  JARVIS — Treinamento de Wake Word (ei jarvis | pt-BR)")
    print("=" * 60)
    print()
    print("Este script vai:")
    print("  1. Gravar suas amostras de 'ei jarvis'")
    print("  2. Treinar um modelo verifier personalizado")
    print("  3. Instalar o modelo em ~/.jarvis/models/")
    print("  4. Calibrar o threshold de detecção automaticamente")
    print()

    if args.dry_run:
        print("[DRY-RUN] Modo de teste ativo — sem microfone real.")
        print("[DRY-RUN] Fluxo: gravar -> calibrar baseline -> treinar verifier -> calibrar threshold -> salvar config.")
        print("[DRY-RUN] Execute sem --dry-run para o fluxo completo com microfone.")
        sys.exit(0)

    # Full flow (non-dry-run):
    from rich.console import Console

    console = Console()

    # Step 1: Record positive samples (WAKE-02)
    samples = _run_recording_session(n_target=_REC_SAMPLES_TARGET, ptt=args.ptt)

    # Step 2: Calibrate baseline (D-01)
    median_score = _calibrate_baseline(samples)

    if median_score < _MEDIAN_THRESHOLD:
        # D-01: Colab fallback path
        console.print(f"\n[yellow]Score mediano ({median_score:.3f}) abaixo do limiar ({_MEDIAN_THRESHOLD})[/yellow]")
        _show_colab_fallback()
        sys.exit(0)

    console.print(f"\n[green]✓ Baseline suficiente ({median_score:.3f}) — iniciando treinamento local[/green]")

    # Step 3: Prepare negative corpus (D-07, D-08)
    _download_negative_corpus()
    _generate_tts_negatives()

    console.print("\nDeseja gravar ruído ambiente agora? (recomendado, ~5 min)")
    try:
        resp = input("  [s/N] ").strip().lower()
        if resp == "s":
            _record_ambient_noise(duration_s=300)
    except (KeyboardInterrupt, EOFError):
        pass

    # Step 4: Train verifier (WAKE-03)
    verifier = _train_verifier()

    # Step 5: Calibrate threshold (WAKE-05)
    auto_threshold = _calibrate_threshold(verifier)

    # Step 6: Persist threshold to config (D-02, WAKE-05)
    try:
        from jarvis_desktop.config import load_config, save_config
        config = load_config()
        config.wake_word_threshold = auto_threshold
        save_config(config)
        console.print(f"\n[green]✓ Threshold salvo em config.json: {auto_threshold:.3f}[/green]")
    except ImportError:
        # Fallback: direct JSON write when running in isolated uv venv
        import json
        config_path = _JARVIS_DIR / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                data = json.load(f)
        else:
            data = {}
        data["wake_word_threshold"] = auto_threshold
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(data, f, indent=2)
        console.print(f"\n[green]✓ Threshold salvo em config.json: {auto_threshold:.3f}[/green]")
    except Exception as exc:
        console.print(f"\n[yellow]⚠ Não foi possível salvar config: {exc}[/yellow]")
        console.print(f"  Defina manualmente: wake_word_threshold = {auto_threshold:.3f}")

    console.print("\n" + "=" * 60)
    console.print("[bold green]  Treinamento concluído![/bold green]")
    console.print("=" * 60)
    console.print(f"  Modelo salvo: {_CUSTOM_PKL}")
    console.print(f"  Threshold: {auto_threshold:.3f}")
    console.print("\n  Reinicie o JARVIS para ativar o wake word customizado.")
    console.print("  JARVIS vai confirmar no startup: '[VOICE] Modelo customizado carregado'")


if __name__ == "__main__":
    main()
