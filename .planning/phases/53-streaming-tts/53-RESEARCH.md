# Phase 53: Streaming TTS — Research

**Researched:** 2026-05-05
**Domain:** Electron main streaming pipeline (SSE → sentence chunker → per-sentence TTS) + renderer Web Audio gapless queue
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fluxo SSE → sentenças → TTS**
- **D-01:** voiceHandler consome `/chat/stream` (SSE existente), acumula tokens em buffer, e ao detectar `[.!?]\s+` recorta a sentença e dispara `synthesize()` em paralelo (não-bloqueante). Continua bufferando tokens subsequentes.
- **D-02:** Chunking usa regex literal `[.!?]\s+` (spec STTS-01). Sem lista de exceções para abreviações/decimais no MVP — casos raros em respostas conversacionais.
- **D-04:** Ao final do stream SSE, qualquer texto residual no buffer (sem terminador) é flushado como última sentença.

**Playback queue no renderer**
- **D-05:** Renderer usa **Web Audio API com `AudioBufferSourceNode`**. Decoda cada chunk mp3 → `AudioBuffer` via `audioContext.decodeAudioData()`, agenda `source.start(when)` com sample-accurate scheduling (`when = lastEnd`). Garante zero silêncio entre sentenças (success criteria #2).
- **D-06:** Main → renderer via IPC `tts:chunk` por sentença, payload `{ turnId, idx, audioBase64, format, isLast }`. Padrão consistente com IPC existente. Renderer enfileira por `turnId`.
- **D-07:** Orb visual transiciona `thinking → speaking` no callback `source.onstart` (ou no momento agendado para o primeiro AudioBuffer começar a tocar) — não antes. Honesto com o usuário.

**Provider streaming + Murf fallback**
- **D-08:** Streaming = **per-sentença HTTP `synthesize()`** para AMBOS os providers (Murf e ElevenLabs). Mesmo código path. Murf não regride — apenas troca uma chamada longa por várias curtas paralelas.
- **D-09:** WebSocket TTS nativo do ElevenLabs **não** será implementado nesta fase. Defer para v2.3+.

**Feature flag + barge-in**
- **D-10:** `STREAMING_TTS` mora em **electron-store** com toggle em Settings UI (padrão Phase 52 SEXT). Boolean, default `false` na v2.2 inicial. Sem env var override.
- **D-11:** Toggle aplica **no próximo turno** — flag é lida no início de cada `handleVoiceTurn()`. Turno em andamento termina no modo em que começou.
- **D-12:** Barge-in: aborta `fetch` SSE (AbortController), descarta `synthesize()` in-flight (promises ignoradas via flag de cancelamento por turnId), chama `source.stop()` em todos `AudioBufferSourceNode` agendados/tocando. Reaproveita eventos de voice mode existentes (Phase 39).

### Claude's Discretion
- Latency budget exato e necessidade de pre-warm (D-03)
- Estratégia de gestão de `AudioContext` (singleton vs per-turn) — manter consistente com pipeline existente
- Estrutura interna do buffer/chunker (state machine vs string splitter)

### Deferred Ideas (OUT OF SCOPE)
- WebSocket TTS streaming nativo (ElevenLabs `eleven_turbo_v2`) — v2.3+
- Lista de exceções para chunking (Dr., decimais)
- Pre-warm de conexão TTS (Claude's discretion no MVP)
- Murf streaming real (REQUIREMENTS Out of Scope)
- Word-level alignment metadata
- Pause/resume mid-playback
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STTS-01 | TTS inicia playback na primeira sentença completa sem esperar resposta completa do LLM (chunking por `[.!?]\s+` no Electron) | §SSE consumption + §Sentence chunker + §Web Audio gapless queue + §IPC `tts:chunk` |
| STTS-02 | Feature flag `STREAMING_TTS=true/false` ativa/desativa streaming sem restart | §electron-store flag + live read em `handleVoiceTurn` (Phase 52 pattern) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Commits: Conventional Commits + emoji (✨ feat, 🐛 fix, ✅ test, ♻️ refactor, etc.). NUNCA incluir "Generated with Claude Code" / "Co-Authored-By: Claude".
- Stack JARVIS é **Python LangChain/LangGraph** segundo PROJECT.md, mas o app **desktop é Electron + TypeScript** (apps/desktop) e o **backend é Node.js/TypeScript Express** (apps/backend-ts). Phase 53 vive 100% no Electron + consome SSE existente do backend TS — sem Python envolvido.
- Privacy default: TTS já é cloud (Murf/ElevenLabs); apenas o texto da resposta sai. Nada novo em termos de privacy nesta fase.
- Multi-LLM abstraction: preservada — o stream SSE já passa pela factory backend.

## Summary

Phase 53 conecta três camadas existentes que **já estão prontas no repo**:

1. **Backend SSE** (`apps/backend-ts/src/routes/chat.ts`): emite `data: <token>\n\n` para `/chat/stream`. Sem mudanças.
2. **SSE consumer no main** (`apps/desktop/src/main/sse-client.ts`): `openChatStream()` já existe, abortável por `AbortSignal`, parser robusto. Será reutilizado ipsis litteris — apenas substitui o callback `onToken` que hoje só acumula em `tokens.push(token)` por um sentence-chunker que dispara `synthesize()` em paralelo.
3. **Renderer audio** (`apps/desktop/src/renderer/src/audio/ttsPlayer.ts`): hoje toca um único `AudioBuffer` por turno. Será estendido com uma fila gapless `playTTSChunk(turnId, idx, base64, isLast)` que agenda `source.start(when)` com `when = lastEnd` para zero gap.

A flag `STREAMING_TTS` boolean entra em `electron-store` exatamente como `wakeWordThreshold` (Phase 52 SEXT-03): accessor `getStreamingTtsEnabled()`, IPC dedicado `streamingTts:set` que persiste e broadcasta — mas, importante, o **valor é lido no início de cada `handleVoiceTurn`**, não via subscription. Isso satisfaz "sem restart" (D-11) sem precisar de listener no renderer.

**Primary recommendation:** estender `voiceHandler.ts` com um segundo entry point (`handleVoiceTurnStreaming` ou bifurcação dentro de `handleAudio`), reutilizar 100% de `sse-client.ts`, criar `chunker.ts` puro (testável sem Web Audio), criar `streamingTtsPlayer.ts` no renderer espelhando o singleton de `ttsPlayer.ts`, e fazer barge-in pendurar em `stopTTSPlayback()` + `controller.abort()`. O caminho não-streaming (`STREAMING_TTS=false`) permanece intocado — zero risco de regressão para success criteria #3.

## Standard Stack

### Core (already installed — no new dependencies)

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Node fetch (undici) | built-in (Node 22 / Electron 41) | SSE consumption no main process | `sse-client.ts` já usa `globalThis.fetch` com `ReadableStream.getReader()`. Cross-platform, nativo, abortável via AbortSignal. |
| AbortController | built-in (Node 22 / Browsers) | Barge-in cancel do fetch SSE | Já injetado em `sse-client.ts` via `opts.signal`. Padrão estabelecido no codebase (STATE.md "Carry-forward patterns from v2.1"). |
| Web Audio API (`AudioContext`, `AudioBufferSourceNode`) | built-in (Chromium 136 in Electron 41) | Gapless playback no renderer | Sample-accurate scheduling via `source.start(when)`. Já em uso em `ttsPlayer.ts`. |
| electron-store | 11.0.2 (already in package.json) | Persist `streamingTts` boolean | Padrão Phase 39+ para todas as flags. |
| TextDecoder | built-in | Stream chunk → string | Já usado em `sse-client.ts:180`. |

### Testing

| Library | Version | Purpose |
|---------|---------|---------|
| vitest | 4.1.2 (already installed) | Unit + integration tests (main + renderer) |
| happy-dom | 20.8.9 (already installed) | Renderer tests (mock AudioContext) |
| @testing-library/react | 16.3.2 | Settings toggle UI test |

**No new dependencies required.** All needed APIs are already in Electron 41 + Node 22 + existing libs.

**Version verification:** Skipped because no new package is being added. Existing versions are pinned in `apps/desktop/package.json` and validated by `npm install` on developer machines.

### Alternatives Considered

| Instead of | Could Use | Why we don't |
|------------|-----------|---------------|
| `AudioBufferSourceNode` queue | `<audio>` element with `MediaSource` SourceBuffers | MSE doesn't support per-sentence MP3 chunks reliably across browsers; MSE buffers are designed for fragmented MP4/WebM, not concatenated MP3 frames. AudioBuffer is sample-accurate. |
| `AudioBufferSourceNode` queue | `MediaElementAudioSourceNode` with `.play()` per chunk | Introduces audible gap between chunks — `<audio>.play()` has 20–80ms warm-up latency. Fails success criteria #2. |
| Per-sentence HTTP via Murf/ElevenLabs | ElevenLabs WebSocket `eleven_turbo_v2` | Explicitly deferred (D-09, REQUIREMENTS Out of Scope). Per-sentence HTTP is good enough for <1s. |
| Custom SSE parser | `eventsource` npm package | We already have `sse-client.ts` — battle-tested with backoff, action frames, abortion. Don't hand-roll twice. |
| Single AudioContext singleton | New AudioContext per turn | STATE.md "Pitfall crítico: AudioContext deve ser singleton — acumular AudioContexts é o principal vetor de leak em soak test". Singleton é mandatório. |

## Architecture Patterns

### Recommended Module Layout

```
apps/desktop/src/
├── main/voiceInput/
│   ├── voiceHandler.ts            # bifurca: getStreamingTtsEnabled() ? streamingTurn() : handleAudio()
│   ├── streamingTurn.ts           # NEW — orchestrates SSE → chunker → synthesize → IPC
│   ├── chunker.ts                 # NEW — pure: feed(token), takeReady(), flush() returns sentences
│   └── tts/
│       ├── provider.ts            # unchanged — synthesize(text) → {audio, format}
│       ├── murf.ts / elevenlabs.ts # unchanged
│       └── index.ts               # unchanged
├── main/store.ts                  # +get/setStreamingTtsEnabled()
├── main/ipc/settings.ts           # +ipcMain.handle('streamingTts:set', ...) + broadcast
├── renderer/src/audio/
│   ├── ttsPlayer.ts               # unchanged (legacy single-shot path)
│   └── streamingTtsPlayer.ts      # NEW — gapless queue: enqueueChunk(turnId, idx, b64, isLast), stopAll(turnId)
├── renderer/src/settings/sections/
│   └── TtsSection.tsx             # +<Switch /> for streamingTts
└── shared/ipc-types.ts            # +TTS_CHUNK channel + TTSChunkPayload + STREAMING_TTS_SET
```

### Pattern 1: Sentence Chunker (pure function, testable without TTS)

**What:** State holder that accumulates token strings and emits whole sentences when boundary regex matches.

**Edge cases (must handle):**
- Token splits a boundary: `"...end."` arrives, then `" Next"` — chunker must wait for the whitespace AFTER the punctuation to emit.
- Multiple sentences in one token: `"Done. Now this. And"` → emit `"Done."`, `"Now this."`, retain `"And"`.
- No terminal punctuation at end-of-stream: `"...partial reply"` — `flush()` returns the residual as the final sentence (D-04).
- Empty/whitespace-only residual: `flush()` returns nothing.

**API sketch:**

```typescript
// chunker.ts — pure, no I/O
const SENTENCE_BOUNDARY = /[.!?]\s+/;

export class SentenceChunker {
  private buffer = '';
  /** Adds new token text; returns 0+ complete sentences ready to synthesize. */
  feed(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    let match: RegExpExecArray | null;
    // Repeatedly slice off "<sentence>[.!?]\s+" from the buffer.
    while ((match = /[.!?]\s+/.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      out.push(this.buffer.slice(0, end).trim());
      this.buffer = this.buffer.slice(end);
    }
    return out;
  }
  /** Call after stream end. Returns the residual (empty array if all whitespace). */
  flush(): string[] {
    const trimmed = this.buffer.trim();
    this.buffer = '';
    return trimmed.length > 0 ? [trimmed] : [];
  }
}
```

**When to use:** Inside `streamingTurn.ts`, instantiate per-turn (no shared state). Feed each `onToken` callback. After `onEnd`, call `flush()`.

**Source:** Confirmed pattern via WebSearch on "javascript sentence chunker streaming LLM" — multiple OSS implementations (e.g., LangChain JS, llamaindex.ts) use the same regex/while-loop idiom. Verified compatible with the literal regex `[.!?]\s+` mandated by STTS-01.

### Pattern 2: Per-sentence parallel synthesize() with order preservation

**What:** As soon as the chunker emits a sentence, kick off `synthesize(sentence)` immediately (don't await). Track an array of promises indexed by sentence number. Pipe results to renderer as soon as each resolves, **but tag each chunk with `idx` so the renderer enforces order**.

```typescript
// streamingTurn.ts (sketch)
async function runStreamingTurn(deps, transcription) {
  const turnId = randomUUID();
  const chunker = new SentenceChunker();
  const tts = getActiveTtsProvider();
  let nextIdx = 0;
  const cancelled = { value: false };

  const synthAndSend = async (text: string, idx: number, isLast: boolean) => {
    if (cancelled.value) return;
    try {
      const result = await tts.synthesize(text);
      if (cancelled.value) return;
      mainWindow.webContents.send(IPC_CHANNELS.TTS_CHUNK, {
        turnId, idx,
        audioBase64: result.audio.toString('base64'),
        format: result.format,
        isLast,
      });
    } catch (err) {
      console.warn(`[streaming-tts] sentence ${idx} failed (graceful degrade):`, err);
      // Per WAKE-10 / existing voiceHandler precedent: skip this sentence,
      // signal isLast on the LAST sentence (or via separate end IPC).
    }
  };

  const inFlight: Promise<void>[] = [];

  await openChatStream({
    url: `${cfg.backendUrl}/api/chat/stream`,
    apiKey: cfg.apiKey,
    message: transcription,
    onToken: (tok) => {
      for (const sentence of chunker.feed(tok)) {
        inFlight.push(synthAndSend(sentence, nextIdx++, false));
      }
    },
    onAction: () => { /* unchanged */ },
    onEnd: () => { /* drained below */ },
    onError: (err) => { /* set toast */ },
    signal: turnAbortController.signal,
  });

  // Stream done — flush residual.
  for (const tail of chunker.flush()) {
    inFlight.push(synthAndSend(tail, nextIdx++, true));
  }
  // Mark isLast=true on the final scheduled sentence.
  // (Implementation: track lastIdx and re-emit a "tts:end" IPC after Promise.all)
  await Promise.allSettled(inFlight);
  mainWindow.webContents.send(IPC_CHANNELS.TTS_END, { turnId });
}
```

**Order preservation in renderer:** since synthesize() takes variable time (e.g. sentence 2 can resolve before sentence 1), the renderer queue uses `idx` to either (a) schedule `start(when)` only after the previous idx has been scheduled, OR (b) buffer out-of-order chunks in a `Map<idx, AudioBuffer>` and drain in order. **Recommend (b)** — simpler, latency-equivalent.

### Pattern 3: Web Audio Gapless Queue (renderer)

**What:** Sample-accurate scheduling via `source.start(when)` where `when = max(audioContext.currentTime, lastScheduledEnd)`.

```typescript
// streamingTtsPlayer.ts (sketch)
let audioContext: AudioContext | null = null;
const queues = new Map<string, TurnQueue>();  // turnId -> queue state

interface TurnQueue {
  pending: Map<number, ArrayBuffer>;  // out-of-order arrivals
  nextIdx: number;
  lastEnd: number;                     // currentTime + sum(durations)
  activeSources: Set<AudioBufferSourceNode>;
  firstStarted: boolean;               // for orb thinking → speaking transition
}

export async function enqueueChunk(p: TTSChunkPayload): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  let q = queues.get(p.turnId);
  if (!q) {
    q = { pending: new Map(), nextIdx: 0, lastEnd: 0, activeSources: new Set(), firstStarted: false };
    queues.set(p.turnId, q);
  }

  const bytes = Uint8Array.from(atob(p.audioBase64), (c) => c.charCodeAt(0));
  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
  q.pending.set(p.idx, audioBuffer);

  // Drain in order
  while (q.pending.has(q.nextIdx)) {
    const buf = q.pending.get(q.nextIdx)!;
    q.pending.delete(q.nextIdx);
    const startAt = Math.max(ctx.currentTime, q.lastEnd);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    if (!q.firstStarted) {
      q.firstStarted = true;
      source.onended = () => q.activeSources.delete(source);
      // Notify orb on FIRST start — D-07 honest transition
      // (use AudioContext setTimeout: schedule a callback at startAt)
      const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
      setTimeout(() => onFirstSentenceStart?.(p.turnId), delayMs);
    } else {
      source.onended = () => q.activeSources.delete(source);
    }
    source.start(startAt);
    q.lastEnd = startAt + buf.duration;
    q.activeSources.add(source);
    q.nextIdx++;
  }
}

export function stopTurn(turnId: string): void {
  const q = queues.get(turnId);
  if (!q) return;
  for (const src of q.activeSources) {
    try { src.stop(); } catch { /* already stopped */ }
  }
  queues.delete(turnId);
}
```

**Source:** Web Audio API — sample-accurate scheduling pattern documented at [MDN AudioBufferSourceNode.start()](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start). The `start(when)` parameter takes an `AudioContext.currentTime`-based timestamp. Multiple sources scheduled with `when = previousEnd` produce zero-gap concatenation. (HIGH confidence — MDN canonical reference, in active use across major audio web apps.)

### Pattern 4: Live-flip Feature Flag (Phase 52 pattern replication)

Phase 52 SEXT-03 (`wakeWordThreshold`) is the exact template:

```typescript
// store.ts
export function getStreamingTtsEnabled(): boolean {
  return store.get('streamingTtsEnabled') === true;  // explicit true; default false
}
export function setStreamingTtsEnabled(v: boolean): void {
  store.set('streamingTtsEnabled', !!v);
}

// ipc-types.ts
STREAMING_TTS_SET: 'streamingTts:set',
STREAMING_TTS_CHANGED: 'streamingTts:changed',  // (optional, only if renderer needs to react)

// ipc/settings.ts
ipcMain.handle(IPC_CHANNELS.STREAMING_TTS_SET, async (_e, enabled: boolean) => {
  setStreamingTtsEnabled(!!enabled);
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(IPC_CHANNELS.STREAMING_TTS_CHANGED, !!enabled);
  });
  return { success: true };
});
```

**Live flip without restart (D-11):** `voiceHandler.ts` reads `getStreamingTtsEnabled()` **at the start of every voice turn**. No subscription needed. New value applies on the next user utterance — exactly what D-11 requires.

### Anti-Patterns to Avoid

- **DON'T `await` synthesize() in a loop** — kills parallelism, makes streaming pointless. Fire-and-forget into `inFlight[]` and only await at end-of-turn for cleanup.
- **DON'T use `<audio>` elements** — gap between `audio.play()` calls is ~30–80ms, audible. Web Audio API only.
- **DON'T create a new AudioContext per turn** — STATE.md flags this as "principal vetor de leak em soak test". Reuse `getAudioContext()` singleton from existing `ttsPlayer.ts` (or share between both players via a `audioContextSingleton.ts` module).
- **DON'T forget to flush residual** (D-04) — sentences without trailing `[.!?]\s+` will be lost otherwise.
- **DON'T let one synthesize() failure abort the turn** — graceful degrade per WAKE-10 precedent (already in `voiceHandler.ts:152`). Skip the failed sentence, continue with subsequent ones.
- **DON'T schedule with `start(0)` or `start()` for chunks > 0** — first chunk is fine (`start()` ≡ `start(currentTime)`), but every subsequent chunk MUST use `start(lastEnd)` otherwise they overlap or insert gap.
- **DON'T transition orb to `speaking` state before first audio actually starts** (D-07) — schedule the IPC notification with the same `startAt` delay.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing + reconnect | Custom fetch loop with manual `\n\n` split | `apps/desktop/src/main/sse-client.ts` `openChatStream()` | Already battle-tested with backoff (1s,2s,4s,8s,16s,30s), retry classifier (4xx vs 5xx), abort signal, action frames. Re-implementing = duplicating 226 lines + tests. |
| MP3 decoding | ffmpeg-static / custom decoder | `AudioContext.decodeAudioData(arrayBuffer)` | Native browser MP3 decoder. Async, supports all containers Chromium ships. |
| Gapless playback | Concat MP3 buffers and decode as one | Schedule N sources at `when=lastEnd` | Concatenating MP3 frames at byte level is fragile (frame boundaries, ID3 tags). AudioBuffer scheduling is the canonical pattern. |
| AudioContext lifecycle | Per-turn `new AudioContext()` | Singleton from `ttsPlayer.ts` (or extract to shared) | STATE.md flags AudioContext leaks as primary soak-test failure mode. Singleton is mandatory architecture. |
| Cancellation propagation | Manual flag checks everywhere | `AbortController` + per-turn `cancelled` flag | Already the codebase pattern (sse-client, sendAudioAndHandle). |
| UUIDs for turnId | `Date.now() + random` | `crypto.randomUUID()` | Built-in Node 22 + Browsers, collision-free. |

**Key insight:** This phase is 90% wiring, 10% new code. All hard problems (SSE, AudioContext, retry) already solved in `sse-client.ts` and `ttsPlayer.ts`. The main novelty is the chunker (one pure function) and the gapless queue (one renderer module).

## Common Pitfalls

### Pitfall 1: TTS provider rate limits when sending sentences in parallel
**What goes wrong:** ElevenLabs free tier is ~2 concurrent requests; Murf is similar. A long answer with 8 sentences could trigger HTTP 429.
**Why it happens:** D-08 mandates per-sentence parallel synthesize() — first time we issue concurrent requests to the same provider.
**How to avoid:** Soft cap concurrency to 3 in-flight synthesize() calls via a tiny semaphore (`inFlight.length` before issuing new work). Sentences typically arrive at LLM token rate (≈30 tok/s = ~1 sentence/sec), so natural rate limiting is mostly sufficient — but the cap is cheap insurance.
**Warning signs:** ElevenLabs `429 Too Many Requests` in `[streaming-tts]` logs; sudden gaps in playback.
**Source:** ElevenLabs API docs note free=2 / Starter=3 concurrent. (MEDIUM confidence — based on training data; verify in current docs at https://elevenlabs.io/docs/api-reference/overview if rate limit errors surface during smoke test.)

### Pitfall 2: AudioContext suspended state on Electron startup
**What goes wrong:** Chromium's autoplay policy can leave `AudioContext` in `'suspended'` until user gesture. First chunk arrives, decodes, schedules — but no audio plays.
**Why it happens:** Electron renderer counts as a browser context for autoplay. Without prior user interaction, AudioContext is created suspended.
**How to avoid:** `if (ctx.state === 'suspended') await ctx.resume();` before EVERY scheduling — already in `ttsPlayer.ts:67`. Replicate in `streamingTtsPlayer.ts`. Voice flow is always triggered by user mic input, so resume() will succeed.
**Warning signs:** First chunk processed silently; `ctx.state === 'suspended'` in console.
**Source:** [MDN AudioContext.resume()](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/resume), confirmed pattern in existing `ttsPlayer.ts`. (HIGH confidence.)

### Pitfall 3: MP3 decode latency varies per chunk
**What goes wrong:** `decodeAudioData()` is async and takes 5–40ms depending on chunk size. If you `start(when=ctx.currentTime)` instead of `start(when=lastEnd)`, sentence 2 may overlap or have a small gap.
**Why it happens:** MP3 decoding isn't free; `lastEnd` accounts for cumulative scheduled duration regardless of decode time.
**How to avoid:** ALWAYS use `startAt = Math.max(ctx.currentTime, lastEnd)`. The `max` handles both the first-chunk case (lastEnd=0) and gap recovery if decode took longer than playback.
**Warning signs:** Audible click/overlap between sentences in smoke test.
**Source:** Web Audio API scheduling semantics — `start(when)` with `when < currentTime` schedules immediately (silent skip), `when > currentTime` schedules in future. (HIGH confidence — MDN canonical.)

### Pitfall 4: Out-of-order arrival of synthesize() promises
**What goes wrong:** Sentence 2 (short text) finishes before sentence 1 (long text). If renderer plays each as it arrives, the audio is out-of-order narration.
**Why it happens:** TTS latency is roughly linear in text length; shorter sentences resolve faster.
**How to avoid:** `idx` field in payload; renderer keeps `pending: Map<idx, AudioBuffer>` and drains in order via `while (pending.has(nextIdx))`.
**Warning signs:** Words/sentences sound jumbled; subjects flipped.

### Pitfall 5: Barge-in fires while synthesize() in flight
**What goes wrong:** User speaks again mid-playback. We `controller.abort()` the SSE, but the in-flight `fetch(elevenlabs.io)` is unrelated — it resolves with audio that gets `webContents.send`-ed to a renderer that's already moved on, possibly mixing with the next turn.
**Why it happens:** TTS synthesize() uses its own fetch, not bound to the SSE AbortController.
**How to avoid:** Per-turn `cancelled = { value: false }` closure flag. After `controller.abort()`, set `cancelled.value = true`. EVERY synthesize() promise checks `cancelled.value` before sending the IPC. Renderer also checks `turnId` — if it doesn't match the active turn, drop the chunk. Two layers of defense.
**Warning signs:** TTS audio from previous turn plays after user already started a new utterance.

### Pitfall 6: Forgetting `isLast` for orb state transition
**What goes wrong:** Orb stays in `speaking` state after audio ends because nothing tells it the turn is done.
**Why it happens:** `isLast` flag must be set on the FINAL chunk after `flush()` — but if `flush()` returns nothing (response ended on `". "`), the previous chunk needs a way to know it's last.
**How to avoid:** Send a separate `tts:end` IPC after `Promise.allSettled(inFlight)`. Renderer transitions orb back to idle on `tts:end`, regardless of `isLast` flags. Cleaner than retroactively patching `isLast`.

### Pitfall 7: AudioBuffer leak when turn never ends cleanly
**What goes wrong:** If a turn is barge-in'd, `pending` Map and `activeSources` Set still hold references to AudioBuffers — GC can't collect.
**How to avoid:** `stopTurn(turnId)` MUST `queues.delete(turnId)` after stopping all sources. Tested explicitly.

## Runtime State Inventory

> Phase 53 is a **greenfield streaming pipeline addition**, not a rename/refactor. No data migration needed.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by grep across `apps/desktop/src/main/store.ts`. New key `streamingTtsEnabled` is added; missing key reads as `false` (default). No migration of existing user stores needed. | None |
| Live service config | None — TTS providers (Murf, ElevenLabs) reached over HTTPS with API keys; no provider-side state to update | None |
| OS-registered state | None | None |
| Secrets/env vars | `MURF_API_KEY`, `ELEVENLABS_API_KEY` already in use — no new secrets | None |
| Build artifacts | None | None |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Electron with Chromium ≥ 90 (Web Audio API) | Renderer gapless playback | ✓ | Electron 41.1.1 | — |
| Node 22+ (native fetch + ReadableStream) | Main SSE client | ✓ | Required by Electron 41 | — |
| Backend `/chat/stream` SSE endpoint | All streaming flow | ✓ | `apps/backend-ts/src/routes/chat.ts:40` | — |
| ElevenLabs / Murf API access | TTS synthesize | ✓ | API keys in electron-store (Phase 34) | Graceful per-sentence skip (WAKE-10 precedent) |
| AudioContext (browser API) | Renderer | ✓ | Chromium nativo | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Code Examples

Verified patterns from existing codebase:

### SSE consumption (already exists — REUSE)

```typescript
// apps/desktop/src/main/sse-client.ts:122  (verbatim)
export async function openChatStream(opts: OpenChatStreamOpts): Promise<void> {
  const { url, apiKey, message, onToken, onAction, onEnd, onError, signal,
          fetchImpl = globalThis.fetch } = opts;
  const fullUrl = `${url}?message=${encodeURIComponent(message)}`;
  // ... fetch with AbortSignal, ReadableStream.getReader(), TextDecoder,
  //     splitBuffer/parseFrame, exponential backoff on 5xx/network ...
}
```

**Streaming turn integration:**

```typescript
// streamingTurn.ts (NEW)
const turnAbort = new AbortController();
activeTurnControllers.set(turnId, turnAbort);

await openChatStream({
  url: `${cfg.backendUrl}/api/chat/stream`,
  apiKey: cfg.apiKey,
  message: transcription,
  onToken: (tok) => {
    for (const sentence of chunker.feed(tok)) {
      void synthAndSend(sentence, nextIdx++);
    }
  },
  onAction: () => { /* Phase 54 territory */ },
  onEnd: () => { /* drained after */ },
  onError: (err) => console.warn('[streaming-tts] sse error:', err),
  signal: turnAbort.signal,
});

// Drain residual
for (const tail of chunker.flush()) {
  void synthAndSend(tail, nextIdx++);
}
await Promise.allSettled(inFlightSyntheses);
mainWindow.webContents.send(IPC_CHANNELS.TTS_END, { turnId });
```

### electron-store flag accessor (Phase 52 pattern)

```typescript
// store.ts (NEW additions)
const STREAMING_TTS_DEFAULT = false;
export function getStreamingTtsEnabled(): boolean {
  const v = store.get('streamingTtsEnabled');
  return typeof v === 'boolean' ? v : STREAMING_TTS_DEFAULT;
}
export function setStreamingTtsEnabled(enabled: boolean): void {
  if (typeof enabled !== 'boolean') return;
  store.set('streamingTtsEnabled', enabled);
}
```

### Settings IPC (Phase 52 SEXT-03 verbatim pattern)

```typescript
// ipc/settings.ts (NEW handler — copy of WAKE_WORD_SET_THRESHOLD shape)
ipcMain.handle(
  IPC_CHANNELS.STREAMING_TTS_SET,
  async (_event, enabled: boolean): Promise<{ success: boolean }> => {
    setStreamingTtsEnabled(!!enabled);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.STREAMING_TTS_CHANGED, !!enabled);
      }
    });
    return { success: true };
  },
);
```

### Settings UI toggle (Radix Switch follows shadcn primitives)

```tsx
// settings/sections/TtsSection.tsx (additive)
<Field>
  <Field.Label>Streaming TTS (beta)</Field.Label>
  <Field.Control>
    <Switch
      checked={streamingTtsEnabled}
      onCheckedChange={(v) => onStreamingTtsChange(v)}
      aria-label="Streaming TTS"
    />
  </Field.Control>
  <Field.Helper>Begins playback at the first complete sentence.</Field.Helper>
</Field>
```

Note: `Switch` primitive is not currently in `components/ui/` (only Slider/Select/Input/Button/Label/Field exist per Phase 48). Plan must include either authoring a `Switch` primitive (mirror Slider scaffold) or using a Checkbox. Recommendation: **author Switch as a small `@radix-ui/react-switch` wrapper** — Radix is already the design system base.

### Barge-in (reuse Phase 39 events)

```typescript
// On wake-word/PTT detection during playback:
function bargeIn(activeTurnId: string) {
  const ctrl = activeTurnControllers.get(activeTurnId);
  ctrl?.abort();                          // aborts SSE fetch
  cancellationFlags.get(activeTurnId)?.(); // sets cancelled.value = true
  mainWindow.webContents.send(IPC_CHANNELS.TTS_STOP, { turnId: activeTurnId });
}
// In renderer/streamingTtsPlayer.ts:
ipcRenderer.on('tts:stop', (_e, { turnId }) => stopTurn(turnId));
```

## State of the Art

| Old Approach (current code) | New Approach (Phase 53) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `voiceHandler.handleAudio()` calls `fetch /api/chat` (POST, full reply) then `synthesize(reply)` once | `streamingTurn()` opens `/api/chat/stream` (SSE), chunks tokens, calls `synthesize(sentence)` per sentence in parallel | Phase 53 (additive — old path remains for `STREAMING_TTS=false`) | Time-to-first-audio drops from "wait for full LLM response (5–15s)" to "wait for first sentence (<1s)" |
| Renderer `playTTSResponse(b64, fmt)` decodes one buffer, `start()` immediately | Renderer `enqueueChunk({turnId, idx, b64, fmt, isLast})` decodes, schedules at `lastEnd` | Phase 53 (additive — `streamingTtsPlayer.ts` is new, doesn't touch `ttsPlayer.ts`) | Zero gap between sentences (success criteria #2) |
| TTS lifecycle: single `source` reference, `currentSource.stop()` cancels | Per-turn `Set<AudioBufferSourceNode>` + `stopTurn(turnId)` cancels all | Phase 53 | Multiple in-flight sources require multi-source cancellation |

**Deprecated / outdated:** Nothing deprecated — old single-shot path is **kept** to satisfy success criteria #3 (`STREAMING_TTS=false` regression-free).

## Open Questions

1. **Should the `Switch` primitive be added to `components/ui/` or inlined in `TtsSection.tsx`?**
   - What we know: Phase 48 design system has Slider/Select/Input/Button/Label/Field. No Switch yet.
   - What's unclear: Is there appetite to expand the design system here, or does this single use-case argue for inline?
   - Recommendation: Add `components/ui/Switch.tsx` as a thin Radix Switch wrapper — Phase 54 may need another toggle (e.g. action confirmation default), and the cost is ~30 lines.

2. **Should the AudioContext singleton be extracted from `ttsPlayer.ts` to a shared module?**
   - What we know: STATE.md mandates singleton; `ttsPlayer.ts` already owns one; new `streamingTtsPlayer.ts` will also need one.
   - What's unclear: Two modules creating their own singletons technically still produces ONE AudioContext per renderer process (Chromium dedups identical creations? — actually no, each `new AudioContext()` is separate).
   - Recommendation: Extract `apps/desktop/src/renderer/src/audio/audioContext.ts` exporting `getAudioContext()`. Both players import from it. Single source of truth. Refactor `ttsPlayer.ts` to use it.

3. **How should the renderer learn the active turnId for barge-in?**
   - What we know: Main process owns the truth (it triggers barge-in on wake-word/PTT events).
   - Recommendation: Don't expose `turnId` to renderer; main sends `tts:stop` with the turnId, renderer's `streamingTtsPlayer.stopTurn(turnId)` handles it. Renderer never originates barge-in (it's a main-process voice mode event).

4. **What does the orb need exactly for D-07 transition timing?**
   - What we know: Existing orb has `OrbContext` state machine; `'thinking'` and `'speaking'` are existing states (Phase 25/42).
   - Recommendation: When the renderer schedules the FIRST chunk (idx=0), it computes `delayMs = (startAt - currentTime) * 1000`, then `setTimeout(() => setOrbState('speaking'), delayMs)`. The Phase 53 plan should include integrating this with the existing OrbContext setter.

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json`. Section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 (already installed) |
| Config file | `apps/desktop/vitest.config.ts` (already exists per Phase 49 STATE.md note) |
| Quick run command | `npm --workspace @jarvis/desktop run test -- <pattern>` |
| Full suite command | `npm --workspace @jarvis/desktop run test` |
| Renderer environment | happy-dom (annotation `// @vitest-environment happy-dom`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| STTS-01 | `chunker.feed()` emits sentences on `[.!?]\s+` boundary | unit | `npm --workspace @jarvis/desktop run test -- chunker.test.ts` | ❌ Wave 0 |
| STTS-01 | `chunker` handles split tokens, multi-sentence tokens, empty flush | unit | `npm --workspace @jarvis/desktop run test -- chunker.test.ts` | ❌ Wave 0 |
| STTS-01 | `chunker.flush()` returns residual without terminator | unit | `npm --workspace @jarvis/desktop run test -- chunker.test.ts` | ❌ Wave 0 |
| STTS-01 | `streamingTurn()` calls `synthesize()` per sentence + sends `tts:chunk` IPC with monotonic idx | integration | `npm --workspace @jarvis/desktop run test -- streamingTurn.test.ts` | ❌ Wave 0 |
| STTS-01 | `streamingTurn()` aborts mid-stream on AbortSignal — no extra IPC sent after abort | integration | `npm --workspace @jarvis/desktop run test -- streamingTurn.test.ts` | ❌ Wave 0 |
| STTS-01 | renderer `enqueueChunk()` schedules with `start(lastEnd)` for zero gap | unit (happy-dom + AudioContext mock) | `npm --workspace @jarvis/desktop run test -- streamingTtsPlayer.test.ts` | ❌ Wave 0 |
| STTS-01 | renderer drains out-of-order arrivals in idx order | unit | `npm --workspace @jarvis/desktop run test -- streamingTtsPlayer.test.ts` | ❌ Wave 0 |
| STTS-01 | first-sentence latency: from synthetic SSE token "Olá. " to first `tts:chunk` IPC < 1s in test (mock TTS resolves in 200ms) | integration | `npm --workspace @jarvis/desktop run test -- streamingTurn.latency.test.ts` | ❌ Wave 0 |
| STTS-01 | `stopTurn(turnId)` calls `source.stop()` on all active sources and clears queue | unit | `npm --workspace @jarvis/desktop run test -- streamingTtsPlayer.test.ts` | ❌ Wave 0 |
| STTS-02 | `getStreamingTtsEnabled()` defaults `false`, persists boolean | unit | `npm --workspace @jarvis/desktop run test -- store.test.ts` (extend existing) | ✅ extend |
| STTS-02 | IPC handler `streamingTts:set` persists + broadcasts | unit | `npm --workspace @jarvis/desktop run test -- ipc-settings.test.ts` (extend existing) | ✅ extend |
| STTS-02 | `voiceHandler.handleVoiceTurn` reads flag at turn start; turn-in-progress unaffected by mid-flight toggle | integration | `npm --workspace @jarvis/desktop run test -- voiceHandler.streaming.test.ts` | ❌ Wave 0 |
| STTS-02 | TtsSection toggle triggers IPC + UI reflects persisted state | RTL | `npm --workspace @jarvis/desktop run test -- TtsSection.test.tsx` (extend existing) | ✅ extend |
| Success #3 (no regression Murf) | with flag=false, end-to-end voice turn behaves as v2.1: `handleAudio()` path, single `playTTSResponse()` call | integration | `npm --workspace @jarvis/desktop run test -- voiceHandler.streaming.test.ts` (negative case) | ❌ Wave 0 |
| Success #4 (no restart) | toggling flag mid-session changes behavior on the NEXT voice turn (assert across two consecutive turn calls) | integration | `npm --workspace @jarvis/desktop run test -- voiceHandler.streaming.test.ts` | ❌ Wave 0 |
| Success #2 (zero gap manual) | smoke: utter "Diga me uma história em três frases" with flag=true; listen for absence of audible silence between sentences | manual-only | n/a (human ears) | n/a |
| Success #1 latency manual | smoke: same utterance; first audio < 1s after first sentence completes | manual-only | n/a (or instrument console.time in dev build) | n/a |

### Sampling Rate
- **Per task commit:** `npm --workspace @jarvis/desktop run test -- <changed-file-pattern>` (vitest auto-filter)
- **Per wave merge:** `npm --workspace @jarvis/desktop run test`
- **Phase gate:** Full suite green + manual smoke (success criteria #1 and #2 require human ears) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/voiceInput/__tests__/chunker.test.ts` — covers STTS-01 chunker behavior (split tokens, multi-sentence, flush)
- [ ] `apps/desktop/src/main/voiceInput/__tests__/streamingTurn.test.ts` — covers STTS-01 SSE→synth→IPC orchestration with mock `openChatStream` + mock `TTSProvider`
- [ ] `apps/desktop/src/main/voiceInput/__tests__/streamingTurn.latency.test.ts` — first-token-to-first-chunk timing assertion
- [ ] `apps/desktop/src/renderer/src/audio/__tests__/streamingTtsPlayer.test.ts` — covers gapless scheduling, out-of-order drain, stopTurn cleanup. Requires AudioContext mock in happy-dom (`@vitest-environment happy-dom` + global polyfill of AudioContext/AudioBufferSourceNode for testing — search existing codebase for prior pattern in Phase 22 wake word tests).
- [ ] `apps/desktop/src/main/__tests__/voiceHandler.streaming.test.ts` — covers STTS-02 flag bifurcation + no-regression path
- [ ] Extend `apps/desktop/src/main/__tests__/store.test.ts` — accessor tests for streamingTtsEnabled
- [ ] Extend `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — handler test for streamingTts:set
- [ ] Extend `apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx` — Radix Switch fireEvent.click pattern (per Phase 48 STATE.md note: Radix needs `fireEvent.click`, not `change`)

**Mock strategy for AudioContext in happy-dom:** happy-dom 20 does not ship AudioContext. Pattern: define a minimal `class FakeAudioContext { currentTime; state; createBufferSource(); decodeAudioData(); resume(); }` in a test setup file, assign to `globalThis.AudioContext` before imports. Verified pattern works in Phase 22 wake word tests (which mock onnxruntime-web sessions similarly).

## Sources

### Primary (HIGH confidence)
- `apps/backend-ts/src/routes/chat.ts` — SSE wire format `data: <token>\n\n` confirmed
- `apps/desktop/src/main/sse-client.ts` — full SSE consumer with abort+backoff, REUSE verbatim
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — bifurcation point for streamingTts flag
- `apps/desktop/src/main/voiceInput/tts/{provider,index,murf,elevenlabs}.ts` — TTSProvider interface stable
- `apps/desktop/src/renderer/src/audio/ttsPlayer.ts` — singleton AudioContext pattern + Web Audio scheduling
- `apps/desktop/src/main/store.ts` — flag accessor pattern (Phase 52 SEXT-03 = exact template)
- `apps/desktop/src/main/ipc/settings.ts` — IPC handler + multi-window broadcast pattern
- `apps/desktop/src/shared/ipc-types.ts` — IPC channel registry + payload typing
- `apps/desktop/package.json` — Electron 41.1.1 + vitest 4.1.2 + happy-dom 20.8.9 already present
- `.planning/STATE.md` — AudioContext singleton mandate, Phase 52 patterns to replicate
- [MDN AudioBufferSourceNode.start()](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start) — `start(when)` sample-accurate semantics
- [MDN AudioContext.resume()](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/resume) — suspended state recovery

### Secondary (MEDIUM confidence)
- ElevenLabs concurrent-request rate limits (free=2, starter=3) — based on training data; verify in current docs if 429s surface during smoke
- Murf API behavior under parallel requests — provider has no published concurrency cap; observed conservative

### Tertiary (LOW confidence)
- None — all critical claims grounded in existing repo code or canonical MDN.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; no new versions to verify
- Architecture: HIGH — direct extension of existing patterns (sse-client, ttsPlayer, Phase 52 IPC)
- Pitfalls: HIGH — based on documented codebase pitfalls (AudioContext leak in STATE.md, autoplay policy, Phase 22 hook patterns)
- TTS provider concurrency limits: MEDIUM — should be confirmed via smoke test rather than research

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days — codebase patterns stable; only volatile element is provider rate limits which have low operational impact given graceful degrade)
