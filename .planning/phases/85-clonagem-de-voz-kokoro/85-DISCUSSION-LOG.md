# Phase 85: Clonagem de Voz Kokoro - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 85-clonagem-de-voz-kokoro
**Areas discussed:** Voz alvo, Captura de amostras, Armazenamento e seleção, Integração com TTS

---

## Voz alvo

| Option | Description | Selected |
|--------|-------------|----------|
| Minha própria voz | O JARVIS fala com a sua voz. Caso de uso pessoal — mais simples de validar. | |
| Qualquer voz | Clonar qualquer voz a partir de amostras (arquivo .wav/.mp3). | |
| Ambos (minha + qualquer) | Suporte genérico: a própria voz é apenas mais uma entrada no sistema. | ✓ |

**User's choice:** Ambos — sistema genérico que aceita qualquer arquivo de áudio
**Notes:** A própria voz do usuário é só mais um caso de uso do sistema genérico.

---

## Captura de amostras

| Option | Description | Selected |
|--------|-------------|----------|
| Gravação interativa | Script similar ao train_wake_word.py — grava N frases no terminal. | |
| Importar arquivo existente | Passar um arquivo .wav/.mp3 como entrada. | ✓ |
| Ambos | Gravação interativa + importação de arquivo. | |

**User's choice:** Importar arquivo existente
**Notes:** Sem gravação interativa nesta fase. O usuário fornece o arquivo.

---

## Armazenamento e seleção

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.jarvis/voices/ com nome livre | Múltiplas vozes clonadas nomeadas. | |
| Só uma voz clonada ativa | Uma voz clonada por vez — sobrescreve ao clonar. | ✓ |
| Integrado ao kokoro_voice field | Referenciada como 'custom:{nome}' no campo existente. | |

**User's choice:** Só uma voz clonada ativa
**Notes:** Simplicidade preferida — uma voz ativa, sobrescreve ao clonar novamente.

---

## Integração com TTS

| Option | Description | Selected |
|--------|-------------|----------|
| Novo campo cloned_voice_path | JarvisConfig ganha cloned_voice_path: str. speak() usa se preenchido. | ✓ |
| Extender kokoro_voice | kokoro_voice aceita path além de nomes built-in. | |
| Claude decide | Abordagem mais limpa dado o código existente. | |

**User's choice:** Novo campo cloned_voice_path (recomendado)
**Notes:** Campo explícito em JarvisConfig. Fallback para kokoro_voice se arquivo não existe.

---

## Pergunta extra: modelo base

| Option | Description | Selected |
|--------|-------------|----------|
| Testar Kokoro 82M primeiro | Verificar se KPipeline aceita embeddings externos. Se não, avaliar alternativas. | ✓ |
| Já sei que precisa de outro modelo | Kokoro 82M não suporta — usar XTTS v2 ou StyleTTS2. | |
| Tanto faz — melhor tool | Trocar de modelo se necessário. | |

**User's choice:** Testar Kokoro 82M primeiro
**Notes:** Pesquisar na fase de research se KPipeline suporta voice embeddings externos antes de decidir o modelo.

---

## Claude's Discretion

- Formato do arquivo de perfil de voz (.pt, .npz, .pkl)
- Duração mínima recomendada do áudio de referência
- Interface CLI do script de clonagem
- Nome do item no menu `/config`

## Deferred Ideas

- Gravação interativa de amostras (preferência por importação de arquivo)
- Múltiplas vozes clonadas com nomes diferentes
- Interface gráfica de gerenciamento de vozes
