"""Benchmark Chatterbox: mede tempo de geração em MPS vs CPU.

Objetivo: descobrir se o Metal (MPS) acelera de verdade ou se cai pra CPU.
Mede: load do modelo, 1ª geração (cold), 2ª geração (warm/steady-state).
"""
import os
# Permite que ops não suportadas no MPS caiam pra CPU em vez de crashar
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import time
import warnings
warnings.filterwarnings("ignore")

import contextlib, io
import soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

REF = "/Users/biellil/Documents/jarvis/apps/desktop-py/voices/Jarvis.mp3"
FRASE = "Bom dia. Eu sou o JARVIS, seu assistente pessoal inteligente."


def bench(device: str):
    print(f"\n===== DEVICE: {device.upper()} =====", flush=True)
    t0 = time.time()
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        eng = ChatterboxMultilingualTTS.from_pretrained(device=device)
    print(f"  load modelo:      {time.time()-t0:6.1f}s", flush=True)

    for i, label in enumerate(["1a geracao (cold)", "2a geracao (warm)"]):
        t = time.time()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            wav = eng.generate(FRASE, language_id="pt", audio_prompt_path=REF,
                               exaggeration=0.7, cfg_weight=0.5)
        dur_audio = wav.squeeze().shape[-1] / 24000.0
        elapsed = time.time() - t
        rtf = elapsed / dur_audio if dur_audio else 0
        print(f"  {label}: {elapsed:6.1f}s  (audio {dur_audio:.1f}s, RTF {rtf:.1f}x)", flush=True)
        if i == 1:
            sf.write(f"/tmp/chatterbox_{device}.wav", wav.squeeze().cpu().numpy(), 24000)
            print(f"  -> salvo /tmp/chatterbox_{device}.wav", flush=True)


if __name__ == "__main__":
    import sys
    dev = sys.argv[1] if len(sys.argv) > 1 else "mps"
    bench(dev)
    print("\nFim.", flush=True)
