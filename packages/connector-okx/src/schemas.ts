import * as Schema from "effect/Schema";

export const OkxRegion = Schema.Literals(["global", "eea", "us"]);
export type OkxRegion = typeof OkxRegion.Type;

export const OkxCredentials = Schema.Struct({
  apiKey: Schema.Trim.check(Schema.isNonEmpty()),
  secretKey: Schema.Trim.check(Schema.isNonEmpty()),
  passphrase: Schema.Trim.check(Schema.isNonEmpty()),
  region: OkxRegion,
});
export type OkxCredentials = typeof OkxCredentials.Type;

export const OkxEnvelope = Schema.Struct({
  code: Schema.String,
  msg: Schema.String,
});

export const OkxTimeResponse = Schema.Struct({
  code: Schema.String,
  msg: Schema.String,
  data: Schema.Array(
    Schema.Struct({
      ts: Schema.String,
    }),
  ),
});

export const OkxConfigResponse = Schema.Struct({
  code: Schema.String,
  msg: Schema.String,
  data: Schema.Array(Schema.Unknown),
});

export const OkxTradingBalanceResponse = Schema.Struct({
  code: Schema.String,
  msg: Schema.String,
  data: Schema.Array(
    Schema.Struct({
      details: Schema.Array(
        Schema.Struct({
          ccy: Schema.String,
          cashBal: Schema.String,
          spotBal: Schema.optional(Schema.String),
          openAvgPx: Schema.optional(Schema.String),
          accAvgPx: Schema.optional(Schema.String),
          spotUpl: Schema.optional(Schema.String),
          spotUplRatio: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
});

export const OkxFundingBalanceResponse = Schema.Struct({
  code: Schema.String,
  msg: Schema.String,
  data: Schema.Array(
    Schema.Struct({
      ccy: Schema.String,
      bal: Schema.String,
    }),
  ),
});

/** Simple Earn Flexible balances returned by the OKX savings API. */
export const OkxEarnBalanceResponse = Schema.Struct({
  code: Schema.String,
  msg: Schema.String,
  data: Schema.Array(
    Schema.Struct({
      ccy: Schema.String,
      amt: Schema.String,
    }),
  ),
});
