# Phase 86: Chatterbox Core — Research

**Researched:** 2026-05-28
**Domain:** TTS (Text-to-Speech) — integração de novo provider neural com auto-detecção de hardware, warmup assíncrono e fallback em cascade
**Confidence:** HIGH (API verificada no source do Chatterbox; versões verificadas no PyPI em 2026-05-28; estratégia `--no-deps` confirmada por múltiplas fontes)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Warmup**
- **D-01:** Warmup roda em `threading.Thread(daemon=True)` em background. `init_tts()` retorna imediatamente — startup do JARVIS não bloqueia.
- **D-02:** Warmup **só dispara se `config.tts_provider == "chatterbox"`** no startup. Se usuário inicia em Kokoro e troca depois, warmup acontece no `set_provider("chatterbox")`.
- **D-03:** Texto do warmup: **frase curta fixa em PT-BR** (uma sílaba/palavra mínima como `"."` ou `"olá"`). Áudio gerado é **descartado** (não tocado via sounddevice).
- **D-04:** Warmup **não usa** `audio_prompt_path` (voice cloning). Phase 86 cobre só o modelo base — Phase 87 estende warmup para incluir referência de voz se necessário.
- **D-05:** Se `speak()` for chamado antes do warmup terminar, **bloqueia com timeout de 15s** aguardando warmup completar. UI mostra `[TTS] aguardando inicialização...`. Garante consistência (não troca voz entre falas).
- **D-06:** Shutdown durante warmup: thread daemon **morre com o processo**. Sem cleanup elegante, sem `join()`.

**Provider Selection e Persistência do Fallback**
- **D-07:** Novo valor `"chatterbox"` adicionado ao set válido em `set_provider()`: `{"kokoro", "chatterbox", "elevenlabs", "murf", "none"}`.
- **D-08:** **Auto-switch permanente de sessão** quando Chatterbox falha: primeira falha runtime marca `_chatterbox_disabled = True` em memória; próximas `speak()` vão direto pra Kokoro até reiniciar.
- **D-09:** **`ImportError` no `init_tts()`** ou no `set_provider("chatterbox")`: marca `_chatterbox_available = False` pela sessão inteira. Mensagem: `[TTS] Chatterbox não instalado. Rode: uv sync --extra chatterbox`.
- **D-10:** **`config.tts_provider` persistido em `~/.jarvis/config.json` NÃO é alterado** quando ocorre fallback. Estado de degradação fica só em memória. Próxima sessão tenta Chatterbox de novo.
- **D-11:** `set_provider("chatterbox")` quando módulo já detectou `ImportError`: **recusa com aviso claro**, não altera config, usuário continua no provider anterior.

**Device Detection (GPU/CPU)**
- **D-12:** **Cascade de detecção:** `CUDA → MPS → DirectML → CPU`.
- **D-13:** **Sem campo `chatterbox_device` no config** — só auto-detect na cascade fixa.
- **D-14:** **Cascade no erro de warmup:** se device escolhido falhar (OOM, op não suportada, runtime error), tenta **próximo device da cadeia** automaticamente antes de cair pra Kokoro.
- **D-15:** **OOM ou erro em runtime (durante `speak()`)** trata como erro normal do Chatterbox: **fallback Kokoro pela sessão** (D-08). **Sem hot-swap** de device em runtime.
- **D-16:** **Vulkan NÃO entra na cascade.**

**Packaging e Dependências**
- **D-17:** `chatterbox-tts` (e dependências relacionadas) como **extra opcional** em `pyproject.toml`: grupo `chatterbox`. Instalação: `uv sync --extra chatterbox`.
- **D-18:** Conflito **torch ↔ ctranslate2** resolvido via `--no-deps` + torch pinned manualmente.
- **D-19:** `torch-directml` também como **extra opcional** dentro do mesmo grupo `chatterbox` (ou subgrupo). Se não instalado, cascade pula DirectML sem erro.
- **D-20:** Imports `chatterbox`, `torch_directml` são **lazy** (dentro das funções), nunca no topo do módulo.

**UX e Logging**
- **D-21:** **Log curto no init** indicando device escolhido: `[TTS] Chatterbox: GPU (CUDA)` etc.
- **D-22:** Mensagens com **prefixo `[TTS]` consistente**. Mostra **motivo curto** do erro: `[TTS] Chatterbox falhou (CUDA OOM) — usando Kokoro pela sessão.`
- **D-23:** Print no console durante warmup. **Sem novo estado `ui.set_state("warming")`** — mantém apenas `speaking`/`idle` da Phase 75.

**Integração com Padrões Existentes**
- **D-24:** Reusa padrões do Phase 75: `set_state("speaking/idle")`, `_is_playing`, `_stop_event`, resample para 24kHz, fallback silencioso para Kokoro em qualquer Exception.
- **D-25:** `_chatterbox_engine` é singleton análogo a `_engine` (Kokoro) — separado para permitir warmup paralelo no futuro.

### Claude's Discretion
- Versão exata do `chatterbox-tts` e do `torch` pinned (researcher resolve via análise de compatibilidade com `ctranslate2 >=4.0`)
- Estrutura de erros internos (qual `Exception` específica para `_chatterbox_disabled` vs erros transitórios)
- Texto exato do warmup (uma palavra ou sílaba — qualquer coisa que aqueça o grafo)
- Estratégia de detecção de "warmup terminado" (Event, Future, ou flag booleana)
- Ordem exata de tentativa dentro da cascade no erro (ex: pular DirectML se CUDA falhou por OOM em vez de incompatibilidade)

### Deferred Ideas (OUT OF SCOPE)
- Avaliar OpenVoice v2 ou Fish Speech como provider TTS alternativo
- Camada abstrata `EmotionalTTSProvider` (YAGNI)
- `chatterbox_device` em config + override em `/config`
- Override via env var `CHATTERBOX_DEVICE`
- Hot-swap CUDA→CPU em runtime
- Cleanup elegante de thread de warmup no SIGINT
- Estado `ui.set_state("warming")`
- Slider de intensidade emocional (EMOTE-03)
- Inferência automática de emoção via LLM (EMOTE-04)
- Feedback de progresso de download do modelo ~800MB (VCLONE-04)
- Cache de speaker embedding entre sessões (VCLONE-05)
- Voice cloning com `audio_prompt_path` — Phase 87
- Emotion tags — Phase 88
- Menu `/config` listando chatterbox como opção — Phase 88
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHTB-01 | Usuário pode selecionar Chatterbox como provider TTS (lazy-init, GPU auto-detect, graceful ImportError) | Cascade `CUDA→MPS→DirectML→CPU` definida em "Device Detection" abaixo; ImportError handling em "Code Examples / set_provider"; ChatterboxMultilingualTTS confirmada como API correta para PT-BR (`language_id="pt"`) |
| CHTB-02 | Instalação do Chatterbox não quebra faster-whisper/ctranslate2 (pyproject.toml com torch pinned + chatterbox instalado via `--no-deps`) | Análise do conflito em "Dependency Conflict Resolution" abaixo: `faster-whisper==1.2.1` só exige `ctranslate2<5,>=4.0` (não pin de torch). `chatterbox-tts==0.1.7` pin `torch==2.6.0`. `torch-directml==0.2.5.dev240914` pin `torch==2.4.1`. Solução `--no-deps` + torch 2.6.0 pinned manualmente confirmada |
| CHTB-03 | JARVIS pré-aquece Chatterbox no `init_tts()` para eliminar atraso de 5-10s na primeira fala | Padrão de warmup com geração descartada documentado em "Warmup Strategy". Sample rate `S3GEN_SR = 24000` confirmado no source (alinha com `_KOKORO_SAMPLE_RATE` existente, sem resample) |
| CHTB-04 | Qualquer erro Chatterbox (timeout / CUDA OOM / arquivo inválido / ImportError) faz fallback automático para Kokoro sem travar | Padrão de erro em "Fallback decision logic": classifica ImportError (D-09 permanente) vs RuntimeError (D-14 cascade de device) vs Exception genérica (D-08 disabled-by-session). Reusa `_kokoro_speak()` existente |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Python 3.10+ com LangChain/LangGraph como framework principal. Para `apps/desktop-py`, `requires-python = ">=3.12"` (verificado em `pyproject.toml`).
- **Multi-LLM:** Toda chamada ao LLM passa por camada de abstração — N/A para esta phase (TTS, não LLM).
- **Multiplataforma:** Código OS-específico isolado. Aqui aplica-se a `torch-directml` (Windows-only via `sys_platform=='win32'`).
- **Privacidade:** Conversa nunca vai para cloud sem configuração explícita — Chatterbox é offline (modelo local via HuggingFace download na primeira execução), respeita a constraint.
- **Sem UI obrigatória:** Print no console (`get_console()`) — sem novo estado de UI (D-23).
- **Commits em PT-BR + Conventional Commits + emoji:** Todos commits desta phase devem seguir formato `<emoji> <type>(scope): descrição em pt-BR`. Para esta phase: `✨ feat(tts)`, `🐛 fix(tts)`, `✅ test(tts)`, `🏗️ build(deps)`.
- **NÃO incluir** `Co-Authored-By: Claude` nem footer `Generated with Claude Code`.
- **GSD workflow:** Mudanças via `/gsd:execute-phase`, não edits diretos.

## Summary

A Phase 86 adiciona o **Chatterbox TTS** como provider opcional em `tts.py`, mantendo Kokoro como fallback offline universal. Três descobertas críticas no research:

1. **API correta é `ChatterboxMultilingualTTS`**, não `ChatterboxTTS`. O modelo base (`ChatterboxTTS`) é English-only; o multilingual suporta 23 idiomas incluindo PT (`language_id="pt"`). Para um assistente PT-BR, **multilingual é obrigatório**. [VERIFIED: source do repo `chatterbox/mtl_tts.py`]

2. **Conflito torch resolvido sem dor:** `faster-whisper==1.2.1` só exige `ctranslate2<5,>=4.0` — **não** pin de torch. O conflito real é entre `chatterbox-tts==0.1.7` (pin `torch==2.6.0`) e `torch-directml==0.2.5.dev240914` (pin `torch==2.4.1`). Solução: **torch 2.6.0** pinned no projeto, `chatterbox-tts --no-deps`, e `torch-directml --no-deps` (pula a verificação de torch==2.4.1 mas usa o torch 2.6.0 instalado em runtime — confirmado funcional pela comunidade DirectML). [VERIFIED: PyPI metadata 2026-05-28; CITED: medium.com/@gideont]

3. **Sample rate é 24000 Hz** (`S3GEN_SR = 24000`), **idêntico ao Kokoro** — nenhuma operação de resample necessária, pode reutilizar `_KOKORO_SAMPLE_RATE = 24000` ou criar `_CHATTERBOX_SAMPLE_RATE = 24000` espelhado. [VERIFIED: source `chatterbox/models/s3gen/const.py`]

**Primary recommendation:** Replicar o pattern de `_create_kokoro_engine` + `_kokoro_speak` em `_create_chatterbox_engine` + `_chatterbox_speak`, com warmup async em `threading.Thread(daemon=True)` disparado por `init_tts()` quando `config.tts_provider == "chatterbox"`. Usar `threading.Event` para sinalizar warmup completo (mais simples que `Future` ou flag bool, suporta nativamente o timeout de 15s da D-05). Cascade de device implementada em loop sequencial com `try/except RuntimeError`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chatterbox-tts | **0.1.7** | TTS multilingual neural com voice cloning zero-shot | Última stable, publicada 2026-03-26. Versão 0.1.7 introduz `ChatterboxMultilingualTTS` consolidado com 23 idiomas incluindo PT. [VERIFIED: pypi.org/project/chatterbox-tts 2026-05-28] |
| torch | **2.6.0** | Backend de tensores e GPU | Versão pinned pelo chatterbox-tts. Compatível com Python 3.10–3.13 (cobre nosso `>=3.12`). Compatível com `ctranslate2 4.x` (ctranslate2 não pin torch — só requer `numpy` e `pyyaml`). [VERIFIED: PyPI ctranslate2 4.7.2 requires_dist] |
| torchaudio | **2.6.0** | Loading/saving de áudio + ops de signal | Pareado com torch 2.6.0 (mesmo release cycle). Requerido pelo chatterbox-tts. [VERIFIED: PyPI chatterbox-tts 0.1.7 requires_dist] |

### Supporting (instaladas manualmente após `--no-deps`)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| transformers | **5.2.0** | Modelo T3 (text-to-token) do Chatterbox usa HuggingFace transformers | Pinned exato pelo chatterbox-tts 0.1.7. **CRÍTICO:** versão 5.x quebra compatibilidade com 4.x — instalar exatamente 5.2.0 [VERIFIED: PyPI chatterbox-tts requires_dist] |
| diffusers | **0.29.0** | Modelo de difusão para S3Gen (token-to-mel) | Pinned exato — versões mais novas mudaram API de `DDIMScheduler`. [VERIFIED: PyPI 2024-06-12] |
| librosa | **0.11.0** | Audio loading + resample no encoder de voz | Pinned exato pelo chatterbox-tts. Já está como dep transitiva via `voice-cloning` extras. [VERIFIED: PyPI chatterbox-tts requires_dist] |
| safetensors | **0.5.3** | Loading de pesos do modelo | Pinned exato [VERIFIED] |
| conformer | **0.3.2** | Bloco Conformer no encoder | Pinned exato [VERIFIED] |
| pykakasi | **2.3.0** | Tokenização japonesa (necessário mesmo p/ PT-BR porque é importado eagerly) | Pinned exato [VERIFIED] |
| s3tokenizer | latest | Tokenizer de áudio S3 | Sem pin [VERIFIED] |
| resemble-perth | >=1.0.0 | Watermarking neural (Perth) embutido no output | [VERIFIED] |
| numpy | <2.0.0,>=1.24.0 | Já presente no projeto via sounddevice | OK — `sounddevice==0.5.5` aceita numpy 1.x e 2.x; chatterbox força <2.0.0 no Python 3.12 [VERIFIED] |
| omegaconf | latest | Config loader interno | [VERIFIED] |
| pyloudnorm | latest | Normalização de loudness do áudio gerado | [VERIFIED] |
| spacy-pkuseg | latest | Tokenização chinesa (importado eagerly) | [VERIFIED] |

### Plataforma específica
| Library | Version | Purpose | Platform |
|---------|---------|---------|----------|
| torch-directml | **0.2.5.dev240914** | Backend DirectML para GPUs AMD/Intel no Windows | Windows-only — usa `sys_platform=='win32'` marker. Última versão dev disponível em 2024-09-14. **Aviso:** pacote tem pin `torch==2.4.1`, mas funciona em runtime com `torch==2.6.0` se instalado com `--no-deps` (confirmado em produção pela comunidade Chatterbox-TTS-Server) [VERIFIED: PyPI 2026-05-28; CITED: github.com/devnen/Chatterbox-TTS-Server] |

### Não-Tocar (já no projeto, NÃO downgrade)
| Library | Versão Atual | Por Que Manter |
|---------|--------------|----------------|
| faster-whisper | **==1.2.1** | Requer `ctranslate2<5,>=4.0` e nada de torch — **não conflita** com torch 2.6.0 [VERIFIED: PyPI 2026-05-28] |
| sounddevice | **==0.5.5** | Reusado para playback do Chatterbox (mesma sample rate de 24kHz) |
| kokoro | **>=0.9.4** | Fallback obrigatório — D-08, D-24 |
| numpy | (sem pin direto) | chatterbox força `<2.0.0` em Python 3.12 — compatível com kokoro e sounddevice |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ChatterboxMultilingualTTS` | `ChatterboxTTS` | ChatterboxTTS é English-only — descartado pelo CLAUDE.md (assistente PT-BR) |
| `--no-deps` + manual install | Aceitar deps padrão do chatterbox | Default vai tentar **downgrade** do torch e quebrar compatibilidade com ROCm/CUDA do usuário, e instala dependências pesadas e desnecessárias como `gradio==6.8.0` (~200 MB de UI inútil) |
| `torch-directml --no-deps` | Aceitar pin `torch==2.4.1` | Pin do torch-directml conflita com pin do chatterbox (2.6.0). `--no-deps` confirma funcionalidade em produção |
| `threading.Event` para warmup | `concurrent.futures.Future` | Event é mais simples, suporta `.wait(timeout=15)` diretamente (D-05) sem precisar de wrapper |
| Singleton `_chatterbox_engine` separado | Reusar `_engine` | D-25 quer engines separados para permitir warmup paralelo no futuro |

**Installation (resolve conflito torch ↔ ctranslate2 ↔ directml):**

```bash
# Já instalado: torch é dep transitiva via kokoro. Verificar versão atual:
uv pip show torch | grep Version

# Fixar torch 2.6.0 + torchaudio 2.6.0 no pyproject.toml (extra "chatterbox")
# Instalar chatterbox-tts SEM deps (evita downgrade do torch e dep poluidoras)
uv pip install chatterbox-tts==0.1.7 --no-deps

# Instalar deps manuais necessárias para runtime
uv pip install transformers==5.2.0 diffusers==0.29.0 librosa==0.11.0 \
    safetensors==0.5.3 conformer==0.3.2 pykakasi==2.3.0 \
    s3tokenizer "resemble-perth>=1.0.0" omegaconf pyloudnorm spacy-pkuseg

# Windows (AMD/Intel GPU) — opcional
uv pip install torch-directml==0.2.5.dev240914 --no-deps
```

**Estratégia uv `--extra` (D-17, D-19) no pyproject.toml:**

```toml
[project.optional-dependencies]
chatterbox = [
    # CRÍTICO: torch precisa ser instalado ANTES de chatterbox-tts.
    # uv resolve em ordem alfabética dentro da lista, mas para garantir
    # ordem correta, instalar torch via dep principal e chatterbox via override.
    "torch==2.6.0",
    "torchaudio==2.6.0",
    # chatterbox-tts deve ser instalado com --no-deps — uv não suporta
    # --no-deps por-pacote nativamente. Workaround: usar tool.uv.sources
    # ou documentar comando manual de pós-instalação.
    "chatterbox-tts==0.1.7",
    # Deps que chatterbox-tts precisa em runtime mas não instalamos via deps:
    "transformers==5.2.0",
    "diffusers==0.29.0",
    "librosa==0.11.0",
    "safetensors==0.5.3",
    "conformer==0.3.2",
    "pykakasi==2.3.0",
    "s3tokenizer",
    "resemble-perth>=1.0.0",
    "omegaconf",
    "pyloudnorm",
    "spacy-pkuseg",
    # Windows AMD/Intel GPU
    "torch-directml==0.2.5.dev240914; sys_platform == 'win32'",
]
```

**ATENÇÃO uv:** `uv` não tem flag nativa `--no-deps` por-pacote em `pyproject.toml`. Duas opções:

- **Opção A (recomendada):** Listar **todas** as deps do chatterbox-tts manualmente no extras `chatterbox`, e usar `[tool.uv]` com `override-dependencies` para forçar `torch==2.6.0` no lugar do `torch==2.4.1` exigido pelo torch-directml:

  ```toml
  [tool.uv]
  override-dependencies = [
      "tflite-runtime; sys_platform == 'linux' and python_version < '3.12'",
      # NOVO: força torch 2.6.0 em vez do 2.4.1 exigido pelo torch-directml
      "torch==2.6.0",
      "torchvision==0.21.0",  # par de torch 2.6.0 (torch-directml exige torchvision)
  ]
  ```

- **Opção B:** Pós-script no README/CLAUDE.md: `uv sync --extra chatterbox` + comando manual `uv pip install chatterbox-tts==0.1.7 --no-deps`. Mais frágil, mas mais explícito.

Recomendação: **Opção A** (override-dependencies). Mantém `uv sync --extra chatterbox` como entrypoint único.

**Version verification (verificado em 2026-05-28):**

```bash
$ curl -s https://pypi.org/pypi/chatterbox-tts/json | jq .info.version
"0.1.7"
$ curl -s https://pypi.org/pypi/torch-directml/json | jq .info.version
"0.2.5.dev240914"
$ curl -s https://pypi.org/pypi/ctranslate2/json | jq .info.version
"4.7.2"
```

## Architecture Patterns

### Recommended Project Structure (delta sobre tts.py existente)

```
apps/desktop-py/src/jarvis_desktop/
├── tts.py                  # ESTENDER — sem novo arquivo
│   ├── _engine             # singleton Kokoro (existente, manter)
│   ├── _chatterbox_engine  # NOVO singleton Chatterbox
│   ├── _chatterbox_disabled       # NOVO — flag de fallback em memória (D-08)
│   ├── _chatterbox_available      # NOVO — flag ImportError (D-09)
│   ├── _chatterbox_warmup_event   # NOVO — threading.Event para D-05
│   ├── _chatterbox_device  # NOVO — string com device escolhido ("cuda" | "mps" | "directml" | "cpu")
│   ├── _CHATTERBOX_SAMPLE_RATE = 24000  # NOVO — espelha _KOKORO_SAMPLE_RATE
│   ├── init_tts()                  # ESTENDER — adicionar branch chatterbox para warmup async
│   ├── speak()                     # ESTENDER — adicionar branch antes dos cloud providers
│   ├── set_provider()              # ESTENDER — aceitar "chatterbox", validar import, disparar warmup
│   ├── _create_chatterbox_engine() # NOVO — factory com cascade de device
│   ├── _chatterbox_speak()         # NOVO — análogo a _kokoro_speak
│   ├── _detect_chatterbox_device() # NOVO — cascade CUDA→MPS→DirectML→CPU
│   ├── _start_chatterbox_warmup()  # NOVO — dispara Thread daemon
│   └── _chatterbox_fallback_to_kokoro(reason)  # NOVO — helper de log + fallback
└── (config.py SEM mudanças — D-13)
```

### Pattern 1: Lazy Import + Singleton com Lock
**What:** Imports do Chatterbox dentro das funções (não no topo do módulo).
**When to use:** Todos os símbolos de `chatterbox`, `torch_directml`, e `torch` que só são necessários no caminho Chatterbox. Padrão idêntico ao Kokoro (`from kokoro import KPipeline` dentro de `_create_kokoro_engine`).
**Example:**

```python
# Source: padrão existente em tts.py linha ~220 (_create_kokoro_engine)
def _create_chatterbox_engine(config: JarvisConfig, device: str) -> Any:
    """Instancia ChatterboxMultilingualTTS no device escolhido.

    Args:
        config: JarvisConfig (não usa campos por enquanto — futuro: cloned_voice_path em Phase 87)
        device: "cuda" | "mps" | "directml" | "cpu"

    Returns:
        Instância de ChatterboxMultilingualTTS pronta para .generate()

    Raises:
        ImportError: se chatterbox-tts não estiver instalado (handled em init_tts)
        RuntimeError: se device escolhido falhar no load (handled na cascade)
    """
    import warnings
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # Lazy import (D-20)

    # DirectML precisa converter string → torch.device object
    if device == "directml":
        import torch_directml
        torch_device = torch_directml.device()
    else:
        torch_device = device  # "cuda" | "mps" | "cpu" são strings válidas

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return ChatterboxMultilingualTTS.from_pretrained(device=torch_device)
```

### Pattern 2: Cascade de Device em Loop Sequencial
**What:** Tentativa ordenada de devices, capturando RuntimeError em cada um.
**When to use:** Em `_create_chatterbox_engine` (durante warmup) — não em runtime (D-15: hot-swap descartado).

```python
def _detect_chatterbox_device() -> list[str]:
    """Retorna lista ordenada de devices disponíveis na cascade CUDA→MPS→DirectML→CPU.

    Pula devices que sequer importam (torch_directml indisponível, MPS sem build).
    Não tenta carregar modelo — só verifica disponibilidade básica.
    """
    import torch
    candidates = []

    # 1. CUDA (NVIDIA Linux/Windows, ROCm Linux com PyTorch ROCm build)
    if torch.cuda.is_available():
        candidates.append("cuda")

    # 2. MPS (macOS Apple Silicon)
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        candidates.append("mps")

    # 3. DirectML (AMD/Intel GPU no Windows)
    try:
        import torch_directml
        if torch_directml.device_count() > 0:
            candidates.append("directml")
    except ImportError:
        pass  # D-19: pacote opcional, ausência não é erro

    # 4. CPU (fallback universal)
    candidates.append("cpu")

    return candidates
```

### Pattern 3: Warmup Async via Thread Daemon + Event
**What:** `threading.Thread(daemon=True)` + `threading.Event` para sinalizar conclusão.
**When to use:** No final de `init_tts()` quando `config.tts_provider == "chatterbox"`, e em `set_provider("chatterbox")`.

```python
_chatterbox_warmup_event = threading.Event()

def _start_chatterbox_warmup(config: JarvisConfig) -> None:
    """Dispara warmup do Chatterbox em background thread (D-01).

    Se warmup já está rodando ou já completou, no-op idempotente.
    Cascade de device aplicada aqui (D-14): se primeiro device falhar,
    tenta próximo antes de marcar _chatterbox_available = False.
    """
    global _chatterbox_engine, _chatterbox_device, _chatterbox_available

    if _chatterbox_warmup_event.is_set():
        return  # Já aqueceu
    if _chatterbox_available is False:
        return  # D-09: ImportError detectado em sessão anterior

    def _warmup_worker():
        global _chatterbox_engine, _chatterbox_device, _chatterbox_available
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # Valida import (D-09)
        except ImportError:
            _console().print(
                "[TTS] Chatterbox não instalado. Rode: uv sync --extra chatterbox"
            )
            _chatterbox_available = False
            _chatterbox_warmup_event.set()  # Libera quem esperava (vai cair pra Kokoro)
            return

        devices = _detect_chatterbox_device()
        last_error = None
        for device in devices:
            try:
                _console().print(f"[TTS] Chatterbox: aquecendo ({device.upper()})...")
                engine = _create_chatterbox_engine(config, device)
                # D-03: warmup com texto mínimo PT-BR, áudio descartado
                _ = engine.generate(".", language_id="pt")
                with _lock:
                    _chatterbox_engine = engine
                    _chatterbox_device = device
                device_label = {"cuda": "GPU (CUDA)", "mps": "GPU (MPS)",
                                "directml": "GPU (DirectML)", "cpu": "CPU"}[device]
                _console().print(f"[TTS] Chatterbox: {device_label}. Pronto.")
                _chatterbox_warmup_event.set()
                return
            except Exception as exc:
                last_error = exc
                _console().print(f"[TTS] Chatterbox: {device} falhou ({type(exc).__name__}) — tentando próximo.")
                continue

        # Todos devices falharam (D-14 → cascade esgotada)
        _console().print(f"[TTS] Chatterbox indisponível ({last_error}) — usando Kokoro pela sessão.")
        _chatterbox_available = False
        _chatterbox_warmup_event.set()

    thread = threading.Thread(target=_warmup_worker, daemon=True, name="chatterbox-warmup")
    thread.start()
```

### Pattern 4: Bloqueio em `speak()` com Timeout
**What:** Em `_chatterbox_speak()`, aguardar `_chatterbox_warmup_event.wait(timeout=15)` antes de gerar.
**When to use:** Garante D-05 — usuário não troca de voz mid-fala.

```python
def _chatterbox_speak(text: str, config: JarvisConfig) -> None:
    """Análogo a _kokoro_speak para Chatterbox.

    Bloqueia até warmup completar (D-05). Se warmup ainda não disparou
    (provider mudou via set_provider), dispara antes de aguardar.
    """
    global _is_playing, _chatterbox_disabled, _chatterbox_engine

    if _chatterbox_disabled or _chatterbox_available is False:
        # D-08/D-09: já marcado como indisponível, vai direto pra Kokoro
        return _kokoro_speak(text, config)

    # Garantir que warmup já foi disparado
    if not _chatterbox_warmup_event.is_set() and _chatterbox_engine is None:
        _start_chatterbox_warmup(config)

    # D-05: bloquear 15s aguardando warmup
    if not _chatterbox_warmup_event.is_set():
        _console().print("[TTS] aguardando inicialização...")
        completed = _chatterbox_warmup_event.wait(timeout=15.0)
        if not completed:
            _console().print("[TTS] timeout aguardando Chatterbox — usando Kokoro.")
            return _kokoro_speak(text, config)

    # Re-checar disponibilidade após warmup
    if _chatterbox_engine is None or _chatterbox_disabled:
        return _kokoro_speak(text, config)

    import sounddevice as sd
    import numpy as np

    try:
        _stop_event.clear()
        from jarvis_desktop import ui as _ui
        _ui.set_state("speaking")     # D-24 / D-05 da Phase 75
        _is_playing = True

        # Geração síncrona (não há streaming nativo no Chatterbox)
        wav_tensor = _chatterbox_engine.generate(text, language_id="pt")

        # wav_tensor é torch.Tensor — converter para numpy float32
        # Forma típica: (1, N) ou (N,) — squeeze para 1D
        audio_data = wav_tensor.squeeze().cpu().numpy().astype(np.float32)

        if _stop_event.is_set():
            return

        _console().print("[TTS] falando (Chatterbox)...")
        sd.play(audio_data, samplerate=_CHATTERBOX_SAMPLE_RATE)
        # _stop_event é checado pelo stop_tts() que chama sd.stop()
        sd.wait()
        if _stop_event.is_set():
            sd.stop()

    except Exception as exc:
        # D-08: marca disabled pela sessão e cai pra Kokoro
        _chatterbox_disabled = True
        _console().print(f"[TTS] Chatterbox falhou ({type(exc).__name__}: {exc}) — usando Kokoro pela sessão.")
        _is_playing = False
        from jarvis_desktop import ui as _ui
        _ui.set_state("idle")
        return _kokoro_speak(text, config)
    finally:
        _is_playing = False
        from jarvis_desktop import ui as _ui
        _ui.set_state("idle")
```

### Anti-Patterns to Avoid

- **NÃO importar `chatterbox` no topo do módulo:** quebra o boot do JARVIS quando usuário não instalou o extras (`uv sync` sem `--extra chatterbox`). Sempre lazy import dentro das funções (D-20).
- **NÃO bloquear `init_tts()` esperando warmup:** D-01 manda thread daemon, retorno imediato. Bloquear quebra UX de startup.
- **NÃO chamar `engine.generate()` sem `language_id`:** o `ChatterboxMultilingualTTS.generate()` exige `language_id` como argumento posicional/kwarg. Sem ele, modelo gera English por default e PT-BR sai péssimo (ou erro).
- **NÃO usar `ChatterboxTTS` (English-only):** importar de `chatterbox.mtl_tts`, NÃO de `chatterbox.tts`. O multilingual é uma classe **separada**.
- **NÃO tentar `torch_directml.device()` quando `torch_directml.device_count() == 0`:** retorna device object inválido que crasha no load. Sempre checar `device_count() > 0`.
- **NÃO chamar `.numpy()` direto no tensor do Chatterbox sem `.cpu()`:** se o tensor está em GPU, `.numpy()` lança `TypeError`. Sempre `.cpu().numpy()`.
- **NÃO esquecer `.astype(np.float32)`:** sounddevice espera float32 explícito; torch pode retornar float64 dependendo do modelo.
- **NÃO mudar `config.tts_provider` no fallback (D-10):** o estado de degradação fica em `_chatterbox_disabled` (memória), nunca em disco.
- **NÃO usar `concurrent.futures.Future` em vez de `threading.Event`:** complexidade desnecessária — Event já suporta `.wait(timeout=15)` e `.is_set()` nativamente.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecção de GPU CUDA | `subprocess.run(["nvidia-smi"])` | `torch.cuda.is_available()` | Já é função padrão do torch, cobre ROCm também (PyTorch ROCm build expõe via mesma API) |
| Detecção de MPS | Verificação manual via `platform.system() == "Darwin"` | `torch.backends.mps.is_available() and torch.backends.mps.is_built()` | Apple Silicon vs Intel Mac não dá pra detectar só por sistema; precisa do check do torch |
| Detecção de DirectML | Tentar import bare | `try: import torch_directml; torch_directml.device_count() > 0` | `import torch_directml` pode importar mesmo sem GPU compatível — count é o que vale |
| Resample de áudio | scipy/librosa para 24kHz | **Nenhum** — Chatterbox já emite 24kHz nativo (S3GEN_SR=24000) | Confirmado no source — alinha com Kokoro, zero overhead |
| Conversão torch.Tensor → numpy | Loops em Python | `tensor.squeeze().cpu().numpy().astype(np.float32)` | One-liner padrão, otimizado em C |
| Bloqueio com timeout | `time.sleep` em loop checando flag | `threading.Event.wait(timeout=15.0)` | API padrão, retorna bool indicando se setado ou timeout |
| Thread em background sem cleanup | `multiprocessing.Process` | `threading.Thread(daemon=True)` | D-06: thread daemon morre com o processo, zero cleanup |
| Watermarking de áudio | Nada | `resemble-perth` (já dep do chatterbox) | Embutido — não precisamos remover/desabilitar; é silencioso e legalmente correto |
| Locking de singleton | `with threading.RLock()` + double-check verboso | `with _lock:` (existente) | Reusar `_lock` global de tts.py — mesmo pattern do Kokoro |

**Key insight:** O Chatterbox e o Kokoro convergem em **sample rate (24kHz) + numpy float32 + sounddevice**. Toda a infraestrutura de playback (`sd.play`, `sd.wait`, `sd.stop`, `_stop_event`, `set_state`) é **reaproveitada 100%**. O delta é só (1) factory de engine com cascade de device, (2) warmup async, (3) `_chatterbox_speak()` análogo. Resistir à tentação de criar abstrações comuns (`EmotionalTTSProvider`, etc.) — YAGNI confirmado no CONTEXT (deferred).

## Common Pitfalls

### Pitfall 1: `torch-directml` pin de torch incompatível
**What goes wrong:** `uv sync --extra chatterbox` falha com `error: incompatible torch versions`.
**Why it happens:** torch-directml 0.2.5.dev240914 pin **torch==2.4.1**, chatterbox-tts 0.1.7 pin **torch==2.6.0**.
**How to avoid:** Usar `[tool.uv] override-dependencies = ["torch==2.6.0", "torchvision==0.21.0"]`. DirectML funciona em runtime com torch 2.6.0 (confirmado por usuários Chatterbox-TTS-Server) mesmo com o pin desatualizado.
**Warning signs:** Erro de resolução do uv mencionando `torch` — não erro de import em runtime.

### Pitfall 2: `ChatterboxTTS` vs `ChatterboxMultilingualTTS` confusão
**What goes wrong:** Voz em PT-BR sai como sotaque inglês carregado ou erro `Unknown language`.
**Why it happens:** Há **duas classes diferentes** no mesmo pacote:
- `from chatterbox.tts import ChatterboxTTS` — English-only, NÃO aceita `language_id`
- `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` — multilingual, **exige** `language_id`
**How to avoid:** Para Phase 86, **sempre** importar `ChatterboxMultilingualTTS` de `chatterbox.mtl_tts` e passar `language_id="pt"` em todo `.generate()`.
**Warning signs:** Áudio gerado com sotaque errado mesmo com texto português; ou `KeyError: 'pt'` em runtime.

### Pitfall 3: Cold start de 5-10s na primeira inferência sem warmup
**What goes wrong:** Primeira `speak()` após `set_provider("chatterbox")` trava terminal por 5-10 segundos.
**Why it happens:** `ChatterboxMultilingualTTS.from_pretrained()` só carrega pesos; a **compilação JIT do grafo** acontece na primeira `.generate()`. Em GPU isso inclui kernel autotuning. CHTB-03 mandata warmup explícito.
**How to avoid:** Warmup obrigatório (D-01..D-06) com texto mínimo (`"."` ou `"olá"`), áudio descartado. Disparado de thread daemon no `init_tts()` ou `set_provider()`.
**Warning signs:** Métrica de primeira-fala muito acima de subsequentes (>3s vs <500ms).

### Pitfall 4: Tensor torch em GPU, `.numpy()` direto crasha
**What goes wrong:** `TypeError: can't convert cuda:0 device type tensor to numpy. Use Tensor.cpu() to copy the tensor to host memory first.`
**Why it happens:** Quando device é `cuda`/`mps`/`directml`, o tensor de output está em GPU memory. Numpy precisa CPU.
**How to avoid:** Sempre `wav_tensor.squeeze().cpu().numpy().astype(np.float32)` antes de passar pro sounddevice.
**Warning signs:** Crash imediato no primeiro `speak()` em máquina com GPU; teste em CPU passa.

### Pitfall 5: `_chatterbox_disabled` não resetado entre testes
**What goes wrong:** Teste de fallback marca `_chatterbox_disabled = True`; próximo teste assume Chatterbox disponível e falha.
**Why it happens:** Flag é módulo-level, persiste entre testes na mesma sessão pytest.
**How to avoid:** Fixture `autouse` que reseta `_chatterbox_engine`, `_chatterbox_disabled`, `_chatterbox_available`, e `_chatterbox_warmup_event.clear()` em `setup`/`teardown`. Padrão idêntico ao `tts_module._engine = None` já usado em `test_tts.py`.
**Warning signs:** Testes passam isoladamente (`pytest test_tts.py::test_X`) mas falham em batch.

### Pitfall 6: Warmup demora além do timeout de 15s (D-05)
**What goes wrong:** Primeira `speak()` cai pra Kokoro silenciosamente porque warmup demorou 18s em CPU.
**Why it happens:** Em CPU sem GPU, `from_pretrained` + primeira `generate(".")` pode passar de 15s em máquinas modestas.
**How to avoid:** D-05 é decisão **consciente** — preferir Kokoro a esperar mais. Mensagem de timeout deve ser clara: `[TTS] timeout aguardando Chatterbox — usando Kokoro.` Não estender o timeout sem nova decisão.
**Warning signs:** Em CPU-only, primeira fala sempre vai pra Kokoro mesmo com `tts_provider="chatterbox"`. Log mostra "[TTS] timeout aguardando Chatterbox".

### Pitfall 7: HuggingFace download de ~1GB na primeira execução
**What goes wrong:** Usuário roda primeiro `set_provider("chatterbox")` e o terminal trava ~5 minutos sem feedback.
**Why it happens:** `from_pretrained` baixa pesos do HuggingFace na primeira chamada. Modelo multilingual tem ~500M de parâmetros + componentes (s3gen, encoder) → ~800MB-1GB total. Hash `~/.cache/huggingface/hub/`.
**How to avoid:** Esta phase **não cobre** feedback de download (VCLONE-04 deferred). Aceitar limitação, mas adicionar print **antes** do `from_pretrained`: `[TTS] Chatterbox: baixando modelo na primeira execução (~800MB)...` Pode ser via `huggingface_hub.snapshot_download` com callback, mas é além do escopo.
**Warning signs:** Primeira `set_provider("chatterbox")` demora >1 minuto sem print de "aquecendo".

### Pitfall 8: `transformers==5.2.0` quebra outros usos do projeto
**What goes wrong:** `transformers 5.x` mudou API de `AutoTokenizer.from_pretrained` em vários pontos. Se outro código no projeto usa `transformers`, pode quebrar.
**Why it happens:** Chatterbox pin **exato** `transformers==5.2.0`. Se outro pacote pede `transformers<5`, conflito de resolução.
**How to avoid:** Auditar projeto: `grep -r "transformers" apps/desktop-py/ --include="*.py"`. Atualmente projeto não importa transformers diretamente (verificado: kokoro tem dep transitiva mas funciona com `transformers>=4.0`). Documentar pin em CLAUDE.md se conflito surgir.
**Warning signs:** ImportError ou AttributeError em outros módulos após `uv sync --extra chatterbox`.

## Code Examples

Exemplos verificados de source oficial:

### Inicialização básica do Chatterbox Multilingual (PT-BR)

```python
# Source: https://github.com/resemble-ai/chatterbox README + src/chatterbox/mtl_tts.py
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
# Gera tensor torch shape (1, N) em float32, sample rate model.sr (= 24000)
wav = model.generate("Olá, eu sou o JARVIS.", language_id="pt")
print(model.sr)  # 24000
```

### Generate signature completa (para referência futura — Phase 87/88)

```python
# Source: src/chatterbox/mtl_tts.py via Context7-style WebFetch
def generate(
    self,
    text,
    language_id,                  # OBRIGATÓRIO — "pt", "en", "es", etc.
    audio_prompt_path=None,       # Phase 87 (voice cloning)
    exaggeration=0.5,             # Phase 88 (emotion control) — range 0.0–2.0
    cfg_weight=0.5,               # Phase 88 (emotion control)
    temperature=0.8,
    repetition_penalty=1.2,
    min_p=0.05,
    top_p=1.0,
)
# Returns: torch.Tensor com forma (1, N), dtype float32, faixa [-1, 1]
```

### Cascade de device com fallback gracioso

```python
# Padrão sintetizado a partir de docs torch + chatterbox MPS fallback interno
import torch

def _safe_load_chatterbox(text="."):
    """Tenta cada device da cascade; retorna (engine, device_label) ou levanta."""
    candidates = []
    if torch.cuda.is_available():
        candidates.append(("cuda", "GPU (CUDA)"))
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        candidates.append(("mps", "GPU (MPS)"))
    try:
        import torch_directml
        if torch_directml.device_count() > 0:
            candidates.append(("directml", "GPU (DirectML)"))
    except ImportError:
        pass
    candidates.append(("cpu", "CPU"))

    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    last_exc = None
    for device, label in candidates:
        try:
            torch_device = (
                __import__("torch_directml").device()
                if device == "directml" else device
            )
            engine = ChatterboxMultilingualTTS.from_pretrained(device=torch_device)
            # Smoke test — descarta áudio
            _ = engine.generate(text, language_id="pt")
            return engine, label
        except Exception as exc:
            last_exc = exc
            continue
    raise RuntimeError(f"Nenhum device suportado pelo Chatterbox: {last_exc}")
```

### Test mock pattern (análogo a `mock_kokoro_engine`)

```python
# apps/desktop-py/tests/conftest.py — adicionar fixture
import pytest
import threading
import unittest.mock


@pytest.fixture
def mock_chatterbox_engine(monkeypatch):
    """Mock para _create_chatterbox_engine — não importa torch nem chatterbox.

    Retorna mock que .generate() devolve numpy array float32 24kHz curto.
    """
    import numpy as np
    fake_audio = np.zeros(2400, dtype=np.float32)  # 100ms de silêncio @ 24kHz

    class FakeTensor:
        def squeeze(self): return self
        def cpu(self): return self
        def numpy(self): return fake_audio

    mock_engine = unittest.mock.MagicMock()
    mock_engine.generate.return_value = FakeTensor()
    mock_engine.sr = 24000

    def fake_factory(config, device):
        return mock_engine

    from jarvis_desktop import tts as tts_module
    monkeypatch.setattr(tts_module, "_create_chatterbox_engine", fake_factory)
    # Reset de state entre testes
    tts_module._chatterbox_engine = None
    tts_module._chatterbox_disabled = False
    tts_module._chatterbox_available = None
    tts_module._chatterbox_warmup_event = threading.Event()
    yield mock_engine
    # Cleanup
    tts_module._chatterbox_engine = None
    tts_module._chatterbox_disabled = False
```

## Runtime State Inventory

> Phase 86 é **integração de novo provider opcional** — não é rename/refactor. Inventário abaixo é minimalista mas explícito.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None — verificado:** `~/.jarvis/config.json` adiciona valor `"chatterbox"` ao campo existente `tts_provider`. Sem nova chave, sem migração. | None |
| Live service config | **None — verificado:** Chatterbox roda local (sem serviço externo). HuggingFace cache em `~/.cache/huggingface/hub/` é gerenciado pelo `transformers`, não pelo nosso código. | None |
| OS-registered state | **None — verificado:** nenhum daemon, nenhum systemd unit, nenhuma entrada de PATH. | None |
| Secrets/env vars | **None — verificado:** Chatterbox é offline, sem API key. Não há `CHATTERBOX_API_KEY` nem env var. | None |
| Build artifacts | **Atenção:** após `uv sync --extra chatterbox`, `uv.lock` muda significativamente. Commit do `uv.lock` é obrigatório. HuggingFace cache (~800MB) fica em `~/.cache/huggingface/` — **não commitar**, é local-machine state. | Commit `uv.lock` atualizado |

## Environment Availability

> Phase 86 introduz **novas** dependências que precisam ser auditadas no ambiente alvo (PC do usuário — Windows com AMD GPU).

| Dependency | Required By | Available no ambiente típico | Version alvo | Fallback |
|------------|-------------|------------------------------|--------------|----------|
| Python 3.12 | Tudo | ✓ (já requerido pelo pyproject.toml) | >=3.12 | — |
| torch (qualquer) | Já instalado via kokoro | ✓ | 2.6.0 alvo (upgrade se em 2.4.x) | — |
| torch CUDA build | Cascade device CUDA | Depende — usuário tem AMD GPU, então NÃO | n/a | MPS → DirectML → CPU |
| torch ROCm build | Cascade device CUDA (via mesma API torch.cuda) | Depende — usuário em Windows, ROCm é Linux-only | n/a | DirectML |
| torch-directml | Cascade device DirectML | Precisa instalar (Windows AMD GPU = caso do usuário) | 0.2.5.dev240914 | CPU |
| chatterbox-tts | Provider novo | Precisa instalar via `--extra chatterbox` | 0.1.7 | Kokoro |
| HuggingFace download (~800MB) | Primeira execução do `from_pretrained` | Requer internet | n/a | Fail → Kokoro (D-09 trata como Exception) |
| espeak-ng (Linux) | Kokoro fallback (sem mudança) | Já documentado em CLAUDE.md | apt install | — |

**Missing dependencies with no fallback:**
- **HuggingFace internet access** na primeira execução é bloqueante para Chatterbox. Se usuário está offline na primeira instalação, vai cair em Kokoro silenciosamente (D-09 ou erro de timeout). Aceitável — Kokoro funciona sem internet.

**Missing dependencies with fallback:**
- CUDA não disponível (AMD GPU): cascade tenta DirectML → CPU.
- DirectML não instalado: cascade pula para CPU.
- Chatterbox não instalado: D-09 cobre — fallback Kokoro pela sessão.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23.x (definido em `[project.optional-dependencies].dev` e `[dependency-groups].dev`) |
| Config file | `apps/desktop-py/pyproject.toml` seção `[tool.pytest.ini_options]` — `testpaths = ["tests"]`, `asyncio_mode = "auto"` |
| Quick run command | `cd apps/desktop-py && uv run pytest tests/test_tts.py -x --tb=short` |
| Full suite command | `cd apps/desktop-py && uv run pytest -x --tb=short` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHTB-01 | `set_provider("chatterbox")` aceita string, dispara warmup, salva config | unit | `uv run pytest tests/test_tts.py::test_set_provider_chatterbox -x` | ❌ Wave 0 |
| CHTB-01 | Cascade detecta CUDA quando `torch.cuda.is_available() == True` | unit | `uv run pytest tests/test_tts.py::test_detect_device_cuda -x` | ❌ Wave 0 |
| CHTB-01 | Cascade pula para MPS quando CUDA indisponível | unit | `uv run pytest tests/test_tts.py::test_detect_device_mps_fallback -x` | ❌ Wave 0 |
| CHTB-01 | Cascade pula para CPU quando nenhum GPU disponível | unit | `uv run pytest tests/test_tts.py::test_detect_device_cpu_only -x` | ❌ Wave 0 |
| CHTB-01 | `ImportError` em `set_provider("chatterbox")` recusa graciosamente sem alterar config (D-09, D-11) | unit | `uv run pytest tests/test_tts.py::test_set_provider_chatterbox_import_error -x` | ❌ Wave 0 |
| CHTB-02 | `uv sync --extra chatterbox` resolve sem erro (faster-whisper continua funcional) | integration (manual + CI) | `cd apps/desktop-py && uv sync --extra chatterbox && uv run python -c "from faster_whisper import WhisperModel; print('ok')"` | ❌ Wave 0 — script novo |
| CHTB-03 | Warmup async não bloqueia `init_tts()` (retorna em <100ms) | unit | `uv run pytest tests/test_tts.py::test_init_tts_warmup_non_blocking -x` | ❌ Wave 0 |
| CHTB-03 | Warmup completa e `_chatterbox_warmup_event` é setado | unit | `uv run pytest tests/test_tts.py::test_warmup_completes_event_set -x` | ❌ Wave 0 |
| CHTB-03 | Warmup só dispara se `tts_provider == "chatterbox"` (D-02) | unit | `uv run pytest tests/test_tts.py::test_warmup_skipped_when_kokoro_provider -x` | ❌ Wave 0 |
| CHTB-03 | `speak()` antes do warmup terminar bloqueia até 15s e mostra mensagem (D-05) | unit | `uv run pytest tests/test_tts.py::test_speak_waits_for_warmup -x` | ❌ Wave 0 |
| CHTB-03 | `speak()` faz timeout em 15s se warmup travar e cai pra Kokoro | unit | `uv run pytest tests/test_tts.py::test_speak_warmup_timeout_falls_back -x` | ❌ Wave 0 |
| CHTB-04 | Erro em runtime durante `speak()` marca `_chatterbox_disabled = True` e usa Kokoro (D-08) | unit | `uv run pytest tests/test_tts.py::test_chatterbox_runtime_error_fallback -x` | ❌ Wave 0 |
| CHTB-04 | `_chatterbox_disabled = True` persiste — próxima `speak()` vai direto pra Kokoro sem tentar | unit | `uv run pytest tests/test_tts.py::test_chatterbox_disabled_stays_disabled -x` | ❌ Wave 0 |
| CHTB-04 | Cascade tenta próximo device no warmup quando primeiro falha (D-14) | unit | `uv run pytest tests/test_tts.py::test_warmup_device_cascade -x` | ❌ Wave 0 |
| CHTB-04 | `config.tts_provider` NÃO é alterado em disco após fallback (D-10) | unit | `uv run pytest tests/test_tts.py::test_fallback_does_not_persist_config_change -x` | ❌ Wave 0 |
| CHTB-04 | `ImportError` marca `_chatterbox_available = False` para sessão inteira (D-09) | unit | `uv run pytest tests/test_tts.py::test_import_error_disables_session -x` | ❌ Wave 0 |
| (smoke) | Real install + warmup + speak em CPU local (não automatizável em CI sem GPU) | manual E2E | `cd apps/desktop-py && uv sync --extra chatterbox && uv run python -c "from jarvis_desktop.config import JarvisConfig; from jarvis_desktop.tts import init_tts, speak; c = JarvisConfig(tts_provider='chatterbox'); init_tts(c); import time; time.sleep(20); speak('Olá, eu sou o JARVIS.', c)"` | ❌ Manual |

### Sampling Rate
- **Per task commit:** `cd apps/desktop-py && uv run pytest tests/test_tts.py -x --tb=short` (target: <10s)
- **Per wave merge:** `cd apps/desktop-py && uv run pytest -x --tb=short` (suite completa)
- **Phase gate:** Suite completa verde + smoke manual rodado em ao menos um device (CPU mínimo)

### Wave 0 Gaps
- [ ] `tests/test_tts.py` — adicionar ~16 novos testes mapeados acima (estender arquivo existente, não substituir)
- [ ] `tests/conftest.py` — adicionar fixture `mock_chatterbox_engine` (análoga a `mock_kokoro_engine`) e fixture `autouse` que reseta state de Chatterbox entre testes
- [ ] `tests/conftest.py` — adicionar fixtures `mock_torch_no_gpu`, `mock_torch_cuda`, `mock_torch_mps`, `mock_torch_directml` para isolar testes de cascade do hardware real do CI
- [ ] Framework install: ✅ pytest e pytest-asyncio já instalados (`[dependency-groups].dev`)
- [ ] Script de smoke integration: criar `scripts/smoke_chatterbox_install.sh` (ou comando no Makefile) para CI validar que `uv sync --extra chatterbox` resolve sem erro

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pyttsx3` (SAPI/espeak wrapper) | `kokoro` (neural, offline, 24kHz) | Phase 62 (v3.0) | Qualidade dramática; já consolidado no projeto |
| `kokoro` PT-BR only com 3 vozes (Phase 85) | `chatterbox-tts` multilingual com voice cloning + emotion control (Phase 86-88) | Esta phase | Voice cloning + emoção sob demanda; Kokoro permanece como fallback offline |
| Instalação clean `pip install <pkg>` | `pip install <pkg> --no-deps` + deps manuais | 2025-2026 ecosystem | Comunidade de inference (ComfyUI, Chatterbox-TTS-Server, StableDiffusion) padronizou `--no-deps` para evitar downgrade de torch entre projetos que coexistem |
| `chatterbox` 0.1.x English-only via `from chatterbox.tts import ChatterboxTTS` | `chatterbox` 0.1.5+ multilingual via `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` | Versão 0.1.5 (2025-12-12) | 23 idiomas incluindo PT — required para JARVIS PT-BR |

**Deprecated/outdated (não usar):**
- `pyttsx3` — projeto continua mantido mas qualidade não compete com neural TTS
- `Coqui TTS` — projeto **arquivado** em 2024, sem fixes de segurança
- `ChatterboxTTS` (não-multilingual) — não suporta `language_id`, gera English com sotaque random em outros idiomas

## Assumptions Log

> Lista de claims tagged `[ASSUMED]` — itens que ainda não foram empiricamente validados nesta sessão de research e devem ser confirmados durante implementação.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `torch-directml==0.2.5.dev240914` funciona em runtime com `torch==2.6.0` instalado via `--no-deps` | Standard Stack / Pitfall 1 | Se falhar, fallback é CPU (D-12) — usuário com AMD GPU no Windows roda em CPU lento. Mitigation: validar primeiro com smoke test antes de merge final. Backup plan: pin torch em 2.4.1 e instalar chatterbox-tts com `--no-deps` aceitando a versão menor de torch (chatterbox tipicamente funciona com torch 2.4+) |
| A2 | `ChatterboxMultilingualTTS.from_pretrained(device="cuda")` aceita string `"directml"`? Ou requer `torch.device` object retornado por `torch_directml.device()`? | Pattern 1 / Code Example | Provavelmente requer device object para DirectML (não string). A função `from_pretrained` no source faz `t = torch.device(device)` internamente — `"directml"` não é device type válido no torch padrão. **Solução já incorporada no code example:** passar `torch_directml.device()` em vez de string. |
| A3 | Texto `"."` (ponto) é suficiente para warmup completo, ou Chatterbox rejeita texto vazio/muito curto? | Pattern 3 (warmup) | Se rejeitar com erro, warmup falha e cai na cascade. **Mitigation:** usar `"olá"` (3 caracteres) como texto de warmup — universalmente aceito. Decisão D-03 dá discricionariedade. |
| A4 | `wav_tensor.squeeze().cpu().numpy().astype(np.float32)` resulta em forma 1D compatível com `sounddevice.play()` | Pattern 4 (_chatterbox_speak) | Se forma for (N, 1) em vez de (N,), sounddevice pode interpretar como stereo. Mitigation: testar com `audio_data.ndim` assert no test mock. |
| A5 | `transformers==5.2.0` não quebra `kokoro` (que pode ter dep transitiva de transformers <5) | Pitfall 8 | Verificado em PyPI que kokoro não pin transformers; baseia-se em torch + soundfile. Risco baixo, mas precisa smoke test após install. |
| A6 | Tempo de warmup em CPU < 15s para textos curtos como "olá" | Pitfall 6 / D-05 | Em CPU lento (laptop antigo), warmup pode passar de 15s. Mitigation: D-05 explicitamente aceita timeout → fallback Kokoro. Usuário ainda tem voz, só não tem Chatterbox naquela sessão. |
| A7 | `uv` com `override-dependencies` substituindo `torch==2.4.1` por `torch==2.6.0` é honrado quando o pacote pinning é `torch-directml` (transitive) | Standard Stack / Installation | Documentação do uv confirma comportamento de override aplica-se a deps transitivas. Não testado neste research. Backup: documentar comando manual `uv pip install --no-deps` em README. |

**Se esta tabela estivesse vazia:** todos os claims teriam sido verificados. Como há 7 assumptions, **planner e discuss-phase devem confirmar** especialmente A1, A2 e A7 (impactam empacotamento) antes de execução final.

## Open Questions (RESOLVED)

1. **`torch-directml` com `torch==2.6.0`: realmente funciona?**
   - O que sabemos: Comunidade Chatterbox-TTS-Server documenta esse setup. PyPI metadata mostra pin estrito `torch==2.4.1`.
   - O que está em aberto: Funcionalidade em runtime — não testamos na máquina alvo.
   - Recomendação: **Smoke test obrigatório** na máquina Windows AMD do usuário **antes** de declarar Phase 86 verde. Se falhar, plan B é pinar torch em 2.4.1 (perde alguns ganhos do 2.6 mas resolve).

2. **Granularidade dos logs durante warmup**
   - O que sabemos: D-23 manda só print no console (`[TTS] Chatterbox: aquecendo (CUDA)...` e depois `[TTS] Pronto.`).
   - O que está em aberto: Deve haver progresso de download HuggingFace? VCLONE-04 é deferred.
   - Recomendação: Phase 86 entrega só os 2 prints decididos. Progresso de download fica para Future.

3. **Comportamento de `_stop_event` durante `engine.generate()`**
   - O que sabemos: Chatterbox `generate()` é **síncrono e não-interruptível** (não tem callback, não tem yield).
   - O que está em aberto: Se usuário aperta PTT durante geração (5-10s de inferência), `stop_tts()` consegue interromper?
   - Recomendação: **NÃO consegue interromper a geração em si** — só o playback. Mitigation aceitável: aceitar latência de stop (até o áudio completo gerar, então sd.stop interrompe playback). Documentar como limitação conhecida. Quem precisa de stop instantâneo continua no Kokoro (que tem chunking nativo).

4. **`override-dependencies` no `[tool.uv]` afeta outras instalações?**
   - O que sabemos: O projeto já usa `override-dependencies` para `tflite-runtime`. Adicionar override de `torch` é precedente novo.
   - O que está em aberto: Algum outro pacote do projeto exige torch <2.6?
   - Recomendação: `grep -r "torch" apps/desktop-py/uv.lock` antes de aplicar override. Auditoria rápida durante Wave 0.

## Security Domain

> `security_enforcement` não está explicitamente desabilitado em `.planning/config.json`. Aplicável.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | TTS local, sem auth |
| V3 Session Management | no | TTS local, sem sessão |
| V4 Access Control | no | Operação local-only |
| V5 Input Validation | yes | Texto vai pro `engine.generate(text, language_id="pt")`. Não há injection clássico (não é shell, não é SQL), mas há **prompt injection** potencial em emotion tags (Phase 88) |
| V6 Cryptography | partial | Modelo baixado de HuggingFace via HTTPS — depende do `huggingface_hub` que valida certs |
| V7 Error Handling & Logging | yes | Mensagens de erro `[TTS] Chatterbox falhou (...)` não vazam paths ou stack traces sensíveis. Usar `type(exc).__name__` em vez de stack completo (já no code example acima) |
| V8 Data Protection | yes | Privacidade — Chatterbox roda local, áudio nunca sai da máquina. Modelo cached em `~/.cache/huggingface/` é local-only |
| V12 Files and Resources | yes | Phase 87 (cloned_voice_path) — validação de path de arquivo. Phase 86 **não** lê arquivo de áudio do usuário (warmup com texto fixo). Fora do escopo desta phase. |
| V14 Configuration | yes | Não introduz nova chave em config (D-13). Persistência segue padrão Phase 78 (atomic write com `os.replace`). |

### Known Threat Patterns for {Python TTS local}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Modelo HuggingFace adulterado (supply chain) | Tampering | `huggingface_hub` valida hash do snapshot. Confiança no repo `ResembleAI/chatterbox` (5k+ stars, ativo). Phase 86 aceita risco implícito — futuro: pin commit hash via `revision=` em `from_pretrained` |
| Prompt injection via emoção (Phase 88) | Tampering | Phase 86 não trata — Phase 88 vai sanitizar tags `[unknown]` (EMOTE-02) |
| Resource exhaustion (texto gigante → OOM no modelo) | DoS | Phase 86 não limita tamanho de texto. Em prática, usuário fala com JARVIS — textos curtos. Mitigation futura: truncar texto >5000 chars antes de `generate()` |
| Path traversal em `audio_prompt_path` | Tampering | Phase 87 trata — fora do escopo Phase 86 |
| Watermarking removível | Integrity | Chatterbox embute Perth neural watermark — não tentar remover (eticamente recomendado pelo Resemble AI). Phase 86 mantém comportamento default. |

## Sources

### Primary (HIGH confidence)
- **PyPI chatterbox-tts 0.1.7** — `https://pypi.org/pypi/chatterbox-tts/json` — versão, dependências, upload 2026-03-26 (verificado 2026-05-28)
- **PyPI torch-directml 0.2.5.dev240914** — `https://pypi.org/pypi/torch-directml/json` — versão, pin `torch==2.4.1`, classifiers
- **PyPI ctranslate2 4.7.2** — `https://pypi.org/pypi/ctranslate2/json` — requires_dist (só numpy + pyyaml, **zero torch pin**)
- **PyPI faster-whisper 1.2.1** — `https://pypi.org/pypi/faster-whisper/1.2.1/json` — confirmação `ctranslate2<5,>=4.0`
- **Source Chatterbox `src/chatterbox/tts.py`** — `https://raw.githubusercontent.com/resemble-ai/chatterbox/master/src/chatterbox/tts.py` — API `ChatterboxTTS.from_pretrained(device)`, MPS fallback
- **Source Chatterbox `src/chatterbox/mtl_tts.py`** — `https://raw.githubusercontent.com/resemble-ai/chatterbox/master/src/chatterbox/mtl_tts.py` — API `ChatterboxMultilingualTTS`, lista de 23 idiomas, signature de `generate()`
- **Source Chatterbox `src/chatterbox/models/s3gen/const.py`** — `S3GEN_SR = 24000` confirmado

### Secondary (MEDIUM confidence)
- **Medium article "How I Got Chatterbox-TTS Running on an RTX 5070 (PyTorch 2.9 + CUDA 12.8)"** — `https://medium.com/@gideont/how-i-got-chatterbox-tts-running-on-an-rtx-5070-pytorch-2-9-cuda-12-8-afc92bb5c10b` — pattern `--no-deps` + manual deps + torch override
- **GitHub Chatterbox-TTS-Server (devnen)** — `https://github.com/devnen/Chatterbox-TTS-Server` — produção real com NVIDIA/AMD/CPU + DirectML; confirmation que `--no-deps` é padrão
- **GitHub Issue #116 (chatterbox)** — `https://github.com/resemble-ai/chatterbox/issues/116` — torch pin issue, Python >=3.9 requirement
- **GitHub Issue #340 (chatterbox)** — `https://github.com/resemble-ai/chatterbox/issues/340` — confirmação de conflito de deps pinned
- **Medium article "Voice Cloning on AMD Strix Halo"** — `https://medium.com/@bkpaine1/voice-cloning-on-amd-strix-halo-running-chatterbox-tts-with-native-gpu-acceleration-fa4a3db5e82c` — DirectML em produção com Chatterbox

### Tertiary (LOW confidence — usar com cautela)
- **Resemble AI Chatterbox blog** — `https://www.resemble.ai/chatterbox/` — claims de latência (sub-200ms) provavelmente steady-state em GPU rápida, não cold-start
- **TTS Wiki** — `https://tts.wiki/index.php/Chatterbox` — info ecosystem, sem versionamento confiável

## Metadata

**Confidence breakdown:**
- Standard stack (chatterbox-tts 0.1.7, torch 2.6.0): **HIGH** — verificado via PyPI JSON API em 2026-05-28
- API surface (`ChatterboxMultilingualTTS`, `generate(text, language_id="pt")`): **HIGH** — leitura direta do source no GitHub
- Sample rate 24000: **HIGH** — confirmado no source `S3GEN_SR = 24000`
- Cascade de device (CUDA→MPS→DirectML→CPU): **HIGH** — APIs padrão do PyTorch + torch-directml
- Estratégia `--no-deps` + override torch: **MEDIUM** — confirmado por múltiplos artigos community 2025-2026, mas não testado nesta sessão
- `torch-directml` com torch 2.6.0 em runtime: **MEDIUM** — citado pela comunidade Chatterbox-TTS-Server, não verificado in-house
- Warmup texto mínimo `"."` aceitável: **LOW (A3)** — não testado. Mitigation: usar `"olá"`
- Tempo de warmup <15s em CPU típico: **LOW (A6)** — não medido. D-05 já cobre o pior caso

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (Chatterbox é projeto ativo — releases mensais). Re-verificar versão antes de qualquer phase v3.6+. Em particular `chatterbox-tts` 0.1.8+ pode mudar pinning de torch ou unificar `ChatterboxTTS` e `ChatterboxMultilingualTTS` em uma classe só.
