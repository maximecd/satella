import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    pack: {
      entry: ["src/index.ts"],
      outDir: "dist",
      format: "esm",
      platform: "node",
      sourcemap: true,
      dts: true,
      clean: true,
      deps: { neverBundle: true },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        include: ["src/**/*.ts"],
        exclude: ["**/*.d.ts", "**/*.{test,spec}.ts", "**/*.test-utils.ts"],
        thresholds: { lines: 70, statements: 70, functions: 60, branches: 50 },
      },
    },
  }),
);
