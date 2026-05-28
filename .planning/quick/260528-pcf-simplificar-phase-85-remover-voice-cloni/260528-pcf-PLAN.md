---
phase: quick
plan: 260528-pcf
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop-py/src/jarvis_desktop/tts.py
  - apps/desktop-py/src/jarvis_desktop/chat.py
autonomous: true
requirements: []

must_haves:
  truths:
    - "speak() não faz import de voice_cloning nem chama _kokoro_speak_with_embedding"
    - "Menu /config opção 7 exibe seletor de vozes Kokoro preset (pf_dora, pm_alex, pm_santa)"
    - "Selecionar voz preset atualiza config.kokoro_voice e reinicia engine Kokoro"
    - "A função _kokoro_speak_with_embedding não existe mais em tts.py"
    - "voice_cloning.py e cloned_voice_path em JarvisConfig permanecem intactos"
    - "Todos os testes existentes passam sem modificação"
  artifacts:
    - path: apps/desktop-py/src/jarvis_desktop/tts.py
      provides: speak() sem branch de voz clonada
    - path: apps/desktop-py/src/jarvis_desktop/chat.py
      provides: _menu_kokoro_voice() substituindo _menu_cloned_voice()
  key_links:
    - from: chat.py _show_config_menu()
      to: _menu_kokoro_voice()
      via: choice == "7"
    - from: _menu_kokoro_voice()
      to: tts.set_provider() / config.kokoro_voice + _engine reset
      via: selecionar preset atualiza config e reseta _engine
---

<objective>
Remover o dead code de voz clonada de tts.speak() e converter o menu de configuração da "Voz clonada" em um seletor de voz Kokoro preset.

Purpose: A arquitetura kokoclone não existe no PyPI e KPipeline não aceita embeddings arbitrários — o código em tts.py é inoperante e confunde. O menu "/config Voz clonada" deve passar a servir para trocar entre as vozes PT-BR nativas do Kokoro.

Output:
- tts.py sem o bloco load_cloned_voice em speak() e sem _kokoro_speak_with_embedding
- chat.py com _menu_kokoro_voice() no lugar de _menu_cloned_voice()
- cloned_voice_path em JarvisConfig e voice_cloning.py intocados
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/desktop-py/src/jarvis_desktop/tts.py
@apps/desktop-py/src/jarvis_desktop/chat.py

<interfaces>
<!-- Kokoro vozes PT-BR disponíveis como presets -->
KOKORO_VOICES_PTBR = ["pf_dora", "pm_alex", "pm_santa"]

<!-- JarvisConfig campos relevantes (não alterar) -->
config.kokoro_voice: str       # voz atual do Kokoro — atualizável em runtime
config.cloned_voice_path: str  # MANTER — não remover nem usar no fluxo TTS

<!-- tts.py API pública (não alterar assinaturas) -->
def speak(text: str, config: JarvisConfig) -> None
def set_provider(provider: str, config: JarvisConfig) -> None
def init_tts(config: JarvisConfig) -> None
# Para trocar voz: zerar _engine (global) força lazy-init na próxima chamada a speak()

<!-- Padrão existente em _menu_tts_provider() para referência -->
# Exibe lista numerada com [x] no atual, lê escolha, chama tts.set_provider(), salva config
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remover dead code de voz clonada de tts.py</name>
  <files>apps/desktop-py/src/jarvis_desktop/tts.py</files>
  <action>
Fazer duas remoções cirúrgicas em tts.py:

**1. No bloco speak() (linhas 117-128): remover o branch de voz clonada inteiro.**

Remover estas linhas de speak():
```python
    # D-04: Phase 85 — cloned voice overrides all other providers
    from jarvis_desktop.voice_cloning import load_cloned_voice  # Lazy import — optional dep
    cloned_embedding = None
    if config.cloned_voice_path:
        try:
            cloned_embedding = load_cloned_voice(config)
        except Exception as exc:
            _console().print(f"[VOICE] Erro ao carregar voz clonada: {exc} — usando voz padrão.")
            cloned_embedding = None

    if cloned_embedding is not None:
        _kokoro_speak_with_embedding(text, cloned_embedding, config)
        return
```

speak() deve ir direto para o bloco "Cloud provider path" depois dos dois guards iniciais (empty text e tts_provider == "none").

**2. Remover a função _kokoro_speak_with_embedding inteira (linhas 301-360).**

Remover a função completa incluindo docstring.

**3. Atualizar o docstring do módulo e da função speak():**

No docstring do módulo (topo do arquivo):
- Remover a linha: `  _kokoro_speak_with_embedding(text, embedding, config) -> None  — Kokoro with cloned tensor (Phase 85)`
- Remover referências a "Phase 85" dos comentários de decisões

No docstring de speak():
- Remover o item 1 da lista de provider selection: `1. cloned_voice_path set + file exists → _kokoro_speak_with_embedding (Phase 85)`
- Renumerar os itens restantes: ElevenLabs vira 1, Murf vira 2, Kokoro offline vira 3, silent vira 4
- Remover `(Phase 85)` da linha do header do docstring
  </action>
  <verify>
    <automated>cd apps/desktop-py && python -c "from jarvis_desktop import tts; import inspect; src = inspect.getsource(tts); assert 'voice_cloning' not in src, 'voice_cloning import found'; assert '_kokoro_speak_with_embedding' not in src, '_kokoro_speak_with_embedding found'; print('OK: dead code removed')"</automated>
  </verify>
  <done>
    - speak() não importa voice_cloning nem chama _kokoro_speak_with_embedding
    - _kokoro_speak_with_embedding não existe no módulo
    - tts.py importa sem erro
    - Docstrings atualizados e consistentes
  </done>
</task>

<task type="auto">
  <name>Task 2: Converter menu "Voz clonada" em seletor de voz Kokoro preset em chat.py</name>
  <files>apps/desktop-py/src/jarvis_desktop/chat.py</files>
  <action>
Fazer três alterações em chat.py:

**1. Substituir a linha do menu em _show_config_menu() (linha 682):**

Atual:
```python
        _cloned = config.cloned_voice_path or "desativada"
        console.print(f"7. Voz clonada        [{_cloned}]", markup=False)
```

Novo:
```python
        console.print(f"7. Voz Kokoro         [{config.kokoro_voice}]", markup=False)
```

**2. No handler de choice "7" em _show_config_menu() (linha 714):**

Atual:
```python
        elif choice == "7":
            _menu_cloned_voice(config)
```

Novo:
```python
        elif choice == "7":
            _menu_kokoro_voice(config)
```

**3. Substituir a função _menu_cloned_voice() inteira pela nova _menu_kokoro_voice():**

Remover _menu_cloned_voice() completa (linhas 831-876) e no lugar adicionar:

```python
def _menu_kokoro_voice(config: JarvisConfig) -> None:
    """Kokoro voice preset selection sub-menu.

    Lists available PT-BR Kokoro voices. Selecting one updates config.kokoro_voice
    and resets the Kokoro engine so the next speak() call uses the new voice.
    """
    from jarvis_desktop import ui, tts
    from jarvis_desktop.config import save_config

    console = ui.get_console()
    voices = ["pf_dora", "pm_alex", "pm_santa"]

    console.print()
    console.print("Vozes Kokoro:", highlight=False)
    for i, v in enumerate(voices, 1):
        marker = "[x]" if v == config.kokoro_voice else "[ ]"
        console.print(f"  {i}. {v} {marker}", markup=False)
    console.print()

    try:
        raw = ui.get_input("Selecione (1-3, Enter para cancelar): ").strip()
        if not raw:
            return
        idx = int(raw) - 1
        if 0 <= idx < len(voices):
            new_voice = voices[idx]
            if new_voice == config.kokoro_voice:
                console.print(f"[TTS] Ja usando {new_voice}.", highlight=False)
                return
            config.kokoro_voice = new_voice
            # Reset engine so next speak() lazy-initializes with new voice
            tts._engine = None
            save_config(config)
            console.print(f"[TTS] Voz Kokoro: {new_voice}.", highlight=False)
        else:
            console.print("[Selecao fora do intervalo]", highlight=False)
    except ValueError:
        console.print("[Entrada invalida — insira um numero]", highlight=False)
    except (EOFError, KeyboardInterrupt):
        pass
```

Nota: Usar ASCII sem acentos nas strings de console.print() para evitar UnicodeEncodeError em terminais cp1252 (padrão estabelecido na STATE.md).
  </action>
  <verify>
    <automated>cd apps/desktop-py && python -c "from jarvis_desktop import chat; import inspect; src = inspect.getsource(chat); assert '_menu_cloned_voice' not in src, '_menu_cloned_voice still present'; assert '_menu_kokoro_voice' in src, '_menu_kokoro_voice missing'; assert 'pf_dora' in src, 'voice presets missing'; print('OK: menu converted')"</automated>
  </verify>
  <done>
    - _menu_cloned_voice não existe mais em chat.py
    - _menu_kokoro_voice exibe pf_dora, pm_alex, pm_santa com marcador [x]/[ ]
    - Selecionar preset atualiza config.kokoro_voice, zera tts._engine, salva config
    - Menu opção 7 exibe "Voz Kokoro  [voz_atual]"
    - chat.py importa sem erro
  </done>
</task>

<task type="auto">
  <name>Task 3: Verificar suite de testes</name>
  <files></files>
  <action>
Rodar a suite de testes existente para confirmar que nenhum teste foi quebrado pelas mudanças.

Não modificar nenhum teste — apenas executar e verificar.
  </action>
  <verify>
    <automated>cd apps/desktop-py && python -m pytest tests/ -x -q 2>&1 | tail -20</automated>
  </verify>
  <done>
    - Todos os testes que passavam antes continuam passando
    - Nenhum novo failure introduzido
    - xfail/xpass permanecem iguais
  </done>
</task>

</tasks>

<verification>
1. `from jarvis_desktop import tts` — importa sem erro
2. `from jarvis_desktop import chat` — importa sem erro
3. `tts.speak()` source não contém "voice_cloning" nem "_kokoro_speak_with_embedding"
4. `chat._menu_kokoro_voice` existe e referencia vozes ["pf_dora", "pm_alex", "pm_santa"]
5. `voice_cloning.py` intocado — `git diff apps/desktop-py/src/jarvis_desktop/voice_cloning.py` vazio
6. Suite de testes passa sem falhas novas
</verification>

<success_criteria>
- speak() segue fluxo direto: guard empty → guard none → cloud → kokoro offline
- Menu /config opção 7 exibe seletor de vozes Kokoro com marcadores [x]/[ ]
- Trocar voz preset persiste em config.json e ativa na próxima fala
- Nenhum arquivo fora de tts.py e chat.py foi modificado
- Todos os testes existentes passam
</success_criteria>

<output>
Após conclusão, criar `.planning/quick/260528-pcf-simplificar-phase-85-remover-voice-cloni/260528-pcf-SUMMARY.md`
</output>
