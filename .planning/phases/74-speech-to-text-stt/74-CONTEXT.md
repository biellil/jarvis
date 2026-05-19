# Phase 74: Speech-to-Text (STT) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar captura de áudio via PTT hotkey global + transcrição local com faster-whisper singleton + VAD auto end-of-speech. Quando o usuário segura Ctrl+Shift+Q e fala, o texto transcrito é enviado direto ao gateway como se tivesse digitado.

**No escopo:** stt.py (singleton faster-whisper + sounddevice + pynput PTT), integração com chat loop existente, configuração de modelo e threshold no JarvisConfig.
**Fora do escopo:** wake word (Phase 76), sempre-ouvindo/always-listening (Phase 76), TTS (Phase 75), rich UI (Phase 77).

</domain>

<decisions>
## Implementation Decisions

### Modelo de interação PTT
- **D-01:** Hold-to-record + VAD auto-stop. Usuário segura Ctrl+Shift+Q enquanto fala. **VAD é o stop primário** — dispara transcrição quando detecta silêncio, mesmo que o usuário ainda esteja segurando. Se o usuário soltar a tecla antes, transcrição dispara imediatamente (release = fallback stop).
- **D-02:** Tecla padrão: **Ctrl+Shift+Q**, configurável via `ptt_key` em `~/.jarvis/config.json`. Adicionar `ptt_key: str = "ctrl+shift+q"` ao `JarvisConfig`.

### Hotkey library
- **D-03:** Usar **pynput** para captura do hotkey PTT. Listener **global** — funciona mesmo com outra janela em foco, não apenas quando o terminal está ativo.
- **D-04:** Adicionar `pynput` às dependências em `pyproject.toml`.

### Integração STT → chat loop
- **D-05:** Após transcrição, o texto vai **diretamente ao gateway** (sem confirmação). Mostrar no terminal `> [transcrito: <texto>]` antes de enviar — usuário vê o que foi transcrito, mas não precisa confirmar.
- **D-06:** Feedback de estado via prints simples (sem rich nesta fase, consistente com D-01 da Phase 73):
  - Ao pressionar PTT: `[STT] ouvindo...`
  - Ao detectar fim de fala (VAD/release): `[STT] transcrevendo...`
  - Após transcrição: `> [transcrito: <texto>]` seguido da resposta do gateway em streaming

### Loading do modelo Whisper
- **D-07:** Carregamento **blocking na startup** com mensagem de status:
  ```
  [STT] Carregando modelo tiny... (configurável em ~/.jarvis/config.json)
  [STT] Pronto.
  ```
  Acontece após o health check, antes do chat loop. Para tiny/base é instantâneo; para large-v3-turbo pode ser ~10s — o usuário vê a mensagem e sabe que está carregando.
- **D-08:** Singleton: modelo carregado uma vez, reutilizado em todas as transcrições da sessão.

### Claude's Discretion
- Estrutura interna de `stt.py` (funções exportadas, classe vs módulo plano)
- Formato exato do campo `ptt_key` no config (string "ctrl+shift+q" ou dict `{key: "q", modifiers: ["ctrl", "shift"]}`)
- Parâmetros de VAD (frame_duration, padding) dentro do threshold configurável
- Tratamento de erro quando microfone não disponível (erro claro, não crash)
- Valor padrão do silence threshold (ex: 500ms de silêncio após fala detectada)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### STT stack (faster-whisper + sounddevice)
- `CLAUDE.md` §Voice Pipeline Architecture — padrão sounddevice (numpy arrays) + faster-whisper, motivos para não usar PyAudio
- `CLAUDE.md` §Technology Stack — versões pinadas: `faster-whisper==1.2.1`, `sounddevice==0.5.5`
- `CLAUDE.md` §What NOT to Use — `SpeechRecognition`, `openai/whisper`, PyAudio proibidos
- `CLAUDE.md` §Cross-Platform Audio Notes — Windows: sounddevice inclui PortAudio nos wheels; Linux: requer `libportaudio2`

### Código existente (Phase 72-73)
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` schema; D-02 adiciona `ptt_key`, D-07 usa `whisper_model` existente
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — entry point; D-07 adiciona loading do Whisper após health check
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `chat_loop()`; integração D-05 injeta texto transcrito aqui
- `apps/desktop-py/pyproject.toml` — onde adicionar `pynput` e `faster-whisper` + `sounddevice` (D-04)

### Requirements
- `.planning/REQUIREMENTS.md` §PYSTT-01..03 — critérios de aceite desta fase

### Sem specs externos adicionais
- Nenhum ADR externo referenciado. Requirements completamente capturados nas decisões acima.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `jarvis_desktop/config.py` — `JarvisConfig` + `load_config()`: D-02 adiciona `ptt_key: str = "ctrl+shift+q"` seguindo o padrão de extensão (D-07/D-08 da Phase 72)
- `jarvis_desktop/chat.py` — `chat_loop()`: D-05 precisa de um mecanismo para injetar texto transcrito no loop (substituir `input('> ')` quando PTT ativado)
- `jarvis_desktop/__main__.py` — ponto onde inserir o loading do singleton Whisper (D-07) entre `run_with_health_check()` e `chat_loop()`

### Established Patterns
- **stdlib-first com fallback:** seguir padrão de `health.py`. Para stt.py, usar sounddevice + faster-whisper sem abstrações extras.
- **Nunca crashar em erro externo:** microfone indisponível deve virar mensagem de erro clara, não exception não tratada (padrão D-11 Phase 72).
- **Prints simples para status:** sem rich nesta fase (D-01 Phase 73). `print("[STT] ...")` com flush=True.
- **JarvisConfig extensão:** adicionar campos novos com defaults, nunca redefinir existentes (D-07/D-08 Phase 72).

### Integration Points
- `__main__.py` → `stt.py`: carrega singleton antes de `chat_loop()`
- `chat.py` `chat_loop()`: recebe texto (do teclado OU do STT) e envia ao gateway — a mudança precisa ser compatível com o fluxo text-only ainda funcionando
- `pyproject.toml`: adicionar `pynput`, `faster-whisper`, `sounddevice` às dependencies

</code_context>

<specifics>
## Specific Ideas

- O módulo `stt.py` deve exportar pelo menos: função de inicialização do singleton, e alguma forma de o chat loop aguardar texto transcrito (callback, queue, ou função blocking)
- Texto digitado no teclado e texto transcrito por voz devem resultar no mesmo comportamento downstream — o gateway recebe a mesma requisição SSE de qualquer um dos dois
- `ptt_key` default `"ctrl+shift+q"` foi escolhida para não conflitar com VSCode/IDE quando o terminal está em outra janela

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 74-speech-to-text-stt*
*Context gathered: 2026-05-18*
