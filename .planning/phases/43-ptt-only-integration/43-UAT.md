---
status: complete
phase: 43-ptt-only-integration
source: [43-02-SUMMARY.md, 43-03-SUMMARY.md, 43-04-SUMMARY.md]
started: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. PTT-only aparece no tray e é selecionável
expected: Abrir a bandeja do sistema → submenu de modos de voz → clicar em "PTT-only". A opção NÃO deve mais lançar erro — modo PTT-only é selecionável e o rádio fica marcado. Console mostra: [VoiceModeManager] Mode changed: wake-word → ptt-only
result: pass

### 2. PTT-only silencia wake word
expected: Com PTT-only ativo, falar "hey jarvis" (wake word) não deve disparar nada — o engine está suspenso. Microfone NÃO acende sozinho. Console não mostra detecção de wake word.
result: pass

### 3. Hotkey PTT funciona em PTT-only (toggle)
expected: Com PTT-only ativo, pressionar a hotkey PTT (configurada em Settings) ativa o microfone (toggle on). Pressionar de novo desativa (toggle off). Comportamento igual ao PTT-only de fases anteriores, sem precisar reconfigurar a tecla.
result: pass

### 4. Voltar ao Wake-word reativa detecção
expected: Após usar PTT-only, clicar em "Wake Word" no tray → console mostra [VoiceModeManager] Mode changed: ptt-only → wake-word → detector de wake word volta a funcionar (falar "hey jarvis" dispara resposta normalmente).
result: pass

### 5. Troca rápida de modos (race condition)
expected: Clicar rapidamente em 3 modos diferentes no submenu (sem esperar entre cliques). O app deve permanecer responsivo, sem congelar ou mostrar toast de erro. O modo final deve corresponder ao último clique válido. Console pode mostrar "[VoiceModeManager] setMode(...) blocked — transition in progress" para as tentativas rejeitadas.
result: pass

### 6. Always-listening force-flush via hotkey PTT (VPTT-03)
expected: Com Always-Listening ativo e falando, pressionar a hotkey PTT deve forçar o envio imediato do utterance atual (sem esperar o silêncio do VAD). NOTA: renderer hook pendente — se IPC for fire-and-forget sem efeito visível, anotar como "VPTT-03 main-side OK, renderer hook pendente".
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
