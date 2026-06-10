# Phase 95: Streaming TTS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 95-streaming-tts
**Areas discussed:** Segmentação de frases, Worker TTS & barge-in, Streaming vs fluxos agênticos, TTFA & escopo de provider
**Mode:** Advisor (full_maturity tier — perfil Vendor Choices: conservative). 4 agentes de pesquisa paralelos (gsd-advisor-researcher, sonnet).

---

## Segmentação de frases (PT-BR)

### Detector de fronteira de sentença

| Option | Description | Selected |
|--------|-------------|----------|
| punkt_tab vendorizado + fallback regex | Pickle PT (~649KB) no repo via nltk.data.path; regex como fallback p/ pitfall P-3 | ✓ |
| punkt_tab vendorizado (sem fallback) | Só punkt_tab; sem plano B se P-3 reprovar | |
| Apenas regex + abreviações | Zero deps, offline; contraria letra de STTS-02 | |

**User's choice:** punkt_tab vendorizado + fallback regex
**Notes:** Nunca chamar nltk.download() em runtime (privacidade-first). Pinar versão do nltk.

### Estratégia do primeiro chunk (TTFA)

| Option | Description | Selected |
|--------|-------------|----------|
| Híbrido (fronteira OU ~60-80 chars) | Flush no que vier antes; min ~15-20 chars; único caminho realista p/ ≤300ms | ✓ |
| Só fronteira de sentença | Prosódia natural mas TTFA refém de frase longa | |

**User's choice:** Híbrido (fronteira OU ~60-80 chars)

---

## Worker TTS & barge-in

### Modelo de concorrência

| Option | Description | Selected |
|--------|-------------|----------|
| 1 thread serial + 1 fila | Upgrade mínimo; ordem FIFO; _is_playing sem race; pode evoluir | ✓ |
| 2 estágios + threading.Event | Pipelining + barge-in auditável; mais código | |
| 2 threads + 2 filas (sem Event) | Pipelining; _is_playing pode driftar | |

**User's choice:** 1 thread serial + 1 fila

### Backpressure

| Option | Description | Selected |
|--------|-------------|----------|
| Fila com maxsize (produtor bloqueia) | queue.Queue(maxsize=2-3); loop SSE bloqueia naturalmente | ✓ |
| Fila ilimitada | Sem limite; risco de memória | |

**User's choice:** Fila com maxsize (produtor bloqueia)

---

## Streaming vs fluxos agênticos

| Option | Description | Selected |
|--------|-------------|----------|
| D — plain ao vivo + chunkar task:done | Zero mismatch por construção; roteia task:done pelo mesmo chunker | ✓ |
| A — gate por modo (streaming só em plain) | Simples, zero risco; agêntico não ganha latência. Fallback se contrato instável | |
| B — otimista com abort | Ganho em plain mas race: frase entregue ao device não cancela | |

**User's choice:** D — plain ao vivo + chunkar task:done
**Notes:** Pré-requisito: validar que payload de task:done sempre tem o texto final completo; se instável, fallback para Opção A.

---

## TTFA & escopo de provider

### Medição do TTFA

| Option | Description | Selected |
|--------|-------------|----------|
| Log estruturado loguru (client-side) | Zero deps; schema estável p/ Fase 96 consumir | ✓ |
| SDK Langfuse no desktop-py agora | Spans imediatos; +2MB, telefona pra casa, duplica Fase 96 | |
| Empurrar timestamp pro backend | Reusa Langfuse do backend; clock skew corrompe p95 | |

**User's choice:** Log estruturado loguru (client-side)

### Escopo de provider

| Option | Description | Selected |
|--------|-------------|----------|
| Só Kokoro (default offline) | Menor overhead; único que bate 300ms com folga (recomendado) | |
| Offline streama, cloud full-text | Fronteira offline/cloud; Chatterbox warmup | |
| Todos os 4 providers | UX uniforme; cloud REST por frase multiplica custo/RTT | ✓ |

**User's choice:** Todos os 4 providers (divergiu da recomendação "Só Kokoro" — escolha consciente)

### Follow-up: implementação cloud

| Option | Description | Selected |
|--------|-------------|----------|
| REST por frase (reusa existente) | Simples; 1 request HTTP por frase | |
| API de streaming chunked por provider | Uma conexão, sem multiplicar chamadas; adapter novo por provider | ✓ |
| Chunkar só offline, cloud full-text | Volta atrás na escolha "todos os 4" | |

**User's choice:** API de streaming chunked por provider

### Follow-up: alvo TTFA

| Option | Description | Selected |
|--------|-------------|----------|
| Só ao caminho default (Kokoro) | p95≤300ms só no Kokoro; cloud/Chatterbox best-effort logado | ✓ |
| A todos os providers | Inviável p/ cloud (RTT) e Chatterbox cold (warmup) | |

**User's choice:** Só ao caminho default (Kokoro)

---

## Claude's Discretion

- Estrutura interna do segmentador, nomes de funções/threads.
- Mecânica do sentinela/poison-pill e timeout de join.
- Schema do log de TTFA (estável/parseável).
- Local do pickle vendorizado do punkt_tab no repo.

## Deferred Ideas

- Worker TTS 2 estágios com pipelining (promover se houver gaps audíveis).
- SDK Langfuse / dashboards / alertas de TTFA → Fase 96.
- Keep-alive de modelo Chatterbox para warmup.
- Whisper streaming → fase separada.
