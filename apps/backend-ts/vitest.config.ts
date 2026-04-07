import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    env: loadEnv("test", "../../", ""),
  },
});
