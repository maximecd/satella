import "vite-plus/test/config";
import { builtinModules } from "node:module";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

const nativeExternals: string[] = [];
const builtinSpecifiers = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      {
        name: "satella-connector-text-assets",
        apply: "serve",
        enforce: "pre",
        transform(source, id) {
          if (!/\.(?:md|svg)$/.test(id)) return;
          return { code: `export default ${JSON.stringify(source)};`, map: null };
        },
      },
    ],
    pack: {
      entry: ["src/main.ts"],
      outDir: "dist",
      format: "esm",
      platform: "node",
      sourcemap: true,
      clean: true,
      dts: false,
      deps: {
        alwaysBundle: (id) =>
          !nativeExternals.some((name) => id === name || id.startsWith(`${name}/`)) &&
          !builtinSpecifiers.has(id),
      },
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
          "src/cli/product-runtime.ts",
          "src/database/cli.ts",
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
