import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// StyleX's dev middleware starts a polling interval that is not needed in tests.
// Keep its transform hooks while omitting the server lifecycle hook so Vitest exits cleanly.
const stylexTestPlugin = {
  ...stylex({ devMode: "off" }),
  apply: undefined,
  configureServer: undefined,
};

export default defineConfig({
  base: "./",
  plugins: [react(), stylexTestPlugin],
  test: {
    coverage: {
      exclude: ["src/main.tsx", "src/test/**", "src/vite-env.d.ts"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "html"],
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
