const CORE_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NIGHTLY_PATTERN = /^nightly\.\d{8}\.\d+$/;

export const FIRST_RELEASE_VERSION = "0.1.0";

const parseVersion = (value) => {
  const withoutV = value.startsWith("v") ? value.slice(1) : value;
  const [core, ...prereleaseParts] = withoutV.split("-");
  if (!CORE_PATTERN.test(core)) return undefined;
  const prerelease = prereleaseParts.length === 0 ? undefined : prereleaseParts.join("-");
  return { core, prerelease };
};

const compareCores = (left, right) => {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    }
  }
  return 0;
};

/**
 * Resolves the next stable release version from the repository's existing
 * release tags. Nightly tags and non-release tags are ignored; the first run
 * yields v0.1.0 and every later run increments the patch of the highest
 * existing non-nightly version.
 */
export const nextReleaseVersion = (tags) => {
  const releases = tags
    .map(parseVersion)
    .filter((version) => version !== undefined && version.prerelease === undefined);
  if (releases.length === 0) return FIRST_RELEASE_VERSION;
  const highest = releases.reduce((best, candidate) =>
    compareCores(candidate.core, best.core) > 0 ? candidate : best,
  );
  const [major, minor, patch] = highest.core.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
};

/**
 * Resolves the nightly version based on the next patch after the latest
 * release so that nightlies sort after the current release.
 */
export const nextNightlyVersion = ({ tags, utcDate, runNumber }) => {
  const base = nextReleaseVersion(tags);
  const stamp = [
    String(utcDate.getUTCFullYear()).padStart(4, "0"),
    String(utcDate.getUTCMonth() + 1).padStart(2, "0"),
    String(utcDate.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `${base}-nightly.${stamp}.${runNumber}`;
};

export const isNightlyVersion = (value) => {
  const parsed = parseVersion(value);
  return (
    parsed !== undefined &&
    parsed.prerelease !== undefined &&
    NIGHTLY_PATTERN.test(parsed.prerelease)
  );
};

/**
 * Fails safely when another run already published the selected version.
 */
export const assertPublishable = ({ tag, tagExists, releaseExists }) => {
  const normalized = tag.startsWith("v") ? tag : `v${tag}`;
  const version = parseVersion(normalized);
  if (version === undefined || version.prerelease !== undefined || isNightlyVersion(normalized)) {
    throw new Error(`Refusing to publish a non-release version: ${normalized}`);
  }
  if (tagExists) {
    throw new Error(`Tag ${normalized} already exists.`);
  }
  if (releaseExists) {
    throw new Error(`GitHub Release ${normalized} already exists.`);
  }
  return normalized;
};

const assertTagDoesNotExist = async ({ tag, repository }) => {
  const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/tags/${tag}`, {
    headers: { authorization: `Bearer ${process.env["GH_TOKEN"] ?? ""}` },
  });
  return response.ok;
};

const assertReleaseDoesNotExist = async ({ tag, repository }) => {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
    headers: { authorization: `Bearer ${process.env["GH_TOKEN"] ?? ""}` },
  });
  if (response.status === 404) return false;
  if (response.ok) return true;
  throw new Error(`Could not inspect GitHub Release ${tag}: HTTP ${response.status}`);
};

const command = process.argv[2];
const arguments_ = process.argv.slice(3);

const readOption = (name) => {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
};

if (
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("release-version.mjs") &&
  command !== undefined
) {
  if (command === "next-release") {
    const { execFileSync } = await import("node:child_process");
    const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.length > 0);
    console.log(nextReleaseVersion(tags));
  } else if (command === "next-nightly") {
    const { execFileSync } = await import("node:child_process");
    const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.length > 0);
    console.log(
      nextNightlyVersion({
        tags,
        utcDate: new Date(),
        runNumber: Number(process.env["GITHUB_RUN_NUMBER"] ?? "1"),
      }),
    );
  } else if (command === "assert-publishable") {
    const tag = readOption("--tag");
    const repository = readOption("--repository");
    if (tag === undefined || repository === undefined) {
      console.error(
        "Usage: release-version.mjs assert-publishable --tag vX.Y.Z --repository OWNER/REPO",
      );
      process.exitCode = 1;
    } else {
      try {
        assertPublishable({
          tag,
          tagExists: await assertTagDoesNotExist({ tag: `v${tag.replace(/^v/, "")}`, repository }),
          releaseExists: await assertReleaseDoesNotExist({
            tag: `v${tag.replace(/^v/, "")}`,
            repository,
          }),
        });
        console.log(`${tag.replace(/^v/, "v")} is publishable`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    }
  } else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
}
