---
phase: 260427-tjc
plan: 01
subsystem: settings-ui
tags: [tts, settings, ui, electron, voice-id]
type: quick
requires:
  - existing-tts-providers (MurfTTSProvider, ElevenLabsTTSProvider já lendo process.env)
  - existing-store-pattern (getTtsApiKey/setTtsApiKey como referência)
  - existing-ipc-settings (handler settings:get/save + reinitializeTTS)
provides:
  - getTtsVoiceId(provider) / setTtsVoiceId(provider, id) com isolation per-provider
  - SettingsData.ttsVoiceIds + SaveSettingsRequest.ttsVoiceIds (Record<TtsProviderOption, string>)
  - settings:get retorna ttsVoiceIds populado pelo store
  - settings:save persiste cada provider e dispara reinitializeTTS quando voice ID muda
  - TtsProviderSelect renderiza input "Voice ID" controlado per-provider
  - SettingsForm gerencia state ttsVoiceIds e envia objeto completo no save
  - createTTSProvider() injeta MURF_VOICE_ID/ELEVENLABS_VOICE_ID em process.env (skip quando vazio)
affects:
  - apps/desktop/src/main/store.ts (schema + accessores)
  - apps/desktop/src/shared/ipc-types.ts (contratos SettingsData/SaveSettingsRequest)
  - apps/desktop/src/main/ipc/settings.ts (get/save handlers)
  - apps/desktop/src/main/voiceInput/tts/index.ts (factory env injection)
  - apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx (input UI)
  - apps/desktop/src/renderer/src/settings/SettingsForm.tsx (state + load/save)
tech-stack:
  added: []
  patterns:
    - Per-provider object schema no electron-store (preserva isolamento entre providers)
    - Defensive guard para non-string input (espelha setWakeWordPaused pattern)
    - Empty-string sentinel = use provider default (zero-break compat retroativa)
    - Reuse do reinitializeTTS gate (estende condição em vez de criar canal novo)
key-files:
  created: []
  modified:
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/voiceInput/tts/index.ts
    - apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx
    - apps/desktop/src/renderer/src/settings/SettingsForm.tsx
    - apps/desktop/src/main/__tests__/store.test.ts (+6 tests)
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts (+5 tests)
    - apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx (+3 tests)
decisions:
  - "Voice ID é per-provider (objeto no store) — não global — para usuário poder alternar entre Murf e ElevenLabs sem perder a config do outro"
  - "Empty string no store = use default hardcoded do provider — zero break para users existentes; injeção em process.env é skip quando vazio"
  - "UI envia objeto completo no save (não diff parcial) — payload é trivial e simplifica handler"
  - "Sem validação de formato no UI — Murf usa 'pt-BR-heitor' e ElevenLabs usa hash alfanumérico; backend recebe como-está e providers respondem com 4xx se inválido"
  - "Estende condição do reinitializeTTS gate em vez de criar canal IPC novo — mesma estratégia de SET-03 para API key live-reload"
metrics:
  duration_seconds: 498
  duration_human: "~8 minutes"
  tasks_completed: 2
  tests_added: 14
  tests_passed: 88
  files_modified: 9
  completed_date: "2026-04-27"
---

# Quick Task 260427-tjc: Voice ID Field in TTS Settings UI Summary

Adicionado campo "Voice ID" per-provider na seção Text-to-Speech do Settings, com persistência em electron-store, injeção em `process.env` antes da factory instanciar o provider, e live-reload via `reinitializeTTS()` ao salvar — fechando o gap onde o usuário precisava editar `.env` e reiniciar o app para trocar a voz do TTS.

## What Was Built

### Storage Layer (`store.ts`)

- Schema estendido com `ttsVoiceIds?: { murf?: string; elevenlabs?: string }`.
- `getTtsVoiceId(provider)` retorna `''` quando vazio (compat retroativa).
- `setTtsVoiceId(provider, id)` faz spread do objeto existente para preservar o outro provider — evita o bug de `store.set('ttsVoiceIds', { [provider]: id })` apagar a outra chave.
- Defensive guard: rejeita silenciosamente input não-string (espelha `setWakeWordPaused`).

### IPC Contracts (`ipc-types.ts`)

- `SettingsData.ttsVoiceIds: Record<TtsProviderOption, string>` (sempre presente).
- `SaveSettingsRequest.ttsVoiceIds?: Partial<Record<TtsProviderOption, string>>` (parcial — UI pode enviar só o que mudou, mas atualmente envia objeto completo).

### Factory Env Injection (`tts/index.ts`)

- `createTTSProvider()` lê `getTtsVoiceId('murf')` e `getTtsVoiceId('elevenlabs')` antes do bloco que decide o provider.
- Injeta em `process.env['MURF_VOICE_ID']` / `process.env['ELEVENLABS_VOICE_ID']` **apenas quando não-vazio** — mantém env unset para que provider use seu default hardcoded.

### IPC Handlers (`ipc/settings.ts`)

- `settings:get` retorna `ttsVoiceIds: { murf, elevenlabs }` populado pelo store.
- `settings:save` itera `request.ttsVoiceIds` e chama `setTtsVoiceId` por provider; estende o gate de `reinitializeTTS()` para também disparar quando `ttsVoiceIds` mudar.

### UI Components

- `TtsProviderSelect.tsx`: novo input "Voice ID" controlled, com placeholder específico por provider (`pt-BR-heitor (default)` para Murf, `EXAVITQu4vr4xnSDxMaL (default)` para ElevenLabs) e helper text `"Leave empty to use provider's default voice."`.
- `SettingsForm.tsx`: state `ttsVoiceIds: Record<TtsProviderOption, string>`, hidrata do `settings:get`, mostra valor do provider ativo (`ttsVoiceIds[ttsProvider]`), e envia objeto completo no `handleSave`.

## Files Created/Modified

### Modified

- `apps/desktop/src/main/store.ts` — schema + 2 accessores novos com defensive guard.
- `apps/desktop/src/shared/ipc-types.ts` — `SettingsData.ttsVoiceIds` (required) e `SaveSettingsRequest.ttsVoiceIds` (partial).
- `apps/desktop/src/main/ipc/settings.ts` — settings:get retorna ttsVoiceIds; settings:save persiste e estende gate de reinitializeTTS.
- `apps/desktop/src/main/voiceInput/tts/index.ts` — factory injeta MURF_VOICE_ID / ELEVENLABS_VOICE_ID em process.env (skip quando vazio).
- `apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx` — adiciona props `voiceId` + `onVoiceIdChange` e renderiza input com placeholder específico por provider.
- `apps/desktop/src/renderer/src/settings/SettingsForm.tsx` — state per-provider + handler `handleVoiceIdChange` + envia ttsVoiceIds no save.
- `apps/desktop/src/main/__tests__/store.test.ts` — +6 tests (defaults, isolation, defensive guard).
- `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — +5 tests (get retorna ttsVoiceIds; save itera providers; reinit gate).
- `apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx` — +3 tests (input mostra valor do provider ativo, troca preserva valores, save envia payload correto).

## Test Coverage

- 6 tests novos em `store.test.ts` — get/set, isolation entre providers, defensive guard non-string.
- 5 tests novos em `settings.test.ts` — get inclui ttsVoiceIds; save itera providers chamando setTtsVoiceId N vezes; reinit é triggered quando ttsVoiceIds presente; reinit NÃO é triggered quando só pttHotkey muda.
- 3 tests novos em `SettingsForm.test.tsx` — A: input mostra valor do provider ativo no mount; B: trocar provider muda o valor exibido sem perder o anterior; C: editar + Save envia ttsVoiceIds com novo valor.

**Total: 14 tests novos, 88 tests passando nas 3 suítes afetadas, zero regressão.**

## Verification

### Automated

- `npx vitest run src/main/__tests__/store.test.ts` — 34/34 passing
- `npx vitest run src/main/ipc/__tests__/settings.test.ts` — 34/34 passing
- `npx vitest run src/renderer/src/settings/__tests__/SettingsForm.test.tsx` — 20/20 passing
- TypeScript: zero novos erros nos arquivos modificados (erros pré-existentes documentados em `deferred-items.md`)

### Manual smoke (não automatizado)

1. `cd apps/desktop && npm run dev`
2. Abrir Settings → seção Text-to-Speech
3. Trocar provider (Murf ↔ ElevenLabs) e confirmar que o input "Voice ID" mostra valores independentes
4. Setar voice ID alternativo (ex: `pt-BR-gustavo` para Murf), salvar
5. Verificar log `[settings] TTS provider re-initialized after settings save`
6. Trigger TTS → voz mudou para a configurada (sem reiniciar app)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] settings.ts faltando ttsVoiceIds quebrava tsc**

- **Found during:** Task 1 (após adicionar `ttsVoiceIds` como required em `SettingsData`).
- **Issue:** `settings:get` handler não populava `ttsVoiceIds` no return, gerando `TS2741: Property 'ttsVoiceIds' is missing in type '...' but required in type 'SettingsData'`.
- **Fix:** Adicionada a wiring de `getTtsVoiceId` em settings.ts já no Task 1 (o plano programava isso para Task 2). Task 2 estendeu apenas o save handler.
- **Files modified:** `apps/desktop/src/main/ipc/settings.ts` (commit Task 1)
- **Commit:** e6608c0

### Pre-existing Issues (Out of Scope)

Documentado em `deferred-items.md`:
- `tts-providers.test.ts` falha ao carregar (ElectronStore sem `projectName` em runtime Vitest) — pré-existente em master HEAD.
- Vários TS errors em arquivos não tocados (voiceHandler, useWakeWord, ChatInput, useMultiTurnWindow, rmsZeroGuard.test) — todos pré-existentes.

## Compatibility & Migration

- **Zero break para usuários existentes:** Voice ID vazio (default `''`) é tratado como "use provider default" — `MurfTTSProvider` continua usando `pt-BR-heitor` e `ElevenLabsTTSProvider` continua usando `EXAVITQu4vr4xnSDxMaL` quando o store está vazio.
- **Migração v1.x → v1.9 silenciosa:** Users sem `ttsVoiceIds` no store não notam mudança nenhuma. Próxima vez que abrirem Settings, vão ver o novo input vazio com o placeholder mostrando qual é o default.
- **`.env` overrides ainda funcionam:** Se o user já tinha `MURF_VOICE_ID=pt-BR-gustavo` no `.env`, esse valor é sobrescrito pelo store apenas se o user setar voice ID via Settings UI. Caso contrário, o `.env` continua sendo usado.

## Próximo Passo (Opcional para o Usuário)

Setar voice IDs preferidos via Settings UI:
- **Murf masculino mais grave (recomendado):** `pt-BR-gustavo`
- **Murf alternativas pt-BR:** `pt-BR-benicio`, `pt-BR-silvio`, `pt-BR-yago`
- **ElevenLabs:** ID alfanumérico do dashboard ElevenLabs (ex: voz custom clonada)

## Self-Check: PASSED

**Files verified:**
- FOUND: apps/desktop/src/main/store.ts
- FOUND: apps/desktop/src/shared/ipc-types.ts
- FOUND: apps/desktop/src/main/ipc/settings.ts
- FOUND: apps/desktop/src/main/voiceInput/tts/index.ts
- FOUND: apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx
- FOUND: apps/desktop/src/renderer/src/settings/SettingsForm.tsx

**Commits verified:**
- FOUND: e6608c0 (Task 1: store + ipc-types + factory + settings:get wiring)
- FOUND: 48ad030 (Task 2: settings:save + UI components + tests)
