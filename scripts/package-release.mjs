import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
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
  if (typeof value !== "string" || !semverPattern.test(value)) {
    throw new Error(
      "Release version must be a SemVer value without a leading v, for example 1.2.3 or 1.2.3-rc.1",
    );
  }
  return value;
};

export const releaseArtifactName = (version) =>
  `Optimus-${normalizeReleaseVersion(version)}-macOS-arm64.zip`;

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

const findNativeBinding = async (directory) => {
  if (!(await exists(directory))) return undefined;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.name.endsWith(".node")) return path;
    if (entry.isDirectory()) {
      const nested = await findNativeBinding(path);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};

const copyPortableNodeModules = async (source, target) => {
  await mkdir(target, { recursive: true });
  const flattenedSource = join(source, ".pnpm", "node_modules");
  const copyPackage = async (sourcePath, targetPath) =>
    cp(sourcePath, targetPath, {
      recursive: true,
      dereference: true,
      filter: (path) => {
        const relativePath = relative(sourcePath, path);
        return relativePath.length === 0 || !relativePath.startsWith("node_modules");
      },
    });
  const entries = await readdir(flattenedSource, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".bin" || entry.name.startsWith(".")) continue;
    const sourcePath = join(flattenedSource, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      const scopedEntries = await readdir(sourcePath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        await copyPackage(join(sourcePath, scopedEntry.name), join(targetPath, scopedEntry.name));
      }
    } else {
      await copyPackage(sourcePath, targetPath);
    }
  }
};

export const validateSourceResources = async (root = repositoryRoot) => {
  await requireFile(join(root, "apps", "desktop", "dist", "main.cjs"), "desktop main build");
  await requireFile(join(root, "apps", "desktop", "dist", "preload.cjs"), "desktop preload build");
  await requireFile(join(root, "apps", "web", "dist", "index.html"), "web build");
  await requireFile(join(root, "apps", "engine", "dist", "main.mjs"), "engine build");
};

const productionPackage = (version, enginePackage) => ({
  name: "optimus",
  version,
  private: true,
  productName: "Optimus",
  description: "A private, local-first home for your financial life.",
  author: "Optimus",
  main: "dist/main.cjs",
  dependencies: enginePackage.dependencies ?? {},
});

const builderConfiguration = ({ appDirectory, outputDirectory, artifactName }) => ({
  appId: "com.maxime.optimus",
  productName: "Optimus",
  directories: {
    app: appDirectory,
    output: outputDirectory,
  },
  files: ["dist/**/*", "package.json"],
  extraResources: [
    { from: join(appDirectory, "resources", "web"), to: "web" },
    { from: join(appDirectory, "resources", "engine"), to: "engine" },
    { from: join(appDirectory, "node_modules"), to: "node_modules" },
  ],
  asar: true,
  asarUnpack: ["**/*.node"],
  npmRebuild: true,
  electronVersion: "43.3.0",
  mac: {
    target: [{ target: "zip", arch: ["arm64"] }],
    identity: "-",
  },
  artifactName,
});

export const validateStagedResources = async (appDirectory) => {
  await requireFile(join(appDirectory, "dist", "main.cjs"), "staged desktop main");
  await requireFile(join(appDirectory, "dist", "preload.cjs"), "staged desktop preload");
  await requireFile(
    join(appDirectory, "resources", "web", "dist", "index.html"),
    "staged web build",
  );
  await requireFile(
    join(appDirectory, "resources", "engine", "dist", "main.mjs"),
    "staged engine build",
  );
  const nativeBinding = await findNativeBinding(
    join(appDirectory, "node_modules", "@journeyapps", "sqlcipher"),
  );
  if (nativeBinding === undefined) {
    throw new Error("Staged SQLCipher native binding was not found");
  }
  return nativeBinding;
};

export const stageProductionTree = async ({ root = repositoryRoot, stagingDirectory, version }) => {
  const normalizedVersion = normalizeReleaseVersion(version);
  await validateSourceResources(root);
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });

  const appDirectory = join(stagingDirectory, "app");
  const engineDeployment = join(stagingDirectory, "engine-deployment");
  await mkdir(appDirectory, { recursive: true });
  await cp(join(root, "apps", "desktop", "dist"), join(appDirectory, "dist"), {
    recursive: true,
  });
  await cp(join(root, "apps", "web", "dist"), join(appDirectory, "resources", "web", "dist"), {
    recursive: true,
  });
  await cp(
    join(root, "apps", "engine", "dist"),
    join(appDirectory, "resources", "engine", "dist"),
    {
      recursive: true,
    },
  );

  let deployStarted = false;
  try {
    deployStarted = true;
    await execFileAsync(
      "pnpm",
      ["--filter", "@optimus/engine", "deploy", "--legacy", "--prod", engineDeployment],
      { cwd: root, maxBuffer: 20 * 1024 * 1024 },
    );
    await copyPortableNodeModules(
      join(engineDeployment, "node_modules"),
      join(appDirectory, "node_modules"),
    );
    for (const packageName of ["connector-core", "connector-ibkr", "connector-okx"]) {
      const source = join(root, "packages", packageName);
      const target = join(appDirectory, "node_modules", "@optimus", packageName);
      await mkdir(target, { recursive: true });
      await cp(join(source, "dist"), join(target, "dist"), { recursive: true });
      await cp(join(source, "package.json"), join(target, "package.json"));
    }
    for (const dependencyName of ["saxes", "xmlchars"]) {
      await cp(
        join(root, "node_modules", ".pnpm", "node_modules", dependencyName),
        join(appDirectory, "node_modules", dependencyName),
        { recursive: true, dereference: true },
      );
    }
    const enginePackage = JSON.parse(
      await readFile(join(engineDeployment, "package.json"), "utf8"),
    );
    await writeFile(
      join(appDirectory, "resources", "engine", "package.json"),
      JSON.stringify(enginePackage, null, 2) + "\n",
    );
    await writeFile(
      join(appDirectory, "package.json"),
      JSON.stringify(productionPackage(normalizedVersion, enginePackage), null, 2) + "\n",
    );
    await validateStagedResources(appDirectory);
    return { appDirectory, engineDeployment };
  } finally {
    if (deployStarted) {
      await execFileAsync("pnpm", ["install", "--frozen-lockfile"], {
        cwd: root,
        env: { ...process.env, CI: "true" },
        maxBuffer: 20 * 1024 * 1024,
      });
    }
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
  const configPath = join(output, ".staging", "electron-builder.json");
  await writeFile(
    configPath,
    JSON.stringify(
      builderConfiguration({
        appDirectory,
        outputDirectory: output,
        artifactName: releaseArtifactName(normalizedVersion),
      }),
      null,
      2,
    ) + "\n",
  );
  await execFileAsync(
    join(root, "apps", "desktop", "node_modules", ".bin", "electron-builder"),
    ["--config", configPath, "--mac", "zip", "--arm64"],
    { cwd: appDirectory, maxBuffer: 50 * 1024 * 1024 },
  );
  await requireFile(artifact, "macOS arm64 release artifact");
  await validatePackagedArtifact(artifact, normalizedVersion);
  return artifact;
};

const readPlistValue = async (path, key) => {
  const { stdout } = await execFileAsync("plutil", ["-extract", key, "raw", "-o", "-", path]);
  return stdout.trim();
};

const validateExtractedApplication = async (applicationDirectory, version) => {
  const contentsDirectory = join(applicationDirectory, "Contents");
  const resourcesDirectory = join(contentsDirectory, "Resources");
  await requireFile(join(contentsDirectory, "Info.plist"), "application metadata");
  await requireFile(join(resourcesDirectory, "app.asar"), "application archive");
  await requireFile(join(resourcesDirectory, "web", "dist", "index.html"), "packaged web build");
  await requireFile(
    join(resourcesDirectory, "engine", "dist", "main.mjs"),
    "packaged engine build",
  );
  for (const packageName of ["connector-core", "connector-ibkr", "connector-okx"]) {
    await requireFile(
      join(resourcesDirectory, "node_modules", "@optimus", packageName, "dist", "index.mjs"),
      `packaged ${packageName} connector`,
    );
  }
  if (
    (await findNativeBinding(
      join(resourcesDirectory, "node_modules", "@journeyapps", "sqlcipher"),
    )) === undefined
  ) {
    throw new Error(
      "Packaged SQLCipher native binding was not found outside the application archive",
    );
  }
  if (
    (await readPlistValue(join(contentsDirectory, "Info.plist"), "CFBundleIdentifier")) !==
    "com.maxime.optimus"
  ) {
    throw new Error("Packaged application has an unexpected bundle identifier");
  }
  if ((await readPlistValue(join(contentsDirectory, "Info.plist"), "CFBundleName")) !== "Optimus") {
    throw new Error("Packaged application has an unexpected name");
  }
  const expectedVersion = version.split(/[+-]/, 1)[0];
  if (
    (await readPlistValue(join(contentsDirectory, "Info.plist"), "CFBundleShortVersionString")) !==
    expectedVersion
  ) {
    throw new Error(`Packaged application has an unexpected version; expected ${expectedVersion}`);
  }
};

export const validatePackagedArtifact = async (artifact, version) => {
  const extractionDirectory = await mkdtemp(join(tmpdir(), "optimus-release-validate-"));
  try {
    const { stdout } = await execFileAsync("unzip", ["-Z1", artifact]);
    if (/^Optimus\.app\/(?:apps|packages|\.optimus)(?:\/|$)/m.test(stdout)) {
      throw new Error("Release archive contains repository-relative runtime paths");
    }
    await execFileAsync("unzip", ["-q", artifact, "-d", extractionDirectory]);
    await validateExtractedApplication(join(extractionDirectory, "Optimus.app"), version);
  } finally {
    await rm(extractionDirectory, { recursive: true, force: true });
  }
};

const parseArguments = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    }
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
      process.exitCode = 1;
    });
}
