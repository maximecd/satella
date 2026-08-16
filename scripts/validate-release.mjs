import {
  assertMainReleaseBranch,
  assertReleaseTargetsAvailable,
  releaseMetadata,
} from "./package-release.mjs";

const version = process.argv[2];
if (version === undefined) {
  console.error("Usage: node scripts/validate-release.mjs 1.2.3");
  process.exitCode = 1;
} else {
  try {
    const branch = process.argv.find((argument) => argument.startsWith("--branch="))?.slice(9);
    const tagExists = process.argv.includes("--tag-exists");
    const releaseExists = process.argv.includes("--release-exists");
    if (branch !== undefined) assertMainReleaseBranch(branch);
    assertReleaseTargetsAvailable({ tagExists, releaseExists });
    console.log(JSON.stringify(releaseMetadata(version, process.env["GITHUB_SHA"])));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
