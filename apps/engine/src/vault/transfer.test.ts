import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  recoverInterruptedRestore,
  RESTORE_BACKUP_DATABASE_NAME,
  RESTORE_BACKUP_ENVELOPE_NAME,
  restoreJournalPath,
} from "./transfer.js";

const sha256 = (contents: Buffer | string) => createHash("sha256").update(contents).digest("hex");

describe("interrupted restore recovery", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const prepare = async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-restore-recovery-"));
    directories.push(directory);
    const paths = {
      dataDirectory: directory,
      databasePath: join(directory, "satella.sqlite"),
      envelopePath: join(directory, "vault.envelope.json"),
    };
    return { paths };
  };

  it("rolls an interrupted commit back to the complete original Vault", async () => {
    const { paths } = await prepare();
    const originalDatabase = Buffer.from("original-database-bytes");
    const originalEnvelope = Buffer.from("original-envelope-bytes");
    const restoredDatabase = Buffer.from("restored-database-bytes");
    const restoredEnvelope = Buffer.from("restored-envelope-bytes");

    await writeFile(paths.databasePath, originalDatabase);
    await writeFile(paths.envelopePath, originalEnvelope);
    await writeFile(join(paths.dataDirectory, RESTORE_BACKUP_DATABASE_NAME), originalDatabase);
    await writeFile(join(paths.dataDirectory, RESTORE_BACKUP_ENVELOPE_NAME), originalEnvelope);
    // Simulate a crash after only the database rename landed.
    await writeFile(paths.databasePath, restoredDatabase);
    await writeFile(
      restoreJournalPath(paths.dataDirectory),
      JSON.stringify({
        version: 1,
        databaseHash: sha256(restoredDatabase),
        envelopeHash: sha256(restoredEnvelope),
      }),
    );

    await recoverInterruptedRestore(paths);

    expect(await readFile(paths.databasePath)).toEqual(originalDatabase);
    expect(await readFile(paths.envelopePath)).toEqual(originalEnvelope);
    await expect(readFile(restoreJournalPath(paths.dataDirectory))).rejects.toThrow(/ENOENT/);
    await expect(readFile(join(paths.dataDirectory, RESTORE_BACKUP_DATABASE_NAME))).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("completes a finished commit instead of rolling it back", async () => {
    const { paths } = await prepare();
    const restoredDatabase = Buffer.from("restored-database-bytes");
    const restoredEnvelope = Buffer.from("restored-envelope-bytes");
    await writeFile(paths.databasePath, restoredDatabase);
    await writeFile(paths.envelopePath, restoredEnvelope);
    await writeFile(
      restoreJournalPath(paths.dataDirectory),
      JSON.stringify({
        version: 1,
        databaseHash: sha256(restoredDatabase),
        envelopeHash: sha256(restoredEnvelope),
      }),
    );

    await recoverInterruptedRestore(paths);

    expect(await readFile(paths.databasePath)).toEqual(restoredDatabase);
    expect(await readFile(paths.envelopePath)).toEqual(restoredEnvelope);
    await expect(readFile(restoreJournalPath(paths.dataDirectory))).rejects.toThrow(/ENOENT/);
  });

  it("rolls a first Vault restore back to absence when no backup exists", async () => {
    const { paths } = await prepare();
    const restoredDatabase = Buffer.from("half-restored-database");
    await writeFile(paths.databasePath, restoredDatabase);
    await writeFile(
      restoreJournalPath(paths.dataDirectory),
      JSON.stringify({
        version: 1,
        databaseHash: sha256(Buffer.from("never-landed-database")),
        envelopeHash: sha256(Buffer.from("never-landed-envelope")),
      }),
    );

    await recoverInterruptedRestore(paths);

    await expect(readFile(paths.databasePath)).rejects.toThrow(/ENOENT/);
    await expect(readFile(paths.envelopePath)).rejects.toThrow(/ENOENT/);
    await expect(readFile(restoreJournalPath(paths.dataDirectory))).rejects.toThrow(/ENOENT/);
  });
});
