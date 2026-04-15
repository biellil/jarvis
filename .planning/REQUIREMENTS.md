# Requirements: JARVIS v1.6 Local Voice Pipeline

**Milestone goal:** Mover todo processamento de voz (STT whisper.cpp + TTS) para o Electron main process com GPU cross-vendor auto-detection. Backend-ts recebe e devolve só texto. Docker não toca mais em áudio.

**Last updated:** 2026-04-13
**Status:** Active

---

## v1.6 Requirements

### STT — whisper.cpp + GPU

- [x] **STT-01** — Usuário pode transcrever voz via whisper.cpp rodando no processo main do Electron, com detecção automática do backend de GPU disponível (CUDA para NVIDIA, Vulkan para AMD/Intel, Metal para Apple, CPU como fallback)
- [x] **STT-02** — Usuário com GPU recebe seleção automática de modelo whisper baseada na VRAM disponível (>8GB → large, 4–8GB → base, <4GB → tiny via CPU)
- [x] **STT-03** — Usuário sem GPU compatível (driver incompatível, OOM, Vulkan não disponível) tem fallback automático para CPU sem crash e com mensagem visível no log/UI
- [x] **STT-04** — Todo áudio capturado é normalizado para 16kHz PCM mono antes de ser enviado ao whisper.cpp, independente do formato original do MediaRecorder
- [x] **STT-05** — Usuário com GPU obtém latência de transcrição <2s para utterances de até 10s no modelo `base`

### TTS — Electron Main

- [x] **TTS-01** — Usuário recebe resposta em áudio com TTS gerado pelo processo main do Electron (não mais pelo backend-ts), usando o provider configurado no .env (Murf.ai ou ElevenLabs)
- [x] **TTS-02** — Usuário não precisa alterar configuração de .env — provider TTS continua selecionado pelas mesmas env vars (MURF_API_KEY, ELEVENLABS_API_KEY)
- [x] **TTS-03** — Código TTS (MurfTTSProvider, ElevenLabsTTSProvider, factory) removido do backend-ts — backend não faz mais chamadas a providers de voz

### Arquitetura — IPC & Voice Handler

- [x] **ARCH-05** — voiceHandler.ts no processo main do Electron orquestra o pipeline completo: áudio recebido via IPC → STT local → texto → fetch /api/chat (backend LLM) → texto → TTS HTTP → áudio → IPC → renderer
- [x] **ARCH-06** — sendAudioAndHandle refatorado para enviar áudio ao main process (via IPC) em vez de ao gateway HTTP, sob feature flag `USE_WHISPER_CPP`

### Infraestrutura & Cleanup

- [x] **INFRA-01** — Binários .node do @fugood/whisper.node configurados para ASAR unpacking no electron-builder (asarUnpack ou extraResources) — `pnpm build` produz artefato funcional sem erros de assinatura
- [x] **INFRA-02** — Feature flag `USE_WHISPER_CPP` (env var, default false) permite rollout seguro — quando false, comportamento anterior (audio upload) é preservado
- [ ] **INFRA-03** — Endpoint `POST /api/chat/audio` removido do gateway Express (apps/gateway)
- [ ] **INFRA-04** — Endpoint `POST /chat/audio` removido do backend-ts (apps/backend-ts)
- [ ] **INFRA-05** — Dependência `nodejs-whisper` removida do backend-ts e do Dockerfile — imagem Docker resultante é menor e não baixa modelos STT em runtime

---

## Future Requirements (Deferred)

- Offline TTS local (Kokoro Node.js port) — provider cloud continua padrão em v1.6
- Mac/Linux cross-platform support (Electron position/tray quirks)
- Settings/preferences UI — configuração de GPU/modelo via widget
- Vision pipeline migração para TypeScript

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Streaming TTS (token-by-token playback) | whisper.cpp é batch, não streaming — arquitetura diferente para v1.7 |
| Kokoro offline TTS | Requer porte Node.js/C++ bindings — trabalho separado, v1.7+ |
| Mac/Linux Electron quirks | Windows é plataforma de dev, cross-platform fica para v1.7 |
| Speech bubble redesign | UI polish sem dependência de voz — deferred |
| History/context panel | Feature separada, sem dependência do pipeline de voz |

---

## Traceability

| Req ID | Phase | Status |
|--------|-------|--------|
| STT-01 | Phase 29 | Complete |
| STT-02 | Phase 30 | Complete |
| STT-03 | Phase 29 | Complete |
| STT-04 | Phase 29 | Complete |
| STT-05 | Phase 30 | Complete |
| TTS-01 | Phase 30 | Complete |
| TTS-02 | Phase 30 | Complete |
| TTS-03 | Phase 30 | Complete |
| ARCH-05 | Phase 30 | Complete |
| ARCH-06 | Phase 31 | Complete |
| INFRA-01 | Phase 29 | Complete |
| INFRA-02 | Phase 29 | Complete |
| INFRA-03 | Phase 32 | Pending |
| INFRA-04 | Phase 32 | Pending |
| INFRA-05 | Phase 32 | Pending |

*Traceability updated by roadmapper — 2026-04-13*
