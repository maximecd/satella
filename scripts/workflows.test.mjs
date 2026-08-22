import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("every push to main publishes an immutable nightly prerelease after the CI gate", async () => {
  const ci = await read("../.github/workflows/ci.yml");
  const nightly = ci.slice(ci.indexOf("  nightly:"));
  assert.match(nightly, /if: >-?\s*\n\s*\$\{\{ github\.event_name == 'push'/);
  assert.match(nightly, /needs:\s*\n\s*- CI/);
  assert.match(nightly, /runs-on: macos-14/);
  assert.match(nightly, /group: satella-nightly\n\s*cancel-in-progress: false/);
  assert.match(nightly, /contents: write/);
  assert.match(nightly, /next-nightly/);
  assert.match(nightly, /git tag -a "\$\{TAG\}" "\$\{GITHUB_SHA\}"/);
  assert.match(nightly, /--prerelease/);
  assert.match(nightly, /--generate-notes/);
  // Nightly tags must never be mistaken for release versions by Ship Satella.
  assert.doesNotMatch(nightly, /retention-days/);
});

test("Ship Satella accepts no inputs, runs on main, and publishes a prerelease", async () => {
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
  assert.doesNotMatch(ship, /\bminor\b.*bump|major.*bump/i);
});

test("Ship Satella creates its tag only after packaging validation", async () => {
  const ship = await read("../.github/workflows/release.yml");
  const publish = ship.slice(ship.indexOf("  publish:"));
  const publishNeeds = publish.slice(0, publish.indexOf("steps:"));
  for (const gate of ["resolve", "check", "test", "build", "package"]) {
    assert.match(publishNeeds, new RegExp(`- ${gate}`));
  }
  const tagStep = publish.slice(
    publish.indexOf("Create exact commit tag only after validation passed"),
    publish.indexOf("Publish immutable prerelease"),
  );
  assert.match(tagStep, /git tag -a "\$TAG" "\$GITHUB_SHA"/);
});
