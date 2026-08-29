# Goals

Status: ready-for-agent

## Problem Statement

Satella shows what I own, but not what I am saving toward. I want named targets such as a car, with a currency, an amount, an optional date, and a choice of Accounts whose current values count as progress.

## Solution

Goals become a first-class overlay: a dedicated Goals section in the navigation with a card list and create/edit flows. A Goal carries a name, a target amount in any Fiat currency (picker defaulted to Reporting currency), an optional target date, and selected Accounts. Progress is the live sum of those Accounts' current totals converted into the Goal's currency. An Account contributes to at most one Goal. The money stays in the Accounts. Goals do not change Total assets, Net worth, allocation, or Snapshots.

## User Stories

1. As a user, I want to add a Goal with a name and a target amount, so that a purchase such as a car has a number to aim at.
2. As a user, I want the currency picker defaulted to my Reporting currency and still required, so that a Goal can be in dollars while my totals are in euros.
3. As a user, I want to leave the target date empty or set a calendar day, so that open-ended Goals and dated ones both work.
4. As a user, I want each target date shown as "in X days", so that the remaining time is visible without mental arithmetic.
5. As a user, I want to select which Accounts contribute, including none, so that I can name a target before I have funded it.
6. As a user, I want an Account to contribute to at most one Goal, so that two bars cannot claim the same money.
7. As a user, I want taken Accounts shown disabled with the other Goal's name, so that I understand why I cannot pick them here.
8. As a user, I want progress to use each Account's current total, so that the Goal agrees with the Accounts page.
9. As a user, I want a card per Goal with a progress bar, current / target in the Goal's currency, the target date, and contributing Account names.
10. As a user, I want the bar to stop at 100% while current / target still shows surplus, so that reaching the target is obvious and extra cash stays visible.
11. As a user, I want to edit any field, including the Account set and the currency, so that corrections do not require deleting the Goal. Changing currency does not convert the target amount.
12. As a user, I want to delete a Goal, so that finished or abandoned targets leave the list.
13. As a user, I want deleting an Account to unlink it from its Goal, so that destroying a checking Account does not take "Buy a car" with it.
14. As a user, I want a Goals entry in the sidebar after Debts, so that I can manage Goals from anywhere in the app.
15. As a user, I want an empty state on the Goals page before I add anything, so that the feature explains itself.
16. As a user, I want my Goals included in Vault export and restore, so that they travel with my data.

## Implementation Decisions

- Domain: a Goal is a first-class overlay outside the Custodian → Account → Position graph, per ADR 0013. The canonical English term is Goal; Target date is the optional calendar day. An Account contributes to at most one Goal.
- Schema: one new sealed migration adds a goals table (non-empty name, target amount as exact decimal text, a Fiat-currency asset reference, an optional target date, timestamps) and a goal_accounts join with ON DELETE CASCADE from both sides and a unique account_id so exclusivity is enforced. Existing migrations are untouched.
- Engine: the finance module gains a Goals service behind the engine API with list, create, update, and delete. Validation: non-empty name, positive decimal amount, currency must be a Fiat currency, target date optional YYYY-MM-DD, Account ids must exist, an Account may not already contribute to another Goal. List payloads include live currentAmount in the Goal's currency and contributing Account names. The engine stays English internally.
- Web: sidebar gains Goals between Debts and Settings. `/goals` is a card grid; `/goals/new` and `/goals/$goalId/edit` copy the Debts form chrome. Currency defaults to Reporting currency. Delete lives on edit. No dashboard widget, no incomplete-valuation notice, no achieved state.

## Testing Decisions

- A good test asserts external behavior only — API contract responses and rendered UI — never internal call graphs or helper functions.
- Engine seam: extend the existing API contract tests, Goal service tests, and migration tests. Cover Goal CRUD including validation failures; progress from Account totals including cross-currency conversion; exclusivity; Account deletion unlinking a Goal; zero contributing Accounts; and the new migration on fresh and upgrade paths.
- Web seam: extend the existing route-harness screen tests. Cover empty state; card contents (name, bar, current / target, date, Account names); create with Reporting-currency default and Account selection; exclusivity in the picker; edit; delete; surplus still shown past 100%.
- Both seams already exist. No new test utilities, mock layers, or seams are introduced.

## Out of Scope

- Earmarks, reserved balances, or envelope budgeting.
- Achieved, archived, or auto-completed Goals.
- Dashboard widgets, Snapshot series, or Goal history.
- Incomplete-valuation notices on Goal cards.
- Notifications or overdue styling for the target date.
- Auto-converting the target amount when the Goal currency changes.
