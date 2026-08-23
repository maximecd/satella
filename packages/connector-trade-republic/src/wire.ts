import * as Schema from "effect/Schema";

export type TradeRepublicJsonValue =
  | string
  | number
  | boolean
  | null
  | TradeRepublicJsonObject
  | ReadonlyArray<TradeRepublicJsonValue>;

export interface TradeRepublicJsonObject {
  readonly [key: string]: TradeRepublicJsonValue;
}

export const isTradeRepublicJsonString = Schema.is(Schema.String);
export const isTradeRepublicJsonNumber = Schema.is(Schema.Number);

export const isTradeRepublicJsonObject = (
  value: TradeRepublicJsonValue | undefined,
): value is TradeRepublicJsonObject =>
  value !== null && Object.prototype.toString.call(value) === "[object Object]";
