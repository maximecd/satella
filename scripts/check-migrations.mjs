import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const databaseDirectory = resolve(repositoryRoot, "apps/engine/src/database");
const migrationDirectory = resolve(databaseDirectory, "migrations");
const registryPath = resolve(databaseDirectory, "migrations.ts");
const migrationPattern = /^(\d{14})_([a-z][a-z0-9_]*)\.ts$/;
const seal = process.argv.includes("--seal");

const digest = (contents) => createHash("sha256").update(contents).digest("hex");
const displayPath = (path) => relative(repositoryRoot, path);
const isTracked = (path) => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", displayPath(path)], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};
const failures = [];

const names = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".ts"))
  .sort((left, right) => left.localeCompare(right));
const migrations = [];
const ids = new Map();

for (const filename of names) {
  const match = migrationPattern.exec(filename);
  if (match === null) {
    failures.push(
      `${displayPath(resolve(migrationDirectory, filename))}: expected <UTC yyyymmddHHMMSS>_<name>.ts`,
    );
    continue;
  }

  const [, id, name] = match;
  const key = `${id}_${name}`;
  const earlier = ids.get(id);
  if (earlier !== undefined) {
    failures.push(`migration id ${id} is used by both ${earlier} and ${filename}`);
  }
  ids.set(id, filename);
  migrations.push({ filename, key });

  const path = resolve(migrationDirectory, filename);
  const checksumPath = `${path}.sha256`;
  const expected = digest(await readFile(path));
  try {
    const actual = (await readFile(checksumPath, "utf8")).trim();
    if (actual !== expected) {
      failures.push(
        `${displayPath(path)} changed after it was sealed; append a new migration instead`,
      );
    }
  } catch {
    if (seal) {
      if (isTracked(path)) {
        failures.push(
          `${displayPath(checksumPath)} is missing for a tracked migration; restore the checksum instead of resealing it`,
        );
      } else {
        await writeFile(checksumPath, `${expected}\n`, { flag: "wx" });
        console.log(`sealed ${displayPath(path)}`);
      }
    } else {
      failures.push(
        `${displayPath(checksumPath)} is missing; run pnpm migration:seal after adding the migration`,
      );
    }
  }
}

const registrySource = await readFile(registryPath, "utf8");
const registryMatch =
  /export const ProductionMigrations = \{([\s\S]*?)\n\} satisfies MigrationRegistry;/.exec(
    registrySource,
  );
if (registryMatch === null) {
  failures.push(`${displayPath(registryPath)}: could not find ProductionMigrations`);
} else {
  const registered = [...registryMatch[1].matchAll(/^\s*"(\d+_[^"]+)":/gm)].map(
    (match) => match[1],
  );
  const expected = migrations.map(({ key }) => key);
  if (JSON.stringify(registered) !== JSON.stringify(expected)) {
    failures.push(
      `${displayPath(registryPath)} must register every migration once in timestamp order\n` +
        `expected: ${expected.join(", ")}\n` +
        `actual:   ${registered.join(", ")}`,
    );
  }
}

for (const name of await readdir(migrationDirectory)) {
  if (!name.endsWith(".ts.sha256")) continue;
  const migrationPath = resolve(migrationDirectory, name.slice(0, -".sha256".length));
  try {
    await access(migrationPath);
  } catch {
    failures.push(`${displayPath(resolve(migrationDirectory, name))} has no migration file`);
  }
}

if (failures.length > 0) {
  console.error(`Migration check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Migration check passed for ${migrations.length} sealed migration(s).`);
}
