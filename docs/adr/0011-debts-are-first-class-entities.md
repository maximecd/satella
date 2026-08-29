# Debts are first-class entities, not accounts

Manual debts — taxes owed, loans — are tracked as their own entities outside the Custodian → Account → Position graph, because that graph assumes non-negative, market-priced holdings and feeds allocation and snapshots. A Debt carries a single manually updated outstanding amount in one fiat currency, an optional due date, and a kind; Satella never changes the amount on its own, and money owed to the user is not a Debt.

## Considered Options

- Debt as an Account holding a negative Position, or as a new Asset category: rejected, because Account and Position assume priced, non-negative holdings and would distort allocation and snapshot logic.
- Installment schedules or automatic decrements when a payment happens: rejected until a payment ledger exists, consistent with ADR 0002; the outstanding amount is edited manually.

## Consequences

- The schema change needs a new sealed migration; existing migrations stay untouched.
- Each Snapshot records total outstanding Debt alongside positions and prices, so a gross-versus-net view can be derived historically without a data gap.
