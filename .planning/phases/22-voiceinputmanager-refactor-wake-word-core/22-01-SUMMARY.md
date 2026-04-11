---
phase: 22
plan: 01
subsystem: voice-input-manager
tags: [refactor, mic-ownership, ptt, wake-word-prep, tdd]
status: Complete
completed: 2026-04-11
requirements: [WAKE-07]

dependency_graph:
  requires: []
  provides:
    - voiceInputManager.acquire/release contract (Wave 2 wake word engine will consume)
    - ptt:action 'toggle' IPC payload (main → renderer, stateless)
  affects:
    - ChatInput PTT handler (now delegates arbitration to voiceInputManager)

tech_stack:
  added:
    - (none — pure refactor, no new dependencies)
  patterns:
    - Closure-based singleton with observer pattern (subscribe/notify) in renderer
    - Single-writer invariant for mic ownership (PTT > WakeWord arbitration)
    - File-level invariant tests via fs.readFileSync + regex (enforce "isRecording" absence)

key_files:
  created:
    - apps/desktop/src/renderer/src/voice/voiceInputManager.ts
    - apps/desktop/src/renderer/src/voice/__tests__/voiceInputManager.test.ts
    - apps/desktop/src/main/__tests__/ptt-hotkey.test.ts
  modified:
    - apps/desktop/src/main/ptt-hotkey.ts (remove isRecording, 3 regiões → 'toggle')
    - apps/desktop/src/shared/ipc-types.ts (PttAction = 'toggle')
    - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx (consulta VoiceInputManager)

decisions:
  - "Closure-based singleton em vez de classe — simplicidade, import único, __resetForTests exportado só para vitest"
  - "release() é NO-OP se source !== currentSource — evita PTT matar wakeword por acidente via callback atrasado"
  - "acquire(same-source) é idempotente e NÃO notifica listeners — previne UI flicker em double-press"
  - "Tests de invariante do arquivo fonte (fs.readFileSync + regex) travam as 3 regiões de callback simultaneamente"

metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_created: 3
  files_modified: 3
  tests_added: 17
  commits: 3
---

# Phase 22 Plan 01: VoiceInputManager Refactor + PTT Toggle Externalization — Summary

Extrai ownership de microfone de `ptt-hotkey.ts` (main) para um singleton `VoiceInputManager` no renderer com política "PTT sempre ganha" e refatora as 3 regiões de callback do PTT hotkey para emitirem um evento puro `'toggle'`, removendo o `let isRecording` module-local — mitigação obrigatória de PITFALL #3 (double MediaRecorder race condition) antes do wake word chegar no Plan 22-02.

## What was built

### 1. VoiceInputManager singleton (`apps/desktop/src/renderer/src/voice/voiceInputManager.ts`)

Contrato público exato do `<interfaces>` block do plano:

```ts
export type InputSource = 'ptt' | 'wakeword' | null;
export interface VoiceInputGrant {
  source: 'ptt' | 'wakeword';
  releasedPreviousSource: InputSource;
  startedAt: number;
}
export interface VoiceInputManager {
  acquire(source): VoiceInputGrant | { error: 'BUSY' };
  release(source): void;
  getCurrentSource(): InputSource;
  subscribe(listener): () => void;
}
```

Regras de arbitragem:
- **PTT sempre ganha:** `acquire('ptt')` sobre `currentSource='wakeword'` preempta, notifica listeners com `'ptt'`, retorna grant com `releasedPreviousSource='wakeword'`
- **WakeWord bloqueado por PTT:** `acquire('wakeword')` enquanto `currentSource='ptt'` retorna `{ error: 'BUSY' }` sem mexer no state
- **Idempotência:** `acquire(same)` retorna grant existente sem notificar listeners
- **Release defensivo:** `release(x)` é no-op se `x !== currentSource`

Closure-based singleton — `currentSource`, `grantStartedAt`, e `listeners` vivem no escopo do módulo. Helper `__resetVoiceInputManagerForTests()` exportado apenas para vitest usar em `beforeEach`.

### 2. PTT hotkey refactor (`apps/desktop/src/main/ptt-hotkey.ts`)

Removidas:
- `let isRecording = false;` (linha 18)
- 6 atribuições/leituras de `isRecording` distribuídas em 3 regiões de callback + 2 cleanups
- 6 sends alternados `'start'`/`'stop'` (pares if/else em 3 regiões)

Adicionadas:
- 3 callbacks unificados (uma emissão cada):
  1. `registerPttHotkey` (linhas 40-43)
  2. `changePttHotkey` success branch (linhas 66-69)
  3. `changePttHotkey` fallback re-register (linha 83)
- Comentário de cabeçalho documentando que ownership foi extraída para o renderer

`grep -c "isRecording" apps/desktop/src/main/ptt-hotkey.ts` → `0` (era `12+` no baseline)
`grep "ptt:action" | grep -c "toggle"` → `4` (1 por região + 1 em log)

### 3. ipc-types + preload wiring

`apps/desktop/src/shared/ipc-types.ts`:
```ts
// antes: export type PttAction = 'start' | 'stop';
export type PttAction = 'toggle';
```

Preload não precisou mudar — `ipcRenderer.on` é genérico por string, o tipo não é consumido dentro do preload.

### 4. ChatInput handler (`apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx`)

Handler anterior branch-ava por payload `'start' | 'stop'`. Agora consulta o VoiceInputManager:

```tsx
const handlePttToggle = async () => {
  if (voiceInputManager.getCurrentSource() === 'ptt') {
    voiceInputManager.release('ptt');
    await handleStopRecording();
  } else {
    const grant = voiceInputManager.acquire('ptt');
    if ('error' in grant) {
      console.warn('[ChatInput] PTT acquire BUSY — aborting');
      return;
    }
    await handleStartRecording();
  }
};
```

Ganho arquitetural: single source of truth. PTT, wake word (Plan 02+), e qualquer futuro caller consultam o mesmo singleton — double MediaRecorder race é estruturalmente impossível.

## Test coverage

| Arquivo | Cenários | Status |
|---------|----------|--------|
| `voiceInputManager.test.ts` | 10 (state machine table) | 10/10 ✓ |
| `ptt-hotkey.test.ts` | 10 (4 file invariants + 3 registerPttHotkey + 2 changePttHotkey + 1 unregister) | 10/10 ✓ |
| `ChatInput.test.tsx` | 6 (pré-existente, não tocado — só testa UI do botão, não payload PTT) | 6/6 ✓ |

**Full desktop suite:** 227/230 passing (3 failures pré-existentes, documentadas em `deferred-items.md` — tray menu count, Orb selectors, integration-chat — confirmado via `git stash` + re-run no baseline).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `4619757` | ✅ test(22-01): cria Wave 0 tests failing para voiceInputManager + refactor ptt-hotkey |
| 2 | `ec0103c` | ✨ feat(22-01): VoiceInputManager singleton com política PTT-preempts-wakeword |
| 3 | `4c9d0e4` | ♻️ refactor(22-01): remove isRecording module-local de ptt-hotkey (3 regiões) e delega toggle ao VoiceInputManager no renderer |

## Verification results

### Automated grep checks (all pass)

```
grep -c "let isRecording" apps/desktop/src/main/ptt-hotkey.ts          → 0  ✓
grep -c "isRecording" apps/desktop/src/main/ptt-hotkey.ts              → 0  ✓
grep "ptt:action" ... | grep -c "toggle"                               → 4  ✓ (≥3)
grep "ptt:action" ... | grep -cE "'start'|'stop'"                      → 0  ✓
grep -c "voiceInputManager" ChatInput.tsx                              → 4  ✓
grep "PttAction = 'toggle'" ipc-types.ts                               → 1  ✓
grep "'start' | 'stop'" ipc-types.ts                                   → 0  ✓
grep -r "wakeWord|onnxruntime|openwakeword" (scoped files)             → 0  ✓
```

### Build

```
pnpm --filter @jarvis/desktop build
  ✓ main bundle: 34.33 kB
  ✓ preload bundle: 1.61 kB
  ✓ renderer bundle: 640.35 kB
  zero TypeScript errors
```

### Absence of wake word code (grep evidence)

Nenhum arquivo dentro de `apps/desktop/src/renderer/src/voice/wakeWord/` foi criado. Zero referências a `wakeWord`, `onnxruntime`, ou `openwakeword` nos 3 arquivos alvo do refactor. Wake word code chega só no Plan 22-02.

## Deviations from plan

**None.** Plano executado exatamente como escrito.

Observações menores (não são deviations, apenas notas de execução):
- O teste `ChatInput.test.tsx` pré-existente só exercita o botão UI (`Test 1-6`: toggle visibility, submit text) — **não** faz mock de `onPttAction` nem assertions sobre `'start'|'stop'`. Nenhuma atualização foi necessária (o plano anteviu essa possibilidade: "SE contiver referência a 'start'/'stop'... atualizar. SE apenas testar o botão UI... deixar intacto").
- O `import voiceInputManager` no `ChatInput.tsx` usa caminho relativo (`../../src/voice/voiceInputManager`) em vez do alias `@` — vitest config não tem `@` registrado (só `@renderer`), e o padrão do arquivo já usava relativos (`../../src/chat/ChatContext`, `../../src/voice/handleAudioResponse`). Consistente com o resto do arquivo.

## Deferred issues (out of scope for 22-01)

3 falhas pré-existentes no full suite, não causadas pelo refactor — documentadas em `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/deferred-items.md`:

1. `src/main/__tests__/integration-chat.test.ts` — full file falha (gateway/backend client mocks)
2. `src/main/__tests__/tray.test.ts` — "DESK-04 has exactly 3 menu items" (menu drift prior phase)
3. `src/renderer/components/Orb/__tests__/Orb.test.tsx` × 2 — selector `[style*="width: 96px"]` retorna null (provavelmente resolvido pelo Phase 23 ORB-POL que vai revisitar orb visuals)

Confirmado pré-existente via `git stash` → rerun → `git stash pop`.

## Next plan

**22-02** (Wake Word Core modules) — introduz `apps/desktop/src/renderer/src/voice/wakeWord/` com `onnxruntime-web`, `hey_jarvis_v0.1.onnx`, AudioWorklet, e engine gated por `OrbContext === 'idle'`. Engine chamará `voiceInputManager.acquire('wakeword')` antes de ativar detection e `release('wakeword')` em `beforePlay` do TTS.

## Self-Check: PASSED

- voiceInputManager.ts exists: FOUND
- voiceInputManager.test.ts exists: FOUND
- ptt-hotkey.test.ts exists: FOUND
- ptt-hotkey.ts modified (isRecording absent): VERIFIED
- ChatInput.tsx modified (voiceInputManager imported): VERIFIED
- ipc-types.ts modified (PttAction = 'toggle'): VERIFIED
- Commit 4619757 exists: FOUND
- Commit ec0103c exists: FOUND
- Commit 4c9d0e4 exists: FOUND
