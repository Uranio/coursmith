import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/eval/**/*.eval.ts"],
    // .env.local holds the OpenRouter key and models (Next.js skips it under NODE_ENV=test).
    env: loadEnv("development", process.cwd(), ""),
  },
});
