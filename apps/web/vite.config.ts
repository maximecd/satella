import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, mergeConfig } from "vite-plus";
import "vite-plus/test/config";

import baseConfig from "../../vite.config.ts";

const stylexTestPlugin = {
  ...stylex({ devMode: "off" }),
  apply: undefined,
  configureServer: undefined,
};

export default mergeConfig(
  baseConfig,
  defineConfig({
    base: "./",
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routeFileIgnorePattern: "\\.(test|spec)\\.",
      }),
      react(),
    ],
    test: {
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./vitest.setup.ts"],
      hookTimeout: 15_000,
      testTimeout: 15_000,
      plugins: [react(), stylexTestPlugin],
      coverage: {
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/main.tsx",
          "src/vite-env.d.ts",
          "src/routeTree.gen.ts",
          "**/*.{test,spec}.{ts,tsx}",
          "**/*.test-utils.ts",
          "**/*.test-utils.tsx",
        ],
        thresholds: {
          // Measured after splitting the route suite; ratchet upward with new tests.
          lines: 53,
          statements: 50,
          functions: 37,
          branches: 44,
        },
      },
    },
  }),
);
