import * as Schema from "effect/Schema";

export const KrakenCredentials = Schema.Struct({
  apiKey: Schema.Trim.check(Schema.isNonEmpty()),
  apiSecret: Schema.Trim.check(Schema.isNonEmpty()),
});
export type KrakenCredentials = typeof KrakenCredentials.Type;

/** `/0/private/Balance` maps Kraken asset codes (e.g. `XXBT`, `ETH2.S`) to balance strings. */
export const KrakenBalanceResponse = Schema.Struct({
  error: Schema.Array(Schema.String),
  result: Schema.NullOr(Schema.Record(Schema.String, Schema.String)),
});

/** `/0/private/Earn/Strategies` lists the earn products with their lock type. */
export const KrakenEarnStrategiesResponse = Schema.Struct({
  error: Schema.Array(Schema.String),
  result: Schema.NullOr(
    Schema.Struct({
      items: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          lock_type: Schema.Struct({
            type: Schema.Literals(["flex", "bonded", "instant", "timed"]),
          }),
        }),
      ),
    }),
  ),
});

/** `/0/private/Earn/Allocations` lists one entry per Earn strategy allocation. */
export const KrakenEarnAllocationsResponse = Schema.Struct({
  error: Schema.Array(Schema.String),
  result: Schema.NullOr(
    Schema.Struct({
      items: Schema.Array(
        Schema.Struct({
          strategy_id: Schema.optional(Schema.String),
          native_asset: Schema.String,
          amount_allocated: Schema.Struct({
            total: Schema.Struct({
              native: Schema.String,
            }),
          }),
        }),
      ),
    }),
  ),
});
