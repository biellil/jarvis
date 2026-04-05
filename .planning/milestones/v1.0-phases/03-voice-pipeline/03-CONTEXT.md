# Phase 3: Voice Pipeline - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 adiciona capacidade de processar audio ao JARVIS. A arquitetura e cliente-servidor: o cliente (UI futura ou simulacao) captura o audio e o envia; JARVIS faz a transcricao (STT) e devolve texto. TTS, wake word e push-to-talk eram responsabilidade do cliente na concepcao original, mas foram autorizados para implementacao direta apos verificacao (ver Gap Closure Authorization abaixo).

**Em escopo:**
- STT via faster-whisper: recebe arquivo de audio -> transcreve -> envia texto ao LLM -> retorna resposta em texto
- Simulacao via pasta monitorada: JARVIS detecta automaticamente arquivos de audio em `data/voice_input/` e os processa
- Indicacao de estado simples no terminal (mensagens de texto, sem animacoes)
- Flag `--voice` para ativar o modo de monitoramento de pasta
- Push-to-talk mic capture via sounddevice (gap closure 03-03)
- TTS via kokoro (gap closure 03-04)
- Wake word detection via openwakeword (gap closure 03-05)

**Fora de escopo nesta fase:**
- Endpoint HTTP para receber audio (vem quando o cliente real for construido)

</domain>

<decisions>
## Implementation Decisions

### Modo de ativacao
- **D-01:** Voice mode ativado via flag `--voice` -- `python -m jarvis --voice`. Sem a flag, comportamento de texto identico ao atual (Phase 1/2). Dois modos distintos sem interferencia.

### Input de audio (simulacao)
- **D-02:** Usuario aponta o arquivo manualmente no terminal: `/voice audio.wav` ou `> audio.wav`. Sem monitoramento automatico de pasta -- o usuario controla quando processar.
- **D-03:** Caminho aceito: relativo ao diretorio atual ou absoluto. JARVIS resolve o path, transcreve e responde.
- **D-04:** Formatos aceitos: qualquer formato suportado pelo faster-whisper (wav, mp3, m4a, ogg, flac). Sem conversao obrigatoria -- faster-whisper lida internamente.

### STT (Speech-to-Text)
- **D-05:** Transcricao via faster-whisper (offline, sem cloud). Modelo configuravel via `.env` (`WHISPER_MODEL`, default: `base`).
- **D-06:** Idioma configuravel via `.env` (`WHISPER_LANGUAGE`, default: `pt` para portugues). Sem auto-detect no MVP para evitar latencia extra.

### Output e estado no terminal
- **D-07:** ~~Sem TTS -- JARVIS responde apenas em texto no terminal.~~ **OVERRIDDEN (2026-04-04):** TTS via kokoro agora implementado em gap closure plan 03-04. JARVIS responde por voz quando `TTS_ENABLED=true` e `--voice` ativo. Ver Gap Closure Authorization abaixo.
- **D-08:** Estado exibido como mensagens simples no terminal:
  ```
  [voz]: processando audio.wav...
  [transcricao]: "abre o spotify"
  JARVIS: Abrindo o Spotify...
  ```
  Sem barras de estado animadas ou Rich elaborado -- cliente real cuidara da UX visual.

### Integracao com sessao existente
- **D-09:** Transcricao entra no `ChatSession.send()` exatamente como texto digitado -- memoria, perfil e ChromaDB funcionam normalmente para inputs de voz.

### Claude's Discretion
- Intervalo de polling da pasta (500ms sugerido)
- Como lidar com arquivos corrompidos ou formatos invalidos (log + skip)
- Nome do arquivo processado no historico de conversa (usar nome do arquivo ou timestamp)
- Configuracao do modelo Whisper (tiny/base/small) -- base e o default razoavel para CPU

</decisions>

<specifics>
## Specific Ideas

- Arquitetura cliente-servidor: a UI futura envia o arquivo de audio para JARVIS processar. Phase 3 simula isso com uma pasta monitorada, mas o contrato (recebe audio -> devolve texto) e o mesmo.
- O cliente real vai fazer TTS localmente (kokoro ou similar) -- JARVIS nao precisa saber disso.
- Comando `/voice caminho/audio.wav` entra no loop de texto existente -- e um comando especial reconhecido antes de ir ao LLM.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack e guidelines
- `CLAUDE.md` -- Stack recomendado: faster-whisper 1.2.1, sounddevice, kokoro, openwakeword, versoes e padroes. Secao "Voice Pipeline Architecture" e "What NOT to Use".

### Requirements e roadmap
- `.planning/REQUIREMENTS.md` -- Requirements desta fase: CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02.
- `.planning/ROADMAP.md` -- Phase 3 success criteria (5 criterios).

### Codigo existente (leitura obrigatoria antes de implementar)
- `src/jarvis/__main__.py` -- Entry point atual: loop de texto, como `--voice` precisa coexistir com ele
- `src/jarvis/core/session.py` -- ChatSession.send() -- interface que o voice mode vai chamar
- `src/jarvis/config.py` -- Settings existentes -- adicionar WHISPER_MODEL, WHISPER_LANGUAGE, VOICE_INPUT_DIR aqui

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatSession.send(user_input: str)` -- interface limpa; transcricao entra como string, sem modificacoes necessarias
- `MemoryStore` + `MemoryVectors` -- ja wired em `__main__.py`; modo voz reutiliza a mesma sessao
- `settings` (pydantic BaseSettings) -- adicionar campos WHISPER_* seguindo o padrao existente

### Established Patterns
- Entry point assincrono: `main_async()` ja usa `asyncio`; loop de monitoramento de pasta pode ser `asyncio.sleep()` + `Path.iterdir()`
- Mensagens de sistema via `console.print()` (Rich) -- manter padrao D-03 da Phase 1
- Configuracao via `.env` + pydantic -- nunca `os.environ` direto

### Integration Points
- `__main__.py:main_async()` -- reconhecer `/voice <path>` como comando especial no loop de texto antes de chamar `session.send()`
- `config.py` -- adicionar `WHISPER_MODEL`, `WHISPER_LANGUAGE`, `VOICE_INPUT_DIR`, `VOICE_PROCESSED_DIR`

</code_context>

<deferred>
## Deferred Ideas

- **Endpoint HTTP para receber audio** -- quando o cliente real for construido (Phase 5 ou posterior).
- **Auto-detect de idioma** -- desabilitado no MVP para evitar latencia; pode ser opcao configuravel depois.

</deferred>

## Gap Closure Authorization

**Date:** 2026-04-04
**Trigger:** 03-VERIFICATION.md identified 3 gaps in Phase 3 success criteria.

After reviewing VERIFICATION.md results, the following features originally deferred to "client responsibility" were authorized for direct implementation in JARVIS as gap closure plans:

| Feature | Original Status | Gap Closure Plan | Justification |
|---------|----------------|-----------------|---------------|
| Push-to-talk mic capture | Deferred (D-02 scope: file-only input) | 03-03 | SC1/CONV-02 requires real mic input, not just file simulation |
| TTS via kokoro | Deferred (D-07: "Sem TTS") | 03-04 | SC2/CONV-03 requires voice responses, not text-only |
| Wake word (openwakeword) | Deferred (client responsibility) | 03-05 | SC4/CONV-05 requires hands-free activation |

**Decision override:** D-07 ("Sem TTS") is overridden. TTS is now in scope via kokoro, gated by `TTS_ENABLED` config (default: true in voice mode).

**Rationale:** The original Phase 3 scope was conservative, delegating TTS/wake word/PTT to a future "client". Verification showed the success criteria (SC1-SC4) cannot be met without these features. Since JARVIS is a standalone desktop assistant (not a client-server split), implementing these directly is the correct approach.

---

*Phase: 03-voice-pipeline*
*Context gathered: 2026-04-04*
*Gap closure authorized: 2026-04-04*
