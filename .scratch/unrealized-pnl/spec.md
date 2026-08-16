# Acquisition cost and Unrealized P&L

Status: ready-for-agent

## Problem Statement

Optimus shows current Portfolio value and historical value changes, but it cannot explain whether an open investment has gained or lost value relative to what the person paid. Positions contain quantity and current price only. There is no Average unit purchase price, Acquisition cost, or Unrealized P&L, and the existing Portfolio value graph must not be mistaken for investment performance.

A complete transaction ledger could eventually derive acquisition history, realized gains and losses, income, fees, and cash-flow-adjusted returns, but that is substantially larger than the immediate need. For V0, a person needs a simple Finary-like view of the unrealized gain or loss on the positive non-Cash Positions they currently hold, with direct manual correction even when an Account belongs to a Connection.

Optimus also currently stores financial quantities and prices as binary floating-point values and exposes Derivatives and Commodities as first-class Asset categories. Before adding persisted Acquisition cost and aggregate P&L, financial arithmetic should use decimal representations, and the V0 category taxonomy should be narrowed to the product surface actually supported.

## Solution

Add an optional authoritative Average unit purchase price and purchase currency to each positive non-Cash Position. A manual value always overrides a Connection-supplied value. Without a manual override, the latest value supplied by the Connection is retained. When neither source exists, Average unit purchase price, Acquisition cost, and Position Unrealized P&L are unavailable; Optimus does not invent or estimate them.

Quantity changes never alter or blend an authoritative Average unit purchase price. Acquisition cost is derived as current quantity multiplied by Average unit purchase price. Unrealized P&L compares the Position's current value with that Acquisition cost in the purchase currency, thereby including both Asset-price and currency movements, and then expresses the result in the Reporting currency.

Show current Unrealized P&L on Position rows, Account summaries, and the Dashboard. Keep it visually and linguistically distinct from selected-period Portfolio value change. Positions without an Average unit purchase price are silently excluded from Account and portfolio P&L aggregates and show an em dash for their own P&L. Do not add completeness warnings, estimated states, or a P&L history chart.

Permit the user to set, replace, or reset Average unit purchase price on manual and connected Positions. Reset removes the manual override and restores the latest Connection-supplied value when one exists; otherwise the value becomes unavailable.

Move persisted and contracted financial quantities, prices, FX rates, monetary amounts, and derived financial values to exact decimal representations. Remove Derivatives and Commodities as first-class categories. Connector holdings previously classified into those removed categories remain representable as Other assets rather than being silently discarded.

## User Stories

1. As an investor, I want to see the Unrealized P&L of an open Position, so that I understand how its current value compares with what I paid.
2. As an investor, I want to see Unrealized P&L as both an amount and a percentage, so that I can understand absolute and relative gain or loss.
3. As an investor, I want Unrealized P&L to include currency movements, so that a foreign-currency investment reflects my actual gain or loss in its purchase currency.
4. As an investor, I want Unrealized P&L expressed in my Reporting currency, so that I can compare Positions and Accounts consistently.
5. As an investor, I want Portfolio value change and Unrealized P&L labeled separately, so that I do not confuse wealth movement with open-position gain or loss.
6. As an investor, I want Optimus to avoid calling Unrealized P&L performance or return, so that the product does not promise cash-flow-adjusted analytics it does not calculate.
7. As an investor, I want realized gains and losses excluded explicitly, so that an open-position metric is not presented as my complete investing result.
8. As an investor, I want dividends, fees, and taxes excluded, so that the V0 formula remains narrow and understandable.
9. As an investor, I want a Position's Acquisition cost calculated from its current quantity and Average unit purchase price, so that the displayed inputs explain the result.
10. As an investor, I want to choose the currency of Average unit purchase price, so that I can record the amount in the currency I actually used.
11. As an investor, I want the purchase currency to default to the Account's base currency, so that ordinary entry is fast.
12. As an investor, I want to enter Average unit purchase price while adding a manual holding, so that P&L is available immediately.
13. As an investor, I want Average unit purchase price to remain optional, so that missing historical information does not prevent me from tracking a Position.
14. As an investor, I want a missing purchase price to show as an em dash, so that Optimus does not fabricate a plausible result.
15. As an investor, I want Positions without purchase prices excluded from aggregate P&L, so that unknown data is not treated as zero gain.
16. As an investor, I do not want missing-purchase-price banners or repeated warnings, so that the interface remains quiet.
17. As an investor, I want the visible Average unit purchase price to be easy to edit, so that I can correct inaccurate data directly.
18. As an investor, I want to set Average unit purchase price for a connected Position, so that an incomplete or inaccurate Connection does not block correction.
19. As an investor, I want my manual purchase price to survive every Refresh, so that Optimus never overwrites my correction without consent.
20. As an investor, I want a manual quantity change to preserve my Average unit purchase price, so that changing quantity does not rewrite another fact.
21. As an investor, I want a Connection quantity change to preserve my manual Average unit purchase price, so that newly reported quantities do not trigger invented blending.
22. As an investor, I want the total Acquisition cost to update from current quantity and unchanged Average unit purchase price, so that its arithmetic stays transparent.
23. As an investor, I want a newly supplied Connection purchase price used when no manual override exists, so that connected data remains current.
24. As an investor, I want the last Connection-supplied purchase price retained when a later Refresh omits it, so that a less complete response does not erase an acquisition fact.
25. As an investor, I want Reset purchase price to remove my override, so that I can return authority to the Connection.
26. As an investor, I want Reset purchase price to restore the latest Connection value when available, so that I do not have to re-enter provider data.
27. As an investor, I want Reset purchase price to leave the value unavailable when the Connection has never supplied one, so that Optimus does not estimate it.
28. As an investor, I want a positive gain and a negative loss formatted clearly, so that I can scan Position results quickly.
29. As an investor, I want a zero gain displayed neutrally, so that unchanged Positions are not presented as successes or failures.
30. As an investor, I want no percentage when Acquisition cost is zero or unavailable, so that Optimus never divides by zero or shows a meaningless rate.
31. As an investor, I want Cash excluded from Unrealized P&L, so that deposits, dividends, interest, and withdrawals affect Portfolio value without masquerading as investment gain.
32. As an investor, I want negative Positions excluded from Unrealized P&L, so that a long-position formula is not misapplied to shorts.
33. As an investor, I want zero-quantity Positions excluded, so that closed holdings do not affect current P&L.
34. As an investor, I want a manual Other asset with a positive quantity and current price to support purchase-price entry, so that the model is not limited to listed securities.
35. As an investor, I want Account-level Unrealized P&L, so that I can compare the open gains and losses in each Account.
36. As an investor, I want portfolio-level Unrealized P&L beneath Portfolio value, so that the most important current result is visible on the Dashboard.
37. As an investor, I want Account and portfolio percentages calculated from aggregate amounts, so that Position percentages are not incorrectly averaged.
38. As an investor, I want a Position denominated in one currency and purchased in another to use current FX for current valuation, so that currency movement is included.
39. As an investor, I want changing Reporting currency to re-express P&L consistently, so that the underlying acquisition fact is preserved.
40. As an investor, I want purchase-price edits to leave Portfolio value and its history unchanged, so that changing cost information cannot rewrite market value.
41. As an investor, I want only current Unrealized P&L in V0, so that there is no misleading historical performance chart without transaction history.
42. As an investor, I accept correcting Average unit purchase price after a transfer or stock split, so that Optimus does not guess at corporate actions or transfers.
43. As a connected-account user, I want unsupported derivative or commodity holdings retained as Other assets, so that removing first-class categories does not silently omit reported wealth.
44. As a connected-account user, I want a complete Refresh to remain atomic when it contains purchase-price data, so that quantities and authoritative provider values cannot become inconsistent.
45. As a connected-account user, I want Connection credentials and acquisition facts kept separate, so that changing credentials does not change P&L.
46. As a user with fractional shares, I want quantities and money calculated with decimal arithmetic, so that binary floating-point artifacts do not leak into totals.
47. As a crypto holder, I want small fractional quantities preserved exactly, so that rounding does not erase meaningful holdings.
48. As a user with large or multi-currency holdings, I want deterministic rounding only at presentation boundaries, so that aggregation order does not change displayed results.
49. As a user, I want form inputs to preserve the decimal value I entered, so that save-and-reopen does not subtly alter it.
50. As a user, I want API and persisted values to round-trip exactly, so that desktop, engine, and future clients agree.
51. As a user, I want Derivatives and Commodities removed from Add assets, so that V0 presents only supported categories.
52. As a user, I want Stocks & ETFs, Bonds, Crypto, Cash, and Other assets to remain available, so that the reduced taxonomy still covers the intended portfolio.
53. As a user, I want no transaction-entry workflow in this feature, so that Unrealized P&L ships without an unfinished ledger.
54. As a user, I want no automatic purchase-price estimation, so that a missing fact remains missing rather than silently becoming today's price.
55. As a user, I want manual control to be the highest authority, so that Optimus remains usable when external data is wrong.

## Implementation Decisions

- Implement current Unrealized P&L without introducing a Transaction domain. Positions remain the current-holdings model and Portfolio value remains independent of acquisition information.
- Add an optional Average unit purchase price to positive non-Cash Positions. It consists of an exact decimal amount, a Cash Asset identifying its purchase currency, and authority/provenance sufficient to distinguish manual from Connection-supplied data.
- Treat Average unit purchase price—not total Acquisition cost—as authoritative. Derive Acquisition cost as current quantity multiplied by Average unit purchase price on every read. Do not persist or reconcile a partially known total cost.
- A manual Average unit purchase price always overrides Connection data. Quantity changes never modify it. The manual value applies to the complete current Position until the user edits or resets it.
- When no manual override exists, accept an optional Average unit purchase price from the Connector contract. A newly supplied provider value replaces the prior provider value; omission retains the last provider value.
- Reset removes the manual override. It exposes the retained Connection value if present and otherwise makes Average unit purchase price unavailable. Reset never creates a market-price fallback.
- Do not model complete/incomplete or estimated Acquisition cost. Do not initialize missing purchase prices from current market prices and do not blend existing and new quantities.
- Extend manual Add assets and Position editing so Average unit purchase price and its currency can be set or replaced. The currency defaults to the Account base currency and may be changed to another supported Cash currency.
- Keep connected quantity and identity fields read-only while allowing purchase-price editing and reset on the connected Position.
- Calculate Position Unrealized P&L only when quantity is positive, the Asset is not Cash, Average unit purchase price is positive and available, and a current valuation plus required current FX conversions are available.
- Calculate current value in the Acquisition-cost currency using the current Asset price and current FX, subtract Acquisition cost, and convert the resulting amount to Reporting currency using current FX. This intentionally includes Asset-price and currency movements relative to the recorded purchase currency.
- Calculate Position percentage as Unrealized P&L divided by Acquisition cost. When Acquisition cost is zero or unavailable, the percentage is unavailable.
- Calculate Account and portfolio P&L amounts by summing eligible Position amounts in Reporting currency. Calculate aggregate percentage by dividing summed eligible current P&L by summed eligible Acquisition cost translated to Reporting currency at current FX. Never average Position percentages.
- Exclude Cash, zero and negative Positions, Positions without Average unit purchase price, and Positions without required current valuation/FX from P&L aggregates. Do not expose a P&L completeness flag, warning, or estimated state.
- Add current Unrealized P&L amount and percentage to Position, Account, and Dashboard read models. Keep Portfolio-value completeness behavior separate and unchanged.
- Show Position P&L beside current value, Account aggregate P&L near the Account summary/header, and portfolio aggregate P&L beneath Portfolio value. Show an em dash for unavailable Position P&L. Do not add an Unrealized P&L history chart.
- Keep selected-period Portfolio value change visibly distinct from current Unrealized P&L. Do not relabel the existing history graph as performance or return.
- Purchase-price edits affect current P&L only. They do not change current market value, historical Position/price snapshots, or Portfolio value history.
- Do not detect transfers, stock splits, mergers, or other corporate actions. Quantity changes preserve the current authoritative Average unit purchase price. Users may correct it manually.
- Adopt exact decimal representation across finance persistence and contracts for quantities, unit prices, FX rates, Average unit purchase prices, Acquisition costs, values, P&L amounts, and percentages. Serialize decimals through API boundaries as canonical decimal strings and round only for display.
- Use a maintained arbitrary-precision decimal implementation behind an Optimus-owned financial-number boundary. Do not scatter library-specific types across unrelated modules or use binary floating-point for financial calculations.
- Because Optimus is pre-production, reshape/reset the schema and fixtures directly. Do not add compatibility aliases, binary-float conversion support for released users, or preserve existing development portfolio rows.
- Remove Derivatives and Commodities from Asset-category schemas, Add assets, allocation labels, Connector capability discovery, fixtures, and tests. Retain Stocks & ETFs, Bonds, Crypto, Cash, and Other assets.
- Map Connector holdings that were formerly categorized as Derivatives or Commodities to Other assets. Do not silently discard them. Negative holdings remain excluded from P&L under the general rule.
- Keep current OKX and IBKR behavior valid when they do not supply Average unit purchase price. Extend their output only when authoritative provider data is actually available; never synthesize provider purchase prices.
- Record the Position/purchase-price boundary and decimal-arithmetic choice in ADRs because both are hard to reverse and affect every future transaction or performance feature.

## Testing Decisions

- Tests assert observable financial contracts, calculations, persistence, and user behavior rather than SQL text, component structure, CSS classes, internal provenance representation, or decimal-library calls.
- Use the Finance HTTP API/service boundary as the primary engine seam. It should prove manual and Connection purchase-price authority, reset behavior, quantity-change invariants, currency-inclusive formulas, aggregation, missing-data exclusion, Cash/zero/negative exclusion, Reporting-currency changes, and exact decimal round trips.
- Extend Connector contract and reconciliation tests to prove optional provider Average unit purchase price, manual precedence, retention when a later response omits it, atomic quantity-plus-price refresh, and absence of synthesized values.
- Use migration tests only for invariants that cannot be proven through the Finance boundary: decimal storage shape, purchase currency references, removal of Derivatives and Commodities, and the final five-category constraint.
- Use the existing route-level in-memory router/query-client harness as the primary web seam. Assert Position, Account, and Dashboard P&L through accessible labels and rendered values; assert edit, currency selection, reset, missing em dash, and separation from Portfolio value change through user interactions.
- Extend Add assets route tests for optional Average unit purchase price, Account-base-currency default, alternate supported currency, validation, and exact input round trips.
- Add focused decimal tests for fractional shares, very small crypto quantities, large values, repeating intermediate results, negative P&L, multi-currency aggregation, stable aggregation order, and formatting boundaries.
- Test formula examples at Position, Account, and portfolio levels, including two Positions with different purchase currencies and a Reporting-currency change.
- Test that a manual value survives manual and connected quantity changes unchanged, while derived Acquisition cost changes with quantity.
- Test that a provider value updates only when a new provider value is supplied, survives later omission, loses to a manual override, and returns after Reset.
- Test that missing purchase price produces unavailable Position P&L, does not block Portfolio value, and is silently excluded from Account and portfolio aggregates.
- Test that Cash, zero quantities, negative quantities, unavailable prices, and unavailable FX never enter P&L numerators or denominators.
- Test that editing purchase price changes current P&L without changing Portfolio value or historical Portfolio observations.
- Update IBKR mapping tests so former Derivative and Commodity categories become Other assets without disappearing from the normalized output.
- Perform browser verification at wide and narrow viewports for Position-row density, Account summaries, Dashboard hierarchy, long currency values, positive/negative/zero styling, unavailable em dashes, edit/reset affordances, and light/dark themes.
- Existing Finance API/service tests, Connector reconciliation tests, migration invariant tests, dashboard route tests, Account/Position route tests, Add assets tests, and the finance route harness are the prior art. Do not introduce a lower-level duplicate testing seam where these can prove behavior.

## Out of Scope

- A Transaction domain or ledger.
- Realized gains or losses and any disposal method such as weighted-average disposal, FIFO, LIFO, or tax-lot selection.
- Deposits, withdrawals, buys, sells, dividends, interest, fees, taxes, transfers, or balance-adjustment events.
- Time-weighted return, money-weighted return, IRR/XIRR, total return, or any cash-flow-adjusted performance measure.
- Historical Unrealized P&L snapshots or charts.
- Tax basis, tax reporting, jurisdiction-specific acquisition rules, or tax wrappers.
- Dividend or fee inclusion in Acquisition cost or P&L.
- Automatic purchase-price estimation, current-market fallback, partial Acquisition cost, or completeness warnings.
- Automatic transfer recognition, stock-split handling, mergers, spin-offs, option exercise, or other corporate actions.
- Short, leveraged, option, futures, or other derivative P&L.
- First-class Derivatives and Commodities categories.
- Changing Portfolio value or its existing historical semantics.
- Preserving pre-production portfolio data or backward-compatible numeric API contracts.

## Further Notes

- This specification deliberately narrows the earlier V0 idea of “transactions, cost basis, and performance.” The first release is authoritative purchase price plus current Unrealized P&L. A later transaction-led feature can add realized P&L and returns without making this release wait for the complete ledger.
- Finary's documented main performance metric is similarly limited to unrealized gain/loss on open positions and excludes realized gains after sales. Optimus uses the more precise term Unrealized P&L and deliberately avoids Performance or Return.
- “Manual always overrides” is the central correction principle. Optimus values ease of correction over hidden reconciliation heuristics.
- Silent exclusion is deliberate product behavior. Missing Position P&L is visible as an em dash at the Position, but the Dashboard and Account aggregates carry no warning or completeness chrome.
- Decimal migration is part of this feature because adding persisted acquisition information on top of binary floating-point storage would make a later correction materially more expensive.
