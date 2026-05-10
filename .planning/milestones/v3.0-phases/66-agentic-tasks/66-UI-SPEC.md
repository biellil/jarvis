---
phase: 66
slug: agentic-tasks
status: draft
shadcn_initialized: true
preset: existing-jarvis-design-system-v2.1
created: 2026-05-09
---

# Phase 66 — UI Design Contract

> Visual and interaction contract for the multi-step agentic task flow (TaskCheckList component family) and orb badge integration. Reuses the JARVIS design system (Phases 48-49: Tailwind v4 @theme + shadcn/Radix primitives) with NO new tokens or primitives. All user-facing copy is pt-BR per CLAUDE.md.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (initialized Phase 48) |
| Preset | existing — `apps/desktop/components.json` (style: new-york, baseColor: slate, cssVariables: true) |
| Component library | Radix primitives (`@radix-ui/react-label`, `react-select`, `react-slider`, `react-slot`, `react-switch`) wrapped by manual shadcn-style primitives in `apps/desktop/src/renderer/src/components/ui/` |
| Icon library | lucide-react ^1.14.0 |
| Font | Inter (system fallback chain) — `--font-sans` |
| Tailwind | v4.0.0 with `@theme` block in `src/renderer/src/styles/globals.css` |

**Stack lockdown (do NOT change in this phase):**

- React 19 + TypeScript + Tailwind v4 + Radix primitives (already in stack)
- No Framer Motion in repo today — use **CSS-only animations** via Tailwind utilities + the existing `progress-shimmer` keyframe + `motion-safe:` / `motion-reduce:` variants (precedent: ORB-POL-01 since Phase 11/v1.4)
- All colors flow from `@theme` tokens — no inline hex codes in component code (precedent: Phase 48 Button)
- Reuse existing primitives: `Button`, `Field`, `Input`, `Label`, `Progress`, `Toast`. **Do NOT introduce new ones.**
- AudioContext singleton mandate (Phase 53 D-12) — no new audio per component

---

## Spacing Scale

Declared values (multiples of 4 — already locked in `globals.css`):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| `xs` | 4px | Step icon ↔ checkbox gap; row inner padding |
| `sm` | 8px | Button gap; checklist row vertical rhythm; failure-decision button row gap |
| `md` | 12px | Step row vertical padding; nota cinza top margin |
| `base` | 16px | TaskCheckList outer padding (matches existing chat bubbles) |
| `lg` | 24px | Block gap between plan list and action button row |
| `xl` | 32px | (not used in this phase) |
| `2xl` | 48px | (not used in this phase) |

**Exceptions:** none. All Phase 66 components MUST use only the declared tokens via `gap-xs`, `p-md`, `space-y-sm`, etc.

**Touch-target rule:** Inline buttons in TaskCheckList use `Button size="sm"` (28px) for compact density inside chat bubbles. This is below 44px because the widget is desktop-only (mouse/keyboard), matches existing chat-input button sizing, and an alternative voice/text path always exists per D-06/D-14 (no a11y blocker — keyboard-reachable + voice-reachable).

---

## Typography

Declared sizes (already locked in `@theme` — no new sizes added):

| Role | Size | Weight | Line Height | Token | Where used |
|------|------|--------|-------------|-------|------------|
| Caption / Badge | 12px | 600 | 1.4 | `--text-xs` | Orb Layer 6 badge (`AGENT 3/7`); nota cinza disclaimer |
| Body / Step description | 14px | 400 | 1.5 | `--text-sm` | Step `description` text; failure error message; edit-input placeholder; sumário pós-task |
| Button label / Step number | 14px | 500 | 1.5 | `--text-sm` + `font-medium` | All inline action buttons; numerical "N." prefix on each step |
| Plan heading | 16px | 600 | 1.3 | `--text-base` + `font-semibold` | Optional intro line "Aqui está o plano:" (1 line, only in `awaiting-confirmation`) |

**Weights used:** **2 only — 400 (regular) + 600 (semibold/medium-as-500-rendering)**. Do NOT introduce 300/700/900.

**Monospace family** (`'SF Mono', 'Fira Code', 'Consolas', monospace`) is used **only** for the orb badge text (`AGENT N/M`) — matches the existing badge font from Phase 42 (`Orb.tsx:411`).

---

## Color

60/30/10 split inherited from globals.css (Phase 48 lockdown). NO new color tokens for this phase.

| Role | Value | Token | Usage in Phase 66 |
|------|-------|-------|-------------------|
| Dominant (60%) | `#020617` slate-950 (transparent in widget; opaque in app-surface) | `--color-bg` | TaskCheckList sits on the existing chat surface — no new background |
| Secondary (30%) | `rgba(15,23,42,0.70)` slate-900/70 | `--color-surface` | TaskCheckList bubble background (matches assistant chat bubble) |
| Accent (10%) | `#06B6D4` cyan-500 | `--color-accent` | **Reserved for: (a) primary CTA button "Confirmar"; (b) currently-running step border-left highlight (2px); (c) accent ring focus state on all buttons via `--color-accent-ring`** |
| Success | `#10B981` emerald-500 | `--color-success` | Completed step ✅ icon (`Check` lucide @ `text-success`); Progress `status='success'` (already canonical) |
| Destructive | `#F43F5E` rose-500 | `--color-destructive` | Failed step ❌ icon (`X` lucide @ `text-destructive`); "Cancelar" + "Abortar" buttons (Button `variant="destructive"`); error message text in `awaiting-failure-decision` and `error` states |
| Foreground | `#FFFFFF` / muted variants | `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-fg-disabled` | `fg-muted` for step description; `fg-subtle` for the nota cinza disclaimer; `fg-disabled` for steps not yet reached |

**Accent reserved for (explicit list — never "all interactive elements"):**

1. The single primary CTA per state: `Confirmar` in `awaiting-confirmation`, `Continuar` in `awaiting-failure-decision`, the (cancellable) "Cancelar" replacement in `executing` IS NOT accent — it is `destructive`.
2. The 2px `border-l-2 border-accent` on the **currently running step row** in `executing` state.
3. The focus-visible ring `ring-accent-ring` on every focusable element (existing Button primitive default).

**Accent forbidden for:** every step row that is not currently running, every text label, every icon outside the focus ring, the orb badge text (badge stays neutral/voice-mode-colored), the failure-state buttons.

**State color contract per step:**

| Step status | Icon | Icon token | Row treatment |
|-------------|------|------------|---------------|
| `pending` | Empty circle (`Circle` size-4) | `text-fg-disabled` | `text-fg-disabled` description; default border |
| `running` | Spinner (`Progress variant="circular"` indeterminate, size-4) | `text-accent` | `text-fg` description; `border-l-2 border-accent pl-sm` highlight |
| `success` | `Check` size-4 | `text-success` | `text-fg-muted` description; output 1-liner appears below at `text-fg-subtle` |
| `error` | `X` size-4 | `text-destructive` | `text-fg-muted` description; `text-destructive` error line below |
| `cancelled-skip` | `Circle` size-4 (dashed via `[stroke-dasharray:2_2]`) | `text-fg-subtle` | `text-fg-subtle line-through` description (steps that did not run because cancel/abort fired before them) |

---

## Component Inventory

Components introduced in this phase. Reuse-first: 8 of 9 leaves are existing primitives.

### TaskCheckList (NEW — single component, state-machine driven)

**File:** `apps/desktop/src/renderer/src/chat/TaskCheckList.tsx`

Renders the assistant turn whenever the chat context's `tasks: Map<taskId, TaskUiState>` has an active task whose `parentMessageId` matches this turn. Replaces the normal text bubble for that turn — there is no fallback double-render.

**Props:**

```ts
interface TaskCheckListProps {
  taskId: string;
  state: TaskUiState; // see below
  onConfirm: () => void;     // POST /api/tasks/:id/resume { kind: 'confirm' }
  onCancel: () => void;      // POST /api/tasks/:id/resume { kind: 'cancel' }   [during awaiting-confirmation]
                             // OR POST /api/tasks/:id/cancel                    [during executing]
  onEditSubmit: (feedback: string) => void; // POST /api/tasks/:id/resume { kind: 'edit', feedback }
  onFailureContinue: () => void;     // POST /api/tasks/:id/resume { kind: 'continue' }
  onFailureReplan: () => void;       // POST /api/tasks/:id/resume { kind: 'replan' }
  onFailureAbort: () => void;        // POST /api/tasks/:id/resume { kind: 'abort' }
}
```

**State machine — single discriminated union owning the visual state:**

```ts
type TaskUiState =
  | { kind: 'awaiting-confirmation'; plan: Plan; editMode: false }
  | { kind: 'awaiting-confirmation'; plan: Plan; editMode: true } // user clicked Editar
  | { kind: 'editing-loop'; previousPlan: Plan }                    // planner re-running after edit submit
  | { kind: 'executing'; plan: Plan; steps: StepUiState[]; currentStepId: number }
  | { kind: 'awaiting-failure-decision'; plan: Plan; steps: StepUiState[]; failedStepId: number; errorMessage: string }
  | { kind: 'done'; summary: string; steps: StepUiState[] }
  | { kind: 'cancelled'; atStep: number; steps: StepUiState[] }
  | { kind: 'error'; atStep: number; errorMessage: string; steps: StepUiState[] };

interface StepUiState {
  id: number;
  description: string;       // from Plan
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled-skip';
  outputSummary?: string;    // ≤ 80 chars, pt-BR, populated on task:step:end success
}
```

**Layout for each state:** see "Visual Variants" section below.

### Inline leaves (all REUSED — no new primitives)

| Leaf | Source | Variant / Props used |
|------|--------|----------------------|
| `Button` | `@/components/ui/button` | `variant="primary" size="sm"` for Confirmar / Continuar; `variant="secondary" size="sm"` for Editar / Replanejar; `variant="destructive" size="sm"` for Cancelar / Abortar |
| `Input` | `@/components/ui/input` | edit-feedback textarea-like input (single line); `placeholder="Como você quer ajustar o plano?"` |
| `Field` | `@/components/ui/field` | wraps the edit Input with a `Label` ("Editar plano") and `Error` slot for empty-string validation |
| `Progress` | `@/components/ui/progress` | `variant="circular"` for the running-step spinner; `status="success"` and `status="error"` for terminal-state icons (we use lucide directly there for consistency with existing Phase 48 idiom — see Color table) |
| `Check`, `X`, `Circle` (lucide-react) | `lucide-react` | step status icons; consistent with existing chat usage |

### Modifications to existing components

| Existing component | Change | Justification |
|--------------------|--------|---------------|
| `apps/desktop/src/renderer/components/Orb/Orb.tsx` Layer 6 badge (lines 394-421) | Accept optional `agentBadgeText?: string` prop; when provided AND non-empty, render that string instead of `modeBadgeLabel[voiceMode]`. Border + text colors stay at the current voice-mode values (no new accent color). On `task:done`/`task:cancelled`/`task:error`, the prop drops back to `undefined` and the badge auto-reverts. | D-12 "Sem criar estado novo no `OrbState` enum" — minimal surgical change |
| `apps/desktop/src/renderer/src/chat/ChatContext.tsx` | Extend with `tasks: Map<taskId, TaskUiState>` + reducer wired to SSE `task:*` events | Required to drive TaskCheckList; precedent: Phase 54 `pendingAction` lived in App.tsx but tasks are richer state, dedicated context slot is cleaner |

---

## Visual Variants

All 7 visual states of TaskCheckList. Layout uses Flex + the existing spacing tokens. NO new CSS rules.

### State 1 — `awaiting-confirmation` (editMode: false)

```
┌─────────────────────────────────────────────────┐ ← bg-surface, rounded-lg, p-base
│ Aqui está o plano:                              │ ← text-base font-semibold (heading)
│                                                  │
│ ○ 1. Listar arquivos em ~/Downloads             │ ← text-sm text-fg-disabled, gap-xs to circle
│ ○ 2. Filtrar por extensão .pdf                  │
│ ○ 3. Mover para ~/Documentos/PDFs               │
│                                                  │
│ ⓘ JARVIS não desfaz ações já executadas         │ ← text-xs text-fg-subtle, mt-md
│                                                  │
│ ┌──────────┐ ┌────────┐ ┌──────────┐            │ ← row gap-sm, mt-lg
│ │ Confirmar│ │ Editar │ │ Cancelar │            │
│ └──────────┘ └────────┘ └──────────┘            │
└─────────────────────────────────────────────────┘
```

- Confirmar: `Button variant="primary" size="sm"` — leftmost — autoFocus on mount
- Editar: `Button variant="secondary" size="sm"`
- Cancelar: `Button variant="destructive" size="sm"`
- Disclaimer line uses `Info` lucide icon size-3 + `text-fg-subtle text-xs`
- ARIA: container `role="region" aria-label="Plano de execução pendente"`; step list `role="list"`; each step `role="listitem"`

### State 2 — `awaiting-confirmation` (editMode: true)

Same plan list (read-only, dimmed at `text-fg-disabled`), but the 3-button row is replaced by:

```
┌─────────────────────────────────────────────────┐
│  Editar plano                                    │ ← Field Label
│  ┌─────────────────────────────────────────────┐│
│  │ Como você quer ajustar o plano?             ││ ← Input placeholder
│  └─────────────────────────────────────────────┘│
│  ┌──────────┐ ┌──────────┐                      │ ← row gap-sm, mt-md
│  │ Aplicar  │ │ Voltar   │                      │
│  └──────────┘ └──────────┘                      │
└─────────────────────────────────────────────────┘
```

- Input is auto-focused; submits on Enter; Esc returns to State 1.
- "Aplicar": `Button variant="primary" size="sm"`, disabled when feedback is empty/whitespace-only.
- "Voltar": `Button variant="ghost" size="sm"`.

### State 3 — `editing-loop`

Plan list with all `text-fg-disabled` + line-through on `description`s. Below the disclaimer, render a single line:

```
🔄 Replanejando…
```

Uses `Progress variant="circular"` (indeterminate) inline at `text-accent` + `text-sm text-fg-muted` text. No buttons. Container has `aria-busy="true"`. Auto-replaced by State 1 (with new plan) when next `task:plan` SSE event arrives.

### State 4 — `executing`

```
┌─────────────────────────────────────────────────┐
│ ✓ 1. Listar arquivos em ~/Downloads             │ ← Check (text-success), description text-fg-muted
│   └ Listei 14 arquivos                          │ ← text-xs text-fg-subtle, ml-base
│                                                  │
│ ⟳ 2. Filtrar por extensão .pdf                  │ ← border-l-2 border-accent pl-sm, spinner
│                                                  │
│ ○ 3. Mover para ~/Documentos/PDFs               │ ← text-fg-disabled
│                                                  │
│ ┌──────────┐                                     │
│ │ Cancelar │                                     │ ← variant="destructive" size="sm"
│ └──────────┘                                     │
└─────────────────────────────────────────────────┘
```

- Running step has the **only** accent treatment in the bubble: `border-l-2 border-accent pl-sm`. Recipe: `<div class="flex items-start gap-xs border-l-2 border-accent pl-sm">…</div>`. Pending steps and completed steps have no border.
- Output summary line (`└ Listei 14 arquivos`) appears only on success and only if `outputSummary` is non-empty (D-11). Indented by `ml-base`.
- ARIA: `<ol role="list" aria-live="polite">`; the running step has `aria-current="step"`. Step transitions are announced via `aria-live="polite"`.
- Cancelar button is the only button in this state; clicking dispatches POST `/api/tasks/:id/cancel`.

### State 5 — `awaiting-failure-decision`

```
┌─────────────────────────────────────────────────┐
│ ✓ 1. Listar arquivos em ~/Downloads             │
│ ✗ 2. Filtrar por extensão .pdf                  │ ← X (text-destructive)
│   └ Erro: permissão negada em /home/.../*.pdf   │ ← text-xs text-destructive
│                                                  │
│ ○ 3. Mover para ~/Documentos/PDFs               │
│                                                  │
│ ┌──────────┐ ┌─────────────┐ ┌─────────┐       │
│ │Continuar │ │ Replanejar  │ │ Abortar │       │
│ └──────────┘ └─────────────┘ └─────────┘       │
└─────────────────────────────────────────────────┘
```

- Continuar (skip step): `Button variant="primary" size="sm"`
- Replanejar: `Button variant="secondary" size="sm"`
- Abortar: `Button variant="destructive" size="sm"`
- Error line uses `text-xs text-destructive`. Error message comes from `task:error` SSE event field `message` (already pt-BR per Phase 65 D-16 precedent — agentic graph reuses that shape).
- Container `role="alertdialog" aria-labelledby="task-failure-title"`; visually-hidden `<h2 id="task-failure-title">Falha na etapa {N}</h2>`.

### State 6 — `done`

The checklist is replaced by a short summary message — same chat bubble (single visual element, no scroll churn per D-09):

```
┌─────────────────────────────────────────────────┐
│ ✓ Tarefa concluída.                             │ ← Check size-4 inline + text-base
│                                                  │
│ Movi 14 PDFs de ~/Downloads para                │ ← text-sm text-fg-muted
│ ~/Documentos/PDFs.                              │
└─────────────────────────────────────────────────┘
```

- The summary string comes from `task:done.summary` (1-3 sentences pt-BR generated by the executor).
- A small "Ver etapas" disclosure (text button, `Button variant="ghost" size="sm"` + `ChevronDown` icon) is **deferred** (Children expandíveis — listed in CONTEXT.md Deferred Ideas). MVP shows summary only.

### State 7 — `cancelled`

```
┌─────────────────────────────────────────────────┐
│ ✓ 1. Listar arquivos em ~/Downloads             │
│ ✓ 2. Filtrar por extensão .pdf                  │
│                                                  │
│ ⓘ Cancelado no passo 3                          │ ← Info icon + text-sm text-fg-muted
│                                                  │
│ ○ 3. Mover para ~/Documentos/PDFs               │ ← cancelled-skip styling: line-through, dashed circle
└─────────────────────────────────────────────────┘
```

- Steps that ran successfully keep their ✅. The step where cancel landed and all subsequent steps render in `cancelled-skip` style: dashed circle outline + `text-fg-subtle line-through` on description.
- "Cancelado no passo N" is a single line at `text-sm text-fg-muted`, no buttons.

### State 8 — `error` (terminal, after Abortar from State 5)

```
┌─────────────────────────────────────────────────┐
│ ✓ 1. Listar arquivos em ~/Downloads             │
│ ✗ 2. Filtrar por extensão .pdf                  │
│   └ Erro: permissão negada em /home/.../*.pdf   │
│                                                  │
│ ⓘ Tarefa interrompida no passo 2.               │ ← text-sm text-destructive
│                                                  │
│ ○ 3. Mover para ~/Documentos/PDFs               │ ← cancelled-skip styling
└─────────────────────────────────────────────────┘
```

Identical to `cancelled` except: failed step shows ❌ + error sub-line; bottom message uses `text-destructive` and reads "Tarefa interrompida no passo N." instead of "Cancelado".

---

## Copywriting Contract

All strings pt-BR. Memory feedback `feedback_response_language` lock applies — no fallback to en-US.

| Element | Copy |
|---------|------|
| Plan heading (State 1) | `Aqui está o plano:` |
| Disclaimer (State 1, mt-md) | `JARVIS não desfaz ações já executadas. Cancele o quanto antes se mudar de ideia.` |
| Primary CTA — confirm plan | `Confirmar` |
| Edit CTA — open edit input | `Editar` |
| Cancel CTA — pre-execution | `Cancelar` |
| Cancel CTA — during execution | `Cancelar` (same word — different POST endpoint) |
| Edit field label (State 2) | `Editar plano` |
| Edit input placeholder | `Como você quer ajustar o plano?` |
| Edit submit button | `Aplicar` |
| Edit back button | `Voltar` |
| Re-planning indicator (State 3) | `Replanejando…` |
| Failure heading (sr-only, State 5) | `Falha na etapa {N}` |
| Failure error line prefix | `Erro: ` |
| Failure CTA — continue (skip step) | `Continuar` |
| Failure CTA — replan | `Replanejar` |
| Failure CTA — abort | `Abortar` |
| Done heading (State 6) | `Tarefa concluída.` |
| Cancelled message (State 7) | `Cancelado no passo {N}` |
| Error terminal message (State 8) | `Tarefa interrompida no passo {N}.` |
| Empty plan (defensive — planner returned 0 steps) | Heading: `Não consegui planejar essa tarefa.` Body: `Tente reformular o pedido com mais detalhes.` |
| TTS sumário — N ≤ 3 steps | `Vou fazer {N} {coisas\|coisa}: {step 1.description}{, {step 2.description}}{, e {step 3.description}}. Confirma?` |
| TTS sumário — N > 3 steps | `Vou fazer {N} coisas: {step 1.description}, {step 2.description}, e mais {N-2}. Confirma?` |
| TTS — task done | `Pronto. {summary}` |
| TTS — task cancelled (voice-initiated) | `Cancelado.` |
| TTS — step failure (auto-spoken when entering State 5) | `Tive um problema no passo {N}. {errorMessage}. O que você quer fazer?` |
| Output summary format (D-11) | `{verbo no passado em pt-BR} {objeto curto}` — ex: `Listei 14 arquivos`, `Movi 3 arquivos`, `Capturei a tela`, `Encontrei 2 contatos`. Hard cap **80 chars**; truncate with ellipsis if longer. Generated by executor per CONTEXT.md Claude's Discretion bullet 4. |
| Orb badge during execution | `AGENT {currentStep}/{totalSteps}` — ex: `AGENT 3/7`. Uses ASCII slash, not Unicode. |

### Cancel/Confirm/Edit keyword contract (D-06 + D-14 — formalized)

These keywords are matched **case-insensitively after STT or text input** in `apps/desktop/src/renderer/src/voice/voiceInput/sendAudioAndHandle.ts` short-circuit, only when an active task is in `awaiting-confirmation` or `executing` state.

**Confirm** (matches `awaiting-confirmation` only):
`vai`, `sim`, `confirma`, `confirmar`, `ok`, `okay`, `prossegue`, `prossiga`, `pode`, `manda`, `bora`

**Cancel** (matches `awaiting-confirmation` AND `executing`):
`não`, `nao`, `cancela`, `cancelar`, `para`, `parar`, `aborta`, `abortar`, `stop`, `cancela isso`, `para tudo`

**Edit** (matches `awaiting-confirmation` only — prefix match, full text after prefix becomes feedback):
prefixes: `edita`, `editar`, `muda`, `mudar`, `troca`, `trocar`, `ajusta`, `ajustar`, `altera`, `alterar`, `corrige`, `corrigir`

Match algorithm: trim + lowercase + strip trailing punctuation. Confirm/Cancel match the **whole utterance** (or whole utterance ± leading filler "uh/eh/é"). Edit matches **first word** as prefix; remaining text (after the prefix word) is the feedback string. If empty feedback after prefix, treat as "open edit input" (transitions to State 2 editMode:true) instead of submitting.

---

## Animations and Motion

All animations use **CSS-only** via Tailwind utilities. No new keyframes added — reuses `progress-shimmer` from globals.css and Tailwind's built-in `animate-spin`.

| Transition | Mechanism | Duration | Easing | Reduced-motion fallback |
|------------|-----------|----------|--------|------------------------|
| Step `pending → running` | `transition-colors` on icon swap (Circle → spinning Progress); `border-l-2 border-accent` appears with `transition-[border-color] duration-base` | `--duration-base` (180ms) | `--ease-standard` | Border appears instantly; spinner becomes static partial ring (Progress already handles this) |
| Step `running → success` | Icon swap (spinner → Check); description color `text-fg → text-fg-muted` via `transition-colors`; output summary line slides in via `transition-[opacity,max-height]` | `--duration-base` (180ms) | `--ease-standard` | Opacity transition only (no max-height); reuses `motion-reduce:` variant |
| Step `running → error` | Icon swap (spinner → X); description color stays `text-fg-muted`; error sub-line fades in | `--duration-base` (180ms) | `--ease-standard` | Opacity transition only |
| State change `awaiting-confirmation → executing` | Buttons fade out (`transition-opacity duration-fast`) then unmount; checklist gets running step border-left | `--duration-fast` (120ms) | `--ease-standard` | Same — already minimal |
| State change `executing → done` | Whole TaskCheckList content swaps to summary message — handled by React unmount/mount; outer bubble keeps the same `key` so chat doesn't scroll-jump | n/a | n/a | n/a |
| Edit input mount (State 2) | `transition-[opacity] duration-base` on Field wrapper | `--duration-base` (180ms) | `--ease-standard` | Same |
| Orb badge text update (`AGENT 2/7 → AGENT 3/7`) | Existing `transition: color 0.4s, border-color 0.4s` already on the badge from Orb.tsx:417 — text content swap is instant; border/text color stays voice-mode-colored | 400ms (existing) | ease-in-out (existing) | No animation on badge text content (pure DOM swap); existing color transition is preserved |

**Honors `prefers-reduced-motion: reduce`** — globally enforced via the existing `@media (prefers-reduced-motion: reduce)` block in `globals.css` (Phase 23 ORB-POL-01) and per-utility `motion-safe:`/`motion-reduce:` Tailwind variants on the spinner (already coded in `Progress` primitive). NO additional reduced-motion CSS needed for this phase.

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Keyboard — confirm plan without mouse | `autoFocus` on `Confirmar` button when entering State 1; `Enter` activates it (browser default for focused button) |
| Keyboard — cancel plan without mouse | Tab order: Confirmar → Editar → Cancelar; `Esc` from anywhere in TaskCheckList in State 1 dispatches `onCancel` (via container-level `onKeyDown`) |
| Keyboard — submit edit feedback | `Enter` in edit Input submits (when non-empty); `Esc` returns to State 1 |
| Keyboard — cancel during execution | Container-level `Esc` in State 4 dispatches `onCancel` (POST /api/tasks/:id/cancel). Cancelar button is also Tab-reachable. |
| Live region — step transitions | `<ol role="list" aria-live="polite" aria-atomic="false">` wraps the step list; React replaces individual `<li>` content as `task:step:end` events arrive — assistive tech announces "passo 2, concluído, listei 14 arquivos" naturally because `aria-live="polite"` propagates to children |
| `aria-current="step"` | Set on the `<li>` of the currently running step; removed when the step completes |
| `aria-busy` | Set to `true` on the TaskCheckList container during States 3 (`editing-loop`) and 4 (`executing`); `false` everywhere else |
| Screen reader — failure dialog | State 5 wraps content in `role="alertdialog"` with visually-hidden `<h2 id="task-failure-title">Falha na etapa {N}</h2>`; `aria-labelledby="task-failure-title"` |
| Screen reader — failure auto-announce | `task:error` event triggers a one-shot `<div role="alert">` rendered above the buttons; SR announces error text immediately |
| Color-blind safety | Step status communicated via icon shape (Circle vs Check vs X vs Spinner) AND color — never color-only |
| Focus ring | Inherited from existing `Button` primitive: `focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg` |
| Orb badge a11y | Existing `role="status" aria-live="polite" aria-label={...}` is preserved; when in agent mode, `aria-label` becomes `"Agente executando — passo {N} de {M}"` (replaces voice-mode label only during agent execution) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none added in this phase — all primitives (`Button`, `Field`, `Input`, `Label`, `Progress`) were authored manually in Phase 48 (REDESIGN-02) and committed to repo. No `npx shadcn add ...` runs needed. | not required |
| Third-party registries | **none declared** | not applicable |

**No new dependencies are introduced by this phase's UI work.** `lucide-react` (already 1.14.0) provides `Check`, `X`, `Circle`, `Info`, `ChevronDown` — all currently in use elsewhere in the codebase.

---

## Open Questions for Planner

These are NOT design contract questions (already locked) — they are downstream-implementation choices within the contract:

1. **Where in the chat flow does TaskCheckList mount?** — recommended: replace the assistant text bubble for the single message whose `messageId === task.parentMessageId`. Planner decides the message-rendering detection (e.g., `task` map keyed by message id, vs separate React subtree per task).
2. **Output summary generation strategy** (CONTEXT.md Claude's Discretion bullet 4) — UI contract requires "≤80 chars pt-BR verb-past+object". Planner picks: structured-output instruction in executor system prompt vs heuristic from tool-result first-line. Either is fine if format complies.
3. **Edit feedback Input → multi-line vs single-line** — UI-SPEC specifies single-line `Input`. If planner discovers users frequently need 2+ lines, escalate as follow-up; do NOT introduce a new Textarea primitive without ui-checker re-approval.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — pt-BR contract complete, no en-US leakage, all states have copy
- [ ] Dimension 2 Visuals: PASS — 8 visual variants explicit, single-component state machine
- [ ] Dimension 3 Color: PASS — 60/30/10 inherited, accent reserved-for list = 3 specific elements
- [ ] Dimension 4 Typography: PASS — 4 sizes / 2 weights from existing `@theme`, no additions
- [ ] Dimension 5 Spacing: PASS — only declared tokens, all multiples of 4, no exceptions
- [ ] Dimension 6 Registry Safety: PASS — zero new dependencies, zero third-party registries

**Approval:** pending
