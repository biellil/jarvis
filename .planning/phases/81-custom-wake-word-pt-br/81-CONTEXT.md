# Phase 81: Custom Wake Word pt-BR - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Script interativo (`train_wake_word.py`) que guia o usuário a gravar 20–50 amostras de "ei jarvis", treina um modelo openwakeword customizado e o instala automaticamente em `~/.jarvis/models/wake_word_custom.onnx`. `voice_modes.py` detecta e carrega o modelo customizado no startup se presente.

**No escopo:** WAKE-01 (script via `uv run`, venv isolado), WAKE-02 (gravação interativa de amostras), WAKE-03 (modelo instalado em `~/.jarvis/models/`), WAKE-04 (detecção automática em `voice_modes.py`), WAKE-05 (auto-calibração de threshold).
**Fora do escopo:** Suporte a múltiplos wake words, GUI para o script de treino, retreino incremental sem re-executar o script.

</domain>

<decisions>
## Implementation Decisions

### Training Approach (WAKE-01, WAKE-05)
- **D-01:** Approach auto-detect + branch em duas etapas:
  1. **Calibração inicial:** Script roda as gravações do usuário pelo `hey_jarvis_v0.1.onnx` existente e mede os scores. Se mediana > 0.25 → path do verifier. Se < 0.25 → path do Colab.
  2. **Verifier path (principal):** Treina um modelo logistic regression (scikit-learn) sobre os embeddings do ACAV100M feature extractor do openwakeword, usando as gravações positivas + corpus negativo. Output: `.pkl` salvo junto com o `.onnx` do feature extractor — integração via wrapper que combina `hey_jarvis_v0.1.onnx` score + verifier score.
  3. **Colab fallback:** Se scores base < 0.25, exibe mensagem clara com URL do notebook Colab (openwakeword official training notebook) + instruções para copiar o `.onnx` gerado para `~/.jarvis/models/wake_word_custom.onnx`.
- **D-02:** O threshold de detecção é auto-calibrado durante o treino com base na taxa de falsos positivos medida no corpus negativo (WAKE-05). O valor calibrado é salvo em `~/.jarvis/config.json` como `wake_word_threshold`.

### Recording UX (WAKE-02)
- **D-03:** Countdown + auto-stop: "Gravando em 3...2...1... fale agora" com janela de 2.5s via `sounddevice` (já no stack). Rich Live panel com animação de countdown.
- **D-04:** Flag `--ptt` disponível para quem quiser controle manual (pressiona tecla, grava, solta — usa `msvcrt.getwch()` no Windows, stdlib pura).
- **D-05:** Feedback por amostra: RMS do áudio exibido após cada gravação para indicar se o microfone capturou sinal adequado ("✓ Amostra 3/30 — sinal: boa" vs "⚠ Sinal fraco — repita").
- **D-06:** Mínimo de 20 amostras para iniciar treino; recomendado 30–50. Script avisa mas não bloqueia após mínimo.

### Negative Corpus (WAKE-05, treino)
- **D-07:** Corpus híbrido em duas camadas:
  1. **AudioSet/FMA slice** (~1-2 GB): fetch automático na primeira execução, cached em `~/.jarvis/cache/negative_corpus/`. Idempotente (verifica se já existe antes de baixar). Segue o mesmo padrão do notebook oficial do openwakeword.
  2. **Gravação ao vivo** (5 min): script captura ruído ambiente do usuário via sounddevice após a sessão de gravação de amostras positivas. Exibido como "Agora vamos capturar o ruído do seu ambiente (5 min — pode falar, ligar TV, etc.)".
- **D-08:** Corpus negativo gerado via TTS (kokoro) com frases pt-BR próximas ("olá jarvis", "google", "alexa", "tudo bem") como camada adicional. Kokoro já no stack — zero deps novas.

### Script Isolation (WAKE-01)
- **D-09:** PEP 723 inline script metadata no topo de `train_wake_word.py`:
  ```python
  # /// script
  # requires-python = ">=3.10"
  # dependencies = [
  #   "torch>=2.0",
  #   "scikit-learn>=1.3",
  #   "openwakeword==0.6.0",
  #   "sounddevice==0.5.5",
  #   "rich>=13.0",
  #   "scipy>=1.10",
  #   "onnx>=1.14",
  #   "numpy>=1.24",
  # ]
  # ///
  ```
  Usuário executa: `uv run apps/desktop-py/tools/train_wake_word.py`
  uv cria venv isolado automaticamente, sem tocar em `apps/desktop-py/.venv/`.

### Integration in voice_modes.py (WAKE-04)
- **D-10:** `_wake_word_loop` verifica `~/.jarvis/models/wake_word_custom.onnx` e `~/.jarvis/models/wake_word_custom.pkl` no startup. Se ambos presentes → carrega modelo customizado + verifier. Se ausente → usa `hey_jarvis_v0.1.onnx` padrão. Nenhum novo campo de config necessário — detecção 100% por path.
- **D-11:** Log no terminal indica qual modelo está em uso: `[VOICE] Modelo customizado carregado (ei jarvis pt-BR)` ou `[VOICE] Usando modelo padrão (hey jarvis en)`.

### Claude's Discretion
- Threshold exato de mediana para o branch decision (0.25 pode ser ajustado baseado em testes)
- URLs exatas para download do AudioSet/FMA slice (seguir o que o openwakeword notebook usa)
- Arquitetura exata do verifier (logistic regression vs. SVM vs. gradient boosting — sklearn decide o melhor fit)
- Número exato de chunks do feature extractor ACAV100M usados como input do verifier
- Formato do arquivo `.pkl` e como é carregado ao lado do `.onnx`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### openwakeword stack
- `CLAUDE.md` §Technology Stack — openwakeword 0.6.x, offline, onnxruntime cross-platform
- `CLAUDE.md` §What NOT to Use — PyAudio proibido; usar sounddevice
- `apps/desktop-py/.venv/Lib/site-packages/openwakeword/train.py` — API de treino do openwakeword (ver classe `Model` e método `train()`)
- `apps/desktop-py/.venv/Lib/site-packages/openwakeword/resources/models/hey_jarvis_v0.1.onnx` — modelo padrão atual a ser substituído

### Código existente de voice modes
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — `_wake_word_loop()` (linha ~231): onde D-10 é aplicado (path check + carregamento condicional)
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig.wake_word_threshold`: campo que D-02 atualiza via `save_config()`
- `apps/desktop-py/src/jarvis_desktop/stt.py` — padrão singleton; `_load_model_with_progress()` como referência de UX de carregamento

### Config e paths
- `apps/desktop-py/src/jarvis_desktop/config.py` — `save_config()` atomic write + `_config_file_path()` helper para `~/.jarvis/`
- `.planning/phases/78-voice-reliability-config/78-CONTEXT.md` — D-04: atomic save pattern; D-02: threshold field existente

### Script isolation
- PEP 723 spec — inline script metadata (`# /// script` block) suportado por uv 0.4+
- `apps/desktop-py/pyproject.toml` — deps atuais do venv principal (NÃO adicionar torch aqui)

No external training notebooks referenced — decisions fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `voice_modes.py:_wake_word_loop()`: ponto exato onde a detecção de modelo customizado deve ser inserida (D-10)
- `voice_modes.py:_always_listening_loop()`: pattern de `sd.InputStream` com chunk processing — reutilizar para gravação de samples no script
- `stt.py:_load_model_with_progress()`: rich progress bar para download — replicar UX no script de treino
- `config.py:save_config()`: atomic write já implementado — usar para salvar `wake_word_threshold` calibrado (D-02)
- `config.py:_config_file_path()`: retorna `~/.jarvis/config.json` — usar para derivar `~/.jarvis/models/` e `~/.jarvis/cache/`

### Established Patterns
- Módulo plano com singleton state (stt.py, tts.py, voice_modes.py) — `train_wake_word.py` é script standalone, não módulo
- `sounddevice.InputStream` com `blocksize=1280, samplerate=16000, dtype=np.float32` — manter para compatibilidade com openwakeword
- Rich Live panels para feedback em tempo real — usar para countdown e progress de treino
- `collections.deque` para buffers de áudio — padrão já estabelecido

### Integration Points
- `voice_modes.py:_wake_word_loop()` (linha ~248): substituir hardcoded `wakeword_models=["hey_jarvis"]` por lógica de detecção de modelo customizado
- `~/.jarvis/models/` (novo diretório): criado pelo script de treino, detectado automaticamente por `voice_modes.py`
- `~/.jarvis/cache/negative_corpus/` (novo diretório): cache para AudioSet/FMA, nunca no repo

</code_context>

<specifics>
## Specific Ideas

- O script deve exibir instruções em pt-BR ("Diga 'ei jarvis' com a sua voz normal, sem exagerar")
- Feedback de qualidade por amostra via RMS (D-05) — evita que usuário grave amostras com microfone desligado sem perceber
- Colab fallback deve ser apresentado como "opção avançada" com tom positivo, não como falha
- O verifier precisa produzir um `.onnx` válido (não apenas `.pkl`) para manter consistência com WAKE-03 — converter sklearn model para ONNX via `skl2onnx` ou `sklearn-onnx`

</specifics>

<deferred>
## Deferred Ideas

- Retreino incremental (adicionar amostras sem refazer todo o processo) — milestone futuro
- GUI Electron para o script de treino — fora do escopo, WAKE-01 especifica terminal
- Suporte a múltiplos wake words customizados — v3.4+
- Auto-retreino agendado com novas amostras coletadas passivamente — projeto futuro

</deferred>

---

*Phase: 81-custom-wake-word-pt-br*
*Context gathered: 2026-05-21*
