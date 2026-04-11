---
phase: 23
slug: orb-ux-polish
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 + happy-dom 20.8.9 |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command (Plan 01)** | `pnpm --filter @jarvis/desktop test --run src/renderer/components/Orb/` |
| **Quick run command (Plan 02)** | `pnpm --filter @jarvis/desktop test --run src/main/__tests__/tray.test.ts src/main/__tests__/store.test.ts src/main/ipc/__tests__/settings.test.ts src/renderer/hooks/__tests__/useWakeWord.test.ts` |
| **Full suite command** | `pnpm --filter @jarvis/desktop test --run` |
| **Estimated runtime** | ~15s (Plan 01 subset) / ~40s (Plan 02 subset) / ~90s (full) |

---

## Sampling Rate

- **After every task commit:** Run the corresponding `Quick run` subset for the active plan.
- **After every plan wave:** Run `pnpm --filter @jarvis/desktop test --run` (full suite).
- **Before `/gsd:verify-work 23`:** Full suite green + build green + grep audits listed in §Audit Commands.
- **Max feedback latency:** 30 seconds per-task, 90 seconds per-wave.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement / Decision | Focus | Automated Command | Status |
|---------|------|------|-------------------------|-------|-------------------|--------|
| 23-01-01 | 01 | 1 | D-01, D-02, D-04 | OrbContext wakeWordPaused + burstActive + triggerWakeBurst (contract + default + timeout lifecycle) | `pnpm --filter @jarvis/desktop test --run src/renderer/components/Orb/__tests__/OrbContext.test.tsx` | ⬜ pending |
| 23-01-02 | 01 | 1 | WAKE-02, WAKE-04, ORB-POL-02 | Orb.tsx paused visual (opacity/glow/border) + amber ring overlay + tailwind keyframes | `pnpm --filter @jarvis/desktop test --run src/renderer/components/Orb/__tests__/Orb.test.tsx` | ⬜ pending |
| 23-01-03 | 01 | 1 | ORB-POL-01, D-05 | globals.css bloco @media (prefers-reduced-motion: reduce) listando as 6 classes | `grep -c "prefers-reduced-motion\|animate-wake-burst" apps/desktop/src/renderer/src/styles/globals.css` (espera ≥2) | ⬜ pending |
| 23-02-01 | 02 | 2 | D-03, D-04, D-06 | store realinhado para wakeWordPaused + IPC channels renomeados + preload API estendida | `pnpm --filter @jarvis/desktop test --run src/main/__tests__/store.test.ts src/main/ipc/__tests__/settings.test.ts` | ⬜ pending |
| 23-02-02 | 02 | 2 | WAKE-03, D-03 | tray menu item Pause/Resume no topo com label dinâmico + broadcast | `pnpm --filter @jarvis/desktop test --run src/main/__tests__/tray.test.ts` | ⬜ pending |
| 23-02-03 | 02 | 2 | WAKE-02, D-02, D-05, D-06 | useWakeWord triggerWakeBurst + 350ms delay + reduced-motion bypass + onPauseToggle wiring | `pnpm --filter @jarvis/desktop test --run src/renderer/hooks/__tests__/useWakeWord.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**Phase 23 é `wave_0_complete: true`**. Todos os arquivos-alvo já existem como resultado de Phase 22 + draft pré-existente (commits 77c8763, ffa7aeb, efc7133):

- [x] `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — existe, será estendido no 23-01-01
- [x] `apps/desktop/src/renderer/components/Orb/Orb.tsx` — existe, será estendido no 23-01-02
- [x] `apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx` — existe desde v1.2
- [x] `apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx` — existe desde v1.2 (com 2 testes pre-existing deferred — serão corrigidos no 23-01-02)
- [x] `apps/desktop/src/renderer/src/styles/globals.css` — existe
- [x] `apps/desktop/tailwind.config.ts` — existe
- [x] `apps/desktop/src/main/store.ts` — existe (draft wakeWordEnabled será substituído)
- [x] `apps/desktop/src/main/__tests__/store.test.ts` — precisa ser criado/estendido no 23-02-01 (se ainda não existir)
- [x] `apps/desktop/src/main/tray.ts` — existe (será reorganizado)
- [x] `apps/desktop/src/main/__tests__/tray.test.ts` — existe, tem 1 teste deferred que será corrigido
- [x] `apps/desktop/src/main/ipc/settings.ts` — existe (será reescrito)
- [x] `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — **precisa ser criado no 23-02-01** (é o único gap Wave 0 real)
- [x] `apps/desktop/src/shared/ipc-types.ts` — existe (canais serão renomeados)
- [x] `apps/desktop/src/preload/index.ts` — existe (API estendida)
- [x] `apps/desktop/src/renderer/hooks/useWakeWord.ts` — existe desde Phase 22 Plan 04
- [x] `apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts` — existe desde Phase 22 Plan 04

**Única criação nova:** `src/main/ipc/__tests__/settings.test.ts` — criado como parte do TDD Task 23-02-01 (RED antes de editar settings.ts).

---

## Audit Commands (rodar antes de `/gsd:verify-work 23`)

```bash
# 1. Zero código morto do draft antigo (ZERO matches esperado)
grep -rn "wakeWordEnabled\|wake-word-settings-changed\|GET_WAKE_WORD_ENABLED\|SET_WAKE_WORD_ENABLED\|SettingsApi" \
  apps/desktop/src --include='*.ts' --include='*.tsx' | grep -v __tests__

# 2. Novas superfícies presentes (≥8 matches esperados)
grep -rn "wakeWordPaused\|WAKE_WORD_PAUSE_TOGGLE\|WAKE_WORD_GET_PAUSED" \
  apps/desktop/src --include='*.ts' --include='*.tsx' | wc -l

# 3. triggerWakeBurst é chamado no hook (1 match)
grep -c "triggerWakeBurst" apps/desktop/src/renderer/hooks/useWakeWord.ts

# 4. Tailwind tem keyframe wake-burst (≥2 matches: wake-burst + wake-burst-ring)
grep -c "wake-burst" apps/desktop/tailwind.config.ts

# 5. globals.css tem prefers-reduced-motion (1 match) e lista as 6 classes
grep -A 10 "prefers-reduced-motion" apps/desktop/src/renderer/src/styles/globals.css

# 6. Tray menu item novo no topo (1 match cada)
grep -n "Pause listening\|Resume listening" apps/desktop/src/main/tray.ts

# 7. Build e test suite
pnpm --filter @jarvis/desktop build
pnpm --filter @jarvis/desktop test --run
pnpm --filter @jarvis/desktop lint
```

---

## Sampling Map por Decisão (D-01..D-07)

| Decision | Covered By | Test Evidence |
|----------|------------|---------------|
| D-01 `wakeWordPaused` em OrbContext | 23-01-01 | OrbContext.test.tsx: default, setter, ignore fora de idle |
| D-02 Burst 350ms precedendo listening | 23-01-01 (OrbContext timeout) + 23-01-02 (visual) + 23-02-03 (hook delay) | triple coverage: state + render + hook side effect |
| D-03 Tray item no topo + label alternante | 23-02-02 | tray.test.ts: index 0 é pause/resume, label switching |
| D-04 Default = ativo (paused=false) | 23-01-01 (OrbProvider) + 23-02-01 (store default) | dupla verificação: UI state + persistência |
| D-05 prefers-reduced-motion desliga + bypass burst delay | 23-01-03 (CSS) + 23-02-03 (hook bypass) | CSS grep + hook unit test matchMedia mock |
| D-06 IPC channels renomeados | 23-02-01 + 23-02-03 | types + preload + handler + listener end-to-end |
| D-07 Padrões de teste reutilizados | TODAS | happy-dom docblock, vi.hoisted, vi.mock, fake timers — reusando padrões Phase 22 |

---

## Requirements Coverage

| Requirement | Plan / Task | Test Evidence |
|-------------|-------------|---------------|
| WAKE-02 (wake burst visual) | 23-01-01 (context), 23-01-02 (render), 23-02-03 (hook dispatch) | triggerWakeBurst triple-checked |
| WAKE-03 (tray pause/resume persistido) | 23-02-01 (store), 23-02-02 (tray), 23-02-03 (hook consumer) | end-to-end: store → tray → IPC → hook → OrbContext |
| WAKE-04 (orb distinction idle active vs paused) | 23-01-02 (render), 23-02-02/03 (wire) | orb.test.tsx assertions no visual paused + wire live via tray |
| ORB-POL-01 (prefers-reduced-motion) | 23-01-03 (CSS), 23-02-03 (hook bypass) | grep CSS + hook unit test |
| ORB-POL-02 (burst 200-500ms polish) | 23-01-01/02 (350ms keyframe), 23-02-03 (hook delay) | duration checado em tests |

---

## Nyquist Compliance

**✅ COMPLIANT.** Cada task tem:
- `<automated>` verify command presente
- Teste unitário cobrindo o comportamento (não apenas grep)
- Cenários listados em `<behavior>` blocks dos planos

Tasks 23-01-03 (CSS) é a única baseada em grep pura, justificada: CSS global não tem asserção automatizável simples sem carregar o bundle — o grep verifica a presença literal do bloco + classes, e o comportamento é validado visualmente via manual checkpoint opcional no fim da phase.

---

## Manual Smoke Test (opcional, fim de phase)

Após `/gsd:verify-work 23` passar, um smoke manual rápido para confirmar o visual end-to-end:

1. `pnpm --filter @jarvis/desktop dev` — abre o widget
2. Falar "Hey JARVIS" → observar ring amber flashar ~350ms antes do orb ficar laranja
3. Click no tray → "Pause listening" → orb idle fica tênue (opacity/glow reduzidos) + borda cinza
4. Click no tray → "Resume listening" → orb volta ao brilho normal
5. Fechar e reabrir o app → estado paused/active persistiu (store)
6. Ativar `prefers-reduced-motion` no OS (Windows: Settings → Accessibility → Visual effects → Animation effects off) → recarregar o widget → confirmar que o pulse idle NÃO loopa mais; confirmar que wake burst NÃO flasha mas listening ainda transiciona

**Este smoke é OPCIONAL** — a cobertura automatizada é suficiente para fechar a phase. O smoke é polish de confiança.
