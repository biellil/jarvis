# Phase 74: Speech-to-Text (STT) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 74-speech-to-text-stt
**Areas discussed:** Modelo de interação PTT, Library de hotkey, Integração STT → chat loop, Loading do modelo Whisper

---

## Modelo de interação PTT

| Option | Description | Selected |
|--------|-------------|----------|
| Hold-to-record + VAD auto-stop | Usuário segura PTT. VAD dispara transcrição ao detectar silêncio — mesmo que ainda segurando. Release = fallback stop. | ✓ |
| Hold-to-record simples | Segura PTT enquanto fala, solta para transcrever. VAD apenas como backup no corte de silêncio. | |
| Press-toggle + VAD para | Primeiro press = começa gravar. VAD para automaticamente. PTT = ativação, não hold. | |

**User's choice:** Hold-to-record + VAD auto-stop
**Notes:** VAD é o stop primário, release é fallback.

---

## Tecla padrão PTT

| Option | Description | Selected |
|--------|-------------|----------|
| F9 | Tecla de função, sem conflitos comuns. | |
| Ctrl+Space | Combo natural, pode conflitar com IDE. | |
| Right Alt (AltGr) | Fácil de segurar, pode conflitar com ABNT2. | |
| Ctrl+Shift+Q (user input) | Input livre do usuário (confirmado via "cront seft + q"). | ✓ |

**User's choice:** Ctrl+Shift+Q
**Notes:** Configurável via `ptt_key` em ~/.jarvis/config.json.

---

## Library de hotkey

| Option | Description | Selected |
|--------|-------------|----------|
| pynput | Cross-platform, granular press+release, global listener. | ✓ |
| keyboard | Mais simples no Windows; root requerido no Linux. | |
| Entrada nativa do terminal | Sem nova dep, mas apenas local (terminal focado). | |

**User's choice:** pynput
**Notes:** —

---

## Escopo do hotkey (global vs local)

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas terminal em foco | Mais simples, sem interferência com outros apps. | |
| Global (qualquer janela ativa) | pynput suporta; permite falar com JARVIS de qualquer app. | ✓ |

**User's choice:** Global

---

## Integração STT → chat loop

| Option | Description | Selected |
|--------|-------------|----------|
| Envia direto para o gateway | Texto transcrito vai imediatamente ao chat. Mostra no terminal mas sem confirmar. | ✓ |
| Coloca no input para edição | Preenche prompt > mas espera Enter. Mais seguro, mais friction. | |
| Mostra e pergunta | '[Transcrito: ...] Enviar? [S/n]'. Confirmação explícita. | |

**User's choice:** Envia direto para o gateway

---

## Feedback visual STT no terminal

| Option | Description | Selected |
|--------|-------------|----------|
| Print simples: '[ouvindo...]' e '[transcrevendo...]' | Padrão fase 73, sem rich. | ✓ |
| Indicador com rich | Spinner/status via rich (antecipa Phase 77). | |

**User's choice:** Print simples

---

## Loading do modelo Whisper

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking com mensagem | Print status, bloqueia startup até carregar. Simples e claro. | ✓ |
| Background thread | Carrega em paralelo com chat text disponível. Mais complexo. | |
| Lazy (primeiro PTT) | Viola PYSTT-02. | |

**User's choice:** Blocking com mensagem

---

## Claude's Discretion

- Estrutura interna de `stt.py` (funções exportadas, organização)
- Formato do campo `ptt_key` no config (string vs dict)
- Parâmetros internos de VAD dentro do threshold configurável
- Tratamento de erro para microfone indisponível
- Valor padrão do silence threshold

## Deferred Ideas

Nenhuma ideia fora do escopo mencionada.
