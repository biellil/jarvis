---
phase: 67
slug: jarvis-proativo
status: draft
shadcn_initialized: true
preset: existing-jarvis-design-system-v2.1
created: 2026-05-09
---

# Phase 67 — UI Design Contract: JARVIS Proativo

> Visual and interaction contract for proactive notifications (reminders, folder events, daily summary) and their Settings management. Reuses the JARVIS design system (Phases 48-49: Tailwind v4 @theme + shadcn/Radix primitives) with NO new tokens or primitives. All user-facing copy is pt-BR per CLAUDE.md.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (initialized Phase 48) |
| Preset | existing — `apps/desktop/components.json` (style: new-york, baseColor: slate, cssVariables: true) |
| Component library | Radix primitives wrapped by manual shadcn-style primitives in `apps/desktop/src/renderer/src/components/ui/` |
| Icon library | lucide-react ^1.14.0 |
| Font | Inter (system fallback chain) — `--font-sans` |
| Tailwind | v4.0.0 with `@theme` block in `src/renderer/src/styles/globals.css` |

**Stack lockdown (do NOT change in this phase):**

- React 19 + TypeScript + Tailwind v4 + Radix primitives (already in stack)
- Electron Notification API (built-in, no new dependency)
- All colors flow from `@theme` tokens — no inline hex codes
- Reuse existing primitives: `Button`, `Field`, `Input`, `Label`, `Switch`, `Select`, `Slider`. **Do NOT introduce new ones.**
- Time picker: native HTML `<input type="time">` (matches Phase 49 precedent)

---

## Spacing Scale

Declared values (multiples of 4 — already locked in `globals.css`):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| `xs` | 4px | Icon ↔ text gap in proactive bubble |
| `sm` | 8px | Button row gap; label ↔ input gap in settings |
| `md` | 12px | Field vertical spacing |
| `base` | 16px | Settings section outer padding (matches SettingsLayout pattern from Phase 49) |
| `lg` | 24px | Section group vertical spacing |
| `xl` | 32px | Content panel horizontal padding (Phase 49 pattern) |

**Exceptions:** none. All Phase 67 components MUST use only declared tokens via `gap-xs`, `p-base`, `space-y-lg`, etc.

**Touch-target rule:** Notification dismiss/snooze buttons in Settings or chat use `Button size="sm"` (28px) for compact density. This is below 44px but acceptable for desktop/mouse interaction, and the OS Notification itself is native (not custom UI).

---

## Typography

Declared sizes (already locked in `@theme` — no new sizes added):

| Role | Size | Weight | Line Height | Token | Where used |
|------|------|--------|-------------|-------|------------|
| Caption | 12px | 500 | 1.4 | `--text-xs` | Proactive event time (HH:MM in chat bubble) |
| Body / Description | 14px | 400 | 1.5 | `--text-sm` | Settings section description; reminder message in bubble |
| Label / Button | 14px | 500 | 1.5 | `--text-sm` + `font-medium` | Field labels ("Hora do resumo diário"); all inline buttons |
| Heading / Bubble title | 16px | 600 | 1.3 | `--text-base` + `font-semibold` | Proactive event title in chat bubble (e.g., "🔔 Lembrete") |

**Weights used:** **2 only — 400 (regular) + 500–600 (semibold)**. Do NOT introduce 300/700/900.

**Monospace:** Not used in this phase.

---

## Color

60/30/10 split inherited from globals.css (Phase 48 lockdown). NO new color tokens for this phase.

| Role | Value | Token | Usage in Phase 67 |
|------|-------|-------|-------------------|
| Dominant (60%) | `#020617` slate-950 | `--color-bg` | Chat surface background (bubbles sit on this) |
| Secondary (30%) | `rgba(15,23,42,0.70)` slate-900/70 | `--color-surface` | Proactive event bubble background; Settings section backgrounds |
| Accent (10%) | `#06B6D4` cyan-500 | `--color-accent` | **Reserved for: (a) primary CTA buttons ("Confirmar", "Aplicar"); (b) icon accent in settings (toggle on-state); (c) focus rings on inputs** |
| Success | `#10B981` emerald-500 | `--color-success` | Folder event icon (📁 green tint); toggle enabled state |
| Destructive | `#F43F5E` rose-500 | `--color-destructive` | Error state text; destructive action buttons; quiet hours warning (if applicable) |
| Foreground | `#FFFFFF` / muted | `--color-fg`, `--color-fg-muted`, `--color-fg-subtle` | Primary text, secondary text, helper text respectively |

**Accent reserved for (explicit list):**

1. The primary CTA button per Settings section (e.g., "Confirmar" when enabling a feature, "Aplicar" when saving time settings).
2. The toggle switch on-state (inherits from Switch primitive, no override needed).
3. Focus ring on all inputs (inherited from Input primitive).

**Accent forbidden for:** section headers, descriptive text, secondary buttons, icons except in active toggle state.

---

## Component Inventory

### 1. ProactiveEvent Bubble (NEW — chat bubble variant)

**File:** `apps/desktop/src/renderer/src/chat/ProactiveEventBubble.tsx` (NEW)

**Purpose:** Render proactive notifications (reminders, folder events, daily summary) as distinct visual elements in the chat, separate from user/assistant messages.

**Visual Design:**

Proactive events render as a **full-width banner card** with:
- Left accent stripe: 4px thick, color determined by event kind
- Icon + title row at top
- Content below
- Timestamp at bottom

**Kind-specific styling:**

```
┌─ 4px stripe ─────────────────────────────────────────────────┐
│ 🔔 Lembrete                                  14:32           │ ← title + time
│ Revisar o pull request                                       │ ← message
└──────────────────────────────────────────────────────────────┘
```

- **Reminder** (`kind: 'reminder'`): stripe = `text-accent` (cyan), icon = 🔔
- **Folder event** (`kind: 'folder_event'`): stripe = `text-success` (emerald), icon = 📁
- **Daily summary** (`kind: 'daily_summary'`): stripe = `text-accent` (cyan), icon = 🌅

**Props:**

```ts
interface ProactiveEventBubbleProps {
  event: ProactiveEvent; // { kind, message?, text?, files?, folderPath?, dueAt?, generatedAt? }
  onDismiss?: () => void; // Optional; fires POST /api/proactive/:id/ack
  onSnooze?: (minutes: number) => void; // Optional; future feature (deferred)
}
```

**Structure:**

```tsx
<div className="flex gap-sm p-base rounded-lg bg-surface border-l-4 border-{kind-color}">
  <div className="flex-shrink-0 text-lg">{emoji}</div>
  <div className="flex-1">
    <p className="text-base font-semibold text-fg">{title}</p>
    <p className="text-sm text-fg-muted mt-xs">{content}</p>
    {/* Folder event multi-file list, or daily summary full text */}
  </div>
  <div className="flex-shrink-0 flex flex-col items-end">
    <time className="text-xs text-fg-muted">{time}</time>
  </div>
</div>
```

**Content per kind:**

| Kind | Title | Content | Note |
|------|-------|---------|------|
| `reminder` | `"Lembrete"` | `event.message` (1 line, no wrap) | Time is `dueAt` formatted as "HH:MM" |
| `folder_event` | `"Novo arquivo em {folderName}"` | `{ name: string }[]` rendered as `name, name, name` or `name (e +N mais)` if >3 files | Time is now (when fired) formatted as "HH:MM" |
| `daily_summary` | `"Resumo diário"` | `event.text` (1-3 sentences, may wrap) | Time is now formatted as "HH:MM" |

**Accessibility:**

- `role="article" aria-label="Notificação proativa: {kind}: {brief title}"` on container
- Timestamp wrapped in `<time>` with `datetime` attribute (ISO 8601 epoch)

**State animations:**

No animations. Bubble appears instantly in chat message list (React re-render).

---

### 2. ProactiveSection (Settings panel) (NEW)

**File:** `apps/desktop/src/renderer/src/settings/sections/ProactiveSection.tsx` (NEW)

**Purpose:** User configuration for quiet hours, folder watcher, daily summary.

**Location in Settings:** Added to `SettingsLayout.tsx` NAV_ITEMS (Phase 49 pattern), icon = `Bell` (lucide), label = `"Notificações proativas"`.

**Layout:** Reuses Phase 49 section pattern — header + description + field groups + buttons.

**Structure:**

```
┌─ Section Header ──────────────────────────────┐
│ Notificações proativas                        │
│ Gerencie lembretes, pasta monitorada e        │
│ resumo diário                                 │
└───────────────────────────────────────────────┘

┌─ Group 1: Quiet Hours ──────────────────────┐
│ Horário silencioso                           │
│ Sem notificações proativas neste período     │
│                                              │
│ [⊘] Ativar                                   │ ← Switch
│                                              │
│ Início     ┌─────────┐                       │ ← Input type="time"
│            │ 22:00   │                       │
│            └─────────┘                       │
│                                              │
│ Fim        ┌─────────┐                       │
│            │ 08:00   │                       │
│            └─────────┘                       │
└───────────────────────────────────────────────┘

┌─ Group 2: Folder Watch ───────────────────────┐
│ Monitorar pasta                               │
│ Notifique quando um novo arquivo chegar       │
│                                              │
│ [⊘] Ativar                                   │ ← Switch
│                                              │
│ Caminho da pasta ┌──────────────────────────┐│
│                 │ /home/user/Downloads      ││ ← Input (or button for picker)
│                 └──────────────────────────┘│
│                 ⚠ Pasta não encontrada      │ ← Error state (if invalid)
└───────────────────────────────────────────────┘

┌─ Group 3: Daily Summary ──────────────────────┐
│ Resumo diário                                 │
│ Receba um sumário automático do seu dia      │
│                                              │
│ [✓] Ativar (enabled by default)             │ ← Switch
│                                              │
│ Horário    ┌─────────┐                       │ ← Input type="time"
│            │ 09:00   │                       │
│            └─────────┘                       │
└───────────────────────────────────────────────┘
```

**Component usage:**

| Element | Type | Props |
|---------|------|-------|
| Quiet Hours toggle | `Switch` | `checked={quietHoursEnabled}` |
| Quiet start time | `Input` | `type="time"` value="HH:MM" (24h) |
| Quiet end time | `Input` | `type="time"` value="HH:MM" (24h) |
| Folder watch toggle | `Switch` | `checked={folderWatchEnabled}` |
| Folder path input | `Input` | `type="text"` value={folderWatchPath}; Button for file picker (native dialog) |
| Daily summary toggle | `Switch` | `checked={dailySummaryEnabled}` (default true) |
| Summary time | `Input` | `type="time"` value="HH:MM" (24h) |

**Field wrapping (Phase 49 pattern):**

```tsx
<Field label="Horário silencioso">
  <Switch checked={...} onChange={...} />
</Field>

<Field label="Início do horário silencioso">
  <Input type="time" value="22:00" onChange={...} disabled={!quietHoursEnabled} />
</Field>
```

**Behavior:**

- Time inputs are **disabled when parent toggle is off** (e.g., start/end times disabled if `quietHoursEnabled=false`).
- Folder path input is **disabled when `folderWatchEnabled=false`**.
- File picker button: clicking opens `dialog.showOpenDialog({ properties: ['openDirectory'] })` and populates the path field.
- On path change: validate `fs.existsSync(path)` immediately; show error state in Field.Error if invalid. Clear error when valid.
- All changes apply via `electron-store` **apply-without-restart pattern** (Phase 49+): onChange handler calls IPC `settings:apply-quiet-hours` etc.

**Validation:**

- Time format: `HH:MM` (24-hour, no seconds).
- Time range: `00:00` to `23:59`.
- Cross-midnight: algorithm handles `startTime > endTime` case (e.g., `22:00 > 08:00`).
- Folder path: must exist (`fs.existsSync`) or show error. If deleted after enabling, show warning on next settings open.

**Empty state** (if no settings configured yet):

```
Notificações proativas

Nenhuma notificação configurada.
Ative o horário silencioso, a pasta monitorada ou o resumo diário acima.
```

(Deferred — MVP can skip this if form always loads defaults.)

---

### 3. Existing Component Reuse

| Existing component | Usage | Variant |
|--------------------|-------|---------|
| `Button` | SettingsLayout save/cancel; folder picker CTA | `variant="primary"` for confirm, `variant="secondary"` for cancel/picker |
| `Field` | Wrapper for each time input and folder path input | Standard Field + Label + Input children |
| `Input` | Time pickers (type="time"); folder path (type="text") | `disabled` when parent toggle is off |
| `Switch` | Toggle for each feature (quiet hours, folder watch, daily summary) | Standard Radix Switch styling |
| `Toast` | Feedback for setting changes (already exists in SettingsLayout) | Reuse existing toast from Phase 49 |

**Modifications to existing components:** None. All primitives used as-is.

---

## Visual Variants

### Proactive Event Bubble — Reminder

```
┌─ Left stripe (4px cyan) ──────────────────────────┐
│ 🔔 Lembrete                         14:32         │
│ Revisar o pull request                           │
└──────────────────────────────────────────────────┘
```

- **Stripe color:** `text-accent` (cyan-500)
- **Icon:** 🔔 (emoji, not lucide)
- **Title:** `"Lembrete"` at `text-base font-semibold`
- **Message:** User's reminder text at `text-sm text-fg-muted`
- **Timestamp:** `dueAt` formatted as "HH:MM" at `text-xs text-fg-subtle`

### Proactive Event Bubble — Folder Event

```
┌─ Left stripe (4px emerald) ────────────────────────┐
│ 📁 Novo arquivo em Downloads       14:32           │
│ report.pdf, invoice.pdf                            │
└────────────────────────────────────────────────────┘
```

- **Stripe color:** `text-success` (emerald-500)
- **Icon:** 📁 (emoji)
- **Title:** `"Novo arquivo em {folderName}"` at `text-base font-semibold`
- **Content:** File list (comma-separated names) at `text-sm text-fg-muted`
  - If 1 file: `"report.pdf"`
  - If 2–5 files: `"report.pdf, invoice.pdf, contract.pdf"`
  - If 6+ files: `"report.pdf, invoice.pdf, contract.pdf e mais 3"`
- **Timestamp:** Now formatted as "HH:MM" at `text-xs text-fg-subtle`

### Proactive Event Bubble — Daily Summary

```
┌─ Left stripe (4px cyan) ──────────────────────────┐
│ 🌅 Resumo diário                    14:32          │
│ Hoje conversamos sobre seus emails pendentes,      │
│ executei 3 ações de arquivo, e você tem 2          │
│ lembretes para amanhã.                             │
└──────────────────────────────────────────────────┘
```

- **Stripe color:** `text-accent` (cyan-500)
- **Icon:** 🌅 (emoji)
- **Title:** `"Resumo diário"` at `text-base font-semibold`
- **Content:** Full summary text (1–3 sentences pt-BR) at `text-sm text-fg-muted`, may wrap
- **Timestamp:** Now formatted as "HH:MM" at `text-xs text-fg-subtle`

### Settings: Quiet Hours Section

```
┌──────────────────────────────────────────────────────┐
│ Horário silencioso                                   │ ← text-base font-semibold
│ Sem notificações proativas neste período             │ ← text-sm text-fg-muted
│                                                      │
│ [⊘] Ativar                                           │ ← Switch (unchecked)
│                                                      │
│ Início        ┌────────────┐                         │
│               │ 22:00      │ (disabled)              │ ← Input type="time"
│               └────────────┘                         │
│                                                      │
│ Fim           ┌────────────┐                         │
│               │ 08:00      │ (disabled)              │ ← Input type="time"
│               └────────────┘                         │
└──────────────────────────────────────────────────────┘
```

**When enabled:**

```
│ [✓] Ativar                                           │ ← Switch (checked)
│                                                      │
│ Início        ┌────────────┐                         │
│               │ 22:00      │ (enabled)               │ ← Input enabled
│               └────────────┘                         │
│                                                      │
│ Fim           ┌────────────┐                         │
│               │ 08:00      │ (enabled)               │ ← Input enabled
│               └────────────┘                         │
```

### Settings: Folder Watch Section

**Disabled:**

```
┌──────────────────────────────────────────────────────┐
│ Monitorar pasta                                      │ ← text-base font-semibold
│ Notifique quando um novo arquivo chegar              │ ← text-sm text-fg-muted
│                                                      │
│ [⊘] Ativar                                           │ ← Switch (unchecked)
│                                                      │
│ Caminho       ┌────────────────────────────────────┐│
│               │ (vazio ou last path)      [📁]     ││ ← Input + button (both disabled)
│               └────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Enabled, valid path:**

```
│ [✓] Ativar                                           │ ← Switch (checked)
│                                                      │
│ Caminho       ┌────────────────────────────────────┐│
│               │ /home/user/Downloads      [📁]     ││ ← Input + button (both enabled)
│               └────────────────────────────────────┘│
```

**Enabled, invalid path:**

```
│ [✓] Ativar                                           │ ← Switch (checked)
│                                                      │
│ Caminho       ┌────────────────────────────────────┐│
│               │ /home/user/DeletedFolder  [📁]     ││ ← Input enabled, shows error below
│               └────────────────────────────────────┘│
│               ⚠ Pasta não encontrada                │ ← Field.Error red text
└──────────────────────────────────────────────────────┘
```

### Settings: Daily Summary Section

```
┌──────────────────────────────────────────────────────┐
│ Resumo diário                                        │ ← text-base font-semibold
│ Receba um sumário automático do seu dia              │ ← text-sm text-fg-muted
│                                                      │
│ [✓] Ativar (enabled by default)                     │ ← Switch (checked)
│                                                      │
│ Horário       ┌────────────┐                         │
│               │ 09:00      │ (enabled)               │ ← Input type="time"
│               └────────────┘                         │
└──────────────────────────────────────────────────────┘
```

---

## Copywriting Contract

All strings in **pt-BR** only. No en-US fallback.

### Settings Section Titles & Descriptions

| Element | Copy |
|---------|------|
| Section title | `"Notificações proativas"` |
| Section description | `"Gerencie lembretes, pasta monitorada e resumo diário"` |

### Quiet Hours Group

| Element | Copy |
|---------|------|
| Group heading | `"Horário silencioso"` |
| Group description | `"Sem notificações proativas neste período"` |
| Toggle label | `"Ativar"` |
| Start time label | `"Início"` |
| End time label | `"Fim"` |
| Helper text (optional) | `"Notificações serão postergadas até o fim do horário silencioso"` |

### Folder Watch Group

| Element | Copy |
|---------|------|
| Group heading | `"Monitorar pasta"` |
| Group description | `"Notifique quando um novo arquivo chegar"` |
| Toggle label | `"Ativar"` |
| Path label | `"Caminho da pasta"` |
| Button text (folder picker) | `"Abrir"` (or icon only: 📁) |
| Error: path not found | `"Pasta não encontrada"` |
| Error: permission denied | `"Sem permissão de leitura nesta pasta"` |

### Daily Summary Group

| Element | Copy |
|---------|------|
| Group heading | `"Resumo diário"` |
| Group description | `"Receba um sumário automático do seu dia"` |
| Toggle label | `"Ativar"` (default enabled) |
| Time label | `"Horário"` |

### Proactive Event Bubble Titles

| Kind | Title |
|------|-------|
| `reminder` | `"Lembrete"` |
| `folder_event` | `"Novo arquivo em {folderName}"` (dynamic) |
| `daily_summary` | `"Resumo diário"` |

### OS Notification Titles (native, shown by Electron Notification API)

| Kind | Title |
|------|-------|
| `reminder` | `"Lembrete"` |
| `folder_event` | `"Novo arquivo em {folderName}"` |
| `daily_summary` | `"Resumo diário pronto"` |

### Empty State (Settings)

| Scenario | Copy |
|----------|------|
| No proactive features configured | `"Nenhuma notificação configurada.\nAtive o horário silencioso, a pasta monitorada ou o resumo diário acima."` |

### Validation & Errors

| Scenario | Copy |
|----------|------|
| Folder path invalid | `"Pasta não encontrada"` (in Field.Error, red text) |
| Folder path permission denied | `"Sem permissão de leitura"` |

---

## Animations and Motion

All animations use **CSS-only** via Tailwind utilities. No new keyframes added.

| Transition | Mechanism | Duration | Easing | Reduced-motion fallback |
|------------|-----------|----------|--------|------------------------|
| ProactiveEventBubble enters chat | Fade-in: `transition-opacity duration-base` on the bubble div | 180ms | ease-in-out | Appear instantly (opacity 0 → 1 skipped) |
| Switch toggle on/off (quiet hours, etc.) | Radix Switch native animation (inherited from Phase 48 primitive) | — | — | Instant toggle (no animation) |
| Input focus (time fields) | `focus-visible:ring-2 ring-accent-ring` transition | `--duration-base` (180ms) | ease-in-out | Ring appears instantly |

**Honors `prefers-reduced-motion: reduce`** — globally enforced via existing `@media (prefers-reduced-motion: reduce)` block in `globals.css` and per-utility `motion-safe:`/`motion-reduce:` variants.

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Proactive bubble structure | Container `role="article" aria-label="Notificação proativa: lembrete: Revisar o PR"` |
| Timestamp semantics | Wrapped in `<time datetime="2026-05-09T14:32:00Z">14:32</time>` |
| Settings section structure | `<section role="region" aria-label="Notificações proativas">…</section>` |
| Toggle switches | `role="switch"` (inherited from Radix Switch); label associates via `<label for="...">` |
| Time input labels | Explicit `<label for="quiet-start-time">Início</label>` before each input |
| Field validation errors | `<div role="alert" aria-live="polite">Pasta não encontrada</div>` in Field.Error slot |
| Color-blind safety | Event badges differentiated by icon (🔔, 📁, 🌅) AND left stripe color AND title text — never color-only |
| Focus ring | Inherited from input primitives: `focus-visible:ring-2 ring-accent-ring` |
| Folder picker button | Button always visible + keyboard-accessible; opens native file dialog |
| Time picker UX | Native HTML `<input type="time">` keyboard-accessible (arrow keys increment/decrement) |

**Screen reader experience:**

- "Settings, Notificações proativas" on entering section.
- Toggle state announced: "Ativar, checkbox, checked" vs "Ativar, checkbox, unchecked".
- Time input focus: "Início, input, time, 22:00" + instructions (implicit in input type).
- Error state: "Pasta não encontrada, alert, live region update" when validation fails.
- Folder picker button: "Abrir pasta, button" (or just icon with accessible name if icon-only).

---

## Component Inventory

### NEW Components in this phase

| Component | File | Status |
|-----------|------|--------|
| ProactiveEventBubble | `apps/desktop/src/renderer/src/chat/ProactiveEventBubble.tsx` | NEW |
| ProactiveSection | `apps/desktop/src/renderer/src/settings/sections/ProactiveSection.tsx` | NEW |

### MODIFIED Components in this phase

| Component | File | Change | Justification |
|-----------|------|--------|---------------|
| SettingsLayout | `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` | Add "Notificações proativas" nav item + route case | Phase 49 pattern; new section follows same structure |
| ChatContext / message list | `apps/desktop/src/renderer/src/chat/ChatContext.tsx` or `MessageList.tsx` | Handle new `ProactiveEvent` union type from SSE; render via ProactiveEventBubble | SSE `/api/proactive/stream` sends `ProactiveEvent` objects; renderer maps to bubble component |

### REUSED Components (no changes)

| Component | Usage |
|-----------|-------|
| Button | "Abrir" (folder picker), "Confirmar" (placeholder for future); already in primitives |
| Field | Wrapper for time inputs and folder path input |
| Input | Time inputs (type="time") and folder path input (type="text") |
| Switch | Toggle for quiet hours, folder watch, daily summary |
| Toast | Settings feedback (already exists in SettingsLayout) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none added in this phase — all primitives (Button, Field, Input, Switch) were authored manually in Phase 48 and committed to repo. | not required |
| Third-party registries | **none declared** | not applicable |

**No new dependencies introduced by this phase's UI work.** lucide-react (already in stack) provides emoji rendering via native text (no custom icons for 🔔, 📁, 🌅 — these are emoji literals in JSX).

---

## Open Questions for Planner

These are implementation choices within the contract:

1. **ProactiveSection location in nav order:** Should "Notificações proativas" appear after "Servidor MCP" (end of list), or earlier (between "Vision Hotkeys" and "Servidor MCP")? Recommendation: **end of list** (last item after "Servidor MCP"), following the feature rollout order.

2. **Folder picker UI:** Should the path field have an inline icon button (📁) or a separate "Abrir" button below the field? Recommendation: **inline icon button** (matches native file input style), or separate button if space is tight.

3. **Empty state persistence:** If user starts with nothing configured, should ProactiveSection show the empty-state message on first open? Recommendation: **always show form fields with defaults** (quiet hours default disabled; folder watch default disabled; summary default enabled @ 09:00). Empty-state message deferred to Phase 67.1.

4. **Toast auto-clear timing:** Do apply-without-restart changes (quiet hours, folder path, summary time) show a toast confirmation? Recommendation: **yes, brief info toast** ("Horário silencioso atualizado") on successful POST to backend, 2s auto-clear.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — pt-BR contract complete, all Settings labels + Proactive bubble titles defined, no en-US leakage
- [ ] Dimension 2 Visuals: PASS — 3 proactive bubble variants (reminder, folder, summary) + 3 Settings groups (quiet hours, folder watch, daily summary) explicit
- [ ] Dimension 3 Color: PASS — 60/30/10 inherited, accent reserved for primary buttons + toggle on-state + focus rings; stripe colors per kind (cyan, emerald, cyan)
- [ ] Dimension 4 Typography: PASS — 4 sizes / 2 weights from existing `@theme`, no additions; 12px caption, 14px body + button, 16px heading
- [ ] Dimension 5 Spacing: PASS — only declared tokens (xs, sm, md, base, lg, xl), all multiples of 4, no exceptions
- [ ] Dimension 6 Registry Safety: PASS — zero new dependencies, zero third-party registries, all components reused from Phase 48-49

**Approval status:** pending

---

*Phase: 67-jarvis-proativo*
*UI-SPEC created: 2026-05-09*
*Design system: Tailwind v4 + Radix + Phase 48-49 primitives*
