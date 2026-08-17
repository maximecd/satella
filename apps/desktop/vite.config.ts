import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    pack: {
      format: "cjs",
      outDir: "dist",
      sourcemap: true,
      entry: ["src/main.ts", "src/preload.ts"],
      clean: true,
      dts: false,
      deps: {
        neverBundle: true,
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        include: ["src/**/*.ts"],
        exclude: [
          "**/*.d.ts",
          "**/*.{test,spec}.ts",
          "**/*.test-utils.ts",
          // Electron app lifecycle cannot be imported safely in unit tests.
          "src/main.ts",
        ],
        thresholds: {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
  }),
);
