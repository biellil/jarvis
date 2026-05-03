# Requirements: JARVIS v2.1 Settings UX

**Milestone:** v2.1 Settings UX
**Goal:** Settings window com identidade visual de produto + UX feedback-rich para troca de modelo Whisper.
**Last updated:** 2026-05-03

---

## v2.1 Requirements

### Settings UI Redesign

- [ ] **REDESIGN-01**: Settings com layout sidebar + content panel
  - Sidebar esquerda lista as 4 seções (PTT, Always-Listening, TTS, Whisper)
  - Selecionar item da sidebar troca o conteúdo no painel direito
  - Não mais form vertical com todas as seções empilhadas
  - Estado de seleção visualmente claro (highlight, ícone ativo)

- [ ] **REDESIGN-02**: Design tokens e primitivos visuais consistentes
  - Tokens: cores, espaçamentos, tipografia, raios de borda definidos centralmente
  - Tema dark com identidade visual própria (não cor default Electron/Tailwind)
  - Hierarquia tipográfica clara (h1/h2/body/caption)

- [ ] **REDESIGN-03**: Controles redesenhados com look polido
  - Inputs (text, número), selects/dropdowns, slider, hotkey recorder, botões — todos com aparência custom (não default HTML)
  - Estados hover/focus/disabled visualmente distintos
  - Botões Save/Cancel com hierarquia clara (primário/secundário)

- [ ] **REDESIGN-04**: Funcionalidade existente preservada sem regressão
  - Save, cancel, hotkey recorder, VAD slider, TTS provider switch, Whisper model select — todos funcionam idênticos ao v2.0
  - Suite de testes Vitest do settings continua verde

### Whisper Model UX

- [ ] **WHISPER-01**: Troca de modelo Whisper dispara download imediato
  - Ao selecionar um novo modelo no Settings, o download começa imediatamente (não aguarda restart)
  - Se modelo já está em cache, aplicação é instantânea sem download

- [ ] **WHISPER-02**: Feedback visual de progresso de download
  - Indicador visível de progresso (progress bar, percentual ou bola pulsante) enquanto o modelo baixa
  - Estado de erro de download é exibido (rede, espaço em disco)
  - Após conclusão, modelo fica ativo sem precisar restart

---

## Future Requirements

- Settings: adicionar seção de voice mode (trocar modo direto no Settings além do tray)
- PTT: botão visual desabilitado/greyed quando modo ≠ ptt-only

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Light theme / theme switching | v2.1 mantém só dark — fica para milestone futura se demanda surgir |
| Animações elaboradas | Foco em layout e identidade — micro-interações ficam para polish posterior |
| Settings remoto (sync entre máquinas) | JARVIS é single-user local — fora do escopo da milestone |
| Localização (i18n) | Mantém pt-BR/en hardcoded como hoje — i18n é projeto próprio |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| REDESIGN-01 | Phase 49 | Pending |
| REDESIGN-02 | Phase 48 | Pending |
| REDESIGN-03 | Phase 48 | Pending |
| REDESIGN-04 | Phase 49 | Pending |
| WHISPER-01 | Phase 50 | Pending |
| WHISPER-02 | Phase 50 | Pending |
