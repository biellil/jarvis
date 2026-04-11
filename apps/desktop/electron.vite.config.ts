import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/main/index.ts'),
        },
      },
      sourcemap: process.env.NODE_ENV === 'development', // D-10
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/preload/index.ts'),
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
        input: path.resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
