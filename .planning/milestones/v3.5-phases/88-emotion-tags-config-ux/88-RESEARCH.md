# Phase 88: Emotion Tags + Config UX - Research

**Researched:** 2026-05-29
**Domain:** Python TTS emotion tag parsing, Chatterbox `generate()` API, terminal config menu extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Parse extrai a **primeira tag reconhecida** do texto. Tags subsequentes ignoradas.
- **D-02:** **Todas as tags `[xxx]`** removidas antes de passar ao Chatterbox — incluindo reconhecidas.
- **D-03:** Tags não reconhecidas removidas **silenciosamente** (sem log).
- **D-04:** Strip de tags aplica **somente ao provider Chatterbox**. Outros providers recebem texto original.
- **D-05:** Valores exatos de `exaggeration`/`cfg_weight` são **Claude's Discretion** (dentro das faixas da tabela).
- **D-06:** Sem tag → usa `config.chatterbox_exaggeration` e `config.chatterbox_cfg_weight` (defaults: `exaggeration=0.7`, `cfg_weight=0.5`).
- **D-07:** Dois novos campos em `JarvisConfig`: `chatterbox_exaggeration: float = Field(default=0.7)` e `chatterbox_cfg_weight: float = Field(default=0.5)`.
- **D-08:** Tags sobrescrevem apenas para aquele `speak()` call — não persistem em config.
- **D-09:** Provider list inclui `"chatterbox"`: `["kokoro", "chatterbox", "elevenlabs", "murf", "none"]`.
- **D-10:** Ao selecionar `chatterbox`, menu solicita **inline** o caminho do arquivo de referência.
- **D-11:** Caminho vazio (Enter) mantém o valor atual de `chatterbox_audio_prompt_path`.
- **D-12:** Item "Audio referência" no menu principal **somente quando `config.tts_provider == "chatterbox"`**.
- **D-13:** Após selecionar chatterbox e configurar path, `tts.set_provider("chatterbox", config)` é chamado normalmente, seguido de `save_config(config)`.

### Claude's Discretion

- Valores exatos de `exaggeration`/`cfg_weight` dentro das faixas da tabela D-04
- Estratégia de regex para strip de tags (`re.sub(r'\[[^\]]+\]', '', text)` ou variação)
- Posição exata do item "Audio referência" no menu principal (ex: item 8, depois de "Voz Kokoro")
- Prompt exato ao solicitar o caminho do arquivo inline

### Deferred Ideas (OUT OF SCOPE)

- Slider de intensidade emocional no `/config` (EMOTE-03)
- Inferência automática de emoção via LLM (EMOTE-04)
- Múltiplas tags com segmentação por trecho
- Hot-swap de arquivo de referência sem reiniciar (VCLONE-05)
- Speaker recognition (Phase 89)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EMOTE-01 | Tags `[angry]` `[sad]` `[excited]` `[soft]` `[whispering]` `[breathy]` `[emphasis]` `[embarrassed]` mapeadas para parâmetros Chatterbox antes da inferência | `generate()` aceita `exaggeration` e `cfg_weight`; valores de faixa verificados via GitHub source |
| EMOTE-02 | Tags não reconhecidas removidas do texto antes da inferência (nunca lidas em voz alta) | `re.sub(r'\[[^\]]+\]', '', text)` remove todas as tags; aplicar somente no path Chatterbox (D-04) |
| CFGUI-01 | `/config` menu exibe "chatterbox" como opção de provider TTS | `_menu_tts_provider()` em `chat.py` linha 757 — adicionar "chatterbox" à lista `providers` |
| CFGUI-02 | Ao selecionar chatterbox no `/config`, usuário pode digitar caminho do arquivo de referência | Prompt inline pós-seleção no mesmo fluxo — padrão existente em `_menu_tts_provider()` |
</phase_requirements>

---

## Summary

Phase 88 é uma extensão cirúrgica de código existente: dois pontos de integração no `tts.py` (`_chatterbox_speak` + nova função `_extract_emotion_tag`) e dois pontos em `chat.py` (`_menu_tts_provider` + `_show_config_menu`). Não há dependência de bibliotecas externas novas — apenas `re` (stdlib) para parsing de tags.

O Chatterbox `ChatterboxMultilingualTTS.generate()` aceita `exaggeration` (default 0.5) e `cfg_weight` (default 0.5) como kwargs opcionais. Ambos são floats sem range explicitamente documentado, mas o README indica valores práticos de 0.0 a ~1.4+ (exaggeration até >1.0 para speech dramático). O `_generate_kwargs` dict pattern já em uso em `_chatterbox_speak()` é o hook natural para injetar estes parâmetros.

O menu `/config` existente tem 7 itens (0-7); a fase adiciona item 8 "Audio referência" condicional e modifica o sub-menu de TTS provider para (a) incluir "chatterbox" na lista e (b) solicitar o path inline após seleção.

**Primary recommendation:** Implementar `_extract_emotion_tag(text) -> tuple[str | None, str]` como função isolada testável; injetar resultado no `_generate_kwargs` dict em `_chatterbox_speak()` antes do `generate()` call.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python `re` (stdlib) | 3.10+ | Regex para strip de tags e extração | Zero-dependency; `re.sub(r'\[[^\]]+\]', '', text)` é O(n) e correto |
| Chatterbox `ChatterboxMultilingualTTS` | já instalado (Phase 86) | TTS engine com suporte a `exaggeration`/`cfg_weight` | Decidido em fases anteriores |
| pydantic `Field` | 2.x (já em uso) | Novos campos em `JarvisConfig` | Padrão já estabelecido no projeto |

### Sem dependências novas

Esta fase não requer `pip install` de nada. Todo o stack já está no venv do projeto.

---

## Architecture Patterns

### Padrão existente: `_generate_kwargs` dict

Em `_chatterbox_speak()` (linha 732 de `tts.py`), já existe este padrão:

```python
_generate_kwargs: dict = {"language_id": "pt"}
if config.chatterbox_audio_prompt_path:
    _generate_kwargs["audio_prompt_path"] = config.chatterbox_audio_prompt_path
wav_tensor = _chatterbox_engine.generate(text, **_generate_kwargs)
```

Phase 88 estende este dict com `exaggeration` e `cfg_weight` extraídos da tag:

```python
# Phase 88: extract emotion tag, strip all tags from text
tag_name, text_clean = _extract_emotion_tag(text)  # D-01, D-02
_generate_kwargs: dict = {"language_id": "pt"}
if config.chatterbox_audio_prompt_path:
    _generate_kwargs["audio_prompt_path"] = config.chatterbox_audio_prompt_path
# Inject emotion params (tag overrides config defaults)
exag, cfg_w = _EMOTION_TAG_MAP.get(
    tag_name,
    (config.chatterbox_exaggeration, config.chatterbox_cfg_weight)  # D-06
)
_generate_kwargs["exaggeration"] = exag
_generate_kwargs["cfg_weight"] = cfg_w
wav_tensor = _chatterbox_engine.generate(text_clean, **_generate_kwargs)  # D-02: text_clean
```

### Padrão existente: sub-menu com `markup=False`

Todos os `console.print()` no menu usam `markup=False` para exibir `[x]`/`[ ]` sem interpretação Rich. Este padrão deve ser mantido ao adicionar "chatterbox" à lista de providers e ao imprimir o item "Audio referência".

### Padrão de adição de item condicional ao menu principal

O menu principal em `_show_config_menu()` imprime itens fixos 1-7. Para o item 8 (Audio referência) condicional:

```python
# No corpo do while True, após item 7:
if config.tts_provider == "chatterbox":
    current_path = config.chatterbox_audio_prompt_path or "(não definido)"
    console.print(f"8. Audio referência   [{current_path}]", markup=False)
console.print("0. Sair")
```

E no handler de choices:
```python
elif choice == "8" and config.tts_provider == "chatterbox":
    _menu_chatterbox_audio_ref(config)
```

### Padrão de prompt inline pós-seleção (CFGUI-02)

Ao selecionar chatterbox em `_menu_tts_provider()`, logo após chamar `tts.set_provider("chatterbox", config)` com sucesso:

```python
# Inline path prompt (D-10, D-11)
current = config.chatterbox_audio_prompt_path or ""
prompt = f"Arquivo de referência de voz (Enter para manter [{current or 'nenhum'}]): "
try:
    new_path = ui.get_input(prompt).strip()
    if new_path:  # D-11: Enter sem digitar mantém atual
        config.chatterbox_audio_prompt_path = new_path
except (EOFError, KeyboardInterrupt):
    pass
save_config(config)
```

### Função `_extract_emotion_tag` (isolada e testável)

Retorna `(tag_name_or_none, text_clean)`:

```python
import re

_KNOWN_TAGS = frozenset({
    "angry", "sad", "excited", "soft", "whispering",
    "breathy", "emphasis", "embarrassed"
})

_TAG_PATTERN = re.compile(r'\[([^\]]+)\]')

def _extract_emotion_tag(text: str) -> tuple[str | None, str]:
    """Extract first recognized emotion tag; strip ALL [xxx] from text.

    D-01: only first recognized tag affects params.
    D-02: ALL [xxx] removed from returned text_clean.
    D-03: unrecognized tags removed silently.
    """
    found_tag: str | None = None
    for m in _TAG_PATTERN.finditer(text):
        tag = m.group(1).lower()
        if tag in _KNOWN_TAGS and found_tag is None:
            found_tag = tag
    text_clean = _TAG_PATTERN.sub("", text).strip()
    return found_tag, text_clean
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag stripping | Custom char-by-char parser | `re.sub(r'\[[^\]]+\]', '', text)` | stdlib, O(n), handles edge cases (nested-like `[[x]]`, empty `[]`) |
| Config serialization | Manual JSON write | `save_config(config)` (já existe) | Atomic write, thread-safe, já testado |
| Provider switch | Custom state machine | `tts.set_provider()` (já existe) | Lida com ImportError, _chatterbox_available state, logging |

---

## Chatterbox API — Parâmetros Verificados

**Fonte:** GitHub `resemble-ai/chatterbox` `src/chatterbox/tts.py` e `mtl_tts.py` (HIGH confidence — source direto)

### `ChatterboxMultilingualTTS.generate()` signature

```python
def generate(
    self,
    text,
    language_id,           # obrigatório — "pt" para português
    audio_prompt_path=None,
    exaggeration=0.5,      # default interno Chatterbox
    cfg_weight=0.5,        # default interno Chatterbox
    temperature=0.8,
    repetition_penalty=1.2,
    min_p=0.05,
    top_p=1.0,
) -> Tensor:
```

### Ranges verificados

| Parâmetro | Default interno | Range prático | Efeito |
|-----------|----------------|---------------|--------|
| `exaggeration` | 0.5 | 0.0–1.5+ | Controla expressividade; >0.7 = dramático; >1.0 = muito intenso |
| `cfg_weight` | 0.5 | 0.0–1.0 | Aderência à voz de referência; 0.3 = pacing mais lento e natural; 0.0 = puro cross-lingual |

**Sem range explícito documentado** no código-fonte; valores práticos derivados do README oficial (MEDIUM confidence para os limites superiores).

### Mapeamento de tags — valores recomendados (Claude's Discretion D-05)

| Tag | exaggeration | cfg_weight | Justificativa |
|-----|-------------|------------|---------------|
| `[angry]` | 1.3 | 0.5 | Alta intensidade; cfg_weight padrão mantém voz de referência |
| `[excited]` | 1.4 | 0.5 | Máxima expressividade na faixa testada |
| `[emphasis]` | 1.2 | 0.5 | Moderadamente dramático |
| `[sad]` | 0.5 | 0.5 | Abaixo do padrão do projeto (0.7); voz mais plana |
| `[embarrassed]` | 0.4 | 0.5 | Ligeiramente mais plano que [sad] |
| `[soft]` | 0.3 | 0.8 | Calmo; cfg elevado para manter qualidade da voz de referência |
| `[whispering]` | 0.2 | 0.9 | Mínima expressividade; máxima aderência à referência |
| `[breathy]` | 0.3 | 0.8 | Idêntico a [soft] — sem parâmetro dedicado no Chatterbox |

**Nota:** Chatterbox não tem parâmetro específico para "whispering" ou "breathy". O efeito é aproximado via `exaggeration` baixo + `cfg_weight` alto. Pode não ser perfeito — documentar como limitação conhecida.

---

## Common Pitfalls

### Pitfall 1: Rich markup interpreta `[angry]` como tag de formatação

**O que acontece:** `console.print(f"Tag detectada: {tag}")` sem `markup=False` faz Rich interpretar `[angry]` como marcação de cor/estilo e sumir ou gerar erro.

**Como evitar:** Sempre `markup=False` em qualquer print que exiba conteúdo de tag ou texto do usuário.

### Pitfall 2: Strip de tags aplicado fora do path Chatterbox (D-04)

**O que acontece:** Se `_extract_emotion_tag()` for chamado no `speak()` geral (antes do `if tts_provider == "chatterbox"`), Kokoro e cloud providers recebem texto limpo quando deveriam receber o original.

**Como evitar:** Chamar `_extract_emotion_tag()` somente dentro de `_chatterbox_speak()`, não em `speak()`.

### Pitfall 3: `_chatterbox_warmup_event` não resetado entre testes de emoção

**O que acontece:** Fixture `_reset_chatterbox_state` (conftest.py) já reseta `_chatterbox_warmup_event`. Mas testes novos que testam `_extract_emotion_tag` diretamente não precisam deste reset (função pura). Testes de integração que chamam `_chatterbox_speak` precisam da fixture.

**Como evitar:** Testes de `_extract_emotion_tag` são puramente unitários — sem fixtures de estado Chatterbox. Testes de `_chatterbox_speak` usam `mock_chatterbox_engine` + `mock_sounddevice_play` como os existentes.

### Pitfall 4: Item "Audio referência" no menu quando provider muda mid-session

**O que acontece:** Se o usuário troca de "chatterbox" para "kokoro" via menu, o item 8 deve desaparecer no próximo render do loop. Como o menu re-renderiza em cada iteração do `while True`, isso funciona automaticamente — mas apenas se a condição for checada em cada print, não cacheada.

**Como evitar:** Checar `config.tts_provider == "chatterbox"` diretamente no `while True` a cada iteração, não em variável local fora do loop.

### Pitfall 5: `_menu_tts_provider` prompt range hardcoded como "(1-4)"

**O que acontece:** A string atual `"Selecione (1-4, Enter para cancelar): "` fica errada ao adicionar "chatterbox" (passando a ser 5 opções).

**Como evitar:** Mudar para `f"Selecione (1-{len(providers)}, Enter para cancelar): "` dinâmico.

### Pitfall 6: `exaggeration` e `cfg_weight` sempre passados ao `generate()` mesmo sem tag

**Nota:** D-06 define que **sem tag** os defaults de config são usados. Isto significa que `exaggeration` e `cfg_weight` são **sempre** passados ao `generate()` (com valores de config ou de tag), nunca omitidos. Os defaults internos do Chatterbox (0.5/0.5) são ignorados em favor dos defaults explícitos do projeto (0.7/0.5).

---

## Code Examples

### `_extract_emotion_tag` completa

```python
# Source: Phase 88 design; padrão stdlib re
import re

_KNOWN_TAGS = frozenset({
    "angry", "sad", "excited", "soft", "whispering",
    "breathy", "emphasis", "embarrassed"
})
_TAG_PATTERN = re.compile(r'\[([^\]]+)\]')

_EMOTION_TAG_MAP: dict[str, tuple[float, float]] = {
    # tag_name: (exaggeration, cfg_weight)
    "angry":      (1.3, 0.5),
    "excited":    (1.4, 0.5),
    "emphasis":   (1.2, 0.5),
    "sad":        (0.5, 0.5),
    "embarrassed":(0.4, 0.5),
    "soft":       (0.3, 0.8),
    "whispering": (0.2, 0.9),
    "breathy":    (0.3, 0.8),
}

def _extract_emotion_tag(text: str) -> tuple[str | None, str]:
    """Extract first recognized emotion tag; strip ALL [xxx] from text.

    Returns:
        (tag_name, text_clean) — tag_name is None if no recognized tag found.
        text_clean always has ALL [xxx] patterns removed (D-02).
    """
    found_tag: str | None = None
    for m in _TAG_PATTERN.finditer(text):
        tag = m.group(1).lower()
        if tag in _KNOWN_TAGS and found_tag is None:
            found_tag = tag
    text_clean = _TAG_PATTERN.sub("", text).strip()
    return found_tag, text_clean
```

### Integração em `_chatterbox_speak()`

```python
# Inserir ANTES de _generate_kwargs (linha ~732 de tts.py)
tag_name, text_clean = _extract_emotion_tag(text)  # D-01, D-02, D-03
_generate_kwargs: dict = {"language_id": "pt"}
if config.chatterbox_audio_prompt_path:
    _generate_kwargs["audio_prompt_path"] = config.chatterbox_audio_prompt_path
# D-06: tag overrides config defaults; no tag = config defaults
exag, cfg_w = _EMOTION_TAG_MAP.get(
    tag_name or "",
    (config.chatterbox_exaggeration, config.chatterbox_cfg_weight)
)
_generate_kwargs["exaggeration"] = exag
_generate_kwargs["cfg_weight"] = cfg_w
wav_tensor = _chatterbox_engine.generate(text_clean, **_generate_kwargs)  # D-02: text_clean
```

### Extensão de `_menu_tts_provider()` (CFGUI-01 + CFGUI-02)

```python
providers = ["kokoro", "chatterbox", "elevenlabs", "murf", "none"]  # D-09
# ...
raw = ui.get_input(f"Selecione (1-{len(providers)}, Enter para cancelar): ").strip()
# ...
# Após tts.set_provider("chatterbox", config) com sucesso:
if new_provider == "chatterbox" and config.tts_provider == "chatterbox":
    current = config.chatterbox_audio_prompt_path or "nenhum"
    try:
        new_path = ui.get_input(
            f"Arquivo de referência de voz (Enter para manter [{current}]): "
        ).strip()
        if new_path:
            config.chatterbox_audio_prompt_path = new_path
    except (EOFError, KeyboardInterrupt):
        pass
```

### Item condicional no menu principal (CFGUI-01 visibilidade, D-12)

```python
# Em _show_config_menu(), dentro do while True, após item 7:
if config.tts_provider == "chatterbox":
    ref = config.chatterbox_audio_prompt_path or "(não definido)"
    console.print(f"8. Audio referência   [{ref}]", markup=False)
console.print("0. Sair")
# ...
elif choice == "8" and config.tts_provider == "chatterbox":
    _menu_chatterbox_audio_ref(config)
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x |
| Config file | `apps/desktop-py/pytest.ini` ou `pyproject.toml` |
| Quick run command | `cd apps/desktop-py && uv run pytest tests/test_tts.py -x -q` |
| Full suite command | `cd apps/desktop-py && uv run pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EMOTE-01 | `_extract_emotion_tag("[angry] texto")` retorna `("angry", "texto")` | unit | `pytest tests/test_tts.py::test_extract_emotion_tag_angry -x` | ❌ Wave 0 |
| EMOTE-01 | `_chatterbox_speak("[angry] texto", config)` chama `generate()` com `exaggeration=1.3` | unit | `pytest tests/test_tts.py::test_chatterbox_speak_angry_tag -x` | ❌ Wave 0 |
| EMOTE-01 | Sem tag usa `config.chatterbox_exaggeration`/`cfg_weight` (D-06) | unit | `pytest tests/test_tts.py::test_chatterbox_speak_no_tag_uses_config_defaults -x` | ❌ Wave 0 |
| EMOTE-02 | Tag desconhecida `[random]` removida do texto passado ao `generate()` | unit | `pytest tests/test_tts.py::test_extract_emotion_tag_unknown_removed -x` | ❌ Wave 0 |
| EMOTE-02 | Texto falado nunca contém literal `[angry]` (texto limpo) | unit | `pytest tests/test_tts.py::test_chatterbox_speak_tag_stripped_from_text -x` | ❌ Wave 0 |
| CFGUI-01 | `"chatterbox"` aparece na lista `providers` de `_menu_tts_provider()` | unit | `pytest tests/test_chat.py::test_menu_tts_provider_includes_chatterbox -x` | ❌ Wave 0 |
| CFGUI-02 | Selecionar chatterbox no menu solicita path inline | integration | manual / `pytest tests/test_chat.py::test_menu_tts_chatterbox_prompts_audio_path -x` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `tests/test_tts.py` — adicionar tests para `_extract_emotion_tag` e `_chatterbox_speak` com tags (cobrem EMOTE-01, EMOTE-02). O arquivo já existe; adicionar ao final.
- [ ] `tests/test_chat.py` — verificar se existe; se não, criar com testes de `_menu_tts_provider` (cobrem CFGUI-01, CFGUI-02).

---

## Environment Availability

Step 2.6: SKIPPED — fase é code/config-only. Nenhuma dependência externa nova. Chatterbox já instalado (Phase 86). `re` é stdlib.

---

## Open Questions

1. **Range máximo de `exaggeration` estável**
   - O que sabemos: valores até ~1.4 mencionados em discussões da comunidade; default é 0.5
   - O que não está claro: se valores >1.5 causam artefatos de áudio ou erros de tensor
   - Recomendação: limitar `[excited]` a 1.4 como máximo na tabela; ajustar pós-testes se necessário

2. **`test_chat.py` existe?**
   - O que sabemos: `test_tts.py` e `conftest.py` existem; `test_chat.py` não foi encontrado no repositório
   - O que não está claro: se testes de menu já foram escritos em algum arquivo não indexado
   - Recomendação: Wave 0 deve criar `tests/test_chat.py` com fixture `mock_ui_input` para simular input do usuário

---

## Sources

### Primary (HIGH confidence)

- `apps/desktop-py/src/jarvis_desktop/tts.py` — código existente de `_chatterbox_speak()`, `_generate_kwargs` pattern, singletons Chatterbox
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_show_config_menu()`, `_menu_tts_provider()`, `_menu_kokoro_voice()` (padrões de menu)
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` com campos existentes e `Field(default=...)` pattern
- `apps/desktop-py/tests/test_tts.py` — padrões de teste: `mock_chatterbox_engine`, `mock_sounddevice_play`, `monkeypatch` no `_create_chatterbox_engine`
- `apps/desktop-py/tests/conftest.py` — fixtures `_reset_chatterbox_state`, `mock_chatterbox_engine`, `FakeTensor` pattern
- GitHub `resemble-ai/chatterbox` `src/chatterbox/mtl_tts.py` — `ChatterboxMultilingualTTS.generate()` signature confirmada: `exaggeration=0.5`, `cfg_weight=0.5` como defaults; ambos são kwargs opcionais

### Secondary (MEDIUM confidence)

- GitHub `resemble-ai/chatterbox` README — valores práticos de `exaggeration` (0.7+ para expressivo) e `cfg_weight` (0.3 para pacing lento); ranges informais sem especificação formal
- PyPI `chatterbox-tts` página — confirma API `generate()` e `ChatterboxMultilingualTTS.from_pretrained()`

---

## Metadata

**Confidence breakdown:**
- API Chatterbox (`generate()` kwargs): HIGH — source direto do GitHub
- Valores de `exaggeration`/`cfg_weight` por tag: MEDIUM — derivados dos ranges documentados; precisam de teste de audição
- Padrões de menu/config: HIGH — lido diretamente do código existente
- Padrões de teste: HIGH — lido diretamente de `conftest.py` e `test_tts.py`

**Research date:** 2026-05-29
**Valid until:** 2026-06-29 (30 dias — stack estável, Chatterbox API improvável de mudar em patch versions)
