# Phase 90: Polish & Stability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 90-polish-stability
**Areas discussed:** Critério dos 13 findings (POL-01), Execução do HUMAN-UAT (POL-02), UX do /config hierárquico (POL-03), Estratégia E2E em CI (POL-04)

---

## Área inicial: seleção

| Option | Description | Selected |
|--------|-------------|----------|
| Critério dos 13 findings (POL-01) | Política de fix vs aceite | ✓ |
| Execução do HUMAN-UAT (POL-02) | Conduzir 3 testes de hardware | ✓ |
| UX do /config hierárquico (POL-03) | Navegação e agrupamentos | ✓ |
| Estratégia E2E em CI (POL-04) | Mock de áudio, escopo, localização | ✓ |

**User's choice:** Todas as 4 áreas.

---

## Critério dos 13 findings (POL-01)

### Pergunta 1: Política para os 6 warnings

| Option | Description | Selected |
|--------|-------------|----------|
| Corrigir todos os 6 | WR-01 a WR-06 — robustez total antes da Phase 94 | ✓ |
| Só os 4 de segurança/integridade | WR-01, WR-02, WR-03, WR-06 — aceitar WR-04 e WR-05 | |
| Eu escolho um a um | Caso a caso | |

**User's choice:** Corrigir todos os 6 (Recomendado).

### Pergunta 2: Política para os 7 info items

| Option | Description | Selected |
|--------|-------------|----------|
| Corrigir só cobertura de testes (IN-04, IN-05, IN-06) | Aceitar IN-01/02/03/07 como micro-otimizações | ✓ |
| Corrigir testes + log gating + import top-level | Inclui IN-03 e IN-07 | |
| Aceitar todos com rationale | Documentar e seguir | |

**User's choice:** Corrigir só cobertura de testes (Recomendado).

### Pergunta 3: Audit trail

| Option | Description | Selected |
|--------|-------------|----------|
| REVIEW-FIX.md no diretório da Phase 90 | Padrão /gsd:code-review-fix | ✓ |
| Editar 89-REVIEW.md inline | Checkmarks no doc original | |
| Ambos | REVIEW-FIX.md + cross-link | |

**User's choice:** REVIEW-FIX.md no diretório da Phase 90 (Recomendado).

### Pergunta 4: Estrutura de commits

| Option | Description | Selected |
|--------|-------------|----------|
| 1 commit por finding | 9 commits atômicos, granularidade máxima | ✓ |
| Agrupar por categoria | 2 commits (1 fix + 1 test) | |

**User's choice:** 1 commit por finding (Recomendado).

---

## Execução do HUMAN-UAT (POL-02)

### Pergunta 1: Modo de condução

| Option | Description | Selected |
|--------|-------------|----------|
| Sessão /gsd:verify-work guiada | Conduzido passo a passo, doc atualizado ao vivo | ✓ |
| Checklist offline em 90-HUMAN-UAT.md | Usuário edita doc manualmente | |
| Auto-validar via /gsd:add-tests | Testes automatizados substituem UAT | |

**User's choice:** Sessão /gsd:verify-work guiada (Recomendado).

### Pergunta 2: Política de falha

| Option | Description | Selected |
|--------|-------------|----------|
| Bloqueia a Phase 90 — sub-task de fix | Phase só fecha com 3/3 pass | ✓ |
| Documentar e aceitar como tech-debt | Phase fecha com UAT parcial | |
| Depende do teste | Threshold (SPK-03) crítico; outros podem virar tech-debt | |

**User's choice:** Bloqueia a Phase 90 — criar fix sub-task (Recomendado).

---

## UX do /config hierárquico (POL-03)

### Pergunta 1: Agrupamento

| Option | Description | Selected |
|--------|-------------|----------|
| Grupos do ROADMAP, sem 'Advanced' separado | LLM/Voice/Memory/Speakers/System | ✓ |
| Grupos do ROADMAP com 'Advanced' separado | LLM/Voice/Memory/Speakers/Advanced | |
| Você decide os grupos | Custom | |

**User's choice:** Grupos do ROADMAP, sem 'Advanced' separado (Recomendado).

### Pergunta 2: Navegação

| Option | Description | Selected |
|--------|-------------|----------|
| 0 = voltar/sair em todos os níveis | Consistente com pattern atual | ✓ |
| 0 = sair, b = voltar | Mais rápido mas duas teclas próximas | |
| Esc/Ctrl+C cancela | Confunde com 'sair do JARVIS' | |

**User's choice:** 0 = voltar/sair em todos os níveis (Recomendado).

### Pergunta 3: Estrutura de código

| Option | Description | Selected |
|--------|-------------|----------|
| Manter _menu_* existentes + adicionar _menu_group_* | Diff minimizado | ✓ |
| Refatorar para registry declarativo | Mais limpo mas refactor maior | |

**User's choice:** Manter funções _menu_* existentes, adicionar _menu_group_* (Recomendado).

### Pergunta 4: Submenu Memory vazio

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder com mensagem | "(em breve — v3.6 Phase 93+)" | ✓ |
| Omitir até ter features | 4 grupos hoje, Phase 93 adiciona | |
| Comando /memory paralelo | Sem item no menu | |

**User's choice:** Mostrar 'Memory' como placeholder com mensagem (Recomendado).

### Pergunta 5: Submenu LLM

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder igual Memory | "(LLM configurado via .env)" | ✓ |
| Migrar leitura do .env para o menu (read-only) | Visibilidade sem edição | |
| Adiar LLM para Phase 92 | 4 grupos hoje | |

**User's choice:** Placeholder igual Memory (Recomendado).

---

## Estratégia E2E em CI (POL-04)

### Pergunta 1: Simular áudio de entrada

| Option | Description | Selected |
|--------|-------------|----------|
| WAV fixture pré-gravado | ~100KB no repo, Whisper roda em áudio real | ✓ |
| Senoide/ruído sintético gerado em runtime | Zero bytes mas obriga mockar transcribe() | |
| Mockar stt.transcribe() direto | Rápido, determinístico, mas mais wiring que E2E | |

**User's choice:** WAV fixture pré-gravado (Recomendado).

### Pergunta 2: Escopo da pipeline real

| Option | Description | Selected |
|--------|-------------|----------|
| STT real, LLM mockado, TTS real-mas-silencioso | Cobre o e2e que pode quebrar | ✓ |
| Tudo mockado exceto wiring | Rápido mas frágil como detecção de regressão | |
| Pipeline real ponta-a-ponta | Exige docker compose no CI — setup pesado | |

**User's choice:** STT real, LLM mockado, TTS real-mas-silencioso (Recomendado).

### Pergunta 3: Localização e CI

| Option | Description | Selected |
|--------|-------------|----------|
| tests/test_e2e_pipeline.py + novo workflow | Marker @pytest.mark.e2e separa do unit suite | ✓ |
| Misturar no test_voice_modes.py existente | Sem novo workflow — não cumpre "em CI" | |
| tests/e2e/ separado com pytest plugin | Mais organizado mas overhead inicial | |

**User's choice:** tests/test_e2e_pipeline.py + novo workflow (Recomendado).

### Pergunta 4: Modos cobertos

| Option | Description | Selected |
|--------|-------------|----------|
| Só PTT | Mais determinístico; POL-04 menciona PTT explicitamente | ✓ |
| PTT + wake word + always-listening | Mais código de mock para a mesma asserção | |
| PTT + wake word | Cobre regressão histórica de VAD-01 | |

**User's choice:** Só PTT (Recomendado).

### Pergunta 5: Whisper model no CI

| Option | Description | Selected |
|--------|-------------|----------|
| tiny | ~75MB, ~1s init, basta para validar wiring | ✓ |
| base | ~150MB, ~2s init, mais preciso | |
| Cachear modelo entre runs | actions/cache@v4 para ~/.cache/huggingface | |

**User's choice:** tiny (Recomendado). Cache também será aplicado (D-17 do CONTEXT).

---

## Claude's Discretion

- Naming exato dos commits (desde que sigam Conventional Commits + emoji).
- Estilo do breadcrumb (símbolos `>`, `›`, `/`).
- Detalhes de implementação dos novos testes (fixtures, asserts).
- Conteúdo exato do WAV fixture (Claude grava/gera ou pede sample durante execução).
- Cache key do GH Actions.

## Deferred Ideas

- Warmup proativo do VoiceEncoder em `init_voice_modes` (IN-01).
- Console prints fora do lock em `_get_encoder` (IN-02).
- Log `[SPK]` gated por `debug_events` (IN-03).
- Import top-level de `speaker` em `voice_modes.py` (IN-07).
- Testes E2E para wake word e always-listening modes.
- Read-only do `.env` no submenu LLM (alternativa a placeholder).
