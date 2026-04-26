---
phase: 40-always-listening-intent-classifier
plan: 06
subsystem: settings
tags: [vad, settings-ui, ipc, electron, react, slider]

requires:
  - phase: 40
    provides: AlwaysListeningEngine.reconfigureVadThreshold (40-04), settings:get exposure (40-05), VAD_THRESHOLD IPC channel (40-02)
provides:
  - Settings UI slider 300-800ms para VAD silence threshold (VLISTEN-04)
  - Runtime apply de threshold sem reiniciar always-listening
  - IPC roundtrip SettingsForm → settings:set handler → vad:threshold-changed broadcast → AlwaysListeningEngine.reconfigureVadThreshold
  - SettingsApi.setVadThreshold(ms) exposto no preload
affects: [phase-41-tray, future-vad-tuning]

tech-stack:
  added: []
  patterns:
    - "preload IPC roundtrip com clamp duplicado (boundary + UI)"
    - "main → renderer broadcast via 'vad:threshold-changed' separado do canal invoke"

key-files:
  created: []
  modified:
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts
    - apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts
    - apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/renderer/src/settings/SettingsForm.tsx
    - apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx
    - apps/desktop/src/renderer/src/styles/globals.css
    - apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts
    - apps/desktop/src/renderer/src/voice/alwaysListening/__tests__/AlwaysListeningEngine.test.ts
    - apps/desktop/src/shared/ipc-types.ts

key-decisions:
  - "Handler ALWAYS_LISTENING_VAD_THRESHOLD movido da AlwaysListeningStrategy para ipc/settings.ts: sempre disponível mesmo fora de always-listening (settings UI deve poder ajustar mesmo com modo desligado)"
  - "Canais separados por direção: ALWAYS_LISTENING_VAD_THRESHOLD (renderer→main invoke) vs vad:threshold-changed (main→renderer broadcast) — direção do evento fica explícita"
  - "CSS via classe .slider-vad-threshold em vez de selector global input[type=range]: evita afetar outros sliders presentes ou futuros"
  - "VAD_THRESHOLD_CHANNEL inlinado em preload/settings.ts (vs importar IPC_CHANNELS): preload sandbox não suporta chunk split do Rollup"

patterns-established:
  - "Preload com 1 canal IPC: inlinar string literal em vez de importar IPC_CHANNELS para preservar bundle único auto-contido"
  - "Range input com label dinâmico right-aligned ao lado do título da seção (não dentro do helper text)"

requirements-completed: [VLISTEN-04]

duration: ~17min
completed: 2026-04-26
---

# Phase 40-06: Settings UI VAD Threshold Slider Summary

**Slider Always-Listening 300-800ms agora está plumbado end-to-end: ajuste em runtime apply na engine sem reiniciar o app, com persistência no store e clamp em três lugares (UI, preload boundary, store).**

## Performance

- **Duration:** ~17 min
- **Tasks:** 2/2 (1 checkpoint visual confirmado pelo usuário)
- **Files modified:** 11
- **Test results:** 113/113 GREEN no escopo Phase 40

## Accomplishments

### IPC plumbing (Task 1)
- `settings:get` retorna `vadSilenceThresholdMs` do store (já tinha sido feito no 40-05; mantido)
- Handler `ALWAYS_LISTENING_VAD_THRESHOLD` movido para `ipc/settings.ts` com clamp `[300, 800]ms` e broadcast `vad:threshold-changed` no sucesso
- AlwaysListeningStrategy não registra mais o handler (responsabilidade de settings agora) — adapta tests
- Preload `setVadThreshold(ms)` adicionado em `SettingsApi`

### Settings UI (Task 2)
- Nova seção "Always-Listening" no `SettingsForm.tsx` entre Push-to-Talk e Text-to-Speech
- Slider range `300-800ms` (step 50ms, default 500ms), thumb cyan, value display "XXX ms" right-aligned
- Helper text explicando trade-off responsiveness vs patience
- Botão "Reset to Default (500ms)"
- AlwaysListeningEngine escuta `vad:threshold-changed`, converte ms → negFrames e chama `MicVAD.setOptions({redemptionMs})` em runtime

### Visual verification (Task 3 — checkpoint)
- Usuário confirmou os 9 pontos do `<how-to-verify>` do plan: seção visível, slider funcional, clamp respeitado, reset, persistência e (quando aplicável) reconfigure runtime ok.

## Architectural deviations applied

1. **[Rule 3 — Blocking]** Worktree base reset de `ac5ffbd` para `de1a809` (post-Wave 2)
2. **[Rule 2 — API surface]** Adicionado `setVadThreshold` em `SettingsApi` + `preload/settings.ts` (preload só expunha get/save/close — slider não conseguiria invocar IPC sem isso)
3. **[Plan note follow-through]** Handler do VAD_THRESHOLD movido da Strategy para settings.ts conforme nota do plan
4. **Channel direction split** — `ALWAYS_LISTENING_VAD_THRESHOLD` (invoke renderer→main) vs `vad:threshold-changed` (broadcast main→renderer)
5. **CSS scope** — classe `.slider-vad-threshold` em vez de selector global

## Post-checkpoint deviations (debugging post-merge)

**Sandbox preload chunk extraction bug** — após merge final do 40-06, ao tentar rodar `pnpm dev` no Windows, o preload falhava com:
```
Unable to load preload script: dist/preload/index.js
Error: module not found: ./chunks/ipc-types-DKTZQ0T_.cjs
```

Causa: ambos preloads (`index.ts` + `settings.ts`) importavam `IPC_CHANNELS` de `shared/ipc-types`. Rollup extraía em chunk compartilhado. Electron sandbox `preloadRequire` não suporta chunks.

Fix: removida importação de `IPC_CHANNELS` em `preload/settings.ts` (que só usa 1 canal); inline literal `VAD_THRESHOLD_CHANNEL = 'always-listening:vad-threshold'`. Agora `ipc-types` é dependência exclusiva de `index.ts` → Rollup bundla inline → cada preload é arquivo CJS único.

Commit: `🐛 fix(preload): inlinar VAD_THRESHOLD_CHANNEL pra evitar chunk split em sandbox`

## Requirements

- ✅ VLISTEN-04: Configurable VAD silence threshold (300-800ms, runtime apply, default 500ms)

## Threats mitigated

- T-40-VAD: Clamp triplicado (UI input range, preload boundary, store accessor) garante que valores fora do range nunca chegam ao engine

## Open items

Nenhum. Phase 40-06 fechado.
