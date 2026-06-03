# Deferred Items — Phase 90

Itens descobertos durante execução que estão FORA DE ESCOPO dos plans atuais.

## Plan 90-01

### Pre-existing test failure: test_ptt_mode_hotkey
- **Descoberto em:** Task 2 (verificação WR-05)
- **Sintoma:** `ImportError: cannot import name 'HotKey' from 'pynput.keyboard' (unknown location)` → `_queue.Empty`
- **Causa:** Hot-import lazy de `pynput.keyboard.HotKey` em `voice_modes.py:217`. pynput instalado nesta venv não expõe `HotKey` (versão/binding errado).
- **Reproduz no HEAD original:** sim (verificado via git stash antes do WR-05) — falha PRÉ-EXISTENTE, não introduzida por 90-01.
- **Decisão:** deferir para investigação posterior (provável fix: garantir pynput >= 1.7.6 ou adaptar import).
