---
phase: 48
slug: design-system-foundation
status: draft
shadcn_initialized: false
preset: manual (Tailwind v4 @theme — no remote preset)
created: 2026-05-03
---

# Phase 48 — UI Design Contract

> Visual and interaction contract for the JARVIS design system foundation: tokens + primitives. Consumed by Phase 49 (Settings refactor) and Phase 50 (Whisper download UX). All decisions traced to `48-CONTEXT.md` (D-01..D-12) unless marked otherwise.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (copy-paste over Radix) — D-01 |
| Preset | manual — tokens declared via Tailwind v4 `@theme` in `globals.css` (D-02). No remote shadcn registry preset. |
| Component library | Radix UI primitives (auto-installed by shadcn add): `@radix-ui/react-slider`, `@radix-ui/react-select`, `@radix-ui/react-label` |
| Icon library | `lucide-react` (default companion of shadcn; needed for Select chevron, error/check icons, Whisper download spinner in Phase 50) |
| Font | Inter (already loaded via `globals.css` body rule — keep) |
| CSS variables strategy | Hex/HSL tokens in `@theme` → consumed as Tailwind utilities (`bg-surface`, `text-fg`, `ring-accent`) |
| Component path | `apps/desktop/src/renderer/src/components/ui/` (shadcn default; sibling of existing `Toast.tsx`) |

---

## Spacing Scale

Declared values (multiples of 4 only):

| Token | Value | Usage |
|-------|-------|-------|
| xs   | 4px  | Icon-to-label gap, inline pill padding |
| sm   | 8px  | Field internal padding-y, helper-to-input gap, button icon gap |
| md   | 12px | Input padding-x, button padding-y (compact), gap between Field rows in a section |
| base | 16px | Default element spacing, section padding-y, card padding |
| lg   | 24px | Section header to first field, sidebar item vertical padding |
| xl   | 32px | Inter-section gap inside content panel, settings window outer padding |
| 2xl  | 48px | Major layout breaks (sidebar width baseline, content max-width gutter) |

**Exceptions:**
- Slider thumb hit area: 20px (visual) with 44px invisible hit target on touch — accessibility, not layout. Documented per-primitive below.
- Focus ring offset: 2px (sub-grid; intentional — matches Radix/shadcn default and visual `outline-offset` pattern in current `globals.css` line 109).

---

## Typography

Three sizes + one display, two weights only.

| Role | Size | Weight | Line Height | Tailwind class |
|------|------|--------|-------------|----------------|
| Caption / helper | 12px | 400 (regular) | 1.4 (≈17px) | `text-xs` |
| Body / label / control | 14px | 500 (medium) for labels, 400 for control values | 1.5 (≈21px) | `text-sm` |
| Section heading (h2) | 16px | 600 (semibold) | 1.3 (≈21px) | `text-base font-semibold` |
| Display (settings title h1) | 20px | 600 (semibold) | 1.2 (≈24px) | `text-lg font-semibold` |

Weights declared: **400 regular** + **600 semibold**. Medium (500) is reserved for compact UI labels only — treat as a third weight allowance documented for shadcn's default Button/Label primitives that use `font-medium`.

**Letter-spacing:** default (0) for body/labels; `-0.01em` (`tracking-tight`) for h2 and h1 only.

**Token mapping (in `@theme`):**
```
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--text-xs: 12px;   --text-xs--line-height: 1.4;
--text-sm: 14px;   --text-sm--line-height: 1.5;
--text-base: 16px; --text-base--line-height: 1.3;
--text-lg: 20px;   --text-lg--line-height: 1.2;
```

---

## Color

Raycast-like dark identity (D-05, D-06, D-07). 60/30/10 split.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `slate-950` `#020617` + noise overlay | App background (settings window, future windows) |
| Secondary (30%) | `slate-900/70` `rgba(15,23,42,0.7)` over the dominant | Card/panel surfaces, sidebar, input/select fields, slider track |
| Accent (10%) | `cyan-500` `#06B6D4` | RESERVED — see list below |
| Destructive | `rose-500` `#F43F5E` | Error toast background, error helper text, destructive button (none in Phase 48–50) |
| Success | `emerald-500` `#10B981` | Download-complete state in Phase 50 only — token declared here for reuse |

**Accent (cyan-500) reserved EXCLUSIVELY for:**
1. Slider filled track + thumb (continuity with current VAD slider, `globals.css` lines 82–95)
2. Primary Button background (`<Button variant="primary">`) — Save action in Settings
3. Focus-visible ring on every interactive primitive (2px solid `cyan-500/60`, offset 2px) — replaces current ad-hoc `cyan-500/80` border on Whisper select
4. Selected sidebar nav item indicator (Phase 49 — token reserved here)
5. Active state of toggle/switch (when Switch primitive is added in a future phase)

**Accent NEVER used for:**
- Default borders (use `white/8`)
- Body text or labels (use `white/90` / `white/70`)
- Hover states on secondary/ghost buttons (use `white/10` brightness lift)
- Icons by default (use `white/60`)

**Surface borders:** `border-white/8` default, `border-white/15` on hover, `border-cyan-500/60` on focus-visible.

**Foreground (text) tokens:**
| Token | Value | Usage |
|-------|-------|-------|
| `--fg`            | `white` (`#FFFFFF`) | Primary text on Save button, h1/h2 |
| `--fg-muted`      | `rgba(255,255,255,0.70)` | Labels, body |
| `--fg-subtle`     | `rgba(255,255,255,0.50)` | Helper / caption / placeholder |
| `--fg-disabled`   | `rgba(255,255,255,0.30)` | Disabled control text |

**Token mapping (in `@theme`):**
```
--color-bg: #020617;            /* slate-950 */
--color-surface: rgba(15,23,42,0.70);  /* slate-900/70 */
--color-surface-hover: rgba(30,41,59,0.80); /* slate-800/80 */
--color-border: rgba(255,255,255,0.08);
--color-border-hover: rgba(255,255,255,0.15);
--color-accent: #06B6D4;         /* cyan-500 */
--color-accent-soft: rgba(6,182,212,0.20);
--color-accent-ring: rgba(6,182,212,0.60);
--color-destructive: #F43F5E;
--color-success: #10B981;
--color-fg: #FFFFFF;
--color-fg-muted: rgba(255,255,255,0.90);
--color-fg-subtle: rgba(255,255,255,0.50);
--color-fg-disabled: rgba(255,255,255,0.30);
```

---

## Background Treatment — Slate-950 + Noise (D-07)

Recipe — this is the canonical implementation; executor MUST follow:

```css
/* In globals.css, applied to <body> or app root container */
body {
  background-color: #020617; /* slate-950 */
  background-image:
    /* 1. Subtle radial gradient for depth (top-left lift) */
    radial-gradient(ellipse 80% 50% at 20% 0%, rgba(6,182,212,0.04), transparent 60%),
    /* 2. SVG noise — inline base64, ~1.5KB, no network request */
    url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-blend-mode: normal, overlay;
  background-size: auto, 200px 200px;
  background-attachment: fixed;
}
```

**Rules:**
- Noise opacity is `0.04` in the SVG `feColorMatrix` alpha — not stronger. If grain looks visible, lower it.
- Radial gradient hue is `cyan-500 at 4% alpha` — must be subtle, not a glow.
- `background-attachment: fixed` so noise doesn't tile-shift on scroll.
- Reduced-motion users: noise stays (it's static); no change needed.

---

## Border Radius Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px  | Pill badges, small inline indicators |
| `--radius-md` | 6px  | Buttons, Inputs, Selects (default control radius — matches Raycast) |
| `--radius-lg` | 8px  | Cards, panels, dropdown menus |
| `--radius-xl` | 12px | Settings window root container, dialogs (future) |
| `--radius-full` | 9999px | Slider thumb, Switch track |

---

## Shadow Tokens (Raycast-like depth — subtle)

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.30)` | Resting Buttons, Inputs |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)` | Cards, Select dropdown panel |
| `--shadow-md` | `0 8px 24px rgba(0,0,0,0.45)` | Floating menus, dialogs (future) |
| `--shadow-glow-accent` | `0 0 0 4px rgba(6,182,212,0.20)` | Focus-visible halo on accent controls (slider thumb, primary button focus) |

NEVER use heavy default shadows (`shadow-lg`, `shadow-xl`). Depth is `border + shadow-xs` minimum, not bloom.

---

## Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 120ms | Hover, focus-ring fade-in |
| `--duration-base` | 180ms | Background-color, border-color transitions on controls |
| `--duration-slow` | 260ms | Dropdown open/close, Select content reveal |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default — Material "standard" curve, matches Raycast feel |
| `--ease-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Exit animations |

**Reduced-motion:** All transitions stay (per existing `globals.css` lines 39–43 — transitions are not vestibular-problematic). Only loop animations are disabled. New primitives MUST NOT introduce loop animations without an entry in the existing `prefers-reduced-motion` media block.

---

## Component Inventory & Per-Primitive Spec

All primitives live in `apps/desktop/src/renderer/src/components/ui/` and are tree-shakeable.

### 1. `Button`

**Variants:** `primary` | `secondary` | `ghost` | `destructive` (declared but unused in Phase 48–50; ready for future)
**Sizes:** `sm` (28px height) | `md` (36px height — default) | `lg` (44px height)

| State | primary | secondary | ghost |
|-------|---------|-----------|-------|
| default | bg `cyan-500`, text `white`, border `cyan-500`, shadow-xs | bg `surface`, text `fg-muted`, border `white/8` | bg transparent, text `fg-muted`, no border |
| hover | bg `cyan-400`, border `cyan-400` | bg `surface-hover`, border `white/15`, text `fg` | bg `white/5`, text `fg` |
| focus-visible | + ring `accent-ring` 2px, offset 2px, shadow-glow-accent | + ring `accent-ring` 2px, offset 2px | + ring `accent-ring` 2px, offset 2px |
| active (pressed) | bg `cyan-600` | bg `surface`, border `white/20` | bg `white/10` |
| disabled | bg `cyan-500/40`, text `white/60`, cursor `not-allowed`, no shadow | bg `surface/50`, text `fg-disabled`, border `white/5` | text `fg-disabled` |
| loading | spinner replaces label, control stays clickable=false | same | same |

**Padding:** `px-md` (sm), `px-base` (md), `px-lg` (lg). Border-radius `--radius-md`. Font `text-sm font-medium`.

**A11y:** Native `<button>` element. `aria-disabled` mirrors `disabled`. `aria-busy="true"` while loading. `aria-label` required when only an icon is rendered. Focus-visible via `:focus-visible` (not `:focus`) so mouse-click does not show ring.

### 2. `Input`

**Sizes:** `sm` (32px) | `md` (36px — default).
**Variants:** `default` | `error` (red border + helper text in destructive color).

| State | bg | border | text |
|-------|-----|--------|------|
| default | `surface` | `white/8` | `fg` (value), `fg-subtle` (placeholder) |
| hover | `surface-hover` | `white/15` | — |
| focus-visible | `surface-hover` | `accent-ring` 2px | + ring shadow `shadow-glow-accent` |
| disabled | `surface/50` | `white/5` | `fg-disabled`, cursor `not-allowed` |
| error | `surface` | `destructive` | — |
| error + focus-visible | `surface-hover` | `destructive` 2px | + ring `rgba(244,63,94,0.30)` 4px |

Padding `py-sm px-md`. Radius `--radius-md`. Font `text-sm`.

**A11y:** `<input>` with `id` linked to `<Label htmlFor>`. Error state sets `aria-invalid="true"` and `aria-describedby` pointing at helper text id. `<Field>` wrapper handles wiring automatically.

### 3. `Select`

Built on `@radix-ui/react-select`. Trigger looks like Input. Content panel is a popover.

| Element | Spec |
|---------|------|
| Trigger | Same visual contract as Input (default size md). Right-aligned chevron icon (`lucide-react ChevronDown`, 16px, `fg-subtle`). |
| Content panel | bg `slate-900` (full opacity, not translucent — readability), border `white/10`, radius `--radius-lg`, shadow `--shadow-md`, max-height `320px`, scroll if exceeded. |
| Item default | py-sm px-md, `text-sm`, `fg-muted`. |
| Item hover/highlighted | bg `surface-hover`, text `fg`. |
| Item selected | check icon (`lucide-react Check`, 14px, `accent`) on right; text `fg`. |
| Open trigger | border `accent-ring` 2px (matches focus state). |

**A11y:** Radix handles arrow-key nav, Enter/Space selection, Escape close, type-ahead, focus management, and `aria-expanded`/`aria-activedescendant` automatically. No additional work required.

### 4. `Slider`

Built on `@radix-ui/react-slider`. Migrates current VAD slider (D-03) — replaces the `slider-vad-threshold` CSS in `globals.css` lines 63–110.

| Element | Spec |
|---------|------|
| Track | height 6px, bg `surface` (`slate-900/70`), radius `--radius-full`. |
| Range (filled) | bg `accent` (`cyan-500`), radius `--radius-full`. |
| Thumb | 20px circle, bg `accent`, border `2px solid white/20`, shadow `0 0 8px rgba(6,182,212,0.4)` (continuity with current VAD slider). |
| Thumb hover | shadow `0 0 12px rgba(6,182,212,0.6)`. |
| Thumb focus-visible | + ring `accent-ring` 2px offset 2px (replaces current `outline` rule line 108). |
| Thumb active (dragging) | scale 1.05, shadow `0 0 16px rgba(6,182,212,0.7)`. |
| Disabled | track and range desaturated to `fg-disabled`; thumb `surface-hover` no glow. |

Hit target: thumb wrapper has invisible 44px square padding for touch/coarse-pointer (`@media (pointer: coarse)`).

**A11y:** Radix sets `role="slider"`, `aria-valuemin/max/now/text`, keyboard `←/→` step, `Home/End`, `PageUp/PageDown` (10× step). Existing VAD slider's `aria-valuetext` pattern (`"500 milliseconds"`) MUST be preserved when migrating.

### 5. `Label`

Built on `@radix-ui/react-label`.

| State | Spec |
|-------|------|
| default | `text-sm font-medium fg-muted`, mb-sm before associated control |
| disabled (when associated control is disabled) | `fg-disabled`, cursor `not-allowed` |
| with required indicator | append `*` in `destructive` color, no extra space |

**A11y:** Always renders `<label>`; clicking transfers focus to associated control (Radix handles).

### 6. `Field` (composition wrapper)

API:
```tsx
<Field>
  <Field.Label>VAD Silence Threshold</Field.Label>
  <Field.Control>{children}</Field.Control>   {/* Input | Select | Slider | HotkeyRecorder */}
  <Field.Helper>Lower = more responsive…</Field.Helper>   {/* optional */}
  <Field.Error>API key cannot be empty</Field.Error>      {/* optional, takes precedence over Helper */}
</Field>
```

**Layout:** vertical stack, gap `--space-sm` (8px).
**State propagation:** `<Field error>` cascades `aria-invalid` and visual error variant to the wrapped control automatically (via React context).
**Helper text:** `text-xs fg-subtle`.
**Error text:** `text-xs` in `destructive` color, with leading 12px error icon (`lucide-react AlertCircle`).
**Wiring:** Field generates a unique id, sets it on Label `htmlFor` and the control's `id`, and links Helper/Error via `aria-describedby`.

### 7. `HotkeyRecorder` (D-10 — JARVIS-specific)

API: `<HotkeyRecorder label value onRecorded />` (preserve existing prop shape — Phase 49 will swap implementations without changing call sites in `SettingsForm.tsx`).

| Element | Spec |
|---------|------|
| Display chip (idle) | Rendered as Input visual; value shown as joined keys (`Ctrl+Space`) using `text-sm font-mono` for the key combo with non-mono separator. Right-aligned subtle "Click to record" hint in `fg-subtle text-xs` (when empty). |
| Recording state | border `accent-ring` 2px (focus-equivalent), bg `accent-soft` (`cyan-500/20`), placeholder `"Press keys… Esc to cancel"` in `fg`. Animated 1.5px pulsing accent dot prefix (skipped under `prefers-reduced-motion`). |
| Recorded (just-set) | brief 240ms pulse of border `accent` then settle to default. |
| Disabled | as Input disabled. |

**A11y:**
- `role="button"` with `aria-label="Record hotkey, current value: Ctrl+Space"`.
- Keyboard activation: Space/Enter starts recording.
- During recording: `aria-live="polite"` announces newly captured combo. Escape cancels and restores previous value (no commit). Enter commits.
- Reads modifier-only presses (Ctrl alone) as INVALID — must include a non-modifier key. Show inline error using `Field.Error` semantics: "Hotkey must include a non-modifier key (e.g., Ctrl+Space)".

### 8. `Progress` (D-11 — for Phase 50 Whisper download)

Variants: `linear` (default, used for Whisper download) | `circular` (compact spinner for inline button-loading and indeterminate states).

| Element | linear | circular |
|---------|--------|----------|
| Track | height 4px, bg `surface`, radius `--radius-full`, full width | 16px diameter, stroke-width 2px, stroke `surface` |
| Indicator | bg `accent`, radius `--radius-full`, width = `value%`, transition `width var(--duration-base) var(--ease-standard)` | stroke `accent`, dasharray rotating |
| Indeterminate | shimmer bar (1.5s loop) `→` accent slides L-to-R; **bypassed under reduced-motion** (shows static 30% accent fill instead) | rotate 1s linear loop; **bypassed** (shows static 270° arc) |
| Success state | indicator stays `accent` then fades to `success` over 400ms; check icon appears beside | swaps to filled `success` circle with check |
| Error state | indicator color `destructive`; status text below in `destructive` | swaps to `destructive` X icon |

Sizes (linear): `sm` (4px track) — default | `md` (6px track) for prominent contexts.

**A11y:**
- Determinate: `role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Downloading {model}"`.
- Indeterminate: omit `aria-valuenow`. Set `aria-busy="true"` on parent.
- Success/error are status changes — paired status text uses `aria-live="polite"`.

---

## Interaction Contracts (cross-cutting)

| Concern | Rule |
|---------|------|
| Focus-visible ring | EVERY interactive primitive shows `accent-ring` 2px + 2px offset on `:focus-visible`. Mouse-click never shows ring. |
| Hover-only semantics | Hover MUST NOT be the sole indicator of state — always pair with another visual cue (focus ring, persistent border change, etc.). Touch users have no hover. |
| Keyboard nav | Tab order = DOM order. No `tabIndex={-1}` on interactive content (only on programmatically focused regions). Radix handles inner-widget arrow keys. |
| Click areas | Min 32px height for `sm` controls, 36px for `md`, 44px for `lg`. Slider thumbs get 44px invisible hit region under coarse-pointer media. |
| Disabled feedback | Cursor `not-allowed`; opacity NOT used as the only signal (always pair with text/border desaturation). Disabled controls still focusable so screen readers announce them, but `aria-disabled="true"` and click is no-op. |
| Error display | Inline below the control via `Field.Error`. Error toast (existing `Toast.tsx`) is for cross-cutting/transient failures only (save errors, IPC failures). |
| Loading feedback | Buttons swap label for `<Progress variant="circular" size="sm" />`; controls become read-only (not disabled — value preserved for screen-reader review). |

---

## Copywriting Contract

Phase 48 has NO end-user-facing copy of its own (it's a foundation phase — primitives are skinning, not screens). Copy below covers the primitives' built-in slots that downstream phases will inherit.

| Element | Copy |
|---------|------|
| Primary CTA (default Button label propagated to Phase 49 Save) | `Save` (verb-first, no period) |
| Secondary CTA (default for Cancel) | `Cancel` |
| HotkeyRecorder idle prompt (when value empty) | `Click to record` |
| HotkeyRecorder active prompt | `Press keys… Esc to cancel` |
| HotkeyRecorder validation error | `Hotkey must include a non-modifier key (e.g., Ctrl+Space).` |
| Field generic error fallback (when consumer omits message) | `This field is invalid.` |
| Progress determinate label format | `{verb}ing {noun}… {n}%` — e.g. `Downloading model… 42%` (Phase 50 will fill verb/noun) |
| Progress error fallback | `Couldn't complete. Check your connection and try again.` |
| Progress success fallback | `Done.` |
| Empty state (none in Phase 48 — foundation has no list views) | not applicable |
| Destructive confirmation (none in Phase 48) | not applicable — destructive variant declared but unused; Phase 49+ will define on first use |

**Voice rules:**
- Sentence case, never Title Case for body / helper.
- Active voice. Verb-first for CTAs.
- Never apologize ("Sorry, …"). State the problem and the fix.
- Never use ALL CAPS. Never use exclamation marks.
- Numbers as digits (`5 MB`, not `five megabytes`).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (`https://ui.shadcn.com/r`) | `button`, `input`, `select`, `slider`, `label` | not required — official registry |
| (none — third-party) | — | not applicable |
| project-local (custom, no remote fetch) | `field`, `hotkey-recorder`, `progress` | not applicable — written in-repo, no external code ingestion |

**Decision:** No third-party shadcn registries. All non-official primitives (`Field`, `HotkeyRecorder`, `Progress`) are authored in-repo under `components/ui/`. The vetting gate is therefore not invoked for this phase.

---

## File Layout (executor reference)

```
apps/desktop/src/renderer/src/
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Slider.tsx
│   │   ├── Label.tsx
│   │   ├── Field.tsx
│   │   ├── HotkeyRecorder.tsx
│   │   ├── Progress.tsx
│   │   └── index.ts          (barrel re-export)
│   └── Toast.tsx              (existing — leave untouched)
├── styles/
│   └── globals.css            (add @theme block + background recipe; remove old slider-vad-threshold CSS)
└── lib/
    └── cn.ts                  (shadcn `cn()` clsx+twMerge helper — add)
```

---

## Out of Scope for Phase 48 (deferred per CONTEXT.md)

- Light theme / theme switching.
- Dialog, Tooltip, Tabs, Switch, Checkbox primitives — add per future-phase need.
- Applying primitives to Orb / Voice / Chat windows.
- Settings layout refactor (Phase 49).
- Whisper download wiring (Phase 50).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
