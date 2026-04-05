# Phase 2: Memory — Discussion Log

**Date:** 2026-04-04
**Command:** /gsd:discuss-phase 2

---

## Áreas selecionadas para discussão

- Injeção de contexto
- Fim de sessão

*(Trigger de embedding e Extração de perfil não foram selecionadas — Claude tem discrição nessas áreas)*

---

## Área: Injeção de Contexto

**Q: O que o MemoryManager injeta no prompt do JARVIS?**
- Opções: Só perfil do usuário / Perfil + top-K ChromaDB / Histórico recente + ChromaDB
- **Selecionado: Só perfil do usuário** — fatos do user_profile entram no system prompt fixo

**Q: Como o contexto recuperado aparece no chat?**
- Opções: No system prompt / Como mensagem separada / JARVIS decide
- **Selecionado: No system prompt** — augmenta o system prompt, invisible para o usuário

---

## Área: Fim de Sessão

**Q: O que encerra uma sessão do JARVIS?**
- Opções: Ctrl+C / Comando 'sair'/'exit'/'quit' / Timeout de inatividade
- **Selecionado: Ctrl+C** — SIGINT capturado no loop CLI

**Q: O que acontece se o processo crashar mid-session?**
- Opções: Perde a sessão / Salva incrementalmente
- **Selecionado: Salva incrementalmente** — cada mensagem persistida em tempo real no SQLite

---

*For human reference only. Not consumed by downstream agents.*
