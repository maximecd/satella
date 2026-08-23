import * as Schema from "effect/Schema";

const MAX_ERROR_DETAIL_LENGTH = 500;

const isText = Schema.is(Schema.String);
const isScalar = Schema.is(Schema.Union([Schema.Number, Schema.Boolean]));
const decodeResponseRecord = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Unknown),
);

const scalarDetail = (cause: unknown): string | null => {
  if (isText(cause) || isScalar(cause)) return String(cause);
  if (Array.isArray(cause)) {
    const items = cause
      .map(scalarDetail)
      .filter((item): item is string => item !== null)
      .join(", ");
    return items.length > 0 ? items : null;
  }
  return null;
};

/**
 * Renders a provider error response body as a compact diagnostic string.
 * Only response payload content may be passed here; never request credentials.
 */
export const describeErrorBody = (cause: unknown): string => {
  if (cause === undefined || cause === null) return "";
  let text: string;
  if (isText(cause)) {
    text = cause;
  } else {
    const record = decodeResponseRecord(cause);
    if (record._tag === "Some") {
      const parts: Array<string> = [];
      for (const [key, value] of Object.entries(record.value)) {
        const detail = scalarDetail(value);
        if (detail !== null && detail.trim().length > 0) parts.push(`${key}=${detail.trim()}`);
      }
      text = parts.join(", ");
    } else if (Array.isArray(cause)) {
      text = scalarDetail(cause) ?? "";
    } else {
      text = "";
    }
  }
  text = text.trim();
  if (text.length === 0) return "";
  return ` ${
    text.length > MAX_ERROR_DETAIL_LENGTH ? `${text.slice(0, MAX_ERROR_DETAIL_LENGTH)}…` : text
  }`;
};
