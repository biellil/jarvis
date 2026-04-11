/**
 * modelLoader — carrega os 4 modelos ONNX do wake word pipeline via bytes
 * (Uint8Array) transferidos pelo main process (IPC read-and-transfer,
 * approach 1 do research, decisão travada por A4).
 *
 * Single-thread wasm é invariant #1 do research: sem crossOriginIsolated o
 * Chromium do Electron não permite multi-thread wasm, e manter em 1 thread
 * também mantém o CPU budget contido (PITFALL #4).
 */
import * as ort from 'onnxruntime-web';

// Side effects de import — garantem que QUALQUER uso de ort dentro do renderer
// já respeite o invariant desde o primeiro InferenceSession.create.
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

// 22-GAP-02: Em Vite dev mode o onnxruntime-web tenta fetchar os .wasm por URL
// relativa ao bundle JS, mas o dev server devolve SPA fallback (index.html) em
// vez do binário. Resultado: CompileError "expected magic word 00 61 73 6d,
// found 3c 21 44 4f" (3c 21 44 4f = "<!DO" = início de <!DOCTYPE).
//
// Fix: apontar wasmPaths para <base>/ort/ (servido via plugin inline
// electron.vite.config.ts ortWasmPlugin em dev, e em dist/renderer/ort/ no
// build). Usamos document.baseURI em vez de '/ort/' absoluto pra funcionar
// tanto em dev (http://localhost:5173/) quanto em packaged (file:///...).
// URLs absolutas com '/' em file:// resolvem pra root do drive, quebrando.
ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href;

export interface WakeWordSessions {
  mel: ort.InferenceSession;
  embed: ort.InferenceSession;
  vad: ort.InferenceSession;
  kw: ort.InferenceSession;
}

export interface WakeWordModelBytes {
  mel: Uint8Array;
  embed: Uint8Array;
  vad: Uint8Array;
  kw: Uint8Array;
}

/**
 * Cria as 4 InferenceSessions em paralelo via Promise.all.
 * Se qualquer uma falhar, propaga o erro e faz best-effort cleanup das
 * sessions que já criaram com sucesso (release() quando disponível).
 */
export async function loadWakeWordSessions(
  bytes: WakeWordModelBytes,
): Promise<WakeWordSessions> {
  const results = await Promise.allSettled([
    ort.InferenceSession.create(bytes.mel),
    ort.InferenceSession.create(bytes.embed),
    ort.InferenceSession.create(bytes.vad),
    ort.InferenceSession.create(bytes.kw),
  ]);

  const firstRejection = results.find((r) => r.status === 'rejected') as
    | PromiseRejectedResult
    | undefined;

  if (firstRejection) {
    // Cleanup best-effort dos que subiram
    for (const r of results) {
      if (r.status === 'fulfilled') {
        try {
          const session = r.value as unknown as { release?: () => void | Promise<void> };
          await session.release?.();
        } catch {
          /* best-effort */
        }
      }
    }
    throw firstRejection.reason instanceof Error
      ? firstRejection.reason
      : new Error(String(firstRejection.reason));
  }

  const [mel, embed, vad, kw] = (results as PromiseFulfilledResult<ort.InferenceSession>[]).map(
    (r) => r.value,
  );

  return { mel, embed, vad, kw };
}
