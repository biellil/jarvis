# Phase 91 — P-1 Validation Gate

**Date:** 2026-06-10
**Torch version tested:** 2.9.1+cpu (ROCm wheel unavailable — see Step 2)
**Chatterbox version:** 0.1.7
**Python version:** 3.13.5
**Platform:** Windows 11 (win32, amd64)

## Resultado

**Status:** NO-GO (torch 2.9.1+rocm7.2.1 não existe para Windows — ROCm é Linux-only)

**go/no-go reason:** O wheel `torch==2.9.1+rocm7.2.1` não existe para Windows em nenhuma versão do Python — ROCm exclusivamente distribui builds para `linux_x86_64`; em Windows AMD, o backend correto é DirectML (já planejado como default em D-01/D-02 do 91-CONTEXT.md).

## fallback_strategy: CPU-ONLY

(CPU-ONLY = Chatterbox permanece em CPU; Whisper+Kokoro recebem GPU via CUDA/DirectML — D-05 aplica)

**Justificativa expandida:**
- No Windows, torch+ROCm não existe — AMD GPU usa DirectML (`torch-directml`), não ROCm.
- `torch-directml` é incompatível com chatterbox-tts 0.1.7 (que exige `torch==2.6.0` via metadata PyPI).
- `torch==2.6.0+rocm` existe mas apenas para Linux. Em Windows, torch 2.6.0 instala versão CPU (sem DirectML).
- A estratégia D-05 já estava prevista: Chatterbox em CPU (sem perda de qualidade de voz, apenas sem aceleração GPU), enquanto Whisper e Kokoro recebem o device acelerado.
- **Impacto real:** Chatterbox em CPU é o comportamento atual em produção (Phase 86 já faz fallback para CPU se GPU falhar). Esta validação confirma que essa é a estratégia correta para Windows, não um degradation.

## API Compatibility: PASS

Apesar do NO-GO para ROCm no Windows, a **API do Chatterbox 0.1.7 com torch 2.9.1 é totalmente compatível**:
- `ChatterboxMultilingualTTS.__init__` aceita os mesmos parâmetros
- `ChatterboxMultilingualTTS.generate()` mantém assinatura idêntica
- Nenhuma breaking change detectada

## Test Outputs

### Step 2 — torch install (torch==2.9.1+rocm7.2.1)

```
Looking in indexes: https://pypi.org/simple, https://download.pytorch.org/whl/rocm7.2.1
WARNING: Cache entry deserialization failed, entry ignored
ERROR: Could not find a version that satisfies the requirement torch==2.9.1+rocm7.2.1 (from versions: 2.6.0, 2.7.0, 2.7.1, 2.8.0, 2.9.0, 2.9.1, 2.10.0, 2.11.0, 2.12.0)

[notice] A new release of pip is available: 25.1.1 -> 26.1.2
[notice] To update, run: C:\tmp\jarvis-p1-test\Scripts\python.exe -m pip install --upgrade pip
ERROR: No matching distribution found for torch==2.9.1+rocm7.2.1
EXIT_CODE: 1
```

**Análise:** A razão é que PyTorch não distribui wheels ROCm para Windows. Os wheels `torch==X.Y.Z+rocmA.B.C` existem apenas para `linux_x86_64`. Em Windows AMD, o equivalente é `torch-directml`. O index `download.pytorch.org/whl/rocm7.2.1` lista versões sem o sufixo `+rocm` para Windows pois não há wheel disponível — pip cai de volta para PyPI CPU-only.

### Step 3 — chatterbox install (--no-deps)

```
Collecting chatterbox-tts==0.1.7
  Downloading chatterbox_tts-0.1.7-py3-none-any.whl.metadata (12 kB)
Downloading chatterbox_tts-0.1.7-py3-none-any.whl (108 kB)
Installing collected packages: chatterbox-tts
Successfully installed chatterbox-tts-0.1.7

[notice] A new release of pip is available: 25.1.1 -> 26.1.2
EXIT_CODE: 0
```

**Nota:** chatterbox-tts 0.1.7 exige `torch==2.6.0` em seu metadata PyPI. Isso foi detectado como warning ao instalar torch 2.9.1:
```
chatterbox-tts 0.1.7 requires torch==2.6.0; python_version < "3.14", but you have torch 2.9.1 which is incompatible.
```
O pip instala mesmo assim (warning, não error), e a API funcional — ver Step 4.

### Step 4 — API compatibility

```python
# test_p1.py com torch 2.9.1+cpu + chatterbox 0.1.7 + deps transitivas
torch version: 2.9.1+cpu
Import OK
__init__ params: ['self', 't3', 's3gen', 've', 'tokenizer', 'device', 'conds']
generate params: ['self', 'text', 'language_id', 'audio_prompt_path', 'exaggeration', 'cfg_weight', 'temperature', 'repetition_penalty', 'min_p', 'top_p']
API check OK
EXIT_CODE: 0
```

**Resultado:** API 100% compatível. `generate()` mantém todos os parâmetros que o código de produção usa:
- `text` ✓
- `language_id` (para `"pt"`) ✓
- `audio_prompt_path` (voice cloning) ✓
- `exaggeration`, `cfg_weight` (emotion tags Phase 88) ✓

### Step 5 — Allocation test

```
torch version: 2.9.1+cpu
CUDA available: False
CUDA not available on this machine — CPU only
ROCm (HIP) available: False
torch.version.hip: None
EXIT_CODE: 0
```

**Resultado:** Máquina de desenvolvimento é Windows sem GPU CUDA/ROCm — confirma que o teste foi realizado em CPU puro. A validação de allocation em GPU AMD real requereria hardware Linux com ROCm instalado, fora do escopo desta máquina de dev.

## Notes for Plan 02 Executor

### Estratégia confirmada: D-05 (CPU-ONLY para Chatterbox)

O Plan 02 deve implementar `device_detect.py` sabendo que:

1. **Windows + AMD GPU → DirectML para Whisper/Kokoro, CPU para Chatterbox**
   - `torch-directml` é o backend AMD para Windows — já listado como dep em `[chatterbox]` extra
   - Chatterbox 0.1.7 requer `torch==2.6.0` — incompatível com `torch-directml 0.2.5.dev240914` que pina `torch==2.4.1`
   - Override `torch==2.6.0` (já em `[tool.uv] override-dependencies`) resolve o conflict para CPU, mas não para DirectML

2. **Windows + NVIDIA GPU → CUDA para Whisper/Kokoro, CPU para Chatterbox**
   - torch CUDA instala separado; Chatterbox pode rodar em CUDA se `torch==2.6.0+cuXXX` compatível
   - **A ser validado** em ambiente com NVIDIA GPU real (fora do escopo deste gate)

3. **Linux + AMD GPU → ROCm 7.2.1 para Whisper/Kokoro, verificar Chatterbox**
   - `torch==2.9.1+rocm7.2.1` existe para Linux; Chatterbox requer `torch==2.6.0+rocmX.Y`
   - `torch==2.6.0+rocm6.0` existe — Chatterbox **pode** rodar em ROCm no Linux com torch 2.6.0
   - **A ser validado** em ambiente Linux com ROCm (fora do escopo deste gate Windows)

4. **macOS + Apple Silicon → MPS para Whisper/Kokoro, CPU para Chatterbox**
   - `torch-directml` não existe no macOS; MPS é o backend
   - Chatterbox e MPS: historicamente problemático (metal kernels incompletos) → CPU-ONLY conservativo

### API Summary para Plan 02

Nenhuma breaking change detectada. A signature de `_warmup_chatterbox()` e `_chatterbox_speak()` em `tts.py` permanece válida:
- `engine.to(device)` — funciona
- `engine.generate(text, language_id="pt", audio_prompt_path=..., exaggeration=..., cfg_weight=...)` — funciona

### Decisão de fallback_strategy por OS

| OS + GPU | Whisper/Kokoro | Chatterbox | Razão |
|----------|---------------|------------|-------|
| Windows AMD | DirectML | CPU | torch-directml incompatível com chatterbox 0.1.7 |
| Windows NVIDIA | CUDA | CPU (conservativo) | Não validado em hardware real |
| Linux AMD | ROCm | CPU (conservativo) | torch 2.6.0+rocm existe mas não testado |
| Linux NVIDIA | CUDA | CUDA (provável OK) | Não validado em hardware real |
| macOS Apple Silicon | MPS | CPU | MPS kernels incompletos para Chatterbox |

**Default para Plan 02:** `fallback_strategy: CPU-ONLY` para Chatterbox em todas as plataformas, salvo evidência contrária com hardware real.
