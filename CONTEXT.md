# Satella Finance

Satella presents a unified view of a person's financial holdings across synced custodians and manually entered accounts.

## Preferences

**App language**:
The language of Satella's interface, English or French. It is asked during onboarding and changeable in Settings, and is stored in the Vault so it travels with Vault export and restore.
_Avoid_: Locale, INTL, region

## Portfolio

**Account**:
A typed financial container held at a custodian — such as a checking account, savings account, brokerage account, or crypto wallet. Its name conveys its purpose; its type constrains which assets it may hold.

**Asset**:
Something of financial value held in one or more accounts.

**Position**:
The current quantity of one Asset held in one Account.
_Avoid_: Transaction, holding history

**Asset category**:
An intrinsic classification of an asset as Stocks & ETFs, Crypto, Cash, or Other assets. Portfolio allocation uses these categories. Add assets offers Checking and Savings for cash accounts, then Stocks & ETFs, Crypto, and Other assets.
_Avoid_: Asset class, account kind

**Total assets**:
The current combined value of all holdings expressed in the reporting currency. It is not investment performance because deposits and withdrawals are not yet modeled as cash flows.
_Avoid_: Portfolio value, gross worth

**Net worth**:
Total assets minus total outstanding Debt, expressed in the reporting currency.
_Avoid_: Wealth, equity

**Price observation**:
A price, currency, and observation time returned by a Market-data source. It remains valid regardless of age; Satella does not classify it as fresh, stale, or delayed.
_Avoid_: Fresh price, stale price, delayed price

**Snapshot**:
A point-in-time record of every Position quantity, Asset price, and total outstanding Debt from which total assets and net worth history are derived. Each completed Refresh creates one Snapshot, including multiple Refreshes on the same day.
_Avoid_: History entry, balance record, backup

**Fiat currency**:
A government-issued currency modeled as a Cash asset identified by its ISO code. Accounts and the reporting currency are denominated in one.
_Avoid_: Fiat asset, real currency

**Currency symbol**:
The short sign (for example $ or €) shown next to an amount instead of its ISO code when displaying a Fiat currency.
_Avoid_: Currency sign, ticker

**Reporting currency**:
The single currency used to express portfolio-wide totals, history, and allocation. USD is the default, it is asked once during onboarding, and the user may change it in Settings.
_Avoid_: Default currency, base currency

## Acquisition and performance

**Acquisition cost**:
The current quantity of a non-Cash Position multiplied by its Average unit purchase price. It is unavailable when the Average unit purchase price is unavailable, and excludes taxes, dividends, fees, and realized gains or losses.
_Avoid_: Tax basis, cost basis

**Average unit purchase price**:
The authoritative unit price paid for a Position, expressed in its chosen purchase currency. A manual value takes precedence over a synced connector value; it may be unavailable when neither exists.
_Avoid_: PRU, average cost basis

**Unrealized P&L**:
The current value of a positive non-Cash Position in its Acquisition-cost currency minus its Acquisition cost, then expressed in the Reporting currency at the current exchange rate. It includes both Asset-price and currency movements; Cash has zero Unrealized P&L, and realized gains or losses, dividends, fees, and taxes are excluded.
_Avoid_: Performance, return, total return, all-time return

## Debts

**Debt**:
Money the user owes that Satella tracks as a single outstanding amount in one Fiat currency, edited manually by the user, with an optional due date and a kind such as tax or loan. Satella never changes a Debt's amount on its own, and money owed to the user is not a Debt.
_Avoid_: Liability, receivable, credit

## Custodians

**Custodian**:
A bank, broker, or other institution that holds one or more accounts. A custodian is either manual or synced; a synced custodian is linked to a connector and its accounts and holdings are read-only.
_Avoid_: Custody, connection, institution, provider

**Manual custodian**:
The default custodian created with a vault, holding accounts not tied to a real institution. It is usually hidden in the interface.

**Connector**:
The technical integration used to create and refresh a synced custodian. This is an internal term and should not normally appear in user-facing copy.

**Tracked token**:
An ERC-20 contract explicitly added to a synced EVM wallet so Refresh reads its current balance on one chain.
_Avoid_: Indexed token

**Sync**:
One attempt to update a synced Custodian's Accounts and Positions through its Connector, or to fetch a Price observation for an Asset.
_Avoid_: Connector sync, Account sync

**Refresh**:
A request to run the relevant Sync operations for the latest Accounts, Positions, and prices. Refreshing from an Account page refreshes the entire Custodian that owns the Account.
_Avoid_: Resync

**Auto-refresh**:
The automatic repetition of Refresh for every synced custodian, followed by market-data updates, at a fixed interval while the vault is unlocked. It continues while the Screen lock is active.
_Avoid_: Background sync, scheduled refresh

**Sync log**:
A chronological record of completed Sync attempts. Each entry identifies the Asset or Custodian, when the attempt completed, and whether it succeeded or failed; a failed entry may include a short sanitized reason. It contains no prices, quantities, credentials, source identity, or raw responses.
_Avoid_: Refresh history, activity log

**Market-data source**:
An external service that supplies Price observations. Its identity and quote times are operational details hidden during normal use.
_Avoid_: Provider

## Privacy

**Vault**:
One person's locally stored Satella data, including their portfolio, custodians, and credentials.
_Avoid_: Database, account

**Vault password**:
The secret chosen by the person to unlock their vault. Satella cannot recover a forgotten vault password.
_Avoid_: Login password, account password

**Locked vault**:
a vault whose portfolio, custodians, and credentials are unavailable until its vault password is supplied.
_Avoid_: Logged out

**Screen lock**:
A privacy screen, shown as **Lock** in the interface, that hides the interface behind a four-digit PIN while the vault remains unlocked and background work may continue. It does not protect the vault from local software.
_Avoid_: Vault lock, logout

**Screen-lock PIN**:
The four-digit code used to dismiss the screen lock. After three failed attempts, the vault password is required instead.
_Avoid_: Vault password

**Vault reset**:
The irreversible deletion of a vault, including its portfolio and connector credentials, after which Satella returns to first-time onboarding.
_Avoid_: Password reset, account reset

**Vault export**:
A portable encrypted copy of a complete vault, including its Screen-lock settings, saved as one `.satella-vault` file and protected by the vault's current Vault password.
_Avoid_: Data export, portfolio export, backup

**Vault restore**:
The validated replacement of the local vault from a Vault export. It is available before unlock and leaves the current vault untouched unless the exported vault can be unlocked and passes integrity checks.
_Avoid_: Import, rollback
