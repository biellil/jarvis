# Requirements: JARVIS v3.5 — Emotional Voice Cloning TTS

**Defined:** 2026-05-28
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — como um parceiro que nunca esquece.
**Scope:** apps/desktop-py only

## v3.5 Requirements

### Chatterbox Core

- [ ] **CHTB-01**: Usuário pode selecionar Chatterbox como provider TTS (lazy-init, GPU CUDA→CPU auto-detect, graceful ImportError)
- [ ] **CHTB-02**: Instalação do Chatterbox não quebra faster-whisper/ctranslate2 (pyproject.toml com torch pinned + chatterbox instalado via `--no-deps`)
- [ ] **CHTB-03**: JARVIS pré-aquece Chatterbox no `init_tts()` para eliminar atraso de 5-10s na primeira fala quando provider = chatterbox
- [ ] **CHTB-04**: Qualquer erro Chatterbox (timeout / CUDA OOM / arquivo inválido / ImportError) faz fallback automático para Kokoro sem travar o TTS

### Voice Cloning

- [x] **VCLONE-01**: Usuário define caminho de arquivo de referência .wav/.mp3 no `/config` menu; caminho persiste em `~/.jarvis/config.json`
- [x] **VCLONE-02**: Chatterbox usa arquivo de referência para zero-shot voice cloning em toda fala (via `audio_prompt_path`)
- [x] **VCLONE-03**: Startup valida arquivo de referência (existe, duração ≥5s, extensão .wav/.mp3) e emite aviso não-bloqueante se inválido; TTS cai para Kokoro se inválido

### Emotion Tags

- [x] **EMOTE-01**: Tags `[angry]` `[sad]` `[excited]` `[soft]` `[whispering]` `[breathy]` `[emphasis]` `[embarrassed]` no texto são mapeadas para parâmetros Chatterbox (`exaggeration` + `cfg_weight`) antes da inferência
- [x] **EMOTE-02**: Tags não reconhecidas são removidas do texto antes da inferência (nunca lidas em voz alta pelo TTS)

### Config UX

- [ ] **CFGUI-01**: `/config` menu exibe "chatterbox" como opção de provider TTS (ao lado de kokoro / elevenlabs / murf)
- [ ] **CFGUI-02**: Ao selecionar chatterbox no `/config`, usuário pode digitar o caminho do arquivo de referência na mesma sessão de menu

## Future Requirements

### Emotion Control Polish

- **EMOTE-03**: Slider de intensidade emocional no `/config` (exaggeration 0.5–2.0) — tornar configurável sem editar config.json
- **EMOTE-04**: Inferência automática de emoção a partir do texto via LLM ("Estou com raiva!" → `[angry]`) — elimina necessidade de tags manuais

### Voice Quality

- **VCLONE-04**: Feedback de progresso de download do modelo Chatterbox (~800MB) na primeira execução
- **VCLONE-05**: Cacheamento do speaker embedding entre sessões — evita re-extração a cada `speak()`

## Out of Scope

| Feature | Reason |
|---------|--------|
| Interface gráfica de file picker | Terminal-only — usuário digita caminho no /config |
| Voice cloning por gravação na hora | Escopo restrito a arquivo de referência pré-existente |
| Treinamento/fine-tuning do modelo | Usa zero-shot cloning — sem treinamento |
| Múltiplos perfis de voz | Um arquivo de referência por vez (v3.5) |
| TTS em tempo real token-a-token | Chatterbox gera áudio completo antes de reproduzir |
| Integração TypeScript/Electron | Scope: apps/desktop-py apenas |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHTB-01 | Phase 86 | Pending |
| CHTB-02 | Phase 86 | Pending |
| CHTB-03 | Phase 86 | Pending |
| CHTB-04 | Phase 86 | Pending |
| VCLONE-01 | Phase 87 | Complete |
| VCLONE-02 | Phase 87 | Complete |
| VCLONE-03 | Phase 87 | Complete |
| EMOTE-01 | Phase 88 | Complete |
| EMOTE-02 | Phase 88 | Complete |
| CFGUI-01 | Phase 88 | Pending |
| CFGUI-02 | Phase 88 | Pending |

**Coverage:**
- v3.5 requirements: 11 total
- Mapped to phases: 11 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-28*
*Last updated: 2026-05-28 — traceability mapped to Phases 86-88*
