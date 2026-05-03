# Phase 48: Design System Foundation - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Construir base de design tokens (cores, espaçamentos, tipografia, raios, estados) + biblioteca de primitivos React reutilizáveis (Button, Input, Select, Slider, Label, Field, hotkey recorder, Progress/Spinner) com identidade visual própria — usados pela Phase 49 (refatoração da Settings) e Phase 50 (Whisper pre-download UX).

**NÃO inclui:** refatorar a Settings em si (Phase 49), aplicar primitivos em outras telas do app (orb, voice, chat — fora de escopo).
</domain>

<decisions>
## Implementation Decisions

### Lib & Token Strategy
- **D-01:** Usar **shadcn/ui** (copy-paste sobre Radix) como base dos primitivos — integra Tailwind v4, a11y de graça, totalmente customizável
- **D-02:** Tokens definidos via **Tailwind v4 `@theme` no globals.css** — idiomático com v4, tokens viram classes utilitárias automaticamente
- **D-03:** Migrar o slider VAD existente (CSS custom inline em globals.css linhas 60-90) para o novo Slider primitivo unificado
- **D-04:** Acessibilidade padrão Radix (foco visível, ARIA, keyboard nav) — herdada via shadcn

### Visual Identity
- **D-05:** Estética **Raycast-like** — dark refinado com depth sutil (shadow + border discretos), alta densidade controlada
- **D-06:** Accent color **cyan-500** mantido (consistência com orb e slider VAD existentes)
- **D-07:** Background da Settings window: **slate-950 com noise/grain sutil** — fugir do "cinza Electron default"
- **D-08:** Tipografia **Inter** mantida + escala definida via tokens (text-xs/sm/base/lg + line-height tokens)

### Primitivos no Escopo
- **D-09:** Primitivos desta fase: **Button, Input, Select, Slider, Label, Field/FormItem (wrapper label+input+helper)**
- **D-10:** **Hotkey recorder** custom incluído no escopo (específico do Settings, sem equivalente em shadcn)
- **D-11:** **Progress/Spinner** incluído (Phase 50 precisa pra download de modelo Whisper — evita ida-volta de fase)
- **D-12:** Estados completos definidos via tokens em cada primitivo: hover, focus-visible, disabled, error

### Claude's Discretion
- Estrutura de pastas dos primitivos (`components/ui/` é o padrão shadcn — usar como default)
- Variantes de Button (primary/secondary/ghost) — decidir baseado em uso real do Settings
- Implementação exata de noise/grain (CSS gradient sutil ou textura SVG inline)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — JARVIS overview, stack, current state
- `.planning/REQUIREMENTS.md` — REDESIGN-02, REDESIGN-03 são endereçados nesta fase
- `.planning/ROADMAP.md` — Phase 48 goal e success criteria
- `CLAUDE.md` — convenções de commits do projeto (emoji + Conventional)

### Codebase
- `apps/desktop/src/renderer/src/styles/globals.css` — entrada Tailwind v4 atual (sem `@theme` definido); slider VAD CSS custom a ser migrado
- `apps/desktop/tailwind.config.ts` — config Tailwind atual
- `apps/desktop/src/renderer/src/settings/SettingsForm.tsx` — uso atual de classes Tailwind (referência do que vai ser refatorado em Phase 49)
- `apps/desktop/src/renderer/src/settings/TtsProviderSelect.tsx` — controle inline atual
- `apps/desktop/package.json` — dependências (Tailwind v4 + Vite)

### External docs (a serem consultados pelo researcher)
- shadcn/ui docs (instalação em projeto Tailwind v4)
- Tailwind v4 `@theme` directive
- Radix UI primitives (Slider, Select, Label) — base do shadcn

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Toast.tsx` em `components/` — único componente compartilhado existente, padrão de organização a seguir
- Inter font já carregada via `globals.css`
- Tailwind v4 já configurado (`@import "tailwindcss"` em globals.css)
- Cyan-500 já é cor de accent estabelecida (orb, slider VAD)

### Established Patterns
- Sem lib de UI atualmente — controles HTML default + classes Tailwind cruas
- Settings form é vertical, controles inline (sem encapsulamento em componentes)
- CSS custom restrito a slider VAD — todo resto via Tailwind
- Convenção de commits: emoji + Conventional Commits (`✨ feat`, `💄 style`, etc.)

### Integration Points
- `globals.css` é o ponto único de configuração de tema (não há config separado)
- Primitivos serão consumidos pelo `settings/` em Phase 49 — manter API simples e React-idiomática
- Hotkey recorder atual está embedded em SettingsForm — extrair para `components/ui/HotkeyRecorder.tsx`

</code_context>

<specifics>
## Specific Ideas

- Identidade Raycast-like = depth via `shadow-sm` + `border border-white/5`, não shadow pesado
- Slate-950 + noise sutil pra background do app — diferencia de "default Electron" sem ser chamativo
- Field/FormItem wrapper deve cobrir o pattern label + helper text + error state (consistência em todos os forms)

</specifics>

<deferred>
## Deferred Ideas

- Light theme / theme switching — out of scope v2.1
- Animações elaboradas (micro-interactions complexas) — polish posterior
- Dialog/Tooltip/Tabs primitives — só adicionar quando alguma fase precisar
- Aplicar primitivos em outras telas (orb, voice, chat) — fora do escopo desta milestone

</deferred>

---

*Phase: 48-design-system-foundation*
*Context gathered: 2026-05-03 (smart discuss via /gsd:autonomous)*
