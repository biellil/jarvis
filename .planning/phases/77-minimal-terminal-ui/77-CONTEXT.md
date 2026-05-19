# Phase 77: Minimal Terminal UI - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar status line persistente via `rich` que mostra `[MODE] [MODEL] [STATE]` em tempo real, e um menu de config terminal acionado via `/config` que aplica mudanças sem restart do cliente.

**No escopo:** `ui.py` singleton (Console + estado + Live display), integração nos módulos existentes (chat.py, voice_modes.py, tts.py), comando `/config` no chat_loop, menu de 3 campos (Whisper model, TTS provider, voice mode).
**Fora do escopo:** Campos adicionais de config (kokoro_voice, PTT hotkey, wake_word_threshold), UI gráfica, web UI, Electron, configuração de velocidade/pitch de voz.

</domain>

<decisions>
## Implementation Decisions

### Status line: rendering approach
- **D-01:** Rich Console takeover total — `rich.Console` substitui todos os `print()` no projeto. Chat tokens: `Console.print(token, end='', flush=True)`. Todos os módulos que fazem `print()` migram para usar o Console singleton do `ui.py`. Padrão consistente, sem artifacts visuais.
- **D-02:** Status line fixada na **última linha do terminal via `rich.Live` + `rich.Layout`**. Chat output no painel principal, status no rodapé. Requer `rich.Live` com `transient=False`.

### ui.py singleton
- **D-03:** Novo módulo `ui.py` com API pública:
  - `init_ui() -> None` — inicializa Console e inicia Live display
  - `console` — instância global de `rich.Console` importada pelos módulos
  - `set_state(state: str) -> None` — atualiza estado: `"idle"` | `"listening"` | `"thinking"` | `"speaking"`
  - `get_console() -> Console` — acesso ao Console singleton
  - Segue o padrão de módulo plano dos singletons (stt.py, tts.py, voice_modes.py)

### Estado do JARVIS
- **D-04:** `ui.py` é dono do estado JARVIS. Módulos chamam `ui.set_state()` nos pontos corretos:
  - `voice_modes.py`: `set_state("listening")` ao iniciar captura, `set_state("idle")` ao terminar
  - `chat.py`: `set_state("thinking")` ao enviar para o gateway, `set_state("idle")` ao receber resposta completa
  - `tts.py`: `set_state("speaking")` ao iniciar playback, `set_state("idle")` ao terminar
- **D-05:** 4 estados exatos conforme PYUI-01: `idle` / `listening` / `thinking` / `speaking`

### Config menu: trigger e comportamento
- **D-06:** Menu acionado digitando `/config` no prompt `> ` do `chat_loop()`. O `chat_loop()` detecta input começando com `/` e trata como comando local — não envia ao gateway.
- **D-07:** Ao entrar no menu: `voice_modes.stop_mode()` — pausa todos os modos de voz. Ao sair: `voice_modes.start_mode(config.voice_mode, config)` — retoma o modo configurado. Evita que STT capture input do menu como fala.
- **D-08:** `ui.set_state("idle")` ao entrar no menu (status line reflete que JARVIS não está em modo de captura durante config).

### Config menu: escopo e navegação
- **D-09:** Apenas os 3 campos do requirement PYUI-02: Whisper model, TTS provider, voice mode.
- **D-10:** Navegação por **lista numerada simples** (funciona em qualquer terminal, sem cursor control):
  ```
  ─ Config ──────────────────────────────
  1. Whisper model  [tiny]
  2. TTS provider   [kokoro]
  3. Voice mode     [ptt]
  0. Sair
  > 
  ```
- **D-11:** Mudanças aplicam **imediatamente** ao confirmar cada campo:
  - Voice mode: chama `voice_modes.switch_mode(new_mode, config)` (que já salva via `save_config()`)
  - Whisper model: chama `stt.reload_model(new_model)` (ou equivalente que o planner definir)
  - TTS provider: chama `tts.set_provider(new_provider, config)` (ou equivalente)
  - `save_config(config)` chamado após cada mudança
  - Status line atualiza automaticamente (MODEL reflete o novo whisper_model, MODE o novo voice_mode)

### Claude's Discretion
- Formato exato do status line (ex: `[ PTT | tiny | idle ]` vs `[PTT] tiny · idle` vs outra variação)
- Como resolver o conflito de threading entre `rich.Live` e output de tokens SSE (tokens chegam via thread de leitura, Live atualiza via thread principal — o planner decide o mecanismo de sincronização)
- Se `stt.py` precisar de uma função `reload_model()` nova ou se o singleton pode ser reinicializado ao trocar modelo
- Se `tts.py` precisar de `set_provider()` nova ou se basta atualizar o config e chamar `init_tts(config)` novamente
- Exato schema do `rich.Layout` (proporção chat vs status, panel style)
- Sequência de inicialização de `ui.py` em `__main__.py` (provavelmente antes de tudo, na Step 1 ou Step 2)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### rich library
- `CLAUDE.md` §Technology Stack — rich 13.x: "Terminal UI rendering — CLI output formatting, agent thinking display, memory retrieval feedback"
- Documentação rich: `rich.Console`, `rich.Live`, `rich.Layout`, `rich.Panel`, `rich.Text`

### Código existente (Phase 72-76)
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — entry point com Steps 1-6; `init_ui()` deve ser inserido provavelmente como Step 0 ou integrado no Step 1
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `chat_loop()`: (1) detectar `/config` antes de enviar ao gateway, (2) chamar `ui.set_state("thinking")` ao enviar, (3) migrar `print()` para `console.print()`
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — `stop_mode()` e `start_mode()` para pausar/retomar ao entrar/sair do menu; `switch_mode()` para aplicar mudança de voice mode do menu
- `apps/desktop-py/src/jarvis_desktop/tts.py` — chamar `ui.set_state("speaking"/"idle")` ao iniciar/terminar TTS; migrar prints para console
- `apps/desktop-py/src/jarvis_desktop/stt.py` — migrar prints para console; `ui.set_state("listening"/"idle")` via voice_modes ou diretamente
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` e `save_config()` (D-11); nenhum campo novo necessário para esta fase
- `apps/desktop-py/pyproject.toml` — adicionar `rich` às dependencies se não presente

### Requirements
- `.planning/REQUIREMENTS.md` §PYUI-01..02 — critérios de aceite desta fase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `voice_modes.switch_mode(new_mode, config)` — já implementado, salva config e faz hot-swap (D-11)
- `voice_modes.stop_mode()` / `start_mode(mode, config)` — já implementados para pausar/retomar (D-07)
- `config.save_config()` — já implementado (D-11)
- `chat_loop()` já usa `input('> ')` — detecção de `/config` é adição simples antes do envio ao gateway

### Established Patterns
- **Singleton init antes do chat loop:** `init_stt()` → `init_tts()` → `init_voice_modes()` em `__main__.py` — `init_ui()` entra no início desta sequência
- **Módulo plano (não classe):** stt.py, tts.py, voice_modes.py — ui.py segue o mesmo padrão (D-03)
- **Nunca crashar em erro externo:** o Live display de rich não deve propagar exceptions para o usuário

### Integration Points
- `__main__.py` Step 0 ou Step 1: `init_ui()` antes de qualquer output para garantir que Console e Live estejam prontos
- `chat.py chat_loop()`: (a) migrar print → console.print, (b) detectar `/`, (c) chamar set_state
- `voice_modes.py _ptt_loop/_always_loop/_wakeword_loop`: chamar `ui.set_state("listening"/"idle")` nos pontos corretos
- `tts.py speak()`: chamar `ui.set_state("speaking")` no início, `set_state("idle")` no fim
- `pyproject.toml`: adicionar `rich>=13.0`

</code_context>

<specifics>
## Specific Ideas

- Status line format mínimo a satisfazer PYUI-01: `[MODE] [MODEL] [STATE]` — ex: `[ wake_word | tiny | idle ]`
- `/config` é o único comando `/` nesta fase — o planner pode estruturar um mini-router de comandos para extensibilidade futura (Claude's discretion)
- Whisper model options no menu: tiny / base / small / medium / large-v3-turbo (5 opções da Phase 68, default tiny)
- TTS provider options no menu: kokoro / elevenlabs / murf (3 opções existentes em JarvisConfig)
- Voice mode options no menu: ptt / always_listening / wake_word (3 modos de Phase 76)

</specifics>

<deferred>
## Deferred Ideas

- kokoro_voice (PT-BR voice) no menu de config — mencionado como possível extensão mas fora do escopo mínimo
- PTT hotkey reconfigurável no menu — fora do escopo desta fase
- wake_word_threshold configurável no menu — fora do escopo desta fase
- local_only toggle no menu — fora do escopo desta fase

</deferred>

---

*Phase: 77-minimal-terminal-ui*
*Context gathered: 2026-05-18*
