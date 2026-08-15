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

## Privacy

**Vault**:
One person's locally stored Optimus data, including their portfolio, connections, and credentials.
_Avoid_: Database, account

**Vault password**:
The secret chosen by the person to unlock their vault. Optimus cannot recover a forgotten vault password.
_Avoid_: Login password, account password

**Locked vault**:
A vault whose portfolio, connections, and credentials are unavailable until its vault password is supplied.
_Avoid_: Logged out

**Screen lock**:
A privacy screen, shown as **Lock** in the interface, that hides the interface behind a four-digit PIN while the vault remains unlocked and background work may continue. It does not protect the vault from local software.
_Avoid_: Vault lock, logout

**Screen-lock PIN**:
The four-digit code used to dismiss the screen lock. After three failed attempts, the vault password is required instead.
_Avoid_: Vault password

**Vault reset**:
The irreversible deletion of a vault, including its portfolio and connection credentials, after which Optimus returns to first-time onboarding.
_Avoid_: Password reset, account reset
