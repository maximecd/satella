import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/optimus-connectors-vitest",
  test: {
    include: ["test/**/*.test.ts"],
  },
});
