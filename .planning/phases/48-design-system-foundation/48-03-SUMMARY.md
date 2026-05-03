---
phase: 48
plan: 03
subsystem: design-system
tags: [ui, primitives, accessibility, design-tokens]
requires: ["48-01", "48-02"]
provides:
  - "Field composition wrapper with auto-wired ARIA (Field.Label/Control/Helper/Error)"
  - "HotkeyRecorder primitive in components/ui/ (v2.0 API preserved for Phase 49 swap)"
  - "Progress primitive (linear + circular, 4 states) ready for Phase 50 Whisper download UX"
  - "Barrel components/ui/index.ts — single import path for all 8 primitives"
affects:
  - "Phase 49 will refactor SettingsForm.tsx to consume these primitives"
  - "Phase 50 Whisper download UX consumes Progress directly"
tech-stack:
  added: []
  patterns:
    - "Compound component via React context (Field.Label/Control/Helper/Error)"
    - "ARIA attribute injection via React.cloneElement on a single child element"
    - "motion-safe / motion-reduce Tailwind variants for prefers-reduced-motion compliance"
key-files:
  created:
    - "apps/desktop/src/renderer/src/components/ui/field.tsx"
    - "apps/desktop/src/renderer/src/components/ui/hotkey-recorder.tsx"
    - "apps/desktop/src/renderer/src/components/ui/progress.tsx"
    - "apps/desktop/src/renderer/src/components/ui/index.ts"
  modified: []
decisions:
  - "Field.Helper returns null when error active (Error precedence rule per UI-SPEC §6)"
  - "Field.Control uses React.Children.only + cloneElement to inject ARIA into ONE wrapped child"
  - "HotkeyRecorder preserves the as-soon-as-pressed commit behavior (vs UI-SPEC's 'Enter commits') because the legacy v2.0 UX is more responsive — explicit Enter-commit deferred"
  - "Modifier-only error auto-clears after 3s; tracked via sawNonModifierRef + sawAnyKeyRef during recording session"
  - "Circular Progress uses SVG with 6px radius (16×16 viewBox); indeterminate spins via animate-spin, determinate transitions stroke-dashoffset"
  - "Legacy settings/HotkeyRecorder.tsx left UNTOUCHED — Phase 49 owns deletion after migrating SettingsForm import"
metrics:
  duration_minutes: ~25
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 0
  completed_date: 2026-05-03
---

# Phase 48 Plan 03: JARVIS-Specific Primitives + Barrel Summary

**One-liner:** Field composition wrapper, HotkeyRecorder (token-restyled, modifier-only validation), Progress (linear+circular×4 states), and a barrel `index.ts` exporting all 8 primitives — completing the Phase 48 design-system foundation.

## What Was Built

### 1. Field — composition wrapper (UI-SPEC §6)

**API:**
```tsx
<Field error={hasError}>
  <Field.Label>VAD Silence Threshold</Field.Label>
  <Field.Control><Input /></Field.Control>
  <Field.Helper>Lower = more responsive…</Field.Helper>
  <Field.Error>API key cannot be empty</Field.Error>
</Field>
```

**Context shape (`FieldContextValue`):**
- `id: string` — generated via `React.useId()` (or `idProp` if supplied)
- `helperId: string` — `${id}-helper`
- `errorId: string` — `${id}-error`
- `hasError: boolean` — derived from `<Field error>`

**Auto-wiring:**
- `Field.Label` injects `htmlFor={ctx.id}` on the Radix Label root
- `Field.Control` clones its single child element and injects `id`, `aria-describedby` (toggles helperId↔errorId by `hasError`), and `aria-invalid` (true only when error)
- `Field.Helper` renders only when no error (UI-SPEC error-precedence rule)
- `Field.Error` renders only when error; uses `<AlertCircle />` icon, `role="alert"`, `text-destructive`, `gap-xs`

### 2. HotkeyRecorder — extracted to components/ui (UI-SPEC §7)

**API confirmation — IDENTICAL to v2.0:**
```ts
export interface HotkeyRecorderProps {
  label: string;
  value: string;
  onRecorded: (accelerator: string) => void;
  disabled?: boolean;
}
```

**Preserved verbatim from `settings/HotkeyRecorder.tsx`:**
- `KEY_MAP` constant (Space, ArrowUp/Down/Left/Right→Up/Down/Left/Right, Enter→Return, Backspace→BackSpace, Delete, Escape→Esc, Tab, F1–F12)
- Electron accelerator construction order: `Ctrl+Cmd+Shift+Alt+<Key>`
- "Emit on first non-modifier key" behavior

**Re-skinned to design tokens:**
- Display chip: `bg-surface border-border` (idle) → `border-accent-ring border-2 bg-accent-soft` (recording) → `border-accent` (justRecorded 240ms pulse)
- Animated 1.5px pulsing accent dot in recording state — `motion-safe:animate-pulse` (reduced-motion safe)
- Record button: Plan 02 `<Button variant="secondary" size="md">`

**Modifier-only validation (UI-SPEC §7 a11y):**
- Tracks `sawAnyKeyRef` and `sawNonModifierRef` across the recording session
- On `keyup` with all modifiers released: if any key was pressed but no non-modifier was emitted, surfaces error: `"Hotkey must include a non-modifier key (e.g., Ctrl+Space)."`
- Error auto-clears after 3 seconds
- Renders as `<p role="alert" className="text-xs text-destructive flex items-center gap-xs">`

**A11y:** `role="button"`, `aria-label="Record hotkey, current value: {value}"`, Space/Enter starts recording, Escape cancels, `<span aria-live="polite">` announces newly captured combo.

**Note:** Legacy `apps/desktop/src/renderer/src/settings/HotkeyRecorder.tsx` is **left in place** — Phase 49 will migrate the SettingsForm import then delete the legacy file. This keeps the build green during Phase 48.

### 3. Progress — linear + circular (UI-SPEC §8)

**API:**
```ts
interface ProgressProps {
  variant?: 'linear' | 'circular';   // default: 'linear'
  value?: number;                     // 0–100; undefined → indeterminate
  status?: 'progress' | 'success' | 'error';   // default: 'progress'
  size?: 'sm' | 'md';                 // linear only; default: 'sm'
  label?: string;                     // for aria-label
  className?: string;
}
```

**Variant matrix (8 states):**

| Variant × State | progress | success | error |
|---|---|---|---|
| **linear determinate** | `bg-accent` indicator, transition-[width] | `bg-success` 100%, Check icon beside | `bg-destructive` indicator, X icon beside |
| **linear indeterminate** | shimmer bar 1/3 width, `motion-safe:animate-[progress-shimmer_1.5s_ease-in-out_infinite]`, `motion-reduce:w-[30%]` static | (n/a — success implies completion) | (n/a) |
| **circular determinate** | SVG ring, stroke-dashoffset transitions on value | filled `bg-success` circle + Check | X icon, no ring |
| **circular indeterminate** | `motion-safe:animate-spin` SVG, 270° arc; reduced-motion fallback static | — | — |

**A11y:**
- Determinate: `role="progressbar"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`, optional `aria-label={label}`
- Indeterminate: `role="progressbar"`, `aria-busy="true"` (no `aria-valuenow`)

**Keyframes:** Consumes `@keyframes progress-shimmer` declared in `globals.css` by Plan 01 Task 2 step E. Plan 03 does NOT modify `globals.css`.

### 4. Barrel `components/ui/index.ts`

Re-exports all 8 primitives + their prop type aliases:

```ts
export { Button, buttonVariants } from './button';
export type { ButtonProps } from './button';
export { Input } from './input';
export type { InputProps } from './input';
export { Label } from './label';
export {
  Select, SelectGroup, SelectValue, SelectTrigger,
  SelectContent, SelectLabel, SelectItem, SelectSeparator,
  SelectScrollUpButton, SelectScrollDownButton,
} from './select';
export { Slider } from './slider';
export { Field } from './field';
export type { FieldProps } from './field';
export { HotkeyRecorder } from './hotkey-recorder';
export type { HotkeyRecorderProps } from './hotkey-recorder';
export { Progress } from './progress';
export type { ProgressProps } from './progress';
```

Phase 49 can now use a single import path:
```ts
import { Button, Field, Slider, HotkeyRecorder, Progress } from '@/components/ui';
```

## Verification

- All four files compile cleanly under `pnpm exec tsc --noEmit -p tsconfig.json` (filtered for new files — pre-existing errors in `useMultiTurnWindow.ts`, `useWakeWord.ts`, `rmsZeroGuard.test.ts` documented in `deferred-items.md` from Plan 02, untouched by Plan 03).
- `pnpm build` succeeds — Tailwind v4 generates utilities for all consumed tokens (`gap-sm`, `text-fg-subtle`, `text-destructive`, `bg-accent-soft`, `border-accent-ring`, `motion-safe:animate-pulse`, `motion-safe:animate-[progress-shimmer_…]`).
- Field-tsx grep guard: contains `createContext`, `useId`, `cloneElement`, `aria-describedby`, `aria-invalid`, `AlertCircle`, `text-destructive`, all four `Field.X` subcomponent assignments, and zero hardcoded hex.
- HotkeyRecorder grep guard: contains `KEY_MAP`, `BackSpace`, `Esc`, `F12`, `border-accent-ring`, `bg-accent-soft`, the exact UI-SPEC error copy, `aria-live`, `role="button"`, `motion-safe:animate-pulse`, no hardcoded `bg-gray-` or `text-white`.
- Progress grep guard: contains `variant`, `linear`, `circular`, `indeterminate`, `aria-valuenow`, `aria-busy`, `bg-accent`, `bg-success`, `bg-destructive`, `motion-safe:`, `motion-reduce:`.
- Barrel grep guard: exports all of `Button`, `buttonVariants`, `Input`, `Label`, `Select*`, `Slider`, `Field`, `HotkeyRecorder`, `HotkeyRecorderProps`, `Progress`.
- Legacy `apps/desktop/src/renderer/src/settings/HotkeyRecorder.tsx` is **untouched** (Phase 49 owns migration).

## Deviations from Plan

None — plan executed exactly as written.

A pre-execution merge of `master` into the worktree branch was needed to bring in Plan 02 commits (Button/Input/Label/Select/Slider) since this worktree branched from Plan 01's tip. Not a deviation from the plan; it's a worktree synchronization step.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | `3b8d19d` | ✨ feat(48-03): add Field composition wrapper with React context |
| 2 | `0bc836b` | ✨ feat(48-03): extract HotkeyRecorder to components/ui with token styling |
| 3 | `87f5924` | ✨ feat(48-03): add Progress primitive and components/ui barrel |

## Known Stubs

None — all three primitives are fully implemented. The legacy `settings/HotkeyRecorder.tsx` is intentionally retained until Phase 49 migrates the SettingsForm import (documented above and in the plan).

## Self-Check: PASSED

- File `apps/desktop/src/renderer/src/components/ui/field.tsx`: FOUND
- File `apps/desktop/src/renderer/src/components/ui/hotkey-recorder.tsx`: FOUND
- File `apps/desktop/src/renderer/src/components/ui/progress.tsx`: FOUND
- File `apps/desktop/src/renderer/src/components/ui/index.ts`: FOUND
- Commit `3b8d19d` (Task 1): FOUND
- Commit `0bc836b` (Task 2): FOUND
- Commit `87f5924` (Task 3): FOUND
- `pnpm build` succeeded
