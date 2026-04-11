# Phase 11: Orb Animation - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

O orb exibe quatro estados visuais distintos — idle, listening, processing, responding — animados inteiramente por CSS keyframes no compositor thread, sem JS animation loop, com transições suaves entre estados via troca de classe CSS.

</domain>

<decisions>
## Implementation Decisions

### Visual do Orb
- **D-01:** Gradiente radial com luz no canto — `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), var(--state-color) 70%)` — efeito esfera 3D clássico
- **D-02:** Glow sempre visível em todos os estados — muda de cor conforme estado (#06B6D4 idle, #F59E0B listening, #8B5CF6 processing, #3B82F6 responding), orb sempre parece "vivo"
- **D-03:** Sombra interna para profundidade — `inset 0 -12px 24px rgba(0,0,0,0.2)` — dá volume, parece esfera real

### Transições entre Estados
- **D-04:** Transição gradual 300ms — `transition: all 0.3s ease-in-out` — UI-SPEC menciona <300ms, suave e responsível
- **D-05:** Animação antiga para antes da nova começar — `animation-play-state: paused` ao trocar classe CSS — evita conflito de keyframes

### Animações de Cada Estado
- **D-06:** Idle pulse 2s — `pulse-idle` keyframe, ritmo calmo como respiração lenta, 1.05x scale máximo
- **D-07:** Listening pulse 1s — `pulse-listen` keyframe, 2x mais rápido que idle, 1.08x scale, indica atenção ativa
- **D-08:** Processing spin + pulse — `spin-process` keyframe, rotate(360deg) + scale(1.05) no meio, indica "trabalhando intensamente"
- **D-09:** Responding ripple rings — 3 pseudo-elementos (`::before`, `::after`, terceiro via elemento filho) animando com delay 0s, 0.5s, 1s — ondas contínuas

### Estrutura de Componentes
- **D-10:** Orb.tsx monolítico — um componente com pseudo-elementos para glow e rings — simples, coeso, sem prop drilling
- **D-11:** State management via React Context — `OrbContext` com `type OrbState = 'idle' | 'listening' | 'processing' | 'responding'` — consistente com Phase 9 D-06, fácil acesso em Phases 12-13

### Claude's Discretion
- Implementação dos 3 rings (::before, ::after, span child ou outra técnica)
- Tipos TypeScript exatos para OrbContext (OrbState, setState signature)
- Se adicionar aria-live region para acessibilidade (UI-SPEC menciona mas não obrigatório em Phase 11)
- Organização de arquivos dentro de `src/renderer/components/Orb/` (Orb.tsx + OrbContext.tsx ou tudo em um)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Specification
- `.planning/phases/09-electron-scaffold/09-UI-SPEC.md` — Seções "Visual Effects (Aether Style)", "Animation Constraints (Compositor Thread)", "Design Tokens Reference" (keyframes já definidos)
- `.planning/REQUIREMENTS.md` §Orb Animation — ORB-01 (idle), ORB-02 (listening), ORB-03 (processing), ORB-04 (responding)

### Prior Phase Patterns
- `.planning/phases/09-electron-scaffold/09-CONTEXT.md` — D-06 (React Context API), D-07 (componentes por feature)
- `.planning/phases/10-frameless-widget-window/10-CONTEXT.md` — D-13 (orb draggable via -webkit-app-region: drag)

### Animation Performance
- UI-SPEC §Animation Constraints — **FORBIDDEN:** animar `width`, `height`, `background-color`, `box-shadow` (triggers paint). **ALLOWED:** `transform`, `opacity`, `filter`
- Success Criteria #5 — DevTools Performance trace deve mostrar animações no compositor thread sem paint records

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Tailwind config:** Keyframes `pulse-idle`, `pulse-listen`, `spin-process`, `ripple` já definidos no UI-SPEC — importar diretamente sem redefinir
- **Design tokens:** `orb-idle`, `orb-listen`, `orb-process`, `orb-respond`, `orb` spacing (96px) já no Tailwind config
- **Placeholder orb:** `apps/desktop/src/renderer/src/App.tsx` linha 27 tem `<div className="w-orb h-orb rounded-full bg-orb-idle opacity-20" />` — substituir pelo componente real

### Established Patterns
- **Draggable container:** App.tsx já tem `-webkit-app-region: drag` no container principal — Orb deve herdar isso (Phase 10 D-13)
- **Globals.css:** `body { background-color: #0F172A }` (slate-900) e `.no-select` class já existem

### Integration Points
- **App.tsx:** Importar `<Orb />` e substituir placeholder na linha 27
- **OrbContext provider:** Envolver App.tsx com `<OrbProvider>` para disponibilizar estado globalmente
- **Future phases:** Phase 12 (hotkey) e Phase 13 (audio) chamarão `setOrbState('listening')`, `setOrbState('processing')`, etc via useOrbContext()

</code_context>

<specifics>
## Specific Ideas

- "Glow sempre visível" — orb sempre parece "vivo" mesmo em idle, não some e aparece
- "3 rings escalonados" — ondas contínuas como sonar, não um único ping
- "Parar animação antes de trocar" — evita keyframes conflitantes, transição limpa
- "Monolítico sem prop drilling" — um componente, pseudo-elementos para efeitos, sem coordenação complexa

</specifics>

<deferred>
## Deferred Ideas

- **Amplitude visualization durante listening:** Analisar onda sonora e pulsar orb no ritmo — Phase 13 se necessário
- **Partículas flutuantes ao redor do orb:** Efeito Aether extra — adicionar se performance permitir após Phase 11 completa
- **Customização de cores por usuário:** Settings para trocar cores de estado — v1.3+
- **Animação de entrada/saída:** Fade in ao aparecer, fade out ao esconder — Phase 12 (hotkey) pode adicionar

</deferred>

---

*Phase: 11-orb-animation*
*Context gathered: 2026-04-06*
