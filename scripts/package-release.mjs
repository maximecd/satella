import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
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
  `Satella-${normalizeReleaseVersion(version)}-macOS-arm64.zip`;

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

// Runtime dependencies of @journeyapps/sqlcipher. The engine bundle inlines
// every pure-JavaScript dependency; only the SQLCipher addon tree and its
// binding loader ship as loose node_modules files.
export const nativeModulePackages = ["@journeyapps/sqlcipher", "bindings", "file-uri-to-path"];

export const stageNativeModules = async ({ root = repositoryRoot, target }) => {
  for (const packageName of nativeModulePackages) {
    const source = join(root, "node_modules", ".pnpm", "node_modules", packageName);
    const targetPath = join(target, packageName);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(source, targetPath, { recursive: true, dereference: true });
  }
};

export const validateSourceResources = async (root = repositoryRoot) => {
  await requireFile(join(root, "apps", "desktop", "dist", "main.cjs"), "desktop main build");
  await requireFile(join(root, "apps", "desktop", "dist", "preload.cjs"), "desktop preload build");
  await requireFile(
    join(root, "apps", "desktop", "assets", "Satella.icns"),
    "macOS application icon",
  );
  await requireFile(join(root, "apps", "desktop", "assets", "Satella.png"), "macOS Dock icon");
  await requireFile(join(root, "apps", "web", "dist", "index.html"), "web build");
  await requireFile(join(root, "apps", "engine", "dist", "main.mjs"), "engine build");
};

const productionPackage = (version) => ({
  name: "satella",
  version,
  private: true,
  productName: "Satella",
  description: "A private, local-first home for your financial life.",
  author: "Satella",
  main: "dist/main.cjs",
});

export const builderConfiguration = ({
  root = repositoryRoot,
  appDirectory,
  outputDirectory,
  artifactName,
}) => ({
  appId: "app.satella",
  productName: "Satella",
  directories: {
    app: appDirectory,
    output: outputDirectory,
  },
  files: ["dist/**/*", "package.json"],
  // electron-builder prunes a root-level node_modules directory during
  // extraResources copies, so the SQLCipher addon tree ships as its own entry.
  extraResources: [
    { from: join(appDirectory, "resources", "web"), to: "web" },
    { from: join(appDirectory, "resources", "engine"), to: "engine" },
    {
      from: join(appDirectory, "resources", "engine", "node_modules"),
      to: "engine/node_modules",
    },
    { from: join(root, "apps", "desktop", "assets"), to: "assets" },
  ],
  asar: true,
  asarUnpack: ["**/*.node"],
  npmRebuild: false,
  electronVersion: "43.3.0",
  mac: {
    icon: join(root, "apps", "desktop", "assets", "Satella.icns"),
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
    join(appDirectory, "resources", "engine", "node_modules", "@journeyapps", "sqlcipher"),
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
  const engineNodeModules = join(appDirectory, "resources", "engine", "node_modules");
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
  await stageNativeModules({ root, target: engineNodeModules });
  await writeFile(
    join(appDirectory, "package.json"),
    JSON.stringify(productionPackage(normalizedVersion), null, 2) + "\n",
  );
  await validateStagedResources(appDirectory);
  return { appDirectory };
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
        root,
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
  if (
    (await findNativeBinding(
      join(resourcesDirectory, "engine", "node_modules", "@journeyapps", "sqlcipher"),
    )) === undefined
  ) {
    throw new Error(
      "Packaged SQLCipher native binding was not found outside the application archive",
    );
  }
  if (
    (await readPlistValue(join(contentsDirectory, "Info.plist"), "CFBundleIdentifier")) !==
    "app.satella"
  ) {
    throw new Error("Packaged application has an unexpected bundle identifier");
  }
  if ((await readPlistValue(join(contentsDirectory, "Info.plist"), "CFBundleName")) !== "Satella") {
    throw new Error("Packaged application has an unexpected name");
  }
  const expectedVersion = version;
  if (
    (await readPlistValue(join(contentsDirectory, "Info.plist"), "CFBundleShortVersionString")) !==
    expectedVersion
  ) {
    throw new Error(`Packaged application has an unexpected version; expected ${expectedVersion}`);
  }
};

export const validatePackagedArtifact = async (artifact, version) => {
  const extractionDirectory = await mkdtemp(join(tmpdir(), "satella-release-validate-"));
  try {
    const { stdout } = await execFileAsync("unzip", ["-Z1", artifact]);
    if (/^Satella\.app\/(?:apps|packages|\.satella)(?:\/|$)/m.test(stdout)) {
      throw new Error("Release archive contains repository-relative runtime paths");
    }
    await execFileAsync("unzip", ["-q", artifact, "-d", extractionDirectory]);
    await validateExtractedApplication(join(extractionDirectory, "Satella.app"), version);
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
      if (error instanceof Error && "stdout" in error && error.stdout) {
        console.error(error.stdout);
      }
      if (error instanceof Error && "stderr" in error && error.stderr) {
        console.error(error.stderr);
      }
      process.exitCode = 1;
    });
}
