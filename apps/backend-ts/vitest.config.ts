import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    env: loadEnv("test", "../../", ""),
    // Phase 65: @n8n/json-schema-to-zod ESM dist tem imports relativos sem extensão .js
    // (bug upstream). Forçar inline para o resolver do Vite tratar a extensão implícita.
    server: {
      deps: {
        inline: ["@n8n/json-schema-to-zod"],
      },
    },
  },
});
