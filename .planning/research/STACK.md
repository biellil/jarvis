# Stack Research — Wake Word & Orb UX (v1.4)

**Milestone:** v1.4 Voice & UX Polish — JARVIS desktop (Electron + TypeScript)
**Researched:** 2026-04-11
**Confidence:** HIGH (core recommendation), MEDIUM (Electron integration specifics)

## Scope

Esta pesquisa cobre **apenas adições/mudanças de stack** necessárias para reintroduzir wake word detection (perdido na migração Python→TS na v1.3) e refinar o orb visual. Nada do stack core já validado (LangChain.js 1.x, Electron 41, React 19, nodejs-whisper, Drizzle, ChromaDB JS) é reavaliado.

**Foco da decisão:**
1. Biblioteca de wake word para Node.js/Electron — offline, sem API key, cross-platform, ativamente mantida
2. Pipeline de captura de áudio sempre-escutando no processo Electron
3. Bibliotecas opcionais para refinamento visual do orb (preferir CSS-only)

## Recommended Stack

### Wake Word Detection — Nova capability

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `onnxruntime-web` | 1.24.3 | Runtime ONNX no renderer do Electron (WASM/WebGPU backend) | Publicado em nov/2025 pela Microsoft, MIT. Rola dentro de Chromium do Electron sem nenhum binário nativo. É o mesmo runtime que o `transformers.js` (já usado em v1.3 para embeddings) — zero surpresa de compatibilidade. JSPI/WASM SIMD threads disponíveis out-of-the-box. |
| `openwakeword` ONNX models | v0.1 (`hey_jarvis_v0.1.onnx`) | Modelos pré-treinados de wake word | Mesmo framework open source que rodava em v1.0 via Python. Código é Apache-2.0, modelos são CC BY-NC-SA 4.0 (uso pessoal OK, alinhado ao "assistente pessoal para uso próprio" do PROJECT.md). Quatro arquivos ONNX pequenos: `melspectrogram.onnx`, `embedding_model.onnx`, `silero_vad.onnx`, `hey_jarvis_v0.1.onnx`. Modelo `hey_jarvis` já existe pré-treinado, sem necessidade de treinar nada. |
| Wrapper: port direto baseado em `openwakeword_wasm` (dnavarrom) | — | Pipeline de inferência em AudioWorklet | Não usamos a lib como dependência; fazemos um port interno (mesmo padrão que `openwakeword_wasm` usa). A lib é um repositório pequeno (2 stars, 8 commits, sem license clara) — referência de arquitetura, não dependência. O padrão é público e bem-documentado: AudioWorklet → chunks de 1280 samples (80ms @ 16kHz) → melspec → embedding → VAD + classifier. |

### Audio Capture — Reutilização

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Web Audio API (`AudioContext` + `AudioWorklet` + `getUserMedia`) | Nativo Chromium | Captura contínua de microfone no renderer Electron | Zero dependências novas. Já é o padrão usado pelo `MediaRecorder` atual (PTT do v1.3). A mesma `MediaStream` pode ser bifurcada: uma trilha para wake word sempre-on (16kHz mono downsample via AudioWorklet), outra para o `MediaRecorder` quando disparar a gravação da frase. |
| `audiobuffer-to-wav` | 1.0.0 | Conversão WAV para handoff ao STT | **Já instalado** (apps/desktop/package.json). Continua sendo usado para converter chunks pós-wake-word em WAV 16kHz mono antes de mandar ao `nodejs-whisper`. |

**Decisão arquitetural:** Wake word roda **no renderer**, não no main process. Razões:
1. `onnxruntime-node` (N-API v6) existe e roda em main, mas exigiria um caminho IPC extra: renderer → main → inferência → IPC de volta. Latência e complexidade desnecessárias.
2. `getUserMedia` / `AudioWorklet` só existem no renderer (Chromium APIs). Captura de áudio no main process exigiria outro pacote nativo (ex: `naudiodon`, `mic`) — build pain em Windows.
3. Background throttling do Chromium em janelas ocultas é mitigado com `backgroundThrottling: false` na `BrowserWindow` (config já existente no Electron 41).
4. AudioWorklet do openwakeword_wasm já é público-first, torna trivial portar o pipeline.

### Orb Visual Refinement — Zero/Mínima adição

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| **Tailwind CSS** (já instalado) | 4.0.x | Animações via `@keyframes`, utilitários `animate-*`, `transition-*`, `motion-safe:` | **Primeira escolha.** Os 4 estados do orb (idle/listening/processing/responding) já rodam em CSS keyframes puros — continuam escaláveis via Tailwind 4 sem nada novo. |
| **React 19 `startTransition` + `useTransition`** (já instalado) | 19.2.4 | Transições de estado não-bloqueantes entre orb states | Usa o concurrent rendering do React 19 para transições suaves de classe sem janks, sem nenhum pacote adicional. |
| `motion` (ex `framer-motion`) | 12.x (opcional) | Animações declarativas além do que CSS suporta | **Apenas se necessário** após provar que CSS-only não basta. O pacote `framer-motion` foi renomeado para `motion` em 2025; import path mudou para `motion/react`. Tamanho: ~60KB gz. Adicionar só se o time bater em um limite específico (spring physics, layout animations) que CSS não resolve. |

**Recomendação primária:** Não adicionar nada para o orb. Tailwind 4 + CSS keyframes já usado em v1.2 (ORB-01..04 shipped) é suficiente para "micro-interações, transições mais suaves, feedback visual de wake word". O feedback visual do wake word é novo estado visual, não nova técnica de animação.

## Installation

```bash
# Wake word — adições ao apps/desktop
pnpm --filter @jarvis/desktop add onnxruntime-web@1.24.3

# Modelos openwakeword (download manual para public/openwakeword/models/)
# Não são pacotes npm — baixar de releases do repo openWakeWord:
#   - melspectrogram.onnx (~500KB)
#   - embedding_model.onnx (~2MB — Google speech embedding)
#   - silero_vad.onnx (~1.5MB)
#   - hey_jarvis_v0.1.onnx (~80KB — classifier)
# Total: ~4MB, muito menor que os 350MB do kokoro
```

Nenhuma adição ao `apps/backend-ts` ou `apps/gateway`. Wake word é 100% client-side no Electron.

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| **onnxruntime-web + openwakeword models (port interno)** | `bumblebee-hotword-node` (sugerido pelo user) | **DISQUALIFIED.** Última versão 0.2.1 de 2021-2023, dependência `node-audiorecorder` exige **SoX CLI** instalado no SO (`apt install sox` / `brew install sox` / Windows manual) — nope. Pior: o README confirma que é "a stripped down and repackaged version of the Porcupine wake word system" — ou seja, é baseada em Porcupine, que CLAUDE.md explicitamente exclui por exigir AccessKey. Mesmo que o fork antigo funcione sem key, Picovoice mudou o licenciamento do Porcupine; confiar nele é risco legal e técnico. E o próprio README diz "If you need hotword detection in the browser or ElectronJS see here" — ou seja, é explicitamente NÃO para Electron. |
| onnxruntime-web + openwakeword models | `@picovoice/porcupine-node` | CLAUDE.md exclui explicitamente: exige AccessKey do Picovoice, viola privacy-first. Fim da discussão. |
| onnxruntime-web + openwakeword models | `node-personal-wakeword` (mathquis) | Último commit real é jun/2020. Depende de `mic` (wrapper de `arecord`/`sox`, mesmo problema do bumblebee). Usa DTW+MFCC com templates WAV feitos pelo usuário — qualidade inferior a um modelo neural e exige que o user grave templates da própria voz. Abandonware. |
| onnxruntime-web + openwakeword models | `web-wake-word` (npm) | Projeto pequeno, sem fonte clara sobre modelos, sem adoção. LOW confidence sem benefício vs onnxruntime-web. |
| onnxruntime-web + openwakeword models | Snowboy | **Descontinuado em 2020** pela KITT.AI. Modelos ainda circulam em forks, mas sem maintainer oficial, sem suporte a Python 3.11+/Node 20+. Não tocar. |
| onnxruntime-web + openwakeword models | Vosk (`vosk` npm) | Vosk é STT completo, não wake word. Usar Vosk como "wake word" é rodar STT contínuo e fazer string match — custa >100MB RAM e ~15% CPU contínuos. Desperdício quando o modelo hey_jarvis custa <10MB RAM. |
| onnxruntime-web (renderer) | `onnxruntime-node` (main process) | Funciona, mas obriga IPC renderer↔main para passar chunks de áudio a cada 80ms. Latência de wake word ficaria pior. `onnxruntime-web` roda no mesmo AudioWorklet thread que captura o áudio — zero IPC. |
| Port interno do pipeline | Dependência em `openwakeword_wasm` (dnavarrom) | Repositório com 2 stars, 1 contributor, license não declarada, criado nov/2025. Muito novo e pequeno para confiar como dependência. **Mas** é referência arquitetural perfeita — usamos o código como documentação e portamos o pipeline para dentro de `apps/desktop/src/renderer/wakeword/`. |
| CSS-only (Tailwind 4) para orb | `motion` (framer-motion) | CSS keyframes já provaram funcionar nos 4 estados atuais (ORB-01..04 shipped na v1.2). Adicionar 60KB gz de JS só para mais "polish" é overkill pre-problema. Adicionar **apenas se** uma animação específica bater no teto de CSS (ex: spring physics, FLIP layout animation). |
| CSS-only | `react-spring` | Mesmo racional do motion. Sem problema concreto, sem solução. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `bumblebee-hotword-node` | Baseado em Porcupine (exclusão explícita do CLAUDE.md), última release 2021, depende de SoX CLI, README diz "NOT for Electron" | onnxruntime-web + modelos openwakeword portados |
| `@picovoice/porcupine-node`, `@picovoice/picovoice-node` | AccessKey Picovoice, viola privacy-first | onnxruntime-web + openwakeword |
| `mic`, `node-record-lpcm16`, `node-audiorecorder` | Wrappers do CLI `arecord`/`sox`/`rec` — dependência de binário fora do Node, dor em Windows, sem controle fino de buffer | `getUserMedia` + `AudioWorklet` nativo do Chromium (já disponível no renderer Electron) |
| `naudiodon`, `speaker` nativos | Exigem build tools (MSVC, Python, node-gyp), build pain em Windows, overkill quando getUserMedia resolve | Web Audio API no renderer |
| `snowboy` | Descontinuado 2020, forks sem manutenção | openwakeword |
| Vosk como proxy de wake word | Consumo de RAM e CPU 10x maior que classifier dedicado | Classifier dedicado (openwakeword) |
| `onnxruntime-node` no main process para wake word | IPC extra por cada chunk de 80ms = latência e complexidade | `onnxruntime-web` no mesmo renderer que captura áudio |
| Passar audio chunks via IPC renderer→main→renderer | 12.5 IPC/s só para processar wake word | Manter pipeline inteiro no AudioWorklet do renderer |
| Usar `MediaRecorder` para alimentar o wake word | MediaRecorder entrega blobs codificados (WebM/Opus) em chunks grandes, incompatível com janelas de 80ms PCM que o modelo precisa | `AudioWorklet` lê PCM float32 direto |
| Adicionar `motion`/framer-motion especulativamente | 60KB gz sem problema concreto | Tailwind 4 + CSS keyframes (já funciona) |
| Criar o modelo ONNX zero / treinar próprio | openwakeword já tem `hey_jarvis_v0.1.onnx` pré-treinado com <5% FR e <0.5/h FA | Baixar o modelo pré-treinado |

## Integration with Existing Electron Main Process

Mudanças mínimas no main process:

1. **`apps/desktop/electron/main/index.ts`** — garantir `backgroundThrottling: false` na `BrowserWindow` para que a janela oculta continue processando áudio.
2. **CSP** — adicionar `worker-src 'self' blob:` se o `AudioWorklet.addModule()` exigir blob URL (Electron+Vite pode servir o `.js` do worklet diretamente via `new URL('./wakeword-processor.js', import.meta.url)`).
3. **Permissions handler** — garantir `session.setPermissionRequestHandler` permite `media` (já configurado para PTT).
4. **Arquivos de modelo** — copiar os 4 ONNX para `apps/desktop/resources/wakeword/` e resolver path via `process.resourcesPath` no build empacotado; em dev, servir de `public/` via Vite.
5. **IPC** — um único canal novo: `wakeword:detected` do renderer → main → renderer (do preload-bridged). Main só repassa o evento para disparar a mesma cadeia que o hotkey Ctrl+Shift+J já dispara no v1.2 (ACTV-01).

Nada muda em:
- `apps/backend-ts` — não sabe que wake word existe, só recebe `/api/chat/audio` como sempre
- `apps/gateway` — idem
- Tool executor, multi-LLM, memória, vision — nenhum impacto

## Cross-Platform Support Matrix

| Component | Windows | Linux | macOS | Notas |
|-----------|---------|-------|-------|-------|
| `onnxruntime-web` (WASM backend) | ✓ | ✓ | ✓ | WASM roda em qualquer Chromium. Sem binários nativos. |
| `onnxruntime-web` (WebGPU backend) | ✓ (opcional) | ✓ (opcional) | ✓ (opcional) | WebGPU acelera inferência mas é overkill para modelo de <5MB. WASM basta. |
| `AudioWorklet` + `getUserMedia` | ✓ | ✓ | ✓ (precisa Accessibility/Microphone permission) | Nativo Chromium. macOS pede autorização explícita na primeira execução. |
| Modelos ONNX openwakeword | ✓ | ✓ | ✓ | Arquivos estáticos, sem dependência de OS. |
| Tailwind 4 + React 19 | ✓ | ✓ | ✓ | Já validado em v1.2. |

**Atenção Windows:** Nada de build nativo novo. `onnxruntime-web` é 100% JS+WASM — não aciona `node-gyp`. Isso evita completamente o problema do Node v24+ que exigiu `scripts/postinstall.mjs` para `better-sqlite3` e `electron` (documentado em PROJECT.md Context).

## Privacy & License Implications

| Asset | License | Implication |
|-------|---------|-------------|
| `onnxruntime-web` | MIT | Uso comercial livre, redistribuição livre. |
| `openwakeword` código (se portarmos trechos) | Apache-2.0 | Uso livre, atribuição no NOTICE. |
| Modelos `openwakeword` (`.onnx` pré-treinados) | **CC BY-NC-SA 4.0** | **NonCommercial** — ok para "assistente pessoal para uso próprio" (PROJECT.md explícito). Se JARVIS virar produto comercial, re-treinar modelos ou licenciar separado. |
| `hey_jarvis_v0.1.onnx` especificamente | CC BY-NC-SA 4.0 | Idem. Treinado apenas com dados sintéticos, sem dados privados de voz. |
| Áudio capturado para wake word | — | **Nunca sai do renderer.** Chunks PCM de 80ms ficam em memória, passam pelo ONNX, são descartados. Zero rede, zero disco. Alinhado a constraint "Privacidade" do PROJECT.md. |

**Nenhuma API key** em nenhum ponto do pipeline de wake word.

## Version Compatibility

| Package | Requires | Notes |
|---------|----------|-------|
| `onnxruntime-web@1.24.3` | Chromium ≥ 113 para WebGPU (opcional); WASM funciona em qualquer Chromium moderno | Electron 41 usa Chromium 131+, compatibilidade total. |
| `AudioWorklet` | Chromium ≥ 66 | Electron 41 suporta. |
| Modelos openwakeword | `onnxruntime` ≥ 1.14 | Compatível com onnxruntime-web 1.24.3. |
| React 19.2 + `startTransition` | React ≥ 18 | Já instalado. |
| Tailwind 4 | PostCSS 8+, Vite 5+ | Já instalado. |

## Summary of Additions

**Único pacote npm novo:** `onnxruntime-web@1.24.3` em `apps/desktop`.
**Assets novos:** 4 arquivos `.onnx` (~4MB total) em `apps/desktop/resources/wakeword/`.
**Código novo:** Pipeline portado em `apps/desktop/src/renderer/wakeword/` (AudioWorklet + engine TS).
**Config:** `backgroundThrottling: false` na BrowserWindow (uma linha).

**Zero adição** para o orb refinement — Tailwind 4 + CSS keyframes + React 19 concurrent rendering já resolvem. Reavaliar `motion` se — e apenas se — bater em teto concreto de CSS.

## Sources

- [GitHub dscripka/openWakeWord](https://github.com/dscripka/openWakeWord) — código Apache-2.0, modelos CC BY-NC-SA, `hey_jarvis` pré-treinado, arquitetura de 3 componentes ONNX (HIGH confidence)
- [openWakeWord hey_jarvis model doc](https://github.com/dscripka/openWakeWord/blob/main/docs/models/hey_jarvis.md) — modelo v0.1 validado (HIGH)
- [GitHub dnavarrom/openwakeword_wasm](https://github.com/dnavarrom/openwakeword_wasm) — referência de arquitetura de port para onnxruntime-web, AudioWorklet com chunks de 1280 samples @ 16kHz, thresholds default (MEDIUM — repo pequeno, usar como docs não como dep)
- [Deep Core Labs: Open Wake Word on the Web](https://deepcorelabs.com/open-wake-word-on-the-web/) — implementação browser-first híbrida WASM+GPU backend, viabilidade comprovada (MEDIUM — blog post)
- [npm onnxruntime-web 1.24.3](https://www.npmjs.com/package/onnxruntime-web) — verificado via registry API em 2026-04-11, published nov/2025, MIT, Microsoft (HIGH)
- [npm onnxruntime-node 1.24.3](https://www.npmjs.com/package/onnxruntime-node) — para referência cruzada, mesma versão, Win/macOS/Linux via N-API v6 (HIGH)
- [npm bumblebee-hotword-node 0.2.1](https://www.npmjs.com/package/bumblebee-hotword-node) — verificado via registry: última release 2021, dep node-audiorecorder, README explícito "built on Porcupine", README explícito "see [web version] for Electron" (HIGH — via npm registry JSON)
- [GitHub jaxcore/bumblebee-hotword-node](https://github.com/jaxcore/bumblebee-hotword-node) — último commit out/2023, 37 commits totais, bundled sobre Porcupine (HIGH)
- [GitHub mathquis/node-personal-wakeword](https://github.com/mathquis/node-personal-wakeword) — último commit relevante jun/2020, DTW+MFCC, abandonware (HIGH)
- [Picovoice Porcupine Node.js docs](https://picovoice.ai/docs/quick-start/porcupine-nodejs/) — confirma exigência de AccessKey, exclusão justificada (HIGH)
- [Electron issue #47837 — microphone access](https://github.com/electron/electron/issues/47837) — Web Audio APIs no renderer é o caminho suportado (HIGH)
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet) — API oficial para processamento off-main-thread (HIGH)
- [Motion (framer-motion) npm/motion.dev](https://motion.dev/) — renomeação 2025, v12 mar/2026, React 19 compat (MEDIUM — vendor site)
- `apps/desktop/package.json` — React 19.2.4, Electron 41.1.1, Tailwind 4, Vite 6, `audiobuffer-to-wav` já instalado (HIGH — leitura direta do repo)
- `.planning/PROJECT.md` — stack validado v1.3, constraint privacy-first, CONV-05 era openwakeword em Python (HIGH — fonte primária)
- `CLAUDE.md` — exclusão explícita de Porcupine por AccessKey, política de commits em pt-BR (HIGH — fonte primária)

---
*Stack research for: v1.4 Voice & UX Polish — wake word re-implementation + orb refinement*
*Researched: 2026-04-11*
