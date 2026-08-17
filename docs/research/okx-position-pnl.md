# OKX position acquisition cost and P&L

Research date: 2026-08-17

## Conclusion

OKX can provide reliable **current-position** acquisition data and unrealized P&L for margin and derivatives. The private `GET /api/v5/account/positions` endpoint returns one row per instrument/position side with `avgPx`, `markPx`, `upl`, and `uplRatio`; it also returns derivative `realizedPnl` and its components. This is the best source for `MARGIN`, `FUTURES`, `SWAP`, and `OPTION` positions ([Get positions](https://www.okx.com/docs-v5/en/#trading-account-get-positions)).

Spot is different. `GET /api/v5/account/balance` can expose `spotBal`, `openAvgPx`, `accAvgPx`, `spotUpl`, `spotUplRatio`, `totalPnl`, and `totalPnlRatio` inside each `details` entry. Those values are in USD and are keyed by `ccy`, not by spot instrument/pair. OKX does not expose a general pair-level spot holding/cost-basis position through the positions endpoint. The fields are marked as applicable to Spot/Futures account-mode and copy-trading contexts in the official response schema, so the connector must tolerate empty fields ([Get balance](https://www.okx.com/docs-v5/en/#trading-account-get-balance)).

## Endpoint findings

| Context | Official endpoint and useful fields | Scope and caveats |
| --- | --- | --- |
| Spot trading account | `GET /api/v5/account/balance`: `details[].ccy`, `spotBal`, `openAvgPx`, `accAvgPx`, `spotUpl`, `spotUplRatio`, `totalPnl`, `totalPnlRatio` | Currency-level, USD-denominated values; not one cost basis per `instId`/pair. `openAvgPx` is the spot average cost and `accAvgPx` the accumulated cost price. |
| Margin | `GET /api/v5/account/positions?instType=MARGIN`: `instId`, `posCcy`, `pos`, `avgPx`, `markPx`, `upl`, `uplRatio`, `liab`, `liabCcy`, `interest` | Position-level. Margin positions represent base-currency amount and use `posCcy` to distinguish long/short exposure; borrowing and interest affect the P&L interpretation ([Isolated margin mode](https://www.okx.com/en-us/help/iv-isolated-margin-mode)). |
| Expiry futures | `GET /api/v5/account/positions?instType=FUTURES`: `avgPx`, `nonSettleAvgPx`, `markPx`, `upl`, `uplRatio`, `realizedPnl`, `settledPnl`, `fundingFee`, `fee` | Position-level by instrument and side. In cross-margin mode, `avgPx` is updated at settlement; `nonSettleAvgPx` preserves the average price at which the position was opened/increased. P&L is in the instrument settlement currency. |
| Perpetual swaps | `GET /api/v5/account/positions?instType=SWAP`: `avgPx`, `markPx`, `upl`, `uplRatio`, `realizedPnl`, `fundingFee`, `fee` | Position-level by instrument and side. `upl` is mark-price-based; funding and fees are separate accumulated components. |
| Options | `GET /api/v5/account/positions?instType=OPTION`: `avgPx`, `markPx`, `upl`, `uplRatio`, `realizedPnl`, `optVal`, `bePx` and Greeks | Position-level by option instrument/side. Option price fields have option-specific units (`px`, `pxUsd`, or `pxVol`); do not treat `avgPx` as a spot-like coin cost without preserving instrument, settlement currency, and contract metadata. |
| Trading-account aggregate | `GET /api/v5/account/balance`: top-level `upl`; `details[].upl` and `details[].isoUpl` | Account-level or settlement-currency-level totals, not instrument-level. Top-level cross-margin `upl` is in USD and uses mark price; `details[].upl` sums margin/derivative P&L for a currency. |
| Funding account | `GET /api/v5/asset/balances`: `ccy`, `bal`, `availBal`, `frozenBal` | Balance-only; no acquisition cost or P&L fields ([Funding account balance](https://www.okx.com/docs-v5/en/#funding-account-get-balance)). |
| Spot/margin/derivative trade history | `GET /api/v5/trade/fills-history`: `instId`, `fillPx`, `fillSz`, `fee`, `feeCcy`, and derivative `fillPnl` | Useful for reconstructing pair-level spot cost, but the endpoint covers only the last three months. Reconstruction also requires a chosen lot/cost method and complete historical data, so it is not a reliable substitute for an exchange-maintained lifetime spot cost basis ([Transaction details history](https://www.okx.com/docs-v5/en/#order-book-trading-trade-get-transaction-details-history)). |

`GET /api/v5/account/account-position-risk` is also available for `MARGIN`, `SWAP`, `FUTURES`, and `OPTION`; it returns account and position risk from the same snapshot and can be useful when consistency between aggregate risk and individual positions matters ([Get account and position risk](https://www.okx.com/docs-v5/en/#trading-account-get-account-and-position-risk)).

## Implication for the current connector

The current OKX connector calls `account/config`, `account/balance`, `asset/balances`, and `finance/savings/balance`, but its schemas retain only cash/balance amounts. Its normalized model represents currency assets, not instrument positions. Therefore:

- For the existing currency-shaped Trading account, OKX's `details[].openAvgPx`/`spotUpl` could be imported only as a **USD, currency-level** value when the fields are present. It must not be described as pair-level acquisition cost.
- For reliable derivatives and margin P&L, the connector needs to add `account/positions`, instrument metadata, position-side handling, and a representation for P&L currency. This is a broader model change than adding one field to the current balance mapper.
- Funding and Earn balances do not provide a comparable acquisition-cost field in the endpoints currently used by the connector.

## Authentication and repository fit

All of these account, funding, and trade-history endpoints are private and require a read-capable API key. OKX requires `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, and `OK-ACCESS-PASSPHRASE`. The signature is Base64(HMAC-SHA256(`timestamp + uppercase method + requestPath + body`)); query parameters belong to `requestPath`, including for `GET` requests. Timestamps must be ISO-8601 UTC with millisecond precision and within 30 seconds of OKX server time ([REST authentication](https://www.okx.com/docs-v5/en/#rest-authentication-making-requests)).

The current client already signs GET query strings, synchronizes against `GET /api/v5/public/time`, and sends the required four headers, so these read endpoints fit its transport. It must continue selecting the regional REST origin correctly: global `openapi.okx.com`, EEA `eea.okx.com`, and US/Australia `us.okx.com` ([regional API domains](https://www.okx.com/docs-v5/en/#overview-important-regional-api-domain-requirement)).

## Recommendation

Treat OKX derivatives/margin position P&L as implementable from the official position endpoint. Treat spot P&L as implementable only at the currency/USD level from account-balance details; do not promise pair-level spot cost basis unless Optimus starts retaining and accounting for the complete fill history itself.

The connector now implements the safe spot path: when `cashBal`, `spotBal`, and
`openAvgPx` describe the same Trading Account currency balance, it imports
`openAvgPx` as Optimus' USD-denominated `averageUnitPurchasePrice`. It continues
to leave cost data unavailable for Funding/Earn balances, mismatched spot
balances, and unsupported instrument-level derivative positions.
