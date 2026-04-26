---
title: VoiceModeManager dispose-before-factory deixa estado zumbi quando nova factory falha
created: 2026-04-26
target_phase: 43
related: [41-03 gap closure, voiceMode/index.ts:191-216]
---

## Contexto

Encontrado durante UAT da Phase 41 após gap closure que removeu o gate `getStatus() !== 'idle'`.

## Problema

Em `apps/desktop/src/main/voiceMode/index.ts:191-216`, a ordem do `setMode()` é:

1. `dispose()` na strategy antiga (sempre executa)
2. Tenta `factory()` da nova
3. Se factory lança → `activeStrategy = null`, `currentMode` mantém valor antigo, retorna `false`

**Resultado:** o sistema fica em estado zumbi — `currentMode` aponta pra modo antigo mas `activeStrategy === null` (a strategy antiga foi destruída e a nova nunca nasceu). Sem captura ativa até o usuário clicar em outro modo válido.

## Repro (logs reais do user)

```
[VoiceModeManager] Mode changed: always-listening → wake-word (reason: user)
[WakeWordStrategy] dispose()
[VoiceModeManager] setMode() — Strategy not ready for mode 'ptt-only': PttOnlyStrategy not yet implemented (Phase 43)
[VoiceModeManager] Mode changed: wake-word → always-listening (reason: user)
```

Entre linhas 2 e 4, o usuário ficou sem detecção de wake word.

## Por que não corrigi na Phase 41

- Não é regressão da gap closure: a ordem dispose→factory já existia antes; o gate `getStatus() !== 'idle'` apenas escondia esse caso bloqueando o `setMode` inteiro durante captura.
- Phase 43 vai implementar `PttOnlyStrategy`, eliminando o caso "factory lança" para o único modo onde isso ainda acontece.
- User confirmou OK em deixar pra Phase 43 (decisão registrada na conversa de execução da Phase 41).

## Opções de fix (para Phase 43 considerar)

**(A) Inverter ordem — factory primeiro:**
```typescript
const newStrategy = factory();  // se lança, antiga continua intocada
await this.activeStrategy?.dispose();  // só dispose se factory ok
this.activeStrategy = newStrategy;
await newStrategy.start();
```
Mais seguro mas mantém duas strategies vivas brevemente.

**(B) Recovery em catch — re-instanciar antiga:**
Se factory falha, recriar a strategy antiga via factory dela e dar `start()` de novo. Atomicidade real, mas exige guardar referência ao mode antigo + factory.

**(C) Side-effect-free dispose:** mudar dispose para não liberar microfone até que sucessor confirme — mais invasivo.

## Decisão recomendada

Opção (A) ou (B) durante implementação do `PttOnlyStrategy` na Phase 43, junto com testes que cobrem "factory throws → estado preservado".
