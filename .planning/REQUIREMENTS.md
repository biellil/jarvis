# Requirements: JARVIS v1.9 Voice Capture Modes

**Defined:** 2026-04-25
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v1.9 Requirements

### Voice Mode State Machine (VMODE)

- [ ] **VMODE-01**: State machine garante apenas 1 modo ativo por vez (Wake Word, Always-Listening, ou PTT-only) — transições bloqueadas durante captura de áudio para evitar race conditions
- [ ] **VMODE-02**: Modo selecionado persiste entre restarts via electron-store; usuário existente do v1.8 retoma comportamento Wake Word como default
- [ ] **VMODE-03**: Mode change events são publicados via EventEmitter para módulos consumidores (voiceInputManager, tray, orb) reagirem de forma desacoplada

### Always-Listening Mode (VLISTEN)

- [ ] **VLISTEN-01**: Silero VAD detecta fim de fala (silence threshold 400-600ms padrão) e dispara o pipeline STT→LLM→TTS sem necessidade de wake word
- [ ] **VLISTEN-02**: LLM intent classifier local (Transformers.js + DistilBERT ONNX, ~50ms latência) filtra falsos positivos antes de enviar pro pipeline — TV, conversa de outros, ruído ambiente são descartados
- [ ] **VLISTEN-03**: Ring buffer fixo (`ringbufferjs` 2.0) mantém pre-roll de 500ms para não cortar começo de frase quando VAD dispara — descartado imediatamente após STT
- [ ] **VLISTEN-04**: VAD silence threshold é configurável em Settings UI com slider (300-800ms range) e preview em tempo real para usuário calibrar por ambiente

### Push-to-Talk Mode (VPTT)

- [x] **VPTT-01**: Em PTT-only mode, wake word é completamente desabilitado e a hotkey global é o único trigger — segura→fala→solta→envia
- [x] **VPTT-02**: PTT mode reusa a hotkey configurada em v1.7 Settings (não cria hotkey nova) — usuário não precisa reconfigurar
- [x] **VPTT-03**: Em Always-Listening mode, pressionar a hotkey força envio imediato do utterance sem esperar VAD silence threshold (override manual)

### Mode Selection UX (VUI)

- [ ] **VUI-01**: Tray menu inclui submenu "Voice Mode" com 3 radio button items mutuamente exclusivos; clique aplica mudança em <1s sem necessidade de modal dialog
- [x] **VUI-02**: Orb mostra estado visual distinto por modo (cores/animação diferentes para Wake Word, Always-Listening, e PTT-only) — usuário identifica modo ativo sem abrir menu
- [x] **VUI-03**: Toast confirmation aparece ao trocar de modo + badge persistente no orb mostrando modo ativo (texto curto: "WW", "AL", "PTT")

### Hardening & Migration (VHARD)

- [ ] **VHARD-01**: macOS permission re-check via `systemPreferences.getMediaAccessStatus()` em cada mode switch + config migration v1.8→v1.9 com default `voiceMode='wake-word'` para usuários sem o campo, evitando quebrar comportamento existente

## Future Requirements

### Voice Mode Polish (v1.10+)

- **VPOLISH-01**: Hotkey conflict detection cross-platform com warning em Settings se PTT hotkey colide com system shortcut
- **VPOLISH-02**: Privacy disclaimer first-run para Always-Listening mode ("Microfone ativo, processamento 100% local")
- **VPOLISH-03**: Graceful degrade UX se intent classifier falha >5% — toast warning + opção de auto-disable Always-Listening

### Advanced Voice Modes (v2.0+)

- **VADV-01**: Hybrid mode (wake word + always-listening) — atualmente fora de scope para preservar UX clarity
- **VADV-02**: Cross-device mode sync para usuários com múltiplos JARVIS

### Telemetry (v1.10+)

- **VTEL-01**: Opt-in audit log de utterances filtradas pelo intent classifier para refinar threshold
- **VTEL-02**: Memory/heap monitoring contínuo para detectar leaks em sessões longas

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-only intent classifier por padrão | Viola privacy-first do projeto — local Transformers.js é default |
| Persistência de áudio bruto | GDPR/CCPA risk — buffer descartado imediatamente após STT |
| Modal dialog para mode switch | UX intrusiva — tray menu radio buttons é o pattern correto |
| Hybrid mode (múltiplos modos simultâneos) | Quebra UX clarity — modos são mutuamente exclusivos por design |
| Hotkey configurável separada para PTT mode | Reuso da hotkey v1.7 evita config duplicada |
| Audio retention para debugging | Privacy risk maior que valor — usar audit log textual |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VMODE-01 | Phase 39 | Pending |
| VMODE-02 | Phase 39 | Pending |
| VMODE-03 | Phase 39 | Pending |
| VLISTEN-01 | Phase 40 | Pending |
| VLISTEN-02 | Phase 40 | Pending |
| VLISTEN-03 | Phase 40 | Pending |
| VLISTEN-04 | Phase 40 | Pending |
| VPTT-01 | Phase 43 | Complete |
| VPTT-02 | Phase 43 | Complete |
| VPTT-03 | Phase 43 | Complete |
| VUI-01 | Phase 41 | Pending |
| VUI-02 | Phase 42 | Complete |
| VUI-03 | Phase 42 | Complete |
| VHARD-01 | Phase 44 | Pending |

**Coverage:**
- v1.9 requirements: 14 total
- Mapped to phases: 14 ✓
- Unmapped: 0

---

*Phase mapping confirmado pelo roadmapper agent em 2026-04-25.*
