# Phase 89: Speaker Recognition — Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar reconhecimento de quem está falando (speaker identification) com suporte a múltiplos perfis registrados. JARVIS extrai embedding de voz após cada captura de áudio, compara contra os perfis cadastrados, e injeta a identidade do speaker no contexto do LLM em cada turno de conversa.

**Dentro do escopo:**
- Módulo `speaker.py` — extração de embedding via resemblyzer + comparação coseno
- ProfileStore — armazenamento de embeddings em `~/.jarvis/speakers/` (nome → embedding(s))
- Pipeline: identificação após captura de áudio (NumPy 16kHz), antes da transcrição Whisper
- Enrollment via `/config` menu — opção "Adicionar perfil de voz" com gravação de N utterances
- Injeção de identidade no LLM: slot no system prompt (confiança alta) + prefixo `[Nome?]:` no turn (confiança baixa)
- Comportamento unknown: injetar `unknown_speaker` no contexto quando abaixo do threshold
- Suporte a múltiplos usuários nomeados

**Fora do escopo:**
- Diarização de múltiplos speakers num único áudio
- Voice anti-spoofing / liveness detection
- Integração com sistema de permissões (bloquear comandos por speaker)
- Enrollment automático inline (JARVIS pergunta "Quem é você?" — not default)
- wespeaker + DirectML (explorar em milestone futura se precisão for insuficiente)

</domain>

<decisions>
## Implementation Decisions

### Escopo de Usuários

- **D-01:** Multi-user — suporte a múltiplos perfis registrados com nomes distintos. ProfileStore gerencia N usuários (não single-user puro).
- **D-02:** Cada perfil tem um nome (string) e N embeddings registrados (média ou lista, a definir pelo researcher). Perfis armazenados em `~/.jarvis/speakers/`.

### Biblioteca de Speaker Embeddings

- **D-03:** Biblioteca: **resemblyzer**. Modelo GE2E d-vector (~30MB), zero-torch, NumPy-native a 16kHz — formato idêntico ao que sounddevice + faster-whisper já produzem. Sem conflito com ctranslate2.
- **D-04:** Comparação por **similaridade coseno** entre o embedding do turno atual e os embeddings registrados de cada perfil. Speaker com maior similaridade acima do threshold é o identificado.
- **D-05:** Threshold de confiança: Claude's Discretion (researcher verifica valores típicos para resemblyzer GE2E; ponto de partida recomendado ~0.75 cosine similarity).

### Pipeline e Timing

- **D-06:** Identificação ocorre **após captura de áudio, antes da transcrição Whisper**. O buffer NumPy 16kHz já disponível em `record_until_silence()` é passado ao módulo speaker antes de chamar `transcribe()`.
- **D-07:** Latência da identificação é adicionada ao tempo de resposta percebido. resemblyzer é rápido em CPU (~10-50ms por utterance) — aceitável.

### Injeção no Contexto do LLM

- **D-08:** **Hybrid injection:**
  - Confiança ≥ threshold: injetar no system prompt — `Current speaker: {name}` (sem percentual por padrão — Claude's Discretion se incluir ou não o número)
  - Confiança < threshold mas speaker identificado: prefixar o turn do usuário com `[{name}?]: mensagem`
  - Speaker desconhecido (abaixo de threshold E sem match): injetar `Current speaker: unknown` no system prompt + prefixo `[unknown]: mensagem` no turn
- **D-09:** System prompt é **reconstruído a cada turno** quando speaker ou confiança mudam — não é string estática no `llm_factory`. LangGraph state node responsável por isso.

### Comportamento com Falante Desconhecido

- **D-10:** Quando nenhum perfil atinge o threshold: injeta `unknown_speaker` no contexto do LLM (system prompt + prefixo no turn). Fluxo de conversa não é interrompido.
- **D-11:** Memória de longo prazo (ChromaDB) NÃO deve ser atribuída a `unknown_speaker` — escritas de memória verificam se speaker é conhecido antes de persistir.

### Enrollment via /config

- **D-12:** Nova opção no menu `/config`: `"Adicionar perfil de voz"`. Usuário digita o nome do speaker, depois grava N utterances via microfone (usando sounddevice, mesmo padrão do stt.py).
- **D-13:** N utterances: Claude's Discretion (resemblyzer tipicamente precisa de 5-10s de áudio limpo; researcher verifica quantidade adequada para d-vector médio confiável).
- **D-14:** Embedding salvo como média dos N embeddings extraídos, ou lista completa (researcher decide qual estratégia dá melhor cosine similarity em retrieval).
- **D-15:** Operações de gerenciamento de perfis (listar, remover) também no menu `/config`.

### Claude's Discretion

- Threshold exato de cosine similarity para resemblyzer GE2E (researcher verifica literatura e defaults da lib)
- N utterances necessários para enrollment confiável
- Estrutura exata do arquivo de perfil em `~/.jarvis/speakers/` (JSON com lista de embeddings? numpy `.npy`? pickle?)
- Se system prompt inclui o percentual de confiança ou só o nome
- Estratégia de embedding médio vs. lista completa no ProfileStore
- Estratura exata do state field em LangGraph para `speaker_name` e `speaker_confidence`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline de Áudio e STT

- `apps/desktop-py/src/jarvis_desktop/stt.py` — `record_until_silence()`, `transcribe()`, `init_stt()`; formato NumPy 16kHz, padrões de singleton + lock
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — os 3 modos (PTT, continuous, wake-word); ponto de integração onde captura de áudio acontece antes da transcrição

### Config e Persistência

- `apps/desktop-py/src/jarvis_desktop/config.py` — `JarvisConfig` com padrão `Field(default=...)`, `load_config()`, `save_config()`; onde adicionar campos de speaker recognition
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_handle_config_menu()`, `_menu_tts_provider()`; padrões de menu /config para implementar enrollment

### LLM e Contexto

- `apps/desktop-py/src/jarvis_desktop/chat.py` — `chat_loop()`; onde o texto do usuário é preparado e enviado ao LLM; ponto de injeção do prefixo no turn
- Verificar onde o system prompt é construído no LangGraph state (researcher localizar o nó)

### Fases anteriores relevantes

- `.planning/phases/86-identificacao-de-voz-speaker-recognition/86-CONTEXT.md` — padrões de singleton, lazy import, fallback, warmup (aplicar ao speaker module)
- `.planning/phases/88-emotion-tags-config-ux/88-CONTEXT.md` — padrão de menu /config item condicional, prompt inline

### Documentação externa (researcher deve consultar)

- `https://github.com/resemble-ai/resemblyzer` — API resemblyzer: `preprocess_wav()`, `embed_utterance()`, `embed_speaker()`, similaridade coseno
- `https://pypi.org/project/resemblyzer/` — versão atual, dependências (webrtcvad, librosa)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`stt.py:record_until_silence()`** — retorna NumPy array 16kHz pronto para resemblyzer; ponto de inserção do speaker ID antes de `transcribe()`
- **`voice_modes.py` (todos os modos)** — cada modo chama `stt.record_until_silence()` seguido de `stt.transcribe()`; inserir speaker ID entre esses dois calls
- **`chat.py:_handle_config_menu()`** — adicionar item "Adicionar perfil de voz" seguindo padrão dos itens condicionais existentes
- **`config.py:JarvisConfig`** — adicionar `speaker_recognition_enabled: bool = Field(default=False)` e `speaker_threshold: float = Field(default=0.75)`

### Established Patterns

- **Lazy imports dentro das funções** — `from resemblyzer import VoiceEncoder` deve ficar dentro do módulo speaker.py com import lazy se necessário
- **Singleton com `threading.Lock()`** — VoiceEncoder é pesado para instanciar; usar singleton análogo a `_model` em stt.py
- **`[TTS]` / `[STT]` prefix nos logs** — usar `[SPK]` para mensagens do speaker module
- **Padrão `Field(default=...)` em JarvisConfig** — para qualquer novo campo de config
- **ProfileStore em `~/.jarvis/`** — consistente com `~/.jarvis/config.json` (mesmo diretório base)

### Integration Points

- **`voice_modes.py` (loop de cada modo)** — após `audio = record_until_silence(...)` e antes de `text = transcribe(audio)`: inserir `speaker_result = identify_speaker(audio, config)`
- **`chat_loop()` em chat.py** — construção do system prompt e do texto do usuário: injetar `speaker_result` para hybrid injection (D-08/D-09)
- **`_handle_config_menu()` em chat.py** — nova opção de enrollment de perfil de voz

</code_context>

<specifics>
## Specific Ideas

- O arquivo `apps/desktop-py/voices/Jarvis.mp3` é voz de referência para o Chatterbox TTS (não a voz do Biel) — enrollment do Biel exige gravações separadas via microfone
- resemblyzer usa `preprocess_wav()` + `embed_utterance()` — ambos operam em NumPy 16kHz que o sounddevice já produz; sem conversão de formato necessária
- Para teste de integração: gravar um `.wav` do usuário e verificar cosine similarity > threshold em testes unitários (fixture de voz similar ao padrão da Phase 87 com soundfile+numpy)

</specifics>

<deferred>
## Deferred Ideas

- **wespeaker + ONNX Runtime + DirectML** — alternativa para usar a AMD GPU se resemblyzer tiver precisão insuficiente na prática. Explorar em milestone futura.
- **Anti-spoofing / liveness detection** — detectar replay attacks (audio gravado). Fora do escopo de uso pessoal.
- **Permissões por speaker** — bloquear comandos sensíveis (pc_control, acesso a arquivos) para `unknown_speaker`. Futuro.
- **Enrollment automático inline** — JARVIS pergunta "Quem é você?" quando speaker desconhecido. Pode ser opt-in via config, não default.
- **Diarização** — múltiplos speakers num único áudio (ex: reunião gravada). Futuro.
- **Hot-swap de arquivo de referência sem reiniciar** — mencionado na Phase 88 deferred como "Phase 89+ ou junto com VCLONE-05".

</deferred>

---

*Phase: 89-identifica-o-de-voz-speaker-recognition-backlog*
*Context gathered: 2026-05-29*
