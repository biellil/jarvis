# Phase 76: Voice Modes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 76-voice-modes
**Areas discussed:** Estrutura do state machine, openwakeword: modelo e threading, PTT interrupt durante TTS, Hot-swap vs restart de modo

---

## Estrutura do state machine

| Option | Description | Selected |
|--------|-------------|----------|
| voice_modes.py centralizado | Novo módulo com start_mode/stop_mode + enum VoiceMode. Consistente com padrão stt.py/tts.py | ✓ |
| Embutido no chat.py | Expande chat_loop() com branches por modo — já grande demais | |
| Classe VoiceModeManager | Classe OOP, similar ao TypeScript v1.9 — foge do padrão de módulos planos | |

**User's choice:** voice_modes.py centralizado

---

| Option | Description | Selected |
|--------|-------------|----------|
| Queue (threading.Queue) | Producer/consumer thread-safe | |
| Callback | on_transcription(text) injetado no init | |
| Claude decide | Claude escolhe o mecanismo mais adequado | ✓ |

**User's choice:** Claude decide

---

## openwakeword: modelo e threading

| Option | Description | Selected |
|--------|-------------|----------|
| Download automático com progresso | Igual ao Kokoro Phase 75 — usuário não precisa fazer nada | ✓ |
| Download apenas se modo wake_word for default | Lazy download apenas quando modo é ativado | |
| Claude decide | Qualquer abordagem ok, sem travar sem feedback | |

**User's choice:** Download automático com progresso

---

| Option | Description | Selected |
|--------|-------------|----------|
| Thread separada com sd.InputStream | Daemon thread + sounddevice stream; stop + record_until_silence ao detectar wake word | ✓ |
| openwakeword com PyAudio | Nativo no GitHub mas PyAudio proibido pelo CLAUDE.md | |
| Claude decide threading | Desde que use sounddevice e thread separada | |

**User's choice:** Thread separada com stream sounddevice

---

## PTT interrupt durante TTS

| Option | Description | Selected |
|--------|-------------|----------|
| Parar TTS e ouvir imediatamente | stop_tts() no keydown — interrompe TTS para começar STT | |
| Esperar TTS terminar | PTT pressionado enfileira captura; inicia quando TTS termina | ✓ |
| Ignorar PTT durante TTS | PTT desabilitado enquanto TTS ativo — experiência ruim | |

**User's choice:** Esperar TTS terminar

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, todos os modos bloqueiam durante TTS | Flag is_speaking bloqueia captura em todos os modos — evita feedback loop | ✓ |
| Não, wake word continua durante TTS | Risco de JARVIS ouvir a si mesmo | |
| Claude decide por modo | Planner decide modo a modo | |

**User's choice:** Sim, todos os modos bloqueiam durante TTS

---

## Hot-swap vs restart de modo

| Option | Description | Selected |
|--------|-------------|----------|
| Hot-swap em runtime | stop_current + start_new via switch_mode() — sem restart | ✓ |
| Restart obrigatório | save_config() + aviso para reiniciar — experiência ruim | |

**User's choice:** Hot-swap em runtime

---

## Claude's Discretion

- Mecanismo de sincronização entre threads (Queue, Event, etc.)
- Refatoração de chat_loop() para consumir texto de voice_modes além de input()
- Parâmetros do openwakeword (chunk_size, threshold — default 0.7 conforme PYMODE-01)
- Como is_speaking é exposto pelo tts.py para voice_modes.py consultar

## Deferred Ideas

- Multi-turn follow-up sem repetir wake word — milestone futuro
- Streaming TTS por sentença com VAD interrupção — complexidade adiada
- Filtro de eco para wake word durante TTS — bloqueio global (D-06) suficiente para MVP
