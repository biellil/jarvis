---
phase: 48
plan: 01
subsystem: design-system-foundation
tags: [tokens, tailwind-v4, shadcn, theming]
requires: []
provides:
  - "Tailwind v4 @theme tokens (color, spacing, typography, radius, shadow, motion)"
  - ".app-surface class (slate-950 + radial gradient + noise)"
  - "shadcn CLI config (components.json) ready for `pnpm dlx shadcn add ...`"
  - "cn() classname helper at @/lib/cn"
  - "progress-shimmer keyframes (consumed by Plan 03 Progress)"
affects:
  - "apps/desktop/package.json (deps)"
  - "apps/desktop/src/renderer/src/styles/globals.css"
tech-stack:
  added:
    - "clsx ^2.1.1"
    - "tailwind-merge ^3.5.0"
    - "class-variance-authority ^0.7.1"
    - "lucide-react ^1.14.0"
    - "@radix-ui/react-slot ^1.2.4"
    - "@radix-ui/react-label ^2.1.8"
    - "@radix-ui/react-select ^2.2.6"
    - "@radix-ui/react-slider ^1.3.6"
  patterns:
    - "Tailwind v4 @theme — tokens declared in CSS, no tailwind.config.ts needed"
    - "shadcn manual preset — no remote registry; primitives copy-pasted into components/ui/"
key-files:
  created:
    - "apps/desktop/components.json"
    - "apps/desktop/src/renderer/src/lib/cn.ts"
  modified:
    - "apps/desktop/package.json"
    - "apps/desktop/src/renderer/src/styles/globals.css"
decisions:
  - "Empty `tailwind.config` in components.json — Tailwind v4 puts theme inside CSS"
  - ".app-surface as opt-in class (not on body) — orb/voice windows keep transparent background"
  - "progress-shimmer keyframes declared in Plan 01 so globals.css ownership stays single-plan"
metrics:
  duration: "~5 min"
  completed: "2026-05-03"
  tasks: 2
---

# Phase 48 Plan 01: Design System Foundation Summary

Lay the design system foundation — install shadcn CLI deps, declare every UI-SPEC token inside Tailwind v4 `@theme`, ship the canonical app background recipe, and remove the legacy VAD slider CSS so Plan 02 can install primitives on a clean slate.

## Token Inventory Delivered

| Category | Count | Tokens |
|----------|------:|--------|
| Typography | 9 | `--font-sans`, `--text-xs/sm/base/lg` (4) + matching `--*--line-height` (4) |
| Color | 14 | `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-border`, `--color-border-hover`, `--color-accent`, `--color-accent-soft`, `--color-accent-ring`, `--color-destructive`, `--color-success`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-fg-disabled` |
| Spacing | 7 | `--spacing-xs/sm/md/base/lg/xl/2xl` |
| Radius | 5 | `--radius-sm/md/lg/xl/full` |
| Shadow | 4 | `--shadow-xs/sm/md/glow-accent` |
| Motion | 5 | `--duration-fast/base/slow`, `--ease-standard/accelerate` |
| **Total** | **44** | All UI-SPEC tokens accounted for |

## Background Recipe

`.app-surface` class added to `globals.css` per UI-SPEC §"Background Treatment":

- `background-color: #020617` (slate-950)
- Layer 1: subtle radial gradient (`cyan-500 @ 4% alpha`, ellipse 80% 50% at 20% 0%)
- Layer 2: inline SVG `feTurbulence` noise (~1.5 KB, baseFrequency 0.9, alpha 0.04)
- `background-blend-mode: normal, overlay`
- `background-attachment: fixed` so noise doesn't tile-shift on scroll

Opt-in (not on `body`) — keeps orb/voice windows transparent. Phase 49 Settings will wrap its root with `<div className="app-surface">`.

## Legacy VAD Slider CSS — Removed (D-03)

`input[type="range"].slider-vad-threshold` rules (previously lines 63-110 of globals.css) deleted. Slider primitive in Plan 02/03 will own this styling. Verified absence via grep.

## shadcn CLI Ready for Plan 02

`apps/desktop/components.json` configured with:

| Field | Value |
|-------|-------|
| `style` | `new-york` |
| `tailwind.css` | `src/renderer/src/styles/globals.css` |
| `tailwind.config` | `""` (Tailwind v4 — no config file) |
| `aliases.ui` | `@/components/ui` |
| `aliases.utils` | `@/lib/cn` |
| `iconLibrary` | `lucide` |

Plan 02 can run `pnpm dlx shadcn@latest add button input select slider label` with no further setup.

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 | build | `93ee147` | install shadcn deps + components.json + cn.ts |
| 2 | style | `fafedb3` | @theme tokens + app-surface + remove VAD CSS |

## Verification

- `pnpm build` succeeded — Tailwind v4 parses `@theme` correctly, generated CSS bundle 22 KB
- All token presence checks passed (13 sentinel substrings)
- Legacy `slider-vad-threshold` string absent from globals.css
- `components.json` validates and aliases match
- All 8 new dependencies present in `apps/desktop/package.json`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: apps/desktop/components.json
- FOUND: apps/desktop/src/renderer/src/lib/cn.ts
- FOUND: apps/desktop/src/renderer/src/styles/globals.css (modified)
- FOUND commit: 93ee147
- FOUND commit: fafedb3
