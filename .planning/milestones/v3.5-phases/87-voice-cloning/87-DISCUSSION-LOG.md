# Phase 87: Voice Cloning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 87-voice-cloning
**Areas discussed:** Config field, Validação de startup, Warmup com referência, /config menu scope

---

## Config field

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| `chatterbox_audio_prompt_path` (str, default "") | Espelha exatamente o param audio_prompt_path da API Chatterbox; prefixo chatterbox_* | ✓ |
| `chatterbox_voice_ref` | Mais curto, mas "ref" ambíguo e não mapeia ao param da API | |
| `voice_ref_path` (Optional[str]) | Genérico/provider-agnostic, mas quebra consistência de tipagem str do config | |
| `cloned_voice_ref_path` + deprecar `cloned_voice_path` | Unifica voice cloning, mas quebra backward compat | |

**User's choice:** `chatterbox_audio_prompt_path` (Recommended)
**Notes:** Nenhuma nota adicional.

---

## Validação de startup

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| `soundfile.info()` em `_start_chatterbox_warmup()` | Já instalado via kokoro, suporta WAV+MP3, expõe .duration | ✓ |
| Só extensão + `os.path.exists()` | Mais simples, sem checar duração — pode causar artefatos silenciosos | |
| `wave` stdlib (WAV only) | Zero deps, mas requer branch manual para MP3 | |
| `mutagen` (nova dep) | Universal mas desnecessário dado soundfile disponível | |

**User's choice:** `soundfile.info()` (Recommended)
**Notes:** Validação ocorre no início de `_warmup_worker()`, antes de criar o engine. Qualquer falha resulta em `_chatterbox_available = False` + warning + `_chatterbox_warmup_event.set()`.

---

## Warmup com referência

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Sim — `prepare_conditionals()` no warmup | Embedding extraído no startup via método público; primeira fala sem cold start | ✓ |
| Não — manter Phase 86 D-04 | Warmup sem referência; cold start parcial ~200-500ms na primeira fala | |
| Condicional — usa se arquivo válido, sem ele se não | Melhor latência, mas mais complexo de implementar e manter | |

**User's choice:** Sim — `prepare_conditionals()` no warmup (Recommended)
**Notes:** Pesquisa identificou que `ChatterboxMultilingualTTS.prepare_conditionals()` armazena resultado em `self.conds`. Passando `audio_prompt_path` a cada `generate()` causaria re-extração ineficiente. Decisão: warmup chama `prepare_conditionals()`, `_chatterbox_speak` chama `generate()` sem `audio_prompt_path`.

---

## /config menu scope

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Não — só campo config | Só `chatterbox_audio_prompt_path` em JarvisConfig; menu 100% em Phase 88 | ✓ |
| Sim — entrada standalone no menu | Item "Arquivo referência Chatterbox" em `/config`; testável interativamente | |
| Sim — antecipar CFGUI-01 + CFGUI-02 completo | Antecipa todo o menu UX; maior risco de retrabalho | |

**User's choice:** Não — só campo config (Recommended)
**Notes:** Consistente com precedente Phase 85 (cloned_voice_path entregue sem menu entry). Phase 88 implementa CFGUI-01 + CFGUI-02 de forma atômica.

---

## Claude's Discretion

- Thread-safety de `prepare_conditionals()` — verificar no source local; envolve com `_lock` se necessário
- Valor exato do `language_id` no warmup com referência
- Tratamento de `soundfile.SoundFileError` vs `Exception` genérica

## Deferred Ideas

- Cache de speaker embedding entre sessões (VCLONE-05) — Future
- Invalidação de `self.conds` em runtime quando path muda — Phase 88
- Menu `/config` para o path (CFGUI-02) — Phase 88
- Chatterbox no provider list (CFGUI-01) — Phase 88
