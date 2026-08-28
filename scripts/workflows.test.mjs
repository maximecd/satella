import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("source test jobs build every connector imported by the engine", async () => {
  for (const path of ["../.github/workflows/ci.yml", "../.github/workflows/release.yml"]) {
    const workflow = await read(path);
    const testJob = workflow.slice(workflow.indexOf("  test:"), workflow.indexOf("  build:"));
    for (const connector of ["core", "evm", "ibkr", "kraken", "okx"]) {
      assert.match(testJob, new RegExp(`@satella-app/connector-${connector} build`));
    }
  }
});

test("automatic Electron nightlies are not published", async () => {
  const ci = await read("../.github/workflows/ci.yml");
  assert.doesNotMatch(ci, /^ {2}nightly:/m);
  await assert.rejects(() => stat(new URL("../.github/workflows/nightly.yml", import.meta.url)), {
    code: "ENOENT",
  });
});

test("Ship Satella accepts no inputs, runs on main, and publishes a prerelease tarball", async () => {
  const ship = await read("../.github/workflows/release.yml");
  const dispatch = ship.slice(ship.indexOf("workflow_dispatch"), ship.indexOf("concurrency:"));
  assert.match(dispatch, /workflow_dispatch: \{\}/);
  assert.doesNotMatch(dispatch, /inputs:/);
  assert.match(ship, /name: Ship Satella/);
  assert.match(ship, /Reject non-main dispatches/);
  assert.match(ship, /group: satella-release\n\s*cancel-in-progress: false/);
  assert.match(ship, /next-release/);
  assert.match(ship, /--prerelease/);
  assert.match(ship, /--generate-notes/);
  assert.match(ship, /assert-publishable/);
  assert.match(ship, /satella-app-\$\{\{ needs\.resolve\.outputs\.version \}\}\.tgz/);
  assert.match(ship, /satella-app-\$RELEASE_VERSION\.tgz/);
  assert.doesNotMatch(ship, /macOS-arm64\.zip/);
  assert.doesNotMatch(ship, /\bminor\b.*bump|major.*bump/i);
});

test("Ship Satella creates its tag only after packaging validation", async () => {
  const ship = await read("../.github/workflows/release.yml");
  const publish = ship.slice(ship.indexOf("  publish:"));
  const publishNeeds = publish.slice(0, publish.indexOf("steps:"));
  for (const gate of ["resolve", "check", "test", "build", "package"]) {
    assert.match(publishNeeds, new RegExp(`- ${gate}`));
  }
  // The resolve job's outputs live inside the job; a mis-indented "outputs:"
  // becomes an invalid top-level job and breaks the whole workflow file.
  assert.doesNotMatch(ship, /\n {2}outputs:/);
  assert.match(ship, / {4}outputs:\n {6}version:/);
  const packageNeeds = ship
    .slice(ship.indexOf("  package:"), ship.indexOf("  publish:"))
    .slice(0, ship.slice(ship.indexOf("  package:"), ship.indexOf("  publish:")).indexOf("steps:"));
  assert.match(packageNeeds, /- resolve/);
  const tagStep = publish.slice(
    publish.indexOf("Create exact commit tag only after validation passed"),
    publish.indexOf("Publish immutable prerelease"),
  );
  assert.match(tagStep, /git tag -a "\$TAG" "\$GITHUB_SHA"/);
});
