# Optimus Finance

Optimus presents a unified view of a person's financial holdings across connected services and manually entered accounts.

## Portfolio

**Account**:
An untyped financial container that holds assets, such as a PEA, current account, savings account, brokerage account, or wallet. Its name conveys its purpose; it does not constrain which assets it may contain.

**Asset**:
Something of financial value held in one or more accounts.

**Asset category**:
An intrinsic classification of an asset as Stocks & ETFs, Bonds, Crypto, Cash, Derivatives, Commodities, or Other assets. The same categories organize Add assets and portfolio allocation.
_Avoid_: Asset class, account kind

**Portfolio value**:
The current combined value of all holdings expressed in the reporting currency. It is not investment performance because deposits and withdrawals are not yet modeled as cash flows.
_Avoid_: Performance, return

**Reporting currency**:
The single currency used to express portfolio-wide totals, history, and allocation. USD is the default, and the user may change it in Settings.
_Avoid_: Default currency, base currency

## Connections

**Connection**:
A configured link between Optimus and an external financial service that can contain one or more accounts.
_Avoid_: Custodian, provider, institution

**Connector**:
The technical integration used to create and refresh a connection. This is an internal term and should not normally appear in user-facing copy.

**Refresh**:
A request for the latest accounts, holdings, and prices from a connection. Refreshing from an account page refreshes the entire connection that owns the account.
_Avoid_: Resync

**Market-data source**:
An external service that supplies asset prices. Its identity, quote time, and routine freshness status are operational details hidden during normal use.
_Avoid_: Provider
