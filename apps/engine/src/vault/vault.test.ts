import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";

import { DatabaseConfigFromDirectory } from "../database/index.js";
import { TempDirectoryError } from "../database/DatabaseTestLayer.js";
import { FAST_KDF } from "./kdf.js";
import { RESET_CONFIRMATION, VaultService } from "./Vault.js";
import { VaultLive } from "./VaultLive.js";

const vaultLayer = (directory: string) =>
  VaultLive.pipe(Layer.provide(DatabaseConfigFromDirectory(directory)));

const password = "correct-horse-battery";
const pin = "2468";

describe("Vault", () => {
  it.effect("creates an encrypted Vault and requires the Vault password after close", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "optimus-vault-")),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      yield* Effect.gen(function* () {
        const vault = yield* VaultService;
        expect(yield* vault.status()).toEqual({ state: "absent" });
        yield* vault.initialize({ password, pin, kdf: FAST_KDF });
        expect((yield* vault.status()).state).toBe("open");
        yield* vault.close();
        expect(yield* vault.status()).toEqual({ state: "locked" });
        const failed = yield* vault.unlock("wrong-password-xx").pipe(Effect.flip);
        expect(String(failed)).toContain("could not be unlocked");
        yield* vault.unlock(password);
        expect((yield* vault.status()).state).toBe("open");
      }).pipe(Effect.provide(vaultLayer(directory)));
      const names = yield* Effect.tryPromise({
        try: () => readdir(directory),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      const sqlite = yield* Effect.tryPromise({
        try: () => readFile(join(directory, "optimus.sqlite")),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      expect(names).toContain("vault.envelope.json");
      expect(sqlite.includes(Buffer.from("vault_security"))).toBe(false);
    }),
  );

  it.effect("keeps the Vault open during Screen lock and disables PIN after three failures", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "optimus-vault-")),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      yield* Effect.gen(function* () {
        const vault = yield* VaultService;
        yield* vault.initialize({ password, pin, kdf: FAST_KDF });
        yield* vault.lockScreen();
        const locked = yield* vault.status();
        expect(locked).toMatchObject({ state: "open", screenLock: true, pinEntryDisabled: false });
        yield* vault.assertOpenVault();
        const renderer = yield* vault.assertRendererFinanceAccess().pipe(Effect.flip);
        expect(renderer.reason).toBe("screen-locked");
        yield* vault.unlockScreen("0000").pipe(Effect.flip);
        yield* vault.unlockScreen("0000").pipe(Effect.flip);
        yield* vault.unlockScreen("0000").pipe(Effect.flip);
        const disabled = yield* vault.status();
        expect(disabled).toMatchObject({ pinEntryDisabled: true, screenLock: true });
        yield* vault.currentSql();
        yield* vault.assertOpenVault();
        yield* vault.unlockScreenWithPassword(password);
        expect(yield* vault.status()).toMatchObject({ screenLock: false, pinEntryDisabled: false });
      }).pipe(Effect.provide(vaultLayer(directory)));
    }),
  );

  it.effect("rewraps the database key on password change and resets after typed confirmation", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "optimus-vault-")),
        catch: (cause) => new TempDirectoryError({ cause }),
      });
      yield* Effect.gen(function* () {
        const vault = yield* VaultService;
        yield* vault.initialize({ password, pin, kdf: FAST_KDF });
        yield* vault.changePassword(password, "new-horse-battery");
        yield* vault.close();
        yield* vault.unlock(password).pipe(Effect.flip);
        yield* vault.unlock("new-horse-battery");
        const refused = yield* vault.reset("nope").pipe(Effect.flip);
        expect(refused.reason).toBe("reset-confirmation");
        yield* vault.reset(RESET_CONFIRMATION);
        expect(yield* vault.status()).toEqual({ state: "absent" });
        yield* vault.initialize({ password, pin, kdf: FAST_KDF });
        expect((yield* vault.status()).state).toBe("open");
      }).pipe(Effect.provide(vaultLayer(directory)));
    }),
  );
});
