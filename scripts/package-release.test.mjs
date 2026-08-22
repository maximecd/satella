import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { builderConfiguration } from "./package-release.mjs";

test("builder configuration resolves desktop assets from the repository root", () => {
  const root = "/tmp/satella-source";
  const appDirectory = "/tmp/satella-staging/app";

  const configuration = builderConfiguration({
    root,
    appDirectory,
    outputDirectory: "/tmp/satella-release",
    artifactName: "Satella-0.1.0-macOS-arm64.zip",
  });

  assert.deepEqual(configuration.extraResources, [
    { from: join(appDirectory, "resources", "web"), to: "web" },
    { from: join(appDirectory, "resources", "engine"), to: "engine" },
    { from: join(root, "apps", "desktop", "assets"), to: "assets" },
    { from: join(appDirectory, "node_modules"), to: "node_modules" },
  ]);
});
