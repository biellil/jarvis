# Project Research Summary

**Project:** JARVIS v1.9 Voice Capture Modes
**Domain:** Desktop Voice Assistant — Audio Capture & Mode Management
**Researched:** 2026-04-25
**Confidence:** HIGH

## Executive Summary

JARVIS v1.9 adiciona **3 modos de captura de voz mutuamente exclusivos** ao Electron desktop app: (1) Wake Word "Hey JARVIS" existente, (2) Always-Listening contínuo com VAD + LLM intent classifier para filtrar falsos positivos, e (3) Push-to-Talk sem wake word reutilizando hotkey do v1.7. Usuário troca de modo via tray menu submenu com radio buttons; preferência persistida via electron-store.

**Abordagem recomendada:** Strategy pattern com state machine `voiceMode.ts` no Electron main, EventEmitter para pub/sub, reuse do Silero VAD existente (v1.4), e adição focada de 3 dependências (`@ricky0123/vad-web` 0.0.30, `@xenova/transformers` 2.6, `ringbufferjs` 2.0). LLM intent classifier roda local-first via Transformers.js (DistilBERT ONNX, ~50ms latência) com fallback opcional para LM Studio quando configurado.

**Riscos críticos identificados com mitigações concretas:** VAD threshold miscalibration (UI slider configurável), memory leak em sessões longas (ring buffer fixo + soak test 8h obrigatório), cold start do classifier (eager load no startup), race conditions em troca de modo (state machine com flag `transitioning`), e language bias pt-BR do classifier (validação com falantes nativos + few-shot prompts em pt-BR).

## Key Findings

### Recommended Stack

A stack reusa massivamente componentes de v1.4 (Silero VAD, audio capture) e v1.7 (electron-store, tray, IPC). Adições novas focadas em endpoint detection upgrade, intent classification local, e ring buffer pattern.

**Core technologies (NEW for v1.9):**
- **@ricky0123/vad-web 0.0.30+**: Silero VAD v5 — 87.7% TPR vs WebRTC's 50%, configurable `negativeFramesToClose` (180ms padrão) — upgrade do v1.4
- **@xenova/transformers 2.6.x + DistilBERT ONNX**: LLM intent classifier local — ~50ms latência, ~100MB memória, fully offline, fallback opcional para LM Studio
- **ringbufferjs 2.0.0**: Ring buffer fixo para pre-roll audio (10s @ 16kHz = 320KB) — zero GC pauses, descarte automático em overflow
- **Electron Menu API (existente)**: `type: 'radio'` cross-platform nativo — sem dependência nova

**Reused from prior milestones:**
- Voice pipeline (whisper.cpp STT + Murf/ElevenLabs/kokoro TTS) — v1.4-v1.6
- Multi-LLM factory (LM Studio, Claude, GPT-4) — v1.3
- electron-store + Settings BrowserWindow + tray + hotkey global — v1.7

### Expected Features

Três modos mutuamente exclusivos selecionáveis pelo usuário, cada um com comportamento bem definido baseado em padrões de Alexa/Siri/Google Assistant.

**Must have (table stakes):**
- 3 modos selecionáveis exclusivos (1 ativo por vez) — usuários esperam clareza de estado
- Tray menu radio submenu com troca instantânea (<1s) — sem modal dialogs
- Always-Listening: VAD silence threshold 400-600ms (universal standard, OpenAI/Google/Alexa)
- Always-Listening: pre-roll buffer 500ms para não cortar começo de frase
- Privacy: audio buffer descartado imediatamente após STT (não persistir áudio bruto)
- Mode persistente via electron-store, restaurado no startup
- Visual feedback do orb diferenciado por modo (cores/animação distintas)

**Should have (differentiators):**
- LLM intent classifier para filtrar TV/conversa de outros — reduz false positives de >50% para <5%
- Toast confirmation ao trocar de modo
- Hotkey override em Always-Listening (força envio sem esperar VAD silence)
- Migration suave: usuários v1.8 mantêm wake word como default

**Defer (v2.0+):**
- Hybrid modes (wake word + always-listening simultâneo) — quebra UX clarity
- Audio retention para debugging — privacy risk maior que valor
- Cross-device mode sync — escopo de feature multi-device

**Anti-features (explicitamente fora):**
- Cloud-only intent classifier por padrão — viola privacy-first do projeto
- Persistência de áudio bruto — GDPR/CCPA risk
- Modal dialog para mode switch — UX intrusiva

### Architecture Approach

**State machine + Strategy pattern** no Electron main process.

```
voiceMode.ts (NEW)
  ├─ VoiceModeManager (state machine, electron-store backed)
  ├─ WakeWordStrategy (existing pipeline preservado)
  ├─ AlwaysListeningStrategy (NEW: VAD loop + intent classifier)
  └─ PttOnlyStrategy (NEW: hotkey-only, wake word disabled)

intentClassifier.ts (NEW)
  ├─ Transformers.js + DistilBERT ONNX (local default)
  └─ LM Studio fallback (opcional)

tray.ts (MODIFIED)
  └─ "Voice Mode" submenu com 3 radio items + setContextMenu redraw on change

OrbContext.tsx (MODIFIED)
  └─ voiceMode field consumido para CSS class per-mode

voiceInputManager.ts (MODIFIED)
  └─ Strategy dispatch + safe unregister/register em mode switch
```

**Data flow:**
- Mode switch: tray click → voiceMode.setMode() → EventEmitter.emit('change') → IPC → renderer Orb update
- Always-Listening: Silero VAD detecta speech end (180-500ms silence) → ring buffer drains → STT → intent classifier (~50ms) → if intent=true: ChatSession.send() → else: discard
- PTT-only: hotkey down → start capture → hotkey up → STT → ChatSession.send()

**Build order (rationale: foundation → modes → integration → polish):**
1. State machine + Strategy interface (foundation, blocks tudo)
2. Always-Listening core + intent classifier (feature principal)
3. Tray menu + IPC broadcast (UX entry point)
4. Orb visual per-mode (visual feedback)
5. PTT-only + integration with voiceInputManager
6. Hardening: config migration, permissions, soak test

### Critical Pitfalls

6 pitfalls críticos identificados com prevenção concreta:

**1. VAD Threshold Miscalibration**
- **Risk:** Threshold fixo (0.5) corta usuário em ambiente ruidoso ou não fecha utterance em silêncio absoluto
- **Mitigation:** UI slider configurável em Settings + preview em tempo real + 3-environment testing (silent room, normal home, noisy)
- **Detection:** Telemetria opt-in: utterances <500ms ou >30s flagam threshold mal calibrado

**2. Memory Leak em Always-Listening**
- **Risk:** Ring buffer mal-implementado cresce ilimitado (~115MB/hora medido)
- **Mitigation:** ringbufferjs 2.0 com fixed size + `.clear()` explícito em mode switch + soak test 8h obrigatório
- **Detection:** Heap snapshot + RSS monitoring; flat memory após estabilização

**3. Intent Classifier Cold Start**
- **Risk:** Primeira inferência carrega modelo ONNX (50-300ms) → STT atrasa → fala clipped
- **Mitigation:** Eager load no startup + pre-download em userData folder + timeout 2s com fallback para "send anyway"
- **Detection:** Telemetry: latência da primeira inferência por sessão

**4. Mode Switch Race Condition**
- **Risk:** IPC chega durante audio pipeline ativo → double-free, hotkey duplo, hung process
- **Mitigation:** State machine com flag `transitioning: true` + await unregisterAll() antes de registerNew() + yield explícito entre cleanup e start
- **Detection:** Test matriz cobrindo todas as 6 transições (3*2 directional pairs)

**5. Intent Classifier Language Bias (pt-BR)**
- **Risk:** Modelos English-only falham em "ei JARVIS" ou trigam em "oi" casual
- **Mitigation:** Few-shot prompts em pt-BR + validação hands-on com falantes nativos + opção de desabilitar classifier (use VAD-only) como fallback
- **Detection:** Audit log de utterances filtradas; user reports false negatives

**6. macOS Permission Caching**
- **Risk:** Permission "denied" cacheada mesmo após grant em System Settings → mode quebrado silenciosamente
- **Mitigation:** `systemPreferences.getMediaAccessStatus()` re-check em cada mode switch + toast com link "Open System Settings" se denied
- **Detection:** Pre-flight check antes de habilitar Always-Listening

**Secondary pitfalls (não-críticos):**
- PTT hotkey conflict com system shortcuts (detect + warn em Settings)
- Linux tray menu state stale (chamar setContextMenu() explícito após change)
- Config migration v1.8 → v1.9 (default voiceMode='wake-word' se field ausente)
- IPC payload size limits para audio chunks (batching necessário para >2MB)

## Roadmap Implications

### Sequência sugerida (6 phases, continua de Phase 39)

**Phase 39: Voice Mode State Machine (Foundation)**
- Goal: Skeleton para todos os 3 modos com state machine + Strategy interface
- Stack: Strategy pattern, EventEmitter, electron-store
- Plans: ~2 plans, 3-4 dias
- Blocker para todas as outras phases
- Requirements: VMODE-01 (state machine exclusivo), VMODE-02 (electron-store persistence)

**Phase 40: Always-Listening + Intent Classifier**
- Goal: Modo Always-Listening operacional com VAD + classifier filtrando falsos positivos
- Stack: @ricky0123/vad-web upgrade, @xenova/transformers, ringbufferjs
- Plans: ~3 plans (VAD setup, classifier, integration), 5-7 dias
- Depends on: Phase 39
- Requirements: VLISTEN-01..04 (VAD, classifier, ring buffer, privacy)
- **Risco:** Pesquisa empírica de prompt + threshold em pt-BR durante planning

**Phase 41: Tray Menu + Mode Switch UX**
- Goal: Tray menu radio submenu funcional cross-platform com IPC broadcast
- Stack: Electron Menu API (já existente)
- Plans: ~2 plans (tray menu + IPC), 3-4 dias
- Depends on: Phase 39 (paralelo com Phase 40 possível)
- Requirements: VUI-01 (tray submenu), VUI-02 (IPC broadcast)

**Phase 42: Orb Visual Per-Mode**
- Goal: Orb mostra estado distinto por modo (cores/animação)
- Stack: React state + CSS classes
- Plans: ~1-2 plans, 3-4 dias
- Depends on: Phase 41 (precisa do IPC mode change event)
- Requirements: VUI-03 (orb per-mode visual), VUI-04 (mode badge)

**Phase 43: PTT-only + voiceInputManager Integration**
- Goal: Modo PTT-only operacional com hotkey safe unregister/register
- Stack: voiceInputManager strategy dispatch
- Plans: ~2 plans, 5-7 dias
- Depends on: Phases 39, 41
- Requirements: VPTT-01..02 (hotkey routing, wake word disable in PTT mode)
- **Risco crítico:** Hotkey safety test matriz obrigatório (race conditions)

**Phase 44: Hardening + Cross-Platform Polish**
- Goal: Production-ready com permissions, migration, soak test
- Stack: systemPreferences API, config migration logic
- Plans: ~2 plans, 3-4 dias
- Depends on: All previous
- Requirements: VHARD-01..04 (permissions, migration, soak test 8h, fallback UX)

### Estimated effort: ~25-30 dias úteis, 12-13 plans across 6 phases

## Open Questions for Phase Planning

1. **Phase 40 — Intent classifier prompt engineering em pt-BR:** Few-shot examples ideais? Como balancear false negatives vs false positives? Validação hands-on com falantes nativos é phase-internal research task.

2. **Phase 40 — Threshold tuning:** VAD silence_duration default (400-600ms?), classifier confidence threshold (0.6-0.8?), pre-roll size (300-500ms?). Empirical testing necessário.

3. **Phase 43 — Hotkey conflict detection UX:** Mostrar warning na Settings, no tray, ou só logar? Como detectar overlap com system shortcuts cross-platform?

4. **Phase 44 — Privacy disclaimer placement:** Always-Listening enabled pela primeira vez — onde mostrar "Mic ativo, processamento local"? Toast first-run? Settings page? Tray tooltip?

5. **Phase 44 — Graceful degrade UX:** Se intent classifier falha >5% das chamadas, qual feedback? Silent fallback? Toast warning? Auto-disable Always-Listening?

## Confidence Assessment

| Area | Level | Reasoning |
|------|-------|-----------|
| **Stack** | HIGH | Silero VAD já em produção v1.4; Transformers.js documentado; Electron Menu API nativa stable; ringbufferjs simple/proven |
| **Features** | HIGH | Padrões consolidados em Alexa/Siri/Google docs; OpenAI Realtime API specs confirmam thresholds; pesquisa baseada em fontes oficiais |
| **Architecture** | HIGH | Strategy pattern industrial-standard; codebase já usa EventEmitter + IPC; voiceHandler.ts (Phase 30) referência sólida |
| **Pitfalls** | MEDIUM-HIGH | 6 críticos identificados com prevenção concreta; pt-BR language bias precisa validação Phase 40; macOS Sequoia-specific issues parcialmente documentados |

**Overall confidence: HIGH** — 3/4 áreas baseadas em padrões comprovados + codebase já integra componentes principais. Phase 40 (intent classifier em pt-BR) é o único ponto de risco que requer empirical research durante planning.

## Sources

- @ricky0123/vad-web GitHub (Silero VAD v5 specs)
- @xenova/transformers documentation (DistilBERT ONNX local inference)
- Electron 30+ Menu API docs (radio button cross-platform)
- ringbufferjs 2.0 docs (fixed-size ring buffer)
- OpenAI Realtime API spec (silence threshold patterns)
- Picovoice 2026 VAD comparison (Silero vs WebRTC TPR)
- Voiceflow + Lakera intent classifier research
- v1.4 voice pipeline implementation (existing reference)
- v1.7 Settings + tray + electron-store (existing reference)
