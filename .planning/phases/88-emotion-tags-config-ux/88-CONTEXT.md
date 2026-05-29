# Phase 88: Emotion Tags + Config UX - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Processar emotion tags no texto antes de passar ao Chatterbox: tags reconhecidas ajustam `exaggeration`/`cfg_weight`, todas as tags são removidas do texto antes da inferência. Menu `/config` atualizado para listar "chatterbox" como provider e, ao selecioná-lo, solicitar o caminho do arquivo de referência inline.

**Dentro do escopo:**
- Função de parse de tags: extrai primeira tag reconhecida, remove todas as `[xxx]` do texto
- Mapeamento tag → parâmetros Chatterbox (`exaggeration` + `cfg_weight`)
- Novos campos de config: `chatterbox_exaggeration` e `chatterbox_cfg_weight` (defaults explícitos)
- `_chatterbox_speak()` aplica parâmetros extraídos das tags antes de chamar `generate()`
- `/config` provider list inclui "chatterbox" (CFGUI-01)
- Ao selecionar chatterbox: prompt inline para `chatterbox_audio_prompt_path` (CFGUI-02)
- Item "audio referência" visível no menu principal apenas quando `tts_provider == "chatterbox"`

**Fora do escopo:**
- Slider de intensidade emocional (EMOTE-03 — future)
- Inferência automática de emoção via LLM (EMOTE-04 — future)
- Cache de speaker embedding entre sessões (VCLONE-05 — future)
- Hot-swap de arquivo de referência em runtime
- Integração TypeScript/Electron

</domain>

<decisions>
## Implementation Decisions

### Emotion Tag Parsing

- **D-01:** Parse extrai a **primeira tag reconhecida** do texto. Tags subsequentes são ignoradas (não causam erro). Apenas uma tag por `speak()` call afeta os parâmetros.
- **D-02:** **Todas as tags `[xxx]`** são removidas do texto antes de passar ao Chatterbox — incluindo tags reconhecidas. Texto passado ao `generate()` nunca contém `[...]`.
- **D-03:** Tags não reconhecidas são removidas **silenciosamente** (sem log). Critério de aceitação #2: texto falado nunca contém o literal da tag.
- **D-04:** Strip de tags aplica **somente ao provider Chatterbox**. Kokoro e cloud providers (ElevenLabs, Murf) recebem texto original.

### Emotion Tag Mapping

Tags reconhecidas (EMOTE-01): `[angry]`, `[sad]`, `[excited]`, `[soft]`, `[whispering]`, `[breathy]`, `[emphasis]`, `[embarrassed]`

| Tag | exaggeration | cfg_weight | Categoria |
|-----|-------------|------------|-----------|
| `[angry]` | ~1.3 | padrão | alta intensidade |
| `[excited]` | ~1.4 | padrão | alta intensidade |
| `[emphasis]` | ~1.2 | padrão | alta intensidade |
| `[sad]` | ~0.5 | padrão | média-baixa |
| `[embarrassed]` | ~0.4 | padrão | média-baixa |
| `[soft]` | ~0.3 | elevado (~0.8) | calma |
| `[whispering]` | ~0.2 | elevado (~0.9) | calma |
| `[breathy]` | ~0.3 | elevado (~0.8) | calma |

- **D-05:** Valores exatos dentro das faixas acima são **Claude's Discretion** (researcher verifica API do Chatterbox para ranges válidos).
- **D-06:** Sem tag → usa `config.chatterbox_exaggeration` e `config.chatterbox_cfg_weight` (defaults explícitos, não os internos do Chatterbox). Defaults sugeridos: `exaggeration=0.7`, `cfg_weight=0.5`.

### Config Fields

- **D-07:** Dois novos campos em `JarvisConfig`:
  - `chatterbox_exaggeration: float = Field(default=0.7)` — intensidade emocional padrão
  - `chatterbox_cfg_weight: float = Field(default=0.5)` — aderência à voz de referência
- **D-08:** Estes campos são os "sem tag" defaults; tags sobrescrevem apenas para aquele `speak()` call (não persistem em config).

### Config UX Flow (CFGUI-01 + CFGUI-02)

- **D-09:** Provider list em `_menu_tts_provider()` inclui `"chatterbox"`: `["kokoro", "chatterbox", "elevenlabs", "murf", "none"]`.
- **D-10:** Ao selecionar `chatterbox` no provider list, o menu solicita **inline** o caminho do arquivo de referência: `"Arquivo de referência de voz (Enter para manter [{atual}]): "`. Fluxo em um passo, atende CFGUI-02.
- **D-11:** Caminho vazio (Enter sem digitar) mantém o valor atual de `chatterbox_audio_prompt_path`. Permite selecionar chatterbox sem forçar configuração de referência.
- **D-12:** Menu principal exibe item "Audio referência" **somente quando `config.tts_provider == "chatterbox"`**. Oculto para outros providers.
- **D-13:** Após selecionar chatterbox e (opcionalmente) configurar o path, `tts.set_provider("chatterbox", config)` é chamado normalmente (como já acontece para outros providers), seguido de `save_config(config)`.

### Claude's Discretion

- Valores exatos de `exaggeration`/`cfg_weight` dentro das faixas da tabela D-04 (researcher verifica ranges válidos da API `ChatterboxMultilingualTTS.generate()`)
- Estratégia de regex para strip de tags: `re.sub(r'\[[^\]]+\]', '', text)` ou variação
- Posição exata do item "Audio referência" no menu principal (ex: item 8, depois de "Voz Kokoro")
- Prompt exato ao solicitar o caminho do arquivo inline

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Código existente (obrigatório ler antes de implementar)

- `apps/desktop-py/src/jarvis_desktop/tts.py` — `_chatterbox_speak()`, `speak()`, `set_provider()`, `init_tts()`; padrões de fallback, lazy import, singletons
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_menu_tts_provider()` (linha ~757), `_handle_config_menu()` (linha ~676), `_menu_kokoro_voice()` — padrões do menu /config
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` com `chatterbox_audio_prompt_path`, `tts_provider`, padrão `Field(default=...)`
- `apps/desktop-py/tests/test_tts.py` — padrões de teste TTS (monkeypatch de `_create_chatterbox_engine`)

### Decisões de fases anteriores

- `.planning/phases/87-voice-cloning/87-CONTEXT.md` — D-01 a D-08 (config field, validação, warmup com embedding, fallback)
- `.planning/phases/86-identificacao-de-voz-speaker-recognition/86-CONTEXT.md` — D-01 a D-25 (Chatterbox Core: singletons, device cascade, fallback de sessão)
- `.planning/REQUIREMENTS.md` — EMOTE-01, EMOTE-02, CFGUI-01, CFGUI-02

### API Chatterbox (researcher deve verificar)

- `apps/desktop-py/.venv/Lib/site-packages/chatterbox/` — source local; verificar `generate()` kwargs aceitos (`exaggeration`, `cfg_weight`, ranges válidos)
- `https://github.com/resemble-ai/chatterbox` — repositório oficial; confirmar parâmetros e ranges

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`tts.py:_chatterbox_speak()`** — ponto de inserção para tag parsing + parâmetro override antes de `generate()`; já tem `_generate_kwargs` dict pattern (Phase 87)
- **`chat.py:_menu_tts_provider()`** — adicionar "chatterbox" à lista `providers` + lógica de prompt inline pós-seleção
- **`chat.py:_handle_config_menu()`** — adicionar item condicional "Audio referência" quando `tts_provider == "chatterbox"`
- **`chat.py:_menu_kokoro_voice()`** — padrão de sub-menu de voz: referência para criar `_menu_chatterbox_audio()` (se necessário)
- **`config.py:JarvisConfig`** — adicionar `chatterbox_exaggeration` e `chatterbox_cfg_weight` seguindo `Field(default=...)` pattern

### Established Patterns

- **`_generate_kwargs` dict** — já usado em `_chatterbox_speak()` para passagem condicional de kwargs ao `generate()` (Phase 87 pattern)
- **Lazy import dentro de funções** — `import soundfile` dentro de funções; mesmo padrão para `import re` se necessário
- **`[TTS]` prefix** nos logs de console — manter para mensagens de tag processing
- **Menu com `markup=False`** — todos os `console.print()` no menu usam `markup=False` para exibir `[x]`/`[ ]` sem interpretação Rich

### Integration Points

- **`_chatterbox_speak()`** — antes de `_generate_kwargs["language_id"] = "pt"`: inserir `_extract_emotion_tag(text)` + montar kwargs; usar `text_clean` (sem tags) no `generate()`
- **`_menu_tts_provider()`** — providers list e lógica de prompt inline pós-chatterbox
- **`_handle_config_menu()`** — item condicional para audio referência
- **`JarvisConfig`** — dois novos fields float

</code_context>

<specifics>
## Specific Ideas

- `apps/desktop-py/voices/Jarvis.mp3` disponível no repo — arquivo de referência para testes de voice cloning + emotion tags
- Tag parsing deve ser function isolada (`_extract_emotion_tag(text) -> tuple[str, str]`) retornando `(tag_name_or_none, text_clean)` — fácil de testar unitariamente
- `_generate_kwargs` pattern (Phase 87) é o hook natural para injetar `exaggeration`/`cfg_weight` sem alterar a assinatura de `_chatterbox_speak()`

</specifics>

<deferred>
## Deferred Ideas

- **Slider de intensidade emocional no `/config`** (EMOTE-03) — `chatterbox_exaggeration` em config + input numérico no menu. Future, mas campos D-07 já preparam o terreno.
- **Inferência automática de emoção via LLM** (EMOTE-04) — eliminar tags manuais com classificação automática. Future.
- **Múltiplas tags com segmentação por trecho** — tag aplicada só ao segmento que segue. Chatterbox gera áudio completo por chamada; segmentação exigiria múltiplos `speak()` internos. Future.
- **Hot-swap de arquivo de referência sem reiniciar** (invalidar `self.conds` e re-chamar `prepare_conditionals()` quando path mudar via menu). Future — Phase 89+ ou junto com VCLONE-05.
- **Speaker recognition** — Phase 89 (backlog).

</deferred>

---

*Phase: 88-emotion-tags-config-ux*
*Context gathered: 2026-05-29*
