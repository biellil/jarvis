---
phase: quick
plan: 260410-td5
subsystem: desktop-ui
tags: [electron, orb, ui, css, drop-shadow, window-sizing, positioning]
one_liner: "Janela Electron 160→240 + drop-shadow colorido externo na esfera + esfera visível colada à taskbar — resolve 3 problemas de UI com uma causa raiz (janela apertada)."

dependency_graph:
  requires:
    - apps/desktop Electron scaffold (Phase 9)
    - Orb component 128px glass sphere (260410-sox)
  provides:
    - Orb visual 3D com glow externo colorido por estado
    - Posicionamento "colado à taskbar" canto inferior direito
    - 56px de respiro transparente em volta da esfera para efeitos externos futuros
  affects:
    - apps/desktop/src/main/__tests__/position.test.ts (nova matemática)
    - apps/desktop/src/main/__tests__/window-config.test.ts (240x240)

tech_stack:
  added: []
  patterns:
    - "filter: drop-shadow() no wrapper escapa do overflow:hidden do layer filho (box-shadow não escaparia)"
    - "Janela transparente maior que o conteúdo visível = respiro para efeitos externos sem alterar hitbox visível"
    - "Validação de posição baseada na região VISÍVEL, não na bounding box da janela transparente"

key_files:
  created: []
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/position.ts
    - apps/desktop/src/main/__tests__/window-config.test.ts
    - apps/desktop/src/main/__tests__/position.test.ts
    - apps/desktop/src/renderer/src/App.css
    - apps/desktop/src/renderer/components/Orb/Orb.tsx

decisions:
  - "filter:drop-shadow no div raiz em vez de box-shadow no layer do sphere body — box-shadow respeita overflow:hidden e ficaria invisível"
  - "Dois drop-shadows empilhados: glow colorido (24px, 0 4 12 rgba 0.35) para luz + sombra cinza inferior para peso/ancoragem visual"
  - "Introduzir VISIBLE_ORB_SIZE=128 como constante semântica separada de WINDOW_SIZE=240 — evita confusão entre tamanho da janela Electron e tamanho da esfera renderizada"
  - "isPositionValid valida sphere region (não window region) — caso contrário, a posição padrão correta seria rejeitada pelo próprio validador porque a janela transparente vaza 52px sobre a taskbar"
  - "Manter SIZE=128 do Orb.tsx inalterado — só a janela cresce, o glass orb continua o mesmo diâmetro"

metrics:
  duration_seconds: ~180
  completed_date: 2026-04-10
  tasks: 2
  files_modified: 6
  commits: 2
---

# Quick Task 260410-td5: Ajustes UI/UX do Orb — Janela 240x240, Drop-Shadow, Reposicionamento Summary

## One-Liner

Janela Electron aumentada de 160x160 para 240x240, esfera (128px) mantida centralizada, ganha drop-shadow colorido externo por estado, e é reposicionada para ficar "colada" à taskbar — tudo resolvendo uma única causa raiz: janela apertada demais.

## Causa Raiz Identificada

Os 3 problemas reportados (bola plana sem profundidade, janela alta demais da taskbar, corte retangular em efeitos externos) tinham **a mesma origem**: a janela Electron era de 160x160 envolvendo uma esfera de 128px — apenas 16px de margem em cada lado, insuficiente para qualquer efeito visual externo (drop-shadow, glow, ripples expandindo) e empurrando a esfera visivelmente para cima da taskbar.

Solução cirúrgica única: aumentar a janela para 240x240 (56px de margem transparente em cada lado), adicionar drop-shadow externo na esfera, e compensar o padding transparente no cálculo de posição para a esfera visível ficar efetivamente colada à taskbar.

## O Que Foi Feito

### Task 1 — Janela 240x240 + reposicionamento (commit `daa60c8`)

**apps/desktop/src/main/index.ts**
- `width: 160, height: 160` → `width: 240, height: 240`
- Comentário D-03 adicionado explicando a matemática 128 esfera + 56 respiro por lado
- Todas as outras opções do BrowserWindow preservadas (transparent, backgroundColor, hasShadow, frame, alwaysOnTop, skipTaskbar, contextIsolation, sandbox, webSecurity, preload, etc)

**apps/desktop/src/main/position.ts** — refatoração completa das constantes e funções:
- `WINDOW_SIZE = 128` → `WINDOW_SIZE = 240` (agora bate com o BrowserWindow real — antes estava inconsistente)
- Adicionadas: `VISIBLE_ORB_SIZE = 128`, `SPHERE_MARGIN = 4`
- Removida: `OFFSET = 16` (substituída por SPHERE_MARGIN na nova matemática)
- `calculateDefaultPosition` reescrita para posicionar a janela tal que a esfera visível fique `SPHERE_MARGIN` pixels do canto inferior direito da workArea, compensando o `transparentPadding = (240-128)/2 = 56`
- `isPositionValid` reescrita para validar a região da ESFERA visível (não a janela inteira) contra a workArea — do contrário a posição padrão seria rejeitada pelo próprio validador

**apps/desktop/src/main/__tests__/window-config.test.ts** — assertions atualizadas:
- `'D-03: Window size 160x160...'` → `'D-03: Window size 240x240 (transparent orb window with shadow breathing room)'`
- `expect('width: 160')` → `expect('width: 240')`, idem height
- Todas as outras assertions (frame, transparent, alwaysOnTop, skipTaskbar, hasShadow, contextIsolation, sandbox, webSecurity, etc) preservadas inalteradas

**apps/desktop/src/main/__tests__/position.test.ts** — assertions atualizadas para a nova matemática:
- Default bottom-right em workArea 1920x1080: `(1776, 936)` → `(1732, 892)`
- Cálculo: `1920 - 240 + 56 - 4 = 1732` (eixo X), `1080 - 240 + 56 - 4 = 892` (eixo Y)
- Casos de rejeição de posição salva ajustados para refletir validação baseada na região visível:
  - `x: -10` não é mais inválido (sphereX = 46, dentro) → trocado para `x: -100` (sphereX = -44, fora)
  - `y: -10` não é mais inválido (sphereY = 46, dentro) → trocado para `y: -100` (sphereY = -44, fora)
  - Casos de overflow (x: 1850, y: 1000) continuam inválidos com a nova matemática

### Task 2 — Drop-shadow externo colorido + .app-container 240x240 (commit `cd27a4e`)

**apps/desktop/src/renderer/src/App.css**
- `.app-container { width: 160px; height: 160px }` → `240px × 240px`
- Comentário atualizado explicando o novo tamanho e o papel do respiro
- Demais seletores (`.chat-button`, `.chat-input`, keyframes) intactos

**apps/desktop/src/renderer/components/Orb/Orb.tsx**
- Novo map `stateGlow: Record<OrbState, string>` paralelo ao `rippleColor` existente, com 4 entradas:
  - `idle`: `rgba(43,168,212,0.55)` (cyan-teal, bate com `#2BA8D4`)
  - `listening`: `rgba(245,158,11,0.55)` (amber, `#F59E0B`)
  - `processing`: `rgba(139,92,246,0.55)` (violet, `#8B5CF6`)
  - `responding`: `rgba(59,130,246,0.55)` (blue, `#3B82F6`)
- Div raiz (o wrapper com `width: SIZE`) ganha inline style:
  ```ts
  filter: `drop-shadow(0 0 24px ${stateGlow[state]}) drop-shadow(0 4px 12px rgba(0,0,0,0.35))`,
  transition: 'filter 0.4s ease-in-out',
  ```
  Dois drop-shadows empilhados: o primeiro é o glow colorido (sensação 3D/luz), o segundo é a sombra cinza inferior (peso/ancoragem visual).
- `SIZE = 128` não muda. Gradientes, highlights, rim light, ripples, classes de animação — tudo intacto.

## Matemática do Novo Posicionamento

```
workArea = { x: 0, y: 0, width: 1920, height: 1080 }   (exemplo)

WINDOW_SIZE       = 240   (janela Electron total)
VISIBLE_ORB_SIZE  = 128   (diâmetro do glass orb renderizado)
transparentPadding = (240 - 128) / 2 = 56   (56px transparentes em cada lado)
SPHERE_MARGIN     = 4     (margem da esfera visível até a borda da workArea)

Posição default (canto inferior direito):
  x = workArea.right - WINDOW_SIZE + transparentPadding - SPHERE_MARGIN
    = 1920 - 240 + 56 - 4 = 1732
  y = workArea.bottom - WINDOW_SIZE + transparentPadding - SPHERE_MARGIN
    = 1080 - 240 + 56 - 4 = 892

Isso coloca:
  - Janela (240x240): de (1732, 892) até (1972, 1132)
  - Esfera visível (128x128): de (1788, 948) até (1916, 1076)
  - Distância da esfera até workArea.right (1920):  1920 - 1916 = 4px ✓
  - Distância da esfera até workArea.bottom (1080): 1080 - 1076 = 4px ✓

Os 52px à direita de 1920 e 52px abaixo de 1080 da janela vazam sobre a
borda direita / taskbar, mas como são transparentes + click-through, não
há impacto visual nem de interação.
```

## Verificação

### Automatizada

- `pnpm --filter desktop test -- window-config`: **PASS** (14 assertions) — 100% das assertions do window-config passam com as novas dimensões
- `pnpm --filter desktop test -- position`: **PASS** (10 assertions) — toda a suíte de position passa com a nova matemática
- `tsc --noEmit` nos arquivos modificados (index.ts, position.ts, Orb.tsx, App.css, position.test.ts, window-config.test.ts): **sem erros**
- Grep smoke check:
  - `grep -n "width: 240"` em `index.ts`: 1 match ✓
  - `grep -n "WINDOW_SIZE = 240"` em `position.ts`: 1 match ✓
  - `grep -n "VISIBLE_ORB_SIZE"` em `position.ts`: múltiplas ocorrências ✓
  - `grep -c "240px"` em `App.css`: 2 ✓
  - `grep -c "drop-shadow"` em `Orb.tsx`: 4 ✓
  - `grep -c "stateGlow"` em `Orb.tsx`: 2 ✓
- Click-through e transparência preservados: `transparent: true`, `backgroundColor: '#00000000'`, `hasShadow: false`, `setIgnoreMouseEvents(true, { forward: true })` inalterados em `index.ts`

### Manual (sugerida, não executada pelo executor)

Para validar visualmente, rodar `pnpm --filter desktop dev` e observar:
1. Esfera colada perto da taskbar no canto inferior direito (distância ~4px)
2. Glow colorido externo visível em volta da esfera, **sem corte retangular**
3. Glow muda de cor ao trocar de estado (idle cyan → listening amber → processing violet → responding blue)
4. Click-through continua funcionando — clicar na área transparente em volta da esfera (dentro dos 240x240 da janela mas fora dos 128px da esfera) não ativa a janela nem captura o clique

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atualização de `position.test.ts` que não estava listada nos arquivos modificados**

- **Found during:** Task 1, depois do GREEN phase de window-config.test.ts
- **Issue:** A refatoração de `position.ts` (nova matemática, nova constante `VISIBLE_ORB_SIZE`, nova lógica de `isPositionValid`) quebrou 6 testes em `position.test.ts` que esperavam os valores antigos (1776, 936) e testavam a validação da janela inteira em vez da esfera visível.
- **Fix:** Atualizado `position.test.ts` para:
  - `(1776, 936)` → `(1732, 892)` em todos os asserts de posição default
  - Teste "should reject position with x less than workArea.x": `x: -10` → `x: -100` (porque com a nova validação baseada em sphereX=posX+56, `-10+56=46` agora é válido)
  - Teste "should reject position with y less than workArea.y": `y: -10` → `y: -100` pelo mesmo motivo
  - Comentários explicativos adicionados ao describe de `isPositionValid` documentando a nova lógica
- **Files modified:** `apps/desktop/src/main/__tests__/position.test.ts`
- **Commit:** `daa60c8` (parte do commit de Task 1, conforme instrução do plano "Se houver outros testes quebrando em apps/desktop/src/main/ por causa de WINDOW_SIZE = 128, atualizar as assertions para 240 / nova lógica")
- **Justificativa:** O plano explicitamente previa esse caso. O arquivo foi adicionado ao commit de Task 1 porque é consequência direta da refatoração de `position.ts` no mesmo task.

Nenhuma outra deviação. Zero arquiteturais, zero bugs de lógica encontrados, zero libs novas, zero auth gates.

## Débito Técnico Pré-Existente (Não Corrigido — Fora de Escopo)

Estas falhas existiam **antes** desta task e estão explicitamente documentadas no bloco `<avoid>` do PLAN como fora de escopo:

1. **`apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx`** — 2 testes falham:
   - "renders with idle animation and cyan color (ORB-01)" — espera `#06B6D4` no style, mas o Orb real usa gradient radial com `#2BA8D4`
   - "applies 300ms transition for smooth state changes (D-04)" — procura por `[style*="width: 96px"]` mas `SIZE = 128` (não 96)
   - Esse arquivo de teste nunca foi atualizado quando o Orb foi redesenhado para o visual glass sphere atual.

2. **`apps/desktop/src/main/__tests__/tray.test.ts`** — 1 teste falha:
   - "DESK-04: Menu structure > has exactly 3 menu items" — esperando 3 itens, mas o menu tem outra contagem. Pré-existente, não tocado nesta task.

3. **`apps/desktop/src/main/__tests__/integration-chat.test.ts`** — falha no import:
   - `Cannot find module 'express' or its corresponding type declarations` — dep ausente no workspace do desktop, pré-existente.

4. **`apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx`** — 2 erros TS:
   - `WebkitAppRegion` não existe no tipo `Properties` do CSSType — pré-existente, nada a ver com orb.

5. **`apps/desktop/src/renderer/src/globals.css`** bug `* { margin: 10; }` — sem unidade, pré-existente, explicitamente listado no `<avoid>` do PLAN como fora de escopo.

Todos esses débitos devem ser resolvidos em task própria focada em limpeza de testes/tipos do desktop.

## Known Stubs

Nenhum. Toda a funcionalidade está cabeada ao estado real do Orb (`useOrbContext`), o drop-shadow usa o `state` vivo, e a matemática de posicionamento usa dados reais de `screen.getDisplayNearestPoint`. Nenhum placeholder, nenhum mock, nenhum dado fake.

## Threat Flags

Nenhum. Mudanças são puramente visuais/UX (dimensão de janela, CSS, cálculo de posição em tela). Não introduzem nova superfície de ataque, não tocam em rede, auth, persistência de segredos, filesystem, ou limites de confiança. `contextIsolation`, `sandbox`, `webSecurity`, `allowRunningInsecureContent` todos preservados inalterados em `index.ts`.

## Commits

| Task | Commit | Mensagem |
|------|--------|----------|
| 1 | `daa60c8` | 💄 style(desktop): janela orb 240x240 com esfera colada à taskbar |
| 2 | `cd27a4e` | 💄 style(orb): drop-shadow externo colorido por estado (glow 3D) |

## Self-Check: PASSED

- File `apps/desktop/src/main/index.ts`: FOUND (`width: 240` present)
- File `apps/desktop/src/main/position.ts`: FOUND (`WINDOW_SIZE = 240`, `VISIBLE_ORB_SIZE`, refactored `calculateDefaultPosition` and `isPositionValid`)
- File `apps/desktop/src/main/__tests__/window-config.test.ts`: FOUND (assertions updated to `width: 240` / `height: 240`)
- File `apps/desktop/src/main/__tests__/position.test.ts`: FOUND (assertions updated to `1732`, `892`, and sphere-region validation cases)
- File `apps/desktop/src/renderer/src/App.css`: FOUND (`.app-container` 240x240)
- File `apps/desktop/src/renderer/components/Orb/Orb.tsx`: FOUND (`stateGlow` map + `filter: drop-shadow` on root div)
- Commit `daa60c8`: FOUND in git log
- Commit `cd27a4e`: FOUND in git log
- Window-config + position tests: 207 passed, 0 failures in tests I touched
- Click-through and transparency preserved: `transparent: true`, `backgroundColor: '#00000000'`, `hasShadow: false`, `setIgnoreMouseEvents(true, { forward: true })` verified in place
- Security settings preserved: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false` — none touched
- `SIZE = 128` in Orb.tsx: unchanged
- Zero new dependencies added to `package.json`
