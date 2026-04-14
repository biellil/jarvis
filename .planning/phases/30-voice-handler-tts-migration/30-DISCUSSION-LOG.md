# Phase 30: Voice Handler + TTS Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 30-voice-handler-tts-migration
**Areas discussed:** VRAM detection, Download dos modelos

---

## VRAM Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Electron app.getGPUInfo('complete') | API nativa do Electron, cross-platform, assíncrona. Retorna auxAttributes.gpuMemoryMB. Chamada única em startup, resultado cacheado. | ✓ |
| Hardcode por backend detectado | cuda→large, vulkan/metal→base, cpu→tiny. Zero deps, zero precisão em GPUs edge-case. | |

**User's choice:** `app.getGPUInfo('complete')`
**Notes:** RX 7600 AMD usa Vulkan — nvidia-smi não seria compatível. Electron API cobre todos os vendors.

---

### VRAM Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Default para 'base' | Modelo já validado no Phase 29. Seguro e conservador. | ✓ |
| Default para 'tiny' | Mais conservador em memória. Sacrifica qualidade. | |
| Env var override | WHISPER_MODEL_OVERRIDE. Flexível, requer setup manual. | |

**User's choice:** Default para 'base' quando VRAM = 0 / undefined
**Notes:** Comportamento conservador preferido — evita degradação silenciosa para tiny.

---

## Download dos Modelos

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand: baixar apenas o modelo selecionado no primeiro uso | Zero wait no startup. Delay na primeira transcrição com modelo novo. | |
| Startup: baixar o modelo selecionado no startup do app | Sem delay no uso, app demora mais para abrir se modelo ausente. | |
| Build-time: pré-baixar todos os 3 modelos no electron-builder | Todos bundled no instalador (~1.7GB). Zero runtime download. | ✓ |

**User's choice:** Build-time, todos os 3 modelos

---

### Model Storage Location

| Option | Description | Selected |
|--------|-------------|----------|
| extraResources bundled junto ao app | process.resourcesPath/models/whisper/ — read-only, acesso direto. Requer atualizar whisperResources.ts. | ✓ |
| Copiar de extraResources para userData | Write-able, bom para atualizações futuras. Adiciona complexidade de cópia + verificação. | |

**User's choice:** extraResources (read-only, process.resourcesPath)
**Notes:** Mais simples. Atualizações de modelo ficam para versão futura.

---

## Claude's Discretion

- Placement dos TTS providers (desktop/main/voiceInput/tts/ ou shared package) — não discutido, Claude decide
- TTS failure behavior — seguir WAKE-10 precedent (graceful degrade para texto visível)
- Estrutura interna do voiceHandler.ts

## Deferred Ideas

- Streaming TTS — v1.7+
- Offline TTS (Kokoro) — v1.7+
- Settings UI para seleção manual de modelo — deferred
