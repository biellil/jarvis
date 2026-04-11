# Phase 22: VoiceInputManager Refactor + Wake Word Core — Research

**Researched:** 2026-04-11
**Domain:** Electron 41 renderer — always-on wake word + mic ownership refactor
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (do NOT re-litigate)

Travadas pelo SUMMARY.md e pelo próprio 22-CONTEXT.md:

- **Lib:** `onnxruntime-web@1.24.3` + 4 modelos openwakeword ONNX (`melspectrogram.onnx`, `embedding_model.onnx`, `silero_vad.onnx`, `hey_jarvis_v0.1.onnx`). Rejeitados: `bumblebee-hotword-node` (Porcupine-derivado + SoX CLI + README "NOT for Electron"), `@picovoice/porcupine-node` (AccessKey viola privacy), `snowboy` (descontinuado 2020), `vosk` (usa STT full como proxy).
- **Processo:** Renderer (não main) — reusa `getUserMedia`, zero IPC por chunk, preserva `contextIsolation: true`/`nodeIntegration: false`/`sandbox: true`.
- **Refactor first:** `VoiceInputManager` é **primeiro commit** da phase, antes de qualquer código de wake word (mitigação obrigatória de PITFALL #3).
- **Packaging:** `extraResources` no `electron-builder.yml`, **NÃO** `asarUnpack`.
- **CPU budget:** <2% sustained após 10min silêncio num laptop 4-core (**blocker**, não polish).
- **`backgroundThrottling: false`** obrigatório no `webPreferences` da BrowserWindow.
- **Gate por OrbContext:** inferência só roda quando `state === 'idle'` (anti TTS self-trigger).
- **TTS player wrap:** `wakeword.pause()` em `beforePlay`, `wakeword.resume()` em `afterPlay + 300ms` (absorve speaker tail).
- **PTT sempre ganha:** política de arbitragem do `VoiceInputManager`.
- **Modelo:** `hey_jarvis_v0.1.onnx` (licença CC BY-NC-SA 4.0 aceitável por "assistente pessoal para uso próprio" explícito em PROJECT.md).
- **Threshold default:** `0.5` (sensível), configurável via `.env`.
- **Post-wake VAD timeout:** `3000ms` (mínimo da range 3-5s de WAKE-06).
- **Default state:** wake word **ligado** no primeiro launch.
- **Audible cue:** silencioso (visual-only — orb transition é feedback suficiente nesta phase).

### Claude's Discretion

Áreas técnicas onde o planner tem autonomia:

- Frame size do AudioWorkletProcessor (sugerido 1280 samples @ 16kHz = 80ms — alinhado a openwakeword_wasm reference).
- Debounce window pós-detecção (sugerido 2000ms).
- ONNX session options (`executionProviders: ['wasm']`, `wasm.numThreads: 1`, `wasm.simd: true`).
- Cold start strategy — preload durante `ready-to-show` vs lazy on first idle.
- Diretório exato dos modelos: `apps/desktop/resources/wakeword-models/`.
- Runtime path resolver pattern (`app.isPackaged ? process.resourcesPath : __dirname/../..`).
- Naming exato de eventos/callbacks no `VoiceInputManager`.
- Estrutura de IPC para `wakeWord:toggle` (não é escopo da Phase 22 — tray toggle é Phase 23 WAKE-03).

### Deferred Ideas (OUT OF SCOPE)

Explicitamente **fora** de Phase 22 — pertencem a Phase 23 ou v1.5+:

- Wake burst visual no orb (WAKE-02 → Phase 23)
- Kill switch no tray menu (WAKE-03 → Phase 23)
- Distinção visual idle-ativo vs idle-paused (WAKE-04 → Phase 23)
- `prefers-reduced-motion` (ORB-POL-01 → Phase 23)
- Custom wake word model treinado pra "jarvis" standalone (v1.5+)
- Audible cue configurable (v1.5+)
- Mic device selection (v1.5+)
- Threshold calibration UI (v1.5+)
- macOS/Linux cross-platform polish (v1.5+)
- Custom verifier model (user voice fingerprint para reduzir falsos positivos de TV/música) — deferível pra Phase 23 ou v1.5

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrição | Research Support |
|----|-----------|------------------|
| **WAKE-01** | Usuário ativa falando "Hey JARVIS" sem tecla; orb transiciona `idle → listening` em ≤500ms | Pipeline 12.5Hz @ AudioWorklet + debounce 2s + `onDetected()` direto em `OrbContext.setState('listening')` (`Pattern 2 — Reuse PTT Action Surface` do ARCHITECTURE.md). Latência esperada: <100ms do último frame ao callback. |
| **WAKE-05** | Após ciclo (wake → speech → response → TTS), listening retoma automaticamente sem ação | `useWakeWord` hook subscribe em `OrbContext` — `suspend()` em `state === 'responding'`, `resume()` em transição `→ idle`. Single `AudioContext` compartilhado (não recria stream). |
| **WAKE-06** | Se não falar em 3-5s após wake, gravação aborta e orb volta pro idle (via Silero VAD) | Timeout configurável `WAKE_WORD_VAD_TIMEOUT_MS=3000` — timer arma em `onDetected()`, cancela quando Silero VAD confirma fala contínua ou quando o usuário manda `stopRecording`. Integração com `useAudioRecorder.stopRecording()` no estouro do timer. |
| **WAKE-07** | PTT (`Ctrl+Space`) continua funcionando e sempre ganha sobre wake word (`VoiceInputManager`) | `VoiceInputManager.acquire({ source: 'ptt' })` **preempta** qualquer `source: 'wakeword'` ativo. `acquire({ source: 'wakeword' })` é **rejeitado** se `currentSource === 'ptt'`. Refactor do `ptt-hotkey.ts` para deixar de ter `isRecording` module-local. |
| **WAKE-08** | Se mic não disponível (`getUserMedia` falha), degrada para PTT-only com indicação no tray | Try/catch em volta de `engine.start()` captura `NotAllowedError`/`NotFoundError`; seta `wakeWordStatus: 'unavailable'` no store + tray tooltip "JARVIS — mic indisponível". PTT hotkey continua registrado independentemente (não depende do `VoiceInputManager` ter stream, só delega). |
| **WAKE-09** | Nenhum áudio de wake word sai do dispositivo — 100% offline | Verificado pela escolha de lib: `onnxruntime-web` roda em WASM dentro do Chromium, modelos `.onnx` bundled via `extraResources`, zero `fetch()` para rede fora de `file://resources/`. CI grep ban: `grep -E "porcupine\|picovoice\|bumblebee-hotword" pnpm-lock.yaml && exit 1`. |

</phase_requirements>

## Summary

Phase 22 é dois entregáveis acoplados num único goal: (1) refatorar a ownership de microfone extraindo `VoiceInputManager` singleton de `apps/desktop/src/main/ptt-hotkey.ts` — **primeiro commit, antes de qualquer wake word code** — e (2) implementar a detecção "Hey JARVIS" 100% offline no renderer do Electron via `onnxruntime-web@1.24.3` + 4 modelos openwakeword ONNX rodando dentro de um `AudioWorkletProcessor`. A phase DEVE começar pelo refactor porque o arquivo atual mantém `let isRecording = false;` em escopo de módulo — incompatível com um segundo ator de captura de mic. Adicionar wake word em cima garante race condition em produção (PITFALL #3).

O stack é minimalista: **um único pacote npm novo** (`onnxruntime-web@1.24.3`, MIT, Microsoft, verificado no npm registry 2026-04-11 às 138MB unpacked) mais 4 arquivos `.onnx` (~4 MB total) em `apps/desktop/resources/wakeword-models/`. Nenhum binário nativo, nenhum `node-gyp`, nenhum `postinstall` rebuild — tudo roda WASM no Chromium do Electron 41. Web Audio API (`AudioContext` + `AudioWorklet` + `getUserMedia`) é nativa, zero deps novas. `electron-builder` ainda **não existe no repositório** (v1.3 faz só `electron-vite build`, sem empacotamento final) — adicionar `electron-builder` como devDep e criar `electron-builder.yml` com `extraResources` é parte explícita do escopo desta phase.

**Primary recommendation:** Executar como 3 blocos sequenciais de commit: (Block 1) VoiceInputManager + refactor ptt-hotkey → (Block 2) Model loading + AudioWorklet chunker + ONNX pipeline inference stub com áudio sintético → (Block 3) Integração live com getUserMedia + useAudioRecorder + OrbContext gating + TTS pause/resume wrap + electron-builder extraResources + CPU budget validation. Cada bloco tem verificação independente. Nada avança sem CPU <2% sustained bater.

## Project Constraints (from CLAUDE.md)

O `./CLAUDE.md` do repo **está outdated** — descreve a stack Python do v1.0 (LangChain/LangGraph, faster-whisper, chromadb embedded, etc.) que foi removida na v1.3 (cutover 2026-04-10, Phase 21). A stack real atual do `apps/desktop` é **Electron 41.1.1 + TypeScript 6 + React 19.2.4 + Vite 6 + Tailwind 4 + electron-vite 5**. Os research docs (STACK.md, ARCHITECTURE.md, STATE.md) refletem a stack TS real.

**Directives vinculantes do CLAUDE.md que permanecem válidos** (independem do runtime):

- **Privacy-first (hard constraint):** "Conversa nunca vai para cloud sem configuração explícita do usuário — padrão é local." → Traduz para "nenhum áudio de wake word sai do device" (WAKE-09). Enforcement: CI grep ban em Porcupine/Picovoice/Bumblebee.
- **Multiplataforma:** Código OS-específico isolado. Phase 22 é Windows-primary (v1.4 continua Windows-only por decisão v1.2 explícita em STATE.md); macOS/Linux são documentados-mas-deferidos.
- **Sem UI obrigatória** / "JARVIS deve funcionar 100% em terminal" — não se aplica ao desktop widget, mas reforça que **falhas de wake word NUNCA podem quebrar PTT** (WAKE-08).
- **Git commits em pt-BR** seguindo Conventional Commits + emoji (`✨ feat:`, `♻️ refactor:`, `🔧 chore:`, etc.). **NUNCA** incluir `Co-Authored-By: Claude` ou linhas `Generated with Claude Code` em commits.
- **Todas as respostas ao usuário em pt-BR** (confirmado no MEMORY.md do agente).
- **Entry point via `/gsd:` commands** — a phase deve ser executada via `/gsd:execute-phase 22`, não edits diretos.
- **Licença CC BY-NC-SA 4.0 dos modelos openwakeword** é aceitável porque PROJECT.md declara "assistente pessoal para uso próprio" — re-validar se o projeto virar comercial no futuro.

## Standard Stack

### Core (adição única em `apps/desktop`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `onnxruntime-web` | **1.24.3** `[VERIFIED: npm view onnxruntime-web version → 1.24.3]` | Runtime ONNX WASM dentro do Chromium do Electron | MIT, Microsoft, último release 2025-11. Zero binários nativos, zero `node-gyp`, zero `postinstall` rebuild. Mesmo runtime que `transformers.js` já usado em v1.3 para embeddings — compatibilidade comprovada. `[CITED: https://www.npmjs.com/package/onnxruntime-web]` |
| `electron-builder` | **26.x (latest)** `[ASSUMED — to verify via npm view]` | Empacotamento final do Electron para `.exe`/`.AppImage`/`.dmg` com `extraResources` | **Ainda não instalado no repo.** `electron-vite` NÃO empacota — ele só compila. `electron-builder` é a ferramenta padrão e de-facto para packaging final e é explicitamente recomendada pela documentação do electron-vite. `[CITED: https://electron-vite.org/guide/distribution]` |

### Assets (novos em `apps/desktop/resources/wakeword-models/`)

| File | Size (approx) | Source | License |
|------|---------------|--------|---------|
| `melspectrogram.onnx` | ~500 KB | [HuggingFace davidscripka/openwakeword](https://huggingface.co/davidscripka/openwakeword) | Apache-2.0 (code), CC BY-NC-SA 4.0 (model) |
| `embedding_model.onnx` | ~2 MB | idem (shared Google speech embedding) | idem |
| `silero_vad.onnx` | ~1.5 MB | idem (bundled by openwakeword releases) | idem |
| `hey_jarvis_v0.1.onnx` | ~80 KB | idem (pre-trained classifier, 102k params) | idem |

**Total:** ~4 MB. Muito menor que modelos de STT/TTS — impacto desprezível no tamanho do instalador.

**Download URLs canônicos (a validar no início da Phase 22):**

```
https://huggingface.co/davidscripka/openwakeword/resolve/main/melspectrogram.onnx
https://huggingface.co/davidscripka/openwakeword/resolve/main/embedding_model.onnx
https://huggingface.co/davidscripka/openwakeword/resolve/main/silero_vad.onnx
https://huggingface.co/davidscripka/openwakeword/resolve/main/hey_jarvis_v0.1.onnx
```

`[ASSUMED]` — os paths exatos não foram 100% verificados via WebFetch (HuggingFace file listing retornou HTML parcial). Primeira tarefa do plano: validar URLs via `curl -I` + checksum antes de comitar binários. **Fallback:** GitHub releases de `dscripka/openWakeWord` sempre contêm `melspectrogram.onnx` + `silero_vad.onnx`; `hey_jarvis_v0.1.onnx` pode estar no repo `dscripka/openWakeWord-models` ou no HF.

### Reutilização (já instalado, zero adição)

| Library | Version atual | Uso em Phase 22 |
|---------|---------------|-----------------|
| `react` | 19.2.4 | `useWakeWord` hook, subscriptions em `OrbContext` |
| `electron` | 41.1.1 | Chromium ~131+ (SIMD WASM, AudioWorklet, SharedArrayBuffer quando `crossOriginIsolated`) |
| `electron-vite` | 5.0.0 | Build de main+preload+renderer; serving do AudioWorklet `.js` via `new URL(...)` ou `public/` |
| `electron-store` | 11.0.2 | Persistir `wakeWordEnabled` (já existe pattern pra `pttHotkey`) |
| `tailwindcss` | 4.0.0 | Zero uso novo — Phase 23 faz visual polish |
| `vitest` + `happy-dom` | 4.1.2 / 20.8.9 | Unit tests de `VoiceInputManager` e `WakeWordEngine` (mockar `ort.InferenceSession`) |

### Versões verificadas

```bash
# Comando rodado em 2026-04-11 para validar a versão travada no CONTEXT.md:
$ npm view onnxruntime-web version
1.24.3  # ← bate com SUMMARY.md e STACK.md

# Publish date reconfirmada via npm view time:
$ npm view onnxruntime-web time --json | grep -A1 1.24.3
# Publicada em nov/2025 (conforme SUMMARY.md linha 23)

# electron-builder ainda não foi verificado nesta pesquisa — primeira tarefa do plano:
$ npm view electron-builder version  # TODO no plan
```

**Installation:**

```bash
# No pnpm workspace root:
pnpm --filter @jarvis/desktop add onnxruntime-web@1.24.3
pnpm --filter @jarvis/desktop add -D electron-builder

# Modelos: NÃO são pacotes npm. Baixar manualmente para:
#   apps/desktop/resources/wakeword-models/
# Verificar com curl -I antes de commitar:
for f in melspectrogram embedding_model silero_vad hey_jarvis_v0.1; do
  curl -sI "https://huggingface.co/davidscripka/openwakeword/resolve/main/${f}.onnx" | head -3
done
```

## Architecture Patterns

### Project Structure (NEW files + MODIFIED files)

```
apps/desktop/
├── electron-builder.yml                         # NEW: extraResources + asar config
├── resources/
│   ├── tray/                                    # EXISTING: tray icons
│   │   ├── icon-16x16.png
│   │   └── icon-32x32.png
│   └── wakeword-models/                         # NEW: 4 ONNX files (~4 MB)
│       ├── melspectrogram.onnx
│       ├── embedding_model.onnx
│       ├── silero_vad.onnx
│       └── hey_jarvis_v0.1.onnx
├── src/
│   ├── main/
│   │   ├── index.ts                             # MODIFIED: backgroundThrottling: false
│   │   ├── ptt-hotkey.ts                        # REFACTORED: delega ao VoiceInputManager IPC surface
│   │   ├── voiceInput/
│   │   │   └── resources.ts                     # NEW: runtime path resolver (app.isPackaged ? resourcesPath : devPath)
│   │   └── store.ts                             # MODIFIED: wakeWordEnabled schema + getter/setter
│   ├── preload/
│   │   └── index.ts                             # MODIFIED: expose wakeWord.getModelPaths() + voiceInput.* se necessário
│   ├── shared/
│   │   └── ipc-types.ts                         # MODIFIED: WakeWordAPI + WAKE_WORD_* channel constants
│   └── renderer/
│       ├── hooks/
│       │   ├── useAudioRecorder.ts              # MODIFIED: startRecording recebe `source: 'ptt'|'wakeword'` pra logs + VoiceInputManager hookup
│       │   └── useWakeWord.ts                   # NEW: React hook — mounts engine, wires OrbContext gating
│       └── src/
│           ├── App.tsx                          # MODIFIED: mount useWakeWord() em AppContent
│           ├── audio/
│           │   └── ttsPlayer.ts                 # MODIFIED: wake word pause/resume wrap em beforePlay/afterPlay
│           └── voice/
│               ├── handleAudioResponse.ts       # UNCHANGED (reused verbatim)
│               ├── voiceInputManager.ts         # NEW: singleton PTT⟷WakeWord arbitration
│               └── wakeWord/
│                   ├── WakeWordEngine.ts        # NEW: orchestrator (audio pipeline + ONNX sessions + debounce)
│                   ├── wakeWordWorklet.js       # NEW: AudioWorkletProcessor (1280-sample chunks @ 16kHz)
│                   ├── modelLoader.ts           # NEW: fetch + ort.InferenceSession.create for 4 models
│                   ├── rmsZeroGuard.ts          # NEW: silent-stream detection (5s sliding window, RMS === 0)
│                   └── __tests__/
│                       ├── WakeWordEngine.test.ts
│                       ├── voiceInputManager.test.ts
│                       └── rmsZeroGuard.test.ts
```

### Pattern 1: VoiceInputManager Singleton (Phase 22 Block 1 — commit 1)

**What:** Singleton no renderer que possui o conceito de "quem está segurando o mic agora". Ambos PTT e wake word delegam a ele. Segunda requisição concorrente é resolvida por política de prioridade.

**When to use:** Qualquer vez que dois ou mais atores precisam coordenar acesso a um recurso single-writer (mic stream, MediaRecorder).

**Contract:**

```typescript
// apps/desktop/src/renderer/src/voice/voiceInputManager.ts
// Source: mitigação direta de PITFALL #3 (ARCHITECTURE.md lines 66-76)
// Contract derivado de WAKE-07 + análise do ptt-hotkey.ts atual.

export type InputSource = 'ptt' | 'wakeword' | null;

export interface VoiceInputGrant {
  source: InputSource;
  releasedPreviousSource: InputSource;  // para logging/telemetria
  startedAt: number;
}

export interface VoiceInputManager {
  /**
   * Tenta adquirir o mic para um source.
   * - PTT preempta wakeword (cancela engine + startRecording manual).
   * - WakeWord é rejeitado se source atual === 'ptt'.
   * - Mesma source tentando adquirir 2x vira no-op (idempotente).
   */
  acquire(source: 'ptt' | 'wakeword'): VoiceInputGrant | { error: 'BUSY' };

  /**
   * Libera o mic. Só funciona se o caller for o source atual.
   * No-op se source !== currentSource (evita PTT matar wakeword por acidente).
   */
  release(source: 'ptt' | 'wakeword'): void;

  /** Estado atual, pra observers (orb, tray, logging). */
  getCurrentSource(): InputSource;

  /** Subscribe para transitions (tray indicator, debug logs). */
  subscribe(listener: (source: InputSource) => void): () => void;
}
```

**Implementation notes:**

1. **No MediaStream ownership yet** — o manager só rastreia o "lock lógico". O stream em si continua sendo adquirido por `useAudioRecorder` (PTT path) ou `WakeWordEngine` (wakeword path). Isso é suficiente pro MVP porque Chromium permite múltiplos consumers no mesmo device simultaneamente; o problema é double-trigger de ação, não double-acquire de hardware.
2. **Block 1 refactor:** `ptt-hotkey.ts` deixa de ter `let isRecording = false;` e passa a consultar `voiceInputManager.acquire('ptt')` via IPC (main → renderer dispara `ptt:action start`, mas antes do `startRecording`, o ChatInput consulta o manager). Versão mínima viável: toda a lógica do manager vive no renderer, e o handler de `ptt:action` em `ChatInput.tsx` chama `voiceInputManager.acquire('ptt')` antes de `audioRecorder.startRecording()`.
3. **PTT preempta wake word:** se `wakeword` estiver ativo e `ptt` chamar `acquire()`, o manager emite `release('wakeword')` internamente (notificando o `WakeWordEngine` via subscribe callback), aí concede `'ptt'`. `WakeWordEngine` ao receber release suspende o audio context **mas não destrói** (resumir é barato).
4. **Idempotência:** `acquire('ptt')` duas vezes seguidas = segundo call retorna o grant existente, não preempta a si mesmo.

### Pattern 2: AudioWorklet + ONNX Runtime Web no Renderer (Phase 22 Block 2)

**What:** `AudioWorkletProcessor` roda off-main-thread dentro do `AudioWorkletGlobalScope`, buffera Float32 PCM em frames de 1280 samples (80 ms @ 16 kHz), posta via `port.postMessage` para o `WakeWordEngine` no main thread do renderer. O engine roda a cadeia de 4 modelos ONNX.

**Source:** `[CITED: https://github.com/dnavarrom/openwakeword_wasm]` — reference implementation. Frame size 1280 @ 16kHz, VAD hangover 12 frames, cooldown 2000ms, detection threshold 0.5.

**Cadência de inferência (research-required topic b):**

| Stage | Freq | Notas |
|-------|------|-------|
| `AudioWorklet process()` | nativo (~128 samples @ 16kHz = 8ms/call) | Driver do Chromium chama a cada quantum. |
| Chunk postado ao engine | 12.5 Hz (cada 80ms, quando buffer interno atinge 1280 samples) | `AudioWorklet` junta 10 quanta antes de postar. |
| Melspec + embedding inference | 12.5 Hz | Roda em **todo** chunk (feature extraction sempre-on, barato, ~1-5ms por call com SIMD WASM). |
| Silero VAD | 12.5 Hz | Roda sobre embedding. Se `vad_score < 0.3` por 12 frames consecutivos (hangover), **pula classifier**. |
| `hey_jarvis` classifier | ~12.5 Hz em speech, ~0 Hz em silêncio | Só roda quando VAD diz que há fala → economiza ~90% da CPU em sala silenciosa (PITFALL #4 mitigation). |
| Detection event | <1 Hz (gated por debounce 2000ms) | Trigger quando score > 0.5 **E** debounce window passou. |

**Buffer sizing:**

- **Input buffer:** circular Float32Array de 1280 samples dentro do AudioWorkletProcessor. `process()` grava incrementalmente, dispara `port.postMessage(frame)` quando preenche.
- **Embedding context window:** openwakeword usa ~76 frames de embedding (~6 segundos de contexto) para o classifier. Mantido em ring buffer no `WakeWordEngine`. Cada novo embedding empurra o mais antigo.
- **No copy via Transferable:** postar o ArrayBuffer com transfer list para evitar cópia estrutural. No worklet: `this.port.postMessage(frame.buffer, [frame.buffer]);` — após transfer o worklet aloca novo Float32Array.

**Code sketch (fonte: ARCHITECTURE.md lines 187-247, com ajustes de threshold 0.5):**

```typescript
// apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts
// Source: ARCHITECTURE.md (verified code from research dir)
// Adjustments: threshold 0.5 (locked by CONTEXT.md), VAD gate 0.3 (PITFALL #11 mitigation)
import * as ort from 'onnxruntime-web';

// Critical: single-thread for low CPU + avoid crossOriginIsolated requirement.
// [CITED: https://github.com/microsoft/onnxruntime/issues/19148]
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

export interface WakeWordEngineOptions {
  threshold: number;        // from env WAKE_WORD_THRESHOLD, default 0.5
  debounceMs: number;       // default 2000
  vadThreshold: number;     // default 0.3 (generous — PITFALL #11)
  onDetected: (score: number) => void;
}

export class WakeWordEngine {
  private sessions: Record<string, ort.InferenceSession> = {};
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private embeddingRing: Float32Array[] = [];  // last 76 embeddings
  private lastDetectionAt = 0;
  private vadHangover = 0;

  constructor(private opts: WakeWordEngineOptions) {}

  async start(modelPaths: { mel: string; embed: string; vad: string; kw: string }): Promise<void> {
    this.sessions.mel = await ort.InferenceSession.create(modelPaths.mel);
    this.sessions.embed = await ort.InferenceSession.create(modelPaths.embed);
    this.sessions.vad = await ort.InferenceSession.create(modelPaths.vad);
    this.sessions.kw = await ort.InferenceSession.create(modelPaths.kw);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: false },
    });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    // Worklet served as public asset — Vite copies apps/desktop/src/renderer/public/* to dist/renderer/
    await this.audioContext.audioWorklet.addModule('/wakeWordWorklet.js');

    const source = this.audioContext.createMediaStreamSource(this.stream);
    const worklet = new AudioWorkletNode(this.audioContext, 'wake-word-chunker');
    worklet.port.onmessage = (e) => this.processChunk(new Float32Array(e.data));
    source.connect(worklet);
    // Do NOT connect worklet to destination (would echo to speakers).
  }

  private async processChunk(chunk: Float32Array): Promise<void> {
    // Guard: silent stream (RMS zero guard, PITFALL #7 mitigation)
    // Delegated to rmsZeroGuard.ts elsewhere in the module.

    // 1. Mel spectrogram
    const mel = await this.sessions.mel.run({
      input: new ort.Tensor('float32', chunk, [1, chunk.length]),
    });

    // 2. Embedding (76-frame window kept in ring)
    const embed = await this.sessions.embed.run({ input: mel.output });
    const embedding = embed.output.data as Float32Array;
    this.embeddingRing.push(embedding);
    if (this.embeddingRing.length > 76) this.embeddingRing.shift();
    if (this.embeddingRing.length < 76) return;  // cold start

    // 3. Silero VAD — gate classifier
    const vad = await this.sessions.vad.run({ input: embed.output });
    const vadScore = (vad.output.data as Float32Array)[0];
    if (vadScore < this.opts.vadThreshold) {
      if (this.vadHangover > 0) this.vadHangover--;
      if (this.vadHangover === 0) return;  // skip classifier in silence
    } else {
      this.vadHangover = 12;  // hangover of 12 frames (~960ms of speech assumed)
    }

    // 4. Keyword classifier
    const flattened = new Float32Array(76 * embedding.length);
    for (let i = 0; i < 76; i++) flattened.set(this.embeddingRing[i], i * embedding.length);
    const kw = await this.sessions.kw.run({
      input: new ort.Tensor('float32', flattened, [1, 76, embedding.length]),
    });
    const score = (kw.output.data as Float32Array)[0];

    const now = Date.now();
    if (score >= this.opts.threshold && now - this.lastDetectionAt > this.opts.debounceMs) {
      this.lastDetectionAt = now;
      this.opts.onDetected(score);
    }
  }

  async suspend(): Promise<void> { await this.audioContext?.suspend(); }
  async resume(): Promise<void> { await this.audioContext?.resume(); }
  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.audioContext?.close();
    this.sessions = {};
    this.embeddingRing = [];
  }
}
```

**Trade-offs:**

- `+` AudioWorklet roda no audio rendering thread do Chromium → zero jank no orb CSS animations.
- `+` `onnxruntime-web` com `numThreads: 1` evita exigência de `crossOriginIsolated` (Electron default não é isolated — setar COOP/COEP headers é dor de CSP). `[CITED: https://github.com/microsoft/onnxruntime/issues/19148]`
- `+` SIMD WASM é default-on em Chromium ≥ 91 — Electron 41 usa Chromium 131+, suportado.
- `-` AudioWorklet precisa ser servido como arquivo separado (não ESM). Solução: colocar em `apps/desktop/src/renderer/public/wakeWordWorklet.js` → Vite copia verbatim para `dist/renderer/`, referenciável como `/wakeWordWorklet.js`. `[CITED: https://electron-vite.org/guide/assets]`
- `-` Cold start (load 4 sessions) ~500-1000ms — mitigação: preload durante `ready-to-show` do BrowserWindow, antes do usuário ver o orb em idle.

### Pattern 3: AudioWorklet Asset Serving em Vite/Electron (research-required topic a)

**O problema:** `AudioWorkletProcessor` deve ser um arquivo `.js` standalone (não ESM module type="module"). O Chromium carrega via `audioContext.audioWorklet.addModule(url)`, e o URL precisa ser resolvível tanto em dev (Vite dev server, `http://localhost:5173/...`) quanto em produção (electron `file://` do asar empacotado).

**3 approaches viáveis:**

| Approach | Dev | Produção | Verdict |
|----------|-----|----------|---------|
| **A. `public/` asset + string path `'/wakeWordWorklet.js'`** `[CITED: https://electron-vite.org/guide/assets]` | ✅ Vite serve `public/*` na raiz | ✅ Vite copia para `dist/renderer/` verbatim, `file:///dist/renderer/wakeWordWorklet.js` acessível | **RECOMENDADO** — simples, sem transform, zero surpresa |
| **B. `new URL('./wakeWordWorklet.js', import.meta.url)`** `[CITED: https://vite.dev/guide/assets]` | ⚠️ Funciona mas emite warning em alguns setups (vitejs/vite#9606) | ✅ Resolve via asset pipeline | Segunda escolha — ESM-friendly mas menos previsível |
| **C. `?url` suffix import `import wwUrl from './wakeWordWorklet.js?url'`** | ✅ | ✅ | Terceira escolha — TypeScript não transpila `.js?url` corretamente (vitejs/vite#9952) |

**Decisão:** **Approach A.** Arquivo vive em `apps/desktop/src/renderer/public/wakeWordWorklet.js` (note: precisa ser `.js` nativo, **NÃO** `.ts` — AudioWorkletGlobalScope não tem TypeScript transform). Acessado via string literal `'/wakeWordWorklet.js'`. electron-vite confirma `public/` dir handling para renderer.

**Alternativa se CSP bater:** Se o default CSP do Electron rejeitar `addModule` de URL same-origin (improvável com `webSecurity: true` + same-origin file://), adicionar `worker-src 'self' blob:` via `session.defaultSession.webRequest.onHeadersReceived` — mas só se medir que é necessário. Ponto de ajuste documentado em STATE.md Open Questions #2.

**Code do worklet (não-TypeScript, fica em `public/`):**

```javascript
// apps/desktop/src/renderer/public/wakeWordWorklet.js
// AudioWorkletGlobalScope — no ESM imports allowed.
class WakeWordChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1280);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex++] = channel[i];
      if (this.bufferIndex === 1280) {
        // Transfer ownership — no copy
        const frame = this.buffer.slice();
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this.bufferIndex = 0;
      }
    }
    return true;  // keep processor alive
  }
}
registerProcessor('wake-word-chunker', WakeWordChunker);
```

### Pattern 4: electron-builder `extraResources` + Runtime Path Resolver (research-required topic c)

**O problema:** Modelos `.onnx` ficam em `apps/desktop/resources/wakeword-models/` durante dev. Em produção, o electron-builder empacota tudo dentro de `app.asar` por default, e `onnxruntime-web` (que roda no renderer via `fetch`) não consegue `fetch()` de dentro de asar com um simples path relativo.

**Solução canônica `[CITED: https://www.electron.build/configuration/contents]`:**

Criar `apps/desktop/electron-builder.yml` (o arquivo **não existe no repo hoje** — confirmado via grep):

```yaml
# apps/desktop/electron-builder.yml
# Source: https://www.electron.build/configuration/contents (extraResources spec)
appId: com.jarvis.desktop
productName: JARVIS
directories:
  output: release
  buildResources: resources
files:
  - dist/**/*
  - package.json
extraResources:
  - from: resources/wakeword-models
    to: wakeword-models
    filter:
      - "**/*.onnx"
asar: true  # renderer/main stay in asar; models are outside via extraResources
win:
  target: nsis
  extendInfo: {}
mac:
  target: dmg
  extendInfo:
    NSMicrophoneUsageDescription: "JARVIS precisa do microfone para detectar o wake word 'Hey JARVIS'."
linux:
  target: AppImage
```

**Runtime path resolver:**

O resolver vive no **main process** porque é quem tem acesso a `app.isPackaged` e `process.resourcesPath`. Main expõe os paths ao renderer via preload bridge no boot.

```typescript
// apps/desktop/src/main/voiceInput/resources.ts
// Source: https://www.electronjs.org/docs/latest/api/app#appispackaged readonly
// Standard pattern per PITFALL #5 mitigation.
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getWakeWordModelPaths() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'wakeword-models')
    : path.join(__dirname, '../../../resources/wakeword-models');  // dev: from dist/main up to apps/desktop/resources

  return {
    mel: path.join(base, 'melspectrogram.onnx'),
    embed: path.join(base, 'embedding_model.onnx'),
    vad: path.join(base, 'silero_vad.onnx'),
    kw: path.join(base, 'hey_jarvis_v0.1.onnx'),
  };
}
```

**Preload bridge:**

```typescript
// apps/desktop/src/preload/index.ts (add to existing contextBridge)
contextBridge.exposeInMainWorld('jarvis', {
  // ... existing API ...
  wakeWord: {
    getModelPaths: () => ipcRenderer.invoke('wakeWord:get-model-paths'),
  },
});
```

**Main handler:**

```typescript
// apps/desktop/src/main/ipc/wakeWord.ts (NEW)
import { ipcMain } from 'electron';
import { getWakeWordModelPaths } from '../voiceInput/resources';

export function registerWakeWordIpc() {
  ipcMain.handle('wakeWord:get-model-paths', () => {
    const paths = getWakeWordModelPaths();
    // Convert absolute paths to file:// URLs for fetch() from renderer.
    return {
      mel: `file://${paths.mel}`,
      embed: `file://${paths.embed}`,
      vad: `file://${paths.vad}`,
      kw: `file://${paths.kw}`,
    };
  });
}
```

**⚠️ Gotcha descoberto durante pesquisa:** `onnxruntime-web` usa `fetch()` para carregar modelos no renderer. `fetch('file://...')` **pode** ser bloqueado por `webSecurity: true` + same-origin policy em Electron renderer. Dois workarounds conhecidos:

1. **Ler bytes no main, passar via IPC como `ArrayBuffer`:** main lê o arquivo com `fs.readFile`, envia via IPC, renderer cria `ort.InferenceSession.create(uint8Array)` passando bytes diretamente. Mais robusto, adiciona ~4MB de transferência IPC no boot (aceitável — uma vez só).
2. **Servir via protocolo customizado:** registrar `jarvis://` via `protocol.registerFileProtocol` em main, `fetch('jarvis://wakeword-models/melspectrogram.onnx')` resolve para o caminho real.

**Recomendação:** **approach 1 (read-and-transfer)** — mais simples, funciona independentemente de CSP/CORS, e é único one-shot no boot. Testar approach 2 como fallback se o overhead de IPC boot for percebido.

### Pattern 5: Orb State Gating + TTS Pause/Resume (Phase 22 Block 3)

Self-trigger loop mitigation (PITFALL #2 de ARCHITECTURE.md/PITFALLS.md):

```typescript
// apps/desktop/src/renderer/hooks/useWakeWord.ts (NEW)
// Source: ARCHITECTURE.md sketch + CONTEXT.md locked decisions
import { useEffect, useRef } from 'react';
import { useOrbContext } from '../components/Orb/OrbContext';
import { useAudioRecorder } from './useAudioRecorder';
import { WakeWordEngine } from '../src/voice/wakeWord/WakeWordEngine';
import { voiceInputManager } from '../src/voice/voiceInputManager';

export function useWakeWord() {
  const { state, setState } = useOrbContext();
  const audioRecorder = useAudioRecorder();
  const engineRef = useRef<WakeWordEngine | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;  // always-fresh read inside callbacks

  useEffect(() => {
    const bootEngine = async () => {
      const modelPaths = await window.jarvis.wakeWord.getModelPaths();
      const engine = new WakeWordEngine({
        threshold: parseFloat(import.meta.env.VITE_WAKE_WORD_THRESHOLD ?? '0.5'),
        debounceMs: 2000,
        vadThreshold: 0.3,
        onDetected: async (score) => {
          // GATE: only fire when in idle (prevents TTS self-trigger)
          if (stateRef.current !== 'idle') return;
          // GATE: only fire if VoiceInputManager grants us
          const grant = voiceInputManager.acquire('wakeword');
          if ('error' in grant) return;  // PTT won
          console.log('[wakeWord] detected', score);
          setState('listening');
          await audioRecorder.startRecording();
          // VAD timeout for WAKE-06 armed elsewhere (inside audio recorder or here).
        },
      });
      engineRef.current = engine;
      try {
        await engine.start(modelPaths);
      } catch (err) {
        console.error('[useWakeWord] start failed — degrading to PTT-only', err);
        // WAKE-08: graceful degradation. Surface to tray via broadcast.
      }
    };
    bootEngine();
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  // Suspend during non-idle (anti self-trigger)
  useEffect(() => {
    if (!engineRef.current) return;
    if (state === 'responding' || state === 'processing' || state === 'listening') {
      engineRef.current.suspend();
    } else if (state === 'idle') {
      engineRef.current.resume();
    }
  }, [state]);
}
```

**TTS wrap (`ttsPlayer.ts` modification):**

```typescript
// apps/desktop/src/renderer/src/audio/ttsPlayer.ts (MODIFY)
// Add hooks so wake word engine can register pause/resume callbacks.
// Keep current stopTTSPlayback behavior.

type TTSLifecycleHooks = {
  beforePlay?: () => Promise<void> | void;
  afterPlay?: () => Promise<void> | void;  // called with 300ms delay to absorb speaker tail
};

let hooks: TTSLifecycleHooks = {};

export function registerTTSHooks(h: TTSLifecycleHooks): void {
  hooks = h;
}

export async function playTTSResponse(base64: string, _format: 'mp3' | 'wav'): Promise<void> {
  await hooks.beforePlay?.();  // NEW: pause wake word

  // ... existing decode + play logic ...

  source.onended = () => {
    if (currentSource === source) currentSource = null;
    // NEW: resume wake word after speaker tail (300ms)
    setTimeout(() => { hooks.afterPlay?.(); }, 300);
  };
}
```

`useWakeWord` calls `registerTTSHooks({ beforePlay: () => engine.suspend(), afterPlay: () => engine.resume() })` on mount — but honestly the OrbContext gating in `useWakeWord` already covers this because orb state transitions to `responding` before TTS plays. The TTS wrap is **redundant belt-and-braces** for cases where the orb state machine races with TTS start. Locked decision by CONTEXT.md — keep both.

### Pattern 6: RMS Zero Guard (research-required topic d)

**O problema:** macOS e alguns setups de Linux retornam uma MediaStream "viva" de `getUserMedia` (track.readyState === 'live', track.muted === false) mas com todos os samples zero — sistema mudou default device, mic foi mutado no hardware, permission flag no TCC "not determined", etc. `[CITED: electron/electron#42714 + #29861 via PITFALLS.md pitfall #7]`. Usuário acha que está funcionando, wake word silenciosamente nunca detecta nada.

**Técnica:** Sliding window RMS sobre os últimos N chunks do worklet. Se RMS === 0 (ou < 1e-8) por mais que X ms consecutivos, flagger o stream como silenciado e disparar recovery.

```typescript
// apps/desktop/src/renderer/src/voice/wakeWord/rmsZeroGuard.ts
// Source: PITFALL #7 mitigation (PITFALLS.md lines 165-189)
// Technique: windowed RMS detection over 5s = 63 frames @ 12.5 Hz.

export interface RmsZeroGuardOptions {
  windowFrames: number;      // default 63 (~5s)
  epsilon: number;           // default 1e-8 (below this = effectively zero)
  onSilentStream: () => void;  // called exactly once when threshold crosses
}

export class RmsZeroGuard {
  private zeroStreakFrames = 0;
  private tripped = false;

  constructor(private opts: RmsZeroGuardOptions) {}

  /** Called for every AudioWorklet chunk (~12.5 Hz). */
  observe(chunk: Float32Array): void {
    if (this.tripped) return;
    let sumSq = 0;
    for (let i = 0; i < chunk.length; i++) sumSq += chunk[i] * chunk[i];
    const rms = Math.sqrt(sumSq / chunk.length);

    if (rms < this.opts.epsilon) {
      this.zeroStreakFrames++;
      if (this.zeroStreakFrames >= this.opts.windowFrames) {
        this.tripped = true;
        this.opts.onSilentStream();
      }
    } else {
      this.zeroStreakFrames = 0;  // reset on any non-zero frame
    }
  }

  reset(): void {
    this.zeroStreakFrames = 0;
    this.tripped = false;
  }
}
```

**Integration:** `WakeWordEngine.processChunk()` calls `this.rmsGuard.observe(chunk)` before mel inference. On `onSilentStream`, engine transitions to `degraded` state, broadcasts toast "Mic captando silêncio — verifique permissões do sistema" (WAKE-08 overlap), and calls `engine.stop()`. PTT continues working (doesn't depend on wakeword engine).

**Recovery action:** Wait 30s, reset guard, retry. If still silent after 3 cycles, give up until user manually toggles.

### Anti-Patterns to Avoid

- **Running wake word inference in main process with `onnxruntime-node`** → native binding + `postinstall` rebuild hell on Windows+Node 24 (per STATE.md v1.3 context). Also forces IPC per chunk = 12.5 Hz of renderer↔main → latency + complexity. **Use renderer + `onnxruntime-web`.** (ARCHITECTURE.md Anti-Pattern 1)
- **Adding an IPC round-trip for detection events** (`renderer detects → IPC main → IPC back`) → 2-10ms latency + race risk. The callback already lives in the renderer that owns the follow-up action (`setOrbState` + `startRecording`). **Call directly in-process.** (ARCHITECTURE.md Anti-Pattern 2)
- **Downloading models on first run from CDN** → violates privacy-first (WAKE-09), first-run fails offline. **Bundle via `extraResources`.** (ARCHITECTURE.md Anti-Pattern 3)
- **Bypassing `contextIsolation` "for simplicity"** → non-negotiable security posture in `main/index.ts` lines 53-57. **Preserve** `contextIsolation: true`, preload bridge pattern. (ARCHITECTURE.md Anti-Pattern 4)
- **Two independent `isRecording` flags** (PTT + wakeword) → race conditions, state corruption, double-trigger (PITFALL #3). **Single `VoiceInputManager`.**
- **Running inference in `setInterval(16ms)` on main thread** → 8-12% idle CPU, orb animation stutters (PITFALL #4). **AudioWorklet thread + VAD gate.**
- **Using `MediaRecorder` for wake word capture** → codec overhead, memory leak over hours (PITFALL #9, electron/electron#41123). **`AudioWorkletNode` emits raw Float32 PCM direto.**
- **Hardcoding `const THRESHOLD = 0.5`** → user can't tune for their voice/accent/environment (PITFALL #11). **Read from `import.meta.env.VITE_WAKE_WORD_THRESHOLD`** populated via electron-vite from root `.env`.
- **Destroying `AudioContext` on each `OrbContext` state change** → audio glitches + memory growth (PITFALLS.md "Creating new AudioContext per detection"). **Single AudioContext lifetime, use `suspend()`/`resume()`.**
- **Animating `filter: blur()`/`drop-shadow` on orb during wake word active** → GPU compositor 30%+ (PITFALL #10). Out of Phase 22 scope but relevant constraint for Phase 23.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ONNX inference runtime in browser | Custom WASM loader + tensor ops | `onnxruntime-web@1.24.3` | 138MB of packaged C++ ↔ WASM bindings, SIMD optimizations, maintained by Microsoft. Rolling from scratch = 6 months. |
| Wake word ML model | Train from scratch with synthetic TTS + pytorch | Pre-trained `hey_jarvis_v0.1.onnx` | openwakeword ships the model free. Custom training = 1 week + dataset + compute. Deferred to v1.5+ per CONTEXT.md. |
| Voice Activity Detection | Custom energy/zero-crossing-rate VAD | Bundled `silero_vad.onnx` | Silero VAD é state-of-art (<5% false accept em background noise), runs in same runtime, 1.5MB. Custom energy VAD = terrible at music/TV rejection. |
| Mel-spectrogram computation | Custom FFT + mel filterbank in JS | Bundled `melspectrogram.onnx` | openwakeword bundles mel as ONNX → runs in same optimized runtime as downstream models. Custom JS mel = 10-20x slower, accuracy drift vs training. |
| AudioWorklet processor | Polling `setInterval` on `AnalyserNode` | Native `AudioWorkletProcessor` | Worklet runs off-main-thread on dedicated audio rendering thread. `setInterval` in main thread = jank + inconsistent timing. |
| Microphone stream acquisition | Custom `naudiodon`/`sox` binding | `navigator.mediaDevices.getUserMedia` (Web Audio API nativa) | Permission dialog, device enumeration, sample rate negotiation tudo nativo do Chromium. Custom binding = build pain + reimplementar todo o stack. |
| Audio ring buffer | `Array.prototype.push` + `.slice` on each chunk | `Float32Array` + index mod | Native typed array + index arithmetic é zero-GC e cache-friendly. JS array + slice dispara GC churn @ 12.5 Hz. |
| Silent stream detection | Check `track.muted` flag | `RmsZeroGuard` (sliding RMS over chunks) | Chromium returns `muted: false` even when the stream has zero samples (PITFALL #7 — electron/electron#42714). Only sample-level RMS catches this. |
| Config persistence | Custom JSON file writes | `electron-store@11` (already installed) | Atomic writes, migration, schema validation — all done. Adding a second store = confusion. |
| Cross-platform packaging | Custom pkg script | `electron-builder` | De-facto standard, integrates with electron-vite. Custom packaging = no signing, no asar, no NSIS generation. |

**Key insight:** A phase inteira é "compor peças existentes corretamente", não "escrever algoritmos de ML". O único código "novo de algoritmo" é o `RmsZeroGuard` (~30 LOC) — tudo mais é glue code entre libs maduras.

## Runtime State Inventory

Phase 22 **não é** rename/refactor/migration de dados em disco — é adição de feature nova no renderer + refactor de código existente no main (`ptt-hotkey.ts`). Mesmo assim, faço o inventory explícito porque o refactor do VoiceInputManager tem implicações em estado runtime.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | `electron-store` JSON em `%APPDATA%/jarvis/config.json` (Windows). Schema atual: `hotkey?: { accelerator }`, `pttHotkey?: { accelerator }`. Nenhum campo de wake word ainda. | **Adicionar campo** `wakeWordEnabled?: boolean` (default `true`) no schema — nova key, zero risco de incompatibilidade com installs existentes (`store.get('wakeWordEnabled')` retorna `undefined` → fallback pro default). Sem migration necessária. |
| **Live service config** | Nenhum. JARVIS v1.3 não tem serviço externo que armazena config em UI remota (sem Datadog, sem Cloudflare, sem n8n). Backend TypeScript roda local via `pnpm dev:backend`. | **Nothing** — verified via grep em `pnpm-workspace.yaml` e `docker-compose.yml` (docker tem backend + chroma + gateway, sem wake word). |
| **OS-registered state** | `globalShortcut.register('CmdOrCtrl+Space')` do PTT — registrado no boot via `registerPttHotkey(mainWindow)`. Vive no processo Electron, morre quando app fecha. Tray icon registrado via `new Tray(iconPath)`. | **Nothing new** — refactor do `ptt-hotkey.ts` **NÃO** muda o que está registrado no OS, só muda a lógica interna do callback. O `globalShortcut` permanece igual. |
| **Secrets/env vars** | `.env` no workspace root contém `JARVIS_API_KEY` (mandatório, fail-fast em `main/index.ts:94`). Nada de wake word ainda. | **Adicionar novas vars** (opcionais, com defaults): `WAKE_WORD_ENABLED=true`, `WAKE_WORD_THRESHOLD=0.5`, `WAKE_WORD_VAD_TIMEOUT_MS=3000`, `WAKE_WORD_MODEL=hey_jarvis_v0.1`. Populadas no renderer via electron-vite prefix `VITE_*` — ajustar names em `.env.example` e documentar em README. Sem secret novo. |
| **Build artifacts / installed packages** | `apps/desktop/dist/{main,preload,renderer}/` gerado por electron-vite. **Nenhum `release/` ainda** — v1.3 não empacotava distributables. `node_modules/.pnpm/onnxruntime-web@1.24.3` vai ser criado pelo `pnpm add`. | **Novo:** `apps/desktop/release/` (primeira vez que electron-builder roda). Adicionar ao `.gitignore` se não estiver. **Verificar** que `apps/desktop/dist/` está gitignored (está — confirmado). |

**A canonical question (rename/refactor):** Após todo arquivo de código do repo estar atualizado com `VoiceInputManager`, que sistema runtime ainda carrega o comportamento antigo?

**Resposta:** Nenhum — `ptt-hotkey.ts` é processo-interno e morre com o app. Primeira restart após merge já corre o código novo. **Mas** há uma sutileza: usuários que já tinham `%APPDATA%/jarvis/config.json` com `pttHotkey` customizado continuam funcionando (o refactor preserva schema). Zero migration necessária.

## Common Pitfalls

> Extração dos 12 pitfalls documentados em `.planning/research/PITFALLS.md` que são **específicos de Phase 22**. Pitfalls de Phase 23 (orb animation GPU, etc.) omitidos.

### Pitfall 1: PTT ↔ WakeWord Double-Trigger (PITFALL #3, CRITICAL)
**What goes wrong:** `ptt-hotkey.ts` tem `let isRecording = false;` module-local. Adicionar wake word = segundo writer sem mutex → dois `MediaRecorder` no mesmo stream, um mata tracks do outro, backend recebe audio truncado/vazio.
**Why it happens:** Classic race de add-new-actor a implicit-single-writer state.
**How to avoid:** `VoiceInputManager` singleton como **primeiro commit** da phase, ANTES de qualquer linha de wake word code. PTT delega acquire/release via manager. WakeWord idem. Policy: PTT preempta WakeWord; WakeWord rejeitado se PTT ativo.
**Warning signs:** Logs `[PTT] Starting recording` + `[WakeWord] Starting recording` dentro de 100ms; orb preso em `listening`; `stopRecording called but not recording` warning.
**Mitigation commit:** Bloco 1 do plano.

### Pitfall 2: TTS Self-Trigger Feedback Loop (PITFALL #2)
**What goes wrong:** LLM gera resposta com "hey JARVIS" embutido → TTS fala → mic captura → wake word re-dispara → captura TTS próprio → STT → garbage → LLM responde de novo → loop.
**Why it happens:** Wake word engine não tem noção de "quem fala". Microfone de desktop pega speaker direto (sem AEC dedicado).
**How to avoid:** Gate por `OrbContext === 'idle'` (único source of truth). `useWakeWord` suspend engine em transições para `listening`/`processing`/`responding`. Belt-and-braces: TTS player `beforePlay → engine.suspend()`, `afterPlay + 300ms → engine.resume()`. **Não tentar AEC em software** — WebRTC AEC do Chromium é não-confiável para não-call audio + adiciona latência.
**Warning signs:** Detection timestamp dentro da janela de playback TTS; STT transcript contendo resposta anterior do JARVIS verbatim; orb flicker `responding → listening → responding` no mesmo turn.
**Mitigation commit:** Bloco 3 do plano (gating + TTS wrap).

### Pitfall 3: Always-On Inference CPU Drain (PITFALL #4, BLOCKING SUCCESS CRITERION)
**What goes wrong:** Inference em hot loop @ 60Hz no main thread → 8-12% CPU idle → fan kicks in → battery 50% → user disables feature → phase goal falhou.
**Why it happens:** Ingenuidade: `setInterval(16ms)` in main thread, `ort.env.wasm.numThreads = navigator.hardwareConcurrency`, no VAD gate.
**How to avoid (all 5 must be true):**
1. Inference em AudioWorklet thread (jamais main thread)
2. Cadência ~12.5 Hz (80ms frames), não 60 Hz
3. `ort.env.wasm.numThreads = 1`
4. Silero VAD pre-filter com threshold 0.3 (pula classifier em silêncio, -90% CPU idle)
5. Benchmark `<2% CPU sustained após 10min silêncio em laptop 4-core` **antes** de marcar phase done.
**Warning signs:** `process.getCPUUsage().percentCPUUsage > 0.05` após 30s silêncio; orb idle-pulse drop abaixo de 60 FPS.
**Mitigation commit:** Bloco 2 (implementação) + Bloco 3 (validação empírica antes de merge).

### Pitfall 4: ONNX Models Não Empacotados no Artifact (PITFALL #5)
**What goes wrong:** `pnpm dev` funciona, `pnpm build && electron-builder` gera `.exe`, instala, crash `ENOENT: no such file hey_jarvis_v0.1.onnx`.
**Why it happens:** Default asar mete tudo em archive; renderer `fetch('/wakeword-models/...')` falha porque path resolve dentro de asar; ou `asarUnpack` glob deixa em path diferente do esperado.
**How to avoid:** `extraResources` em `electron-builder.yml` (não `asarUnpack`). Runtime path resolver usa `app.isPackaged ? process.resourcesPath : devPath`. **Não** usar `import model from './model.onnx?url'` (Vite fingerprints filename). Post-build smoke test: `unzip -l release/*.{exe,AppImage,dmg} | grep wakeword-models` falha build se ausente.
**Warning signs:** `fs.existsSync(modelPath)` works in dev, fails after `pnpm build && electron-builder`; installer size grew < 1MB after adding models (models went into asar).
**Mitigation commit:** Bloco 3 (electron-builder setup) + validation step "run packaged artifact on clean VM".

### Pitfall 5: False Negatives — Modelo Não Ouve em Voz Natural (PITFALL #11)
**What goes wrong:** User fala "hey jarvis" normalmente enquanto passa pela mesa → nada. Fala mais alto → nada. Só dispara gritando em voz de robô.
**Why it happens:** Threshold alto demais por medo de falsos positivos; modelo treinado em inglês americano + studio; user com sotaque pt-BR; distância do mic; ambiente ruidoso.
**How to avoid:** Threshold default 0.5 (sensível — já decidido em CONTEXT.md). Silero VAD threshold 0.3 (generoso — favorece ouvir). Log score de toda detection attempt opcional (`VITE_WAKE_WORD_DEBUG=true`) pra user ajustar threshold via `.env` baseado em dados reais. **Não** promessa de 99% — é assistente pessoal, tunar pra um usuário.
**Warning signs:** User diz "hey jarvis" 3x, orb flicker 1x; debug log scores consistentemente 0.3-0.45.
**Mitigation commit:** Bloco 2 (default threshold) + documentação em `.env.example`.

### Pitfall 6: False Positives — TV/Música Dispara Detector (PITFALL #12)
**What goes wrong:** User vê YouTube → música dispara "hey jarvis" → orb listening → captura audio do vídeo → STT garbage → LLM responde nonsense → user desabilita.
**Why it happens:** Modelos treinados em speech-vs-silence; música e TV são speech com acoustic properties diferentes que ocasionalmente matcham template.
**How to avoid:** (1) Silero VAD pre-filter (já coberto em Pitfall 3). (2) OrbContext gating garante que dispara a ação só em idle — se o pipeline já está processando, ignore. (3) Debounce 2000ms evita re-trigger rápido. (4) **Custom verifier model (user voice fingerprint)** é solução de longo prazo — deferida pra Phase 23 ou v1.5 per CONTEXT.md. (5) Teste adversarial: rodar detector contra 10min de YouTube+Spotify random, target <2 false positives.
**Warning signs:** Orb flipa para listening sem user falar; STT transcript contém letras de música.
**Mitigation commit:** Bloco 3 (validação empírica via adversarial audio).

### Pitfall 7: Silent Stream — getUserMedia Retorna Stream Vivo Mas Zerado (PITFALL #7)
**What goes wrong:** `getUserMedia` resolve, track está 'live' e 'unmuted', mas samples são todos zero. Usuário acha que funciona, wake word silenciosamente morto.
**Why it happens:** macOS TCC permission "not determined" retorna stream fantasma (electron#42714); Linux default device mudou; hardware mic mute switch; Windows privacy flag.
**How to avoid:** `RmsZeroGuard` — sliding RMS sobre 63 chunks (~5s). Se tripped, broadcast toast "Mic captando silêncio" + graceful degrade para PTT-only. **Não** confiar em `track.muted` flag. Testar approach em environment onde dá pra mutar mic mid-session via OS setting.
**Warning signs:** Wake word engine logs 0 detections in 10min conversation; `sumSq === 0` for 10+ consecutive frames.
**Mitigation commit:** Bloco 2 (guard implementation) + Bloco 3 (integration com degrade path).

### Pitfall 8: MediaRecorder Memory Leak em Sessão Longa (PITFALL #9)
**What goes wrong:** `useAudioRecorder` usa `MediaRecorder` para PTT (existente, funciona). Wake word ia cair em tentação de usar o mesmo → renderer memory grows 200MB → 1.2GB em 8h → crash.
**Why it happens:** MediaRecorder keeps internal buffers alive even after `stop()` if refs dangling (electron#41123). Codec overhead. Continuous recording without `requestData()` acumula.
**How to avoid:** **Wake word NÃO usa MediaRecorder.** Usa `AudioWorkletNode` que emite Float32 PCM direto — zero codec, zero encoding pipeline. PTT mantém MediaRecorder (short-burst, não é o problema). Share MediaStream entre wake word worklet e PTT se possível (mesmo stream, múltiplos consumers). Explicit cleanup em `engine.stop()`.
**Warning signs:** Renderer RSS cresce linearmente; Chrome DevTools Memory snapshot > 100 MediaStreamTrack instances.
**Mitigation commit:** Baked into Bloco 2 architecture (never touches MediaRecorder para wake word).

### Pitfall 9: electron-builder Não Existe no Repo Ainda
**What goes wrong:** Plan assume que electron-builder está disponível, mas `grep electron-builder package.json → 0 matches`. v1.3 fazia `pnpm build` (electron-vite compile), não empacotava `.exe`/`.dmg`. Primeira vez que alguém roda `npx electron-builder` sem config → nitpicks, defaults errados, asar tudo.
**Why it happens:** v1.3 era CLI + dev-only, não precisava empacotar artifact final. Phase 22 é a primeira que precisa do installer (pro `extraResources` funcionar e WAKE-01 funcionar em produção).
**How to avoid:** Bloco 3 do plan DEVE incluir: (1) `pnpm --filter @jarvis/desktop add -D electron-builder`; (2) criar `apps/desktop/electron-builder.yml` com appId, extraResources, asar: true, targets Windows nsis + macOS dmg + Linux AppImage; (3) adicionar `pnpm --filter @jarvis/desktop build:dist` script; (4) primeiro build full em clean VM (Windows, no mínimo — macOS/Linux deferred); (5) instalar e verificar wake word funciona em produção (não apenas dev).
**Warning signs:** `grep electron-builder apps/desktop/package.json → empty`; `pnpm build` doesn't produce `.exe`; wake word só foi testado em `pnpm dev`.
**Mitigation commit:** Bloco 3 tarefa específica "adicionar electron-builder ao monorepo".

### Pitfall 10: Vite Não Serve o AudioWorklet (research topic a, minor)
**What goes wrong:** Worklet em `src/voice/wakeWord/wakeWordWorklet.ts` → Vite tenta transpilar → TS transform quebra AudioWorkletGlobalScope; ou bundles em main JS → não carregável via `addModule()`.
**Why it happens:** AudioWorkletProcessor não é ESM module; vive em escopo isolado sem imports; deve ser servido como `.js` standalone.
**How to avoid:** Arquivo em `apps/desktop/src/renderer/public/wakeWordWorklet.js` (note: `public/`, **`.js` não `.ts`**) → Vite copia verbatim para `dist/renderer/` → `addModule('/wakeWordWorklet.js')` acessa via string path. **Não** usar `import worklet from './wakeWordWorklet.ts?url'`.
**Warning signs:** `DOMException: The user aborted a request` ao chamar `addModule`; 404 no network tab Dev Tools; worklet `.js` não aparece em `dist/renderer/` após build.
**Mitigation commit:** Bloco 2 architecture decision (nail location do arquivo).

## Code Examples

Todos os code examples acima (WakeWordEngine, useWakeWord, wakeWordWorklet, VoiceInputManager contract, RmsZeroGuard, electron-builder.yml, resources.ts) são ilustrativos, não final code. Eles vêm de:

- `[CITED: .planning/research/ARCHITECTURE.md lines 187-247]` — WakeWordEngine sketch
- `[CITED: .planning/research/ARCHITECTURE.md lines 336-360]` — useWakeWord sketch
- `[CITED: https://github.com/dnavarrom/openwakeword_wasm]` — frame size 1280, cooldown 2000ms, threshold 0.55 defaults (adjusted para 0.5 por CONTEXT.md)
- `[CITED: https://www.electron.build/configuration/contents]` — extraResources spec
- `[CITED: https://electron-vite.org/guide/assets]` — public/ dir handling
- `[VERIFIED: /root/jarvis/apps/desktop/src/main/ptt-hotkey.ts]` — existing PTT pattern being refactored

O plano vai refinar assinaturas, imports, e test coverage.

## State of the Art

| Old Approach (v1.0 Python) | Current Approach (v1.4 TypeScript) | When Changed | Impact |
|----------------------------|------------------------------------|--------------|--------|
| openwakeword Python lib + PulseAudio subprocess | `onnxruntime-web` + same .onnx models + Chromium Web Audio | v1.3 cutover 2026-04-10 removeu Python | Wake word rodava via `openwakeword` Python class → stack TS agora usa os **mesmos modelos ONNX** mas no Chromium do Electron renderer. Zero binário nativo, zero `node-gyp`. |
| `MediaRecorder` (PTT v1.2) | `AudioWorklet` + `MediaRecorder` híbrido | Phase 22 | Wake word usa worklet raw PCM. PTT mantém MediaRecorder (short burst upload). Dois caminhos coexistem via `VoiceInputManager`. |
| Single-actor mic ownership (`ptt-hotkey.ts`) | Multi-actor via singleton manager | Phase 22 Block 1 | Prerequisito absoluto. Quebrar ordem = pitfall em prod. |
| No packaging (v1.3 dev-only) | `electron-builder` + `extraResources` | Phase 22 Block 3 | Primeira phase que produz artifact distribuível. Phase 23 herda o setup. |

**Deprecated / outdated:**

- `bumblebee-hotword-node` — Porcupine-derivado, banido por CLAUDE.md, README explícito "NOT for Electron", depende de `sox` CLI (descontinuado 2021).
- `snowboy` — descontinuado 2020 por KITT.AI.
- `@picovoice/porcupine-node` — requer AccessKey (viola privacy).
- `openai/whisper` (Python original) — substituído por `nodejs-whisper` em v1.3 (não é escopo Phase 22, mas relevante pra handoff pós-wake).
- `pyttsx3` — stack Python antigo, substituído por backend TTS (`/api/chat/audio` retorna `audioBase64`).
- v1.0 `CONV-05` (wake word Python) — removido em v1.3, sendo re-implementado como WAKE-* em v1.4 Phase 22.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `electron-builder` versão 26.x (latest) é compatível com `electron@41.1.1` | Standard Stack | Baixo — electron-builder costuma suportar Electron +/- 5 versões. Primeira tarefa do plano: `npm view electron-builder version` + verificar changelog. |
| A2 | URLs de download dos 4 ONNX models em `huggingface.co/davidscripka/openwakeword/resolve/main/*.onnx` são canônicas | Standard Stack / Assets | Médio — HuggingFace webfetch retornou HTML parcial. Primeira tarefa do plano: `curl -I` em cada URL. Fallback: GitHub releases de `dscripka/openWakeWord`. |
| A3 | Modelo `hey_jarvis_v0.1.onnx` consome embedding com shape `[1, 76, 96]` (76 frames de contexto, 96-dim embedding) | Pattern 2 code sketch | Médio — baseado em leitura do openwakeword Python `__init__.py`. Validar na primeira inference de teste com áudio sintético antes de wire-up live. Se shape for diferente, ajustar `embeddingRing` buffer size. |
| A4 | `fetch('file://...')` bloqueado por `webSecurity: true` no Electron renderer → precisa usar IPC read-and-transfer | Pattern 4 | Alto — se estiver errado, approach 1 (IPC) é unnecessary complexity. Validar com proof-of-concept de 10min: tentar `ort.InferenceSession.create('file://path/model.onnx')` em dev. Se funcionar, pular approach 1 e usar URL direto. |
| A5 | AudioWorklet em `public/wakeWordWorklet.js` é servido corretamente tanto por `electron-vite dev` quanto por asar em produção | Pattern 3 | Médio — documentado em electron-vite docs mas caminho específico pra Electron+Vite+AudioWorklet não foi reproduzido nesta pesquisa. Mitigação: POC cedo no Bloco 2. |
| A6 | Default CSP do Electron permite `audioWorklet.addModule` de same-origin file:// sem `worker-src 'self' blob:` | Pattern 3 fallback | Baixo — CSP default é "nothing" (permissivo). Só crítico se Phase 22 introduzir CSP restritivo. Verificar `session.defaultSession.webRequest` headers no boot. |
| A7 | CPU budget `<2% sustained 10min silêncio em 4-core` é alcançável com VAD + single-thread WASM + SIMD | Pitfall 3 | Alto — blocking criterion. Benchmark cedo no Bloco 2. Se >2%, plano precisa mitigação extra (reduzir cadência de mel/embed? dynamic sleeping?). |
| A8 | Wake word engine rodando no Electron com `backgroundThrottling: false` mantém latência <500ms mesmo com janela oculta por `Ctrl+Shift+J` | WAKE-01 | Médio — docs dizem que flag funciona, mas workflow real (oculta janela → fala "hey jarvis" → esperado 500ms) precisa teste empírico. |
| A9 | `electron-store@11` suporta adicionar campo novo no schema sem migration code | Runtime State Inventory | Baixo — `store.get(key)` retorna `undefined` se missing, default aplicado pelo getter. Padrão já usado no `pttHotkey` field. |
| A10 | Threshold 0.5 + VAD 0.3 dá detection rate suficiente para fechar WAKE-01 no primeiro commit | Pitfall 5 mitigation | Médio — calibrado em dataset default do openwakeword. Usuário real (pt-BR accent, laptop mic) pode precisar ajustar via `.env`. **Não é blocker** — escape hatch está nos env vars. |

**Nota ao planner e discuss-phase:** Os assumptions A4 e A7 são os de maior risco. Ambos demandam POC empírico no início de Bloco 2 antes de commitar a arquitetura. Se A4 for false, simplifica o bridging (direct URL em vez de IPC). Se A7 for false, bloqueia toda a phase e exige mitigação maior.

## Open Questions

1. **A7: CPU budget <2% é realmente alcançável em 4-core com as mitigações atuais?**
   - What we know: VAD gate corta ~90% CPU em silêncio; single-thread WASM + SIMD é configuração mais baixa; cadência 12.5 Hz (não 60).
   - What's unclear: Chromium overhead + Electron window lifecycle + React renderer idle custs podem somar um baseline maior. Deep Core Labs blog cita "~2-5%" sem clarity sobre hardware.
   - Recommendation: **POC no Bloco 2, step 1** — rodar só o mel+embed+VAD pipeline por 10min em silêncio, medir `process.getCPUUsage()`. Se <2%, OK. Se 2-4%, ajustar e re-medir. Se >4%, escalate pra discuss-phase sobre reduzir cadência ou usar `requestIdleCallback`.

2. **A4: `ort.InferenceSession.create('file:///absolute/path/to/model.onnx')` funciona em Electron renderer?**
   - What we know: `onnxruntime-web` usa `fetch()` internamente; Chromium permite `fetch('file://...')` quando `webSecurity: false` ou quando origem é `file://`.
   - What's unclear: Quando renderer carrega via `http://localhost:5173` (dev) vs `file:///` (produção asar), `fetch('file://...')` pode falhar por CORS/same-origin em dev.
   - Recommendation: **POC 10min** — tentar o caminho mais direto primeiro, cair pro IPC read-and-transfer se falhar.

3. **Cold start latency dos 4 modelos: 500ms ou 2000ms?** (Open Question herdada de STATE.md #1)
   - What we know: 4 arquivos totalizando ~4 MB; `ort.InferenceSession.create` faz parse + graph build; blog posts estimam "500-1000ms".
   - What's unclear: Varia muito por hardware; Electron 41 uses Chromium 131+ (novo WASM compile cache).
   - Recommendation: Medir no POC. Se <1s, lazy load na mount do `useWakeWord`. Se >1s, preload durante `ready-to-show` do main window (main process reads the files + passes ArrayBuffers pre-loaded via preload).

4. **Como medir CPU sustained de forma confiável sem `process.getCPUUsage()` drift?**
   - What we know: `process.getCPUUsage()` retorna `{ percentCPUUsage, idleWakeupsPerSecond }` — mas a média é sobre toda vida do processo, não últimos X segundos.
   - What's unclear: Precisa de sliding window customizada ou ferramenta externa (Task Manager Windows, `top` Linux) para medir "sustained 10min".
   - Recommendation: Sliding average — amostrar `process.getCPUUsage()` a cada 10s, calcular delta, média móvel. Ou usar `perfetto`/Chrome Tracing para janela exata.

5. **A3: Shape exato do input do `hey_jarvis_v0.1.onnx` classifier**
   - What we know: openwakeword usa embedding context de ~76 frames; dim 96 per frame é typical.
   - What's unclear: Sem verificar com `netron` ou lendo o model metadata, pode ser `[76, 96]` ou `[1, 76, 96]` ou `[76, 1, 96]`.
   - Recommendation: Primeiro modelo load imprime `session.inputNames` e `session.inputMetadata` pra log. Ajustar tensor shape baseado na output.

## Environment Availability

> Phase 22 depende de 3 tools externos na pipeline dev:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| **Node.js** | electron-vite, pnpm, todos os scripts | ✓ `[VERIFIED: /root/jarvis/package.json engines.node → >=22]` | Node 22 LTS | — |
| **pnpm** | monorepo package management | ✓ `[VERIFIED: package.json engines.pnpm → >=10]` | pnpm 10 | — |
| **npm registry** | `pnpm add onnxruntime-web electron-builder` | ✓ `[VERIFIED: npm view onnxruntime-web → 1.24.3]` | online | Usar tarball local se offline (unlikely) |
| **curl / wget** | baixar 4 `.onnx` models do HuggingFace | Assumed ✓ (standard on dev machines) | — | `node -e "require('https').get(...)"` fallback |
| **Electron** | runtime | ✓ `[VERIFIED: apps/desktop/package.json → electron ^41.1.1]` | 41.1.1 | — |
| **Chromium (via Electron)** | AudioWorklet, onnxruntime-web WASM, getUserMedia | ✓ (bundled in Electron 41 = Chromium ~131+) | ~131+ | — |
| **Microphone hardware** | WAKE-01, WAKE-06, WAKE-07 live testing | ✓ user-dependent | — | Sem mic = PTT-only (WAKE-08 already handles) |
| **electron-builder** (dev dep) | Bloco 3 — build distributable | ✗ **MISSING** | — | **Task 1 of Block 3:** `pnpm --filter @jarvis/desktop add -D electron-builder` |
| **NSIS** (Windows installer builder) | electron-builder Windows target | ✗ — auto-installed by electron-builder on first run | — | electron-builder downloads NSIS automaticamente |
| **Clean Windows VM** | smoke test packaged `.exe` para validar `extraResources` | Assumed ✓ (user Windows dev box) | — | Test in dev shell `pnpm start` com `NODE_ENV=production` como approximation (menos fiel) |

**Missing dependencies with no fallback:** Nenhum bloqueador absoluto.

**Missing dependencies with fallback:**
- `electron-builder` — Tarefa 1 do Bloco 3 instala. Zero risco (é pacote npm puro).

## Validation Architecture

> Nyquist validation enabled (`.planning/config.json` → `workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.2` + `happy-dom@20.8.9` |
| Config file | `apps/desktop/vitest.config.ts` |
| Quick run command | `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/wakeWord/__tests__/` |
| Full suite command | `pnpm --filter @jarvis/desktop test --run` |
| E2E harness | — (nenhum Playwright/Spectron configurado; smoke tests manuais via `pnpm start` após `pnpm build`) |
| Perf benchmark | `process.getCPUUsage()` sampling em script custom (Bloco 3) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **WAKE-01** | `onDetected` dispara `OrbContext.setState('listening')` via `useWakeWord` quando mock engine emite score > 0.5 | unit (vitest + happy-dom) | `pnpm --filter @jarvis/desktop test -- useWakeWord.test.ts` | ❌ Wave 0 (new file) |
| **WAKE-01** | Latência detection → orb state ≤500ms end-to-end | manual smoke | Run `pnpm dev`, fala "Hey JARVIS", cronometrar orb transition | n/a (manual) |
| **WAKE-05** | Após OrbContext transição `responding → idle`, engine.resume() é chamado | unit | `useWakeWord.test.ts` assertion: `spy(engine.resume).toHaveBeenCalled()` on state change | ❌ Wave 0 |
| **WAKE-05** | Full cycle: wake → listening → processing → responding → idle → wake again funcional | integration (manual) | Manual smoke test script | n/a |
| **WAKE-06** | VAD timeout 3000ms aborta `useAudioRecorder.startRecording()` e volta orb para idle | unit (fake timers) | `pnpm --filter @jarvis/desktop test -- useWakeWord.test.ts -t "VAD timeout"` | ❌ Wave 0 |
| **WAKE-06** | Configurável via `VITE_WAKE_WORD_VAD_TIMEOUT_MS` | unit | mock `import.meta.env`, assert engine is instantiated with provided value | ❌ Wave 0 |
| **WAKE-07** | `voiceInputManager.acquire('ptt')` preempta `'wakeword'` ativo | unit | `voiceInputManager.test.ts` — test table: `{pre: null, action: 'acquire-wakeword', post: 'wakeword'}`, `{pre: 'wakeword', action: 'acquire-ptt', post: 'ptt'}`, `{pre: 'ptt', action: 'acquire-wakeword', post: 'ptt'}` | ❌ Wave 0 |
| **WAKE-07** | `voiceInputManager.release('ptt')` é no-op se currentSource === 'wakeword' | unit | same file, additional test | ❌ Wave 0 |
| **WAKE-07** | `ptt-hotkey.ts` refactor preserva behavior — PTT callback ainda dispara `startRecording` via manager | unit | `ptt-hotkey.test.ts` (novo — spec do refactor) + existing E2E chat do v1.2 ainda passa | ⚠️ partial — tests existentes de PTT do v1.2 não cobrem internals |
| **WAKE-08** | `engine.start()` throw (NotAllowedError) → `useWakeWord` captura, state 'unavailable', PTT continua funcionando | unit | mock `navigator.mediaDevices.getUserMedia` rejeita, assert no crash + tray broadcast | ❌ Wave 0 |
| **WAKE-08** | `RmsZeroGuard` trip após 63 frames zero → engine.stop() + graceful message | unit | `rmsZeroGuard.test.ts` — feed 63 zero arrays, assert callback called exactly once | ❌ Wave 0 |
| **WAKE-09** | **No network call** from WakeWordEngine module during full test run | unit | `WakeWordEngine.test.ts` — mock `fetch` global, assert calls only to `file://` or blob URLs | ❌ Wave 0 |
| **WAKE-09** | CI grep ban: lockfile doesn't contain porcupine/picovoice/bumblebee-hotword | CI smoke | `grep -E "porcupine\|picovoice\|bumblebee-hotword" pnpm-lock.yaml && exit 1 \|\| exit 0` (expected exit 0) | ⚠️ Needs CI workflow addition |
| **CPU budget <2%** | Sustained 10min silence on 4-core laptop | perf (manual) | Script: `node scripts/cpu-benchmark-wakeword.mjs` que roda engine por 10min e amostra `process.getCPUUsage()` a cada 10s. Pass if avg delta < 2%. | ❌ Wave 0 (new script) |
| **extraResources packaging** | `release/JARVIS-*.exe` contains `resources/wakeword-models/*.onnx` | build smoke | `pnpm --filter @jarvis/desktop build:dist && ls release/win-unpacked/resources/wakeword-models/*.onnx \| wc -l` (expected 4) | ❌ Wave 0 |
| **CSP / contextIsolation preserved** | BrowserWindow config still has `contextIsolation: true, nodeIntegration: false, sandbox: true` | unit | existing `main/index.test.ts` (se existe) or new test asserting webPreferences shape | ⚠️ Verify existing |
| **Model load cold start <2s** | `modelLoader.loadAll()` resolves in <2000ms | perf (auto) | timer in vitest test: `expect(Date.now() - start).toBeLessThan(2000)` | ❌ Wave 0 |
| **TTS self-trigger regression** | Pipe TTS audio back into WakeWordEngine while `state === 'responding'`, assert zero detection events | integration | `wakeWord.selfTrigger.test.ts` — synthesize 5s of TTS audio, force state = responding, assert no onDetected | ❌ Wave 0 (synthetic audio expensive to prep) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/` (quick feedback, <30s)
- **Per wave merge:** `pnpm --filter @jarvis/desktop test --run` (full desktop suite)
- **Phase gate (`/gsd:verify-work`):** Full monorepo suite `pnpm test` + CPU benchmark script + manual smoke (wake word fires in `pnpm dev`, survives full cycle, survives PTT preemption) + packaged `.exe` smoke in clean shell

### Wave 0 Gaps

Tests/infra que precisam ser criados ANTES de implementação (Wave 0):

- [ ] `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` — mock ort.InferenceSession, assert pipeline order + threshold gate
- [ ] `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts` — assert load order + error handling
- [ ] `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts` — sliding window trip logic
- [ ] `apps/desktop/src/renderer/src/voice/__tests__/voiceInputManager.test.ts` — state machine table tests (9 scenarios)
- [ ] `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — React Testing Library + happy-dom, state gating
- [ ] `apps/desktop/src/main/__tests__/ptt-hotkey.test.ts` — refactor spec (nova ou expandida — confirmar se existe)
- [ ] `apps/desktop/scripts/cpu-benchmark-wakeword.mjs` — standalone node script, spawns Electron in headless mode, runs engine, logs CPU deltas
- [ ] `apps/desktop/scripts/smoke-packaged-build.sh` — post-`electron-builder` assertion that `.exe`/`.AppImage` contains the 4 `.onnx` files
- [ ] `apps/desktop/electron-builder.yml` — packaging config (Pattern 4)
- [ ] `apps/desktop/resources/wakeword-models/.gitkeep` + LICENSE-models.txt — dir placeholder (models em si NÃO commitados; baixados via install script)
- [ ] `scripts/download-wakeword-models.sh` (ou `.mjs`) — idempotent download + checksum verification, chamado pelo `postinstall` do desktop package
- [ ] CI workflow addition (se CI existe): `grep -E "porcupine\|picovoice\|bumblebee-hotword" pnpm-lock.yaml && exit 1`

### Validation Invariants (Nyquist sampling)

Invariantes que qualquer test/assertion deve manter verdadeiro:

1. **Single-writer mic action:** em qualquer momento `voiceInputManager.getCurrentSource()` retorna no máximo um valor de `{'ptt', 'wakeword', null}`. Nunca dois ativos.
2. **OrbContext é source of truth:** wake word engine **lê** mas nunca **escreve** diretamente; sempre via `setOrbState`.
3. **No MediaRecorder no wake word:** grep em `src/voice/wakeWord/` não deve achar `MediaRecorder`.
4. **No fetch to non-file URLs from wake word module:** mock `global.fetch` no test, assert calls só a `file://` ou blob URLs.
5. **`ort.env.wasm.numThreads === 1`** em todos os contextos (prevenir regressão acidental para multi-thread que exigiria crossOriginIsolated).
6. **`contextIsolation: true` preservado** — asserção no test do BrowserWindow config.
7. **CPU sustained budget:** sliding window 10min < 2% (perf test, não unit).
8. **Debounce 2000ms respeitado:** dois `onDetected` calls em <2000ms contam como um (test com fake timer).
9. **Silero VAD gate:** `score = 0` output em silêncio → classifier não é chamado (spy assertion).
10. **Graceful degradation:** qualquer error path em `engine.start()` **nunca** throws pra cima de `useWakeWord` — sempre capturado e broadcast como tray status.

## Security Domain

> Phase 22 envolve captura de mic sempre-on + carregamento de modelos ML + IPC bridge. Applicable security controls abaixo.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Desktop single-user, sem auth layer nesta phase. Backend já tem `JARVIS_API_KEY` (fail-fast em main/index.ts:94) — preservado. |
| V3 Session Management | no | N/A — sem sessions no desktop. |
| V4 Access Control | yes | OS-level mic permission dialog (cross-platform: getUserMedia trigger); `contextIsolation: true` + `sandbox: true` preservam isolation renderer↔main. |
| V5 Input Validation | yes | Audio chunks do worklet são typed Float32Array — no string injection. Model paths do IPC são validados em main (nunca aceitar caminho do renderer). |
| V6 Cryptography | no | Zero crypto novo. Preservar `JARVIS_API_KEY` para backend. |
| V7 Error Handling | yes | Todo erro em wake word é capturado — nunca propaga para main process; degrada para PTT-only. |
| V12 File & Resources | yes | Model files carregados via **main process** (`fs.readFile`) ou `file://` com path validado. Nunca passar path user-controlled. |

### Known Threat Patterns for Electron Renderer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer exfiltrates captured audio to cloud | Information Disclosure | **Privacy-first hard constraint** — CI grep ban em Porcupine/Picovoice; `fetch` mock assertion no test (invariant #4); no AccessKey ever. |
| Malicious `.onnx` file swapped → arbitrary code execution via onnxruntime bug | Tampering | Bundle models via `extraResources` (read-only no asar-adjacent `resources/`). Post-install checksum verification via `download-wakeword-models.sh`. |
| IPC channel `wakeWord:get-model-paths` abused by compromised renderer to read arbitrary files | Information Disclosure / Privilege Escalation | Main handler returns **hardcoded** path from `app.isPackaged ? resourcesPath : devPath` — never takes args from renderer. |
| TTS self-trigger loop used for audio injection / amplification | Denial of Service | OrbContext gating + 300ms tail + debounce 2000ms (Pattern 5, Pitfall 2). |
| Wake word capture during screen lock → private conversation leak | Information Disclosure | `powerMonitor.on('lock-screen')` → engine.suspend(). **Não é parte do escopo Phase 22** — adicionar como follow-up em Phase 23 ou v1.5 (documented in Runtime State Inventory as "nothing found in OS-registered state"). |
| Silent mic failure → user believes feature works, privacy perception broken | Integrity / Trust | `RmsZeroGuard` (Pattern 6). |

**Non-applicable threats (for this phase):** SQL injection (no DB writes), XSS (no HTML injection in wake word path), CSRF (no HTTP requests from wake word module), JWT bypass (no auth).

**Phase 22 is NOT introducing new network surface.** Backend continues receiving `/api/chat/audio` via existing JARVIS_API_KEY-authenticated path. Wake word module never talks to network.

## Sources

### Primary (HIGH confidence)

- `[VERIFIED: /root/jarvis/apps/desktop/src/main/ptt-hotkey.ts]` — leitura direta do arquivo a refatorar, `let isRecording = false;` module-local confirmado line 18
- `[VERIFIED: /root/jarvis/apps/desktop/package.json]` — stack atual: electron 41.1.1, react 19.2.4, vite 6, electron-vite 5, vitest 4.1.2, zero onnxruntime-web instalado
- `[VERIFIED: /root/jarvis/apps/desktop/electron.vite.config.ts]` — `public/` handling in renderer block, `externalizeDepsPlugin` in main/preload
- `[VERIFIED: /root/jarvis/apps/desktop/src/main/index.ts]` — BrowserWindow config atual; **confirma que `backgroundThrottling` NÃO está setada** (default Chromium = throttle hidden windows)
- `[VERIFIED: /root/jarvis/apps/desktop/src/renderer/hooks/useAudioRecorder.ts]` — pattern atual de MediaRecorder + getUserMedia
- `[VERIFIED: /root/jarvis/apps/desktop/src/renderer/components/Orb/OrbContext.tsx]` — 4-state machine (`idle|listening|processing|responding`) confirmado
- `[VERIFIED: /root/jarvis/apps/desktop/src/renderer/src/audio/ttsPlayer.ts]` — AudioContext singleton + onended callback (ponto de inserção das hooks beforePlay/afterPlay)
- `[VERIFIED: /root/jarvis/apps/desktop/src/main/store.ts]` — electron-store schema extensibility pattern
- `[VERIFIED: /root/jarvis/apps/desktop/src/main/tray.ts]` — tray menu builder pattern (referenciado por Phase 23 WAKE-03, não Phase 22)
- `[VERIFIED: /root/jarvis/.planning/research/SUMMARY.md]` — locked technical decisions, 4 researchers convergence
- `[VERIFIED: /root/jarvis/.planning/research/STACK.md]` — detailed rejection rationale (bumblebee, porcupine, snowboy, vosk)
- `[VERIFIED: /root/jarvis/.planning/research/ARCHITECTURE.md]` — full pipeline, code sketches, build order
- `[VERIFIED: /root/jarvis/.planning/research/PITFALLS.md]` — 12 pitfalls com citações de upstream trackers
- `[VERIFIED: npm view onnxruntime-web version → 1.24.3]` — registry query em 2026-04-11, 138MB unpacked, MIT
- `[CITED: https://github.com/dscripka/openWakeWord]` — Apache-2.0 código, 4-component ONNX architecture, Silero VAD bundled
- `[CITED: https://github.com/dnavarrom/openwakeword_wasm]` — reference implementation: 1280-sample chunks, 80ms @ 16kHz, VAD hangover 12, cooldown 2000ms, default threshold 0.55
- `[CITED: https://huggingface.co/davidscripka/openwakeword]` — model hosting (exact filenames para validar)
- `[CITED: https://github.com/microsoft/onnxruntime/issues/19148]` — numThreads > 1 requires crossOriginIsolated, warning
- `[CITED: https://electron-vite.org/guide/distribution]` — electron-builder is separate tool, `.yml` config, electron-vite doesn't package
- `[CITED: https://electron-vite.org/guide/assets]` — `public/` dir handling in electron-vite
- `[CITED: https://www.electron.build/configuration/contents]` — extraResources spec
- `[CITED: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet]` — AudioWorklet API reference
- `[CITED: https://rhasspy/wyoming-satellite#185]` (via PITFALLS.md) — TTS self-trigger documented upstream

### Secondary (MEDIUM confidence)

- `[CITED: https://deepcorelabs.com/open-wake-word-on-the-web/]` — browser implementation viability, CPU benchmarks
- `[CITED: https://github.com/vitejs/vite/issues/9606]` — AudioWorklet `new URL(import.meta.url)` warning in Vite
- `[CITED: https://github.com/vitejs/vite/issues/9952]` — `?url` suffix doesn't transpile TS
- `[CITED: https://github.com/kgullion/vite-typescript-audio-worklet-example]` — working Vite + AudioWorklet example
- `[CITED: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html]` — env flags reference
- Electron issues #41123, #15451 (MediaRecorder leak), #42714, #29861 (macOS silent getUserMedia) — via PITFALLS.md citations

### Tertiary / Assumed (LOW confidence — flagged for validation)

- **A1:** `electron-builder` 26.x compat com Electron 41 — VERIFY: `npm view electron-builder version` + changelog review
- **A2:** HuggingFace model URLs exatos — VERIFY: `curl -I` cada URL na primeira tarefa do plano
- **A3:** Shape do classifier input `[1, 76, 96]` — VERIFY: `session.inputMetadata` no primeiro load
- **A4:** `fetch('file://...')` bloqueado em renderer — VERIFY: 10min POC tentando direct URL
- **A7:** CPU <2% target achievable — VERIFY: benchmark cedo no Bloco 2

## Metadata

**Confidence breakdown:**

- Standard Stack (onnxruntime-web, openwakeword models): **HIGH** — npm version verified, 4 researchers convergence, existing code read
- Architecture (renderer pipeline, worklet, VoiceInputManager): **HIGH** — ARCHITECTURE.md derived from direct code inspection, PITFALL #3 identifies refactor need
- Pitfalls (PTT double-trigger, TTS loop, CPU budget, packaging): **HIGH** — PITFALLS.md 12 items with upstream tracker citations
- AudioWorklet Vite serving (research topic a): **MEDIUM** — approach A (public/) confirmed by electron-vite docs, but specific Electron+Vite+AudioWorklet POC not reproduced
- ONNX inference cadence (research topic b): **HIGH** — dnavarrom reference implementation confirms 12.5Hz + VAD hangover 12 + cooldown 2000ms
- electron-builder extraResources (research topic c): **HIGH** — official docs + electron-vite docs align
- RMS zero guard (research topic d): **MEDIUM** — PITFALLS.md documents the problem and remediation direction; exact window size (5s) and epsilon (1e-8) are reasonable defaults but not empirically validated
- CPU budget <2% achievability (A7): **MEDIUM** — suportado por blog posts, não reproduzido em hardware específico do usuário

**Overall confidence:** HIGH

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days — stable stack, fast-moving only if Electron/Chromium ship breaking AudioWorklet changes)

---

*Research complete. Planner pode proceder para `/gsd-plan-phase 22`.*
