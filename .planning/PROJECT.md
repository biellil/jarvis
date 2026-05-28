# JARVIS — Just A Rather Very Intelligent System

## What This Is

JARVIS é um assistente pessoal inteligente para uso próprio que roda no PC (Linux, Windows, macOS). Conversa naturalmente por voz e texto, lembra de tudo entre sessões via SQLite + ChromaDB semântico, executa ações no PC (abre apps, gerencia arquivos, controla sistema), e analisa a tela com pipeline de visão com fallback inteligente. O cérebro é multi-LLM: conecta com modelos locais via LM Studio ou provedores cloud (Claude, GPT-4) sem travar em nenhum.

## Core Value

Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## Current State: v3.4 — SHIPPED 2026-05-28 (Advanced Features)

**v3.4 entregou (phases 82-85):** LangGraph aprovações silenciosas (`approved_plans` SHA-256 + TTL 90d, `approval.ts`, 3-path planner node, `task:auto-approved` silent event); `ChatSession.awaitingConfirmation` routing; Langfuse observability (CallbackHandler em 3 `graph.stream()` call sites, spans manuais ChromaDB/MCP, Docker Compose self-hosted em `infra/langfuse/`); PC Control Python native fallback (Gateway SSE endpoint + ACK, `sse_listener.py` daemon thread + `client_id` UUID, `task:pc_action` confirmação 5s sem Electron); Kokoro voice preset selector (3 vozes PT-BR no `/config` menu, hot-swap via engine reset).

**Previous (phases 78-81):** PC Control completo no Python Desktop, controle de volume e mídia por voz em 3 plataformas, always-listening ONNX fix, config persistência atômica, Whisper GPU auto-detection, custom wake word "ei jarvis" pt-BR.

## Current Milestone: v3.5 — Emotional Voice Cloning TTS

**Goal:** Substituir Kokoro no Python Desktop por Chatterbox TTS, adicionando clonagem de voz por arquivo de referência e controle emocional via tags no texto.

**Target features:**
- Chatterbox TTS como novo provider em `tts.py` (GPU CUDA→CPU auto-detect, mesmo padrão do Whisper)
- Arquivo de referência configurável no `/config` (apontar .wav/.mp3 → voz clonada como padrão de TTS)
- Emotion tags no texto ([angry], [whispering], [sad], [soft], [embarrassed], [breathy], [emphasis], [excited]) mapeadas para parâmetros do modelo
- Fallback para Kokoro se Chatterbox não estiver disponível

**Scope:** `apps/desktop-py` only

---

<details>
<summary>v3.3 Milestone Goal (archived)</summary>

**Goal:** Paridade total de PC Control no Python Desktop, corrigir always-listening (ONNX bug), wake word customizado em pt-BR, persistência de configuração entre sessões, e aceleração de Whisper em AMD ROCm / Apple Metal.

- ✅ Always-Listening fix — Phase 78 (VAD-01/02): `wakeword_models=["hey_jarvis"]` elimina ONNXRuntimeError; pre-roll deque(maxlen=7) captura ~560ms
- ✅ Config Persistence — Phase 78 (CONF-01..03, WGPU-02): save_config() atômico + thread-safe; whisper_model_locked field
- ✅ Whisper GPU ampliado — Phase 78 (WGPU-01..03): _detect_device() CUDA→CPU; tier selection por VRAM; CPU fallback silencioso
- ✅ PC Control Python (App/File) — Phase 79 (PCTRL-01..06): launch_app, close_app, open_folder, read_file, confirm_destructive + audit log
- ✅ PC Control Python (System) — Phase 80 (PCTRL-07..08): volume + mute + media control em 3 plataformas
- ✅ Custom Wake Word pt-BR — Phase 81 (WAKE-01..05): train_wake_word.py via uv run, gravação interativa, treino openwakeword, auto-calibração ROC, detecção automática

**Tech Debt:** PCTRL-05 file delete/move/rename deferred; WAKE-03 .pkl vs .onnx text mismatch; VALIDATION.md draft status; training script sem CLI alias.

</details>

---

## Previous State (v3.2 Python Desktop Client — SHIPPED 2026-05-19)

**Phase 81 complete:** Custom wake word pt-BR entregue. `tools/train_wake_word.py` (PEP 723) com sessão interativa de gravação (countdown + feedback RMS), corpus negativo híbrido (HuggingFace + ambient + kokoro TTS pt-BR), treinamento via `openwakeword.train_custom_verifier()`, auto-calibração ROC curve a 5% FPR, persistência via `save_config()`. `_wake_word_loop()` em `voice_modes.py` detecta `~/.jarvis/models/wake_word_custom.pkl` e carrega verifier via `joblib` com log bilíngue. 73 testes passando, zero regressões. Validated in Phase 81: WAKE-01, WAKE-02, WAKE-03, WAKE-04, WAKE-05.

**Phase 80 complete:** PC Control System Controls entregue. `adjust_volume(delta)` + `toggle_mute()` com 6 backends OS-específicos (win32/linux/macos). `media_control()` com `_media_control_pynput` (Win/macOS) + `_media_control_playerctl` (Linux). Ambos wired em `execute_pc_action()`. SSE `event: action` path em `chat.py._handle_agentic_event()` (normaliza args→params, não-agêntico). 22 testes passando. PCTRL-07 e PCTRL-08 validados. Validated in Phase 80: PCTRL-07, PCTRL-08.

**Phase 78 complete:** Voice Reliability & Config entregue. VAD-01: `_always_listening_loop` agora passa `wakeword_models=["hey_jarvis"]` ao openwakeword — elimina ONNXRuntimeError que carregava todos os modelos (incluindo alexa_v0.1.onnx). VAD-02: `preroll_buffer = deque(maxlen=7)` captura ~560ms antes do início da fala, D-03: `preroll_buffer.clear()` quando TTS ativo. CONF-01: `save_config()` atômico com `threading.Lock` + `NamedTemporaryFile` + `os.replace()`. CONF-02/03: campo `whisper_model_locked: bool = False` em `JarvisConfig`. WGPU-01/02/03: `_detect_device()` (CUDA→ROCm→Metal→CPU), `_select_model_for_device()` por tier de VRAM, `init_stt(config)` respeita `whisper_model_locked`. Testes: 44 passed, 14 xpassed. VAD-01/02, CONF-01/02/03, WGPU-01/02/03 validados. Validated in Phase 78: VAD-01, VAD-02, CONF-01, CONF-02, CONF-03, WGPU-01, WGPU-02, WGPU-03.

**Phase 77 complete:** Minimal terminal UI entregue. `ui.py` singleton (185 lines) com `Console` + `rich.Live` status bar persistente mostrando `[ MODE | MODEL | STATE ]` no rodapé do terminal. `set_state()` wired em 6 pontos de transição: TTS (speaking/idle em 3 providers), voice modes (listening/idle em 3 loops), chat (thinking/idle em gateway). `/config` command detection em `chat_loop()` → `_handle_command()` pausa voice capture, exibe menu numerado com 3 campos (Whisper model, TTS provider, voice mode), aplica hot-swap imediato via `stt.reload_model()`, `tts.set_provider()`, `voice_modes.switch_mode()`. `__main__.py`: `init_ui()` como Step 0, `set_config(config)` após load_config, `cleanup_ui()` no finally. Testes: 32 passed, 15 xpassed. PYUI-01/02 validados. Validated in Phase 77: PYUI-01, PYUI-02.

**Phase 76 complete:** Voice modes entregue. `voice_modes.py` (343 lines) — máquina de estados plugável com 3 loops (PTT, wake word, always-listening), thread management, hot-swap via `switch_mode()`. `chat.py` delegado totalmente: zero PTT/pynput/threading, apenas `get_text_queue()` + `stop_mode()`. `__main__.py` inicializa `init_voice_modes(config)` como Step 5. Testes: 32 passed, 4 xpassed. PYMODE-01/02/03 validados.

**Phase 75 complete:** TTS entregue. `tts.py` singleton (286 lines) com `init_tts`, `speak`, `stop_tts`. Kokoro offline (PYTTS-01), ElevenLabs fallback (PYTTS-02), Murf fallback (PYTTS-03), `local_only` mode (PYTTS-04). TTS integrado em `chat.py._stream_response()` após SSE loop; `init_tts()` chamado em `__main__.py`. Testes: 23 passed, 4 xpassed. PYTTS-01/02/03/04 validados.

**Phase 74 complete:** STT offline entregue. `stt.py` singleton com `init_stt`, `record_until_silence`, `transcribe`, `_parse_ptt_hotkey`. PTT hotkey (Ctrl+Shift+Q) integrado em `chat_loop` via pynput GlobalHotKeys. `init_stt` chamado em `__main__.py` antes do chat loop. `JarvisConfig` extendido com `ptt_key` e `silence_threshold_ms`. faster-whisper==1.2.1, sounddevice==0.5.5, pynput>=1.7.0 adicionados. Testes: 14 passed, 4 xpassed. PYSTT-01/02/03 validados.

**Phase 73 complete:** Terminal chat SSE streaming loop entregue. `chat.py` com 5 funções exportadas (`parse_sse_line`, `parse_sse_chunk`, `build_request_headers`, `run_with_health_check`, `chat_loop`). `__main__.py` atualizado — placeholder `time.sleep(1)` removido, agora chama `run_with_health_check(config)` + `chat_loop(config)`. `config.py` extendido com `api_key` field + `JARVIS_API_KEY` env load. `health.py` corrigido para HTTP 503 + timeout 5s. Teste: 7 passed, 4 xpassed. Smoke test confirmado: tokens streamam, Ctrl+C limpo, gateway offline → exit 1 sem traceback.

**Phase 72 complete:** `apps/desktop-py/` scaffolded with hatchling src layout, uv.lock committed, pytest with 5 passing tests. Core modules: `config.py` (JarvisConfig Pydantic, load_config/save_config, ~/.jarvis/config.json persistence), `health.py` (stdlib-only check_health, never raises), `__main__.py` (entry point: config → health check → await Ctrl+C). Monorepo wired: `dev:desktop-py` in root package.json, `venv/` in .gitignore, `GATEWAY_URL` in .env.example.

---

## Previous State (v3.1 Distribution & Cleanup — SHIPPED 2026-05-14)

**v3.1 entregou:** Settings UI limpa (LLM provider/keys/MCP Server fora da UI — tudo via `.env` com migração automática chmod 0600 no boot), MCP Server feature inteira removida (stdio + 5 tools), bug WBUG-01 do Whisper corrigido (override do usuário honrado, opção "auto" removida da UI, matriz 5×3 de testes), distribuição multi-plataforma com electron-builder (Windows NSIS+portable, macOS .dmg universal, Linux AppImage + preflight + scripts `pnpm dist:*`), README §Build & Install pt-BR. 4 phases (68-71), 15 plans (13 entregues + 2 UAT deferred para backlog 999.3/999.4). 11/14 requirements validados; 3 com config pronta aguardando hardware específico.

## Next Milestone

TBD — use `/gsd:new-milestone` to define v3.4 requirements and roadmap.

<details>
<summary>v3.1 Milestone Goal (archived)</summary>

**Goal:** Simplificar Settings UI removendo configs que pertencem ao backend, gerar binários distribuíveis para Windows/macOS/Linux, e corrigir bug do Whisper que ignora seleção de modelo.

- ✅ LLM config 100% via `.env` — Phase 70 entregue (SIMP-01/02/03/04 validados): seção LLM e MCP removidas do Settings UI; backend lê tudo do `.env` via Zod schema; migração automática electron-store → `.env` no boot com mode 0600
- ✅ MCP Server feature removida — Phase 69 (MCP-RM-01/02): JARVIS deixa de ser MCP server; MCP **Client** (consome servers externos via `.env`) permanece intacto
- ✅ Whisper override fix — Phase 68 (WBUG-01/02/03): pipeline honra modelo configurado; "auto" removido da UI; default "base"
- ⚠ Distribuição multi-plataforma — Phase 71: config validada e macOS shipping; Linux smoke + Windows UAT deferred para 999.3/999.4

**Deferred to v3.2:** Auto-update via electron-updater, code signing (Windows EV cert, macOS notarization), Linux/Windows UAT físico.

</details>

### v3.0 Stats

**Stack:** Node.js 22 + TypeScript + Express 5 + LangChain.js 1.x + Electron + Docker | **LOC:** ~47.000 TS | **Tests:** ~390 passing

**v2.3 LLM Providers & System Actions shipped (2026-05-07):** Google Gemini adicionado como 4º provedor LLM com API key em Settings e live-reload. File actions refinadas: read-only sem confirmação, destrutivas com confirmação, fallback para app padrão do OS. Controles de volume e mídia por voz via LangGraph tools. LM Studio Streaming Events com SSE nativo e fallback automático. EmbeddingQueue p-queue garante que chat preempta embedding via pause/resume gate. 5 phases (57-61), 13 plans, 177 files changed, +27.334 linhas.

| Capability | Status |
|-----------|--------|
| CLI conversacional com multi-LLM | ✓ Shipped v1.0 |
| Memória SQLite + ChromaDB semântica | ✓ Shipped v1.0 |
| Pipeline de voz (PTT + TTS + wake word) | ✓ Shipped v1.0 |
| PC Control (9 ferramentas + confirmação + audit log) | ✓ Shipped v1.0 |
| Vision pipeline + ScreenAnalyzer + hot-reload | ✓ Shipped v1.0 |
| Express TS gateway (proxy, Zod, SSE passthrough) | ✓ Shipped v1.1 |
| Docker Compose (2 serviços: gateway + backend-ts) | ✓ Shipped v1.3 |
| Electron widget (frameless, hotkey, voice+text, orb animado) | ✓ Shipped v1.2 |
| TypeScript backend completo (LLM + Memory + Agent + Tools + Voice) | ✓ Shipped v1.3 |
| Python backend removido — stack 100% TypeScript | ✓ Shipped v1.3 |
| Wake word "Hey JARVIS" offline + VAD real (Silero) | ✓ Shipped v1.4 |
| Full voice pipeline: wake word → STT → LLM → TTS → idle | ✓ Shipped v1.4 |
| Murf.ai TTS provider com fallback automático | ✓ Shipped v1.4 |
| Orb polish: breathing, crossfade, drag-to-reposition | ✓ Shipped v1.4 |
| ffmpeg-static + Docker whisper-cli compilation | ✓ Shipped v1.4 |
| ChromaDB como serviço Docker dedicado com volume persistente | ✓ Shipped v1.5 Phase 26 |
| System prompt pt-BR + dynamic topK memory recall | ✓ Shipped v1.5 Phase 27 |
| Multi-turn voice: follow-up sem repetir "Hey JARVIS" | ✓ Shipped v1.5 Phase 28 |
| whisper.cpp STT local no Electron (GPU auto-detection) | ✓ Shipped v1.6 Phase 29 |
| VRAM-based model selection (large/base/tiny) | ✓ Shipped v1.6 Phase 30 |
| TTS HTTP no Electron main (Murf.ai/ElevenLabs) | ✓ Shipped v1.6 Phase 30 |
| voiceHandler.ts: pipeline STT→LLM→TTS orquestrado | ✓ Shipped v1.6 Phase 30 |
| IPC path E2E + feature flag USE_WHISPER_CPP | ✓ Shipped v1.6 Phase 31 |
| Backend/Docker sem dependências de áudio | ✓ Shipped v1.6 Phase 32 |
| macOS: menu bar mode (dock.hide), frameless window, tray, wake word | ✓ Shipped v1.7 Phase 33 |
| Linux X11: frameless window transparente, tray, wake word E2E | ✓ Shipped v1.7 Phase 33 |
| 5 whisper prebuilds bundled (darwin-arm64/x64, linux-x64/cuda/vulkan) | ✓ Shipped v1.7 Phase 33 |
| Settings UI: hotkey, TTS provider + API key, Whisper model override | ✓ Shipped v1.7 Phase 34 |
| Settings persistência via electron-store + tray menu integration | ✓ Shipped v1.7 Phase 34 |
| Typed memory: 3 ChromaDB collections (semantic/episodic/procedural) | ✓ Shipped v1.8 Phase 35 |
| Drizzle migration 0003 + source_id consistency check non-blocking | ✓ Shipped v1.8 Phase 35 |
| Memory Writer: extração LLM via withStructuredOutput + Zod discriminated union | ✓ Shipped v1.8 Phase 36 |
| Fire-and-forget extraction wireado em ChatSession.send/sendStream | ✓ Shipped v1.8 Phase 36 |
| Context Builder: Promise.all paralelo, top-k=5 sem threshold, headers pt-BR | ✓ Shipped v1.8 Phase 37 |
| Rolling summarization: threshold 20, pitfall-3 protection, _latestSummary cache | ✓ Shipped v1.8 Phase 38 |
| Voice mode state machine: 3 modos exclusivos, persiste via electron-store, EventEmitter pub/sub desacoplado | ✓ Shipped v1.9 Phase 39 |
| Always-Listening: VAD loop contínuo + ring buffer pre-roll 500ms + intent classifier multilingual-e5-small | ✓ Shipped v1.9 Phase 40 |
| VAD silence threshold configurável em Settings (300–800ms, runtime apply sem restart) | ✓ Shipped v1.9 Phase 40 |
| Tray menu radio submenu "Voice Mode" — troca de modo em <1s, estado sempre sincronizado | ✓ Shipped v1.9 Phase 41 |
| Orb visual per-mode: gradiente/glow por modo (WW/AL/PTT), badge Layer 6, toast confirmação | ✓ Shipped v1.9 Phase 42 |
| PTT-only mode: reutiliza hotkey v1.7, wake word desabilitado, force-flush em Always-Listening | ✓ Shipped v1.9 Phase 43 |
| macOS mic permission gate: toast acionável "Abrir System Settings" antes de ativar AL/PTT | ✓ Shipped v1.9 Phase 44 |
| Migração automática v1.8→v1.9 (electron-store sem voiceMode inicia em wake-word sem crash) | ✓ Shipped v1.9 Phase 44 |
| Wake word reliability: mel normalization sign inversion corrigida (x/10+2) — scores ~0.0001 → ≥0.5 | ✓ Shipped v2.0 Phase 46 |
| Settings extras: LM Studio URL, LLM provider dropdown, wake word sensitivity slider (SEXT-01/02/03) | ✓ Shipped v2.2 Phase 52 |
| File action type system: deleteFile/moveFile/renameFile handlers + open fallback para tipos desconhecidos | ✓ Shipped v2.3 Phase 58 |
| Read-only actions (openFolder/openFile/viewContent) auto-executam sem toast; destrutivas exigem confirmação | ✓ Shipped v2.3 Phase 58 |
| System controls por voz: adjust_volume (delta ±100), toggle_mute, media_control (play/pause/next/prev) via LangGraph tools + Electron IPC handlers multiplataforma | ✓ Shipped v2.3 Phase 59 |
| LM Studio Streaming Events: ChatOpenAIStreamingEvents com SSE nativo, TTFT log, fallback automático; feature flag persistido via electron-store + toggle UI em Settings | ✓ Shipped v2.3 Phase 60 |
| Embedding Priority Queue: EmbeddingQueue singleton (p-queue concurrency=1), pause/resume gate em ChatSession, saveTurn fire-and-forget — embedding nunca bloqueia LLM inference | ✓ Shipped v2.3 Phase 61 |

## Requirements

### Validated (v3.3)

- ✓ **VAD-01** — always-listening inicializa openwakeword com `wakeword_models=["hey_jarvis"]`, sem ONNXRuntimeError — Phase 78
- ✓ **VAD-02** — Pre-roll deque(maxlen=7) captura ~560ms antes do início da fala — Phase 78
- ✓ **CONF-01** — save_config() atômico + thread-safe (NamedTemporaryFile + os.replace + threading.Lock) — Phase 78
- ✓ **CONF-02** — whisper_model_locked field em JarvisConfig persiste entre sessões — Phase 78
- ✓ **CONF-03** — Primeira execução sem `~/.jarvis/config.json` funciona com defaults sem erro — Phase 78
- ✓ **WGPU-01** — STT auto-detecta CUDA → CPU na ordem; usa o primeiro disponível — Phase 78
- ✓ **WGPU-02** — Modelo Whisper selecionado por tier de VRAM quando whisper_model_locked=False — Phase 78
- ✓ **WGPU-03** — Fallback silencioso para CPU com log se device detectado falhar ao inicializar — Phase 78
- ✓ **PCTRL-01** — Abrir app por nome (shutil.which + alias fallback) — Phase 79
- ✓ **PCTRL-02** — Fechar app por nome via psutil — Phase 79
- ✓ **PCTRL-03** — Abrir pasta no explorador nativo (Windows/macOS/Linux) — Phase 79
- ✓ **PCTRL-04** — Ler arquivo texto dentro da whitelist com truncamento 50KB — Phase 79
- ✓ **PCTRL-05** — Confirmação de ação destrutiva via fila de voz com timeout 10s — Phase 79
- ✓ **PCTRL-06** — Audit log JSON Lines em `~/.jarvis/audit.json` para toda PC action — Phase 79
- ✓ **PCTRL-07** — Controle de volume por voz (aumentar/diminuir/mute) em 3 plataformas — Phase 80
- ✓ **PCTRL-08** — Controle de mídia por voz (play/pause/next/prev) em 3 plataformas — Phase 80
- ✓ **WAKE-01** — train_wake_word.py via `uv run` em venv isolado — sem Docker — Phase 81
- ✓ **WAKE-02** — Gravação interativa de 20-50 amostras WAV de "ei jarvis" no terminal — Phase 81
- ✓ **WAKE-03** — Modelo treinado (.pkl verifier) instalado automaticamente em `~/.jarvis/models/` — Phase 81
- ✓ **WAKE-04** — voice_modes.py detecta e carrega modelo customizado automaticamente se presente — Phase 81
- ✓ **WAKE-05** — Threshold calibrado automaticamente via ROC curve a 5% FPR — Phase 81

### Validated (v3.1)

- ✓ **WBUG-01** — Pipeline STT carrega exatamente o modelo Whisper configurado pelo usuário; sem fallback silencioso para "medium" — Phase 68
- ✓ **WBUG-02** — Modo "auto" removido da UI; 5 opções explícitas (tiny/base/small/medium/large-v3-turbo) com default 'base'; legacy 'auto' normalizado → 'base' — Phase 68
- ✓ **WBUG-03** — Matriz de regressão 5×3 (UI options × cenários VRAM) impede reincidência do WBUG-01 — Phase 68
- ✓ **MCP-RM-01** — JARVIS deixa de ser MCP Server: stdio transport + 5 tools expostas removidos do backend-ts; IPC `mcp:*` server-side e bridge `window.mcp` server-side removidos do Electron; toggle "Habilitar/Desabilitar Servidor MCP" removido da Settings UI — Phase 69
- ✓ **MCP-RM-02** — MCP Client preservado intacto: `apps/backend-ts/src/mcp/client/` segue funcionando; tools de servers externos (via `.env`) aparecem no chat normalmente; gate `e2e-mock-server.test.ts` verde (3/3) — Phase 69

### Validated (v3.0)

- ✓ **TTS-OFF-01** — JARVIS fala via Kokoro local sem API key configurada — Phase 62
- ✓ **TTS-OFF-02** — Fallback automático para Murf quando Kokoro falha — Phase 62
- ✓ **TTS-OFF-03** — Provider switching (Kokoro/Murf) em Settings sem restart — Phase 62
- ✓ **TTS-OFF-04** — Download progress visível para Kokoro model (~350MB) — Phase 62
- ✓ **TTS-OFF-05** — Modo "apenas local" desabilita fallback Murf — Phase 62
- ✓ **VISION-01** — analyze_screen tool integrada com LLM vision via desktopCapturer + sharp — Phase 63
- ✓ **VISION-02** — Paste/drag de imagens no chat com base64 → LLM vision — Phase 63
- ✓ **VISION-03** — Hotkey configurável captura tela e abre conversa imediatamente — Phase 63
- ✓ **MCP-SRV-01** — JARVIS como servidor MCP via stdio expondo PC control tools — Phase 64
- ✓ **MCP-SRV-02** — Clientes MCP consultam memória (histórico + preferências) — Phase 64
- ✓ **MCP-SRV-03** — Settings UI ativa/desativa servidor MCP e mostra clientes — Phase 64
- ✓ **MCP-CLI-01** — URL de servidor MCP no `.env` com tools disponíveis sem restart — Phase 65
- ✓ **MCP-CLI-02** — JARVIS usa tools MCP externas em conversa normal — Phase 65
- ✓ **MCP-CLI-03** — Degradação limpa se servidor MCP externo offline — Phase 65
- ✓ **AGENT-01** — Tarefa multi-step por voz/texto executada até o fim sem intervenção — Phase 66
- ✓ **AGENT-02** — Plano de etapas exibido com confirmação explícita — Phase 66
- ✓ **AGENT-03** — Progresso real-time no chat + orb durante execução — Phase 66
- ✓ **AGENT-04** — Cancelamento imediato sem efeitos colaterais persistidos — Phase 66
- ✓ **PROACT-01** — Reminders por voz/texto ("me lembra em 30min de X") — Phase 67
- ✓ **PROACT-02** — TTS + toast visual no widget ao disparar lembrete — Phase 67
- ✓ **PROACT-03** — Notificação OS nativa com texto do lembrete — Phase 67
- ✓ **PROACT-04** — Quiet hours configuráveis bloqueiam notificações no período — Phase 67
- ✓ **PROACT-05** — Folder watch (chokidar) notifica ao chegar arquivo — Phase 67
- ✓ **PROACT-06** — Resumo diário em áudio + texto no horário configurado — Phase 67

### Validated (v2.3)

- ✓ **LLM-PROV-01** — Usuário pode selecionar Google Gemini como provedor LLM na UI de Settings — Phase 57
- ✓ **LLM-PROV-02** — LM Studio usa Streaming Events quando o modelo carregado suporta; fallback automático para SSE padrão — Phase 60
- ✓ **LLM-PRIO-01** — Embedding tem prioridade baixa e cede ao request de chat (pause/resume gate em ChatSession) — Phase 61
- ✓ **LLM-PRIO-02** — Se embedding não pode ser interrompido, chat é atendido normalmente sem bloqueio (graceful degradation) — Phase 61
- ✓ **FACT-10** — Ações read-only auto-executam sem toast de confirmação — Phase 58
- ✓ **FACT-11** — Ações destrutivas (delete/move/rename) exigem confirmação explícita — Phase 58
- ✓ **FACT-12** — Fallback para app padrão do sistema ao abrir tipo de arquivo não registrado — Phase 58
- ✓ **SYSCTRL-01** — Usuário pode controlar volume do sistema (aumentar, diminuir, mute) por comando de voz ao JARVIS — Phase 59
- ✓ **SYSCTRL-02** — Usuário pode controlar reprodução de mídia (play/pause, próxima faixa, faixa anterior) por comando de voz ao JARVIS — Phase 59

### Validated (v2.2)

- ✓ **LACT-01** — Abrir pasta no explorador via LLM — Phase 55
- ✓ **LACT-02** — Fechar pasta/janela do explorador via LLM — Phase 55
- ✓ **LACT-03** — Abrir arquivo no app padrão via LLM — Phase 55
- ✓ **LACT-04** — Fechar arquivo/app via LLM — Phase 55
- ✓ **LACT-05** — Visualizar conteúdo de arquivo texto inline no chat (<1MB) — Phase 55
- ✓ **LACT-06** — Toast de confirmação não-bloqueante antes de qualquer ação (timeout 10s = aborta) — Phase 54
- ✓ **LACT-07** — Ações restritas a whitelist de paths (home/Downloads/Documents/Desktop, validação Zod) — Phase 54
- ✓ **LACT-08** — Audit log SQLite para todas as ações de arquivo — Phase 54
- ✓ **LACT-09** — Canal WebSocket backend→Electron com clientId persistido via electron-store — Phase 54
- ✓ **STTS-01** — Streaming TTS: playback inicia na primeira sentença sem esperar resposta completa — Phase 53
- ✓ **STTS-02** — Feature flag STREAMING_TTS sem restart — Phase 53
- ✓ **SEXT-01** — LM Studio URL configurável na UI — Phase 52
- ✓ **SEXT-02** — Provider LLM dropdown com aviso de context overflow — Phase 52
- ✓ **SEXT-03** — Wake word sensitivity slider com runtime apply — Phase 52
- ✓ **MCOS-01** — Tray icon macOS template image (dark/light automático) — Phase 51
- ✓ **QA-01** — Soak test 8h: heap <100MB, RSS <200MB, p99 <50ms, AudioContext=1 — Phase 56

### Validated (v2.1)

- ✓ **REDESIGN-01** — Settings com layout sidebar + content panel — Phase 49
- ✓ **REDESIGN-02** — Design tokens e primitivos visuais consistentes (shadcn/ui + Tailwind v4 @theme) — Phase 48
- ✓ **REDESIGN-03** — Controles redesenhados com look polido (Button, Input, Select, Slider, Field, HotkeyRecorder, Progress) — Phase 48
- ✓ **REDESIGN-04** — Funcionalidade existente preservada sem regressão — Phase 49
- ✓ **WHISPER-01** — Troca de modelo Whisper dispara download imediato (sem aguardar restart) — Phase 50
- ✓ **WHISPER-02** — Feedback visual de progresso de download (progress bar, %, error state, hot-swap sem restart) — Phase 50
- ✓ **POLISH-01** — Settings window com identidade visual própria (não mais tela de debug) — v2.1 (entregue via Phases 48-49)

### Validated (v2.0)

- ✓ **PATCH-01** — PTT hotkey ignorada silenciosamente quando voice mode ≠ ptt-only — Phase 45
- ✓ **PATCH-02** — Whisper model override aplicado no pipeline STT — Phase 45
- ✓ **PATCH-03** — Wake word "Hey JARVIS" ativa confiavelmente (mel normalization sign inversion fix) — Phase 46

### Validated (v1.0)

- ✓ **CONV-01** — CLI conversacional com multi-LLM — v1.0
- ✓ **CONV-02** — Push-to-talk com Whisper STT — v1.0
- ✓ **CONV-03** — TTS neural offline via kokoro — v1.0
- ✓ **CONV-04** — Estado visual (LISTENING/THINKING/SPEAKING) — v1.0
- ✓ **CONV-05** — Wake word "Hey JARVIS" via openwakeword — v1.0
- ✓ **MEM-01** — Toda conversa salva no SQLite com timestamp — v1.0
- ✓ **MEM-02** — Memórias semânticas cross-session via ChromaDB — v1.0
- ✓ **MEM-03** — Perfil do usuário persistente com preferências — v1.0
- ✓ **MEM-04** — Sumário automático de sessão para compressão de contexto — v1.0
- ✓ **MEM-05** — Persistência com fallback e embedding model versionado — v1.0
- ✓ **LLM-01** — Configuração de LLM via .env (LM Studio, Claude, OpenAI) — v1.0
- ✓ **LLM-02** — Detecção automática de capabilities do modelo — v1.0
- ✓ **LLM-03** — Roteamento inteligente: visão→vision model, resto→local — v1.0
- ✓ **LLM-04** — Hot-reload de modelo sem reiniciar — v1.0
- ✓ **TOOL-01** — Gestão de arquivos por linguagem natural — v1.0
- ✓ **TOOL-02** — Abrir/fechar apps por nome — v1.0
- ✓ **TOOL-03** — Volume, brilho, processos ativos — v1.0
- ✓ **TOOL-04** — Confirmação para ações destrutivas — v1.0
- ✓ **TOOL-05** — Audit log de tool calls no SQLite — v1.0
- ✓ **VISION-01** — Captura e análise de tela — v1.0
- ✓ **VISION-02** — Fallback OCR via pytesseract — v1.0
- ✓ **VISION-03** — Fallback cloud vision (Anthropic/OpenAI) — v1.0
- ✓ **ARCH-01** — Código OS-específico isolado em módulo de plataforma — v1.0
- ✓ **ARCH-02** — Pipeline de voz totalmente assíncrono (asyncio) — v1.0
- ✓ **ARCH-03** — Dependências críticas pinadas — v1.0
- ✓ **ARCH-04** — Validação na inicialização com erros claros — v1.0

### Deferred

- **CONV-06** — LangGraph checkpointer cross-session — Deferred to v2. Within-session coherence funciona via message history; LangGraph necessário apenas para cross-session resume.

### Validated (v1.1)

- ✓ **API-01** — POST /chat — resposta completa via HTTP — Phase 6
- ✓ **API-02** — GET /chat/stream — streaming SSE token-a-token — Phase 6
- ✓ **API-03** — GET /health — liveness probe — Phase 6
- ✓ **API-04** — GET /health/ready — readiness probe (ChromaDB + SQLite) — Phase 6
- ✓ **MONO-01** — pnpm-workspace.yaml + root package.json — Phase 7
- ✓ **GW-01** — POST /api/chat — gateway proxia para FastAPI — Phase 7
- ✓ **GW-02** — GET /api/chat/stream — SSE passthrough sem buffering — Phase 7
- ✓ **GW-03** — GET /api/health — health agregado — Phase 7
- ✓ **GW-04** — Error normalization middleware — Phase 7
- ✓ **GW-05** — Zod validation nas requests — Phase 7
- ✓ **DOCKER-01** — Dockerfile Python multi-stage (python:3.12-slim) — Phase 8
- ✓ **DOCKER-02** — Dockerfile Node multi-stage (node:22-slim) — Phase 8
- ✓ **DOCKER-03** — docker-compose.yml com health checks + depends_on — Phase 8
- ✓ **DOCKER-04** — Volume ./data para persistência SQLite + ChromaDB — Phase 8
- ✓ **DOCKER-05** — .dockerignore correto (sem .env, .venv, data, .planning) — Phase 8

### Validated (v1.2)

- ✓ **DESK-01** — apps/desktop scaffoldado no monorepo pnpm com electron-vite + React + TypeScript, com contextIsolation: true, nodeIntegration: false e preload.ts com contextBridge tipado — Phase 9
- ✓ **DESK-02** — BrowserWindow frameless + transparent + always-on-top + skipTaskbar, sem flash branco no load (show: false + ready-to-show) — Phase 10
- ✓ **DESK-03** — Posicionamento automático no canto inferior direito via screen.getCursorScreenPoint() com multi-monitor awareness — Phase 10
- ✓ **DESK-04** — Tray icon com menu contextual Show/Hide/Quit — Phase 10
- ✓ **DESK-05** — Posição da janela persiste entre sessões via electron-store — Phase 10
- ✓ **ORB-01** — Estado idle com pulsação azul suave (CSS keyframes) — Phase 11- ✓ **ORB-02** — Estado listening com pulso âmbar distinto — Phase 11- ✓ **ORB-03** — Estado processing com pulse/spin — Phase 11- ✓ **ORB-04** — Estado responding com ripple rings, transições suaves — Phase 11- ✓ **ACTV-01** — Hotkey global (Ctrl+Shift+J) para ativar/ocultar widget — Phase 12- ✓ **ACTV-02** — Text input com cadeia IPC completa e orb state transitions — Phase 12- ✓ **AUDIO-01** — POST /api/chat/audio no gateway e FastAPI com multipart upload — Phase 13- ✓ **AUDIO-02** — WhisperTranscriber integrado com FastAPI multipart handler — Phase 13- ✓ **ACTV-03** — PTT toggle-mode hotkey com MediaRecorder → 16kHz WAV — Phase 13

### Validated (v1.3)

- ✓ **INFRA-01..06** — TypeScript backend scaffolded, Docker Compose atualizado — v1.3
- ✓ **LLM-TS-01..07** — Multi-LLM factory LangChain.js + ChatSession + streaming SSE — v1.3
- ✓ **MEM-TS-01..07** — Drizzle ORM + ChromaDB JS + Transformers.js embeddings — v1.3
- ✓ **TOOL-TS-01..09** — 9 PC tools (backend payload + Electron executor) — v1.3
- ✓ **VOICE-TS-01,02,04,05** — nodejs-whisper STT + ElevenLabs/Speecht5 TTS + PTT Electron — v1.3
- ✓ **VAL-01..10** — E2E validation + feature flag + cutover + Python removido — v1.3

### Validated (v1.4)

- ✓ **WAKE-01..09** — Wake word offline com openwakeword + VoiceInputManager + PTT coexistência — v1.4
- ✓ **WAKE-10** — TTS failure graceful degrade (texto visível) — v1.4
- ✓ **WAKE-11** — Hard error recovery com toast pt-BR — v1.4
- ✓ **WAKE-12** — Murf.ai TTS provider com fallback — v1.4
- ✓ **WAKE-13** — Shared sendAudioAndHandle pipeline (PTT + wake word) — v1.4
- ✓ **ORB-POL-01** — prefers-reduced-motion — v1.4
- ✓ **ORB-POL-02** — Wake burst animation — v1.4
- ✓ **ORB-POL-03** — Idle breathing hue drift — v1.4
- ✓ **ORB-POL-04** — Crossfade transitions — v1.4
- ✓ **ORB-POL-05** — Drag-to-reposition persistido — v1.4

### Validated (v1.5)

- ✓ **DOCK-06** — ChromaDB como serviço Docker dedicado com volume persistente — Phase 26
- ✓ **DOCK-07** — Backend-ts conecta ao ChromaDB via rede Docker (ChromaConnectionError eliminado) — Phase 26
- ✓ **DOCK-08** — Modelo STT whisper base pré-baixado durante docker build — Phase 26
- ✓ **DOCK-09** — docker compose up sobe ambiente completo pronto para uso — Phase 26
- ✓ **CONV-07** — System prompt em pt-BR instruindo JARVIS a sempre responder em português — Phase 27
- ✓ **CONV-08** — Memória cross-session funcional via ChromaDB — Phase 27
- ✓ **CONV-09** — recall_memory tool funcionando E2E com ChromaDB — Phase 27
- ✓ **MTURN-01** — Listening window pós-TTS (8s configurável) sem repetir wake word — Phase 28
- ✓ **MTURN-02** — Silent timeout para idle sem toast — Phase 28
- ✓ **MTURN-03** — Estado visual distinto 'awaiting-followup' — Phase 28

### Validated (v1.8 Phase 35)

- ✓ **MTYPE-05** — typedMemories Drizzle schema (9 columns, enum check, 2 FKs), migration 0003, MemoryStore typed methods, MemoryVectors typed collections, non-blocking consistency check wired at startup — Phase 35
- ✓ **REL-02** — SQLite/ChromaDB consistency via source_id validation on startup (non-blocking, never throws) — Phase 35

### Validated (v1.8 Phase 38)

- ✓ **MSUM-01** — Rolling summarization comprime 10 mensagens mais antigas em summary entry no SQLite após threshold de 20; pitfall-3 protection garante delete só após summary não-vazio — Phase 38
- ✓ **MSUM-02** — Trigger fire-and-forget via void calls em ChatSession.send/sendStream — sumarização nunca bloqueia pipeline de voz; erros silenciosos via try/catch+warn — Phase 38
- ✓ **MSUM-03** — Rolling summary injetado em buildContext() entre system prompt e memórias typed via cache _latestSummary com fallback para parâmetro explícito — Phase 38

### Validated (v1.9)

- ✓ **VMODE-01** — VoiceModeManager state machine: apenas 1 modo ativo, guarded transitions, EventEmitter pub/sub — Phase 39
- ✓ **VMODE-02** — Persistência via electron-store: modo ativo sobrevive restart, wake-word como default em instalação nova — Phase 39
- ✓ **VMODE-03** — Migração v1.8→v1.9: electron-store sem voiceMode inicia em wake-word sem crash — Phase 44
- ✓ **VLISTEN-01** — Always-Listening: captura contínua com Silero VAD, ring buffer pre-roll 500ms, intent classifier filtra falsos positivos — Phase 40
- ✓ **VLISTEN-02** — Intent classifier local (multilingual-e5-small via Transformers.js) — privacidade preservada — Phase 40
- ✓ **VLISTEN-03** — Ring buffer preserva primeiros fonemas mesmo com VAD atrasado — Phase 40
- ✓ **VLISTEN-04** — VAD silence threshold configurável em Settings (300–800ms) com runtime apply — Phase 40
- ✓ **VUI-01** — Tray menu radio submenu "Voice Mode" com 3 itens, troca <1s, estado sempre correto — Phase 41
- ✓ **VUI-02** — Orb idle com cor/animação distinta por modo: azul (WW), verde (AL), laranja (PTT) — Phase 42
- ✓ **VUI-03** — Badge Layer 6 persistente ("WW"/"AL"/"PTT") + toast confirmação 2s na troca — Phase 42
- ✓ **VPTT-01** — PTT-only: wake word desabilitado, hotkey do v1.7 reutilizada automaticamente — Phase 43
- ✓ **VPTT-02** — Zero reconfiguração de hotkey ao trocar para PTT-only — Phase 43
- ✓ **VPTT-03** — Force-flush em Always-Listening via PTT hotkey override (sem esperar VAD threshold) — Phase 43
- ✓ **VHARD-01** — macOS permission gate: toast acionável "Abrir System Settings" ao ativar AL/PTT sem permissão — Phase 44

### Validated (v1.7)

- ✓ **PLAT-01** — macOS frameless window transparente posicionada corretamente — Phase 33
- ✓ **PLAT-02** — macOS wake word "Hey JARVIS" → pipeline de voz completo — Phase 33
- ✓ **PLAT-03** — macOS tray icon com menu Settings/Quit — Phase 33
- ✓ **PLAT-04** — Linux X11 frameless window transparente posicionada corretamente — Phase 33
- ✓ **PLAT-05** — Linux wake word "Hey JARVIS" → pipeline de voz completo — Phase 33
- ✓ **PLAT-06** — Linux tray icon com menu Settings/Quit — Phase 33
- ✓ **SET-01** — Settings UI abre via tray menu sem editar .env — Phase 34
- ✓ **SET-02** — PTT hotkey configurável na UI com persistência — Phase 34
- ✓ **SET-03** — TTS provider + API key configuráveis na UI — Phase 34
- ✓ **SET-04** — Whisper model override manual (tiny/base/large) — Phase 34
- ✓ **SET-05** — Todas as configs persistem via electron-store — Phase 34

### Validated (v1.6)

- ✓ **STT-01** — whisper.cpp STT no Electron main com GPU auto-detection (CUDA/Vulkan/Metal/CPU) — Phase 29
- ✓ **STT-02** — Seleção automática de modelo por VRAM (>8GB→large, 4-8GB→base, <4GB→tiny) — Phase 30
- ✓ **STT-03** — CPU fallback para GPU incompatível — Phase 29
- ✓ **STT-04** — Normalização de áudio 16kHz PCM antes do whisper.cpp — Phase 29
- ✓ **STT-05** — Latência <2s para utterances de 10s no modelo base — Phase 30 (human-verified)
- ✓ **TTS-01** — TTS gerado no Electron main (não mais no backend-ts) — Phase 30
- ✓ **TTS-02** — Mesmas env vars (MURF_API_KEY, ELEVENLABS_API_KEY) funcionam sem mudança — Phase 30
- ✓ **TTS-03** — Código TTS removido do backend-ts — Phase 30/32
- ✓ **ARCH-05** — voiceHandler.ts orquestra pipeline STT→LLM→TTS — Phase 30
- ✓ **ARCH-06** — sendAudioAndHandle usa IPC sob feature flag USE_WHISPER_CPP — Phase 31
- ✓ **INFRA-01** — @fugood .node binários configurados para ASAR unpack — Phase 29
- ✓ **INFRA-02** — USE_WHISPER_CPP feature flag gates IPC vs HTTP path — Phase 29
- ✓ **INFRA-03** — POST /api/chat/audio removido do gateway — Phase 32
- ✓ **INFRA-04** — POST /chat/audio removido do backend-ts — Phase 32
- ✓ **INFRA-05** — nodejs-whisper removido do Dockerfile — Phase 32

### Out of Scope

| Feature | Reason |
|---------|--------|
| Interface web/UI | Em escopo agora como widget desktop Electron (v1.2) |
| IoT / Raspberry Pi | Milestone futuro (v2+) |
| Multi-usuário / autenticação | Uso pessoal — um único usuário |
| Fine-tuning de modelos | Usa modelos prontos via API |
| Cloud sync de histórico | Privacy-first: todo dado local |
| Geração de imagens | Ferramenta discreta, sem dependência do core |
| App mobile | Validar CLI + voz primeiro |
| WebSearch | LLMs locais têm conhecimento suficiente para uso pessoal |

## Context

- Projeto roda em Windows (dev) / Linux (Docker) — Node.js 22 LTS, TypeScript 5.6+
- **Stack TS:** LangChain.js 1.x + LangGraph JS + Express 5 + Electron + Drizzle ORM
- **Stack Python Desktop:** Python 3.12 + faster-whisper 1.2.1 + sounddevice + kokoro + openwakeword + psutil + pycaw
- LM Studio como backend local primário (porta 1234); Claude e OpenAI via env var
- ChromaDB JS embeddado (sem servidor), better-sqlite3 + Drizzle para SQLite
- Gateway porta 3000, backend-ts porta 8001
- Python backend **removido** em v1.3; Python Desktop Client (apps/desktop-py) adicionado em v3.2
- Binários nativos (electron, better-sqlite3) precisam de `node scripts/postinstall.mjs` após `pnpm install` no Windows com Node v24+
- Python Desktop: `apps/desktop-py/src/jarvis_desktop/` — 11 módulos, 5.975 LOC, 73 testes passando
- PC Control audit log: `~/.jarvis/audit.json` (JSON Lines, append-only, thread-safe)
- Custom wake word model: `~/.jarvis/models/wake_word_custom.pkl` (sklearn verifier + base openwakeword .onnx)

## Constraints

- **Stack**: Node.js + TypeScript como framework principal (migrando de Python)
- **Multi-LLM**: Toda chamada ao LLM passa por camada de abstração — nunca hardcode de provider
- **Multiplataforma**: Código OS-específico isolado em módulos de plataforma com interface comum
- **Privacidade**: Conversa nunca vai para cloud sem configuração explícita do usuário — padrão é local
- **Sem UI obrigatória**: JARVIS funciona 100% em terminal; UI é opcional

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python-only (sem Express/Node) | Stack unificada — Express removido do escopo durante planejamento | → Invalidado v1.3: migrando para TypeScript |
| LLM via interface OpenAI-compatible | LM Studio expõe API compatível — um cliente serve todos | ✓ Correto |
| CLI primeiro, UI depois | Valida o core de IA sem overhead de frontend | ✓ Correto |
| LangChain 1.x sem AgentExecutor | create_react_agent + LangGraph é o caminho recomendado | ✓ Correto |
| ChromaDB embeddado, não client-server | Sem infra overhead para uso pessoal | ✓ Correto |
| sounddevice em vez de PyAudio | Arrays NumPy diretos, sem build pain, ativo maintenance | ✓ Correto |
| kokoro para TTS | 82M model, Apache license, qualidade neural offline | ✓ Correto |
| Config singleton (from jarvis.config import settings) | Isolamento testável — testes fazem patch no módulo | ✓ Correto |
| asyncio.to_thread para chamadas bloqueantes | ARCH-02 compliance — nunca bloquear o event loop | ✓ Correto |
| TYPE_CHECKING guard para imports circulares | ActionExecutor em session.py — evita circular import em runtime | ✓ Correto |
| Cloud LLM temporário para vision fallback | Nunca substituir self.llm — LLM-03 enforcement por design | ✓ Correto |
| Settings() re-instantiation para hot-reload | pydantic-settings lê .env a cada new instance — sem polling | ✓ Correto |
| IoT no futuro | Foco em PC control e IA sólida antes de expandir para hardware | — Pendente |
| LangChain.js 1.x (não 0.3.x) | 0.3.x entrou em modo manutenção Nov 2025 | ✓ Correto — v1.3 |
| Port 8001 para backend-ts | Python 8000, Gateway 3000 — sem conflito | ✓ Correto — v1.3 |
| Backend gera payloads, Electron executa | Separação de responsabilidades PC tools | ✓ Correto — v1.3 |
| Sem período observação Python (VAL-09) | User decidiu não usar mais Python — cutover direto | ✓ Decisão certa — v1.3 |
| Drizzle ORM em vez de raw SQL | Type-safe, migrations auditáveis, DX melhor | ✓ Correto — v1.3 |
| ElevenLabs como TTS default | Qualidade superior ao Speecht5 offline | ✓ Correto — v1.3 |
| openwakeword (não Porcupine) | Totalmente offline, sem API key, Apache license | ✓ Correto — v1.4 |
| @ricky0123/vad-web (Silero) | VAD real em vez de timeout fixo — detecta fim de fala ~1.4s | ✓ Correto — v1.4 |
| sendAudioAndHandle shared helper | Elimina duplicação PTT/wake word — single source of truth | ✓ Correto — v1.4 |
| ffmpeg-static como fallback | Dev local Windows não precisa instalar ffmpeg manualmente | ✓ Correto — v1.4 |
| Docker compila whisper-cli | Container autossuficiente — zero setup manual pra STT | ✓ Correto — v1.4 |
| Murf.ai TTS com fallback local | Voz pt-BR masculina cloud, degrade pra local se sem key | ✓ Correto — v1.4 |
| extractFinalAiText usa _getType() | AIMessageChunk não é instanceof AIMessage no LangChain | ✓ Fix — v1.4 |
| @fugood/whisper.node via asarUnpack | node_modules/@fugood/** cobre todos native addons sem listar cada .node | ✓ Correto — v1.6 |
| whisperResources usa app.getPath('userData') diretamente | userData é sempre real filesystem, sem isPackaged branching | ✓ Correto — v1.6 |
| vramMb=0 fallback para base model | GPU integrada ou driver incompleto — conservativo e seguro | ✓ Correto — v1.6 |
| VoiceHandlerDeps opcional no ChatHandlerDeps | USE_WHISPER_CPP=false path inalterado — zero regressão gateway | ✓ Correto — v1.6 |
| Stub-with-migration-error no backend-ts TTS | Preserva compilação TS até Phase 32 remover /chat/audio | ✓ Correto — v1.6 |
| Docker compila whisper-cli (v1.4) | Decisão revertida em v1.6: whisper movido para Electron, Docker simplificado | ⚠️ Revertido — v1.6 |
| VoiceModeManager singleton com EventEmitter pub/sub | Módulos (tray, orb, voiceInputManager) recebem mode change sem acoplamento direto | ✓ Correto — v1.9 |
| Strategy pattern para 3 modos (VoiceCaptureStrategy interface) | Plugabilidade: adicionar novo modo = nova classe, zero mudança no manager | ✓ Correto — v1.9 |
| Ring buffer pre-roll 500ms em Always-Listening | VAD dispara ~200ms após início de fala — sem pre-roll os primeiros fonemas são cortados | ✓ Correto — v1.9 |
| Intent classifier multilingual-e5-small via Transformers.js | Local, privacidade preservada — rejeita ruído TV/conversa ambiente sem cloud | ✓ Correto — v1.9 |
| PTT hotkey reuso automático do v1.7 Settings (VPTT-02) | Zero reconfiguração para usuário ao ativar PTT-only | ✓ Correto — v1.9 |
| OrbContext voiceMode via IPC subscription (não prop drilling) | Orb isolado: não precisa que App.tsx passe mode down; cleanup correto via unsubscribe | ✓ Correto — v1.9 |
| Badge Layer 6 unconditional (sempre visível) | Usuário identifica modo ativo sem hover — informação crítica de contexto | ✓ Correto — v1.9 |
| crossfade useEffect watches [state, voiceMode] | Sem voiceMode no dep array, trocar modo em idle causava gradient snap (pitfall documentado) | ✓ Fix — v1.9 |
| Mode-switch toast autoCloseMs: 2000 (action toasts: 0) | Confirmação rápida não bloqueia UX; toasts com ação ficam abertos até usuário agir | ✓ Correto — v1.9 |
| shadcn/ui + Tailwind v4 @theme tokens (não CSS modules nem styled-components) | Tokens centralizados via CSS custom properties, primitivos Radix/shadcn, DX excelente com Vite | ✓ Correto — v2.1 |
| Radix Select (não native `<select>`) | Design system consistente; tradeoff: testes Vitest precisam de fireEvent.click em vez de fireEvent.change | ✓ Correto — v2.1 |
| Download trigger imediato no onChange (sem precisar Save) | Fluxo "select → download → ativo" é mais natural; persistência no store via Save bar normal | ✓ Correto — v2.1 |
| AbortController para cancelar download em-flight ao trocar modelo | Evita downloads paralelos e condição de corrida — D-04 | ✓ Correto — v2.1 |
| URLs HuggingFace estáveis (não pre-signed S3) | Pre-signed URLs expiram em 1h — HF resolve para S3 via redirect mas URL principal nunca expira | ✓ Fix — v2.1 |
| res.resume() em redirect (não file.close()) | file.close() antes de seguir redirect causava WriteStream fechado → rename nunca rodava | ✓ Fix — v2.1 |
| wakeword_models=["hey_jarvis"] em always_listening | openwakeword sem arg carrega TODOS os modelos pré-treinados (inclui alexa_v0.1.onnx) — passa ao menos um para VAD-only mode | ✓ Fix — v3.3 |
| Pre-roll deque(maxlen=7) antes do speech onset | VAD dispara ~200ms após início da fala — sem pre-roll os primeiros fonemas são cortados; 7×1280÷16000Hz≈560ms cobre gap | ✓ Correto — v3.3 |
| save_config() atômico: NamedTemporaryFile + os.replace | Evita corrupção de JSON se processo mata durante escrita; threading.Lock previne race de 2 threads simultâneas | ✓ Correto — v3.3 |
| Whisper GPU detection order: CUDA→CPU (sem ROCm/Metal) | ctranslate2 não tem wheels pré-compilados para ROCm/Metal no Python 3.12 — detectar e logar warning, fallback para CPU silenciosamente | ✓ Correto — v3.3 |
| Audit log JSON Lines em ~/.jarvis/audit.json (não SQLite) | PC Control auto-contido sem dependência de schema SQLite; append-only garante nenhuma perda em crash | ✓ Correto — v3.3 |
| Wake word verifier salvo como .pkl (sklearn) ao invés de .onnx | openwakeword train_custom_verifier() retorna sklearn model, não ONNX; conversão para ONNX é desnecessária para uso local | ✓ Correto — v3.3 |
| uv run train_wake_word.py com PEP 723 header (não Docker) | Usuário quer tudo no terminal; PEP 723 declara deps inline — zero setup extra além do uv instalado | ✓ Correto — v3.3 |

## Evolution

Este documento evolui a cada transição de fase e milestone.

**Após cada transição de fase** (via `/gsd:transition`):
1. Requirements invalidados? → Mover para Out of Scope com motivo
2. Requirements validados? → Mover para Validated com referência da fase
3. Novos requirements surgiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se drifted

**Após cada milestone** (via `/gsd:complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditar Out of Scope — razões ainda válidas?
4. Atualizar Context com estado atual

## Completed Milestone: v3.4 Advanced Features (shipped 2026-05-28)

**Delivered:** LangGraph execução silenciosa — `approved_plans` SQLite (SHA-256 + TTL 90d) + `approval.ts` (4 funções) + planner node com 3 caminhos + `ChatSession.awaitingConfirmation`. Langfuse observability — CallbackHandler em 3 `graph.stream()` call sites + spans manuais ChromaDB/MCP + Docker Compose self-hosted em `infra/langfuse/`. PC Control Python native fallback — Gateway SSE endpoint + ACK + `sse_listener.py` daemon thread + `client_id` UUID persistente + `task:pc_action` confirmação 5s sem Electron. Kokoro voice preset selector — 3 vozes PT-BR no `/config` menu com hot-swap. 4 phases (82-85), 12 plans, 162 commits.

## Completed Milestone: v3.0 Agentic JARVIS (shipped 2026-05-10)

**Delivered:** Kokoro TTS 100% offline (kokoro-js + ONNX) com fallback Murf, Vision Pipeline TS-nativo (desktopCapturer + sharp + LLM vision), MCP Server expondo 5 tools via stdio (recall_memory + file ops), MCP Client conectando servers externos via .env (n8n, hot-reload chokidar), Agentic Tasks multi-step (LangGraph + SSE + TaskCheckList + voice keywords), Sistema Proativo end-to-end (reminders por voz/cron, FolderWatcher 2s debounce, Daily Summary LLM pt-BR, quiet hours, OS Notification + TTS + ProactiveMessageList). 6 phases (62-67), 36 plans, 232 files, +52.275 LOC. Audit aprovado: 24/24 reqs, 6/6 phases, 0 wiring gaps cross-phase.

## Completed Milestone: v2.3 LLM Providers & System Actions (shipped 2026-05-07)

**Delivered:** Google Gemini como 4º provedor LLM com Settings UI e live-reload. File actions: read-only sem confirmação, destrutivas com confirmação, fallback para OS default app. Controles de volume e mídia por voz via LangGraph tools + Electron IPC. LM Studio Streaming Events com SSE nativo e fallback. EmbeddingQueue p-queue com pause/resume gate em ChatSession. 5 phases (57-61), 13 plans, 177 files, +27.334 linhas.

## Completed Milestone: v2.2 LLM Actions & Polish (shipped 2026-05-06)

**Delivered:** LLM pode executar ações no PC via WebSocket backend→Electron (abrir/fechar pasta/arquivo, visualizar conteúdo inline) com whitelist Zod, audit log SQLite e toast de confirmação. Streaming TTS inicia na primeira sentença. Settings extras completos (LM Studio URL, provider, wake word sensitivity). macOS tray icon template automático. Soak test QA-01 com HTTP polling e relatório HTML Chart.js. 6 phases (51-56), 22 plans, 164 files, ~23.000 LOC inseridas.

## Completed Milestone: v1.9 Voice Capture Modes (shipped 2026-04-30)

**Delivered:** Três modos de captura de voz mutuamente exclusivos (wake-word, always-listening, PTT-only) com VoiceModeManager state machine + electron-store persistence, Always-Listening com VAD loop + ring buffer pre-roll 500ms + intent classifier local (multilingual-e5-small Transformers.js), tray menu radio submenu com troca <1s, orb visual per-mode (gradiente/badge/toast), PTT hotkey reuso do v1.7, macOS mic permission gate, migração automática v1.8→v1.9. 6 phases (39-44), 20 plans.

## Completed Milestone: v1.4 Voice & UX Polish (shipped 2026-04-12)

**Delivered:** Wake word "Hey JARVIS" offline com pipeline completo (STT → LLM → TTS → idle), Murf.ai TTS, VAD real com Silero, orb visual polish (breathing, crossfade, drag). 4 phases, 15 plans, 113 commits.

## Completed Milestone: v1.5 Conversation Quality & Docker Polish (shipped 2026-04-13)

**Delivered:** ChromaDB como serviço Docker dedicado, whisper base pré-baixado em build, system prompt pt-BR, memória cross-session funcional, multi-turn voice com awaiting-followup state. 3 phases, 7 plans.

## Completed Milestone: v1.6 Local Voice Pipeline (shipped 2026-04-15)

**Delivered:** whisper.cpp STT local no Electron main com GPU auto-detection (CUDA/Vulkan/Metal/CPU), seleção de modelo por VRAM, TTS HTTP migrado para Electron, IPC path E2E validado com feature flag, endpoints /chat/audio removidos do gateway e backend-ts, nodejs-whisper removido do Docker. 4 phases (29-32), 20 plans.

## Completed Milestone: v1.7 Cross-Platform + Settings UI (shipped 2026-04-18)

**Delivered:** JARVIS roda em macOS e Linux (frameless window, tray, wake word E2E verificado humanamente). Settings UI via BrowserWindow dedicada com configuração de hotkey PTT, TTS provider + API key, e modelo Whisper manual — tudo persistido via electron-store. 2 phases, 7 plans.

## Deferred to Future Milestones

- PTT hotkey global macOS/Linux (PLAT-07) — v2.0+
- Settings extras: URL LM Studio, provider LLM, wake word sensitivity (SET-06, 07, 08) — v2.0+
- Performance optimization: latência STT <500ms p95 — v2.0+
- Vision pipeline migração para TypeScript — v2.0+
- Speech bubble redesign, History/context panel — v2.0+
- Offline TTS local (Kokoro Node.js port) — v2.0+
- Streaming TTS (token-by-token playback) — v2.0+
- Linux Wayland support (PLAT-08) — v2.0+
- macOS template tray icon (branco/preto) — v2.0+
- Always-Listening soak test 8h heap validation — v2.0 (script entregue em v1.9 Phase 44)

---
*Last updated: 2026-05-28 — v3.5 milestone started (Emotional Voice Cloning TTS)*
