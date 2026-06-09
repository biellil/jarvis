# TTS no macOS — Chatterbox lento no Metal e a solução (Chatterbox Turbo / MLX)

**TL;DR:** O chatterbox atual (PyTorch) **não acelera no Metal** do Mac — ele cai pra CPU e leva **~1 minuto por frase**. A causa é o suporte incompleto do PyTorch ao backend MPS (Metal) para esse modelo. A solução nativa é trocar pelo **Chatterbox Turbo via MLX** (`mlx-audio`), que roda **de verdade na GPU/Neural Engine** da Apple.

---

## Por que o TTS "parou de funcionar"

O TTS **não quebrou** — ele está configurado para o `chatterbox` (PyTorch) e **cada fala leva mais de 1 minuto** neste Mac, então parece travado. Confirmado por benchmark real (M-series, 8 cores):

| Backend | 1ª geração (cold) | 2ª geração (warm) | Usável p/ conversa? |
|---------|-------------------|-------------------|:---:|
| **Metal (MPS)** | 69.9s → RTF 18.6x | 156.7s → RTF 42.6x | ❌ |
| **CPU** | 83.0s → RTF 14.9x | 69.4s → RTF 18.5x | ❌ |
| **CUDA (PC NVIDIA)** | rápido (feito p/ isso) | rápido | ✅ |

> **RTF** = Real-Time Factor. RTF 18x = leva 18 segundos para gerar 1 segundo de áudio.

### Causa raiz (por que o Metal não acelera)

1. O chatterbox usa o modelo **T3** — um transformer autoregressivo que gera áudio **token por token** (milhares de passos por frase).
2. O **backend MPS (Metal) do PyTorch não implementa todas as operações** que esse modelo precisa.
3. A cada operação sem suporte, o PyTorch faz **fallback**: copia o tensor GPU→CPU, calcula na CPU, copia CPU→GPU. Isso acontece milhares de vezes por frase.
4. O custo de **transferir memória GPU↔CPU** supera qualquer ganho da GPU → fica **mais lento que a CPU pura** (42x vs 18x).

**Não é configuração nem bug do JARVIS** — são kernels que faltam no PyTorch para Apple Silicon. No PC NVIDIA, o CUDA tem cobertura completa e o chatterbox voa.

> Importante: o TTS roda no **cliente desktop py (o Mac)**, não no gateway. Por isso o CUDA do PC NVIDIA não ajuda aqui — a síntese é local.

---

## A solução nativa: Chatterbox Turbo via MLX

**MLX** é o framework da Apple para Apple Silicon — roda **nativo no Metal/Neural Engine**, **sem o problema de fallback** do PyTorch. O [`mlx-audio`](https://github.com/Blaizzy/mlx-audio) traz um port do Chatterbox que usa a GPU de verdade.

- Pacote: `mlx-audio` (PyPI / GitHub `Blaizzy/mlx-audio`)
- Modelos Chatterbox MLX: `mlx-community/chatterbox-fp16` (qualidade) ou `mlx-community/Chatterbox-TTS-4bit` (mais leve/rápido)
- Suporta clonagem de voz por **áudio de referência** (`--ref_audio`)
- Multilíngue, inclui **PT (português)**

### Instalação (teste isolado, fora do JARVIS)

```bash
# Em um venv de teste no Mac (Apple Silicon)
pip install mlx-audio
```

### Uso via CLI — clonando a voz Jarvis.mp3

```bash
python -m mlx_audio.tts.generate \
  --model mlx-community/Chatterbox-TTS-4bit \
  --text "Bom dia. Eu sou o JARVIS, seu assistente pessoal inteligente." \
  --ref_audio /Users/biellil/Documents/jarvis/apps/desktop-py/voices/Jarvis.mp3
```

Gera um `.wav` clonando a voz da referência — rodando no Metal nativo.

### Uso via API Python (esboço — validar nomes na versão instalada)

```python
from mlx_audio.tts.generate import generate_audio

generate_audio(
    text="Bom dia. Eu sou o JARVIS.",
    model_path="mlx-community/Chatterbox-TTS-4bit",
    ref_audio="apps/desktop-py/voices/Jarvis.mp3",  # clonagem zero-shot
    # exaggeration / cfg_weight: confirmar suporte na versão MLX
)
```

> ⚠️ Os parâmetros exatos da API Python (`exaggeration`, `cfg_weight`, `temperature`) podem diferir da versão PyTorch — **validar com `pip show mlx-audio` + README da versão instalada** antes de integrar.

---

## Como integrar no JARVIS (trabalho de código — tarefa GSD)

O `mlx-audio` ainda **não está integrado** ao JARVIS. Para usar como provider:

1. Adicionar `mlx-audio` como extra opcional (só macOS) no `pyproject.toml` do `apps/desktop-py`.
2. Criar um novo provider `chatterbox-mlx` em [`src/jarvis_desktop/tts.py`](../apps/desktop-py/src/jarvis_desktop/tts.py) — espelhando o padrão de `_chatterbox_speak`, mas chamando a API do `mlx-audio` e passando `ref_audio = config.chatterbox_audio_prompt_path`.
3. Detectar plataforma: usar `chatterbox-mlx` no macOS Apple Silicon; manter `chatterbox` (PyTorch+CUDA) no PC NVIDIA. **Não quebrar** os caminhos CUDA/DirectML existentes.
4. Adicionar `"chatterbox-mlx"` em `valid_providers` e no menu de TTS.

**Antes de integrar:** rodar um benchmark do `mlx-audio` neste Mac (como foi feito com o chatterbox PyTorch) para **provar** a velocidade real no Metal e ouvir a qualidade da voz clonada.

---

## Alternativas MLX (todas rodam nativo no Metal)

| Modelo | Clona voz? | Velocidade no Mac | Maturidade |
|--------|:---:|---------|-----------|
| **Chatterbox Turbo (MLX)** | ✅ `--ref_audio` | ⚡ rápida | port do chatterbox — mesma voz |
| **Qwen3-TTS (MLX)** | ✅ (3-15s) | ⚡ <100ms (M3/M4) | nova, muito rápida |
| **F5-TTS (MLX)** | ✅ (~3s) | ⚡ rápida | madura |
| **Kokoro (MLX)** | ❌ vozes prontas | ⚡ rápida | estável |

---

## Referências

- [mlx-audio (Blaizzy/mlx-audio)](https://github.com/Blaizzy/mlx-audio) — TTS/STT/STS nativo Apple Silicon
- [mlx-audio no PyPI](https://pypi.org/project/mlx-audio/)
- [f5-tts-mlx (lucasnewman)](https://github.com/lucasnewman/f5-tts-mlx)
- [qwen3-tts-apple-silicon (kapi2800)](https://github.com/kapi2800/qwen3-tts-apple-silicon)
- [claude-mlx-tts — usa "MLX Chatterbox Turbo"](https://github.com/aperepel/claude-mlx-tts)
- [Comparativo TTS local 2026](https://www.promptquorum.com/power-local-llm/local-tts-voice-cloning-piper-coqui-xtts)
- Benchmark interno: `apps/desktop-py/bench_chatterbox.py` (logs em `/tmp/bench_mps.log`, `/tmp/bench_cpu.log`)
