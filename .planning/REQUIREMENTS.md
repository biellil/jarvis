# JARVIS Requirements

**Current milestone:** v1.4 Voice & UX Polish
**Defined:** 2026-04-11

## Milestone v1.4 Requirements

**Goal:** Recuperar a ativação por wake word (CONV-05 perdido na migração Python→TS da v1.3) e continuar refinando o UX visual do orb desktop.

### Wake Word (WAKE)

**P1 — must ship:**

- [ ] **WAKE-01** — Usuário pode ativar o JARVIS dizendo "Hey JARVIS" sem pressionar tecla, com o orb transicionando automaticamente pra `listening` em até 500ms da detecção
- [ ] **WAKE-02** — Usuário vê feedback visual imediato (wake burst animation) no orb confirmando que a palavra foi detectada, antes da gravação começar
- [ ] **WAKE-03** — Usuário pode pausar/retomar o "sempre escutando" via item do tray menu, com a preferência persistida entre sessões
- [ ] **WAKE-04** — Usuário vê claramente a diferença visual entre orb `idle com wake word ativo` vs `idle com wake word pausado`
- [ ] **WAKE-05** — Após cada ciclo completo (wake → speech → response → TTS), o listening retoma automaticamente sem ação do usuário
- [ ] **WAKE-06** — Se o usuário não falar em 3-5s após o wake word, a gravação é abortada e o orb volta pro idle (via Silero VAD)
- [ ] **WAKE-07** — PTT (`Ctrl+Space`) continua funcionando e sempre ganha sobre wake word em caso de conflito (coordenação via `VoiceInputManager`)
- [ ] **WAKE-08** — Se o mic não estiver disponível (`getUserMedia` falha), JARVIS degrada graciosamente para modo PTT-only com indicação clara no tray
- [ ] **WAKE-09** — Nenhum áudio de wake word sai do dispositivo — detecção 100% offline (verificado por escolha de lib sem API key)

### Orb Polish (ORB-POL)

**P1 — must ship:**

- [ ] **ORB-POL-01** — Usuário com `prefers-reduced-motion` ativado vê animações reduzidas/simplificadas no orb (keyframes com fallback CSS)
- [ ] **ORB-POL-02** — Wake burst animation no orb entre 200-500ms após detecção (polish visual de WAKE-02)

**P2 — should ship (se budget de fase permitir):**

- [ ] **ORB-POL-03** — Orb tem idle breathing sutil (hue drift ±10° a cada 4-8s) no estado idle ativo
- [ ] **ORB-POL-04** — Transições entre estados do orb usam crossfade em vez de switch instantâneo
- [ ] **ORB-POL-05** — Usuário pode arrastar o orb pra reposicionar na tela, com posição persistida via electron-store

## Future Requirements (deferred)

### Voice (deferred para v1.5+)

- **VOICE-FUT-01** — TTS quality improvement via Kokoro Node.js port ou C++ bindings
- **VOICE-FUT-02** — STT 100% offline sem fallback cloud
- **VOICE-FUT-03** — VAD sempre-ligado complementar ao wake word
- **VOICE-FUT-04** — Custom/user-trained wake words via treinamento openwakeword
- **VOICE-FUT-05** — Mic device selection para usuários com múltiplos mics

### Desktop (deferred para v1.5+)

- **DESK-FUT-01** — Settings/preferences UI panel acessível via tray (escolha de modelo LLM, hotkeys, volume TTS, theme)
- **DESK-FUT-02** — History/context panel mostrando conversas recentes e memórias salvas
- **DESK-FUT-03** — Speech bubble redesign com markdown rendering e copy-to-clipboard
- **DESK-FUT-04** — Hover tooltip explicando estado atual do orb
- **DESK-FUT-05** — Click-to-toggle PTT direto no orb
- **DESK-FUT-06** — Specular highlight parallax seguindo o cursor

### Platform (deferred para v2.0+)

- **PLAT-FUT-01** — Mac/Linux cross-platform polish completo (Electron position/tray quirks)
- **PLAT-FUT-02** — Performance optimization: latência <100ms p95
- **PLAT-FUT-03** — Vision pipeline migração completa para TypeScript

## Out of Scope

| Feature | Reason |
|---------|--------|
| Interface web/UI | Uso é desktop widget Electron |
| IoT / Raspberry Pi | Milestone futuro (v2+) |
| Multi-usuário / autenticação | Uso pessoal — um único usuário |
| Fine-tuning de modelos | Usa modelos prontos via API |
| Cloud sync de histórico | Privacy-first: todo dado local |
| Geração de imagens | Ferramenta discreta, sem dependência do core |
| App mobile | Validar CLI + voz primeiro |
| WebSearch | LLMs locais têm conhecimento suficiente para uso pessoal |
| Porcupine / Picovoice | Requer AccessKey — viola privacy constraint e CLAUDE.md |
| Waveform / audio meter visual no orb | Baixo valor num círculo de 128px |
| Particle effects / WebGL shader orb | Diminishing return vs CSS gradient atual |

## Traceability (v1.4)

Preenchido pelo roadmapper após criação do ROADMAP.md.

| REQ-ID | Phase | Plan(s) |
|--------|-------|---------|
| WAKE-01..09 | — | — |
| ORB-POL-01..05 | — | — |

---

## Validated Requirements (Previous Milestones)

See `.planning/PROJECT.md` for the complete list of validated requirements from v1.0, v1.1, v1.2, and v1.3.

**Regression notice:** `CONV-05` (wake word "Hey JARVIS" via openwakeword) was validated in v1.0 but removed in v1.3 together with the Python backend. Being re-implemented in TypeScript in v1.4 as the WAKE-* requirements above.
