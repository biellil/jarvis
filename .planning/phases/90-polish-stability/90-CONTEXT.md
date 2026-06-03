# Phase 90: Polish & Stability - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolver o débito da v3.5 e endurecer a base antes das features da v3.6:

1. **POL-01** — Fechar os 13 findings do code review da Phase 89 (6 warnings + 7 info) com fix ou aceite formal documentado.
2. **POL-02** — Executar os 3 testes HUMAN-UAT pendentes do Phase 89 com microfone real e documentar resultados.
3. **POL-03** — Reorganizar o menu `/config` (hoje lista plana de 10+ itens) em hierarquia LLM / Voice / Memory / Speakers / System.
4. **POL-04** — Adicionar teste E2E automatizado em CI cobrindo PTT → STT → LLM → TTS, sem hardware real.

Tudo dentro de `apps/desktop-py/`. Sem novas features de produto; sem mexer em fases futuras (91+).

</domain>

<decisions>
## Implementation Decisions

### POL-01: Code Review Findings da Phase 89

- **D-01:** Corrigir os 6 warnings (WR-01..WR-06). São fixes pequenos e fechar 100% deixa `speaker.py` robusto antes da Phase 94 (per-speaker memory) tocar a mesma área.
  - WR-01: tornar `save_profile` atômico via `tempfile.mkstemp` + `os.replace` (seguir padrão de `config.save_config` em `apps/desktop-py/src/jarvis_desktop/config.py:218-245`).
  - WR-02: passar `allow_pickle=False` explícito em `np.load` dentro de `load_profile`.
  - WR-03: envolver loop de perfis em `identify_speaker` com `try/except (ValueError, EOFError, OSError)` por perfil, logando o nome corrompido e seguindo.
  - WR-04: criar `class EnrollmentAborted(RuntimeError)` e levantar quando os retries esgotam; `_enroll_speaker_via_menu` captura a exceção.
  - WR-05: remover o parâmetro `threshold` (dead) de `_build_speaker_prefix` e ajustar a chamada em `chat_loop`.
  - WR-06: filtrar `list_profiles` via `_safe_profile_name` (try/except `ValueError`, skip silencioso).

- **D-02:** Dos 7 info items, corrigir apenas os 3 de cobertura de testes (IN-04, IN-05, IN-06). Os outros 4 (IN-01 warmup proativo, IN-02 print fora do lock, IN-03 log gating, IN-07 import top-level) ficam aceitos com rationale — micro-otimizações que não mudam comportamento observável.
  - IN-04: `tests/test_speaker.py::test_safe_profile_name` parametrizado (path absoluto, backslash, leading dot, vazio, unicode, limite 64/65 chars, caracteres permitidos `a-b_c`).
  - IN-05: teste `test_identify_speaker_skips_corrupted_profile` plantando `.npy` truncado ao lado de perfil válido.
  - IN-06: teste `test_enroll_aborts_after_max_retries` mockando `record_until_silence` para retornar áudio curto e verificando que `EnrollmentAborted` é levantada (ou que perfil NÃO é escrito) — alinha-se com WR-04.

- **D-03:** Documentar a resolução em `.planning/phases/90-polish-stability/90-REVIEW-FIX.md` com tabela `ID | Status (fixed/accepted) | Commit SHA | Rationale (só para accepted)`. Padrão consistente com `/gsd:code-review-fix`. Não editar `89-REVIEW.md` (mantém histórico imutável).

- **D-04:** Commits atômicos — 1 commit por finding corrigido (6 fixes + 3 testes = 9 commits), seguindo Conventional Commits do CLAUDE.md (`🐛 fix(speaker): ...` / `✅ test(speaker): ...`). Cada commit referencia o ID (`WR-01`, `WR-02`, `IN-04`...) no body. Permite revert cirúrgico.

### POL-02: HUMAN-UAT da Phase 89

- **D-05:** Conduzir os 3 testes via sessão `/gsd:verify-work 90` guiada quando a Phase 90 chegar ao step de UAT. Os testes são copiados de `.planning/milestones/v3.5-phases/89-speaker-recognition/89-HUMAN-UAT.md` para `90-HUMAN-UAT.md` no diretório da Phase 90; resultados são marcados ao vivo durante a sessão.

- **D-06:** Falha em qualquer um dos 3 testes bloqueia a Phase 90. Cria-se sub-task de fix dentro da própria Phase 90, corrige, re-testa. Phase 90 só fecha com 3/3 pass.

- **D-07:** Os 3 testes a executar (SPK-02, SPK-03, SPK-08, SPK-10):
  1. Enrollment real via microfone (SPK-10): `/config → Speakers → Adicionar perfil`, 5 utterances ~4s cada, verificar `~/.jarvis/speakers/{nome}.npy` com shape `(256,)` float32.
  2. Identificação ao vivo (SPK-02, SPK-08): perfil enrolled + `speaker_recognition_enabled=true`, log `[SPK] {nome} ({score}) -> {nome}`, prefixo `[{nome}]:` na mensagem, header `x-jarvis-speaker={nome}`.
  3. Threshold rejeita voz desconhecida (SPK-03): voz diferente fala, `name=unknown` no log, prefixo `[unknown]:` ou `[{candidate}?]:` se score>0 mas <0.75.

### POL-03: Menu `/config` Hierárquico

- **D-08:** 5 grupos no root menu, sem "Advanced" separado: **LLM / Voice / Memory / Speakers / System**.
  - **Voice** agrega: Whisper model, TTS provider, Voice mode, Voz Kokoro, Audio referência (condicional ao provider=chatterbox).
  - **Speakers** agrega: Reconhecimento on/off, Perfis CRUD.
  - **System** agrega: Confirmar planos, Debug eventos, Progresso tarefas.
  - **LLM** (placeholder): hoje 100% via `.env` (decisão v3.1 SIMP-01..04). Submenu mostra mensagem `(LLM configurado via .env — ver docs)` e `0. Voltar`. Phase 92 (OpenRouter) pode adicionar conteúdo real.
  - **Memory** (placeholder): submenu existe mas mostra `(em breve — v3.6 Phase 93+)` e `0. Voltar`. Estrutura pronta para Phase 93/94 popular sem nova reorganização do menu.

- **D-09:** Navegação: `0 = voltar/sair` em todos os níveis. No root, `0. Sair` fecha o menu; em submenus, `0. Voltar` volta um nível. Enter vazio cancela edição em prompts (padrão atual mantido). `KeyboardInterrupt`/`EOFError` em qualquer nível retorna ao chat (comportamento atual).

- **D-10:** Estrutura de código: manter as funções `_menu_whisper_model`, `_menu_tts_provider`, `_menu_voice_mode`, `_menu_kokoro_voice`, `_menu_chatterbox_audio_ref`, `_menu_speaker_recognition`, `_menu_speaker_profiles` existentes (`apps/desktop-py/src/jarvis_desktop/chat.py:901-1230`). Adicionar funções novas `_menu_group_llm`, `_menu_group_voice`, `_menu_group_memory`, `_menu_group_speakers`, `_menu_group_system`. `_show_config_menu` vira router para os groups. Diff minimizado — sem refactor para registry declarativo (risco de regressão nos itens existentes).

- **D-11:** Breadcrumb visível no header de cada submenu: `Config > Voice`, `Config > Speakers`, etc. Header com largura fixa (40 chars) seguindo o estilo atual de `console.print("-" * 40)`.

- **D-12:** Cobertura de teste — `tests/test_config_menu.py` ganha testes de navegação (entrar no submenu, voltar, sair), reusando o pattern existente de input mocking via `monkeypatch` em `ui.get_input`.

### POL-04: Teste E2E em CI

- **D-13:** Fixture de áudio: 1 arquivo `.wav` curto (3s, 16kHz mono, ~96KB) commitado em `apps/desktop-py/tests/fixtures/hello.wav`. Conteúdo: palavra PT-BR simples (ex: "olá jarvis"). `sounddevice.rec` é monkeypatched para retornar o array carregado via `soundfile.read`.

- **D-14:** Escopo: STT real (faster-whisper transcreve o WAV), gateway HTTP mockado via `pytest-httpx` retornando SSE chunks pré-definidos do LLM, TTS real (Kokoro gera áudio) mas com `sounddevice.play` mockada para não tocar. Cobre PTT → STT → LLM(mock) → TTS no formato e2e que pode quebrar com refactor.

- **D-15:** Localização: novo arquivo `apps/desktop-py/tests/test_e2e_pipeline.py` + novo workflow `.github/workflows/desktop-py-tests.yml` rodando `uv run pytest` em push/PR. Marker `@pytest.mark.e2e` separa do unit suite (rodar isolado com `pytest -m e2e`); unit suite continua passando com `pytest -m "not e2e"`.

- **D-16:** Escopo mínimo viável de modos: apenas PTT (modo mais determinístico, sem VAD/wake word). 1 teste: `test_ptt_full_pipeline_with_mocked_llm`. POL-04 menciona PTT explicitamente; wake word e always-listening são variantes do mesmo wiring — risco/benefício baixo de duplicar agora. Pode ser estendido em milestone futuro se houver regressão.

- **D-17:** Modelo Whisper no CI: `tiny` (~75MB, ~1s init em CPU). Asserção do teste valida que a transcrição produzida é não-vazia e contém pelo menos uma palavra reconhecível do WAV — não exige match exato. Modelo é cacheado entre runs via `actions/cache@v4` em `~/.cache/huggingface` para reduzir tempo de subsequent runs.

- **D-18:** Asserções do teste E2E:
  1. STT transcreveu (string não vazia após `transcribe()`).
  2. Request HTTP foi disparada para o gateway com headers corretos (`Content-Type`, `x-jarvis-speaker` se aplicável).
  3. SSE chunks foram parseados e tokens acumulados.
  4. TTS recebeu o texto completo do LLM (verificar via mock spy em `sounddevice.play`).
  5. UI state foi atualizado em sequência correta (`listening → thinking → speaking → idle`).

### Claude's Discretion

- Naming exato dos commits (desde que sigam Conventional Commits + emoji do CLAUDE.md).
- Estilo do breadcrumb (símbolos `>`, `›`, ou `/` — Claude escolhe).
- Detalhes de implementação dos novos testes (fixtures, asserts específicos).
- Conteúdo exato do WAV fixture (Claude grava/gera ou pede sample real do usuário durante execução).
- Cache key do GH Actions (`runs-on`, OS, python version).

### Folded Todos

Nenhum — busca por todos relacionados à Phase 90 retornou 0 matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Código revisado (POL-01)
- `.planning/milestones/v3.5-phases/89-speaker-recognition/89-REVIEW.md` — relatório completo dos 13 findings (6 warnings + 7 info), com fix sugerido em cada um.
- `apps/desktop-py/src/jarvis_desktop/speaker.py` — alvo de WR-01..WR-04, WR-06, IN-01..IN-03, IN-07.
- `apps/desktop-py/src/jarvis_desktop/chat.py` — alvo de WR-05 (`_build_speaker_prefix`, linha 536), POL-03 (`_show_config_menu`, linha 833).
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — alvo de IN-03 (`_identify_speaker_safe`, linha 175), IN-07.
- `apps/desktop-py/src/jarvis_desktop/config.py` §218-245 — padrão atômico (`tempfile + os.replace`) referência para WR-01.

### HUMAN-UAT (POL-02)
- `.planning/milestones/v3.5-phases/89-speaker-recognition/89-HUMAN-UAT.md` — os 3 testes a executar (SPK-02, SPK-03, SPK-08, SPK-10).

### Requisitos
- `.planning/REQUIREMENTS.md` §POL-01..POL-04 — texto autoritativo dos 4 requisitos.
- `.planning/ROADMAP.md` §Phase 90 — Success Criteria (4 verdades observáveis).

### Estilo / Convenções
- `CLAUDE.md` §Git Commit Guidelines — Conventional Commits + emoji obrigatórios.
- Decisões prévias relevantes: v3.1 SIMP-01..04 (LLM 100% via `.env`), v3.5 SPK-01..10 (D-08/D-11 hybrid speaker injection).

### Sem ADRs externos
Os 4 requisitos da Phase 90 estão totalmente capturados pelo REVIEW.md, HUMAN-UAT.md, REQUIREMENTS.md e este CONTEXT.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/desktop-py/src/jarvis_desktop/config.py:218-245` — `save_config` com pattern `tempfile.NamedTemporaryFile + os.replace`. Modelo direto para WR-01.
- `apps/desktop-py/src/jarvis_desktop/chat.py:901-1230` — 7 funções `_menu_*` existentes, todas auto-contidas. POL-03 só precisa adicionar wrappers `_menu_group_*` que chamam essas funções.
- `apps/desktop-py/tests/conftest.py` — `tmp_home` fixture, `mock_voice_encoder` fixture. IN-04/05/06 reusam diretamente.
- `apps/desktop-py/tests/test_config_menu.py` — pattern de monkeypatch em `ui.get_input` para simular entrada interativa. POL-03 navigation tests seguem.

### Established Patterns
- Resposta em pt-BR para todas as strings de UI/menu (CLAUDE.md, memory `feedback_response_language`).
- Singleton thread-safe com `threading.Lock` (speaker.py, stt.py, tts.py).
- `_console()` / `ui.get_console()` para todo output formatado (rich).
- pytest com `xfail` para testes que dependem de hardware (audio devices) — pattern de `test_stt.py`, `test_tts.py`.

### Integration Points
- `chat.py::_show_config_menu` é o root da reorganização (POL-03).
- `voice_modes.py::_identify_speaker_safe` é onde IN-03 e IN-07 mexem.
- `tests/conftest.py` ganha fixture nova `e2e_audio_wav` para o POL-04 (carrega `tests/fixtures/hello.wav` via soundfile).
- Novo workflow `.github/workflows/desktop-py-tests.yml` é o primeiro workflow Python do repo (atualmente só existe `ci-lockfile-ban.yml`).

</code_context>

<specifics>
## Specific Ideas

- WAV fixture: palavra PT-BR simples ("olá jarvis" ou "teste") para que `tiny` Whisper transcreva confiavelmente em CPU no GH Actions runner.
- Breadcrumb format sugerido: `Config > Voice` (com `>` espaçado), consistente com o estilo `console.print("-" * 40)` atual.
- Marker pytest `@pytest.mark.e2e` segue padrão amplamente adotado (slow tests).
- Cache key do GH Actions: `huggingface-${{ runner.os }}-tiny-v1` (manual bump quando o set de modelos mudar).

</specifics>

<deferred>
## Deferred Ideas

- **Warmup proativo do VoiceEncoder em `init_voice_modes`** (IN-01) — análogo ao `_warmup_worker` do Chatterbox. Aceito como tech-debt; pode entrar em Phase 94 quando per-speaker memory tocar a área.
- **Console prints fora do lock em `_get_encoder`** (IN-02) — micro-otimização contra deadlock teórico; sem evidência de problema real.
- **Log `[SPK]` gated por `debug_events`** (IN-03) — aceito como tech-debt; resolve poluição de terminal em uso prolongado, não é crítico para Phase 90.
- **Import top-level de `speaker` em `voice_modes.py`** (IN-07) — aceito; o try/except atual cobre o caso mas esconde `ImportError` em startup. Ajustar quando houver bug real de import.
- **Testes E2E para wake word e always-listening modes** — Phase 90 cobre só PTT. Pode ser estendido em milestone futuro se surgir regressão nesses modos.
- **Read-only do `.env` no submenu LLM** — alternativa a placeholder pura: mostrar provider/modelo atuais do `.env` sem permitir edição. Pode ser feito na Phase 92 junto com OpenRouter.

### Reviewed Todos (not folded)
Nenhum — não havia todos relevantes à Phase 90 (`todo match-phase 90` retornou 0 matches).

</deferred>

---

*Phase: 90-polish-stability*
*Context gathered: 2026-06-02*
