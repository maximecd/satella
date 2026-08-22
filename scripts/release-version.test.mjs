import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPublishable,
  isNightlyVersion,
  nextNightlyVersion,
  nextReleaseVersion,
} from "./release-version.mjs";

const utcDate = (iso) => new Date(iso);

test("first release version is 0.1.0", () => {
  assert.equal(nextReleaseVersion([]), "0.1.0");
  assert.equal(nextReleaseVersion(["v0.1.0-nightly.20260815.7"]), "0.1.0");
  assert.equal(nextReleaseVersion(["unrelated-tag", "v1"]), "0.1.0");
});

test("later runs increment the patch of the highest release", () => {
  assert.equal(nextReleaseVersion(["v0.1.0", "v0.1.1", "v0.1.2"]), "0.1.3");
  assert.equal(nextReleaseVersion(["v0.1.9", "v0.2.0", "v1.0.0"]), "1.0.1");
  assert.equal(nextReleaseVersion(["v0.1.0-nightly.20260822.42", "v0.3.0"]), "0.3.1");
});

test("nightlies sort after the current release based on the next patch", () => {
  const date = utcDate("2026-08-22T09:30:00Z");
  assert.equal(
    nextNightlyVersion({ tags: ["v0.1.0"], utcDate: date, runNumber: 42 }),
    "0.1.1-nightly.20260822.42",
  );
  assert.equal(
    nextNightlyVersion({ tags: [], utcDate: date, runNumber: 7 }),
    "0.1.0-nightly.20260822.7",
  );
});

test("nightly versions are recognized and excluded from releases", () => {
  assert.equal(isNightlyVersion("0.1.1-nightly.20260822.42"), true);
  assert.equal(isNightlyVersion("0.1.1"), false);
  assert.equal(isNightlyVersion("0.1.1-alpha"), false);
  assert.equal(isNightlyVersion("nightly"), false);
});

test("publication refuses already-published targets and nightly versions", () => {
  assert.equal(
    assertPublishable({ tag: "0.1.0", tagExists: false, releaseExists: false }),
    "v0.1.0",
  );

  assert.throws(
    () => assertPublishable({ tag: "0.1.0", tagExists: true, releaseExists: false }),
    /Tag v0\.1\.0 already exists/,
  );
  assert.throws(
    () => assertPublishable({ tag: "0.1.0", tagExists: false, releaseExists: true }),
    /GitHub Release v0\.1\.0 already exists/,
  );
  assert.throws(
    () =>
      assertPublishable({
        tag: "0.1.1-nightly.20260822.42",
        tagExists: false,
        releaseExists: false,
      }),
    /non-release version/,
  );
});
