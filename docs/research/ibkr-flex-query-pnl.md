# Interactive Brokers Flex Query P&L

Research date: 2026-08-17

## Answer

Yes. IBKR **Activity Flex Queries** can return both realized and unrealized P&L. The current branch’s documented query only requests Account Information, Open Positions without P&L fields, and Cash Report, so the absence of P&L is expected. Flex Web Service does not add fields dynamically: it runs the sections and fields saved in the Client Portal query template ([Create an Activity Flex Query](https://www.ibkrguides.com/clientportal/performanceandstatements/activityflex.htm), [Flex Web Service introduction](https://www.interactivebrokers.com/docs/web-api/flex-web-service/flex-web-service/introduction)).

## Sections and fields

| Need | Activity Flex section | Relevant fields/settings |
| --- | --- | --- |
| Realized and unrealized P&L by symbol/underlying | **Realized and Unrealized Performance Summary in Base** | `Realized Short Term Profit`, `Realized Short Term Loss`, `Realized Long Term Profit`, `Realized Long Term Loss`, `Total Realized PNL`, `Unrealized Profit`, `Unrealized Loss`, `Unrealized Short Term/Long Term Profit/Loss`, `Total Unrealized PNL`, `Total FIFO PNL`. IBKR matches closing lots using a selected method such as FIFO, LIFO, Average Cost, or Specific Lot ([reference](https://www.ibkrguides.com/reportingreference/reportguide/realized%20and%20unrealized%20performance%20summary%20in%20basefq.htm)). |
| Unrealized P&L on open holdings as of the report date | **Open Positions** | `Report Date`, `Mark Price`, `Position Value`, `Cost Basis Money`, `FIFO Unrealized PNL`; choose `Summary` or `Lot` level of detail ([reference](https://www.ibkrguides.com/reportingreference/reportguide/open%20positionsfq.htm)). |
| Realized P&L for closed trades | **Trades** | `Open/Close Indicator`, `Proceeds`, `IB Commission`, `Cost Basis`, `Realized PNL`, and optionally `MTM PNL`; use `Closed Lots` when lot-level results are needed. IBKR says these P&L values are shown for realized/closed trades and commissions are netted for realized P&L ([reference](https://www.ibkrguides.com/reportingreference/reportguide/tradesfq.htm)). |
| Period-level realized P&L and change in unrealized P&L | **Change in NAV** | Set **Mode** to `Realized & Unrealized`; select `From Date`, `To Date`, `Realized`, and `Change in Unrealized` ([reference](https://www.ibkrguides.com/reportingreference/reportguide/changeinnav_fq.htm)). `Change in Unrealized` is a period change, not the ending unrealized balance. |
| MTD/YTD realized totals | **Month and Year to Date Performance Summary in Base** | `Realized S/T MTD/YTD`, `Realized L/T MTD/YTD` (plus MTM fields). These values are only available through the last business day and roll forward at month-end ([reference](https://www.ibkrguides.com/reportingreference/reportguide/month%20and%20year%20to%20date%20performance%20summary%20in%20basefq.htm)). |

For this branch, the smallest useful test is to edit the existing **Activity** query and add **Realized and Unrealized Performance Summary in Base**. Add `FIFO Unrealized PNL` to **Open Positions** if the desired output is one unrealized value per open position. Keep XML enabled so the connector receives the selected fields.

## Report type and configuration

- Use an **Activity Flex Query** for portfolio-level realized/unrealized P&L and open-position P&L. A **Trade Confirmation Flex Query** is an execution/confirmation report; its current field reference lists trade confirmation and allocation fields, not the Activity P&L summary or open-position fields ([Trade Confirmation Flex Query reference](https://www.ibkrguides.com/reportingreference/reportguide/trade%20confirmation%20flex%20query%20reference.htm), [Trade Confirmation Configuration](https://www.ibkrguides.com/reportingreference/reportguide/trade%20confirmation%20configuration.htm)). IBKR has also documented a base-currency P&L option for Activity and Trade Confirmation Flex reports, so verify the available P&L/base-currency choice in the Client Portal query’s General Configuration ([2018 release note](https://www.interactivebrokers.com/en/general/statements-notes-2018.php)).
- Sections, selected fields, account selection, output format, period, and other P&L/report options are configured in the saved query template. Current Activity Flex periods include Last Business Day, Last Business Week, Last Month, Last Quarter, Last 30/365 Calendar Days, Last N Calendar Days, MTD, QTD, and YTD ([Create an Activity Flex Query](https://www.ibkrguides.com/clientportal/performanceandstatements/activityflex.htm)).
- The Web Service request has no field or date arguments. Generate with `GET /SendRequest?t={CurrentToken}&q={QueryID}&v=3`, then retrieve with `GET /GetStatement?t={AccessToken}&q={ReferenceCode}&v=3`; `q` is the saved Query ID on the first call and the generated report’s ReferenceCode on the second. Include a `User-Agent` header ([generate](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/generate-a-report), [SendRequest parameters](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/make-request-to-send-request), [GetStatement parameters](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/make-request-to-get-statement)).

## Timing and period caveats

- Activity Flex data is updated once daily at close of business. A Last Business Day query normally needs to be retrieved on the following day; it is not an intraday/live P&L feed ([Flex Web Service usage notes](https://www.interactivebrokers.com/docs/web-api/flex-web-service/flex-web-service/introduction)).
- Position P&L is as of the report’s ending `Report Date`; period P&L must be interpreted with its `From Date`/`To Date`. MTD/YTD summary values are as of the last business day, not necessarily the calendar date on which the request is made.
- Avoid `Last N Calendar Days` through the Web Service unless its maximum-duration behavior is intended: IBKR says variable-duration queries use the maximum possible days for a request. Prefer a precise period such as Last Month, Last Quarter, or Year to Date ([Flex Web Service usage notes](https://www.interactivebrokers.com/docs/web-api/flex-web-service/flex-web-service/introduction)).

## Repository implication

The existing query instructions in `packages/connector-ibkr/src/instructions.md`
explained why P&L was missing. The connector now requests and consumes the
Summary row's `Cost Basis Price` as Optimus' `averageUnitPurchasePrice`; the
existing Finance P&L calculation then derives current P&L. IBKR's
`FIFO Unrealized PNL` remains report-only because its FIFO semantics are not the
same as Optimus' acquisition-cost formula.
