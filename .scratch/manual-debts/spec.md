# Manual debts and net worth

Status: ready-for-agent

## Problem Statement

Satella shows what I own — Total assets, history, allocation — but not what I owe. Money I must repay, such as a 4 000 € tax bill due in September or a consumer loan, is invisible today, so the headline figure overstates my real wealth. I want to record these debts manually and see both what I own and what truly remains mine once debts are subtracted.

## Solution

Debts become a first-class concept tracked manually: a dedicated Debts section in the navigation with a list and create/edit flows. A debt carries a name, a kind (tax, loan, or other), an outstanding amount in any Fiat currency, and an optional due date. Debts are edited by hand only; Satella never changes an outstanding amount on its own.

Every Snapshot records total outstanding Debt expressed in the Reporting currency. Net worth is defined as Total assets minus total outstanding Debt. The home headline becomes a switch between **Patrimoine brut / Patrimoine net** (English: **Total assets / Net worth**) that toggles both the headline figure and the history chart, with the total of debts shown as a subline in net mode.

The custodian and account cards move from the dashboard to a new Accounts page in the sidebar, keeping the dashboard focused on worth, history, and allocation. The glossary renames Portfolio value to Total assets; the French copy replaces "Valeur du portefeuille" with "Patrimoine brut".

## User Stories

1. As a user, I want to add a debt manually with a name and an outstanding amount, so that money I owe like a tax bill appears alongside my assets.
2. As a user, I want to pick a kind for each debt — tax, loan, or other — so that I can tell at a glance why I owe it.
3. As a user, I want to record a debt in any Fiat currency, so that a euro-denominated tax bill is entered in euros even though my Reporting currency differs.
4. As a user, I want to attach an optional due date to a debt, so that I remember when the money must be paid.
5. As a user, I want to leave the due date empty, so that open-ended debts are still trackable.
6. As a user, I want to see all my debts in a dedicated Debts page, so that I have one place to review what I owe.
7. As a user, I want to edit a debt's outstanding amount, so that I can reflect a partial payment I made.
8. As a user, I want to edit any other field of a debt, so that corrections do not require deleting and recreating it.
9. As a user, I want to delete a debt, so that fully repaid obligations disappear from my net worth.
10. As a user, I want each debt's due date shown as "in X days", so that urgency is visible without mental arithmetic.
11. As a user, I want my debts converted into my Reporting currency, so that total debt and net worth are expressed in one currency.
12. As a user, I want a Debts entry in the sidebar, so that I can manage debts from anywhere in the app.
13. As a user, I want an empty state on the Debts page before I add anything, so that the feature explains itself.
14. As a user, I want my debts to survive every Refresh, so that syncing my custodians never invents or overwrites manual debt data.
15. As a user, I want my debts included in Vault export and restore, so that they travel with my data like everything else.
16. As a user, I want to toggle the home headline between Patrimoine brut and Patrimoine net, so that I can see both what I own and what remains after debts.
17. As a user, I want net worth defined as Total assets minus total outstanding Debt, so that the headline matches how I think about my finances.
18. As a user, I want the total of my debts shown as a subline under the net figure, so that the jump from gross to net is legible at a glance.
19. As a user, I want the home history chart to switch with the toggle, so that I can watch my net worth evolve over time, not just today's value.
20. As a user, I want the chart to return to the gross series when I toggle back, so that both views are always one click away.
21. As a user, I want each Snapshot to record total outstanding Debt, so that net history exists from the day I start tracking debts without gaps.
22. As a user, I want older snapshots without a debt total to read as zero debt, so that history stays consistent instead of fabricated.
23. As a user, I want the allocation chart unaffected by the toggle, so that the category breakdown keeps comparing like with like.
24. As a user, I want the toggle to disappear while I have no debts, so that the home stays quiet when gross and net are the same number.
25. As a user, I want the toggle choice to reset between sessions, so that display choices are not stored in my Vault.
26. As a user, I want the incomplete-valuation notice in both gross and net modes, so that a partial total is never mistaken for a complete one.
27. As a French-speaking user, I want the switch labeled "Patrimoine brut / Patrimoine net", so that it uses the words I actually use.
28. As an English-speaking user, I want the switch labeled "Total assets / Net worth", so that it reads like standard personal-finance language.
29. As a user, I want an Accounts page in the sidebar, so that I can reach my custodian and account cards without going through the dashboard.
30. As a user, I want the custodian and account cards moved from the dashboard to that Accounts page, so that the dashboard stays focused on worth, history, and allocation.
31. As a user, I want account cards on the Accounts page to link to their account detail, so that navigation keeps working exactly as before.
32. As a user, I want debt amounts handled as exact decimals, so that my figures are stored and summed without floating-point surprises.
33. As a user, I want a debt's outstanding amount to always be positive, so that an obligation cannot silently turn into an asset.
34. As a user, I want due dates to be informational only, so that the app does not nag me with notifications or reminders.

## Implementation Decisions

- Domain: a Debt is a first-class entity outside the Custodian → Account → Position graph, per ADR 0011. Money owed to the user is not a Debt. The canonical English term is Debt; the glossary defines Total assets, Net worth, and Debt, and the Snapshot now records total outstanding Debt.
- Schema: one new sealed migration adds a debts table (non-empty name, kind constrained to tax/loan/other, outstanding amount as an exact decimal text value, a Fiat-currency asset reference, an optional due date, timestamps) and a total-debt column on snapshots. The migration is registered in timestamp order in the production registry, sealed before staging, and verified against both a fresh Vault and an upgrade from the last released schema. Existing migrations are untouched.
- Engine: the finance module gains a Debts service behind the engine API with list, create, update, and delete endpoints. Validation: non-empty name, positive decimal amount, currency must be a Fiat currency, due date optional. The engine stays English internally; translation happens in the web locales.
- Dashboard contract: the dashboard payload gains total outstanding Debt and Net worth alongside Total assets, and the incomplete-valuation flag keeps applying to both figures. The history payload exposes the recorded debt total per point (converted to the Reporting currency at capture time) so the net series is derivable. The dashboard payload drops its custodian-groups section; the Accounts page composes the existing custodian and account listing endpoints instead.
- Snapshot capture: whenever a snapshot is captured, the total of all outstanding debts is converted to the Reporting currency at that moment and stored once per snapshot. Today's net worth uses the live debt sum, not the last snapshot.
- Web: the sidebar gains Accounts and Debts entries between Dashboard and Settings. The dashboard headline card gains a gross/net segmented toggle that swaps the headline, the history chart, its labels, and the change figure; in net mode a subline shows the total of debts. The toggle is ephemeral component state — nothing is persisted in the Vault — and the toggle is only rendered when at least one debt exists. Allocation rendering is untouched.
- Pages: the Accounts page reproduces the custodian-grouped account cards previously on the dashboard, with the same links into account detail. The Debts page lists debts (name, kind, outstanding amount in its currency, due date as "in X days") with create and edit flows modeled on the existing account and position edit flows, including delete.
- Copy: the Portfolio value rename to Total assets is applied across the contract and dashboard copy in both locales; French uses "Patrimoine brut" / "Patrimoine net" for the switch, "Comptes" for Accounts, and "Dettes" for Debts.

## Testing Decisions

- A good test asserts external behavior only — API contract responses and rendered UI — never internal call graphs or helper functions.
- Engine seam: extend the existing API contract tests, portfolio service tests, and migration tests. Cover debt CRUD including validation failures; the dashboard payload with debts present and absent; the history payload's debt series; snapshot capture recording the debt total; and the new migration on fresh and upgrade paths with registry order and checksum discipline.
- Web seam: extend the existing route-harness screen tests that drive the full route tree with the in-memory portfolio engine. Cover toggle visibility with and without debts; toggling swaps headline, chart, subline, and labels in both directions; allocation invariance; custodian cards present on the Accounts page and absent from the dashboard; the Debts list, create, edit, and delete flows; empty states; and due-date display.
- Both seams already exist. No new test utilities, mock layers, or seams are introduced.

## Out of Scope

- A payment ledger: no payment records, no automatic decrements, no installment schedules or échéanciers.
- Loan mechanics: no interest rates, amortization, monthly payments, or loan terms.
- Receivables: money owed to the user is not modeled.
- Synced debts: debts entered by connectors on behalf of custodians; debts are manual-only.
- Due-date notifications, reminders, or dashboard urgency badges; the due date is display-only.
- Persisting the gross/net toggle choice in the Vault.
- Debts in the allocation chart.
- Retroactive edits of historical snapshots.

## Further Notes

- The domain groundwork already landed: ADR 0011 records why debts are first-class entities rather than negative accounts, and the glossary entries (Total assets, Net worth, Debt, extended Snapshot) are in place.
- The Portfolio value rename is mechanical but touches roughly fifteen copy and test locations; the French label "Valeur du portefeuille" becomes "Patrimoine brut".
- Per the repository completion gate, the work is not done until the full check suite passes, which also enforces the migration seal and registry rules.
- One deliberate default: the toggle stays hidden until the first debt exists, so early users see no new chrome.
