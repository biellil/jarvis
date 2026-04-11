# Phase 13: Audio Endpoint + Voice Input - Research

**Researched:** 2026-04-07
**Domain:** Web Audio APIs, IPC binary transfer, multipart file upload, push-to-talk interaction
**Confidence:** HIGH

## Summary

Phase 13 integrates voice input into the Electron widget via push-to-talk hotkey. The user holds a configurable global hotkey to record audio via MediaRecorder (webm/opus), which is converted to WAV (16kHz mono PCM) in the renderer using AudioContext, transferred via IPC as Buffer, proxied through the Express gateway as multipart/form-data, and transcribed by FastAPI using the existing WhisperTranscriber class. The architecture reuses patterns from Phase 12 (hotkey registration, IPC handlers, orb state transitions) and Phase 6 (FastAPI endpoints).

**Primary recommendation:** Use audiobuffer-to-wav for reliable WAV encoding, multer@2.1.1 for Express multipart handling, and implement a 3-attempt exponential backoff retry strategy with jitter for network resilience. PTT requires a press-and-hold pattern which Electron's globalShortcut API cannot natively support for global keys when app lacks focus — defer full PTT to widget-focused implementation or use third-party libraries like @mechakeys/iohook for true global press-and-hold.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**PTT Interaction:**
- **D-01:** PTT acionado via **hotkey global configurável** (não botão visual no widget)
- **D-02:** Configuração no **tray menu submenu** (igual Phase 12 hotkey do widget)
- **D-03:** Comportamento: **press-and-hold** — segura tecla → grava, solta → para e envia
- **D-04:** Opções de hotkey pré-definidas no menu: Space, Ctrl+Space, CapsLock (hold), etc.
- **D-05:** Hotkey salvo em **electron-store** (persiste entre sessões)
- **D-06:** Se hotkey falhar ao registrar → continua funcional via tray menu manual trigger

**Audio Format:**
- **D-07:** MediaRecorder grava em **webm/opus** (formato padrão web)
- **D-08:** **Converter para WAV no renderer** antes de enviar via IPC
- **D-09:** Conversão usando **AudioContext.decodeAudioData()** + PCM encoding
- **D-10:** FastAPI recebe **WAV pronto** para passar ao WhisperTranscriber
- **D-11:** Taxa de amostragem: **16kHz** (padrão Whisper, economiza bandwidth)

**Error Handling:**
- **D-12:** **NotAllowedError** (sem permissão de microfone): Orb vermelho + tooltip explicando erro
- **D-13:** **Network/timeout errors**: Orb vermelho + **retry automático** (2 tentativas antes de mostrar erro definitivo)
- **D-14:** Tooltip de erro persiste até usuário tentar novamente ou fechar widget
- **D-15:** Erros de conversão de áudio (AudioContext falha): Orb vermelho + tooltip "Erro ao processar áudio"

**Orb State Transitions:**
- **D-16:** Hotkey pressionado → orb muda para **listening** (âmbar pulsante)
- **D-17:** Hotkey solto → orb muda para **processing** (spin/pulse)
- **D-18:** Resposta recebida → orb muda para **responding** (ripple rings)
- **D-19:** Resposta mostrada no SpeechBubble → orb volta para **idle** após 2s

### Claude's Discretion

- **IPC Audio Transfer:** Formato exato do buffer (Uint8Array, ArrayBuffer, ou base64 string) — escolher o mais performático
- **Multipart Naming:** Nome do campo no form-data (audio, file, recording) — seguir convenção HTTP padrão
- **Gateway Proxy:** Se buffer áudio fica em memória ou salva temp file antes de proxiar pro FastAPI
- **FastAPI Temp Files:** Usar NamedTemporaryFile ou salvar em /tmp com cleanup automático
- **Retry Strategy:** Backoff entre retries (imediato, 1s, 3s) — balancear UX vs não sobrecarregar
- **Max Recording Duration:** Limite de tempo (30s? 60s? ilimitado?) — escolher baseado em UX e uso de memória

### Deferred Ideas (OUT OF SCOPE)

- Wake word integration no Electron (v1.0 já tem no Python CLI — integração Electron fica para fase futura)
- Streaming de áudio em tempo real
- Voice activity detection (VAD) no frontend
- Settings UI para modelo Whisper
- Histórico de comandos de voz

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MediaRecorder API | Native | Audio capture from microphone | Native Web API, supported in all modern browsers, royalty-free webm/opus codec |
| AudioContext API | Native | Decode and resample audio | Native Web API, decodeAudioData() is the standard for audio processing in browsers |
| audiobuffer-to-wav | 1.0.0 | Convert AudioBuffer to WAV format | Lightweight (single file), supports 16-bit PCM, stable since 2015, used by Experience-Monks/Jam3 |
| multer | 2.1.1 | Express multipart/form-data middleware | Most popular file upload middleware (1M+ weekly downloads), Express-specific, CVE-2025 patches applied |
| python-multipart | 0.0.18 | FastAPI multipart parsing | Required by FastAPI for file uploads, used internally by UploadFile |
| faster-whisper | 1.2.1 | Audio transcription (already installed) | Already integrated in v1.0, accepts WAV input, auto-resamples to 16kHz mono |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| electron-store | 11.0.2 | Persist PTT hotkey config | Already installed, used in Phase 12 for widget hotkey — reuse for PTT hotkey |
| exponential-backoff | 2.4.0 | Retry strategy with jitter | Optional if implementing custom retry logic — provides backoff() helper with jitter |
| @mechakeys/iohook | latest | Global keydown/keyup detection | **Only if true global press-and-hold is required** — Electron globalShortcut cannot detect keyup for global hotkeys |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| audiobuffer-to-wav | wav-file-encoder | wav-file-encoder is also maintained, but audiobuffer-to-wav has broader adoption and simpler API |
| multer | formidable | formidable is not Express-specific and saves to disk by default; multer integrates better with Express middleware chain |
| exponential-backoff | Custom retry logic | Custom logic is simpler for 3-attempt case; exponential-backoff adds dependency for marginal benefit |
| @mechakeys/iohook | Built-in globalShortcut | globalShortcut cannot detect keyup events for global hotkeys when app lacks focus — iohook adds native module complexity |

**Installation:**
```bash
# Renderer (desktop package)
pnpm add audiobuffer-to-wav --filter @jarvis/desktop

# Gateway
pnpm add multer @types/multer --filter @jarvis/gateway

# FastAPI
pip install python-multipart

# Optional: retry library
pnpm add exponential-backoff --filter @jarvis/desktop

# Only if global press-and-hold is required (Phase 14+)
# pnpm add @mechakeys/iohook --filter @jarvis/desktop
```

**Version verification:** All versions checked 2026-04-07 against npm/PyPI registries.

## Architecture Patterns

### Recommended Flow

```
User Action (press hotkey)
    ↓
[Renderer] globalShortcut callback → setState('listening')
    ↓
[Renderer] MediaRecorder start() → capture webm/opus
    ↓
User Action (release hotkey)
    ↓
[Renderer] MediaRecorder stop() → Blob
    ↓
[Renderer] AudioContext.decodeAudioData(arrayBuffer)
    ↓
[Renderer] audiobuffer-to-wav(audioBuffer) → Uint8Array
    ↓
[Renderer] ipcRenderer.invoke('chat:send-audio', buffer)
    ↓
[Main] IPC handler receives Buffer → setState('processing')
    ↓
[Main] FormData with buffer → POST http://localhost:3000/api/chat/audio
    ↓
[Gateway] multer.single('audio') → req.file
    ↓
[Gateway] FormData forward → POST http://localhost:8000/chat/audio
    ↓
[FastAPI] UploadFile → NamedTemporaryFile → WhisperTranscriber.transcribe()
    ↓
[FastAPI] ChatSession.send(transcript) → response
    ↓
[Response flows back through chain]
    ↓
[Renderer] setState('responding') → SpeechBubble
```

### Pattern 1: MediaRecorder + WAV Conversion

**What:** Capture audio as webm/opus (native browser format) and convert to WAV in-browser before sending.

**When to use:** When backend expects specific format (WAV) and you want to avoid backend conversion overhead.

**Example:**
```typescript
// Renderer process
async function recordAudio(): Promise<Uint8Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus'
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

  await new Promise<void>((resolve) => {
    mediaRecorder.onstop = () => resolve();
    mediaRecorder.start();
    // User releases hotkey triggers stop()
  });

  // Convert webm blob to WAV
  const webmBlob = new Blob(chunks, { type: 'audio/webm' });
  const arrayBuffer = await webmBlob.arrayBuffer();

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Convert to WAV using audiobuffer-to-wav
  const wavArrayBuffer = audioBufferToWav(audioBuffer);
  return new Uint8Array(wavArrayBuffer);
}
```

### Pattern 2: IPC Binary Transfer (Buffer, not base64)

**What:** Transfer audio as Node.js Buffer via IPC without base64 encoding.

**When to use:** Always for binary data — base64 increases size by 33% and adds CPU overhead.

**Example:**
```typescript
// Renderer preload
contextBridge.exposeInMainWorld('jarvis', {
  sendAudio: (audioData: Uint8Array) => {
    // Uint8Array transfers efficiently via IPC
    return ipcRenderer.invoke('chat:send-audio', Buffer.from(audioData));
  }
});

// Main process IPC handler
ipcMain.handle('chat:send-audio', async (_event, audioBuffer: Buffer) => {
  const formData = new FormData();
  formData.append('audio', new Blob([audioBuffer]), 'recording.wav');

  const response = await fetch('http://localhost:3000/api/chat/audio', {
    method: 'POST',
    body: formData,
  });

  return response.json();
});
```

**Research finding:** Electron IPC successfully transfers ArrayBuffer/Buffer, but it copies data (not transfer ownership). For audio files <10MB, this is acceptable. Avoid high-frequency transfers (60fps streaming) due to GC pressure.

### Pattern 3: Express Multipart Proxy

**What:** Gateway receives multipart upload from Electron and forwards to FastAPI without buffering entire file to disk.

**When to use:** When proxying file uploads between services — keep file in memory if <10MB.

**Example:**
```typescript
// apps/gateway/src/routes/chat.ts
import multer from 'multer';
import { fetch } from 'undici';

const upload = multer({ storage: multer.memoryStorage() });

chatRouter.post('/chat/audio', upload.single('audio'), async (req, res, next) => {
  if (!req.file) {
    return next(Object.assign(new Error('No audio file uploaded'), { status: 400 }));
  }

  try {
    const formData = new FormData();
    formData.append('audio', new Blob([req.file.buffer]), 'audio.wav');

    const upstream = await fetch(`${config.fastapiUrl}/chat/audio`, {
      method: 'POST',
      body: formData,
    });

    if (!upstream.ok) {
      throw Object.assign(new Error('FastAPI error'), { status: upstream.status });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});
```

### Pattern 4: FastAPI File Upload with Cleanup

**What:** Receive file upload, save to temporary file, pass to WhisperTranscriber, ensure cleanup.

**When to use:** When processing library expects file path (not file-like object).

**Example:**
```python
# src/jarvis/api/routes/chat.py
from fastapi import UploadFile, File
from tempfile import NamedTemporaryFile
import os

@router.post("/chat/audio")
async def chat_audio(
    request: Request,
    audio: UploadFile = File(...)
) -> ChatResponse:
    session = request.app.state.session
    transcriber = request.app.state.transcriber

    if _session_lock.locked():
        raise HTTPException(status_code=429, detail="Session busy")

    # Save to temp file
    with NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
        tmp_path = tmp_file.name
        content = await audio.read()
        tmp_file.write(content)

    try:
        async with _session_lock:
            # Transcribe audio
            transcript = await transcriber.transcribe(tmp_path)
            # Send transcript to chat session
            response = await session.send(transcript)
        return ChatResponse(message=response)
    finally:
        # Cleanup temp file
        os.unlink(tmp_path)
```

### Pattern 5: Retry Strategy with Exponential Backoff + Jitter

**What:** Retry failed network requests with increasing delays and randomization to avoid thundering herd.

**When to use:** For transient network errors — not for 4xx client errors.

**Example:**
```typescript
// Renderer or Main process
async function sendAudioWithRetry(
  audioBuffer: Uint8Array,
  maxAttempts = 3
): Promise<SendAudioResponse> {
  const delays = [0, 1000, 3000]; // 0ms, 1s, 3s

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        // Add jitter: ±25% random variance
        const jitter = delays[attempt] * 0.25 * (Math.random() * 2 - 1);
        const delay = delays[attempt] + jitter;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const result = await window.jarvis.sendAudio(audioBuffer);
      if (result.success) return result;

      // If response indicates non-retryable error, fail immediately
      if (result.error?.includes('400') || result.error?.includes('401')) {
        throw new Error(result.error);
      }
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, err);
    }
  }

  throw new Error('Max retry attempts exceeded');
}
```

### Anti-Patterns to Avoid

- **Base64 encoding binary audio** — Increases payload size by 33%, adds CPU overhead, no benefit for IPC or multipart
- **Saving audio to disk in renderer** — Security risk (file system access from renderer), unnecessary I/O
- **Blocking IPC handlers** — Never call synchronous APIs in IPC handlers; use async/await or asyncio.to_thread
- **Retrying 4xx errors** — Client errors (400, 401, 403) should not be retried; only retry 5xx and network failures
- **Fixed retry delays without jitter** — Causes thundering herd when multiple clients retry simultaneously
- **Using globalShortcut for press-and-hold** — globalShortcut only fires once per keypress, cannot detect keyup for global hotkeys

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WAV file encoding | Manual RIFF header construction | audiobuffer-to-wav | WAV format has edge cases (padding bytes, chunk alignment, multi-channel interleaving) |
| Multipart parsing | Manual boundary parsing | multer (Express), python-multipart (FastAPI) | Multipart spec is complex (nested boundaries, quoted-printable encoding, disposition headers) |
| Audio resampling | Manual interpolation | AudioContext with sampleRate option | Browser-native resampling uses high-quality algorithms (polyphase filtering) |
| Exponential backoff | Manual delay calculation | exponential-backoff lib or simple formula | Jitter, max delay caps, and edge cases are easy to get wrong |
| Global keydown/keyup | Polling or Electron hacks | @mechakeys/iohook (if needed) | Native OS-level hooks required for global press-and-hold; Electron's globalShortcut insufficient |

**Key insight:** Audio processing has many hidden complexities (endianness, sample alignment, codec quirks). Browser-native APIs (MediaRecorder, AudioContext) handle these correctly. For custom encoding, use proven libraries rather than implementing binary protocols from scratch.

## Common Pitfalls

### Pitfall 1: Electron globalShortcut Limitation for Press-and-Hold

**What goes wrong:** User expects to hold a key to record and release to stop, but globalShortcut only fires callback once when key is first pressed. There is no keyup event for global shortcuts when app lacks focus.

**Why it happens:** Electron's globalShortcut API is designed for single-fire actions (toggle, trigger), not continuous input. OS-level key listeners don't provide separate keydown/keyup events through Electron's API.

**How to avoid:**
- **Option A:** Use PTT hotkey as toggle (press to start, press again to stop) instead of press-and-hold
- **Option B:** Only enable PTT when widget window has focus (use DOM keydown/keyup events)
- **Option C:** Use third-party library like @mechakeys/iohook for true global keydown/keyup detection (adds native module complexity)

**Warning signs:** User reports "PTT keeps recording after I release the key" or "can't stop recording"

**Research source:** GitHub electron/electron#26301 — official confirmation that globalShortcut doesn't provide keyup events

### Pitfall 2: MediaRecorder NotAllowedError Handling

**What goes wrong:** App silently fails when user denies microphone permission, or permission prompt doesn't appear on subsequent attempts.

**Why it happens:** Browsers require secure context (HTTPS/localhost) for getUserMedia. Once denied, permission state persists until user manually resets it in browser settings or OS settings.

**How to avoid:**
- Always check `navigator.mediaDevices` exists (undefined in non-secure contexts)
- Catch NotAllowedError and PermissionDeniedError (browser-specific naming)
- Show clear UI instructions: "Microphone access denied. Please enable in browser settings."
- On macOS: guide user to System Preferences → Security & Privacy → Microphone
- On Windows: guide user to Settings → Privacy → Microphone

**Warning signs:** "navigator.mediaDevices is undefined" in logs, NotAllowedError thrown, permission prompt appears once then never again

**Research source:** MDN MediaDevices.getUserMedia() docs, blog.addpipe.com common getUserMedia errors

### Pitfall 3: AudioContext Suspended State

**What goes wrong:** AudioContext.decodeAudioData() fails silently or hangs indefinitely.

**Why it happens:** Browsers suspend AudioContext by default until user interaction (autoplay policy). Even though decodeAudioData doesn't play audio, suspended context can cause issues.

**How to avoid:**
```typescript
const audioContext = new AudioContext({ sampleRate: 16000 });
if (audioContext.state === 'suspended') {
  await audioContext.resume();
}
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
```

**Warning signs:** decodeAudioData promise never resolves, console warning "AudioContext was not allowed to start"

**Research source:** WebSearch results on AudioContext decodeAudioData issues, MDN docs on autoplay policy

### Pitfall 4: Multipart Field Name Mismatch

**What goes wrong:** FastAPI endpoint can't find uploaded file, multer succeeds but FastAPI returns 422 validation error.

**Why it happens:** Multipart field name must match exactly between sender, middleware, and endpoint. Common mistake: gateway uses `formData.append('file', ...)` but FastAPI expects `audio: UploadFile = File(...)`.

**How to avoid:**
- Standardize field name across all three tiers: `'audio'`
- Gateway multer: `upload.single('audio')`
- Gateway forward: `formData.append('audio', blob, 'audio.wav')`
- FastAPI endpoint: `audio: UploadFile = File(...)`

**Warning signs:** 422 Unprocessable Entity from FastAPI, "Field required" error for audio parameter

**Research source:** FastAPI docs on Request Files, common GitHub issues with multipart mismatch

### Pitfall 5: Temporary File Cleanup Failure

**What goes wrong:** /tmp fills up with orphaned .wav files after repeated uploads, causing disk space errors.

**Why it happens:** If FastAPI endpoint returns early (exception, 429 response) before cleanup code runs, temp file is never deleted. Python's NamedTemporaryFile with `delete=False` requires manual cleanup.

**How to avoid:**
```python
tmp_path = None
try:
    with NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
        tmp_path = tmp_file.name
        content = await audio.read()
        tmp_file.write(content)

    # Process audio
    transcript = await transcriber.transcribe(tmp_path)
    response = await session.send(transcript)
    return ChatResponse(message=response)
finally:
    # Always cleanup, even if exception thrown
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)
```

**Warning signs:** /tmp directory growing unbounded, "No space left on device" errors after extended use

**Research source:** FastAPI GitHub issue #2152, #4697 on file cleanup, Python tempfile docs

### Pitfall 6: Whisper Sample Rate Assumption

**What goes wrong:** Developer assumes Whisper requires exactly 16kHz input and throws error if audio is 44.1kHz or 48kHz.

**Why it happens:** Misunderstanding of faster-whisper behavior — it automatically resamples any input to 16kHz mono internally.

**How to avoid:**
- Send audio at any sample rate — Whisper handles it
- Prefer 16kHz for bandwidth optimization, but don't enforce it
- If converting in browser, use 16kHz AudioContext to reduce payload size

**Warning signs:** Unnecessary resampling code in multiple places, errors rejecting valid audio files

**Research source:** OpenAI Whisper GitHub discussions #870, #799, SYSTRAN/faster-whisper docs

## Code Examples

Verified patterns from official sources and research:

### Example 1: MediaRecorder Permission Check
```typescript
// Source: MDN MediaDevices.getUserMedia + blog.addpipe.com common errors
async function requestMicrophonePermission(): Promise<MediaStream | null> {
  // Check secure context
  if (!navigator.mediaDevices) {
    console.error('getUserMedia not supported (non-secure context)');
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        console.error('Microphone permission denied by user');
        // Show UI: "Microphone access denied. Enable in system settings."
      } else if (err.name === 'NotFoundError') {
        console.error('No microphone device found');
      } else {
        console.error('getUserMedia error:', err);
      }
    }
    return null;
  }
}
```

### Example 2: WebM to WAV Conversion (16kHz Mono)
```typescript
// Source: audiobuffer-to-wav npm package + MDN AudioContext
import audioBufferToWav from 'audiobuffer-to-wav';

async function convertWebMToWav(webmBlob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await webmBlob.arrayBuffer();

  // Create AudioContext with 16kHz target sample rate
  const audioContext = new AudioContext({ sampleRate: 16000 });

  // Resume if suspended (autoplay policy)
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  // Decode webm to AudioBuffer (automatically resamples to 16kHz)
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Convert to WAV (16-bit PCM by default)
  const wavArrayBuffer = audioBufferToWav(audioBuffer);

  return new Uint8Array(wavArrayBuffer);
}
```

### Example 3: IPC Audio Handler with Retry
```typescript
// Source: Phase 12 IPC pattern + research on exponential backoff
// apps/desktop/src/main/ipc/chat.ts

import { ipcMain } from 'electron';
import { IPC_CHANNELS, type SendAudioResponse } from '../../shared/ipc-types';

const GATEWAY_URL = 'http://localhost:3000/api/chat/audio';
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds for audio upload
const MAX_RETRIES = 3;

export function setupAudioHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_AUDIO,
    async (_event, audioBuffer: Buffer): Promise<SendAudioResponse> => {
      const delays = [0, 1000, 3000]; // 0ms, 1s, 3s

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            // Wait with jitter before retry
            const jitter = delays[attempt] * 0.25 * (Math.random() * 2 - 1);
            const delay = Math.max(0, delays[attempt] + jitter);
            await new Promise(resolve => setTimeout(resolve, delay));
            console.log(`[IPC:chat:send-audio] Retry attempt ${attempt + 1}/${MAX_RETRIES}`);
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

          // Create FormData with audio buffer
          const formData = new FormData();
          formData.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'recording.wav');

          const response = await fetch(GATEWAY_URL, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Non-retryable errors (4xx client errors)
          if (response.status >= 400 && response.status < 500) {
            return {
              success: false,
              error: `HTTP ${response.status}`,
            };
          }

          // Server error or network error - retry
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          return {
            success: true,
            data: { reply: data.message },
          };

        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            console.error('[IPC:chat:send-audio] Request timeout');
            if (attempt === MAX_RETRIES - 1) {
              return { success: false, error: 'Request timeout after 30 seconds' };
            }
            continue;
          }

          // Last attempt - return error
          if (attempt === MAX_RETRIES - 1) {
            return {
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            };
          }
        }
      }

      return { success: false, error: 'Max retries exceeded' };
    }
  );
}
```

### Example 4: Express Gateway Multipart Proxy
```typescript
// Source: multer docs + Phase 7 gateway pattern
// apps/gateway/src/routes/chat.ts

import { Router } from 'express';
import multer from 'multer';
import { fetch } from 'undici';
import { config } from '../config.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

export const chatRouter = Router();

chatRouter.post('/chat/audio', upload.single('audio'), async (req, res, next) => {
  if (!req.file) {
    const err = Object.assign(new Error('No audio file uploaded'), {
      status: 400,
      code: 'MISSING_FILE',
    });
    return next(err);
  }

  try {
    // Forward to FastAPI as multipart
    const formData = new FormData();
    formData.append('audio', new Blob([req.file.buffer], { type: 'audio/wav' }), 'audio.wav');

    const upstream = await fetch(`${config.fastapiUrl}/chat/audio`, {
      method: 'POST',
      body: formData,
    });

    if (!upstream.ok) {
      const detail = await upstream.json().catch(() => ({}));
      const err = Object.assign(
        new Error((detail as any)?.detail ?? 'FastAPI error'),
        {
          status: upstream.status,
          code: 'UPSTREAM_ERROR',
        }
      );
      return next(err);
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});
```

### Example 5: FastAPI Audio Endpoint with Transcription
```python
# Source: FastAPI docs + Phase 6 chat endpoint pattern
# src/jarvis/api/routes/chat.py

from fastapi import UploadFile, File, HTTPException, Request
from tempfile import NamedTemporaryFile
import os
import asyncio

@router.post("/chat/audio", response_model=ChatResponse)
async def chat_audio(
    request: Request,
    audio: UploadFile = File(...)
) -> ChatResponse:
    """Transcribe audio and send to chat session.

    Receives WAV file upload (16kHz mono recommended but not required),
    transcribes using WhisperTranscriber, sends transcript to ChatSession.

    Args:
        audio: WAV file from multipart/form-data

    Returns:
        ChatResponse with assistant's reply to transcribed message

    Raises:
        HTTPException(429): If session is busy
        HTTPException(500): If transcription or chat fails
    """
    session = request.app.state.session
    transcriber = request.app.state.transcriber

    if _session_lock.locked():
        raise HTTPException(status_code=429, detail="Session busy — try again later")

    tmp_path = None
    try:
        # Save uploaded file to temporary location
        with NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            tmp_path = tmp_file.name
            content = await audio.read()
            tmp_file.write(content)

        async with _session_lock:
            # Transcribe audio (runs in thread pool via asyncio.to_thread)
            transcript = await transcriber.transcribe(tmp_path)

            if not transcript.strip():
                raise HTTPException(status_code=400, detail="No speech detected in audio")

            # Send transcript to chat session
            response_text = await session.send(transcript)

        return ChatResponse(message=response_text)

    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=f"Audio file error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        # Always cleanup temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError as e:
                # Log but don't fail request if cleanup fails
                print(f"Warning: Failed to delete temp file {tmp_path}: {e}")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PyAudio for audio capture | MediaRecorder API (browser-native) | 2020+ (WebRTC maturity) | No binary dependencies, works in renderer process, better cross-platform support |
| Manual WAV encoding | audiobuffer-to-wav library | 2015+ (library stable) | Handles edge cases (alignment, padding), reduces bugs |
| Base64 for binary transfer | Direct Buffer/ArrayBuffer transfer | Electron 1.0+ | 33% bandwidth reduction, lower CPU usage |
| Synchronous file uploads | Streaming multipart with memory storage | Express 4+ / multer 1.0+ | Lower memory footprint, faster response times |
| Fixed retry delays | Exponential backoff with jitter | 2018+ (AWS best practices) | Avoids thundering herd, better failure recovery |
| SpooledTemporaryFile (FastAPI default) | NamedTemporaryFile with explicit cleanup | 2024+ (best practices) | Prevents /tmp bloat, predictable cleanup timing |

**Deprecated/outdated:**
- **formidable for Express:** Still works, but multer has better Express integration and more active maintenance (CVE patches in 2025)
- **Base64-encoded audio in IPC:** Outdated pattern from Electron <1.0 days when Buffer transfer was unreliable
- **python-magic for file validation:** FastAPI's content-type header is sufficient for trusted Electron client; magic number validation adds unnecessary dependency

## Open Questions

1. **Press-and-Hold Implementation for Global Hotkeys**
   - What we know: Electron's globalShortcut API cannot detect keyup events for global hotkeys when app lacks focus
   - What's unclear: Whether to implement toggle-style PTT (press to start, press again to stop), widget-focused PTT only, or add @mechakeys/iohook dependency for true global press-and-hold
   - Recommendation: **Start with toggle-style PTT using globalShortcut** (simplest, no new dependencies). User can press configured hotkey to start recording, press again to stop and send. Defer true press-and-hold to Phase 14 if user feedback demands it.

2. **Max Recording Duration**
   - What we know: Longer recordings = larger memory usage in renderer, longer upload time, longer transcription time
   - What's unclear: Optimal balance between UX flexibility and resource constraints
   - Recommendation: **60-second hard limit for Phase 13**. Most voice commands are <10s. 60s allows longer queries without unbounded memory growth. Show visual countdown timer in orb tooltip after 45s.

3. **Whisper Model Size Configuration**
   - What we know: WhisperTranscriber already accepts model_size parameter ('base', 'small', 'medium', 'large'), configurable via Settings
   - What's unclear: Whether to expose model selection in Electron UI or keep it .env-only
   - Recommendation: **Keep .env-only for Phase 13**. Model selection impacts memory (base=~100MB, large=~3GB) and transcription speed. Advanced users can edit .env; casual users get sensible default ('base').

## Environment Availability

> External dependencies checked on target system (Windows 11, Node 22, Python 3.13)

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Gateway, Electron | ✓ | 22.x (via pnpm) | — |
| Python | FastAPI transcription | ✓ | 3.13.5 | — |
| npm/pnpm | Package management | ✓ | pnpm 9.x | — |
| pip | Python packages | ✓ | (bundled with Python) | — |
| MediaRecorder API | Audio capture | ✓ | Native (Chromium 120+) | — |
| AudioContext API | Audio processing | ✓ | Native (Chromium 120+) | — |
| faster-whisper | Transcription | ✓ | 1.2.1 (installed v1.0) | — |
| python-multipart | FastAPI uploads | ✗ | — | Must install (`pip install python-multipart`) |
| multer | Express uploads | ✗ | — | Must install (`pnpm add multer`) |
| audiobuffer-to-wav | WAV encoding | ✗ | — | Must install (`pnpm add audiobuffer-to-wav`) |

**Missing dependencies with no fallback:**
- python-multipart — **BLOCKS** FastAPI multipart/form-data parsing; required by FastAPI for `UploadFile` parameter
- multer — **BLOCKS** Express file upload handling; required for gateway proxy
- audiobuffer-to-wav — **BLOCKS** WAV conversion in renderer; required for D-08 (convert to WAV before IPC)

**Missing dependencies with fallback:**
- None — all missing dependencies are required for phase implementation

**Action required:** Wave 0 must include installation of python-multipart, multer, and audiobuffer-to-wav before any implementation tasks.

## Validation Architecture

> nyquist_validation is enabled — test infrastructure required for phase validation

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 (Electron + Gateway) / pytest 8.x (FastAPI) |
| Config file | `vitest.config.ts` (per-package), `pytest.ini` (Python) |
| Quick run command | `pnpm --filter @jarvis/desktop test` / `pnpm --filter @jarvis/gateway test` / `pytest src/jarvis/api/routes/test_chat.py -x` |
| Full suite command | `pnpm test` (monorepo root) / `pytest` (Python) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIO-01 | Gateway endpoint accepts multipart audio upload and returns transcription | integration | `pnpm --filter @jarvis/gateway test -- chat.test.ts -t "POST /api/chat/audio"` | ❌ Wave 0 |
| AUDIO-02 | FastAPI endpoint accepts multipart audio upload and calls WhisperTranscriber | integration | `pytest src/jarvis/api/routes/test_chat.py::test_chat_audio_endpoint -x` | ❌ Wave 0 |
| ACTV-03 | IPC handler sends audio buffer to gateway and returns response | unit | `pnpm --filter @jarvis/desktop test -- ipc/chat.test.ts -t "sendAudio"` | ❌ Wave 0 |

**Note:** AUDIO-01 and AUDIO-02 success criteria from ROADMAP.md can be validated manually via curl for initial implementation, but automated tests ensure regression protection.

### Sampling Rate
- **Per task commit:** `pnpm --filter @jarvis/desktop test` or `pnpm --filter @jarvis/gateway test` or `pytest src/jarvis/api/routes/test_chat.py -x` (relevant subset)
- **Per wave merge:** Full test suite for affected packages (`pnpm --filter @jarvis/desktop test`, etc.)
- **Phase gate:** All three test suites (Electron, Gateway, FastAPI) green + manual curl validation against both endpoints before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/gateway/src/routes/__tests__/chat.test.ts` — add test for POST /api/chat/audio with mock FastAPI response
- [ ] `apps/desktop/src/main/ipc/__tests__/chat.test.ts` — add test for IPC sendAudio handler with mock gateway
- [ ] `src/jarvis/api/routes/test_chat.py` — add test_chat_audio_endpoint with mock audio file
- [ ] Install dev dependencies: `@types/multer` for gateway tests

## Sources

### Primary (HIGH confidence)
- MDN Web APIs: MediaRecorder, AudioContext, decodeAudioData — official browser API docs (2026-04-07)
- Electron Documentation: globalShortcut, IPC, electron-store — official Electron API docs v41.x (2026-04-07)
- FastAPI Documentation: Request Files, UploadFile — official FastAPI docs v0.135+ (2026-04-07)
- npm registry: multer@2.1.1, audiobuffer-to-wav@1.0.0, electron-store@11.0.2 — verified versions (2026-04-07)
- PyPI registry: python-multipart@0.0.18, faster-whisper@1.2.1 — verified versions (2026-04-07)

### Secondary (MEDIUM confidence)
- GitHub electron/electron#26301 — confirmed globalShortcut limitation for keyup events (2021, still valid 2026)
- npm exponential-backoff docs — retry strategy patterns (2026-04-07)
- blog.addpipe.com — getUserMedia error handling patterns (2026-01-15 article)
- DEV Community articles — Multer 2026 guide, exponential backoff patterns (January 2026 articles)
- GitHub Experience-Monks/audiobuffer-to-wav — WAV encoding implementation (stable since 2015, last verified 2026-04-07)

### Tertiary (LOW confidence)
- WebSearch results on @mechakeys/iohook — community feedback on iohook forks, CPU usage concerns (2024-2025 discussions)
- Medium articles on file uploads — general patterns, not implementation-specific (2025-2026)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages verified in npm/PyPI registries with current versions; APIs are stable browser/Electron standards
- Architecture: HIGH - Patterns verified against existing Phase 12 codebase (IPC, hotkey) and official docs (FastAPI, Express)
- Pitfalls: MEDIUM-HIGH - globalShortcut limitation confirmed by GitHub issue; other pitfalls derived from common error patterns in docs/community
- Press-and-hold workaround: MEDIUM - @mechakeys/iohook is a community fork (not official Electron), CPU concerns noted but not independently verified

**Research date:** 2026-04-07
**Valid until:** 60 days (standard stack is stable; no fast-moving dependencies like ML models or experimental APIs)
