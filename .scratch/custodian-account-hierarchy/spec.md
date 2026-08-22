# Custodian-owned typed accounts

Status: ready-for-agent

## Problem Statement

Adding assets to Satella does not match how people actually hold money. "Cash" is offered as a vague asset choice instead of the real-world thing it represents — a checking account or a savings account at a specific bank. There is no way to see which institution holds what: a user cannot glance at their portfolio and see "BNP Paribas → Livret A: €1,200 / LEP: €100"; they must click into each account and drill into its positions. Manually entered assets (a watch, a car) have no obvious home. The recent removal of the custodian concept left accounts as free-floating containers with no owner.

## Solution

Reinstate the **Custodian** (per `CONTEXT.md` and ADR 0005) as the mandatory parent of every Account: one custodian holds zero or many accounts, every account belongs to exactly one custodian, and every asset is held through a position in an account.

Accounts become typed (`checking`, `savings`, `brokerage`, `crypto_wallet`, `other`); the account name carries the real-world specificity ("Livret A", "PEA", "Compte courant"). The Add-assets flow stops offering "Cash" and instead offers distinct flows per account type. Business rules are validated in the engine only — no SQL triggers. The portfolio overview is grouped by custodian, showing each account's aggregated balance inline, converted to the reporting currency.

## User Stories

1. As a user, I want to add a checking account under a named bank with a starting balance, so that my day-to-day money is tracked where it actually lives.
2. As a user, I want to add savings accounts ("Livret A", "LEP") under the same bank, so that all my BNP Paribas holdings appear grouped together.
3. As a user, when adding a cash-type account, I want to choose an existing custodian or create a new one in the same flow, so that I never have to leave the add-assets screen.
4. As a user, I want each cash-type account to hold exactly one currency, so that the balance shown for "Livret A" is unambiguous.
5. As a user, I want the engine to reject adding a stock or crypto holding to a checking or savings account, so that cash containers cannot silently accumulate non-cash values.
6. As a user, I want to add a stock to a brokerage account at a named broker, so that my equity holdings are tied to the institution that custody them.
7. As a user, I want to name a brokerage account "PEA" or "Compte-titres", so that the French account taxonomy I think in is reflected verbatim in the app.
8. As a user, I want to add crypto holdings to a wallet account under an exchange custodian, so that my exchange balances are organized like my bank balances.
9. As a user, when adding a physical asset like a watch or a car, I want it stored automatically without being asked about institutions, so that manual valuables are tracked with zero friction.
10. As a user, I want manually added physical assets to live in a hidden default location, so that the portfolio total includes them without cluttering my bank/broker groups.
11. As a user, I want to see my portfolio grouped by custodian — e.g. "BNP Paribas → Livret A: €1,200 / LEP: €100" — so that I can see at a glance who holds what.
12. As a user, I want each account's aggregated balance shown directly in the custodian group (converted to my reporting currency), so that I don't have to open each account to know its value.
13. As a user, I want the default holding place for manual assets displayed under a neutral label rather than its internal name, so that internal plumbing never surfaces in the UI.
14. As a user connecting a bank via a connector, I want the connection's accounts to be created under a synced custodian representing that institution, so that synced and manual views share one hierarchy.
15. As a user, I want synced custodians' accounts to be read-only, so that a refresh never conflicts with hand-entered data.
16. As a user, I want the engine to reject manual position edits on synced custodians' accounts, so that sync integrity is preserved even if a client misbehaves.
17. As a user, I want to rename custodians and accounts, so that labels stay accurate as my life changes.
18. As a user, I want to hold multiple currencies across different accounts at the same bank (e.g. a EUR checking account and a USD checking account), so that multi-currency banking is represented honestly.
19. As a user, I want portfolio allocation still organized by asset category, so that my existing allocation view keeps working after the hierarchy change.
20. As a user, I want bonds removed from the add-assets options and categories, so that I am never offered a flow that isn't really supported yet.
21. As a user, I want the word "Cash" gone from the add-assets menu in favour of explicit "Checking" and "Savings" choices, so that what I'm creating matches what a bank would call it.
22. As a user, I want contextual labels — "Bank" when dealing with cash accounts, "Broker" when dealing with securities — so that the app speaks my vocabulary while staying one concept underneath.
23. As a user, I want the dashboard total to remain the sum of everything including hidden manual holdings, so that no asset ever goes missing from my net worth.
24. As a user, I want deleting a custodian to require dealing with its accounts first, so that I cannot orphan holdings by accident.

## Implementation Decisions

- **Hierarchy**: `Custodian → Account → Position → Asset`. Every account carries a NOT NULL reference to its custodian. One custodian has zero or many accounts; every account belongs to exactly one custodian.
- **Sync model dissolved into custodians**: the connections table is removed. A custodian with a `connector_id` is _synced_; its connector identity lives on the custodian row. Synced custodians' accounts are read-only, as connected accounts are today.
- **Account types**: closed generic enum `checking | savings | brokerage | crypto_wallet | other`. Names are free-form and carry specificity ("PEA" is simply a brokerage account named PEA).
- **Asset categories**: reduced to `stocks_etfs | crypto | cash | other`. Bonds are removed entirely from enums, contracts, and allocation, to be reintroduced deliberately later. Cash remains an intrinsic category of seeded fiat-currency assets; balances stay modeled as positions of those assets.
- **Engine-only validation** (explicitly no SQL triggers for business rules):
  - `checking`/`savings` accounts accept only cash-category assets and exactly one currency per account.
  - Accounts under synced custodians reject manual position creation/edits.
  - `other`-category assets resolve to the seeded default manual custodian + default account (type `other`) inside the engine; the client cannot choose or change this placement.
- **Seeded defaults**: vault creation seeds a default manual custodian ("Manual custodian") with one default account ("Manual account"). It is visible data but hidden behind a neutral fixed UI label ("Other holdings") in grouped views; users never see its internal name.
- **Add-assets API reshaped**: the single cash endpoint is replaced by distinct checking/savings flows taking custodian (existing or new), account name, type, currency, and balance. Holding and other-asset flows gain mandatory custodian/account resolution per the rules above.
- **Read model**: accounts expose an aggregated balance valued in the reporting currency; the dashboard groups accounts by custodian and shows each account balance inline. Allocation remains by asset category. Custodian-level allocation is not built now.
- **UX language**: custodian is labeled contextually — "Bank" in cash flows, "Broker" in securities flows. All user-facing copy is English.
- **Migrations**: history is squashed into a single fresh initial migration recreating the target schema; subsequent migrations use timestamp names (`YYYYMMDDHHMMSS_slug`). No back-compat shims.
- **Docs**: glossary updated in `CONTEXT.md` (Custodian, Manual custodian, typed Account, categories without Bonds, Connection removed); decision recorded in ADR 0005.

## Testing Decisions

- Tests assert external behavior through service/API results only — never SQL internals or implementation details.
- Two existing seams, no new ones:
  - **Engine**: finance services exercised against real SQLite via the engine test layer. Prior art: the add-assets and account service tests.
  - **Web**: screens tested against an in-memory engine double. Prior art: the add-assets and dashboard screen tests.
- Engine tests cover: hierarchy invariants (every account has a custodian), cash-account constraints (cash-only, single currency, rejection errors), read-only enforcement on synced custodians, auto-placement of other-assets, aggregated balances, squash-migration integrity.
- Web tests cover: add-assets flows per type (checking/savings/securities/crypto/other), custodian creation inline, grouped-by-custodian overview with inline balances, neutral label for the manual group, absence of "Cash" and "Bonds" wording.

## Out of Scope

- Bonds support of any kind (re-add later as a deliberate feature).
- Allocation grouped by custodian.
- Transaction ledger, deposits/withdrawals as cash flows.
- Changes to individual connector implementations beyond where their accounts attach.
- Data migration from any pre-squash schema (pre-production; schemas reset freely).

## Further Notes

- Pre-production project: breaking changes are free; prefer the clean target design over compatibility layers.
- The domain vocabulary for this feature is defined in `CONTEXT.md`; use its terms (Custodian, Manual custodian, Account types, Asset category) exactly in code, copy, and tests.
