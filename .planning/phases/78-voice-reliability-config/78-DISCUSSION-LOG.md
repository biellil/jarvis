# Phase 78: Voice Reliability & Config - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 78-voice-reliability-config
**Areas discussed:** VRAM auto-selection scope, Pre-roll ring buffer placement, GPU detection verbosity, Config lock granularity

---

## VRAM Auto-selection Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Só aplicar no primeiro run (sem config.json) | Auto-seleciona na primeira vez, grava em config.json. Próximas startups usam o que está no config. | |
| Sempre auto-detectar, ignorar config.json | Toda startup re-detecta VRAM e pode mudar o modelo mesmo com config manual. | ✓ |
| Auto-detectar mas nunca downgrade | Se VRAM permite upgrade, auto-upgrade. Se VRAM caiu, mantém config. | |

**User's choice:** Sempre auto-detectar.

**Follow-up — override manual:**

| Option | Description | Selected |
|--------|-------------|----------|
| Próxima startup volta a auto-detectar | Override manual é temporário. | |
| Override manual persiste e bloqueia auto-detect | Campo `whisper_model_locked: bool`. Se true, auto-detect não toca. | ✓ |

**User's choice:** Override manual persiste com `whisper_model_locked`.

**Notes:** Usuário delegou os thresholds exatos de VRAM e a lógica de seleção de modelo ao Claude ("o que for melhor").

---

## Pre-roll Ring Buffer Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inline em _always_listening_loop (voice_modes.py) | Deque maxlen=7 diretamente no loop existente. Sem tocar stt.py. | ✓ |
| Helper em stt.py | Nova função record_with_preroll() em stt.py. Mais reutilizável. | |

**User's choice:** Inline em voice_modes.py.

**Follow-up — limpeza do pre-roll durante TTS:**

| Option | Description | Selected |
|--------|-------------|----------|
| Limpar tudo (pre-roll + speech_buffer) | Durante TTS, o JARVIS não mantém áudio prévio. | ✓ |
| Manter o pre-roll, só limpar speech_buffer | Ring buffer continua girando durante TTS. | |

**User's choice:** Limpar tudo durante TTS.

---

## GPU Detection Verbosity

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre mostra o device escolhido | [STT] Carregando tiny em cuda:0... — toda startup. | ✓ |
| Só mostra no fallback/aviso | Startup normal silenciosa. Mensagem só em falha/fallback. | |
| Sempre mostra + detalha VRAM | [STT] CUDA detectado (8GB VRAM) — selecionando large-v3-turbo. | |

**User's choice:** Sempre mostra o device escolhido.

---

## Config Lock Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| threading.Lock no config.py + atomic write | Lock no módulo + temp file + os.replace(). Proteção completa. | ✓ |
| Só atomic write (os.replace), sem Lock | os.replace() garante arquivo não corrompido mas não previne overwrites concorrentes. | |

**User's choice:** threading.Lock + atomic write.

---

## Claude's Discretion

- Thresholds exatos de VRAM para seleção de modelo (tiny/base/large-v3-turbo)
- API exata para query de VRAM (ctranslate2.cuda / torch.cuda / nvidia-smi)
- Implementação do `_detect_device()` — check de `/opt/rocm`, `torch.backends.mps`
- Tamanho exato do deque de pre-roll
- Nomes dos campos novos em `JarvisConfig`

## Deferred Ideas

None.
