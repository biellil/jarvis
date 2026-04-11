---
phase: 23-orb-ux-polish
plan: 02
subsystem: ui
tags: [wake-word, tray, ipc, store, useWakeWord, integration, pause-resume, wake-burst, reduced-motion]

requires:
  - phase: 23-orb-ux-polish
    plan: 01
    provides: "OrbContext.wakeWordPaused + setWakeWordPaused + triggerWakeBurst (consumidos por useWakeWord) e Orb.tsx já renderizando visual paused + burst overlay"
  - phase: 22-voiceinputmanager-refactor-wake-word-core
    provides: "useWakeWord hook com onDetected() wired ao WakeWordEngine real (Plan 22-04), voiceInputManager.acquire('wakeword'), registerTTSHooks"

provides:
  - "store.ts com getWakeWordPaused/setWakeWordPaused (chave 'wakeWordPaused', default false) substitui draft wakeWordEnabled (D-03, D-04)"
  - "IPC_CHANNELS.WAKE_WORD_GET_PAUSED + WAKE_WORD_PAUSE_TOGGLE (D-06)"
  - "WakeWordApi.getPaused + WakeWordApi.onPauseToggle expostos via contextBridge com unsubscribe (D-06)"
  - "ipc/settings.ts: handler 'wakeWord:get-paused' + broadcastPauseToggle helper"
  - "tray.ts: Pause/Resume listening no topo do menu com label dinâmico + tooltip sincronizado (D-03, WAKE-03)"
  - "useWakeWord consome OrbContext.wakeWordPaused/setWakeWordPaused/triggerWakeBurst — fonte única de verdade"
  - "onDetected dispara triggerWakeBurst() ANTES de setState('listening') com delay de 350ms (D-02 + ORB-POL-02)"
  - "D-05 bypass: reduced-motion pula o delay de 350ms (zero latência percebida sem payoff visual)"
  - "Kill switch gate duplo: (a) useEffect de state reagindo a wakeWordPaused, (b) wakeWordPausedRef no closure do onDetected"

affects: []

tech-stack:
  added: []
  patterns:
    - "IPC bridge unsubscribe pattern: preload retorna () => removeListener para cada listener 'on' — evita leak quando o componente unmonta"
    - "Ref mirror de context value para closures de longa duração: wakeWordPausedRef = useRef + assignment síncrono no body do hook (mesmo padrão do stateRef)"
    - "Delay entre burst animation e state transition via setTimeout(WAKE_BURST_TO_LISTENING_DELAY_MS) dentro do onDetected, com closure 'proceed' para encapsular a transição"
    - "Reduced-motion bypass via window.matchMedia — checado no momento do evento, não no mount (a preferência pode mudar)"

key-files:
  created:
    - "apps/desktop/src/main/__tests__/store.test.ts (6 testes novos do store wake word paused)"
    - "apps/desktop/src/main/ipc/__tests__/settings.test.ts (6 testes novos do handler + broadcast)"
  modified:
    - "apps/desktop/src/main/store.ts — wakeWordEnabled → wakeWordPaused com defensive check (T-23-02-01)"
    - "apps/desktop/src/shared/ipc-types.ts — remove 3 canais draft, adiciona 2 novos, estende WakeWordApi, remove SettingsApi"
    - "apps/desktop/src/preload/index.ts — expõe wakeWord.getPaused + wakeWord.onPauseToggle(cb)"
    - "apps/desktop/src/main/ipc/settings.ts — reescrito para o novo canal + broadcastPauseToggle helper"
    - "apps/desktop/src/main/tray.ts — Pause/Resume listening no topo, tooltip dinâmico, broadcast via helper"
    - "apps/desktop/src/main/__tests__/tray.test.ts — 22 cenários (remove 'has exactly 3 items' deferred, adiciona 10 D-03 novos + 6 regression)"
    - "apps/desktop/src/renderer/hooks/useWakeWord.ts — migra para OrbContext wakeWordPaused + triggerWakeBurst, 350ms delay, reduced-motion bypass, onPauseToggle listener"
    - "apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts — 18 cenários (10 pre-existentes adaptados para fake timers + 8 novos Phase 23 Plan 02)"

key-decisions:
  - "D-03 implementado: Pause/Resume listening no TOPO do menu com label dinâmico baseado em getWakeWordPaused(). Tooltip reflete estado atual."
  - "D-04 implementado: default wakeWordPaused=false, ativa imediatamente após primeira instalação"
  - "D-06 implementado: canais wakeWord:get-paused + wakeWord:pause-toggle (sem 'settings' namespace — tudo vive sob wakeWord)"
  - "D-02 acoplado: triggerWakeBurst() é chamado imediatamente no onDetected, setState('listening') após setTimeout(350ms) — matches BURST_DURATION_MS do OrbContext"
  - "D-05 bypass: prefers-reduced-motion pula o setTimeout pra evitar latência percebida sem payoff (o usuário não veria a animação mesmo). triggerWakeBurst ainda é chamado — OrbContext/globals.css decide se anima."
  - "WakeWordApi é o namespace único: SettingsApi completamente removida. Tudo que é wake word vive junto no contextBridge."

patterns-established:
  - "preload.onPauseToggle retorna função de unsubscribe que remove o listener específico (não removeAllListeners) — permite múltiplos subscribers independentes"
  - "useWakeWord não mantém state local de pausa — delega pra OrbContext. Benefícios: (1) Orb.tsx renderiza visual paused sem prop drilling, (2) testes podem verificar o wire sem mock do hook inteiro"
  - "setTimeout 'proceed' closure capturada permite bypass clean do reduced-motion: if/else de 2 linhas em vez de duplicar toda a lógica de listening + VAD"
  - "Tooltip sincronizado via buildContextMenu que é chamado em cada rebuild — garante que Electron não fique com tooltip stale após toggle"

requirements-completed: [WAKE-02, WAKE-03, WAKE-04, ORB-POL-02]

duration: ~30 min
completed: 2026-04-11
---

# Phase 23 Plan 02: Tray Kill Switch + IPC Wiring + Wake Burst Precede Listening

**Wave 2 fecha o loop completo de pause/resume via tray com persistência no electron-store, acopla a wake burst animation do Plan 01 ao `useWakeWord.onDetected()` com delay de 350ms precedendo a transição para `listening`, e substitui o draft pré-existente do `wakeWordEnabled`/`wake-word-settings-changed` por superfícies alinhadas com o CONTEXT.md (semântica invertida: `wakeWordPaused`, canais `wakeWord:*`, item no TOPO do menu com label dinâmico).**

## Performance

- **Duration:** ~30 min (3 tasks TDD, zero checkpoints, zero deviations materiais)
- **Tasks:** 3 (todas `type=auto`, todas `tdd=true`)
- **Files modified:** 8 código + 2 testes criados
- **Tests:** 52 passing para os arquivos do plan (store 6 + settings 6 + tray 22 + useWakeWord 18)
- **Full desktop suite:** 300/308 passing — os 8 failing são pre-existentes (WakeWordEngine + modelLoader — `document.baseURI` acesso em happy-dom, documentado em deferred-items.md como issue pré-22-GAP, e integration-chat já registrado no mesmo arquivo)

## Accomplishments

- **WAKE-03 (tray kill switch):** Click "Pause listening" → store salva `wakeWordPaused=true`, broadcastPauseToggle notifica TODOS os renderers, useWakeWord propaga para OrbContext e suspende o engine. Reabrindo o app o estado persiste via electron-store. Tooltip vira "JARVIS — paused".
- **WAKE-02 (wake burst precede listening):** Quando `useWakeWord.onDetected` dispara, a sequência é: (1) GATE checks (state, pausa, voiceInputManager), (2) `triggerWakeBurst()` sincronamente — o orb começa o pulse amber imediatamente, (3) `setTimeout(350ms)`, (4) `setState('listening')` + `startRecording()`. O usuário vê o burst → transição cor cyan → laranja em 350ms, feedback visual claramente pré-listening.
- **WAKE-04 (paused visual end-to-end):** O visual paused já existia desde Plan 01 (OrbContext + Orb.tsx rendering `isPausedVisual`). Plan 02 só precisou wire: `setWakeWordPaused(initial)` no boot + listener propagando o toggle → Orb automaticamente renderiza subdued quando paused.
- **ORB-POL-02 (burst polish 200-500ms):** 350ms dentro do range, matches BURST_DURATION_MS do OrbContext, dual-layer animation (keyframes `wake-burst` no root + `wake-burst-ring` no overlay amber).
- **D-05 reduced-motion bypass:** Usuários com preference acessibilidade não pagam o tax de 350ms de latência. `triggerWakeBurst()` ainda é chamado (o globals.css do Plan 01 desativa a animação), mas `setState('listening')` é síncrono.
- **Zero código morto:** Draft `wakeWordEnabled`/`wake-word-settings-changed`/`SettingsApi` completamente removidos (confirmed via grep — só aparecem em comentários históricos e asserts negativos).

## Task Commits

1. **Task 1: Realinhar store + IPC types + preload para `wakeWordPaused`** — `362a346` (refactor, TDD)
   - RED: 6 testes novos do store (default false, roundtrip, key correta, rejeição de não-boolean) + 6 testes do ipc/settings (handler, broadcastPauseToggle, multi-window)
   - GREEN: store.ts reescrito + ipc-types.ts (remove 3 canais draft, adiciona 2 novos, remove SettingsApi) + preload.index.ts (expõe getPaused + onPauseToggle) + ipc/settings.ts (handler + helper)
2. **Task 2: Tray menu pause/resume listening no topo (D-03)** — `337de40` (feat, TDD)
   - RED: tray.test.ts reescrito com 22 cenários (remove `has exactly 3 items` deferred desde v1.2; adiciona 10 novos do D-03)
   - GREEN: tray.ts com Pause/Resume label dinâmico, tooltip sincronizado, broadcastPauseToggle
3. **Task 3: useWakeWord consome OrbContext.wakeWordPaused + triggerWakeBurst (D-02, D-05, D-06)** — `377a27f` (refactor, TDD)
   - RED: useWakeWord.test.ts com 18 cenários (10 pre-existentes adaptados para fake timers + burst delay + 8 novos da Phase 23 Plan 02 cobrindo boot.getPaused, onPauseToggle listener/unsubscribe, suspend/resume flows, burst precede setState, reduced-motion bypass, paused gate)
   - GREEN: useWakeWord.ts migrado para OrbContext, ref mirror do paused, onPauseToggle listener, setTimeout(350ms) com reduced-motion bypass, gates atualizados

_TDD flow: como no Plan 01, cada task consolidou RED+GREEN num único commit porque a instrução do plan é "commit after task complete", não "commit por fase TDD". Cada commit contém o teste E o código que o faz passar._

## Files Created/Modified

- `apps/desktop/src/main/store.ts` — MODIFIED. Remove `getWakeWordEnabled`/`setWakeWordEnabled` + chave `wakeWordEnabled`. Adiciona `getWakeWordPaused`/`setWakeWordPaused` com chave `wakeWordPaused`, default false (D-04), defensive boolean check (T-23-02-01).
- `apps/desktop/src/main/__tests__/store.test.ts` — CREATED. 6 testes: default false, get/set roundtrip, key correta (`wakeWordPaused`, não `wakeWordEnabled`), rejeição de não-boolean (string + number).
- `apps/desktop/src/shared/ipc-types.ts` — MODIFIED. Remove `GET_WAKE_WORD_ENABLED`, `SET_WAKE_WORD_ENABLED`, `WAKE_WORD_SETTINGS_CHANGED`. Adiciona `WAKE_WORD_GET_PAUSED`, `WAKE_WORD_PAUSE_TOGGLE`. Estende `WakeWordApi` com `getPaused` + `onPauseToggle` (retorna unsubscribe). Remove `SettingsApi` interface e `settings: SettingsApi` de `JarvisAPI`.
- `apps/desktop/src/preload/index.ts` — MODIFIED. Remove bloco `settings`. Estende `wakeWord` com `getPaused` (invoke) + `onPauseToggle` (on + removeListener unsubscribe closure).
- `apps/desktop/src/main/ipc/settings.ts` — MODIFIED. Reescrito: registra handler `wakeWord:get-paused` + exporta `broadcastPauseToggle(paused)` helper que envia para TODAS as BrowserWindows com canal `wakeWord:pause-toggle`.
- `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — CREATED. 6 testes: handler registrado no canal correto, retorna valor do store, broadcast envia para cada janela, propaga false, no-op com 0 janelas.
- `apps/desktop/src/main/tray.ts` — MODIFIED. Imports de `getWakeWordPaused`/`setWakeWordPaused` (remove `getWakeWordEnabled`). Import de `broadcastPauseToggle`. `buildContextMenu`: lê `paused`, seta tooltip dinâmico (`'JARVIS — paused'` ou `'JARVIS — listening'`), primeiro item é `Pause/Resume listening` com click handler que toggleia store + broadcastPauseToggle + rebuild do menu. Remove o checkbox draft antigo.
- `apps/desktop/src/main/__tests__/tray.test.ts` — MODIFIED. Reescrito: 22 cenários no total. Remove `has exactly 3 menu items` deferred desde v1.2. Adiciona 10 cenários D-03 (imports corretos, labels, ordem, click handler, tooltip, rebuild, zero residuals). Mantém 6 testes regression (Show/Hide/Quit, icon, exports). +2 main process integration.
- `apps/desktop/src/renderer/hooks/useWakeWord.ts` — MODIFIED. Imports OrbContext estendido (wakeWordPaused, setWakeWordPaused, triggerWakeBurst). Remove `useState(true)` de `wakeWordEnabled`. Adiciona `wakeWordPausedRef` mirror. Boot: lê `getPaused()`, propaga via `setWakeWordPaused(initialPaused)`, suspende engine se `initialPaused===true`. onDetected: chama `triggerWakeBurst()` síncrono antes da transição, `setTimeout(350ms)` com `proceed` closure (setState + startRecording + VAD), reduced-motion bypass pula o setTimeout. Segundo useEffect: `onPauseToggle` listener (substitui `wake-word-settings-changed`). Terceiro useEffect: state gate depende de `wakeWordPaused` em vez de `wakeWordEnabled`. TTS afterPlay checa `!wakeWordPausedRef.current` (ref live).
- `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — MODIFIED. Mock OrbContext expõe `wakeWordPaused`, `setWakeWordPaused`, `triggerWakeBurst`. Mock `window.jarvis.wakeWord.getPaused` + `onPauseToggle` (retornando unsubscribe spy). Mock `window.matchMedia` default com `matches:false`. 10 testes pre-existentes adaptados (testes 2 e 5 agora usam fake timers + avança 350ms antes de verificar setState). 8 testes novos: boot.getPaused, initial suspend se paused, onPauseToggle register + unsubscribe, toggle callback (paused=true suspend, paused=false+idle resume), paused gate no onDetected, triggerWakeBurst precede setState, reduced-motion bypass síncrono.

## Decisions Made

Todas as decisões seguem literalmente o bloco `<decisions>` do `23-CONTEXT.md`:

- **D-02 (burst precede transição)** — implementado no `onDetected`: `triggerWakeBurst()` síncrono + `setTimeout(350ms)` antes de `setState('listening')`. Testado com fake timers avançando 349/1ms ao redor do threshold.
- **D-03 (tray menu pause/resume no topo, label dinâmico)** — primeiro item do `buildContextMenu`, label ternário baseado em `paused`, tooltip sincronizado via `setToolTip` no próprio build.
- **D-04 (default `wakeWordPaused=false`)** — `DEFAULT_WAKE_WORD_PAUSED = false` em store.ts, testado com `getWakeWordPaused()` retornando false em fresh install.
- **D-05 (reduced-motion bypass do delay)** — `prefersReducedMotion()` helper checado dentro do `onDetected`, closure `proceed` rodada síncrona se true.
- **D-06 (canais wakeWord:get-paused + wakeWord:pause-toggle + getPaused/onPauseToggle na WakeWordApi)** — implementado em ipc-types.ts, preload/index.ts, ipc/settings.ts.

**D-01 (wakeWordPaused como flag não state)** — já havia sido implementado no Plan 01; Plan 02 apenas consome.

## Deviations from Plan

**None — plan executed exactly as written.**

Pequenos ajustes:
- No boot do `useWakeWord` quando `VITE_WAKE_WORD_ENABLED=false`, também chamamos `setWakeWordPaused(true)` pra unificar a semântica (env flag vira paused=true no OrbContext). O plan não mencionou explicitamente, mas é consistente com a nova fonte única de verdade.
- `createTray` ainda chama `tray.setToolTip('JARVIS')` estático na criação, mas `buildContextMenu` (chamado logo depois) sobrescreve com o tooltip dinâmico. Optamos por não remover o setToolTip estático pra manter backwards compat mínima caso alguma situação de race condition apareça no ciclo de vida do tray.

## Issues Encountered

**Stash pop timing** — durante Task 3 fiz um experimento com `git stash` pra rodar os testes de WakeWordEngine num commit base (confirmar que os failures são pre-existentes). Ao fazer `stash pop`, houve um momento de confusão porque o sistema avisou que `useWakeWord.ts` e `useWakeWord.test.ts` estavam modificados — mas isso era exatamente o que eu queria (o stash restaurou minhas mudanças). Zero impacto no resultado.

**WakeWordEngine tests (pre-existing)** — 8 testes do WakeWordEngine falham com `document is not defined` porque o código acessa `document.baseURI` pra resolver URLs do worklet. Isso foi introduzido no commit f693537 do Phase 22 gap fix. Confirmado como pre-existente via `git stash + checkout` do base 71eb33f: ainda falha 8/8. Fora do escopo (scope boundary + fix attempt limit) — registrado em deferred-items.md abaixo.

**modelLoader.test.ts (pre-existing)** — idêntico: imports quebrados desde Phase 22, 1 test file failing. Registrado em deferred-items.md.

**integration-chat.test.ts (pre-existing)** — já estava no deferred-items.md do Plan 01 (TS2554 na linha 76).

## Deferred Issues

Nenhum issue de escopo do plano foi deferido. Todos os failing tests são pre-existentes. Atualizar `deferred-items.md` com as descobertas novas (WakeWordEngine + modelLoader):

Adicionar ao deferred-items.md:

| File | Error | Origem |
|------|-------|--------|
| `src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` (8 testes) | `ReferenceError: document is not defined` em `WakeWordEngine.start` | Phase 22 gap fix f693537 — `document.baseURI` não existe no test env |
| `src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts` | Import quebrado | Phase 22 |

**Recomendação:** criar test setup que stub `document.baseURI` via happy-dom config, ou migrar os testes pra usar `vi.mock('../WakeWordEngine', ...)`. Não é escopo de Plan 23-02.

## User Setup Required

None — plan 100% renderer + main process wiring, zero config externa, zero novo binário.

## Next Phase Readiness

**Phase 23 está funcionalmente completo.** Todos os requirements do CONTEXT.md foram entregues:

- WAKE-02 ✅ (burst precede listening com 350ms via Plan 02)
- WAKE-03 ✅ (tray pause/resume persistido via Plan 02)
- WAKE-04 ✅ (visual paused Plan 01 + wire Plan 02)
- ORB-POL-01 ✅ (reduced-motion global Plan 01)
- ORB-POL-02 ✅ (burst polish 350ms Plan 01 + Plan 02)

**Validação manual recomendada (via 23-VALIDATION.md):**
1. Iniciar app → ver orb cyan idle
2. Tray → "Pause listening" → orb vira subdued (opacity 0.6) → tooltip "JARVIS — paused"
3. Fechar app → reabrir → orb ainda paused (persistência)
4. Tray → "Resume listening" → orb volta normal
5. Falar "Hey JARVIS" → ver burst amber 350ms → orb vira listening (laranja)
6. OS Settings → Enable reduced motion → repetir 5 → orb transiciona direto sem animação

## Self-Check: PASSED

**Files existence:**
- FOUND: apps/desktop/src/main/store.ts
- FOUND: apps/desktop/src/main/__tests__/store.test.ts
- FOUND: apps/desktop/src/shared/ipc-types.ts
- FOUND: apps/desktop/src/preload/index.ts
- FOUND: apps/desktop/src/main/ipc/settings.ts
- FOUND: apps/desktop/src/main/ipc/__tests__/settings.test.ts
- FOUND: apps/desktop/src/main/tray.ts
- FOUND: apps/desktop/src/main/__tests__/tray.test.ts
- FOUND: apps/desktop/src/renderer/hooks/useWakeWord.ts
- FOUND: apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts

**Commits existence:**
- FOUND: 362a346 (Task 1 — store + IPC types + preload + ipc/settings)
- FOUND: 337de40 (Task 2 — tray)
- FOUND: 377a27f (Task 3 — useWakeWord)

**Verification runs:**
- `pnpm --filter @jarvis/desktop test --run src/main/__tests__/store.test.ts src/main/ipc/__tests__/settings.test.ts` → 12/12 passing
- `pnpm --filter @jarvis/desktop test --run src/main/__tests__/tray.test.ts` → 22/22 passing
- `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts` → 18/18 passing
- `pnpm --filter @jarvis/desktop build` → 0 TypeScript errors, main/preload/renderer bundles ok
- `grep -rn "wakeWordEnabled\|wake-word-settings-changed\|GET_WAKE_WORD_ENABLED\|SET_WAKE_WORD_ENABLED\|WAKE_WORD_SETTINGS_CHANGED" apps/desktop/src` → apenas 7 matches em comentários históricos + asserts negativos (`expect(...).not.toContain`) + nome de `it('no residual references...')`. Zero código vivo.
- `grep -rn "wakeWordPaused\|WAKE_WORD_PAUSE_TOGGLE\|WAKE_WORD_GET_PAUSED" apps/desktop/src` → 12 arquivos cobertos.
- `grep -n "triggerWakeBurst" apps/desktop/src/renderer/hooks/useWakeWord.ts` → 1 match dentro do onDetected.

---
*Phase: 23-orb-ux-polish*
*Plan: 02*
*Completed: 2026-04-11*
