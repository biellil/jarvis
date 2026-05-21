# Requirements — v3.3 Python PC Control & Voice Reliability

**Milestone:** v3.3  
**Last updated:** 2026-05-20  
**Status:** Active

---

## Config Persistence

- [x] **CONF-01** — Usuário pode alterar modelo Whisper, TTS provider ou voice mode via `/config` e as mudanças persistem em `~/.jarvis/config.json` imediatamente, sem restart
- [x] **CONF-02** — No próximo startup, JARVIS carrega a config salva anteriormente sem nenhum prompt ou perda de preferências
- [x] **CONF-03** — Instalação nova (sem `~/.jarvis/config.json`) funciona com defaults sem erro; campos adicionados em versões futuras têm default automático

---

## Always-Listening Fix

- [ ] **VAD-01** — Modo always-listening inicializa openwakeword com `wakeword_models=[]` (VAD-only), sem tentar carregar `alexa_v0.1.onnx` — elimina ONNXRuntimeError atual
- [ ] **VAD-02** — Ring buffer pre-roll de 500ms continua funcionando corretamente após o fix

---

## PC Control Python

- [ ] **PCTRL-01** — Usuário pode pedir ao JARVIS para abrir um aplicativo por nome (ex: "abre o Chrome") e o app abre no OS
- [ ] **PCTRL-02** — Usuário pode pedir para fechar um aplicativo por nome e o processo é encerrado
- [ ] **PCTRL-03** — Usuário pode pedir para abrir uma pasta ou arquivo no explorador nativo do OS (Windows Explorer, Finder, Nautilus)
- [ ] **PCTRL-04** — Usuário pode pedir para listar ou ler o conteúdo de um arquivo de texto dentro da whitelist (home, Documents, Downloads, Desktop)
- [ ] **PCTRL-05** — Ações destrutivas (deletar, mover, renomear arquivo) exigem confirmação explícita do usuário com timeout de 10s — sem resposta, ação é abortada
- [ ] **PCTRL-06** — Toda ação de PC Control é registrada em `~/.jarvis/audit.json` com timestamp, tipo e resultado
- [ ] **PCTRL-07** — Usuário pode controlar o volume do sistema por voz (aumentar, diminuir, mutar/desmutar)
- [ ] **PCTRL-08** — Usuário pode controlar reprodução de mídia por voz (play/pause, próxima faixa, faixa anterior)

---

## Whisper GPU Ampliado

- [ ] **WGPU-01** — STT auto-detecta o device disponível na ordem: NVIDIA CUDA → AMD ROCm → Apple Metal → CPU; usa o primeiro disponível
- [ ] **WGPU-02** — Modelo Whisper é selecionado automaticamente com base na VRAM disponível (tiny <2GB, base 2–4GB, large >8GB); override manual via config
- [ ] **WGPU-03** — Se o device detectado falhar ao inicializar, JARVIS faz fallback silencioso para CPU com log de aviso — nunca crasha por falta de GPU

---

## Custom Wake Word pt-BR

- [ ] **WAKE-01** — Script de treino (`train_wake_word.py`) roda no terminal do PC via `uv run` em venv isolado — sem Docker, sem poluir o venv principal
- [ ] **WAKE-02** — Script guia o usuário a gravar 20–50 amostras WAV de "ei jarvis" interativamente no terminal
- [ ] **WAKE-03** — Modelo treinado (.onnx) é instalado automaticamente em `~/.jarvis/models/wake_word_custom.onnx`
- [ ] **WAKE-04** — `voice_modes.py` detecta e usa o modelo customizado automaticamente se presente em `~/.jarvis/models/`
- [ ] **WAKE-05** — Threshold de detecção é calibrado automaticamente baseado na taxa de falsos positivos medida durante o treino

---

## Future Requirements (deferred)

- ROCm/Metal nativo no venv principal sem compile manual — depende de wheels oficiais (v3.4+)
- Controle de brilho do monitor — v3.4
- Screenshot + análise de tela no Python Desktop — v3.4
- Backlog 999.3 — Linux smoke test distribuição Electron (carry-over v3.1)
- Backlog 999.4 — Windows UAT físico distribuição Electron (carry-over v3.1)

---

## Out of Scope (v3.3)

| Feature | Razão |
|---------|-------|
| PC Control via WebSocket (como Electron) | Python usa libs locais diretamente — mais simples, sem dependência de gateway |
| Docker para wake word training | Usuário quer tudo no terminal; `uv run` com venv isolado resolve |
| Wake word para Electron/backend-ts | Escopo v3.3 é exclusivamente o Python Desktop client |
| Auto-update / code signing | Carry-over de v3.1, backlog 999.x |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| VAD-01 | Phase 78 | Pending |
| VAD-02 | Phase 78 | Pending |
| CONF-01 | Phase 78 | Complete |
| CONF-02 | Phase 78 | Complete |
| CONF-03 | Phase 78 | Complete |
| WGPU-01 | Phase 78 | Pending |
| WGPU-02 | Phase 78 | Pending |
| WGPU-03 | Phase 78 | Pending |
| PCTRL-01 | Phase 79 | Pending |
| PCTRL-02 | Phase 79 | Pending |
| PCTRL-03 | Phase 79 | Pending |
| PCTRL-04 | Phase 79 | Pending |
| PCTRL-05 | Phase 79 | Pending |
| PCTRL-06 | Phase 79 | Pending |
| PCTRL-07 | Phase 80 | Pending |
| PCTRL-08 | Phase 80 | Pending |
| WAKE-01 | Phase 81 | Pending |
| WAKE-02 | Phase 81 | Pending |
| WAKE-03 | Phase 81 | Pending |
| WAKE-04 | Phase 81 | Pending |
| WAKE-05 | Phase 81 | Pending |
