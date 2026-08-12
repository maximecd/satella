import * as Schema from "effect/Schema";

export const OkxRegion = Schema.Literal("global", "eea", "us");
export type OkxRegion = typeof OkxRegion.Type;

export const OkxCredentials = Schema.Struct({
  apiKey: Schema.NonEmptyTrimmedString,
  secretKey: Schema.NonEmptyTrimmedString,
  passphrase: Schema.NonEmptyTrimmedString,
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
