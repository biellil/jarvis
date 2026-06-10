# JARVIS Desktop — Python Client

Cliente Python do JARVIS: pipeline de voz (STT → LLM → TTS) com detecção automática de GPU.

## Requisitos

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (gerenciador de pacotes recomendado)

## Instalação

### Instalação base (CPU)

```bash
cd apps/desktop-py
uv sync
```

### Extras por plataforma GPU

| Extra | Plataforma | Quando usar |
|-------|------------|-------------|
| `[nvidia-gpu]` | Linux / Windows | NVIDIA GPU com CUDA 12.4+ |
| `[amd-gpu-windows]` | Windows | AMD GPU (RDNA2+) via DirectML |
| `[apple-silicon]` | macOS (M1/M2/M3) | Metal MPS — nenhum extra necessário* |
| `[vulkan]` | Reservado | Pendente resolução de conflito upstream |

*MPS está incluído no PyTorch padrão para macOS arm64.

#### NVIDIA GPU (Linux / Windows)

```bash
uv sync --extra nvidia-gpu --extra chatterbox
```

#### AMD GPU Windows (DirectML — default, zero friction)

```bash
uv sync --extra amd-gpu-windows --extra chatterbox
```

#### AMD GPU Windows (ROCm — opt-in, requer HIP SDK)

```bash
# Instalar torch ROCm wheel manualmente (mutuamente exclusivo com DirectML):
pip install torch==2.9.1+rocm7.2.1 --extra-index-url https://download.pytorch.org/whl/rocm7.2.1
uv sync --extra chatterbox
# Configurar: editar ~/.jarvis/config.json → "gpu_amd_backend": "rocm"
```

#### Apple Silicon (macOS M1/M2/M3)

```bash
uv sync --extra apple-silicon
# MPS habilitado automaticamente — nenhuma configuração adicional
```

## TTS Neural (Chatterbox)

Para ativar Chatterbox TTS (voz emocional multilingual):

```bash
uv sync --extra chatterbox
```

## Diagnóstico de GPU

```bash
jd validate-gpu              # Mostra device detectado + fallback chain
jd validate-gpu --verbose    # Diagnóstico completo com versão de driver
jd validate-gpu --json       # JSON estruturado para scripting
```

## Uso

```bash
jd                 # Inicia cliente JARVIS (chat loop)
jd setup           # Assistente de configuração inicial
jd validate-gpu    # Diagnóstico de GPU
```
