---
phase: 89-identifica-o-de-voz-speaker-recognition-backlog
verified: 2026-05-29T00:00:00Z
status: human_needed
score: 9/9 must-haves verificados (programaticamente) — 3 verificações manuais pendentes
overrides_applied: 0
requirements_covered:
  - SPK-01
  - SPK-02
  - SPK-03
  - SPK-04
  - SPK-05
  - SPK-06
  - SPK-07
  - SPK-08
  - SPK-09
  - SPK-10
human_verification:
  - test: "Enrollment real via microfone"
    expected: "Após iniciar JARVIS, abrir /config → 10. Perfis de voz → 1. Adicionar perfil, digitar nome, gravar 5 utterances de ~4s. Arquivo ~/.jarvis/speakers/{nome}.npy é criado com shape (256,) float32."
    why_human: "Requer hardware real (microfone) e captura de voz humana — não pode ser exercitado em CI sem fixtures de áudio. Mock_voice_encoder cobre a lógica, mas o pipeline real com sounddevice + resemblyzer model só funciona com hardware."
  - test: "Identificação ao vivo end-to-end (SPK-02, SPK-08)"
    expected: "Após enrollar um perfil e setar speaker_recognition_enabled=true, falar via voz e verificar (a) log [SPK] {nome} ({score}) -> {nome} no terminal, (b) prefixo [{nome}]: no message enviado ao gateway, (c) header x-jarvis-speaker={nome} chegando ao gateway."
    why_human: "Pipeline integrado voice_modes → speaker → chat_loop só executa com microfone físico, modelo resemblyzer baixado (~30MB) e gateway rodando. Unit tests cobrem cada peça isoladamente."
  - test: "Threshold rejeita voz desconhecida (SPK-03)"
    expected: "Outro usuário (voz diferente da enrollada) fala; sistema reporta name=unknown no log, prefixo [unknown]: no turn enviado, e candidate_name pode ser o melhor match abaixo do threshold (esperado [{candidate}?]: se score>0)."
    why_human: "Necessita voz humana real distinta da enrollada. Cosine similarity contra perfis registrados só é representativa com áudio biológico real, não com tons puros ou mock vectors."
---

# Phase 89: Speaker Recognition — Relatório de Verificação

**Phase Goal:** Implementar reconhecimento de quem está falando (speaker identification) via resemblyzer GE2E d-vector — JARVIS identifica o falante após cada captura de áudio, injeta o nome no contexto do LLM (hybrid: alta confiança = prefixo `[Name]:` + header x-jarvis-speaker; baixa confiança = prefixo `[Name?]:`; sem match = `[unknown]:`), e sinaliza ao gateway via header HTTP para que escritas em ChromaDB pulem unknown_speaker. Multi-user, enrollment via /config menu com 5 utterances por perfil.

**Verificado:** 2026-05-29
**Status:** human_needed — todas as verdades programaticamente verificadas passam (9/9), mas 3 comportamentos exigem teste manual com hardware (microfone, voz humana real, modelo resemblyzer instalado).
**Re-verificação:** Não — verificação inicial.

## Verdades Observáveis

| # | Verdade | Status | Evidência |
|---|---------|--------|-----------|
| 1 | Módulo `speaker.py` existe e expõe identify_speaker(), ProfileStore CRUD, enroll_speaker(), _cosine_similarity, _safe_profile_name | VERIFICADO | `apps/desktop-py/src/jarvis_desktop/speaker.py` (273 linhas) — todas as 8 funções públicas presentes (linhas 65, 92, 111, 124, 133, 140, 148, 158, 167, 224) |
| 2 | VoiceEncoder é singleton com threading.Lock — não reinstanciado por chamada | VERIFICADO | `speaker.py:39-40` `_encoder + _encoder_lock` módulo-level; `_get_encoder()` (linha 92) com `with _encoder_lock`; teste `test_voice_encoder_singleton` PASS (5 chamadas → 1 instanciação) |
| 3 | identify_speaker(audio, config) retorna dict {name, confidence, is_known, candidate_name} — candidate_name habilita hybrid injection | VERIFICADO | `speaker.py:212-217` — dict retornado contém as 4 keys exatas; testes test_identify_speaker_returns_dict + test_identify_speaker_above_threshold + test_identify_speaker_below_threshold PASS |
| 4 | Speaker com cosine ≥ threshold → is_known=True com nome correto; < threshold → unknown | VERIFICADO | `speaker.py:209-217` — threshold lido de `config.speaker_threshold`, `is_known = best_score >= threshold`; quando is_known False, name="unknown" mas candidate_name preserva best_name (test_identify_speaker_above_threshold + test_identify_speaker_below_threshold PASS) |
| 5 | ProfileStore salva/carrega/lista/remove perfis como .npy em ~/.jarvis/speakers/ com sanitização contra path traversal | VERIFICADO | `speaker.py:124-155` — 4 funções CRUD + `_safe_profile_name` (linha 65) com regex `^[A-Za-z0-9_\-]{1,64}$`; teste test_profile_store_crud PASS; teste test_enroll_speaker_via_menu_rejects_invalid_name PASS (rejeita `../etc/passwd`) |
| 6 | Enrollment grava 5 utterances, calcula embedding médio via encoder.embed_speaker(), salva .npy shape (256,) float32 | VERIFICADO | `speaker.py:224-273` — loop de N=5 slots, max 3 retries por slot, valida ≥2s, chama `encoder.embed_speaker(processed_wavs)` (linha 271); teste test_enroll_saves_npy PASS |
| 7 | Menu /config exibe item 9 (toggle reconhecimento) e item 10 (submenu Adicionar/Listar/Remover perfis) | VERIFICADO | `chat.py:766-771` prints "9. Reconhecimento voz" e "10. Perfis de voz"; `chat.py:806-809` branches choice=="9"/"10"; 5 funções `_menu_speaker_*` (linhas 1008-1116); testes test_config_menu_speaker_option + test_config_menu_speaker_toggle_enables + test_list_speaker_profiles_via_menu PASS |
| 8 | Speaker identification ocorre após record_until_silence e antes de transcribe nos 3 modos (D-06); Queue carrega dict {text, speaker} | VERIFICADO | `voice_modes.py:303,311` (PTT), `416,423` (wake_word), `509,517` (always_listening) — `_identify_speaker_safe(audio, config)` antes de `transcribe()`, `_queue.put({"text": text, "speaker": speaker_result})`; 0 sites legacy `_queue.put(text)` restantes; testes PASS |
| 9 | chat_loop injeta prefixo [Name]:/[Name?]:/[unknown]: no message body e envia header x-jarvis-speaker={name} ao gateway (compat reversa quando feature off) | VERIFICADO | `chat.py:460-483` `_build_speaker_prefix` cobre 4 casos; `chat.py:112-132` `build_request_headers` com `speaker_name`; `chat.py:486-528` `_stream_response(speaker_result=None)`; `chat.py:670,690,694,703` chat_loop aplica prefix e propaga; testes test_build_speaker_prefix_*, test_speaker_injection_system_prompt, test_unknown_speaker_chromadb_header, test_no_speaker_header_when_disabled (todos PASS) |

**Score:** 9/9 verdades verificadas programaticamente. Comportamentos end-to-end com hardware listados em "Verificação Manual Necessária".

## Artefatos Requeridos

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `apps/desktop-py/src/jarvis_desktop/speaker.py` | VoiceEncoder singleton, ProfileStore, identify_speaker(), enroll_speaker(), _cosine_similarity, _safe_profile_name | VERIFICADO | 273 linhas (≥150 min); todas as 8 funções públicas exportadas; lazy import de resemblyzer; threading.Lock |
| `apps/desktop-py/src/jarvis_desktop/voice_modes.py` | _identify_speaker_safe + integração nos 3 loops com Queue dict | VERIFICADO | `_identify_speaker_safe` linha 163; 3 sites `_queue.put({"text": ..., "speaker": ...})` (linhas 311, 423, 517); 0 sites legacy |
| `apps/desktop-py/src/jarvis_desktop/chat.py` | _build_speaker_prefix + _stream_response(speaker_result) + build_request_headers(speaker_name) + _await_input 3-tuple + chat_loop integration + 5 funções _menu_speaker_* | VERIFICADO | Helper linha 460; `_stream_response` linha 486; `build_request_headers` linha 112; `_await_input` linha 535 retorna tupla 3; chat_loop linhas 670+703; 5 funções de menu linhas 1008-1116 |
| `apps/desktop-py/src/jarvis_desktop/config.py` | speaker_recognition_enabled + speaker_threshold | VERIFICADO | Linhas 113-130 — 2 campos com Field(default=...) e descrição em pt-BR |
| `apps/desktop-py/pyproject.toml` | grupo [speaker] com webrtcvad-wheels ANTES de resemblyzer + override-dependencies | VERIFICADO | Linhas 62-67 (grupo speaker com ordem correta); linha 94 (override-dependencies) |
| `apps/desktop-py/tests/test_speaker.py` | 7 testes SPK-01..06 + SPK-10 | VERIFICADO | 165 linhas, 7 testes, todos PASS |
| `apps/desktop-py/tests/test_config_menu.py` | 4 testes speaker (SPK-09 + T-89-02) | VERIFICADO | 4 testes PASS |
| `apps/desktop-py/tests/test_voice_modes.py` | 3 testes (SPK-07 + safe wrapper) | VERIFICADO | 3 testes PASS |
| `apps/desktop-py/tests/test_chat.py` | 7 testes (build_speaker_prefix + SPK-08 + D-11) | VERIFICADO | 7 testes PASS |
| `apps/desktop-py/tests/conftest.py` | fixture mock_voice_encoder | VERIFICADO | `def mock_voice_encoder` presente; injeta módulo fake resemblyzer + reset de singleton |

## Verificação de Key Links (Wiring)

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|----------|
| `speaker.py` | `resemblyzer.VoiceEncoder + preprocess_wav` | lazy import dentro de `_get_encoder()` e `identify_speaker()/enroll_speaker()` | WIRED | `from resemblyzer import VoiceEncoder` (linha 98) e `from resemblyzer import preprocess_wav` (linhas 186, 234) — todos dentro de funções, evita ImportError em sistemas sem [speaker] |
| `speaker.py` | `~/.jarvis/speakers/{name}.npy` | `np.save / np.load` via `Path.home() / ".jarvis" / "speakers"` | WIRED | `_speakers_dir()` linha 60 + `np.save(str(path), embedding.astype(np.float32))` linha 130 |
| `voice_modes.py` (3 loops) | `speaker.identify_speaker` | `_identify_speaker_safe(audio, config)` antes de `transcribe()` | WIRED | 3 chamadas confirmadas em PTT (linha 303), wake_word (linha 416), always_listening (linha 509); cada uma passa o MESMO NumPy que vai pro Whisper |
| `voice_modes._queue.put` | `chat_loop _await_input` | Queue carregando `{"text": text, "speaker": speaker_result}` | WIRED | 3 sites put usam dict; `_await_input._unpack` (chat.py:548) aceita dict novo OU string legacy (compat reversa) |
| `chat._stream_response` | gateway `/api/chat/stream` | header `x-jarvis-speaker={name}` + message com prefixo `[name]:` | WIRED | `_stream_response` linha 486 extrai speaker_name e passa para `build_request_headers(speaker_name=...)`; header só é incluído quando não-vazio (compat reversa); message prefix aplicado pelo chat_loop antes da chamada |
| `chat._menu_speaker_*` | `speaker.enroll_speaker / list_profiles / delete_profile / _safe_profile_name` | `from jarvis_desktop import speaker as spk` em cada submenu | WIRED | `_enroll_speaker_via_menu` linha 1058, `_list_speaker_profiles_via_menu` linha 1099, `_delete_speaker_profile_via_menu` linha 1116 |

## Trace de Fluxo de Dados (Nível 4)

| Artefato | Variável de Dados | Fonte | Produz Dados Reais | Status |
|----------|-------------------|-------|--------------------|--------|
| `speaker.identify_speaker` | `turn_emb` (embedding 256-dim) | `encoder.embed_utterance(processed)` onde encoder vem de `_get_encoder()` (resemblyzer real ou mock) | Sim — resemblyzer real produz embedding L2-normed; mock produz vetor determinístico via RandomState | FLOWING (com hardware) |
| `voice_modes._identify_speaker_safe` | `result` (dict speaker) | `spk.identify_speaker(audio, config)` chamado apenas se `speaker_recognition_enabled=True` | Sim — fonte é o audio NumPy do microfone (mesmo que vai pro Whisper) | FLOWING (depende de microfone real) |
| `voice_modes._queue.put` payload | `{"text": text, "speaker": speaker_result}` | `transcribe(audio)` + `_identify_speaker_safe(audio, config)` | Sim — text vem do Whisper, speaker_result vem do resemblyzer; payload reconstruído por turno | FLOWING |
| `chat._await_input` retorno | tupla `(text, is_voice, speaker_result)` | `text_queue.get_nowait()` + `_unpack(item)` que diferencia dict novo vs string legacy | Sim — payload é exatamente o que voice_modes put-ou, ou None quando input vem do teclado | FLOWING |
| `chat._build_speaker_prefix` retorno | string `"[Name]: "` / `"[Name?]: "` / `"[unknown]: "` / `""` | `speaker_result.get("is_known")` + `speaker_result.get("candidate_name")` | Sim — lógica condicional cobre os 4 casos da D-08 | FLOWING |
| `chat._stream_response` headers | dict com `x-jarvis-speaker` | `speaker_result.get("name")` extraído antes de `build_request_headers(speaker_name=speaker_name)` | Sim — header só é incluído quando speaker_name não-vazio (compat reversa) | FLOWING |

## Spot-Checks Comportamentais

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| Suite test_speaker.py passa | `pytest tests/test_speaker.py -v` | 7 passed in 13.96s | PASS |
| Suite test_config_menu.py speaker passa | `pytest tests/test_config_menu.py -k speaker -v` | 4 passed in 0.78s | PASS |
| Suite test_voice_modes.py speaker passa | `pytest tests/test_voice_modes.py -k "speaker or queue_includes" -v` | 3 passed in 1.06s | PASS |
| Suite test_chat.py speaker passa | `pytest tests/test_chat.py -k "speaker or chromadb or build_speaker_prefix" -v` | 7 passed in 0.24s | PASS |
| Módulo speaker importa sem resemblyzer real | `python -c "from jarvis_desktop import speaker; print(speaker.list_profiles())"` | Sem exceção (lazy import preserva isso) | PASS (lazy import) |
| Queue API dict — zero sites legacy | `grep -c "_queue.put(text)$" voice_modes.py` | 0 (todos migrados para dict) | PASS |
| Optional dependency group [speaker] ordem correta | `python -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['optional-dependencies']['speaker'])"` | `['webrtcvad-wheels==2.0.14', 'resemblyzer==0.1.4']` — ordem correta (Pitfall 1 RESEARCH) | PASS |

## Cobertura de Requisitos

| Requisito | Plan Origem | Descrição (do contexto/plan) | Status | Evidência |
|-----------|-------------|-------------------------------|--------|-----------|
| SPK-01 | 89-01 | identify_speaker retorna dict {name, confidence, is_known, candidate_name} | SATISFEITO | `speaker.py:212-217` + test_identify_speaker_returns_dict PASS |
| SPK-02 | 89-01 | Speaker com cosine ≥ threshold → is_known=True + nome correto | SATISFEITO | `speaker.py:209-210,215` + test_identify_speaker_above_threshold PASS |
| SPK-03 | 89-01 | Speaker com cosine < threshold → name="unknown", is_known=False | SATISFEITO | `speaker.py:213-215` + test_identify_speaker_below_threshold PASS |
| SPK-04 | 89-01 | ProfileStore CRUD (.npy em ~/.jarvis/speakers/) | SATISFEITO | `speaker.py:124-155` + test_profile_store_crud PASS |
| SPK-05 | 89-01 | preprocess_wav + embed_utterance aceita NumPy 16kHz direto | SATISFEITO | `speaker.py:186,189-190` (passa NumPy direto) + test_embed_utterance_from_numpy PASS |
| SPK-06 | 89-01 | VoiceEncoder singleton (1 instanciação por processo) | SATISFEITO | `speaker.py:39-40,92-108` + test_voice_encoder_singleton PASS |
| SPK-07 | 89-03 | Queue inclui speaker_result (dict {text, speaker}) | SATISFEITO | `voice_modes.py:311,423,517` + test_queue_includes_speaker_result PASS |
| SPK-08 | 89-03 | Hybrid injection: prefixo no message body + header x-jarvis-speaker ao gateway (D-08/D-09/D-11) | SATISFEITO (programaticamente; verificação real end-to-end pendente human) | `chat.py:460-483,486-528,690-703` + test_speaker_injection_system_prompt + test_unknown_speaker_chromadb_header + test_no_speaker_header_when_disabled PASS |
| SPK-09 | 89-02 | Menu /config tem item para toggle + gerenciar perfis (Adicionar/Listar/Remover) | SATISFEITO | `chat.py:766-771,806-809,1008-1163` + 4 testes test_config_menu_speaker_* PASS |
| SPK-10 | 89-01 + 89-02 | Enrollment grava 5 utterances e salva .npy (256,) float32 | SATISFEITO (API + UX); execução real com microfone pendente human | `speaker.py:224-273` + `chat.py:1058-1096` + test_enroll_saves_npy PASS |

**Cobertura total:** 10/10 requisitos com evidência programática. **Sem requisitos órfãos** — todos os IDs declarados no ROADMAP (SPK-01..SPK-10) aparecem em pelo menos um PLAN.requirements.

Nota: REQUIREMENTS.md no momento descreve apenas requisitos v3.5 (Chatterbox/Voice cloning/Emotion tags) e não inclui as definições formais de SPK-01..SPK-10 — estas vivem implicitamente em CONTEXT.md (D-01..D-15) e nos must_haves/testes das três PLANs. Recomendação: registrar SPK-01..SPK-10 em REQUIREMENTS.md numa atualização administrativa (não bloqueante para esta verificação).

## Anti-Padrões Detectados

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---------|-------|--------|------------|---------|
| `voice_modes.py` | 182 | `except Exception as exc:` (bare-broad except) | ℹ️ Info | Intencional — `_identify_speaker_safe` é o safety wrapper T-89-03-04 (D-10); qualquer exceção retorna None para não derrubar voice loop. Comportamento documentado e testado em `test_identify_speaker_safe_returns_none_on_exception`. |
| `chat.py` | 526 | `except Exception as exc:` em `_stream_response` | ℹ️ Info | Pré-existente (não introduzido pelo Phase 89). Mantido — é o catchall do streaming HTTP. |
| `speaker.py` | — | Nenhum TODO/FIXME/PLACEHOLDER encontrado | — | Código limpo |
| `chat.py` menu funcs | — | Nenhum return null/empty inesperado em renderização | — | Submenu retorna explicitamente após sucesso/falha |

Nenhum stub, placeholder ou TODO bloqueante encontrado no código entregue.

## Verificação Manual Necessária

Os comportamentos a seguir foram cobertos por testes unitários com mocks (todos PASS), mas precisam de hardware real para validar o pipeline integrado end-to-end:

### 1. Enrollment real via microfone (SPK-10)

**Teste:** Iniciar JARVIS, executar `/config` → 10 (Perfis de voz) → 1 (Adicionar perfil), digitar nome (ex: "biel"), gravar 5 utterances de ~4s cada quando solicitado.
**Esperado:** Arquivo `~/.jarvis/speakers/biel.npy` é criado com `np.load(...).shape == (256,)` e `dtype == np.float32`. Log `[SPK] Perfil 'biel' salvo em ~/.jarvis/speakers/biel.npy`.
**Por que humano:** Requer microfone físico + modelo resemblyzer baixado (~30MB via `uv sync --extra speaker`). Sounddevice + record_until_silence + preprocess_wav real só funcionam com captura biológica.

### 2. Identificação ao vivo end-to-end (SPK-02, SPK-08)

**Teste:** Após enrollar perfil "biel" e ativar `speaker_recognition_enabled=true` no menu /config (item 9), iniciar voice mode (PTT/wake_word/always_listening) e falar uma frase qualquer.
**Esperado:** (a) Console mostra `[SPK] biel (0.82) -> biel` (ou score parecido ≥0.75); (b) Linha do usuário aparece como `[você] [biel]: olá jarvis (voz)`; (c) Request HTTP ao gateway contém header `x-jarvis-speaker: biel`; (d) Message body URL-encoded contém o prefixo `[biel]:`.
**Por que humano:** Pipeline real exige microfone, modelo resemblyzer carregado e gateway rodando. Tests unitários cobrem cada peça (helpers, headers, queue, identify_speaker), mas a integração completa só é exercitada com hardware.

### 3. Threshold rejeita voz desconhecida (SPK-03)

**Teste:** Com perfil "biel" enrollado e feature ativada, pedir que outra pessoa (voz biologicamente distinta) fale via microfone.
**Esperado:** Log mostra `[SPK] biel (0.X) -> unknown` com X<0.75; turn enviado ao gateway tem prefixo `[biel?]:` (se candidate_name foi "biel" mas score<threshold) ou `[unknown]:` (se candidate_name="unknown"); header `x-jarvis-speaker: unknown`.
**Por que humano:** Cosine similarity contra perfis enrollados só é representativa com voz humana real distinta — não pode ser simulada com áudio puramente sintético em CI.

## Resumo dos Gaps

**Nenhum gap programático.** Todas as 9 verdades observáveis estão satisfeitas, todos os artefatos existem e são substantivos (273 linhas em speaker.py, 5 funções de menu em chat.py, 3 sites integrados em voice_modes.py), todos os key links estão wired (resemblyzer lazy import, Queue dict API em 3 sites, header HTTP em build_request_headers), e todos os 10 requisitos SPK-01..SPK-10 têm evidência de implementação.

**Testes:** 21 testes específicos do Phase 89 todos PASS (7 speaker + 4 config_menu + 3 voice_modes + 7 chat). 1 falha pré-existente (`test_ptt_mode_hotkey` — pynput.HotKey import — documentada em `deferred-items.md` desde antes do Phase 89).

**Por que human_needed e não passed:** O pipeline foi exercitado em pieces isoladas com mocks rigorosos (resemblyzer fake module, urlopen interceptor, ui.get_input sequence), mas a validação biológica do reconhecimento de voz (a) só faz sentido com microfone real + modelo resemblyzer baixado, (b) requer voz humana distinta da enrollada para testar o caminho "unknown", (c) o contrato HTTP `x-jarvis-speaker` precisa ser validado contra um gateway real para confirmar que o header chega (atualmente apenas o lado desktop-py foi testado — gateway-side é fase futura por design da architectural amendment de 2026-05-29). Estas 3 verificações manuais não são bloqueantes para considerar o Phase 89 funcionalmente entregue, mas são necessárias para um sign-off de "production-ready end-to-end".

**Observações arquitetônicas:**

- A architectural amendment de 2026-05-29 (registrada em 89-CONTEXT.md) deixa explícito que **D-09 (system prompt reconstruction)** e **D-11 (ChromaDB skip enforcement)** dependem de infra do gateway que ainda não existe — Phase 89 entrega o **contrato HTTP** (header `x-jarvis-speaker`) e o gateway poderá consumi-lo em fase futura de memória de longo prazo. Isto está alinhado com o ROADMAP e não constitui gap.
- A decisão de revisão de 2026-05-29 trocou a API da Queue de tuple para dict `{"text": text, "speaker": speaker_result}` — verificada em 3 sites de `_queue.put` em voice_modes.py + `_unpack` guard em `_await_input` para compat reversa com producers legacy.

---

*Verificado: 2026-05-29*
*Verificador: Claude (gsd-verifier)*
