# Connect Kraken

Create a read-only API key in Kraken before continuing.

1. Open your Kraken account settings and go to the API section.
2. Create an API key with only the "Query Funds" permission enabled.
3. Do not enable trading, withdrawals, ledger export, or WebSocket access.
4. Copy the API key and the API secret into Satella. The nonce window setting
   can be left at its default.

Satella uses these credentials only to import and resync balances across your
Spot wallet and Kraken Earn allocations. Kraken's balance endpoints do not
expose acquisition cost, so enter purchase prices manually where you care
about them; manual values always take precedence over synced data.
