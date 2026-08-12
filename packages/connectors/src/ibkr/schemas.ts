import * as Schema from "effect/Schema";

export const IbkrFlexCredentials = Schema.Struct({
  token: Schema.NonEmptyTrimmedString,
  queryId: Schema.NonEmptyTrimmedString,
});
export type IbkrFlexCredentials = typeof IbkrFlexCredentials.Type;

/** Attributes collected from the small subset of Flex XML used by this connector. */
export const IbkrFlexAccountInformation = Schema.Struct({
  accountId: Schema.optional(Schema.String),
  acctAlias: Schema.optional(Schema.String),
  currency: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
});
export type IbkrFlexAccountInformation = typeof IbkrFlexAccountInformation.Type;

export const IbkrFlexOpenPosition = Schema.Struct({
  accountId: Schema.optional(Schema.String),
  currency: Schema.optional(Schema.String),
  assetCategory: Schema.optional(Schema.String),
  symbol: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  conid: Schema.optional(Schema.String),
  securityID: Schema.optional(Schema.String),
  securityIDType: Schema.optional(Schema.String),
  cusip: Schema.optional(Schema.String),
  isin: Schema.optional(Schema.String),
  figi: Schema.optional(Schema.String),
  position: Schema.optional(Schema.String),
  multiplier: Schema.optional(Schema.String),
  levelOfDetail: Schema.optional(Schema.String),
});
export type IbkrFlexOpenPosition = typeof IbkrFlexOpenPosition.Type;

export const IbkrFlexCashReportCurrency = Schema.Struct({
  accountId: Schema.optional(Schema.String),
  currency: Schema.optional(Schema.String),
  endingCash: Schema.optional(Schema.String),
});
export type IbkrFlexCashReportCurrency = typeof IbkrFlexCashReportCurrency.Type;

export const IbkrFlexStatement = Schema.Struct({
  accountId: Schema.optional(Schema.String),
  accountInformation: Schema.optional(IbkrFlexAccountInformation),
  hasOpenPositions: Schema.Boolean,
  hasCashReport: Schema.Boolean,
  openPositions: Schema.Array(IbkrFlexOpenPosition),
  cashReportCurrencies: Schema.Array(IbkrFlexCashReportCurrency),
});
export type IbkrFlexStatement = typeof IbkrFlexStatement.Type;

export const IbkrFlexResponseEnvelope = Schema.Struct({
  status: Schema.optional(Schema.String),
  referenceCode: Schema.optional(Schema.String),
  errorCode: Schema.optional(Schema.String),
  errorMessage: Schema.optional(Schema.String),
});
export type IbkrFlexResponseEnvelope = typeof IbkrFlexResponseEnvelope.Type;
