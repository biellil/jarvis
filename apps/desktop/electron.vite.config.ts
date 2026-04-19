import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * 22-GAP-02: Serve os .wasm/.mjs do onnxruntime-web via /ort/* em dev e copia
 * pra dist/renderer/ort/ no build. Não podemos usar public/ porque Vite bloqueia
 * dynamic imports de arquivos lá (ORT carrega .mjs via new Worker(url, {type:
 * 'module'}) que Vite processa como module import).
 */
function ortWasmPlugin(): Plugin {
  const ORT_FILES = [
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.jsep.mjs',
  ];

  function resolveOrtDistDir(): string {
    // pnpm hoists o onnxruntime-web pra node_modules do workspace ou root.
    const candidates = [
      path.join(__dirname, 'node_modules', 'onnxruntime-web', 'dist'),
      path.join(__dirname, '..', '..', 'node_modules', 'onnxruntime-web', 'dist'),
    ];
    for (const dir of candidates) {
      if (existsSync(path.join(dir, 'ort-wasm-simd-threaded.wasm'))) {
        return dir;
      }
    }
    throw new Error(
      `[ort-wasm-plugin] onnxruntime-web/dist não encontrado. Tried:\n  ${candidates.join('\n  ')}\nRun \`pnpm install\` first.`,
    );
  }

  return {
    name: 'ort-wasm-serve',

    // Dev server: intercepta /ort/* e serve do node_modules com content-type correto
    configureServer(server) {
      const srcDir = resolveOrtDistDir();
      server.middlewares.use('/ort', (req, res, next) => {
        const reqPath = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
        if (!ORT_FILES.includes(reqPath)) {
          return next();
        }
        const filePath = path.join(srcDir, reqPath);
        if (!existsSync(filePath)) {
          return next();
        }
        const isWasm = reqPath.endsWith('.wasm');
        res.setHeader('Content-Type', isWasm ? 'application/wasm' : 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(filePath));
      });
    },

    // Build: emite os mesmos arquivos em dist/renderer/ort/
    generateBundle() {
      const srcDir = resolveOrtDistDir();
      for (const file of ORT_FILES) {
        const filePath = path.join(srcDir, file);
        if (existsSync(filePath)) {
          this.emitFile({
            type: 'asset',
            fileName: `ort/${file}`,
            source: readFileSync(filePath),
          });
        }
      }
    },
  };
}

// 22-GAP-12: Bundle tudo (exceto electron + built-ins Node) no main/preload.
// Motivo: pnpm usa symlinks em node_modules. electron-builder copia os symlinks
// pro asar, mas eles apontam pra C:\jarvis\node_modules\... que não existe no
// app instalado. Resultado: ERR_MODULE_NOT_FOUND pra deps transitivas (ex: ajv
// via electron-store → conf → ajv).
// Fix: rollup bundla tudo inline no dist/main/index.js, não precisa node_modules
// em runtime (só electron, que vem com o Electron instalação).
// Phase 29: @fugood/whisper.node externalizado — native addon não pode ser
// bundlado pelo Vite. Disponível via extraResources no app empacotado e via
// pnpm symlinks em dev. Inclui platform packages (win32/linux/darwin variants).
const MAIN_EXTERNALS = ['electron', /^node:/, /^@fugood\//];

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      // 22-GAP-12: electron-vite tem build.externalizeDeps=true por default,
      // que injeta externalizeDepsPlugin() automaticamente. Sem isso desligado,
      // electron-store/conf/ajv ficam externalizados e pnpm symlinks quebram
      // no app empacotado. Setando false, rollup bundla tudo no dist/main/index.js.
      externalizeDeps: false,
      rollupOptions: {
        external: MAIN_EXTERNALS,
        input: {
          index: path.resolve(__dirname, 'src/main/index.ts'),
        },
      },
      sourcemap: process.env.NODE_ENV === 'development', // D-10
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      externalizeDeps: false,
      rollupOptions: {
        external: MAIN_EXTERNALS,
        input: {
          index: path.resolve(__dirname, 'src/preload/index.ts'),
          settings: path.resolve(__dirname, 'src/preload/settings.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
      sourcemap: process.env.NODE_ENV === 'development', // D-10
    },
  },
  renderer: {
    root: 'src/renderer',
    envDir: path.resolve(__dirname), // Phase 22 Plan 03 — .env* em apps/desktop/
    plugins: [
      react(),
      tailwindcss(),
      ortWasmPlugin(), // 22-GAP-02: serve /ort/* em dev + emite em dist no build
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@renderer': path.resolve(__dirname, 'src/renderer'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      outDir: 'dist/renderer',
      sourcemap: process.env.NODE_ENV === 'development', // D-10
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/renderer/index.html'),
          settings: path.resolve(__dirname, 'src/renderer/settings.html'),
        },
      },
    },
  },
});
