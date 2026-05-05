# Phase 53: Streaming TTS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 53-streaming-tts
**Areas discussed:** Fluxo SSE→sentenças→TTS, Playback queue no renderer, Provider streaming + Murf fallback, Feature flag + barge-in

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Fluxo SSE→sentenças→TTS | voiceHandler consome /chat/stream, chunking por [.!?]\s+, edge cases | ✓ |
| Playback queue no renderer | Web Audio API vs <audio>; IPC para chunks; orb visual | ✓ |
| Provider streaming + Murf fallback | ElevenLabs WS vs per-sentença HTTP; comportamento Murf | ✓ |
| Feature flag + barge-in | Onde mora STREAMING_TTS; cancelamento mid-playback | ✓ |

---

## Fluxo SSE → sentenças → TTS

| Option | Description | Selected |
|--------|-------------|----------|
| Buffer por sentença, dispara síntese ao fechar | Acumula tokens; regex casa → recorta + synthesize() em paralelo | ✓ |
| Buffer com flush por timeout/tamanho | Igual + flush automático em X ms / N chars | |
| Stream contínuo para WebSocket TTS | Tokens direto para ElevenLabs WS | |

**User's choice:** Buffer por sentença, dispara síntese ao fechar
**Notes:** Alinhado com STTS-01 literal.

| Option | Description | Selected |
|--------|-------------|----------|
| Regex puro [.!?]\s+ (spec literal) | Sem exceções; pode quebrar em "Dr." mas raro | ✓ |
| Regex + lista pequena de exceções | Skip se palavra ∈ {Dr, Sr, etc...} | |
| Você decide | Claude escolhe | |

**User's choice:** Regex puro [.!?]\s+ (spec literal)

| Option | Description | Selected |
|--------|-------------|----------|
| <1s após primeira sentença fechar (spec) | Sem pre-warm | |
| Pre-warm conexão TTS no início do stream | Handshake ao receber primeiro token SSE | |
| Você decide | Claude escolhe baseado em complexidade vs ganho | ✓ |

**User's choice:** Você decide
**Notes:** Latency budget delegado para Claude na implementação.

---

## Playback queue no renderer

| Option | Description | Selected |
|--------|-------------|----------|
| Web Audio API (AudioBufferSourceNode) | Sample-accurate scheduling, zero gap | ✓ |
| <audio> element com onended chain | Simples, ~50-100ms gap audível | |
| MediaSource Extensions (MSE) | Buffers contínuos em um <audio> | |

**User's choice:** Web Audio API (AudioBufferSourceNode)

| Option | Description | Selected |
|--------|-------------|----------|
| IPC events 'tts:chunk' por sentença | Padrão IPC existente, payload base64 + idx + isLast | ✓ |
| Stream IPC via MessageChannel | Backpressure, mais código | |
| Você decide | Claude escolhe | |

**User's choice:** IPC events 'tts:chunk' por sentença

| Option | Description | Selected |
|--------|-------------|----------|
| Ao tocar primeiro chunk (start do AudioBuffer) | thinking→speaking honesto | ✓ |
| Ao receber primeiro chunk antes de tocar | Vira speaking ~100ms antes do som | |
| Você decide | Claude escolhe | |

**User's choice:** Ao tocar primeiro chunk (start do AudioBuffer)

---

## Provider streaming + Murf fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Per-sentença HTTP para ambos providers | Mesmo código path Murf+ElevenLabs | ✓ |
| WebSocket só ElevenLabs, per-sentença Murf | Dois caminhos; latency ótima EL | |
| Streaming desabilitado em Murf (banner) | Ignora flag se Murf | |

**User's choice:** Per-sentença HTTP para ambos providers
**Notes:** Simplicidade + sem regressão Murf.

| Option | Description | Selected |
|--------|-------------|----------|
| Não agora — unificar via per-sentença HTTP | MVP atende <1s | ✓ |
| Sim — implementar WebSocket path em ElevenLabs | Latency menor, dobra superfície de teste | |
| Você decide | Claude escolhe | |

**User's choice:** Não agora — unificar via per-sentença HTTP

---

## Feature flag + barge-in

| Option | Description | Selected |
|--------|-------------|----------|
| electron-store + Settings UI toggle (padrão SEXT) | Switch booleano em Settings, persiste em store | ✓ |
| Apenas env var (.env) com leitura por turno | Sem UI | |
| Settings UI + env var como override | UI default + env override | |

**User's choice:** electron-store + Settings UI toggle (padrão SEXT)

| Option | Description | Selected |
|--------|-------------|----------|
| Próximo turno (lê no início de handleVoiceTurn) | Sem corner cases mid-stream | ✓ |
| Imediato (afeta turno em andamento) | Aborta playback streaming e refaz full | |

**User's choice:** Próximo turno (lê no início de handleVoiceTurn)

| Option | Description | Selected |
|--------|-------------|----------|
| Aborta SSE + cancela TTS pendente + pára playback | Reaproveita evento wake/PTT existente | ✓ |
| Apenas pára playback (síntese termina em background) | Mais simples; desperdiça quota | |
| Você decide | Claude escolhe | |

**User's choice:** Aborta SSE + cancela TTS pendente + pára playback

---

## Claude's Discretion

- Latency budget exato e necessidade de pre-warm de conexão TTS
- Estratégia de gestão de AudioContext (singleton vs per-turn)
- Estrutura interna do buffer/chunker

## Deferred Ideas

- WebSocket TTS streaming nativo (ElevenLabs eleven_turbo_v2) — v2.3+
- Lista de exceções de chunking (abreviações, decimais)
- Pre-warm de conexão TTS (depende do que Claude decidir no MVP)
