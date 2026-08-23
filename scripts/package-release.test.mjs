import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { builderConfiguration } from "./package-release.mjs";

const readPackage = (path) => readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);

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
    { from: join(root, "apps", "desktop", "assets"), to: "assets" },
    { from: join(appDirectory, "node_modules"), to: "node_modules" },
  ]);
});

test("the production engine declares connector runtime dependencies for pnpm deploy", async () => {
  const [engine, evmConnector] = await Promise.all([
    readPackage("../apps/engine/package.json"),
    readPackage("../packages/connector-evm/package.json"),
  ]);

  for (const [dependency, version] of Object.entries(evmConnector.dependencies)) {
    if (version.startsWith("workspace:")) continue;
    assert.equal(
      engine.dependencies[dependency],
      version,
      `apps/engine must declare ${dependency} so pnpm deploy includes it in the release tree`,
    );
  }
});
