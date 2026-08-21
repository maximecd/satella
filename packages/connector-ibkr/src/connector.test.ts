import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  IbkrConnector,
  makeIbkrConnector,
  type IbkrHttpRequest,
  type IbkrHttpResponse,
  type IbkrHttpTransport,
  parseFlexXml,
} from "./index.js";

const credentials = { token: "synthetic-token", queryId: "987654" };

const response = (body: string, status = 200): IbkrHttpResponse => ({
  status,
  headers: { "content-type": "application/xml" },
  body,
});

const report = `<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse type="AF" version="3">
  <FlexStatements count="1">
    <FlexStatement accountId="U123456" toDate="20260811">
      <AccountInformation accountId="U123456" name="Maxime Example" acctAlias="PEA" currency="USD" />
      <CashReport>
        <CashReportCurrency accountId="U123456" currency="USD" endingCash="100.50" />
        <CashReportCurrency accountId="U123456" currency="EUR" endingCash="-2" />
        <CashReportCurrency accountId="U123456" currency="BASE_SUMMARY" endingCash="98.50" />
      </CashReport>
      <OpenPositions>
        <OpenPosition accountId="U123456" assetCategory="STK" symbol="AAPL" description="Apple &amp; Co" conid="265598" currency="USD" position="2" costBasisPrice="150.25" costBasisMoney="300.50" fifoPnlUnrealized="12.34" levelOfDetail="Summary" isin="US0378331005" securityIDType="ISIN" securityID="US0378331005" />
        <OpenPosition accountId="U123456" assetCategory="FUND" symbol="VWCE" description="Vanguard FTSE" conid="400" position="5" levelOfDetail="Summary" />
        <OpenPosition accountId="U123456" assetCategory="BOND" symbol="US10Y" description="US Treasury" conid="500" position="10" levelOfDetail="Summary" />
        <OpenPosition accountId="U123456" assetCategory="OPT" symbol="AAPL  260918C00200000" description="Apple call" conid="111" position="-1" levelOfDetail="Summary" multiplier="100" />
        <OpenPosition accountId="U123456" assetCategory="FUT" symbol="ES" description="E-mini S&amp;P" conid="600" position="1" levelOfDetail="Summary" />
        <OpenPosition accountId="U123456" assetCategory="CMDTY" symbol="XAUUSD" description="Gold" conid="700" position="2" levelOfDetail="Summary" />
        <OpenPosition accountId="U123456" assetCategory="EVENT_FORECASTX" symbol="EVT" description="Forecast" conid="800" position="3" levelOfDetail="Summary" />
        <OpenPosition accountId="U123456" assetCategory="CASH" currency="USD" position="100.50" />
      </OpenPositions>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>`;

const emptyReport = `<FlexQueryResponse type="AF"><FlexStatements><FlexStatement accountId="UEMPTY" toDate="2026-08-11"><AccountInformation accountId="UEMPTY" currency="USD" /><CashReport><CashReportCurrency accountId="UEMPTY" currency="USD" endingCash="0" /></CashReport><OpenPositions /></FlexStatement></FlexStatements></FlexQueryResponse>`;

describe("IBKR Flex connector", () => {
  it("uses SendRequest once, polls GetStatement, and maps a complete Activity report", async () => {
    const requests: IbkrHttpRequest[] = [];
    const sleeps: number[] = [];
    let statementAttempts = 0;
    const transport: IbkrHttpTransport = {
      request: (request) => {
        requests.push(request);
        if (request.path.endsWith("SendRequest")) {
          return Effect.succeed(
            response(
              '<FlexStatementResponse timestamp="28 August, 2012 10:37 AM EDT"><Status>Success</Status><ReferenceCode>1234567890</ReferenceCode><url>https://legacy.invalid/should-not-be-used</url></FlexStatementResponse>',
            ),
          );
        }
        statementAttempts += 1;
        if (statementAttempts === 1) {
          return Effect.succeed(
            response(
              "<FlexStatementResponse><Status>Fail</Status><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress.</ErrorMessage></FlexStatementResponse>",
            ),
          );
        }
        return Effect.succeed(response(report));
      },
    };

    const authenticated = await Effect.runPromise(
      makeIbkrConnector({
        transportFactory: () => transport,
        pollDelayMs: 0,
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          return Effect.void;
        },
      }).authenticate(credentials),
    );
    const accounts = await Effect.runPromise(authenticated.fetchAccounts());

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      path: "/AccountManagement/FlexWebService/SendRequest",
      query: { t: "synthetic-token", q: "987654", v: "3" },
      headers: { "User-Agent": expect.any(String) },
    });
    expect(requests[1]).toMatchObject({
      path: "/AccountManagement/FlexWebService/GetStatement",
      query: { t: "synthetic-token", q: "1234567890", v: "3" },
    });
    expect(sleeps).toEqual([0]);
    expect(accounts).toEqual([
      {
        externalId: "U123456",
        name: "PEA (U123456)",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "ibkr:currency:USD",
              assetCategory: "cash",
              name: "USD",
              symbol: "USD",
              identifiers: [{ type: "iso_currency", value: "USD" }],
            },
            quantity: "100.5",
          },
          {
            asset: {
              externalId: "ibkr:currency:EUR",
              assetCategory: "cash",
              name: "EUR",
              symbol: "EUR",
              identifiers: [{ type: "iso_currency", value: "EUR" }],
            },
            quantity: "-2",
          },
          {
            asset: {
              externalId: "ibkr:conid:265598",
              assetCategory: "stocks_etfs",
              name: "Apple & Co",
              symbol: "AAPL",
              identifiers: [
                { type: "ibkr_conid", value: "265598" },
                { type: "isin", value: "US0378331005" },
              ],
            },
            quantity: "2",
            averageUnitPurchasePrice: { price: "150.25", currencyIso: "USD" },
          },
          {
            asset: {
              externalId: "ibkr:conid:400",
              assetCategory: "stocks_etfs",
              name: "Vanguard FTSE",
              symbol: "VWCE",
              identifiers: [{ type: "ibkr_conid", value: "400" }],
            },
            quantity: "5",
          },
          {
            asset: {
              externalId: "ibkr:conid:500",
              assetCategory: "other",
              name: "US Treasury",
              identifiers: [{ type: "ibkr_conid", value: "500" }],
            },
            quantity: "10",
          },
          {
            asset: {
              externalId: "ibkr:conid:111",
              assetCategory: "other",
              name: "Apple call",
              identifiers: [{ type: "ibkr_conid", value: "111" }],
            },
            quantity: "-1",
          },
          {
            asset: {
              externalId: "ibkr:conid:600",
              assetCategory: "other",
              name: "E-mini S&P",
              identifiers: [{ type: "ibkr_conid", value: "600" }],
            },
            quantity: "1",
          },
          {
            asset: {
              externalId: "ibkr:conid:700",
              assetCategory: "other",
              name: "Gold",
              identifiers: [{ type: "ibkr_conid", value: "700" }],
            },
            quantity: "2",
          },
          {
            asset: {
              externalId: "ibkr:conid:800",
              assetCategory: "other",
              name: "Forecast",
              identifiers: [{ type: "ibkr_conid", value: "800" }],
            },
            quantity: "3",
          },
        ],
      },
    ]);
  });

  it("keeps a valid zero-balance account and maps BASE_SUMMARY-only cash", async () => {
    const transport: IbkrHttpTransport = {
      request: (request) =>
        Effect.succeed(
          response(
            request.path.endsWith("SendRequest")
              ? "<FlexStatementResponse><Status>Success</Status><ReferenceCode>1</ReferenceCode></FlexStatementResponse>"
              : emptyReport,
          ),
        ),
    };
    const authenticated = await Effect.runPromise(
      makeIbkrConnector({ transportFactory: () => transport }).authenticate(credentials),
    );
    await expect(Effect.runPromise(authenticated.fetchAccounts())).resolves.toEqual([
      {
        externalId: "UEMPTY",
        name: "UEMPTY",
        baseCurrencyIso: "USD",
        positions: [],
      },
    ]);

    const baseSummaryReport = emptyReport.replace(
      '<CashReportCurrency accountId="UEMPTY" currency="USD" endingCash="0" />',
      '<CashReportCurrency accountId="UEMPTY" currency="BASE_SUMMARY" endingCash="98.50" />',
    );
    const parsed = parseFlexXml(baseSummaryReport);
    expect(parsed.kind).toBe("report");
    const baseSummaryTransport: IbkrHttpTransport = {
      request: (request) =>
        Effect.succeed(
          response(
            request.path.endsWith("SendRequest")
              ? "<FlexStatementResponse><Status>Success</Status><ReferenceCode>1</ReferenceCode></FlexStatementResponse>"
              : baseSummaryReport,
          ),
        ),
    };
    const baseSummaryAuthenticated = await Effect.runPromise(
      makeIbkrConnector({ transportFactory: () => baseSummaryTransport }).authenticate(credentials),
    );
    await expect(Effect.runPromise(baseSummaryAuthenticated.fetchAccounts())).resolves.toEqual([
      {
        externalId: "UEMPTY",
        name: "UEMPTY",
        baseCurrencyIso: "USD",
        positions: [
          {
            asset: {
              externalId: "ibkr:currency:USD",
              assetCategory: "cash",
              name: "USD",
              symbol: "USD",
              identifiers: [{ type: "iso_currency", value: "USD" }],
            },
            quantity: "98.5",
          },
        ],
      },
    ]);
  });

  it("rejects unsafe XML and exposes the two setup fields", () => {
    expect(() => parseFlexXml('<!DOCTYPE x [<!ENTITY y "z">]><FlexQueryResponse />')).toThrow(
      "DTD",
    );
    expect(IbkrConnector.assetCategories).toEqual(["stocks_etfs", "crypto", "cash", "other"]);
    expect(IbkrConnector.credentialFields.map(({ key, kind }) => [key, kind])).toEqual([
      ["token", "password"],
      ["queryId", "text"],
    ]);
    expect(IbkrConnector.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(IbkrConnector.instructions).toMatch(/\|\s*Cash Report\s*\|\s*Currency Breakout\s*\|/);
  });

  it("maps documented Flex authentication errors without exposing provider details", async () => {
    const transport: IbkrHttpTransport = {
      request: (request) =>
        Effect.succeed(
          response(
            request.path.endsWith("SendRequest")
              ? "<FlexStatementResponse><Status>Fail</Status><ErrorCode>1015</ErrorCode><ErrorMessage>Token is invalid.</ErrorMessage></FlexStatementResponse>"
              : "",
          ),
        ),
    };

    await expect(
      Effect.runPromise(
        makeIbkrConnector({ transportFactory: () => transport }).authenticate(credentials),
      ),
    ).rejects.toThrow("IBKR rejected the Flex report request");
  });
});
