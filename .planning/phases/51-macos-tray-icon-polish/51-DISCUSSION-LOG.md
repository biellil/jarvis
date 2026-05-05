# Phase 51: macOS Tray Icon Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 51-macos-tray-icon-polish
**Areas discussed:** Asset Design, Asset Strategy, Asset Generation, Testing

---

## Asset Design

| Option | Description | Selected |
|--------|-------------|----------|
| Reutilizar silhueta existente | Converter `icon-16x16.png` atual para preto+alpha; mantém identidade visual | ✓ |
| Novo desenho minimalista | Glifo "J", círculo, microfone, ou outro ícone novo | |

**User's choice:** Reutilizar silhueta existente
**Notes:** "mantém identidade visual; o macOS [inverte automaticamente]"

---

## Asset Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pasta plana | `apps/desktop/resources/tray/` com todos os ícones lado a lado | ✓ |
| Subpasta macOS | `apps/desktop/resources/tray/macos/` separado | |

**User's choice:** Claude decide
**Notes:** Claude escolheu pasta plana — menor reorganização, mantém padrão atual.

---

## Asset Generation

| Option | Description | Selected |
|--------|-------------|----------|
| User fornece PNGs | User entrega `iconTemplate.png` + `@2x.png` prontos | |
| Script Node (sharp) | Claude gera via script versionado a partir do ícone atual | ✓ |
| Geração manual ad-hoc | Claude usa ferramenta uma vez, sem script versionado | |

**User's choice:** Claude decide e gera as imagens
**Notes:** Claude escolheu script versionado em `apps/desktop/scripts/` para reproducibilidade futura.

---

## Testing

| Option | Description | Selected |
|--------|-------------|----------|
| Teste platform-specific | Mock `process.platform` em `tray.platform.test.ts` validando seleção do icon path | ✓ |
| Só validação manual | Sem teste automatizado, validação no macOS apenas | |

**User's choice:** Teste platform-specific (sim)
**Notes:** Inclui regression check para win32/linux mantendo `icon-16x16.png` (Success Criteria #4).

---

## Claude's Discretion

- Biblioteca de imagem (`sharp` default, fallback `jimp`)
- Estrutura interna do script de geração
- Trigger do script (on-demand vs prebuild) — preferência: on-demand + commit dos artefatos

## Deferred Ideas

- Redesenho da identidade visual do ícone
- Status indicators no ícone (cor por estado de voz)
- Adaptação de tema no Windows (abordagem diferente do macOS)
