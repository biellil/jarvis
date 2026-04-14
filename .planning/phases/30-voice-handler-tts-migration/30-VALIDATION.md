---
phase: 30
slug: voice-handler-tts-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in apps/desktop) |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm --filter desktop test --run` |
| **Full suite command** | `pnpm --filter desktop test --run` |
| **Estimated runtime** | ~15–30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter desktop test --run`
- **After every plan wave:** Run `pnpm --filter desktop test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-xx-01 | vramDetection | 1 | STT-02 | unit | `pnpm --filter desktop test --run vramDetection` | ❌ W0 | ⬜ pending |
| 30-xx-02 | whisperResources (multi-model) | 1 | STT-02 | unit | `pnpm --filter desktop test --run whisperResources` | ✅ | ⬜ pending |
| 30-xx-03 | TTS provider migration | 1 | TTS-01, TTS-02 | unit | `pnpm --filter desktop test --run tts` | ❌ W0 | ⬜ pending |
| 30-xx-04 | voiceHandler.ts | 2 | ARCH-05 | unit | `pnpm --filter desktop test --run voiceHandler` | ❌ W0 | ⬜ pending |
| 30-xx-05 | handleSendAudio wiring | 2 | ARCH-05 | unit | `pnpm --filter desktop test --run chat-send-audio` | ✅ | ⬜ pending |
| 30-xx-06 | TTS removal from backend-ts | 3 | TTS-03 | unit | `pnpm --filter backend-ts test --run` | ✅ | ⬜ pending |
| 30-xx-07 | Model bundling (electron-builder) | 3 | STT-02 | manual | verify extraResources in build output | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/__tests__/vramDetection.test.ts` — stubs for STT-02 (VRAM detection + model selection thresholds)
- [ ] `apps/desktop/src/main/__tests__/voiceHandler.test.ts` — stubs for ARCH-05 (pipeline orchestration, TTS graceful degrade)
- [ ] `apps/desktop/src/main/voiceInput/tts/__tests__/tts-providers.test.ts` — stubs for TTS-01, TTS-02 (migrated providers in Electron main)

*Existing infrastructure:*
- `apps/desktop/vitest.config.ts` ✅ exists
- `apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts` ✅ exists (will need updating when handleSendAudio is wired)
- `apps/desktop/src/main/__tests__/whisper-gpu-detection.test.ts` ✅ exists (adjacent pattern for new vramDetection.ts)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Transcrição <2s em utterances de até 10s no modelo base com GPU | STT-05 | Latência real requer hardware e microfone — não testável em CI | Ativar USE_WHISPER_CPP=true, gravar utterance de ~8s, cronometrar transcription log até resposta |
| Seleção de modelo logada no startup com VRAM e backend detectados | STT-02 | Requer GPU real para VRAM measurement | Verificar logs de startup: "VRAM detected: Xmb → model: base", "Using GPU backend: vulkan" |
| TTS retorna áudio em pt-BR sem mudança de .env | TTS-01, TTS-02 | Qualidade de voz e provider routing são subjetivos/end-to-end | Rodar com USE_WHISPER_CPP=true, verificar resposta audível com provider correto |
| Pipeline completo: audio IPC → STT → LLM → TTS → audio | ARCH-05 | E2E em hardware real, requer microfone + GPU + API keys | Ativar wake word ou PTT, falar comando, verificar resposta em áudio |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
