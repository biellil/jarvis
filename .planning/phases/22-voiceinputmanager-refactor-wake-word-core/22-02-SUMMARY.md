---
phase: 22
plan: 02
subsystem: wake-word-core
tags: [wake-word, onnx, audio-worklet, inference, rms-guard, ipc, tdd]
status: Complete
completed: 2026-04-11
requirements: [WAKE-05, WAKE-06, WAKE-08, WAKE-09]

dependency_graph:
  requires:
    - 22-01 (voiceInputManager singleton — consumed by Plan 04 wake word integration)
  provides:
    - WakeWordEngine class (ready for Plan 04 useWakeWord hook)
    - loadWakeWordSessions(bytes) from renderer via modelLoader
    - window.jarvis.wakeWord.loadModels IPC bridge
    - AudioWorklet asset at dist/renderer/wakeWordWorklet.js
  affects:
    - apps/desktop/src/shared/ipc-types.ts (new WAKE_WORD_LOAD_MODELS channel)
    - apps/desktop/src/main/ipc/index.ts (new registerWakeWordIpc call in setupIpcHandlers)
    - apps/desktop/src/preload/index.ts (new window.jarvis.wakeWord surface)

tech_stack:
  added:
    - onnxruntime-web@1.24.3 (dependencies, exact pinned version)
  patterns:
    - Sliding-window RMS zero-detection guard (PITFALL #7 mitigation)
    - AudioWorklet chunker + Transferable ArrayBuffer postMessage (zero-copy)
    - Main→Renderer IPC read-and-transfer for bundled binary assets (approach 1 from research)
    - Single-thread wasm invariant enforced at import-time side effect
    - Ring-buffer + VAD gate + debounce orchestration for ONNX inference pipeline

key_files:
  created:
    - apps/desktop/src/renderer/src/voice/wakeWord/rmsZeroGuard.ts
    - apps/desktop/src/renderer/src/voice/wakeWord/modelLoader.ts
    - apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts
    - apps/desktop/src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts
    - apps/desktop/src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts
    - apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts
    - apps/desktop/src/renderer/public/wakeWordWorklet.js
    - apps/desktop/src/main/voiceInput/resources.ts
    - apps/desktop/src/main/ipc/wakeWord.ts
    - apps/desktop/scripts/poc-wakeword-file-fetch.mjs
  modified:
    - apps/desktop/package.json (+onnxruntime-web@1.24.3 dep)
    - apps/desktop/src/main/ipc/index.ts (+registerWakeWordIpc)
    - apps/desktop/src/preload/index.ts (+wakeWord.loadModels bridge)
    - apps/desktop/src/shared/ipc-types.ts (+WakeWordModelBytes, +WakeWordApi, +WAKE_WORD_LOAD_MODELS channel)

decisions:
  - "IPC read-and-transfer escolhido por default (approach 1 do research) em vez de file:// direto — mais robusto, não depende de CSP/file protocol policies"
  - "numThreads=1 forçado via side-effect de import em ambos modelLoader.ts e WakeWordEngine.ts — invariant #1 do research"
  - "AudioWorklet em src/renderer/public/ serve via electron-vite sem config extra (confirmado via build)"
  - "Ring buffer cold-start: primeiros 76 chunks enchem o embedding ring antes do classifier ser chamado"
  - "VAD hangover 12 frames: mantém classifier aberto por 960ms após fala cessar, antes de desligar gate"
  - "processChunk com flag `processing` drop-on-busy: se inferência anterior ainda roda, chunk é descartado (worklet emite próximo em 80ms)"
  - "WakeWordEngine NÃO é importado fora de wakeWord/ — integração live com App fica para Plan 04"

metrics:
  duration_minutes: 9
  tasks_completed: 3
  files_created: 10
  files_modified: 4
  tests_added: 18
  commits: 3
---

# Phase 22 Plan 02: Wake Word Core (rmsZeroGuard + modelLoader + WakeWordEngine + IPC bridge) — Summary

Implementa o core de inferência do wake word "Hey JARVIS" como caixa preta testável: `RmsZeroGuard` (PITFALL #7), `loadWakeWordSessions` via IPC bridge (read-and-transfer Uint8Array), `WakeWordEngine` orquestrando o pipeline mel→embed→VAD gate→classifier com debounce, e AudioWorklet em JS puro — tudo sem integração live com `OrbContext` ou montagem no App (isso é Plan 04).

## What was built

### 1. RmsZeroGuard (`apps/desktop/src/renderer/src/voice/wakeWord/rmsZeroGuard.ts`)

Sliding-window zero-detector. Observa cada chunk Float32; se 63 frames consecutivos tiverem `sqrt(sumSq/length) < 1e-8`, dispara `onSilentStream()` exatamente 1 vez (flag `tripped` idempotente). Um frame não-zero no meio da janela reseta a contagem.

Mitiga PITFALL #7 do research: driver de mic morto / hw mute faz wake word rodar feliz mas nunca detectar. Plan 04 vai fiar o callback no degrade path do WAKE-08.

### 2. modelLoader (`apps/desktop/src/renderer/src/voice/wakeWord/modelLoader.ts`)

```ts
export async function loadWakeWordSessions(
  bytes: WakeWordModelBytes,
): Promise<WakeWordSessions>;
```

Cria as 4 `ort.InferenceSession` em paralelo via `Promise.allSettled`. Se qualquer uma falhar, propaga o erro original e faz best-effort cleanup (`.release?.()`) das sessions que já subiram com sucesso. Import-time side-effects travam `ort.env.wasm.numThreads = 1` e `ort.env.wasm.simd = true` antes de qualquer `create()` — invariant #1 do research.

### 3. Main-side IPC bridge (`apps/desktop/src/main/voiceInput/resources.ts` + `apps/desktop/src/main/ipc/wakeWord.ts`)

`resources.ts` expõe:
- `getWakeWordModelPaths()` — resolve paths via `app.isPackaged` (dev vs prod `process.resourcesPath`)
- `loadWakeWordModelBytes()` — `fs.readFile` dos 4 `.onnx` em paralelo, retorna `{mel, embed, vad, kw: Uint8Array}`

`ipc/wakeWord.ts` registra `ipcMain.handle('wakeWord:load-models', ...)` — handler NÃO aceita argumentos do renderer (mitiga T-22-02-01 path traversal via IPC).

**CRITICAL:** `registerWakeWordIpc()` é chamado a partir de `apps/desktop/src/main/ipc/index.ts` (o entry real de `setupIpcHandlers`), junto de `setupChatHandlers` e `setupHotkeyHandlers`. NÃO existe `apps/desktop/src/main/ipc.ts` — esse path obsoleto foi explicitamente evitado pelo plan-checker blocker 3.

### 4. Preload bridge + ipc-types

`apps/desktop/src/preload/index.ts` expõe `window.jarvis.wakeWord.loadModels(): Promise<WakeWordModelBytes>` via `contextBridge.exposeInMainWorld`.

`apps/desktop/src/shared/ipc-types.ts`:
- `WakeWordModelBytes` interface (`mel/embed/vad/kw: Uint8Array`)
- `WakeWordApi` interface (`loadModels: () => Promise<WakeWordModelBytes>`)
- `IPC_CHANNELS.WAKE_WORD_LOAD_MODELS = 'wakeWord:load-models'`
- `JarvisAPI.wakeWord: WakeWordApi` (required field)

### 5. AudioWorklet processor (`apps/desktop/src/renderer/public/wakeWordWorklet.js`)

JS puro sem ESM imports (AudioWorkletGlobalScope não aceita). Classe `WakeWordChunker extends AudioWorkletProcessor` que acumula mono Float32 samples em janelas de 1280 (80ms @ 16kHz = cadência 12.5Hz) e emite cada frame via `port.postMessage(buffer, [buffer])` com Transferable ArrayBuffer para zero-copy. Registrado como `'wake-word-chunker'`.

Confirmado: `pnpm --filter @jarvis/desktop build` copia automaticamente de `src/renderer/public/` para `dist/renderer/wakeWordWorklet.js` sem mudança no `electron.vite.config.ts` — Vite já trata `public/` como asset dir por padrão.

### 6. WakeWordEngine (`apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts`)

Orquestrador stateful. Pipeline por chunk:

```
rmsGuard.observe(chunk)                       // WAKE-08 degrade path
  → mel = sessions.mel.run(tensor(chunk))      // spectrogram
  → embed = sessions.embed.run(mel)            // backbone
  → push embed em ring (EMBEDDING_RING_SIZE=76)
  → if ring.length < 76: return                // cold start
  → vadScore = sessions.vad.run(embed)
  → if vadScore < vadThreshold && vadHangover <= 0: return   // VAD gate
  → kwScore = sessions.kw.run(flatten(ring))   // classifier
  → if kwScore >= threshold && now - lastDetection > debounceMs:
      onDetected(kwScore)
```

API:
- `start(sessions, stream)` — cria AudioContext @16kHz, loads `/wakeWordWorklet.js`, conecta `MediaStreamSource → AudioWorkletNode`, onmessage → processChunk
- `suspend()`/`resume()` — audioContext.suspend/resume (Plan 04 usa via OrbContext gate em TTS)
- `stop()` — disconnect nodes + stop tracks + close context + reset all state
- Drop-on-busy reentrância: flag `processing` descarta chunks se inferência anterior ainda roda (worklet emite próximo em 80ms)
- `ort.env.wasm.numThreads = 1` re-forçado no import (invariant redundante mas seguro)
- NÃO conecta `workletNode.connect(destination)` — evita echo do próprio mic

## Test coverage

| Arquivo | Cenários | Status |
|---------|----------|--------|
| `rmsZeroGuard.test.ts` | 6 (62/63 frames, idempotent, streak reset, reset(), near-zero vs zero) | 6/6 ✓ |
| `modelLoader.test.ts` | 4 (Promise.all, bytes routing, error propagation + cleanup, numThreads invariant) | 4/4 ✓ |
| `WakeWordEngine.test.ts` | 8 (start, detection, below threshold, debounce, VAD gate, fetch invariant, silent stream, stop) | 8/8 ✓ |
| **Total Plan 22-02** | **18** | **18/18 ✓** |

**Full desktop suite:** 237 passing / 3 deferred (pré-existentes baseline — idênticos aos documentados em `22-01-SUMMARY.md`):
1. `src/main/__tests__/integration-chat.test.ts` — full file (gateway mocks)
2. `src/main/__tests__/tray.test.ts` — "DESK-04 has exactly 3 menu items"
3. `src/renderer/components/Orb/__tests__/Orb.test.tsx` × 2 — `[style*="width: 96px"]` null

**Zero regressão causada pelo Plan 02.**

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `f274527` | ✅ test(22-02): Wave 0 failing tests para rmsZeroGuard, modelLoader, WakeWordEngine + onnxruntime-web@1.24.3 dep + POC A4 stub |
| 2 | `cf985cc` | ✨ feat(22-02): rmsZeroGuard + modelLoader + AudioWorklet processor + IPC bridge wakeWord:load-models registrado em ipc/index.ts |
| 3 | `3df6536` | ✨ feat(22-02): WakeWordEngine orquestrando mel → embed → VAD gate → classifier com debounce + RmsZeroGuard |

## Verification results

### Automated grep checks (all pass)

```
grep '"onnxruntime-web": "1.24.3"' apps/desktop/package.json           → 1  ✓  (dependencies)
grep "registerWakeWordIpc" apps/desktop/src/main/ipc/index.ts          → 3  ✓  (comment + import + call)
test -f apps/desktop/src/main/ipc.ts && echo FAIL || echo OK           → OK ✓  (obsolete path NEVER created)
grep "ort.env.wasm.numThreads = 1" .../modelLoader.ts                  → 1  ✓
grep "ort.env.wasm.numThreads = 1" .../WakeWordEngine.ts               → 1  ✓
grep "vadHangover" .../WakeWordEngine.ts                               → 6  ✓  (gate logic present)
grep "audioWorklet.addModule('/wakeWordWorklet.js')" .../Engine.ts     → 1  ✓
grep "rmsGuard" .../WakeWordEngine.ts                                  → 7  ✓  (integrated)
grep "import.*MediaRecorder" .../WakeWordEngine.ts                     → 0  ✓  (invariant #3)
grep "expect(fetch).not.toHaveBeenCalled" .../WakeWordEngine.test.ts   → 1  ✓  (WAKE-09)
grep "registerProcessor('wake-word-chunker'" .../wakeWordWorklet.js    → 1  ✓
grep "wakeWord" apps/desktop/src/preload/index.ts                      → 3  ✓  (type import + key + loadModels)
grep "WakeWordModelBytes" apps/desktop/src/shared/ipc-types.ts         → present ✓
```

### Scope check: WakeWordEngine NOT mounted in App

```
Grep "WakeWordEngine" in apps/desktop/src/renderer/:
  - wakeWord/WakeWordEngine.ts       (source)
  - wakeWord/__tests__/WakeWordEngine.test.ts  (test)
```

Zero imports em `components/`, `hooks/`, `src/chat/`, `src/voice/` (fora de `wakeWord/`). Integração é Plan 04.

### Build

```
pnpm --filter @jarvis/desktop build
  ✓ main bundle: 35.87 kB
  ✓ preload bundle: 1.99 kB
  ✓ renderer bundle: 640.35 kB
  ✓ dist/renderer/wakeWordWorklet.js emitido
  zero TypeScript errors
```

## POC A4 result (file:// fetch viability)

**Decision:** Adotado **approach 1 do research — IPC read-and-transfer** (main `fs.readFile` → renderer `Uint8Array` via `ipcRenderer.invoke`).

**Rationale:** Research §Pattern 4 explicitamente nota que o approach é mais robusto por não depender de CSP/file protocol policies do Chromium, especialmente considerando que `contextIsolation: true` + `sandbox: true` estão habilitados no BrowserWindow (vistos em `main/index.ts`). O POC script (`apps/desktop/scripts/poc-wakeword-file-fetch.mjs`) fica como fallback seed documentado — se no futuro quisermos otimizar para pular a round-trip IPC, basta rodar o snippet no DevTools do renderer em `pnpm dev` e, se `A4_RESULT=file_url_works`, refatorar `modelLoader.ts` + `ipc/wakeWord.ts` para devolver só paths em vez de bytes.

**POC não foi executado live** porque os 4 arquivos `.onnx` ainda não existem no disco (Plan 03 vai criar o `download-wakeword-models.sh`). A decisão de usar IPC read-and-transfer é arquitetural e não depende do POC — o POC só seria relevante se quiséssemos otimizar depois.

## Threat model compliance

| Threat ID | Mitigation applied | Evidence |
|-----------|--------------------|----------|
| T-22-02-01 (path traversal via IPC) | Handler ignora args do renderer, paths hardcoded via `getWakeWordModelPaths()` | `main/ipc/wakeWord.ts` comment + `loadWakeWordModelBytes()` sem params |
| T-22-02-02 (malicious .onnx swap) | `numThreads=1` reduz surface; Plan 03 adiciona checksum verification no download | `ort.env.wasm.numThreads = 1` em 2 files |
| T-22-02-03 (wake word capture leaked) | Test invariant `expect(fetch).not.toHaveBeenCalled()` no WakeWordEngine.test.ts | Test 6 passa |
| T-22-02-04 (CPU DoS) | VAD gate obrigatório (test 5 confirma kw.run não roda em silêncio) | Test 5 passa |
| T-22-02-05 (silent stream bypass) | `RmsZeroGuard.observe` em todo chunk antes do pipeline | Test 7 passa |
| T-22-02-06 (IPC buffer disclosure) | accept — modelos são assets públicos | N/A |

## Deviations from plan

**None substantive.** Plan executado como escrito, com 1 ajuste menor:

1. **[Rule 1 - Test hygiene]** Test 2 do `WakeWordEngine.test.ts` originalmente usava `expect(onDetected).toHaveBeenCalledWith(0.8)` — Float32 precision faz `new Float32Array([0.8])[0] === 0.800000011920929`, causando fail. Ajustei para `expect(onDetected.mock.calls[0][0]).toBeCloseTo(0.8, 5)`. Incluído no commit 3. Esta é a forma canônica de comparar Float32 em vitest.

2. **Nota arquitetural (não é deviation):** Usei `Promise.allSettled` em vez de `Promise.all` no `loadWakeWordSessions` porque `Promise.all` faz short-circuit — se uma rejeita, as outras ficam unhandled. Com `allSettled`, capturo todas e faço cleanup explícito das que subiram antes de rethrowar. Comportamento externo idêntico ao plan.

## Next plans

- **22-03** (Wave 3 — paralelo com 22-02): Download script para os 4 modelos ONNX + assets setup + electron-builder `extraResources` config (file watcher merge-conflict cauteloso — Plan 02 editou `dependencies` de package.json, Plan 03 edita `scripts`).
- **22-04** (Wave 4 — depende de 22-02 e 22-03): Integração live. Cria `useWakeWord` hook no renderer que consome `window.jarvis.wakeWord.loadModels()`, cria `WakeWordEngine`, chama `voiceInputManager.acquire('wakeword')` antes do start, e fia em `OrbContext === 'idle'` como gate (anti TTS self-trigger). Roda o CPU benchmark <2% sustained (blocker ROADMAP).

## Self-Check: PASSED

- `apps/desktop/src/renderer/src/voice/wakeWord/rmsZeroGuard.ts`: FOUND
- `apps/desktop/src/renderer/src/voice/wakeWord/modelLoader.ts`: FOUND
- `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts`: FOUND
- `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts`: FOUND
- `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts`: FOUND
- `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts`: FOUND
- `apps/desktop/src/renderer/public/wakeWordWorklet.js`: FOUND
- `apps/desktop/src/main/voiceInput/resources.ts`: FOUND
- `apps/desktop/src/main/ipc/wakeWord.ts`: FOUND
- `apps/desktop/src/main/ipc/index.ts` contains `registerWakeWordIpc`: VERIFIED (3 matches)
- `apps/desktop/src/main/ipc.ts` does NOT exist: VERIFIED (obsolete path never created)
- `apps/desktop/src/preload/index.ts` contains `wakeWord`: VERIFIED (3 matches)
- `apps/desktop/src/shared/ipc-types.ts` contains `WakeWordModelBytes`: VERIFIED
- `apps/desktop/scripts/poc-wakeword-file-fetch.mjs`: FOUND
- `apps/desktop/package.json` contains `"onnxruntime-web": "1.24.3"` in dependencies: VERIFIED
- `apps/desktop/dist/renderer/wakeWordWorklet.js` after build: VERIFIED
- Commit `f274527` exists: FOUND
- Commit `cf985cc` exists: FOUND
- Commit `3df6536` exists: FOUND
- Full suite 237 passing / 3 deferred (same baseline as 22-01): VERIFIED
