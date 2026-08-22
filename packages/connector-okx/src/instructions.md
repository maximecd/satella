# Connect OKX

Create a read-only API key in OKX before continuing.

1. Open your OKX profile and go to API keys.
2. Create an API key with Read permissions only. Do not enable Trade or Withdraw.
3. Copy the API key, secret key, and passphrase into Satella.
4. Choose the region that matches your OKX account.

Satella uses these credentials only to import and resync balances. The current
connector does not provide P&L: OKX exposes Spot cost/P&L fields at currency
level, not per trading pair, and Funding balances do not expose acquisition cost
or P&L. Do not infer pair-level P&L from `openAvgPx` or `spotUpl`.
