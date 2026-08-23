import * as Schema from "effect/Schema";

export const TradeRepublicCredentials = Schema.Struct({
  phone: Schema.Trim.check(Schema.isNonEmpty()),
  pin: Schema.String.check(Schema.isPattern(/^\d{4,}$/)),
});
export type TradeRepublicCredentials = typeof TradeRepublicCredentials.Type;

export const TradeRepublicSession = Schema.Struct({
  sessionToken: Schema.Trim.check(Schema.isNonEmpty()),
  refreshToken: Schema.Trim.check(Schema.isNonEmpty()),
});
export type TradeRepublicSession = typeof TradeRepublicSession.Type;

export const TradeRepublicStoredCredentials = Schema.Union([
  TradeRepublicSession,
  Schema.Struct({
    sessionToken: Schema.Trim.check(Schema.isNonEmpty()),
    refreshToken: Schema.Trim.check(Schema.isNonEmpty()),
    deviceId: Schema.optional(Schema.String),
  }),
]);
export type TradeRepublicStoredCredentials = typeof TradeRepublicStoredCredentials.Type;
