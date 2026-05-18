# Requirements — v3.2 Python Desktop Client

**Milestone:** v3.2 — Python Desktop Client  
**Goal:** `apps/desktop-py/` — thin Python client connecting to existing gateway/backend-ts. Terminal-first, no ORB, no LangChain. Local STT + TTS + voice modes mirroring Electron desktop.  
**Status:** Active

---

## Active Requirements

### Infrastructure Setup (PYSETUP)

- [x] **PYSETUP-01** — User can run `uv sync` in `apps/desktop-py/` to install all Python dependencies without system-level configuration
- [x] **PYSETUP-02** — User can start the Python desktop client via `pnpm dev:desktop-py` from project root
- [x] **PYSETUP-03** — `.gitignore` and `.env` updated with Python-specific entries (`GATEWAY_URL`, `venv/`, `.pytest_cache/`)
- [x] **PYSETUP-04** — User preferences (Whisper model, TTS provider, voice mode) persist across sessions in `~/.jarvis/config.json`

### Terminal Chat (PYCHAT)

- [x] **PYCHAT-01** — User can type messages in the terminal and receive streaming responses token-by-token from the gateway
- [x] **PYCHAT-02** — Client verifies gateway health at startup and shows a clear error message if unreachable
- [x] **PYCHAT-03** — User can see the current session's conversation history in the terminal

### Speech-to-Text (PYSTT)

- [ ] **PYSTT-01** — User can trigger audio recording via a configurable hotkey (PTT) and have speech transcribed locally via faster-whisper singleton
- [ ] **PYSTT-02** — User can select the Whisper model (tiny/base/small/medium/large-v3-turbo) via config; model loads on startup
- [ ] **PYSTT-03** — Client detects end of speech automatically via VAD (no manual stop needed); silence threshold configurable

### Text-to-Speech (PYTTS)

- [ ] **PYTTS-01** — JARVIS speaks responses aloud via Kokoro offline TTS (no API key; 350MB model downloaded on first run with progress shown)
- [ ] **PYTTS-02** — Client falls back to ElevenLabs cloud TTS when Kokoro is unavailable or fails
- [ ] **PYTTS-03** — Client falls back to Murf.ai as second cloud TTS fallback when ElevenLabs also unavailable
- [ ] **PYTTS-04** — User can enable "local-only mode" in config to disable all cloud TTS providers

### Voice Modes (PYMODE)

- [ ] **PYMODE-01** — User can activate JARVIS via "Hey JARVIS" wake word (openwakeword offline, default threshold 0.7)
- [ ] **PYMODE-02** — User can use always-listening mode — VAD detects speech continuously without wake word
- [ ] **PYMODE-03** — User can use PTT mode — configurable hotkey starts/stops recording

### Minimal UI (PYUI)

- [ ] **PYUI-01** — Terminal displays a persistent status line: `[MODE] [MODEL] [STATE]` (idle/listening/thinking/speaking) via rich
- [ ] **PYUI-02** — User can access a terminal config menu to change Whisper model, TTS provider, and voice mode without restarting

---

## Future Requirements (Deferred)

- Runtime mode switching without restart — deferred (not selected for v3.2)
- Retry with exponential backoff on gateway failure — deferred (health check covers MVP)
- Packaging as standalone binary (PyInstaller/uv build) — future milestone
- Multi-turn voice listening window post-TTS (Electron MTURN pattern) — future milestone
- PC control tools in Python client — future milestone (stays in backend-ts for now)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| ORB animation | No graphical UI in this client |
| LangChain/LangGraph in Python client | LLM stays in backend-ts; client is thin HTTP wrapper |
| Local SQLite/ChromaDB | Memory lives in backend-ts; client is stateless |
| Screen vision / image analysis | Electron-only in this milestone |
| PC control tools | Stays in backend-ts; not replicated in Python client |
| Settings GUI window | Terminal config menu sufficient for MVP |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PYSETUP-01 | Phase 72 | Complete |
| PYSETUP-02 | Phase 72 | ✅ Completed (72-02) |
| PYSETUP-03 | Phase 72 | ✅ Completed (72-02) |
| PYSETUP-04 | Phase 72 | Complete |
| PYCHAT-01 | Phase 73 | Complete |
| PYCHAT-02 | Phase 73 | Complete |
| PYCHAT-03 | Phase 73 | Complete |
| PYSTT-01 | Phase 74 | Pending |
| PYSTT-02 | Phase 74 | Pending |
| PYSTT-03 | Phase 74 | Pending |
| PYTTS-01 | Phase 75 | Pending |
| PYTTS-02 | Phase 75 | Pending |
| PYTTS-03 | Phase 75 | Pending |
| PYTTS-04 | Phase 75 | Pending |
| PYMODE-01 | Phase 76 | Pending |
| PYMODE-02 | Phase 76 | Pending |
| PYMODE-03 | Phase 76 | Pending |
| PYUI-01 | Phase 77 | Pending |
| PYUI-02 | Phase 77 | Pending |

---

*Last updated: 2026-05-18 — Traceability populated after roadmap creation (19/19 requirements mapped to Phases 72-77)*
