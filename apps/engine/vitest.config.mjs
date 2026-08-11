import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@engine": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
