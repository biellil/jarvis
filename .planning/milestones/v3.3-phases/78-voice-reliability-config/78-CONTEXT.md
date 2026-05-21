# Phase 78: Voice Reliability & Config - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Corrigir o crash de ONNXRuntimeError no modo always-listening, tornar o `save_config()` atômico e thread-safe, e adicionar auto-detecção de GPU para o Whisper com seleção automática de modelo.

**No escopo:** VAD-01 (wakeword_models=[]), VAD-02 (pre-roll ring buffer 500ms), CONF-01/02/03 (atomic save + first-run defaults), WGPU-01/02/03 (GPU auto-detect + model selection + CPU fallback).
**Fora do escopo:** PC Control (Phase 79-80), custom wake word (Phase 81), novos campos de config além dos necessários para GPU lock.

</domain>

<decisions>
## Implementation Decisions

### VAD Fix (VAD-01, VAD-02)
- **D-01:** `_always_listening_loop` passa `wakeword_models=[]` explicitamente em `Model(wakeword_models=[], vad_threshold=0.5, inference_framework="onnx")` — elimina tentativa de carregar `alexa_v0.1.onnx`.
- **D-02:** Ring buffer de pre-roll implementado **inline em `_always_listening_loop`** (`voice_modes.py`) — `collections.deque(maxlen=7)` (~500ms a 1280 samples/chunk @ 16kHz). Não vai para `stt.py`.
- **D-03:** Quando TTS está ativo e `speech_buffer` é descartado, o pre-roll também é limpo (`preroll_buffer.clear()`). Evita capturar áudio do TTS no onset da próxima fala.

### Config Persistence (CONF-01, CONF-02, CONF-03)
- **D-04:** `save_config()` usa **threading.Lock no nível do módulo** + **atomic write** (temp file + `os.replace()`). Proteção completa contra race condition entre `voice_modes.switch_mode()` e menu `/config`.
- **D-05:** `load_config()` já trata primeiro run (cria arquivo com defaults) e startups subsequentes. Nenhuma mudança na lógica de leitura — apenas o write torna-se atômico.

### Whisper GPU Auto-detecção (WGPU-01, WGPU-02, WGPU-03)
- **D-06:** Ordem de detecção: CUDA → ROCm (detecta `/opt/rocm`) → Apple Metal (MPS) → CPU. Implementado como `_detect_device() -> str` em `stt.py`.
- **D-07:** Seleção automática de modelo: executada em todo startup. Se `whisper_model_locked: bool = False` no `JarvisConfig`, auto-detect seleciona modelo por tier de device. Se `whisper_model_locked: True` (usuário escolheu via `/config`), usa `whisper_model` do config sem override.
- **D-08:** Quando usuário muda modelo via `/config`, `save_config()` salva `whisper_model_locked: True` junto com o novo `whisper_model`. Próximas startups respeitam a escolha manual.
- **D-09:** Seleção de modelo por tier (Claude decide os thresholds exatos de VRAM para CUDA; ROCm/Metal sem wheels ctranslate2 → aviso + CPU fallback silencioso).
- **D-10:** Verbosidade: **sempre mostra o device escolhido** no terminal: `[STT] Carregando tiny em cuda:0...`. Se fallback acontece (device falhou): `[STT] CUDA indisponível — usando CPU.`
- **D-11:** Se ROCm ou Metal detectado mas ctranslate2 sem wheels: `[STT] ROCm detectado mas sem suporte ctranslate2 — usando CPU (fallback silencioso).`

### Claude's Discretion
- Thresholds exatos de VRAM para seleção de modelo (tiny/base/large-v3-turbo) no tier CUDA
- API exata para query de VRAM (ctranslate2.cuda / torch.cuda / nvidia-smi)
- Implementação do `_detect_device()` — detalhes de check de `/opt/rocm`, `torch.backends.mps`
- Tamanho exato do deque de pre-roll (7 chunks = ~560ms; ajuste fino OK)
- Nomes dos campos novos em `JarvisConfig` (`whisper_model_locked`, `whisper_device`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### STT e GPU detection
- `CLAUDE.md` §Technology Stack — faster-whisper 1.2.1, CTranslate2 device suportados
- `CLAUDE.md` §Voice Pipeline Architecture — sounddevice (NumPy) + faster-whisper
- `CLAUDE.md` §Cross-Platform Audio Notes — Windows/Linux/macOS portaudio notes
- `apps/desktop-py/src/jarvis_desktop/stt.py` — singleton `_model`, `init_stt()`, `reload_model()`, `_load_model_with_progress()`; device atual `"auto"` para substituir

### Config persistence
- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig`, `load_config()`, `save_config()`; adicionar lock + atomic write + `whisper_model_locked` field
- `.planning/STATE.md` §Key Decisions — "Config atomic write required: temp file + os.replace() + threading.Lock"

### Voice modes
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — `_always_listening_loop()`: onde VAD-01 fix e VAD-02 pre-roll são aplicados
- `.planning/phases/76-voice-modes/76-CONTEXT.md` — D-06: todos os modos bloqueiam durante TTS; padrão de threading
- `.planning/phases/74-speech-to-text-stt/74-CONTEXT.md` — D-08: singleton Whisper, padrão de carregamento

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `stt.py:_load_model_with_progress()`: já faz rich progress bar para download — reutilizar ao trocar device/modelo
- `stt.py:reload_model()`: já implementado para troca em runtime via `/config` — integrar com `whisper_model_locked`
- `config.py:save_config()`: já existe, só precisa de lock + atomic write
- `config.py:_config_file_path()`: helper pronto para o path `~/.jarvis/config.json`

### Established Patterns
- Módulo plano com singleton state (stt.py, tts.py, voice_modes.py) — seguir para qualquer helper novo
- `threading.Lock` já usado em `stt.py` (`_lock`) — replicar em `config.py`
- `collections.deque` disponível na stdlib — sem deps novas para o ring buffer

### Integration Points
- `__main__.py`: `init_stt(config.whisper_model)` → substituir por `init_stt(config)` para aceitar config completa e rodar auto-detect
- `voice_modes.py:_always_listening_loop`: inserir pre-roll deque e fix `wakeword_models=[]`
- `config.py:JarvisConfig`: adicionar `whisper_model_locked: bool = False` (e opcionalmente `whisper_device: str = ""` para cache do device detectado)

</code_context>

<specifics>
## Specific Ideas

- Usuário quer **sempre** ver o device escolhido no terminal (`[STT] Carregando tiny em cuda:0...`), não apenas no fallback.
- `whisper_model_locked` como mecanismo de opt-out do auto-detect — simples e explícito.
- Pre-roll inline em `_always_listening_loop` para não contaminar `stt.py` com lógica de modo.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 78-voice-reliability-config*
*Context gathered: 2026-05-20*
