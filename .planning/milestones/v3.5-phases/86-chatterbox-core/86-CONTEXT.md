# Phase 86: Chatterbox Core - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar **Chatterbox** como provider TTS adicional em `tts.py`, instalável sem quebrar `faster-whisper`/`ctranslate2`, com **warmup** na inicialização (ou na seleção via `/config`) e **fallback automático para Kokoro** em qualquer erro do Chatterbox.

**Dentro do escopo:**
- Novo branch de provider em `tts.py` (`tts_provider == "chatterbox"`)
- Detecção automática de device (CUDA → MPS → DirectML → CPU)
- Warmup assíncrono em background thread quando provider for chatterbox
- Fallback de sessão para Kokoro quando Chatterbox falha
- Suporte a hardware AMD (Windows via DirectML) e Apple Silicon (MPS) além de NVIDIA (CUDA)
- Empacotamento (`pyproject.toml` extra opcional, instalação via `--no-deps` com torch pinned)

**Fora do escopo (outras fases):**
- Voice cloning com `audio_prompt_path` — Phase 87 (VCLONE-01/02/03)
- Emotion tags `[angry]` `[sad]` etc. — Phase 88 (EMOTE-01/02)
- Menu `/config` listando chatterbox como opção e input do arquivo de referência — Phase 88 (CFGUI-01/02)
- Slider de intensidade emocional, inferência automática de emoção, cache de speaker embedding — futuros (EMOTE-03/04, VCLONE-04/05)

</domain>

<decisions>
## Implementation Decisions

### Warmup

- **D-01:** Warmup roda em **`threading.Thread(daemon=True)`** em background. `init_tts()` retorna imediatamente — startup do JARVIS não bloqueia.
- **D-02:** Warmup **só dispara se `config.tts_provider == "chatterbox"`** no startup. Se usuário inicia em Kokoro e troca depois, warmup acontece no `set_provider("chatterbox")`.
- **D-03:** Texto do warmup: **frase curta fixa em PT-BR** (uma sílaba/palavra mínima como `"."` ou `"olá"`). Áudio gerado é **descartado** (não tocado via sounddevice).
- **D-04:** Warmup **não usa** `audio_prompt_path` (voice cloning). Phase 86 cobre só o modelo base — Phase 87 estende warmup para incluir referência de voz se necessário.
- **D-05:** Se `speak()` for chamado antes do warmup terminar, **bloqueia com timeout de 15s** aguardando warmup completar. UI mostra `[TTS] aguardando inicialização...`. Garante consistência (não troca voz entre falas).
- **D-06:** Shutdown durante warmup: thread daemon **morre com o processo**. Sem cleanup elegante, sem `join()`.

### Provider Selection e Persistência do Fallback

- **D-07:** Novo valor `"chatterbox"` adicionado ao set válido em `set_provider()`: `{"kokoro", "chatterbox", "elevenlabs", "murf", "none"}`.
- **D-08:** **Auto-switch permanente de sessão** quando Chatterbox falha: primeira falha runtime marca `_chatterbox_disabled = True` em memória; próximas `speak()` vão direto pra Kokoro até reiniciar. Evita repetir custo de tentativa falhada.
- **D-09:** **`ImportError` no `init_tts()`** ou no `set_provider("chatterbox")`: marca `_chatterbox_available = False` pela sessão inteira. Nem tenta de novo — mostra mensagem clara: `[TTS] Chatterbox não instalado. Rode: uv sync --extra chatterbox`.
- **D-10:** **`config.tts_provider` persistido em `~/.jarvis/config.json` NÃO é alterado** quando ocorre fallback. Estado de degradação fica só em memória. Próxima sessão tenta Chatterbox de novo. Usuário mantém controle do que escolheu.
- **D-11:** `set_provider("chatterbox")` quando módulo já detectou `ImportError`: **recusa com aviso claro**, não altera config, usuário continua no provider anterior.

### Device Detection (GPU/CPU)

- **D-12:** **Cascade de detecção:** `CUDA → MPS → DirectML → CPU`.
  - CUDA: `torch.cuda.is_available()` (NVIDIA Linux/Windows, ROCm Linux quando PyTorch ROCm build)
  - MPS: `torch.backends.mps.is_available()` (macOS Apple Silicon)
  - DirectML: `torch_directml.device()` se `torch_directml` importável (AMD/Intel GPUs no Windows)
  - CPU: fallback universal
- **D-13:** **Sem campo `chatterbox_device` no config** — só auto-detect na cascade fixa. Override fica como Future (não há necessidade imediata; usuário pode forçar via env var se desenvolvedores quiserem).
- **D-14:** **Cascade no erro de warmup:** se device escolhido falhar (OOM, op não suportada, runtime error), tenta **próximo device da cadeia** automaticamente antes de cair pra Kokoro. Exemplo: CUDA OOM → tenta CPU → se CPU também falhar → Chatterbox indisponível na sessão (D-08).
- **D-15:** **OOM ou erro em runtime (durante `speak()`)** trata como erro normal do Chatterbox: **fallback Kokoro pela sessão** (D-08). **Sem hot-swap** de device em runtime (CUDA→CPU em runtime exigiria recarregar modelo do disco, ~5-10s de espera mascarada — não vale a complexidade).
- **D-16:** **Vulkan NÃO entra na cascade.** PyTorch Vulkan backend é experimental e não cobre as ops do Chatterbox — adicionar Vulkan gastaria tempo no warmup com falha garantida.

### Packaging e Dependências

- **D-17:** `chatterbox-tts` (e dependências relacionadas) como **extra opcional** em `pyproject.toml`: `[project.optional-dependencies]` grupo `chatterbox`. Instalação: `uv sync --extra chatterbox` (ou equivalente).
- **D-18:** Para resolver conflito **torch ↔ ctranslate2** (faster-whisper): instalar Chatterbox via `--no-deps` e fixar `torch` na versão compatível com ambos (`ctranslate2 >=4.0`, `chatterbox` requer torch específico — verificar versão exata no research).
- **D-19:** `torch-directml` também como **extra opcional** dentro do mesmo grupo `chatterbox` (ou subgrupo `chatterbox-windows-amd`). Se não instalado, cascade pula DirectML sem erro.
- **D-20:** Imports `chatterbox`, `torch_directml` são **lazy** (dentro das funções), nunca no topo do módulo — mantém o padrão atual de `tts.py`.

### UX e Logging

- **D-21:** **Log curto no init** indicando device escolhido: `[TTS] Chatterbox: GPU (CUDA)` ou `[TTS] Chatterbox: GPU (MPS)` ou `[TTS] Chatterbox: GPU (DirectML)` ou `[TTS] Chatterbox: CPU`.
- **D-22:** Mensagens de erro/fallback usam **prefixo `[TTS]` consistente** com Phase 75. Mostra **motivo curto** do erro: `[TTS] Chatterbox falhou (CUDA OOM) — usando Kokoro pela sessão.`
- **D-23:** Indicação visual durante warmup: print no console (`[TTS] Chatterbox: aquecendo (CUDA)...` e depois `[TTS] Pronto.`). **Sem novo estado `ui.set_state("warming")`** — mantém apenas `speaking`/`idle` da Phase 75.

### Integração com Padrões Existentes

- **D-24:** Reusa todos os padrões do Phase 75:
  - `set_state("speaking")` antes da playback, `set_state("idle")` em `finally`
  - `_is_playing = True/False` para `is_speaking()`
  - `_stop_event` respeitado (Chatterbox precisa ter loop interno checando)
  - Sample rate alvo: 24kHz (resample se Chatterbox emitir outro)
  - Fallback silencioso para Kokoro em qualquer Exception
- **D-25:** `_chatterbox_engine` é singleton análogo a `_engine` (Kokoro) — separado para permitir warmup paralelo se ambos provedores estiverem ativos no futuro.

### Claude's Discretion

- Versão exata do `chatterbox-tts` e do `torch` pinned (researcher resolve via análise de compatibilidade com `ctranslate2 >=4.0`)
- Estrutura de erros internos (qual `Exception` específica para `_chatterbox_disabled` vs erros transitórios)
- Texto exato do warmup (uma palavra ou sílaba — qualquer coisa que aqueça o grafo)
- Estratégia de detecção de "warmup terminado" (Event, Future, ou flag booleana)
- Ordem exata de tentativa dentro da cascade no erro (ex: pular DirectML se CUDA falhou por OOM em vez de incompatibilidade)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Código existente do TTS
- `apps/desktop-py/src/jarvis_desktop/tts.py` — módulo TTS atual; padrões de `init_tts()`, `speak()`, `set_provider()`, `stop_tts()`, `is_speaking()`, fallback silencioso, lazy imports
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` com `tts_provider`, `kokoro_voice`, `cloned_voice_path`, `elevenlabs_api_key`, `murf_api_key`, `local_only`
- `apps/desktop-py/src/jarvis_desktop/ui.py` — `get_console()`, `set_state()` (estados existentes: `idle`, `speaking`, etc.)
- `apps/desktop-py/src/jarvis_desktop/chat.py` — chama `speak()` após stream SSE; menu `/config` (linha ~676)
- `apps/desktop-py/src/jarvis_desktop/setup_wizard.py` — fluxo de configuração inicial

### Empacotamento
- `apps/desktop-py/pyproject.toml` — deps atuais com `faster-whisper==1.2.1`, `kokoro>=0.9.4`, optional-dependencies pattern (já tem `voice-cloning` group como referência)
- `apps/desktop-py/uv.lock` — lock atual; Chatterbox vai exigir update controlado

### Testes
- `apps/desktop-py/tests/test_tts.py` — padrões de teste para o módulo TTS (monkeypatch de `_create_kokoro_engine`, `_kokoro_speak`, etc.)

### Decisões de fases anteriores
- `.planning/phases/75-text-to-speech-tts/75-CONTEXT.md` — decisões D-01 a D-12 do TTS base (Kokoro + ElevenLabs + Murf)
- `.planning/phases/85-clonagem-de-voz-kokoro/85-CONTEXT.md` — campo `cloned_voice_path` adicionado em config (consumido pela Phase 87)
- `.planning/REQUIREMENTS.md` — CHTB-01..04 (Phase 86), VCLONE-XX (Phase 87), EMOTE-XX/CFGUI-XX (Phase 88), Out of Scope
- `.planning/ROADMAP.md` — Phase 86 success criteria, dependências

### Arquivos de voz
- `apps/desktop-py/voices/Jarvis.mp3` — referência de voz para Phase 87 (não usada em Phase 86, mas presente no repo)

### Documentação externa (researcher deve consultar)
- `https://github.com/resemble-ai/chatterbox` — repositório oficial do Chatterbox; API, device handling, dependências
- `https://pypi.org/project/chatterbox-tts/` — versão exata e dependências declaradas
- `https://pytorch.org/docs/stable/notes/mps.html` — backend MPS para Apple Silicon
- `https://github.com/microsoft/DirectML/tree/master/PyTorch` ou `https://pypi.org/project/torch-directml/` — uso de DirectML em PyTorch (Windows AMD/Intel)
- `https://github.com/SYSTRAN/faster-whisper` — versão de `ctranslate2` exigida (resolver conflito de torch)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`tts.py:init_tts()`** — ponto de entrada para warmup; adicionar branch `if config.tts_provider == "chatterbox": _start_chatterbox_warmup(config)` em thread
- **`tts.py:speak()`** — branch atual seleciona provider; adicionar branch `if config.tts_provider == "chatterbox"` antes dos cloud providers
- **`tts.py:set_provider()`** — já trata reset de `_engine` (Kokoro); adicionar lógica análoga para `_chatterbox_engine` e disparar warmup async
- **`tts.py:stop_tts()`** — já é thread-safe; `_chatterbox_speak()` precisa respeitar `_stop_event` (chunked playback)
- **`tts.py:_create_kokoro_engine()`** — padrão de factory function isolada para mockar em testes; criar `_create_chatterbox_engine(config, device)` análogo
- **`tts.py:_kokoro_speak()`** — padrão completo de speak privado (set_state, _is_playing, _stop_event, finally); replicar para `_chatterbox_speak()`
- **`config.py:JarvisConfig`** — não precisa novo campo nesta phase (cascade fixa, sem override)
- **`pyproject.toml`** — `voice-cloning` extras group como template para `chatterbox` extras group

### Established Patterns
- **Lazy imports dentro das funções** — `from kokoro import KPipeline` dentro de `_create_kokoro_engine()`. Aplicar igual para `from chatterbox.tts import ChatterboxTTS` e `import torch_directml`.
- **Fallback silencioso com print** — qualquer Exception no provider → mensagem `[TTS] <provider> erro: ... — usando Kokoro` + chamada para `_kokoro_speak()`
- **Singleton com `_lock` (`threading.Lock`)** — proteger inicialização de engine; double-checked locking em `_kokoro_speak()`
- **`with _lock:` em `set_provider()`** — atomicidade ao trocar estado do engine
- **Sample rate 24kHz como padrão** — manter para Chatterbox; resample se modelo emitir 22kHz/16kHz/etc.
- **Test isolation via monkeypatch** — testes mockam `_create_kokoro_engine`; aplicar igual para `_create_chatterbox_engine`

### Integration Points
- **`init_tts(config)`** — adicionar branch para chatterbox warmup
- **`speak(text, config)`** — adicionar branch para `_chatterbox_speak()` antes dos cloud providers (Chatterbox é offline, prioridade igual a Kokoro)
- **`set_provider(provider, config)`** — aceitar `"chatterbox"`, validar import, disparar warmup
- **`is_speaking()`** — Chatterbox precisa atualizar `_is_playing` igual aos outros
- **`stop_tts()`** — nenhuma mudança; mas `_chatterbox_speak()` deve checar `_stop_event` durante geração e playback
- **`chat.py` menu `/config`** — sem mudança nesta phase; CFGUI-01 (listar chatterbox como opção visível) é Phase 88
- **`pyproject.toml`** — novo grupo `[project.optional-dependencies].chatterbox = ["chatterbox-tts", "torch-directml; sys_platform=='win32'"]` + ajustes de torch pin + comentário sobre `--no-deps`

</code_context>

<specifics>
## Specific Ideas

- Hardware do usuário: **AMD GPU no Windows** — daí a inclusão de DirectML na cascade. Sem DirectML, Chatterbox roda em CPU lento na máquina dele.
- Apple Silicon (MPS) também na cascade para cobrir usuários macOS.
- Vulkan foi pedido inicialmente mas eliminado após análise: PyTorch Vulkan não roda Chatterbox.
- Kokoro continua como provider padrão para PT-BR (Chatterbox tem PT-BR limitado). Chatterbox brilha em voice cloning + expressividade emocional (Phases 87-88).
- Avaliada troca de modelo (Fish Speech, OpenVoice v2, XTTS v2) — usuário optou por manter Chatterbox, com anotação para considerar alternativas em milestone futura caso PT-BR seja inaceitável.

</specifics>

<deferred>
## Deferred Ideas

- **Avaliar OpenVoice v2 ou Fish Speech** como provider TTS alternativo em milestone futura, caso PT-BR do Chatterbox seja inaceitável na prática.
- **Camada abstrata `EmotionalTTSProvider`** — interface comum para Chatterbox/Fish/OpenVoice. Não vale a pena agora (YAGNI); fazer só se segundo provider entrar.
- **`chatterbox_device` em config + override em `/config`** — campo para forçar device manualmente (`auto`, `cpu`, `cuda`, `mps`, `directml`). Adicionar se cascade auto-detect causar problemas na prática.
- **Override via env var `CHATTERBOX_DEVICE`** — alternativa mais escondida ao item acima.
- **Hot-swap CUDA→CPU em runtime** — recarregar Chatterbox em CPU sob demanda se CUDA OOM em runtime. Complexo, não vale a pena para Phase 86.
- **Cleanup elegante de thread de warmup no SIGINT** — daemon thread morre com processo basta.
- **Estado `ui.set_state("warming")`** — visibilidade do warmup em background. Print no console já cobre.
- **Slider de intensidade emocional** (EMOTE-03) — Future.
- **Inferência automática de emoção via LLM** (EMOTE-04) — Future.
- **Feedback de progresso de download do modelo ~800MB** (VCLONE-04) — Future.
- **Cache de speaker embedding entre sessões** (VCLONE-05) — Future.

</deferred>

---

*Phase: 86-identificacao-de-voz-speaker-recognition*
*Context gathered: 2026-05-28*
