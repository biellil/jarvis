# Phase 88: Emotion Tags + Config UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 88-emotion-tags-config-ux
**Areas discussed:** Emotion tag mapping, Edge cases de tags, Config UX flow, Scope do strip de tags

---

## Emotion Tag Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Alta intensidade (exaggeration ≥2.0) | Bem perceptível, pode soar exagerado | |
| Média (exaggeration ~1.2-1.5) | Notável mas natural, atende critério #1 | ✓ |
| Baixa (exaggeration ~0.8-1.0) | Sutil, provavelmente não passa critério | |

**User's choice:** Média intensidade para [angry]/[excited]

| Option | Description | Selected |
|--------|-------------|----------|
| Reduzir exaggeration + elevar cfg_weight | cfg_weight alto = mais fiel à referência | ✓ |
| Reduzir só exaggeration | Mais simples, sem cfg_weight | |
| Manter padrão, só remover tag | Trata como desconhecida | |

**User's choice:** Reduzir exaggeration (<0.5) + elevar cfg_weight para tags calmas ([soft], [whispering], [breathy])

| Option | Description | Selected |
|--------|-------------|----------|
| Manter defaults do Chatterbox (0.5/0.5) | Natural, sem campo extra | |
| Definir default explícito no config (ex: 0.7/0.5) | Preparar terreno para EMOTE-03 | ✓ |

**User's choice:** Novos campos `chatterbox_exaggeration=0.7` e `chatterbox_cfg_weight=0.5` em `JarvisConfig`

| Option | Description | Selected |
|--------|-------------|----------|
| Igualar a [soft] | Tristeza como expressão quieta | |
| Exaggeration médio-baixo (0.4-0.6) com cfg_weight padrão | Mais granular, separado de [whispering] | ✓ |

**User's choice:** [sad]/[embarrassed] = exaggeration médio-baixo, cfg_weight padrão

---

## Edge Cases de Tags

| Option | Description | Selected |
|--------|-------------|----------|
| Primeira tag prevalece | Simples, LLM coloca tag relevante no início | ✓ |
| Última tag prevalece | Tag como instrução para o que segue | |
| Ignorar todas se conflito | Conservador, descarta intenção | |

**User's choice:** Primeira tag reconhecida prevalece; as demais são ignoradas

| Option | Description | Selected |
|--------|-------------|----------|
| Remover silenciosamente | Tag nunca lida em voz alta, sem log | ✓ |
| Remover e logar no console | Útil para debug | |

**User's choice:** Remoção silenciosa de tags não reconhecidas

---

## Config UX Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt inline ao selecionar chatterbox | Um passo, atende CFGUI-02 direto | ✓ |
| Item separado no menu principal | Dois passos | |

**User's choice:** Prompt inline de audio_prompt_path após selecionar chatterbox no provider list

| Option | Description | Selected |
|--------|-------------|----------|
| Item fixo no menu principal | Sempre visível e editável | |
| Só aparece quando provider=chatterbox | Mais limpo, oculta irrelevante | ✓ |

**User's choice:** Item "Audio referência" visível no menu principal somente quando `tts_provider == "chatterbox"`

---

## Scope do Strip de Tags

| Option | Description | Selected |
|--------|-------------|----------|
| Remover todas as tags do texto (Recommended) | Texto limpo ao modelo, params via kwargs | ✓ |
| Manter tags reconhecidas no texto | Tags ficam no texto, risco de serem lidas | |

**User's choice:** Remover todas as tags `[xxx]` antes de passar ao Chatterbox

| Option | Description | Selected |
|--------|-------------|----------|
| Somente Chatterbox | Kokoro/cloud recebem texto original | ✓ |
| Universal | Nenhum provider lê tags em voz alta | |

**User's choice:** Strip somente no path do Chatterbox

---

## Claude's Discretion

- Valores exatos de exaggeration/cfg_weight dentro das faixas definidas (researcher verifica API)
- Regex exata para strip de tags
- Posição do item "Audio referência" no menu principal
- Prompt exato ao solicitar caminho inline

## Deferred Ideas

- EMOTE-03: Slider de intensidade no /config (future)
- EMOTE-04: Inferência automática de emoção via LLM (future)
- Múltiplas tags com segmentação por trecho (future)
- Hot-swap de arquivo de referência sem reiniciar (future)
