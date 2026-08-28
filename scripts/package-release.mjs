import { chmod, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const semverNumericIdentifier = "(?:0|[1-9]\\d*)";
const semverPrereleaseIdentifier = `(?:${semverNumericIdentifier}|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`;
const semverBuildIdentifier = "[0-9A-Za-z-]+";
const semverPattern = new RegExp(
  `^${semverNumericIdentifier}\\.${semverNumericIdentifier}\\.${semverNumericIdentifier}` +
    `(?:-(${semverPrereleaseIdentifier}(?:\\.${semverPrereleaseIdentifier})*))?` +
    `(?:\\+(${semverBuildIdentifier}(?:\\.${semverBuildIdentifier})*))?$`,
);

export const normalizeReleaseVersion = (value) => {
  if (String(value) !== value || !semverPattern.test(value)) {
    throw new Error(
      "Release version must be a SemVer value without a leading v, for example 1.2.3 or 1.2.3-rc.1",
    );
  }
  return value;
};

export const releaseArtifactName = (version) =>
  `satella-app-${normalizeReleaseVersion(version)}.tgz`;

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const requireFile = async (path, description) => {
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new Error(`Missing ${description}: ${path}`);
  }
  if (!info.isFile()) throw new Error(`${description} is not a regular file: ${path}`);
};

export const productionPackage = (version) => ({
  name: "@satella/app",
  version: normalizeReleaseVersion(version),
  description: "A private, local-first home for your financial life.",
  type: "module",
  bin: { satella: "bin/satella.mjs" },
  files: ["bin", "dist"],
  engines: { node: ">=26.1.0" },
});

export const validateSourceResources = async (root = repositoryRoot) => {
  await requireFile(join(root, "apps", "web", "dist", "index.html"), "web build");
  await requireFile(join(root, "apps", "engine", "dist", "main.mjs"), "engine build");
};

export const stageProductionTree = async ({ root = repositoryRoot, stagingDirectory, version }) => {
  const normalizedVersion = normalizeReleaseVersion(version);
  await validateSourceResources(root);
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });

  const appDirectory = join(stagingDirectory, "app");
  await mkdir(join(appDirectory, "bin"), { recursive: true });
  await mkdir(join(appDirectory, "dist", "public"), { recursive: true });
  await cp(
    join(root, "apps", "engine", "dist", "main.mjs"),
    join(appDirectory, "dist", "main.mjs"),
  );
  await cp(join(root, "apps", "web", "dist"), join(appDirectory, "dist", "public"), {
    recursive: true,
  });
  await writeFile(
    join(appDirectory, "bin", "satella.mjs"),
    '#!/usr/bin/env node\nimport "../dist/main.mjs";\n',
  );
  await chmod(join(appDirectory, "bin", "satella.mjs"), 0o755);
  await writeFile(
    join(appDirectory, "package.json"),
    `${JSON.stringify(productionPackage(normalizedVersion), null, 2)}\n`,
  );
  return { appDirectory };
};

const listTarball = async (artifact) => {
  const { stdout } = await execFileAsync("tar", ["-tzf", artifact], { encoding: "utf8" });
  return stdout.split("\n").filter((line) => line.length > 0);
};

const readTarballFile = async (artifact, path) => {
  const { stdout } = await execFileAsync("tar", ["-xOf", artifact, path], { encoding: "utf8" });
  return stdout;
};

export const validatePackagedArtifact = async (artifact, version) => {
  const names = await listTarball(artifact);
  const required = [
    "package/package.json",
    "package/bin/satella.mjs",
    "package/dist/main.mjs",
    "package/dist/public/index.html",
  ];
  for (const path of required) {
    if (!names.includes(path)) throw new Error(`Release tarball is missing ${path}`);
  }
  if (names.some((path) => path.endsWith(".node"))) {
    throw new Error("Release tarball contains a native addon");
  }
  const manifest = JSON.parse(await readTarballFile(artifact, "package/package.json"));
  if (manifest.name !== "@satella/app") {
    throw new Error("Release package name must be @satella/app");
  }
  if (manifest.version !== version) {
    throw new Error(`Release package version must be ${version}`);
  }
  if (manifest.bin?.satella !== "bin/satella.mjs") {
    throw new Error("Release package must expose the satella bin");
  }
  if (manifest.engines?.node !== ">=26.1.0") {
    throw new Error("Release package must declare Node >=26.1.0");
  }
  if (manifest.scripts !== undefined) {
    throw new Error("Release package must not declare install scripts");
  }
};

export const packageRelease = async ({ root = repositoryRoot, outputDirectory, version }) => {
  const normalizedVersion = normalizeReleaseVersion(version);
  const output = resolve(outputDirectory);
  const artifact = join(output, releaseArtifactName(normalizedVersion));
  if (await exists(artifact)) {
    throw new Error(`Release artifact already exists: ${artifact}`);
  }
  await mkdir(output, { recursive: true });
  const { appDirectory } = await stageProductionTree({
    root,
    stagingDirectory: join(output, ".staging"),
    version: normalizedVersion,
  });
  await execFileAsync("npm", ["pack", "--pack-destination", output], {
    cwd: appDirectory,
    maxBuffer: 50 * 1024 * 1024,
  });
  await requireFile(artifact, "npm pack tarball");
  await validatePackagedArtifact(artifact, normalizedVersion);
  return artifact;
};

const parseArguments = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--version" || argument === "--output-dir") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      values[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith("--version=")) {
      values.version = argument.slice("--version=".length);
    } else if (argument.startsWith("--output-dir=")) {
      values["output-dir"] = argument.slice("--output-dir=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (values.version === undefined || values["output-dir"] === undefined) {
    throw new Error("Usage: pnpm release:package --version 1.2.3 --output-dir ./release");
  }
  return { version: values.version, outputDirectory: values["output-dir"] };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packageRelease(parseArguments(process.argv.slice(2)))
    .then((artifact) => {
      console.log(`Release artifact: ${artifact}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      if (error instanceof Error && "stdout" in error && error.stdout) {
        console.error(error.stdout);
      }
      if (error instanceof Error && "stderr" in error && error.stderr) {
        console.error(error.stderr);
      }
      process.exitCode = 1;
    });
}
