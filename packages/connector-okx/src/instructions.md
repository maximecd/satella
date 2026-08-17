# Connect OKX

Create a read-only API key in OKX before continuing.

1. Open your OKX profile and go to API keys.
2. Create an API key with Read permissions only. Do not enable Trade or Withdraw.
3. Copy the API key, secret key, and passphrase into Optimus.
4. Choose the region that matches your OKX account.

Optimus uses these credentials only to import and resync balances. For Trading
Account spot assets, OKX's `account/balance` response may include `openAvgPx`
(the average spot cost price in USD) and `spotUpl`; Optimus imports `openAvgPx`
as the Position's Average unit purchase price and derives current Unrealized P&L
from it. Empty cost fields, including OKX's excluded stablecoin and fiat cases,
remain unavailable.
