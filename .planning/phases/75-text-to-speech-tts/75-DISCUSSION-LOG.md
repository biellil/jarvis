# Phase 75: Text-to-Speech (TTS) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 75-text-to-speech-tts
**Areas discussed:** Momento do playback, Voz padrão do Kokoro (PT-BR), Texto no terminal durante TTS, Comportamento do fallback

---

## Momento do playback

| Option | Description | Selected |
|--------|-------------|----------|
| Após resposta completa | Acumula tokens SSE, TTS após stream completo. Simples, latência extra 1-3s. | ✓ |
| Streaming por sentença | TTS a cada sentença detectada. Menor latência percebida, complexidade maior. | |
| Você decide | Claude escolhe abordagem para o MVP. | |

**User's choice:** Após resposta completa

| Option | Description | Selected |
|--------|-------------|----------|
| Texto aparece normalmente | Tokens imprimem no terminal via SSE. TTS começa após stream terminar. | ✓ |
| Só áudio, sem texto | Suprime print, só fala. | |
| Você decide | | |

**User's choice:** Sim, texto aparece normalmente

---

## Voz padrão do Kokoro (PT-BR)

| Option | Description | Selected |
|--------|-------------|----------|
| af_heart (inglês feminino, padrão Kokoro) | Default oficial da lib. Mais testada. | |
| am_fenrir (inglês masculino) | Mais apropriado para "JARVIS". | |
| pt-br via espeak-ng (Linux only) | Kokoro suporta pt-br, mas requer espeak-ng. | |
| Escolha do usuário | "quero uma voz pt br" | ✓ |

**User's choice:** Voz PT-BR

**Follow-up — espeak-ng ausente no Windows:**

| Option | Description | Selected |
|--------|-------------|----------|
| Tentar pt-br, cair em af_heart se falhar | Fallback para inglês. | |
| Exigir espeak-ng, erro se faltar | Usuário instala manualmente. | |
| Configurável + silencioso se falhar | TTS fica silencioso + aviso. Texto aparece normal. | ✓ |

**User's choice:** "sempre ir para voz pt-br, se não tiver fica em silêncio e o texto aparece normal só com um aviso de erro na voz"

**Follow-up — configurabilidade:**

| Option | Description | Selected |
|--------|-------------|----------|
| Configurável via config.json | Campo `kokoro_voice`, default pt-br. | ✓ |
| Fixo pt-br | Hardcoded. | |

**User's choice:** Configurável

---

## Texto no terminal durante TTS

| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+C encerra app inteiro | Comportamento atual, sem interrupção parcial. | |
| Qualquer tecla interrompe TTS | Para fala, volta ao prompt. | |
| PTT button interrompe TTS | Pressionar hotkey PTT para fala e inicia STT. | ✓ |

**User's choice:** "quando aperta o botão de ativação da voz (PTT — Ctrl+Shift+Q)"
**Notes:** Comportamento completo de integração PTT→STT é Phase 76. Phase 75 expõe `stop_tts()` que Phase 76 vai chamar.

---

## Comportamento do fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Aviso simples no terminal | `[TTS] Kokoro indisponível — usando ElevenLabs.` | |
| Silencioso | Sem mensagem. | |
| Usuário escolhe provider, Kokoro é fallback | Provider configurável, Kokoro como fallback automático. | ✓ |

**User's choice:** "usuário vai escolher qual vai usar, se der algum erro nesse online/pago vai para o offline"

**Follow-up — API keys:**

| Option | Description | Selected |
|--------|-------------|----------|
| No config.json | Campos `elevenlabs_api_key`, `murf_api_key` no JarvisConfig. | ✓ |
| Em variáveis de ambiente | ELEVENLABS_API_KEY, MURF_API_KEY no .env. | |

**User's choice:** No config.json

---

## Claude's Discretion

- Estrutura interna de `tts.py` (singleton pattern)
- Engine de playback de áudio para Kokoro
- Parâmetros de geração Kokoro (speed, pitch)
- Timeout/retry para APIs cloud
- Qual nome exato de voz pt-br usar como default no Kokoro

## Deferred Ideas

- Streaming TTS por sentença — menor latência percebida
- Configuração de velocidade/pitch — Phase 77 config menu
- Interrupção PTT completa com transição PTT→STT — Phase 76 state machine
