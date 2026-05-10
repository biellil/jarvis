---
phase: 67-jarvis-proativo
plan: 09
subsystem: renderer-ui
tags: [proactive, settings, ipc, chat, tts, react]
dependency_graph:
  requires: [67-04, 67-07, 67-08]
  provides: [ProactiveSection-UI, ProactiveEventBubble, IPC-pipeline-renderer]
  affects: [SettingsLayout, ChatContext, App.tsx, ipc-types, preload/settings]
tech_stack:
  added: [tslib (devDependency — fixes react-remove-scroll in Vitest)]
  patterns:
    - TDD RED→GREEN para ProactiveSection (6 testes)
    - McpSection pattern para nova seção de settings com own props interface
    - apply-without-restart pattern para configurações proativas via IPC
    - IPC_CHANNELS registry para type-safe channel names
    - useCallback + NOOP_CHAT pattern para addProactiveMessage em ChatContext
key_files:
  created:
    - apps/desktop/src/renderer/src/settings/sections/ProactiveSection.tsx
    - apps/desktop/src/renderer/src/chat/ProactiveEventBubble.tsx
  modified:
    - apps/desktop/src/renderer/src/settings/__tests__/ProactiveSection.test.tsx
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/renderer/src/chat/ChatContext.tsx
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/package.json (tslib devDependency)
    - pnpm-lock.yaml
decisions:
  - ProactiveSection usa _testPathError prop opcional para testar Field.Error sem round-trip IPC assíncrono nos testes
  - buildProactiveTtsText exportado de App.tsx para testabilidade futura
  - addProactiveMessage em ChatContext; IPC listener em App.tsx (separação de responsabilidades)
  - ProactiveEventBubble renderiza via React JSX (T-67-05 accepted — auto-escape, sem dangerouslySetInnerHTML)
  - tslib instalado como devDependency para resolver react-remove-scroll em testes Vitest com Radix Switch
metrics:
  duration: ~35 minutos
  completed: 2026-05-10
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 8
---

# Phase 67 Plan 09: Settings UI ProactiveSection + ProactiveEventBubble + IPC Pipeline Summary

**One-liner:** ProactiveSection settings UI (quiet hours/folder watch/daily summary) + ProactiveEventBubble (3 kinds com left-stripe color) + pipeline IPC completo renderer→chat usando IPC_CHANNELS.PROACTIVE_EVENT.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ProactiveSection + ProactiveEventBubble | a3cea3b | ProactiveSection.tsx, ProactiveEventBubble.tsx, ProactiveSection.test.tsx, ipc-types.ts, package.json |
| 2 | Wire SettingsLayout + ChatContext + App.tsx | 8533fb3 | SettingsLayout.tsx, ChatContext.tsx, App.tsx, preload/settings.ts, ProactiveSection.test.tsx |

## What Was Built

### Task 1: ProactiveSection + ProactiveEventBubble

**ProactiveSection.tsx** (`apps/desktop/src/renderer/src/settings/sections/ProactiveSection.tsx`):
- 3 grupos conforme UI-SPEC.md: Horário silencioso, Monitorar pasta, Resumo diário
- Props interface própria (padrão McpSection): `quietHours`, `onQuietHoursChange`, `folderWatch`, `onFolderWatchChange`, `dailySummary`, `onDailySummaryChange`
- Toggle Switch para cada grupo; time inputs desabilitados quando toggle off
- Field.Error "Pasta não encontrada" via prop `_testPathError` (estado interno + override de teste)
- `role="region" aria-label="Notificações proativas"` para acessibilidade
- Folder picker via `window.jarvis.openDirectoryDialog()` (fire-and-forget)

**ProactiveEventBubble.tsx** (`apps/desktop/src/renderer/src/chat/ProactiveEventBubble.tsx`):
- Renderiza 3 kinds: `reminder` (🔔 border-accent), `folder_event` (📁 border-success), `daily_summary` (🌅 border-accent)
- Conteúdo folder_event: 1 arquivo → nome; 2-5 → comma-separated; 6+ → "nome, nome, nome e mais N-3"
- Timestamp formatado pt-BR HH:MM com `<time dateTime={isoTimestamp}>`
- `role="article" aria-label="Notificação proativa: {kind}: {title}"`
- T-67-05 mitigado: conteúdo via JSX React (auto-escape, sem dangerouslySetInnerHTML)

**ipc-types.ts** extensões:
- `IPC_CHANNELS.PROACTIVE_EVENT = 'proactive:event'`
- `SettingsApi.applyQuietHours/applyFolderWatch/applyDailySummary/onProactiveEvent`

**Testes ProactiveSection (6/6 passando):**
- renders "Notificações proativas" section heading
- quiet hours time inputs disabled/enabled conforme toggle
- folder path input disabled quando folderWatchEnabled=false
- Field.Error "Pasta não encontrada" via _testPathError prop
- daily summary time input disabled quando dailySummaryEnabled=false

### Task 2: Wire SettingsLayout + ChatContext + App.tsx

**SettingsLayout.tsx:**
- `SectionKey` extendido com `'proactive-notifications'`
- NAV_ITEMS: `{ key: 'proactive-notifications', label: 'Notificações proativas', Icon: Bell }` (último item)
- State: `quietHours`, `folderWatch`, `dailySummary` com defaults (D-10, D-13, D-17)
- `settings.get()` carrega configs proativas do electron-store
- Handlers: `handleQuietHoursChange`, `handleFolderWatchChange`, `handleDailySummaryChange`
- `renderSection()` case: `<ProactiveSection .../>` com todos os props e handlers

**ChatContext.tsx:**
- `ChatRole` extendido: `'human' | 'agent' | 'proactive'`
- `ChatMessage.proactiveEvent?: ProactiveEvent` (Phase 67 field)
- `addProactiveMessage(evt: ProactiveEvent)` em `ChatContextValue`, `ChatProvider`, e `NOOP_CHAT`
- Import `ProactiveEvent` de `ipc-types`

**App.tsx:**
- `buildProactiveTtsText(evt: ProactiveEvent): string` — helper pt-BR exportado, 3 kinds
- `AppContent` extrai `addProactiveMessage` do `useChat()`
- `useEffect` subscreve `IPC_CHANNELS.PROACTIVE_EVENT` via `window.jarvis.ipcRenderer.on`
- Handler: `addProactiveMessage(evt)` + TTS via `window.jarvis.speakText?.()` com graceful degrade
- Cleanup correto: `ipcRenderer.off` no return do useEffect
- TODO comment para MessageList futuro (renderização de bubbles no chat)

**preload/settings.ts:**
- Implementa `applyQuietHours/applyFolderWatch/applyDailySummary` via `ipcRenderer.invoke`
- Implementa `onProactiveEvent` listener com pattern de unsubscribe correto

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bug] Missing tslib dependency broke Vitest com Radix Switch**
- **Found during:** Task 1 (RED phase — testes falharam com `Cannot find module 'tslib'`)
- **Issue:** `react-remove-scroll` (depedência do `@radix-ui/react-switch`) usa `tslib` como peer dependency não instalada
- **Fix:** `pnpm add -D tslib` — instala como devDependency em `apps/desktop`
- **Files modified:** `apps/desktop/package.json`, `pnpm-lock.yaml`
- **Commit:** a3cea3b

**2. [Rule 1 - Bug] Path relativo errado em ProactiveSection.test.tsx para ipc-types**
- **Found during:** Task 2 verificação TypeScript
- **Issue:** Import usava `../../../../../shared/ipc-types` (5 níveis) mas o correto é `../../../../shared/ipc-types` (4 níveis)
- **Fix:** Correto o path relativo
- **Files modified:** `apps/desktop/src/renderer/src/settings/__tests__/ProactiveSection.test.tsx`
- **Commit:** 8533fb3

**3. [Rule 2 - Missing critical functionality] preload/settings.ts não implementava applyQuietHours/applyFolderWatch/applyDailySummary/onProactiveEvent**
- **Found during:** Task 2 verificação TypeScript (`TS2739: missing properties from SettingsApi`)
- **Issue:** ipc-types.ts define os métodos em SettingsApi mas o preload não os implementava, causando erro TS
- **Fix:** Implementar os 4 métodos em `preload/settings.ts`
- **Files modified:** `apps/desktop/src/preload/settings.ts`
- **Commit:** 8533fb3

## Known Stubs

Nenhum stub que impeça o objetivo do plano. A UI de ProactiveSection está completamente funcional. O TODO no App.tsx para MessageList é intencional — o pipeline IPC→ChatContext está completo, apenas a renderização visual das bolhas no orb-UI (que ainda não tem MessageList) está pendente para plano futuro.

## Threat Flags

Nenhuma nova superfície de segurança introduzida além do que está no `<threat_model>` do plano.

## Verification Results

```
npx vitest run ProactiveSection → 6/6 PASS
grep "Notificações proativas" SettingsLayout.tsx → MATCH (linha 32)
grep "border-accent|border-success" ProactiveEventBubble.tsx → MATCH
grep "addProactiveMessage" ChatContext.tsx → MATCH (linhas 62, 240, 310, 329)
grep "proactive:event|PROACTIVE_EVENT" App.tsx → MATCH
grep "PROACTIVE_EVENT" ipc-types.ts → MATCH (linha 330)
npx tsc --noEmit (renderer/preload files) → 0 errors
```

## Self-Check: PASSED

- ProactiveSection.tsx: FOUND
- ProactiveEventBubble.tsx: FOUND
- ProactiveSection.test.tsx: FOUND (6/6 testes passando)
- ipc-types.ts PROACTIVE_EVENT: FOUND
- ChatContext addProactiveMessage: FOUND
- App.tsx proactive:event listener: FOUND
- SettingsLayout proactive-notifications case: FOUND
- preload/settings.ts applyQuietHours: FOUND
- Commits a3cea3b e 8533fb3: FOUND
