# Phase 91: GPU Multi-Platform Detection - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar `device_detect.py` como factory centralizada de detecção de device — substitui a lógica local em `stt.py` (`_detect_device`, `_detect_amd_windows`) e `tts.py` (`_detect_chatterbox_device`) com fonte única de verdade. Entrega também o comando CLI `jd validate-gpu` e os extras de instalação em `pyproject.toml`.

**Fora de escopo:** novas features de produto, mudanças no pipeline de áudio/TTS/STT além do wiring para `device_detect.detect()`.

</domain>

<decisions>
## Implementation Decisions

### AMD Windows: DirectML vs ROCm (GPU-01, GPU-03)

- **D-01:** `device_detect.py` usa **feature flag** para AMD Windows — DirectML como default (zero friction para usuários existentes), ROCm opt-in via campo de config `amd_backend: "directml" | "rocm"` (default: `"directml"`).
- **D-02:** A cascade de device no `device_detect.detect()` é: CUDA → ROCm (Linux) → MPS (macOS) → DirectML (Windows AMD, se `amd_backend="directml"`) → ROCm Windows (se `amd_backend="rocm"` e HIP SDK presente) → Vulkan (detection-only, expõe string mas não roteia) → CPU.
- **D-03:** `torch_directml` e `torch+rocm7.2.1` são wheels mutuamente exclusivos — não coexistem no mesmo venv. A cascade é de *detecção* (qual está instalado), não de *execução* em runtime.

### Chatterbox P-1: Gate de Validação (GPU-03)

- **D-04:** **Plan 01 é 100% validação isolada** — nenhum código de feature é escrito antes do go/no-go de compat `torch==2.9.1+rocm7.2.1` + Chatterbox. O plano de fallback é documentado no output do Plan 01 antes de qualquer commit de feature.
- **D-05:** **Fallback se P-1 falhar: GPU máximo possível** — Whisper (faster-whisper) e Kokoro ficam em GPU; Chatterbox cai para CPU (ainda funciona, só sem aceleração GPU). Usuário não perde qualidade de voz, perde aceleração no Chatterbox.
- **D-06:** Se P-1 passar (compat OK): Chatterbox também vai para GPU via ROCm — `_detect_chatterbox_device()` em `tts.py` é substituído por chamada a `device_detect.detect()`.

### Vulkan (GPU-05)

- **D-07:** **Detection-only** — `device_detect.py` detecta disponibilidade de Vulkan e expõe a string `"vulkan"` na cascade reportada por `jd validate-gpu`. Nenhum subsistema (STT/TTS) é roteado para Vulkan nesta fase. ctranslate2[vulkan] STT vai para backlog (wheel conflict com ctranslate2[cuda] não resolvido upstream).

### `jd validate-gpu` CLI (GPU-08)

- **D-08:** **Saída padrão medium**: device detectado + fallback chain completo avaliado + VRAM (se disponível) + status de compat por subsistema (Whisper / Kokoro / Chatterbox).
- **D-09:** Flags: `--verbose` expande para diagnóstico completo (versão de driver, todas as GPUs enumeradas); `--json` retorna JSON estruturado para scripting/health-check.
- **D-10:** **Executa a cada startup** (detecção em memória, sem cache em disco) — ~50ms, fora do hot path. `jd validate-gpu` também disponível como comando CLI standalone para diagnóstico.

### Claude's Discretion

- Formato exato do rich Table/Panel no output do `validate-gpu` (estilo, cores, largura)
- Schema exato do JSON output (`--json`)
- Nome do campo de config para `amd_backend` (pode ser `gpu.amd_backend` em config.py)
- Ordem exata das colunas no fallback chain display
- Integração do `device_detect.detect()` com os singletons existentes em `stt.py` / `tts.py` (lazy init vs eager)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da Phase 91
- `.planning/REQUIREMENTS.md` §GPU-01..GPU-09 — texto autoritativo dos 9 requisitos
- `.planning/ROADMAP.md` §Phase 91 — Success Criteria + Critical Pitfalls P-1 e P-2

### Código existente (a ser substituído/refatorado)
- `apps/desktop-py/src/jarvis_desktop/stt.py` — `_detect_device()` (linha 65), `_detect_amd_windows()` (linha 114), `_load_model_with_progress()` (linha 177)
- `apps/desktop-py/src/jarvis_desktop/tts.py` — `_detect_chatterbox_device()` (linha 537), `_create_chatterbox_engine()` (linha 584), `_chatterbox_device` global (linha 106)
- `apps/desktop-py/src/jarvis_desktop/config.py` — padrão de config (`JarvisConfig`, `BaseSettings`), atomic write pattern (linha 218-245)

### Pitfalls documentados
- `.planning/STATE.md` §"Pitfalls conhecidos (v3.6 entrada)" — GPU P-1 (torch+rocm vs Chatterbox) e GPU P-2 (false positives allocation test)
- `.planning/STATE.md` §"Accumulated Context (Phase 86)" — `--no-deps` + torch pinado (por que Chatterbox é instalado assim)

### Convenções
- `CLAUDE.md` §Git Commit Guidelines — Conventional Commits + emoji obrigatórios
- `apps/desktop-py/pyproject.toml` — estrutura de extras e dependências existentes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `config.py:218-245` — atomic write pattern (`tempfile.mkstemp + os.replace`) — reutilizar para qualquer escrita de config/cache em `device_detect.py`
- `stt.py:65-112` — `_detect_device()` existente — base para `device_detect.py` (expandir, não reescrever do zero)
- `tts.py:537-582` — `_detect_chatterbox_device()` existente — lógica de DirectML/MPS/CUDA a migrar para `device_detect.py`
- `tts.py:106` — `_chatterbox_device: Optional[str]` singleton pattern — device_detect.py provavelmente vai usar padrão similar com threading.Lock

### Established Patterns
- Lazy imports com `try/except ImportError` para deps opcionais (ex: `torch_directml`, `torch`) — manter este padrão em `device_detect.py`
- Singletons thread-safe via `threading.Lock` — `stt.py`, `tts.py`, `speaker.py` todos usam este pattern
- `loguru` para logging (`from loguru import logger`) — não usar `print()` diretamente

### Integration Points
- `stt.py::init_stt()` — onde `_detect_device()` é chamado hoje; passa resultado para `WhisperModel(device=device)`
- `tts.py::_warmup_chatterbox()` — onde `_detect_chatterbox_device()` é chamado; resultado determina `torch.device` para Chatterbox
- `apps/desktop-py/src/jarvis_desktop/__main__.py` ou `chat.py` — ponto de startup onde `device_detect.detect()` vai rodar automaticamente na inicialização
- `pyproject.toml` `[project.optional-dependencies]` — onde os extras `[nvidia-gpu]`, `[amd-gpu-windows]`, `[apple-silicon]`, `[vulkan]` serão adicionados

</code_context>

<specifics>
## Specific Ideas

- Allocation test obrigatório em `device_detect.py` antes de commitar a um device: `torch.zeros(1, device=device_string)` — falha silenciosa = fallback para CPU (GPU P-2)
- `jd validate-gpu` como subcomando de `jd` (mesma CLI existente) — não como script separado
- Feature flag AMD: campo `gpu` em `JarvisConfig` com `amd_backend: Literal["directml", "rocm"] = "directml"`
- Output do `validate-gpu` em PT-BR (consistente com toda a UI do JARVIS)

</specifics>

<deferred>
## Deferred Ideas

- **ctranslate2[vulkan] para STT em Intel Arc / RDNA1** — wheel conflict com ctranslate2[cuda] não resolvido upstream; vai para backlog v3.7+
- **Cache em disco do device detectado** — usuário preferiu detecção em memória a cada startup; pode ser adicionado se startup time virar problema
- **CI com GPU AMD** para gate automático de compat — infra cara, não justificada para projeto pessoal

### Reviewed Todos (not folded)
Nenhum todo correspondente à Phase 91 foi encontrado no backlog.

</deferred>

---

*Phase: 91-gpu-multi-platform-detection*
*Context gathered: 2026-06-09*
