# Phase 49: Settings Layout Refactor - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Refatorar a Settings window para um layout sidebar (esquerda, fixa) + content panel (direita, scroll interno) usando os primitivos da Phase 48 (`Button`, `Input`, `Select`, `Slider`, `Field`, `HotkeyRecorder`). Quebrar o atual `SettingsForm.tsx` monolítico em `SettingsLayout.tsx` + sections por domínio. Manter 100% da funcionalidade do v2.0 (Save, Cancel, hotkey recorder, VAD slider real-time apply, TTS provider switch, Whisper select) e suite Vitest verde.

**NÃO inclui:** trocar Whisper model com download imediato (Phase 50), light theme, persistência da seção ativa entre sessões, novos campos no settings store.
</domain>

<decisions>
## Implementation Decisions

### Sidebar Behavior & Visual
- **D-01:** Sidebar largura fixa **200px** — Raycast feel, fits 4 nav items
- **D-02:** Ordem das seções: **PTT → Always-Listening → TTS → Whisper** (preserva ordem atual de `SettingsForm.tsx`)
- **D-03:** Item visual: **icon (lucide-react) + label**; selected = `bg-accent-soft` + barra esquerda 2px `accent` + texto `fg`; hover = `bg-white/5`
- **D-04:** Header da sidebar: pequeno título **"Settings"** (`text-base font-semibold`) com border-bottom `white/8`

### Content Panel & Save Bar
- **D-05:** Scroll **interno** dentro do content panel (sidebar permanece fixa, sem scroll global)
- **D-06:** Cada section abre com **h1 (`text-lg font-semibold`)** + descrição opcional curta em `text-sm fg-subtle`
- **D-07:** Save/Cancel bar: **footer sticky bottom-right** do content panel, separado por `border-top white/8`, padding `xl` lateral, `base` vertical
- **D-08:** Save bar **sempre visível**; botão Save desabilitado quando não há mudanças (dirty=false). Cancel sempre habilitado.

### Estrutura de Arquivos & Estado
- **D-09:** Quebrar `settings/SettingsForm.tsx` em:
  - `settings/SettingsLayout.tsx` — shell com sidebar + content panel + save bar; gerencia estado da seção ativa (useState local, sem persistência)
  - `settings/sections/PttSection.tsx`
  - `settings/sections/AlwaysListeningSection.tsx`
  - `settings/sections/TtsSection.tsx`
  - `settings/sections/WhisperSection.tsx`
- **D-10:** **State do form continua no parent** (`SettingsLayout` ou wrapper que substitui o atual `SettingsForm`). Sections recebem props/handlers — preserva shape atual de IPC e validação.
- **D-11:** Seleção da sidebar **NÃO persiste** entre aberturas — sempre abre em PTT (primeira section)
- **D-12:** Manter Whisper helper text ("Auto: model selected based on available VRAM" / "Manual: ...") e VAD reset button. Reset usa `<Button variant="ghost" size="sm">`.

### Componentes Phase 48 Aplicados
- HotkeyRecorder → já é primitivo `components/ui/HotkeyRecorder` (Phase 48 D-10) — substituir import do `./HotkeyRecorder` legado
- Slider VAD → primitivo `components/ui/Slider` com `aria-valuetext` `"{N} milliseconds"` preservado
- TTS Provider Select → primitivo `components/ui/Select` (TtsProviderSelect.tsx pode ficar como wrapper que compõe Select+Input ou ser inlinado em TtsSection)
- TTS API Key & Voice ID → primitivo `Input` envolto em `Field`
- Whisper model → primitivo `Select` envolto em `Field` com Helper
- Save/Cancel → primitivos `Button` (`variant="primary"` para Save, `variant="secondary"` para Cancel)
- Toast existente (`components/Toast.tsx`) — manter, é fora do escopo de Phase 48

### Claude's Discretion
- Ícones lucide específicos por section (ex: `Keyboard` para PTT, `Mic` para Always-Listening, `Volume2` para TTS, `Languages` para Whisper) — escolher os mais semânticos
- Nome exato do componente raiz que substitui `SettingsForm` (manter `SettingsForm.tsx` exportando `SettingsLayout` para não mexer no entry, OU renomear e atualizar import — executor decide)
- Como detectar dirty state (compare initial settings vs current; deep equal ou per-field tracking) — executor decide
- Texto descritivo (subtítulo) opcional de cada section — manter conciso ou omitir se redundante
- Comportamento exato do VAD slider (real-time apply via IPC) — preservar lógica atual em AlwaysListeningSection

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — JARVIS overview
- `.planning/REQUIREMENTS.md` — REDESIGN-01, REDESIGN-04
- `.planning/ROADMAP.md` — Phase 49 success criteria
- `CLAUDE.md` — convenções de commits

### Phase 48 (dependência)
- `.planning/phases/48-design-system-foundation/48-CONTEXT.md` — decisões D-01..D-12 do design system
- `.planning/phases/48-design-system-foundation/48-UI-SPEC.md` — spec completa dos primitivos consumidos
- `apps/desktop/src/renderer/src/components/ui/` — Button, Input, Select, Slider, Label, Field, HotkeyRecorder, Progress (entregues pela Phase 48)
- `apps/desktop/src/renderer/src/styles/globals.css` — `@theme` tokens e background recipe

### Codebase a refatorar
- `apps/desktop/src/renderer/src/settings/SettingsForm.tsx` — implementação atual monolítica
- `apps/desktop/src/renderer/src/settings/HotkeyRecorder.tsx` — versão legada, substituir pelo primitivo de `components/ui/HotkeyRecorder`
- `apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx` — controle inline atual
- `apps/desktop/src/renderer/src/settings/__tests__/` (se existir) — testes Vitest do settings que devem continuar verdes
- `apps/desktop/src/shared/ipc-types.ts` — tipos `WhisperModelOption`, `TtsProviderOption` etc.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Primitivos completos da Phase 48 em `components/ui/` (Button, Input, Select, Slider, Field, HotkeyRecorder, Progress)
- `Toast.tsx` para feedback transitório (mantido)
- IPC handlers existentes (`window.settings.get/save/close/setVadThreshold`) — sem mudança

### Established Patterns
- State centralizado no componente raiz (atual `SettingsForm`)
- IPC roundtrip imediato no slider VAD (real-time apply, sem botão Save para esse campo) — preservar em AlwaysListeningSection
- Validação client-side de API key não-vazia antes de Save — manter
- Toast auto-clear: 2s info, 5s error — manter
- Fechar window 2s após save bem-sucedido — manter

### Integration Points
- Entry point continua sendo o componente exportado por `settings/SettingsForm.tsx` (ou renomeado, mas o import no `SettingsApp.tsx`/equivalente deve continuar resolvendo)
- Tokens via Tailwind classes (`bg-surface`, `text-fg`, `ring-accent`, etc.) — não escrever cores cruas

</code_context>

<specifics>
## Specific Ideas

- Sidebar item ativo: barra esquerda 2px `accent` (cyan-500) + bg `accent-soft` (cyan-500/20) + texto `fg`. Inativo: texto `fg-muted`, sem bg. Hover: `bg-white/5`.
- Each section descriptor:
  - PTT: "Set the global hotkey for push-to-talk."
  - Always-Listening: "Tune voice activity detection sensitivity." (ou similar curto)
  - TTS: "Choose the text-to-speech provider and voice."
  - Whisper: "Choose the speech-to-text model."
  (Descrições curtas opcionais — executor pode omitir se ficar redundante)
- VAD reset button: `<Button variant="ghost" size="sm">Reset to Default (500ms)</Button>` em vez do `<button>` cru atual

</specifics>

<deferred>
## Deferred Ideas

- Persistência da seção ativa entre aberturas — out of scope desta phase
- Search/filter dentro das settings — out of scope v2.1
- Light theme / theme switching — out of scope v2.1
- Whisper download UX (Phase 50)
- Keyboard shortcut para alternar sections (ex: ⌘1, ⌘2) — pode adicionar futuramente
- Animação de transição entre sections — manter switch instantâneo

</deferred>

---

*Phase: 49-settings-layout-refactor*
*Context gathered: 2026-05-03 (smart discuss via /gsd:autonomous)*
