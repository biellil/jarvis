# ROCm no Windows — Contexto para Plano de Implementação

## Situação Atual

O JARVIS usa Chatterbox TTS para síntese de voz com clone de voz. O Chatterbox roda em CPU atualmente (~14s por resposta), pois o AMD GPU no Windows não é suportado pelo torch padrão.

A AMD lançou suporte oficial a ROCm no Windows via **ROCm 7.2.1**, que inclui wheels do PyTorch 2.9.1 para Windows. Isso abre caminho para rodar o Chatterbox na GPU AMD, mas exige adaptações porque o `chatterbox-tts` pina `torch==2.6.0` enquanto a AMD só fornece `torch==2.9.1+rocm`.

## Pré-requisitos

- GPU AMD **RDNA2 ou mais nova** (RX 6000 series em diante) — ROCm no Windows não suporta arquiteturas anteriores
- Windows 10/11 64-bit
- Python 3.12 (já instalado no projeto)
- ~3 GB de espaço para os wheels do torch+rocm

## O Que Precisa Ser Feito

### 1. Nível de Sistema
Instalar o **AMD HIP SDK** (runtime do ROCm). É um instalador `.exe` da AMD — sem isso, o torch+rocm não encontra as bibliotecas em tempo de execução.

- Download: [amd.com — HIP SDK](https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html)
- Versão alvo: HIP SDK 6.x (compatível com ROCm 7.2.1)

### 2. Nível de Ambiente Python
Substituir o `torch==2.6.0` (CPU) pelo `torch==2.9.1+rocm7.2.1` a partir do repositório da AMD. Os wheels são distribuídos via URL direta, não via PyPI.

```bash
pip install --no-cache-dir \
  "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl" \
  "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torchaudio-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl"
```

### 3. Nível do Projeto (chatterbox-tts)
O `chatterbox-tts` precisa ser reinstalado com `--no-deps` para ignorar a restrição de versão do torch. As dependências restantes precisam ser instaladas manualmente.

```bash
pip install chatterbox-tts --no-deps
pip install librosa conformer diffusers omegaconf pyloudnorm resemble-perth s3tokenizer safetensors spacy-pkuseg
```

Verificar compatibilidade do chatterbox com torch 2.9 — pode haver pequenas quebras de API que precisam de patch.

### 4. Verificação
ROCm aparece como `"cuda"` no PyTorch — sem mudança de código necessária.

```python
import torch
print(torch.cuda.is_available())   # deve retornar True com ROCm
print(torch.cuda.get_device_name(0))  # deve mostrar nome da GPU AMD
```

### 5. Integração com o JARVIS
O código de detecção de device em `tts.py` (`_detect_chatterbox_device()`) já vai pegar `"cuda"` automaticamente no topo da cascade — **sem mudar nenhum código**. O Chatterbox vai usar a GPU AMD transparentemente.

## Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Quebra de API torch 2.6 → 2.9 no chatterbox | Baixa | Testar geração de áudio; patchear se necessário |
| Conflito de DLLs se CUDA estiver instalado | Média | Verificar `PATH` e variáveis de ambiente antes |
| `uv.lock` fixado em torch 2.6.0 | Alta | Estratégia de extras no `pyproject.toml` para AMD vs padrão |

## Estratégia para uv.lock

O `uv.lock` tem `torch==2.6.0` fixado. Precisamos de uma estratégia para manter:
- Máquinas sem AMD → torch 2.6.0 CPU (padrão atual)
- Máquinas com AMD → torch 2.9.1+rocm (instalado manualmente fora do uv)

Opção sugerida: extra opcional `[amd-gpu]` no `pyproject.toml` com instruções de instalação manual, já que os wheels da AMD não estão no PyPI.

## Resultado Esperado

Chatterbox rodando na GPU AMD via ROCm com tempo de geração caindo de **~14s → ~1-2s** por resposta. O `jd setup` pode incluir a etapa de instalação automática do torch+rocm quando detectar GPU AMD compatível e HIP SDK presente.

## Referências

- [AMD ROCm for Windows — Install PyTorch](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html)
- [AMD HIP SDK Download](https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html)
- [AMD ROCm Windows repo](https://repo.radeon.com/rocm/windows/)
- [chatterbox-tts PyPI](https://pypi.org/project/chatterbox-tts/)
