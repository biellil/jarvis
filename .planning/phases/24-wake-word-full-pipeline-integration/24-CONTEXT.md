# Phase 24: Wake Word Full Pipeline Integration — Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Fechar o loop **wake word → STT → LLM → TTS → idle** que ficou desconectado nas Phases 22/23.

**O que está em escopo:**
- Capturar o `Uint8Array` do `useWakeWord.ts` e mandar pro backend via `window.jarvis.sendAudio()` (hoje o buffer é descartado com `void stopRecording()`)
- VAD real substituindo o timeout fixo de 3s da Phase 22 (WAKE-06)
- Novo TTS provider (Murf.ai) ao lado do ElevenLabs + Local existentes
- Função pura compartilhada `sendAudioAndHandle()` eliminando duplicação entre `ChatInput.tsx` (PTT) e `useWakeWord.ts` (wake word)
- Error recovery para backend down, LLM timeout, mic muted, silent stream, **e TTS failure (degrade para texto visível)**
- E2E humano assinado: usuário fala "Hey JARVIS, <pergunta>" → ouve resposta do LLM em pt-BR via TTS

**O que NÃO está em escopo:**
- Barge-in (abortar TTS quando usuário fala) — deferido P2
- Multi-turn sem re-wake — deferido P2
- Partial TTS streaming — deferido P2
- Settings UI runtime switch — fora de escopo, virou ideia futura
- Rewrite do TTSProvider interface — segue o pattern atual

</domain>

<decisions>
## Implementation Decisions

### VAD (Voice Activity Detection)

**D-01 — Library: `@ricky0123/vad-web`**
Adiciona como dep do `apps/desktop`. Lib ONNX baseada em Silero VAD, reusa `onnxruntime-web` já instalado na Phase 22 (zero overhead de runtime novo). ~2MB de modelo extra, mas baixa uma vez e cacheia. Alternativas rejeitadas: (a) RMS manual via AnalyserNode — menos preciso em ambientes com ruído de fundo; (b) timeout fixo — inaceitável pro critério #1 da fase.

**D-02 — Tuning: defaults da lib**
- `positiveSpeechThreshold: 0.5` (padrão)
- `negativeSpeechThreshold: 0.35` (padrão)
- `minSpeechFrames: 9` (~300ms — evita disparar em ruído curto)
- `redemptionFrames: 8` (~250ms de silêncio antes de fechar a captura)

Valores validados em produção pela lib. Poderemos tunar via env var `VAD_REDEMPTION_FRAMES` / `VAD_MIN_SPEECH_FRAMES` depois se precisar, mas NÃO incluir essa configurabilidade no P1.

**D-03 — Max recording timeout: 6s absolute fallback**
Se o VAD não detectar fala alguma após wake word (mic mudo, usuário silencioso, ambiente totalmente quieto), retorna pra `idle` com toast "Não ouvi nada, diga Hey JARVIS de novo" após **6 segundos**. Isso é backup para quando o VAD falhar — o fluxo normal termina antes via `redemptionFrames`.

Substitui o `vadTimeoutMs=3000` atual da Phase 22. Encoraja Claude a remover ou ressignificar `vadTimeoutMs` durante o planning.

### TTS (Text-to-Speech)

**D-04 — Providers: Murf.ai + ElevenLabs + Local, escolha via env var**
Adicionar `MurfTTSProvider` ao lado dos providers existentes:

```
TTS_PROVIDER=murf       → Murf.ai cloud (fallback local se MURF_API_KEY ausente)
TTS_PROVIDER=elevenlabs → ElevenLabs cloud (fallback local se sem key) — já existe
TTS_PROVIDER=local      → Speecht5 via Transformers.js (English-only, ruim em pt-BR)
```

Factory em `apps/backend-ts/src/voice/tts/index.ts` estende o switch existente — **não quebra** o pattern atual. Ambos Murf e ElevenLabs ficam disponíveis simultaneamente; usuário escolhe via `.env` e reinicia backend.

**D-05 — Murf voice: masculina pt-BR**
Claude escolhe a voz masculina brasileira mais neutra/clara durante o planning (ler docs do Murf API, listar 2-3 candidatas em PLAN.md, escolher 1). Voice ID parameterizável via `MURF_VOICE_ID` env var (default hard-coded no provider). Não precisa subir UI de seleção de voz.

**D-06 — TTS failure fallback: degrade para texto visível**
Cenário: LLM respondeu com sucesso (temos `result.data.message`) mas `result.data.audioBase64` está vazio ou o player falha.

**Comportamento:** Mostrar o texto da resposta como mensagem visível no chat (reusa `addAgentMessage`), orb transiciona para `responding` brevemente e retorna a `idle` normalmente. Não é um erro — é degrade gracioso. Sem toast de erro.

Isso é **diferente** de erros hard (backend down, LLM timeout): aqueles levam ao D-08.

### Shared Audio Pipeline

**D-07 — Função pura `sendAudioAndHandle(bytes, deps)` em `src/voice/`**
Local: `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts`

Assinatura:
```ts
async function sendAudioAndHandle(
  audioBuffer: Uint8Array,
  deps: {
    setState: (s: OrbState) => void;
    setToast: (msg: string | null) => void;
    addHumanMessage: (m: string) => void;
    addAgentMessage: (m: string) => void;
  }
): Promise<void>
```

Encapsula: `setState('processing')` → `window.jarvis.sendAudio()` → success: `setState('responding')` + `handleAudioResponse()` (já existe) → `setState('idle')` após TTS / text fallback. Failure: `setToast()` + `setState('idle')`.

**Consumidores:**
- `ChatInput.tsx` — substitui o bloco inline das linhas 83-113 pela chamada a `sendAudioAndHandle()`
- `useWakeWord.ts` — onVadEnd (novo handler substituindo o timeout) captura bytes do `audioRecorder.stopRecording()` e passa pra `sendAudioAndHandle()`

**Não usar hook novo:** `useVoiceRequest` foi rejeitado (adiciona abstração sem ganho — função pura é testável, simples, sem hooks aninhados).

### Error Recovery

**D-08 — Hard errors: toast global + orb idle**
Reusa `setToast` do `ChatContext` existente ([apps/desktop/src/renderer/src/chat/ChatContext.tsx](apps/desktop/src/renderer/src/chat/ChatContext.tsx)). Mensagens pt-BR curtas:

| Cenário | Mensagem toast | Log |
|---------|---------------|-----|
| Backend down (HTTP error) | "JARVIS offline. Verifique o backend." | `[sendAudioAndHandle] backend unreachable` |
| LLM timeout (AbortController) | "JARVIS demorou demais. Tente de novo." | `[sendAudioAndHandle] llm timeout` |
| Mic muted mid-recording | "Microfone mudo — verifique permissões." | `[useWakeWord] mic muted` |
| Silent stream (6s sem fala) | "Não ouvi nada. Diga Hey JARVIS de novo." | `[useWakeWord] vad silent` |
| VAD error (lib crash) | "Erro na captura de áudio." | `[useWakeWord] vad error` |

Todos os cenários: orb pisca red 300ms (reusa `animate-wake-burst-ring` com cor diferente ou cria `animate-error-flash`) e volta a `idle`.

**D-09 — Timeout strategy: AbortController com budget por stage**
- STT (audio upload + Whisper server-side): 15s
- LLM (LangChain response): 30s
- TTS (Murf/ElevenLabs): 10s
- **Total E2E budget:** ~55s mas tipicamente <5s perceptivo

`window.jarvis.sendAudio()` já aceita AbortSignal? Verificar durante planning e adicionar se faltar.

### Scope Locks

**D-10 — Stretch goals fora do P1**
Barge-in, multi-turn sem re-wake, partial TTS streaming — **todos** deferidos pra Phase 25 ou v1.5. Phase 24 entrega apenas o happy path + errors. Não aceitar scope creep durante execution.

### Claude's Discretion

Áreas onde o planner tem flexibilidade:
- **Orb error flash color/animation** — vermelho é canônico mas a intensidade/duração é UX judgment
- **Murf voice ID específica** — escolha durante research lendo docs do Murf API
- **AbortController implementation detail** — como passar o signal do renderer pra main process (IPC) é decisão técnica
- **VAD lifecycle** — quando `VAD.start()` é chamado (na inicialização do useWakeWord? Só após wake word? Por consumo de CPU/bateria) — o planner avalia durante task breakdown
- **Toast styling** — se precisa de tipos (info/warning/error), depende do que `setToast` já suporta

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase-level artifacts (prior decisions)
- `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-CONTEXT.md` — Phase 22 decisions (wake word phrase "Hey JARVIS", modelo ONNX, `vadTimeoutMs=3000` que a D-03 substitui)
- `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-01-SUMMARY.md` (e demais plans) — o que foi buildado no engine + VoiceInputManager
- `.planning/phases/23-orb-ux-polish/23-CONTEXT.md` — Phase 23 decisions (`wakeWordPaused` flag, `triggerWakeBurst()`, `prefers-reduced-motion`)
- `.planning/phases/23-orb-ux-polish/23-01-SUMMARY.md` + `23-02-SUMMARY.md` — superfícies que a Phase 24 consome
- `.planning/ROADMAP.md` §"Phase 24" — Success criteria oficiais da fase

### Evidência do gap atual (must read)
- `apps/desktop/src/renderer/hooks/useWakeWord.ts` §§165-181 — bloco `proceed()` + VAD timeout onde o `void audioRecorder.stopRecording()` descarta os bytes
- `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx` §§75-113 — fluxo PTT que já funciona (template a espelhar em `sendAudioAndHandle`)
- `apps/desktop/src/renderer/src/voice/handleAudioResponse.ts` — função pura já extraída (v1.3 Phase 19.5), usada por ChatInput, **será reusada** dentro do `sendAudioAndHandle`
- `apps/desktop/src/renderer/hooks/useAudioRecorder.ts` — retorna `Uint8Array` de `stopRecording()`, shape já contratual

### TTS backend references
- `apps/backend-ts/src/voice/tts/index.ts` — factory `createTTSProvider()` a estender para Murf
- `apps/backend-ts/src/voice/tts/provider.ts` — interface `TTSProvider` que Murf deve implementar
- `apps/backend-ts/src/voice/tts/elevenlabs.ts` — template existente mais próximo do que Murf vai ser
- `apps/backend-ts/src/voice/tts/fallback.ts` — `FallbackTTSProvider` (não usar em D-04, mas ref útil)
- Murf.ai REST API docs — https://docs.murf.ai/api-reference (researcher valida durante planning)

### Requirements
- `.planning/REQUIREMENTS.md` — WAKE-05 (ciclo completo), WAKE-06 (VAD real), + requirements novos derivados de D-04..D-09 que o planner deve propor durante PLAN.md

### VAD library
- `@ricky0123/vad-web` — https://github.com/ricky0123/vad (GitHub) + https://www.npmjs.com/package/@ricky0123/vad-web — researcher valida versão + config durante planning

### Project refs
- `.planning/PROJECT.md` §"Current State" — stack Node/TS, pt-BR, LM Studio + cloud LLMs
- `CLAUDE.md` — commit convention (pt-BR, emoji, Conventional Commits)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`handleAudioResponse`** (`apps/desktop/src/renderer/src/voice/handleAudioResponse.ts`) — já toca o TTS + addAgentMessage + setToast em erro. `sendAudioAndHandle` deve chamá-lo internamente (não reimplementar a lógica de playback).
- **`window.jarvis.sendAudio(bytes)`** (preload IPC) — contrato estável desde v1.3 Phase 19.5. Retorna `{ success, data: { message, audioBase64 } }`. Não tocar.
- **`useAudioRecorder`** — `stopRecording()` já retorna `Uint8Array | null`. Basta NÃO descartar o retorno.
- **`ChatContext.setToast`** (`apps/desktop/src/renderer/src/chat/ChatContext.tsx`) — API de toast global, usada por `ChatInput`, disponível via `useChatContext()` ou similar.
- **`OrbContext.setState`** + `triggerWakeBurst()` — já wired no `useWakeWord`, não tocar o signal de wake burst (D-02 da Phase 23 já implementou o acoplamento).
- **`voiceInputManager`** — source tracking (`ptt` | `wakeword` | null), `acquire()`/`release()`. Manter a política "PTT sempre ganha" da Phase 22.

### Established Patterns
- **TTS providers como interface**: cada provider implementa `TTSProvider` com `synthesize(text)` → `{ audio, format }`. Factory seleciona via env var. **Murf entra seguindo esse pattern — sem rewrite.**
- **Error handling desktop**: toast global via `ChatContext` + `console.error` estruturado + orb volta `idle`. Phase 24 reusa.
- **Tests**: `happy-dom` + `testing-library` pra renderer (padrão Phase 23 D-07). Backend usa `vitest` com mocks de `fetch`/`process.env`.
- **IPC shape**: `window.jarvis.*` tipado em `apps/desktop/src/shared/ipc-types.ts`. Se Phase 24 precisar de novos canais (e.g., `onVoicePipelineError`), seguir o pattern existente.

### Integration Points
- **Renderer → Main → Backend**: `window.jarvis.sendAudio(bytes)` chama IPC → main chama `POST /api/chat/audio` no backend-ts → retorna `{ text, audioBase64 }`. **Nenhuma mudança na camada IPC** pra Phase 24 — só consumo do lado renderer.
- **Backend TTS factory**: `createTTSProvider()` roda na inicialização do backend-ts. Murf entra aqui.
- **useWakeWord lifecycle**: hook já monta `WakeWordEngine`, `MicStream`, e chama `voiceInputManager`. VAD entra como nova instância acoplada ao mesmo MediaStream **ou** ao `MediaRecorder` output. Escolha deixa para o planner (constraint: não duplicar getUserMedia).

</code_context>

<specifics>
## Specific Ideas

- Usuário quer JARVIS falando com **voz masculina pt-BR** (Murf) — está explícito na D-05
- Usuário confirmou as 2 possibilidades (Murf + ElevenLabs) disponíveis simultaneamente, escolha por env var (D-04)
- Usuário expressou preocupação especial com **TTS failure → texto visível** (D-06) — não perder a resposta mesmo quando a voz falha
- Usuário aceitou os defaults do ricky0123 pra VAD tuning (D-02) — confiança na lib
- Usuário rejeitou stretch goals no P1 (D-10) — mantém a fase curta pra fechar v1.4

</specifics>

<deferred>
## Deferred Ideas

### Para Phase 25 ou v1.5
- **Barge-in** — abortar TTS playback quando usuário fala durante `responding`. Requer VAD rodando durante playback + stop logic nos players de áudio. ~30% de complexidade extra.
- **Multi-turn sem re-wake** — segunda pergunta sem precisar dizer "Hey JARVIS" se for dentro de N segundos. Requer extend do listening state + timer de conversation window. ~20% extra.
- **Partial TTS streaming** — tocar TTS conforme LLM streama tokens. Requer TTS provider que aceite chunks + audio buffer concatenation. Murf tem streaming endpoint; ElevenLabs também. ~40% extra.
- **Settings UI runtime switch** — UI de Settings pane pra trocar TTS provider sem reiniciar backend. Requer hot-reload do provider + nova feature de Settings (não existe hoje). Merece phase própria.

### Ideias soltas durante discussão
- Fallback chain `Murf → ElevenLabs → Local` (rejeitado em favor de escolha via env — D-04). Pode voltar numa phase futura se robustez ficar crítica.
- Hook `useVoiceRequest` (rejeitado em D-07 em favor de função pura — zero state interno, testabilidade melhor).

</deferred>

---

*Phase: 24-wake-word-full-pipeline-integration*
*Context gathered: 2026-04-11*
