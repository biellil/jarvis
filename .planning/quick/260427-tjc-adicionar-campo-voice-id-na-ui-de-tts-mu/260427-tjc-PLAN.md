---
phase: 260427-tjc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/voiceInput/tts/index.ts
  - apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx
  - apps/desktop/src/renderer/src/settings/SettingsForm.tsx
  - apps/desktop/src/main/__tests__/store.test.ts
  - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  - apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx
autonomous: true
requirements:
  - QUICK-260427-tjc

must_haves:
  truths:
    - "Usuário consegue ver e editar um input 'Voice ID' na seção Text-to-Speech do Settings"
    - "Voice ID é persistido por provider — ao trocar Provider, o input mostra o ID daquele provider"
    - "Voice ID salvo é injetado em process.env (MURF_VOICE_ID ou ELEVENLABS_VOICE_ID) antes de instanciar o provider"
    - "Quando Voice ID está vazio, o provider TTS continua usando o default hardcoded (compat retroativa: pt-BR-heitor / EXAVITQu4vr4xnSDxMaL)"
    - "Salvar settings com Voice ID novo dispara reinitializeTTS() para aplicar imediatamente"
  artifacts:
    - path: "apps/desktop/src/main/store.ts"
      provides: "getTtsVoiceId(provider) / setTtsVoiceId(provider, id) com schema { murf: string; elevenlabs: string }"
    - path: "apps/desktop/src/shared/ipc-types.ts"
      provides: "SettingsData.ttsVoiceIds e SaveSettingsRequest.ttsVoiceIds (Record<TtsProviderOption, string>)"
    - path: "apps/desktop/src/main/ipc/settings.ts"
      provides: "Handler settings:get retorna ttsVoiceIds; settings:save persiste e dispara reinitializeTTS quando voiceId muda"
    - path: "apps/desktop/src/main/voiceInput/tts/index.ts"
      provides: "createTTSProvider() injeta ttsVoiceIds[provider] em process.env antes de instanciar (apenas se não-vazio)"
    - path: "apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx"
      provides: "Input 'Voice ID' controlado, mostra valor do provider ativo"
    - path: "apps/desktop/src/renderer/src/settings/SettingsForm.tsx"
      provides: "State ttsVoiceIds: Record<TtsProviderOption, string> + handler onVoiceIdChange + envia no save"
  key_links:
    - from: "TtsProviderSelect"
      to: "SettingsForm.ttsVoiceIds[provider]"
      via: "props voiceId + onVoiceIdChange"
      pattern: "voiceId={ttsVoiceIds\\[ttsProvider\\]}"
    - from: "SettingsForm.handleSave"
      to: "window.settings.save({ ttsVoiceIds })"
      via: "IPC settings:save"
      pattern: "ttsVoiceIds:\\s*ttsVoiceIds"
    - from: "createTTSProvider()"
      to: "process.env[`${PROVIDER}_VOICE_ID`]"
      via: "injeção pré-instanciação"
      pattern: "process\\.env\\['(MURF|ELEVENLABS)_VOICE_ID'\\]\\s*="
---

<objective>
Adicionar campo "Voice ID" na UI de Settings de TTS, persistido por provider (Murf e ElevenLabs), em vez de depender de env var hardcoded em runtime.

Purpose: Hoje o usuário não consegue mudar a voz de TTS sem editar `.env` e reiniciar o app. Com isso o app é "voz fixa por deploy". Esta task fecha esse gap permitindo escolher voice ID direto no Settings UI — alinhado ao mesmo padrão de SET-03 (TTS API key live-reload).

Output: Campo `Voice ID` na seção Text-to-Speech do Settings, persistência por-provider no electron-store, injeção em `process.env` antes da factory instanciar, e live-reload via `reinitializeTTS()` ao salvar.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

<!-- Existing source files this plan modifies -->
@apps/desktop/src/main/store.ts
@apps/desktop/src/shared/ipc-types.ts
@apps/desktop/src/main/ipc/settings.ts
@apps/desktop/src/main/voiceInput/tts/index.ts
@apps/desktop/src/main/voiceInput/tts/elevenlabs.ts
@apps/desktop/src/main/voiceInput/tts/murf.ts
@apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx
@apps/desktop/src/renderer/src/settings/SettingsForm.tsx
@apps/desktop/src/preload/settings.ts

<!-- Existing tests to extend -->
@apps/desktop/src/main/__tests__/store.test.ts
@apps/desktop/src/main/ipc/__tests__/settings.test.ts
@apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx

<interfaces>
<!-- Contracts já existentes hoje no codebase, extraídos para o executor não precisar caçar. -->

From apps/desktop/src/shared/ipc-types.ts (atualmente):
```typescript
export type TtsProviderOption = 'murf' | 'elevenlabs';

export interface SettingsData {
  pttHotkey: string;
  ttsProvider: TtsProviderOption;
  ttsApiKey: string;
  whisperModelOverride: WhisperModelOption;
  vadSilenceThresholdMs: number;
  // ADICIONAR neste task: ttsVoiceIds: Record<TtsProviderOption, string>
}

export interface SaveSettingsRequest {
  pttHotkey?: string;
  ttsProvider?: TtsProviderOption;
  ttsApiKey?: string;
  whisperModelOverride?: WhisperModelOption;
  // ADICIONAR neste task: ttsVoiceIds?: Partial<Record<TtsProviderOption, string>>
}
```

From apps/desktop/src/main/store.ts (padrão a seguir — espelhar getTtsApiKey/setTtsApiKey):
```typescript
// Schema atual
ttsProvider?: { name: 'murf' | 'elevenlabs' };
ttsApiKey?: { key: string };
// ADICIONAR: ttsVoiceIds?: { murf?: string; elevenlabs?: string }

export function getTtsApiKey(): string {
  return store.get('ttsApiKey')?.key ?? '';
}
export function setTtsApiKey(key: string): void {
  store.set('ttsApiKey', { key });
}
```

From apps/desktop/src/main/voiceInput/tts/index.ts (padrão de injeção em process.env):
```typescript
// Padrão atual para API key — replicar para VOICE_ID
if (storedApiKey) {
  if (storedProvider === 'murf') {
    process.env['MURF_API_KEY'] = storedApiKey;
  } else {
    process.env['ELEVENLABS_API_KEY'] = storedApiKey;
  }
}
```

From apps/desktop/src/main/voiceInput/tts/{murf,elevenlabs}.ts:
```typescript
// MurfTTSProvider lê:    process.env["MURF_VOICE_ID"]    ?? "pt-BR-heitor"
// ElevenLabsTTSProvider: process.env["ELEVENLABS_VOICE_ID"] ?? "EXAVITQu4vr4xnSDxMaL"
// IMPORTANTE: providers NÃO são alterados — só a factory injeta env antes de instanciá-los.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Adicionar persistência ttsVoiceIds no store + estender IPC types + injeção na factory TTS</name>
  <files>
    apps/desktop/src/main/store.ts,
    apps/desktop/src/shared/ipc-types.ts,
    apps/desktop/src/main/voiceInput/tts/index.ts,
    apps/desktop/src/main/__tests__/store.test.ts
  </files>
  <behavior>
    store.test.ts (extender bloco existente "Phase 34: TTS provider accessors"):
    - Test 1: getTtsVoiceId('murf') retorna '' quando store está vazio
    - Test 2: getTtsVoiceId('elevenlabs') retorna '' quando store está vazio
    - Test 3: setTtsVoiceId('murf', 'pt-BR-gustavo') depois getTtsVoiceId('murf') retorna 'pt-BR-gustavo'
    - Test 4: setTtsVoiceId em um provider NÃO afeta o outro provider (isolation)
    - Test 5: setTtsVoiceId persiste em store.ts schema 'ttsVoiceIds' como objeto { murf?, elevenlabs? }
    - Test 6: Defensive — setTtsVoiceId rejeita silenciosamente input não-string (espelha padrão de setWakeWordPaused)
  </behavior>
  <action>
    **1) `apps/desktop/src/shared/ipc-types.ts`** — estender contratos:
    - Adicionar campo `ttsVoiceIds: Record<TtsProviderOption, string>` em `SettingsData` (sempre presente, default `{ murf: '', elevenlabs: '' }`).
    - Adicionar campo opcional `ttsVoiceIds?: Partial<Record<TtsProviderOption, string>>` em `SaveSettingsRequest` (parcial — UI só envia o que mudou).
    - Manter comentário explicativo curto: "Phase QUICK-260427-tjc: per-provider voice ID. Empty string = use provider's hardcoded default."

    **2) `apps/desktop/src/main/store.ts`** — adicionar acessores espelhando padrão `getTtsApiKey/setTtsApiKey`:
    - Estender `StoreSchema` com `ttsVoiceIds?: { murf?: string; elevenlabs?: string }`.
    - Implementar `getTtsVoiceId(provider: 'murf' | 'elevenlabs'): string` — retorna `store.get('ttsVoiceIds')?.[provider] ?? ''`.
    - Implementar `setTtsVoiceId(provider: 'murf' | 'elevenlabs', voiceId: string): void`:
      - Defensive guard: se `typeof voiceId !== 'string'`, console.error e return (mesmo padrão de `setWakeWordPaused`).
      - Lê o objeto existente, faz spread, sobrescreve só a chave do provider, e persiste — preserva o outro provider (NÃO usar `store.set('ttsVoiceIds', { [provider]: voiceId })` porque isso apaga o outro).
    - Comentário no header das funções: "QUICK-260427-tjc: voice ID per provider, empty string = provider default".

    **3) `apps/desktop/src/main/voiceInput/tts/index.ts`** — injetar voice ID em `process.env` na factory:
    - Importar `getTtsVoiceId` do store (junto com os imports existentes).
    - Em `createTTSProvider()`, ANTES do bloco que decide `provider`, ler `getTtsVoiceId('murf')` e `getTtsVoiceId('elevenlabs')`.
    - Para CADA voice ID não-vazio, injetar em `process.env`:
      - `if (murfVoiceId) process.env['MURF_VOICE_ID'] = murfVoiceId;`
      - `if (elevenVoiceId) process.env['ELEVENLABS_VOICE_ID'] = elevenVoiceId;`
    - **Crítico:** NÃO escrever string vazia em `process.env` — manter env var unset para que o provider use seu default hardcoded (`?? "pt-BR-heitor"` / `?? "EXAVITQu4vr4xnSDxMaL"`). Isso preserva compat retroativa para users sem voice ID configurado.
    - Comentário inline curto: "QUICK-260427-tjc: store voice ID > env var > provider default".

    **4) Tests** — `apps/desktop/src/main/__tests__/store.test.ts`:
    - Adicionar `describe('getTtsVoiceId / setTtsVoiceId — QUICK-260427-tjc')` espelhando o padrão dos blocos `getTtsProvider/setTtsProvider` existentes.
    - Importar `getTtsVoiceId, setTtsVoiceId` do `../store` (junto com imports atuais).
    - Cobrir os 6 tests listados em `<behavior>`.
    - Para o test de "isolation entre providers": setar 'murf' primeiro, depois 'elevenlabs', e validar que ambos persistiram.

    **NÃO ALTERAR neste task**: nem `murf.ts`, nem `elevenlabs.ts`, nem o `tts-providers.test.ts`. Os providers continuam lendo `process.env` do mesmo jeito — só a factory passa a popular esse env baseado no store.
  </action>
  <verify>
    <automated>cd apps/desktop && npx vitest run src/main/__tests__/store.test.ts</automated>
  </verify>
  <done>
    - `SettingsData.ttsVoiceIds` e `SaveSettingsRequest.ttsVoiceIds` declarados em `ipc-types.ts`.
    - `getTtsVoiceId / setTtsVoiceId` exportados de `store.ts` com defensive guard.
    - `createTTSProvider()` injeta `MURF_VOICE_ID` e `ELEVENLABS_VOICE_ID` em `process.env` quando store não-vazio; pula injeção quando vazio.
    - Todos os 6 tests novos em `store.test.ts` passam.
    - `tsc --noEmit` no monorepo passa (sem broken types em consumers de SettingsData).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire IPC handler settings:get/save + atualizar UI (TtsProviderSelect + SettingsForm)</name>
  <files>
    apps/desktop/src/main/ipc/settings.ts,
    apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx,
    apps/desktop/src/renderer/src/settings/SettingsForm.tsx,
    apps/desktop/src/main/ipc/__tests__/settings.test.ts,
    apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx
  </files>
  <behavior>
    settings.test.ts (estender o bloco existente — segue mesmo padrão dos tests de ttsApiKey):
    - Test 1: settings:get retorna ttsVoiceIds com chaves murf e elevenlabs (ambas string '' por default)
    - Test 2: settings:save com `ttsVoiceIds: { murf: 'pt-BR-gustavo' }` chama setTtsVoiceId('murf', 'pt-BR-gustavo') exatamente uma vez
    - Test 3: settings:save com `ttsVoiceIds: { murf: 'X', elevenlabs: 'Y' }` chama setTtsVoiceId duas vezes (uma por provider)
    - Test 4: settings:save com ttsVoiceIds presente E não-vazio chama reinitializeTTS()
    - Test 5: settings:save SEM ttsVoiceIds (apenas pttHotkey) NÃO chama setTtsVoiceId nem força reinitializeTTS

    SettingsForm.test.tsx (estender o bloco existente — pode adicionar 1-2 testes integrados):
    - Test A: mockSettingsGet retorna ttsVoiceIds={ murf: 'pt-BR-yago', elevenlabs: '' }; após mount, input "Voice ID" mostra 'pt-BR-yago' quando provider selecionado é murf
    - Test B: ao mudar provider de murf → elevenlabs no select, o input "Voice ID" passa a mostrar o valor de elevenlabs (string vazia neste mock) — sem perder o valor anterior de murf
    - Test C: editar input "Voice ID" + clicar Save chama window.settings.save com ttsVoiceIds contendo o novo valor
  </behavior>
  <action>
    **1) `apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx`** — adicionar campo Voice ID:
    - Estender props: adicionar `voiceId: string` e `onVoiceIdChange: (id: string) => void`.
    - Renderizar UM input "Voice ID" abaixo do input "API Key", seguindo o mesmo estilo (Tailwind classes idênticas, `aria-label="TTS voice ID"`, `placeholder` específico por provider:
      - Quando `provider === 'murf'`: placeholder `"pt-BR-heitor (default)"`.
      - Quando `provider === 'elevenlabs'`: placeholder `"EXAVITQu4vr4xnSDxMaL (default)"`.
    - Adicionar texto de ajuda pequeno embaixo do input (text-xs text-white/50): `"Leave empty to use provider's default voice."`.
    - O input é controlled — `value={voiceId}` `onChange={(e) => onVoiceIdChange(e.target.value)}`.
    - Não validar formato no UI (Murf usa "pt-BR-heitor", ElevenLabs usa hash alfanumérico — formatos diferentes e podem mudar). Validação fica no backend dos providers (envia como-está e Murf/ElevenLabs respondem com 4xx se inválido).

    **2) `apps/desktop/src/renderer/src/settings/SettingsForm.tsx`** — state + load + save:
    - Adicionar import: nada novo (já importa `TtsProviderOption`).
    - Adicionar state: `const [ttsVoiceIds, setTtsVoiceIds] = useState<Record<TtsProviderOption, string>>({ murf: '', elevenlabs: '' });`
    - No `useEffect` de load (já existente que chama `window.settings.get()`), adicionar: `setTtsVoiceIds(data.ttsVoiceIds);`
    - Criar handler que atualiza só o provider ativo: `function handleVoiceIdChange(id: string) { setTtsVoiceIds(prev => ({ ...prev, [ttsProvider]: id })); }`
    - Passar para `<TtsProviderSelect>`: `voiceId={ttsVoiceIds[ttsProvider]}` e `onVoiceIdChange={handleVoiceIdChange}`.
    - Em `handleSave`, adicionar `ttsVoiceIds` ao payload do `window.settings.save({...})`. Enviar SEMPRE o objeto completo `{ murf, elevenlabs }` (mais simples que diff parcial — payload é trivial em tamanho).
    - **Não estender** a validação atual de "API key cannot be empty" para Voice ID — Voice ID vazio é caso válido (significa "use default").

    **3) `apps/desktop/src/main/ipc/settings.ts`** — handler get/save:
    - Importar `getTtsVoiceId, setTtsVoiceId` do `../store`.
    - No handler `IPC_CHANNELS.SETTINGS_GET`, adicionar ao retorno: `ttsVoiceIds: { murf: getTtsVoiceId('murf'), elevenlabs: getTtsVoiceId('elevenlabs') }`.
    - No handler `IPC_CHANNELS.SETTINGS_SAVE`, depois do bloco de `ttsApiKey`:
      - `if (request.ttsVoiceIds !== undefined) { for (const [provider, id] of Object.entries(request.ttsVoiceIds)) { if (typeof id === 'string') setTtsVoiceId(provider as 'murf' | 'elevenlabs', id); } }`
    - **Critical:** estender o gate do `reinitializeTTS()` para também disparar quando `ttsVoiceIds` mudar:
      - Atual: `if (request.ttsProvider !== undefined || request.ttsApiKey !== undefined) { ... }`
      - Novo: `if (request.ttsProvider !== undefined || request.ttsApiKey !== undefined || request.ttsVoiceIds !== undefined) { ... }`
    - Comentário curto no diff: `// QUICK-260427-tjc: voice ID change also requires TTS reinit (factory injects env)`.

    **4) Tests** — estender ambos os arquivos de teste:
    - `settings.test.ts`:
      - Mockar `setTtsVoiceId` junto com os mocks já existentes de store (espelhar padrão de `setTtsApiKey`).
      - Mockar `getTtsVoiceId` para retornar valores fixos no test do `settings:get`.
      - Adicionar os 5 tests de `<behavior>` dentro de blocos `describe` apropriados.
    - `SettingsForm.test.tsx`:
      - Atualizar TODOS os `mockSettingsGet.mockResolvedValue(...)` (incluindo o de top-level e o do `beforeEach`) para incluir `ttsVoiceIds: { murf: '', elevenlabs: '' }` — caso contrário o load atual pode quebrar com undefined.
      - Adicionar os 3 tests A/B/C de `<behavior>`. Para o test C, usar `fireEvent.change` no input com `aria-label="TTS voice ID"` e depois `fireEvent.click` no botão Save, validando o payload do `mockSettingsSave`.
  </action>
  <verify>
    <automated>cd apps/desktop && npx vitest run src/main/ipc/__tests__/settings.test.ts src/renderer/src/settings/__tests__/SettingsForm.test.tsx src/main/voiceInput/tts/__tests__/tts-providers.test.ts</automated>
  </verify>
  <done>
    - `TtsProviderSelect.tsx` renderiza input "Voice ID" controlled, com placeholder específico por provider.
    - `SettingsForm.tsx` mantém state `ttsVoiceIds` per-provider, hidrata do `settings:get`, mostra o valor do provider ativo no input, e envia o objeto completo no `settings:save`.
    - `settings:get` retorna `ttsVoiceIds` populado pelo store.
    - `settings:save` persiste cada provider via `setTtsVoiceId` e dispara `reinitializeTTS()` quando `ttsVoiceIds` está presente no request.
    - Tests novos passam; tests existentes de `SettingsForm` e `settings.ts` continuam verdes (regressão zero).
    - Smoke manual (não automatizado mas critério): `cd apps/desktop && npm run dev`, abrir Settings, trocar provider e verificar que o campo Voice ID muda valor; salvar com voice ID alternativo (ex: `pt-BR-gustavo` para Murf) e confirmar via log que `reinitializeTTS` foi chamado.
  </done>
</task>

</tasks>

<verification>
- TypeScript build passa (`cd apps/desktop && npx tsc --noEmit`).
- Vitest suítes afetadas verdes:
  - `src/main/__tests__/store.test.ts`
  - `src/main/ipc/__tests__/settings.test.ts`
  - `src/renderer/src/settings/__tests__/SettingsForm.test.tsx`
  - `src/main/voiceInput/tts/__tests__/tts-providers.test.ts` (não modificado, valida não-regressão)
- Manual smoke: abrir Settings, ver campo "Voice ID" abaixo de "API Key", trocar entre providers e confirmar que o input mostra valores independentes; salvar e verificar log `[settings] TTS provider re-initialized after settings save`.
</verification>

<success_criteria>
- Usuário consegue setar voice ID Murf (ex: `pt-BR-gustavo`) e voice ID ElevenLabs separadamente, salvar, e na próxima síntese de voz a voz usada é a configurada.
- Quando ambos voice IDs estão vazios, providers usam defaults históricos (`pt-BR-heitor` / `EXAVITQu4vr4xnSDxMaL`) — usuários atuais sem config não notam mudança nenhuma.
- Trocar voice ID e salvar dispara `reinitializeTTS()` — sem precisar reiniciar o app.
- Zero regressão em tests existentes.
</success_criteria>

<output>
Após completar, criar `.planning/quick/260427-tjc-adicionar-campo-voice-id-na-ui-de-tts-mu/260427-tjc-SUMMARY.md` documentando:
- Arquivos modificados (com 1 linha cada explicando o quê).
- Decisão chave: voice ID é per-provider (objeto no store), input UI mostra um por vez baseado no provider ativo.
- Compat retroativa: voice ID vazio = mantém default hardcoded do provider (zero break para users existentes).
- Próximo passo opcional para o usuário: setar voice IDs preferidos via Settings UI (ex: `pt-BR-gustavo` para Murf masculino mais grave).

Commit: `✨ feat(settings): adicionar campo Voice ID per-provider no TTS UI` (ver CLAUDE.md — Conventional Commits + emoji, em pt-BR).
</output>
