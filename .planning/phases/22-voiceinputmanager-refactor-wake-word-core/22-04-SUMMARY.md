---
phase: 22-voiceinputmanager-refactor-wake-word-core
plan: 04
subsystem: wake-word-integration
tags: [wake-word, useWakeWord, orb-gating, tts-wrap, electron-builder, cpu-benchmark, integration, tdd]
status: awaiting_human_checkpoint
completed_autonomous: 2026-04-11
requirements: [WAKE-01, WAKE-05, WAKE-06, WAKE-07, WAKE-08, WAKE-09]

dependency_graph:
  requires:
    - 22-01 (voiceInputManager singleton — consumed via acquire/release)
    - 22-02 (WakeWordEngine + modelLoader + preload bridge)
    - 22-03 (wakeword-models dir + .env.example + envDir fix + postinstall)
  provides:
    - useWakeWord React hook (live runtime integration)
    - ttsPlayer lifecycle hooks (beforePlay/afterPlay with 300ms tail)
    - packaged build pipeline via electron-builder + extraResources
    - smoke-packaged-build validation script
    - cpu-benchmark harness for WAKE-09 manual measurement
  affects:
    - apps/desktop/src/renderer/src/App.tsx (monta useWakeWord dentro do OrbProvider)
    - apps/desktop/src/main/index.ts (backgroundThrottling: false)

tech_stack:
  added:
    - electron-builder@^26.8.1 (devDependency, compat Electron 41)
  patterns:
    - React hook with lazy boot + cleanup on unmount
    - Orb state gate via stateRef (anti TTS self-trigger)
    - Belt-and-braces pause/resume via ttsPlayer lifecycle hooks
    - VAD timeout with ref-held setTimeout + clear on state change
    - electron-builder extraResources (NOT asarUnpack) for ONNX assets
    - Runtime path resolver via app.isPackaged (Plan 02 resources.ts)

key_files:
  created:
    - apps/desktop/src/renderer/hooks/useWakeWord.ts
    - apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts
    - apps/desktop/electron-builder.yml
    - apps/desktop/scripts/cpu-benchmark-wakeword.mjs
    - apps/desktop/scripts/smoke-packaged-build.sh
    - .planning/.continue-here.md (checkpoint instructions for human verification)
  modified:
    - apps/desktop/src/renderer/src/App.tsx (+useWakeWord hook mount)
    - apps/desktop/src/renderer/src/audio/ttsPlayer.ts (+registerTTSHooks + 300ms tail)
    - apps/desktop/src/renderer/src/audio/__tests__/ttsPlayer.test.ts (+3 hook tests)
    - apps/desktop/src/main/index.ts (+backgroundThrottling: false)
    - apps/desktop/package.json (+electron-builder devDep, +build:dist scripts)
    - .gitignore (+apps/desktop/release/)

decisions:
  - "stateRef.current = state atribuído no corpo do componente (não em useEffect) — captura instantânea do state para o onDetected closure, evita race com re-render async"
  - "VAD timeout via setTimeout + ref (não useEffect) — armado dentro do onDetected callback, clear em state change OU unmount"
  - "Hook lê import.meta.env defensivamente via readEnv() helper — happy-dom não expõe import.meta.env, fallback para defaults locked no CONTEXT.md"
  - "Test wrapper mocka OrbContext direto via vi.mock (não usa OrbProvider real) — evita React batching noise, tests manipulam orbState + rerender() para forçar stateRef sync"
  - "vi.hoisted() usado para definir MockEngine dentro do factory do vi.mock — contorna hoisting issue do vitest com top-level mock state"
  - "electron-builder@^26.8.1 escolhido — última estável compat com Electron 41 (major 27+ tem breaking changes em asar handling)"
  - "NÃO rodar build:dist durante Task 2 — é parte da VERIFICAÇÃO 7 do checkpoint manual, precisa de valid npm/nsis/fpm setup no host do usuário"

metrics:
  duration_minutes: 12
  tasks_completed_autonomous: 2
  tasks_pending_human: 1
  files_created: 6
  files_modified: 6
  tests_added: 13  # 10 useWakeWord + 3 ttsPlayer
  commits: 3
---

# Phase 22 Plan 04: useWakeWord Integration + Packaging — Summary

Wave 3 integra o pipeline wake word completo: cria o `useWakeWord` React hook que monta o `WakeWordEngine` (Plan 02) gated pelo `OrbContext`, wireado ao `voiceInputManager` (Plan 01), com VAD timeout 3000ms pós-detecção, degrade path para `getUserMedia` fail, e belt-and-braces pause/resume durante TTS playback via `registerTTSHooks` com 300ms tail. Adiciona `backgroundThrottling: false` na `BrowserWindow` (WAKE-01 com janela oculta), configura `electron-builder.yml` com `extraResources` para empacotar os 4 modelos ONNX (Plan 03), e provê scripts de CPU benchmark (WAKE-09 manual) e smoke test do artefato packaged.

**Status:** Tasks 1 e 2 (autônomas) concluídas. Task 3 é um checkpoint `human-verify` bloqueante — 7 verificações manuais que exigem microfone físico, alto-falantes, observação de CPU em Task Manager/htop/Activity Monitor, e execução do instalador packaged. Ver `.planning/.continue-here.md` para o protocolo de verificação.

## What was built (autonomous scope)

### Task 1 — useWakeWord hook + ttsPlayer hooks + backgroundThrottling + App wire

**`apps/desktop/src/renderer/hooks/useWakeWord.ts`** — React hook que:

1. Boota o `WakeWordEngine` no mount: lê modelos via `window.jarvis.wakeWord.loadModels()`, hidrata sessions via `loadWakeWordSessions`, cria engine com threshold/debounce/VAD do `.env`, obtém `MediaStream` via `getUserMedia`, chama `engine.start()`.
2. Gate por `stateRef.current === 'idle'` no `onDetected` — ignora detecção se orb está em `listening`/`processing`/`responding` (anti TTS self-trigger).
3. Gate por `voiceInputManager.acquire('wakeword')` — se retorna `{error: 'BUSY'}` (PTT ativo), aborta detecção (WAKE-07).
4. Quando detecção passa nos dois gates: `setState('listening')` + `audioRecorder.startRecording()` + arma VAD timeout de `VITE_WAKE_WORD_VAD_TIMEOUT_MS` ms.
5. VAD timeout: se nada acontecer em 3000ms, `stopRecording()` + `voiceInputManager.release('wakeword')` + `setState('idle')` (WAKE-06).
6. `useEffect([state])` — `engine.suspend()` quando state vira não-idle, `engine.resume()` quando volta para idle (WAKE-05 full cycle).
7. `useEffect` registra `ttsHooks`: beforePlay suspende, afterPlay resume.
8. Degrade graceful: erros de boot (`NotAllowedError`, model load failure, etc) são capturados, `setHookState({status: 'unavailable', error})`, app NÃO crasha, PTT continua funcionando (WAKE-08).
9. Cleanup on unmount: `engine.stop()` + limpa VAD timeout + `registerTTSHooks({})`.

**`apps/desktop/src/renderer/src/audio/ttsPlayer.ts`** — Adicionado:

```ts
export type TTSLifecycleHooks = {
  beforePlay?: () => Promise<void> | void;
  afterPlay?: () => Promise<void> | void;
};
let ttsHooks: TTSLifecycleHooks = {};
export function registerTTSHooks(h: TTSLifecycleHooks): void { ttsHooks = h; }
```

E dentro de `playTTSResponse`:
- `await ttsHooks.beforePlay?.();` antes do `source.start()`.
- `source.onended = () => { ...; setTimeout(() => { void ttsHooks.afterPlay?.(); }, 300); };`

`__resetForTests()` também zera `ttsHooks = {}`.

**`apps/desktop/src/main/index.ts`** — Adicionado em `webPreferences`:

```ts
// Phase 22 WAKE-01: janela oculta (hide via hotkey / fora da tela)
// NÃO pode pausar o renderer — wake word engine precisa continuar
// rodando inferência contínua mesmo sem foco. Chromium pausa o
// renderer por default após ~10s sem foco; backgroundThrottling:false
// desliga essa otimização. Trava de research §Pattern 5 + CONTEXT.md.
backgroundThrottling: false,
```

**`apps/desktop/src/renderer/src/App.tsx`** — `useWakeWord()` montado dentro de `AppContent`, que vive dentro de `<OrbProvider>`. Isso garante que o hook tem acesso ao `useOrbContext()` sem throw.

### Task 2 — electron-builder + extraResources + scripts

**`apps/desktop/electron-builder.yml`** — configuração literal do research §Pattern 4:

```yaml
appId: com.jarvis.desktop
productName: JARVIS
directories:
  output: release
  buildResources: resources
files:
  - dist/**/*
  - package.json
extraResources:
  - from: resources/wakeword-models
    to: wakeword-models
    filter:
      - "*.onnx"
      - "LICENSE*"
asar: true
win: { target: nsis }
mac:
  target: dmg
  extendInfo:
    NSMicrophoneUsageDescription: "JARVIS precisa do microfone para detectar o wake word 'Hey JARVIS'."
linux: { target: AppImage }
```

`extraResources.from: resources/wakeword-models` é relativo ao cwd do build (`apps/desktop/`), onde Plan 03 já baixou os 4 arquivos. `extraResources.to: wakeword-models` coloca os arquivos em `<resourcesPath>/wakeword-models/*.onnx`, que é exatamente o path que `getWakeWordModelPaths()` em `apps/desktop/src/main/voiceInput/resources.ts` resolve em produção (`app.isPackaged ? process.resourcesPath : ...`).

**`apps/desktop/package.json`** — Adicionados scripts:

```json
"build:dist": "electron-vite build && electron-builder --config electron-builder.yml",
"build:dist:win": "electron-vite build && electron-builder --config electron-builder.yml --win",
"build:dist:mac": "electron-vite build && electron-builder --config electron-builder.yml --mac",
"build:dist:linux": "electron-vite build && electron-builder --config electron-builder.yml --linux"
```

Devolvidos: `"electron-builder": "^26.8.1"` em `devDependencies`.

**`apps/desktop/scripts/cpu-benchmark-wakeword.mjs`** — Harness para WAKE-09. Imprime instruções para a medição manual via Task Manager/Activity Monitor/htop (única maneira simples de medir CPU% do renderer Electron sem instrumentar o main). Exit 0.

**`apps/desktop/scripts/smoke-packaged-build.sh`** — Bash script que verifica se `release/{win,linux,mac}-unpacked/.../resources/wakeword-models/` contém os 4 `.onnx`. Usado na VERIFICAÇÃO 7 do checkpoint.

**`.gitignore`** — Adicionado `apps/desktop/release/`.

## Test coverage

| Arquivo | Cenários | Status |
|---------|----------|--------|
| `useWakeWord.test.ts` | 10 (boot, gate idle, gate responding, gate BUSY, VAD timeout, suspend, resume, degrade, unmount cleanup, ttsHooks) | 10/10 ✓ |
| `ttsPlayer.test.ts` (3 novos) | beforePlay 1x antes do start, afterPlay 300ms após onended, clear via `{}` | 3/3 ✓ |

**Full desktop suite:** 258/261 passing / 3 pré-existentes deferred (idênticos aos baselines de 22-01/22-02/22-03):

1. `src/main/__tests__/integration-chat.test.ts` — full file (gateway/backend mocks)
2. `src/main/__tests__/tray.test.ts` — "DESK-04 has exactly 3 menu items"
3. `src/renderer/components/Orb/__tests__/Orb.test.tsx` × 2 (`#06B6D4` cyan color + 300ms transition selector — candidatos Phase 23 ORB-POL)

**Zero regressão causada pelo Plan 22-04.**

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `a1914a5` | ✅ test(22-04): Wave 0 failing tests useWakeWord + ttsPlayer hooks |
| 2 | `3273921` | ✨ feat(22-04): useWakeWord hook com OrbContext gating, VAD timeout, TTS wrap + backgroundThrottling:false |
| 3 | `74cd848` | 🏗️ build(22-04): electron-builder.yml com extraResources + build:dist scripts + cpu-benchmark + smoke-packaged scripts |

## Verification results (autonomous)

### Automated grep checks (all pass)

```
grep -c "voiceInputManager.acquire('wakeword')" useWakeWord.ts         → 1  ✓
grep -c "stateRef.current !== 'idle'" useWakeWord.ts                   → 1  ✓
grep -c "VITE_WAKE_WORD_THRESHOLD" useWakeWord.ts                      → 1  ✓
grep -c "VITE_WAKE_WORD_VAD_TIMEOUT_MS" useWakeWord.ts                 → 1  ✓
grep -c "registerTTSHooks" ttsPlayer.ts                                → 2  ✓
grep -c "ttsHooks.beforePlay" ttsPlayer.ts                             → 1  ✓
grep multiline "setTimeout[\\s\\S]*?300" ttsPlayer.ts                  → 1  ✓  (linhas 81-83)
grep -c "backgroundThrottling: false" main/index.ts                    → 1  ✓
grep -c "useWakeWord()" App.tsx                                        → 2  ✓  (import + call)
grep -c "\"electron-builder\":" package.json                           → 1  ✓  (devDependencies)
grep -c "extraResources:" electron-builder.yml                         → 1  ✓
grep -c "wakeword-models" electron-builder.yml                         → 4  ✓  (from, to, filter scope, comments)
grep -c "asar: true" electron-builder.yml                              → 1  ✓
grep -c "NSMicrophoneUsageDescription" electron-builder.yml            → 1  ✓
grep -c "build:dist" package.json                                      → 4  ✓  (base + win + mac + linux)
test -f scripts/cpu-benchmark-wakeword.mjs                             → 0  ✓
test -f scripts/smoke-packaged-build.sh                                → 0  ✓
test -x scripts/smoke-packaged-build.sh                                → 0  ✓
grep "release/" .gitignore                                             → found ✓
```

### Build

```
pnpm --filter @jarvis/desktop build
  ✓ main bundle: 36.28 kB
  ✓ preload bundle: 1.99 kB
  ✓ renderer bundle: 1,147.55 kB
  ✓ ort-wasm-simd-threaded.jsep-C887KxcQ.wasm: 25,014.75 kB
  zero TypeScript errors
```

### Test suite

```
Test Files  3 failed | 25 passed (28)
Tests       3 failed | 258 passed (261)
```

Os 3 failed são os deferred pré-existentes confirmados contra baseline.

## Task 3 — pending (human verification)

**Status:** `awaiting_human_checkpoint`
**Location:** `.planning/.continue-here.md`

Task 3 é um checkpoint `human-verify` com `gate="blocking"` porque 6 requirements exigem observação física:

| # | Requirement | O que precisa | Medição |
|---|-------------|---------------|---------|
| 1 | WAKE-01 | Latência "Hey JARVIS" → listening | ≤500ms (cronômetro) |
| 2 | WAKE-05 | Full cycle dual-trigger | Segundo "Hey JARVIS" detecta sem restart |
| 3 | WAKE-06 | VAD timeout silencioso | Volta para idle em ~3s |
| 4 | WAKE-07 | PTT preemption | PTT ganha do wake word + wake word retoma |
| 5 | WAKE-08 | Mic denied degrade | App vivo, PTT OK, status=unavailable |
| 6 | WAKE-09 | CPU <2% sustained 10min | Task Manager / Activity Monitor / htop |
| 7 | (packaging) | smoke-packaged-build.sh | `PASS` + 4 .onnx no artifact |

Verifications 1, 2, 3, 4, 5 exigem microfone real + voz real + alto-falantes reais + interação por ~5min cada.
Verification 6 é BLOCKING e exige 10min de observação passiva.
Verification 7 exige toolchain de packaging instalada (nsis/fpm/dmg) no host do usuário.

**Agent não pode executar nenhuma destas verificações.** Entregue ao usuário:

- `.planning/.continue-here.md` com instruções passo-a-passo em pt-BR
- Este SUMMARY.md com status `awaiting_human_checkpoint`

Depois das 7 verificações, o usuário deve retornar:
- `approved` + latency_ms + cpu_percent + smoke output → rodar `/gsd:verify-work 22`
- `failed:VERIFICATION-N` → rodar `/gsd:plan-phase 22 --gaps`

## Deviations from plan

**Nenhuma deviation substantiva.** Dois ajustes menores durante a execução, todos dentro do spec:

1. **[Rule 1 - Test bug]** No test file `useWakeWord.test.ts`, versão inicial usou `vi.mock` factory referenciando `MockEngine` declarado em top-level — vitest hoisting acessava antes da inicialização (`ReferenceError: Cannot access 'MockEngine' before initialization`). Corrigido usando `vi.hoisted()` para mover a classe para dentro do hoisted scope. Ajuste técnico padrão do vitest, não muda semântica do teste.

2. **[Rule 1 - Test env]** Adicionado `@vitest-environment happy-dom` docblock no topo do `useWakeWord.test.ts` porque o `environmentMatchGlobs: [['**/src/renderer/**', 'happy-dom']]` do `vitest.config.ts` não estava casando com `src/renderer/hooks/__tests__/`. Alternativa seria expandir o glob — o docblock é mais explícito e local ao teste que precisa. Confirmed zero impacto nos outros testes do diretório (só o `useWakeWord.test.ts` consome React hooks).

3. **[Rule 1 - Test refactor]** Test 3 (gate `responding`) precisou de `result.rerender()` explícito após mutar `orbState` para forçar sync do `stateRef.current` do hook (React render consome o mock `useOrbContext()` só no render). Esse é o comportamento correto do React, não é um bug do hook.

## Auth gates

**Nenhuma.** Plan 22-04 não envolve credenciais nem APIs externas.

## Known stubs

**Nenhum stub foi criado.** O hook `useWakeWord` é implementação completa. O único "TODO" deixado é um comentário inline marcando onde Phase 23 (WAKE-03/WAKE-08 tray indicator) vai consumir o `status='unavailable'` para mostrar feedback visual — isso é integração de próxima phase, não stub.

## Next

- **Task 3 (human):** rodar as 7 verificações do `.planning/.continue-here.md`
- **Após approved:** `/gsd:verify-work 22` → Phase 22 marked complete no ROADMAP
- **Próxima phase:** Phase 23 (Orb UX Polish — WAKE-02, WAKE-03, WAKE-04, ORB-POL-01, ORB-POL-02) — agora com o callback `onDetected()` real já disponível via `useWakeWord`

## Self-Check: PASSED

### Files created

- `apps/desktop/src/renderer/hooks/useWakeWord.ts`: FOUND
- `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts`: FOUND
- `apps/desktop/electron-builder.yml`: FOUND
- `apps/desktop/scripts/cpu-benchmark-wakeword.mjs`: FOUND
- `apps/desktop/scripts/smoke-packaged-build.sh`: FOUND (executable +x)
- `.planning/.continue-here.md`: FOUND

### Files modified

- `apps/desktop/src/renderer/src/App.tsx` contains `useWakeWord()`: VERIFIED
- `apps/desktop/src/renderer/src/audio/ttsPlayer.ts` contains `registerTTSHooks`: VERIFIED
- `apps/desktop/src/renderer/src/audio/__tests__/ttsPlayer.test.ts` has 3 new hook tests: VERIFIED
- `apps/desktop/src/main/index.ts` contains `backgroundThrottling: false`: VERIFIED
- `apps/desktop/package.json` contains `"electron-builder"`: VERIFIED
- `.gitignore` contains `apps/desktop/release/`: VERIFIED

### Commits

- `a1914a5` (Task 1 — test RED): FOUND
- `3273921` (Task 1 — impl GREEN): FOUND
- `74cd848` (Task 2 — build infra): FOUND

### Runtime

- `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts` → 10/10 PASS
- `pnpm --filter @jarvis/desktop test --run src/renderer/src/audio/__tests__/ttsPlayer.test.ts` → 10/10 PASS (7 existing + 3 new)
- `pnpm --filter @jarvis/desktop test --run` (full suite) → 258 pass / 3 pre-existing deferred
- `pnpm --filter @jarvis/desktop build` → exit 0, zero TS errors
