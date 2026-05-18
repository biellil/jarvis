# Phase 75: Text-to-Speech (TTS) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar TTS ao JARVIS: Kokoro offline como engine primário com voz PT-BR padrão. Usuário configura qual provider usar (`tts_provider` no config.json). Se o provider falhar ou chave ausente, fallback automático para Kokoro offline. Modo `local_only: true` desabilita providers cloud.

**No escopo:** `tts.py` singleton, integração no `chat_loop` (fala após stream completo), campos de config (`tts_provider`, `kokoro_voice`, `local_only`, `elevenlabs_api_key`, `murf_api_key`), fallback Kokoro quando cloud falha.
**Fora do escopo:** wake word (Phase 76), state machine de modos de voz (Phase 76), rich UI (Phase 77), interrupção via PTT mid-TTS (Phase 76 — Phase 75 expõe `stop_tts()` para Phase 76 usar).

</domain>

<decisions>
## Implementation Decisions

### Momento do playback
- **D-01:** TTS toca **após resposta completa** — acumula todos os tokens do SSE stream, quando o stream termina executa TTS no texto completo. Tokens continuam sendo impressos no terminal normalmente via `print(token, end='', flush=True)` durante o stream (comportamento inalterado da Phase 73).
- **D-02:** Sequência: texto aparece no terminal (stream) → stream termina → `[TTS] falando...` → áudio toca → volta ao prompt.

### Voz padrão (PT-BR)
- **D-03:** Voz padrão: **PT-BR via Kokoro**. O campo `kokoro_voice` no config.json determina qual voz usar (configurável). Default a definir pelo planner (uma voz pt-br disponível no Kokoro, ex: `pt_bf_edite` ou equivalente válido).
- **D-04:** Se espeak-ng não estiver disponível (Windows sem instalação manual), TTS **fica silencioso** — sem fallback para voz inglesa. Terminal mostra aviso: `[TTS] espeak-ng não encontrado — voz PT-BR indisponível. Texto exibido normalmente.`
- **D-05:** `kokoro_voice` é configurável via `~/.jarvis/config.json`. Adicionar campo `kokoro_voice: str` ao `JarvisConfig` com default para uma voz pt-br.

### Fallback chain
- **D-06:** Arquitetura de fallback: **usuário escolhe provider via `tts_provider`** → se falhar (erro, chave ausente) → Kokoro offline como fallback final. Não há chain de 3 providers em sequência fixa.
- **D-07:** `tts_provider` existente no `JarvisConfig` (default `"kokoro"`) controla qual provider usar: `"kokoro"` | `"elevenlabs"` | `"murf"`.
- **D-08:** API keys ficam no `~/.jarvis/config.json`: campos `elevenlabs_api_key: str = ""` e `murf_api_key: str = ""`. Se o provider selecionado não tiver chave, cai no Kokoro com aviso.
- **D-09:** Notificação de fallback via print simples: `[TTS] ElevenLabs indisponível — usando Kokoro offline.`

### Modo local-only
- **D-10:** Campo `local_only: bool = False` no `JarvisConfig`. Com `local_only: true`, nunca acessa ElevenLabs ou Murf — TTS é Kokoro ou silencioso (PYTTS-04).

### Interrupção por PTT (integration point para Phase 76)
- **D-11:** `tts.py` deve expor função `stop_tts()` que interrompe o áudio em reprodução. Phase 75 implementa a função; Phase 76 a chama quando o usuário pressiona o hotkey PTT durante o playback.

### Output durante TTS
- **D-12:** Sem rich nesta fase — `print()` simples para todos os status TTS (consistente com D-01 Phase 73).

### Claude's Discretion
- Estrutura interna de `tts.py` (classe vs módulo plano, singleton pattern)
- Qual engine de playback de áudio usar para o Kokoro (sounddevice já está no stack)
- Parâmetros de geração Kokoro (speed, pitch)
- Tratamento de erro quando model Kokoro não tiver sido baixado (primeiro run — mostrar progresso do download, PYTTS-01)
- Timeout e retry para ElevenLabs/Murf API calls

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### TTS stack (Kokoro + cloud providers)
- `CLAUDE.md` §Technology Stack — Kokoro: `kokoro 0.9.4+`, Apache-licensed, 82M params, 350MB model, offline
- `CLAUDE.md` §Voice Pipeline Architecture — TTS: kokoro > pyttsx3/espeak; RealtimeTTS opcional para streaming
- `CLAUDE.md` §What NOT to Use — pyttsx3 (robotic), Coqui TTS (arquivado 2024), ElevenLabs (violaria local-only)
- `CLAUDE.md` §Cross-Platform Audio Notes — kokoro no macOS: sem espeak-ng; kokoro no Linux: `apt install espeak-ng`

### Código existente (Phase 72-74)
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig`: adicionar `kokoro_voice`, `local_only`, `elevenlabs_api_key`, `murf_api_key` seguindo padrão de extensão
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — ponto de inserção: TTS init após `init_stt()`, antes de `chat_loop()`
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `chat_loop()`: modificar para acumular tokens e chamar TTS após stream completo
- `apps/desktop-py/src/jarvis_desktop/stt.py` — padrão a seguir para singleton TTS (init function + módulo plano)
- `apps/desktop-py/pyproject.toml` — adicionar `kokoro` às dependencies

### Requirements
- `.planning/REQUIREMENTS.md` §PYTTS-01..04 — critérios de aceite desta fase

**Nota sobre desvio do ROADMAP:**
O ROADMAP descreve Kokoro → ElevenLabs → Murf como chain fixa. O usuário decidiu na discussão que a arquitetura correta é: usuário configura provider preferido, Kokoro é sempre o fallback offline. Isso ainda satisfaz PYTTS-01..04 mas com arquitetura diferente.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `jarvis_desktop/stt.py` — padrão de singleton a replicar em `tts.py`: função `init_tts(config)` chamada no `__main__.py`, singleton reutilizado em todas as chamadas
- `jarvis_desktop/config.py` — `JarvisConfig` + `load_config()` + `save_config()`: extensão com campos novos segue padrão estabelecido
- `sounddevice` (já instalado) — pode ser usado para playback de áudio gerado pelo Kokoro

### Established Patterns
- **Singleton init antes do chat loop:** padrão de `init_stt()` em `__main__.py` — replicar com `init_tts()`
- **Prints simples para status:** sem rich (D-01 Phase 73). `print("[TTS] ...")` com `flush=True`
- **Nunca crashar em erro externo:** kokoro indisponível, espeak-ng ausente, API key faltando → mensagem clara, não exception não tratada
- **JarvisConfig extensão:** adicionar campos com defaults, nunca redefinir existentes

### Integration Points
- `chat.py` `chat_loop()`: acumula tokens durante SSE stream → após stream completo, chama `speak(text)` de `tts.py`
- `__main__.py`: `init_tts(config)` inserido após `init_stt(config.whisper_model)`, antes de `chat_loop(config)`
- `tts.py` expõe `stop_tts()` para Phase 76 (state machine de modos) chamar quando PTT pressionado durante playback
- `pyproject.toml`: adicionar `kokoro` (e `soundfile` como dependência do kokoro)

</code_context>

<specifics>
## Specific Ideas

- Voz padrão deve ser PT-BR — planner deve verificar qual nome de voz pt-br está disponível na versão `kokoro 0.9.4+` e usar como default para `kokoro_voice`
- No Windows sem espeak-ng: TTS silencioso + aviso, texto continua aparecendo normalmente — não é erro fatal
- `stop_tts()` é integration point crítico para Phase 76: deve ser thread-safe (TTS toca em thread separada, chat loop precisa chamar stop de outra thread)
- Primeiro run com Kokoro: exibir progresso do download do modelo (~350MB) — PYTTS-01 exige isso

</specifics>

<deferred>
## Deferred Ideas

- Interrupção completa de TTS via PTT mid-playback com início imediato de STT — comportamento completo é responsabilidade da Phase 76 state machine; Phase 75 só expõe `stop_tts()`
- Streaming TTS por sentença (menor latência percebida) — complexidade adiada, pode ser Phase 76 ou milestone futuro
- Configuração de velocidade/pitch de voz via config — Phase 77 config menu

</deferred>

---

*Phase: 75-text-to-speech-tts*
*Context gathered: 2026-05-18*
