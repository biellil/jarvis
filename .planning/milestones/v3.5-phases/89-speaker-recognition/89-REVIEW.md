---
phase: 89-identifica-o-de-voz-speaker-recognition-backlog
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - apps/desktop-py/pyproject.toml
  - apps/desktop-py/src/jarvis_desktop/chat.py
  - apps/desktop-py/src/jarvis_desktop/config.py
  - apps/desktop-py/src/jarvis_desktop/speaker.py
  - apps/desktop-py/src/jarvis_desktop/voice_modes.py
  - apps/desktop-py/tests/conftest.py
  - apps/desktop-py/tests/test_chat.py
  - apps/desktop-py/tests/test_config_menu.py
  - apps/desktop-py/tests/test_speaker.py
  - apps/desktop-py/tests/test_voice_modes.py
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 89: Relatório de Code Review — Identificação de Voz (Speaker Recognition)

**Revisado:** 2026-05-29
**Profundidade:** standard
**Arquivos revisados:** 10
**Status:** issues_found

## Resumo

O Phase 89 entrega o módulo `speaker.py` com API limpa (identify/enroll/CRUD), singleton thread-safe do `VoiceEncoder`, sanitização de nome de perfil contra path traversal (T-89-01-01), e integração de pipeline em três modos de voz (`ptt`, `wake_word`, `always_listening`) via `_identify_speaker_safe`. A injeção híbrida `[Name]:` / `[Name?]:` / `[unknown]:` no `chat._stream_response` está coerente com D-08/D-11, com header `x-jarvis-speaker` propagado ao gateway.

**Pontos fortes:**
- Defesa em camadas no `_safe_profile_name` (rejeita `..` / `/` / `\` / leading `.` antes do regex ASCII whitelist).
- Singleton com `threading.Lock` no padrão correto (lazy init, double-check dentro do lock).
- `_identify_speaker_safe` faz wrap defensivo: `except Exception` impede que falha do resemblyzer derrube o voice loop (T-89-03-04 honrado).
- Cobertura de teste boa para o happy path (SPK-01 a SPK-06, SPK-10) e para o caminho de path traversal no menu.

**Concerns principais (nenhum crítico):**
1. `save_profile` faz `np.save()` direto, sem padrão atômico (config.py usa `tempfile + os.replace` — inconsistência).
2. `np.load()` em `load_profile` não passa `allow_pickle=False` explícito (defesa em profundidade contra `.npy` malicioso).
3. `identify_speaker` não tem `try/except` por perfil — um `.npy` corrompido derruba toda a identificação.
4. `_build_speaker_prefix` aceita parâmetro `threshold` que nunca é usado (dead parameter).
5. Cobertura de teste insuficiente para falhas de borda: corruptão de perfil, exaustão de retries no enrollment, e fuzz de `_safe_profile_name` direto.

---

## Warnings

### WR-01: `save_profile` não é atômico — risco de perfil corrompido em crash

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:124-130`
**Issue:** `np.save(str(path), embedding.astype(np.float32))` escreve diretamente no arquivo final. Se o processo for morto entre o open e o close (Ctrl+C durante enrollment, kill -9, queda de energia), `~/.jarvis/speakers/{name}.npy` fica truncado/inválido — e o próximo `identify_speaker` carrega um array com shape errado, causando exceção dentro de `_cosine_similarity` (ou crash em `np.linalg.norm` antes). O projeto já tem precedente do padrão correto: `config.save_config` (config.py:218-245) usa `tempfile.NamedTemporaryFile` + `os.replace`. Aplicar o mesmo padrão aqui.

**Fix:**
```python
import os
import tempfile

def save_profile(name: str, embedding: np.ndarray) -> None:
    safe = _safe_profile_name(name)
    dir_ = _speakers_dir()
    dir_.mkdir(parents=True, exist_ok=True)
    final_path = dir_ / f"{safe}.npy"

    # Atomic write: temp file no mesmo diretório (mesmo filesystem) + os.replace
    fd, tmp_path = tempfile.mkstemp(dir=str(dir_), suffix=".npy.tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            np.save(f, embedding.astype(np.float32))
        os.replace(tmp_path, final_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
```

---

### WR-02: `np.load` sem `allow_pickle=False` explícito

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:137`
**Issue:** `np.load(str(path))` usa o default do NumPy, que é `allow_pickle=False` desde a 1.16.3 — mas isso é mudança histórica que poderia ser revertida ou afetada por monkey-patching. Como os arquivos `.npy` vivem em `~/.jarvis/speakers/` (diretório do usuário, escrito apenas pelo próprio JARVIS), o risco é baixo, mas defesa em profundidade contra `.npy` malicioso plantado fora-de-banda (ex.: usuário recebe arquivo `.npy` de terceiros e copia para a pasta) recomenda explicitar a flag. Sem ela, um `.npy` com pickle embutido executaria código arbitrário em `np.load`.

**Fix:**
```python
def load_profile(name: str) -> np.ndarray:
    safe = _safe_profile_name(name)
    path = _speakers_dir() / f"{safe}.npy"
    return np.load(str(path), allow_pickle=False)
```

Aplicar também em `load_all_profiles` indiretamente (via load_profile, fica coberto).

---

### WR-03: `identify_speaker` derruba pipeline se um perfil estiver corrompido

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:192-207`
**Issue:** `load_all_profiles()` chama `load_profile(name)` para cada arquivo; se um único `.npy` estiver corrompido (shape inválido, EOF inesperado), `np.load` levanta `ValueError`/`EOFError` e o turno inteiro é perdido. Pior: o voice loop pega a exceção via `_identify_speaker_safe` (que captura tudo), retorna `None`, e o usuário não tem feedback sobre qual perfil está quebrado — apenas que "identificação falhou". Iterar por perfil com `try/except` permite continuar com os demais e logar qual está corrompido.

**Fix:**
```python
def identify_speaker(audio: np.ndarray, config: "JarvisConfig") -> dict[str, Any]:
    from resemblyzer import preprocess_wav

    encoder = _get_encoder()
    processed = preprocess_wav(audio, source_sr=_SAMPLE_RATE)
    turn_emb = encoder.embed_utterance(processed)

    best_name = "unknown"
    best_score = 0.0
    has_any = False
    for name in list_profiles():
        try:
            profile_emb = load_profile(name)
        except (ValueError, EOFError, OSError) as exc:
            _console().print(f"[SPK] perfil '{name}' corrompido — ignorando ({exc})")
            continue
        has_any = True
        score = _cosine_similarity(turn_emb, profile_emb)
        if score > best_score:
            best_score = score
            best_name = name

    if not has_any:
        return {"name": "unknown", "confidence": 0.0, "is_known": False, "candidate_name": "unknown"}

    threshold = float(getattr(config, "speaker_threshold", 0.75))
    is_known = best_score >= threshold
    return {
        "name": best_name if is_known else "unknown",
        "confidence": best_score,
        "is_known": is_known,
        "candidate_name": best_name,
    }
```

---

### WR-04: `enroll_speaker` falha silenciosamente — sem retorno booleano nem exceção

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:246-272`
**Issue:** Quando o loop de retries esgota (3 tentativas), a função apenas imprime "Abortando" e faz `return` (com `None` implícito). O caller `_enroll_speaker_via_menu` (chat.py:1091-1096) não tem como saber se o enrollment teve sucesso, então qualquer lógica de retry/feedback futura precisa parsear stdout. Pior: o teste `test_enroll_saves_npy` confia em `record_until_silence` retornar áudio suficiente — não há cobertura para o caminho de retry esgotado. Recomendado retornar `bool` ou levantar exceção específica.

**Fix:**
```python
class EnrollmentAborted(RuntimeError):
    """Enrollment cancelado por falha de captura após retries."""


def enroll_speaker(name: str, config: "JarvisConfig", n_utterances: int = _DEFAULT_N_UTTERANCES) -> None:
    ...
    if captured is None:
        raise EnrollmentAborted(
            f"Falha ao gravar amostra {slot} após {_MAX_RETRIES_PER_SLOT} tentativas"
        )
    ...
```

E em `_enroll_speaker_via_menu` adicionar `except EnrollmentAborted` (ou refatorar para `try/except RuntimeError`, que já existe).

---

### WR-05: `_build_speaker_prefix` aceita `threshold` mas nunca usa — confusão de API

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/chat.py:460-483`
**Issue:** O parâmetro `threshold` é declarado, documentado como "atualmente não usado diretamente", mas é passado em `chat_loop` (linha 692). Isso introduz ruído de API: leitores presumem que o threshold afeta o resultado, mas ele é ignorado. Ou remova o parâmetro (e a chamada em chat_loop linha 691-693), ou implemente a política dependente do score bruto que a docstring promete.

**Fix:** Remover o parâmetro até existir uso real:
```python
def _build_speaker_prefix(speaker_result) -> str:
    if speaker_result is None:
        return ""
    if speaker_result.get("is_known"):
        return f"[{speaker_result['name']}]: "
    candidate = speaker_result.get("candidate_name", "unknown")
    if candidate and candidate != "unknown":
        return f"[{candidate}?]: "
    return "[unknown]: "
```

E em `chat_loop` linha 690-693:
```python
prefix = _build_speaker_prefix(speaker_result)
```

---

### WR-06: `list_profiles` não valida nomes — bypass parcial da sanitização

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:140-145`
**Issue:** `list_profiles` retorna `p.stem` para qualquer `*.npy` no diretório, sem filtrar via `_safe_profile_name`. Se o usuário colocar manualmente `evil..name.npy` em `~/.jarvis/speakers/` (cenário de baixa probabilidade, mas plausível em backup/restore), o nome aparece no menu. Tentativas de `delete_profile(name)` ou `load_profile(name)` subsequentes rejeitariam o nome — mas a exibição já vazou o nome inválido para a UI, e o usuário fica preso (não consegue remover via menu). Filtrar via `_safe_profile_name` com try/except no list_profiles fecha o gap.

**Fix:**
```python
def list_profiles() -> list[str]:
    dir_ = _speakers_dir()
    if not dir_.exists():
        return []
    result = []
    for p in dir_.glob("*.npy"):
        try:
            safe = _safe_profile_name(p.stem)
            if safe == p.stem:  # garante que stem não foi alterado
                result.append(safe)
        except ValueError:
            continue  # silenciosamente ignora nomes inválidos
    return sorted(result)
```

Ou alternativa: emitir aviso quando ignorar (mais transparente para o usuário).

---

## Info

### IN-01: Singleton lock segura inicialização "pesada" — caller pode bloquear ~30s

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:92-108`
**Issue:** `_get_encoder` mantém `_encoder_lock` durante `VoiceEncoder()` (que faz download/load de ~30MB e roda warmup). Se duas threads tentarem chamar `identify_speaker` simultaneamente no primeiro uso, a segunda fica bloqueada todo o tempo de init. Isso é correto (evita double-init), mas o pattern usado em `tts.py` (warmup em thread separada) seria mais responsivo para o voice loop. Aceitável para v1 — este é o padrão de `stt.py`.

**Fix:** Considerar warmup proativo em `init_voice_modes`, análogo a `_warmup_worker` do chatterbox.

---

### IN-02: `_console().print` durante init segurando lock pode causar reentrância

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/speaker.py:105-107`
**Issue:** O `_console().print(...)` é chamado de dentro do `with _encoder_lock`. Se `ui.get_console()` ou o sink do console resolverem chamar speaker (improvável mas plausível em arquiteturas pluggable), seria deadlock. Custo zero mover os prints para fora do `with`:

**Fix:**
```python
def _get_encoder() -> "VoiceEncoder":
    global _encoder
    with _encoder_lock:
        if _encoder is not None:
            return _encoder
        try:
            from resemblyzer import VoiceEncoder
        except ImportError as exc:
            raise RuntimeError(...) from exc
    # Prints fora do lock (ainda dentro do contrato de lazy init thread-safe)
    _console().print("[SPK] Carregando modelo de voz (resemblyzer GE2E ~30MB)...")
    encoder = VoiceEncoder()
    _console().print("[SPK] Pronto.")
    # Re-aquire lock para publicar
    with _encoder_lock:
        if _encoder is None:
            _encoder = encoder
    return _encoder
```

Trade-off: pode instanciar 2× em race extremo. Padrão atual é mais simples e seguro — só vale mudar se houver evidência de problema real.

---

### IN-03: `_identify_speaker_safe` loga `[SPK] {candidate} ({confidence}) -> {name}` sem flag

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/voice_modes.py:177-180`
**Issue:** A linha "[SPK] Biel (0.85) -> Biel" é impressa em todo turno quando speaker_recognition_enabled=True. Pode poluir o terminal em uso prolongado. Considerar gate por `config.debug_events` ou um log próprio:

**Fix:**
```python
if getattr(config, "debug_events", False):
    _console().print(f"[SPK] {result['candidate_name']} ({result['confidence']:.2f}) -> {result['name']}")
```

Ou imprimir apenas em transições (mudança de candidate vs. último turno).

---

### IN-04: Cobertura de teste insuficiente para `_safe_profile_name` direto

**Arquivo:** `apps/desktop-py/tests/test_speaker.py`
**Issue:** O único teste de sanitização (`test_enroll_speaker_via_menu_rejects_invalid_name` em test_config_menu.py) cobre apenas o caso `"../etc/passwd"` via menu. Faltam testes diretos de `_safe_profile_name` para:
- Caminho absoluto: `/etc/passwd`
- Backslash Windows: `..\\Windows\\System32`
- Leading dot: `.hidden`
- Nome vazio depois de strip: `"   "` ou `""`
- Caracteres unicode: `"José"` (rejeitado pelo regex ASCII)
- Nome no limite: 64 chars (ok) vs 65 chars (rejeitado)
- Caracteres especiais permitidos: `"a-b_c"` (deveria passar)

**Fix:** Adicionar `tests/test_speaker.py::test_safe_profile_name` cobrindo cada categoria com `pytest.mark.parametrize`.

---

### IN-05: Sem teste para corruptão de perfil (`.npy` inválido)

**Arquivo:** `apps/desktop-py/tests/test_speaker.py`
**Issue:** Nenhum teste cobre o caminho onde `load_profile` falha (ex.: arquivo truncado, shape errado). Esta é uma das motivações principais do WR-03. Sugestão:

**Fix:**
```python
def test_identify_speaker_skips_corrupted_profile(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    # Perfil válido + perfil corrompido lado a lado
    speaker.save_profile("alice", np.ones(256, dtype=np.float32) / np.sqrt(256))
    bad_path = tmp_home / ".jarvis" / "speakers" / "bad.npy"
    bad_path.write_bytes(b"NOT A VALID NPY")

    config = JarvisConfig(speaker_recognition_enabled=True)
    result = speaker.identify_speaker(np.zeros(16000, dtype=np.float32), config)

    # Deve completar sem exceção e considerar apenas alice
    assert result["candidate_name"] in ("alice", "unknown")
```

---

### IN-06: Sem teste para retry esgotado no enrollment

**Arquivo:** `apps/desktop-py/tests/test_speaker.py`
**Issue:** WR-04 nota que `enroll_speaker` retorna silenciosamente após 3 falhas. Não há teste verificando esse comportamento (nem que o perfil NÃO foi escrito). Cobrir com:

**Fix:**
```python
def test_enroll_aborts_after_max_retries(tmp_home, mock_voice_encoder, monkeypatch):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    # Áudio sempre curto demais (1s < 2s mínimo) -> dispara retry
    short_audio = np.zeros(16000, dtype=np.float32)
    monkeypatch.setattr("jarvis_desktop.stt.record_until_silence", lambda **kw: short_audio)

    config = JarvisConfig()
    speaker.enroll_speaker("test_user", config, n_utterances=1)

    # Perfil NÃO deve ter sido criado
    assert not (tmp_home / ".jarvis" / "speakers" / "test_user.npy").exists()
```

---

### IN-07: `voice_modes._identify_speaker_safe` — `from jarvis_desktop import speaker as spk` dentro do try

**Arquivo:** `apps/desktop-py/src/jarvis_desktop/voice_modes.py:175-176`
**Issue:** O import está dentro do `try/except Exception`, o que esconde `ImportError` do `speaker.py` (caso o módulo tenha erro de sintaxe ou dependência faltando). Em vez de surfar um erro claro no startup, o usuário vê "[SPK] Identificação falhou: ..." em runtime — o que dificulta diagnóstico. O import top-level seria mais transparente (especialmente porque `speaker.py` tem `from __future__ import annotations` e usa `TYPE_CHECKING` para `resemblyzer`, então não há custo de import-time para a dep pesada).

**Fix:**
```python
# No topo do voice_modes.py
from jarvis_desktop import speaker as spk

def _identify_speaker_safe(audio, config):
    if not getattr(config, "speaker_recognition_enabled", False):
        return None
    try:
        result = spk.identify_speaker(audio, config)
        ...
```

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
