import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    pack: {
      entry: ["src/index.ts", "src/okx/index.ts", "src/ibkr/index.ts"],
      outDir: "dist",
      format: "esm",
      platform: "node",
      sourcemap: true,
      dts: true,
      clean: true,
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        include: ["src/**/*.ts"],
        exclude: ["**/*.d.ts", "**/*.{test,spec}.ts", "**/*.test-utils.ts", "src/effect/vitest.ts"],
        thresholds: {
          // Measured after the Effect 4/Vite+ migration; ratchet upward with new tests.
          lines: 73,
          statements: 69,
          functions: 65,
          branches: 45,
          "src/**/{parser,schemas,registry,connector}.ts": {
            lines: 81,
            statements: 77,
            functions: 76,
            branches: 51,
          },
        },
      },
    },
  }),
);
