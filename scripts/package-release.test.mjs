import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { productionPackage, releaseArtifactName } from "./package-release.mjs";

const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the npm tarball name matches the packed @satella/app package", () => {
  assert.equal(releaseArtifactName("0.1.0"), "satella-app-0.1.0.tgz");
  assert.equal(
    releaseArtifactName("0.1.1-nightly.20260828.1"),
    "satella-app-0.1.1-nightly.20260828.1.tgz",
  );
});

test("the staged package is a Node CLI with no install scripts or native addons", () => {
  const manifest = productionPackage("0.1.0");
  assert.equal(manifest.name, "@satella/app");
  assert.equal(manifest.bin.satella, "bin/satella.mjs");
  assert.equal(manifest.engines.node, ">=26.1.0");
  assert.equal(manifest.scripts, undefined);
  assert.deepEqual(manifest.files, ["bin", "dist"]);
});

test("the engine bundle does not externalize a native SQLite addon", async () => {
  const engineConfig = await readText("../apps/engine/vite.config.ts");
  assert.match(engineConfig, /nativeExternals: string\[] = \[]/);
  assert.doesNotMatch(engineConfig, /@journeyapps\/sqlcipher/);
});

test("the engine package does not depend on SQLCipher", async () => {
  const enginePackage = JSON.parse(await readText("../apps/engine/package.json"));
  assert.equal(enginePackage.dependencies["@journeyapps/sqlcipher"], undefined);
  assert.equal(enginePackage.scripts?.install, undefined);
  assert.equal(enginePackage.scripts?.preinstall, undefined);
  assert.equal(enginePackage.scripts?.postinstall, undefined);
});
