import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    isolate: true,
    fileParallelism: true,
    hookTimeout: 15_000,
    testTimeout: 15_000,
    teardownTimeout: 15_000,
    passWithNoTests: false,
    allowOnly: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Generated router tree is not owned test surface.
        "**/routeTree.gen.ts",
        // Declaration files have no runtime.
        "**/*.d.ts",
        // Colocated tests and helpers are not production source.
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.test-utils.ts",
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
  fmt: {
    ignorePatterns: [
      ".plans/**",
      "AGENTS.md",
      "apps/web/src/routeTree.gen.ts",
      "apps/web/src/themes/stone/**",
      "packages/connector-ibkr/src/instructions.md",
      "dist",
      "coverage",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
    ],
  },
  lint: {
    ignorePatterns: [
      "dist",
      "coverage",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
      "**/routeTree.gen.ts",
    ],
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript", "vitest"],
    categories: {
      correctness: "error",
    },
    rules: {
      "react-in-jsx-scope": "off",
      "react/no-children-prop": "off",
      "vitest/no-conditional-expect": "off",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/no-standalone-expect": "off",
      "vitest/require-mock-type-parameters": "off",
    },
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
});
