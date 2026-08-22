import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const GUARDED_PATTERN = /optimus/i;
// SAFETY: this file must hold the guarded pattern literal to define the guard,
// so it is excluded from its own scan.
const EXCLUDED_FILES = new Set(["pnpm-lock.yaml", "scripts/rename-guard.test.mjs"]);

test("repository-owned files never reintroduce the temporary product identity", async () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0 && !EXCLUDED_FILES.has(file));
  assert.ok(files.length > 100, "git ls-files returned an implausibly small tree");
  const offenders = [];
  for (const file of files) {
    let contents;
    try {
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (GUARDED_PATTERN.test(contents)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `Temporary product identity found in repository-owned files: ${offenders.join(", ")}`,
  );
});
