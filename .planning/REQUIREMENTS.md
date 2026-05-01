# Requirements: JARVIS v2.0 Polish & Stability

**Milestone:** v2.0 Polish & Stability
**Goal:** Corrigir bugs no pipeline de voz e polir a experiência do usuário.
**Last updated:** 2026-04-30

---

## v2.0 Requirements

### Bug Fixes

- [x] **PATCH-01**: Hotkey PTT ignorada silenciosamente quando voice mode ≠ ptt-only
  - Atualmente `ptt-hotkey.ts` emite `ptt:action` para o renderer independente do modo ativo
  - Comportamento esperado: hotkey e botão sem efeito em `wake-word` e `always-listening`
  - Aceita: verificação do modo no main process antes de emitir para o renderer

- [ ] **PATCH-02**: Whisper model override do Settings aplicado no pipeline STT
  - Atualmente `main/index.ts` define `selectedModel` apenas via VRAM detection, ignorando `getWhisperModelOverride()`
  - Comportamento esperado: se override ≠ 'auto', usar o modelo selecionado pelo usuário
  - Inclui: fix de mapeamento de tipos (`WhisperModelOption` → `WhisperModel`)

### Wake Word Reliability

- [ ] **WW-01**: Investigar causa das falhas de ativação do "Hey JARVIS"
  - Usuário reporta que fala a wake word repetidamente sem ativação
  - Escopo: analisar threshold do modelo, configuração do openwakeword, pipeline de áudio, logs

- [ ] **WW-02**: Corrigir/melhorar confiabilidade com base nos achados da investigação
  - Pode envolver: ajuste de threshold, troca de modelo, ou fix de bug de configuração
  - Abordagem decidida após WW-01

### Settings UI Polish

- [ ] **POLISH-01**: Settings window com janela mais larga e layout melhor espaçado
  - Janela atual é estreita e parece default Electron
  - Comportamento esperado: janela mais larga, seções com espaçamento claro, hierarquia visual bem definida
  - Manter estrutura atual de seções (PTT, Always-Listening, TTS, Whisper) — apenas layout/tamanho

---

## Future Requirements

- Settings: adicionar seção de voice mode (trocar modo diretamente no Settings além do tray)
- PTT: botão visual desabilitado/greyed quando modo ≠ ptt-only (além de silenciar o hotkey)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Novas features arquiteturais | v2.0 é polish/bug fix — novas capabilities ficam para v2.1+ |
| Troca de stack de wake word | WW-01 investiga primeiro — só troca se for necessário |
| Redesign completo da Settings UI | Manter estrutura atual, apenas melhorar sizing/spacing |
| Cross-platform testing | Foco em funcionalidade correta primeiro |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PATCH-01 | Phase 45 | Complete |
| PATCH-02 | Phase 45 | Pending |
| WW-01 | Phase 46 | Pending |
| WW-02 | Phase 46 | Pending |
| POLISH-01 | Phase 47 | Pending |
