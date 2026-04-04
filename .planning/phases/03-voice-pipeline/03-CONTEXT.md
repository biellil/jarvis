# Phase 3: Voice Pipeline - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 adiciona capacidade de processar áudio ao JARVIS. A arquitetura é cliente-servidor: o cliente (UI futura ou simulação) captura o áudio e o envia; JARVIS faz a transcrição (STT) e devolve texto. TTS, wake word e push-to-talk são responsabilidade do cliente — JARVIS não os implementa nesta fase.

**Em escopo:**
- STT via faster-whisper: recebe arquivo de áudio → transcreve → envia texto ao LLM → retorna resposta em texto
- Simulação via pasta monitorada: JARVIS detecta automaticamente arquivos de áudio em `data/voice_input/` e os processa
- Indicação de estado simples no terminal (mensagens de texto, sem animações)
- Flag `--voice` para ativar o modo de monitoramento de pasta

**Fora de escopo nesta fase:**
- TTS (síntese de voz) — fica no cliente
- Wake word detection — fica no cliente
- Push-to-talk — fica no cliente
- Endpoint HTTP para receber áudio (vem quando o cliente real for construído)

</domain>

<decisions>
## Implementation Decisions

### Modo de ativação
- **D-01:** Voice mode ativado via flag `--voice` — `python -m jarvis --voice`. Sem a flag, comportamento de texto idêntico ao atual (Phase 1/2). Dois modos distintos sem interferência.

### Input de áudio (simulação)
- **D-02:** Usuário aponta o arquivo manualmente no terminal: `/voice audio.wav` ou `> audio.wav`. Sem monitoramento automático de pasta — o usuário controla quando processar.
- **D-03:** Caminho aceito: relativo ao diretório atual ou absoluto. JARVIS resolve o path, transcreve e responde.
- **D-04:** Formatos aceitos: qualquer formato suportado pelo faster-whisper (wav, mp3, m4a, ogg, flac). Sem conversão obrigatória — faster-whisper lida internamente.

### STT (Speech-to-Text)
- **D-05:** Transcrição via faster-whisper (offline, sem cloud). Modelo configurável via `.env` (`WHISPER_MODEL`, default: `base`).
- **D-06:** Idioma configurável via `.env` (`WHISPER_LANGUAGE`, default: `pt` para português). Sem auto-detect no MVP para evitar latência extra.

### Output e estado no terminal
- **D-07:** Sem TTS — JARVIS responde apenas em texto no terminal.
- **D-08:** Estado exibido como mensagens simples no terminal:
  ```
  [voz]: processando audio.wav...
  [transcrição]: "abre o spotify"
  JARVIS: Abrindo o Spotify...
  ```
  Sem barras de estado animadas ou Rich elaborado — cliente real cuidará da UX visual.

### Integração com sessão existente
- **D-09:** Transcrição entra no `ChatSession.send()` exatamente como texto digitado — memória, perfil e ChromaDB funcionam normalmente para inputs de voz.

### Claude's Discretion
- Intervalo de polling da pasta (500ms sugerido)
- Como lidar com arquivos corrompidos ou formatos inválidos (log + skip)
- Nome do arquivo processado no histórico de conversa (usar nome do arquivo ou timestamp)
- Configuração do modelo Whisper (tiny/base/small) — base é o default razoável para CPU

</decisions>

<specifics>
## Specific Ideas

- Arquitetura cliente-servidor: a UI futura envia o arquivo de áudio para JARVIS processar. Phase 3 simula isso com uma pasta monitorada, mas o contrato (recebe áudio → devolve texto) é o mesmo.
- O cliente real vai fazer TTS localmente (kokoro ou similar) — JARVIS não precisa saber disso.
- Comando `/voice caminho/audio.wav` entra no loop de texto existente — é um comando especial reconhecido antes de ir ao LLM.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack e guidelines
- `CLAUDE.md` — Stack recomendado: faster-whisper 1.2.1, sounddevice (não necessário aqui — sem captura de mic), versões e padrões. Seção "Voice Pipeline Architecture" e "What NOT to Use".

### Requirements e roadmap
- `.planning/REQUIREMENTS.md` — Requirements desta fase: CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02. Nota: CONV-03 (TTS), CONV-05 (wake word) e parte de CONV-02 (PTT) ficam no cliente — esta fase entrega a infraestrutura de STT e o contrato de input/output.
- `.planning/ROADMAP.md` — Phase 3 success criteria (5 critérios). Ajuste de escopo: SC1 é satisfeito via pasta monitorada, SC2 via texto no terminal, SC4 (wake word) é responsabilidade do cliente.

### Código existente (leitura obrigatória antes de implementar)
- `src/jarvis/__main__.py` — Entry point atual: loop de texto, como `--voice` precisa coexistir com ele
- `src/jarvis/core/session.py` — ChatSession.send() — interface que o voice mode vai chamar
- `src/jarvis/config.py` — Settings existentes — adicionar WHISPER_MODEL, WHISPER_LANGUAGE, VOICE_INPUT_DIR aqui

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatSession.send(user_input: str)` — interface limpa; transcrição entra como string, sem modificações necessárias
- `MemoryStore` + `MemoryVectors` — já wired em `__main__.py`; modo voz reutiliza a mesma sessão
- `settings` (pydantic BaseSettings) — adicionar campos WHISPER_* seguindo o padrão existente

### Established Patterns
- Entry point assíncrono: `main_async()` já usa `asyncio`; loop de monitoramento de pasta pode ser `asyncio.sleep()` + `Path.iterdir()`
- Mensagens de sistema via `console.print()` (Rich) — manter padrão D-03 da Phase 1
- Configuração via `.env` + pydantic — nunca `os.environ` direto

### Integration Points
- `__main__.py:main_async()` — reconhecer `/voice <path>` como comando especial no loop de texto antes de chamar `session.send()`
- `config.py` — adicionar `WHISPER_MODEL`, `WHISPER_LANGUAGE`, `VOICE_INPUT_DIR`, `VOICE_PROCESSED_DIR`

</code_context>

<deferred>
## Deferred Ideas

- **TTS no JARVIS** — responsabilidade do cliente. Se JARVIS vier a precisar de TTS embutido (ex: modo standalone sem cliente), entra em fase futura.
- **Wake word embutido** (openwakeword) — cliente faz isso. Pode entrar em fase futura se houver modo standalone.
- **Endpoint HTTP para receber áudio** — quando o cliente real for construído (Phase 5 ou posterior).
- **Push-to-talk no terminal** — sem mouse/teclado para PTT no modo simulação; cliente real gerencia isso.
- **Auto-detect de idioma** — desabilitado no MVP para evitar latência; pode ser opção configurável depois.

</deferred>

---

*Phase: 03-voice-pipeline*
*Context gathered: 2026-04-04*
