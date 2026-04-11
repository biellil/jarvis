import { describe, it, expect } from 'vitest';
import path from 'node:path';

describe('voiceInput/resources — wake word path math', () => {
  // Simulate a project root that works on any OS
  const fakeRoot = path.parse(process.cwd()).root || (process.platform === 'win32' ? 'C:' : '/');
  const projectRoot = path.join(fakeRoot, 'jarvis');

  it('dev path math: ../../resources from dist/main lands on apps/desktop/resources', () => {
    // Simulate __dirname = /path/to/jarvis/apps/desktop/dist/main/
    const fakeDirname = path.join(projectRoot, 'apps', 'desktop', 'dist', 'main');
    const resolved = path.resolve(fakeDirname, '../../resources/wakeword-models');
    
    const expected = path.join(projectRoot, 'apps', 'desktop', 'resources', 'wakeword-models');
    expect(resolved).toBe(expected);
  });

  it('off-by-one detection: ../../../resources from dist/main INCORRECTLY lands on apps/resources', () => {
    // This is the bug we are fixing — document it so nobody regresses.
    const fakeDirname = path.join(projectRoot, 'apps', 'desktop', 'dist', 'main');
    const wrong = path.resolve(fakeDirname, '../../../resources/wakeword-models');
    
    const expectedWrong = path.join(projectRoot, 'apps', 'resources', 'wakeword-models');
    expect(wrong).toBe(expectedWrong);
    expect(wrong).not.toContain(path.join('apps', 'desktop', 'resources'));
  });

  it('source file uses ../../resources (not ../../../)', async () => {
    const fs = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    // vitest runs tests from the package root, so we need to adjust the path
    const here = path.dirname(fileURLToPath(import.meta.url));
    const srcPath = path.resolve(here, '../voiceInput/resources.ts');
    const source = await fs.readFile(srcPath, 'utf-8');

    // Must have '../../resources/wakeword-models'
    expect(source).toContain("'../../resources/wakeword-models'");
    // Must NOT have '../../../resources/wakeword-models' (off-by-one)
    expect(source).not.toContain("'../../../resources/wakeword-models'");
  });
});
