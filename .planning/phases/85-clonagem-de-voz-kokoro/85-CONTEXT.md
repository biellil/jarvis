# Phase 85: Clonagem de Voz Kokoro - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar voice cloning no JARVIS: dado um arquivo de áudio de referência (.wav/.mp3), gerar um perfil de voz que o Kokoro (ou modelo alternativo se necessário) usa para sintetizar fala com aquela voz. Suporte a qualquer voz — tanto a própria voz do usuário quanto vozes de terceiros, partindo de arquivo de áudio.

**O que está FORA desta fase:**
- Interface gráfica de gerenciamento de vozes
- Múltiplas vozes armazenadas simultaneamente (apenas uma ativa)
- Gravação interativa de amostras (fase usa importação de arquivo)

</domain>

<decisions>
## Implementation Decisions

### D-01: Voz alvo — sistema genérico (própria + qualquer)
- Voice cloning funciona com qualquer arquivo de áudio de referência
- Cobre tanto a voz própria do usuário quanto vozes externas
- A voz clonada é o objetivo final, não a identidade de quem está sendo clonado

### D-02: Captura — importação de arquivo
- Entrada: arquivo .wav ou .mp3 existente fornecido pelo usuário
- Não há interface de gravação interativa nesta fase (sem gravação no terminal)
- O usuário fornece o caminho do arquivo como argumento

### D-03: Armazenamento — uma voz clonada ativa
- Sistema suporta apenas uma voz clonada ativa por vez
- Armazenada em `~/.jarvis/voices/cloned_voice.pt` (ou formato adequado do modelo)
- Clonar novamente sobrescreve a voz ativa anterior

### D-04: Integração TTS — novo campo `cloned_voice_path`
- `JarvisConfig` ganha campo `cloned_voice_path: str = ""` (default vazio = desativado)
- Quando preenchido, `speak()` em `tts.py` usa esse embedding em vez de `kokoro_voice`
- Ativado/desativado via menu `/config` (item novo)
- Se o arquivo referenciado não existe, fallback silencioso para `kokoro_voice`

### D-05: Modelo — testar Kokoro 82M primeiro
- Pesquisar se `KPipeline` (hexgrad/Kokoro-82M) aceita embeddings de voz externa via voice tensor
- Se o Kokoro 82M não suportar voice cloning nativo: avaliar XTTS v2 (Coqui-fork ainda ativo) ou StyleTTS2
- Objetivo final é a voz clonada funcional — o modelo é secundário

### Claude's Discretion
- Formato exato do arquivo de perfil (.pt, .npz, .pkl) — usar o que o modelo suportar
- Duração mínima recomendada do arquivo de referência para boa qualidade
- Interface CLI do script de clonagem (argumentos, output)
- Nome do item no menu `/config` (ex: "Voz clonada: ativa/inativa")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### TTS Existente
- `apps/desktop-py/src/jarvis_desktop/tts.py` — módulo TTS atual com KPipeline, speak(), _kokoro_speak()
- `apps/desktop-py/src/jarvis_desktop/config.py` — JarvisConfig com campos TTS existentes (kokoro_voice, tts_provider)

### Padrão Existente de Script Standalone
- `tools/train_wake_word.py` — referência de padrão para script offline PEP 723 (uv run)

### Kokoro Model
- `hexgrad/Kokoro-82M` no HuggingFace — modelo em uso; verificar se KPipeline aceita voice embeddings externos

No external specs beyond codebase — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tts.py:_create_kokoro_engine()` — cria KPipeline; ponto de extensão para carregar voz clonada
- `tts.py:_kokoro_speak()` — passa `voice=config.kokoro_voice`; adaptar para aceitar tensor de voz custom
- `tts.py:speak()` — lógica de seleção de provider; adicionar branch para `cloned_voice_path`
- `tts.py:set_provider()` — padrão para hot-swap; similar para ativar/desativar voz clonada
- `config.py:JarvisConfig` — adicionar `cloned_voice_path: str = ""`
- `tools/train_wake_word.py` — padrão de script standalone PEP 723 com `uv run`

### Established Patterns
- Scripts de treinamento/setup ficam em `tools/` com PEP 723 inline deps
- Config fields novos: sempre com default seguro e description detalhada
- Fallback silencioso: se recurso indisponível, continuar sem crash (D-04 em espeak-ng)
- Lazy import de dependências pesadas dentro das funções (não no módulo)

### Integration Points
- `tts.py:speak()` → adicionar branch: se `cloned_voice_path` preenchido e arquivo existe → usar voz clonada
- `config.py:JarvisConfig` → novo campo `cloned_voice_path`
- `chat.py` ou `setup_wizard.py` → possivelmente menu `/config` precisa de novo item
- `__main__.py` → nenhuma mudança esperada

</code_context>

<specifics>
## Specific Ideas

- O usuário quer que o sistema seja genérico (qualquer voz, não só a própria), mas simplificado: apenas uma voz ativa por vez
- Arquivo de referência fornecido pelo usuário (não gravação interativa)
- Se Kokoro 82M não suportar voice cloning nativo, pesquisar alternativas mantendo interface igual

</specifics>

<deferred>
## Deferred Ideas

- Gravação interativa de amostras (descartada nesta fase — usuário prefere importar arquivo)
- Múltiplas vozes clonadas nomeadas com seleção no menu (escopo futuro)
- Interface gráfica de gerenciamento de vozes

</deferred>

---

*Phase: 85-clonagem-de-voz-kokoro*
*Context gathered: 2026-05-28*
