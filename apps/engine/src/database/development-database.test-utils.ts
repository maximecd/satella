import { execFile as execFileCallback, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SqlClient } from "effect/unstable/sql";

import { DatabaseConfigFromDirectory } from "./index.js";
import { layer as VaultEventsLive } from "../vault/VaultEvents.js";
import { VaultLive } from "../vault/VaultLive.js";
import { VaultService } from "../vault/Vault.js";
import { FAST_KDF } from "../vault/kdf.js";
import { DEVELOPMENT_SCREEN_LOCK_PIN, DEVELOPMENT_VAULT_PASSWORD } from "../vault/VaultLive.js";

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const databaseDir = dirname(fileURLToPath(import.meta.url));
const engineSrc = dirname(databaseDir);

export const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");
export const dbCli = join(databaseDir, "cli.ts");
export const engineMain = join(engineSrc, "main.ts");

export const databaseFile = (worktree: string) => join(worktree, ".satella", "satella.sqlite");
export const dataDirectory = (worktree: string) => join(worktree, ".satella");

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly output: string;
}

export interface GitCheckouts {
  readonly root: string;
  readonly main: string;
  readonly linked: string;
  readonly nested: string;
  readonly dispose: () => Promise<void>;
}

const git = (cwd: string, args: ReadonlyArray<string>) =>
  execFile("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Satella",
      GIT_AUTHOR_EMAIL: "satella@example.test",
      GIT_COMMITTER_NAME: "Satella",
      GIT_COMMITTER_EMAIL: "satella@example.test",
    },
  });

export const commandEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["SATELLA_DATA_DIR"];
  delete env["SATELLA_DATABASE_CONTEXT"];
  return {
    ...env,
    SATELLA_VAULT_KDF: "fast",
    SATELLA_ENGINE_TOKEN: "test-engine-token-0123456789abcdef-test",
    ...overrides,
  };
};

export const runNodeScript = (
  script: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly nodeArgs?: ReadonlyArray<string>;
  },
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...(options.nodeArgs ?? []), tsxCli, script, ...args], {
      cwd: options.cwd,
      env: options.env ?? commandEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        output: `${stdout}${stderr}`,
      });
    });
  });

export const runDb = (
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly nodeArgs?: ReadonlyArray<string>;
  },
) => runNodeScript(dbCli, args, options);

export const vaultStatusForDirectory = (directory: string) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const vault = yield* VaultService;
        return yield* vault.status();
      }).pipe(
        Effect.provide(
          VaultLive.pipe(
            Layer.provide(DatabaseConfigFromDirectory(directory)),
            Layer.provide(VaultEventsLive),
          ),
        ),
      ),
    ),
  );

export const inspectDirectory = <A>(
  directory: string,
  program: Effect.Effect<A, unknown, SqlClient.SqlClient>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const vault = yield* VaultService;
        const status = yield* vault.status();
        if (status.state === "absent") {
          yield* vault.initialize({
            password: DEVELOPMENT_VAULT_PASSWORD,
            pin: DEVELOPMENT_SCREEN_LOCK_PIN,
            kdf: FAST_KDF,
          });
        } else if (status.state === "locked") {
          yield* vault.unlock(DEVELOPMENT_VAULT_PASSWORD);
        }
        const sql = yield* vault.currentSql();
        return yield* program.pipe(Effect.provideService(SqlClient.SqlClient, sql));
      }).pipe(
        Effect.provide(
          VaultLive.pipe(
            Layer.provide(DatabaseConfigFromDirectory(directory)),
            Layer.provide(VaultEventsLive),
          ),
        ),
      ),
    ),
  );

export const createGitCheckouts = async (): Promise<GitCheckouts> => {
  const root = await mkdtemp(join(tmpdir(), "satella-db-tooling-"));
  const main = join(root, "main");
  const linked = join(root, "linked");
  const nested = join(main, "packages", "nested");
  await mkdir(main);
  await git(main, ["init", "-b", "main"]);
  await git(main, ["commit", "--allow-empty", "-m", "init"]);
  await git(main, ["worktree", "add", linked, "-b", "linked-work"]);
  await mkdir(nested, { recursive: true });
  return {
    root,
    main,
    linked,
    nested,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
};

export const chooseFreePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (address === null || !(address instanceof Object)) {
        server.close();
        reject(new Error("Could not bind an ephemeral TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });

export const startEngine = async (options: {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}) => {
  const port = await chooseFreePort();
  const token = options.env?.SATELLA_ENGINE_TOKEN ?? commandEnv().SATELLA_ENGINE_TOKEN!;
  const env = commandEnv({
    SATELLA_DATABASE_CONTEXT: "development",
    SATELLA_ENGINE_PORT: String(port),
    ...options.env,
  });
  const child = spawn(process.execPath, ["--conditions=development", tsxCli, engineMain], {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const started = await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Engine did not start:\n${output}`));
    }, 45_000);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      reject(new Error(`Engine exited before becoming ready (${code ?? signal}):\n${output}`));
    };
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", onExit);
    const onData = () => {
      if (output.includes("Engine listening") || output.includes("SQLite database initialized")) {
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        child.off("exit", onExit);
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
  void started;
  return {
    output: () => output,
    port,
    token,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 5_000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },
  };
};
