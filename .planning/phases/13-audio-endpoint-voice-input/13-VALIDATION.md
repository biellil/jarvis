# Phase 13: Audio Endpoint + Voice Input - Validation

**Phase:** 13-audio-endpoint-voice-input
**Generated:** 2026-04-07
**Requirements:** AUDIO-01, AUDIO-02, ACTV-03

## Success Criteria Mapping

| # | Success Criterion | Test Type | Test Location | Plan |
|---|-------------------|-----------|---------------|------|
| SC-1 | `curl -X POST http://localhost:3000/api/chat/audio -F "audio=@test.wav"` retorna resposta JSON com texto transcrito e resposta do JARVIS | Integration | `apps/gateway/src/routes/__tests__/chat.test.ts` | 13-02 |
| SC-2 | `curl -X POST http://localhost:8000/chat/audio -F "audio=@test.wav"` retorna resposta JSON diretamente no FastAPI | Integration | `src/jarvis/api/routes/test_chat.py` | 13-02 |
| SC-3 | No widget Electron, toggle PTT aciona estado listening; toggle novamente para de gravar e orb transiciona para processing | Manual + Unit | `apps/desktop/src/main/ipc/__tests__/audio.test.ts` | 13-04 |
| SC-4 | Resposta de voz retorna e orb volta para idle — áudio trafegou por MediaRecorder → PCM → IPC → POST /api/chat/audio → WhisperTranscriber → ChatSession | E2E | Manual verification | 13-03, 13-04 |
| SC-5 | App solicita permissão de microfone na primeira vez que PTT é usado — nunca rejeita silenciosamente com NotAllowedError | Manual | Manual verification | 13-03 |

## Requirement Coverage

### AUDIO-01: Gateway Audio Proxy
**Requirement:** Gateway aceita POST /api/chat/audio (multipart/form-data) e proxia para FastAPI

**Test Coverage:**
- Unit: `apps/gateway/src/routes/__tests__/chat.test.ts` → `POST /api/chat/audio multipart handling`
- Integration: Manual curl test (SC-1)

**Validation Approach:**
1. Unit test verifies multer middleware accepts multipart
2. Unit test verifies FormData construction for FastAPI proxy
3. Integration test verifies end-to-end gateway → FastAPI flow

**Plans:** 13-01 (deps), 13-02 (implementation)

---

### AUDIO-02: FastAPI Audio Endpoint
**Requirement:** FastAPI expõe POST /chat/audio que recebe WAV, transcreve via WhisperTranscriber, e retorna resposta

**Test Coverage:**
- Unit: `src/jarvis/api/routes/test_chat.py` → `test_chat_audio_endpoint`
- Integration: Manual curl test (SC-2)

**Validation Approach:**
1. Unit test mocks WhisperTranscriber.transcribe()
2. Unit test verifies UploadFile → temp file → WhisperTranscriber → ChatSession flow
3. Unit test verifies response JSON structure
4. Integration test verifies real WAV file upload and transcription

**Plans:** 13-01 (deps), 13-02 (implementation)

---

### ACTV-03: Voice Input Integration
**Requirement:** Usuário pode usar PTT hotkey para gravar voz e receber resposta, com orb transitando de estado

**Test Coverage:**
- Unit: `apps/desktop/src/main/ipc/__tests__/audio.test.ts` → `sendAudio IPC handler`
- Unit: `apps/desktop/src/renderer/components/AudioRecorder/__tests__/AudioRecorder.test.ts` → MediaRecorder mocking
- E2E: Manual verification (SC-3, SC-4, SC-5)

**Validation Approach:**
1. Unit test verifies MediaRecorder → WAV conversion (mocked AudioContext)
2. Unit test verifies IPC sendAudio → gateway POST /api/chat/audio
3. Unit test verifies orb state transitions (listening → processing → responding → idle)
4. E2E test requires real browser environment with microphone permission

**Plans:** 13-03 (recorder + IPC), 13-04 (hotkey + orb states)

---

## Automated vs Manual Tests

### Automated Tests (Must Pass Before Merge)
| Test File | Coverage | Plans |
|-----------|----------|-------|
| `apps/gateway/src/routes/__tests__/chat.test.ts` | Gateway multipart handling, FormData proxy | 13-01, 13-02 |
| `apps/desktop/src/main/ipc/__tests__/audio.test.ts` | IPC sendAudio handler | 13-01, 13-03 |
| `src/jarvis/api/routes/test_chat.py` | FastAPI audio endpoint with mock transcription | 13-01, 13-02 |

### Manual Verification (Must Complete Before Phase Close)
| Scenario | Why Manual | Success Criteria |
|----------|------------|------------------|
| curl gateway audio endpoint | Verify real HTTP multipart handling | SC-1 |
| curl FastAPI audio endpoint | Verify real Whisper transcription | SC-2 |
| PTT hotkey toggle behavior | Requires global hotkey registration | SC-3 |
| End-to-end voice flow | Requires mic permission, browser APIs | SC-4 |
| Microphone permission prompt | Browser security, can't automate | SC-5 |

---

## Gap Analysis

### Covered by Automated Tests
- ✅ Gateway multipart parsing
- ✅ Gateway → FastAPI proxy with FormData
- ✅ FastAPI UploadFile handling
- ✅ WhisperTranscriber integration (mocked)
- ✅ IPC sendAudio handler
- ✅ Orb state transitions (unit)

### Requires Manual Testing
- ⚠️ Real WAV transcription quality
- ⚠️ PTT hotkey global registration
- ⚠️ MediaRecorder browser API behavior
- ⚠️ Microphone permission flow
- ⚠️ End-to-end latency (recording → response)

### Not Tested (Acceptable Gaps)
- Network retry behavior (D-13) — complexity vs value, deferred to Phase 14
- Max recording duration (Claude's discretion) — UX concern, tune after dogfooding
- Error tooltip auto-clear timer (D-14) — visual QA, not critical path

---

## Test Execution Order

**Plan 13-01:** Install dependencies
- No tests yet (scaffold only)

**Plan 13-02:** Backend endpoints
1. Run `pytest src/jarvis/api/routes/test_chat.py::test_chat_audio_endpoint`
2. Run `pnpm --filter gateway test src/routes/__tests__/chat.test.ts`
3. Manual: `curl -X POST http://localhost:8000/chat/audio -F "audio=@test.wav"`
4. Manual: `curl -X POST http://localhost:3000/api/chat/audio -F "audio=@test.wav"`

**Plan 13-03:** Frontend recording
1. Run `pnpm --filter desktop test src/main/ipc/__tests__/audio.test.ts`
2. Run `pnpm --filter desktop test src/renderer/components/AudioRecorder`

**Plan 13-04:** PTT integration
1. Run `pnpm --filter desktop test` (all tests)
2. Manual: Open app, test PTT hotkey toggle behavior
3. Manual: Verify orb state transitions during recording
4. Manual: Verify microphone permission prompt
5. Manual: Complete end-to-end voice flow

---

*Validation matrix: 3 requirements → 5 success criteria → 3 automated test files + 5 manual scenarios*
