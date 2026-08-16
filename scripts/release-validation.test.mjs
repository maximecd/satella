import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMainReleaseBranch,
  assertReleaseTargetsAvailable,
  normalizeReleaseVersion,
  releaseMetadata,
} from "./package-release.mjs";

test("normalizes valid release metadata and preserves the tested commit", () => {
  assert.equal(normalizeReleaseVersion("1.2.3-rc.1+01"), "1.2.3-rc.1+01");
  assert.deepEqual(releaseMetadata("1.2.3-rc.1", "abc123"), {
    version: "1.2.3-rc.1",
    tag: "v1.2.3-rc.1",
    artifact: "Optimus-1.2.3-rc.1-macOS-arm64.zip",
    prerelease: true,
    targetCommit: "abc123",
  });
});

test("rejects malformed release versions", () => {
  assert.throws(() => normalizeReleaseVersion("v1.2.3"));
  assert.throws(() => normalizeReleaseVersion("1.2"));
  assert.throws(() => normalizeReleaseVersion("01.2.3"));
  assert.throws(() => normalizeReleaseVersion("1.2.3-01"));
});

test("requires a main branch release dispatch", () => {
  assert.doesNotThrow(() => assertMainReleaseBranch("main"));
  assert.throws(() => assertMainReleaseBranch("feature/release"));
});

test("rejects previously used tags and releases", () => {
  assert.doesNotThrow(() =>
    assertReleaseTargetsAvailable({ tagExists: false, releaseExists: false }),
  );
  assert.throws(() => assertReleaseTargetsAvailable({ tagExists: true, releaseExists: false }));
  assert.throws(() => assertReleaseTargetsAvailable({ tagExists: false, releaseExists: true }));
});
