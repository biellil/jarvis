---
phase: 23
phase_name: orb-ux-polish
phase_slug: orb-ux-polish
milestone: v1.4
milestone_name: Voice & UX Polish
gathered: 2026-04-11
status: Ready for planning
source: /gsd:discuss-phase 23 (interativo)
---

# Phase 23: Orb UX Polish + Wake Word Visual Feedback — Context

<domain>
## Phase Boundary

Fase de polish visual sobre a infraestrutura de wake word entregue em Phase 22. Fornece feedback visual imediato quando o wake word dispara, kill switch via tray, distinção visual clara entre estados "ativo" vs "pausado", e suporte a `prefers-reduced-motion`.

**Dentro de escopo (5 requirements P1):**
- **WAKE-02 + ORB-POL-02** — Wake burst animation (scale 1.0→1.1→1.0 + amber ring) no orb entre 200-500ms após `onDetected` disparar, ANTES da transição para `listening`
- **WAKE-03** — Item "Pause listening / Resume listening" no tray menu com persistência via `electron-store`
- **WAKE-04** — Distinção visual no ORB entre `idle + wake word ativo` vs `idle + wake word pausado` (interpretação estrita do requirement — tray icon não basta)
- **ORB-POL-01** — `@media (prefers-reduced-motion: reduce)` desliga keyframes loopadas (pulse, ripple, burst) mas mantém transitions 0.4s entre states

**Fora de escopo (3 P2 stretch — deferred pra milestone futura):**
- **ORB-POL-03** — Idle breathing com hue drift ±10°
- **ORB-POL-04** — Crossfade entre states via dual gradient layers
- **ORB-POL-05** — Drag-to-reposition com click-through carveout

**Phase depends on:** Phase 22 (callback `onDetected()` real do `WakeWordEngine` já entregue via `useWakeWord` hook — zero stub).

**Research flag:** NÃO — padrões CSS keyframes + React startTransition já provados em v1.2 (ORB-01..04). Zero deps novas. Vai direto pra `/gsd:plan-phase 23`.
</domain>

<decisions>
## Implementation Decisions

### D-01 — Estado "paused" via flag no OrbContext (não novo OrbState)

**Decisão:** Adicionar `wakeWordPaused: boolean` ao `OrbContext` como campo separado dos 4 states existentes (`idle` | `listening` | `processing` | `responding`). NÃO criar 5º state `idle-paused`.

**Rationale:** Mínimo impacto em tests existentes do `OrbContext` e `Orb.tsx` que assumem 4 states. Permite WAKE-04 (visual distinction) sem quebrar a superfície do `useOrbContext()`. O `useWakeWord` hook já existe e gerencia lifecycle — estender com `setWakeWordPaused` + wire pro tray é surgical.

**Shape atualizado:**
```ts
type OrbState = 'idle' | 'listening' | 'processing' | 'responding'; // unchanged

interface OrbContextValue {
  state: OrbState;
  setState: (newState: OrbState) => void;
  wakeWordPaused: boolean;                      // NEW
  setWakeWordPaused: (paused: boolean) => void; // NEW
}
```

**Visual aplicado quando `state==='idle' && wakeWordPaused===true`:**
- `opacity: 0.6` no root div do orb (atualmente 1.0)
- `filter: drop-shadow()` com glow 50% mais fraco (raio 12px em vez de 24px, alpha 0.28 em vez de 0.55)
- border interno com `rgba(180,180,180,0.22)` (cinza) em vez de `rgba(255,255,255,0.18)` (bright rim)

Nos demais states (`listening`, `processing`, `responding`), `wakeWordPaused` é ignorado — eles renderizam igual porque o wake word já cedeu o mic pra outro caller (ex: PTT preemptando).

---

### D-02 — Wake burst animation: 350ms precedendo a transição para listening

**Decisão:** Burst dispara imediatamente após `onDetected`, anima por **350ms**, e SÓ depois que termina o orb transiciona pra `listening`. Burst é único (mesma animação toda vez).

**Spec do burst:**
- `keyframes wake-burst`:
  - 0% — `transform: scale(1.0)`, opacidade ring `0`
  - 45% — `transform: scale(1.1)`, opacidade ring `1.0` (amber `#F59E0B`, 2px)
  - 100% — `transform: scale(1.0)`, opacidade ring `0`
- `duration: 350ms`, `ease-out`
- **NÃO sobreposto** — `setState('listening')` só roda depois do `animationend` OU via `setTimeout(350)` (planner decide o approach mais simples; testes mockam timers)

**Rationale:** Feedback expressivo e claro. Precedendo a transição separa "detectei você" de "capturando agora" cognitivamente. 350ms fica no meio do range (200-500ms) — suficiente pra ver mas não lento demais. Sobrepor atropelaria a percepção do burst.

**Integração com `useWakeWord` hook:**
- No `onDetected` handler, ANTES de `setState('listening')`: disparar `setOrbBurst(true)` (novo ref/state)
- `setTimeout(() => { setOrbBurst(false); setState('listening'); audioRecorder.startRecording(); }, 350)`
- `setOrbBurst(true)` aplica a animação CSS no orb via className (`animate-wake-burst`)

---

### D-03 — Tray menu: "Pause listening" no TOPO, só label muda

**Decisão:** Novo item no topo do context menu do tray (antes de Show/Hide), com label dinâmico que alterna entre `"Pause listening"` (quando ativo) e `"Resume listening"` (quando pausado). Sem ícone PNG variante — o mesmo `icon-16x16.png` do tray continua.

**Ordem final do menu:**
```
- Pause listening / Resume listening   ← NEW, topo
- (separator)
- Show
- Hide
- Configure Hotkey ►
- Configure PTT ►
- (separator)
- Open DevTools
- (separator)
- Quit
```

**Rationale:**
- Topo = acesso rápido (é um kill switch que pode ser urgente: call começando, visita chegando)
- Label dinâmico evita ambiguidade — o estado atual é sempre explícito
- Sem PNG variante: mantém assets simples, manutenção baixa. Tray tooltip pode refletir estado ("JARVIS — listening" vs "JARVIS — paused")

**Persistência via electron-store** (`apps/desktop/src/main/store.ts` já existe e é usado pra hotkey/PTT prefs):
- Nova chave: `wakeWordPaused: boolean` (default `false`)
- Getter/setter: `getWakeWordPaused()` / `setWakeWordPaused(paused)`
- No boot do `useWakeWord` hook, ler o valor via IPC → `window.jarvis.wakeWord.getPaused()` ou similar
- Quando usuário clica no tray item, main envia IPC pro renderer sincronizar o state

---

### D-04 — Default no primeiro launch: wake word ATIVO

**Decisão:** Primeira instalação tem `wakeWordPaused: false`. Usuário fala "Hey JARVIS" e funciona imediatamente.

**Rationale:** A primeira impressão é o diferencial do produto ("JARVIS realmente te escuta"). Privacy-first já está coberto pela escolha técnica — wake word é 100% offline, modelos ONNX locais, zero fetch de rede durante inferência (validado em Phase 22 WAKE-09). Usuário que quer modo silencioso descobre facilmente via tray (kill switch no topo do menu).

---

### D-05 — `prefers-reduced-motion: reduce` desliga keyframes loopadas, mantém transitions

**Decisão:** CSS media query `@media (prefers-reduced-motion: reduce)` desliga:
- `animate-pulse-idle` (idle infinite loop)
- `animate-pulse-listen` (listening infinite loop)
- `animate-spin-process` (processing infinite loop)
- `animate-ripple` (responding rings)
- `animate-wake-burst` (NOVO, one-shot do D-02)

Mantém:
- `transition: background 0.4s, border-color 0.4s, filter 0.4s` entre states
- `transition: opacity 0.4s` quando `wakeWordPaused` muda

**Rationale:** Animações repetitivas/expansivas são o problema real pra sensibilidade a movimento (vestibular disorders, VIMS). Transitions suaves de cor/gradient/glow entre states NÃO são problemáticas e são essenciais pra comunicar mudança de state visualmente. Sem eles o orb ficaria morto.

Implementação: Tailwind 4 já suporta `motion-reduce:` variant. Alternativamente, um bloco `@media (prefers-reduced-motion: reduce)` no CSS global zera `animation` nas classes listadas acima.

**Wake burst bypass:** quando reduced-motion está ativo, `useWakeWord.onDetected` NÃO espera os 350ms — pula direto pra `setState('listening')` porque o burst seria invisível mesmo. Evita delay percebido de 350ms pra usuário que não vê o feedback.

---

### D-06 — Tray ↔ Renderer IPC para sync de paused state

**Decisão:** Adicionar 2 canais IPC novos:
- `wakeWord:pause-toggle` (main → renderer, evento) — disparado quando usuário clica no tray item
- `wakeWord:get-paused` (renderer → main, request/response) — consultado no boot do hook pra restaurar persistência

**Shape:**
```ts
// ipc-types.ts
WAKE_WORD_PAUSE_TOGGLE: 'wakeWord:pause-toggle',
WAKE_WORD_GET_PAUSED: 'wakeWord:get-paused',

// preload index.ts — expõe em window.jarvis.wakeWord
interface WakeWordApi {
  loadModels: () => Promise<WakeWordModelBytes>;
  getPaused: () => Promise<boolean>;                   // NEW
  onPauseToggle: (cb: (paused: boolean) => void) => (() => void); // NEW listener
}
```

**Fluxo:**
1. No `useWakeWord` hook `boot()`: ler `const initialPaused = await window.jarvis.wakeWord.getPaused()`, passar pro `setWakeWordPaused(initialPaused)` do OrbContext
2. No mesmo boot: `const unsub = window.jarvis.wakeWord.onPauseToggle((paused) => setWakeWordPaused(paused))` — cleanup on unmount
3. Quando user clica no tray: `main/tray.ts` chama `store.setWakeWordPaused(!current)` + envia `webContents.send('wakeWord:pause-toggle', newValue)` pro renderer
4. Renderer recebe → atualiza OrbContext → orb re-renderiza com visual sutil paused

Quando `paused === true`, o `useWakeWord` também chama `engine.suspend()` imediatamente. Quando volta pra false, chama `engine.resume()`. Isso libera o mic pelo VoiceInputManager (via wrapper ou listener).

---

### D-07 — Testes: reutilizar padrões já validados em v1.2 (ORB-01..04) e Phase 22

**Decisão:** Não introduzir novos patterns de teste. Reutilizar:
- `@vitest-environment happy-dom` docblock em tests de componentes (Phase 22 pattern)
- `vi.hoisted()` pra mocks de classes (Phase 22 pattern)
- `@testing-library/react` com `render` + `rerender` pra testar re-renders condicionais do orb
- Unit tests do `store.ts` (getWakeWordPaused/setWakeWordPaused) com `electron-store` mockado (já existe pra hotkey prefs)
- Tests do tray.ts com mock do `Menu.buildFromTemplate` (já existe)
- Snapshot ou regex grep pra keyframes CSS novos
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — WAKE-02, WAKE-03, WAKE-04, ORB-POL-01, ORB-POL-02 (definição literal)
- `.planning/ROADMAP.md` — Phase 23 goal e success criteria
- `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-04-SUMMARY.md` — useWakeWord hook shape e onDetected callback
- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — estender com wakeWordPaused flag
- `apps/desktop/src/renderer/components/Orb/Orb.tsx` — aplicar visual sutil no idle+paused + nova classe wake-burst
- `apps/desktop/src/renderer/hooks/useWakeWord.ts` — disparar burst antes da transição pra listening, responder a wakeWord:pause-toggle
- `apps/desktop/src/main/tray.ts` — novo item no topo do menu, ordem reorganizada
- `apps/desktop/src/main/store.ts` — getWakeWordPaused/setWakeWordPaused
- `apps/desktop/src/shared/ipc-types.ts` — 2 novos channels (WAKE_WORD_PAUSE_TOGGLE, WAKE_WORD_GET_PAUSED)
- `apps/desktop/src/preload/index.ts` — wakeWord API estendido com getPaused/onPauseToggle
- Tailwind config / CSS global — animate-wake-burst keyframes, @media prefers-reduced-motion
</canonical_refs>

<deferred>
## Deferred Ideas

### P2 stretch goals (deferido pra milestone futura)

Todos os 3 P2 do roadmap Phase 23 ficam fora do escopo dessa phase. Entram num milestone futuro de polish quando houver budget:

- **ORB-POL-03** — Idle breathing com hue drift sutil (±10° a cada 4-8s) no orb idle ativo. Polish leve mas mexe em keyframes existentes e aumenta risco de regressão visual.
- **ORB-POL-04** — Crossfade entre states do orb usando dual gradient layers em vez de switch instantâneo com transition. Mais elegante mas exige refactor do Orb.tsx render structure (2 divs overlapping com opacity crossfade).
- **ORB-POL-05** — Drag-to-reposition do orb com posição persistida via electron-store. Requer carveout de click-through region (complexo) + coordenação com `setIgnoreMouseEvents` do Layer 10.

### Outras ideias soltas durante discussão

- **Wake burst variante por horário do dia** — burst mais brilhante de dia, mais discreto de noite. Rejeitado (overengineering pra o escopo atual).
- **Tray icon PNG variante pra paused** — rejeitado. Label dinâmico é suficiente. Pode ser adicionado depois se user feedback pedir.
- **Reduced-motion: desligar tudo** — rejeitado. Manter transitions preserva comunicação visual de state sem movimento repetitivo.
</deferred>

<out_of_scope>
## Explicitly Out of Scope

- **Wake burst sound effect ou haptic** — fora do escopo, não foi discutido, não é requirement
- **Config UI pra threshold/sensibilidade do wake word** — se user quiser ajustar, mexe em `.env` (já permitido)
- **Novos OrbStates** (ex: `error`, `degraded`) — mantém os 4 atuais
- **Tray icon com badge de status** — rejeitado em D-03
- **Drag-to-reposition** — P2 stretch deferido em D-01 do deferred
- **Qualquer backend change** — Phase 23 é 100% frontend + main process
- **Novas deps npm** — zero new deps confirmado no roadmap (Tailwind 4 + CSS keyframes + React 19)
</out_of_scope>
