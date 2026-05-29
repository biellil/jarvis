# Phase 89: Speaker Recognition — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 89 — Identificação de voz — speaker recognition
**Areas discussed:** Escopo de usuários, Biblioteca de embeddings, Injeção no contexto do LLM, Comportamento com falante desconhecido, Enrollment flow, Timing na pipeline

---

## Escopo de Usuários

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Single-user + unknown fallback | JARVIS conhece só o Biel, abaixo do threshold injeta "unknown" | |
| Single-user puro | Só detecta "é o Biel" sem overhead de unknown | |
| Multi-user desde já | Suporte a múltiplos perfis registrados com nomes distintos | ✓ |

**Escolha do usuário:** Multi-user desde já
**Notas:** ProfileStore com N usuários, sem refactor futuro. Cada perfil tem nome + embeddings.

---

## Biblioteca de Speaker Embeddings

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| resemblyzer | Leve (~30MB), zero-torch, NumPy 16kHz nativo, MIT, sem conflito ctranslate2 | ✓ |
| speechbrain ECAPA-TDNN | Melhor precisão, Apache-2.0, requer PyTorch (risco conflito ctranslate2) | |
| wespeaker + ONNX Runtime | ONNX Runtime + DirectML AMD nativo, docs menos maduros | |
| pyannote-audio | Qualidade alta mas requer HuggingFace token, licença CC BY 4.0 | |
| NeMo (NVIDIA) | Alta precisão mas projetado para CUDA — incompatível com AMD sem CUDA | |

**Escolha do usuário:** resemblyzer
**Notas:** Hardware AMD sem CUDA foi fator determinante. resemblyzer sem conflito com ctranslate2.

---

## Injeção no Contexto do LLM

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Slot no system prompt | `Current speaker: Biel (confidence: 95%)` — padrão da indústria, ChromaDB limpo | |
| Prefix no turn do usuário | `[Biel]: mensagem` — simples, contamina embeddings | |
| additional_kwargs separado | Estruturado mas LLMs cloud ignoram o campo silenciosamente | |
| Sem injeção | Só log interno — derrota o objetivo da fase | |
| Hybrid: system prompt + prefix em baixa confiança | System prompt normal + `[Biel?]:` no turn quando confiança < threshold | ✓ |

**Escolha do usuário:** Hybrid — system prompt + prefixo em baixa confiança
**Notas:** System prompt reconstruído a cada turno no LangGraph state.

---

## Comportamento com Falante Desconhecido

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Silencioso — processar normalmente | Zero fricção, sem rastreabilidade | |
| Injetar "unknown_speaker" no contexto | Auditável, memória não contaminada, consistente com multi-user | ✓ |
| Híbrido: silencioso + speaker_confidence no estado | Processa sem fricção + campo no LangGraph state para nós específicos | |
| JARVIS pergunta "Quem é você?" | Coleta identidade ativa, frustrante em falsos negativos | |
| Bloquear input | UX péssima para uso pessoal | |

**Escolha do usuário:** Injetar "unknown_speaker" no contexto
**Notas:** Memória de longo prazo (ChromaDB) não deve ser atribuída a unknown_speaker.

---

## Enrollment Flow

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Comando /config menu | Nova opção "Adicionar perfil de voz" — nome + N utterances via microfone | ✓ |
| Script separado (enroll_speaker.py) | CLI dedicada fora do JARVIS | |
| Automático por threshold | JARVIS pergunta "Quem é você?" inline | |

**Escolha do usuário:** /config menu
**Notas:** Consistente com padrão de UX do projeto. Mesmo menu de configuração de TTS provider.

---

## Timing na Pipeline

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Após captura, antes da transcrição | Buffer NumPy 16kHz → speaker ID → Whisper | ✓ |
| Paralelo à transcrição | Speaker ID e Whisper em threads paralelas | |
| Após transcrição | Whisper primeiro, speaker ID depois | |

**Escolha do usuário:** Após captura, antes da transcrição
**Notas:** Latência resemblyzer em CPU estimada ~10-50ms — aceitável antes do Whisper.

---

## Claude's Discretion

- Threshold exato de cosine similarity para resemblyzer GE2E
- N utterances para enrollment confiável
- Estrutura do arquivo de perfil em `~/.jarvis/speakers/`
- Embedding médio vs. lista completa no ProfileStore
- Se system prompt inclui percentual de confiança ou só o nome
- Estrutura do state field LangGraph para `speaker_name` e `speaker_confidence`

## Deferred Ideas

- wespeaker + ONNX Runtime + DirectML para AMD GPU (se resemblyzer insuficiente)
- Anti-spoofing / liveness detection
- Permissões por speaker para comandos sensíveis
- Enrollment automático inline como opt-in
- Diarização de múltiplos speakers num único áudio
- Hot-swap de arquivo de referência (mencionado na Phase 88 deferred)
