# Research Summary — JARVIS v3.3 Python PC Control & Voice Reliability

**Researched:** 2026-05-20

---

## Stack Additions

| Package | Version | Purpose | Platform |
|---------|---------|---------|---------|
| Nenhum novo pacote principal | — | pathlib + pydantic + psutil + pynput cobrem tudo | All |
| `ctranslate2` (ROCm build) | experimental | GPU AMD — **sem wheel prebuilt; compile manual ou defer** | Linux AMD |
| openwakeword training deps | Docker-only | PyTorch 1.13, TF 2.8 — incompatíveis com py3.12 no venv | Docker |

**Não adicionar:** PyTorch/TensorFlow ao venv principal, community ctranslate2-rocm fork (unmaintained), PyAudio, pyttsx3.

---

## Critical Findings

1. **Zero novas dependências no venv principal** — todas as features (PC Control, config, GPU detection, VAD fix) usam stack já instalada (psutil, pyautogui, pynput, pathlib, pydantic).

2. **GPU ROCm/Metal sem prebuilt wheels** — CTranslate2 não tem wheel para AMD ROCm ou Apple Metal no PyPI. Opção A (v3.3): auto-detect CUDA/CPU com fallback gracioso + log de aviso. Opção B (v3.4): docker build ou wheel manual.

3. **Custom wake word training precisa Docker** — openwakeword depende de PyTorch 1.13 + TF 2.8, incompatíveis com Python 3.12 + pydantic v2. Pipeline de treino via Docker; modelo .onnx gerado é copiado para ~/.jarvis/models/.

4. **Bug crítico always-listening** — `voice_modes.py:315`: `Model(vad_threshold=0.5)` sem `wakeword_models=[]` → openwakeword carrega `alexa_v0.1.onnx` por padrão → ONNXRuntimeError se arquivo não existe. Fix de 1 linha, deve ser Phase 1.

5. **Config race condition** — `save_config()` usa `open(..., 'w')` sem locking → writes concorrentes (voice mode switch + /config menu) perdem dados. Precisa atomic write (temp file + os.replace()) + chmod 0o600.

---

## Feature Table Stakes

### Config Persistence
- Campos persistidos: model, tts_provider, voice_mode, kokoro_voice, local_only, wake_word_threshold, ptt_key, whisper_device
- Hot-reload: alteração via /config → save_config() imediato → próximo startup carrega sem prompt
- Atomic write + chmod 0o600 obrigatórios

### PC Control Python
- Abrir/fechar app por nome (psutil + subprocess)
- Abrir pasta/arquivo no explorador do OS (subprocess com explorer/xdg-open/open)
- Gestão de arquivos: list, read, delete, move, rename — whitelist home/Documents/Downloads/Desktop
- Confirmar ações destrutivas (delete/move/rename) com timeout 10s → auto-abort
- Audit log em ~/.jarvis/audit.json (append-only)
- Volume: aumentar/diminuir/mute via pycaw (Windows) ou pactl (Linux) ou osascript (macOS)
- Mídia: play/pause, next, previous via pynput media keys

### Always-Listening Fix
- Remover carga de wake word models em modo VAD-only (`wakeword_models=[]`)
- Ring buffer pre-roll 500ms deve continuar funcionando
- Sem mudança de comportamento visível — apenas o crash desaparece

### Whisper GPU Ampliado
- Auto-detect: macOS → "mps", Linux com /opt/rocm → "rocm", NVIDIA → "cuda", fallback → "cpu"
- Seleção de modelo por VRAM: tiny (<2GB), base (2-4GB), large (>8GB)
- Log de aviso se device solicitado não disponível → fallback transparente
- Campo `whisper_device` em JarvisConfig para override manual

### Custom Wake Word pt-BR
- Pipeline de treino Docker (openwakeword oficial)
- 20–50 amostras WAV 16kHz do usuário dizendo "ei jarvis"
- Threshold auto-calibrado por FPR (padrão 0.5 não serve para modelos com poucas amostras)
- Modelo .onnx copiado para ~/.jarvis/models/wake_word_custom.onnx
- voice_modes.py carrega modelo customizado se caminho configurado

---

## Watch Out For

| Pitfall | Risco | Prevenção |
|---------|-------|-----------|
| openwakeword VAD sem `wakeword_models=[]` | **CRÍTICO** | Single-line fix; Phase 1 obrigatório antes de qualquer teste |
| Config write concorrente perde dados | **ALTO** | Atomic temp-file + os.replace(); threading.Lock no save_config() |
| pywin32/pyobjc importado em OS errado | **ALTO** | TYPE_CHECKING guard em todos os módulos PC Control; lazy imports |
| Custom wake word FPR explode com poucos samples | **MÉDIO** | Threshold mínimo 0.7 para modelos custom; auto-calibrar por FPR medido |
| UAC dialog bloqueia thread de voz no Windows | **MÉDIO** | Pausar voice_mode antes de ação destrutiva; retomar no finally |

---

## Build Order Recommendation

| Fase | Conteúdo | Complexidade | Gate |
|------|----------|-------------|------|
| **78** | Always-listening fix + Config persistence + Whisper GPU detect | Baixa | VAD test CPU-only passa |
| **79** | PC Control Python — app/file/volume/media tools | Alta | Whitelist test cross-OS |
| **80** | Custom wake word pt-BR — Docker training pipeline | Média | FPR < 5% em 1h soak |
