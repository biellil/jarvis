---
phase: 71
plan: 05
type: summary
status: deferred-by-hardware
completed_at: 2026-05-12
requirements_validated: []
requirements_deferred:
  - DIST-01
  - DIST-02
threats_addressed:
  - T-71-03
  - T-71-11
decisions_exercised: []
files:
  created:
    - .planning/phases/71-multi-platform-distribution/71-05-SUMMARY.md
    - .planning/phases/71-multi-platform-distribution/71-05-HUMAN-UAT.md
metrics:
  wine_installed: false
  exe_built: false
  windows_uat_executed: false
---

# Plan 71-05 Summary — Windows NSIS+Portable Cross-Build (DIST-01 + DIST-02) — DEFERRED

## Goal NOT Achieved (Por Decisão Explícita)

DIST-01 (Windows NSIS installer) e DIST-02 (Windows portable .exe) **não foram executados nesta sessão**. Bloqueio é de hardware: o plan exige UAT manual em PC Windows físico (D-03) que não está disponível agora. Cross-build via wine no host Linux também não foi tentado por não fazer sentido sem UAT subsequente em Windows real (binário cross-compiled validado só em mock = false positive).

## Razão do Deferimento

Este plan tem dois bloqueios concretos:

1. **Hardware necessário (D-03 UAT)** — must_haves 4, 5, 6 do PLAN exigem:
   - NSIS installer rodando em Windows 10/11 (atalho Menu Iniciar)
   - Painel de Controle → Apps & Features listando JARVIS com Uninstall funcional
   - Portable .exe rodando em Windows sem admin

   Nenhum desses é verificável em host Linux. Sem PC Windows físico, mesmo gerar os binários é "validado por config" — pior que o estado atual onde nem se assume que cross-build wine funciona.

2. **Estratégia de v3.1** — usuário optou explicitamente por marcar 71-04 + 71-05 como deferred no commit `d3d6a1b` ("registrar 71-04 + 71-05 como deferred (smoke tests manuais)") e fechar Phase 71 como deliverable parcial. Esta sessão materializa essa decisão em `SUMMARY` + `HUMAN-UAT.md` rastreáveis.

## O Que NÃO Foi Feito (Lista Explícita)

- ❌ Instalação de `wine` no host Linux dev
- ❌ Instalação de `mono-devel` (opcional)
- ❌ Instalação de `libfuse2t64`
- ❌ `pnpm dist:win` (não executado)
- ❌ Geração de `JARVIS Setup *.exe` (NSIS)
- ❌ Geração de `JARVIS *.exe` (portable)
- ❌ UAT D-03 em PC Windows físico (4 checks):
  1. NSIS installer instala em Windows 10/11
  2. Atalho Menu Iniciar criado
  3. Painel de Controle lista JARVIS com Uninstall
  4. Portable .exe roda sem privilégios admin

Tudo isto fica rastreado em `71-05-HUMAN-UAT.md` (`status: blocked`, `blocked_by: physical-device`).

## O Que Foi Feito (Trabalho Adjacente Útil)

- ✅ **Plan 71-02** já configurou `electron-builder.yml` com targets Windows (NSIS + portable). Cross-build via wine **deveria** funcionar quando hardware estiver disponível.
- ✅ **Plan 71-03** (`scripts/preflight-dist.mjs`) já tem checks `win` (valida `wine`, `mono` opcional).
- ✅ **Plan 71-06** (README §Build & Install Windows) documenta o workflow completo (NSIS + portable + SmartScreen bypass) em pt-BR — usuário sabe como rodar quando tiver PC Windows.

Resumindo: a **infraestrutura está pronta**, só falta a execução + UAT em hardware.

## Threats Addressed

| Threat ID | Disposition | Mitigation |
|-----------|-------------|------------|
| T-71-03 (unsigned installer repudiation) | accept (documented) | README warning + workflow de bypass passo-a-passo (Plan 71-06). Code signing deferido para DIST-FUT-02 (v3.2+). |
| T-71-11 (unsigned binary spoofing) | accept | DIST-FUT-02 deferido. User opt-in informado via README. |

## Cross-References

- **Plan 71-02** — `electron-builder.yml` linhas X-Y (targets Windows). Já validado por `validate-electron-builder.mjs`.
- **Plan 71-03** — `scripts/preflight-dist.mjs` tem `win` mode. Não testado em runtime.
- **Plan 71-06** — README §Build & Install §Windows documenta NSIS+portable workflow (pt-BR, com SmartScreen bypass).

## Como Destravar Este Plan

Quando você tiver acesso a:
1. **Host Linux dev com `sudo`** para instalar wine + mono-devel + libfuse2t64
2. **PC Windows 10/11 físico** para UAT D-03

Então:

```bash
# No host Linux:
sudo apt update
sudo apt install -y wine mono-devel libfuse2t64
pnpm dist:win

# Copiar binários gerados:
#   apps/desktop/release-v2/JARVIS Setup 0.1.0.exe (NSIS)
#   apps/desktop/release-v2/JARVIS 0.1.0.exe (portable)
# para PC Windows e executar UAT.
```

Em seguida abrir `71-05-HUMAN-UAT.md` e marcar resultados de cada teste. Quando todos pass → `/gsd-verify-work 71`.

## Resume Signal

`blocked-by-hardware: deferred-by-explicit-decision`

Plan 71-05 reabre quando hardware Windows estiver disponível. Não bloqueia milestone v3.1 — DIST-01 + DIST-02 ficam como debt explícito rastreado em ROADMAP Progress Table com status especial.
