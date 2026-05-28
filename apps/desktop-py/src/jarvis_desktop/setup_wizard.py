"""JARVIS Setup Wizard — baixa e verifica todos os recursos antes do primeiro uso.

Invocado via: uv run python -m jarvis_desktop setup

Passos:
  1. Verifica/baixa whisper-cli.exe + DLLs (whisper.cpp Vulkan)
  2. Verifica/baixa modelo GGML (ex: ggml-large-v3-turbo-q5_0.bin)
  3. Inicializa Kokoro TTS (baixa modelo ~350 MB na primeira vez)
  4. Verifica microfone disponível
  5. Relatório final — pronto para usar
"""
from __future__ import annotations

import sys
from pathlib import Path


def _c():
    from jarvis_desktop import ui
    return ui.get_console()


def run_setup() -> None:
    from jarvis_desktop.ui import init_ui, set_config
    from jarvis_desktop import ui
    from jarvis_desktop.config import load_config

    init_ui()
    c = ui.get_console()

    c.print("[bold]JARVIS Setup Wizard[/bold]")
    c.print("=" * 40)
    c.print("Preparando todos os recursos antes do primeiro uso...")
    c.print("")

    config = load_config()
    set_config(config)

    results: list[tuple[str, bool, str]] = []  # (etapa, ok, detalhe)

    # ------------------------------------------------------------------
    # Etapa 1: whisper.cpp binary + DLLs
    # ------------------------------------------------------------------
    c.print("[bold][ 1/4 ] STT — whisper.cpp binary[/bold]")
    from jarvis_desktop.stt_whisper_cpp import _find_binary, _download_binary, _model_path, _download_model
    from jarvis_desktop.stt import _detect_amd_windows

    resolved_backend = config.stt_backend
    if resolved_backend == "auto":
        resolved_backend = "whisper_cpp" if _detect_amd_windows() else "faster_whisper"

    if resolved_backend == "whisper_cpp":
        binary = _find_binary(config.whisper_cpp_binary)
        if binary:
            c.print(f"  [green]✓[/green] whisper-cli.exe encontrado: {binary}")
            # Verificar se DLLs estão presentes na mesma pasta
            bin_dir = Path(binary).parent
            missing_dlls = [d for d in ("whisper.dll", "ggml.dll") if not (bin_dir / d).exists()]
            if missing_dlls:
                c.print(f"  [yellow]![/yellow] DLLs faltando: {missing_dlls} — re-baixando...")
                # Apagar exe para forçar re-download com DLLs
                Path(binary).unlink(missing_ok=True)
                binary = _download_binary()
            if binary:
                c.print(f"  [green]✓[/green] DLLs verificadas.")
                results.append(("whisper-cli.exe", True, binary))
            else:
                c.print("  [red]✗[/red] Falha ao obter whisper-cli.exe.")
                results.append(("whisper-cli.exe", False, "download falhou"))
        else:
            c.print("  Não encontrado — baixando...")
            binary = _download_binary()
            if binary:
                c.print(f"  [green]✓[/green] whisper-cli.exe instalado: {binary}")
                results.append(("whisper-cli.exe", True, binary))
            else:
                c.print("  [red]✗[/red] Falha ao baixar whisper-cli.exe.")
                results.append(("whisper-cli.exe", False, "download falhou"))
    else:
        c.print("  Backend: faster-whisper (não requer whisper-cli.exe)")
        results.append(("whisper-cli.exe", True, "não necessário"))

    c.print("")

    # ------------------------------------------------------------------
    # Etapa 2: modelo Whisper (GGML ou HuggingFace cache)
    # ------------------------------------------------------------------
    c.print("[bold][ 2/4 ] STT — modelo Whisper[/bold]")

    if resolved_backend == "whisper_cpp":
        model_size = config.whisper_model if config.whisper_model not in ("tiny", "") else "large-v3-turbo"
        model = _model_path(model_size)
        if model.exists():
            size_mb = model.stat().st_size // (1024 * 1024)
            c.print(f"  [green]✓[/green] {model.name} ({size_mb} MB)")
            results.append(("modelo whisper", True, str(model)))
        else:
            c.print(f"  Baixando {model.name} de HuggingFace...")
            ok = _download_model(model_size)
            if ok:
                c.print(f"  [green]✓[/green] {model.name} instalado.")
                results.append(("modelo whisper", True, str(model)))
            else:
                c.print(f"  [red]✗[/red] Falha ao baixar {model.name}.")
                results.append(("modelo whisper", False, "download falhou"))
    else:
        # faster-whisper: carrega para garantir que o modelo esteja em cache
        from jarvis_desktop.stt import _is_model_cached, _load_model_with_progress, _detect_device, _select_model_for_device, _query_vram_mb
        device = _detect_device()
        if config.whisper_model_locked:
            model_size = config.whisper_model
        else:
            vram_mb = _query_vram_mb() if device == "cuda" else 0
            model_size = _select_model_for_device(device, vram_mb)

        if _is_model_cached(model_size):
            c.print(f"  [green]✓[/green] {model_size} já em cache.")
            results.append(("modelo whisper", True, model_size))
        else:
            c.print(f"  Baixando {model_size} (faster-whisper)...")
            try:
                _load_model_with_progress(model_size, device=device)
                c.print(f"  [green]✓[/green] {model_size} em cache.")
                results.append(("modelo whisper", True, model_size))
            except Exception as exc:
                c.print(f"  [red]✗[/red] Falha: {exc}")
                results.append(("modelo whisper", False, str(exc)))

    c.print("")

    # ------------------------------------------------------------------
    # Etapa 3: TTS — Kokoro
    # ------------------------------------------------------------------
    c.print("[bold][ 3/4 ] TTS — Kokoro[/bold]")
    if config.tts_provider == "none":
        c.print("  TTS desabilitado na config.")
        results.append(("kokoro", True, "desabilitado"))
    else:
        try:
            from jarvis_desktop.tts import init_tts, _engine
            init_tts(config)
            # Re-import to check state after init
            from jarvis_desktop import tts as _tts_mod
            if _tts_mod._engine is not None:
                c.print(f"  [green]✓[/green] Kokoro pronto (voz: {config.kokoro_voice}).")
                results.append(("kokoro", True, config.kokoro_voice))
            else:
                c.print("  [yellow]![/yellow] Kokoro não carregou (espeak-ng ausente?). TTS silencioso.")
                results.append(("kokoro", False, "engine None após init"))
        except Exception as exc:
            c.print(f"  [red]✗[/red] Erro: {exc}")
            results.append(("kokoro", False, str(exc)))

    c.print("")

    # ------------------------------------------------------------------
    # Etapa 4: microfone
    # ------------------------------------------------------------------
    c.print("[bold][ 4/4 ] Microfone[/bold]")
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        input_devices = [d for d in devices if d["max_input_channels"] > 0]
        if input_devices:
            default = sd.query_devices(kind="input")
            c.print(f"  [green]✓[/green] Microfone padrão: {default['name']}")
            results.append(("microfone", True, default["name"]))
        else:
            c.print("  [red]✗[/red] Nenhum dispositivo de entrada encontrado.")
            results.append(("microfone", False, "sem dispositivos"))
    except Exception as exc:
        c.print(f"  [red]✗[/red] Erro ao verificar microfone: {exc}")
        results.append(("microfone", False, str(exc)))

    c.print("")

    # ------------------------------------------------------------------
    # Relatório final
    # ------------------------------------------------------------------
    c.print("=" * 40)
    c.print("[bold]Resultado do Setup[/bold]")
    c.print("")
    all_ok = True
    for etapa, ok, detalhe in results:
        icon = "[green]✓[/green]" if ok else "[red]✗[/red]"
        c.print(f"  {icon}  {etapa:<22} {detalhe}")
        if not ok:
            all_ok = False

    c.print("")
    if all_ok:
        c.print("[bold green]Setup concluído — JARVIS pronto para uso.[/bold green]")
        c.print("Execute:  uv run python -m jarvis_desktop")
    else:
        c.print("[bold yellow]Setup concluído com avisos. Verifique os itens marcados com ✗.[/bold yellow]")

    from jarvis_desktop.ui import cleanup_ui
    cleanup_ui()
