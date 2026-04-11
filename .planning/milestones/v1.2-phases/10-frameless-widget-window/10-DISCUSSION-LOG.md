# Phase 10: Frameless Widget Window - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 10-frameless-widget-window
**Areas discussed:** Posicionamento inicial, Tray icon, Position persistence, Window dragging

---

## Posicionamento inicial

### Offset da borda da tela — quanto espaço entre widget e cantos?

| Option | Description | Selected |
|--------|-------------|----------|
| 16px — Breathing room confortável | 2 × spacing-md, alinha com grid de 8pt. Orb não fica colado na borda. | ✓ |
| 8px — Máximo uso da tela | spacing-sm, widget mais próximo do canto. Útil em telas pequenas. | |
| 24px — Extra space | spacing-lg, mais distante. Pode parecer deslocado do canto. | |

**User's choice:** 16px — Breathing room confortável (Recomendado)

---

### Múltiplos monitores — onde posicionar o widget?

| Option | Description | Selected |
|--------|-------------|----------|
| Primary display sempre | screen.getPrimaryDisplay() — previsível, simples. Widget sempre aparece no monitor principal. | |
| Monitor onde o cursor está | screen.getCursorScreenPoint() — mais dinâmico, mas pode confundir se cursor em outro monitor ao abrir. | ✓ |
| Lembrar último monitor usado | Salvar display ID junto com posição. Mais complexo — display pode não existir mais. | |

**User's choice:** Monitor onde o cursor está

---

### Tamanho inicial da janela — largura e altura?

| Option | Description | Selected |
|--------|-------------|----------|
| 128x128 — Orb (96px) + padding (16px cada lado) | Compacto, só mostra orb. Chat input aparece depois (Phase 12). | ✓ |
| 200x200 — Espaço extra para futura expansão | Mais espaço desde o início, mas widget ocupa mais tela sem mostrar nada ainda. | |
| Você decide | Claude escolhe baseado no UI-SPEC e orb diameter (96px). | |

**User's choice:** 128x128 — Orb (96px) + padding (16px cada lado) (Recomendado)

---

### Coordenadas — arredondar para pixels inteiros?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — Math.round() nas coordenadas | Evita sub-pixel rendering blur. Janela sempre em pixels inteiros. | ✓ |
| Não — Usar coordenadas exatas do cálculo | workArea pode retornar decimais com DPI scaling. Electron lida com isso. | |

**User's choice:** Sim — Math.round() nas coordenadas (Recomendado)

---

## Tray icon

### Ícone do tray — qual imagem usar?

| Option | Description | Selected |
|--------|-------------|----------|
| Criar novo ícone 16x16 + 32x32 PNG | Tray requer PNG pequeno. Criar versão simplificada do orb (círculo azul com glow sutil). Padrão para tray icons. | ✓ |
| Reusar logo existente do projeto | Se houver logo em assets/, adaptá-lo. Pode não ter versão 16x16 otimizada. | |
| Você decide | Claude cria ícone baseado no Aether Orb aesthetic. | |

**User's choice:** Criar novo ícone 16x16 + 32x32 PNG (Recomendado)

---

### Comportamento de click no tray icon?

| Option | Description | Selected |
|--------|-------------|----------|
| Single-click mostra menu | Click esquerdo abre menu Show/Hide/Quit. Padrão Windows/Linux. | ✓ |
| Single-click toggle show/hide, right-click menu | Click esquerdo alterna visibilidade, direito abre menu. Mais rápido mas menos descobrível. | |
| Double-click mostra janela, single-click menu | Double-click restaura janela, single abre menu. Menos comum. | |

**User's choice:** Single-click mostra menu (Recomendado)

---

### Tooltip no hover do tray icon?

| Option | Description | Selected |
|--------|-------------|----------|
| "JARVIS" — Nome do app apenas | Simples, identifica o app. Padrão para tray icons. | ✓ |
| "JARVIS (Running)" — Nome + status | Mostra que o app está ativo. Mais informação mas redundante (tray só aparece se running). | |
| Sem tooltip | Ícone fala por si. Menos user-friendly. | |

**User's choice:** "JARVIS" — Nome do app apenas (Recomendado)

---

### Menu items no tray — apenas Show/Hide/Quit ou adicionar outros?

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas Show, Hide, Quit | DESK-04 define esses 3. Simples, focado. Outras opções vêm em phases futuras. | ✓ |
| Adicionar About (versão do app) | Quarto item mostrando versão. Útil para debug mas adiciona complexidade. | |
| Adicionar separator entre Hide e Quit | Separador visual antes do Quit (ação destrutiva). UX mais claro. | |

**User's choice:** Apenas Show, Hide, Quit (Recomendado)

---

## Position persistence

### O que salvar no electron-store — apenas posição ou também tamanho?

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas x, y | Tamanho é fixo (128x128 em Phase 10). Só salvar posição simplifica. | ✓ |
| x, y, width, height | Salvar tudo. Preparado para futuro resize, mas tamanho é fixo agora. | |
| x, y, display ID | Incluir qual monitor. Útil para múltiplos monitores persistentes. | |

**User's choice:** Apenas x, y (Recomendado)

---

### Quando salvar a posição — durante drag ou ao fechar?

| Option | Description | Selected |
|--------|-------------|----------|
| Ao fechar app | Salvar em 'will-quit' ou 'before-quit'. Simples, sem overhead durante drag. | ✓ |
| Durante drag (throttled 500ms) | Salvar enquanto arrasta (debounced). Persiste mesmo se app crashar, mas mais writes. | |
| Ambos — throttled + on close | Melhor persistência, mais complexo. Garante salvar em crash e close normal. | |

**User's choice:** Ao fechar app (Recomendado)

---

### Validação ao restaurar — o que fazer se posição salva está fora da tela?

| Option | Description | Selected |
|--------|-------------|----------|
| Resetar para posição default (bottom-right) | Se saved position fora de bounds, calcular default novamente. Sempre visível. | ✓ |
| Tentar mover para dentro da tela mais próxima | Clamp x,y para ficar dentro do workArea. Mantém posição aproximada. | |
| Ignorar saved position e sempre usar default | Nunca restaurar. Sempre canto inferior direito. Mais simples mas perde preferência. | |

**User's choice:** Resetar para posição default (bottom-right) (Recomendado)

---

### Chave no electron-store para salvar posição?

| Option | Description | Selected |
|--------|-------------|----------|
| window.position | Simples, descritivo. store.get('window.position') retorna { x, y }. | ✓ |
| windowBounds | Nome mais genérico. Preparado para width/height futuro. | |
| Você decide | Claude escolhe naming convention baseado em padrões Electron. | |

**User's choice:** window.position (Recomendado)

---

## Window dragging

### Área draggable — onde o usuário pode clicar para arrastar?

| Option | Description | Selected |
|--------|-------------|----------|
| Orb inteiro é draggable | -webkit-app-region: drag no orb. Intuitivo — arrastar a "coisa" move a janela. | ✓ |
| Apenas topo da janela (header invisível) | Criar div header 32px no topo, draggable. Orb fica clickable. Menos intuitivo (sem visual cue). | |
| Janela toda draggable, exceto botões/inputs | Background draggable, elementos interativos com -webkit-app-region: no-drag. Flexível mas pode conflitar com clicks. | |

**User's choice:** Orb inteiro é draggable (Recomendado)

---

### Cursor feedback ao hover na área draggable?

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor: grab / grabbing | cursor: grab no hover, grabbing durante drag. Indica que é dragável. | ✓ |
| Cursor: move | cursor: move (setas 4 direções). Mais explícito mas pode parecer deslocado em orb. | |
| Sem mudança de cursor | cursor: default. Menos feedback visual, mas orb é intuitivo por si. | |

**User's choice:** Cursor: grab / grabbing (Recomendado)

---

### Click no orb — comportamento quando não está arrastando?

| Option | Description | Selected |
|--------|-------------|----------|
| Nenhum — orb é só visual/draggable em Phase 10 | Phase 10 é janela + tray. Orb interativo (hotkey, input) vem depois (Phases 11-12). | ✓ |
| Click mostra DevTools | Útil para debug em dev mode, mas Phase 10 é scaffold UI apenas. | |
| Click mostra tooltip ou placeholder message | Feedback que orb existe mas não faz nada ainda. Pode confundir usuário. | |

**User's choice:** Nenhum — orb é só visual/draggable em Phase 10 (Recomendado)

---

### Distinguir drag de click — threshold de movimento mínimo?

| Option | Description | Selected |
|--------|-------------|----------|
| Electron lida automaticamente | -webkit-app-region: drag usa threshold interno do OS. Sem código JS adicional. | ✓ |
| 5px threshold manual | Implementar mousedown/mousemove com distância mínima. Mais controle mas overhead. | |
| Você decide | Claude escolhe abordagem mais simples/robusta. | |

**User's choice:** Electron lida automaticamente (Recomendado)

---

## Claude's Discretion

Áreas onde o usuário disse "você decide" ou deixou para Claude:
- Flash branco prevention implementation (show: false + ready-to-show + backgroundColor)
- Electron-store initialization e error handling
- PNG icon generation detalhada (círculo azul #06B6D4, export 16x16 e 32x32)
- Always-on-top e skipTaskbar flag specifics

## Deferred Ideas

**Auto-hide ao perder foco:** Comportamento para Phase 12 junto com hotkey activation
**Animação de entrada:** Visual polish, Phase 11 pode cobrir com Orb animation
**Tray icon dinâmico:** Mudar ícone baseado em estado (idle/active) — Phase 11 estados do orb
**Salvar display ID:** Útil para multi-monitor, mas D-02 usa cursor position que já adapta
**Resize manual:** Tamanho fixo 128x128 em v1.2, expansão futura
**Context menu no orb:** Redundante com tray menu em Phase 10
