import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseConfigFromDirectory, makeDatabaseLive } from "@engine/database";
import {
  normalizeConnectorAccounts,
  reconcileConnectorAccounts,
} from "@engine/finance/connector-service";
import * as Finance from "@engine/finance/service";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const accounts = [
  {
    externalId: "trading",
    name: "Trading",
    baseCurrencyIso: "USD",
    positions: [
      {
        asset: {
          externalId: "okx:currency:BTC",
          assetClass: "crypto" as const,
          name: "BTC",
          symbol: "BTC",
          identifiers: [{ type: "okx_currency", value: "BTC" }],
        },
        quantity: 1.5,
      },
    ],
  },
  {
    externalId: "funding",
    name: "Funding",
    baseCurrencyIso: "USD",
    positions: [],
  },
] as const;

describe("connector service bridge", () => {
  it("keeps nested connector accounts until atomic reconciliation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-connector-service-"));
    directories.push(directory);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const timestamp = new Date().toISOString();
          yield* sql`INSERT INTO custodians (id, name, management_mode, created_at, updated_at)
            VALUES ('okx', 'OKX', 'synced', ${timestamp}, ${timestamp})`;
          yield* sql`INSERT INTO custodian_connectors
            (custodian_id, connector_id, config_json, created_at, updated_at)
            VALUES ('okx', 'okx', '{}', ${timestamp}, ${timestamp})`;
          const reconciliation = yield* reconcileConnectorAccounts("okx", accounts);
          return { reconciliation, custodian: yield* Finance.getCustodian("okx") };
        }).pipe(
          Effect.provide(
            makeDatabaseLive().pipe(Layer.provide(DatabaseConfigFromDirectory(directory))),
          ),
        ),
      ),
    );

    expect(result.reconciliation).toEqual({
      accountCount: 2,
      positionCount: 1,
      zeroedPositionCount: 0,
      removedAccountCount: 0,
    });
    expect(result.custodian.accounts.map(({ name }) => name).sort()).toEqual([
      "Funding",
      "Trading",
    ]);
    expect(
      result.custodian.accounts.map(({ connectorAccountId }) => connectorAccountId).sort(),
    ).toEqual(["funding", "trading"]);
  });

  it("rejects conflicting definitions for one connector asset", async () => {
    await expect(
      Effect.runPromise(
        normalizeConnectorAccounts([
          {
            externalId: "one",
            name: "One",
            baseCurrencyIso: "USD",
            positions: [
              {
                asset: {
                  externalId: "same",
                  assetClass: "crypto",
                  name: "BTC",
                  identifiers: [{ type: "okx_currency", value: "BTC" }],
                },
                quantity: 1,
              },
            ],
          },
          {
            externalId: "two",
            name: "Two",
            baseCurrencyIso: "USD",
            positions: [
              {
                asset: {
                  externalId: "same",
                  assetClass: "crypto",
                  name: "Bitcoin",
                  identifiers: [{ type: "okx_currency", value: "BTC" }],
                },
                quantity: 1,
              },
            ],
          },
        ]),
      ),
    ).rejects.toThrow("conflicting definitions");
  });
});
