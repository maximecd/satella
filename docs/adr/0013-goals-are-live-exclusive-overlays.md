# Goals are live exclusive overlays, not accounts

A Goal is a named target amount in one fiat currency that reads selected Accounts' current values. It sits outside the Custodian → Account → Position graph so it does not change Total assets, Net worth, allocation, or Snapshots. An Account contributes to at most one Goal; deleting an Account unlinks it and leaves the Goal in place.

## Considered Options

- Goal as a savings Account, or as an earmark that reserves balances: rejected, because Accounts already hold the money and there is no payment ledger to reserve against. Progress is live; spending from a contributing Account drops the bar.
- Shared Accounts across Goals: rejected, because two progress bars would both claim the same balance.
- Snapshotting Goal progress: rejected, because a Goal does not own a holdings total of its own. History would record a number Satella does not control.
