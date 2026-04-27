---
plan: 44-01
phase: 44-hardening-migration
status: complete
completed: 2026-04-27
tasks_total: 3
tasks_complete: 3
self_check: PASSED
---

## Summary

macOS permission gate para voice mode switch implementado (VHARD-01). Gate verifica `systemPreferences.getMediaAccessStatus('microphone')` antes de `setMode()` para always-listening e ptt-only no macOS — sem prompt, apenas read-only. Em Linux/Windows o check é completamente ignorado. Toast acionável com botão "Abrir System Settings" wired end-to-end: tray.ts → broadcastModeSwitch → renderer useEffect → Toast component → preload → ipcMain → shell.openExternal(). Migration tests v1.8→v1.9 adicionados.

## Key Files

### Created
- (nenhum arquivo novo)

### Modified
- `apps/desktop/src/shared/ipc-types.ts` — VoiceModeSwitchResult estendida com `blockedReason?: 'mic-permission-denied'` e `settingsUrl?: string`; IPC_CHANNELS com `SHELL_OPEN_SYSTEM_SETTINGS: 'shell:open-system-settings'`; JarvisAPI com `openSystemSettings?: () => void`
- `apps/desktop/src/main/tray.ts` — Permission gate macOS-only inserido antes de setMode(): verifica 'darwin', always-listening e ptt-only, getMediaAccessStatus, broadcastModeSwitch com blockedReason e URL hardcoded
- `apps/desktop/src/main/ipc/voiceMode.ts` — `registerOpenSystemSettingsHandler()`: ipcMain.handle que abre URL hardcoded via shell.openExternal() (URL não vem do renderer — T-44-02 mitigation)
- `apps/desktop/src/main/ipc/index.ts` — chama `registerOpenSystemSettingsHandler()` em setupIpcHandlers
- `apps/desktop/src/preload/index.ts` — `openSystemSettings(): void` exposto via contextBridge (D-04)
- `apps/desktop/src/renderer/src/chat/ChatContext.tsx` — ToastState.action? { label, onClick } para toasts acionáveis
- `apps/desktop/src/renderer/src/components/Toast.tsx` — botão de ação opcional com stopPropagation e styles
- `apps/desktop/src/renderer/src/App.tsx` — useEffect escuta voice-mode:switch-result, exibe toast warning com botão "Abrir System Settings"
- `apps/desktop/src/main/__tests__/tray.test.ts` — 6 source-level assertions VHARD-01 (D-01 a D-06)
- `apps/desktop/src/main/__tests__/store.test.ts` — 3 migration tests D-11/D-12/D-13 (v1.8→v1.9)

## Decisions

- **D-03**: broadcastModeSwitch com blockedReason e settingsUrl quando microfone negado — renderer não precisa saber qual URL, só recebe o sinal
- **D-04**: Toast acionável end-to-end — ChatContext.ToastState extendido com campo action para não duplicar componente Toast
- **D-06**: Todos os status não-'granted' (not-determined, denied, restricted) são tratados como bloqueados — switch não ocorre
- **T-44-02**: URL de System Settings hardcoded em tray.ts e ipc/voiceMode.ts — nunca recebida do renderer. Handler ignora qualquer payload do renderer.

## Test Status

- `npm test -- tray.test.ts --run` → 27 passed (incluindo 6 novos VHARD-01)
- `npm test -- store.test.ts --run` → 28 passed (incluindo 3 novos migration D-11/D-12/D-13)
- Full suite: falhas pré-existentes (security.test.ts, WakeWordEngine.test.ts, voiceHandler.test.ts, etc.) — nenhuma nova falha introduzida por Phase 44
