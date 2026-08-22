import { createHash } from "node:crypto";
import { chmod, copyFile, open, readFile, rename, rm, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

import * as Schema from "effect/Schema";

export const RESTORE_JOURNAL_FILE_NAME = "restore.journal";
export const RESTORE_STAGING_DIRECTORY_NAME = "restore-staging";
export const RESTORE_BACKUP_DATABASE_NAME = "restore-backup.sqlite";
export const RESTORE_BACKUP_ENVELOPE_NAME = "restore-backup.vault.envelope.json";

export interface RestorePaths {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly envelopePath: string;
}

export const restoreStagingDirectory = (dataDirectory: string) =>
  join(dataDirectory, RESTORE_STAGING_DIRECTORY_NAME);

export const restoreJournalPath = (dataDirectory: string) =>
  join(dataDirectory, RESTORE_JOURNAL_FILE_NAME);

const fileExists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const hashFile = async (path: string) => {
  try {
    const contents = await readFile(path);
    return createHash("sha256").update(contents).digest("hex");
  } catch {
    return undefined;
  }
};

const atomicReplace = async (source: string, target: string) => {
  const temporary = `${target}.restore-tmp`;
  await copyFile(source, temporary);
  await chmod(temporary, 0o600).catch(() => undefined);
  await rename(temporary, target);
};

const removeQuietly = async (path: string) => {
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
};

interface RestoreJournal {
  readonly version: 1;
  readonly databaseHash?: string | undefined;
  readonly envelopeHash?: string | undefined;
}

const RestoreJournalSchema = Schema.Struct({
  version: Schema.Literal(1),
  databaseHash: Schema.optional(Schema.String),
  envelopeHash: Schema.optional(Schema.String),
});

/**
 * Replays or rolls back an interrupted Vault restore so that startup always
 * observes either the complete original Vault or the complete restored Vault.
 */
export const recoverInterruptedRestore = async (paths: RestorePaths) => {
  const journalPath = restoreJournalPath(paths.dataDirectory);
  if (!(await fileExists(journalPath))) {
    await removeQuietly(join(paths.dataDirectory, RESTORE_BACKUP_DATABASE_NAME));
    await removeQuietly(join(paths.dataDirectory, RESTORE_BACKUP_ENVELOPE_NAME));
    await removeQuietly(restoreStagingDirectory(paths.dataDirectory));
    return;
  }

  let journal: RestoreJournal;
  try {
    const parsed: unknown = JSON.parse(await readFile(journalPath, "utf8"));
    journal = Schema.decodeUnknownSync(RestoreJournalSchema)(parsed);
  } catch {
    await removeQuietly(journalPath);
    return;
  }

  const databaseMatches =
    journal.databaseHash !== undefined &&
    (await hashFile(paths.databasePath)) === journal.databaseHash;
  const envelopeMatches =
    journal.envelopeHash !== undefined &&
    (await hashFile(paths.envelopePath)) === journal.envelopeHash;

  if (!(databaseMatches && envelopeMatches)) {
    const backupDatabase = join(paths.dataDirectory, RESTORE_BACKUP_DATABASE_NAME);
    const backupEnvelope = join(paths.dataDirectory, RESTORE_BACKUP_ENVELOPE_NAME);
    if (journal.databaseHash !== undefined) {
      if (await fileExists(backupDatabase)) {
        await atomicReplace(backupDatabase, paths.databasePath);
      } else if (!databaseMatches) {
        // No backup exists (there was no prior Vault); a mismatched target file
        // must not survive as a half-restored Vault.
        if ((await hashFile(paths.databasePath)) !== journal.databaseHash) {
          await rm(paths.databasePath, { force: true }).catch(() => undefined);
        }
      }
    }
    if (journal.envelopeHash !== undefined) {
      if (await fileExists(backupEnvelope)) {
        await atomicReplace(backupEnvelope, paths.envelopePath);
      } else if (!envelopeMatches) {
        if ((await hashFile(paths.envelopePath)) !== journal.envelopeHash) {
          await rm(paths.envelopePath, { force: true }).catch(() => undefined);
        }
      }
    }
  }

  await removeQuietly(journalPath);
  await removeQuietly(join(paths.dataDirectory, RESTORE_BACKUP_DATABASE_NAME));
  await removeQuietly(join(paths.dataDirectory, RESTORE_BACKUP_ENVELOPE_NAME));
  await removeQuietly(restoreStagingDirectory(paths.dataDirectory));
};

export const readVaultFile = async (path: string) => {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isFile()) {
    throw Object.assign(new Error("The selected file could not be read."), { code: "unreadable" });
  }
  const handle = await open(path, fsConstants.O_RDONLY);
  try {
    const bytes = await handle.readFile();
    return new Uint8Array(bytes);
  } finally {
    await handle.close();
  }
};

export const publishAtomically = async (
  destinationPath: string,
  contents: Uint8Array,
  validate?: (path: string) => Promise<void>,
) => {
  const temporary = `${destinationPath}.tmp-${process.pid}`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await chmod(temporary, 0o600);
    if (validate !== undefined) await validate(temporary);
    await rename(temporary, destinationPath);
  } catch (cause) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw cause;
  }
};
