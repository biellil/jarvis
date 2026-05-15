import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../validate-electron-builder.mjs');

function runWith(ymlContent) {
  const tmp = path.join(os.tmpdir(), `electron-builder-test-${Date.now()}-${Math.random()}.yml`);
  fs.writeFileSync(tmp, ymlContent);
  const r = spawnSync('node', [SCRIPT, tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  return r;
}

const VALID_YML = `
appId: com.jarvis.desktop
productName: JARVIS
extraResources:
  - from: "../../.env.example"
    to: ".env.example"
  - from: "../../node_modules/@img/sharp-darwin-arm64"
    to: "node_modules/@img/sharp-darwin-arm64"
    filter:
      - "lib/**"
      - "package.json"
  - from: "../../node_modules/@img/sharp-darwin-x64"
    to: "node_modules/@img/sharp-darwin-x64"
    filter:
      - "lib/**"
      - "package.json"
  - from: "../../node_modules/@img/sharp-linux-x64"
    to: "node_modules/@img/sharp-linux-x64"
    filter:
      - "lib/**"
      - "package.json"
  - from: "resources/models/whisper"
    to: "models/whisper"
    filter:
      - "ggml-base.bin"
      - "ggml-medium.bin"
win:
  target:
    - nsis
    - portable
mac:
  target:
    - target: dmg
      arch:
        - universal
linux:
  target: AppImage
`;

describe('validate-electron-builder', () => {
  it('exits 0 for fully valid yml', () => {
    const r = runWith(VALID_YML);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('OK');
  });

  it('exits 1 when win.target is missing portable', () => {
    const r = runWith(VALID_YML.replace('    - portable\n', ''));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('portable');
  });

  it('exits 1 when mac.target lacks universal', () => {
    const r = runWith(VALID_YML.replace('        - universal\n', '        - arm64\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('universal');
  });

  it('exits 1 when .env.example bundle missing', () => {
    const modified = VALID_YML.replace(
      '  - from: "../../.env.example"\n    to: ".env.example"\n',
      ''
    );
    const r = runWith(modified);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('.env.example');
  });

  it('exits 1 when whisper filter contains ggml-tiny.bin', () => {
    const r = runWith(VALID_YML.replace('      - "ggml-base.bin"', '      - "ggml-tiny.bin"\n      - "ggml-base.bin"'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ggml-tiny');
  });

  it('exits 1 when sharp-linux-x64 prebuild missing', () => {
    const modified = VALID_YML.replace(
      '  - from: "../../node_modules/@img/sharp-linux-x64"\n    to: "node_modules/@img/sharp-linux-x64"\n    filter:\n      - "lib/**"\n      - "package.json"\n',
      ''
    );
    const r = runWith(modified);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sharp-linux-x64');
  });

  it('exits 0 against real apps/desktop/electron-builder.yml (post-Task-1)', () => {
    const ROOT = path.resolve(__dirname, '../..');
    const realYml = path.join(ROOT, 'apps/desktop/electron-builder.yml');
    const r = spawnSync('node', [SCRIPT, realYml], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
