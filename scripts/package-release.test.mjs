import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { builderConfiguration, nativeModulePackages } from "./package-release.mjs";

const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("builder configuration resolves desktop assets from the repository root", () => {
  const root = "/tmp/satella-source";
  const appDirectory = "/tmp/satella-staging/app";

  const configuration = builderConfiguration({
    root,
    appDirectory,
    outputDirectory: "/tmp/satella-release",
    artifactName: "Satella-0.1.0-macOS-arm64.zip",
  });

  assert.equal(configuration.mac.icon, join(root, "apps", "desktop", "assets", "Satella.icns"));
  assert.deepEqual(configuration.extraResources, [
    { from: join(appDirectory, "resources", "web"), to: "web" },
    { from: join(appDirectory, "resources", "engine"), to: "engine" },
    { from: join(appDirectory, "resources", "engine", "node_modules"), to: "engine/node_modules" },
    { from: join(root, "apps", "desktop", "assets"), to: "assets" },
  ]);
});

test("the engine bundle externalizes exactly the SQLCipher addon tree", async () => {
  const engineConfig = await readText("../apps/engine/vite.config.ts");

  const declaredExternals = engineConfig.match(/nativeExternals = \[([^\]]*)\]/)?.[1];
  assert.ok(declaredExternals, "apps/engine/vite.config.ts must declare nativeExternals");
  const externalized = [...declaredExternals.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(externalized, ["@journeyapps/sqlcipher"]);
});

test("the staged native module tree covers the SQLCipher binding loader", () => {
  assert.deepEqual(nativeModulePackages, [
    "@journeyapps/sqlcipher",
    "bindings",
    "file-uri-to-path",
  ]);
});
