---
phase: 22-voiceinputmanager-refactor-wake-word-core
plan: GAP-01
type: execute
wave: 4
depends_on: ["01", "02", "03", "04"]
autonomous: true
gap_closure: true
requirements: [WAKE-09]
files_modified:
  - apps/desktop/src/main/voiceInput/resources.ts
  - apps/desktop/src/main/__tests__/voiceInput-resources.test.ts
tags: [bugfix, path-resolver, wake-word]

must_haves:
  truths:
    - "getWakeWordModelPaths() em dev resolve para apps/desktop/resources/wakeword-models/, não apps/resources/"
    - "Teste unitário valida estrutura do path resolvido para prevenir regressão do off-by-one"
  artifacts:
    - path: "apps/desktop/src/main/voiceInput/resources.ts"
      provides: "Path resolver corrigido — 2 níveis acima de dist/main/, não 3"
      contains: "../../resources/wakeword-models"
---

<objective>
Fix off-by-one error in `getWakeWordModelPaths()` — dev mode path resolver goes up 3 directories from `dist/main/` (resolving to `apps/resources/wakeword-models`) instead of 2 (`apps/desktop/resources/wakeword-models`).

Runtime failure observed:
```
Error occurred in handler for 'wakeWord:load-models':
ENOENT: no such file or directory, open 'C:\jarvis\apps\resources\wakeword-models\embedding_model.onnx'
```

Root cause: `path.join(__dirname, '../../../resources/wakeword-models')` on line 43 of `apps/desktop/src/main/voiceInput/resources.ts`. `__dirname` at runtime is `apps/desktop/dist/main/` (from `dist/main/index.js`). Three `../` levels up lands on `apps/`, which is one too many.

Purpose: Fix the off-by-one so wake word models load in dev mode. Add a regression test that asserts the resolved path structure (matches `apps/desktop/resources/wakeword-models/*.onnx`).
</objective>

<context>
Bundle location at runtime: `apps/desktop/dist/main/index.js`
- `__dirname` = `apps/desktop/dist/main/`
- `../` = `apps/desktop/dist/`
- `../../` = `apps/desktop/` ✓ (correct target)
- `../../../` = `apps/` ✗ (current, wrong)

Models directory (confirmed via ls):
`apps/desktop/resources/wakeword-models/` with 4 files: melspectrogram.onnx, embedding_model.onnx, silero_vad.onnx, hey_jarvis_v0.1.onnx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix off-by-one in resources.ts + add regression test</name>
  <files>
    apps/desktop/src/main/voiceInput/resources.ts
    apps/desktop/src/main/__tests__/voiceInput-resources.test.ts
  </files>
  <read_first>
    apps/desktop/src/main/voiceInput/resources.ts
  </read_first>
  <action>
    **File 1: apps/desktop/src/main/voiceInput/resources.ts**

    Change line 42 comment and line 43 path:

    BEFORE:
    ```typescript
      const base = app.isPackaged
        ? path.join(process.resourcesPath, 'wakeword-models')
        : // Em dev: dist/main/index.js → ../../../resources/wakeword-models → apps/desktop/resources/wakeword-models
          path.join(__dirname, '../../../resources/wakeword-models');
    ```

    AFTER:
    ```typescript
      const base = app.isPackaged
        ? path.join(process.resourcesPath, 'wakeword-models')
        : // Em dev: dist/main/index.js → ../../resources/wakeword-models → apps/desktop/resources/wakeword-models
          path.join(__dirname, '../../resources/wakeword-models');
    ```

    **File 2: apps/desktop/src/main/__tests__/voiceInput-resources.test.ts** (new)

    Create a regression test using vitest. The test simulates the dev path math from a fake `dist/main/index.js` location and asserts the resolved path ends with `apps/desktop/resources/wakeword-models`.

    ```typescript
    import { describe, it, expect, vi } from 'vitest';
    import path from 'node:path';

    // Mock electron before importing the module
    vi.mock('electron', () => ({
      app: { isPackaged: false },
    }));

    describe('voiceInput/resources — getWakeWordModelPaths', () => {
      it('resolves dev path to apps/desktop/resources/wakeword-models, not apps/resources/', async () => {
        const { getWakeWordModelPaths } = await import('../voiceInput/resources.js');
        const paths = getWakeWordModelPaths();

        // Each resolved path MUST end with the full apps/desktop/resources/wakeword-models/ segment.
        // This regression test catches off-by-one where '../../../' was used instead of '../../'
        // (which resolved to apps/resources/wakeword-models — missing the desktop/ segment).
        const expected = path.join('apps', 'desktop', 'resources', 'wakeword-models');
        expect(paths.mel).toContain(expected);
        expect(paths.embed).toContain(expected);
        expect(paths.vad).toContain(expected);
        expect(paths.kw).toContain(expected);

        // Explicit negative assertion: must not resolve to apps/resources/ (missing desktop/)
        const wrongPath = path.join('apps', 'resources', 'wakeword-models');
        expect(paths.mel).not.toMatch(new RegExp(`${wrongPath.replace(/[\\/]/g, '[\\\\/]')}(?!/desktop)`));
      });

      it('preserves the 4 model filenames', async () => {
        const { getWakeWordModelPaths } = await import('../voiceInput/resources.js');
        const paths = getWakeWordModelPaths();
        expect(paths.mel).toMatch(/melspectrogram\.onnx$/);
        expect(paths.embed).toMatch(/embedding_model\.onnx$/);
        expect(paths.vad).toMatch(/silero_vad\.onnx$/);
        expect(paths.kw).toMatch(/hey_jarvis_v0\.1\.onnx$/);
      });
    });
    ```

    Note: In test mode, `__dirname` will point to the source file location (`apps/desktop/src/main/voiceInput/`), not the bundled location. The `../../` path math resolves from source dir to `apps/desktop/src/resources/wakeword-models/` — NOT the real dev target.

    The test's `toContain('apps/desktop/resources/wakeword-models')` check still passes because the assertion only requires that substring to appear in the resolved path; but in test mode the resolved path is `apps/desktop/src/main/voiceInput/../../resources/wakeword-models/...` which normalizes to `apps/desktop/src/resources/wakeword-models/...` — this does NOT contain `apps/desktop/resources/wakeword-models`.

    **REVISED TEST STRATEGY:** Since `__dirname` differs between bundle and source, test the path math directly with a controlled base dir instead of calling the real function. Refactor the test to use `path.resolve` directly:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import path from 'node:path';

    describe('voiceInput/resources — wake word path math', () => {
      it('dev path math: ../../resources from dist/main lands on apps/desktop/resources', () => {
        // Simulate __dirname = apps/desktop/dist/main/
        const fakeDirname = path.join('C:', 'jarvis', 'apps', 'desktop', 'dist', 'main');
        const resolved = path.resolve(fakeDirname, '../../resources/wakeword-models');
        // Must equal apps/desktop/resources/wakeword-models, NOT apps/resources/
        expect(resolved).toBe(path.join('C:', 'jarvis', 'apps', 'desktop', 'resources', 'wakeword-models'));
      });

      it('off-by-one detection: ../../../resources from dist/main INCORRECTLY lands on apps/resources', () => {
        // This is the bug we are fixing — document it so nobody regresses.
        const fakeDirname = path.join('C:', 'jarvis', 'apps', 'desktop', 'dist', 'main');
        const wrong = path.resolve(fakeDirname, '../../../resources/wakeword-models');
        expect(wrong).toBe(path.join('C:', 'jarvis', 'apps', 'resources', 'wakeword-models'));
        expect(wrong).not.toContain(path.join('apps', 'desktop', 'resources'));
      });

      it('source file uses ../../resources (not ../../../)', async () => {
        const fs = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const here = path.dirname(fileURLToPath(import.meta.url));
        const srcPath = path.join(here, '..', 'voiceInput', 'resources.ts');
        const source = await fs.readFile(srcPath, 'utf-8');

        // Must have '../../resources/wakeword-models'
        expect(source).toContain("'../../resources/wakeword-models'");
        // Must NOT have '../../../resources/wakeword-models' (off-by-one)
        expect(source).not.toContain("'../../../resources/wakeword-models'");
      });
    });
    ```

    The third test literally reads the source file and asserts the correct string is present — this guarantees regression detection regardless of how `__dirname` resolves at test time.
  </action>
  <verify>
    <automated>grep -c "'../../resources/wakeword-models'" /root/jarvis/apps/desktop/src/main/voiceInput/resources.ts</automated>
    Deve retornar 1.
    <automated>grep -c "'../../../resources/wakeword-models'" /root/jarvis/apps/desktop/src/main/voiceInput/resources.ts</automated>
    Deve retornar 0.
    <automated>cd /root/jarvis && pnpm --filter @jarvis/desktop test --run voiceInput-resources 2>&1 | tail -10</automated>
    Deve mostrar 3 testes passando.
    <automated>cd /root/jarvis && pnpm --filter @jarvis/desktop build 2>&1 | tail -5</automated>
    Deve compilar sem erros.
  </verify>
  <acceptance_criteria>
    - `grep "'../../resources/wakeword-models'" apps/desktop/src/main/voiceInput/resources.ts` retorna 1 match
    - `grep "'../../../resources/wakeword-models'" apps/desktop/src/main/voiceInput/resources.ts` retorna 0 matches
    - `apps/desktop/src/main/__tests__/voiceInput-resources.test.ts` existe e tem 3 testes
    - `pnpm --filter @jarvis/desktop test --run voiceInput-resources` retorna 3/3 pass
    - `pnpm --filter @jarvis/desktop build` completa sem erros de TypeScript
  </acceptance_criteria>
  <done>
    Off-by-one corrigido. 3 testes de regressão adicionados (path math correto, off-by-one documentado como wrong, source file grep). Build passa.
  </done>
</task>

</tasks>

<success_criteria>
- `apps/desktop/src/main/voiceInput/resources.ts` usa `'../../resources/wakeword-models'` (não `'../../../'`)
- Regression test file existe e passa 3/3
- Build do desktop compila sem erros
- `pnpm dev` + chamada ao wake word IPC não falha com ENOENT
</success_criteria>

<output>
Após conclusão, criar `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-GAP-01-SUMMARY.md`
</output>
