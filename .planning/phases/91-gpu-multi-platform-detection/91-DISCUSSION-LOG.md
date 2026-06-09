# Phase 91: GPU Multi-Platform Detection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 91-gpu-multi-platform-detection
**Areas discussed:** AMD Windows backend, Chatterbox P-1 gate, Vulkan scope, validate-gpu UX, validate-gpu invocation, validate-gpu cache

---

## AMD Windows: DirectML vs ROCm

| Option | Description | Selected |
|--------|-------------|----------|
| Feature flag (DirectML default, ROCm opt-in) | DirectML como default, config field JARVIS_AMD_BACKEND=rocm para RDNA3+ com HIP SDK | ✓ |
| ROCm only | Unificar tudo em torch+rocm7.2.1, requer HIP SDK + Python 3.12 | |
| DirectML only (manter atual) | Manter torch_directml sem migrar para ROCm | |
| Cascade detection-only | device_detect.py reporta qual está disponível, usuário instala manualmente | |

**User's choice:** Feature flag
**Notes:** DirectML e ROCm são wheels mutuamente exclusivos — cascade real em runtime é impossível. Feature flag resolve sem quebrar usuários existentes.

---

## Chatterbox P-1: Posição do Gate de Validação

| Option | Description | Selected |
|--------|-------------|----------|
| Plan 01 dedicado | Plan 01 é 100% validação isolada, fallback documentado antes de qualquer feature code | ✓ |
| Inline no início do Plan 01 | Validação como primeira task, continua se passar | |
| Skipar validação | Assumir compat sem teste isolado | |

**User's choice:** Plan 01 dedicado
**Notes:** Consistente com o padrão --no-deps + torch pinado do projeto (conflitos silenciosos já queimaram antes).

---

## Chatterbox P-1: Fallback se Incompatível

| Option | Description | Selected |
|--------|-------------|----------|
| Kokoro GPU + Chatterbox CPU | Chatterbox em CPU, Kokoro e Whisper em GPU | ✓ |
| Patch Chatterbox | Fork/monkey-patch para resolver conflito de API | |
| Bloquear Phase 91 | Não shipar até resolução upstream | |

**User's choice:** "quero o máximo de coisa com o GPU que mais rápido" → Kokoro GPU + Chatterbox CPU
**Notes:** Maximizar GPU. Se P-1 falhar, Whisper+Kokoro em GPU, Chatterbox cai para CPU.

---

## Vulkan: Detecção vs Inferência Real

| Option | Description | Selected |
|--------|-------------|----------|
| Detection-only | Detecta disponibilidade, expõe string, nenhum subsistema roteado | ✓ |
| STT via ctranslate2[vulkan] | Inferência real no Whisper para Intel Arc / RDNA1 | |
| Skip Vulkan | Não implementar, GPU-05 fica pendente | |

**User's choice:** Detection-only
**Notes:** ctranslate2[vulkan] tem wheel conflict com ctranslate2[cuda] não resolvido upstream. STT Vulkan vai para backlog.

---

## validate-gpu: UX da Saída

| Option | Description | Selected |
|--------|-------------|----------|
| Medium + --verbose + --json | Device + chain + VRAM + compat status; --verbose diagnóstico completo; --json scripting | ✓ |
| Medium apenas | Sem flags extras | |
| Minimal | Só device + fallback chain | |

**User's choice:** Medium + --verbose + --json

---

## validate-gpu: Quando Executa

| Option | Description | Selected |
|--------|-------------|----------|
| Automático no primeiro boot + manual | Roda na primeira inicialização, cacheia resultado, fica sob demanda depois | ✓ |
| Só manual | Somente quando o usuário chama explicitamente | |
| Automático em todo startup | Re-detecta toda vez | |

**User's choice:** Automático no primeiro boot + manual (mas com decisão de cache = só em memória — na prática detecta a cada startup sem gravar em disco)

---

## validate-gpu: Cache

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.jarvis/config.json (campo gpu_device) | Salva junto com config do usuário | |
| ~/.jarvis/gpu_cache.json separado | Arquivo de cache dedicado | |
| Só em memória (sem cache em disco) | Detecta a cada startup, sem persistência | ✓ |

**User's choice:** Só em memória
**Notes:** ~50ms de detecção, aceitável no startup. Sem complexidade de cache/invalidação.

---

## Claude's Discretion

- Formato exato do rich Table/Panel
- Schema do JSON output
- Nome do campo de config para amd_backend
- Integração com singletons existentes (lazy vs eager)

## Deferred Ideas

- ctranslate2[vulkan] STT para Intel Arc / RDNA1 — backlog v3.7+
- Cache em disco do device detectado — se startup time virar problema
- CI com GPU AMD para gate automático
