# Phase 24: Wake Word Full Pipeline Integration — Research

**Researched:** 2026-04-11
**Domain:** Electron renderer integration — VAD real + shared audio pipeline + Murf TTS provider
**Confidence:** HIGH (VAD library + Murf REST API verificados) com ATENÇÃO numa D-02 discrepância

---

<user_constraints>
## User Constraints (from 24-CONTEXT.md)

### Locked Decisions (do NOT re-litigate)

**VAD:**
- **D-01** — Library: `@ricky0123/vad-web`, zero novas deps além dessa (reusa `onnxruntime-web@1.24.3` já instalado na Phase 22).
- **D-02** — Tuning: defaults da lib. ⚠️ VER §"Discrepância D-02" abaixo — o CONTEXT.md cita `minSpeechFrames=9`, `redemptionFrames=8`, `preSpeechPadFrames` (API antiga), mas a versão atual da lib (0.0.30, pub. 2025-11-21) usa `minSpeechMs`, `redemptionMs`, `preSpeechPadMs`. O planner deve usar a **nova API em ms** — a intenção (defaults) é preservada.
- **D-03** — Max recording timeout: 6s absolute fallback. Substitui `vadTimeoutMs=3000` da Phase 22. Toast pt-BR: "Não ouvi nada, diga Hey JARVIS de novo".

**TTS:**
- **D-04** — Providers simultâneos: Murf.ai + ElevenLabs + Local, escolha via `TTS_PROVIDER` env var. Factory estende o switch existente em `apps/backend-ts/src/voice/tts/index.ts` — não quebra pattern.
- **D-05** — Murf voice: masculina pt-BR. Claude escolhe durante planning. Voice ID parameterizável via `MURF_VOICE_ID`, default hard-coded no provider.
- **D-06** — TTS failure fallback: degrade para texto visível (não é erro — usa `addAgentMessage`, orb vai para `responding` brevemente e volta a `idle`, sem toast). Diferente de hard errors (D-08).

**Shared audio pipeline:**
- **D-07** — Função pura `sendAudioAndHandle(bytes, deps)` em `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts`. Assinatura fixa (ver 24-CONTEXT.md §D-07). Consumida por `ChatInput.tsx` (substituindo bloco inline das linhas 82-118) e por `useWakeWord.ts` (novo handler onVadEnd substituindo VAD timeout). Hook `useVoiceRequest` rejeitado.

**Error recovery:**
- **D-08** — Hard errors viram toast global via `ChatContext.setToast` + orb volta `idle` + log estruturado. Mensagens pt-BR curtas (ver tabela em 24-CONTEXT.md). Orb pisca red 300ms (reusa `animate-wake-burst-ring` ou cria `animate-error-flash`).
- **D-09** — Timeout strategy: AbortController com budget por stage. STT 15s, LLM 30s, TTS 10s, total E2E ~55s (tipicamente <5s perceptivo). Verificar `window.jarvis.sendAudio` accept de AbortSignal durante planning e estender se faltar.

**Scope locks:**
- **D-10** — Barge-in, multi-turn sem re-wake, partial TTS streaming, settings UI runtime switch — **todos** deferidos para Phase 25 ou v1.5. Phase 24 entrega apenas happy path + errors.

### Claude's Discretion

- Orb error flash color/animation (intensidade/duração — UX judgment)
- Murf voice ID específica (ler docs, listar 2-3 candidatas em PLAN.md)
- AbortController implementation detail (como passar signal do renderer pro main via IPC)
- VAD lifecycle (quando `vad.start()` — no mount do useWakeWord? só após wake word? — avaliar durante task breakdown)
- Toast styling (se precisa variant info/warning/error, depende do que `setToast` já suporta — ele já suporta `{message, variant}` onde variant ∈ `error|warning|info` ver `handleAudioResponse.ts:14`)

### Deferred Ideas (OUT OF SCOPE para Phase 24)

- Barge-in
- Multi-turn sem re-wake
- Partial TTS streaming
- Settings UI runtime switch
- Fallback chain Murf → ElevenLabs → Local (rejeitado em favor de escolha via env)
- Hook `useVoiceRequest` (rejeitado em favor de função pura)

</user_constraints>

---

## Project Constraints (from CLAUDE.md)

- **Commits:** Conventional Commits + emoji em pt-BR (`✨ feat`, `🐛 fix`, `✅ test`, etc). NUNCA incluir `Generated with Claude Code` ou `Co-Authored-By`.
- **GSD workflow obrigatório** antes de Edit/Write.
- **Multi-LLM abstraction** — sem hardcode de provider. (OK — Phase 24 toca só TTS, não LLM.)
- **Privacy-first** — padrão local. **Impacto para Phase 24:** Murf é cloud, mas é opt-in via env var (`TTS_PROVIDER=murf`). O default atual é ElevenLabs, que também é cloud — não é regressão. Documentar em `.env.example` que Murf envia texto da resposta para cloud.
- **Multiplataforma** — código OS-específico isolado. (OK — Phase 24 toca só renderer + backend Node puro, não há código OS-específico.)
- **Sem UI obrigatória** — (OK — Phase 24 não é CLI-breaking, só adiciona UX do fluxo já existente).
- **pt-BR throughout** — TODOS os toasts, erros e mensagens user-facing em pt-BR (já consistente com o CONTEXT.md).

---

## Phase Requirements

| ID | Descrição | Cobertura na RESEARCH |
|----|-----------|------------------------|
| **WAKE-05** | Após cada ciclo completo (wake → speech → response → TTS), listening retoma automaticamente | §Shared audio pipeline — `sendAudioAndHandle` garante `setState('idle')` ao final, e `useWakeWord` já tem `useEffect([state])` que chama `engine.resume()` quando volta para idle (Phase 22 Plan 04) |
| **WAKE-06** | Se o usuário não falar em 3-5s após o wake word, gravação é abortada via Silero VAD | §VAD library — `@ricky0123/vad-web` é exatamente Silero VAD em ONNX; `onSpeechEnd` dispara o envio, 6s max fallback via `setTimeout` + `vad.pause()` |

**Requirements novos a elicitar pelo planner durante `/gsd-plan-phase 24`:**

- **WAKE-10 (proposto)** — TTS failure degrada para texto visível sem toast de erro (D-06)
- **WAKE-11 (proposto)** — Hard errors (backend, LLM timeout, mic muted) mostram toast pt-BR + orb pisca red + volta idle (D-08)
- **WAKE-12 (proposto)** — Usuário pode escolher `TTS_PROVIDER=murf` no `.env` e ouvir resposta em voz masculina pt-BR (D-04 + D-05)
- **WAKE-13 (proposto)** — Hook `useWakeWord.ts:176` e bloco inline `ChatInput.tsx:82-118` consomem a mesma função `sendAudioAndHandle` (D-07)

---

## Summary

A Phase 24 é uma **integração cirúrgica** — zero rewrites, reusa 100% do que as Phases 19.5 / 22 / 23 já entregaram. O gap concreto é uma **linha única** em `useWakeWord.ts:176` (`void audioRecorder.stopRecording()` que descarta o `Uint8Array`). A entrega é três pedaços:

1. **VAD real (`@ricky0123/vad-web@0.0.30`)** — adiciona 1 dep, reusa `onnxruntime-web` existente, copia 5 assets via `vite-plugin-static-copy` (lib ainda não instalada no desktop — **precisa adicionar**) ou via script manual no `public/`. Substitui o `setTimeout(vadTimeoutMs)` da Phase 22 por `onSpeechEnd(audio) → sendAudioAndHandle(audio)`.
2. **Função pura `sendAudioAndHandle`** — extrai as linhas 82-118 de `ChatInput.tsx` numa função com deps injetadas (`setState`, `setToast`, `addHumanMessage`, `addAgentMessage`). Consumida por PTT e wake word. Internamente chama `window.jarvis.sendAudio()` e o `handleAudioResponse` existente (não reimplementa playback).
3. **Murf TTS provider no backend** — implementa `MurfTTSProvider` em `apps/backend-ts/src/voice/tts/murf.ts` seguindo o template do `elevenlabs.ts`. Endpoint `POST https://api.murf.ai/v1/speech/generate`, auth header `api-key`. Voice ID default pt-BR masculino. Factory `createTTSProvider()` ganha um `case "murf"` com fallback para `LocalTTSProvider` se `MURF_API_KEY` ausente.

**Primary recommendation:** Planner executa em 3 waves sequenciais, TDD em cada task. Wave 1 = Murf backend (paralelo ao renderer, sem dependência). Wave 2 = `sendAudioAndHandle` + migração do `ChatInput.tsx`. Wave 3 = `@ricky0123/vad-web` integration + `useWakeWord` refactor consumindo `sendAudioAndHandle` via `onSpeechEnd`.

**Confidence breakdown:**
- VAD library (API, Vite setup, self-hosting): **HIGH** — docs oficiais + GitHub issue #128 + npm metadata verificados.
- Murf REST API (endpoint, auth, payload, response): **HIGH** — docs oficiais.
- Murf voice IDs exatas para pt-BR masculino: **MEDIUM** — nomes confirmados (Benício, Gustavo, Heitor, Silvio, Yago), mas o formato exato do voiceId só é confirmável via `GET /v1/speech/voices` em runtime com API key real (pattern esperado: `pt-BR-heitor`, baseado no sample `en-US-natalie` da doc).
- Existing code patterns (reuse de `handleAudioResponse`, `useAudioRecorder`, `voiceInputManager`): **HIGH** — código lido.

---

## Standard Stack

### Core — Adicionadas na Phase 24

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ricky0123/vad-web` | `0.0.30` | Silero VAD ONNX no browser — detecta `onSpeechEnd` via inferência real (não timeout) | Única lib Silero VAD empacotada pra browser/Electron com API limpa (MicVAD class). Zero custom training, CDN opcional (pode self-host). Reusa `onnxruntime-web` (~peerDep `^1.17.0`, compatível com o `1.24.3` já instalado). `[VERIFIED: npm view @ricky0123/vad-web 2025-11-21]` |
| `vite-plugin-static-copy` | `^2.x` (latest) | Copia worklet + model + wasm para `dist/` no build | Pattern oficial documentado no GitHub issue #128 do vad para Vite self-hosting. **NOTA:** alternativa é colocar manualmente os arquivos em `apps/desktop/src/renderer/public/` — já que o projeto usa Electron Vite que serve `public/` estático, esta é a opção mais simples e evita adicionar outra devDep. Avaliar durante planning. `[CITED: github.com/ricky0123/vad/issues/128]` |

### Core — Adicionadas no backend

Nenhuma. O Murf provider usa `fetch` nativo do Node 22 — zero deps. Segue exatamente o pattern do `elevenlabs.ts`.

### Reused (já instaladas)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `onnxruntime-web` | `1.24.3` | Runtime ONNX que o VAD usa (peerDep) | Phase 22 |
| `electron-store` | `11.0.2` | Persistência de pref (se precisar novo toggle) | Phase 9 |
| `react` | `19.2.4` | Hooks, context, setState | Phase 9 |
| `electron` | `41.1.1` | IPC, BrowserWindow | Phase 9 |

### Alternatives Considered (rejeitadas)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| `@ricky0123/vad-web` | Análise RMS manual via `AnalyserNode` | Menos preciso em ambientes com ruído de fundo. D-01 explicitamente rejeita. |
| `@ricky0123/vad-web` | VAD customizado reusando o `silero_vad.onnx` da Phase 22 (pipeline wake word) | A Phase 22 gap-04 **bypassou o VAD arquiteturalmente** — o Silero no pipeline wake word está desativado. Reutilizar esse slot exigiria arquitetura correta (áudio bruto + state tensors) que é exatamente o problema que `@ricky0123/vad-web` já resolve out-of-the-box. |
| `vite-plugin-static-copy` | Copiar arquivos para `public/` manualmente | Public dir copy também funciona (electron-vite serve `public/`), é mais simples, não adiciona devDep. **Planner decide com base em trade-off devDep vs setup script.** |
| Murf SDK Node | Raw `fetch` | Backend já usa `fetch` nativo pro ElevenLabs — consistency. Zero deps. |

**Version verification:**
```bash
# Confirmado 2026-04-11:
# @ricky0123/vad-web@0.0.30 — publicado 2025-11-21, peerDep onnxruntime-web ^1.17.0, tarball 4.4 MB
```

**Installation:**
```bash
pnpm --filter @jarvis/desktop add @ricky0123/vad-web@0.0.30
# OPCIONAL (se escolher plugin-based asset copy):
pnpm --filter @jarvis/desktop add -D vite-plugin-static-copy
# Backend: ZERO novas deps
```

---

## VAD Library Final Spec

### API shape (v0.0.30 — CURRENT)

```typescript
import { MicVAD } from "@ricky0123/vad-web";

const vad = await MicVAD.new({
  // === asset paths (self-hosting) ===
  baseAssetPath: "/vad/",            // serve worklet + .onnx aqui
  onnxWASMBasePath: "/vad/",         // serve wasm + mjs aqui

  // === tuning (defaults da lib — D-02 intent) ===
  positiveSpeechThreshold: 0.3,      // default 0.3
  negativeSpeechThreshold: 0.25,     // default 0.25
  redemptionMs: 1400,                // default 1400 — tempo silêncio antes de fechar speech
  preSpeechPadMs: 800,               // default 800 — padding antes do speech
  minSpeechMs: 400,                  // default 400 — ignora sons <400ms
  model: "legacy",                   // "v5" | "legacy" — default "legacy"
  submitUserSpeechOnPause: false,    // default false — não envia audio no pause()

  // === stream management ===
  getStream: async () => { /* custom MediaStream */ },
  pauseStream: async (s) => { /* default: stop tracks */ },
  resumeStream: async (s) => { /* default: new stream */ },
  processorType: "auto",             // "auto" | "AudioWorklet" | "ScriptProcessor"

  // === callbacks ===
  onSpeechStart: () => void,
  onSpeechEnd: (audio: Float32Array) => void,  // 16kHz mono
  onVADMisfire: () => void,
  onFrameProcessed: (prob: {isSpeech: number, notSpeech: number}, frame: Float32Array) => void,
});

// Instance methods
vad.start();       // begin listening
vad.pause();       // stop capturing
vad.listening;     // boolean — current state
// NOTE: "destroy" NOT documented in current API — use pause() + let GC clean up
```

### ⚠️ Discrepância com CONTEXT.md D-02

O `24-CONTEXT.md` D-02 especifica valores baseados numa **API antiga** (pré-0.0.25):

| CONTEXT.md cita | API atual (0.0.30) | Como mapear |
|-----------------|---------------------|-------------|
| `positiveSpeechThreshold: 0.5` | Default é `0.3` | **Seguir o default 0.3 da lib** — é a intent do D-02 ("defaults da lib"). O `0.5` é valor de uma versão antiga. |
| `negativeSpeechThreshold: 0.35` | Default é `0.25` | Mesmo — seguir `0.25`. |
| `minSpeechFrames: 9` (~300ms) | `minSpeechMs` default `400` | A nova API expressa em ms diretamente. Seguir `400` (default). |
| `redemptionFrames: 8` (~250ms) | `redemptionMs` default `1400` | **Significativo:** novo default é `1400ms` (4x mais longo que a intent do D-02). O planner deve decidir: (a) seguir default da lib `1400ms` honrando a intent literal "defaults da lib", ou (b) override explícito `redemptionMs: 250` honrando a intent semântica "responsividade alta". **Recomendação:** seguir `1400` inicialmente (menos surprise, menos tuning) — se usuário achar lento no UAT, abrir gap fix com override via env var. |
| `preSpeechPadFrames` | `preSpeechPadMs` default `800` | Seguir default `800`. |

**Registrar essa discrepância como assumption A1.** Em planning, planner deve confirmar com user se "defaults da lib" significa (a) as constantes literais do 24-CONTEXT (que eram de versão antiga) ou (b) os defaults reais da 0.0.30.

`[CITED: docs.vad.ricky0123.com/user-guide/api/ via WebFetch 2026-04-11]`

### Self-hosting (offline constraint)

Files que precisam ser servidos no `apps/desktop/src/renderer/public/vad/`:

**De `node_modules/@ricky0123/vad-web/dist/`:**
- `vad.worklet.bundle.min.js`
- `silero_vad_legacy.onnx` (default quando `model: "legacy"`)
- `silero_vad_v5.onnx` (quando `model: "v5"`)

**De `node_modules/onnxruntime-web/dist/`:**
- Todos `.wasm` files
- Todos `.mjs` files (required para inicialização do módulo WebAssembly em 1.17+)

**Configuração runtime:**
```typescript
MicVAD.new({
  baseAssetPath: "/vad/",
  onnxWASMBasePath: "/vad/",
  // ... callbacks
})
```

**Opção 1: public dir (recomendado — mais simples)**
```bash
# Script adicional no package.json: postinstall ou prebuild
mkdir -p apps/desktop/src/renderer/public/vad
cp node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js src/renderer/public/vad/
cp node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx src/renderer/public/vad/
cp node_modules/onnxruntime-web/dist/*.wasm src/renderer/public/vad/
cp node_modules/onnxruntime-web/dist/*.mjs src/renderer/public/vad/
```

**Opção 2: vite-plugin-static-copy** — adiciona devDep mas roda automaticamente no `vite build`:
```typescript
// electron.vite.config.ts — renderer block
viteStaticCopy({
  targets: [
    { src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: 'vad/' },
    { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: 'vad/' },
    { src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: 'vad/' },
    { src: 'node_modules/onnxruntime-web/dist/*.mjs', dest: 'vad/' },
  ]
})
```

**Para packaged build (electron-builder):** os arquivos do `public/` já vão parar no `dist/renderer/vad/` pelo Vite — **NÃO precisa adicionar em `extraResources` do `electron-builder.yml`**. Isso é diferente dos modelos wake word (Phase 22) porque lá os ONNX são lidos via `fs.readFile` no main process, enquanto aqui são servidos via HTTP(S) pelo renderer.

`[CITED: github.com/ricky0123/vad/issues/128 + docs oficiais via WebFetch]`

### Known quirks / quirks herdados da Phase 22

- ⚠️ `onnxruntime-web` em Electron exige CSP com `wasm-unsafe-eval` + `worker-src blob:` — **já resolvido** no gap-02 da Phase 22. Reusar a mesma CSP, não precisa mudar.
- ⚠️ `document.baseURI` é usado por algumas libs em bundles — happy-dom não expõe (os testes da Phase 22 tiveram esse problema nos `modelLoader.test.ts` e `WakeWordEngine.test.ts`). VAD usa `workletURL` resolvido por `baseAssetPath`, então **provavelmente não sofre** — mas validar durante os testes.
- Worklet file precisa ser servido com mimetype JS correto — Vite handles this automatically for `public/` assets.

---

## Murf TTS Final Spec

### REST API (HIGH confidence)

**Endpoint:** `POST https://api.murf.ai/v1/speech/generate`

**Auth header:** `api-key: <MURF_API_KEY>` (NÃO é Bearer — é header literal `api-key`)

**Request body (JSON):**
```json
{
  "text": "Texto para sintetizar",
  "voiceId": "pt-BR-heitor",
  "format": "MP3",
  "channelType": "MONO",
  "encodeAsBase64": true,
  "rate": 0,
  "pitch": 0
}
```

Campos:
| Campo | Tipo | Obrigatório | Default | Uso |
|-------|------|-------------|---------|-----|
| `text` | string | yes | — | Texto a sintetizar |
| `voiceId` | string | yes | — | ID do voice actor, formato `<locale>-<nome>` ex: `pt-BR-heitor`. Também aceita só o nome (`heitor`). |
| `format` | string | no | `"WAV"` | `MP3 \| WAV \| FLAC \| ALAW \| ULAW \| PCM \| OGG`. **Usar `MP3`** (consistência com ElevenLabs provider e com o campo `audioFormat: 'mp3' \| 'wav'` do IPC existente). |
| `channelType` | string | no | `"STEREO"` | `MONO \| STEREO`. **Usar `MONO`** (voz humana não precisa estéreo, economiza banda). |
| `encodeAsBase64` | boolean | no | `false` | Se `true`, response inclui `encodedAudio` direto em JSON. **Usar `true`** — consistente com shape atual (`audioBase64` vem direto do IPC, não precisa de second fetch). |
| `rate` | int | no | `0` | `-50..50`, velocidade. Deixar `0`. |
| `pitch` | int | no | `0` | `-50..50`, pitch. Deixar `0`. |
| `pronunciationDictionary` | object | no | — | Pronúncias custom (não usado no P1). |

**Response (JSON):**
```json
{
  "audioFile": "https://cdn.murf.ai/audio/abc.mp3",
  "audioLengthInSeconds": 2.4,
  "wordDurations": [ ... ],
  "encodedAudio": "base64...",
  "remainingCharacterCount": 9985
}
```

Campos relevantes:
| Campo | Tipo | Uso |
|-------|------|-----|
| `encodedAudio` | base64 string | Populated quando `encodeAsBase64: true` — **isto é o que o provider retorna como `audio` (Buffer)** |
| `audioFile` | URL | Fallback se `encodedAudio` vazio (não deveríamos precisar, mas tratar defensivamente) |
| `remainingCharacterCount` | long | **Útil para logs** — planner pode adicionar `console.log('[murf] quota:', remainingCharacterCount)` para observabilidade |

`[CITED: murf.ai/api/docs/api-reference/text-to-speech/generate via WebFetch]`

### Pt-BR male voice candidates

Nomes masculinos confirmados no voice library do Murf:

| Voice name | voiceId (formato esperado) | Model | Style | Recomendação |
|------------|----------------------------|-------|-------|--------------|
| **Heitor** | `pt-BR-heitor` | Falcon | Conversation | **✓ RECOMENDADO default.** Nome neutro, style "Conversation" adequado para assistente pessoal. |
| Benício | `pt-BR-benício` ou `pt-BR-benicio` | Falcon + Gen2 | Conversational | Alternativa — disponível em 2 modelos (Falcon + Gen2). Atenção: o nome tem `í` acentuado — pode ser `benicio` no voiceId. |
| Gustavo | `pt-BR-gustavo` | Falcon | Conversation | Alternativa. |
| Silvio | `pt-BR-silvio` | Falcon | Conversation | Alternativa. |
| Yago | `pt-BR-yago` | Falcon | Conversation | Alternativa — nome menos comum. |

**Decision:** `MURF_VOICE_ID` default = `"pt-BR-heitor"` no provider. `[ASSUMED]` — o formato exato do voiceId (lowercase, sem acento, com prefix `pt-BR-`) é inferido do sample doc `en-US-natalie` e da estrutura Falcon/Gen2. A lib aceita o nome standalone (`heitor`) se o voiceId completo falhar — documentar fallback em comentário.

**Como validar em runtime:**
```bash
curl -H "api-key: $MURF_API_KEY" https://api.murf.ai/v1/speech/voices | jq '.[] | select(.locale=="pt-BR" and .gender=="Male")'
```

Durante a execução do planning / Wave 1, planner pode rodar isso com a API key do usuário para confirmar o formato exato antes de hard-code no provider.

`[VERIFIED: nomes via murf.ai/api/docs/voices-styles/voice-library WebFetch]`
`[ASSUMED A2: voiceId format "pt-BR-heitor"]`

### Env vars

Adicionar em `.env.example` do backend:
```bash
# TTS provider (elevenlabs | murf | local) — default elevenlabs
TTS_PROVIDER=murf
# Murf.ai API key — obrigatório se TTS_PROVIDER=murf. Obtenha em https://murf.ai/api/pricing
MURF_API_KEY=
# Murf voice ID — default pt-BR-heitor (masculino pt-BR "Conversation" style)
MURF_VOICE_ID=pt-BR-heitor
```

### Error modes

| Scenario | HTTP / fetch outcome | Provider behavior |
|----------|----------------------|-------------------|
| `MURF_API_KEY` não setado | N/A | `throw new Error("MurfTTSProvider: MURF_API_KEY not set")` — factory falls back to LocalTTSProvider no boot (mesmo pattern do elevenlabs) |
| Network error | `fetch` throws | `throw new Error("MurfTTSProvider: network error: ...")` — `handleAudioResponse` D-06 faz degrade pra texto visível |
| 401 (invalid key) | `res.ok=false, status=401` | `throw new Error("Murf error 401: ...")` — mesma handling |
| 402 (quota excedida) | `res.ok=false, status=402` | Throw com mensagem clara — user vê toast warning "Resposta pronta, mas não consegui tocar o áudio" via D-06 degrade |
| 429 (rate limit) | `res.ok=false, status=429` | Throw, degrade via D-06 |
| `encodedAudio` empty | body OK mas campo vazio | Throw — trata como erro de sintetização |

**Não fazer retry automático** (pattern do ElevenLabs também não faz retry no provider — retry só existe no IPC handler para 5xx de `POST /api/chat/audio`).

### Free tier

- Free tier Murf: **10.000 characters/month** (baseado na documentação pública em https://murf.ai/api/pricing — `[ASSUMED A3]` — planner deve confirmar com user)
- Típica resposta JARVIS: ~200 chars → ~50 interações/mês no free tier. **Suficiente para dev/test**; usuário precisa conta paga para uso regular.
- Rate limit: não documentado publicamente — assumir conservador (1 req/s) e logar `remainingCharacterCount` para observabilidade.

### Streaming endpoint

Existe, URL `POST https://api.murf.ai/v1/speech/stream` — **fora do escopo da Phase 24** por D-10. Documentar em comment inline para referência futura (Phase 25 partial streaming).

---

## Shared Audio Pipeline Integration

### Arquivo alvo

`apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` (NEW)

### Assinatura (literal D-07)

```typescript
import type { SendAudioResponse } from '../../../shared/ipc-types';
import { handleAudioResponse } from './handleAudioResponse';
import { playTTSResponse } from '../audio/ttsPlayer';
import type { OrbState } from '../../components/Orb/OrbContext';
import type { ToastState } from './handleAudioResponse';

export interface SendAudioAndHandleDeps {
  setState: (s: OrbState) => void;
  setToast: (toast: ToastState | null) => void;
  addHumanMessage: (text: string) => void;
  addAgentMessage: (text: string) => void;
  signal?: AbortSignal;  // D-09 — optional abort
}

export async function sendAudioAndHandle(
  audioBuffer: Uint8Array,
  deps: SendAudioAndHandleDeps,
): Promise<void> {
  deps.setState('processing');
  try {
    const result: SendAudioResponse = await window.jarvis.sendAudio(audioBuffer);

    if (result.success) {
      deps.setState('responding');
    }

    await handleAudioResponse(result, {
      addHumanMessage: deps.addHumanMessage,
      addAgentMessage: deps.addAgentMessage,
      setToast: deps.setToast,
      playTTS: playTTSResponse,
    });

    // D-06 TTS failure degrade already handled inside handleAudioResponse:
    //   - success case calls addAgentMessage (text visível) antes de playTTS
    //   - playTTS falha → setToast warning (NOTE: CONTEXT.md D-06 pede NO toast,
    //     handleAudioResponse atual emite warning. Planner deve decidir:
    //       (a) deixar o toast warning (consistência com PTT), ou
    //       (b) extrair variant separada para o degrade silencioso)

    deps.setState('idle');
  } catch (err) {
    console.error('[sendAudioAndHandle] unexpected error:', err);
    deps.setToast({
      message: 'Erro inesperado ao enviar áudio.',
      variant: 'error',
    });
    deps.setState('idle');
  }
}
```

### Integration points

**Consumer 1: `ChatInput.tsx` (PTT)**

Substituir linhas 82-118 (todo o bloco `try/catch` do `handleStopRecording`):

```typescript
// Antes (linhas 82-118):
const audioBuffer = await stopRecording();
if (!audioBuffer) { setReply('Error...'); setState('idle'); return; }
setState('processing');
const result = await window.jarvis.sendAudio(audioBuffer);
if (result.success) { setState('responding'); setReply(result.data.message); } else { setState('idle'); }
await handleAudioResponse(result, { ... });
if (result.success) { setTimeout(() => setState('idle'), 2000); }

// Depois:
const audioBuffer = await stopRecording();
if (!audioBuffer) {
  setToast({ message: 'Falha ao processar áudio', variant: 'error' });
  setState('idle');
  return;
}
await sendAudioAndHandle(audioBuffer, {
  setState,
  setToast,
  addHumanMessage,
  addAgentMessage,
});
```

**ATENÇÃO:** o `ChatInput.tsx` atual tem um `setReply(result.data.message)` + `setTimeout(2000)` para retornar a idle. Isso é uma camada de UX legacy (SpeechBubble). O `sendAudioAndHandle` não preserva esse comportamento. Planner deve decidir:
- **Opção A:** Manter `setReply` separado como dep opcional na função (aumenta surface).
- **Opção B:** SpeechBubble já é alimentada por `addAgentMessage` via `ChatContext` — remover o `setReply` redundante (recomendado — cleaner).

**Opção B recomendada**, mas verificar durante planning que a SpeechBubble está de fato consumindo `useChat()` e não o prop `text` hardcoded.

**Consumer 2: `useWakeWord.ts` (wake word)**

Substituir o bloco `onDetected.proceed()` (linhas 156-191) + remover o `setTimeout(vadTimeoutMs)` fixo. Novo fluxo:

```typescript
const proceed = async () => {
  wakeTriggeredListeningRef.current = true;
  setState('listening');

  // Inicia VAD real em vez de MediaRecorder + setTimeout
  // O VAD precisa estar pre-configurado (ver Discretion §VAD lifecycle)
  await vadRef.current?.start();

  // Fallback absoluto D-03: 6s max
  vadMaxTimeoutRef.current = setTimeout(() => {
    console.warn('[wakeWord] VAD max timeout 6s — no speech detected');
    vadRef.current?.pause();
    setToast({ message: 'Não ouvi nada. Diga Hey JARVIS de novo.', variant: 'warning' });
    voiceInputManager.release('wakeword');
    setState('idle');
    wakeTriggeredListeningRef.current = false;
  }, 6000);
};

// No boot, configurar o VAD uma vez:
const vad = await MicVAD.new({
  baseAssetPath: '/vad/',
  onnxWASMBasePath: '/vad/',
  // ... tuning
  onSpeechEnd: async (audio: Float32Array) => {
    clearTimeout(vadMaxTimeoutRef.current);
    vadRef.current?.pause();

    // Converter Float32Array → Uint8Array WebM via MediaRecorder? NÃO —
    // window.jarvis.sendAudio espera webm/opus. VAD entrega PCM raw 16kHz.
    // Precisa codificar em WAV (lib wav-encoder já existe no backend, pode
    // ser portada pro renderer) ou mudar IPC shape para aceitar PCM raw.
    // ⚠️ CRITICAL — VER SEÇÃO "Pitfall: VAD audio format mismatch"

    const audioBuffer = encodeFloat32ToWav(audio, 16000);  // TODO implementar

    await sendAudioAndHandle(audioBuffer, {
      setState,
      setToast,
      addHumanMessage,
      addAgentMessage,
    });

    voiceInputManager.release('wakeword');
    wakeTriggeredListeningRef.current = false;
  },
});
vadRef.current = vad;
```

---

## ⚠️ CRITICAL Pitfall: VAD Audio Format Mismatch

Isto é o **achado mais importante da research** e o planner precisa tratá-lo como first-class task:

### O problema

- `@ricky0123/vad-web.onSpeechEnd(audio: Float32Array)` entrega PCM float 16kHz mono raw.
- `window.jarvis.sendAudio(bytes: Uint8Array)` espera **WebM/Opus bruto** (contrato estável desde Phase 19.5). O backend (`POST /api/chat/audio`) chama `nodejs-whisper` + `ffmpeg` assumindo input WebM.
- O PTT flow (`useAudioRecorder.ts`) usa `MediaRecorder({mimeType: 'audio/webm;codecs=opus'})` — por isso funciona.

**Os dois contratos de áudio são incompatíveis.** Se o `useWakeWord` entregar o Float32Array direto para `sendAudio`, o backend vai tentar decodificar como WebM e falhar.

### Opções de fix (planner escolhe em Wave 3)

**Opção A: Encode Float32 → WAV no renderer**

Criar `encodeFloat32ToWav(audio: Float32Array, sampleRate: number): Uint8Array` no renderer. O backend `nodejs-whisper` já aceita WAV (via ffmpeg passthrough). WAV é ~10x maior que Opus (PCM não comprimido), mas para clips de <6s o overhead é ~500KB/request — aceitável.

**Pros:** Zero mudança no IPC/backend. Solução local ao `useWakeWord`. Lib `wav-encoder` já existe no backend (`apps/backend-ts/src/voice/tts/wav-encoder.ts`) — pode ser portada.

**Cons:** 10x mais bytes por request. Não reusa o pipeline Opus existente.

**Opção B: Passar o stream do VAD para um MediaRecorder**

Em vez de usar `onSpeechEnd`, capturar a janela de speech via `MediaRecorder` que grava o mesmo MediaStream. VAD usa `AnalyserNode`-like observação, MediaRecorder grava em Opus.

**Pros:** Reusa Opus pipeline. Mesma lib de encoder que o PTT.

**Cons:** Dois consumers do MediaStream (VAD + MediaRecorder) competindo pelo buffer. Mais complexo de sincronizar `onSpeechStart` → `MediaRecorder.start()` e `onSpeechEnd` → `MediaRecorder.stop()`. `preSpeechPadMs: 800` pode ficar perdido (MediaRecorder só começa quando VAD confirma speech). Risco de clipping.

**Opção C: Estender IPC para aceitar PCM raw**

Novo canal `chat:send-audio-pcm` que aceita Float32Array + sampleRate. Backend converte antes de passar pro Whisper.

**Pros:** Arquitetura mais limpa. Sem duplicação de encoding.
**Cons:** Requer mudança no backend + gateway + IPC types + testes. **Fora do escopo cirúrgico da Phase 24** — adiciona 3+ tasks.

### Recomendação

**Opção A (WAV encoder no renderer).** Menos risco arquitetural, mais simples de testar, contida dentro do `useWakeWord.ts`. Planner cria uma task dedicada `24-02: wav-encoder renderer port` (5 min) e reusa no `useWakeWord`.

`[ASSUMED A4]` — esta decisão precisa ser validada com o user em `/gsd-plan-phase` antes de iniciar execution. É um achado de research que o CONTEXT.md não antecipou.

---

## AbortController Strategy

### Estado atual do contrato IPC

`window.jarvis.sendAudio(audioBuffer: Uint8Array): Promise<SendAudioResponse>` — **NÃO aceita AbortSignal** hoje.

- preload: `apps/desktop/src/preload/index.ts:31-34` — `ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_AUDIO, Buffer.from(audioBuffer))`. Shape fixo (channel, buffer).
- main handler: `apps/desktop/src/main/ipc/chat.ts:150-160` e `handleSendAudio`:175-288 — usa AbortController **internamente** para timeout (60s), mas não aceita signal externo do renderer. O handler é `ipcMain.handle(channel, async (_event, audioBuffer) => ...)` — o callback só recebe `event` + args.
- ipc-types: `SendAudioResponse` não tem campo de abort.

### Complexidade de extensão

**Pequena** — mas requer touchpoints em 3 lugares:

1. **Preload:** `sendAudio(audioBuffer, signal?)` — mas `AbortSignal` não é serializável via IPC. Pattern comum é usar um ID:
   ```typescript
   sendAudio: (audioBuffer, opts?: { requestId: string }) => ipcRenderer.invoke(...)
   abortSendAudio: (requestId: string) => ipcRenderer.send('chat:abort', requestId)
   ```
2. **Main:** maintain a `Map<requestId, AbortController>`. Handle `chat:abort` channel, look up the controller, call `abort()`.
3. **Renderer:** `sendAudioAndHandle` cria um `requestId = crypto.randomUUID()`, passa pra `sendAudio`, registra listener para o seu `signal?.addEventListener('abort', () => window.jarvis.abortSendAudio(requestId))`.

### Recomendação para Phase 24

**Opção Simple (RECOMENDADA):** O backend já tem timeouts internos (60s em `AUDIO_REQUEST_TIMEOUT_MS`). O D-09 fala em STT 15s / LLM 30s / TTS 10s que somam ~55s — **basicamente igual ao 60s existente**. Para Phase 24, **reusar o timeout interno existente** sem adicionar AbortController externo. Se o user quiser abort manual (e.g., clicar em X), isso vira Phase 25.

**Registrar como assumption A5:** Planner confirma com user se abort externo é realmente required no P1, ou se basta o timeout interno de 60s.

**Se o user insistir em abort externo P1:** Opção Medium — adicionar só no canal `chat:abort` com requestId, sem tocar no response shape. Task dedicada `24-XX: AbortController wiring`.

---

## Architecture Patterns

### Recommended file structure

```
apps/desktop/src/renderer/src/voice/
├── sendAudioAndHandle.ts        # NEW — função pura (Phase 24)
├── sendAudioAndHandle.test.ts   # NEW — unit tests com deps mockadas
├── encodeFloat32ToWav.ts        # NEW — wav encoder pro VAD output (Opção A)
├── encodeFloat32ToWav.test.ts   # NEW
├── handleAudioResponse.ts       # EXISTING — reusa, nenhuma mudança
└── ...

apps/desktop/src/renderer/hooks/
├── useWakeWord.ts               # MODIFIED — instancia MicVAD + consome sendAudioAndHandle
└── __tests__/useWakeWord.test.ts # MODIFIED — adiciona cenários VAD

apps/desktop/src/renderer/components/ChatInput/
└── ChatInput.tsx                # MODIFIED — consome sendAudioAndHandle (linhas 82-118)

apps/desktop/src/renderer/public/vad/                 # NEW directory (via script ou vite-plugin)
├── vad.worklet.bundle.min.js
├── silero_vad_legacy.onnx
├── ort-wasm-*.wasm
└── ort-wasm-*.mjs

apps/backend-ts/src/voice/tts/
├── murf.ts                       # NEW — MurfTTSProvider
├── murf.test.ts                  # NEW — mock fetch, test all error modes
├── index.ts                      # MODIFIED — add "murf" case to createTTSProvider
└── ...

.env.example                      # MODIFIED — add MURF_API_KEY + MURF_VOICE_ID
```

### Pattern 1: Pure function with injected deps (D-07)

Preferred over hooks for testability. Same pattern as existing `handleAudioResponse`.

```typescript
// Pure function: zero state, zero hooks, zero side effects except via deps
export async function sendAudioAndHandle(bytes, deps) {
  deps.setState('processing');
  try { ... } catch (err) { deps.setToast(...); deps.setState('idle'); }
}

// Test: mock all deps, assert call sequence
const deps = { setState: vi.fn(), setToast: vi.fn(), ... };
await sendAudioAndHandle(fakeBytes, deps);
expect(deps.setState).toHaveBeenNthCalledWith(1, 'processing');
expect(deps.setState).toHaveBeenNthCalledWith(2, 'idle');
```

### Pattern 2: TTS provider interface (existing — reusa)

```typescript
// Pattern: implement TTSProvider, return {audio: Buffer, format: 'mp3'}
export class MurfTTSProvider implements TTSProvider {
  readonly name = "murf";
  async synthesize(text: string): Promise<TTSResult> {
    // ... fetch, error handling, return { audio: Buffer.from(base64, 'base64'), format: 'mp3' }
  }
}

// Factory: single-case addition
if (provider === "murf") {
  if (!process.env.MURF_API_KEY) { /* warn + fallback to local */ }
  return new MurfTTSProvider();  // NO fallback wrapper — D-04 says providers are independent, not chained
}
```

### Pattern 3: VAD lifecycle coupled to wake word

Instance VAD em paralelo com WakeWordEngine, NOT replacing it:

```typescript
// On boot:
const vad = await MicVAD.new({
  getStream: async () => stream,  // reuse the same MediaStream from wake word
  onSpeechEnd: async (audio) => { ... sendAudioAndHandle ... },
});
await vad.pause();  // START PAUSED — only activate after wake word fires

// On wake word detected:
await vad.start();  // listen for speech for up to 6s

// On sendAudioAndHandle completes:
await vad.pause();  // back to standby
```

**Same MediaStream reuse** — critical. Both `WakeWordEngine` and `MicVAD` consume from the same `stream` (obtained once at boot). Avoids duplicate `getUserMedia` prompts.

⚠️ **Verificar:** MicVAD aceita `getStream` mas internamente pode chamar `stream.getTracks()[0].clone()` ou similar. Se sim, isso é compatível. Se criar um second `getUserMedia`, precisamos investigar alternativas.

`[ASSUMED A6]` — MicVAD reusa o stream passado via `getStream` sem clonagem agressiva. Validar no Wave 3 Task 1.

### Anti-Patterns to Avoid

- **Not reusing `handleAudioResponse`.** The function already exists, is tested, and handles all the success/error toast variants. `sendAudioAndHandle` MUST call it, not reimplement.
- **Not reusing the same `MediaStream`.** Don't call `getUserMedia` twice. Both wake word engine and VAD consume from the same stream obtained once.
- **Creating a `useVoiceRequest` hook.** Explicitly rejected in D-07. Pure function is the answer.
- **Hardcoding `TTS_PROVIDER` branches in the audio handler.** The factory pattern handles provider selection — consumer never knows which provider ran.
- **Adding retry logic in MurfTTSProvider.** ElevenLabs also has no retry. Retries live in the IPC handler `retryWithBackoff` for 5xx/network only.
- **Using `model: "v5"` for VAD.** Default is `"legacy"`. Only switch if `legacy` is inadequate during UAT — v5 adds more model weight and different tuning curve.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Voice activity detection | RMS threshold analysis via `AnalyserNode` | `@ricky0123/vad-web` (Silero) | Silero handles noise floor, accents, varying volumes — RMS fails in noisy environments. D-01 rejects. |
| Custom ONNX runtime for Silero | Bundle `silero_vad.onnx` + write custom inference | `@ricky0123/vad-web` | Wraps onnxruntime-web, handles frame windowing, provides clean MicVAD API. Phase 22 gap-04 proves custom Silero ONNX integration is hard. |
| WAV encoder | Compute RIFF headers from scratch | Port `apps/backend-ts/src/voice/tts/wav-encoder.ts` to renderer | Already written, tested, 100% coverage. Zero-dep pure JS. |
| Murf SDK wrapper | Wrap fetch in a class for "convenience" | Direct `fetch` like `elevenlabs.ts` | Consistency across providers. `fetch` in Node 22 is native. |
| AbortController multiplexing over IPC | Build request registry + cancel channel | Use existing 60s internal timeout (A5) | Opção Simple — Phase 24 doesn't need external abort to ship. |
| Retry logic in MurfTTSProvider | try/catch + sleep loop | None — existing `retryWithBackoff` in `handleSendAudio` covers 5xx/network at IPC layer | Retry is a cross-cutting concern, not per-provider. |

**Key insight:** The codebase is mature enough (v1.3+v1.4 shipped) that nearly everything the Phase 24 needs already exists somewhere. The main addition is `@ricky0123/vad-web` — everything else is integration.

---

## Common Pitfalls

### Pitfall 1: VAD audio format mismatch (CRITICAL — covered above)

Already documented in §"CRITICAL Pitfall: VAD Audio Format Mismatch". This is the single most important research finding.

### Pitfall 2: `onnxruntime-web` version conflict

`@ricky0123/vad-web@0.0.30` has `peerDep: onnxruntime-web@^1.17.0`. Desktop has `onnxruntime-web@1.24.3` (pinned in Phase 22). `1.24.3` satisfies `^1.17.0` so compatibility should be fine, but:

- pnpm might install a second copy if the VAD lib's internal wasm paths differ from the Phase 22 setup. Check `pnpm ls onnxruntime-web` after install — should see only one entry at `1.24.3`.
- If a second version lands, force resolution in root `package.json` via pnpm overrides:
  ```json
  "pnpm": { "overrides": { "onnxruntime-web": "1.24.3" } }
  ```

**How to detect:** `pnpm ls onnxruntime-web --filter @jarvis/desktop` should return single entry.

### Pitfall 3: CSP + worker-src for VAD worklet

Phase 22 gap-02 added `wasm-unsafe-eval` + `worker-src blob:` to the CSP meta tag. The `vad.worklet.bundle.min.js` is loaded as an `AudioWorklet`, not a `Worker` — **different CSP directive**. AudioWorklet uses the same-origin HTTP fetch, no CSP worker-src needed. But the wasm files for VAD's Silero onnx **do** need `wasm-unsafe-eval` — already in place.

**How to detect:** DevTools → Console → look for `Refused to load ... because it violates Content Security Policy`. If found, add `worker-src 'self' blob:` to the CSP meta tag (already in place).

### Pitfall 4: Default voice format mismatch (Murf)

Murf's default `format` is `WAV`, but the existing `SendAudioData.audioFormat` type is `'mp3' | 'wav'` (both allowed). The ElevenLabs provider returns `format: 'mp3'`. For consistency, Murf provider **must explicitly set `format: 'MP3'`** in the request body and return `format: 'mp3'`. Otherwise the audio player gets `.wav` mimetype but bytes are `.wav` — works, but inconsistent metadata and larger payload over IPC.

**How to detect:** Check `result.data.audioFormat` in `handleAudioResponse` — should always be `mp3` when `TTS_PROVIDER=murf`.

### Pitfall 5: Murf voice ID accent (ó in benício)

If Murf API rejects `pt-BR-benício` with `400 invalid voice`, try `pt-BR-benicio` (stripped). Also try lowercase names without `pt-BR-` prefix since docs say "you can use either voiceId or just the voice actor's name". Default `pt-BR-heitor` avoids this by having no accented characters.

### Pitfall 6: TTS_PROVIDER env var casing

Existing `createTTSProvider()` does `.toLowerCase()` — safe. But `.env.example` should use lowercase (`TTS_PROVIDER=murf`) for consistency with the existing `elevenlabs` + `local` entries.

### Pitfall 7: Phase 22 VAD bypass side-effect

Phase 22 gap-04 disabled the Silero VAD inside `WakeWordEngine` (the engine runs classifier on every chunk without the VAD gate). This means **the wake word engine is hot on CPU** whenever it's running. Adding `MicVAD` (which runs its own Silero model on the same audio) in Wave 3 **doubles** the ONNX inference load whenever both are active (between wake detection and speech end).

**Mitigation:**
- `MicVAD.start()` ONLY after wake word fires (not continuously).
- `vad.pause()` as soon as `onSpeechEnd` triggers.
- In practice, the dual-active window is ~1-6s per interaction — acceptable.
- Long-term fix is re-enabling Silero inside `WakeWordEngine` (Phase 25 polish), but out of scope.

**How to detect:** CPU benchmark between wake word detection and speech end. Expect a brief spike to ~5% sustained during that 1-6s window on 4-core laptop.

### Pitfall 8: `setReply` removal regression

`ChatInput.tsx` uses `setReply(result.data.message)` + `setTimeout(idle, 2000)` — this is legacy and overlaps with `addAgentMessage`. Removing it to consume `sendAudioAndHandle` cleanly might remove the SpeechBubble visual for PTT users. Verify `SpeechBubble` is fed from `useChat()` context (`addAgentMessage`) and not the `setReply` local state.

**How to detect:** After refactor, do PTT a question in dev mode → should see `SpeechBubble` pop up with the response text.

---

## Code Examples

### Example 1: MurfTTSProvider (template for planner)

```typescript
// apps/backend-ts/src/voice/tts/murf.ts
import type { TTSProvider, TTSResult } from "./provider.js";

/**
 * MurfTTSProvider — Murf.ai REST API, pt-BR masculina por default.
 *
 * Env vars:
 *   - MURF_API_KEY  (obrigatório)
 *   - MURF_VOICE_ID (default: "pt-BR-heitor")
 *
 * Documentação: https://murf.ai/api/docs/api-reference/text-to-speech/generate
 */
export class MurfTTSProvider implements TTSProvider {
  readonly name = "murf";
  private readonly voiceId: string;

  constructor() {
    this.voiceId = process.env.MURF_VOICE_ID ?? "pt-BR-heitor";
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("MurfTTSProvider: empty text");
    }
    const apiKey = process.env.MURF_API_KEY;
    if (!apiKey) {
      throw new Error("MurfTTSProvider: MURF_API_KEY not set");
    }

    const url = "https://api.murf.ai/v1/speech/generate";
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text,
          voiceId: this.voiceId,
          format: "MP3",
          channelType: "MONO",
          encodeAsBase64: true,
          rate: 0,
          pitch: 0,
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MurfTTSProvider: network error: ${msg}`);
    }

    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch { /* noop */ }
      throw new Error(`Murf error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json() as {
      encodedAudio?: string;
      audioFile?: string;
      remainingCharacterCount?: number;
    };

    if (!json.encodedAudio) {
      throw new Error("MurfTTSProvider: empty encodedAudio in response");
    }

    if (typeof json.remainingCharacterCount === "number") {
      console.log(`[voice] Murf quota remaining: ${json.remainingCharacterCount} chars`);
    }

    return {
      audio: Buffer.from(json.encodedAudio, "base64"),
      format: "mp3",
    };
  }
}
```

### Example 2: MicVAD integration in useWakeWord

```typescript
// Inside useWakeWord.ts boot block, after engine.start():
import { MicVAD } from "@ricky0123/vad-web";

const vad = await MicVAD.new({
  baseAssetPath: "/vad/",
  onnxWASMBasePath: "/vad/",
  model: "legacy",
  // D-02: defaults da lib — ver Discrepância
  // positiveSpeechThreshold: 0.3  (default)
  // negativeSpeechThreshold: 0.25 (default)
  // redemptionMs: 1400             (default — monitor UAT)
  // preSpeechPadMs: 800            (default)
  // minSpeechMs: 400               (default)
  getStream: async () => stream,  // REUSE existing MediaStream
  onSpeechStart: () => {
    console.log("[useWakeWord] VAD speech start");
  },
  onSpeechEnd: async (audio: Float32Array) => {
    console.log("[useWakeWord] VAD speech end, samples:", audio.length);
    if (vadMaxTimeoutRef.current) {
      clearTimeout(vadMaxTimeoutRef.current);
      vadMaxTimeoutRef.current = null;
    }
    vad.pause();
    const wavBytes = encodeFloat32ToWav(audio, 16000);
    await sendAudioAndHandle(wavBytes, {
      setState,
      setToast,
      addHumanMessage,
      addAgentMessage,
    });
    voiceInputManager.release("wakeword");
    wakeTriggeredListeningRef.current = false;
  },
  onVADMisfire: () => {
    console.log("[useWakeWord] VAD misfire (speech too short)");
  },
});
await vad.pause();  // START PAUSED — only run after wake word
vadRef.current = vad;
```

---

## State of the Art

| Old Approach (Phase 22) | New Approach (Phase 24) | When Changed | Impact |
|-------------------------|--------------------------|--------------|--------|
| `setTimeout(vadTimeoutMs=3000)` fixed | `MicVAD.onSpeechEnd` + 6s max fallback | Phase 24 | Recording termina naturalmente ~500ms após usuário parar, não em 3s arbitrários. Melhor UX. |
| `void audioRecorder.stopRecording()` (discards bytes) | `sendAudioAndHandle(wavBytes, deps)` | Phase 24 | Fecha o loop wake→STT→LLM→TTS. Motivo existencial da phase. |
| Inline audio send in `ChatInput.tsx:82-118` | `sendAudioAndHandle` shared function | Phase 24 | Elimina duplicação PTT vs wake word. Paridade garantida. |
| `TTS_PROVIDER=elevenlabs \| local` | + `murf` option | Phase 24 | Voz masculina pt-BR nativa de qualidade profissional. |

### Deprecated in this phase

- `VITE_WAKE_WORD_VAD_TIMEOUT_MS` env var — replaced by MicVAD internal timing. **Keep for backward compat** but document as "fallback max timeout" (maps to 6s hard limit, not the 3s default). Planner may rename to `VITE_WAKE_WORD_MAX_RECORDING_MS`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| **A1** | CONTEXT.md D-02 frame-based values (`minSpeechFrames=9`, `redemptionFrames=8`) are intent-approximations of an older API. The 0.0.30 API uses ms-based fields with different defaults. Planner should follow the new library defaults (`redemptionMs: 1400`, `minSpeechMs: 400`, `preSpeechPadMs: 800`). | VAD library final spec | Medium — if the user meant literal values 300/250ms, then library defaults (400/1400ms) will feel slower. Easy to override via env after UAT. |
| **A2** | Murf voiceId format is `pt-BR-heitor` (locale prefix + lowercase first name, no accents). | Murf TTS spec | Low — if wrong, fallback is passing just `heitor` (documented fallback in Murf docs). |
| **A3** | Murf free tier is 10.000 chars/month. | Murf TTS spec | Low — user is on their own Murf account, can upgrade if needed. Just a doc hint. |
| **A4** | The decision to encode Float32 → WAV in the renderer (Opção A) is preferred over MediaRecorder tee (Opção B) or PCM IPC extension (Opção C). | Critical Pitfall: VAD audio format mismatch | **HIGH** — if the user prefers a different approach, the entire Wave 3 task breakdown changes. Must be confirmed in planning BEFORE execution. |
| **A5** | External AbortController is NOT required in P1 — the existing 60s internal timeout (`AUDIO_REQUEST_TIMEOUT_MS`) is sufficient. D-09's per-stage budgets are documentation only, not enforced separately. | AbortController strategy | Medium — if user wants per-stage budgets strictly enforced, adds one task to break the backend pipeline into separate stages with separate timeouts. Significant rework. |
| **A6** | `MicVAD.new({ getStream: async () => existingStream })` reuses the stream without cloning — no second `getUserMedia` prompt. | Pattern 3 | Medium — if VAD clones the stream via `new MediaStream([track])`, may cause echo or double-capture. Test in Wave 3 Task 1; fallback is to tee the stream manually. |
| **A7** | Phase 22's CSP (`wasm-unsafe-eval`, `worker-src blob:`) is sufficient for the VAD AudioWorklet. No additional CSP changes needed. | Common Pitfalls §3 | Low — worst case is a CSP error in dev; fix is adding `worker-src 'self' blob:` (trivial). |
| **A8** | The `setToast` API in `ChatContext` accepts `{message, variant}` shape (confirmed from `handleAudioResponse.ts:14`). `sendAudioAndHandle` can use the same shape without extension. | sendAudioAndHandle deps | Low — verified via read. |
| **A9** | Removing `setReply` from `ChatInput.tsx` during the refactor doesn't break the SpeechBubble rendering, because SpeechBubble is fed from `useChat().messages` via `addAgentMessage`. | Common Pitfalls §8 | Medium — if SpeechBubble reads the local `reply` state, removing breaks PTT UX. Verify by reading SpeechBubble.tsx during planning (not done in research). |

**Critical assumptions needing user confirmation before execution:** **A1, A4, A5**.

---

## Open Questions

1. **Opção A vs B vs C for VAD audio format?**
   - What we know: VAD outputs Float32Array, backend expects WebM/Opus. A (WAV encode in renderer) is simplest.
   - What's unclear: Does the user prefer surgical (A) or architectural cleanup (C)?
   - Recommendation: A1 during `/gsd-plan-phase 24` review — confirm Opção A.

2. **D-02 tuning — defaults literal or defaults semantic?**
   - What we know: Library defaults are `redemptionMs: 1400`, vs CONTEXT.md cited "redemptionFrames: 8 (~250ms)".
   - What's unclear: Is "defaults da lib" prescriptive (= 1400) or descriptive (= "trust the lib defaults, which the CONTEXT tried to approximate but got wrong numbers")?
   - Recommendation: Follow library defaults literally (1400ms). If UAT shows lag, add env var override in a gap fix.

3. **Voice ID confirmation — runtime vs static?**
   - What we know: Default `pt-BR-heitor` is a reasonable guess based on docs pattern.
   - What's unclear: Exact ID string (case, accents).
   - Recommendation: Wave 1 Task 1 (Murf provider) runs `curl GET /v1/speech/voices` with user's real MURF_API_KEY as a pre-flight check, then hard-codes the confirmed ID. Falls back to name-only (`heitor`) if format guess wrong.

4. **AbortController P1 vs P2?**
   - What we know: 60s internal timeout exists and is sufficient for the happy path.
   - What's unclear: Does user want manual abort UI (click X on orb)?
   - Recommendation: Defer to Phase 25. Current D-09 can be interpreted as "documented max budget", not "externally-aborted".

5. **Tests for VAD integration — how far can we go with happy-dom?**
   - What we know: Phase 22 had issues with `document.baseURI` and `AudioWorklet` in happy-dom. The modelLoader and WakeWordEngine tests were deferred to gap fixes.
   - What's unclear: Can we get `MicVAD` mocked cleanly for unit tests?
   - Recommendation: Mock `@ricky0123/vad-web` at module level in tests (same pattern as WakeWordEngine mock). Test the WIRE, not the lib itself. E2E coverage is the human checkpoint.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22+ | Backend runtime (fetch native, etc.) | ✓ (assumed — monorepo requirement) | 22.x | — |
| pnpm | Install @ricky0123/vad-web | ✓ (monorepo) | 9.x | — |
| `onnxruntime-web` peer | VAD library | ✓ | 1.24.3 (satisfies ^1.17.0) | — |
| Murf API key | MurfTTSProvider runtime | **user-provided** | — | Provider factory falls back to LocalTTSProvider |
| Internet (Murf API) | Murf synthesis | user runtime | — | LocalTTSProvider fallback (but English-only, ruim em pt-BR) |
| ElevenLabs API key (existing) | ElevenLabs TTS provider | user-provided | — | unchanged |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `MURF_API_KEY` — if absent, factory returns LocalTTSProvider (same degrade path as ElevenLabs). User warned via console.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (renderer + backend) |
| Config file | `apps/desktop/vitest.config.ts`, `apps/backend-ts/vitest.config.ts` |
| Quick run command | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/sendAudioAndHandle.test.ts` |
| Full suite (desktop) | `pnpm --filter @jarvis/desktop test --run` |
| Full suite (backend) | `pnpm --filter @jarvis/backend-ts test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WAKE-05 | Full cycle loops back to idle automatically | unit | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/sendAudioAndHandle.test.ts -t "returns to idle"` | ❌ Wave 0 |
| WAKE-05 | useWakeWord uses sendAudioAndHandle on VAD end | unit | `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts -t "onSpeechEnd"` | ✅ existing file, add cenário |
| WAKE-06 | VAD real replaces fixed timeout | unit | `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts -t "VAD onSpeechEnd triggers send"` | ✅ add cenário |
| WAKE-06 | 6s max fallback triggers toast "Não ouvi nada" | unit | `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts -t "6s max fallback"` | ✅ add cenário |
| WAKE-10 (TTS degrade) | TTS failure → text message added, no error toast | unit | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/sendAudioAndHandle.test.ts -t "TTS failure degrade"` | ❌ Wave 0 |
| WAKE-11 (hard errors) | Backend down → toast pt-BR + idle | unit | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/sendAudioAndHandle.test.ts -t "backend down"` | ❌ Wave 0 |
| WAKE-12 (Murf) | TTS_PROVIDER=murf returns MurfTTSProvider | unit | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/index.test.ts -t "murf"` | ✅ existing file, add cenário |
| WAKE-12 (Murf) | MurfTTSProvider synthesize happy path | unit | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/murf.test.ts` | ❌ Wave 0 |
| WAKE-12 (Murf) | MurfTTSProvider handles 401, 429, network error | unit | `pnpm --filter @jarvis/backend-ts test --run src/voice/tts/murf.test.ts -t "error"` | ❌ Wave 0 |
| WAKE-13 (shared pipeline) | ChatInput.tsx consumes sendAudioAndHandle | unit | grep-based + (optional) snapshot of ChatInput.tsx | grep check |
| E2E (human) | Falar "Hey JARVIS, que horas são?" → ouvir resposta TTS pt-BR | manual | **Human checkpoint** | UAT |

### Sampling Rate

- **Per task commit:** Run only the test file touched by the task (quick — <5s)
- **Per wave merge:** `pnpm --filter @jarvis/desktop test --run` + `pnpm --filter @jarvis/backend-ts test --run` (full suite, both apps — <60s)
- **Phase gate:** Full suite green + human checkpoint passed before `/gsd-verify-work 24`

### Wave 0 Gaps

Before any Wave 1 task starts, Wave 0 creates:

- [ ] `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.test.ts` — covers WAKE-05, WAKE-10, WAKE-11, WAKE-13
- [ ] `apps/backend-ts/src/voice/tts/murf.test.ts` — covers WAKE-12
- [ ] Add test cenários to existing `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — WAKE-06 VAD cenários
- [ ] Add test cenários to existing `apps/backend-ts/src/voice/tts/index.test.ts` — `murf` case in factory
- [ ] Potential: `apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.test.ts` — if Opção A is chosen

**Framework install:** None — vitest already present in both apps.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — single-user local desktop app |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | JSON parse in `MurfTTSProvider` response — defensive `typeof` checks + slice |
| V6 Cryptography | no | HTTPS handled by platform (fetch + TLS 1.3) |
| V9 Communication | yes | Murf API uses HTTPS only. Log API key **never** (use `api-key` header from env, never `console.log(apiKey)`) |
| V14 Configuration | yes | `MURF_API_KEY` in `.env.example` with empty value, documentation says "obtain at https://murf.ai/api/pricing", never commit real keys |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| API key leak via logs | Info disclosure | Never `console.log(apiKey)` — already enforced by template. Review `murf.ts` error paths to ensure `body.slice(0,200)` doesn't include the header. |
| API key leak via git | Info disclosure | `.env` in `.gitignore` (already). `.env.example` has empty value. |
| Untrusted voice text → prompt injection (TTS) | Tampering | N/A — TTS output is audio, no downstream prompt. Text comes from LLM, not user. |
| Mic audio upload abuse | Info disclosure | WAKE-09 constraint: wake word detection is 100% offline (enforced by Phase 22). VAD and send only happen after wake word. User controls via tray pause. |
| Murf.ai cloud upload of user voice text | Privacy | **Explicit trade-off** — documented in `.env.example` that `TTS_PROVIDER=murf` sends **only the LLM response text** (not user audio) to Murf. User audio never leaves device. |
| VAD model integrity | Tampering | Models bundled in `node_modules` and copied to `public/` at build time — same attack surface as any npm package. `pnpm-lock.yaml` provides integrity hashes. |

---

## Runtime State Inventory

**Phase type:** Integration — no rename/refactor/migration. Some categories apply lightly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — ChromaDB collections, SQLite tables untouched | None |
| Live service config | Backend env vars: `TTS_PROVIDER`, `MURF_API_KEY`, `MURF_VOICE_ID` — new | Document in `.env.example`; user must `cp .env.example .env` and fill `MURF_API_KEY` |
| OS-registered state | None — no Windows Task Scheduler, pm2, launchd, systemd items touched | None |
| Secrets/env vars | New: `MURF_API_KEY` (must be set by user if `TTS_PROVIDER=murf`). No changes to existing secrets. | User sets via `.env` (not git) |
| Build artifacts | `apps/desktop/src/renderer/public/vad/` directory (NEW) containing VAD model + worklet + wasm files | Added via either (a) postinstall script, (b) vite-plugin-static-copy. **Verified not to break electron-builder packaging** because `public/` is already handled by Vite. No `extraResources` change needed. |

**Nothing found in category:** Stored data, OS-registered state — explicit (Phase 24 is renderer integration + backend provider addition only).

---

## Sources

### Primary (HIGH confidence)

- **npm registry**: `@ricky0123/vad-web@0.0.30` metadata — confirmed version, peerDep, publication date 2025-11-21, tarball size 4.4MB. `[VERIFIED: npm view 2026-04-11]`
- **VAD docs**: https://docs.vad.ricky0123.com/user-guide/api/ — full option types, defaults, callbacks, control methods. `[CITED via WebFetch 2026-04-11]`
- **VAD browser guide**: https://github.com/ricky0123/vad/blob/master/docs/user-guide/browser.md — self-hosting file list, Vite config example. `[CITED via WebFetch 2026-04-11]`
- **VAD issue #128**: https://github.com/ricky0123/vad/issues/128 — working Vite config for self-hosted assets. `[CITED via WebFetch 2026-04-11]`
- **Murf TTS API docs**: https://murf.ai/api/docs/api-reference/text-to-speech/generate — endpoint, headers, body shape, response fields. `[CITED via WebFetch 2026-04-11]`
- **Murf voice library**: https://murf.ai/api/docs/voices-styles/voice-library — pt-BR voice names (Benício, Gustavo, Heitor, Silvio, Yago). `[CITED via WebFetch 2026-04-11]`
- **Local code read**: `useWakeWord.ts`, `ChatInput.tsx`, `handleAudioResponse.ts`, `useAudioRecorder.ts`, `preload/index.ts`, `ipc-types.ts`, `ipc/chat.ts`, `voice/tts/*.ts`. `[VERIFIED: Read tool 2026-04-11]`
- **Phase 22/23 SUMMARY.md files** — established patterns, known quirks. `[VERIFIED: Read tool]`

### Secondary (MEDIUM confidence)

- **Murf voice ID format `pt-BR-heitor`**: inferred from sample `en-US-natalie` in docs. Not directly seen in a live API response. `[ASSUMED A2]`
- **Murf free tier 10k chars/month**: WebSearch result from community posts, not verified on Murf's official pricing page. `[ASSUMED A3]`
- **Murf pt-BR voice gender classification**: names are canonically Brazilian male (Heitor, Gustavo, Benício, Silvio, Yago) but docs don't explicitly label gender. Cross-confirmed against the Murf Falcon model voice list. `[MEDIUM]`

### Tertiary (LOW confidence)

- None — all critical claims backed by at least one primary source.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| VAD library API + self-hosting | HIGH | Docs oficiais + GitHub issue + WebFetch verified |
| VAD D-02 tuning discrepancy | HIGH | API has clearly changed between CONTEXT writing and 0.0.30 |
| Murf REST API shape | HIGH | Docs oficiais Murf |
| Murf voice ID format | MEDIUM | Inferred pattern, needs runtime confirmation |
| Audio format mismatch (WAV encoder need) | HIGH | Contracts explicitly incompatible in code |
| AbortController complexity | HIGH | IPC code read directly |
| TTS factory pattern | HIGH | Template file exists (`elevenlabs.ts`) |
| Test coverage strategy | MEDIUM | Depends on mockability of `@ricky0123/vad-web` — not yet validated |

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days — VAD lib had last release 2025-11-21, Murf API is stable REST)

---

## Ready for Planning

Research complete. Planner (`/gsd-plan-phase 24`) can now create PLAN.md files.

**Critical pre-planning confirmations needed from user (or planner's discretion if user is present):**

1. **A1** — Use library actual defaults for VAD tuning (`redemptionMs: 1400`, `minSpeechMs: 400`)? Or override to match CONTEXT-literal values (~250ms, ~300ms)?
2. **A4** — Confirm Opção A (WAV encoder in renderer) for VAD audio format, not Opção B (MediaRecorder tee) or Opção C (new PCM IPC channel)?
3. **A5** — Confirm external AbortController is NOT required in P1 — internal 60s timeout is sufficient?
4. **A6** — Will test Wave 3 Task 1 that `MicVAD.new({ getStream: () => existingStream })` reuses the stream without triggering a second `getUserMedia` prompt?

These four assumptions gate Wave 3 task breakdown. Planner should address them explicitly in PLAN.md or confirm with user during `/gsd-discuss-phase 24` if re-run.

---

*Phase: 24-wake-word-full-pipeline-integration*
*Researched: 2026-04-11*
