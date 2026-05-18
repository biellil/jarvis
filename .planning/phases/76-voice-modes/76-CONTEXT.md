# Phase 76: Voice Modes - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar state machine de modos de voz mutuamente exclusivos: PTT (já funciona na Phase 74, mantido), always-listening (VAD contínuo sem wake word) e wake word ("Hey JARVIS" via openwakeword offline). O campo `voice_mode` já existe em `JarvisConfig` com default `"ptt"`. Phase 76 entrega o `voice_modes.py` que gerencia qual modo está ativo e faz hot-swap em runtime.

**No escopo:** `voice_modes.py` (state machine centralizado), openwakeword listener thread, always-listening VAD loop, hot-swap de modo em runtime, integração com `stop_tts()` (PTT blocking durante TTS).
**Fora do escopo:** menu de config (Phase 77), rich status line (Phase 77), multi-turn follow-up sem wake word (milestone futuro).

</domain>

<decisions>
## Implementation Decisions

### Estrutura do state machine
- **D-01:** Novo módulo `voice_modes.py` centralizado — seguindo o padrão `stt.py` / `tts.py` já estabelecido. Módulo plano com funções `init_voice_modes(config)`, `start_mode(mode)`, `stop_mode()`. `chat.py` chama `voice_modes` em vez de gerenciar PTT diretamente.
- **D-02:** Entrega de texto transcrito para o chat loop: **Claude decide** (queue vs callback) — o que fizer mais sentido no contexto do código existente (threading.Queue é o padrão natural para producer/consumer entre threads).

### openwakeword: modelo e threading
- **D-03:** Download automático com progresso na primeira ativação de wake word mode — idêntico ao comportamento do Kokoro na Phase 75. Usuário não precisa baixar manualmente.
- **D-04:** Listener de wake word roda em **daemon thread separada** com `sd.InputStream` (sounddevice stream contínuo). Quando detecta "Hey JARVIS", sinaliza para parar o listener e iniciar `record_until_silence()` do `stt.py`. Usa sounddevice — **NÃO PyAudio** (CLAUDE.md: PyAudio proibido).

### Comportamento durante TTS (bloqueio de captura)
- **D-05:** PTT pressionado durante TTS ativo: **espera TTS terminar** antes de iniciar a captura. Não interrompe o TTS (diferente do comportamento de "parar imediatamente").
- **D-06:** **Todos os modos bloqueiam durante TTS** — enquanto `is_speaking` for True, nenhum modo captura áudio. Evita feedback loop (JARVIS ouçindo a si mesmo). Implementado como flag no state machine.

### Hot-swap de modo em runtime
- **D-07:** Troca de modo funciona **sem reiniciar o cliente** (hot-swap). `voice_modes.py` expõe `switch_mode(new_mode, config)` que: (1) para o modo atual, (2) inicia o novo modo. Phase 77 chamará esse método ao salvar a config pelo menu.
- **D-08:** `switch_mode()` salva o novo modo em `~/.jarvis/config.json` via `save_config()` (já implementado na Phase 72).

### Claude's Discretion
- Mecanismo exato de sincronização entre threads (threading.Queue, threading.Event, ou outro)
- Como `chat_loop()` em `chat.py` é refatorado para consumir texto de `voice_modes` além do `input()` de teclado
- Parâmetros do openwakeword (chunk_size para sd.InputStream, threshold de detecção — PYMODE-01 especifica default 0.7)
- Tratamento de erro quando microfone não disponível em always-listening/wake_word (mensagem clara, não crash)
- Como `is_speaking` flag é exposto pelo `tts.py` para `voice_modes.py` consultar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wake word stack (openwakeword)
- `CLAUDE.md` §Technology Stack — openwakeword: `openwakeword 0.6.x`, offline, sem API key, Silero VAD, onnxruntime (cross-platform)
- `CLAUDE.md` §What NOT to Use — PyAudio proibido (requer PortAudio headers no Linux); usar sounddevice
- `CLAUDE.md` §Cross-Platform Audio Notes — Windows: sounddevice inclui PortAudio nos wheels; Linux: `libportaudio2`

### Código existente (Phase 72-75)
- `apps/desktop-py/src/jarvis_desktop/stt.py` — `init_stt()`, `record_until_silence()`, `transcribe()`: reutilizados por voice_modes.py para captura e transcrição
- `apps/desktop-py/src/jarvis_desktop/tts.py` — `stop_tts()`: chamado quando TTS precisa ser parado; consultar também como `is_speaking` pode ser exposto
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `chat_loop()`: precisa ser refatorado para aceitar texto de voice_modes além de input() de teclado; PTT atualmente wired diretamente aqui (Phase 74)
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig.voice_mode` já existe (default `"ptt"`); `save_config()` disponível para D-08
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — ponto onde inserir `init_voice_modes(config)` após `init_tts(config)`
- `apps/desktop-py/pyproject.toml` — adicionar `openwakeword` às dependencies

### Requirements
- `.planning/REQUIREMENTS.md` §PYMODE-01..03 — critérios de aceite: PYMODE-01 wake word threshold 0.7, PYMODE-02 VAD contínuo, PYMODE-03 PTT idêntico ao Phase 74

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `stt.py`: `record_until_silence(threshold_ms)` + `transcribe(audio)` — reaproveitados por todos os 3 modos para captura e transcrição
- `tts.py`: `stop_tts()` — chamado por voice_modes.py quando necessário (D-05/D-06 bloqueio)
- `config.py`: `JarvisConfig.voice_mode: str = "ptt"` + `save_config()` — base para D-07/D-08
- `sounddevice` (já instalado): `sd.InputStream` para listener contínuo do wake word (D-04)

### Established Patterns
- **Singleton init antes do chat loop:** `init_stt()` → `init_tts()` → `init_voice_modes()` em `__main__.py`
- **Módulo plano (não classe):** stt.py e tts.py são módulos planos com funções exportadas — voice_modes.py deve seguir o mesmo padrão (D-01)
- **Prints simples para status:** sem rich (até Phase 77). `print("[VOICE] ...")` com `flush=True`
- **Nunca crashar em erro externo:** microfone indisponível → mensagem clara, não exception não tratada

### Integration Points
- `__main__.py`: `init_voice_modes(config)` inserido após `init_tts(config)`, antes de `chat_loop(config)`
- `chat.py` `chat_loop()`: refatoração para aceitar texto de voice_modes (além de input() de teclado) — PTT hoje wired diretamente no chat_loop via pynput GlobalHotKeys precisa migrar para voice_modes.py
- `tts.py`: precisa expor flag ou mecanismo de consulta `is_speaking` para voice_modes.py implementar D-06
- `pyproject.toml`: adicionar `openwakeword` às dependencies

</code_context>

<specifics>
## Specific Ideas

- `voice_modes.py` deve expor `switch_mode(new_mode, config)` para Phase 77 chamar no menu de config
- Wake word threshold padrão: **0.7** (especificado em PYMODE-01) — configurável via config
- PTT em wake word/always-listening mode: hotkey PTT ainda deve funcionar como override manual (PYMODE-03: "PTT mode — configured hotkey starts/stops recording — identical to Phase 74 standalone behavior")
- Todos os modos devem mostrar feedback de estado via print: `[VOICE] modo: wake_word — aguardando "Hey JARVIS"...`

</specifics>

<deferred>
## Deferred Ideas

- Multi-turn follow-up sem repetir wake word após resposta (Electron MTURN pattern) — milestone futuro
- Streaming TTS por sentença com VAD interrupção mid-sentence — complexidade adiada
- Filtro de eco (para wake word ouvir durante TTS) — bloqueio global (D-06) é suficiente para MVP

</deferred>

---

*Phase: 76-voice-modes*
*Context gathered: 2026-05-18*
