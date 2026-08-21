import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import * as Finance from "../finance/finance.test-utils.js";
import {
  commandEnv,
  createGitCheckouts,
  dataDirectory,
  databaseFile,
  engineMain,
  inspectDirectory,
  runDb,
  runNodeScript,
  startEngine,
  vaultStatusForDirectory,
} from "./development-database.test-utils.js";
import { FIXTURE_PRICE_HISTORY, FIXTURE_QUOTE_TIME } from "./seed.js";

const expectPrintedSelection = (output: string, worktree: string) => {
  expect(output).toContain(worktree);
  expect(output).toContain(databaseFile(worktree));
};

const loadManualPortfolio = (directory: string) =>
  inspectDirectory(
    directory,
    Effect.gen(function* () {
      const accounts = yield* Finance.listManualAccounts();
      const assets = yield* Finance.listAssets();
      const connections = yield* Finance.listConnections();
      const history = yield* Finance.getPortfolioHistory();
      return { accounts, assets, connections, history };
    }),
  );

const expectCanonicalFixture = async (directory: string) => {
  const { accounts, assets, connections, history } = await loadManualPortfolio(directory);
  const brokerage = accounts.find((account) => account.name === "Demo Brokerage");
  const euroCash = accounts.find((account) => account.name === "Demo Euro Cash");
  const apple = assets.find((asset) => asset.symbol === "AAPL");
  const microsoft = assets.find((asset) => asset.symbol === "MSFT");
  const voo = assets.find((asset) => asset.symbol === "VOO");
  const euro = assets.find((asset) => asset.id === "fiat:EUR");

  expect(brokerage).toMatchObject({
    id: "seed:account:demo-brokerage",
    connectionId: null,
    connectorAccountId: null,
    baseCurrencyIso: "USD",
    total: "20787.5",
  });
  expect(euroCash).toMatchObject({
    id: "seed:account:demo-euro-cash",
    connectionId: null,
    connectorAccountId: null,
    baseCurrencyIso: "EUR",
    total: "8000",
  });
  expect(brokerage?.positions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ assetId: "fiat:USD", quantity: "12500", assetCategory: "cash" }),
      expect.objectContaining({
        assetId: "seed:asset:aapl",
        quantity: "12.5",
        assetCategory: "stocks_etfs",
      }),
      expect.objectContaining({
        assetId: "seed:asset:msft",
        quantity: "4",
        assetCategory: "stocks_etfs",
      }),
      expect.objectContaining({
        assetId: "seed:asset:voo",
        quantity: "7.25",
        assetCategory: "stocks_etfs",
      }),
    ]),
  );
  expect(euroCash?.positions).toEqual([
    expect.objectContaining({ assetId: "fiat:EUR", quantity: "8000", assetCategory: "cash" }),
  ]);
  expect(apple).toMatchObject({
    id: "seed:asset:aapl",
    name: "Apple",
    symbol: "AAPL",
    assetCategory: "stocks_etfs",
    price: expect.objectContaining({
      price: "200",
      currencyIso: "USD",
      source: "manual",
      observedAt: FIXTURE_QUOTE_TIME,
    }),
  });
  expect(apple?.identifiers).toEqual(
    expect.arrayContaining([
      { type: "isin", value: "US0378331005" },
      { type: "yahoo_symbol", value: "AAPL" },
    ]),
  );
  expect(microsoft).toMatchObject({
    id: "seed:asset:msft",
    name: "Microsoft",
    symbol: "MSFT",
    identifiers: expect.arrayContaining([
      { type: "isin", value: "US5949181045" },
      { type: "yahoo_symbol", value: "MSFT" },
    ]),
    price: expect.objectContaining({
      price: "450",
      source: "manual",
      observedAt: FIXTURE_QUOTE_TIME,
    }),
  });
  expect(voo).toMatchObject({
    id: "seed:asset:voo",
    name: "Vanguard S&P 500 ETF",
    symbol: "VOO",
    identifiers: expect.arrayContaining([
      { type: "isin", value: "US9229083632" },
      { type: "yahoo_symbol", value: "VOO" },
    ]),
    price: expect.objectContaining({
      price: "550",
      source: "manual",
      observedAt: FIXTURE_QUOTE_TIME,
    }),
  });
  expect(euro?.price).toMatchObject({
    price: "1.1",
    currencyIso: "USD",
    source: "manual",
    observedAt: FIXTURE_QUOTE_TIME,
  });
  expect(connections).toEqual([]);
  expect(history).toHaveLength(FIXTURE_PRICE_HISTORY.length);
  expect(history[0]).toEqual(
    expect.objectContaining({
      capturedAt: "2025-08-15T00:00:00.000Z",
      total: "28167.5",
      totalIncomplete: false,
    }),
  );
  expect(history.at(-1)).toEqual(
    expect.objectContaining({
      capturedAt: "2026-08-14T00:00:00.000Z",
      total: "29587.5",
      totalIncomplete: false,
    }),
  );
  return { accounts, assets };
};

describe("worktree-local database tooling", { timeout: 60_000 }, () => {
  it("stores a distinct database under each Git worktree and ignores nested cwd", async () => {
    const checkouts = await createGitCheckouts();
    try {
      const main = await runDb(["reset"], { cwd: checkouts.main });
      const nested = await runDb(["reset"], { cwd: checkouts.nested });
      const linked = await runDb(["reset"], { cwd: checkouts.linked });

      expect(main.code).toBe(0);
      expect(nested.code).toBe(0);
      expect(linked.code).toBe(0);
      expectPrintedSelection(main.output, checkouts.main);
      expectPrintedSelection(nested.output, checkouts.main);
      expectPrintedSelection(linked.output, checkouts.linked);
      expect(databaseFile(checkouts.main)).not.toBe(databaseFile(checkouts.linked));

      await inspectDirectory(
        dataDirectory(checkouts.main),
        Finance.createAccount({ name: "Main Only" }),
      );
      await inspectDirectory(
        dataDirectory(checkouts.linked),
        Finance.createAccount({ name: "Linked Only" }),
      );

      const resetMain = await runDb(["reset"], { cwd: checkouts.nested });
      expect(resetMain.code).toBe(0);

      const mainAccounts = await inspectDirectory(
        dataDirectory(checkouts.main),
        Finance.listManualAccounts(),
      );
      const linkedAccounts = await inspectDirectory(
        dataDirectory(checkouts.linked),
        Finance.listManualAccounts(),
      );
      expect(mainAccounts.map((account) => account.name)).toEqual([]);
      expect(linkedAccounts.map((account) => account.name)).toEqual(["Linked Only"]);

      await inspectDirectory(
        dataDirectory(checkouts.main),
        Finance.createAccount({ name: "Main After Reset" }),
      );
      const seedLinked = await runDb(["seed"], { cwd: checkouts.linked });
      expect(seedLinked.code).toBe(0);
      const mainAfterSeed = await inspectDirectory(
        dataDirectory(checkouts.main),
        Finance.listManualAccounts(),
      );
      const linkedAfterSeed = await inspectDirectory(
        dataDirectory(checkouts.linked),
        Finance.listManualAccounts(),
      );
      expect(mainAfterSeed.map((account) => account.name)).toEqual(["Main After Reset"]);
      expect(linkedAfterSeed.map((account) => account.name).sort()).toEqual([
        "Demo Brokerage",
        "Demo Euro Cash",
        "Linked Only",
      ]);
    } finally {
      await checkouts.dispose();
    }
  });

  it("lets an explicit absolute data directory override worktree resolution and rejects invalid overrides", async () => {
    const checkouts = await createGitCheckouts();
    const override = join(checkouts.root, "override-data");
    try {
      const reset = await runDb(["reset"], {
        cwd: checkouts.main,
        env: commandEnv({ OPTIMUS_DATA_DIR: override }),
      });
      expect(reset.code).toBe(0);
      expect(reset.output).toContain(join(override, "optimus.sqlite"));
      await inspectDirectory(override, Finance.createAccount({ name: "Override" }));

      const worktreeReset = await runDb(["reset"], { cwd: checkouts.main });
      expect(worktreeReset.code).toBe(0);
      const overrideAccounts = await inspectDirectory(override, Finance.listManualAccounts());
      expect(overrideAccounts.map((account) => account.name)).toEqual(["Override"]);

      const relative = await runDb(["reset"], {
        cwd: checkouts.main,
        env: commandEnv({ OPTIMUS_DATA_DIR: "relative-data" }),
      });
      const empty = await runDb(["reset"], {
        cwd: checkouts.main,
        env: commandEnv({ OPTIMUS_DATA_DIR: "" }),
      });
      expect(relative.code).not.toBe(0);
      expect(empty.code).not.toBe(0);
      expect(relative.output).toMatch(/absolute path/i);
      expect(empty.output).toMatch(/absolute path/i);
    } finally {
      await checkouts.dispose();
    }
  });

  it("resets to no Vault so the next engine start is onboarding, not unlock", async () => {
    const checkouts = await createGitCheckouts();
    try {
      expect((await runDb(["reset", "--seed"], { cwd: checkouts.main })).code).toBe(0);
      const directory = dataDirectory(checkouts.main);
      await mkdir(join(directory, "backups"), { recursive: true });
      await writeFile(join(directory, "backups", "pre-migration-old.sqlite"), "stale-backup");
      await writeFile(`${databaseFile(checkouts.main)}-wal`, "stale-wal");
      await writeFile(`${databaseFile(checkouts.main)}-shm`, "stale-shm");

      const reset = await runDb(["reset"], { cwd: checkouts.main });
      expect(reset.code).toBe(0);
      expect(reset.output).toMatch(/reset complete/i);
      expectPrintedSelection(reset.output, checkouts.main);

      const names = await readdir(directory).catch(() => []);
      expect(names).not.toContain("vault.envelope.json");
      expect(names).not.toContain("optimus.sqlite");
      expect(names).not.toContain("optimus.sqlite-wal");
      expect(names).not.toContain("optimus.sqlite-shm");
      expect(await vaultStatusForDirectory(directory)).toEqual({ state: "absent" });
    } finally {
      await checkouts.dispose();
    }
  });

  it("refuses reset and seed while the engine owns the database and recovers from stale ownership", async () => {
    const checkouts = await createGitCheckouts();
    try {
      expect((await runDb(["reset", "--seed"], { cwd: checkouts.main })).code).toBe(0);
      const engine = await startEngine({ cwd: checkouts.main });
      try {
        const reset = await runDb(["reset"], { cwd: checkouts.main });
        const seed = await runDb(["seed"], { cwd: checkouts.main });
        expect(reset.code).not.toBe(0);
        expect(seed.code).not.toBe(0);
        expect(reset.output).toContain(databaseFile(checkouts.main));
        expect(reset.output).toMatch(/stop the engine/i);
        expect(seed.output).toMatch(/stop the engine/i);
        const accounts = await inspectDirectory(
          dataDirectory(checkouts.main),
          Finance.listManualAccounts(),
        );
        expect(accounts.map((account) => account.name)).toEqual([
          "Demo Brokerage",
          "Demo Euro Cash",
        ]);
      } finally {
        await engine.stop();
      }

      await writeFile(join(dataDirectory(checkouts.main), "engine.lock"), "2147483647\n");
      const recovered = await runDb(["reset"], { cwd: checkouts.main });
      expect(recovered.code).toBe(0);
      const recoveredNames = await readdir(dataDirectory(checkouts.main)).catch(() => []);
      expect(recoveredNames).not.toContain("vault.envelope.json");
    } finally {
      await checkouts.dispose();
    }
  });

  it("seeds a deterministic manual fixture that is idempotent, repairing, and non-destructive", async () => {
    const checkouts = await createGitCheckouts();
    try {
      expect((await runDb(["reset"], { cwd: checkouts.main })).code).toBe(0);
      const personal = await inspectDirectory(
        dataDirectory(checkouts.main),
        Effect.gen(function* () {
          const account = yield* Finance.createAccount({
            name: "Personal Savings",
            baseCurrencyAssetId: "fiat:USD",
          });
          yield* Finance.createPosition({
            accountId: account.id,
            assetId: "fiat:USD",
            quantity: "42",
          });
          return account;
        }),
      );

      const first = await runDb(["seed"], { cwd: checkouts.main });
      expect(first.code).toBe(0);
      expect(first.output).toMatch(/seed complete/i);
      expectPrintedSelection(first.output, checkouts.main);
      const afterFirst = await expectCanonicalFixture(dataDirectory(checkouts.main));
      expect(afterFirst.accounts.map((account) => account.name).sort()).toEqual([
        "Demo Brokerage",
        "Demo Euro Cash",
        "Personal Savings",
      ]);

      const second = await runDb(["seed"], { cwd: checkouts.main });
      expect(second.code).toBe(0);
      const afterSecond = await expectCanonicalFixture(dataDirectory(checkouts.main));
      expect(afterSecond.accounts.map((account) => account.id).sort()).toEqual(
        afterFirst.accounts.map((account) => account.id).sort(),
      );
      expect(afterSecond.assets.filter((asset) => asset.symbol === "AAPL")).toHaveLength(1);

      await inspectDirectory(
        dataDirectory(checkouts.main),
        Effect.gen(function* () {
          const brokerage = yield* Finance.getAccount("seed:account:demo-brokerage");
          const apple = brokerage.positions.find(
            (position) => position.assetId === "seed:asset:aapl",
          );
          expect(apple).toBeDefined();
          if (apple === undefined) return;
          yield* Finance.updatePosition(apple.id, "1");
          const euro = yield* Finance.getAccount("seed:account:demo-euro-cash");
          const cash = euro.positions.find((position) => position.assetId === "fiat:EUR");
          expect(cash).toBeDefined();
          if (cash === undefined) return;
          yield* Finance.updatePosition(cash.id, "1");
          yield* Finance.updateAccount("seed:account:demo-euro-cash", {
            name: "Renamed",
            baseCurrencyAssetId: "fiat:EUR",
          });
          yield* Finance.deleteAccount("seed:account:demo-brokerage");
        }),
      );

      expect((await runDb(["seed"], { cwd: checkouts.main })).code).toBe(0);
      const repaired = await expectCanonicalFixture(dataDirectory(checkouts.main));
      const personalAfter = repaired.accounts.find(
        (account) => account.name === "Personal Savings",
      );
      expect(personalAfter?.id).toBe(personal.id);
      expect(personalAfter?.positions).toEqual([
        expect.objectContaining({ assetId: "fiat:USD", quantity: "42" }),
      ]);
    } finally {
      await checkouts.dispose();
    }
  });

  it("rolls back a seed run when a fixture identifier conflicts", async () => {
    const checkouts = await createGitCheckouts();
    try {
      expect((await runDb(["reset"], { cwd: checkouts.main })).code).toBe(0);
      const conflicting = await inspectDirectory(
        dataDirectory(checkouts.main),
        Finance.createAsset({
          assetCategory: "stocks_etfs",
          name: "Other Apple",
          symbol: "APPL",
          identifiers: [{ type: "isin", value: "US0378331005" }],
        }),
      );

      const seed = await runDb(["seed"], { cwd: checkouts.main });
      expect(seed.code).not.toBe(0);
      const { accounts, assets } = await loadManualPortfolio(dataDirectory(checkouts.main));
      expect(accounts).toEqual([]);
      expect(assets.find((asset) => asset.id === conflicting.id)?.name).toBe("Other Apple");
      expect(assets.find((asset) => asset.id === "seed:asset:aapl")).toBeUndefined();
      expect(assets.find((asset) => asset.name === "Demo Brokerage")).toBeUndefined();
    } finally {
      await checkouts.dispose();
    }
  });

  it("composes reset --seed into the canonical fixture from a dirty database", async () => {
    const checkouts = await createGitCheckouts();
    try {
      expect((await runDb(["reset", "--seed"], { cwd: checkouts.main })).code).toBe(0);
      await inspectDirectory(
        dataDirectory(checkouts.main),
        Finance.createAccount({ name: "Scratch" }),
      );
      const composed = await runDb(["reset", "--seed"], { cwd: checkouts.main });
      expect(composed.code).toBe(0);
      expect(composed.output).toMatch(/reset complete/i);
      expect(composed.output).toMatch(/seed complete/i);
      const { accounts } = await expectCanonicalFixture(dataDirectory(checkouts.main));
      expect(accounts.map((account) => account.name).sort()).toEqual([
        "Demo Brokerage",
        "Demo Euro Cash",
      ]);
    } finally {
      await checkouts.dispose();
    }
  });

  it("seeds successfully without network access", async () => {
    const checkouts = await createGitCheckouts();
    const preload = join(checkouts.root, "block-network.mjs");
    try {
      await writeFile(
        preload,
        `import net from "node:net";
import tls from "node:tls";
const deny = () => {
  throw new Error("network disabled");
};
net.connect = deny;
net.createConnection = deny;
tls.connect = deny;
`,
      );
      expect((await runDb(["reset"], { cwd: checkouts.main })).code).toBe(0);
      const seed = await runDb(["seed"], {
        cwd: checkouts.main,
        nodeArgs: [`--import=${preload}`],
      });
      expect(seed.code).toBe(0);
      await expectCanonicalFixture(dataDirectory(checkouts.main));
    } finally {
      await checkouts.dispose();
    }
  });

  it("logs the worktree database during development startup and refuses unconfigured production startup", async () => {
    const checkouts = await createGitCheckouts();
    try {
      const engine = await startEngine({ cwd: checkouts.main });
      try {
        expect(engine.output()).toContain(databaseFile(checkouts.main));
      } finally {
        await engine.stop();
      }

      const production = await runNodeScript(engineMain, [], {
        cwd: checkouts.main,
        env: commandEnv(),
      });
      expect(production.code).not.toBe(0);
      expect(production.output).toMatch(/production database/i);
    } finally {
      await checkouts.dispose();
    }
  });
});
