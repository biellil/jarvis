# Phase 90: Resolução do Code Review da Phase 89

**Data:** 2026-06-02
**Source:** `.planning/milestones/v3.5-phases/89-speaker-recognition/89-REVIEW.md`
**Plan:** [90-01-PLAN.md](./90-01-PLAN.md)
**Status:** 9 fixed (6 warnings + 3 testes), 4 accepted (info)

## Resumo

| Tipo | Total | Fixed | Accepted |
|------|-------|-------|----------|
| Warnings | 6 | 6 | 0 |
| Info | 7 | 3 | 4 |
| **Total** | **13** | **9** | **4** |

## Tabela de Resolução

| ID | Status | Commit SHA | Rationale |
|----|--------|------------|-----------|
| WR-01 | fixed | 776baf0b | save_profile agora atômico via tempfile.mkstemp + os.replace (T-90-01-01 Tampering) |
| WR-02 | fixed | 2e4f3743 | allow_pickle=False explícito em load_profile — defesa em profundidade contra T-90-01-02 (Elevation of Privilege) |
| WR-03 | fixed | bf644d30 | identify_speaker tolera .npy corrompido por perfil (try/except ValueError/EOFError/OSError + log) — mitiga T-90-01-03 (DoS) |
| WR-04 | fixed | 0dc59700 | enroll_speaker levanta EnrollmentAborted ao esgotar retries — sinal explícito de falha vs return silencioso |
| WR-05 | fixed | bf62df2e | Removido parâmetro threshold morto em _build_speaker_prefix; speaker.identify_speaker já aplica threshold internamente |
| WR-06 | fixed | 6ae95310 | list_profiles filtra nomes via _safe_profile_name; perfis plantados fora-de-banda (`evil..name.npy`) não vazam para UI (T-90-01-04) |
| IN-01 | accepted | — | Warmup proativo do VoiceEncoder é micro-otimização; padrão atual (lazy + lock) é seguro. Pode entrar em Phase 94 quando per-speaker memory tocar a área. |
| IN-02 | accepted | — | Prints fora do lock evitam deadlock teórico mas sem evidência de problema real; padrão atual é mais simples e seguro. |
| IN-03 | accepted | — | Log `[SPK]` gated por debug_events é polimento de UX; aceito como tech-debt para uso prolongado. |
| IN-04 | fixed | f3ca987e | test_safe_profile_name parametrizado com 10 casos: absolute path, backslash, leading dot, vazio, só-espaço, unicode, 64/65 chars, a-b_c, valid_name |
| IN-05 | fixed | a3bdcaa5 | test_identify_speaker_skips_corrupted_profile valida WR-03 com perfil válido + .npy malformado lado a lado |
| IN-06 | fixed | 8be16840 | test_enroll_aborts_after_max_retries valida WR-04 com monkeypatch de áudio curto + assertion de não-criação do .npy |
| IN-07 | accepted | — | Import top-level em voice_modes esconderia ImportError em startup; try/except atual já cobre. Ajustar quando houver bug real de import. |

## Auditoria

Verificar SHAs:

```bash
git log --oneline -10 apps/desktop-py/src/jarvis_desktop/speaker.py \
                     apps/desktop-py/src/jarvis_desktop/chat.py \
                     apps/desktop-py/tests/test_speaker.py
```

Verificar testes:

```bash
cd apps/desktop-py && uv run pytest tests/test_speaker.py tests/test_chat.py -v
```

Resultado esperado: 19 testes em test_speaker.py + 12 em test_chat.py — todos PASSED.

## Próximos passos

Phase 90 continua com:

- **90-02 (POL-02):** HUMAN-UAT speaker recognition com hardware real (3 testes pendentes).
- **90-03 (POL-03):** menu CLI para ajustes de threshold em produção.
- **90-04 (POL-04):** revisões adicionais pós-checker.

Per-speaker memory (Phase 94) poderá assumir IN-01 (warmup proativo) caso evidência empírica justifique.
