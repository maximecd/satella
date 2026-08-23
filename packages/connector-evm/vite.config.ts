import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

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
      entry: ["src/index.ts", "src/metadata.ts"],
      outDir: "dist",
      format: "esm",
      platform: "node",
      sourcemap: true,
      dts: true,
      clean: true,
      deps: { neverBundle: true },
      loader: { ".md": "text", ".svg": "text" },
    },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  }),
);
