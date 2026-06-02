# Phase 89: Speaker Recognition — Research

**Researched:** 2026-05-29
**Domain:** Speaker identification — resemblyzer GE2E d-vector embeddings, cosine similarity, enrollment pipeline
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Multi-user — suporte a múltiplos perfis registrados com nomes distintos. ProfileStore gerencia N usuários.
- **D-02:** Cada perfil tem um nome (string) e N embeddings registrados. Armazenados em `~/.jarvis/speakers/`.
- **D-03:** Biblioteca: **resemblyzer**. Modelo GE2E d-vector (~30MB), NumPy-native a 16kHz.
- **D-04:** Comparação por **similaridade coseno** entre embedding do turno atual e embeddings registrados. Speaker com maior similaridade acima do threshold é o identificado.
- **D-05:** Threshold de confiança: Claude's Discretion (researcher verifica; ponto de partida ~0.75).
- **D-06:** Identificação ocorre **após captura de áudio, antes da transcrição Whisper**.
- **D-07:** resemblyzer ~10-50ms por utterance em CPU — aceitável.
- **D-08:** Hybrid injection: confiança ≥ threshold → system prompt `Current speaker: {name}`. Confiança < threshold mas match → prefixo `[{name}?]:` no turn. Unknown → `Current speaker: unknown` + `[unknown]:`.
- **D-09:** System prompt **reconstruído a cada turno** quando speaker ou confiança mudam.
- **D-10:** Speaker unknown → injeta `unknown_speaker` no contexto. Fluxo não interrompido.
- **D-11:** Memória ChromaDB NÃO atribuída a `unknown_speaker` — check antes de persistir.
- **D-12:** Nova opção no menu `/config`: "Adicionar perfil de voz". Usuário digita nome, grava N utterances.
- **D-13:** N utterances: Claude's Discretion.
- **D-14:** Embedding salvo como média dos N embeddings ou lista completa: Claude's Discretion.
- **D-15:** Operações de gerenciamento de perfis (listar, remover) também no menu `/config`.

### Claude's Discretion

- Threshold exato de cosine similarity para resemblyzer GE2E
- N utterances necessários para enrollment confiável
- Estrutura exata do arquivo de perfil em `~/.jarvis/speakers/`
- Se system prompt inclui percentual de confiança ou só o nome
- Estratégia de embedding médio vs. lista completa no ProfileStore
- Estrutura exata do state field em LangGraph para `speaker_name` e `speaker_confidence`

### Deferred Ideas (OUT OF SCOPE)

- wespeaker + ONNX Runtime + DirectML
- Anti-spoofing / liveness detection
- Permissões por speaker
- Enrollment automático inline
- Diarização
- Hot-swap de arquivo de referência sem reiniciar
</user_constraints>

---

## Summary

resemblyzer 0.1.4 é a biblioteca correta para este projeto. Ela usa um modelo GE2E pré-treinado (LSTM 3 camadas, saída 256-dim float32 L2-normalizado) que opera a 16kHz — exatamente o formato produzido pelo `sounddevice` + `record_until_silence()` existente. `preprocess_wav()` aceita NumPy arrays nativamente com `source_sr` especificado, sem conversão. `embed_utterance()` retorna embedding em ~10-50ms em CPU.

O único risco de instalação é `webrtcvad` (dependência da resemblyzer): a versão original `webrtcvad 2.0.10` não tem wheel pré-compilado para Windows Python 3.13 e exige C compiler. A solução é instalar `webrtcvad-wheels 2.0.14` antes de resemblyzer — tem wheel cp313 para Windows, é drop-in replacement e foi lançado em setembro 2024.

Para as decisões em "Claude's Discretion": threshold de 0.75 é conservador e adequado (literatura aponta 0.6 como ponto médio, mas para uso pessoal com 1 speaker primário 0.75 reduz falsos positivos); 5 utterances de ~3-5s cada (total ~15-25s) é suficiente para um d-vector médio confiável; **embedding médio** (não lista) é a estratégia recomendada para cosine similarity mais estável; arquivo de perfil em **NumPy .npy** é mais simples e rápido que JSON/pickle para arrays float32.

**Primary recommendation:** Instalar `webrtcvad-wheels==2.0.14` + `resemblyzer==0.1.4` como optional dependency group `[speaker]` no pyproject.toml. Módulo `speaker.py` com singleton VoiceEncoder (threading.Lock, lazy-init idêntico a stt.py). ProfileStore como classe com load/save em `.npy` files em `~/.jarvis/speakers/{name}.npy`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| resemblyzer | 0.1.4 | Speaker embeddings GE2E, `embed_utterance()`, `preprocess_wav()` | Locked por D-03. ~30MB modelo, 256-dim output L2-norm, 16kHz nativo. |
| webrtcvad-wheels | 2.0.14 | Dependência transitiva de resemblyzer com wheel cp313 Windows | Substitui `webrtcvad` original que não tem wheel para Python 3.13 no Windows. Drop-in replacement. |
| numpy | 2.4.5 (já instalado) | Operações de cosine similarity, armazenamento de embeddings | `np.dot` + `np.linalg.norm` para cosine. `np.save`/`np.load` para persistência. |
| scipy | 1.17.1 (já instalado) | `scipy.spatial.distance.cosine` como alternativa mais robusta | Já presente no ambiente via resemblyzer dependency. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| soundfile | já instalado | Gravação de utterances durante enrollment em formato WAV | `sf.write()` para salvar áudio de enrollment se necessário para debug/replay |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| numpy cosine manual | `scipy.spatial.distance.cosine` | scipy é ligeiramente mais robusto para vetores zero (edge case). Ambos funcionam. Usar scipy se já importado, numpy se não. |
| .npy por perfil | JSON com lista de floats | JSON é mais legível mas ~3x maior e mais lento para arrays 256-dim. .npy é o formato natural do numpy. |
| .npy por perfil | pickle | pickle tem risco de segurança com arquivos externos. .npy é seguro e específico para arrays. |

**Installation:**
```bash
# No pyproject.toml — novo optional group [speaker]
# Instalar webrtcvad-wheels ANTES de resemblyzer para evitar build do webrtcvad original
pip install "webrtcvad-wheels==2.0.14" "resemblyzer==0.1.4"
```

**Version verification:** Verificado em 2026-05-29:
- `resemblyzer`: 0.1.4 (único release estável, outubro 2023) — `pip index versions resemblyzer`
- `webrtcvad-wheels`: 2.0.14 (setembro 2024, cp313 wheel Windows disponível) — `pip index versions webrtcvad-wheels`

---

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop-py/src/jarvis_desktop/
├── speaker.py          # novo — VoiceEncoder singleton, ProfileStore, identify_speaker()
├── stt.py              # existente — record_until_silence() → NumPy 16kHz
├── voice_modes.py      # existente — integrar identify_speaker() entre record e transcribe
├── chat.py             # existente — injeção de speaker no system prompt e turn prefix
└── config.py           # existente — adicionar speaker_recognition_enabled, speaker_threshold

~/.jarvis/
└── speakers/
    ├── Biel.npy        # embedding médio 256-dim float32
    └── Maria.npy       # embedding médio 256-dim float32
```

### Pattern 1: VoiceEncoder Singleton (análogo a stt.py)

**What:** VoiceEncoder carregado uma vez, protegido por threading.Lock, reusado por toda a sessão.
**When to use:** Sempre — o modelo (~30MB) é pesado para instanciar por chamada.

```python
# Source: padrão established em stt.py (lines 40-43)
_encoder: Optional["VoiceEncoder"] = None
_encoder_lock = threading.Lock()

def _get_encoder() -> "VoiceEncoder":
    global _encoder
    with _encoder_lock:
        if _encoder is None:
            from resemblyzer import VoiceEncoder
            _console().print("[SPK] Carregando modelo de voz...")
            _encoder = VoiceEncoder()  # CPU by default, carrega pretrained.pt
            _console().print("[SPK] Pronto.")
    return _encoder
```

### Pattern 2: preprocess_wav com NumPy 16kHz existente

**What:** `preprocess_wav()` aceita NumPy array diretamente com `source_sr=16000`. Não é necessário salvar em disco nem converter formato.
**When to use:** Sempre — o áudio de `record_until_silence()` já está no formato correto.

```python
# Source: resemblyzer/audio.py — preprocess_wav signature
# preprocess_wav(fpath_or_wav: Union[str, Path, np.ndarray], source_sr: Optional[int]=None)
from resemblyzer import preprocess_wav, VoiceEncoder

encoder = VoiceEncoder()
# audio = output de stt.record_until_silence() — float32 16kHz
processed = preprocess_wav(audio, source_sr=16000)
embedding = encoder.embed_utterance(processed)  # shape: (256,) float32 L2-normed
```

### Pattern 3: Cosine Similarity com zero-vector guard

**What:** Embeddings L2-normalizados — `np.dot(a, b)` é suficiente para cosine similarity entre vetores L2-norm. Mas guard para vetor zero é necessário em enrollment vazio.

```python
import numpy as np

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a < 1e-8 or norm_b < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))
```

### Pattern 4: ProfileStore com .npy por perfil

**What:** Um arquivo `.npy` por speaker em `~/.jarvis/speakers/`. Cada arquivo armazena embedding médio (shape `(256,)` float32). Operações: save, load, list, delete.

```python
from pathlib import Path
import numpy as np

SPEAKERS_DIR = Path.home() / ".jarvis" / "speakers"

def save_profile(name: str, embedding: np.ndarray) -> None:
    SPEAKERS_DIR.mkdir(parents=True, exist_ok=True)
    np.save(str(SPEAKERS_DIR / f"{name}.npy"), embedding)

def load_profile(name: str) -> np.ndarray:
    return np.load(str(SPEAKERS_DIR / f"{name}.npy"))

def list_profiles() -> list[str]:
    if not SPEAKERS_DIR.exists():
        return []
    return [p.stem for p in SPEAKERS_DIR.glob("*.npy")]

def delete_profile(name: str) -> bool:
    path = SPEAKERS_DIR / f"{name}.npy"
    if path.exists():
        path.unlink()
        return True
    return False
```

### Pattern 5: Integration Point em voice_modes.py

**What:** Inserir `identify_speaker()` entre `record_until_silence()` e `transcribe()` em cada modo de voz.
**When to use:** Só quando `config.speaker_recognition_enabled = True`.

```python
# Source: voice_modes.py pattern — após record, antes de transcribe (D-06)
audio = record_until_silence(threshold_ms=config.silence_threshold_ms)

# NOVO: speaker identification (guard: só se habilitado)
speaker_result = None
if config.speaker_recognition_enabled:
    from jarvis_desktop import speaker as spk
    speaker_result = spk.identify_speaker(audio, config)

text = transcribe(audio)
if text.strip():
    _queue.put((text, speaker_result))  # ou enviar via estado separado
```

### Pattern 6: Hybrid Injection no chat_loop (D-08/D-09)

**What:** Reconstruir system prompt com `Current speaker:` e prefixar turn do usuário.

```python
# Injeção no turn (chat.py chat_loop region)
# speaker_result = {"name": "Biel", "confidence": 0.82, "is_known": True}

def _build_speaker_prefix(speaker_result: dict | None, threshold: float) -> str:
    if speaker_result is None:
        return ""
    name = speaker_result["name"]
    conf = speaker_result["confidence"]
    if conf >= threshold:
        return ""  # alta confiança: só no system prompt
    return f"[{name}?]: "  # baixa confiança: prefixo no turn

def _build_speaker_system_fragment(speaker_result: dict | None, threshold: float) -> str:
    if speaker_result is None:
        return ""
    name = speaker_result["name"] if speaker_result["confidence"] >= threshold else "unknown"
    return f"\nCurrent speaker: {name}"
```

### Anti-Patterns to Avoid

- **Instanciar VoiceEncoder por chamada:** ~500ms de overhead cada vez. Usar singleton.
- **Passar `audio` direto sem `preprocess_wav()`:** `embed_utterance()` espera o array pré-processado (normalização de volume, remoção de silêncio). Sem `preprocess_wav()`, embeddings são instáveis.
- **Instalar `webrtcvad` sem `webrtcvad-wheels` em Python 3.13 Windows:** Falha de build. Usar `webrtcvad-wheels==2.0.14`.
- **Salvar embeddings em JSON:** Arrays 256-dim float32 em JSON são ~4x maiores e mais lentos. Usar `.npy`.
- **Comparar embeddings com `==` ou distância euclidiana:** O espaço GE2E é treinado para cosine similarity, não distância L2.

---

## Discretion Recommendations (Claude's Discretion items)

### Threshold de cosine similarity (D-05)

**Recomendação: 0.75**

Evidências:
- Literatura aponta 0.6 como threshold médio para GE2E cosine similarity (separação same-speaker vs cross-speaker)
- Para uso pessoal com 1 speaker primário registrado, 0.75 é mais seguro — reduz risco de falso positivo (Biel identificado como visitante)
- resemblyzer GE2E produz embeddings L2-normalizados — valores altos (>0.85) são comuns para mesma pessoa
- Regime de uso: `confidence >= 0.75` → system prompt (alta confiança). `0.5-0.75` → prefixo com `?`. `<0.5` → unknown

```python
# JarvisConfig field
speaker_threshold: float = Field(default=0.75, description="Cosine similarity threshold para speaker identification (0.0–1.0)")
```

### N utterances para enrollment (D-13)

**Recomendação: 5 utterances de ~4s cada (total ~20s de fala limpa)**

Evidências:
- resemblyzer README: "5s - 30s of speech" para perfil confiável
- `embed_speaker(wavs: List[np.ndarray])` foi projetado para media de múltiplos wavs
- 5 utterances permite capturar variação natural de voz (diferente ritmo, volume)
- Menos que 3 utterances produz embedding instável para vozes com variação alta

### Estratégia de embedding (D-14)

**Recomendação: embedding médio (não lista)**

Evidências:
- `embed_speaker()` da resemblyzer já implementa exatamente isso: media dos embeddings de múltiplos wavs
- Embedding médio é centróide no espaço GE2E — maximiza distância inter-speaker, minimiza intra-speaker
- Lista completa seria útil para modelo de votação (majority vote), mas adiciona complexidade desnecessária
- `.npy` armazena um único array `(256,)` — simples, sem overhead

**Implementação com `embed_speaker()`:**
```python
from resemblyzer import VoiceEncoder, preprocess_wav
encoder = VoiceEncoder()
processed_wavs = [preprocess_wav(wav, source_sr=16000) for wav in utterance_arrays]
mean_embedding = encoder.embed_speaker(processed_wavs)  # média interna
```

### Estrutura de arquivo de perfil (D-02)

**Recomendação: `~/.jarvis/speakers/{name}.npy`** — um arquivo numpy por speaker.

- Format: `np.save()` / `np.load()` — array `(256,)` dtype=float32
- Nome do arquivo = nome do speaker (sem espaços — sanitizar com `name.replace(" ", "_")`)
- `list_profiles()` via `SPEAKERS_DIR.glob("*.npy")` — simples e sem estado adicional

### System prompt — incluir percentual? (D-08)

**Recomendação: não incluir percentual** no system prompt. Apenas o nome.

- `Current speaker: Biel` é suficiente para o LLM personalizar respostas
- Percentual expõe incerteza interna ao LLM sem benefício claro
- Se quiser, logar no terminal `[SPK] Biel (0.82)` para debug sem poluir o contexto do LLM

### LangGraph state field (D-09)

**Recomendação:** Não usar LangGraph state para isso. O JARVIS desktop usa `chat_loop()` direto (não LangGraph). O speaker_result é passado como variável local no loop de `chat_loop()` e reconstruído a cada turno. Ver integração no chat_loop.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extração de embedding de voz | MFCC + PCA customizado | `resemblyzer.VoiceEncoder.embed_utterance()` | GE2E treinado em milhares de speakers. MFCC manual não captura identidade vocal. |
| Pré-processamento de áudio para embedding | Normalização manual | `resemblyzer.preprocess_wav(wav, source_sr=16000)` | Lida com normalização de volume, remoção de silêncio, resampling internamente. |
| Averaging de múltiplos embeddings de enrollment | Loop manual | `encoder.embed_speaker(list_of_wavs)` | API já fornece média ponderada otimizada. |
| Detecção de atividade de voz durante enrollment | Threshold de RMS | webrtcvad interno da resemblyzer via `preprocess_wav` | Remove silêncio automaticamente. |

---

## Common Pitfalls

### Pitfall 1: webrtcvad build failure em Windows Python 3.13

**What goes wrong:** `pip install resemblyzer` tenta compilar `webrtcvad-2.0.10` de source — falha com erro de C compiler ausente.
**Why it happens:** `webrtcvad 2.0.10` não tem wheel pré-compilado para cp313 Windows. resemblyzer declara `webrtcvad>=2.0.10` sem especificar o fork.
**How to avoid:** Instalar `webrtcvad-wheels==2.0.14` (drop-in replacement com cp313 wheel) **antes** de resemblyzer. No pyproject.toml, listar `webrtcvad-wheels` na frente de `resemblyzer` no grupo `[speaker]`.
**Warning signs:** `error: Microsoft Visual C++ 14.0 or greater is required` durante pip install resemblyzer.

```toml
# pyproject.toml — novo grupo
[project.optional-dependencies]
speaker = [
    "webrtcvad-wheels==2.0.14",   # DEVE VIR ANTES de resemblyzer
    "resemblyzer==0.1.4",
]
```

### Pitfall 2: embed_utterance() sem preprocess_wav()

**What goes wrong:** Embedding instável — cosine similarity errática, mesmo speaker identificado como desconhecido.
**Why it happens:** `embed_utterance()` espera áudio normalizado (dbFS=-30) e sem silêncio. sounddevice entrega áudio "cru" com silêncio no início/fim e volume variável.
**How to avoid:** **Sempre** chamar `preprocess_wav(audio, source_sr=16000)` antes de `embed_utterance()`.
**Warning signs:** Cosine similarity variando >0.2 entre utterances do mesmo speaker.

### Pitfall 3: VoiceEncoder instanciado múltiplas vezes

**What goes wrong:** Cold start de ~500ms cada vez que `identify_speaker()` é chamado.
**Why it happens:** VoiceEncoder carrega `pretrained.pt` (~30MB) do disco a cada instanciação.
**How to avoid:** Singleton com `threading.Lock()` idêntico ao padrão de `stt.py` (`_model` + `_lock`).
**Warning signs:** Latência de >300ms por identificação (aceitável é 10-50ms).

### Pitfall 4: Config não-segura do nome de arquivo do perfil

**What goes wrong:** `np.save("~/.jarvis/speakers/João Silva.npy")` — espaços e acentos no filename causam problemas no Windows.
**Why it happens:** Windows permite espaços em paths mas pode ter problemas com caracteres Unicode em `glob()`.
**How to avoid:** Sanitizar nome: `safe_name = name.strip().replace(" ", "_")` antes de usar como filename. Armazenar nome original em metadata separado se necessário.

### Pitfall 5: Enrollment com áudio muito curto produz embedding de baixa qualidade

**What goes wrong:** Speaker registrado com 1-2s de fala — embedding não representa bem a voz, threshold de 0.75 nunca é atingido.
**Why it happens:** resemblyzer usa janelas de 160 frames (1.6s) para calcular partial embeddings. Com <2s, apenas 1 partial é gerado — alta variância.
**How to avoid:** Forçar mínimo de 3s por utterance durante enrollment. Validar duração antes de chamar `embed_utterance()`.
**Warning signs:** Usuário não é reconhecido mesmo após enrollment com threshold 0.75.

### Pitfall 6: race condition entre voice_modes thread e chat_loop thread

**What goes wrong:** `speaker_result` do turno anterior sobrescreve o do turno atual.
**Why it happens:** voice_modes roda em daemon thread, chat_loop em thread principal. Se speaker_result for estado global mutable, pode haver race.
**How to avoid:** Passar `speaker_result` junto com o texto na Queue — usar `Queue.put((text, speaker_result))` ao invés de estado global. chat_loop desempacota `(text, speaker_result)` de cada item.

---

## Code Examples

### Exemplo 1: identify_speaker() — função principal

```python
# Source: resemblyzer API + padrão de stt.py
from typing import Optional
import numpy as np

def identify_speaker(
    audio: np.ndarray,
    config: "JarvisConfig",
) -> dict:
    """Identifica o speaker a partir de audio NumPy 16kHz.

    Returns:
        dict com keys: name (str), confidence (float), is_known (bool)
        Ex: {"name": "Biel", "confidence": 0.82, "is_known": True}
            {"name": "unknown", "confidence": 0.0, "is_known": False}
    """
    from resemblyzer import preprocess_wav
    encoder = _get_encoder()

    processed = preprocess_wav(audio, source_sr=16000)
    turn_embedding = encoder.embed_utterance(processed)

    profiles = load_all_profiles()  # dict name -> np.ndarray (256,)
    if not profiles:
        return {"name": "unknown", "confidence": 0.0, "is_known": False}

    best_name = "unknown"
    best_score = 0.0
    for name, profile_emb in profiles.items():
        score = _cosine_similarity(turn_embedding, profile_emb)
        if score > best_score:
            best_score = score
            best_name = name

    threshold = getattr(config, "speaker_threshold", 0.75)
    is_known = best_score >= threshold

    return {
        "name": best_name if is_known else "unknown",
        "confidence": best_score,
        "is_known": is_known,
    }
```

### Exemplo 2: Enrollment — gravar N utterances via sounddevice

```python
# Source: padrão de stt.record_until_silence()
def enroll_speaker(name: str, config: "JarvisConfig", n_utterances: int = 5) -> None:
    """Grava N utterances e salva embedding médio para o speaker."""
    from resemblyzer import VoiceEncoder, preprocess_wav
    from jarvis_desktop.stt import record_until_silence

    encoder = _get_encoder()
    embeddings = []

    _console().print(f"[SPK] Gravando {n_utterances} amostras de voz para '{name}'.")
    _console().print("[SPK] Fale naturalmente por ~4s após cada 'Gravando...'")

    for i in range(1, n_utterances + 1):
        _console().print(f"[SPK] Gravando {i}/{n_utterances}... (fale agora)")
        audio = record_until_silence(threshold_ms=config.silence_threshold_ms)
        if len(audio) < 16000 * 2:  # < 2s — muito curto
            _console().print("[SPK] Áudio muito curto — repita.")
            i -= 1
            continue
        processed = preprocess_wav(audio, source_sr=16000)
        emb = encoder.embed_utterance(processed)
        embeddings.append(processed)

    mean_embedding = encoder.embed_speaker(embeddings)
    save_profile(name, mean_embedding)
    _console().print(f"[SPK] Perfil '{name}' salvo.")
```

### Exemplo 3: Queue com speaker_result em voice_modes.py

```python
# Em _ptt_loop / _wake_word_loop / _always_listening_loop
# Após: audio = ... e antes de: text = transcribe(audio)

speaker_result = None
if getattr(config, "speaker_recognition_enabled", False):
    try:
        from jarvis_desktop import speaker as spk
        speaker_result = spk.identify_speaker(audio, config)
        name = speaker_result["name"]
        conf = speaker_result["confidence"]
        _console().print(f"[SPK] {name} ({conf:.2f})")
    except Exception as exc:
        _console().print(f"[SPK] Identificação falhou: {exc}")

text = transcribe(audio)
if text.strip():
    _queue.put((text, speaker_result))  # Tupla — chat_loop desempacota
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | runtime | ✓ | 3.13.5 | — |
| torch | resemblyzer (VoiceEncoder usa PyTorch LSTM) | ✓ | 2.12.0 | — |
| numpy | cosine similarity, .npy storage | ✓ | 2.4.5 | — |
| scipy | cosine similarity (opcional, já disponível) | ✓ | 1.17.1 | numpy manual |
| resemblyzer | speaker.py | ✗ | — | Instalar via pyproject.toml [speaker] |
| webrtcvad-wheels | dep de resemblyzer, cp313 wheel | ✗ | — | Instalar antes de resemblyzer |
| soundfile | salvar/carregar WAV de enrollment | ✓ | já instalado | — |
| sounddevice | gravação de utterances no enrollment | ✓ | 0.5.5 | — |

**Missing dependencies:**
- `resemblyzer 0.1.4` + `webrtcvad-wheels 2.0.14` — bloqueiam feature. Instalar via novo grupo `[speaker]` no pyproject.toml.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3+ |
| Config file | `apps/desktop-py/pyproject.toml` → `[tool.pytest.ini_options]` |
| Quick run command | `pytest apps/desktop-py/tests/test_speaker.py -x` |
| Full suite command | `pytest apps/desktop-py/tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPK-01 | `identify_speaker()` retorna dict com name/confidence/is_known | unit | `pytest tests/test_speaker.py::test_identify_speaker_returns_dict -x` | ❌ Wave 0 |
| SPK-02 | Speaker acima do threshold → is_known=True, name correto | unit | `pytest tests/test_speaker.py::test_identify_speaker_above_threshold -x` | ❌ Wave 0 |
| SPK-03 | Speaker abaixo do threshold → is_known=False, name="unknown" | unit | `pytest tests/test_speaker.py::test_identify_speaker_below_threshold -x` | ❌ Wave 0 |
| SPK-04 | ProfileStore: save/load/list/delete com .npy | unit | `pytest tests/test_speaker.py::test_profile_store_crud -x` | ❌ Wave 0 |
| SPK-05 | preprocess_wav + embed_utterance aceita NumPy 16kHz sem erro | unit | `pytest tests/test_speaker.py::test_embed_utterance_from_numpy -x` | ❌ Wave 0 |
| SPK-06 | VoiceEncoder singleton não reinstanciado entre chamadas | unit | `pytest tests/test_speaker.py::test_voice_encoder_singleton -x` | ❌ Wave 0 |
| SPK-07 | voice_modes Queue recebe tupla (text, speaker_result) | unit | `pytest tests/test_voice_modes.py::test_queue_includes_speaker_result -x` | ❌ Wave 0 |
| SPK-08 | chat_loop injeta `Current speaker:` no system prompt quando is_known | unit | `pytest tests/test_chat.py::test_speaker_injection_system_prompt -x` | ❌ Wave 0 |
| SPK-09 | /config menu exibe opção "Adicionar perfil de voz" | unit | `pytest tests/test_config_menu.py::test_config_menu_speaker_option -x` | ❌ Wave 0 |
| SPK-10 | Enrollment salva .npy com shape (256,) em ~/.jarvis/speakers/ | unit | `pytest tests/test_speaker.py::test_enroll_saves_npy -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest apps/desktop-py/tests/test_speaker.py -x`
- **Per wave merge:** `pytest apps/desktop-py/tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_speaker.py` — novo arquivo de testes para speaker.py (SPK-01 a SPK-06, SPK-10)
- [ ] `tests/conftest.py` — adicionar `mock_voice_encoder` fixture (mock VoiceEncoder para evitar download modelo)
- [ ] `tests/test_voice_modes.py` — adicionar testes SPK-07 (Queue com tupla)
- [ ] `tests/test_chat.py` — adicionar testes SPK-08 (hybrid injection)
- [ ] `tests/test_config_menu.py` — adicionar testes SPK-09 (menu item)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| webrtcvad original (sem wheel cp313) | webrtcvad-wheels 2.0.14 (drop-in, tem cp313) | Setembro 2024 | Resolve build failure em Python 3.13 Windows |
| d-vector manual com MFCC | resemblyzer GE2E pretrained | 2020 (paper Google) | Embeddings muito mais discriminativos sem treinamento |
| Polling de similaridade com threshold fixo | Hybrid injection (alta/baixa confiança) | D-08 deste projeto | Melhor UX — LLM sempre tem context mesmo com confiança parcial |

---

## Open Questions (RESOLVED)

1. **Compatibilidade `webrtcvad-wheels` como substituto de `webrtcvad` no resolve do pip/uv**
   - **RESOLVED:** Usar `[tool.uv.override-dependencies]` no pyproject.toml para forçar `webrtcvad-wheels==2.0.14` no lugar de `webrtcvad>=2.0.10` que resemblyzer declara. Verificado via `uv` docs: override-dependencies tem precedência sobre constraints transitivas. No grupo `[project.optional-dependencies].speaker` listar `webrtcvad-wheels==2.0.14` ANTES de `resemblyzer==0.1.4` como reforço (ordem de instalação determinística).
   - What we know: É drop-in replacement, expõe o mesmo módulo `webrtcvad`. Pip aceita quando instalado primeiro.
   - What's unclear (PRÉ-RESOLUÇÃO): uv pode puxar o original se override não for usado.
   - Decisão final aplicada em Plan 01 Task 1.

2. **chat_loop atual usa Queue de string simples — mudar para tupla quebra compatibilidade**
   - **RESOLVED:** Usar **dict `{"text": text, "speaker": speaker_result}`** na Queue. Opção mais segura e extensível:
     - **Segura:** consumers podem fazer guards `isinstance(item, dict)` vs `isinstance(item, str)` para suportar legado durante migração.
     - **Extensível:** campos futuros (timestamp, audio_id, transcription_lang, etc.) entram sem mudar a forma do item.
     - **Auto-documentável:** acessar `item["text"]` / `item["speaker"]` é mais legível que `item[0]` / `item[1]`.
   - **Tuple rejeitado em revisão pelo usuário (2026-05-29 iteração 2):** ordem posicional dificulta evolução e não tem campo nomeado para guards.
   - What we know: Atualmente `_queue.put(text)` — string. Mudar requer ajuste em chat_loop `_await_input()` e em `_queue.put()` em 3 modos de voz.
   - Decisão final aplicada em Plan 03 (Queue API: dict).

---

## Sources

### Primary (HIGH confidence)
- PyPI `resemblyzer 0.1.4` — versão verificada 2026-05-29 via `pip index versions resemblyzer`
- PyPI `webrtcvad-wheels 2.0.14` — cp313 Windows wheel confirmado via PyPI page e `pip index versions`
- `resemblyzer/hparams.py` (GitHub raw) — `sampling_rate=16000`, `model_embedding_size=256` confirmados
- `resemblyzer/voice_encoder.py` (GitHub raw) — `embed_utterance()` signature, retorna float32 numpy (256,) L2-normed
- `resemblyzer/audio.py` (GitHub raw) — `preprocess_wav(fpath_or_wav, source_sr)` aceita np.ndarray
- Ambiente local: `torch==2.12.0`, `Python 3.13.5`, `scipy==1.17.1`, `numpy==2.4.5` — verificados via pip show
- `apps/desktop-py/pyproject.toml` — configuração existente e padrões de optional-dependencies confirmados

### Secondary (MEDIUM confidence)
- resemblyzer README: "5s - 30s of speech" para voice profile — confirmado via WebFetch do README
- WebSearch: threshold cosine ~0.6 para GE2E same-speaker — múltiplas fontes acadêmicas concordam
- WebSearch: `webrtcvad-wheels` é drop-in replacement para `webrtcvad` — confirmado via PyPI e GitHub

### Tertiary (LOW confidence)
- Latência ~10-50ms em CPU para embed_utterance: relatado em uso comum da biblioteca, não benchmarked neste ambiente

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas via pip index e PyPI
- Architecture: HIGH — padrões derivados diretamente de stt.py existente e resemblyzer API verificada
- Pitfalls: HIGH — webrtcvad/Python 3.13 verificado empiricamente via pip dry-run; outros de API oficial
- Discretion recommendations: MEDIUM — threshold e N utterances baseados em literatura + README

**Research date:** 2026-05-29
**Valid until:** 2026-08-29 (resemblyzer é projeto estável, sem releases ativos frequentes)
