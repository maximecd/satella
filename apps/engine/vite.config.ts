import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    pack: {
      entry: ["src/main.ts"],
      outDir: "dist",
      format: "esm",
      platform: "node",
      sourcemap: true,
      clean: true,
      dts: false,
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      hookTimeout: 30_000,
      testTimeout: 30_000,
      coverage: {
        include: ["src/**/*.ts"],
        exclude: [
          "**/*.d.ts",
          "**/*.{test,spec}.ts",
          "**/*.test-utils.ts",
          // Test-only Effect Vitest re-export is not production source.
          "src/effect/vitest.ts",
          // Process launch glue cannot be imported safely in unit tests.
          "src/main.ts",
        ],
        thresholds: {
          // Measured after the Effect 4/service extraction; ratchet upward with new tests.
          lines: 69,
          statements: 69,
          functions: 54,
          branches: 55,
          "src/finance/**/{Models,Resolution,Reconciliation}.ts": {
            lines: 100,
            statements: 100,
            functions: 100,
            branches: 90,
          },
          "src/database/migrations/*.ts": {
            lines: 90,
            statements: 90,
            functions: 90,
            branches: 85,
          },
        },
      },
    },
  }),
);
