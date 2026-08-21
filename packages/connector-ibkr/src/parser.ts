import { SaxesParser, type SaxesTagPlain } from "saxes";
import * as Schema from "effect/Schema";

import {
  IbkrFlexAccountInformation,
  IbkrFlexCashReportCurrency,
  IbkrFlexOpenPosition,
  IbkrFlexResponseEnvelope,
  IbkrFlexStatement,
  type IbkrFlexAccountInformation as AccountInformation,
  type IbkrFlexCashReportCurrency as CashReportCurrency,
  type IbkrFlexOpenPosition as OpenPosition,
  type IbkrFlexResponseEnvelope as ResponseEnvelope,
  type IbkrFlexStatement as FlexStatement,
} from "./schemas.js";

export const DEFAULT_MAX_FLEX_XML_BYTES = 8 * 1024 * 1024;

export type ParsedFlexDocument =
  | {
      readonly kind: "response";
      readonly envelope: ResponseEnvelope;
    }
  | {
      readonly kind: "report";
      readonly reportType?: string;
      readonly statements: ReadonlyArray<FlexStatement>;
    };

const asAttributes = (tag: SaxesTagPlain): Readonly<Record<string, string>> => tag.attributes;

const normalizedXmlName = (name: string): string => name.replace(/[-_:]/g, "").toLowerCase();

const optionalAttribute = (attributes: Readonly<Record<string, string>>, name: string) => {
  const key = Object.keys(attributes).find(
    (candidate) => normalizedXmlName(candidate) === normalizedXmlName(name),
  );
  const value = key === undefined ? undefined : attributes[key];
  return value === undefined ? undefined : value;
};

const decode = <A, Input>(schema: Schema.Codec<A>, input: Input): A =>
  Schema.decodeUnknownSync(schema)(input);

const parseAttributeRecord = <A>(
  attributes: Readonly<Record<string, string>>,
  schema: Schema.Codec<A>,
): A => decode(schema, attributes);

const parserError = (message: string): Error => new Error(`IBKR Flex XML ${message}`);

/**
 * Extracts only the Flex elements needed for reconciliation. The parser is
 * intentionally bounded and rejects XML features that could expand external
 * entities or create a general-purpose object graph.
 */
export const parseFlexXml = (
  xml: string,
  maxBytes = DEFAULT_MAX_FLEX_XML_BYTES,
): ParsedFlexDocument => {
  if (Buffer.byteLength(xml, "utf8") > maxBytes) throw parserError("response is too large");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw parserError("DTD and custom entities are not supported");
  }

  let rootName: string | undefined;
  let rootAttributes: Readonly<Record<string, string>> = {};
  let responseText: Record<string, string> = {};
  const statements: Array<{
    readonly attributes: Readonly<Record<string, string>>;
    accountInformation?: AccountInformation;
    hasOpenPositions: boolean;
    hasCashReport: boolean;
    readonly openPositions: OpenPosition[];
    readonly cashReportCurrencies: CashReportCurrency[];
  }> = [];
  let currentStatement:
    | {
        readonly attributes: Readonly<Record<string, string>>;
        accountInformation?: AccountInformation;
        hasOpenPositions: boolean;
        hasCashReport: boolean;
        readonly openPositions: OpenPosition[];
        readonly cashReportCurrencies: CashReportCurrency[];
      }
    | undefined;
  const stack: string[] = [];
  const textStack: string[] = [];
  let parseFailure: Error | undefined;

  const parser = new SaxesParser({ xmlns: false, fragment: false, position: false });
  parser.on("opentag", (tag) => {
    if (parseFailure !== undefined) return;
    const attributes = asAttributes(tag);
    if (stack.length === 0) {
      rootName = tag.name;
      rootAttributes = attributes;
    }
    stack.push(tag.name);
    textStack.push("");

    if (tag.name === "FlexStatement") {
      if (currentStatement !== undefined) {
        parseFailure = parserError("contains nested statements");
        return;
      }
      const statement = {
        attributes,
        hasOpenPositions: false,
        hasCashReport: false,
        openPositions: [],
        cashReportCurrencies: [],
      };
      statements.push(statement);
      currentStatement = statement;
      return;
    }
    if (currentStatement === undefined) return;
    if (tag.name === "OpenPositions") {
      currentStatement.hasOpenPositions = true;
    } else if (tag.name === "CashReport") {
      currentStatement.hasCashReport = true;
    } else if (tag.name === "AccountInformation") {
      if (currentStatement.accountInformation !== undefined) {
        parseFailure = parserError("contains duplicate AccountInformation sections");
        return;
      }
      currentStatement.accountInformation = parseAttributeRecord(
        attributes,
        IbkrFlexAccountInformation,
      );
    } else if (tag.name === "OpenPosition") {
      currentStatement.openPositions.push(parseAttributeRecord(attributes, IbkrFlexOpenPosition));
    } else if (tag.name === "CashReportCurrency") {
      currentStatement.cashReportCurrencies.push(
        parseAttributeRecord(attributes, IbkrFlexCashReportCurrency),
      );
    }
  });
  parser.on("text", (text) => {
    if (textStack.length > 0) textStack[textStack.length - 1] += text;
  });
  parser.on("cdata", (text) => {
    if (textStack.length > 0) textStack[textStack.length - 1] += text;
  });
  parser.on("closetag", (tag) => {
    const name = tag.name;
    const text = textStack.pop()?.trim() ?? "";
    stack.pop();
    if (stack.length === 1 && text !== "") responseText[normalizedXmlName(name)] = text;
    if (name === "FlexStatement") currentStatement = undefined;
  });
  parser.on("doctype", () => {
    parseFailure = parserError("DTD is not supported");
  });
  parser.on("error", (error) => {
    parseFailure = parserError("is malformed");
    // saxes requires an error handler; clear the parser's error state so close
    // can complete and we can return a provider-neutral message.
    void error;
  });

  try {
    parser.write(xml).close();
  } catch {
    throw parserError("is malformed");
  }
  if (parseFailure !== undefined) throw parseFailure;
  if (rootName === undefined) throw parserError("is empty");

  if (rootName === "FlexStatementResponse") {
    const status = optionalAttribute(rootAttributes, "status") ?? responseText.status;
    const referenceCode =
      optionalAttribute(rootAttributes, "referenceCode") ?? responseText.referencecode;
    const errorCode = optionalAttribute(rootAttributes, "errorCode") ?? responseText.errorcode;
    const errorMessage =
      optionalAttribute(rootAttributes, "errorMessage") ?? responseText.errormessage;
    const envelopeInput: Record<string, string> = {};
    if (status !== undefined) Object.assign(envelopeInput, { status });
    if (referenceCode !== undefined) Object.assign(envelopeInput, { referenceCode });
    if (errorCode !== undefined) Object.assign(envelopeInput, { errorCode });
    if (errorMessage !== undefined) Object.assign(envelopeInput, { errorMessage });
    return {
      kind: "response",
      envelope: decode(IbkrFlexResponseEnvelope, envelopeInput),
    };
  }
  if (rootName !== "FlexQueryResponse") throw parserError("has an unexpected root element");
  const reportType = optionalAttribute(rootAttributes, "type");
  if (reportType === undefined || reportType.trim().toUpperCase() !== "AF") {
    throw parserError("is not an Activity Flex report");
  }
  if (statements.length === 0) throw parserError("contains no FlexStatement elements");
  return {
    kind: "report",
    reportType,
    statements: statements.map((statement) =>
      decode(
        IbkrFlexStatement,
        Object.assign(
          {
            hasOpenPositions: statement.hasOpenPositions,
            hasCashReport: statement.hasCashReport,
            openPositions: statement.openPositions,
            cashReportCurrencies: statement.cashReportCurrencies,
          },
          statement.attributes.accountId === undefined
            ? {}
            : { accountId: statement.attributes.accountId },
          statement.accountInformation === undefined
            ? {}
            : { accountInformation: statement.accountInformation },
        ),
      ),
    ),
  };
};
