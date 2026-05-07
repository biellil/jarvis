# Phase 62: Kokoro Offline TTS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 62-kokoro-offline-tts
**Areas discussed:** Download do modelo Kokoro, Comportamento local-only (TTS-OFF-05), Kokoro + Streaming TTS, Settings UI para Kokoro

---

## Download do modelo Kokoro

| Option | Description | Selected |
|--------|-------------|----------|
| Ao selecionar Kokoro em Settings | Download automático quando troca para 'kokoro' no Select (padrão Whisper Phase 50) | |
| Na primeira conversa com Kokoro ativo | Lazy download ao primeiro uso | |
| Botão explícito 'Download modelo' | Usuário vê status e clica manualmente | ✓ |

**User's choice:** Botão explícito — ação deliberada, sem surpresa de 350MB.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Botão 'Retry' aparece na TtsSection | Mesmo padrão visual Phase 50 | ✓ |
| Volta automaticamente para provider anterior | Reverte sem interação | |
| Toast de erro + retry manual | Usuário abre Settings e tenta de novo | |

**User's choice:** Retry na TtsSection.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback automático para Murf/ElevenLabs | JARVIS fala com cloud até download completar | |
| Sem TTS até baixar | Responde só por texto | ✓ |

**User's choice:** Sem TTS até modelo baixado — sem fallback automático em pre-download.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Recomeça do zero (simples) | Delete parcial, baixa de novo | ✓ |
| Resume com Range header | Continua de onde parou | |

**User's choice:** Restart do zero — simples, suficiente para MVP.

---

## Comportamento local-only (TTS-OFF-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Texto + toast de aviso | JARVIS responde por texto, nunca usa cloud, consistente com WAKE-10 | ✓ |
| Toast de erro + silêncio | Só notificação, resposta só como texto | |
| Toast perguntando 'Usar cloud?' | Oferece escolha ao usuário | |

**User's choice:** Texto + toast de aviso. Nunca quebra local-only.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox abaixo do Select (só quando Kokoro ativo) | Contextual, limpo | ✓ |
| Toggle independente sempre visível | Mais proeminente | |

**User's choice:** Checkbox contextual — aparece somente quando Kokoro selecionado.

---

## Kokoro + Streaming TTS

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, compatível desde Phase 62 | synthesize() é stateless, pipeline Phase 53 funciona sem mudança | ✓ |
| Não por enquanto, só full-response | Validar depois | |

**User's choice:** Streaming compatível desde Phase 62.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sem timeout, espera resultado | Usuário usa GPU, geração pode demorar | ✓ |
| Timeout configurável + fallback | Mais complexo | |

**User's choice:** Sem timeout — GPU via ONNX auto-detect (CUDA/Metal/CPU).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect GPU igual ao Whisper | CUDA/Metal/CPU fallback via ONNX Runtime | ✓ |
| Sempre CPU, GPU como defer | Simples para MVP | |

**User's choice:** Auto-detect GPU.

---

## Settings UI para Kokoro

| Option | Description | Selected |
|--------|-------------|----------|
| API Key desaparece quando Kokoro | Conditional render, sem confusão | ✓ |
| API Key desabilitada com texto | Mais informativo, menos limpo | |

**User's choice:** API Key desaparece para Kokoro.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Estado + botão acionável (padrão Phase 50) | 'Não baixado' → progress bar → 'Pronto' | ✓ |
| Apenas progresso durante download | Mais minimalista | |

**User's choice:** Padrão Phase 50 Whisper — replicar WhisperSection.tsx.

---

## Claude's Discretion

- Implementação interna do KokoroTTSProvider (lazy vs eager model load)
- Localização do modelo no filesystem
- Voice ID padrão para Kokoro
- Gerenciamento de memória ONNX session

## Deferred Ideas

- Voice ID configurável na UI — defer v3.1
- Resume download com Range header — defer
- Multi-voice — fora do escopo
- Timeout configurável para síntese — não querido pelo usuário
