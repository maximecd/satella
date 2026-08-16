import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  globalCss: {
    html: { colorScheme: "light dark" },
    body: {
      minHeight: "100vh",
      bg: "bg.muted",
      color: "fg",
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: "Figtree, system-ui, sans-serif" },
        body: { value: "Figtree, system-ui, sans-serif" },
        mono: { value: "JetBrains Mono, ui-monospace, monospace" },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
