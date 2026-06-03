# Phase 87: Voice Cloning - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS clona a voz de um arquivo de referência (`.wav`/`.mp3`) configurado pelo usuário, usando zero-shot voice cloning via `ChatterboxMultilingualTTS`. Inclui: campo config, validação de startup não-bloqueante, extração de speaker embedding no warmup e passagem implícita via `self.conds` em toda fala.

**Dentro do escopo:**
- Novo campo `chatterbox_audio_prompt_path` em `JarvisConfig`
- Validação de startup: arquivo existe, extensão `.wav`/`.mp3`, duração ≥5s via `soundfile.info()`
- Warmup chama `prepare_conditionals(path)` para pré-extrair speaker embedding
- `_chatterbox_speak()` chama `generate()` sem `audio_prompt_path` (confia em `self.conds` pré-carregado)
- Fallback para Kokoro se arquivo inválido ou ausente (não-bloqueante)

**Fora do escopo:**
- Menu `/config` para digitar o caminho (Phase 88, CFGUI-02)
- Chatterbox no provider list do `/config` (Phase 88, CFGUI-01)
- Emotion tags `[angry]` `[sad]` etc. (Phase 88, EMOTE-01/02)
- Cache de speaker embedding entre sessões (futuro, VCLONE-05)
- Múltiplos perfis de voz (futuro)

</domain>

<decisions>
## Implementation Decisions

### Config Field

- **D-01:** Novo campo `chatterbox_audio_prompt_path: str = Field(default="")` em `JarvisConfig`. Espelha exatamente o param `audio_prompt_path` da API Chatterbox; segue prefixo `chatterbox_*` das vars internas de `tts.py`. `str` com default `""` mantém consistência de tipo com os outros campos path do config (`cloned_voice_path`, etc.). Campo existente `cloned_voice_path` não é tocado (reservado para Kokoro `.pt`).

### Validação de Startup

- **D-02:** Validação usa `soundfile.info()` dentro de `_start_chatterbox_warmup()` (no `_warmup_worker`), antes de criar o engine. Já disponível como dep transitiva do kokoro, suporta WAV+MP3. Checagens em ordem:
  1. `os.path.isfile(path)` — arquivo existe
  2. `Path(path).suffix.lower() in {'.wav', '.mp3'}` — extensão válida
  3. `soundfile.info(path).duration >= 5.0` — duração mínima
- Qualquer falha: `_console().print("[TTS] Arquivo de referência inválido: <motivo> — usando Kokoro pela sessão.")`, setar `_chatterbox_available = False`, `_chatterbox_warmup_event.set()`. TTS cai para Kokoro sem travar.
- Se `chatterbox_audio_prompt_path` for `""` (ausente): Chatterbox funciona com voz padrão (sem voice cloning), sem aviso — VCLONE-03 só se aplica quando campo tem valor.

### Warmup com Speaker Embedding

- **D-03:** Warmup **chama `prepare_conditionals(path)` explicitamente** (método público do `ChatterboxMultilingualTTS`) se `chatterbox_audio_prompt_path` está definido e passou a validação D-02. Depois chama `generate()` com texto curto PT-BR **sem** `audio_prompt_path` para aquecer o grafo usando os `self.conds` recém-extraídos.
- **D-04:** `_chatterbox_speak()` **NÃO passa `audio_prompt_path` a cada `generate()`** — confia em `self.conds` pré-carregado pelo warmup. Elimina re-extração de embedding a cada fala (bug de eficiência que ocorreria se `audio_prompt_path` fosse passado por chamada).
- **D-05:** Se `chatterbox_audio_prompt_path` for `""` no warmup, `prepare_conditionals()` não é chamado — engine usa `conds.pt` embutido (voz padrão Chatterbox). Warmup continua normalmente.

### Fallback e Comportamento de Sessão

- **D-06:** Arquivo de referência inválido resulta em `_chatterbox_available = False` — mesma semântica do D-09 da Phase 86. Chatterbox indisponível pela sessão, falas vão para Kokoro. `config.tts_provider` não é alterado.
- **D-07:** Arquivo válido ausente (campo `""`) ≠ arquivo inválido — Chatterbox funciona normalmente com voz padrão. Só falha se o campo tem valor mas o arquivo não passa a validação.

### Config UX

- **D-08:** Phase 87 **não adiciona nada ao menu `/config`**. Campo `chatterbox_audio_prompt_path` é configurável via edição direta de `~/.jarvis/config.json` durante Phase 87. Menu UX completo (provider list + input do path) vem na Phase 88 (CFGUI-01 + CFGUI-02).

### Claude's Discretion

- Valor exato do `language_id` no `generate()` do warmup com referência (verificar se `"pt"` é válido para `ChatterboxMultilingualTTS` ou se deve ser omitido)
- Thread-safety de `prepare_conditionals()` — se não for thread-safe, envolve com `_lock` antes da chamada
- Texto do warmup com referência (pode ser o mesmo `"olá"` ou diferente — qualquer coisa que aqueça `self.conds`)
- Tratamento de `soundfile.SoundFileError` vs `Exception` genérica na validação

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Código existente (obrigatório ler antes de implementar)

- `apps/desktop-py/src/jarvis_desktop/tts.py` — módulo TTS atual; `init_tts()`, `_start_chatterbox_warmup()`, `_warmup_worker()`, `_chatterbox_speak()`, `_create_chatterbox_engine()`, `set_provider()`
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` com `cloned_voice_path`, `tts_provider`, padrão de `Field(default="")`
- `apps/desktop-py/tests/test_tts.py` — padrões de teste para TTS (monkeypatch de `_create_chatterbox_engine`, etc.)

### Empacotamento

- `apps/desktop-py/pyproject.toml` — deps atuais; `soundfile` já presente como transitiva; grupo `chatterbox` extras

### Decisões de fases anteriores

- `.planning/phases/86-identificacao-de-voz-speaker-recognition/86-CONTEXT.md` — D-01 a D-25 do Chatterbox Core (especialmente D-04 que esta phase revisa, D-08/D-09 sobre fallback de sessão, D-05 sobre warmup event)
- `.planning/phases/85-clonagem-de-voz-kokoro/85-CONTEXT.md` — origem do `cloned_voice_path` (Kokoro .pt)
- `.planning/REQUIREMENTS.md` — VCLONE-01, VCLONE-02, VCLONE-03

### API Chatterbox (researcher deve verificar)

- `apps/desktop-py/.venv/Lib/site-packages/chatterbox/` — source local do Chatterbox instalado; verificar `mtl_tts.py` para assinatura de `prepare_conditionals()` e `generate()`
- `https://github.com/resemble-ai/chatterbox` — repositório oficial; confirmar thread-safety de `prepare_conditionals()`

### Arquivo de voz existente

- `apps/desktop-py/voices/Jarvis.mp3` — arquivo de referência disponível no repo para testes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`tts.py:_start_chatterbox_warmup()`** — já existe; adicionar validação D-02 + chamada a `prepare_conditionals()` (D-03) no início do `_warmup_worker()`
- **`tts.py:_chatterbox_speak()`** — já existe; remover passagem de `audio_prompt_path` ao `generate()` (D-04)
- **`tts.py:_create_chatterbox_engine()`** — já existe; Phase 87 não altera este ponto
- **`config.py:JarvisConfig`** — adicionar apenas `chatterbox_audio_prompt_path` seguindo o padrão `Field(default="")`
- **`apps/desktop-py/voices/Jarvis.mp3`** — arquivo de referência disponível para smoke test

### Established Patterns

- **Fallback não-bloqueante no warmup** — qualquer exception em `_warmup_worker`: mensagem `[TTS] ...`, `_chatterbox_available = False`, `_chatterbox_warmup_event.set()`
- **Lazy imports dentro das funções** — `import soundfile` dentro do `_warmup_worker`, não no topo
- **`[TTS]` prefix** nos logs de console (Phase 75 pattern)
- **`config.tts_provider` NÃO alterado em fallback** (D-10 Phase 86)

### Integration Points

- **`_warmup_worker()`** — ponto de inserção para validação (D-02) e `prepare_conditionals()` (D-03)
- **`_chatterbox_speak()`** — remover `audio_prompt_path` do `generate()` (D-04)
- **`JarvisConfig`** — adicionar `chatterbox_audio_prompt_path` field

</code_context>

<specifics>
## Specific Ideas

- `apps/desktop-py/voices/Jarvis.mp3` está disponível no repo — pode ser usado como valor default implícito ou como fixture de teste para VCLONE-02
- Pesquisa identificou que `ChatterboxMultilingualTTS.prepare_conditionals()` e `generate()` são desacoplados: `prepare_conditionals()` armazena resultado em `self.conds`; `generate()` só re-extrai se `audio_prompt_path` for passado explicitamente. Passar `audio_prompt_path` em toda chamada a `generate()` causaria re-extração desnecessária a cada fala.

</specifics>

<deferred>
## Deferred Ideas

- **Cache de speaker embedding entre sessões** (VCLONE-05) — `conds.pt` salvo em `~/.jarvis/` para evitar re-extração no startup. Future.
- **Invalidação de `self.conds` em runtime** — se usuário alterar `chatterbox_audio_prompt_path` via `/config` (Phase 88), será necessário detectar a mudança e chamar `prepare_conditionals()` novamente. Phase 88 cuida disso junto com CFGUI-02.
- **Menu `/config` para o path** (CFGUI-02) — Phase 88.
- **Chatterbox no provider list do `/config`** (CFGUI-01) — Phase 88.
- **Hot-swap de arquivo de referência em runtime** — trocar voz sem reiniciar. Future.

</deferred>

---

*Phase: 87-voice-cloning*
*Context gathered: 2026-05-29*
