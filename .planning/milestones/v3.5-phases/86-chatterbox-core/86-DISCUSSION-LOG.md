# Phase 86: Chatterbox Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 86-identificacao-de-voz-speaker-recognition
**Areas discussed:** Estratégia de warmup, Persistência do fallback, GPU/CPU detect (com revisão de modelo TTS), Timing de init no /config

---

## Estratégia de warmup

### Q1: Como o warmup do Chatterbox deve ser executado no init_tts()?

| Option | Description | Selected |
|--------|-------------|----------|
| Assíncrono em thread | Warmup roda em background após init_tts(). Startup não bloqueia. Se usuário falar antes do warmup terminar, primeira fala paga o custo. | ✓ |
| Síncrono (bloqueia init_tts) | Warmup bloqueia até terminar (~5-10s a mais no startup). Garante que primeira fala já é rápida. | |
| Só quando provider=chatterbox | Warmup só roda se config.tts_provider==chatterbox no startup. Se trocar via /config depois, warmup roda no set_provider(). | |

**User's choice:** Assíncrono em thread

---

### Q2: Quando warmup roda no init_tts(), o Chatterbox já deve estar ativo para disparar?

| Option | Description | Selected |
|--------|-------------|----------|
| Só se provider=chatterbox | Warmup só acontece se o provider configurado for chatterbox. Se startup com kokoro e usuário trocar via /config, warmup acontece no set_provider(). | ✓ |
| Sempre warmup ambos | Pre-carrega Kokoro E Chatterbox no startup (se Chatterbox instalado). Consome RAM/VRAM mesmo sem usar. | |
| Nunca no startup — sempre lazy | Sem warmup no init_tts(). Primeira fala em qualquer provider paga o custo. | |

**User's choice:** Só se provider=chatterbox

---

### Q3: Qual texto usar como warmup (dummy inference)?

| Option | Description | Selected |
|--------|-------------|----------|
| Frase curta fixa em PT | Algo como "Aquecendo." ou "." (uma sílaba). Mínimo possível pra carregar o grafo. Áudio descartado. | ✓ |
| Frase pró-tipo de uso real | Frase mais longa em PT que exercite tokenizer + emoções. Áudio descartado. | |
| Modelo dummy sem texto | Chama API do modelo com input nulo ou mínimo de bytes. Pode não aquecer todo o pipeline. | |

**User's choice:** Frase curta fixa em PT

---

### Q4: O warmup precisa usar o arquivo de referência de voice cloning (se configurado)?

| Option | Description | Selected |
|--------|-------------|----------|
| Não — warmup só do modelo base | Warmup roda sem audio_prompt_path. Phase 87 vai adicionar voice cloning. Phase 86 mantém escopo restrito. | ✓ |
| Sim — se arquivo de ref existir | Se cloned_voice_path estiver preenchido e válido, warmup já carrega speaker embedding. Estende escopo da Phase 86. | |
| Configurável via flag | Adiciona campo opcional pra controlar. Aumenta complexidade sem benefício claro. | |

**User's choice:** Não — warmup só do modelo base

---

## Persistência do fallback

### Q1: Quando Chatterbox falhar e cair pra Kokoro, qual o comportamento na próxima fala?

| Option | Description | Selected |
|--------|-------------|----------|
| Tenta Chatterbox de novo | Cada speak() tenta Chatterbox primeiro. Se falhar, fallback Kokoro nessa fala. Próxima fala recomeça o ciclo. | |
| Auto-switch permanente até reiniciar | Primeira falha marca _disabled=True na sessão; próximas falas vão direto pra Kokoro até restart. | ✓ |
| Switch após N falhas consecutivas | Tolera 2-3 falhas seguidas, depois desabilita Chatterbox pela sessão. | |

**User's choice:** Auto-switch permanente até reiniciar

---

### Q2: Erros não-recuperáveis (ImportError, modelo não baixado) devem ter tratamento diferente de erros transitórios (CUDA OOM, timeout)?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — ImportError desabilita sessão | Se ImportError no init_tts(): _chatterbox_available=False pela sessão. Erros runtime (OOM, timeout) seguem regra da pergunta anterior. | ✓ |
| Não — todos os erros tratam igual | Qualquer Exception → fallback Kokoro nessa fala. Mais simples. | |

**User's choice:** Sim — ImportError desabilita sessão

---

### Q3: Quando o fallback Kokoro acontece, o config persistido muda?

| Option | Description | Selected |
|--------|-------------|----------|
| Não mexe no config | config.tts_provider continua "chatterbox" mesmo após fallback. Estado de degradação fica só em memória. | ✓ |
| Sim — reverte automaticamente | Após falhas persistentes, set_provider("kokoro") + save_config(). Usuário acorda amanhã com kokoro. | |

**User's choice:** Não mexe no config

---

### Q4: O que acontece se o usuário chamar set_provider("chatterbox") quando o módulo já detectou ImportError?

| Option | Description | Selected |
|--------|-------------|----------|
| Recusa com aviso claro | set_provider loga "Chatterbox não instalado. Rode: uv sync --extra chatterbox". config NÃO é alterado. | ✓ |
| Aceita mas avisa | Permite trocar; próxima fala vai cair pra Kokoro silenciosamente. | |
| Re-tenta import a cada set_provider | Tenta importar Chatterbox de novo (talvez usuário instalou em outro terminal). | |

**User's choice:** Recusa com aviso claro

---

## GPU/CPU detect (com revisão de modelo TTS)

### Q1: Como o Chatterbox deve escolher entre GPU e CPU?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect apenas | torch.cuda.is_available() → cuda, senão cpu. Sem override. | |
| Auto-detect + override em config | Campo chatterbox_device com "auto"/"cpu"/"cuda"/"mps"/"vulkan". | |
| Auto-detect + override via env var | CHATTERBOX_DEVICE=cpu como override. | |
| **Other** (livre) | Usuário pediu suporte a múltiplos backends: CUDA + MPS + Vulkan, com CPU só em último caso | ✓ |

**User's choice:** Cascade multi-backend (free-text response). Após análise: Vulkan saiu (PyTorch Vulkan não roda Chatterbox), e foi substituído por DirectML.

**Notes:** Discutimos viabilidade de Vulkan (não estável no PyTorch), avaliamos modelos alternativos (Fish Speech, OpenVoice v2, XTTS v2), confirmamos que usuário tem GPU AMD no Windows, decidimos por adicionar DirectML para acelerar AMD/Intel no Windows. Vulkan eliminado.

---

### Q2 (após revisão): Cadeia final de detecção de device?

| Option | Description | Selected |
|--------|-------------|----------|
| CUDA → MPS → CPU | Cobre 95% dos casos reais. Sem Vulkan. | |
| CUDA → MPS → Vulkan → CPU | Inclui Vulkan na cadeia. Provavelmente falha. | |
| **Final (refinado):** CUDA → MPS → DirectML → CPU | Substitui Vulkan por DirectML para suportar GPU AMD no Windows | ✓ |
| Só CUDA → CPU | Mais simples. Ignora MPS e Vulkan. | |

**User's choice:** CUDA → MPS → DirectML → CPU

---

### Q3: Cascade no erro de warmup?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — cascade completo | CUDA falha → tenta próximo (MPS/DirectML) ou CPU → se ainda falhar → Kokoro. | ✓ |
| Só cai pra CPU direto | Se device escolhido falhar, vai pra CPU sem tentar outras GPUs. | |
| Se device escolhido falhar, vai direto pra Kokoro | Sem tentar CPU — erro no Chatterbox = sessão em Kokoro. | |

**User's choice:** Sim — cascade completo

---

### Q4: Comunicar o device escolhido ao usuário?

| Option | Description | Selected |
|--------|-------------|----------|
| Log curto no init | Mensagem como "[TTS] Chatterbox: GPU (CUDA)" no init_tts(). | ✓ |
| Sem log — silêncio | Decisão do device fica invisível ao usuário. | |
| Log só em modo verbose/debug | Aparece só se JARVIS_DEBUG=1. | |

**User's choice:** Log curto no init

---

### Q5: OOM em runtime (não warmup) — tentar CPU runtime ou cair pra Kokoro?

| Option | Description | Selected |
|--------|-------------|----------|
| Cai direto pra Kokoro | OOM em runtime trata como qualquer outro erro Chatterbox — fallback Kokoro pela sessão. | ✓ |
| Hot-swap pra CPU runtime | Recarrega Chatterbox em CPU sob demanda e tenta de novo. Caro (~5-10s extra). | |

**User's choice:** Cai direto pra Kokoro

---

### Q6: Campo chatterbox_device no config?

| Option | Description | Selected |
|--------|-------------|----------|
| Só auto-detect | Cadeia fixa. Mais simples. | ✓ |
| Auto + override em config | Default "auto". Permite forçar device específico via /config menu. | |
| Auto + override só via env var | Default auto. CHATTERBOX_DEVICE=cpu como override. | |

**User's choice:** Só auto-detect

---

### Q7: Modelo TTS — manter Chatterbox ou trocar?

| Option | Description | Selected |
|--------|-------------|----------|
| Manter Chatterbox | Voice cloning + emotion control são ponto forte. PT-BR fraco mas Kokoro continua. | ✓ |
| Trocar pra Fish Speech | PT-BR nativo melhor + Apache 2.0. Exige revisar Phases 86-88. | |
| Trocar pra OpenVoice v2 | Apache 2.0, PT-BR. Style transfer em vez de tags. | |
| Trocar pra XTTS v2 | PT-BR bom mas licença non-commercial. | |
| Camada EmotionalTTSProvider abstrata | Phase 86 implementa Chatterbox por trás de interface. Mais flexível. | |

**User's choice:** Manter Chatterbox

**Notes:** Usuário fez perguntas profundas sobre alternativas multi-GPU, Vulkan, AMD Windows. Após análise honesta (Vulkan inviável, ROCm não cobre AMD Windows, DirectML é o caminho), decidimos manter Chatterbox + adicionar DirectML.

---

## Timing de init no /config

### Q1: Quando usuário troca pra chatterbox via /config, quando o warmup acontece?

| Option | Description | Selected |
|--------|-------------|----------|
| Warmup no set_provider() em thread | Ao selecionar chatterbox, set_provider() dispara warmup em background e libera o menu imediatamente. | ✓ |
| Warmup síncrono no set_provider() com spinner | Bloqueia o menu ~5-10s mostrando "Aquecendo Chatterbox...". | |
| Sem warmup no set_provider — lazy na primeira fala | set_provider() só atualiza config. Primeira fala dispara init + warmup. | |

**User's choice:** Warmup no set_provider() em thread

---

### Q2: Antes do warmup terminar, o que speak() deve fazer?

| Option | Description | Selected |
|--------|-------------|----------|
| Aguarda o warmup completar | speak() bloqueia (com timeout 15s) até warmup terminar. | ✓ |
| Fallback para Kokoro nessa fala | Se warmup ainda rodando, speak() usa Kokoro silencioso uma vez. | |
| Força sync — espera sem timeout | speak() só retorna quando warmup terminou. Sem fallback. | |

**User's choice:** Aguarda o warmup completar

---

### Q3: Shutdown durante warmup assíncrono (Ctrl+C)?

| Option | Description | Selected |
|--------|-------------|----------|
| Thread daemon — morre com o processo | Warmup roda em threading.Thread(daemon=True). Ctrl+C encerra processo sem esperar. | ✓ |
| Cleanup elegante | Captura SIGINT, faz join() na thread de warmup com timeout. | |

**User's choice:** Thread daemon — morre com o processo

---

### Q4: Indicação visual do warmup em andamento?

| Option | Description | Selected |
|--------|-------------|----------|
| Print no console + sem novo estado | "[TTS] Chatterbox: aquecendo (CUDA)..." no init. "[TTS] Pronto." quando termina. | ✓ |
| Novo estado ui.set_state("warming") | Adicionar estado intermediário. Header do terminal mostra "aquecendo". | |
| Silêncio — sem feedback visual | Warmup roda em background sem nenhum print. | |

**User's choice:** Print no console + sem novo estado

---

## Claude's Discretion

- Versão exata do `chatterbox-tts` e do `torch` pinned (researcher resolve via análise de compatibilidade)
- Estrutura de erros internos (qual Exception específica para `_chatterbox_disabled` vs erros transitórios)
- Texto exato do warmup
- Estratégia de detecção de "warmup terminado" (Event, Future, ou flag booleana)
- Ordem exata de tentativa dentro da cascade no erro

## Deferred Ideas

- Avaliar OpenVoice v2 ou Fish Speech como provider TTS alternativo em milestone futura
- Camada abstrata EmotionalTTSProvider (YAGNI)
- chatterbox_device em config + override em /config
- Override via env var CHATTERBOX_DEVICE
- Hot-swap CUDA→CPU em runtime
- Cleanup elegante de thread de warmup no SIGINT
- Estado ui.set_state("warming")
- Slider de intensidade emocional (EMOTE-03) — Future
- Inferência automática de emoção via LLM (EMOTE-04) — Future
- Feedback de progresso de download do modelo (VCLONE-04) — Future
- Cache de speaker embedding entre sessões (VCLONE-05) — Future
