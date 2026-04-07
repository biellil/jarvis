# Audio Endpoint Testing

This directory contains test files for manual validation of audio endpoints.

## Test Files

- `test-audio.wav` - A 1-second 440Hz tone for endpoint testing

## Manual Testing Commands

### Test FastAPI Directly

Test the FastAPI audio endpoint (port 8000):

```bash
curl -X POST http://localhost:8000/chat/audio \
  -F "audio=@apps/gateway/src/routes/__tests__/test-audio.wav" \
  -H "accept: application/json"
```

Expected: JSON response with transcribed text and JARVIS response.

### Test Gateway Proxy

Test the Gateway audio proxy endpoint (port 3000):

```bash
curl -X POST http://localhost:3000/api/chat/audio \
  -F "audio=@apps/gateway/src/routes/__tests__/test-audio.wav" \
  -H "accept: application/json"
```

Expected: JSON response with transcribed text and JARVIS response (same as FastAPI).

## Expected Response Format

Both endpoints should return JSON in this format:

```json
{
  "message": "..."
}
```

The message field contains JARVIS's response to the transcribed audio.

## Error Cases

- **400 MISSING_FILE** (Gateway only): No audio file in request
- **400 No speech detected**: Audio file is silent or invalid
- **429 Session busy**: Another request is being processed
- **500 Audio processing failed**: Transcription error

## Requirements Validated

- AUDIO-01: FastAPI accepts WAV upload and returns transcription
- AUDIO-02: Gateway proxies multipart to FastAPI correctly
