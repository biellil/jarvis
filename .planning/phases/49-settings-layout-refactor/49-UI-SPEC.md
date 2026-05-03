---
phase: 49
slug: settings-layout-refactor
status: draft
design_system_reuse: true
phase_48_tokens: true
created: 2026-05-03
---

# Phase 49 — UI Design Contract

> Layout and interaction contract for Settings window refactor: sidebar nav + content panel + sticky save bar. Reuses all tokens and primitives from Phase 48. Consumed by Phase 50 (Whisper download). All decisions traced to `49-CONTEXT.md` (D-01..D-12).

---

## Design System Reuse

**This phase DOES NOT declare new tokens or primitives.** All color, typography, spacing, and component visuals are inherited from Phase 48.

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui (Phase 48) | Phase 48 UI-SPEC |
| Preset | manual — Tailwind v4 @theme in globals.css | Phase 48 UI-SPEC |
| Component library | Radix UI (Phase 48) | Phase 48 UI-SPEC |
| Icon library | lucide-react | Phase 48 UI-SPEC |
| Font | Inter | Phase 48 UI-SPEC |
| Tokens | All from Phase 48 (@theme block) | Phase 48 UI-SPEC Spacing/Color/Typography sections |
| Primitives reused | Button, Input, Select, Slider, Label, Field, HotkeyRecorder, Progress | Phase 48 Component Inventory |

**Do not redeclare spacing scale, color tokens, or typography rules.** Reference Phase 48 UI-SPEC.

---

## Layout Structure

### Overall Container

Settings window root: dark background (inherited from Phase 48), flex layout with two columns.

```
┌────────────────────────────────────────────────┐
│  [Sidebar]  │  [Content Panel + Save Bar]      │
│  200px      │  [flex: 1]                       │
│  (fixed)    │  [overflow-y: auto internal]     │
│             │                                   │
│             │  ┌─────────────────────────────┐ │
│             │  │ Section Content (scrolls)   │ │
│             │  │                              │ │
│             │  │ ┌──────────────────────────┐ │
│             │  │ │ [Sticky Save Bar]       │ │ │
│             │  │ │ [Save | Cancel]         │ │ │
│             │  │ └──────────────────────────┘ │
│             │  └─────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### Sidebar Navigation (D-01, D-02, D-03, D-04)

**Dimensions:**
- Width: **200px** (fixed) — D-01
- Height: Full window height
- No internal scroll (stays fixed while content panel scrolls)

**Header:**
- Title: "Settings" — text-base font-semibold, text-fg (Phase 48)
- Bottom border: `border-white/8` (Phase 48 border token)
- Padding: `px-base py-lg` (Phase 48 spacing)

**Nav Items (order: PTT → Always-Listening → TTS → Whisper) — D-02:**

Each item is a clickable control. Layout is vertical stack with `gap-xs` (Phase 48).

| State | Visual | Token Usage |
|-------|--------|-------------|
| **default (not selected)** | bg transparent, text `fg-muted` (Phase 48), icon `fg-subtle` (Phase 48) | — |
| **hover** | bg `white/5` (Phase 48 pattern), text `fg`, icon `fg` | transition `bg-color var(--duration-fast)` (Phase 48 motion token) |
| **selected (active)** | bg `accent-soft` (Phase 48 cyan-500/20), left border 2px solid `accent` (Phase 48 cyan-500), text `fg`, icon `fg`, inner left-padding adjusted for border | `border-l-2` offset managed by padding |
| **focus-visible** | + ring `accent-ring` 2px offset 2px (Phase 48 interaction contract), no additional effect needed since bg already signals selection | inherited from Phase 48 focus contract |

**Item layout:**
- Padding: `px-base py-lg` (D-03 geometry)
- Inner flex: icon (lucide-react, 18px) + label (text-sm font-medium, `fg`), gap `xs` (Phase 48)
- Cursor: pointer on hover
- Icon selection (D-03 discretion):
  - PTT: `Keyboard` (keyboard hotkey metaphor)
  - Always-Listening: `Mic` (microphone always on)
  - TTS: `Volume2` (text-to-speech audio output)
  - Whisper: `Languages` (speech recognition model)

### Content Panel

**Outer container:**
- Flex column, flex: 1, min-height: 100%, bg `surface` (Phase 48 slate-900/70)
- Internal scroll: `overflow-y: auto` (only content panel scrolls, not sidebar)
- Padding horizontal: `xl` (Phase 48, 32px) — D-06
- Padding top: `xl` (32px) — section header offset from top
- Padding bottom: `2xl` (48px) — room for sticky save bar (see below)

**Section heading (h1):**
- Font: `text-lg font-semibold` (Phase 48 display role)
- Color: `text-fg` (Phase 48)
- Margin bottom: `base` (16px) — D-06 spacing to description
- Content: Section name (e.g., "Push-to-Talk Settings", "Always-Listening", "Text-to-Speech", "Whisper Model")

**Section description (optional, h2-like):**
- Font: `text-sm` `fg-subtle` (Phase 48 body/helper role)
- Margin bottom: `lg` (24px) — gap to first field (D-06)
- Content per section (executor can omit if redundant; suggested in 49-CONTEXT.md specifics):
  - PTT: "Set the global hotkey for push-to-talk."
  - Always-Listening: "Tune voice activity detection sensitivity."
  - TTS: "Choose the text-to-speech provider and voice."
  - Whisper: "Choose the speech-to-text model."

**Field layout inside sections:**
- Vertical stack, gap `base` (16px) between Field elements (Phase 48 spacing)
- Use Phase 48 `<Field>` wrapper for all inputs (Label + Control + Helper/Error)
- For multi-control groups (e.g., TtsProviderSelect + API Key), group vertically with field-level gap

**Specific fields per section (reuse Phase 48 primitives, no new variants):**

#### PTT Section
- `<Field>` containing HotkeyRecorder for PTT hotkey (reuse Phase 48 HotkeyRecorder — swap import from legacy settings/ to components/ui/)

#### Always-Listening Section
- `<Field>` containing Slider for VAD threshold (Phase 48 Slider, preserve `aria-valuetext` pattern "500 milliseconds")
- Reset button: `<Button variant="ghost" size="sm">Reset to Default (500ms)</Button>` (D-12, below the slider with `mt-base`)

#### TTS Section
- `<Field>` containing Select for TTS provider (Phase 48 Select primitive) — label "Provider"
- `<Field>` containing Input for API Key (Phase 48 Input inside Field) — label "API Key", optional helper text
- `<Field>` containing Input for Voice ID (Phase 48 Input inside Field) — label "Voice ID"

#### Whisper Section
- `<Field>` containing Select for model (Phase 48 Select) — label "Model"
- Helper text inside Field.Helper (D-12): Show variant-specific help:
  - If `auto`: "Auto: model selected based on available VRAM"
  - If `manual`: "Manual: model selected from list"
  - (Keep existing helper text logic from v2.0 SettingsForm)

### Sticky Save Bar (D-07, D-08)

**Container:**
- Position: sticky, bottom: 0, within content panel (NOT position: fixed on window)
- Width: 100% (fills content panel width)
- Background: `surface` (Phase 48 slate-900/70, same as content panel for seamless blend)
- Border-top: `border-white/8` (Phase 48 border token) — separates from content
- Padding: `px-xl` (32px) horizontal, `py-base` (16px) vertical (D-07)
- Shadow: `shadow-sm` (Phase 48 depth; subtle upward shadow for layering effect)

**Layout:**
- Flex row, justify-end, gap `md` (16px) between buttons (Phase 48)

**Buttons:**
- Save: `<Button variant="primary" size="md">Save</Button>` (Phase 48 Button primary variant)
  - Disabled state: when dirty === false (no changes since last save) — cursor `not-allowed`, opacity inherited from Phase 48 disabled state
  - Always: enabled state allows click to trigger save IPC
- Cancel: `<Button variant="secondary" size="md">Cancel</Button>` (Phase 48 Button secondary variant)
  - Always enabled (D-08) — closes window without saving

---

## Interaction Contracts

| Concern | Behavior |
|---------|----------|
| **Sidebar item selection** | Click nav item → sets active section state (local useState, no persistence D-11), updates content panel to show selected section, nav item visual updates to selected state. Instant, no animation. |
| **Scroll behavior** | Sidebar never scrolls; content panel internal scroll only. Save bar stays pinned to bottom of content panel (sticky positioning). |
| **Dirty state tracking** | Detect via deep comparison of initial settings vs current form state (D-10 discretion on implementation — per-field vs object compare). Disable Save button when dirty === false. |
| **Save action** | Click Save → validate form (e.g., API key non-empty for TTS), show toast success/error (existing Toast component, no change), close window after 2s (v2.0 behavior). |
| **Cancel action** | Click Cancel → close window without saving (discard form state). Always enabled. |
| **VAD slider real-time apply** | VAD slider in AlwaysListeningSection fires IPC `setVadThreshold` on each drag (not debounced) — preserves v2.0 behavior (D-10). |
| **Keyboard navigation** | Tab order follows DOM: sidebar nav items, then content panel fields (Section heading not tabbable), then Save/Cancel buttons. Arrow keys within sidebar (↑/↓) move selection between nav items (executor discretion on implementation). |
| **Focus management** | When section changes, focus does not auto-move (user remains where they were). Pressing Tab from last field in section moves to Save button. |
| **Validation feedback** | Errors shown inline via `Field.Error` (Phase 48 error display contract). Toast (existing Toast.tsx) for transient failures (IPC errors, save failures). |

---

## Copywriting Contract

| Element | Copy | Semantics |
|---------|------|-----------|
| Sidebar header | "Settings" | Simple, clear scope label |
| Nav item: PTT | "Push-to-Talk" | Matches existing naming |
| Nav item: Always-Listening | "Always-Listening" | Matches existing naming |
| Nav item: TTS | "Text-to-Speech" | Matches existing naming |
| Nav item: Whisper | "Whisper Model" | Specific to speech recognition model selection |
| Section h1: PTT | "Push-to-Talk Settings" (or "Configure Hotkey") | Action-focused |
| Section h1: Always-Listening | "Voice Activity Detection" (or "Always-Listening Settings") | Property-focused |
| Section h1: TTS | "Text-to-Speech Configuration" (or "Text-to-Speech Settings") | Action-focused |
| Section h1: Whisper | "Speech-to-Text Model" (or "Whisper Model Settings") | Property-focused |
| Section description: PTT | "Set the global hotkey for push-to-talk." | Verb-first, 1 sentence |
| Section description: Always-Listening | "Tune voice activity detection sensitivity." | Verb-first, 1 sentence |
| Section description: TTS | "Choose the text-to-speech provider and voice." | Verb-first, 1 sentence |
| Section description: Whisper | "Choose the speech-to-text model." | Verb-first, 1 sentence |
| Save button | "Save" (Phase 48 default) | Verb-first, no period |
| Cancel button | "Cancel" (Phase 48 default) | Clear action |
| VAD reset button | "Reset to Default (500ms)" | Specific, parenthetical detail |
| Field: HotkeyRecorder label | "Hotkey" | Short, clear |
| Field: VAD Slider label | "Silence Threshold" (or "Voice Activity Detection") | Phase 48 default or existing v2.0 copy |
| Field: TTS Provider label | "Provider" | Short |
| Field: API Key label | "API Key" | Standard form label |
| Field: Voice ID label | "Voice ID" (or "Voice") | Short, clear |
| Field: Whisper Model label | "Model" | Short, matches select options |
| Helper: VAD Slider | "Lower = more responsive, less silence required" (existing from v2.0) | Explanatory, setting behavior |
| Helper: Whisper auto | "Auto: model selected based on available VRAM" (D-12, from v2.0) | Explain auto mode |
| Helper: Whisper manual | "Manual: select model from list" (D-12, from v2.0) | Explain manual mode |
| Error: empty API key | "API key cannot be empty" (from v2.0 validation) | Problem statement, no jargon |
| Error: field required | Inherited from Phase 48 Field.Error fallback: "This field is invalid." | Generic fallback |
| Dirty state: empty section | Not applicable — all sections have content | — |

**Voice rules (inherited from Phase 48, apply here):**
- Sentence case, never Title Case for body/helper
- Active voice
- Never apologize ("Sorry, …")
- Never use ALL CAPS or exclamation marks
- Numbers as digits ("500 milliseconds", not "five-hundred")

---

## Component Usage Matrix

How Phase 49 layout uses Phase 48 primitives:

| Layout Region | Phase 48 Component | Phase 49 Usage |
|---------------|-------------------|----------------|
| Sidebar nav items | (custom — not a Phase 48 primitive) | flex + lucide icon + text; selected = bg accent-soft + left border accent |
| Section heading (h1) | Typography rule only | `text-lg font-semibold text-fg` |
| Section description | Typography rule only | `text-sm text-fg-subtle` |
| HotkeyRecorder field | Phase 48 HotkeyRecorder | Import from `components/ui/HotkeyRecorder`; wrap in Phase 48 `<Field>` |
| VAD Slider field | Phase 48 Slider | Import from `components/ui/Slider`; wrap in Phase 48 `<Field>` with aria-valuetext; preserve real-time IPC behavior |
| TTS Provider Select | Phase 48 Select | Import from `components/ui/Select`; wrap in Phase 48 `<Field>` |
| TTS API Key Input | Phase 48 Input | Import from `components/ui/Input`; wrap in Phase 48 `<Field>` |
| TTS Voice ID Input | Phase 48 Input | Import from `components/ui/Input`; wrap in Phase 48 `<Field>` |
| Whisper Model Select | Phase 48 Select | Import from `components/ui/Select`; wrap in Phase 48 `<Field>` with conditional helper text |
| Save button | Phase 48 Button (primary) | `<Button variant="primary" size="md">Save</Button>` — disable when dirty === false |
| Cancel button | Phase 48 Button (secondary) | `<Button variant="secondary" size="md">Cancel</Button>` — always enabled |
| VAD reset button | Phase 48 Button (ghost) | `<Button variant="ghost" size="sm">Reset to Default (500ms)</Button>` |
| Toast feedback | Toast (existing, Phase 48 aware) | Reuse existing Toast.tsx — no changes |

---

## File Structure Reference

Files produced by Phase 49 executor:

```
apps/desktop/src/renderer/src/settings/
├── SettingsLayout.tsx               (main component: sidebar + content panel + save bar)
├── sections/
│   ├── PttSection.tsx               (PTT hotkey configuration)
│   ├── AlwaysListeningSection.tsx   (VAD threshold slider + reset)
│   ├── TtsSection.tsx               (TTS provider/key/voice)
│   └── WhisperSection.tsx           (Whisper model select with variant helper)
├── SettingsForm.tsx                 (existing, now re-exports SettingsLayout or imports it)
├── HotkeyRecorder.tsx               (legacy, left in place; Phase 49 uses components/ui version)
└── TtsProviderSelect.tsx            (existing; Phase 49 may inline or reuse)
```

(The SettingsForm.tsx entry point is preserved to avoid disrupting SettingsApp.tsx import paths.)

---

## Out of Scope for Phase 49

- Whisper model download UX (Phase 50)
- Light theme / theme switching
- Sidebar nav item persistence across window close/reopen (D-11)
- Keyboard shortcuts to switch sections (↑/↓ arrow key handling is executor discretion)
- Animations / transitions between sections (instantaneous switch)
- Settings search / filter

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
