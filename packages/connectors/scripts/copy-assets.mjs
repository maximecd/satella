import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const destinationRoot = fileURLToPath(new URL("../dist/", import.meta.url));

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(source);
      continue;
    }
    if (!entry.name.endsWith(".md") && !entry.name.endsWith(".svg")) continue;
    const destination = join(destinationRoot, relative(sourceRoot, source));
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
};

await stat(sourceRoot);
await walk(sourceRoot);
