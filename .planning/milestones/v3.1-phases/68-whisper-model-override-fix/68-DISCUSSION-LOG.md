# Phase 68: Whisper Model Override Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 68-whisper-model-override-fix
**Areas discussed:** Estratégia de fix, Inconsistência VRAM auto-detection, Migração de overrides, Cobertura de testes

---

## Estratégia de fix

| Option | Description | Selected |
|--------|-------------|----------|
| Surgical fix em selectWhisperModel | Modifica `selectWhisperModel` para usar `OPTION_TO_MODEL` (export de whisperModelResolver). Mantém interface, mínimo risco, ~10 linhas. Deleta SUPPORTED_MODELS e o warn-fallback. | ✓ |
| Consolidar deletando selectWhisperModel | Remove `selectWhisperModel.ts` inteiro; index.ts chama `resolveWhisperModel` diretamente (precisa expor vramMb de vramDetection). Refactor maior, elimina duplicação. | |
| Manter código, só expandir SUPPORTED_MODELS | Adiciona 'small' e 'large-v3-turbo' em SUPPORTED_MODELS com mapping inline. Mantém divergência entre os dois resolvers. | |

**User's choice:** Surgical fix em selectWhisperModel
**Notes:** Recomendado pelo Claude. Aceito sem objeção. Capturado como D-01/D-02 em CONTEXT.md.

---

## Inconsistência VRAM auto-detection

### Pergunta inicial

| Option | Description | Selected |
|--------|-------------|----------|
| Alinhar com STT-02: >8GB→large, 4-8GB→base, <4GB→tiny | Ajusta vramDetection.ts para bater com contrato STT-02 e selectModelByVram do whisperModelResolver. Usuários atuais de GPU 4-8GB vão de 'medium' para 'base' — STT mais rápido. | |
| Manter código atual: GPU+qualquer VRAM→medium | Atualiza STT-02 contract para refletir realidade. Comportamento atual fica documentado como canonical. | |
| Decida você | Você pesa qualidade vs latência. | |
| Outra resposta livre | Usuário respondeu "quero remover iso esta lgl" (interpretado como pedido de remoção da feature). | ✓ |

**User's choice:** Resposta livre — pediu para remover a auto-detection.

### Pergunta de clarificação

| Option | Description | Selected |
|--------|-------------|----------|
| Não mexer na auto-detection — tá OK como está | Deixar vramDetection.ts como está. Atualizar contrato STT-02 no PROJECT.md. | |
| Remover modo 'auto' inteiro do Settings UI | Tirar a opção 'auto' do dropdown. Forçar usuário a escolher tiny/base/medium/large-v3-turbo manualmente. | ✓ |
| Remover vramDetection.ts inteiro | Apaga detecção de VRAM. Sempre usa um modelo default fixo. | |

**User's choice:** Remover modo 'auto' do Settings UI
**Notes:** Capturado como D-03 em CONTEXT.md. vramDetection.ts permanece no código mas deixa de ser chamada (D-05); deletion fica como deferred idea.

### Pergunta de default

| Option | Description | Selected |
|--------|-------------|----------|
| Default 'base' fixo | Conservativo: roda em qualquer hardware. 'auto' legado salvo migra silenciosamente para 'base'. | ✓ |
| vramDetection ainda escolhe default no primeiro startup | vramDetection roda 1x e grava resultado como override. Depois é fixo. | |
| Remover vramDetection.ts inteiro também | Default 'base' fixo + apaga vramDetection.ts e selectWhisperModel.ts. | |

**User's choice:** Default 'base' fixo
**Notes:** Capturado como D-04/D-06/D-07 em CONTEXT.md.

---

## Migração de overrides existentes

| Option | Description | Selected |
|--------|-------------|----------|
| Sem migração — fix só passa a funcionar | 'small' agora vira 'base' (era 'medium'); 'large-v3-turbo' agora vira 'large' (era 'medium'). Usuário percebe diferença sem precisar tocar config. | ✓ |
| Toast informando o modelo ativo no primeiro startup | "Modelo Whisper agora aplica corretamente: usando X." | |
| Resetar override para 'auto' se for 'small' ou 'large-v3-turbo' | Força usuário a reconfigurar. | |

**User's choice:** Sem migração
**Notes:** Recomendado pelo Claude. Capturado como D-07/D-08 em CONTEXT.md.

---

## Cobertura de teste de regressão

| Option | Description | Selected |
|--------|-------------|----------|
| Matriz pure-function: 6 UI options × 3 VRAM scenarios | Testes em whisper-model-resolver.test.ts e selectWhisperModel.test.ts cobrindo todas combinações. Pure tests = rápidos, sem mocks. | ✓ |
| Pure tests + integration test em index.ts startup path | Combinação defensive depth. Mais código, mais cobertura. | |
| Só integration test em voiceHandler | Pula pure tests; valida E2E. Menos casos cobertos. | |

**User's choice:** Matriz pure-function
**Notes:** Após D-03, são 5 UI options (não 6 — `'auto'` removido) × 3 VRAM scenarios. Capturado como D-09/D-10 em CONTEXT.md.

---

## Claude's Discretion

- Estrutura exata de import/export entre `selectWhisperModel.ts` e `whisperModelResolver.ts`
- Localização do Settings UI Select que perde a opção `'auto'` (descobrir durante planejamento)
- Mensagens de log durante load do modelo
- Decisão sobre manter ou remover branch `option === 'auto'` em `ipc/whisper.ts` (defensive fallback ou código morto)

## Deferred Ideas

- **Apagar `vramDetection.ts` inteiro** após auto-detection deixar de ser usada — milestone futuro
- **Atualizar STT-02 contract no PROJECT.md** — contrato histórico fica obsoleto após D-03
- **Remover branch `option === 'auto'` em `ipc/whisper.ts`** — defensive fallback ou código morto, decisão do planner
