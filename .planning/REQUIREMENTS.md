# Requirements: JARVIS v1.7

**Defined:** 2026-04-15
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v1 Requirements

### Cross-Platform — macOS

- [ ] **PLAT-01**: Usuário no macOS vê o orb na tela — janela frameless transparente posicionada corretamente (sem barra de título, sem frame)
- [ ] **PLAT-02**: Usuário no macOS diz "Hey JARVIS" e o wake word detecta, disparando o pipeline de voz completo
- [ ] **PLAT-03**: Usuário no macOS vê o tray icon com menu (Settings, Quit)

### Cross-Platform — Linux

- [ ] **PLAT-04**: Usuário no Linux (X11) vê o orb na tela — janela frameless transparente posicionada corretamente
- [ ] **PLAT-05**: Usuário no Linux diz "Hey JARVIS" e o wake word detecta, disparando o pipeline de voz completo
- [ ] **PLAT-06**: Usuário no Linux vê o tray icon com menu (Settings, Quit)

### Settings UI

- [ ] **SET-01**: Usuário abre a tela de Settings via item no tray menu — sem editar .env manualmente
- [ ] **SET-02**: Usuário configura o PTT hotkey na UI e a mudança persiste ao reiniciar
- [ ] **SET-03**: Usuário seleciona TTS provider (Murf.ai ou ElevenLabs) e insere a API key na UI
- [ ] **SET-04**: Usuário seleciona o modelo Whisper manualmente (tiny / base / large) sobrepondo a detecção automática por VRAM
- [ ] **SET-05**: Todas as configurações de Settings persistem entre sessões via electron-store

## v2 Requirements

### Cross-Platform

- **PLAT-07**: PTT hotkey (Ctrl+Space) funciona globalmente no macOS e Linux
- **PLAT-08**: Wayland support no Linux (atualmente X11 apenas)

### Settings UI

- **SET-06**: Usuário configura URL do LM Studio na UI
- **SET-07**: Usuário seleciona o LLM provider/modelo na UI
- **SET-08**: Usuário configura wake word sensitivity na UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Speech bubble redesign | Só aparece como fallback quando TTS falha — não é prioridade visual |
| History/context panel | Mantém comportamento atual — sem painel de histórico |
| Streaming TTS | Adiado para v1.8+ |
| Offline TTS local (Kokoro) | Adiado para v1.8+ |
| Performance optimization (<500ms STT) | Adiado para v1.8+ |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 33 | Pending |
| PLAT-02 | Phase 33 | Pending |
| PLAT-03 | Phase 33 | Pending |
| PLAT-04 | Phase 33 | Pending |
| PLAT-05 | Phase 33 | Pending |
| PLAT-06 | Phase 33 | Pending |
| SET-01 | Phase 34 | Pending |
| SET-02 | Phase 34 | Pending |
| SET-03 | Phase 34 | Pending |
| SET-04 | Phase 34 | Pending |
| SET-05 | Phase 34 | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 — traceability filled after v1.7 roadmap creation*
