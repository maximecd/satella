import * as Schema from "effect/Schema";

const MAX_ERROR_DETAIL_LENGTH = 500;

const isText = Schema.is(Schema.String);
const isScalar = Schema.is(Schema.Union([Schema.Number, Schema.Boolean]));
const decodeResponseRecord = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Unknown),
);

const responseDetails = (cause: unknown, path = ""): ReadonlyArray<string> => {
  if (isText(cause) || isScalar(cause)) {
    const value = String(cause).trim();
    return value.length === 0 ? [] : [path.length === 0 ? value : `${path}=${value}`];
  }
  if (Array.isArray(cause)) {
    return cause.flatMap((value, index) =>
      responseDetails(value, path.length === 0 ? `[${index}]` : `${path}[${index}]`),
    );
  }
  const record = decodeResponseRecord(cause);
  if (record._tag === "None") return [];
  return Object.entries(record.value).flatMap(([key, value]) =>
    responseDetails(value, path.length === 0 ? key : `${path}.${key}`),
  );
};

/**
 * Renders a provider error response body as a compact diagnostic string.
 * Only response payload content may be passed here; never request credentials.
 */
export const describeErrorBody = (cause: unknown): string => {
  if (cause === undefined || cause === null) return "";
  const text = responseDetails(cause).join(", ").trim();
  if (text.length === 0) return "";
  return ` ${
    text.length > MAX_ERROR_DETAIL_LENGTH ? `${text.slice(0, MAX_ERROR_DETAIL_LENGTH)}…` : text
  }`;
};
