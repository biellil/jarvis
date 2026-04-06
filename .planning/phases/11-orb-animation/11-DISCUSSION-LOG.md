# Phase 11: Orb Animation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 11-orb-animation
**Areas discussed:** Visual do Orb, Transições entre estados, Animações de cada estado, Estrutura de componentes

---

## Visual do Orb

### Gradiente

| Option | Description | Selected |
|--------|-------------|----------|
| Luz no canto (UI-SPEC) | radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), cor-estado 70%) — efeito de esfera 3D clássico | ✓ |
| Gradiente central | Luz no centro irradiando para fora — mais "energy core" que esfera sólida | |
| Sólido com borda | Cor sólida + border luminoso — visual mais flat/moderno, menos 3D | |
| Você decide | Claude escolhe o que anima melhor no compositor thread | |

**User's choice:** Luz no canto (UI-SPEC)
**Notes:** Mantém proposta do UI-SPEC — efeito esfera 3D clássico com luz no canto superior esquerdo

### Glow

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre visível (recomendado) | Glow presente em todos os estados — muda de cor conforme estado, orb sempre parece "vivo" | ✓ |
| Só em listening/responding | Glow aparece quando ativo, desaparece em idle/processing — mais discreto | |
| Só em processing/responding | Glow indica "trabalhando" — idle e listening são sem glow | |
| Você decide | Claude escolhe baseado em melhor hierarquia visual | |

**User's choice:** Sempre visível (recomendado)
**Notes:** Orb sempre parece "vivo" — glow muda de cor conforme estado mas nunca some

### Profundidade

| Option | Description | Selected |
|--------|-------------|----------|
| Com sombra interna (UI-SPEC) | inset 0 -12px 24px rgba(0,0,0,0.2) — dá volume, parece esfera real | ✓ |
| Sem sombra interna | Apenas gradiente + glow externo — visual mais flat/moderno, menos processamento | |
| Você decide | Claude testa ambos e escolhe o que performa melhor sem jank | |

**User's choice:** Com sombra interna (UI-SPEC)
**Notes:** Mantém sombra interna para efeito 3D completo

---

## Transições entre Estados

### Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Gradual (300ms recomendado) | transition: all 0.3s ease-in-out — UI-SPEC menciona <300ms, suave e responsível | ✓ |
| Rápida (150ms) | Mais snappy, feedback instantâneo — útil se estados mudam muito rápido | |
| Imediata (0ms) | Troca instantânea de cor e animação — sem fade, mais reativo | |
| Você decide | Claude escolhe baseado em fluidez vs responsividade | |

**User's choice:** Gradual (300ms recomendado)
**Notes:** UI-SPEC Success Criteria #2 especifica <300ms — 300ms exato é suave e dentro do limite

### Overlap

| Option | Description | Selected |
|--------|-------------|----------|
| Parar antes (recomendado) | animation-play-state: paused ao trocar classe CSS — evita conflito de keyframes | ✓ |
| Sobrepor durante fade | Ambas animam durante 300ms — pode criar efeito interessante mas mais complexo | |
| Você decide | Claude implementa o que funciona melhor no compositor thread | |

**User's choice:** Parar antes (recomendado)
**Notes:** Evita conflito de keyframes — transição limpa com animação pausada antes de trocar

---

## Animações de Cada Estado

### Idle pulse

| Option | Description | Selected |
|--------|-------------|----------|
| 2s (UI-SPEC) | Ritmo calmo, como respiração lenta — 1.05x scale, suave | ✓ |
| 3s (mais lento) | Ainda mais relaxado, quase meditativo | |
| 1.5s (mais rápido) | Mais energizado mesmo em idle | |
| Você decide | Claude escolhe baseado em balanço entre "vivo" e "não distrair" | |

**User's choice:** 2s (UI-SPEC)
**Notes:** Mantém timing do UI-SPEC — ritmo calmo, respiração lenta

### Listen pulse

| Option | Description | Selected |
|--------|-------------|----------|
| 1s (UI-SPEC recomendado) | 2x mais rápido que idle — indica atenção ativa | ✓ |
| 0.8s (mais urgente) | Ainda mais rápido — "estou escutando AGORA" | |
| 1.2s (meio termo) | Entre idle e 1s — ativo mas não apressado | |
| Você decide | Claude ajusta baseado em contraste com idle | |

**User's choice:** 1s (UI-SPEC recomendado)
**Notes:** 2x mais rápido que idle — contraste claro entre estados idle/listening

### Processing

| Option | Description | Selected |
|--------|-------------|----------|
| Spin + pulse (UI-SPEC) | rotate(360deg) + scale(1.05) no meio — indica "trabalhando intensamente" | ✓ |
| Só spin constante | Apenas rotação sem pulso — mais limpo, clássico loading | |
| Só pulse rápido | Sem rotação, apenas pulso contínuo — menos motion sickness | |
| Você decide | Claude testa e escolhe o que indica "aguardando" sem distrair | |

**User's choice:** Spin + pulse (UI-SPEC)
**Notes:** Combinação de rotação e pulso — indica "trabalhando intensamente", mais dinâmico que spin puro

### Responding

| Option | Description | Selected |
|--------|-------------|----------|
| 3 rings escalonados (recomendado) | 3 pseudo-elementos animando com delay 0s, 0.5s, 1s — ondas contínuas | ✓ |
| 1 ring simples | Um único ring expandindo e desaparecendo — mais simples, menos overhead | |
| 5+ rings densos | Vários rings criando efeito de pulso intenso — mais dramático | |
| Você decide | Claude implementa baseado em performance no compositor thread | |

**User's choice:** 3 rings escalonados (recomendado)
**Notes:** 3 rings com delays escalonados — ondas contínuas como sonar, não um único ping

---

## Estrutura de Componentes

### Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Orb.tsx monolítico (recomendado) | Um componente com pseudo-elementos para glow e rings — simples, coeso, sem prop drilling | ✓ |
| Orb + OrbGlow + RippleRings separados | 3 componentes — mais modular mas overhead de props e coordenação | |
| Orb + useOrbAnimation hook | Lógica de animação em hook customizado — reusa lógica se tiver múltiplos orbs | |
| Você decide | Claude escolhe baseado em Phase 9 D-07 (componentes por feature) | |

**User's choice:** Orb.tsx monolítico (recomendado)
**Notes:** Um componente coeso — pseudo-elementos para efeitos, sem coordenação complexa

### State mgmt

| Option | Description | Selected |
|--------|-------------|----------|
| React Context (OrbContext) | Fase 9 D-06 já decidiu Context API — consistente, fácil acesso em outros componentes (Phases 12-13) | ✓ |
| useState local no App | Estado no componente App.tsx, passa prop para Orb — simples mas prop drilling futuro | |
| Zustand ou state lib externa | Store global dedicado — overhead desnecessário para 1 estado simples | |
| Você decide | Claude segue Phase 9 D-06 (Context API) | |

**User's choice:** React Context (OrbContext)
**Notes:** Consistente com Phase 9 D-06 — Context API para state management, fácil acesso em Phases 12-13

---

## Claude's Discretion

[Areas where user said "you decide" or deferred to Claude]

- Implementação exata dos 3 rings (técnica de pseudo-elementos ou elementos filhos)
- Tipos TypeScript para OrbContext
- Se adicionar aria-live region para acessibilidade
- Organização de arquivos dentro de `src/renderer/components/Orb/`

---

## Deferred Ideas

- Amplitude visualization durante listening — Phase 13 se necessário
- Partículas flutuantes ao redor do orb — Aether extra se performance permitir
- Customização de cores por usuário — v1.3+
- Animação de entrada/saída — Phase 12 pode adicionar
