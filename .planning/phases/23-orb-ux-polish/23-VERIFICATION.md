---
phase: 23-orb-ux-polish
verified: 2026-04-11T16:15:00Z
status: human_needed
score: 5/5 must-haves verified (automated)
overrides_applied: 0
re_verification: null
human_verification:
  - test: "Wake burst visual timing"
    expected: "Após disparar o wake word 'Hey JARVIS', o orb mostra um pulse (scale 1.0→1.1→1.0) + amber ring (#F59E0B) por ~350ms antes de virar laranja (listening)"
    why_human: "Animação CSS de 350ms — não verificável sem render real + captura visual ou olho humano"
  - test: "Paused visual distinction (idle ATIVO vs idle PAUSADO)"
    expected: "Clicar 'Pause listening' no tray → orb fica visualmente mais tênue (opacity 0.6, glow cyan mais fraco, border interno cinza). Clicar 'Resume listening' → orb volta pro visual normal"
    why_human: "Diferença visual sutil (opacity 1.0 vs 0.6, glow 24px vs 12px) — precisa olho humano pra validar que a distinção é clara o suficiente"
  - test: "Tray menu label dinâmico + tooltip sincronizado"
    expected: "Primeiro item do menu tray alterna entre 'Pause listening' ↔ 'Resume listening'. Tooltip do tray alterna entre 'JARVIS — listening' ↔ 'JARVIS — paused'"
    why_human: "Comportamento do Electron tray não roda no test env (happy-dom não monta tray real)"
  - test: "Persistência cross-session do wakeWordPaused"
    expected: "Pausar → fechar app → reabrir → orb ainda paused (estado persistido via electron-store)"
    why_human: "Requer ciclo completo de app lifecycle — não cobrível em unit test"
  - test: "prefers-reduced-motion desliga animações preservando transitions"
    expected: "Com OS setting de reduced-motion ativo: (a) orb NÃO tem animate-pulse-idle loop, (b) mudança de state ainda transiciona cor/glow em 0.4s, (c) wake word detection pula o delay de 350ms e vai direto pra listening"
    why_human: "Requer toggle no OS + inspeção visual do DOM real + measurement de latência percebida"
  - test: "E2E wake word flow com burst precedendo listening"
    expected: "Falar 'Hey JARVIS' → burst amber aparece IMEDIATAMENTE → 350ms depois orb vira listening (laranja). Usuário percebe 'detectei você' antes de 'gravando'"
    why_human: "Requer mic real, WakeWordEngine carregado, áudio real — não cobrível em unit test"
---

# Phase 23: Orb UX Polish + Wake Word Visual Feedback — Verification Report

**Phase Goal:** Usuário tem feedback visual imediato quando o wake word dispara, distingue claramente o estado "escutando wake word" de "pausado", e pode pausar/retomar via tray — tudo com suporte a `prefers-reduced-motion`.

**Verified:** 2026-04-11T16:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Usuário vê wake burst animation no orb (scale 1.0→1.1→1.0 + amber ring) entre 200–500ms após o wake word disparar, antes da gravação começar (WAKE-02, ORB-POL-02) | VERIFIED (code) / NEEDS HUMAN (visual) | `useWakeWord.ts:154` chama `triggerWakeBurst()` sincronamente. `useWakeWord.ts:189` arma `setTimeout(proceed, 350)` que transiciona pra listening. `tailwind.config.ts:55-56` define `wake-burst` e `wake-burst-ring` 350ms ease-out. `Orb.tsx:98,191-203` renderiza className `animate-wake-burst` no root + amber ring overlay `#F59E0B 2px solid` quando `burstActive===true`. 350ms está dentro do range 200-500ms do ORB-POL-02. |
| 2 | Usuário abre o tray menu e vê item "Pause listening" / "Resume listening" que alterna o estado imediatamente, com a preferência persistindo entre sessões via electron-store (WAKE-03) | VERIFIED (code) / NEEDS HUMAN (E2E) | `tray.ts:74` label dinâmico `paused ? 'Resume listening' : 'Pause listening'`. `tray.ts:75-82` click handler: toggle store + `broadcastPauseToggle` + rebuild menu. `store.ts:63-74` persiste via electron-store com chave `wakeWordPaused`, default false, defensive boolean check. `settings.ts:17-21` registra handler `wakeWord:get-paused`. `settings.ts:27-31` broadcastPauseToggle envia `WAKE_WORD_PAUSE_TOGGLE` para TODAS as BrowserWindows. `useWakeWord.ts:117,119` boot lê `getPaused()` e propaga via `setWakeWordPaused`. `useWakeWord.ts:265-284` listener `onPauseToggle` propaga mudanças e suspende/resume engine. |
| 3 | Usuário consegue distinguir visualmente "idle com wake word ATIVO" de "idle com wake word PAUSADO" (WAKE-04) | VERIFIED (code) / NEEDS HUMAN (visual) | `Orb.tsx:82` computa `isPausedVisual = state === 'idle' && wakeWordPaused`. `Orb.tsx:84-91` aplica quando paused: `rootOpacity=0.6` (vs 1.0), `glowRadius=12` (vs 24), `glowRgba='rgba(43,168,212,0.28)'` (vs 0.55 state glow), `innerBorder='rgba(180,180,180,0.22)'` (vs 'rgba(255,255,255,0.18)'). Além disso, tray tooltip reflete estado via `tray.ts:68`: `'JARVIS — paused'` vs `'JARVIS — listening'`. Tray icon variant foi EXPLICITAMENTE rejeitada em D-03 do CONTEXT.md — label dinâmico + visual do orb + tooltip são suficientes. |
| 4 | Usuário com prefers-reduced-motion ativo vê versão reduzida/simplificada das keyframes do orb (ORB-POL-01) | VERIFIED (code) / NEEDS HUMAN (OS toggle) | `globals.css:44-53` contém bloco `@media (prefers-reduced-motion: reduce)` listando as 6 classes (`animate-pulse-idle`, `animate-pulse-listen`, `animate-spin-process`, `animate-ripple`, `animate-wake-burst`, `animate-wake-burst-ring`) com `animation: none !important`. Transitions preservadas (D-05). `useWakeWord.ts:67-73` helper `prefersReducedMotion()` + `useWakeWord.ts:186-188` bypass: quando true, chama `proceed()` síncrono pulando o setTimeout de 350ms. |
| 5 | Distinção entre state="idle" (pausado) e state="listening" não pode ser ofuscada (wakeWordPaused ignorado fora de idle) | VERIFIED | `Orb.tsx:82` `isPausedVisual = state === 'idle' && wakeWordPaused` — garante que listening/processing/responding renderizam full brightness mesmo com wakeWordPaused=true. Testado em `Orb.test.tsx`. |

**Score:** 5/5 truths VERIFIED at code level. 5 itens precisam de confirmação humana (visual/E2E).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` | OrbContext estendido com wakeWordPaused + setWakeWordPaused + burstActive + triggerWakeBurst (D-01 + D-02) | VERIFIED | 4 campos novos no value (linhas 36-39). Default `wakeWordPaused=false` (D-04) linha 48. `triggerWakeBurst` re-arma timer via `clearTimeout` + `setTimeout(..., BURST_DURATION_MS=350)` linhas 53-62. useEffect cleanup on unmount linhas 65-72. |
| `apps/desktop/src/renderer/components/Orb/Orb.tsx` | Orb renderiza visual paused + classe animate-wake-burst + amber ring overlay | VERIFIED | `isPausedVisual` derivado linha 82. `rootClassName = burstActive ? 'animate-wake-burst' : undefined` linha 98. Root opacity/glow/border condicionais linhas 84-91. Amber ring overlay condicional linhas 191-203 com `border: '2px solid #F59E0B'`. |
| `apps/desktop/src/renderer/src/styles/globals.css` | @media (prefers-reduced-motion: reduce) zerando keyframes loopadas + wake-burst | VERIFIED | Bloco presente linhas 44-53 com 6 classes listadas (5 do Orb + wake-burst-ring) e `animation: none !important`. Transitions NÃO tocadas. |
| `apps/desktop/tailwind.config.ts` | Keyframe wake-burst + animação animate-wake-burst 350ms ease-out | VERIFIED | animations `wake-burst` (linha 55) e `wake-burst-ring` (linha 56), ambos 350ms ease-out. Keyframes correspondentes linhas 76-85. |
| `apps/desktop/src/main/store.ts` | getWakeWordPaused/setWakeWordPaused com chave wakeWordPaused | VERIFIED | `DEFAULT_WAKE_WORD_PAUSED = false` linha 26. Getter linhas 63-66, setter linhas 68-74 com defensive boolean check. Chave correta `wakeWordPaused`. |
| `apps/desktop/src/shared/ipc-types.ts` | IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE + WAKE_WORD_GET_PAUSED + WakeWordApi estendida | VERIFIED | Canais linhas 110-111. WakeWordApi com `getPaused` + `onPauseToggle` linhas 87-97. Canais draft antigos (`GET_WAKE_WORD_ENABLED`, etc.) removidos — zero referência no código vivo. |
| `apps/desktop/src/main/ipc/settings.ts` | handler wakeWord:get-paused + broadcastPauseToggle helper | VERIFIED | `setupSettingsHandlers()` registra handler linhas 17-21. `broadcastPauseToggle()` envia para todas as BrowserWindows linhas 27-31. Wired via `ipc/index.ts:15`. |
| `apps/desktop/src/main/tray.ts` | Menu item pause/resume no topo com label dinâmico e tooltip atualizado | VERIFIED | Item no TOPO do `buildContextMenu` linhas 73-83. Label dinâmico linha 74. Click handler: store + broadcast + rebuild linhas 75-82. Tooltip sincronizado linha 68. |
| `apps/desktop/src/renderer/hooks/useWakeWord.ts` | Hook consome wakeWord.getPaused + onPauseToggle, propaga para OrbContext, dispara triggerWakeBurst pré-listening com 350ms delay + reduced-motion bypass | VERIFIED | Imports `wakeWordPaused, setWakeWordPaused, triggerWakeBurst` do OrbContext linhas 79-81. `wakeWordPausedRef` mirror linhas 90-91. Boot lê `getPaused()` linha 117. Listener `onPauseToggle` linhas 265-284. `triggerWakeBurst()` ANTES do setTimeout de 350ms linhas 154-189. Reduced-motion bypass linhas 186-188. |
| `apps/desktop/src/preload/index.ts` | window.jarvis.wakeWord.getPaused + onPauseToggle expostos via contextBridge | VERIFIED | `wakeWord.getPaused` invoke linha 61-62. `wakeWord.onPauseToggle` com unsubscribe closure linhas 63-69. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| OrbContext.tsx | Orb.tsx | useOrbContext() retorna wakeWordPaused + burstActive | WIRED | `Orb.tsx:68` desestrutura `{ state, wakeWordPaused, burstActive }` de `useOrbContext()`. |
| Orb.tsx | tailwind animate-wake-burst | className condicional quando burstActive===true | WIRED | `Orb.tsx:98` `const rootClassName = burstActive ? 'animate-wake-burst' : undefined;` aplicado linha 103. Overlay linha 193 aplica `animate-wake-burst-ring`. |
| globals.css | tailwind-generated animate-* classes | @media query overridando animation: none | WIRED | 6 classes listadas no bloco media query — todas presentes no tailwind.config.ts. |
| tray.ts onClick handler | store.setWakeWordPaused + broadcastPauseToggle | toggle do valor atual + broadcast | WIRED | `tray.ts:75-82` chama `setWakeWordPaused(next)` + `broadcastPauseToggle(next)` + rebuild menu. |
| preload/index.ts | ipc-types.ts IPC_CHANNELS | ipcRenderer.invoke + ipcRenderer.on | WIRED | `preload/index.ts:61-69` usa `IPC_CHANNELS.WAKE_WORD_GET_PAUSED` e `IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE`. |
| useWakeWord.ts onDetected | OrbContext.triggerWakeBurst + setState('listening') após 350ms | closure com setTimeout + matchMedia check | WIRED | `useWakeWord.ts:154` `triggerWakeBurst()`, linha 189 `setTimeout(proceed, 350)`, linha 186-188 bypass reduced-motion. |
| useWakeWord.ts boot | window.jarvis.wakeWord.getPaused + setWakeWordPaused do OrbContext | await getPaused + propagação | WIRED | `useWakeWord.ts:117,119` `const initialPaused = await window.jarvis.wakeWord.getPaused(); setWakeWordPaused(initialPaused);`. |
| setupSettingsHandlers | IPC main registration | ipc/index.ts | WIRED | `ipc/index.ts:15` chama `setupSettingsHandlers()` no setup global. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Orb.tsx | `wakeWordPaused` | OrbContext ← useWakeWord.setWakeWordPaused ← window.jarvis.wakeWord.getPaused()/onPauseToggle ← main/ipc/settings ← store.getWakeWordPaused ← electron-store | Sim — electron-store persiste valor booleano real | FLOWING |
| Orb.tsx | `burstActive` | OrbContext ← triggerWakeBurst() ← useWakeWord.onDetected ← WakeWordEngine.onDetected (Phase 22 real, não stub) | Sim — WakeWordEngine real entregue em Phase 22 Plan 04 | FLOWING |
| Orb.tsx | `state` | OrbContext ← useWakeWord.setState('listening') após 350ms | Sim — state transition real acoplada à detecção | FLOWING |
| tray.ts menu label | `paused` | store.getWakeWordPaused() ← electron-store persisted value | Sim — rebuild do menu lê valor live | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Orb + OrbContext + useWakeWord + store + tray + settings tests pass | `pnpm --filter @jarvis/desktop test --run src/renderer/components/Orb/ src/main/__tests__/store.test.ts src/main/ipc/__tests__/settings.test.ts src/main/__tests__/tray.test.ts src/renderer/hooks/__tests__/useWakeWord.test.ts` | 82/82 passing (6 test files) | PASS |
| Zero residual references to drafted `wakeWordEnabled` in live code | grep `wakeWordEnabled\|wake-word-settings-changed` em `apps/desktop/src` | Apenas comentários históricos + asserts negativos (`not.toContain`) + teste de nome — zero código vivo | PASS |
| Tailwind keyframes `wake-burst` definidos | grep `wake-burst` em `tailwind.config.ts` | 6 matches (2 animations + 2 keyframe blocks + 2 comments) | PASS |
| globals.css contém bloco reduced-motion | grep `prefers-reduced-motion` em `globals.css` | 2 matches (comment + @media rule) | PASS |
| Phase 23 IPC channels presentes | grep `WAKE_WORD_PAUSE_TOGGLE\|WAKE_WORD_GET_PAUSED` em `apps/desktop/src` | Presentes em ipc-types.ts, preload, settings, tray, useWakeWord, tests | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WAKE-02 | 23-01, 23-02 | Feedback visual imediato (wake burst) antes da gravação | SATISFIED | triggerWakeBurst chamado sincronamente em onDetected; 350ms delay antes de setState('listening'); amber ring overlay renderizado com keyframe opacity 0→1→0. Precisa validação humana de timing percebido. |
| WAKE-03 | 23-02 | Pause/Resume listening via tray + persistência entre sessões | SATISFIED | Tray item no topo com label dinâmico; store.wakeWordPaused persistido via electron-store; broadcast + listener + engine.suspend/resume wired. Precisa validação humana de ciclo reopen app. |
| WAKE-04 | 23-01, 23-02 | Distinção visual idle ATIVO vs idle PAUSADO | SATISFIED | isPausedVisual aplica opacity 0.6 + glow 12px cyan alpha 0.28 + muted border. Tray tooltip adicional sincronizado. Precisa validação humana de clareza visual. |
| ORB-POL-01 | 23-01, 23-02 | prefers-reduced-motion desliga keyframes do orb | SATISFIED | @media block em globals.css lista as 6 classes de animation; useWakeWord bypass o delay de 350ms quando reduced-motion ativo. Transitions preservadas. Precisa validação humana com OS setting real. |
| ORB-POL-02 | 23-01, 23-02 | Wake burst polish 200-500ms | SATISFIED | 350ms (centro do range) implementado nos keyframes Tailwind + useWakeWord delay. |

**Orphaned requirements check:** REQUIREMENTS.md mapeia Phase 23 para 5 P1 (WAKE-02, 03, 04, ORB-POL-01, 02) + 3 P2 stretch (ORB-POL-03, 04, 05). Os 3 P2 stretch estão EXPLICITAMENTE deferidos no 23-CONTEXT.md `<deferred>` section e não são bloqueadores para o fechamento do milestone. Zero requirements P1 órfãos.

### Anti-Patterns Found

Nenhum anti-pattern bloqueador identificado. O 23-REVIEW.md (executado anteriormente) identificou 3 warnings (WR-01 margin: 10 bug em globals.css, WR-02 setTimeout leak potencial no burst delay, WR-03 stale closure em audioRecorder) e 6 info items — nenhum crítico, todos não bloqueiam o goal achievement. Esses warnings são oportunidades de melhoria para follow-up, não gaps da fase.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| globals.css | 10 | `margin: 10;` (CSS inválido) | Info | Parser descarta silenciosamente; efeito equivalente a margin:0. Pre-existente. |
| useWakeWord.ts | 189 | setTimeout sem ref pra cleanup | Warning | Leak teórico se componente unmountar entre onDetected e 350ms. Debounce do engine de 2s mitiga concorrência. |
| useWakeWord.ts | 161,176 | audioRecorder closure | Warning | Funciona hoje (funções estáveis via useCallback provável), mas invariante não validada. |

### Human Verification Required

1. **Wake burst visual timing**
   - **Test:** Falar "Hey JARVIS" e observar o orb
   - **Expected:** Pulse amber ring visível por ~350ms antes do orb virar laranja (listening)
   - **Why human:** Animação CSS em runtime real — não cobrível em test env

2. **Paused visual distinction**
   - **Test:** Com app aberto, clicar "Pause listening" no tray e comparar com o orb ativo
   - **Expected:** Orb paused visivelmente mais tênue (opacity 0.6, glow mais fraco, border interno cinza). Clicar "Resume listening" → volta ao normal
   - **Why human:** Diferença visual sutil precisa olho humano pra validar clareza

3. **Tray menu label dinâmico + tooltip sincronizado**
   - **Test:** Abrir menu do tray → clicar Pause → reabrir menu → clicar Resume. Observar tooltip do tray.
   - **Expected:** Label alterna "Pause listening" ↔ "Resume listening". Tooltip alterna "JARVIS — listening" ↔ "JARVIS — paused"
   - **Why human:** Electron tray não existe em test env (happy-dom)

4. **Persistência cross-session do wakeWordPaused**
   - **Test:** Pausar → fechar app → reabrir → verificar estado do orb e menu
   - **Expected:** Orb ainda paused, menu mostra "Resume listening"
   - **Why human:** Requer ciclo completo de app lifecycle

5. **prefers-reduced-motion ativo**
   - **Test:** Habilitar OS setting de reduced-motion (Linux: `gsettings set org.gnome.desktop.interface enable-animations false`; macOS: System Settings → Accessibility → Display → Reduce motion; Windows: Settings → Ease of Access → Display → Show animations). Observar orb idle, trigger wake word e trocar de state.
   - **Expected:** (a) orb idle não faz pulse loop, (b) mudança de state ainda transiciona cor/glow em 0.4s, (c) wake word detection pula o burst delay de 350ms e vai direto pra listening
   - **Why human:** Requer OS setting real + inspeção visual + measurement de latência

6. **E2E wake word flow completo**
   - **Test:** Boot do app → falar "Hey JARVIS" → falar uma frase → esperar resposta
   - **Expected:** Burst amber visível (imediato) → transição pra listening (laranja) após 350ms → STT → processing → responding → volta pra idle
   - **Why human:** Requer WakeWordEngine carregado + mic real + backend gateway vivo

### Gaps Summary

**Nenhum gap de código identificado.**

Todos os 10 artifacts do PLAN frontmatter existem, são substantivos (não stubs), estão wired no fluxo de dados real (OrbContext → Orb.tsx, useWakeWord → OrbContext, tray → store → broadcast → useWakeWord, preload → main handlers) e passam em 82 testes unitários. Os 5 P1 requirements (WAKE-02, WAKE-03, WAKE-04, ORB-POL-01, ORB-POL-02) estão satisfeitos no nível de código.

O status `human_needed` reflete que a fase é inerentemente visual/UX: timing de animação de 350ms, distinção visual sutil de opacity/glow, comportamento de OS-level reduced-motion setting, e persistência cross-session do electron-store não são cobríveis em unit tests — precisam de olho humano e ciclo completo de app.

**Observação sobre SC #3 do ROADMAP:** O texto original do success criterion 3 mencionava "cores, opacidade ou ring diferentes no orb + variante no tray icon". A decisão D-03 do 23-CONTEXT.md explicitamente rejeitou variante de PNG do tray icon em favor de label dinâmico + tooltip sincronizado ("JARVIS — paused" / "JARVIS — listening"). Esta decisão é documentada em CONTEXT.md D-03 rationale linha 107 e `<deferred>` linha 217 ("Tray icon PNG variante pra paused — rejeitado. Label dinâmico é suficiente"). Implementação respeita a decisão: visual do orb + label dinâmico + tooltip sincronizado cobrem a distinção.

**Items deferidos (P2 stretch — fora de escopo):** ORB-POL-03 (idle breathing hue drift), ORB-POL-04 (state crossfade), ORB-POL-05 (drag-to-reposition). Documentados no CONTEXT.md `<deferred>` e no roadmap como "stretch goals, ship se budget permitir". Não bloqueiam fechamento do milestone v1.4.

---

*Verified: 2026-04-11T16:15:00Z*
*Verifier: Claude (gsd-verifier)*
